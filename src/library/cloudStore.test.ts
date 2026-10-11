import { describe, it, expect, beforeEach } from 'vitest';
import { CloudStore } from './cloudStore';
import { MemoryCreationStore } from './store';
import { Creation } from './types';

describe('CloudStore', () => {
  let mockLocal: MemoryCreationStore;
  let cloudStore: CloudStore;

  beforeEach(() => {
    mockLocal = new MemoryCreationStore();
    cloudStore = new CloudStore(mockLocal as any);
  });

  it('delegates locally when signed out and returns syncStatus: "local"', async () => {
    const creation: Creation = {
      id: 'test-c1',
      title: 'Local Melody',
      createdAt: 1000,
      updatedAt: 1000,
      schemaVersion: 1,
      project: {
        version: 1,
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

    await cloudStore.save(creation);
    const retrieved = await cloudStore.get('test-c1');
    expect(retrieved?.title).toBe('Local Melody');

    const list = await cloudStore.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('test-c1');
    expect(list[0].syncStatus).toBe('local');
  });

  it('removes item locally and cleans tracking', async () => {
    const creation: Creation = {
      id: 'test-c2',
      title: 'To Delete',
      createdAt: 1000,
      updatedAt: 1000,
      schemaVersion: 1,
      project: {
        version: 1,
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

    await cloudStore.save(creation);
    await cloudStore.remove('test-c2');
    const retrieved = await cloudStore.get('test-c2');
    expect(retrieved).toBeNull();
  });
});
