import { state, Stroke } from '../state';
import { getTrackManager, Track } from '../audio/tracks';
import { buildScaleNotes, yToMidi, effectiveKey, NOTE_NAMES, ScaleName } from '../audio/scales';
import { INSTRUMENTS_MAP } from '../audio/instruments';
import { getStrokeBranches, interpolateBranchY } from '../audio/branches';
import { DrumSoundId, yToDrumSound } from '../audio/drums';
import { generateBeatEventsFromStrokes } from '../audio/beatSchedule';
import { generateBeatFlowEventsFromStrokes } from '../audio/beatFlowSchedule';
import { generateEventsFromStrokes } from '../audio/schedule';
import { buildExportFilename } from './exportAudio';
import {
  writeStandardMidiFile,
  MidiNote,
  MidiTrackInput,
  MidiSongInput,
} from './midiWriter';

/**
 * General MIDI Program Change numbers matching Instruversal instruments.
 */
export const INSTRUMENT_GM_PROGRAM: Record<string, number> = {
  pluck: 24, // Nylon Guitar / Pizzicato
  bell: 14, // Tubular Bells
  marimba: 12, // Marimba
  'soft-pad': 89, // Warm Pad
  'warm-keys': 4, // Electric Piano 1
  kalimba: 108, // Kalimba
  'sub-bass': 38, // Synth Bass 1
  'music-box': 10, // Music Box
  'steel-pan': 114, // Steel Drums
  'glass-harmonica': 99, // Atmosphere
  strings: 48, // String Ensemble 1
  theremin: 85, // Lead voice
  'wobble-bass': 39, // Synth Bass 2
  'tape-keys': 5, // Electric Piano 2
  'choir-pad': 52, // Choir Aahs
};

/**
 * General MIDI drum channel (channel 10, 0-indexed 9) pitch assignments.
 */
export const DRUM_GM_NOTES: Record<DrumSoundId, number> = {
  kick: 36,
  snare: 38,
  clap: 39,
  'closed-hat': 42,
  'open-hat': 46,
  tom: 45,
  cowbell: 56,
  shaker: 70,
};

/**
 * Circle of fifths key signature lookup for major and natural minor scales.
 * Returns sf (-7 to +7) and mi (0 = major, 1 = minor).
 */
export function rootAndScaleToKeySig(
  root: number,
  scale: string
): { sf: number; mi: number } | undefined {
  const normScale = scale.toLowerCase();
  const isMinor = normScale.includes('minor');
  const isMajor = normScale.includes('major');

  if (!isMajor && !isMinor) {
    return undefined;
  }

  // Root note indices: 0=C, 1=C#, 2=D, 3=D#, 4=E, 5=F, 6=F#, 7=G, 8=G#, 9=A, 10=A#, 11=B
  // Major circle of fifths sf mapping
  const majorSf: Record<number, number> = {
    0: 0, // C
    7: 1, // G
    2: 2, // D
    9: 3, // A
    4: 4, // E
    11: 5, // B
    6: 6, // F#
    1: 7, // C#
    5: -1, // F
    10: -2, // Bb
    3: -3, // Eb
    8: -4, // Ab
  };

  // Minor circle of fifths sf mapping (relative majors)
  const minorSf: Record<number, number> = {
    9: 0, // A minor = C major
    4: 1, // E minor = G major
    11: 2, // B minor = D major
    6: 3, // F# minor = A major
    1: 4, // C# minor = E major
    8: 5, // G# minor = B major
    3: 6, // D# minor = F# major
    10: 7, // A# minor = C# major
    2: -1, // D minor = F major
    7: -2, // G minor = Bb major
    0: -3, // C minor = Eb major
    5: -4, // F minor = Ab major
  };

  const cleanRoot = ((root % 12) + 12) % 12;
  const sf = isMinor ? minorSf[cleanRoot] : majorSf[cleanRoot];

  if (sf === undefined) return undefined;
  return { sf, mi: isMinor ? 1 : 0 };
}

