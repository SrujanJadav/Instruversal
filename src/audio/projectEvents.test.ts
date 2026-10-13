import { describe, it, expect } from 'vitest';
import { buildProjectEvents } from './projectEvents';
import { ProjectData } from '../library/types';
import { Stroke } from '../state';

describe('buildProjectEvents (pure event generator)', () => {
  const sampleTrackMelodic = {
    id: 'track-1',
    name: 'Vermilion Lead',
    trackType: 'melodic' as const,
    instrumentId: 'pluck',
    kitId: '808' as const,
    volume: 0.8,
    muted: false,
    solo: false,
    beatRate: '1/16' as const,
    swing: 0,
    humanize: 0,
    beatMode: 'hits' as const,
    beatFlowStyle: 'glide' as const,
    beatRollVoice: 'snare' as const,
    beatSweepCharacter: 'shaker' as const,
  };

  const sampleTrackBeat = {
    id: 'track-beat',
    name: 'Drum Kit',
    trackType: 'beat' as const,
    instrumentId: 'pluck',
    kitId: '808' as const,
    volume: 0.8,
    muted: false,
    solo: false,
    beatRate: '1/16' as const,
    swing: 0,
    humanize: 0,
    beatMode: 'hits' as const,
    beatFlowStyle: 'glide' as const,
    beatRollVoice: 'snare' as const,
    beatSweepCharacter: 'shaker' as const,
  };

  const sampleStroke: Stroke = {
    id: 's-1',
    trackId: 'track-1',
    points: [
      { x: 0.2, y: 0.5, t: 0 },
      { x: 0.4, y: 0.5, t: 100 },
    ],
    width: 3,
  };

  const baseProject: ProjectData = {
    version: 3,
    bpm: 100,
    bars: 2,
    rootNote: 0,
    scaleName: 'major pentatonic',
    playbackMode: 'notes',
    glide: 0,
    tracks: [sampleTrackMelodic, sampleTrackBeat],
    strokes: [sampleStroke],
  };

  it('returns empty event collections when no strokes exist', () => {
    const emptyProj: ProjectData = { ...baseProject, strokes: [] };
    const result = buildProjectEvents(emptyProj);
    expect(result.bars).toBe(2);
    expect(result.bpm).toBe(100);
    expect(result.noteEvents).toEqual([]);
    expect(result.flowEvents).toEqual([]);
    expect(result.beatHitEvents).toEqual([]);
    expect(result.beatFlowEvents).toEqual([]);
  });

  it('builds discrete NoteEvents in notes mode', () => {
    const result = buildProjectEvents({ ...baseProject, playbackMode: 'notes' });
    expect(result.noteEvents.length).toBeGreaterThan(0);
    expect(result.flowEvents.length).toBe(0);
    expect(result.noteEvents[0].trackId).toBe('track-1');
    expect(result.noteEvents[0].duration).toBe('16n');
    expect(typeof result.noteEvents[0].midi).toBe('number');
  });

  it('builds FlowStrokeEvents in flow mode', () => {
    const result = buildProjectEvents({ ...baseProject, playbackMode: 'flow' });
    expect(result.flowEvents.length).toBeGreaterThan(0);
    expect(result.noteEvents.length).toBe(0);
    expect(result.flowEvents[0].strokeId).toBe('s-1');
    expect(result.flowEvents[0].trackId).toBe('track-1');
    expect(typeof result.flowEvents[0].initialFreq).toBe('number');
  });

  it('respects perColour keyMode for individual tracks', () => {
    const projectWithPerColour: ProjectData = {
      ...baseProject,
      keyMode: 'perColour',
      tracks: [
        {
          ...sampleTrackMelodic,
          key: { root: 9, scale: 'minor pentatonic' },
        },
      ],
      strokes: [sampleStroke],
    };

    const res = buildProjectEvents(projectWithPerColour, { playbackMode: 'notes' });
    expect(res.noteEvents.length).toBeGreaterThan(0);
  });

  it('generates drum hits for beat tracks', () => {
    const beatStroke: Stroke = {
      id: 'beat-s-1',
      trackId: 'track-beat',
      points: [{ x: 0.25, y: 0.1, t: 0 }], // near top = kick/snare
      width: 4,
    };

    const projectWithBeat: ProjectData = {
      ...baseProject,
      strokes: [beatStroke],
    };

    const res = buildProjectEvents(projectWithBeat);
    expect(res.beatHitEvents.length).toBeGreaterThan(0);
    expect(res.beatHitEvents[0].trackId).toBe('track-beat');
  });

  it('generates drum flow events for beat tracks in flow mode', () => {
    const beatFlowTrack = {
      ...sampleTrackBeat,
      beatMode: 'flow' as const,
      beatFlowStyle: 'roll' as const,
    };
    const beatStroke: Stroke = {
      id: 'beat-flow-1',
      trackId: 'track-beat',
      points: [
        { x: 0.1, y: 0.3, t: 0 },
        { x: 0.5, y: 0.3, t: 200 },
      ],
      width: 4,
    };

    const projectWithBeatFlow: ProjectData = {
      ...baseProject,
      tracks: [beatFlowTrack],
      strokes: [beatStroke],
    };

    const res = buildProjectEvents(projectWithBeatFlow);
    expect(res.beatFlowEvents.length).toBeGreaterThan(0);
    expect(res.beatFlowEvents[0].style).toBe('roll');
  });

  it('thins flow events when polyphonyCap is provided and exceeded', () => {
    // Multiple overlapping strokes
    const strokes: Stroke[] = [];
    for (let i = 0; i < 10; i++) {
      strokes.push({
        id: `multi-${i}`,
        trackId: 'track-1',
        points: [
          { x: 0.1, y: 0.1 * i, t: 0 },
          { x: 0.9, y: 0.1 * i, t: 500 },
        ],
        width: 3,
      });
    }

    const res = buildProjectEvents(
      { ...baseProject, strokes, playbackMode: 'flow' },
      { polyphonyCap: 4 }
    );
    expect(res.flowEvents.length).toBeLessThanOrEqual(4);
  });
});
