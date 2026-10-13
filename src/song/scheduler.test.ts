import { describe, it, expect } from 'vitest';
import {
  computePlacementGainMultiplier,
  buildPlacementEvents,
  buildSongSchedule,
  getEventsInWindow,
} from './scheduler';
import { Song, SongPlacement, SongAsset, SongLane } from './types';
import { hasPlacementOverlap, findFreeSlot } from './helpers';
import { ProjectData } from '../library/types';
import { Stroke } from '../state';

describe('Song Scheduler (pure arrangement event compiler)', () => {
  const sampleStroke: Stroke = {
    id: 's-note-1',
    trackId: 'track-1',
    points: [
      { x: 0.25, y: 0.5, t: 0 },
      { x: 0.75, y: 0.5, t: 200 },
    ],
    width: 3,
  };

  const sampleProject: ProjectData = {
    version: 3,
    bpm: 120,
    bars: 2,
    rootNote: 0,
    scaleName: 'major pentatonic',
    playbackMode: 'notes',
    glide: 0,
    tracks: [
      {
        id: 'track-1',
        name: 'Vermilion',
        trackType: 'melodic',
        instrumentId: 'marimba',
        kitId: '808',
        volume: 0.8,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'shaker',
      },
      {
        id: 'track-beat',
        name: 'Drums',
        trackType: 'beat',
        instrumentId: 'pluck',
        kitId: '808',
        volume: 0.8,
        muted: false,
        solo: false,
        beatRate: '1/16',
        swing: 0,
        humanize: 0,
        beatMode: 'hits',
        beatFlowStyle: 'glide',
        beatRollVoice: 'snare',
        beatSweepCharacter: 'shaker',
      },
    ],
    strokes: [
      sampleStroke,
      {
        id: 'beat-1',
        trackId: 'track-beat',
        points: [{ x: 0.5, y: 0.1, t: 0 }],
        width: 4,
      },
    ],
  };

  const sampleAsset: SongAsset = {
    name: 'Sample Sketch',
    project: sampleProject,
  };

  const samplePlacement: SongPlacement = {
    id: 'p-1',
    assetId: 'asset-1',
    laneId: 'lane-1',
    startBar: 4,
    lengthBars: 4,
    offsetBars: 0,
    gainDb: 0,
    transpose: 0,
    fadeInBars: 0,
    fadeOutBars: 0,
    mute: false,
  };

  const sampleLane1: SongLane = {
    id: 'lane-1',
    name: 'Lane 1',
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    sendReverb: 0,
    sendDelay: 0,
  };

  const sampleLane2: SongLane = {
    id: 'lane-2',
    name: 'Lane 2',
    volumeDb: 0,
    pan: 0,
    mute: false,
    solo: false,
    sendReverb: 0,
    sendDelay: 0,
  };

  it('computes placement gain multiplier with gainDb and fade curves', () => {
    // 0 dB, no fades
    expect(computePlacementGainMultiplier(1, 4, 0, 0, 0)).toBe(1.0);

    // +6 dB (approx 2x multiplier)
    const gain6Db = computePlacementGainMultiplier(1, 4, 6, 0, 0);
    expect(gain6Db).toBeGreaterThan(1.9);
    expect(gain6Db).toBeLessThan(2.1);

    // Fade in 2 bars: at bar 1, fade is 0.5
    const fadeInHalf = computePlacementGainMultiplier(1, 4, 0, 2, 0);
    expect(fadeInHalf).toBeCloseTo(0.5, 2);

    // Fade out 1 bar: at bar 3.5 of 4, fade is 0.5
    const fadeOutHalf = computePlacementGainMultiplier(3.5, 4, 0, 0, 1);
    expect(fadeOutHalf).toBeCloseTo(0.5, 2);
  });

  it('repeats a 2-bar asset across a 4-bar placement', () => {
    const events = buildPlacementEvents(samplePlacement, sampleAsset, 120);
    expect(events.length).toBeGreaterThan(0);

    // All events must fall within startBar 4 and endBar 8
    for (const ev of events) {
      const bar = ev.kind === 'flow' || ev.kind === 'beatFlow' ? ev.startTimeBars : ev.timeBars;
      expect(bar).toBeGreaterThanOrEqual(4);
      expect(bar).toBeLessThan(8);
    }

    // Check repeat: should have events in bars [4, 6) AND [6, 8)
    const bar4To6 = events.filter((e) => {
      const b = e.kind === 'flow' || e.kind === 'beatFlow' ? e.startTimeBars : e.timeBars;
      return b >= 4 && b < 6;
    });
    const bar6To8 = events.filter((e) => {
      const b = e.kind === 'flow' || e.kind === 'beatFlow' ? e.startTimeBars : e.timeBars;
      return b >= 6 && b < 8;
    });

    expect(bar4To6.length).toBeGreaterThan(0);
    expect(bar6To8.length).toBeGreaterThan(0);
  });

  it('shifts loop phase when offsetBars is set', () => {
    const offsetPlacement: SongPlacement = {
      ...samplePlacement,
      startBar: 0,
      lengthBars: 2,
      offsetBars: 1, // Skip bar 0 of asset, start with bar 1
    };

    const events = buildPlacementEvents(offsetPlacement, sampleAsset, 120);
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      const bar = ev.kind === 'flow' || ev.kind === 'beatFlow' ? ev.startTimeBars : ev.timeBars;
      expect(bar).toBeGreaterThanOrEqual(0);
      expect(bar).toBeLessThan(2);
    }
  });

  it('applies melodic transpose without transposing drum kit sounds', () => {
    const normalEvents = buildPlacementEvents(samplePlacement, sampleAsset, 120);
    const transposedPlacement: SongPlacement = {
      ...samplePlacement,
      transpose: 3, // +3 semitones
    };
    const transposedEvents = buildPlacementEvents(transposedPlacement, sampleAsset, 120);

    const normalNote = normalEvents.find((e) => e.kind === 'note')!;
    const transNote = transposedEvents.find((e) => e.kind === 'note')!;
    expect(transNote.midi).toBe(normalNote.midi + 3);

    // Drum hit soundId must be identical
    const normalBeat = normalEvents.find((e) => e.kind === 'beatHit')!;
    const transBeat = transposedEvents.find((e) => e.kind === 'beatHit')!;
    expect(transBeat.soundId).toBe(normalBeat.soundId);
  });

  it('returns empty events when placement or lane is muted', () => {
    const mutedPlacement: SongPlacement = { ...samplePlacement, mute: true };
    const ev1 = buildPlacementEvents(mutedPlacement, sampleAsset, 120);
    expect(ev1).toEqual([]);

    const ev2 = buildPlacementEvents(samplePlacement, sampleAsset, 120, { isLaneMuted: true });
    expect(ev2).toEqual([]);

    const ev3 = buildPlacementEvents(samplePlacement, sampleAsset, 120, { isLaneActiveSolo: false });
    expect(ev3).toEqual([]);
  });

  it('compiles full song schedule with window lookup', () => {
    const song: Song = {
      id: 'song-test',
      title: 'Test Song',
      bpm: 120,
      beatsPerBar: 4,
      totalBars: 16,
      schemaVersion: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lanes: [sampleLane1, sampleLane2],
      assets: { 'asset-1': sampleAsset },
      placements: [
        samplePlacement,
        {
          ...samplePlacement,
          id: 'p-2',
          laneId: 'lane-2',
          startBar: 8,
          lengthBars: 4,
        },
      ],
      markers: [],
      loopRegion: null,
      master: {
        preset: 'clean',
        gainDb: 0,
        eq: { lowDb: 0, midDb: 0, highDb: 0 },
        compressor: { on: false, thresholdDb: -20, ratio: 4, attackMs: 10, releaseMs: 100, makeupDb: 0 },
        effects: {} as any,
      },
    };

    const schedule = buildSongSchedule(song);
    expect(schedule.events.length).toBeGreaterThan(0);
    expect(schedule.eventsByPlacement.has('p-1')).toBe(true);
    expect(schedule.eventsByPlacement.has('p-2')).toBe(true);

    // Window lookup [0, 4) should be empty
    const window0to4 = getEventsInWindow(schedule, 0, 4);
    expect(window0to4.length).toBe(0);

    // Window lookup [4, 8) should contain events from placement 1
    const window4to8 = getEventsInWindow(schedule, 4, 8);
    expect(window4to8.length).toBeGreaterThan(0);
    expect(window4to8.every((e) => e.placementId === 'p-1')).toBe(true);

    // Window lookup [8, 12) should contain events from placement 2
    const window8to12 = getEventsInWindow(schedule, 8, 12);
    expect(window8to12.length).toBeGreaterThan(0);
    expect(window8to12.every((e) => e.placementId === 'p-2')).toBe(true);
  });

  it('regression: two placements on one lane that touch have zero overlap and play independently', () => {
    const p1: SongPlacement = {
      id: 'p-touch-1',
      assetId: 'asset-1',
      laneId: 'lane-1',
      startBar: 0,
      lengthBars: 2,
      offsetBars: 0,
      gainDb: 0,
      transpose: 0,
      fadeInBars: 0,
      fadeOutBars: 0,
      mute: false,
    };
    const p2: SongPlacement = {
      ...p1,
      id: 'p-touch-2',
      startBar: 2,
      lengthBars: 2,
    };

    // Touching at bar 2 has zero overlap
    expect(hasPlacementOverlap([p1], p2)).toBe(false);

    const asset: SongAsset = { name: 'Sketch', project: sampleProject };
    const events1 = buildPlacementEvents(p1, asset, 120);
    const events2 = buildPlacementEvents(p2, asset, 120);

    expect(events1.every((e) => (e.kind === 'flow' || e.kind === 'beatFlow' ? e.startTimeBars : e.timeBars) < 2)).toBe(true);
    expect(events2.every((e) => (e.kind === 'flow' || e.kind === 'beatFlow' ? e.startTimeBars : e.timeBars) >= 2)).toBe(true);
  });

  it('regression: two overlapping requests move the second to a free slot without silent collision', () => {
    const existing: SongPlacement[] = [
      {
        id: 'p-exist-1',
        assetId: 'asset-1',
        laneId: 'lane-1',
        startBar: 0,
        lengthBars: 2,
        offsetBars: 0,
        gainDb: 0,
        transpose: 0,
        fadeInBars: 0,
        fadeOutBars: 0,
        mute: false,
      },
    ];

    // Requesting at bar 0 for length 2 collides with p-exist-1
    const requested = { id: 'p-new', laneId: 'lane-1', startBar: 0, lengthBars: 2 };
    expect(hasPlacementOverlap(existing, requested)).toBe(true);

    // findFreeSlot resolves to bar 2
    const freeBar = findFreeSlot(existing, 'lane-1', 0, 2);
    expect(freeBar).toBe(2);
    expect(hasPlacementOverlap(existing, { ...requested, startBar: freeBar })).toBe(false);
  });

  it('regression: a placement that ends mid-loop schedules no notes after its end', () => {
    // 4-bar project with notes at bars 0.5, 1.5, 2.5, 3.5
    const fourBarProject: ProjectData = {
      ...sampleProject,
      bars: 4,
      strokes: [
        {
          id: 's-early',
          trackId: 'track-1',
          points: [{ x: 0.125, y: 0.5, t: 0 }], // bar 0.5
          width: 3,
        },
        {
          id: 's-late',
          trackId: 'track-1',
          points: [{ x: 0.875, y: 0.5, t: 0 }], // bar 3.5
          width: 3,
        },
      ],
    };

    const midLoopPlacement: SongPlacement = {
      id: 'p-mid-loop',
      assetId: 'asset-4bar',
      laneId: 'lane-1',
      startBar: 0,
      lengthBars: 2, // Cut off at 2 bars (before s-late at 3.5)
      offsetBars: 0,
      gainDb: 0,
      transpose: 0,
      fadeInBars: 0,
      fadeOutBars: 0,
      mute: false,
    };

    const asset: SongAsset = { name: '4-bar Loop', project: fourBarProject };
    const events = buildPlacementEvents(midLoopPlacement, asset, 120);

    // Only notes before bar 2 should be scheduled; s-late (at 3.5) must be excluded
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((e) => (e.kind === 'flow' || e.kind === 'beatFlow' ? e.startTimeBars : e.timeBars) < 2)).toBe(true);
    expect(events.some((e) => e.strokeId === 's-late')).toBe(false);
  });
});
