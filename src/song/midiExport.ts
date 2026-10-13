import { Song } from './types';
import { compileSongEvents } from './scheduler';
import {
  MidiSongInput,
  MidiTrackInput,
  MidiNote,
  writeStandardMidiFile,
} from '../export/midiWriter';
import { DrumSoundId } from '../audio/drums';

/**
 * General MIDI Drum Channel 10 (0-indexed channel 9) note mapping.
 */
const DRUM_NOTE_MAP: Record<DrumSoundId, number> = {
  kick: 36, // Bass Drum 1
  snare: 38, // Acoustic Snare
  clap: 39, // Hand Clap
  'closed-hat': 42, // Closed Hi-Hat
  'open-hat': 46, // Open Hi-Hat
  tom: 45, // Low Tom
  cowbell: 56, // Cowbell
  shaker: 70, // Maracas / Shaker
};

/**
 * Maps Instruversal instrument IDs to Standard General MIDI Program numbers (0..127).
 */
const INSTRUMENT_PROGRAM_MAP: Record<string, number> = {
  pluck: 24, // Acoustic Guitar (nylon)
  guitar: 25, // Acoustic Guitar (steel)
  keys: 4, // Electric Piano 1
  epiano: 4, // Electric Piano 1
  marimba: 12, // Marimba
  bell: 9, // Glockenspiel
  vibraphone: 11, // Vibraphone
  lead: 80, // Lead 1 (square)
  sawlead: 81, // Lead 2 (sawtooth)
  synth: 80, // Lead 1
  bass: 38, // Synth Bass 1
  subbass: 38, // Synth Bass 1
  pad: 88, // Pad 1 (new age)
  flute: 73, // Flute
  strings: 48, // String Ensemble 1
  pizzicato: 45, // Pizzicato Strings
};

/**
 * Pure function: Compiles a Song model into a Standard MIDI File Format 1 (SMF) Uint8Array.
 * Supports:
 * - One MIDI track per lane and color/instrument
 * - Song BPM in Conductor Track
 * - Song markers as MIDI markers
 * - Transpose and clip gain applied
 * - Drums on General MIDI Channel 10 (ch 9)
 * - Mute and Solo respected (multiple solos allowed, solo overrides mute)
 */
