/**
 * garden-render.ts
 *
 * 2D Canvas renderer for the Instruversal Type Garden.
 * Renders botanical stems, tendrils, foliage, blooming roses, and drifting butterflies
 * using strict paper-and-ink design tokens with dynamic theme binding.
 */

import {
  Point2D,
  GardenLandscape,
  GardenStem,
  GardenLeaf,
  TendrilBranch,
  GardenFlower,
  GardenButterfly,
  evaluateCubicBezier,
  evaluateCubicBezierTangent,
  computeGustWave,
  computeWindSway,
  computeRoseBreathing,
  computeButterflyMotion,
  easeOutCubic,
  clamp,
} from './garden-math';

export interface GardenThemePalette {
  paper: string;
  ink: string;
  inkSoft: string;
  vermilion: string;
  indigo: string;
  ochre: string;
  sage: string;
  plum: string;
  slate: string;
  line: string;
}

/**
 * Resolves current theme palette dynamically from document CSS variables.
 * Ensures instant updates when theme changes without page reload.
 */
export function resolveGardenPalette(): GardenThemePalette {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      paper: '#F3ECDD',
      ink: '#1C1A16',
      inkSoft: '#5B554A',
      vermilion: '#D2432A',
      indigo: '#2E3F8F',
      ochre: '#D49A2A',
      sage: '#3F7A63',
      plum: '#7A3A66',
      slate: '#4A5560',
      line: 'rgba(28,26,22,0.14)',
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const getVar = (name: string, fallback: string): string => {
    const val = styles.getPropertyValue(name).trim();
    return val.length > 0 ? val : fallback;
  };

  return {
    paper: getVar('--paper', '#F3ECDD'),
    ink: getVar('--ink', '#1C1A16'),
    inkSoft: getVar('--ink-soft', '#5B554A'),
    vermilion: getVar('--vermilion', '#D2432A'),
    indigo: getVar('--indigo', '#2E3F8F'),
    ochre: getVar('--ochre', '#D49A2A'),
    sage: getVar('--sage', '#3F7A63'),
    plum: getVar('--plum', '#7A3A66'),
    slate: getVar('--slate', '#4A5560'),
    line: getVar('--line', 'rgba(28,26,22,0.14)'),
  };
}

/**
 * Maps color token name to resolved hex/css string.
 */
function getPigment(palette: GardenThemePalette, name: string): string {
  switch (name) {
    case 'vermilion':
      return palette.vermilion;
    case 'indigo':
      return palette.indigo;
    case 'ochre':
      return palette.ochre;
    case 'sage':
      return palette.sage;
    case 'plum':
      return palette.plum;
    case 'slate':
      return palette.slate;
    case 'ink':
      return palette.ink;
    case 'inkSoft':
      return palette.inkSoft;
    default:
      return palette.sage;
  }
}

/**
 * Draws a single botanical stem, its tendrils, leaves, and crowning flower head.
 */
function renderStem(
  ctx: CanvasRenderingContext2D,
  stem: GardenStem,
  growthProgress: number,
  timeSec: number,
  gustMultiplier: number,
  palette: GardenThemePalette
): void {
  // Compute local growth progression for this stem with stagger
  const totalElapsedMs = growthProgress * 2000;
  const stemElapsedMs = totalElapsedMs - stem.growthDelayMs;
  if (stemElapsedMs <= 0) return;

  const localT = clamp(stemElapsedMs / 1400, 0, 1);
  const stemMaxT = easeOutCubic(localT);
  if (stemMaxT <= 0.01) return;

  const stemColor = getPigment(palette, stem.colorName);

  // Sample points along the swayed stem
  const stepCount = Math.max(8, Math.floor(stemMaxT * 28));
  const points: { pt: Point2D; sway: number; t: number; tangent: number }[] = [];

  for (let i = 0; i <= stepCount; i++) {
    const t = (i / stepCount) * stemMaxT;
    const rawPt = evaluateCubicBezier(stem.p0, stem.p1, stem.p2, stem.p3, t);
    const sway = computeWindSway(stem.p0.x, t, timeSec, gustMultiplier);
    const tangent = evaluateCubicBezierTangent(stem.p0, stem.p1, stem.p2, stem.p3, t);

    points.push({
      pt: { x: rawPt.x + sway, y: rawPt.y },
      sway,
      t,
      tangent,
    });
  }

  if (points.length < 2) return;

  // Draw main stem curve
  ctx.save();
  ctx.strokeStyle = stemColor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stem.baseWidth;

  ctx.beginPath();
  ctx.moveTo(points[0].pt.x, points[0].pt.y);

  for (let i = 1; i < points.length; i++) {
    const current = points[i];
    const prev = points[i - 1];
    const midX = (prev.pt.x + current.pt.x) * 0.5;
    const midY = (prev.pt.y + current.pt.y) * 0.5;
    ctx.quadraticCurveTo(prev.pt.x, prev.pt.y, midX, midY);
  }
  const lastPt = points[points.length - 1];
  ctx.lineTo(lastPt.pt.x, lastPt.pt.y);
  ctx.stroke();
  ctx.restore();

  // Draw tendril branches
  for (const tendril of stem.tendrils) {
    if (stemMaxT > tendril.originT) {
      renderTendril(ctx, stem, tendril, points, stemMaxT, timeSec, palette);
    }
  }

  // Draw leaves
  for (const leaf of stem.leaves) {
    if (stemMaxT > leaf.tOnStem) {
      renderLeaf(ctx, stem, leaf, points, stemMaxT, palette);
    }
  }

  // Draw rose flower head at the tip
  if (stem.flower && stemMaxT >= 0.96) {
    const tip = points[points.length - 1];
    const bloomScale = clamp((stemMaxT - 0.7) / 0.3, 0, 1) * computeRoseBreathing(timeSec, stem.flower.stemIndex);
    renderRoseFlower(ctx, tip.pt, tip.tangent, stem.flower, bloomScale, palette);
  }
}

