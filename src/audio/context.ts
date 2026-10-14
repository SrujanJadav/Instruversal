/**
 * Low-latency audio context initialization.
 * MUST be imported before any other Tone.js module to ensure
 * the custom context is set before any audio nodes are created.
 */
import * as Tone from 'tone';

let contextInitialized = false;

export function initLowLatencyContext(): void {
  if (contextInitialized) return;

  const isMobile =
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  const latencyHint: AudioContextLatencyCategory = isMobile ? 'playback' : 'balanced';

  // Create a custom context with safe latency buffering to prevent underruns
  // during 60fps canvas rendering on phones and laptops
  const ctx = new Tone.Context({
    latencyHint,
    lookAhead: 0.08,   // 80ms scheduling lookahead
    updateInterval: 0.03, // 30ms update interval
  });

  Tone.setContext(ctx);
  try {
    Tone.getContext().lookAhead = 0.08;
  } catch {}
  contextInitialized = true;
}

export function logAudioLatencyInfo(): void {
  // Silent in production to prevent console noise
}

export function getTotalAudioLatencySeconds(): number {
  const ctx = Tone.getContext();
  const rawCtx = ctx.rawContext as AudioContext;
  const base = (rawCtx as any).baseLatency ?? (ctx as any).baseLatency ?? 0;
  const output = (rawCtx as any).outputLatency ?? 0;
  const lookahead = (ctx as any).lookAhead ?? 0.08;
  return base + output + lookahead;
}
