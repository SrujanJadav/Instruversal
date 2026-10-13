import * as Tone from 'tone';
import { state, events } from '../state';
import { getMasterEffectsRack } from '../audio/effects';
import { getFlowVoicePool } from '../audio/voicePool';
import { getBeatFlowVoicePool } from '../audio/beatFlowVoices';
import { getTransport } from '../audio/transport';

export interface ExportFormatOption {
  id: 'wav' | 'compressed';
  label: string;
  extension: 'wav' | 'webm' | 'mp4';
  mimeType: string;
}

export interface ExportOptions {
  repeats: 1 | 2 | 4;
  format: 'wav' | 'compressed';
  title: string;
  onProgress?: (progress: number, remainingSeconds: number) => void;
  onVisibilityWarning?: () => void;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  durationSeconds: number;
  peak: number;
  isClipping: boolean;
  wasInterrupted: boolean;
}

/**
 * Returns supported formats dynamically based on MediaRecorder capabilities.
 */
export function getSupportedExportFormats(): ExportFormatOption[] {
  const formats: ExportFormatOption[] = [
    {
      id: 'wav',
      label: 'WAV (16-bit Lossless)',
      extension: 'wav',
      mimeType: 'audio/wav',
    },
  ];

  if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      formats.push({
        id: 'compressed',
        label: 'WebM (Opus compressed)',
        extension: 'webm',
        mimeType: 'audio/webm;codecs=opus',
      });
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      formats.push({
        id: 'compressed',
        label: 'MP4 (AAC compressed)',
        extension: 'mp4',
        mimeType: 'audio/mp4',
      });
    }
  }

  return formats;
}

/**
 * Generates formatted filename: instruversal-<title>-<bpm>bpm-<YYYY-MM-DD>.<ext>
 */
export function buildExportFilename(title: string, bpm: number, extension: string = 'wav'): string {
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanTitle = (title || 'untitled')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'sketch';

  return `instruversal-${cleanTitle}-${bpm}bpm-${dateStr}.${extension}`;
}

/**
 * Pure function: Encodes an AudioBuffer into standard 16-bit linear PCM stereo WAV.
 */
