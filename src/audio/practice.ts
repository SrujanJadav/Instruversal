import * as Tone from 'tone';
import { state, events } from '../state';
import { getMasterEffectsRack } from './effects';
import { getTrackManager } from './tracks';
import { effectiveKey } from './scales';

export const PRACTICE_STORAGE_KEY = 'instruversal:practice';

export interface PracticeSettings {
  droneEnabled: boolean;
  droneVolume: number; // 0..1, default 0.6
  droneFollows: 'selected' | 'base'; // 'selected' | 'base'
  metronomeEnabled: boolean;
  metronomeVolume: number; // 0..1, default 0.7
  countInEnabled: boolean; // default false
  includeMetronomeInExport: boolean; // default false
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  droneEnabled: false,
  droneVolume: 0.6,
  droneFollows: 'selected',
  metronomeEnabled: false,
  metronomeVolume: 0.7,
  countInEnabled: false,
  includeMetronomeInExport: false,
};

/**
 * Pure helper: Computes root and perfect fifth frequencies in octave 3
 * for a given root note (0 = C, 1 = C#, ..., 11 = B).
 */
export function computeDroneFrequencies(rootNote: number): { rootFreq: number; fifthFreq: number } {
  const clampedRoot = ((Math.round(rootNote) % 12) + 12) % 12;
  const rootMidi = 48 + clampedRoot; // C3 is 48
  const fifthMidi = rootMidi + 7; // Perfect 5th is 7 semitones higher
  const rootFreq = 440 * Math.pow(2, (rootMidi - 69) / 12);
  const fifthFreq = 440 * Math.pow(2, (fifthMidi - 69) / 12);
  return { rootFreq, fifthFreq };
}

/**
 * Pure helper: Returns pitch, duration, and velocity for metronome clicks.
 * Beat 0 is the accented downbeat of the bar.
 */
export function getMetronomeClickProperties(beatInBar: number): {
  freq: number;
  duration: number;
  velocity: number;
  isAccent: boolean;
} {
  const isAccent = (beatInBar % 4) === 0;
  return {
    freq: isAccent ? 1400 : 880,
    duration: isAccent ? 0.03 : 0.02,
    velocity: isAccent ? 0.95 : 0.6,
    isAccent,
  };
}

/**
 * Pure helper: Calculates count-in bar duration in seconds.
 */
export function calculateCountInDuration(bpm: number, beats: number = 4): number {
  const safeBpm = Math.max(30, Math.min(240, bpm || 90));
  return beats * (60 / safeBpm);
}

/**
 * Loads practice settings from localStorage with the instruversal: prefix.
 */
export function loadPracticeSettings(): PracticeSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_PRACTICE_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(PRACTICE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRACTICE_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      droneEnabled: Boolean(parsed.droneEnabled),
      droneVolume: typeof parsed.droneVolume === 'number' ? Math.max(0, Math.min(1, parsed.droneVolume)) : 0.6,
      droneFollows: parsed.droneFollows === 'base' ? 'base' : 'selected',
      metronomeEnabled: Boolean(parsed.metronomeEnabled),
      metronomeVolume: typeof parsed.metronomeVolume === 'number' ? Math.max(0, Math.min(1, parsed.metronomeVolume)) : 0.7,
      countInEnabled: Boolean(parsed.countInEnabled),
      includeMetronomeInExport: Boolean(parsed.includeMetronomeInExport),
    };
  } catch {
    return { ...DEFAULT_PRACTICE_SETTINGS };
  }
}

/**
 * Saves practice settings to localStorage with the instruversal: prefix.
 */
export function savePracticeSettings(updates: Partial<PracticeSettings>): PracticeSettings {
  const current = loadPracticeSettings();
  const next: PracticeSettings = {
    ...current,
    ...updates,
    droneVolume: updates.droneVolume !== undefined ? Math.max(0, Math.min(1, updates.droneVolume)) : current.droneVolume,
    metronomeVolume: updates.metronomeVolume !== undefined ? Math.max(0, Math.min(1, updates.metronomeVolume)) : current.metronomeVolume,
  };
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }
  return next;
}

