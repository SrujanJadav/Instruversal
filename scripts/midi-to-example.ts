/**
 * Instruversal Dev Tool: MIDI to Example Converter
 * Standalone Node/TS script (no external dependencies).
 * Usage: npx tsx scripts/midi-to-example.ts <path-to-file.mid> [--bars 4] [--bpm 100] [--scale major] [--root 0]
 *
 * NOTE: Only process MIDI files that you own or have the explicit right/license to use.
 */

import * as fs from 'fs';
import * as path from 'path';

interface RawMidiEvent {
  tick: number;
  type: 'noteOn' | 'noteOff' | 'setTempo';
  channel: number;
  note?: number;
  velocity?: number;
  bpm?: number;
}

interface ParsedTrack {
  name: string;
  channel: number;
  notes: {
    midi: number;
    startBeat: number;
    durBeats: number;
    velocity: number;
  }[];
}

function parseMidiFile(buffer: Buffer): {
  ticksPerQuarter: number;
  tracks: ParsedTrack[];
  bpm: number;
} {
  let offset = 0;

  // Header chunk
  const headerId = buffer.toString('ascii', offset, offset + 4);
  offset += 4;
  if (headerId !== 'MThd') {
    throw new Error(`Invalid MIDI file header: ${headerId}`);
  }

  const headerLen = buffer.readUInt32BE(offset);
  offset += 4;
  const format = buffer.readUInt16BE(offset);
  offset += 2;
  const numTracks = buffer.readUInt16BE(offset);
  offset += 2;
  const timeDivision = buffer.readUInt16BE(offset);
  offset += 2;

  // Check if SMPTE or metric
  if (timeDivision & 0x8000) {
    throw new Error('SMPTE time division not supported');
  }
  const ticksPerQuarter = timeDivision;

  let globalBpm = 120;
  const parsedTracks: ParsedTrack[] = [];

  for (let t = 0; t < numTracks; t++) {
    if (offset >= buffer.length) break;
    const trackId = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    const trackLen = buffer.readUInt32BE(offset);
    offset += 4;
    const trackEnd = offset + trackLen;

    let currentTick = 0;
    let runningStatus = 0;
    const activeNotes = new Map<number, { startTick: number; velocity: number }>();
    const finishedNotes: { midi: number; startBeat: number; durBeats: number; velocity: number }[] = [];
    let trackName = `Track ${t + 1}`;
    let trackChannel = 0;

    while (offset < trackEnd) {
      // Read variable-length delta time
      let delta = 0;
      let b = 0;
      do {
        b = buffer.readUInt8(offset++);
        delta = (delta << 7) | (b & 0x7f);
      } while (b & 0x80);

      currentTick += delta;

      let status = buffer.readUInt8(offset);
      if (status >= 0x80) {
        offset++;
        runningStatus = status;
      } else {
        status = runningStatus;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      trackChannel = channel;

      if (status === 0xff) {
        // Meta event
        const metaType = buffer.readUInt8(offset++);
        let metaLen = 0;
        let mb = 0;
        do {
          mb = buffer.readUInt8(offset++);
          metaLen = (metaLen << 7) | (mb & 0x7f);
        } while (mb & 0x80);

        if (metaType === 0x03) {
          // Track Name
          trackName = buffer.toString('utf8', offset, offset + metaLen);
        } else if (metaType === 0x51 && metaLen === 3) {
          // Set Tempo: microseconds per quarter note
          const usPerQuarter = (buffer.readUInt8(offset) << 16) | (buffer.readUInt8(offset + 1) << 8) | buffer.readUInt8(offset + 2);
          globalBpm = Math.round(60000000 / usPerQuarter);
        }
        offset += metaLen;
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx
        let sysexLen = 0;
        let sb = 0;
        do {
          sb = buffer.readUInt8(offset++);
          sysexLen = (sysexLen << 7) | (sb & 0x7f);
        } while (sb & 0x80);
        offset += sysexLen;
      } else if (eventType === 0x90) {
        // Note On
        const note = buffer.readUInt8(offset++);
        const vel = buffer.readUInt8(offset++);
        if (vel > 0) {
          activeNotes.set(note, { startTick: currentTick, velocity: vel / 127 });
        } else {
          // Note on with vel 0 is note off
          const active = activeNotes.get(note);
          if (active) {
            const startBeat = active.startTick / ticksPerQuarter;
            const durBeats = (currentTick - active.startTick) / ticksPerQuarter;
            finishedNotes.push({
              midi: note,
              startBeat,
              durBeats,
              velocity: active.velocity,
            });
            activeNotes.delete(note);
          }
        }
      } else if (eventType === 0x80) {
        // Note Off
        const note = buffer.readUInt8(offset++);
        offset++; // ignore release velocity
        const active = activeNotes.get(note);
        if (active) {
          const startBeat = active.startTick / ticksPerQuarter;
          const durBeats = (currentTick - active.startTick) / ticksPerQuarter;
          finishedNotes.push({
            midi: note,
            startBeat,
            durBeats,
            velocity: active.velocity,
          });
          activeNotes.delete(note);
        }
      } else if (eventType === 0xa0 || eventType === 0xb0 || eventType === 0xe0) {
        offset += 2;
      } else if (eventType === 0xc0 || eventType === 0xd0) {
        offset += 1;
      }
    }

    if (finishedNotes.length > 0) {
      // Quantize to 1/32 beat (0.125 beats)
      const quantized = finishedNotes.map((n) => {
        const qStart = Math.round(n.startBeat * 8) / 8;
        const qDur = Math.max(0.125, Math.round(n.durBeats * 8) / 8);
        return {
          midi: n.midi,
          startBeat: qStart,
          durBeats: qDur,
          velocity: Number(n.velocity.toFixed(2)),
        };
      });

      parsedTracks.push({
        name: trackName,
        channel: trackChannel,
        notes: quantized,
      });
    }
  }

  return { ticksPerQuarter, tracks: parsedTracks, bpm: globalBpm };
}

export function runMidiToExample(filePath: string, barsLimit: number = 4) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buf = fs.readFileSync(filePath);
  const parsed = parseMidiFile(buf);

  const maxBeat = barsLimit * 4;
  for (const t of parsed.tracks) {
    for (const n of t.notes) {
      if (n.startBeat + n.durBeats > maxBeat) {
        throw new Error(
          `MIDI file exceeds bars limit of ${barsLimit} bars (${maxBeat} beats). Track '${t.name}' has note ending at beat ${n.startBeat + n.durBeats}`
        );
      }
    }
  }

  console.log(`MIDI parsed successfully: ${parsed.tracks.length} tracks, tempo ${parsed.bpm} BPM.`);
  return parsed;
}

if (process.argv[1] && process.argv[1].endsWith('midi-to-example.ts')) {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.log('Usage: npx tsx scripts/midi-to-example.ts <file.mid> [--bars 4]');
    process.exit(0);
  }
  try {
    runMidiToExample(fileArg);
  } catch (err: any) {
    console.error('Error parsing MIDI:', err.message);
    process.exit(1);
  }
}
