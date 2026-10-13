import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SongMasterChain } from './masterChain';
import { SongMasterSettings } from './types';

describe('SongMasterChain', () => {
  const sampleSettings: SongMasterSettings = {
    gainDb: -2,
    preset: 'clean',
    eq: { lowDb: 1, midDb: -1, highDb: 2 },
    compressor: {
      on: true,
      thresholdDb: -20,
      ratio: 3,
      attackMs: 25,
      releaseMs: 120,
      makeupDb: 2,
    },
    effects: {} as any,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes master chain nodes without crashing', () => {
    const chain = new SongMasterChain(sampleSettings);
    expect(chain.songBus).toBeDefined();
    expect(chain.reverbSend).toBeDefined();
    expect(chain.delaySend).toBeDefined();
    expect(chain.eq).toBeDefined();
    expect(chain.compressor).toBeDefined();
    expect(chain.masterGain).toBeDefined();

    chain.dispose();
  });

  it('updates settings cleanly and retrieves meter level', () => {
    const chain = new SongMasterChain(sampleSettings);

    chain.updateSettings({
      ...sampleSettings,
      gainDb: 0,
      eq: { lowDb: 0, midDb: 0, highDb: 0 },
      compressor: { ...sampleSettings.compressor, on: false },
    });

    const level = chain.getMeterLevel();
    expect(level).toBeDefined();
    expect(typeof level.peakDb).toBe('number');
    expect(typeof level.rmsDb).toBe('number');

    chain.dispose();
  });
});
