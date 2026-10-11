import { describe, it, expect } from 'vitest';
import { DEFAULT_TRACK_CONFIGS, shouldTrackPlay } from './tracks';
import { INSTRUMENT_METAS, INSTRUMENTS_MAP } from './instruments';

describe('Instruments & Tracks module', () => {
  it('registers all 7 required instruments', () => {
    expect(INSTRUMENT_METAS.length).toBe(7);
    const expectedIds = ['pluck', 'bell', 'marimba', 'soft-pad', 'warm-keys', 'kalimba', 'sub-bass'];
    for (const id of expectedIds) {
      expect(INSTRUMENTS_MAP[id]).toBeDefined();
    }
  });

  it('defines 6 default gouache pigment tracks', () => {
    expect(DEFAULT_TRACK_CONFIGS.length).toBe(6);
    expect(DEFAULT_TRACK_CONFIGS.map((t) => t.colorVar)).toEqual([
      '--vermilion',
      '--indigo',
      '--ochre',
      '--sage',
      '--plum',
      '--slate',
    ]);
  });

  it('handles mute and solo logic accurately', () => {
    // Both unmuted, no track soloed -> both should play
    expect(shouldTrackPlay(false, false, false)).toBe(true);

    // Muted track with no solo active -> should not play
    expect(shouldTrackPlay(true, false, false)).toBe(false);

    // When solo is active in the project (hasAnySolo = true):
    // Non-solo track should NOT play, even if not muted
    expect(shouldTrackPlay(false, false, true)).toBe(false);

    // Solo track SHOULD play
    expect(shouldTrackPlay(false, true, true)).toBe(true);

    // Solo track should play even if it had mute set
    expect(shouldTrackPlay(true, true, true)).toBe(true);
  });
});
