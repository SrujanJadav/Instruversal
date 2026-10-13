/**
 * garden-math.ts
 *
 * Mathematical routines and procedural generators for the Instruversal Type Garden.
 * Computes deterministic botanical curves, calm-zone boundary enforcement,
 * wind sway harmonics, traveling gust envelopes, petal geometry, and flutter paths.
 *
 * Clean-room implementation from first principles.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface TendrilBranch {
  originT: number;
  length: number;
  angleOffset: number;
  curvature: number;
  strokeWidth: number;
}

export interface GardenLeaf {
  tOnStem: number;
  side: -1 | 1;
  length: number;
  width: number;
  angleOffset: number;
  colorName: 'sage' | 'ochre';
}

export interface GardenFlower {
  stemIndex: number;
  petalCount: number;
  radius: number;
  primaryColor: 'vermilion' | 'plum' | 'ochre';
  secondaryColor: 'vermilion' | 'plum' | 'ochre';
  accentColor: 'ochre' | 'ink';
  phaseOffset: number;
}

export interface GardenStem {
  id: number;
  side: 'left' | 'right';
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
  baseWidth: number;
  tipWidth: number;
  colorName: 'sage' | 'slate' | 'ink';
  tendrils: TendrilBranch[];
  leaves: GardenLeaf[];
  flower: GardenFlower | null;
  growthDelayMs: number;
}

export interface GardenButterfly {
  id: number;
  side: 'left' | 'right';
  anchorX: number;
  anchorY: number;
  driftRangeX: number;
  driftRangeY: number;
  speed: number;
  phaseOffset: number;
  colorName: 'plum' | 'ochre' | 'indigo';
}

export interface GardenLandscape {
  width: number;
  height: number;
  isMobile: boolean;
  calmZone: { minX: number; maxX: number };
  stems: GardenStem[];
  butterflies: GardenButterfly[];
}

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
export function createRng(seed: number = 42): () => number {
  let s = (seed ^ 0x9e3779b9) >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(val: number, min: number, max: number): number {
  if (val < min) return min;
  if (val > max) return max;
  return val;
}

/**
 * Standard cubic ease-out for organic botanical growth.
 */
export function easeOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  const inv = 1 - c;
  return 1 - inv * inv * inv;
}

/**
 * Evaluates a point along a cubic Bézier curve at parameter t in [0, 1].
 */
