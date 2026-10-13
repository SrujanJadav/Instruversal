import { describe, it, expect } from 'vitest';
import { getStrokeBranches, interpolateBranchY } from './branches';
import { generateFlowEventsFromStrokes, thinFlowEvents } from './flowScheduler';
import { Stroke } from '../state';
import { buildScaleNotes } from './scales';

/**
 * Teardrop loop with hook:
 * A closed loop that starts near the hook, goes right along an upper arc,
 * down the right side, back along the bottom arc to the left, up the left side,
 * across the top arc, and has a hook fold at the top.
 * Geometrically, at x = 0.5, the stroke crosses in 4 distinct places:
 * 1. Top hook upper line (y ≈ 0.10)
 * 2. Top hook return line (y ≈ 0.15)
 * 3. Upper return arc (y ≈ 0.28)
 * 4. Bottom arc (y ≈ 0.85)
 */
export function createTeardropWithHook(trackId = 'track-1'): Stroke {
  const points: { x: number; y: number; t: number }[] = [];
  let t = 0;
  function pt(x: number, y: number) {
    points.push({ x, y, t: t++ * 16 });
  }

  // 1. Hook top line moving LTR across x=0.5: (0.45, 0.10) -> (0.60, 0.12)
  for (let i = 0; i <= 10; i++) {
    const f = i / 10;
    pt(0.45 + f * 0.15, 0.10 + f * 0.02);
  }

  // 2. Hook return fold moving RTL across x=0.5: (0.60, 0.12) -> (0.40, 0.20)
  for (let i = 1; i <= 15; i++) {
    const f = i / 15;
    pt(0.60 - f * 0.20, 0.12 + f * 0.08);
  }

  // 3. Upper loop arc moving LTR across x=0.5 (crossing at y ≈ 0.28) to right edge (0.85, 0.60)
  for (let i = 1; i <= 25; i++) {
    const f = i / 25;
    const p0 = { x: 0.40, y: 0.20 };
    const p1 = { x: 0.50, y: 0.28 };
    const p2 = { x: 0.85, y: 0.60 };
    const x = (1 - f) * (1 - f) * p0.x + 2 * (1 - f) * f * p1.x + f * f * p2.x;
    const y = (1 - f) * (1 - f) * p0.y + 2 * (1 - f) * f * p1.y + f * f * p2.y;
    pt(x, y);
  }

  // 4. Bottom loop arc moving RTL across x=0.5 (crossing at y ≈ 0.85) to left edge (0.15, 0.55)
  for (let i = 1; i <= 35; i++) {
    const f = i / 35;
    const p0 = { x: 0.85, y: 0.60 };
    const p1 = { x: 0.50, y: 0.85 };
    const p2 = { x: 0.15, y: 0.55 };
    const x = (1 - f) * (1 - f) * p0.x + 2 * (1 - f) * f * p1.x + f * f * p2.x;
    const y = (1 - f) * (1 - f) * p0.y + 2 * (1 - f) * f * p1.y + f * f * p2.y;
    pt(x, y);
  }

  // 5. Closing top arc moving LTR from left edge (0.15, 0.55) back to hook start (0.45, 0.10)
  for (let i = 1; i <= 25; i++) {
    const f = i / 25;
    const p0 = { x: 0.15, y: 0.55 };
    const p1 = { x: 0.30, y: 0.25 };
    const p2 = { x: 0.45, y: 0.10 };
    const x = (1 - f) * (1 - f) * p0.x + 2 * (1 - f) * f * p1.x + f * f * p2.x;
    const y = (1 - f) * (1 - f) * p0.y + 2 * (1 - f) * f * p1.y + f * f * p2.y;
    pt(x, y);
  }

  return {
    id: 'stroke-teardrop-hook',
    trackId,
    points,
    width: 2.5,
  };
}

export function mirrorStrokeX(stroke: Stroke): Stroke {
  return {
    ...stroke,
    id: `${stroke.id}-mirrored`,
    points: stroke.points.map((p) => ({ ...p, x: 1 - p.x })),
  };
}

export function rotateStroke90(stroke: Stroke): Stroke {
  return {
    ...stroke,
    id: `${stroke.id}-rotated`,
    points: stroke.points.map((p) => ({ ...p, x: p.y, y: 1 - p.x })),
  };
}

export function rotateStroke180(stroke: Stroke): Stroke {
  return {
    ...stroke,
    id: `${stroke.id}-rotated180`,
    points: stroke.points.map((p) => ({ ...p, x: 1 - p.x, y: 1 - p.y })),
  };
}

/**
 * Counts riding playhead dots drawn on the canvas at progress x.
 */
export function countPlayheadDots(stroke: Stroke, progress: number): number {
  const branches = getStrokeBranches(stroke);
  let count = 0;
  for (const branch of branches) {
    const isNearVertical = (branch.xEnd - branch.xStart) < 0.03;
    const effectiveMinX = isNearVertical ? Math.max(0, branch.xStart - 0.015) : branch.xStart;
    const effectiveMaxX = isNearVertical ? Math.min(1, branch.xEnd + 0.015) : branch.xEnd;
    if (progress < effectiveMinX || progress > effectiveMaxX) continue;
    const interpY = interpolateBranchY(branch, progress);
    if (interpY === null || isNaN(interpY)) continue;
    count++;
  }
  return count;
}

