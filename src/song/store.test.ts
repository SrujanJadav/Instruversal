import { describe, it, expect, beforeEach } from 'vitest';
import { MemorySongStore } from './store';
import { createSongFromCreation } from './helpers';
import { Creation } from '../library/types';
import { SONG_LIMITS } from './types';

describe('Song Store (src/song/store.ts)', () => {
  let store: MemorySongStore;

  const sampleCreation: Creation = {
    id: 'c-test-1',
    title: 'Morning Dew',
    createdAt: 1000,
    updatedAt: 2000,
    schemaVersion: 3,
    project: {
      version: 3,
      bpm: 90,
      bars: 2,
      rootNote: 0,
      scaleName: 'major pentatonic',
      playbackMode: 'flow',
      glide: 30,
      tracks: [],
      strokes: [],
    },
  };

  beforeEach(() => {
    store = new MemorySongStore();
  });

  it('saves and retrieves songs', async () => {
    const song = createSongFromCreation(sampleCreation);
    await store.save(song);

    const retrieved = await store.get(song.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(song.id);
    expect(retrieved?.title).toBe(song.title);
  });

  it('lists song metadata sorted by updatedAt descending', async () => {
    const song1 = createSongFromCreation(sampleCreation);
    song1.id = 's-1';
    song1.updatedAt = 1000;

    const song2 = createSongFromCreation(sampleCreation);
    song2.id = 's-2';
    song2.updatedAt = 5000;

    await store.save(song1);
    await store.save(song2);

    const list = await store.list();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe('s-2');
    expect(list[1].id).toBe('s-1');
  });

  it('removes songs', async () => {
    const song = createSongFromCreation(sampleCreation);
    await store.save(song);

    await store.remove(song.id);
    const retrieved = await store.get(song.id);
    expect(retrieved).toBeNull();
  });

  it('enforces capacity limit and evicts oldest song when exceeding 30 songs', async () => {
    // Fill with 30 songs
    for (let i = 0; i < SONG_LIMITS.MAX_LOCAL_SONGS; i++) {
      const s = createSongFromCreation(sampleCreation);
      s.id = `song-${i}`;
      s.updatedAt = 1000 + i * 10;
      await store.save(s);
    }

    const listBefore = await store.list();
    expect(listBefore.length).toBe(30);

    // Add 31st song
    const extraSong = createSongFromCreation(sampleCreation);
    extraSong.id = 'song-extra';
    extraSong.updatedAt = 99999;
    await store.save(extraSong);

    const listAfter = await store.list();
    expect(listAfter.length).toBe(30);
    // Oldest song (song-0 with updatedAt 1000) should be gone
    expect(listAfter.some((s) => s.id === 'song-0')).toBe(false);
    expect(listAfter.some((s) => s.id === 'song-extra')).toBe(true);
  });
});
