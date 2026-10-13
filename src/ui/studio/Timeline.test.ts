import { describe, it, expect } from 'vitest';
import { StudioHistory } from './StudioHistory';
import { createSongFromCreation } from '../../song/helpers';
import { Creation } from '../../library/types';
import { SongPlacement } from '../../song/types';

describe('Studio History & Timeline Interaction Logic (Step 7)', () => {
  const sampleCreation: Creation = {
    id: 'c-test-1',
    title: 'Sunny Day',
    createdAt: 1000,
    updatedAt: 2000,
    schemaVersion: 3,
    project: {
      version: 3,
      bpm: 100,
      bars: 2,
      rootNote: 0,
      scaleName: 'major pentatonic',
      playbackMode: 'flow',
      glide: 30,
      tracks: [],
      strokes: [],
    },
  };

  it('manages per-song undo/redo history correctly', () => {
    const song = createSongFromCreation(sampleCreation);
    const history = new StudioHistory(song);

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // Edit 1: change title
    const song2 = { ...song, title: 'Updated Title' };
    history.pushState(song2);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // Edit 2: add a placement
    const newPlacement: SongPlacement = {
      id: 'p-2',
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
    const song3 = { ...song2, placements: [...song2.placements, newPlacement] };
    history.pushState(song3);

    // Undo edit 2
    const undone1 = history.undo();
    expect(undone1).not.toBeNull();
    expect(undone1?.placements.length).toBe(1);
    expect(undone1?.title).toBe('Updated Title');
    expect(history.canRedo()).toBe(true);

    // Undo edit 1
    const undone2 = history.undo();
    expect(undone2).not.toBeNull();
    expect(undone2?.title).toBe('Sunny Day Song');

    // Redo edit 1
    const redone1 = history.redo();
    expect(redone1).not.toBeNull();
    expect(redone1?.title).toBe('Updated Title');
  });

  it('caps history stack at maximum depth', () => {
    const song = createSongFromCreation(sampleCreation);
    const history = new StudioHistory(song);

    for (let i = 0; i < 60; i++) {
      history.pushState({ ...song, title: `Title ${i}` });
    }

    let undoCount = 0;
    while (history.canUndo()) {
      history.undo();
      undoCount++;
    }

    // Depth is capped at 50
    expect(undoCount).toBe(50);
  });
});
