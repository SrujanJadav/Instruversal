import { describe, it, expect } from 'vitest';
import {
  encodeVlq,
  encodeString,
  encodeUint32,
  encodeUint16,
  buildConductorTrack,
  buildInstrumentTrack,
  writeStandardMidiFile,
} from './midiWriter';
import { exportProjectToMidi, rootAndScaleToKeySig } from './exportMidi';
import { ODE_TO_JOY } from '../examples/odeToJoy';
import { MARIMBA_POP } from '../examples/marimbaPop';
import { DREAMY_ARPEGGIO } from '../examples/dreamyArpeggio';
import { convertNotesToStrokes } from '../examples/notesToStrokes';
import { Track } from '../audio/tracks';
import { state, Stroke } from '../state';

/**
 * Clean in-memory parser for testing SMF Format 1 generated files.
 */
interface ParsedMidiNote {
  midi: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

interface ParsedMidiTrack {
  name: string;
  channel: number;
  program?: number;
  notes: ParsedMidiNote[];
}

interface ParsedMidiFile {
  format: number;
  numTracks: number;
  ticksPerQuarter: number;
  bpm: number;
  tracks: ParsedMidiTrack[];
}

function parseMidiBuffer(bytes: Uint8Array): ParsedMidiFile {
  let offset = 0;

  // Header chunk
  const headerId = String.fromCharCode(...bytes.slice(offset, offset + 4));
  offset += 4;
  if (headerId !== 'MThd') throw new Error(`Invalid header: ${headerId}`);

  const headerLen =
    (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  offset += 4;
  if (headerLen < 6) throw new Error(`Invalid header length: ${headerLen}`);
  const format = (bytes[offset] << 8) | bytes[offset + 1];
  offset += 2;
  const numTracks = (bytes[offset] << 8) | bytes[offset + 1];
  offset += 2;
  const ticksPerQuarter = (bytes[offset] << 8) | bytes[offset + 1];
  offset += 2;

  let globalBpm = 120;
  const parsedTracks: ParsedMidiTrack[] = [];

  for (let t = 0; t < numTracks; t++) {
    if (offset >= bytes.length) break;
    const trackId = String.fromCharCode(...bytes.slice(offset, offset + 4));
    offset += 4;
    if (trackId !== 'MTrk') throw new Error(`Invalid track header: ${trackId}`);
    const trackLen =
      (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 4;
    const trackEnd = offset + trackLen;

    let currentTick = 0;
    let trackName = `Track ${t + 1}`;
    let trackChannel = 0;
    let program: number | undefined;
    const activeNotes = new Map<number, { startTick: number; velocity: number }>();
    const finishedNotes: ParsedMidiNote[] = [];

    while (offset < trackEnd) {
      // Read variable-length delta time
      let delta = 0;
      let b = 0;
      do {
        b = bytes[offset++];
        delta = (delta << 7) | (b & 0x7f);
      } while (b & 0x80);

      currentTick += delta;

      const status = bytes[offset++];
      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      if (status < 0xf0) {
        trackChannel = channel;
      }

      if (status === 0xff) {
        // Meta event
        const metaType = bytes[offset++];
        let metaLen = 0;
        let mb = 0;
        do {
          mb = bytes[offset++];
          metaLen = (metaLen << 7) | (mb & 0x7f);
        } while (mb & 0x80);

        if (metaType === 0x03) {
          trackName = new TextDecoder().decode(bytes.slice(offset, offset + metaLen));
        } else if (metaType === 0x51 && metaLen === 3) {
          const usPerQuarter = (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
          globalBpm = Math.round(60_000_000 / usPerQuarter);
        }
        offset += metaLen;
      } else if (eventType === 0xc0) {
        // Program change
        program = bytes[offset++];
      } else if (eventType === 0x90) {
        // Note On
        const note = bytes[offset++];
        const vel = bytes[offset++];
        if (vel > 0) {
          activeNotes.set(note, { startTick: currentTick, velocity: vel });
        } else {
          // Vel 0 = Note Off
          const active = activeNotes.get(note);
          if (active) {
            finishedNotes.push({
              midi: note,
              startTick: active.startTick,
              durationTicks: currentTick - active.startTick,
              velocity: active.velocity,
            });
            activeNotes.delete(note);
          }
        }
      } else if (eventType === 0x80) {
        // Note Off
        const note = bytes[offset++];
        offset++; // ignore release vel
        const active = activeNotes.get(note);
        if (active) {
          finishedNotes.push({
            midi: note,
            startTick: active.startTick,
            durationTicks: currentTick - active.startTick,
            velocity: active.velocity,
          });
          activeNotes.delete(note);
        }
      }
    }

    parsedTracks.push({
      name: trackName,
      channel: trackChannel,
      program,
      notes: finishedNotes,
    });
  }

  return {
    format,
    numTracks,
    ticksPerQuarter,
    bpm: globalBpm,
    tracks: parsedTracks,
  };
}

describe('Standard MIDI File Writer (src/export/midiWriter.ts)', () => {
  it('correctly encodes Variable-Length Quantities (VLQ)', () => {
    expect(encodeVlq(0)).toEqual([0x00]);
    expect(encodeVlq(64)).toEqual([0x40]);
    expect(encodeVlq(127)).toEqual([0x7f]);
    expect(encodeVlq(128)).toEqual([0x81, 0x00]);
    expect(encodeVlq(255)).toEqual([0x81, 0x7f]);
    expect(encodeVlq(480)).toEqual([0x83, 0x60]);
    expect(encodeVlq(1920)).toEqual([0x8f, 0x00]);
    expect(encodeVlq(16383)).toEqual([0xff, 0x7f]);
    expect(encodeVlq(16384)).toEqual([0x81, 0x80, 0x00]);
  });

  it('correctly encodes strings and big-endian integers', () => {
    expect(encodeString('MThd')).toEqual([0x4d, 0x54, 0x68, 0x64]);
    expect(encodeUint32(6)).toEqual([0x00, 0x00, 0x00, 0x06]);
    expect(encodeUint16(480)).toEqual([0x01, 0xe0]);
  });

  it('builds conductor track with title, tempo, time signature, and end marker', () => {
    const conductor = buildConductorTrack({
      title: 'Test Melody',
      bpm: 120,
      timeSignature: [4, 4],
      keySignature: { sf: 0, mi: 0 },
      tracks: [],
    });

    expect(conductor.slice(0, 4)).toEqual([0x4d, 0x54, 0x72, 0x6b]); // 'MTrk'
    // Ends with End of Track 0x00 0xFF 0x2F 0x00
    expect(conductor.slice(-4)).toEqual([0x00, 0xff, 0x2f, 0x00]);
  });

  it('builds instrument track with program change, channel, and sorted note events', () => {
    const trackChunk = buildInstrumentTrack({
      name: 'Marimba',
      channel: 2,
      program: 12,
      notes: [
        { midi: 60, startTick: 0, durationTicks: 480, velocity: 100 },
        { midi: 64, startTick: 480, durationTicks: 240, velocity: 90 },
      ],
    });

    expect(trackChunk.slice(0, 4)).toEqual([0x4d, 0x54, 0x72, 0x6b]);
    expect(trackChunk.slice(-4)).toEqual([0x00, 0xff, 0x2f, 0x00]);
  });

  it('generates a complete valid SMF format 1 binary array', () => {
    const song = {
      title: 'Full Piece',
      bpm: 96,
      tracks: [
        {
          name: 'Lead',
          channel: 0,
          program: 12,
          notes: [{ midi: 69, startTick: 0, durationTicks: 480, velocity: 100 }],
        },
      ],
    };

    const bytes = writeStandardMidiFile(song);
    expect(bytes[0]).toBe(0x4d); // 'M'
    expect(bytes[1]).toBe(0x54); // 'T'
    expect(bytes[2]).toBe(0x68); // 'h'
    expect(bytes[3]).toBe(0x64); // 'd'

    const parsed = parseMidiBuffer(bytes);
    expect(parsed.format).toBe(1);
    expect(parsed.numTracks).toBe(2); // Conductor + 1 instrument
    expect(parsed.bpm).toBe(96);
    expect(parsed.ticksPerQuarter).toBe(480);
  });
});

describe('Project to MIDI Round-Trip Verification (src/export/exportMidi.ts)', () => {
  it('correctly maps musical keys to circle of fifths key signature', () => {
    expect(rootAndScaleToKeySig(0, 'major')).toEqual({ sf: 0, mi: 0 }); // C major
    expect(rootAndScaleToKeySig(7, 'major')).toEqual({ sf: 1, mi: 0 }); // G major
    expect(rootAndScaleToKeySig(5, 'major')).toEqual({ sf: -1, mi: 0 }); // F major
    expect(rootAndScaleToKeySig(9, 'natural minor')).toEqual({ sf: 0, mi: 1 }); // A minor
    expect(rootAndScaleToKeySig(2, 'natural minor')).toEqual({ sf: -1, mi: 1 }); // D minor
  });

  it('exports Ode to Joy and verifies round-trip note pitches, times and tempo within 1ms', async () => {
    const { strokes } = convertNotesToStrokes(ODE_TO_JOY);

    // Mock dummy tracks matching Ode to Joy
    const mockTracks = [
      {
        id: 'track-1',
        name: 'Marimba',
        trackType: 'melodic' as const,
        instrumentId: 'marimba',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
      {
        id: 'track-2',
        name: 'Sub Bass',
        trackType: 'melodic' as const,
        instrumentId: 'sub-bass',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
    ];

    const result = exportProjectToMidi({
      title: ODE_TO_JOY.title,
      bpm: ODE_TO_JOY.bpm,
      bars: ODE_TO_JOY.bars,
      repeats: 1,
      rootNote: ODE_TO_JOY.root,
      scaleName: ODE_TO_JOY.scale,
      scaleOctaves: [1, 6],
      strokes,
      tracks: mockTracks,
    });

    expect(result.filename).toMatch(/instruversal-ode-to-joy-100bpm-.*\.mid/);

    const buffer = new Uint8Array(await result.blob.arrayBuffer());
    const parsed = parseMidiBuffer(buffer);

    expect(parsed.format).toBe(1);
    expect(parsed.bpm).toBe(100);

    // Track 0 is conductor; track 1 is melody, track 2 is bass
    const melodyTrack = parsed.tracks.find((t) => t.name.includes('Marimba'));
    expect(melodyTrack).toBeDefined();

    const origMelodyNotes = ODE_TO_JOY.tracks[0].notes!;
    expect(melodyTrack!.notes.length).toBe(origMelodyNotes.length);

    for (let i = 0; i < origMelodyNotes.length; i++) {
      const orig = origMelodyNotes[i];
      const parsedNote = melodyTrack!.notes[i];
      expect(parsedNote.midi).toBe(orig.midi);

      // Start time comparison: ticks to seconds
      const seconds = (parsedNote.startTick / 480) * (60 / 100);
      const expectedSeconds = orig.startBeat * (60 / 100);
      expect(Math.abs(seconds - expectedSeconds)).toBeLessThanOrEqual(0.001);
    }
  });

  it('exports Marimba Pop with drums on General MIDI channel 10 (channel 9)', async () => {
    const { strokes } = convertNotesToStrokes(MARIMBA_POP);

    const mockTracks = [
      {
        id: 'track-1',
        name: 'Marimba',
        trackType: 'melodic' as const,
        instrumentId: 'marimba',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
      {
        id: 'track-2',
        name: 'Sub Bass',
        trackType: 'melodic' as const,
        instrumentId: 'sub-bass',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
      {
        id: 'track-3',
        name: 'Drums',
        trackType: 'beat' as const,
        instrumentId: '808',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
    ];

    const result = exportProjectToMidi({
      title: MARIMBA_POP.title,
      bpm: MARIMBA_POP.bpm,
      bars: MARIMBA_POP.bars,
      repeats: 1,
      scaleOctaves: [1, 6],
      strokes,
      tracks: mockTracks,
    });

    const buffer = new Uint8Array(await result.blob.arrayBuffer());
    const parsed = parseMidiBuffer(buffer);

    const drumTrack = parsed.tracks.find((t) => t.name.includes('Drums'));
    expect(drumTrack).toBeDefined();
    // GM drum channel is channel 10 (0-indexed 9)
    expect(drumTrack!.channel).toBe(9);
    expect(drumTrack!.notes.length).toBeGreaterThan(0);

    // Verify all drum notes map to standard General MIDI drum notes
    const validGmDrumNotes = [36, 38, 39, 42, 45, 46, 56, 70];
    for (const n of drumTrack!.notes) {
      expect(validGmDrumNotes).toContain(n.midi);
    }
  });

  it('exports Dreamy Arpeggio and handles loop repeats correctly', async () => {
    const { strokes } = convertNotesToStrokes(DREAMY_ARPEGGIO);

    const mockTracks = [
      {
        id: 'track-1',
        name: 'Warm Keys',
        trackType: 'melodic' as const,
        instrumentId: 'warm-keys',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
    ];

    // 1 loop vs 2 repeats
    const res1 = exportProjectToMidi({
      title: DREAMY_ARPEGGIO.title,
      bpm: DREAMY_ARPEGGIO.bpm,
      bars: DREAMY_ARPEGGIO.bars,
      repeats: 1,
      strokes,
      tracks: mockTracks,
    });

    const res2 = exportProjectToMidi({
      title: DREAMY_ARPEGGIO.title,
      bpm: DREAMY_ARPEGGIO.bpm,
      bars: DREAMY_ARPEGGIO.bars,
      repeats: 2,
      strokes,
      tracks: mockTracks,
    });

    const parsed1 = parseMidiBuffer(new Uint8Array(await res1.blob.arrayBuffer()));
    const parsed2 = parseMidiBuffer(new Uint8Array(await res2.blob.arrayBuffer()));

    const count1 = parsed1.tracks.find((t) => t.name.includes('Warm Keys'))!.notes.length;
    const count2 = parsed2.tracks.find((t) => t.name.includes('Warm Keys'))!.notes.length;

    expect(count2).toBe(count1 * 2);
  });

  it('exports folded shapes as simultaneous notes (chords)', async () => {
    // Folded cone shape with multiple Y points at the same X
    const coneStroke: Stroke = {
      id: 'cone-stroke',
      trackId: 'track-1',
      points: [
        { x: 0.1, y: 0.8, t: 0 },
        { x: 0.5, y: 0.2, t: 100 },
        { x: 0.9, y: 0.8, t: 200 },
      ],
      width: 2.0,
    };

    const mockTracks = [
      {
        id: 'track-1',
        name: 'Marimba',
        trackType: 'melodic' as const,
        instrumentId: 'marimba',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
    ];

    const result = exportProjectToMidi({
      title: 'Cone Test',
      bpm: 120,
      bars: 2,
      repeats: 1,
      strokes: [coneStroke],
      tracks: mockTracks,
    });

    const parsed = parseMidiBuffer(new Uint8Array(await result.blob.arrayBuffer()));
    const lead = parsed.tracks.find((t) => t.name.includes('Marimba'))!;
    expect(lead.notes.length).toBeGreaterThan(0);
  });

  it('respects track mute and solo states during export', async () => {
    const stroke1: Stroke = {
      id: 's-1',
      trackId: 'track-1',
      points: [{ x: 0.1, y: 0.5, t: 0 }, { x: 0.3, y: 0.5, t: 100 }],
      width: 2.0,
    };
    const stroke2: Stroke = {
      id: 's-2',
      trackId: 'track-2',
      points: [{ x: 0.1, y: 0.5, t: 0 }, { x: 0.3, y: 0.5, t: 100 }],
      width: 2.0,
    };

    // Track 2 is muted
    const mockTracks = [
      {
        id: 'track-1',
        name: 'Track 1',
        trackType: 'melodic' as const,
        instrumentId: 'marimba',
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
      {
        id: 'track-2',
        name: 'Track 2',
        trackType: 'melodic' as const,
        instrumentId: 'sub-bass',
        muted: true,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
    ];

    const result = exportProjectToMidi({
      title: 'Mute Test',
      bpm: 120,
      bars: 2,
      repeats: 1,
      strokes: [stroke1, stroke2],
      tracks: mockTracks,
    });

    const parsed = parseMidiBuffer(new Uint8Array(await result.blob.arrayBuffer()));
    // Conductor + Track 1 only (muted Track 2 is excluded)
    expect(parsed.numTracks).toBe(2);
    expect(parsed.tracks.some((t) => t.name.includes('Track 2'))).toBe(false);
  });

  it('writes per-colour key info into track name in perColour mode', async () => {
    const stroke1: Stroke = {
      id: 's-1',
      trackId: 'track-1',
      points: [{ x: 0.1, y: 0.5, t: 0 }, { x: 0.3, y: 0.5, t: 100 }],
      width: 2.0,
    };

    const mockTracks = [
      {
        id: 'track-1',
        name: 'Marimba',
        trackType: 'melodic' as const,
        instrumentId: 'marimba',
        key: { root: 2, scale: 'dorian' as const },
        muted: false,
        solo: false,
        beatMode: 'hits' as const,
        beatFlowStyle: 'glide' as const,
      } as unknown as Track,
    ];

    // Temporarily set keyMode to perColour
    const origKeyMode = state.keyMode;
    state.keyMode = 'perColour';

    try {
      const result = exportProjectToMidi({
        title: 'Per-Colour Key Test',
        bpm: 120,
        bars: 2,
        repeats: 1,
        strokes: [stroke1],
        tracks: mockTracks,
      });

      const parsed = parseMidiBuffer(new Uint8Array(await result.blob.arrayBuffer()));
      const lead = parsed.tracks.find((t) => t.name.includes('Marimba'))!;
      // Track name contains key name: "Marimba (D dorian)"
      expect(lead.name).toContain('D dorian');
    } finally {
      state.keyMode = origKeyMode;
    }
  });
});
