import { describe, it, expect, beforeEach } from 'vitest';
import { state, pushHistorySnapshot, undo, redo, clearStrokes, canUndo, canRedo, Stroke } from './state';

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
});