/**
 * Practice aids engine managing drone, metronome, and count-in pre-roll.
 */
export class PracticeEngine {
  private settings: PracticeSettings;

  // Drone nodes
  private droneRootSynth: Tone.Synth | null = null;
  private droneFifthSynth: Tone.Synth | null = null;
  private droneFilter: Tone.Filter | null = null;
  private droneGain: Tone.Gain | null = null;
  private isDroneActive: boolean = false;
  private currentDroneRoot: number = 0;

  // Metronome nodes
  private metronomeSynth: Tone.Synth | null = null;
  private metronomeGain: Tone.Gain | null = null;
  private metronomeRepeatId: number | null = null;

  // Count-in state
  private isCountingInState: boolean = false;
  private countInTimers: number[] = [];
  private onCountInComplete: (() => void) | null = null;

  private unsubs: Array<() => void> = [];

  constructor() {
    this.settings = loadPracticeSettings();
    this.setupListeners();
  }

  private setupListeners() {
    this.unsubs.push(
      events.on('transport:play', () => {
        this.handleTransportPlay();
      })
    );

    this.unsubs.push(
      events.on('transport:pause', () => {
        this.handleTransportPause();
      })
    );

    this.unsubs.push(
      events.on('scale:change', () => {
        if (this.settings.droneFollows === 'base') {
          this.retuneDroneWithGlide();
        }
      })
    );

    this.unsubs.push(
      events.on('track:key-change', (data) => {
        if (this.settings.droneFollows === 'selected' && data.trackId === state.selectedTrackId) {
          this.retuneDroneWithGlide();
        }
      })
    );

    this.unsubs.push(
      events.on('track:select', () => {
        if (this.settings.droneFollows === 'selected') {
          this.retuneDroneWithGlide();
        }
      })
    );

    this.unsubs.push(
      events.on('key-mode:change', () => {
        this.retuneDroneWithGlide();
      })
    );
  }

  public getSettings(): PracticeSettings {
    return { ...this.settings };
  }

  public updateSettings(updates: Partial<PracticeSettings>): PracticeSettings {
    this.settings = savePracticeSettings(updates);

    if (updates.droneEnabled !== undefined || updates.droneVolume !== undefined || updates.droneFollows !== undefined) {
      this.applyDroneSettings();
    }

    if (updates.metronomeEnabled !== undefined || updates.metronomeVolume !== undefined) {
      this.applyMetronomeSettings();
    }

    events.emit('practice:settings-change' as any, this.settings);
    return this.settings;
  }

  // --- DRONE IMPLEMENTATION ---

  private ensureDroneNodes(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.droneRootSynth) return true;

