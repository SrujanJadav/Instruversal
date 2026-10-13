/**
 * Pure TypeScript Standard MIDI File (SMF Format 1) Writer.
 * Zero external dependencies.
 * Default 480 ticks per quarter note.
 */

export interface MidiNote {
  midi: number;
  startTick: number;
  durationTicks: number;
  velocity: number; // 0..1 or 1..127
}

export interface MidiTrackInput {
  name: string;
  channel: number; // 0..15 (General MIDI drum channel is 9)
  program?: number; // General MIDI program number 0..127
  keyText?: string; // Optional per-track musical key text
  notes: MidiNote[];
}

export interface MidiSongInput {
  title: string;
  bpm: number;
  ticksPerQuarter?: number; // default 480
  timeSignature?: [number, number]; // default [4, 4]
  keySignature?: { sf: number; mi: number }; // sf: -7..7, mi: 0=major, 1=minor
  tracks: MidiTrackInput[];
}

/**
 * Variable-Length Quantity (VLQ) encoding according to the MIDI 1.0 specification.
 */
export function encodeVlq(value: number): number[] {
  let val = Math.max(0, Math.floor(value));
  const bytes: number[] = [];
  bytes.push(val & 0x7f);
  val >>= 7;
  while (val > 0) {
    bytes.unshift((val & 0x7f) | 0x80);
    val >>= 7;
  }
  return bytes;
}

/**
 * Encodes ASCII / UTF-8 string into byte array.
 */
export function encodeString(str: string): number[] {
  const utf8 = new TextEncoder().encode(str);
  return Array.from(utf8);
}

export function encodeUint32(val: number): number[] {
  return [
    (val >>> 24) & 0xff,
    (val >>> 16) & 0xff,
    (val >>> 8) & 0xff,
    val & 0xff,
  ];
}

export function encodeUint16(val: number): number[] {
  return [(val >>> 8) & 0xff, val & 0xff];
}

/**
 * Generates the Track 0 Conductor (Tempo & Master Metadata) track chunk bytes.
 */
export function buildConductorTrack(song: MidiSongInput): number[] {
  const trackBytes: number[] = [];

  // 1. Delta 0: Sequence / Song Name (Meta 0x03)
  const titleBytes = encodeString(song.title || 'Untitled');
  trackBytes.push(0x00, 0xff, 0x03, ...encodeVlq(titleBytes.length), ...titleBytes);

  // 2. Delta 0: Time Signature (Meta 0x58: nn dd cc bb)
  // Default 4/4: nn=4, dd=2 (2^2=4), cc=24 MIDI clocks per quarter, bb=8 32nd-notes per quarter
  const [num, denom] = song.timeSignature || [4, 4];
  const denomPower = Math.round(Math.log2(denom || 4));
  trackBytes.push(0x00, 0xff, 0x58, 0x04, num & 0xff, denomPower & 0xff, 0x18, 0x08);

  // 3. Delta 0: Set Tempo (Meta 0x51: 3-byte microseconds per quarter)
  const bpm = Math.max(20, Math.min(300, song.bpm || 120));
  const usPerQuarter = Math.round(60_000_000 / bpm);
  trackBytes.push(
    0x00,
    0xff,
    0x51,
    0x03,
    (usPerQuarter >>> 16) & 0xff,
    (usPerQuarter >>> 8) & 0xff,
    usPerQuarter & 0xff
  );

  // 4. Delta 0: Key Signature (Meta 0x59: sf, mi)
  if (song.keySignature) {
    const { sf, mi } = song.keySignature;
    // sf is signed (-7 to +7)
    const sfByte = sf < 0 ? (sf + 256) & 0xff : sf & 0xff;
    trackBytes.push(0x00, 0xff, 0x59, 0x02, sfByte, (mi ? 1 : 0));
  }

  // 5. Delta 0: End of Track (Meta 0x2F 0x00)
  trackBytes.push(0x00, 0xff, 0x2f, 0x00);

  // Package into MTrk chunk
  return [
    0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
    ...encodeUint32(trackBytes.length),
    ...trackBytes,
  ];
}

interface TrackEvent {
  tick: number;
  type: 'noteOn' | 'noteOff';
  midi: number;
  velocity: number;
}

