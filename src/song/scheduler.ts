import { Song, SongPlacement, SongAsset, SongLane } from './types';
import { buildProjectEvents, ProjectScheduledEvents } from '../audio/projectEvents';
import { DrumKitId, DrumSoundId } from '../audio/drums';
import { BeatFlowStyle } from '../state';

export interface ScheduledSongNoteEvent {
  kind: 'note';
  placementId: string;
  laneId: string;
  trackId: string;
  instrumentId: string;
  strokeId: string;
  timeSeconds: number; // absolute seconds on song timeline at songBpm
  timeBars: number; // absolute bar float on song timeline
  durationSeconds: number;
  durationNotation: string;
  midi: number;
  velocity: number;
  normX: number;
  normY: number;
}

export interface ScheduledSongFlowBreakpoint {
  timeSeconds: number;
  timeBars: number;
  freq: number;
  midi: number;
  slideSeconds: number;
  normX: number;
  normY: number;
}

export interface ScheduledSongFlowEvent {
  kind: 'flow';
  placementId: string;
  laneId: string;
  trackId: string;
  instrumentId: string;
  strokeId: string;
  startTimeSeconds: number;
  startTimeBars: number;
  endTimeSeconds: number;
  endTimeBars: number;
  initialFreq: number;
  initialMidi: number;
  velocity: number;
  startX: number;
  startY: number;
  breakpoints: ScheduledSongFlowBreakpoint[];
}

export interface ScheduledSongBeatHitEvent {
  kind: 'beatHit';
  placementId: string;
  laneId: string;
  trackId: string;
  kitId: DrumKitId;
  soundId: DrumSoundId;
  strokeId: string;
  timeSeconds: number;
  timeBars: number;
  velocity: number;
  laneIndex: number;
  normX: number;
  normY: number;
}

export interface ScheduledSongBeatFlowEvent {
  kind: 'beatFlow';
  placementId: string;
  laneId: string;
  trackId: string;
  kitId: DrumKitId;
  strokeId: string;
  style: BeatFlowStyle;
  startTimeSeconds: number;
  startTimeBars: number;
  endTimeSeconds: number;
  endTimeBars: number;
  initialFreqOrY: number;
  initialVelocity: number;
  initialWidth: number;
  rollHits?: Array<{ timeSeconds: number; timeBars: number; normY: number; velocity: number; width: number }>;
  breakpoints?: Array<{ timeSeconds: number; timeBars: number; freqOrY: number; slideSeconds: number; width: number }>;
}

export type ScheduledSongEvent =
  | ScheduledSongNoteEvent
  | ScheduledSongFlowEvent
  | ScheduledSongBeatHitEvent
  | ScheduledSongBeatFlowEvent;

export interface CompiledSongSchedule {
  songId: string;
  bpm: number;
  totalBars: number;
  events: ScheduledSongEvent[];
  eventsByBar: Map<number, ScheduledSongEvent[]>;
  eventsByPlacement: Map<string, ScheduledSongEvent[]>;
}

/**
 * Calculates velocity scaling multiplier from placement gainDb and fade curves.
 */
export function computePlacementGainMultiplier(
  localBar: number,
  lengthBars: number,
  gainDb: number = 0,
  fadeInBars: number = 0,
  fadeOutBars: number = 0
): number {
  let fadeFactor = 1.0;
  if (fadeInBars > 0 && localBar < fadeInBars) {
    fadeFactor = Math.max(0.05, localBar / fadeInBars);
  }
  if (fadeOutBars > 0 && localBar > lengthBars - fadeOutBars) {
    const fromEnd = lengthBars - localBar;
    fadeFactor = Math.min(fadeFactor, Math.max(0.05, fromEnd / fadeOutBars));
  }
  const dbGain = Math.pow(10, (gainDb || 0) / 20);
  return fadeFactor * dbGain;
}

/**
 * Pure function: converts a single placement into scheduled song events.
 */