export interface MidiExportOptions {
  title?: string;
  bpm?: number;
  bars?: number;
  repeats?: 1 | 2 | 4;
  rootNote?: number;
  scaleName?: ScaleName;
  strokes?: Stroke[];
  tracks?: Track[];
  scaleOctaves?: [number, number];
  includeMetronome?: boolean;
}

export interface MidiExportResult {
  blob: Blob;
  filename: string;
  url: string;
}

/**
 * Converts Flow mode branches into continuous MIDI note events.
 * As the held pitch changes across the branch, ends the previous note and starts
 * the next with 8 ticks of overlap.
 */
export function extractFlowBranchNotes(
  strokes: Stroke[],
  bars: number,
  scaleNotes: number[]
): MidiNote[] {
  const notes: MidiNote[] = [];
  const loopTicks = bars * 1920; // 480 ticks/beat * 4 beats/bar

  for (const stroke of strokes) {
    const branches = getStrokeBranches(stroke);
    for (const branch of branches) {
      const baseVel = Math.min(127, Math.max(30, Math.round((0.55 + (branch.width / 4) * 0.25) * 127)));

      if (branch.isSweep) {
        // Vertical or sweep branch: arpeggiate through pitches
        const startX = (branch.xStart + branch.xEnd) / 2;
        const startTick = Math.round(startX * loopTicks);
        const sweepSteps = 8;
        const stepTicks = 30; // ~25ms

        for (let s = 0; s < sweepSteps; s++) {
          const progress = s / (sweepSteps - 1 || 1);
          const curY = branch.yStart + progress * (branch.yEnd - branch.yStart);
          const midi = yToMidi(curY, scaleNotes);
          notes.push({
            midi,
            startTick: startTick + s * stepTicks,
            durationTicks: 45,
            velocity: baseVel,
          });
        }
        continue;
      }

      // Angled or horizontal branch
      const startTick = Math.max(0, Math.round(branch.xStart * loopTicks));
      const endTick = Math.max(startTick + 30, Math.round(branch.xEnd * loopTicks));
      const totalSpan = endTick - startTick;

      if (totalSpan <= 30) {
        // Very short tap or stroke
        const midi = yToMidi(branch.yStart, scaleNotes);
        notes.push({
          midi,
          startTick,
          durationTicks: Math.max(30, totalSpan),
          velocity: baseVel,
        });
        continue;
      }

      // Sample along the branch at small intervals (12 ticks = 1/40th of a quarter note)
      const sampleStep = 12;
      const initialY = interpolateBranchY(branch, branch.xStart);
      let currentMidi = yToMidi(initialY, scaleNotes);
      let noteStartTick = startTick;

      for (let t = startTick + sampleStep; t < endTick; t += sampleStep) {
        const curX = t / loopTicks;
        const curY = interpolateBranchY(branch, curX);
        const sampleMidi = yToMidi(curY, scaleNotes);

        if (sampleMidi !== currentMidi) {
          // Held pitch changed! End previous note with 8 ticks overlap, start next note
          const duration = Math.max(15, (t + 8) - noteStartTick);
          notes.push({
            midi: currentMidi,
            startTick: noteStartTick,
            durationTicks: duration,
            velocity: baseVel,
          });
          currentMidi = sampleMidi;
          noteStartTick = t;
        }
      }

      // Final segment
      const finalDuration = Math.max(15, endTick - noteStartTick);
      notes.push({
        midi: currentMidi,
        startTick: noteStartTick,
        durationTicks: finalDuration,
        velocity: baseVel,
      });
    }
  }

  return notes;
}

/**
 * Converts Notes mode stroke crossings and chords into MIDI notes.
 */