/**
 * Builds an instrument track chunk (Tracks 1..N) containing note events.
 */
export function buildInstrumentTrack(input: MidiTrackInput): number[] {
  const trackBytes: number[] = [];
  const channel = Math.max(0, Math.min(15, input.channel));

  // 1. Delta 0: Track Name (Meta 0x03)
  const nameBytes = encodeString(input.name || `Track ${channel + 1}`);
  trackBytes.push(0x00, 0xff, 0x03, ...encodeVlq(nameBytes.length), ...nameBytes);

  // 2. Delta 0: Optional Per-Track Key Text Event (Meta 0x01)
  if (input.keyText) {
    const textBytes = encodeString(input.keyText);
    trackBytes.push(0x00, 0xff, 0x01, ...encodeVlq(textBytes.length), ...textBytes);
  }

  // 3. Delta 0: Program Change (only for melodic channels, not drum channel 9)
  if (channel !== 9 && input.program !== undefined) {
    trackBytes.push(0x00, 0xc0 | channel, input.program & 0x7f);
  }

  // 4. Note events sorted chronologically
  const rawEvents: TrackEvent[] = [];
  for (const n of input.notes) {
    const midi = Math.max(0, Math.min(127, Math.round(n.midi)));
    let vel = n.velocity;
    if (vel <= 1) vel = Math.round(vel * 127);
    vel = Math.max(1, Math.min(127, Math.round(vel)));

    const startTick = Math.max(0, Math.round(n.startTick));
    const duration = Math.max(1, Math.round(n.durationTicks));
    const endTick = startTick + duration;

    rawEvents.push({ tick: startTick, type: 'noteOn', midi, velocity: vel });
    rawEvents.push({ tick: endTick, type: 'noteOff', midi, velocity: 0x40 });
  }

  // Sort events: NoteOff before NoteOn if at the exact same tick to prevent stuck notes
  rawEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type !== b.type) return a.type === 'noteOff' ? -1 : 1;
    return a.midi - b.midi;
  });

  let lastTick = 0;
  for (const ev of rawEvents) {
    const delta = ev.tick - lastTick;
    trackBytes.push(...encodeVlq(delta));
    if (ev.type === 'noteOn') {
      trackBytes.push(0x90 | channel, ev.midi, ev.velocity);
    } else {
      trackBytes.push(0x80 | channel, ev.midi, ev.velocity);
    }
    lastTick = ev.tick;
  }

  // 5. End of Track (Meta 0x2F 0x00)
  trackBytes.push(0x00, 0xff, 0x2f, 0x00);

  // Package into MTrk chunk
  return [
    0x4d, 0x54, 0x72, 0x6b, // 'MTrk'
    ...encodeUint32(trackBytes.length),
    ...trackBytes,
  ];
}

/**
 * Pure function: Encodes a complete Standard MIDI File (Format 1) into a Uint8Array.
 */
export function writeStandardMidiFile(song: MidiSongInput): Uint8Array {
  const ticksPerQuarter = song.ticksPerQuarter || 480;
  const conductorTrackBytes = buildConductorTrack(song);
  const instrumentTracksBytes: number[][] = song.tracks.map((t) => buildInstrumentTrack(t));

  const totalTracks = 1 + instrumentTracksBytes.length;

  // Header chunk: MThd, length 6, format 1, totalTracks, ticksPerQuarter
  const headerBytes = [
    0x4d, 0x54, 0x68, 0x64, // 'MThd'
    ...encodeUint32(6),
    ...encodeUint16(1), // Format 1
    ...encodeUint16(totalTracks),
    ...encodeUint16(ticksPerQuarter),
  ];

  let totalSize = headerBytes.length + conductorTrackBytes.length;
  for (const tBytes of instrumentTracksBytes) {
    totalSize += tBytes.length;
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;

  result.set(headerBytes, offset);
  offset += headerBytes.length;

  result.set(conductorTrackBytes, offset);
  offset += conductorTrackBytes.length;

  for (const tBytes of instrumentTracksBytes) {
    result.set(tBytes, offset);
    offset += tBytes.length;
  }

  return result;
}
