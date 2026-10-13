import { state, POLYPHONY_VOICE_COUNTS } from '../state';
import {
  getStrokeBranches,
  findTurningPointIndices,
  simplifyPointsRDP,
  interpolateBranchY,
  MIN_BRANCH_LENGTH,
} from '../audio/branches';
import { getTrackManager } from '../audio/tracks';
import { effectiveKey, buildScaleNotes, yToMidi, midiToNoteName } from '../audio/scales';
import { getTransport } from '../audio/transport';
import { thinFlowEvents, generateFlowEventsFromStrokes } from '../audio/flowScheduler';
import { serializeProject } from '../audio/projectState';

export function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  return Boolean(
    window.location.hash.includes('debug') ||
    window.localStorage.getItem('instruversal:debug') === '1' ||
    window.sessionStorage.getItem('instruversal:debug') === '1'
  );
}

const DEBUG_COLORS = [
  '#FF1744', // Vivid Red
  '#00E676', // Bright Green
  '#00E5FF', // Cyan
  '#FFD600', // Yellow
  '#D500F9', // Magenta
  '#FF9100', // Orange
  '#3D5AFE', // Indigo
  '#1DE9B6', // Teal
];

let debugPanelEl: HTMLElement | null = null;

export function unmountDebugUI(): void {
  if (debugPanelEl) {
    debugPanelEl.remove();
    debugPanelEl = null;
  }
}

