import { Stroke } from '../state';
import { Creation, CreationMeta, SimplifiedStroke } from '../library/types';
import { getThemeTokens, getTrackThemeColor, getTheme } from '../ui/theme';
import { GALLERY_CONSTANTS } from './constants';

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  isEmpty: boolean;
}

export interface CardTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Computes bounding box of stroke points with 12% padding and min-span safeguards.
 */
export function computeBoundingBox(
  strokes: (Stroke | SimplifiedStroke)[] | undefined
): BoundingBox {
  if (!strokes || strokes.length === 0) {
    return { minX: 0.2, maxX: 0.8, minY: 0.2, maxY: 0.8, isEmpty: true };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  let totalPoints = 0;
  for (const s of strokes) {
    if (!s.points) continue;
    for (const p of s.points) {
      totalPoints++;
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (totalPoints === 0) {
    return { minX: 0.2, maxX: 0.8, minY: 0.2, maxY: 0.8, isEmpty: true };
  }

  // Safeguard: for tiny drawings or single taps, maintain a minimum span of 0.15
  const minSpan = 0.15;
  const width = maxX - minX;
  const height = maxY - minY;

  if (width < minSpan) {
    const cx = (minX + maxX) / 2;
    minX = Math.max(0, cx - minSpan / 2);
    maxX = Math.min(1, cx + minSpan / 2);
  }

  if (height < minSpan) {
    const cy = (minY + maxY) / 2;
    minY = Math.max(0, cy - minSpan / 2);
    maxY = Math.min(1, cy + minSpan / 2);
  }

  // 12% padding
  const padX = (maxX - minX) * 0.12;
  const padY = (maxY - minY) * 0.12;

  return {
    minX: Math.max(0, minX - padX),
    maxX: Math.min(1, maxX + padX),
    minY: Math.max(0, minY - padY),
    maxY: Math.min(1, maxY + padY),
    isEmpty: false,
  };
}

/**
 * Computes scale and offsets to uniformly fit the bounding box into a portrait card (4:5 ratio).
 */
export function computeCardTransform(
  box: BoundingBox,
  cardWidth: number,
  cardHeight: number
): CardTransform {
  const boxWidth = Math.max(0.001, box.maxX - box.minX);
  const boxHeight = Math.max(0.001, box.maxY - box.minY);

  const cardAspect = cardWidth / cardHeight;
  const boxAspect = boxWidth / boxHeight;

  let scale: number;
  let offsetX = 0;
  let offsetY = 0;

  if (boxAspect > cardAspect) {
    // Drawing is wider than card portrait ratio: fit to width
    scale = cardWidth / boxWidth;
    const drawnHeight = boxHeight * scale;
    offsetY = (cardHeight - drawnHeight) / 2;
  } else {
    // Drawing is taller than card portrait ratio: fit to height
    scale = cardHeight / boxHeight;
    const drawnWidth = boxWidth * scale;
    offsetX = (cardWidth - drawnWidth) / 2;
  }

  return { scale, offsetX, offsetY };
}

// In-memory cache for rendered thumbnail canvases
const thumbnailCache = new Map<string, HTMLCanvasElement>();

export function clearThumbnailCache() {
  thumbnailCache.clear();
}

/**
 * Determines card dimension based on screen width (phone vs desktop).
 */
export function getCardDimensions(): { width: number; height: number } {
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 768;
  return {
    width: isPhone ? GALLERY_CONSTANTS.cardPhoneWidth : GALLERY_CONSTANTS.cardDesktopWidth,
    height: isPhone ? GALLERY_CONSTANTS.cardPhoneHeight : GALLERY_CONSTANTS.cardDesktopHeight,
  };
}

/**
 * Renders a high-resolution portrait thumbnail canvas for a creation in full color.
 */
export function renderThumbnailCanvas(
  creation: Creation | CreationMeta,
  customWidth?: number,
  customHeight?: number
): HTMLCanvasElement {
  const theme = getTheme();
  const { width: defaultW, height: defaultH } = getCardDimensions();
  const width = customWidth || defaultW;
  const height = customHeight || defaultH;

  const cacheKey = `${creation.id}_${creation.updatedAt}_${theme}_${width}x${height}`;
  const cached = thumbnailCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const tokens = getThemeTokens();

  // 1. Paper background
  ctx.fillStyle = tokens.paper;
  ctx.fillRect(0, 0, width, height);

  // 2. Faint subtle beat guide lines
  ctx.save();
  ctx.strokeStyle = tokens.lineSubtle;
  ctx.lineWidth = 1;
  const guideLines = 8;
  for (let i = 1; i < guideLines; i++) {
    const x = Math.round((i / guideLines) * width);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.restore();

  // 3. Hairline border & subtle inner edge
  ctx.save();
  ctx.strokeStyle = tokens.line;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  ctx.strokeStyle = tokens.lineSubtle;
  ctx.lineWidth = 1;
  ctx.strokeRect(3, 3, width - 6, height - 6);
  ctx.restore();

  // 4. Extract strokes
  let rawStrokes: (Stroke | SimplifiedStroke)[] = [];
  if ('simplifiedStrokes' in creation && Array.isArray(creation.simplifiedStrokes)) {
    rawStrokes = creation.simplifiedStrokes;
  } else if ('project' in creation && Array.isArray(creation.project?.strokes)) {
    rawStrokes = creation.project.strokes;
  }

  const box = computeBoundingBox(rawStrokes);

  if (box.isEmpty) {
    // Empty creation: quiet sketch card with a faint tasteful squiggle
    ctx.save();
    ctx.strokeStyle = tokens.inkSoft;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const cx = width / 2;
    const cy = height / 2;
    ctx.moveTo(cx - 30, cy);
    ctx.quadraticCurveTo(cx - 15, cy - 18, cx, cy);
    ctx.quadraticCurveTo(cx + 15, cy + 18, cx + 30, cy);
    ctx.stroke();
    ctx.restore();
  } else {
    // Non-empty creation: render strokes in full track color
    const transform = computeCardTransform(box, width, height);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of rawStrokes) {
      const pts = stroke.points;
      if (!pts || pts.length === 0) continue;

      const color = getTrackThemeColor(stroke.trackId);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      const baseWidth = stroke.width || 3;
      // Proportional stroke thickness scaled to card resolution
      const scaledWidth = Math.max(2.2, baseWidth * (width / 500));
      ctx.lineWidth = scaledWidth;

      if (pts.length === 1) {
        const px = (pts[0].x - box.minX) * transform.scale + transform.offsetX;
        const py = (pts[0].y - box.minY) * transform.scale + transform.offsetY;
        ctx.beginPath();
        ctx.arc(px, py, scaledWidth * 0.7, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.beginPath();
      const p0x = (pts[0].x - box.minX) * transform.scale + transform.offsetX;
      const p0y = (pts[0].y - box.minY) * transform.scale + transform.offsetY;
      ctx.moveTo(p0x, p0y);

      if (pts.length === 2) {
        const p1x = (pts[1].x - box.minX) * transform.scale + transform.offsetX;
        const p1y = (pts[1].y - box.minY) * transform.scale + transform.offsetY;
        ctx.lineTo(p1x, p1y);
      } else {
        // Quadratic curve smoothing matching main canvas
        for (let i = 1; i < pts.length - 1; i++) {
          const currX = (pts[i].x - box.minX) * transform.scale + transform.offsetX;
          const currY = (pts[i].y - box.minY) * transform.scale + transform.offsetY;
          const nextX = (pts[i + 1].x - box.minX) * transform.scale + transform.offsetX;
          const nextY = (pts[i + 1].y - box.minY) * transform.scale + transform.offsetY;

          const midX = (currX + nextX) / 2;
          const midY = (currY + nextY) / 2;

          ctx.quadraticCurveTo(currX, currY, midX, midY);
        }
        const last = pts[pts.length - 1];
        const lastX = (last.x - box.minX) * transform.scale + transform.offsetX;
        const lastY = (last.y - box.minY) * transform.scale + transform.offsetY;
        ctx.lineTo(lastX, lastY);
      }

      ctx.stroke();
    }

    ctx.restore();
  }

  thumbnailCache.set(cacheKey, canvas);
  return canvas;
}
