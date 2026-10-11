import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCreationStore } from './store';
import { Creation } from './types';

describe('MemoryCreationStore', () => {
  let store: MemoryCreationStore;

  beforeEach(() => {
    store = new MemoryCreationStore();
  });

  it('saves and retrieves a creation', async () => {
    const c: Creation = {
      id: 'test-1',
      title: 'First Jam',
      createdAt: 100,
      updatedAt: 100,
      schemaVersion: 1,
      project: {
        version: 1,
        bpm: 95,
        bars: 2,
        rootNote: 0,
        scaleName: 'major pentatonic',
        playbackMode: 'notes',
        glide: 20,
        tracks: [],
        strokes: [],
      },
    };

    await store.save(c);
    const retrieved = await store.get('test-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe('First Jam');
    expect(retrieved?.project.bpm).toBe(95);

    const list = await store.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('test-1');
    expect(list[0].title).toBe('First Jam');
    expect(list[0].bpm).toBe(95);
  });

  it('deletes a creation correctly', async () => {
    const c: Creation = {
      id: 'test-del',
      title: 'To Delete',
      createdAt: 100,
      updatedAt: 100,
      schemaVersion: 1,
      project: {
        version: 1,
        bpm: 90,
        bars: 2,
        rootNote: 0,
        scaleName: 'major pentatonic',
        playbackMode: 'flow',
        glide: 0,
        tracks: [],
        strokes: [],
      },
    };

    await store.save(c);
    expect((await store.list()).length).toBe(1);

    await store.remove('test-del');
    expect((await store.list()).length).toBe(0);
    expect(await store.get('test-del')).toBeNull();
  });

  it('sorts list newest first', async () => {
    await store.save({
      id: 'old',
      title: 'Old',
      createdAt: 10,
      updatedAt: 10,
      schemaVersion: 1,
      project: { version: 1, bpm: 90, bars: 2, rootNote: 0, scaleName: 'major pentatonic', playbackMode: 'flow', glide: 0, tracks: [], strokes: [] },
    });
    await store.save({
      id: 'new',
      title: 'New',
      createdAt: 20,
      updatedAt: 50,
      schemaVersion: 1,
      project: { version: 1, bpm: 90, bars: 2, rootNote: 0, scaleName: 'major pentatonic', playbackMode: 'flow', glide: 0, tracks: [], strokes: [] },
    });

    const list = await store.list();
    expect(list[0].id).toBe('new');
    expect(list[1].id).toBe('old');
  });
});