describe('Teardrop loop with hook multi-intersection regression (Requirement 4)', () => {
  const scaleNotes = buildScaleNotes(0, 'natural minor', 3, 6);

  describe('Standard Teardrop with Hook', () => {
    it('detects exactly 4 branches crossing at x = 0.5', () => {
      const stroke = createTeardropWithHook();
      const branches = getStrokeBranches(stroke);
      const crossingBranches = branches.filter((b) => 0.5 >= b.xStart && 0.5 <= b.xEnd);
      expect(crossingBranches.length).toBe(4);
    });

    it('schedules exactly 4 flow voice events crossing at x = 0.5 with Polyphony Medium', () => {
      const stroke = createTeardropWithHook();
      const flowEvents = generateFlowEventsFromStrokes([stroke], 2, 90, scaleNotes, 25);
      const { kept } = thinFlowEvents(flowEvents, 8); // Medium = 8 voices
      const loopDuration = 2 * 4 * (60 / 90);
      const targetTime = 0.5 * loopDuration;
      const activeEvents = kept.filter((e) => targetTime >= e.startTime && targetTime <= e.endTime);
      expect(activeEvents.length).toBe(4);
    });

    it('draws exactly 4 riding dots at x = 0.5', () => {
      const stroke = createTeardropWithHook();
      const dots = countPlayheadDots(stroke, 0.5);
      expect(dots).toBe(4);
    });
  });

  describe('Mirrored Variant', () => {
    it('detects exactly 4 branches crossing at x = 0.5', () => {
      const stroke = mirrorStrokeX(createTeardropWithHook());
      const branches = getStrokeBranches(stroke);
      const crossingBranches = branches.filter((b) => 0.5 >= b.xStart && 0.5 <= b.xEnd);
      expect(crossingBranches.length).toBe(4);
    });

    it('schedules exactly 4 flow voice events crossing at x = 0.5 with Polyphony Medium', () => {
      const stroke = mirrorStrokeX(createTeardropWithHook());
      const flowEvents = generateFlowEventsFromStrokes([stroke], 2, 90, scaleNotes, 25);
      const { kept } = thinFlowEvents(flowEvents, 8);
      const loopDuration = 2 * 4 * (60 / 90);
      const targetTime = 0.5 * loopDuration;
      const activeEvents = kept.filter((e) => targetTime >= e.startTime && targetTime <= e.endTime);
      expect(activeEvents.length).toBe(4);
    });

    it('draws exactly 4 riding dots at x = 0.5', () => {
      const stroke = mirrorStrokeX(createTeardropWithHook());
      const dots = countPlayheadDots(stroke, 0.5);
      expect(dots).toBe(4);
    });
  });

  describe('Rotated 180deg Variant (Inverted Teardrop)', () => {
    it('detects exactly 4 branches crossing at x = 0.5', () => {
      const stroke = rotateStroke180(createTeardropWithHook());
      const branches = getStrokeBranches(stroke);
      const crossingBranches = branches.filter((b) => 0.5 >= b.xStart && 0.5 <= b.xEnd);
      expect(crossingBranches.length).toBe(4);
    });

    it('schedules exactly 4 flow voice events crossing at x = 0.5 with Polyphony Medium', () => {
      const stroke = rotateStroke180(createTeardropWithHook());
      const flowEvents = generateFlowEventsFromStrokes([stroke], 2, 90, scaleNotes, 25);
      const { kept } = thinFlowEvents(flowEvents, 8);
      const loopDuration = 2 * 4 * (60 / 90);
      const targetTime = 0.5 * loopDuration;
      const activeEvents = kept.filter((e) => targetTime >= e.startTime && targetTime <= e.endTime);
      expect(activeEvents.length).toBe(4);
    });

    it('draws exactly 4 riding dots at x = 0.5', () => {
      const stroke = rotateStroke180(createTeardropWithHook());
      const dots = countPlayheadDots(stroke, 0.5);
      expect(dots).toBe(4);
    });
  });

  describe('Rotated 90deg Variant', () => {
    it('detects exactly 2 branches crossing at x = 0.5 (geometric axes transposed)', () => {
      const stroke = rotateStroke90(createTeardropWithHook());
      const branches = getStrokeBranches(stroke);
      const crossingBranches = branches.filter((b) => 0.5 >= b.xStart && 0.5 <= b.xEnd);
      // In 90deg rotation, the hook folds along Y at x in [0.10, 0.20], so at x = 0.5 only the 2 main loop arcs cross
      expect(crossingBranches.length).toBe(2);
    });

    it('schedules exactly 2 flow voice events crossing at x = 0.5 with Polyphony Medium', () => {
      const stroke = rotateStroke90(createTeardropWithHook());
      const flowEvents = generateFlowEventsFromStrokes([stroke], 2, 90, scaleNotes, 25);
      const { kept } = thinFlowEvents(flowEvents, 8);
      const loopDuration = 2 * 4 * (60 / 90);
      const targetTime = 0.5 * loopDuration;
      const activeEvents = kept.filter((e) => targetTime >= e.startTime && targetTime <= e.endTime);
      expect(activeEvents.length).toBe(2);
    });

    it('draws exactly 2 riding dots at x = 0.5', () => {
      const stroke = rotateStroke90(createTeardropWithHook());
      const dots = countPlayheadDots(stroke, 0.5);
      expect(dots).toBe(2);
    });
  });
});
