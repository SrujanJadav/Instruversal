import { describe, it, expect } from 'vitest';
import {
  createRng,
  clamp,
  easeOutCubic,
  evaluateCubicBezier,
  evaluateCubicBezierTangent,
  computeGustWave,
  computeWindSway,
  computeRoseBreathing,
  computeButterflyMotion,
  generateGarden,
} from './garden-math';

describe('garden-math', () => {
  describe('createRng (Mulberry32)', () => {
    it('produces deterministic numbers with the same seed', () => {
      const rng1 = createRng(12345);
      const rng2 = createRng(12345);
      const seq1 = [rng1(), rng1(), rng1(), rng1()];
      const seq2 = [rng2(), rng2(), rng2(), rng2()];
      expect(seq1).toEqual(seq2);
    });

    it('produces different sequences with different seeds', () => {
      const rng1 = createRng(12345);
      const rng2 = createRng(54321);
      expect(rng1()).not.toEqual(rng2());
    });

    it('produces numbers strictly within [0, 1)', () => {
      const rng = createRng(99);
      for (let i = 0; i < 100; i++) {
        const val = rng();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe('clamp and easeOutCubic', () => {
    it('clamps values correctly', () => {
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
      expect(clamp(5, 0, 10)).toBe(5);
    });

    it('satisfies easing boundary conditions', () => {
      expect(easeOutCubic(0)).toBeCloseTo(0, 5);
      expect(easeOutCubic(1)).toBeCloseTo(1, 5);
      expect(easeOutCubic(-0.5)).toBeCloseTo(0, 5);
      expect(easeOutCubic(1.5)).toBeCloseTo(1, 5);
    });

    it('is strictly monotonically increasing in [0, 1]', () => {
      let prev = -1;
      for (let t = 0; t <= 1.0; t += 0.1) {
        const val = easeOutCubic(t);
        expect(val).toBeGreaterThan(prev);
        prev = val;
      }
    });
  });

  describe('evaluateCubicBezier and tangent', () => {
    const p0 = { x: 0, y: 100 };
    const p1 = { x: 10, y: 70 };
    const p2 = { x: 20, y: 30 };
    const p3 = { x: 30, y: 0 };

    it('evaluates endpoints accurately at t=0 and t=1', () => {
      const start = evaluateCubicBezier(p0, p1, p2, p3, 0);
      const end = evaluateCubicBezier(p0, p1, p2, p3, 1);
      expect(start.x).toBeCloseTo(p0.x, 3);
      expect(start.y).toBeCloseTo(p0.y, 3);
      expect(end.x).toBeCloseTo(p3.x, 3);
      expect(end.y).toBeCloseTo(p3.y, 3);
    });

    it('interpolates midpoint smoothly within bounding box', () => {
      const mid = evaluateCubicBezier(p0, p1, p2, p3, 0.5);
      expect(mid.x).toBeGreaterThan(p0.x);
      expect(mid.x).toBeLessThan(p3.x);
      expect(mid.y).toBeLessThan(p0.y);
      expect(mid.y).toBeGreaterThan(p3.y);
    });

    it('calculates tangent angle without NaN', () => {
      const angleStart = evaluateCubicBezierTangent(p0, p1, p2, p3, 0);
      const angleMid = evaluateCubicBezierTangent(p0, p1, p2, p3, 0.5);
      const angleEnd = evaluateCubicBezierTangent(p0, p1, p2, p3, 1);
      expect(Number.isNaN(angleStart)).toBe(false);
      expect(Number.isNaN(angleMid)).toBe(false);
      expect(Number.isNaN(angleEnd)).toBe(false);
    });
  });

  describe('computeGustWave', () => {
    it('returns zero outside of the active traveling wave duration', () => {
      // Period is 12s, sweep duration is 2.4s. At t=6s, gust should be 0.
      expect(computeGustWave(6.0, 1000, 500)).toBe(0);
      expect(computeGustWave(10.0, 1000, 200)).toBe(0);
    });

    it('produces positive wave peak traveling across space', () => {
      // At t=1.2s (mid-sweep), wave center is near middle of screen (500)
      const centerVal = computeGustWave(1.2, 1000, 500);
      const farVal = computeGustWave(1.2, 1000, 50);
      expect(centerVal).toBeGreaterThan(0);
      expect(centerVal).toBeGreaterThan(farVal);
    });
  });

  describe('computeWindSway', () => {
    it('is zero at stem root (h=0) regardless of time or gusts', () => {
      expect(computeWindSway(100, 0, 1.5, 0)).toBeCloseTo(0, 5);
      expect(computeWindSway(100, 0, 1.5, 1.5)).toBeCloseTo(0, 5);
    });

    it('increases deflection with height fraction', () => {
      const swayMid = Math.abs(computeWindSway(100, 0.5, 2.0, 0));
      const swayTip = Math.abs(computeWindSway(100, 1.0, 2.0, 0));
      // Deflection formula uses h^1.6, so tip should have significantly higher amplitude
      expect(swayTip).toBeGreaterThanOrEqual(swayMid);
    });

    it('amplifies deflection during gusts', () => {
      const calmTip = Math.abs(computeWindSway(100, 1.0, 3.5, 0));
      const gustTip = Math.abs(computeWindSway(100, 1.0, 3.5, 2.0));
      expect(gustTip).toBeGreaterThan(calmTip);
    });
  });

  describe('computeRoseBreathing', () => {
    it('stays strictly within 0.96 and 1.04 breathing range', () => {
      for (let t = 0; t < 20; t += 0.5) {
        const scale0 = computeRoseBreathing(t, 0);
        const scale1 = computeRoseBreathing(t, 1);
        expect(scale0).toBeGreaterThanOrEqual(0.959);
        expect(scale0).toBeLessThanOrEqual(1.041);
        expect(scale1).toBeGreaterThanOrEqual(0.959);
        expect(scale1).toBeLessThanOrEqual(1.041);
      }
    });
  });

  describe('computeButterflyMotion', () => {
    it('stays within drift boundary range and oscillates wings', () => {
      const butterfly = {
        id: 0,
        side: 'left' as const,
        anchorX: 100,
        anchorY: 150,
        driftRangeX: 20,
        driftRangeY: 15,
        speed: 1.0,
        phaseOffset: 0,
        colorName: 'plum' as const,
      };

      for (let t = 0; t < 5; t += 0.25) {
        const motion = computeButterflyMotion(butterfly, t);
        expect(Math.abs(motion.x - butterfly.anchorX)).toBeLessThanOrEqual(butterfly.driftRangeX + 0.1);
        expect(Math.abs(motion.y - butterfly.anchorY)).toBeLessThanOrEqual(butterfly.driftRangeY + 0.1);
        expect(Math.abs(motion.wingAngle)).toBeLessThanOrEqual(0.75);
      }
    });
  });

  describe('generateGarden calm zone enforcement', () => {
    it('enforces calm central zone on mobile (40% open center)', () => {
      const landscape = generateGarden(400, 800, 42);
      expect(landscape.isMobile).toBe(true);
      // Calm zone center 40%: [120, 280]
      expect(landscape.calmZone.minX).toBeCloseTo(120, 1);
      expect(landscape.calmZone.maxX).toBeCloseTo(280, 1);

      expect(landscape.stems.length).toBeGreaterThanOrEqual(4);
      expect(landscape.stems.length).toBeLessThanOrEqual(8);

      for (const stem of landscape.stems) {
        // Roots must not start in the calm zone
        expect(stem.p0.x < landscape.calmZone.minX || stem.p0.x > landscape.calmZone.maxX).toBe(true);
        // Tips must not end in the calm zone
        expect(stem.p3.x < landscape.calmZone.minX || stem.p3.x > landscape.calmZone.maxX).toBe(true);
      }
    });

    it('enforces calm central zone on desktop (80% open center)', () => {
      const landscape = generateGarden(1200, 800, 42);
      expect(landscape.isMobile).toBe(false);
      // Calm zone center 80%: [120, 1080]
      expect(landscape.calmZone.minX).toBeCloseTo(120, 1);
      expect(landscape.calmZone.maxX).toBeCloseTo(1080, 1);

      expect(landscape.stems.length).toBe(6);

      for (const stem of landscape.stems) {
        // Roots must be in the outer 10% margins
        expect(stem.p0.x < landscape.calmZone.minX || stem.p0.x > landscape.calmZone.maxX).toBe(true);
        // Tips must remain in outer margins
        expect(stem.p3.x < landscape.calmZone.minX || stem.p3.x > landscape.calmZone.maxX).toBe(true);
      }
    });

    it('attaches blooming flowers to 3 to 5 stems', () => {
      const landscapeMobile = generateGarden(400, 800, 42);
      const flowersMobile = landscapeMobile.stems.filter((s) => s.flower !== null);
      expect(flowersMobile.length).toBeGreaterThanOrEqual(3);
      expect(flowersMobile.length).toBeLessThanOrEqual(5);

      const landscapeDesktop = generateGarden(1200, 800, 42);
      const flowersDesktop = landscapeDesktop.stems.filter((s) => s.flower !== null);
      expect(flowersDesktop.length).toBeGreaterThanOrEqual(3);
      expect(flowersDesktop.length).toBeLessThanOrEqual(5);
    });

    it('is completely deterministic with fixed seed', () => {
      const landA = generateGarden(1000, 700, 888);
      const landB = generateGarden(1000, 700, 888);
      expect(landA.stems[0].p3).toEqual(landB.stems[0].p3);
      expect(landA.stems[1].p0).toEqual(landB.stems[1].p0);
    });
  });
});