export function exportSongToMidi(song: Song): Uint8Array {
  const ticksPerQuarter = 480;
  const beatsPerBar = song.beatsPerBar || 4;
  const ticksPerBar = beatsPerBar * ticksPerQuarter;
  const bpm = song.bpm || 90;

  // 1. Compile events using the song scheduler
  const compiled = compileSongEvents(song);

  // 2. Identify active lanes respecting solo and mute
  const soloActive = song.lanes.some((l) => l.solo);
  const activeLaneIds = new Set(
    song.lanes
      .filter((l) => (soloActive ? l.solo : !l.mute))
      .map((l) => l.id)
  );

  const laneMap = new Map(song.lanes.map((l) => [l.id, l]));

  // 3. Track channel allocation (channels 0..15, channel 9 reserved for drums)
  const melodicChannels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let channelIndex = 0;

  // Group events by Lane ID + Track ID
  const trackGroups = new Map<
    string,
    {
      laneId: string;
      trackId: string;
      instrumentId: string;
      isDrum: boolean;
      notes: MidiNote[];
    }
  >();

  // Process melodic note events
  for (const ev of compiled.noteEvents) {
    if (!activeLaneIds.has(ev.laneId)) continue;

    const groupKey = `${ev.laneId}:${ev.trackId}`;
    let group = trackGroups.get(groupKey);
    if (!group) {
      group = {
        laneId: ev.laneId,
        trackId: ev.trackId,
        instrumentId: ev.instrumentId || 'pluck',
        isDrum: false,
        notes: [],
      };
      trackGroups.set(groupKey, group);
    }

    const startTick = Math.max(0, Math.round(ev.timeBars * ticksPerBar));
    const durationTicks = Math.max(
      1,
      Math.round((ev.durationSeconds / (60 / bpm)) * ticksPerQuarter)
    );
    const velocity = Math.max(1, Math.min(127, Math.round(ev.velocity * 127)));

    group.notes.push({
      midi: ev.midi,
      startTick,
      durationTicks,
      velocity,
    });
  }

  // Process continuous flow events (use initial MIDI or discrete breakpoints)
  for (const ev of compiled.flowEvents) {
    if (!activeLaneIds.has(ev.laneId)) continue;

    const groupKey = `${ev.laneId}:${ev.trackId}`;
    let group = trackGroups.get(groupKey);
    if (!group) {
      group = {
        laneId: ev.laneId,
        trackId: ev.trackId,
        instrumentId: ev.instrumentId || 'lead',
        isDrum: false,
        notes: [],
      };
      trackGroups.set(groupKey, group);
    }

    const startTick = Math.max(0, Math.round(ev.startTimeBars * ticksPerBar));
    const durationBars = Math.max(0.05, ev.endTimeBars - ev.startTimeBars);
    const durationTicks = Math.max(
      1,
      Math.round(durationBars * beatsPerBar * ticksPerQuarter)
    );
    const velocity = Math.max(1, Math.min(127, Math.round(ev.velocity * 127)));

    group.notes.push({
      midi: ev.initialMidi,
      startTick,
      durationTicks,
      velocity,
    });
  }

  // Process drum hit events (General MIDI Channel 10 / index 9)
  for (const ev of compiled.beatHitEvents) {
    if (!activeLaneIds.has(ev.laneId)) continue;

    const groupKey = `${ev.laneId}:drums:${ev.trackId}`;
    let group = trackGroups.get(groupKey);
    if (!group) {
      group = {
        laneId: ev.laneId,
        trackId: ev.trackId,
        instrumentId: 'drums',
        isDrum: true,
        notes: [],
      };
      trackGroups.set(groupKey, group);
    }

    const startTick = Math.max(0, Math.round(ev.timeBars * ticksPerBar));
    // Standard drum hit duration: 16th note (120 ticks)
    const durationTicks = Math.round(ticksPerQuarter / 4);
    const midi = DRUM_NOTE_MAP[ev.soundId] || 38;
    const velocity = Math.max(1, Math.min(127, Math.round(ev.velocity * 127)));

    group.notes.push({
      midi,
      startTick,
      durationTicks,
      velocity,
    });
  }

  // Process drum flow events
  for (const ev of compiled.beatFlowEvents) {
    if (!activeLaneIds.has(ev.laneId)) continue;

    const groupKey = `${ev.laneId}:drums:${ev.trackId}`;
    let group = trackGroups.get(groupKey);
    if (!group) {
      group = {
        laneId: ev.laneId,
        trackId: ev.trackId,
        instrumentId: 'drums',
        isDrum: true,
        notes: [],
      };
      trackGroups.set(groupKey, group);
    }

    if (ev.rollHits && ev.rollHits.length > 0) {
      for (const hit of ev.rollHits) {
        const startTick = Math.max(0, Math.round(hit.timeBars * ticksPerBar));
        const durationTicks = Math.round(ticksPerQuarter / 4);
        const midi = 42; // Closed Hi-Hat
        const velocity = Math.max(1, Math.min(127, Math.round(hit.velocity * 127)));
        group.notes.push({
          midi,
          startTick,
          durationTicks,
          velocity,
        });
      }
    } else {
      const startTick = Math.max(0, Math.round(ev.startTimeBars * ticksPerBar));
      const durationTicks = Math.round(ticksPerQuarter / 4);
      const midi = 42; // Closed Hi-Hat
      const velocity = Math.max(1, Math.min(127, Math.round(ev.initialVelocity * 127)));
      group.notes.push({
        midi,
        startTick,
        durationTicks,
        velocity,
      });
    }
  }

  // 4. Construct MidiTrackInput list
  const tracks: MidiTrackInput[] = [];

  for (const [, group] of trackGroups.entries()) {
    if (group.notes.length === 0) continue;

    const lane = laneMap.get(group.laneId);
    const laneName = lane ? lane.name : 'Lane';

    let channel = 9; // Drum channel 10 (0-indexed 9)
    let program: number | undefined = undefined;

    if (!group.isDrum) {
      channel = melodicChannels[channelIndex % melodicChannels.length];
      channelIndex++;
      program = INSTRUMENT_PROGRAM_MAP[group.instrumentId.toLowerCase()] ?? 24;
    }

    const instrumentLabel = group.isDrum
      ? 'Drums'
      : group.instrumentId.charAt(0).toUpperCase() + group.instrumentId.slice(1);

    const trackName = `${laneName} / ${instrumentLabel}`;

    tracks.push({
      name: trackName,
      channel,
      program,
      notes: group.notes,
    });
  }

  // 5. Construct MidiSongInput with markers
  const markers = (song.markers || []).map((m) => ({
    text: m.label || 'Marker',
    tick: Math.max(0, Math.round(m.bar * ticksPerBar)),
  }));

  const songInput: MidiSongInput = {
    title: song.title || 'Untitled Song',
    bpm,
    ticksPerQuarter,
    timeSignature: [beatsPerBar, 4],
    markers,
    tracks,
  };

  return writeStandardMidiFile(songInput);
}

/**
 * Browser helper: Triggers a file download for the song MIDI file.
 */
export function downloadSongMidiFile(song: Song): { filename: string; size: number } {
  const midiBytes = exportSongToMidi(song);
  const cleanTitle = (song.title || 'untitled')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'song';

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `instruversal-song-${cleanTitle}-${song.bpm || 90}bpm-${dateStr}.mid`;

  const blob = new Blob([midiBytes.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { filename, size: midiBytes.length };
}
