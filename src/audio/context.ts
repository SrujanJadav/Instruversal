/**
 * Low-latency audio context initialization.
 * MUST be imported before any other Tone.js module to ensure
 * the custom context is set before any audio nodes are created.
 */
import * as Tone from 'tone';

let contextInitialized = false;

export function initLowLatencyContext(): void {
  if (contextInitialized) return;

  // Create a custom context with interactive latency before any Tone nodes exist
  const ctx = new Tone.Context({
    latencyHint: 'interactive',
    lookAhead: 0.03,   // 30ms lookahead (safe for most hardware)
    updateInterval: 0.02, // 20ms update interval
  });

  Tone.setContext(ctx);
  contextInitialized = true;
}

export function logAudioLatencyInfo(): void {
  const ctx = Tone.getContext();
  const rawCtx = ctx.rawContext as AudioContext;
  const baseLatency = (rawCtx as any).baseLatency ?? (ctx as any).baseLatency ?? 0;
  const outputLatency = (rawCtx as any).outputLatency ?? 0;
  const lookAhead = (ctx as any).lookAhead ?? 0.03;
  const sampleRate = ctx.sampleRate;

  console.group('[Instruversal] Audio Context Latency Report');
  console.log(`  baseLatency:    ${(baseLatency * 1000).toFixed(1)} ms`);
  console.log(`  outputLatency:  ${(outputLatency * 1000).toFixed(1)} ms`);
  console.log(`  lookAhead:      ${(lookAhead * 1000).toFixed(0)} ms`);
  console.log(`  sampleRate:     ${sampleRate} Hz`);
  console.log(`  total audioLatency ≈ ${((baseLatency + outputLatency + lookAhead) * 1000).toFixed(1)} ms`);
  console.groupEnd();
}

export function getTotalAudioLatencySeconds(): number {
  const ctx = Tone.getContext();
  const rawCtx = ctx.rawContext as AudioContext;
  const base = (rawCtx as any).baseLatency ?? (ctx as any).baseLatency ?? 0;
  const output = (rawCtx as any).outputLatency ?? 0;
  const lookahead = (ctx as any).lookAhead ?? 0.03;
  return base + output + lookahead;
}