export function encodeWav(audioBuffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataByteCount = numFrames * blockAlign;
  const totalBufferSize = 44 + dataByteCount;

  const arrayBuffer = new ArrayBuffer(totalBufferSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF Chunk Descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataByteCount, true);
  writeString(8, 'WAVE');

  // "fmt " Subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM subchunk size
  view.setUint16(20, 1, true); // Linear PCM format code
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample

  // "data" Subchunk
  writeString(36, 'data');
  view.setUint32(40, dataByteCount, true);

  const left = audioBuffer.getChannelData(0);
  const right = numChannels > 1 ? audioBuffer.getChannelData(1) : left;

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    // Left Channel
    const sampleL = Math.max(-1, Math.min(1, left[i]));
    const intL = sampleL < 0 ? sampleL * 0x8000 : sampleL * 0x7fff;
    view.setInt16(offset, intL, true);
    offset += 2;

    // Right Channel (duplicate mono if single channel)
    if (numChannels > 1) {
      const sampleR = Math.max(-1, Math.min(1, right[i]));
      const intR = sampleR < 0 ? sampleR * 0x8000 : sampleR * 0x7fff;
      view.setInt16(offset, intR, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Checks peak amplitude across channels.
 */
export function checkAudioPeak(audioBuffer: AudioBuffer): { peak: number; isClipping: boolean } {
  let peak = 0;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  return {
    peak,
    isClipping: peak >= 0.999,
  };
}

/**
 * Records real-time master output covering N loop repeats + 1.5s tail.
 */
export function recordLoopAudio(options: ExportOptions): {
  promise: Promise<ExportResult | null>;
  cancel: () => void;
} {
  let isCancelled = false;
  let progressTimer: number | null = null;
  let finishTimer: number | null = null;
  let recorder: Tone.Recorder | null = null;
  let outputNode: Tone.ToneAudioNode | null = null;
  let wasPlayingBefore = false;
  let wasInterrupted = false;
  let onVisibilityChange: (() => void) | null = null;

  const cancel = () => {
    isCancelled = true;
    if (progressTimer !== null) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    if (finishTimer !== null) {
      window.clearTimeout(finishTimer);
      finishTimer = null;
    }

    if (onVisibilityChange) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      onVisibilityChange = null;
    }

    if (recorder) {
      try {
        recorder.stop().catch(() => {});
      } catch {}
      if (outputNode) {
        try {
          outputNode.disconnect(recorder);
        } catch {}
      }
      try {
        recorder.dispose();
      } catch {}
      recorder = null;
    }

    Tone.getTransport().stop();
    getFlowVoicePool().releaseAll(0.01);
    getBeatFlowVoicePool().releaseAll(0.01);
    state.isPlaying = false;
    events.emit('transport:pause', undefined);

    if (wasPlayingBefore) {
      Tone.getTransport().seconds = 0;
      Tone.getTransport().start('+0.05');
      state.isPlaying = true;
      events.emit('transport:play', undefined);
    }
  };

  const promise = new Promise<ExportResult | null>(async (resolve, reject) => {
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start();
        state.audioStarted = true;
        events.emit('audio:started', undefined);
      }

      const bpm = state.bpm || 90;
      const bars = state.bars || 2;
      const loopDuration = bars * 4 * (60 / bpm);
      const tailSeconds = 1.5;
      const totalDuration = options.repeats * loopDuration + tailSeconds;

      wasPlayingBefore = getTransport().isPlaying();
      if (wasPlayingBefore) {
        getTransport().pause();
      }

      // Detect background tab / lockscreen interruptions
      onVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          wasInterrupted = true;
          options.onVisibilityWarning?.();
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);

      // Connect recorder to master effects output
      const rack = getMasterEffectsRack();
      outputNode = rack.outputNode;

      const formats = getSupportedExportFormats();
      const chosenFormat = formats.find((f) => f.id === options.format) || formats[0];
      const recorderMime = chosenFormat.id === 'compressed' ? chosenFormat.mimeType : undefined;

      recorder = new Tone.Recorder(recorderMime ? { mimeType: recorderMime } : undefined);
      outputNode.connect(recorder);

      // Release active voices & rewind transport so record starts cleanly on beat 1
      getFlowVoicePool().releaseAll(0.01);
      getBeatFlowVoicePool().releaseAll(0.01);
      Tone.getTransport().seconds = 0;

      recorder.start();
      Tone.getTransport().start('+0.05');
      state.isPlaying = true;
      events.emit('transport:play', undefined);

      const startTime = performance.now();

      progressTimer = window.setInterval(() => {
        if (isCancelled) return;
        const elapsed = (performance.now() - startTime) / 1000;
        const progress = Math.min(1, elapsed / totalDuration);
        const remaining = Math.max(0, totalDuration - elapsed);
        options.onProgress?.(progress, remaining);
      }, 100);

      finishTimer = window.setTimeout(async () => {
        if (isCancelled) return;

        if (progressTimer !== null) {
          window.clearInterval(progressTimer);
          progressTimer = null;
        }

        if (onVisibilityChange) {
          document.removeEventListener('visibilitychange', onVisibilityChange);
          onVisibilityChange = null;
        }

        try {
          const rawBlob = await recorder!.stop();
          Tone.getTransport().stop();
          state.isPlaying = false;
          events.emit('transport:pause', undefined);

          if (outputNode && recorder) {
            outputNode.disconnect(recorder);
            recorder.dispose();
            recorder = null;
          }

          if (wasPlayingBefore) {
            Tone.getTransport().seconds = 0;
            Tone.getTransport().start('+0.05');
            state.isPlaying = true;
            events.emit('transport:play', undefined);
          }

          if (isCancelled) {
            resolve(null);
            return;
          }

          // Decode raw audio to analyze peak amplitude & convert to WAV
          const arrayBuffer = await rawBlob.arrayBuffer();
          const audioBuffer = await Tone.context.rawContext.decodeAudioData(arrayBuffer);
          const { peak, isClipping } = checkAudioPeak(audioBuffer);

          let exportBlob: Blob;
          let filename: string;

          if (chosenFormat.id === 'compressed') {
            exportBlob = rawBlob;
            filename = buildExportFilename(options.title, bpm, chosenFormat.extension);
          } else {
            exportBlob = encodeWav(audioBuffer);
            filename = buildExportFilename(options.title, bpm, 'wav');
          }

          resolve({
            blob: exportBlob,
            filename,
            durationSeconds: totalDuration,
            peak,
            isClipping,
            wasInterrupted,
          });
        } catch (err) {
          reject(err);
        }
      }, Math.round(totalDuration * 1000));
    } catch (err) {
      cancel();
      reject(err);
    }
  });

  return { promise, cancel };
}

/**
 * Triggers client download using a temporary blob URL.
 * Works on desktop and Safari mobile.
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
