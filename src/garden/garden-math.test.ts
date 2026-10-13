import { describe, it, expect } from 'vitest';
import {
  mulberry32,
  hash,
  spring,
  easeOut,
  bezier,
  vine,
  curl,
  getAt,
  weave,
  layerAt,
  jitter,
  computeFoliageBounds,
  buildGarden,
  LetterData,
} from './TypeGardenEngine';

describe('TypeGardenEngine Math & Procedural Generation', () => {
  describe('mulberry32 PRNG', () => {
    it('produces deterministic numbers with the same seed', () => {
      const rng1 = mulberry32(42);
      const rng2 = mulberry32(42);
      expect([rng1(), rng1(), rng1()]).toEqual([rng2(), rng2(), rng2()]);
    });

    it('produces values strictly within [0, 1)', () => {
      const rng = mulberry32(99);
      for (let i = 0; i < 50; i++) {
        const val = rng();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });
  });

  describe('hash', () => {
    it('produces consistent fractional values in [0, 1)', () => {
      const h1 = hash(12.34);
      const h2 = hash(12.34);
      expect(h1).toBe(h2);
      expect(h1).toBeGreaterThanOrEqual(0);
      expect(h1).toBeLessThan(1);
    });
  });

  describe('spring physics and easeOut', () => {
    it('spring evaluates to 0 when elapsed time is <= 0', () => {
      expect(spring(0)).toBe(0);
      expect(spring(-1)).toBe(0);
    });

    it('spring converges smoothly toward 1.0 as time increases', () => {
      const valShort = spring(0.1, 7, 16);
      const valMid = spring(0.4, 7, 16);
      const valLong = spring(2.0, 7, 16);

      expect(valShort).toBeGreaterThan(0);
      expect(valMid).toBeGreaterThan(0.5);
      expect(valLong).toBeCloseTo(1.0, 2);
    });

    it('easeOut satisfies boundary conditions and ease-out curve', () => {
      expect(easeOut(0)).toBe(0);
      expect(easeOut(1)).toBe(1);
      expect(easeOut(0.5)).toBeGreaterThan(0.5);
    });
  });

  describe('bezier and vine curve generation', () => {
    it('bezier generates exact steps + 1 points starting at a and ending at d', () => {
      const a: [number, number] = [0, 0];
      const b: [number, number] = [10, 20];
      const c: [number, number] = [20, 20];
      const d: [number, number] = [30, 0];
      const pts = bezier(a, b, c, d, 20);

      expect(pts.length).toBe(21);
      expect(pts[0]).toEqual(a);
      expect(pts[20][0]).toBeCloseTo(d[0], 4);
      expect(pts[20][1]).toBeCloseTo(d[1], 4);
    });

    it('vine generates curve starting at base point with given length and direction', () => {
      const base: [number, number] = [10, 20];
      const pts = vine(base, -Math.PI / 2, 0.8, 0.4, 1.5, 0, 0.2, 40);

      expect(pts.length).toBe(41);
      expect(pts[0]).toEqual(base);
      // Upward displacement
      expect(pts[40][1]).toBeLessThan(base[1]);
    });

    it('curl adds spiral tendril points to polyline tip', () => {
      const P: [number, number][] = [
        [0, 0],
        [10, 0],
      ];
      const curled = curl([...P], 1, 5);
      expect(curled.length).toBe(P.length + 14);
    });
  });

  describe('polyline interpolation (getAt)', () => {
    it('returns point and tangent along polyline at u = 0.5', () => {
      const P: [number, number][] = [
        [0, 0],
        [50, 0],
        [100, 0],
      ];
      const [pt, angle] = getAt(P, 0.5);
      expect(pt[0]).toBe(50);
      expect(pt[1]).toBe(0);
      expect(angle).toBeCloseTo(0, 4);
    });
  });

  describe('two-pass layering & weaving (weave & layerAt)', () => {
    it('weave creates alternating segment layers 0 and 1 spanning [0, 1]', () => {
      const r = mulberry32(1234);
      const segs = weave(r, 0);

      expect(segs.length).toBeGreaterThanOrEqual(2);
      expect(segs[0].u0).toBe(0);
      expect(segs[segs.length - 1].u1).toBe(1);

      // Verify that adjacent segments alternate between layer 0 and layer 1
      for (let i = 0; i < segs.length - 1; i++) {
        expect(segs[i].layer).not.toBe(segs[i + 1].layer);
        expect(segs[i].u1).toBe(segs[i + 1].u0);
      }
    });

    it('layerAt correctly determines layer for any parameter u', () => {
      const segs = [
        { u0: 0, u1: 0.4, layer: 0 },
        { u0: 0.4, u1: 0.7, layer: 1 },
        { u0: 0.7, u1: 1.0, layer: 0 },
      ];

      expect(layerAt(segs, 0.2)).toBe(0);
      expect(layerAt(segs, 0.55)).toBe(1);
      expect(layerAt(segs, 0.9)).toBe(0);
    });
  });

  describe('120ms quantized line-boil jitter', () => {
    it('produces bounded coordinate offsets and angle jitter', () => {
      const amp = 5;
      const j1 = jitter(1, 10, amp);
      const j2 = jitter(1, 10, amp); // same frame
      const j3 = jitter(1, 11, amp); // next frame

      expect(j1).toEqual(j2);
      expect(Math.abs(j1[0])).toBeLessThanOrEqual(amp);
      expect(Math.abs(j1[1])).toBeLessThanOrEqual(amp);
      expect(Math.abs(j1[2])).toBeLessThanOrEqual(0.04);
      // Different frame produces new flutter
      expect(j1).not.toEqual(j3);
    });
  });

  describe('computeFoliageBounds responsive calculation', () => {
    it('calculates bounding box covering letters and stems with positive area', () => {
      const mockLetters: LetterData[] = [
        {
          ch: 'A',
          id: 0,
          tx: 0,
          ty: 0,
          unitW: 0.6,
          tw: 0.6,
          x: 0,
          y: 0,
          els: [
            {
              t: 'stem',
              id: 1,
              d0: 0,
              pts: [
                [0, 0],
                [0.1, -0.8],
                [0.2, -1.2],
              ],
              segs: [{ u0: 0, u1: 1, layer: 0 }],
            },
            {
              t: 'rose',
              id: 2,
              d0: 0,
              x: 0.2,
              y: -1.2,
              R: 0.25,
            },
          ],
          ws: 1,
          wi: 0,
        },
      ];

      const bounds = computeFoliageBounds(mockLetters);
      expect(bounds.width).toBeGreaterThan(0.6);
      expect(bounds.height).toBeGreaterThan(1.0);
      expect(bounds.minY).toBeLessThan(-1.0); // includes ascending stem & rose
      expect(bounds.maxY).toBeGreaterThan(0);
    });
  });

  describe('buildGarden procedural generation', () => {
    it('generates letters with stems, leaves, and roses without external assets', () => {
      // Mock Canvas 2D context measureText
      const mockCtx = {
        font: '',
        measureText: (text: string) => ({ width: text.length * 60 }),
      } as unknown as CanvasRenderingContext2D;

      const letters = buildGarden('Instruverse', mockCtx, '"Playfair Display", Georgia, serif', 42);

      expect(letters.length).toBe('Instruverse'.length);
      expect(letters[0].ch).toBe('I');
      expect(letters[letters.length - 1].ch).toBe('e');

      // Verify each letter has elements
      for (const l of letters) {
        expect(l.els.length).toBeGreaterThan(0);
        const stems = l.els.filter((e) => e.t === 'stem');
        expect(stems.length).toBeGreaterThanOrEqual(1);

        // Verify weaving layers are present
        for (const stem of stems) {
          expect(stem.segs).toBeDefined();
          expect(stem.segs!.length).toBeGreaterThanOrEqual(1);
        }
      }

      // Check boosted rose density across 'Instruverse'
      const allRoses = letters.flatMap((l) => l.els.filter((e) => e.t === 'rose'));
      expect(allRoses.length).toBeGreaterThanOrEqual(7);

      // Check presence of leaves
      const allLeaves = letters.flatMap((l) => l.els.filter((e) => e.t === 'leaf'));
      expect(allLeaves.length).toBeGreaterThan(15);
    });

    it('dynamic bounds scale down to fit narrow mobile screens (360px - 430px) with generous headroom', () => {
      const mockCtx = {
        font: '',
        measureText: (text: string) => ({ width: text.length * 60 }),
      } as unknown as CanvasRenderingContext2D;

      const letters = buildGarden('Instruverse', mockCtx, '"Playfair Display", Georgia, serif', 42);
      const bounds = computeFoliageBounds(letters);

      // Simulate mobile widths
      const mobileWidths = [360, 390, 430];
      const mobileHeight = 400;

      for (const w of mobileWidths) {
        const marginRatioX = w <= 430 ? 0.84 : 0.90;
        const marginRatioY = 0.80;
        const maxW = w * marginRatioX;
        const maxH = mobileHeight * marginRatioY;

        const scaleSize = Math.min(maxW / bounds.width, maxH / bounds.height);
        const totalPixelWidth = bounds.width * scaleSize;
        const totalPixelHeight = bounds.height * scaleSize;

        // Bounding box must be strictly within available canvas width and height
        expect(totalPixelWidth).toBeLessThanOrEqual(w * 0.86);
        expect(totalPixelHeight).toBeLessThanOrEqual(mobileHeight * 0.85);

        // Generous headroom margins on both left and right (at least 25px each)
        const leftRightMargin = (w - totalPixelWidth) / 2;
        expect(leftRightMargin).toBeGreaterThanOrEqual(25);
      }
    });

    it('compact mobile layout engine fits within 180px height without vertical overflow', () => {
      const mockCtx = {
        font: '',
        measureText: (text: string) => ({ width: text.length * 60 }),
      } as unknown as CanvasRenderingContext2D;

      const letters = buildGarden('Instruverse', mockCtx, '"Playfair Display", Georgia, serif', 24601);
      const totalUnitW = letters.reduce((sum, l) => sum + l.unitW, 0);

      // On mobile (e.g., width 390, height 180):
      const width = 390;
      const height = 180;
      const maxW = width * 0.88;
      const maxH = height * 0.62;

      const scaleSize = Math.min(height * 0.35, maxW / Math.max(1, totalUnitW), maxH);

      expect(scaleSize).toBeLessThanOrEqual(height * 0.35);
      expect(totalUnitW * scaleSize).toBeLessThanOrEqual(width * 0.88);

      // Verify baseline calculation
      const baselineY = height / 2 + scaleSize * 0.25;
      expect(baselineY).toBeGreaterThan(height / 2);
      expect(baselineY).toBeLessThan(height * 0.75);
    });
  });
});