export function buildPlacementEvents(
  placement: SongPlacement,
  asset: SongAsset,
  songBpm: number,
  options?: {
    isLaneMuted?: boolean;
    isLaneActiveSolo?: boolean;
  }
): ScheduledSongEvent[] {
  // Check muting conditions
  if (placement.mute || options?.isLaneMuted || options?.isLaneActiveSolo === false) {
    return [];
  }

  if (!asset || !asset.project) {
    return [];
  }

  const assetBars = Math.max(1, asset.project.bars || 2);
  const songEvents: ScheduledSongEvent[] = [];

  // Compile raw asset events at the song BPM
  const assetEvents: ProjectScheduledEvents = buildProjectEvents(asset.project, {
    bpm: songBpm,
  });

  const secondsPerBar = 240 / songBpm;
  const lengthBars = placement.lengthBars;
  const offsetBars = placement.offsetBars || 0;
  const transpose = placement.transpose || 0;
  const gainDb = placement.gainDb || 0;
  const fadeInBars = placement.fadeInBars || 0;
  const fadeOutBars = placement.fadeOutBars || 0;

  // Track map to get instrument/kit info
  const trackMap = new Map<string, any>();
  if (Array.isArray(asset.project.tracks)) {
    for (const t of asset.project.tracks) {
      trackMap.set(t.id, t);
    }
  }

  const isColorMuted = (trackId: string): boolean => {
    if (!placement.mutedColors || placement.mutedColors.length === 0) return false;
    return placement.mutedColors.includes(trackId);
  };

  // How many complete or partial loop repeats fit in lengthBars starting from offsetBars?
  const maxRepeats = Math.ceil((lengthBars + offsetBars) / assetBars) + 1;

  for (let repeat = 0; repeat < maxRepeats; repeat++) {
    const loopStartLocalBar = repeat * assetBars - offsetBars;

    // 1. Note Events (discrete notes mode)
    for (const note of assetEvents.noteEvents) {
      if (isColorMuted(note.trackId)) continue;
      const noteBarInAsset = note.normX * assetBars;
      const localBar = loopStartLocalBar + noteBarInAsset;

      if (localBar < 0 || localBar >= lengthBars) continue;

      const songBar = placement.startBar + localBar;
      const timeSeconds = songBar * secondsPerBar;
      const gainMult = computePlacementGainMultiplier(localBar, lengthBars, gainDb, fadeInBars, fadeOutBars);
      const velocity = Math.max(0.05, Math.min(1.0, note.velocity * gainMult));

      // Transpose melodic notes (clamp to 12..120)
      const finalMidi = Math.max(12, Math.min(120, note.midi + transpose));
      const tr = trackMap.get(note.trackId);
      const instrumentId = tr?.instrumentId || 'pluck';

      // Duration: 16th note in seconds
      const durationSeconds = (60 / songBpm) / 4;

      songEvents.push({
        kind: 'note',
        placementId: placement.id,
        laneId: placement.laneId,
        trackId: note.trackId,
        instrumentId,
        strokeId: note.strokeId,
        timeSeconds,
        timeBars: songBar,
        durationSeconds,
        durationNotation: '16n',
        midi: finalMidi,
        velocity,
        normX: note.normX,
        normY: note.normY,
      });
    }

    // 2. Flow Events (melodic flow mode)
    for (const flow of assetEvents.flowEvents) {
      if (isColorMuted(flow.trackId)) continue;
      const flowStartBarInAsset = flow.startX * assetBars;
      const flowEndBarInAsset = flow.startTime !== flow.endTime ? (flow.endTime / (assetBars * 4 * (60 / songBpm))) * assetBars : flowStartBarInAsset + 0.1;

      const localStartBar = loopStartLocalBar + flowStartBarInAsset;
      const localEndBar = loopStartLocalBar + flowEndBarInAsset;

      if (localEndBar <= 0 || localStartBar >= lengthBars) continue;

      // Clamp start & end to placement region
      const clampedLocalStart = Math.max(0, localStartBar);
      const clampedLocalEnd = Math.min(lengthBars, Math.max(clampedLocalStart + 0.05, localEndBar));

      const songStartBar = placement.startBar + clampedLocalStart;
      const songEndBar = placement.startBar + clampedLocalEnd;
      const startTimeSeconds = songStartBar * secondsPerBar;
      const endTimeSeconds = songEndBar * secondsPerBar;

      const gainMult = computePlacementGainMultiplier(clampedLocalStart, lengthBars, gainDb, fadeInBars, fadeOutBars);
      const velocity = Math.max(0.05, Math.min(1.0, flow.velocity * gainMult));

      const freqMultiplier = Math.pow(2, transpose / 12);
      const initialMidi = Math.max(12, Math.min(120, flow.initialMidi + transpose));
      const initialFreq = flow.initialFreq * freqMultiplier;

      const tr = trackMap.get(flow.trackId);
      const instrumentId = tr?.instrumentId || 'pluck';

      // Map breakpoints
      const mappedBreakpoints: ScheduledSongFlowBreakpoint[] = [];
      for (const bp of flow.breakpoints) {
        const bpBarInAsset = bp.normX * assetBars;
        const bpLocalBar = loopStartLocalBar + bpBarInAsset;
        if (bpLocalBar < clampedLocalStart || bpLocalBar > clampedLocalEnd) continue;

        const bpSongBar = placement.startBar + bpLocalBar;
        mappedBreakpoints.push({
          timeSeconds: bpSongBar * secondsPerBar,
          timeBars: bpSongBar,
          freq: bp.freq * freqMultiplier,
          midi: Math.max(12, Math.min(120, bp.midi + transpose)),
          slideSeconds: bp.slideSeconds,
          normX: bp.normX,
          normY: bp.normY,
        });
      }

      songEvents.push({
        kind: 'flow',
        placementId: placement.id,
        laneId: placement.laneId,
        trackId: flow.trackId,
        instrumentId,
        strokeId: flow.strokeId,
        startTimeSeconds,
        startTimeBars: songStartBar,
        endTimeSeconds,
        endTimeBars: songEndBar,
        initialFreq,
        initialMidi,
        velocity,
        startX: flow.startX,
        startY: flow.startY,
        breakpoints: mappedBreakpoints,
      });
    }

    // 3. Beat Hits Events
    for (const hit of assetEvents.beatHitEvents) {
      if (isColorMuted(hit.trackId)) continue;
      const hitBarInAsset = hit.normX * assetBars;
      const localBar = loopStartLocalBar + hitBarInAsset;

      if (localBar < 0 || localBar >= lengthBars) continue;

      const songBar = placement.startBar + localBar;
      const timeSeconds = songBar * secondsPerBar;
      const gainMult = computePlacementGainMultiplier(localBar, lengthBars, gainDb, fadeInBars, fadeOutBars);
      const velocity = Math.max(0.05, Math.min(1.0, hit.velocity * gainMult));

      const tr = trackMap.get(hit.trackId);
      const kitId = tr?.kitId || '808';

      songEvents.push({
        kind: 'beatHit',
        placementId: placement.id,
        laneId: placement.laneId,
        trackId: hit.trackId,
        kitId,
        soundId: hit.soundId,
        strokeId: hit.strokeId,
        timeSeconds,
        timeBars: songBar,
        velocity,
        laneIndex: hit.laneIndex,
        normX: hit.normX,
        normY: hit.normY,
      });
    }

    // 4. Beat Flow Events
    for (const bf of assetEvents.beatFlowEvents) {
      if (isColorMuted(bf.trackId)) continue;
      // Loop loop duration
      const totalLoopSec = assetBars * 4 * (60 / songBpm);
      const bfStartBarInAsset = (bf.startTime / totalLoopSec) * assetBars;
      const bfEndBarInAsset = (bf.endTime / totalLoopSec) * assetBars;

      const localStartBar = loopStartLocalBar + bfStartBarInAsset;
      const localEndBar = loopStartLocalBar + bfEndBarInAsset;

      if (localEndBar <= 0 || localStartBar >= lengthBars) continue;

      const clampedLocalStart = Math.max(0, localStartBar);
      const clampedLocalEnd = Math.min(lengthBars, Math.max(clampedLocalStart + 0.05, localEndBar));

      const songStartBar = placement.startBar + clampedLocalStart;
      const songEndBar = placement.startBar + clampedLocalEnd;

      const gainMult = computePlacementGainMultiplier(clampedLocalStart, lengthBars, gainDb, fadeInBars, fadeOutBars);
      const velocity = Math.max(0.05, Math.min(1.0, bf.initialVelocity * gainMult));

      const tr = trackMap.get(bf.trackId);
      const kitId = tr?.kitId || '808';

      const rollHits = bf.rollHits
        ?.filter((rh) => {
          const rhBar = loopStartLocalBar + (rh.timeSeconds / totalLoopSec) * assetBars;
          return rhBar >= clampedLocalStart && rhBar <= clampedLocalEnd;
        })
        .map((rh) => {
          const rhBar = loopStartLocalBar + (rh.timeSeconds / totalLoopSec) * assetBars;
          const rhSongBar = placement.startBar + rhBar;
          return {
            timeSeconds: rhSongBar * secondsPerBar,
            timeBars: rhSongBar,
            normY: rh.normY,
            velocity: Math.max(0.05, Math.min(1.0, rh.velocity * gainMult)),
            width: rh.width,
          };
        });

      const breakpoints = bf.breakpoints
        ?.filter((bp) => {
          const bpBar = loopStartLocalBar + (bp.timeSeconds / totalLoopSec) * assetBars;
          return bpBar >= clampedLocalStart && bpBar <= clampedLocalEnd;
        })
        .map((bp) => {
          const bpBar = loopStartLocalBar + (bp.timeSeconds / totalLoopSec) * assetBars;
          const bpSongBar = placement.startBar + bpBar;
          return {
            timeSeconds: bpSongBar * secondsPerBar,
            timeBars: bpSongBar,
            freqOrY: bp.freqOrY,
            slideSeconds: bp.slideSeconds,
            width: bp.width,
          };
        });

      songEvents.push({
        kind: 'beatFlow',
        placementId: placement.id,
        laneId: placement.laneId,
        trackId: bf.trackId,
        kitId,
        strokeId: bf.strokeId,
        style: bf.style,
        startTimeSeconds: songStartBar * secondsPerBar,
        startTimeBars: songStartBar,
        endTimeSeconds: songEndBar * secondsPerBar,
        endTimeBars: songEndBar,
        initialFreqOrY: bf.initialFreqOrY,
        initialVelocity: velocity,
        initialWidth: bf.initialWidth,
        rollHits,
        breakpoints,
      });
    }
  }

  return songEvents;
}

