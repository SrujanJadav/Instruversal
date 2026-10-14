import { describe, it, expect } from 'vitest';
import { SHAPE_OF_ME } from './shapeOfMe';
import { convertNotesToStrokes } from './notesToStrokes';
import { buildScaleNotes } from '../audio/scales';
import { generateEventsFromStrokes } from '../audio/schedule';
import { generateBeatEventsFromStrokes } from '../audio/beatSchedule';

describe('Shape of Me preset verification', () => {
  it('has correct project metadata, tempo, scale and playback mode', () => {
    expect(SHAPE_OF_ME.id).toBe('example-shape-of-me');
    expect(SHAPE_OF_ME.title).toBe('Shape of Me');
    expect(SHAPE_OF_ME.credit).toBe('Ed Sheeran (Cover)');
    expect(SHAPE_OF_ME.bpm).toBe(96);
    expect(SHAPE_OF_ME.bars).toBe(2);
    expect(SHAPE_OF_ME.root).toBe(1); // C# / Db
    expect(SHAPE_OF_ME.scale).toBe('natural minor');
    expect(SHAPE_OF_ME.playbackMode).toBe('notes');
  });

  it('converts to strokes with exact note-for-note and drum lane resolution', () => {
    const { strokes, project } = convertNotesToStrokes(SHAPE_OF_ME);
    expect(project.bpm).toBe(96);
    expect(project.bars).toBe(2);
    expect(project.rootNote).toBe(1);
    expect(project.scaleName).toBe('natural minor');
    expect(project.playbackMode).toBe('notes');

    // Total strokes: 12 lead + 12 bass + 20 drum hits = 44 strokes
    expect(strokes.length).toBe(44);

    const scaleNotes = buildScaleNotes(project.rootNote, project.scaleName, 3, 6);

    // 1. Verify Track 1 (Lead Marimba)
    const track1Strokes = strokes.filter((s) => s.trackId === 'track-1');
    expect(track1Strokes.length).toBe(12);

    const stepEvents = generateEventsFromStrokes(track1Strokes, project.bars, scaleNotes);
    expect(stepEvents.length).toBe(12);

    const expectedLead = [
      { step: 0, midi: 61 },  // C#4
      { step: 3, midi: 64 },  // E4
      { step: 6, midi: 61 },  // C#4
      { step: 8, midi: 61 },  // C#4
      { step: 11, midi: 64 }, // E4
      { step: 14, midi: 61 }, // C#4
      { step: 16, midi: 61 }, // C#4
      { step: 19, midi: 64 }, // E4
      { step: 22, midi: 61 }, // C#4
      { step: 24, midi: 63 }, // D#4
      { step: 27, midi: 61 }, // C#4
      { step: 30, midi: 59 }, // B3
    ];

    expectedLead.forEach((expected, i) => {
      const ev = stepEvents[i];
      expect(ev.midi).toBe(expected.midi);
      const [bar, beat, sixteenth] = (ev.time as string).split(':').map(Number);
      const stepIdx = bar * 16 + beat * 4 + sixteenth;
      expect(stepIdx).toBe(expected.step);
    });

    // 2. Verify Track 2 (Sub Bass)
    const track2Strokes = strokes.filter((s) => s.trackId === 'track-2');
    expect(track2Strokes.length).toBe(12);

    const bassEvents = generateEventsFromStrokes(track2Strokes, project.bars, scaleNotes);
    expect(bassEvents.length).toBe(12);

    const expectedBass = [
      { step: 0, midi: 49 },  // C#3
      { step: 3, midi: 49 },  // C#3
      { step: 6, midi: 49 },  // C#3
      { step: 8, midi: 54 },  // F#3
      { step: 11, midi: 54 }, // F#3
      { step: 14, midi: 54 }, // F#3
      { step: 16, midi: 57 }, // A3
      { step: 19, midi: 57 }, // A3
      { step: 22, midi: 57 }, // A3
      { step: 24, midi: 59 }, // B3
      { step: 27, midi: 59 }, // B3
      { step: 30, midi: 59 }, // B3
    ];

    expectedBass.forEach((expected, i) => {
      const ev = bassEvents[i];
      expect(ev.midi).toBe(expected.midi);
      const [bar, beat, sixteenth] = (ev.time as string).split(':').map(Number);
      const stepIdx = bar * 16 + beat * 4 + sixteenth;
      expect(stepIdx).toBe(expected.step);
    });

    // 3. Verify Track 3 (Beat Track)
    const track3Strokes = strokes.filter((s) => s.trackId === 'track-3');
    expect(track3Strokes.length).toBe(20);

    const beatEvents = generateBeatEventsFromStrokes(track3Strokes, {
      bpm: project.bpm,
      bars: project.bars,
      humanize: 0,
      swing: 0,
    });
    expect(beatEvents.length).toBe(20);

    // Kicks
    const kickHits = beatEvents.filter((h) => h.soundId === 'kick');
    expect(kickHits.length).toBe(4);
    const kickSteps = kickHits.map((h) => Math.round(h.normX * 32)).sort((a, b) => a - b);
    expect(kickSteps).toEqual([0, 8, 16, 24]);

    // Claps
    const clapHits = beatEvents.filter((h) => h.soundId === 'clap');
    expect(clapHits.length).toBe(8);
    const clapSteps = clapHits.map((h) => Math.round(h.normX * 32)).sort((a, b) => a - b);
    expect(clapSteps).toEqual([3, 6, 11, 14, 19, 22, 27, 30]);

    // Closed Hats
    const hatHits = beatEvents.filter((h) => h.soundId === 'closed-hat');
    expect(hatHits.length).toBe(8);
    const hatSteps = hatHits.map((h) => Math.round(h.normX * 32)).sort((a, b) => a - b);
    expect(hatSteps).toEqual([2, 4, 10, 12, 18, 20, 26, 28]);
  });
});
