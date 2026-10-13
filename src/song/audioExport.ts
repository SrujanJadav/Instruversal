import * as Tone from 'tone';
import { Song } from './types';
import { SongPlaybackEngine } from './playbackEngine';
import {
  encodeWav,
  checkAudioPeak,
  getSupportedExportFormats,
  buildExportFilename,
  ExportFormatOption,
  ExportResult,
} from '../export/exportAudio';

export { getSupportedExportFormats, buildExportFilename };
export type { ExportFormatOption, ExportResult };

export interface SongAudioExportOptions {
  range: 'whole' | 'loop';
  format: 'wav' | 'compressed';
  onProgress?: (progress: number, remainingSeconds: number) => void;
  onVisibilityWarning?: () => void;
}

/**
 * Records real-time master output of a Song (after all effects and brickwall limiter)
 * for either the whole song or the loop region, plus a 2.0-second reverb/delay tail.
 */
export function recordSongAudio(
  song: Song,
  playbackEngine: SongPlaybackEngine,
  options: SongAudioExportOptions
): {
  promise: Promise<ExportResult | null>;
  cancel: () => void;
} {
  let isCancelled = false;
  let progressTimer: number | null = null;
  let finishTimer: number | null = null;
  let recorder: Tone.Recorder | null = null;
  let masterNode: Tone.ToneAudioNode | null = null;
  let wakeLock: any = null;
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

    if (wakeLock) {
      try {
        wakeLock.release().catch(() => {});
      } catch {}
      wakeLock = null;
    }

    if (recorder) {
      try {
        recorder.stop().catch(() => {});
      } catch {}
      if (masterNode) {
        try {
          masterNode.disconnect(recorder);
        } catch {}
      }
      try {
        recorder.dispose();
      } catch {}
      recorder = null;
    }

    playbackEngine.stop();

    if (wasPlayingBefore) {
      playbackEngine.play();
    }
  };

  const promise = new Promise<ExportResult | null>(async (resolve, reject) => {
    try {
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }

      // 1. Determine playback range in bars
      let startBar = 0;
      let endBar = song.totalBars || 16;

      if (options.range === 'loop' && song.loopRegion) {
        startBar = song.loopRegion.startBar;
        endBar = song.loopRegion.endBar;
      }

      const durationBars = Math.max(1, endBar - startBar);
      const secondsPerBeat = 60 / (song.bpm || 90);
      const beatsPerBar = song.beatsPerBar || 4;
      const songPlayDuration = durationBars * beatsPerBar * secondsPerBeat;
      const tailSeconds = 2.0; // 2s tail for reverb and delay decay
      const totalDurationSeconds = songPlayDuration + tailSeconds;

      wasPlayingBefore = playbackEngine.isPlaying();
      if (wasPlayingBefore) {
        playbackEngine.pause();
      }

      // Request screen Wake Lock if supported
      try {
        if ('wakeLock' in navigator && (navigator as any).wakeLock?.request) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
        }
      } catch {}

      // Tab visibility change detection
      onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          wasInterrupted = true;
          options.onVisibilityWarning?.();
        }
      };
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }

      // Connect recorder to master output node (post-effects & post-limiter)
      masterNode = playbackEngine.getMasterOutputNode();
      recorder = new Tone.Recorder();
      masterNode.connect(recorder);

      // Seek engine to start position
      playbackEngine.seek(startBar);

      // Start recording and transport playback
      recorder.start();
      playbackEngine.play();

      const startTime = Date.now();

      // Progress interval (updates every 200ms)
      progressTimer = window.setInterval(() => {
        if (isCancelled) return;
        const elapsedSec = (Date.now() - startTime) / 1000;
        const progress = Math.min(1, elapsedSec / totalDurationSeconds);
        const remainingSeconds = Math.max(0, Math.ceil(totalDurationSeconds - elapsedSec));

        options.onProgress?.(progress, remainingSeconds);
      }, 200);

      // Finish timer
      finishTimer = window.setTimeout(async () => {
        if (isCancelled) return;

        if (progressTimer !== null) {
          window.clearInterval(progressTimer);
          progressTimer = null;
        }

        playbackEngine.stop();

        if (onVisibilityChange && typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange);
          onVisibilityChange = null;
        }

        if (wakeLock) {
          try {
            await wakeLock.release();
          } catch {}
          wakeLock = null;
        }

        try {
          if (!recorder) {
            resolve(null);
            return;
          }

          const rawRecordingBlob = await recorder.stop();

          if (masterNode) {
            try {
              masterNode.disconnect(recorder);
            } catch {}
          }
          recorder.dispose();
          recorder = null;

          // Convert blob into AudioBuffer to inspect peak level and encode 16-bit WAV
          const arrayBuffer = await rawRecordingBlob.arrayBuffer();
          const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
          const { peak, isClipping } = checkAudioPeak(audioBuffer);

          let outputBlob: Blob;
          let extension = 'wav';

          if (options.format === 'compressed') {
            outputBlob = rawRecordingBlob;
            extension = rawRecordingBlob.type.includes('mp4') ? 'mp4' : 'webm';
          } else {
            outputBlob = encodeWav(audioBuffer);
            extension = 'wav';
          }

          const filename = buildExportFilename(
            song.title || 'untitled-song',
            song.bpm || 90,
            extension
          );

          resolve({
            blob: outputBlob,
            filename,
            durationSeconds: totalDurationSeconds,
            peak,
            isClipping,
            wasInterrupted,
          });
        } catch (err) {
          reject(err);
        }
      }, totalDurationSeconds * 1000);
    } catch (err) {
      cancel();
      reject(err);
    }
  });

  return { promise, cancel };
}
