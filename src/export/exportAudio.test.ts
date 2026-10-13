import { describe, it, expect } from 'vitest';
import {
  encodeWav,
  checkAudioPeak,
  buildExportFilename,
  getSupportedExportFormats,
} from './exportAudio';

function createMockAudioBuffer(channels: Float32Array[], sampleRate = 44100): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    sampleRate,
    length: channels[0].length,
    duration: channels[0].length / sampleRate,
    getChannelData: (ch: number) => channels[ch] || channels[0],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe('exportAudio', () => {
  describe('encodeWav', () => {
    it('creates a valid 16-bit stereo PCM WAV blob with proper RIFF headers', async () => {
      const sampleRate = 44100;
      const numFrames = 1000;
      const left = new Float32Array(numFrames);
      const right = new Float32Array(numFrames);

      // Generate a small test tone
      for (let i = 0; i < numFrames; i++) {
        left[i] = Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 0.5;
        right[i] = -Math.sin((i / sampleRate) * 440 * 2 * Math.PI) * 0.5;
      }

      const buffer = createMockAudioBuffer([left, right], sampleRate);
      const blob = encodeWav(buffer);
      expect(blob).toBeDefined();
      expect(blob.type).toBe('audio/wav');

      const expectedDataSize = numFrames * 2 * 2; // frames * channels * 2 bytes
      const expectedTotalSize = 44 + expectedDataSize;
      expect(blob.size).toBe(expectedTotalSize);

      const arrayBuffer = await blob.arrayBuffer();
      const view = new DataView(arrayBuffer);

      // Header checks: 'RIFF'
      const riffHeader = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      expect(riffHeader).toBe('RIFF');

      // 'WAVE'
      const waveHeader = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      expect(waveHeader).toBe('WAVE');

      // 'fmt '
      const fmtHeader = String.fromCharCode(view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15));
      expect(fmtHeader).toBe('fmt ');

      // Audio format = 1 (PCM)
      expect(view.getUint16(20, true)).toBe(1);

      // Num channels = 2
      expect(view.getUint16(22, true)).toBe(2);

      // Sample rate = 44100
      expect(view.getUint32(24, true)).toBe(sampleRate);

      // Bits per sample = 16
      expect(view.getUint16(34, true)).toBe(16);

      // 'data' chunk
      const dataHeader = String.fromCharCode(view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39));
      expect(dataHeader).toBe('data');
      expect(view.getUint32(40, true)).toBe(expectedDataSize);
    });

    it('clamps out-of-range floats to signed 16-bit limits without wrapping', async () => {
      const left = new Float32Array([1.5, -1.5, 0]);
      const right = new Float32Array([2.0, -3.0, 0]);

      const buffer = createMockAudioBuffer([left, right], 44100);
      const blob = encodeWav(buffer);
      const arrayBuffer = await blob.arrayBuffer();
      const view = new DataView(arrayBuffer);

      // 44-byte header offset
      const firstLeftSample = view.getInt16(44, true);
      const firstRightSample = view.getInt16(46, true);
      const secondLeftSample = view.getInt16(48, true);
      const secondRightSample = view.getInt16(50, true);

      expect(firstLeftSample).toBe(32767);
      expect(firstRightSample).toBe(32767);
      expect(secondLeftSample).toBe(-32768);
      expect(secondRightSample).toBe(-32768);
    });
  });

  describe('checkAudioPeak', () => {
    it('detects clipping when sample exceeds 0.999', () => {
      const channelA = new Float32Array([0.1, 0.4, 0.9995]);
      const channelB = new Float32Array([0.2, -0.9992, 0.1]);

      const buffer = createMockAudioBuffer([channelA, channelB]);
      const result = checkAudioPeak(buffer);
      expect(result.isClipping).toBe(true);
      expect(result.peak).toBeGreaterThanOrEqual(0.999);
    });

    it('reports no clipping for safe audio levels', () => {
      const channelA = new Float32Array([0.1, 0.5, 0.8]);
      const channelB = new Float32Array([-0.7, 0.2, 0.4]);

      const buffer = createMockAudioBuffer([channelA, channelB]);
      const result = checkAudioPeak(buffer);
      expect(result.isClipping).toBe(false);
      expect(result.peak).toBeCloseTo(0.8, 2);
    });
  });

  describe('buildExportFilename', () => {
    it('builds clean kebab-case filename with title, bpm, date, and extension', () => {
      const filename = buildExportFilename('Ode to Joy / Classical #1', 120, 'wav');
      expect(filename).toMatch(/^instruversal-ode-to-joy-classical-1-120bpm-\d{4}-\d{2}-\d{2}\.wav$/);
    });

    it('handles empty or special character titles gracefully', () => {
      const filename = buildExportFilename('???!!!', 90, 'webm');
      expect(filename).toMatch(/^instruversal-sketch-90bpm-\d{4}-\d{2}-\d{2}\.webm$/);
    });
  });

  describe('getSupportedExportFormats', () => {
    it('includes WAV format by default', () => {
      const formats = getSupportedExportFormats();
      expect(formats.length).toBeGreaterThanOrEqual(1);
      expect(formats[0].id).toBe('wav');
      expect(formats[0].extension).toBe('wav');
    });
  });
});