    try {
      this.droneRootSynth = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.1, decay: 0.3, sustain: 1.0, release: 0.25 },
      });

      this.droneFifthSynth = new Tone.Synth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.1, decay: 0.3, sustain: 1.0, release: 0.25 },
      });

      this.droneFilter = new Tone.Filter({
        frequency: 850,
        type: 'lowpass',
        rolloff: -12,
      });

      this.droneGain = new Tone.Gain(0);

      this.droneRootSynth.connect(this.droneFilter);
      this.droneFifthSynth.connect(this.droneFilter);
      this.droneFilter.connect(this.droneGain);

      // Route through master effects rack input (master chain)
      const rack = getMasterEffectsRack();
      if (rack && rack.input) {
        this.droneGain.connect(rack.input);
      } else {
        this.droneGain.toDestination();
      }

      return true;
    } catch {
      return false;
    }
  }

  private resolveActiveRoot(): number {
    if (this.settings.droneFollows === 'selected') {
      try {
        const selTrack = getTrackManager().getTrack(state.selectedTrackId);
        if (selTrack) {
          const key = effectiveKey(selTrack, state);
          return key.root;
        }
      } catch {}
    }
    return state.rootNote ?? 0;
  }

  private retuneDroneWithGlide() {
    const newRoot = this.resolveActiveRoot();
    this.currentDroneRoot = newRoot;
    const { rootFreq, fifthFreq } = computeDroneFrequencies(newRoot);

    if (this.droneRootSynth && this.droneFifthSynth && this.isDroneActive) {
      try {
        this.droneRootSynth.frequency.rampTo(rootFreq, 0.15);
        this.droneFifthSynth.frequency.rampTo(fifthFreq, 0.15);
      } catch {}
    }
  }

  private applyDroneSettings() {
    if (!this.settings.droneEnabled) {
      this.fadeDroneOut(0.2);
    } else {
      if (state.isPlaying) {
        this.fadeDroneIn(0.2);
      }
    }
  }

  private fadeDroneIn(fadeTime: number = 0.2) {
    if (!this.settings.droneEnabled) return;
    if (!this.ensureDroneNodes()) return;

    this.currentDroneRoot = this.resolveActiveRoot();
    const { rootFreq, fifthFreq } = computeDroneFrequencies(this.currentDroneRoot);

    try {
      const now = Tone.now();
      if (!this.isDroneActive) {
        this.droneRootSynth?.triggerAttack(rootFreq, now);
        this.droneFifthSynth?.triggerAttack(fifthFreq, now);
        this.isDroneActive = true;
      } else {
        this.droneRootSynth?.frequency.rampTo(rootFreq, 0.15, now);
        this.droneFifthSynth?.frequency.rampTo(fifthFreq, 0.15, now);
      }

      const targetGain = this.settings.droneVolume * 0.35;
      this.droneGain?.gain.rampTo(targetGain, fadeTime, now);
    } catch {}
  }

  private fadeDroneOut(fadeTime: number = 0.2) {
    if (!this.droneGain || !this.isDroneActive) return;

    try {
      const now = Tone.now();
      this.droneGain.gain.rampTo(0, fadeTime, now);

      window.setTimeout(() => {
        if (!state.isPlaying || !this.settings.droneEnabled) {
          try {
            this.droneRootSynth?.triggerRelease();
            this.droneFifthSynth?.triggerRelease();
          } catch {}
          this.isDroneActive = false;
        }
      }, Math.round(fadeTime * 1000) + 20);
    } catch {}
  }

  // --- METRONOME IMPLEMENTATION ---

  private ensureMetronomeNodes(): boolean {
    if (typeof window === 'undefined') return false;
    if (this.metronomeSynth) return true;

    try {
      this.metronomeSynth = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.02 },
      });

      this.metronomeGain = new Tone.Gain(this.settings.metronomeVolume * 0.7);
      this.metronomeSynth.connect(this.metronomeGain);
      this.metronomeGain.toDestination();

      return true;
    } catch {
      return false;
    }
  }

  public triggerMetronomeClick(time: number, isAccent: boolean) {
    if (!this.ensureMetronomeNodes() || !this.metronomeSynth) return;
    const freq = isAccent ? 1400 : 880;
    const dur = isAccent ? 0.03 : 0.02;
    const vel = isAccent ? 0.95 : 0.55;
    try {
      this.metronomeSynth.triggerAttackRelease(freq, dur, time, vel);
    } catch {}
  }

  private applyMetronomeSettings() {
    if (this.metronomeGain) {
      this.metronomeGain.gain.value = this.settings.metronomeVolume * 0.7;
    }

    if (this.settings.metronomeEnabled) {
      this.scheduleMetronomeTransport();
    } else {
      this.unscheduleMetronomeTransport();
    }
  }

  private scheduleMetronomeTransport() {
    if (typeof window === 'undefined') return;
    if (this.metronomeRepeatId !== null) return;

    try {
      this.ensureMetronomeNodes();
      this.metronomeRepeatId = Tone.getTransport().scheduleRepeat((time) => {
        if (!this.settings.metronomeEnabled) return;
        const ticks = Tone.getTransport().getTicksAtTime(time);
        const beatInBar = Math.round(ticks / Tone.getTransport().PPQ) % 4;
        const isAccent = beatInBar === 0;
        this.triggerMetronomeClick(time, isAccent);
      }, '4n');
    } catch {}
  }

  private unscheduleMetronomeTransport() {
    if (this.metronomeRepeatId !== null) {
      try {
        Tone.getTransport().clear(this.metronomeRepeatId);
      } catch {}
      this.metronomeRepeatId = null;
    }
  }

  // --- COUNT-IN IMPLEMENTATION ---

  public isCountInEnabled(): boolean {
    return this.settings.countInEnabled;
  }

  public isCountingIn(): boolean {
    return this.isCountingInState;
  }

  public startCountIn(onComplete: () => void) {
    if (this.isCountingInState) return;

    this.isCountingInState = true;
    this.onCountInComplete = onComplete;
    this.ensureMetronomeNodes();

    const bpm = state.bpm || 90;
    const beatMs = Math.round((60 / bpm) * 1000);

    events.emit('practice:count-in-start' as any, { beat: 1 });

    // Click 1 (accented) immediately
    this.triggerMetronomeClick(Tone.now(), true);

    // Schedule beats 2, 3, 4
    for (let b = 2; b <= 4; b++) {
      const delay = (b - 1) * beatMs;
      const tid = window.setTimeout(() => {
        if (!this.isCountingInState) return;
        events.emit('practice:count-in-tick' as any, { beat: b });
        this.triggerMetronomeClick(Tone.now(), false);
      }, delay);
      this.countInTimers.push(tid);
    }

    // Schedule completion after 4 beats
    const finishDelay = 4 * beatMs;
    const finishTid = window.setTimeout(() => {
      if (!this.isCountingInState) return;
      this.isCountingInState = false;
      this.countInTimers = [];
      events.emit('practice:count-in-end' as any, undefined);

      const cb = this.onCountInComplete;
      this.onCountInComplete = null;
      cb?.();
    }, finishDelay);
    this.countInTimers.push(finishTid);
  }

  public cancelCountIn() {
    if (!this.isCountingInState) return;
    this.isCountingInState = false;
    for (const tid of this.countInTimers) {
      window.clearTimeout(tid);
    }
    this.countInTimers = [];
    this.onCountInComplete = null;
    events.emit('practice:count-in-end' as any, undefined);
  }

  // --- TRANSPORT LIFECYCLE ---

  private handleTransportPlay() {
    if (this.settings.droneEnabled) {
      this.fadeDroneIn(0.2);
    }
    if (this.settings.metronomeEnabled) {
      this.scheduleMetronomeTransport();
    }
  }

  private handleTransportPause() {
    this.cancelCountIn();
    this.fadeDroneOut(0.2);
  }

  public dispose() {
    this.cancelCountIn();
    this.unscheduleMetronomeTransport();

    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];

    try {
      this.droneRootSynth?.dispose();
      this.droneFifthSynth?.dispose();
      this.droneFilter?.dispose();
      this.droneGain?.dispose();
      this.metronomeSynth?.dispose();
      this.metronomeGain?.dispose();
    } catch {}

    this.droneRootSynth = null;
    this.droneFifthSynth = null;
    this.droneFilter = null;
    this.droneGain = null;
    this.metronomeSynth = null;
    this.metronomeGain = null;
  }
}

let sharedPracticeEngine: PracticeEngine | null = null;

export function getPracticeEngine(): PracticeEngine {
  if (!sharedPracticeEngine) {
    sharedPracticeEngine = new PracticeEngine();
  }
  return sharedPracticeEngine;
}
