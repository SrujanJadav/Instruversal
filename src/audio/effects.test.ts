import { describe, it, expect } from 'vitest';
import { FX_PRESETS } from './effects';
import { DEFAULT_FX_CONFIG } from '../state';

describe('MasterEffectsRack Presets and Config', () => {
  it('defines all 4 required presets: Clean, Dreamy, Space, Gritty', () => {
    expect(FX_PRESETS).toHaveProperty('Clean');
    expect(FX_PRESETS).toHaveProperty('Dreamy');
    expect(FX_PRESETS).toHaveProperty('Space');
    expect(FX_PRESETS).toHaveProperty('Gritty');
  });

  it('Clean preset leaves only reverb active and others bypassed', () => {
    const clean = FX_PRESETS['Clean'];
    expect(clean.reverb.bypassed).toBe(false);
    expect(clean.reverb.amount).toBeGreaterThan(0);

    expect(clean.delay.bypassed).toBe(true);
    expect(clean.chorus.bypassed).toBe(true);
    expect(clean.phaser.bypassed).toBe(true);
    expect(clean.tremolo.bypassed).toBe(true);
    expect(clean.autoFilter.bypassed).toBe(true);
    expect(clean.drive.bypassed).toBe(true);
  });

  it('Dreamy preset activates reverb + chorus + delay', () => {
    const dreamy = FX_PRESETS['Dreamy'];
    expect(dreamy.reverb.bypassed).toBe(false);
    expect(dreamy.chorus.bypassed).toBe(false);
    expect(dreamy.delay.bypassed).toBe(false);
    expect(dreamy.reverb.amount).toBeGreaterThan(0);
    expect(dreamy.chorus.amount).toBeGreaterThan(0);
    expect(dreamy.delay.amount).toBeGreaterThan(0);
  });

  it('Space preset activates large reverb + delay + phaser', () => {
    const space = FX_PRESETS['Space'];
    expect(space.reverb.bypassed).toBe(false);
    expect(space.reverb.size).toBeGreaterThanOrEqual(4);
    expect(space.delay.bypassed).toBe(false);
    expect(space.phaser.bypassed).toBe(false);
  });

  it('Gritty preset activates drive + filter + tremolo', () => {
    const gritty = FX_PRESETS['Gritty'];
    expect(gritty.drive.bypassed).toBe(false);
    expect(gritty.drive.amount).toBeGreaterThan(50);
    expect(gritty.autoFilter.bypassed).toBe(false);
    expect(gritty.tremolo.bypassed).toBe(false);
  });

  it('Default FX config provides safe initial values', () => {
    expect(DEFAULT_FX_CONFIG.reverb.amount).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_FX_CONFIG.drive.tone).toBeGreaterThanOrEqual(1500);
    expect(DEFAULT_FX_CONFIG.drive.tone).toBeLessThanOrEqual(8000);
  });
});