export function extractNotesModeNotes(
  strokes: Stroke[],
  bars: number,
  scaleNotes: number[]
): MidiNote[] {
  const events = generateEventsFromStrokes(strokes, bars, scaleNotes);
  const loopTicks = bars * 1920;

  return events.map((ev) => ({
    midi: ev.midi,
    startTick: Math.max(0, Math.round(ev.normX * loopTicks)),
    durationTicks: 120, // 16th note duration in 480 ticks/beat
    velocity: Math.min(127, Math.max(30, Math.round(ev.velocity * 127))),
  }));
}

/**
 * Converts beat track strokes (discrete hits and beat flow) into General MIDI drum notes.
 */
export function extractBeatTrackNotes(
  strokes: Stroke[],
  track: Track,
  bars: number,
  bpm: number
): MidiNote[] {
  const notes: MidiNote[] = [];
  const loopTicks = bars * 1920;

  if (track.beatMode === 'flow') {
    const flowStyle = track.beatFlowStyle || 'glide';
    const flowEvents = generateBeatFlowEventsFromStrokes(strokes, bars, bpm, flowStyle);

    if (flowStyle === 'roll') {
      for (const ev of flowEvents) {
        for (const rh of ev.rollHits) {
          const soundId = yToDrumSound(rh.normY);
          const midi = DRUM_GM_NOTES[soundId] || 36;
          notes.push({
            midi,
            startTick: Math.round(rh.normX * loopTicks),
            durationTicks: 45,
            velocity: Math.min(127, Math.max(30, Math.round(rh.velocity * 127))),
          });
        }
      }
    } else {
      // Glide or Sweep: sample at 16th notes along strokes
      const total16ths = bars * 16;
      for (let s = 0; s < total16ths; s++) {
        const stepX = (s + 0.5) / total16ths;
        for (const stroke of strokes) {
          const branches = getStrokeBranches(stroke);
          for (const b of branches) {
            if (stepX >= b.xStart && stepX <= b.xEnd) {
              const interpY = interpolateBranchY(b, stepX);
              const soundId = yToDrumSound(interpY);
              const midi = DRUM_GM_NOTES[soundId] || 36;
              const vel = Math.min(127, Math.max(40, Math.round((0.55 + (b.width / 4) * 0.25) * 127)));
              notes.push({
                midi,
                startTick: Math.round(stepX * loopTicks),
                durationTicks: 60,
                velocity: vel,
              });
            }
          }
        }
      }
    }
  } else {
    // Discrete beat hits
    const beatHits = generateBeatEventsFromStrokes(strokes, {
      bpm,
      bars,
      rate: track.beatRate || '1/16',
      swing: track.swing || 0,
      humanize: track.humanize || 15,
    });

    for (const hit of beatHits) {
      const midi = DRUM_GM_NOTES[hit.soundId] || 36;
      notes.push({
        midi,
        startTick: Math.max(0, Math.round(hit.normX * loopTicks)),
        durationTicks: 60,
        velocity: Math.min(127, Math.max(30, Math.round(hit.velocity * 127))),
      });
    }
  }

  return notes;
}

/**
 * Main exporter function: Generates a complete Standard MIDI File (SMF format 1)
 * from project state, respecting track settings, loops, repeats, and mute/solo.
 */
