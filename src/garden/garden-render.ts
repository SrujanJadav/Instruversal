/**
 * garden-render.ts
 *
 * 2D Canvas renderer for the Wordmark Rose & Vine Garden.
 * Renders blue climbing vines, pointed leaves, blooming red roses with cream spiral details,
 * and soft radial edge blending matching the Instruversal wordmark artwork.
 */

import {
  Vector2D,
  WordmarkGardenModel,
  VineStemModel,
  RoseFlowerModel,
  computeGardenWindSway,
  computeGardenGust,
  computePointerLean,
  computeBoilOffset,
  evaluateSpring,
  clamp,
} from './garden-math';

export interface GardenColorPalette {
  roseRed: string;
  creamLine: string;
  vineBlue: string;
  leafVein: string;
}

export function resolveGardenColors(isDarkTheme: boolean): GardenColorPalette {
  if (isDarkTheme) {
    return {
      roseRed: '#FF1400',
      creamLine: '#FFB4A8',
      vineBlue: '#3257FF',
      leafVein: '#1C2B8F',
    };
  } else {
    return {
      roseRed: '#FF1400',
      creamLine: '#FFD2C4',
      vineBlue: '#1C2B8F',
      leafVein: '#0D174A',
    };
  }
}

/**
 * Computes soft radial feathered alpha falloff towards canvas bounds.
 * Prevents any rectangular edge or box appearance without using CSS gradients.
 */
function computeFeatherAlpha(
  x: number,
  y: number,
  width: number,
  height: number
): number {
  const normX = ((x - width * 0.5) / (width * 0.5));
  const normY = ((y - height * 0.5) / (height * 0.5));
  const distSq = normX * normX + normY * normY;
  // Falloff begins beyond 0.65 radius and reaches 0 at 1.05
  if (distSq < 0.42) return 1.0;
  return clamp(1.0 - (distSq - 0.42) * 1.6, 0.0, 1.0);
}

/**
 * Draws a pointed leaf with a center vein line.
 */