/**
 * Draws a curled tendril branching off a stem point.
 */
function renderTendril(
  ctx: CanvasRenderingContext2D,
  stem: GardenStem,
  tendril: TendrilBranch,
  stemPoints: { pt: Point2D; t: number; tangent: number }[],
  stemMaxT: number,
  _timeSec: number,
  palette: GardenThemePalette
): void {
  // Find point closest to tendril.originT
  let originPt = stemPoints[0];
  for (let i = 1; i < stemPoints.length; i++) {
    if (stemPoints[i].t >= tendril.originT) {
      originPt = stemPoints[i];
      break;
    }
  }

  const tendrilGrowth = clamp((stemMaxT - tendril.originT) / 0.22, 0, 1);
  if (tendrilGrowth <= 0.05) return;

  const angle = originPt.tangent + tendril.angleOffset;
  const currentLength = tendril.length * easeOutCubic(tendrilGrowth);

  // Curl curve control points
  const cpX = originPt.pt.x + Math.cos(angle) * (currentLength * 0.55) + Math.sin(angle) * (tendril.curvature * 14);
  const cpY = originPt.pt.y + Math.sin(angle) * (currentLength * 0.55) - Math.cos(angle) * (tendril.curvature * 14);

  const endX = originPt.pt.x + Math.cos(angle + tendril.curvature * 0.8) * currentLength;
  const endY = originPt.pt.y + Math.sin(angle + tendril.curvature * 0.8) * currentLength;

  ctx.save();
  ctx.strokeStyle = getPigment(palette, stem.colorName === 'slate' ? 'slate' : 'sage');
  ctx.lineWidth = tendril.strokeWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(originPt.pt.x, originPt.pt.y);
  ctx.quadraticCurveTo(cpX, cpY, endX, endY);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a tapered gouache leaf along the stem.
 */
function renderLeaf(
  ctx: CanvasRenderingContext2D,
  _stem: GardenStem,
  leaf: GardenLeaf,
  stemPoints: { pt: Point2D; t: number; tangent: number }[],
  stemMaxT: number,
  palette: GardenThemePalette
): void {
  let originPt = stemPoints[0];
  for (let i = 1; i < stemPoints.length; i++) {
    if (stemPoints[i].t >= leaf.tOnStem) {
      originPt = stemPoints[i];
      break;
    }
  }

  const leafGrowth = clamp((stemMaxT - leaf.tOnStem) / 0.16, 0, 1);
  if (leafGrowth <= 0.05) return;

  const branchAngle = originPt.tangent + (leaf.side * Math.PI) / 2.3 + leaf.angleOffset;
  const len = leaf.length * easeOutCubic(leafGrowth);
  const w = leaf.width * easeOutCubic(leafGrowth);

  const tipX = originPt.pt.x + Math.cos(branchAngle) * len;
  const tipY = originPt.pt.y + Math.sin(branchAngle) * len;

  const normalAngle = branchAngle + Math.PI / 2;
  const sideOffsetX = Math.cos(normalAngle) * (w * 0.5);
  const sideOffsetY = Math.sin(normalAngle) * (w * 0.5);

  const midX = originPt.pt.x + Math.cos(branchAngle) * (len * 0.45);
  const midY = originPt.pt.y + Math.sin(branchAngle) * (len * 0.45);

  ctx.save();
  ctx.fillStyle = getPigment(palette, leaf.colorName);
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.75;

  ctx.beginPath();
  ctx.moveTo(originPt.pt.x, originPt.pt.y);
  ctx.quadraticCurveTo(midX + sideOffsetX, midY + sideOffsetY, tipX, tipY);
  ctx.quadraticCurveTo(midX - sideOffsetX, midY - sideOffsetY, originPt.pt.x, originPt.pt.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Subtle central vein
  ctx.beginPath();
  ctx.moveTo(originPt.pt.x, originPt.pt.y);
  ctx.lineTo(tipX * 0.75 + originPt.pt.x * 0.25, tipY * 0.75 + originPt.pt.y * 0.25);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a blooming layered concentric rose flower head.
 */
function renderRoseFlower(
  ctx: CanvasRenderingContext2D,
  center: Point2D,
  angle: number,
  flower: GardenFlower,
  scale: number,
  palette: GardenThemePalette
): void {
  if (scale <= 0.01) return;

  const primaryCol = getPigment(palette, flower.primaryColor);
  const secondaryCol = getPigment(palette, flower.secondaryColor);
  const r = flower.radius * scale;

  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(angle);

  // Outer ring of petals (5 overlapping arcs)
  const outerPetals = 5;
  for (let i = 0; i < outerPetals; i++) {
    const theta = (i / outerPetals) * Math.PI * 2 + flower.phaseOffset;
    const px = Math.cos(theta) * (r * 0.6);
    const py = Math.sin(theta) * (r * 0.6);
    const petalRadius = r * 0.52;

    ctx.fillStyle = secondaryCol;
    ctx.beginPath();
    ctx.arc(px, py, petalRadius, theta - 0.7, theta + 0.7, false);
    ctx.quadraticCurveTo(0, 0, px + Math.cos(theta - 0.7) * petalRadius, py + Math.sin(theta - 0.7) * petalRadius);
    ctx.closePath();
    ctx.fill();

    // Petal edge line
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // Middle ring of petals (4 arcs)
  const midPetals = 4;
  for (let i = 0; i < midPetals; i++) {
    const theta = (i / midPetals) * Math.PI * 2 + flower.phaseOffset + 0.45;
    const px = Math.cos(theta) * (r * 0.35);
    const py = Math.sin(theta) * (r * 0.35);
    const petalRadius = r * 0.4;

    ctx.fillStyle = primaryCol;
    ctx.beginPath();
    ctx.arc(px, py, petalRadius, theta - 0.8, theta + 0.8, false);
    ctx.quadraticCurveTo(0, 0, px + Math.cos(theta - 0.8) * petalRadius, py + Math.sin(theta - 0.8) * petalRadius);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  // Central rosebud spiral
  ctx.fillStyle = palette.ochre;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.16, 0.4, Math.PI * 1.8);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.08, 1.2, Math.PI * 2.1);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a subtle drifting butterfly / moth.
 */
function renderButterfly(
  ctx: CanvasRenderingContext2D,
  butterfly: GardenButterfly,
  timeSec: number,
  palette: GardenThemePalette
): void {
  const { x, y, wingAngle } = computeButterflyMotion(butterfly, timeSec);
  const color = getPigment(palette, butterfly.colorName);

  ctx.save();
  ctx.translate(x, y);

  // Gentle orientation based on motion
  const heading = butterfly.side === 'left' ? 0.35 : -0.35;
  ctx.rotate(heading);

  // Tiny ink body
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.lineTo(0, 6);
  ctx.stroke();

  // Antennae
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(-3, -9);
  ctx.moveTo(0, -5);
  ctx.lineTo(3, -9);
  ctx.stroke();

  // Wing span flap scale
  const flapScale = Math.cos(wingAngle);

  // Left wing
  ctx.save();
  ctx.scale(flapScale, 1.0);
  ctx.fillStyle = color;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.7;

  // Forewing
  ctx.beginPath();
  ctx.ellipse(-7, -3, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hindwing
  ctx.beginPath();
  ctx.ellipse(-5, 4, 5, 3.5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Right wing
  ctx.save();
  ctx.scale(-flapScale, 1.0);
  ctx.fillStyle = color;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 0.7;

  // Forewing
  ctx.beginPath();
  ctx.ellipse(-7, -3, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hindwing
  ctx.beginPath();
  ctx.ellipse(-5, 4, 5, 3.5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * Main draw routine for a single animation frame of the Type Garden.
 */
export function renderGardenFrame(
  ctx: CanvasRenderingContext2D,
  landscape: GardenLandscape,
  timeSec: number,
  growthProgress: number,
  palette: GardenThemePalette
): void {
  // Clear canvas completely to keep transparency over paper background
  ctx.clearRect(0, 0, landscape.width, landscape.height);

  const gustFactor = computeGustWave(timeSec, landscape.width, landscape.width * 0.5);

  // Render stems
  for (const stem of landscape.stems) {
    renderStem(ctx, stem, growthProgress, timeSec, gustFactor, palette);
  }

  // Render butterflies
  if (growthProgress >= 0.8) {
    for (const butterfly of landscape.butterflies) {
      renderButterfly(ctx, butterfly, timeSec, palette);
    }
  }
}