/**
 * Pure function: compiles all placements of a song into an organized schedule.
 */
export function buildSongSchedule(song: Song): CompiledSongSchedule {
  const bpm = song.bpm || 90;
  const totalBars = song.totalBars || 16;
  const laneMap = new Map<string, SongLane>();
  let hasAnySolo = false;

  for (const lane of song.lanes) {
    laneMap.set(lane.id, lane);
    if (lane.solo) hasAnySolo = true;
  }

  const allEvents: ScheduledSongEvent[] = [];
  const eventsByBar = new Map<number, ScheduledSongEvent[]>();
  const eventsByPlacement = new Map<string, ScheduledSongEvent[]>();

  for (const placement of song.placements) {
    const lane = laneMap.get(placement.laneId);
    const asset = song.assets[placement.assetId];
    if (!lane || !asset) continue;

    const isLaneMuted = lane.mute;
    const isLaneActiveSolo = hasAnySolo ? lane.solo : true;

    const placementEvents = buildPlacementEvents(placement, asset, bpm, {
      isLaneMuted,
      isLaneActiveSolo,
    });

    eventsByPlacement.set(placement.id, placementEvents);
    allEvents.push(...placementEvents);

    // Group by bar
    for (const ev of placementEvents) {
      const barNum = Math.floor(ev.kind === 'flow' || ev.kind === 'beatFlow' ? ev.startTimeBars : ev.timeBars);
      let list = eventsByBar.get(barNum);
      if (!list) {
        list = [];
        eventsByBar.set(barNum, list);
      }
      list.push(ev);
    }
  }

  // Sort overall events chronologically
  allEvents.sort((a, b) => {
    const timeA = a.kind === 'flow' || a.kind === 'beatFlow' ? a.startTimeSeconds : a.timeSeconds;
    const timeB = b.kind === 'flow' || b.kind === 'beatFlow' ? b.startTimeSeconds : b.timeSeconds;
    return timeA - timeB;
  });

  return {
    songId: song.id,
    bpm,
    totalBars,
    events: allEvents,
    eventsByBar,
    eventsByPlacement,
  };
}

/**
 * Fast lookup: gets all events active within a specified bar window [startBar, endBar).
 */
export function getEventsInWindow(
  schedule: CompiledSongSchedule,
  startBar: number,
  endBar: number
): ScheduledSongEvent[] {
  const events: ScheduledSongEvent[] = [];
  const minBar = Math.floor(startBar);
  const maxBar = Math.ceil(endBar);

  for (let b = minBar; b < maxBar; b++) {
    const barEvents = schedule.eventsByBar.get(b);
    if (barEvents) {
      events.push(...barEvents);
    }
  }

  return events;
}
