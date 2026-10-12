import { describe, it, expect } from 'vitest';
import { convertNotesToStrokes } from './notesToStrokes';
import { ODE_TO_JOY } from './odeToJoy';
import { MARIMBA_POP } from './marimbaPop';
import { DREAMY_ARPEGGIO } from './dreamyArpeggio';
import { generateFlowEventsFromStrokes } from '../audio/flowScheduler';
import { generateEventsFromStrokes } from '../audio/schedule';
import { generateBeatEventsFromStrokes } from '../audio/beatSchedule';
import { buildScaleNotes, SCALES } from '../audio/scales';
import { ExampleSong } from './types';

describe('notesToStrokes converter and round-trip verification', () => {
  it('converts Ode to Joy and achieves round-trip accuracy within 1ms', () => {
    const { strokes, project } = convertNotesToStrokes(ODE_TO_JOY);
    expect(strokes.length).toBe(ODE_TO_JOY.tracks[0].notes!.length + ODE_TO_JOY.tracks[1].notes!.length);

    // Track 1: Marimba melody (Flow mode)
    const melodyStrokes = strokes.filter((s) => s.trackId === 'track-1');
    const scaleNotes = buildScaleNotes(ODE_TO_JOY.root, ODE_TO_JOY.scale, 1, 6);
    const flowEvents = generateFlowEventsFromStrokes(
      melodyStrokes,
      ODE_TO_JOY.bars,
      ODE_TO_JOY.bpm,
      scaleNotes,
      project.glide
    );

    expect(flowEvents.length).toBe(ODE_TO_JOY.tracks[0].notes!.length);

    // Compare each note in order
    const origNotes = ODE_TO_JOY.tracks[0].notes!;
    for (let i = 0; i < origNotes.length; i++) {
      const orig = origNotes[i];
      const ev = flowEvents[i];
      const expectedTimeSec = orig.startBeat * (60 / ODE_TO_JOY.bpm);

      expect(ev.initialMidi).toBe(orig.midi);
      // Start time within 1 millisecond (0.001s)
      expect(Math.abs(ev.startTime - expectedTimeSec)).toBeLessThanOrEqual(0.001);
    }
  });

  it('converts Marimba Pop (original) and verifies pitches, drums and start times within 1ms in A natural minor', () => {
    const { strokes } = convertNotesToStrokes(MARIMBA_POP);
    const scaleNotes = buildScaleNotes(MARIMBA_POP.root, MARIMBA_POP.scale, 1, 6);

    // Verify all melodic notes are in A natural minor
    const naturalMinorIntervals = SCALES['natural minor'];
    const validPitchClasses = naturalMinorIntervals.map(
      (interval) => (MARIMBA_POP.root + interval) % 12
    );

    for (const track of MARIMBA_POP.tracks) {
      if (!track.notes) continue;
      for (const note of track.notes) {
        const pitchClass = ((note.midi % 12) + 12) % 12;
        expect(
          validPitchClasses.includes(pitchClass),
          `Note MIDI ${note.midi} (pitch class ${pitchClass}) must be inside A natural minor`
        ).toBe(true);
      }
    }

    // Track 1: Marimba in Notes mode
    const track1Def = MARIMBA_POP.tracks[0];
    const track1Strokes = strokes.filter((s) => s.trackId === 'track-1');
    expect(track1Strokes.length).toBe(track1Def.notes!.length);

    const stepEvents = generateEventsFromStrokes(track1Strokes, MARIMBA_POP.bars, scaleNotes);
    expect(stepEvents.length).toBe(track1Def.notes!.length);

    const stepDuration = 60 / (MARIMBA_POP.bpm * 4);
    for (let i = 0; i < track1Def.notes!.length; i++) {
      const orig = track1Def.notes![i];
      const ev = stepEvents[i];
      expect(ev.midi).toBe(orig.midi);

      const expectedTimeSec = orig.startBeat * (60 / MARIMBA_POP.bpm);
      const [bar, beat, sixteenth] = (ev.time as string).split(':').map(Number);
      const actualStepIndex = bar * 16 + beat * 4 + sixteenth;
      const actualTimeSec = actualStepIndex * stepDuration;

      expect(Math.abs(actualTimeSec - expectedTimeSec)).toBeLessThanOrEqual(0.001);
    }

    // Track 2: Sub Bass in Flow mode
    const track2Def = MARIMBA_POP.tracks[1];
    const track2Strokes = strokes.filter((s) => s.trackId === 'track-2');
    expect(track2Strokes.length).toBe(track2Def.notes!.length);

    const flowEvents = generateFlowEventsFromStrokes(
      track2Strokes,
      MARIMBA_POP.bars,
      MARIMBA_POP.bpm,
      scaleNotes,
      20
    );
    flowEvents.sort((a, b) => a.startTime - b.startTime);
    expect(flowEvents.length).toBe(track2Def.notes!.length);

    for (let i = 0; i < track2Def.notes!.length; i++) {
      const orig = track2Def.notes![i];
      const ev = flowEvents[i];
      expect(ev.initialMidi).toBe(orig.midi);

      const expectedTimeSec = orig.startBeat * (60 / MARIMBA_POP.bpm);
      expect(Math.abs(ev.startTime - expectedTimeSec)).toBeLessThanOrEqual(0.001);
    }

    // Track 3: Beat track hits (808 kit)
    const track3Def = MARIMBA_POP.tracks[2];
    const beatStrokes = strokes.filter((s) => s.trackId === 'track-3');
    expect(beatStrokes.length).toBe(track3Def.hits!.length);

    const beatEvents = generateBeatEventsFromStrokes(beatStrokes, {
      bpm: MARIMBA_POP.bpm,
      bars: MARIMBA_POP.bars,
      humanize: 0,
      swing: 0,
    });
    expect(beatEvents.length).toBe(track3Def.hits!.length);

    const sortedOrig = [...track3Def.hits!].sort((a, b) => {
      if (Math.abs(a.startBeat - b.startBeat) > 0.0001) return a.startBeat - b.startBeat;
      return a.drum.localeCompare(b.drum);
    });
    const sortedEvs = [...beatEvents].sort((a, b) => {
      if (Math.abs(a.time - b.time) > 0.0001) return a.time - b.time;
      return a.soundId.localeCompare(b.soundId);
    });

    for (let i = 0; i < sortedOrig.length; i++) {
      const orig = sortedOrig[i];
      const ev = sortedEvs[i];
      expect(ev.soundId).toBe(orig.drum);

      const expectedTimeSec = orig.startBeat * (60 / MARIMBA_POP.bpm);
      expect(Math.abs(ev.time - expectedTimeSec)).toBeLessThanOrEqual(0.001);
    }
  });

  it('converts Dreamy Arpeggio and preserves all harmonic chord pitches', () => {
    const { strokes } = convertNotesToStrokes(DREAMY_ARPEGGIO);
    const plumStrokes = strokes.filter((s) => s.trackId === 'track-5');
    const scaleNotes = buildScaleNotes(DREAMY_ARPEGGIO.root, DREAMY_ARPEGGIO.scale, 1, 6);
    const flowEvents = generateFlowEventsFromStrokes(
      plumStrokes,
      DREAMY_ARPEGGIO.bars,
      DREAMY_ARPEGGIO.bpm,
      scaleNotes,
      20
    );

    const origNotes = DREAMY_ARPEGGIO.tracks[0].notes!;
    expect(flowEvents.length).toBe(origNotes.length);

    for (let i = 0; i < origNotes.length; i++) {
      const orig = origNotes[i];
      const ev = flowEvents[i];
      expect(ev.initialMidi).toBe(orig.midi);
      const expectedTimeSec = orig.startBeat * (60 / DREAMY_ARPEGGIO.bpm);
      expect(Math.abs(ev.startTime - expectedTimeSec)).toBeLessThanOrEqual(0.001);
    }
  });

  it('fails loudly when a note lies outside the effective scale and never silently snaps', () => {
    const invalidSong: ExampleSong = {
      id: 'invalid-test',
      title: 'Invalid Scale Test',
      credit: 'Test',
      licenseNote: 'Test',
      bpm: 100,
      bars: 2,
      root: 0, // C
      scale: 'major pentatonic', // C D E G A
      tracks: [
        {
          colorId: 'track-1',
          instrumentId: 'marimba',
          mode: 'flow',
          notes: [
            { midi: 60, startBeat: 0, durBeats: 1 }, // C4 (valid)
            { midi: 61, startBeat: 1, durBeats: 1 }, // C#4 (INVALID for C major pentatonic!)
          ],
        },
      ],
    };

    expect(() => convertNotesToStrokes(invalidSong)).toThrowError(/outside effective scale/);
  });
});