export function evaluateCubicBezier(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number
): Point2D {
  const c = clamp(t, 0, 1);
  const u = 1 - c;
  const uu = u * u;
  const uuu = uu * u;
  const tt = c * c;
  const ttt = tt * c;

  return {
    x: uuu * p0.x + 3 * uu * c * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * c * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/**
 * Evaluates the tangent direction angle (radians) of a cubic Bézier curve.
 */
export function evaluateCubicBezierTangent(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number
): number {
  const c = clamp(t, 0, 1);
  const u = 1 - c;
  const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * c * (p2.x - p1.x) + 3 * c * c * (p3.x - p2.x);
  const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * c * (p2.y - p1.y) + 3 * c * c * (p3.y - p2.y);
  return Math.atan2(dy, dx);
}

/**
 * Computes traveling gust wind wave factor at horizontal position x at time t.
 * Period is 12 seconds, wave sweeps across in 2.2 seconds with a Gaussian decay envelope.
 */
export function computeGustWave(timeSec: number, width: number, x: number): number {
  const period = 12.0;
  const sweepDuration = 2.4;
  const cycleTime = ((timeSec % period) + period) % period;

  if (cycleTime > sweepDuration) {
    return 0;
  }

  const waveProgress = cycleTime / sweepDuration;
  // Center of traveling wave sweeps from left (-100px) to right (width + 100px)
  const waveCenterX = -100 + waveProgress * (width + 200);
  const dist = (x - waveCenterX) / 220;
  const gaussian = Math.exp(-dist * dist);
  // Smooth envelope fade-in and fade-out at start and end of sweep
  const envelope = Math.sin(Math.PI * waveProgress);

  return gaussian * envelope * 1.6;
}

/**
 * Computes horizontal sway offset (in px) for a point on a stem.
 * Amplitude is zero at base (heightFraction = 0) and maximum at tip (heightFraction = 1).
 */
export function computeWindSway(
  baseX: number,
  heightFraction: number,
  timeSec: number,
  gustMultiplier: number
): number {
  const hClamped = clamp(heightFraction, 0, 1);
  // Non-linear deflection: tips deflect much more than trunks
  const deflectionFactor = Math.pow(hClamped, 1.6);

  // Layered dual-harmonic breeze (periods ~4.2s and ~2.8s)
  const waveA = Math.sin(timeSec * 1.496 + baseX * 0.0035) * 6.0;
  const waveB = Math.sin(timeSec * 2.244 + baseX * 0.0065 + 1.2) * 3.5;
  const baseSway = waveA + waveB;

  // Additional gust impulse pushing eastwards with brief secondary wobble
  const gustImpulse = gustMultiplier * 14.0 * Math.sin(timeSec * 3.8 + 0.4);

  return deflectionFactor * (baseSway * (1.0 + gustMultiplier * 0.8) + gustImpulse);
}

/**
 * Computes breathing scale for flower rose heads.
 * Breathes between 0.96 and 1.04 with smooth sinusoidal modulation.
 */
export function computeRoseBreathing(timeSec: number, flowerIndex: number): number {
  const period = 3.6 + (flowerIndex % 3) * 0.45;
  const phase = flowerIndex * 1.35;
  const osc = Math.sin((2 * Math.PI * timeSec) / period + phase);
  return 1.0 + 0.04 * osc;
}

/**
 * Computes butterfly motion coordinates and wing flap angle.
 */
export function computeButterflyMotion(
  butterfly: GardenButterfly,
  timeSec: number
): { x: number; y: number; wingAngle: number } {
  const t = timeSec * butterfly.speed + butterfly.phaseOffset;
  const x = butterfly.anchorX + Math.sin(t * 0.85) * butterfly.driftRangeX;
  const y =
    butterfly.anchorY +
    Math.sin(t * 1.42) * (butterfly.driftRangeY * 0.6) +
    Math.cos(t * 0.65) * (butterfly.driftRangeY * 0.4);

  // Flutter frequency ~8 Hz
  const wingAngle = Math.sin(timeSec * 50.26 + butterfly.phaseOffset * 3) * 0.72;

  return { x, y, wingAngle };
}

/**
 * Generates full procedural landscape model adhering strictly to calm-zone specifications.
 * Center 40% on phone, center 80% on desktop is kept completely open.
 */
export function generateGarden(
  width: number,
  height: number,
  seed: number = 108
): GardenLandscape {
  const rng = createRng(seed);
  const isMobile = width < 768;

  // Calm zone specifications
  const calmMinX = isMobile ? width * 0.3 : width * 0.1;
  const calmMaxX = isMobile ? width * 0.7 : width * 0.9;

  const stemCountPerSide = isMobile ? 2 : 3;
  const stems: GardenStem[] = [];

  let stemIdCounter = 0;

  // Left stems
  for (let i = 0; i < stemCountPerSide; i++) {
    const frac = (i + 0.5) / stemCountPerSide;
    const rootXMin = isMobile ? width * 0.02 : width * 0.015;
    const rootXMax = isMobile ? width * 0.26 : width * 0.085;
    const rootX = rootXMin + (rootXMax - rootXMin) * frac + (rng() - 0.5) * (width * 0.02);

    // Tip stays strictly to the left of the calm zone
    const maxTipX = isMobile ? width * 0.28 : width * 0.095;
    const tipX = rootXMin + rng() * (maxTipX - rootXMin);
    const tipY = height * (0.22 + rng() * 0.28);

    // Control points curve outward / upward
    const p0: Point2D = { x: rootX, y: height + 15 };
    const p1: Point2D = {
      x: rootX + (rng() - 0.3) * (width * 0.04),
      y: height * 0.75 - rng() * (height * 0.08),
    };
    const p2: Point2D = {
      x: tipX + (rng() - 0.2) * (width * 0.03),
      y: tipY + height * 0.25,
    };
    const p3: Point2D = { x: tipX, y: tipY };

    // Sub-elements
    const tendrils: TendrilBranch[] = [
      {
        originT: 0.42 + rng() * 0.12,
        length: 34 + rng() * 22,
        angleOffset: -(0.55 + rng() * 0.45),
        curvature: 0.7 + rng() * 0.5,
        strokeWidth: 1.4,
      },
      {
        originT: 0.65 + rng() * 0.14,
        length: 28 + rng() * 18,
        angleOffset: 0.45 + rng() * 0.4,
        curvature: -0.65 - rng() * 0.45,
        strokeWidth: 1.2,
      },
    ];

    const leaves: GardenLeaf[] = [];
    const leafCount = 4 + Math.floor(rng() * 3);
    for (let l = 0; l < leafCount; l++) {
      leaves.push({
        tOnStem: 0.22 + (l / leafCount) * 0.62 + (rng() - 0.5) * 0.04,
        side: l % 2 === 0 ? -1 : 1,
        length: 18 + rng() * 14,
        width: 7 + rng() * 5,
        angleOffset: (rng() - 0.5) * 0.3,
        colorName: rng() > 0.35 ? 'sage' : 'ochre',
      });
    }

    // 2 left stems have flowers
    const hasFlower = i < 2;
    const flower: GardenFlower | null = hasFlower
      ? {
          stemIndex: stemIdCounter,
          petalCount: 7 + (i % 2) * 2,
          radius: 17 + rng() * 7,
          primaryColor: i % 2 === 0 ? 'vermilion' : 'plum',
          secondaryColor: i % 2 === 0 ? 'ochre' : 'vermilion',
          accentColor: 'ochre',
          phaseOffset: rng() * Math.PI * 2,
        }
      : null;

    stems.push({
      id: stemIdCounter++,
      side: 'left',
      p0,
      p1,
      p2,
      p3,
      baseWidth: 3.5 + rng() * 1.5,
      tipWidth: 1.6,
      colorName: i % 2 === 0 ? 'sage' : 'slate',
      tendrils,
      leaves,
      flower,
      growthDelayMs: i * 140,
    });
  }

  // Right stems
  for (let i = 0; i < stemCountPerSide; i++) {
    const frac = (i + 0.5) / stemCountPerSide;
    const rootXMin = isMobile ? width * 0.74 : width * 0.915;
    const rootXMax = isMobile ? width * 0.98 : width * 0.985;
    const rootX = rootXMin + (rootXMax - rootXMin) * frac + (rng() - 0.5) * (width * 0.02);

    // Tip stays strictly to the right of the calm zone
    const minTipX = isMobile ? width * 0.72 : width * 0.905;
    const tipX = minTipX + rng() * (rootXMax - minTipX);
    const tipY = height * (0.24 + rng() * 0.28);

    const p0: Point2D = { x: rootX, y: height + 15 };
    const p1: Point2D = {
      x: rootX + (rng() - 0.7) * (width * 0.04),
      y: height * 0.75 - rng() * (height * 0.08),
    };
    const p2: Point2D = {
      x: tipX + (rng() - 0.8) * (width * 0.03),
      y: tipY + height * 0.25,
    };
    const p3: Point2D = { x: tipX, y: tipY };

    const tendrils: TendrilBranch[] = [
      {
        originT: 0.4 + rng() * 0.12,
        length: 32 + rng() * 20,
        angleOffset: 0.55 + rng() * 0.45,
        curvature: -0.7 - rng() * 0.5,
        strokeWidth: 1.4,
      },
      {
        originT: 0.67 + rng() * 0.12,
        length: 26 + rng() * 18,
        angleOffset: -(0.45 + rng() * 0.4),
        curvature: 0.65 + rng() * 0.45,
        strokeWidth: 1.2,
      },
    ];

    const leaves: GardenLeaf[] = [];
    const leafCount = 4 + Math.floor(rng() * 3);
    for (let l = 0; l < leafCount; l++) {
      leaves.push({
        tOnStem: 0.24 + (l / leafCount) * 0.6 + (rng() - 0.5) * 0.04,
        side: l % 2 === 0 ? 1 : -1,
        length: 18 + rng() * 14,
        width: 7 + rng() * 5,
        angleOffset: (rng() - 0.5) * 0.3,
        colorName: rng() > 0.35 ? 'sage' : 'ochre',
      });
    }

    const hasFlower = i < 2;
    const flower: GardenFlower | null = hasFlower
      ? {
          stemIndex: stemIdCounter,
          petalCount: 7 + (i % 2) * 2,
          radius: 17 + rng() * 7,
          primaryColor: i % 2 === 0 ? 'ochre' : 'vermilion',
          secondaryColor: i % 2 === 0 ? 'vermilion' : 'plum',
          accentColor: 'ink',
          phaseOffset: rng() * Math.PI * 2,
        }
      : null;

    stems.push({
      id: stemIdCounter++,
      side: 'right',
      p0,
      p1,
      p2,
      p3,
      baseWidth: 3.5 + rng() * 1.5,
      tipWidth: 1.6,
      colorName: i % 2 === 0 ? 'sage' : 'slate',
      tendrils,
      leaves,
      flower,
      growthDelayMs: i * 150 + 80,
    });
  }

  // Butterflies
  const butterflies: GardenButterfly[] = [
    {
      id: 0,
      side: 'left',
      anchorX: isMobile ? width * 0.14 : width * 0.06,
      anchorY: height * 0.18,
      driftRangeX: isMobile ? 18 : 26,
      driftRangeY: 14,
      speed: 0.9,
      phaseOffset: 0.4,
      colorName: 'plum',
    },
  ];

  if (!isMobile) {
    butterflies.push({
      id: 1,
      side: 'right',
      anchorX: width * 0.94,
      anchorY: height * 0.22,
      driftRangeX: 24,
      driftRangeY: 16,
      speed: 0.78,
      phaseOffset: 3.2,
      colorName: 'ochre',
    });
  }

  return {
    width,
    height,
    isMobile,
    calmZone: { minX: calmMinX, maxX: calmMaxX },
    stems,
    butterflies,
  };
}