export function mountDebugUI(): void {
  if (!isDebugEnabled()) return;
  if (debugPanelEl || typeof document === 'undefined') return;

  debugPanelEl = document.createElement('div');
  debugPanelEl.id = 'dev-debug-panel';
  debugPanelEl.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 10000;
    display: flex;
    gap: 8px;
    background: rgba(28, 26, 22, 0.92);
    border: 1px solid rgba(243, 236, 221, 0.3);
    padding: 6px 10px;
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
    font-family: "DM Mono", monospace;
    font-size: 11px;
    color: #F3ECDD;
    pointer-events: auto;
  `;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.textContent = '📋 Copy project JSON';
  copyBtn.style.cssText = `
    background: #2E3F8F;
    color: #F3ECDD;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  `;

  copyBtn.addEventListener('click', async () => {
    try {
      const proj = serializeProject();
      const jsonStr = JSON.stringify(proj, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      copyBtn.textContent = '✓ Copied JSON!';
      setTimeout(() => {
        copyBtn.textContent = '📋 Copy project JSON';
      }, 2000);
      dumpCurrentStrokesAnalysis();
    } catch (err) {
      console.error('Failed to copy project JSON:', err);
    }
  });

  const dumpBtn = document.createElement('button');
  dumpBtn.type = 'button';
  dumpBtn.textContent = '🔍 Dump Table to Console';
  dumpBtn.style.cssText = `
    background: #3F7A63;
    color: #F3ECDD;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  `;

  dumpBtn.addEventListener('click', () => {
    dumpCurrentStrokesAnalysis();
  });

  debugPanelEl.appendChild(copyBtn);
  debugPanelEl.appendChild(dumpBtn);
  document.body.appendChild(debugPanelEl);
}

/**
 * Requirement 2: DUMP for exact drawing to console in compact tables.
 */
export function dumpCurrentStrokesAnalysis(): void {
  console.group('=== INSTRUVERSAL STEP 1c BRANCH PLAYBACK DUMP ===');

  const tm = getTrackManager();
  const transport = getTransport();
  const currentProgress = transport.getProgress();
  const currentBars = transport.getBars();
  const currentBpm = state.bpm;
  const polyphonySetting = state.polyphony;
  const polyphonyCap = POLYPHONY_VOICE_COUNTS[polyphonySetting] || 8;

  console.log(`Global State: BPM=${currentBpm}, Bars=${currentBars}, Mode=${state.playbackMode}`);
  console.log(`Polyphony setting: "${polyphonySetting}" (Cap = ${polyphonyCap} voices), Currently Thinned: ${state.isThinned}`);
  console.log(`Current Playhead Progress: ${currentProgress.toFixed(4)} (x ≈ ${(currentProgress * 100).toFixed(1)}%)`);

  state.strokes.forEach((stroke, strokeIdx) => {
    const rawPts = stroke.points;
    const simplifiedPts = simplifyPointsRDP(rawPts);
    const turningIndices = findTurningPointIndices(rawPts);
    const branches = getStrokeBranches(stroke);

    const track = tm.getTrack(stroke.trackId);
    const key = track ? effectiveKey(track, state) : { root: state.rootNote, scale: state.scaleName };
    const scaleNotes = buildScaleNotes(key.root, key.scale, 3, 6);

    const flowEvents = generateFlowEventsFromStrokes([stroke], currentBars, currentBpm, scaleNotes, state.glide);
    const { kept: keptFlowEvents } = thinFlowEvents(flowEvents, polyphonyCap);
    const keptIds = new Set(keptFlowEvents.map((e) => e.strokeId));

    console.group(`Stroke #${strokeIdx} (id: ${stroke.id}, track: ${stroke.trackId}, width: ${stroke.width})`);
    console.log(`Raw point count: ${rawPts.length}`);
    console.log(`Simplified point count (RDP ε=0.004): ${simplifiedPts.length}`);
    console.log(`Detected turning points count: ${turningIndices.length}`);
    console.log('Turning point indices:', turningIndices);
    turningIndices.forEach((idx) => {
      const p = rawPts[idx];
      console.log(`  - Turn at index ${idx}: x=${p?.x.toFixed(4)}, y=${p?.y.toFixed(4)}`);
    });

    // Check caps & limits hit
    const limitsHit: string[] = [];
    if (rawPts.length >= 3000) limitsHit.push('Maximum points cap (3000)');
    if (rawPts.length < 2) limitsHit.push('Single tap dot');
    branches.forEach((b) => {
      if (b.xEnd - b.xStart < MIN_BRANCH_LENGTH) limitsHit.push(`Branch ${b.id} below min length (${MIN_BRANCH_LENGTH})`);
    });
    console.log('Limits / merge rules hit:', limitsHit.length > 0 ? limitsHit.join('; ') : 'None');

    // Branch table
    const branchTable = branches.map((b) => {
      const xSpan = b.xEnd - b.xStart;
      let pathLen = 0;
      for (let i = 0; i < b.rawPoints.length - 1; i++) {
        const dx = b.rawPoints[i + 1].x - b.rawPoints[i].x;
        const dy = b.rawPoints[i + 1].y - b.rawPoints[i].y;
        pathLen += Math.sqrt(dx * dx + dy * dy);
      }

      const isCrossingPlayhead = currentProgress >= b.xStart && currentProgress <= b.xEnd;
      const isCrossingHalf = 0.5 >= b.xStart && 0.5 <= b.xEnd;
      const isKept = keptIds.has(b.id) || keptIds.has(stroke.id);

      return {
        id: b.id,
        dir: b.originalDirection,
        xStart: Number(b.xStart.toFixed(4)),
        xEnd: Number(b.xEnd.toFixed(4)),
        xSpan: Number(xSpan.toFixed(4)),
        pts: b.points.length,
        pathLen: Number(pathLen.toFixed(4)),
        priority: Number(b.priority.toFixed(2)),
        kind: b.isSweep ? 'sweep' : 'normal',
        crossesPlayhead: isCrossingPlayhead,
        crossesHalf: isCrossingHalf,
        voiceStatus: isKept ? 'KEPT (Active)' : 'DROPPED (Thinned by cap)',
        yAtPlayhead: isCrossingPlayhead ? Number(interpolateBranchY(b, currentProgress).toFixed(4)) : null,
      };
    });

    console.table(branchTable);

    // Crossings at playhead
    const playheadCrossings = branches
      .filter((b) => currentProgress >= b.xStart && currentProgress <= b.xEnd)
      .map((b) => {
        const y = interpolateBranchY(b, currentProgress);
        const midi = yToMidi(y, scaleNotes);
        const note = midiToNoteName(midi);
        const isKept = keptIds.has(b.id) || keptIds.has(stroke.id);
        return {
          branchId: b.id,
          y: Number(y.toFixed(4)),
          midi,
          note,
          status: isKept ? 'Active' : 'Thinned',
        };
      });

    console.log(`Crossings at Playhead (x=${currentProgress.toFixed(4)}):`, playheadCrossings);

    // Crossings at x = 0.5
    const halfCrossings = branches
      .filter((b) => 0.5 >= b.xStart && 0.5 <= b.xEnd)
      .map((b) => {
        const y = interpolateBranchY(b, 0.5);
        const midi = yToMidi(y, scaleNotes);
        const note = midiToNoteName(midi);
        const isKept = keptIds.has(b.id) || keptIds.has(stroke.id);
        return {
          branchId: b.id,
          y: Number(y.toFixed(4)),
          midi,
          note,
          status: isKept ? 'Active' : 'Thinned',
        };
      });

    console.log(`Crossings at x = 0.5:`, halfCrossings);
    console.groupEnd();
  });

  console.groupEnd();
}

/**
 * Requirement 1: DEV-ONLY DEBUG OVERLAY Canvas Drawing.
 */
export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  if (!isDebugEnabled()) return;

  const transport = getTransport();
  const progress = transport.getProgress();
  const tm = getTrackManager();
  const playheadX = progress * width;
  const polyphonyCap = POLYPHONY_VOICE_COUNTS[state.polyphony] || 8;

  ctx.save();

  // 1. Draw each branch with distinct bright color and labels
  state.strokes.forEach((stroke, strokeIdx) => {
    const rawPts = stroke.points;
    const turningIndices = findTurningPointIndices(rawPts);
    const branches = getStrokeBranches(stroke);

    const track = tm.getTrack(stroke.trackId);
    const key = track ? effectiveKey(track, state) : { root: state.rootNote, scale: state.scaleName };
    const scaleNotes = buildScaleNotes(key.root, key.scale, 3, 6);

    const flowEvents = generateFlowEventsFromStrokes([stroke], transport.getBars(), state.bpm, scaleNotes, state.glide);
    const { kept: keptFlowEvents } = thinFlowEvents(flowEvents, polyphonyCap);
    const keptIds = new Set(keptFlowEvents.map((e) => e.strokeId));

    // Draw turning points as small cyan crosshairs
    turningIndices.forEach((turnIdx) => {
      const pt = rawPts[turnIdx];
      if (!pt) return;
      const px = pt.x * width;
      const py = pt.y * height;

      ctx.beginPath();
      ctx.strokeStyle = '#00FFFF';
      ctx.lineWidth = 1.5;
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#00FFFF';
      ctx.fillText(`T#${turnIdx}`, px + 6, py - 4);
    });

    // Draw branches
    branches.forEach((b, bIdx) => {
      const color = DEBUG_COLORS[(strokeIdx * 4 + bIdx) % DEBUG_COLORS.length];
      const isCrossing = progress >= b.xStart && progress <= b.xEnd;
      const isKept = keptIds.has(b.id) || keptIds.has(stroke.id);
      const pts = b.rawPoints;

      // Draw branch path
      if (pts.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = isCrossing ? 3.5 : 2.0;
        ctx.setLineDash(isKept ? [] : [4, 4]); // Dashed if dropped/thinned
        ctx.moveTo(pts[0].x * width, pts[0].y * height);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x * width, pts[i].y * height);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Branch label at middle point
      const midIdx = Math.floor(pts.length / 2);
      const midPt = pts[midIdx] || pts[0];
      if (midPt) {
        const lx = midPt.x * width;
        const ly = midPt.y * height;
        const statusText = !isKept ? 'THINNED' : isCrossing ? 'SOUNDING' : 'READY';

        ctx.font = 'bold 9px monospace';
        const label = `${b.id} [${b.xStart.toFixed(2)}-${b.xEnd.toFixed(2)}] ${b.originalDirection.toUpperCase()} | ${statusText}`;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(lx - 2, ly - 10, textWidth + 6, 12);

        ctx.fillStyle = color;
        ctx.fillText(label, lx + 1, ly - 1);
      }
    });
  });

  // 2. Playhead crossing list banner
  const crossingInfo: string[] = [];
  state.strokes.forEach((stroke) => {
    const branches = getStrokeBranches(stroke);
    const track = tm.getTrack(stroke.trackId);
    const key = track ? effectiveKey(track, state) : { root: state.rootNote, scale: state.scaleName };
    const scaleNotes = buildScaleNotes(key.root, key.scale, 3, 6);

    branches.forEach((b) => {
      if (progress >= b.xStart && progress <= b.xEnd) {
        const y = interpolateBranchY(b, progress);
        const midi = yToMidi(y, scaleNotes);
        const note = midiToNoteName(midi);
        crossingInfo.push(`${b.id}:${note}`);

        // Draw crossing indicator circle on playhead
        const cy = y * height;
        ctx.beginPath();
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.arc(playheadX, cy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    });
  });

  // Header readout at playhead top
  const headerBanner = `[DEBUG] x=${progress.toFixed(3)} | Crossings (${crossingInfo.length}): ${crossingInfo.join(', ') || 'None'} | Poly: ${state.polyphony}(${polyphonyCap})`;
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  const bannerWidth = ctx.measureText(headerBanner).width;
  ctx.fillRect(Math.max(4, Math.min(width - bannerWidth - 12, playheadX - bannerWidth / 2)), 6, bannerWidth + 12, 18);
  ctx.fillStyle = '#00FF66';
  ctx.fillText(headerBanner, Math.max(10, Math.min(width - bannerWidth - 6, playheadX - bannerWidth / 2 + 6)), 19);

  ctx.restore();
}
