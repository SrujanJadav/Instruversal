import { describe, it, expect, beforeEach } from 'vitest';
import {
  state,
  pushHistorySnapshot,
  recordDeltaHistory,
  undo,
  redo,
  clearStrokes,
  canUndo,
  canRedo,
  Stroke,
} from './state';

describe('State & History stack', () => {
  beforeEach(() => {
    state.strokes = [];
    while (canUndo()) {
      undo();
    }
  });

  it('supports undo and redo for stroke modifications', () => {
    const stroke1: Stroke = {
      id: 's1',
      trackId: 'track-1',
      points: [{ x: 0.1, y: 0.1, t: 0 }],
      width: 3,
    };

    // Before stroke 1: snapshot empty
    pushHistorySnapshot();
    state.strokes.push(stroke1);

    expect(state.strokes.length).toBe(1);
    expect(canUndo()).toBe(true);
    expect(canRedo()).toBe(false);

    // Undo: should revert to 0 strokes
    undo();
    expect(state.strokes.length).toBe(0);
    expect(canRedo()).toBe(true);

    // Redo: should restore stroke 1
    redo();
    expect(state.strokes.length).toBe(1);
    expect(state.strokes[0].id).toBe('s1');
  });

  it('supports clearStrokes with full undo restoration', () => {
    state.strokes = [
      { id: 'a', trackId: 'track-1', points: [{ x: 0.2, y: 0.2, t: 0 }], width: 3 },
      { id: 'b', trackId: 'track-2', points: [{ x: 0.4, y: 0.4, t: 0 }], width: 3 },
    ];

    clearStrokes();
    expect(state.strokes.length).toBe(0);
    expect(canUndo()).toBe(true);

    // Undo clear restores both strokes
    undo();
    expect(state.strokes.length).toBe(2);
    expect(state.strokes[0].id).toBe('a');
    expect(state.strokes[1].id).toBe('b');
  });

  it('supports recordDeltaHistory restoring original stroke IDs and order on undo and redo', () => {
    const s1: Stroke = { id: 's1', trackId: 'track-1', points: [{ x: 0.1, y: 0.1, t: 0 }], width: 3 };
    const s2: Stroke = { id: 's2', trackId: 'track-1', points: [{ x: 0.3, y: 0.3, t: 0 }], width: 3 };
    const s3: Stroke = { id: 's3', trackId: 'track-2', points: [{ x: 0.5, y: 0.5, t: 0 }], width: 3 };

    state.strokes = [s1, s2, s3];

    // Simulate s2 cut into frag2A and frag2B
    const frag2A: Stroke = { id: 'f2a', trackId: 'track-1', points: [{ x: 0.25, y: 0.3, t: 0 }], width: 3 };
    const frag2B: Stroke = { id: 'f2b', trackId: 'track-1', points: [{ x: 0.35, y: 0.3, t: 0 }], width: 3 };

    // Replaced s2 at index 1 with frag2A and frag2B
    state.strokes = [s1, frag2A, frag2B, s3];
    recordDeltaHistory(
      [{ index: 1, stroke: s2 }],
      [
        { index: 1, stroke: frag2A },
        { index: 2, stroke: frag2B },
      ]
    );

    expect(state.strokes.length).toBe(4);
    expect(canUndo()).toBe(true);

    // Undo: restores original s2 at index 1 with exact id 's2'
    undo();
    expect(state.strokes.length).toBe(3);
    expect(state.strokes[0].id).toBe('s1');
    expect(state.strokes[1].id).toBe('s2');
    expect(state.strokes[2].id).toBe('s3');

    // Redo: replaces s2 with frag2A and frag2B
    redo();
    expect(state.strokes.length).toBe(4);
    expect(state.strokes[0].id).toBe('s1');
    expect(state.strokes[1].id).toBe('f2a');
    expect(state.strokes[2].id).toBe('f2b');
    expect(state.strokes[3].id).toBe('s3');
  });
});