function drawPointedLeaf(
  ctx: CanvasRenderingContext2D,
  origin: Vector2D,
  angle: number,
  length: number,
  width: number,
  scale: number,
  palette: GardenColorPalette,
  alpha: number
): void {
  if (scale <= 0.02 || alpha <= 0.01) return;

  const currentLen = length * scale;
  const currentW = width * scale;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(origin.x, origin.y);
  ctx.rotate(angle);

  // Pointed leaf: widest at ~1/3 length, slightly arched
  const tipX = currentLen;
  const tipY = currentLen * 0.06;
  const cp1X = currentLen * 0.35;
  const cp1Y = -currentW * 0.55;
  const cp2X = currentLen * 0.72;
  const cp2Y = -currentW * 0.28;

  const cp3X = currentLen * 0.72;
  const cp3Y = currentW * 0.28;
  const cp4X = currentLen * 0.35;
  const cp4Y = currentW * 0.55;

  ctx.fillStyle = palette.vineBlue;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, tipX, tipY);
  ctx.bezierCurveTo(cp3X, cp3Y, cp4X, cp4Y, 0, 0);
  ctx.closePath();
  ctx.fill();

  // Darker center vein line
  ctx.strokeStyle = palette.leafVein;
  ctx.lineWidth = Math.max(0.7, currentW * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(currentLen * 0.5, currentLen * 0.04, currentLen * 0.85, currentLen * 0.05);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a blooming red rose with unfurling petals, inner cream spiral, and edge details.
 */
function drawRoseFlower(
  ctx: CanvasRenderingContext2D,
  center: Vector2D,
  rose: RoseFlowerModel,
  elapsedMs: number,
  timeSec: number,
  palette: GardenColorPalette,
  alpha: number
): void {
  const timeSinceSpawn = elapsedMs - rose.spawnTimeMs;
  if (timeSinceSpawn <= 0 || alpha <= 0.01) return;

  const baseSpring = evaluateSpring(timeSinceSpawn / 1000, 8, 14);
  if (baseSpring <= 0.02) return;

  // Breathing modulation: ~4s period
  const breathing = 1.0 + 0.04 * Math.sin((timeSec * Math.PI * 2) / 4.0 + rose.vineId * 1.5);
  const currentRadius = rose.radius * baseSpring * breathing;

  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(center.x, center.y);

  // Draw 6 petals back-to-front with wobble
  for (const petal of rose.petals) {
    const petalTime = timeSinceSpawn - petal.staggerMs;
    const petalSpring = evaluateSpring(petalTime / 1000, 8, 14);
    if (petalSpring <= 0.02) continue;

    const rX = petal.radiusX * (currentRadius / rose.radius) * petalSpring;
    const rY = petal.radiusY * (currentRadius / rose.radius) * petalSpring;

    ctx.save();
    ctx.rotate(petal.baseAngle);
    ctx.fillStyle = palette.roseRed;

    // Irregular ellipse with 3 and 5 cycle wobbles along the perimeter
    ctx.beginPath();
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const theta = (s / steps) * Math.PI * 2;
      const wobble =
        1.0 +
        0.06 * Math.sin(theta * petal.wobbleFreqA) +
        0.04 * Math.sin(theta * petal.wobbleFreqB);
      const px = Math.cos(theta) * rX * wobble;
      const py = Math.sin(theta) * rY * wobble;

      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Outer petals carry cream edge arcs if not a tiny bud
    if (rose.hasEdgeDetail && (petal.index === 0 || petal.index === 5)) {
      ctx.strokeStyle = palette.creamLine;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, rX * 0.95, -0.6, 0.6);
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw inner cream spiral once petals begin opening
  if (!rose.isBud && timeSinceSpawn > 350) {
    const spiralSpring = evaluateSpring((timeSinceSpawn - 350) / 1000, 6, 12);
    if (spiralSpring > 0.05) {
      const spiralMaxAngle = rose.spiralTurns * Math.PI * 2 * spiralSpring;
      const maxSpiralR = rose.spiralLength * (currentRadius / rose.radius) * 0.6;

      ctx.save();
      ctx.strokeStyle = palette.creamLine;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();

      const spiralSteps = Math.floor(spiralMaxAngle * 6);
      for (let st = 0; st <= spiralSteps; st++) {
        const phi = (st / (rose.spiralTurns * Math.PI * 2 * 6)) * spiralMaxAngle;
        const currentR = (phi / (rose.spiralTurns * Math.PI * 2)) * maxSpiralR;
        const sx = Math.cos(phi) * currentR;
        const sy = Math.sin(phi) * currentR;

        if (st === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

/**
 * Draws a single vine stem, branching tendrils, thorns, leaves, and blooming roses.
 */
function drawVine(
  ctx: CanvasRenderingContext2D,
  vine: VineStemModel,
  elapsedMs: number,
  timeSec: number,
  canvasWidth: number,
  canvasHeight: number,
  letterUnitSize: number,
  pointerPos: Vector2D | null,
  palette: GardenColorPalette
): void {
  const vineGrowthFrac = clamp(elapsedMs / vine.totalGrowthDurationMs, 0, 1);
  if (vineGrowthFrac <= 0.01) return;

  const totalPoints = vine.segments.length; // 41
  const visibleSegmentCount = Math.max(2, Math.floor(vineGrowthFrac * (totalPoints - 1)));

  // Transform backbone points with dynamics: wind, gust, boil, pointer lean
  const swayedPoints: Vector2D[] = [];
  for (let i = 0; i <= visibleSegmentCount; i++) {
    const orig = vine.segments[i];
    const hFrac = i / (totalPoints - 1);

    const windSway = computeGardenWindSway(timeSec, vine.basePoint.x, hFrac);
    const gust = computeGardenGust(timeSec, canvasWidth, orig.x, hFrac, letterUnitSize);
    const pointerLean = computePointerLean(orig, pointerPos, hFrac);
    const boil = computeBoilOffset(vine.id * 100 + i, timeSec, letterUnitSize);

    swayedPoints.push({
      x: orig.x + windSway + gust.offsetX + pointerLean.dx + boil.bx,
      y: orig.y + pointerLean.dy + boil.by,
    });
  }

  const tipPt = swayedPoints[swayedPoints.length - 1];
  const featherAlpha = computeFeatherAlpha(tipPt.x, tipPt.y, canvasWidth, canvasHeight);
  if (featherAlpha <= 0.01) return;

  // Draw vine stem path
  ctx.save();
  ctx.globalAlpha *= featherAlpha;
  ctx.strokeStyle = palette.vineBlue;
  ctx.lineWidth = Math.max(1.8, letterUnitSize * 0.045);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(swayedPoints[0].x, swayedPoints[0].y);
  for (let i = 1; i < swayedPoints.length; i++) {
    const prev = swayedPoints[i - 1];
    const curr = swayedPoints[i];
    const mx = (prev.x + curr.x) * 0.5;
    const my = (prev.y + curr.y) * 0.5;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.lineTo(tipPt.x, tipPt.y);
  ctx.stroke();

  // Curled spiral end if fully grown
  if (vine.hasCurlEnd && vineGrowthFrac >= 0.98) {
    const lastSeg = swayedPoints[swayedPoints.length - 1];
    const prevSeg = swayedPoints[swayedPoints.length - 2];
    const endAngle = Math.atan2(lastSeg.y - prevSeg.y, lastSeg.x - prevSeg.x);

    ctx.beginPath();
    ctx.moveTo(lastSeg.x, lastSeg.y);
    const curlR = letterUnitSize * 0.08;
    const cp1x = lastSeg.x + Math.cos(endAngle) * curlR;
    const cp1y = lastSeg.y + Math.sin(endAngle) * curlR;
    const cp2x = lastSeg.x + Math.cos(endAngle + vine.curlAngle * 0.5) * curlR * 1.2;
    const cp2y = lastSeg.y + Math.sin(endAngle + vine.curlAngle * 0.5) * curlR * 1.2;
    const endx = lastSeg.x + Math.cos(endAngle + vine.curlAngle) * curlR * 0.7;
    const endy = lastSeg.y + Math.sin(endAngle + vine.curlAngle) * curlR * 0.7;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endx, endy);
    ctx.stroke();
  }

  // Draw thorns along the stem
  for (const thorn of vine.thorns) {
    if (thorn.segmentIndex < swayedPoints.length - 1) {
      const pA = swayedPoints[thorn.segmentIndex];
      const pB = swayedPoints[thorn.segmentIndex + 1];
      const stemAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
      const thornAngle = stemAngle + thorn.side * 1.3;

      ctx.beginPath();
      ctx.moveTo(pA.x, pA.y);
      ctx.lineTo(pA.x + Math.cos(thornAngle) * thorn.length, pA.y + Math.sin(thornAngle) * thorn.length);
      ctx.stroke();
    }
  }

  ctx.restore();

  // Draw leaves along the vine
  for (const leaf of vine.leaves) {
    if (leaf.segmentIndex < swayedPoints.length - 1) {
      const pA = swayedPoints[leaf.segmentIndex];
      const pB = swayedPoints[leaf.segmentIndex + 1];
      const stemAngle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
      const leafAngle = stemAngle + leaf.baseAngle;

      const leafSpring = evaluateSpring((elapsedMs - leaf.spawnTimeMs) / 1000, 7, 15);
      const leafAlpha = computeFeatherAlpha(pA.x, pA.y, canvasWidth, canvasHeight);

      drawPointedLeaf(
        ctx,
        pA,
        leafAngle,
        leaf.length,
        leaf.width,
        leafSpring,
        palette,
        leafAlpha
      );
    }
  }

  // Draw side branch if present
  if (vine.branch && vine.branch.startSegment < swayedPoints.length) {
    const branchOrigin = swayedPoints[vine.branch.startSegment];
    const branchFrac = clamp((elapsedMs - 600) / (vine.totalGrowthDurationMs * 0.75), 0, 1);
    if (branchFrac > 0.05) {
      const bVisibleCount = Math.max(2, Math.floor(branchFrac * vine.branch.segments.length));
      ctx.save();
      ctx.strokeStyle = palette.vineBlue;
      ctx.lineWidth = Math.max(1.4, letterUnitSize * 0.035);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(branchOrigin.x, branchOrigin.y);

      for (let bi = 1; bi < bVisibleCount; bi++) {
        const bpt = vine.branch.segments[bi];
        ctx.lineTo(bpt.x, bpt.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // Draw roses at vine tip
  if (vine.rose && vineGrowthFrac >= 0.95) {
    const roseAlpha = computeFeatherAlpha(tipPt.x, tipPt.y, canvasWidth, canvasHeight);
    drawRoseFlower(ctx, tipPt, vine.rose, elapsedMs, timeSec, palette, roseAlpha);

    if (vine.secondaryBud && vine.secondaryBud.offsetFromParent) {
      const budPt: Vector2D = {
        x: tipPt.x + vine.secondaryBud.offsetFromParent.x,
        y: tipPt.y + vine.secondaryBud.offsetFromParent.y,
      };
      const budAlpha = computeFeatherAlpha(budPt.x, budPt.y, canvasWidth, canvasHeight);
      drawRoseFlower(ctx, budPt, vine.secondaryBud, elapsedMs, timeSec, palette, budAlpha);
    }
  }
}

/**
 * Main draw routine for a frame of the Wordmark Rose & Vine Garden.
 */
export function renderWordmarkGarden(
  ctx: CanvasRenderingContext2D,
  model: WordmarkGardenModel,
  canvasWidth: number,
  canvasHeight: number,
  elapsedMs: number,
  timeSec: number,
  pointerPos: Vector2D | null,
  isDarkTheme: boolean
): void {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const palette = resolveGardenColors(isDarkTheme);

  // Render vines and blooming roses
  for (const vine of model.vines) {
    drawVine(
      ctx,
      vine,
      elapsedMs,
      timeSec,
      canvasWidth,
      canvasHeight,
      model.letterUnitSize,
      pointerPos,
      palette
    );
  }
}
