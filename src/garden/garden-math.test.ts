import { describe, it, expect } from 'vitest';
import {
  createRng,
  clamp,
  easeOutCubic,
  evaluateSpring,
  generateVineCurve,
  computeGardenWindSway,
  computeGardenGust,
  computePointerLean,
  computeBoilOffset,
  generateWordmarkGarden,
} from './garden-math';

describe('garden-math (Wordmark Garden)', () => {
  describe('createRng (Mulberry32)', () => {
    it('produces deterministic numbers with the same seed', () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);
      expect([rng1(), rng1(), rng1()]).toEqual([rng2(), rng2(), rng2()]);
    });

    it('produces values strictly within [0, 1)', () => {
      const rng = createRng(99);
      for (let i = 0; i < 50; i++) {
        const val = rng();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe('clamp and easeOutCubic', () => {
    it('clamps values accurately', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(4, 0, 10)).toBe(4);
    });

    it('computes cubic ease-out correctly', () => {
      expect(easeOutCubic(0)).toBeCloseTo(0, 5);
      expect(easeOutCubic(1)).toBeCloseTo(1, 5);
      expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // Fast initial rise
    });
  });

  describe('evaluateSpring physics', () => {
    it('starts at 0 when elapsed time is 0 or negative', () => {
      expect(evaluateSpring(0)).toBe(0);
      expect(evaluateSpring(-1)).toBe(0);
    });

    it('converges smoothly toward 1.0 as time increases', () => {
      const valShort = evaluateSpring(0.1, 8, 14);
      const valMid = evaluateSpring(0.4, 8, 14);
      const valLong = evaluateSpring(2.0, 8, 14);

      expect(valShort).toBeGreaterThan(0);
      expect(valMid).toBeGreaterThan(valShort);
      expect(valLong).toBeCloseTo(1.0, 2);
    });
  });

  describe('generateVineCurve', () => {
    it('generates exact 41 points for 40 segments starting at origin', () => {
      const origin = { x: 50, y: 100 };
      const points = generateVineCurve(origin, -Math.PI / 2, 120, 0.5, 1.5, 0.3, 40);

      expect(points.length).toBe(41);
      expect(points[0]).toEqual(origin);
      // Last point is displaced upward
      expect(points[40].y).toBeLessThan(origin.y);
    });
  });

  describe('computeGardenWindSway and Gust', () => {
    it('sway is 0 at base and non-zero along vine', () => {
      expect(computeGardenWindSway(1.0, 100, 0)).toBe(0);
      expect(Math.abs(computeGardenWindSway(1.0, 100, 1.0))).toBeGreaterThan(0);
    });

    it('gust is 0 outside the sweep window', () => {
      const result = computeGardenGust(5.0, 600, 300, 1.0, 100);
      expect(result.offsetX).toBe(0);
      expect(result.angleRot).toBe(0);
    });

    it('gust deflects positively during the wave sweep', () => {
      const result = computeGardenGust(1.0, 600, 100, 1.0, 100);
      expect(result.offsetX).toBeGreaterThanOrEqual(0);
    });
  });

  describe('computePointerLean', () => {
    it('returns zero deflection when pointer is null or beyond radius', () => {
      const pt = { x: 100, y: 100 };
      expect(computePointerLean(pt, null, 1.0)).toEqual({ dx: 0, dy: 0 });
      expect(computePointerLean(pt, { x: 800, y: 800 }, 1.0)).toEqual({ dx: 0, dy: 0 });
    });

    it('attracts toward nearby pointer', () => {
      const pt = { x: 100, y: 100 };
      const pointer = { x: 150, y: 100 };
      const lean = computePointerLean(pt, pointer, 1.0);
      expect(lean.dx).toBeGreaterThan(0);
      expect(lean.dy).toBeCloseTo(0, 3);
    });
  });

  describe('computeBoilOffset', () => {
    it('produces small bounded jitter', () => {
      const unit = 100;
      for (let t = 0; t < 1.0; t += 0.15) {
        const offset = computeBoilOffset(1, t, unit);
        expect(Math.abs(offset.bx)).toBeLessThanOrEqual(unit * 0.02);
        expect(Math.abs(offset.by)).toBeLessThanOrEqual(unit * 0.02);
      }
    });
  });

  describe('generateWordmarkGarden', () => {
    it('creates vines with roses, leaves, and buds matching artwork specs', () => {
      const garden = generateWordmarkGarden(400, 160, 42);
      expect(garden.vines.length).toBe(8);

      const roses = garden.vines.filter((v) => v.rose !== null);
      expect(roses.length).toBeGreaterThanOrEqual(4);

      for (const vine of garden.vines) {
        expect(vine.segments.length).toBe(41);
        expect(vine.leaves.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('is completely deterministic with fixed seed', () => {
      const g1 = generateWordmarkGarden(500, 200, 123);
      const g2 = generateWordmarkGarden(500, 200, 123);
      expect(g1.vines[0].segments[20]).toEqual(g2.vines[0].segments[20]);
    });
  });
});
