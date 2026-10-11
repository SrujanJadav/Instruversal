import { describe, it, expect, beforeEach } from 'vitest';
import { getCreationManager } from './manager';
import { MemoryCreationStore } from './store';
import { state } from '../state';

describe('CreationManager flushSave', () => {
  let memoryStore: MemoryCreationStore;

  beforeEach(() => {
    memoryStore = new MemoryCreationStore();
    state.strokes = [];
    state.bpm = 100;
  });

  it('immediately flushes save and persists project to store', async () => {
    const manager = getCreationManager(memoryStore);
    await manager.init();

    manager.setTitle('Fresh Sketch');
    const success = await manager.flushSave();
    expect(success).toBe(true);

    const list = await memoryStore.list();
    expect(list.length).toBe(1);
    expect(list[0].title).toBe('Fresh Sketch');
    expect(list[0].id).toBe(manager.getCurrentId());
  });

  it('updates updatedAt so flushed creation appears first in recent list', async () => {
    const manager = getCreationManager(memoryStore);
    await manager.init();

    // Create an earlier item in store
    await memoryStore.save({
      id: 'old-1',
      title: 'Older creation',
      createdAt: 1000,
      updatedAt: 1000,
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
    });

    manager.setTitle('Latest Work');
    await manager.flushSave();

    const list = await memoryStore.list();
    expect(list.length).toBe(2);
    // The most recently flushed creation must be first
    expect(list[0].title).toBe('Latest Work');
  });
});
