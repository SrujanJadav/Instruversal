import { describe, it, expect } from 'vitest';
import {
  MARIMBA_POP_EXAMPLE,
  convertExampleSongToProject,
} from './marimbaPop';
import { buildScaleNotes, SCALES } from '../audio/scales';
import { generateEventsFromStrokes } from '../audio/schedule';
import { generateFlowEventsFromStrokes } from '../audio/flowScheduler';
import { generateBeatEventsFromStrokes } from '../audio/beatSchedule';

describe('Marimba Pop (original) - Step 28 Round-Trip and Scale Verification', () => {
  const song = MARIMBA_POP_EXAMPLE;
  const project = convertExampleSongToProject(song);
  const scaleNotes = buildScaleNotes(song.rootNote, song.scaleName, 1, 6);

  it('verifies metadata, title, credit, and license requirements', () => {
    expect(song.title).toBe('Marimba Pop (original)');
    expect(song.credit).toBe('Original');
    expect(song.licence).toBe('original, MIT');
    expect(song.bpm).toBe(98);
    expect(song.bars).toBe(2);
    expect(song.rootNote).toBe(9); // A
    expect(song.scaleName).toBe('natural minor');
  });

  it('verifies every melodic note in the piece is inside A natural minor', () => {
    // Natural minor semitone intervals: [0, 2, 3, 5, 7, 8, 10]
    // With root A (pitch class 9):
    // 9 (A), 11 (B), 0 (C), 2 (D), 4 (E), 5 (F), 7 (G)
    const naturalMinorIntervals = SCALES['natural minor'];
    const validPitchClasses = naturalMinorIntervals.map(
      (interval) => (song.rootNote + interval) % 12
    );

    const melodicTracks = song.tracks.filter((t) => t.trackType === 'melodic');
    for (const track of melodicTracks) {
      if (!track.notes) continue;
      for (const note of track.notes) {
        const pitchClass = ((note.midi % 12) + 12) % 12;
        expect(
          validPitchClasses.includes(pitchClass),
          `Note MIDI ${note.midi} (pitch class ${pitchClass}) must be inside A natural minor`
        ).toBe(true);
      }
    }
  });

  it('round-trip test Track 1 (Notes mode): recovers exact pitches and start times within 1ms', () => {
    const track1Def = song.tracks.find((t) => t.id === 'track-1')!;
    const track1Strokes = project.strokes.filter((s) => s.trackId === 'track-1');

    expect(track1Def.notes).toBeDefined();
    expect(track1Strokes.length).toBe(track1Def.notes!.length);

    // Run through the real scheduler
    const scheduledEvents = generateEventsFromStrokes(track1Strokes, song.bars, scaleNotes);

    expect(scheduledEvents.length).toBe(track1Def.notes!.length);

    const stepDuration = 60 / (song.bpm * 4); // 16th note duration

    for (let i = 0; i < track1Def.notes!.length; i++) {
      const expected = track1Def.notes![i];
      const actual = scheduledEvents[i];

      // Exact pitch match
      expect(actual.midi).toBe(expected.midi);

      // Start time within 1ms (0.001s)
      const expectedTimeSec = expected.startBeat * (60 / song.bpm);
      const [bar, beat, sixteenth] = (actual.time as string).split(':').map(Number);
      const actualStepIndex = bar * 16 + beat * 4 + sixteenth;
      const actualTimeSec = actualStepIndex * stepDuration;

      const diffSec = Math.abs(actualTimeSec - expectedTimeSec);
      expect(diffSec).toBeLessThanOrEqual(0.001);
    }
  });

  it('round-trip test Track 2 (Flow mode): recovers exact pitches and start times within 1ms', () => {
    const track2Def = song.tracks.find((t) => t.id === 'track-2')!;
    const track2Strokes = project.strokes.filter((s) => s.trackId === 'track-2');

    expect(track2Def.notes).toBeDefined();
    expect(track2Strokes.length).toBe(track2Def.notes!.length);

    // Run through the real flow scheduler
    const scheduledFlowEvents = generateFlowEventsFromStrokes(
      track2Strokes,
      song.bars,
      song.bpm,
      scaleNotes,
      25
    );

    // Sort chronologically
    scheduledFlowEvents.sort((a, b) => a.startTime - b.startTime);

    expect(scheduledFlowEvents.length).toBe(track2Def.notes!.length);

    for (let i = 0; i < track2Def.notes!.length; i++) {
      const expected = track2Def.notes![i];
      const actual = scheduledFlowEvents[i];

      // Exact initial pitch match
      expect(actual.initialMidi).toBe(expected.midi);

      // Start time within 1ms
      const expectedStartTimeSec = expected.startBeat * (60 / song.bpm);
      const diffStartSec = Math.abs(actual.startTime - expectedStartTimeSec);
      expect(diffStartSec).toBeLessThanOrEqual(0.001);

      // End time within 1ms
      const expectedEndTimeSec = (expected.startBeat + expected.durationBeats) * (60 / song.bpm);
      const diffEndSec = Math.abs(actual.endTime - expectedEndTimeSec);
      expect(diffEndSec).toBeLessThanOrEqual(0.001);
    }
  });

  it('round-trip test Track 3 (Beat track, Hits mode): recovers exact drum sounds and start times within 1ms', () => {
    const track3Def = song.tracks.find((t) => t.id === 'track-3')!;
    const track3Strokes = project.strokes.filter((s) => s.trackId === 'track-3');

    expect(track3Def.hits).toBeDefined();
    expect(track3Strokes.length).toBe(track3Def.hits!.length);

    // Run through the real beat scheduler
    const scheduledBeatEvents = generateBeatEventsFromStrokes(track3Strokes, {
      bpm: song.bpm,
      bars: song.bars,
      swing: 0,
      humanize: 0,
    });

    expect(scheduledBeatEvents.length).toBe(track3Def.hits!.length);

    // Sort expected hits chronologically and by drum id for deterministic matching
    const sortedExpected = [...track3Def.hits!].sort((a, b) => {
      if (Math.abs(a.startBeat - b.startBeat) > 0.0001) return a.startBeat - b.startBeat;
      return a.drum.localeCompare(b.drum);
    });

    // Sort scheduled hits chronologically and by soundId
    const sortedActual = [...scheduledBeatEvents].sort((a, b) => {
      if (Math.abs(a.time - b.time) > 0.0001) return a.time - b.time;
      return a.soundId.localeCompare(b.soundId);
    });

    for (let i = 0; i < sortedExpected.length; i++) {
      const expected = sortedExpected[i];
      const actual = sortedActual[i];

      // Exact drum sound match
      expect(actual.soundId).toBe(expected.drum);

      // Start time within 1ms
      const expectedTimeSec = expected.startBeat * (60 / song.bpm);
      const diffSec = Math.abs(actual.time - expectedTimeSec);
      expect(diffSec).toBeLessThanOrEqual(0.001);
    }
  });
});
