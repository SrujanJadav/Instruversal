import { describe, it, expect } from 'vitest';
import {
  MARIMBA_POP_INTRO_SPEC,
  convertExampleSongToProject,
  normalizeDrumSound,
  parseRootPitchClass,
} from './marimbaPop';
import { buildScaleNotes, SCALES } from '../audio/scales';
import { generateEventsFromStrokes } from '../audio/schedule';
import { generateFlowEventsFromStrokes } from '../audio/flowScheduler';
import { generateBeatEventsFromStrokes } from '../audio/beatSchedule';

describe('Marimba Pop Intro Hook - C# Natural Minor Specification and Round-Trip Tests', () => {
  const song = MARIMBA_POP_INTRO_SPEC;
  const project = convertExampleSongToProject(song);
  const rootPitch = parseRootPitchClass(song.project.root);
  const scaleNotes = buildScaleNotes(rootPitch, 'natural minor', 3, 6);

  it('verifies 96 BPM tempo, C# minor key, 2-bar length, and effects configuration', () => {
    expect(song.project.tempoBpm).toBe(96);
    expect(song.project.lengthBars).toBe(2);
    expect(song.project.root).toBe('C#');
    expect(rootPitch).toBe(1);
    expect(song.project.timelineBeats).toBe(8);

    // Verify effects setup
    expect(project.bpm).toBe(96);
    expect(project.glide).toBe(5); // 0% - 5% mallet transient
    expect(project.fx?.delay.bypassed).toBe(false);
    expect(project.fx?.delay.amount).toBe(12);
    expect(project.fx?.reverb.bypassed).toBe(false);
    expect(project.fx?.reverb.size).toBe(1.3);
    expect(project.fx?.reverb.amount).toBe(15);
    expect(project.fx?.drive.bypassed).toBe(false);
    expect(project.fx?.drive.amount).toBe(5);
  });

  it('verifies every melodic note in the piece is inside C# natural minor', () => {
    const naturalMinorIntervals = SCALES['natural minor'];
    const validPitchClasses = naturalMinorIntervals.map(
      (interval) => (rootPitch + interval) % 12
    );

    for (const track of song.tracks) {
      if (!track.notes) continue;
      for (const note of track.notes) {
        const pitchClass = ((note.pitch % 12) + 12) % 12;
        expect(
          validPitchClasses.includes(pitchClass),
          `Note pitch ${note.pitch} (pitch class ${pitchClass}) must be inside C# natural minor`
        ).toBe(true);
      }
    }
  });

  it('round-trip test Track 1 (Warm Pluck / Marimba, Notes mode): recovers exact pitches and start times within 1ms', () => {
    const track1Def = song.tracks.find((t) => t.id === 1)!;
    const track1Strokes = project.strokes.filter((s) => s.trackId === 'track-1');

    expect(track1Def.notes).toBeDefined();
    expect(track1Strokes.length).toBe(track1Def.notes!.length);

    // Run through the real scheduler
    const scheduledEvents = generateEventsFromStrokes(track1Strokes, song.project.lengthBars, scaleNotes);

    expect(scheduledEvents.length).toBe(track1Def.notes!.length);

    const stepDuration = 60 / (song.project.tempoBpm * 4); // 16th note duration

    for (let i = 0; i < track1Def.notes!.length; i++) {
      const expected = track1Def.notes![i];
      const actual = scheduledEvents[i];

      // Exact pitch match
      expect(actual.midi).toBe(expected.pitch);

      // Start time within 1ms
      const expectedTimeSec = expected.startBeat * (60 / song.project.tempoBpm);
      const [bar, beat, sixteenth] = (actual.time as string).split(':').map(Number);
      const actualStepIndex = bar * 16 + beat * 4 + sixteenth;
      const actualTimeSec = actualStepIndex * stepDuration;

      const diffSec = Math.abs(actualTimeSec - expectedTimeSec);
      expect(diffSec).toBeLessThanOrEqual(0.001);
    }
  });

  it('round-trip test Track 2 (Deep Sub Bass, Flow mode): recovers downbeat root notes (C#2->F#2->A2->B2) and start times within 1ms', () => {
    const track2Def = song.tracks.find((t) => t.id === 2)!;
    const track2Strokes = project.strokes.filter((s) => s.trackId === 'track-2');

    expect(track2Def.notes).toBeDefined();
    expect(track2Strokes.length).toBe(track2Def.notes!.length);

    // Run through the real flow scheduler
    const scheduledFlowEvents = generateFlowEventsFromStrokes(
      track2Strokes,
      song.project.lengthBars,
      song.project.tempoBpm,
      scaleNotes,
      5
    );

    // Sort chronologically
    scheduledFlowEvents.sort((a, b) => a.startTime - b.startTime);

    expect(scheduledFlowEvents.length).toBe(track2Def.notes!.length);

    for (let i = 0; i < track2Def.notes!.length; i++) {
      const expected = track2Def.notes![i];
      const actual = scheduledFlowEvents[i];

      // Exact initial pitch match
      expect(actual.initialMidi).toBe(expected.pitch);

      // Start time within 1ms
      const expectedStartTimeSec = expected.startBeat * (60 / song.project.tempoBpm);
      const diffStartSec = Math.abs(actual.startTime - expectedStartTimeSec);
      expect(diffStartSec).toBeLessThanOrEqual(0.001);

      // End time within 1ms
      const expectedEndTimeSec = (expected.startBeat + expected.duration) * (60 / song.project.tempoBpm);
      const diffEndSec = Math.abs(actual.endTime - expectedEndTimeSec);
      expect(diffEndSec).toBeLessThanOrEqual(0.001);
    }
  });

  it('round-trip test Track 3 (Dance-Pop Drums, Hits mode): recovers exact drum sounds and start times within 1ms', () => {
    const track3Def = song.tracks.find((t) => t.id === 3)!;
    const track3Strokes = project.strokes.filter((s) => s.trackId === 'track-3');

    expect(track3Def.hits).toBeDefined();
    expect(track3Strokes.length).toBe(track3Def.hits!.length);

    // Run through the real beat scheduler
    const scheduledBeatEvents = generateBeatEventsFromStrokes(track3Strokes, {
      bpm: song.project.tempoBpm,
      bars: song.project.lengthBars,
      swing: 0,
      humanize: 0,
    });

    expect(scheduledBeatEvents.length).toBe(track3Def.hits!.length);

    // Sort expected hits chronologically and by drum id
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
      expect(actual.soundId).toBe(normalizeDrumSound(expected.drum));

      // Start time within 1ms
      const expectedTimeSec = expected.startBeat * (60 / song.project.tempoBpm);
      const diffSec = Math.abs(actual.time - expectedTimeSec);
      expect(diffSec).toBeLessThanOrEqual(0.001);
    }
  });
});