export function exportProjectToMidi(options: MidiExportOptions = {}): MidiExportResult {
  const bpm = options.bpm || state.bpm || 120;
  const bars = options.bars || state.bars || 2;
  const repeats = options.repeats || 2;
  const rawTitle = options.title || 'sketch';
  const strokes = options.strokes || state.strokes;

  const allTracks = options.tracks || (typeof window !== 'undefined' ? getTrackManager().getAllTracks() : []);
  const hasAnySolo = allTracks.some((t) => t.solo);

  const loopTicks = bars * 1920;
  const midiTracks: MidiTrackInput[] = [];

  // Channel allocation:
  // Melodic channels: 0..8, 10..15 (skipping channel 9)
  // Beat / drum channel: strictly channel 9 (GM Channel 10)
  let nextMelodicChannel = 0;

  const rootNote = options.rootNote !== undefined ? options.rootNote : state.rootNote;
  const scaleName = options.scaleName || state.scaleName;

  for (const track of allTracks) {
    // Respect mute and solo
    const shouldPlay = hasAnySolo ? track.solo : !track.muted;
    if (!shouldPlay) continue;

    const trackStrokes = strokes.filter((s) => s.trackId === track.id);
    const isBeat = track.trackType === 'beat';
    const channel = isBeat ? 9 : (nextMelodicChannel === 9 ? ++nextMelodicChannel : nextMelodicChannel++);
    if (!isBeat && nextMelodicChannel === 9) nextMelodicChannel++;

    // Compute key info for track
    const key = effectiveKey(track, { keyMode: state.keyMode, rootNote, scaleName });
    const octaves = options.scaleOctaves || [3, 6];
    const scaleNotes = buildScaleNotes(key.root, key.scale, octaves[0], octaves[1]);

    let singleLoopNotes: MidiNote[] = [];
    if (isBeat) {
      singleLoopNotes = extractBeatTrackNotes(trackStrokes, track, bars, bpm);
    } else if (state.playbackMode === 'flow') {
      singleLoopNotes = extractFlowBranchNotes(trackStrokes, bars, scaleNotes);
    } else {
      singleLoopNotes = extractNotesModeNotes(trackStrokes, bars, scaleNotes);
    }

    // Duplicate notes across requested loop repeats
    const repeatedNotes: MidiNote[] = [];
    for (let r = 0; r < repeats; r++) {
      const offsetTicks = r * loopTicks;
      for (const n of singleLoopNotes) {
        repeatedNotes.push({
          ...n,
          startTick: n.startTick + offsetTicks,
        });
      }
    }

    const instMeta = INSTRUMENTS_MAP[track.instrumentId];
    const instName = isBeat ? (track.name || 'Drums') : (instMeta?.name || track.name || 'Melody');
    const program = isBeat ? undefined : (INSTRUMENT_GM_PROGRAM[track.instrumentId] ?? 0);

    const isPerColourKey = state.keyMode === 'perColour';
    const rootName = NOTE_NAMES[key.root];
    const keyText = isPerColourKey
      ? `Key: ${rootName} ${key.scale}`
      : undefined;

    const trackName = isPerColourKey
      ? `${instName} (${rootName} ${key.scale})`
      : instName;

    midiTracks.push({
      name: trackName,
      channel,
      program,
      keyText,
      notes: repeatedNotes,
    });
  }

  // Include metronome track if requested
  if (options.includeMetronome) {
    const totalBeats = repeats * bars * 4;
    const metronomeNotes: MidiNote[] = [];
    for (let b = 0; b < totalBeats; b++) {
      const isAccent = (b % 4) === 0;
      metronomeNotes.push({
        midi: isAccent ? 76 : 77, // High Wood Block / Low Wood Block
        startTick: b * 480,
        durationTicks: 60,
        velocity: isAccent ? 100 : 70,
      });
    }
    midiTracks.push({
      name: 'Metronome',
      channel: 9,
      notes: metronomeNotes,
    });
  }

  // Master key signature from base root and scale
  const masterKeySig = rootAndScaleToKeySig(rootNote, scaleName);

  const songInput: MidiSongInput = {
    title: rawTitle,
    bpm,
    ticksPerQuarter: 480,
    timeSignature: [4, 4],
    keySignature: masterKeySig,
    tracks: midiTracks,
  };

  const uint8Data = writeStandardMidiFile(songInput);
  const arrayBuf = uint8Data.buffer.slice(
    uint8Data.byteOffset,
    uint8Data.byteOffset + uint8Data.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuf], { type: 'audio/midi' });
  const filename = buildExportFilename(rawTitle, bpm, 'mid');
  const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : '';

  return { blob, filename, url };
}

/**
 * Triggers browser download of a MIDI file, compatible with desktop and iOS Safari.
 */
export function downloadMidiFile(result: MidiExportResult): void {
  const a = document.createElement('a');
  a.href = result.url;
  a.download = result.filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
  }, 100);
}
