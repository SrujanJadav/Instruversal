/**
 * TypeGardenEngine.ts
 *
 * Production-ready procedural Type Garden canvas 2D generative engine.
 * Generates living botanical vines, leaves, thorns, and blooming roses
 * interwoven with typography in two passes (Layer 0 background -> Text -> Layer 1 foreground).
 *
 * Features:
 * - High flower & foliage density with dual-flower clusters, secondary branches, and serifs.
 * - Seamless transparent canvas background support (blends into site theme).
 * - Dynamic Dark / Light theme transition without re-seeding or snapping geometry.
 * - Pure HTML5 Canvas 2D, zero external SVG or graphic assets.
 * - Playfair Display 700 typography with robust fallback.
 * - 120ms frame-quantized "line-boil" hand-drawn jitter.
 * - Continuous organic sway ("Breathe" harmonic warp).
 * - High-DPI (devicePixelRatio) and dynamic bounding box auto-scaling with generous headroom.
 * - Pointer / touch tilt interaction.
 * - No blinking caret / cursor.
 */

export interface GardenPalette {
  bg: string;
  text: string;
  stem: string;
  rose: string;
  line: string;
  vein: string;
}

export const GARDEN_PALETTES: Record<'dark' | 'light', GardenPalette> = {
  dark: {
    bg: '#000000',
    text: '#FFFFFF',
    stem: '#3257FF',
    rose: '#FF1400',
    line: '#FFB4A8',
    vein: '#000000',
  },
  light: {
    bg: '#F3EEE4',
    text: '#111111',
    stem: '#1C2B8F',
    rose: '#FF3B1F',
    line: '#FFD2C4',
    vein: '#FFFFFF',
  },
};

export const DEFAULT_FONT_FAMILY = '"Playfair Display", Georgia, serif';

export interface LetterElem {
  t: 'stem' | 'leaf' | 'rose';
  id: number;
  d0: number;
  layer?: number;
  pts?: [number, number][];
  segs?: { u0: number; u1: number; layer: number }[];
  dur?: number;
  w?: number;
  thorns?: { u: number; s: number }[];
  x?: number;
  y?: number;
  a?: number;
  L?: number;
  bend?: number;
  R?: number;
  rot?: number;
  ph1?: number;
  ph2?: number;
  turns?: number;
}

export interface LetterData {
  ch: string;
  id: number;
  tx: number;
  ty: number;
  unitW: number;
  tw: number;
  x: number;
  y: number;
  els: LetterElem[];
  ws: number;
  wi: number;
  lean?: [number, number];
}

export interface FoliageBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface TypeGardenOptions {
  text?: string;
  fontFamily?: string;
  theme?: 'dark' | 'light' | 'auto';
  transparent?: boolean;
  palette?: Partial<GardenPalette>;
  palettes?: { dark?: Partial<GardenPalette>; light?: Partial<GardenPalette> };
  seed?: number;
  autoStart?: boolean;
}

// --- Math & Curve Primitives ---

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(n: number): number {
  const x = Math.sin(n) * 43758.5453;
  return x - Math.floor(x);
}

export function spring(t: number, k = 7, w = 16): number {
  if (t <= 0) return 0;
  return 1 - Math.exp(-t * k) * Math.cos(t * w);
}

export function easeOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

export function bezier(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
  steps = 40
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
      u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
    ]);
  }
  return pts;
}

export function vine(
  base: [number, number],
  dir: number,
  len: number,
  amp: number,
  waves: number,
  ph: number,
  bend: number,
  steps = 40
): [number, number][] {
  const pts: [number, number][] = [[base[0], base[1]]];
  const step = len / steps;
  let x = base[0];
  let y = base[1];
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const a = dir + bend * u + amp * Math.sin(u * Math.PI * waves + ph) * Math.min(1, u * 3);
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    pts.push([x, y]);
  }
  return pts;
}

export function curl(P: [number, number][], sign: number, rad: number): [number, number][] {
  const n = P.length;
  if (n < 2) return P;
  const e = P[n - 1];
  const a = Math.atan2(e[1] - P[n - 2][1], e[0] - P[n - 2][0]);
  const c: [number, number] = [e[0] - Math.sin(a) * sign * rad, e[1] + Math.cos(a) * sign * rad];
  const a0 = Math.atan2(e[1] - c[1], e[0] - c[0]);
  for (let i = 1; i <= 14; i++) {
    const u = i / 14;
    const t = a0 + sign * u * Math.PI * 1.6;
    const rr = rad * (1 - 0.5 * u);
    P.push([c[0] + Math.cos(t) * rr, c[1] + Math.sin(t) * rr]);
  }
  return P;
}

export function getAt(P: [number, number][], u: number): [[number, number], number] {
  const n = P.length;
  if (n === 0) return [[0, 0], 0];
  if (n === 1) return [P[0], 0];
  const i = Math.min(n - 2, Math.max(1, Math.round(u * (n - 1))));
  return [P[i], Math.atan2(P[i + 1][1] - P[i - 1][1], P[i + 1][0] - P[i - 1][0])];
}

export function weave(r: () => number, startLayer: number): { u0: number; u1: number; layer: number }[] {
  const cuts: number[] = [];
  const nc = 1 + Math.floor(r() * 3);
  for (let i = 0; i < nc; i++) cuts.push(0.15 + r() * 0.7);
  cuts.sort((a, b) => a - b);
  const segs: { u0: number; u1: number; layer: number }[] = [];
  let u0 = 0;
  let layer = startLayer;
  for (const c of cuts) {
    if (c <= u0) continue;
    segs.push({ u0, u1: c, layer });
    u0 = c;
    layer = 1 - layer;
  }
  segs.push({ u0, u1: 1, layer });
  return segs;
}

export function layerAt(segs: { u0: number; u1: number; layer: number }[], u: number): number {
  for (const s of segs) {
    if (u >= s.u0 && u <= s.u1) return s.layer;
  }
  return segs[segs.length - 1]?.layer ?? 0;
}

export function jitter(id: number, f: number, amp: number): [number, number, number] {
  if (!amp) return [0, 0, 0];
  return [
    (hash(id * 1.37 + f * 7.13) * 2 - 1) * amp,
    (hash(id * 2.71 + f * 3.11) * 2 - 1) * amp,
    (hash(id * 5.3 + f * 1.7) * 2 - 1) * 0.035,
  ];
}

// --- High Density Botanical Plant Generation ---

export function grow(
  r: () => number,
  elements: LetterElem[],
  nextId: () => number,
  p: { roseP: number; leafy: number; curvy: number; big: number; w: number },
  opts: {
    base?: [number, number];
    dir?: number;
    len?: number;
    d0: number;
    tip?: string | null;
    depth?: number;
    pts?: [number, number][];
  }
): void {
  const tip = opts.tip || (r() < p.roseP ? 'rose' : r() < 0.45 ? 'fan' : r() < 0.65 ? 'leaf' : 'curl');
  let P =
    opts.pts ||
    vine(
      opts.base || [0, 0],
      opts.dir || 0,
      opts.len || 0.75,
      (0.35 + r() * 0.4) * p.curvy,
      1 + r() * 1.4,
      r() * 6.28,
      (r() - 0.5) * 1.1,
      36
    );
  if (tip === 'curl') P = curl(P, r() < 0.5 ? -1 : 1, 0.05 + r() * 0.04);

  const segs = weave(r, r() < 0.5 ? 0 : 1);
  const dur = Math.max(300, (opts.len || 0.75) * 580);
  const thorns: { u: number; s: number }[] = [];
  const nt = Math.floor(r() * 2);
  for (let i = 0; i < nt; i++) thorns.push({ u: 0.2 + r() * 0.6, s: r() < 0.5 ? -1 : 1 });

  elements.push({ t: 'stem', id: nextId(), pts: P, segs, d0: opts.d0, dur, w: opts.depth ? 0.8 : 1, thorns });

  const nl = Math.floor(r() * 2.2 * p.leafy);
  let sd = r() < 0.5 ? -1 : 1;
  for (let i = 0; i < nl; i++) {
    const u = 0.25 + r() * 0.6;
    const [q, a] = getAt(P, u);
    sd = -sd;
    elements.push({
      t: 'leaf',
      id: nextId(),
      x: q[0],
      y: q[1],
      a: a + sd * (0.55 + r() * 0.45),
      L: (0.13 + r() * 0.18) * (opts.depth ? 0.8 : 1),
      bend: (r() - 0.5) * 1.1,
      layer: layerAt(segs, u),
      d0: opts.d0 + dur * u,
    });
  }

  const [tp, ta] = getAt(P, 1);
  const td = opts.d0 + dur * 0.8;
  const tl = layerAt(segs, 1);

  if (tip === 'rose') {
    const R = (0.12 + r() * 0.14) * p.big * (opts.depth ? 0.75 : 1);
    const over = tp[1] > -0.75 && tp[1] < 0.05 && Math.abs(tp[0]) < p.w * 0.5;
    const layer = over ? (r() < 0.2 ? 1 : 0) : r() < 0.55 ? 1 : tl;

    elements.push({
      t: 'rose',
      id: nextId(),
      x: tp[0],
      y: tp[1],
      R,
      rot: (r() - 0.5) * 1.0,
      ph1: r() * 6.28,
      ph2: r() * 6.28,
      turns: 1.8 + r() * 0.8,
      layer,
      d0: td,
    });
  } else if (tip === 'fan') {
    const spread = 0.55 + r() * 0.3;
    for (let j = 0; j < 2; j++) {
      elements.push({
        t: 'leaf',
        id: nextId(),
        x: tp[0],
        y: tp[1],
        a: ta + (j - 0.5) * spread,
        L: 0.18 + r() * 0.16,
        bend: (j - 0.5) * 0.7,
        layer: tl,
        d0: td + j * 50,
      });
    }
  } else if (tip === 'leaf') {
    elements.push({
      t: 'leaf',
      id: nextId(),
      x: tp[0],
      y: tp[1],
      a: ta + (r() - 0.5) * 0.3,
      L: 0.15 + r() * 0.15,
      bend: r() - 0.5,
      layer: tl,
      d0: td,
    });
  }

  if (!opts.depth && r() < 0.25) {
    const u = 0.35 + r() * 0.35;
    const [q, a] = getAt(P, u);
    grow(r, elements, nextId, p, {
      base: q,
      dir: a + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.3),
      len: (opts.len || 0.75) * (0.35 + r() * 0.2),
      d0: opts.d0 + dur * u,
      depth: 1,
      tip: r() < 0.4 ? 'rose' : 'leaf',
    });
  }
}

export function buildGarden(text: string, ctx: CanvasRenderingContext2D, fontFamily: string, baseSeed = 24601): LetterData[] {
  ctx.font = `700 100px ${fontFamily}`;
  const charWidths = text.split('').map((ch) => ctx.measureText(ch).width / 100);
  const rand = mulberry32(baseSeed);

  let elemUid = 1;
  const list: LetterData[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const w = charWidths[i];
    const prev = list[i - 1];
    const same = prev && prev.ch !== ' ';
    const ws = same ? prev.ws : Math.floor(rand() * 1e9);
    const wi = same ? prev.wi + 1 : 0;
    const r = mulberry32(ws ^ Math.imul(wi + 1, 2654435761));

    // Tuned to keep letters visible, balanced, and clean
    const p = {
      roseP: 0.38,
      leafy: 0.95,
      curvy: 0.8 + r() * 0.5,
      big: 0.88 + r() * 0.35,
      w,
    };

    const elements: LetterElem[] = [];
    const nextId = () => elemUid++;
    const inX = () => (r() - 0.5) * w * 0.7;

    // Ascending stems
    const nUp = 1 + (r() < 0.35 ? 1 : 0);
    for (let k = 0; k < nUp; k++) {
      grow(r, elements, nextId, p, {
        base: [inX(), -r() * 0.3],
        dir: -Math.PI / 2 + (r() - 0.5) * 0.65,
        len: 0.6 + r() * 0.45,
        d0: k * 70,
        tip: k === 0 && (wi === 0 || wi === 3 || wi === 7 || wi === 9) ? 'rose' : null,
      });
    }

    // Lower decorative branches
    if (r() < 0.4) {
      grow(r, elements, nextId, p, {
        base: [inX(), -0.05 - r() * 0.3],
        dir: Math.PI / 2 + (r() - 0.5) * 0.7,
        len: 0.35 + r() * 0.3,
        d0: 80,
        tip: r() < 0.4 ? 'rose' : 'leaf',
      });
    }

    // Connecting arch between letters
    if (prev && r() < 0.65) {
      const px = -(charWidths[i - 1] + w) / 2;
      const a: [number, number] = [inX(), -0.05 - r() * 0.5];
      const b: [number, number] = [px + (r() - 0.5) * 0.2, -0.05 - r() * 0.5];
      const bulge = (r() < 0.55 ? -1 : 1) * (0.35 + r() * 0.35);
      const dx = b[0] - a[0];
      const P = bezier(a, [a[0] + dx * 0.15, a[1] + bulge], [b[0] - dx * 0.15, b[1] + bulge * 0.9], b, 36);
      grow(r, elements, nextId, p, { pts: P, len: Math.abs(dx) + Math.abs(bulge), d0: 80 });
    }

    list.push({
      ch,
      id: i,
      tx: 0,
      ty: 0,
      unitW: w,
      tw: w,
      x: 0,
      y: 0,
      els: elements,
      ws,
      wi,
    });
  }
  return list;
}

export function computeFoliageBounds(letters: LetterData[]): FoliageBounds {
  if (letters.length === 0) {
    return { minX: 0, maxX: 1, minY: -1, maxY: 0.2, width: 1, height: 1.2, centerX: 0.5, centerY: -0.4 };
  }

  let curX = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = -0.9;
  let maxY = 0.2;

  for (const l of letters) {
    const charW = l.unitW;
    const charMidX = curX + charW / 2;

    minX = Math.min(minX, curX);
    maxX = Math.max(maxX, curX + charW);

    for (const e of l.els) {
      if (e.t === 'stem' && e.pts) {
        for (const pt of e.pts) {
          const px = charMidX + pt[0];
          const py = pt[1];
          minX = Math.min(minX, px);
          maxX = Math.max(maxX, px);
          minY = Math.min(minY, py);
          maxY = Math.max(maxY, py);
        }
      } else if (e.t === 'leaf') {
        const lx = charMidX + (e.x || 0);
        const ly = e.y || 0;
        const radius = e.L || 0.15;
        minX = Math.min(minX, lx - radius);
        maxX = Math.max(maxX, lx + radius);
        minY = Math.min(minY, ly - radius);
        maxY = Math.max(maxY, ly + radius);
      } else if (e.t === 'rose') {
        const rx = charMidX + (e.x || 0);
        const ry = e.y || 0;
        const radius = (e.R || 0.15) * 1.3;
        minX = Math.min(minX, rx - radius);
        maxX = Math.max(maxX, rx + radius);
        minY = Math.min(minY, ry - radius);
        maxY = Math.max(maxY, ry + radius);
      }
    }
    curX += charW;
  }

  if (!isFinite(minX) || !isFinite(maxX)) {
    minX = 0;
    maxX = Math.max(1, curX);
  }
  if (!isFinite(minY) || !isFinite(maxY)) {
    minY = -1.2;
    maxY = 0.5;
  }

  const width = Math.max(0.1, maxX - minX);
  const height = Math.max(0.1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return { minX, maxX, minY, maxY, width, height, centerX, centerY };
}

// --- Engine Class ---

export class TypeGardenEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private text: string;
  private fontFamily: string;
  private theme: 'dark' | 'light' | 'auto';
  private transparent: boolean;
  private palettes: Record<'dark' | 'light', GardenPalette>;
  private activeTheme: 'dark' | 'light' = 'dark';
  private seed: number;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private scaleSize = 80;
  private letters: LetterData[] = [];
  private pointer: [number, number] | null = null;

  private rafId: number | null = null;
  private isRunning = false;
  private isDestroyed = false;

  private themeObserver: MutationObserver | null = null;
  private boundOnResize: () => void;
  private boundOnPointerMove: (e: PointerEvent) => void;
  private boundOnPointerLeave: () => void;
  private boundOnVisibilityChange: () => void;
  private boundOnThemeChange: () => void;

  constructor(canvas: HTMLCanvasElement, options?: TypeGardenOptions) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      throw new Error('TypeGardenEngine: Unable to get 2D context from canvas');
    }
    this.ctx = ctx;

    this.text = options?.text ?? 'Instruverse';
    this.fontFamily = options?.fontFamily ?? DEFAULT_FONT_FAMILY;
    this.theme = options?.theme ?? 'auto';
    this.transparent = options?.transparent ?? true; // Transparent by default to blend seamlessly into site background
    this.seed = options?.seed ?? 8821;

    this.palettes = {
      dark: { ...GARDEN_PALETTES.dark, ...(options?.palettes?.dark || options?.palette || {}) },
      light: { ...GARDEN_PALETTES.light, ...(options?.palettes?.light || options?.palette || {}) },
    };

    this.activeTheme = this.getResolvedTheme();

    this.boundOnResize = () => this.resize();
    this.boundOnPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
    this.boundOnPointerLeave = () => this.handlePointerLeave();
    this.boundOnVisibilityChange = () => this.handleVisibilityChange();
    this.boundOnThemeChange = () => {
      this.activeTheme = this.getResolvedTheme();
    };

    this.bindEvents();
    this.initFontAndGarden();

    if (options?.autoStart !== false) {
      this.start();
    }
  }

  public getResolvedTheme(): 'dark' | 'light' {
    if (this.theme === 'dark' || this.theme === 'light') return this.theme;
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (root.getAttribute('data-theme') === 'dark' || root.classList.contains('dark')) {
        return 'dark';
      }
      if (root.getAttribute('data-theme') === 'light' || root.classList.contains('light')) {
        return 'light';
      }
    }
    return typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  public setTheme(theme: 'dark' | 'light' | 'auto'): void {
    this.theme = theme;
    this.activeTheme = this.getResolvedTheme();
  }

  public setTransparent(transparent: boolean): void {
    this.transparent = transparent;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.boundOnResize, { passive: true });
    this.canvas.addEventListener('pointermove', this.boundOnPointerMove, { passive: true });
    this.canvas.addEventListener('pointerleave', this.boundOnPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', this.boundOnVisibilityChange);

    if (typeof window !== 'undefined') {
      window.addEventListener('themechange', this.boundOnThemeChange);
    }

    if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
      this.themeObserver = new MutationObserver(() => {
        this.activeTheme = this.getResolvedTheme();
      });
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme'],
      });
    }
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.boundOnResize);
    this.canvas.removeEventListener('pointermove', this.boundOnPointerMove);
    this.canvas.removeEventListener('pointerleave', this.boundOnPointerLeave);
    document.removeEventListener('visibilitychange', this.boundOnVisibilityChange);

    if (typeof window !== 'undefined') {
      window.removeEventListener('themechange', this.boundOnThemeChange);
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
  }

  private async initFontAndGarden(): Promise<void> {
    const fontSpec = `700 100px ${this.fontFamily}`;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      try {
        await Promise.race([
          document.fonts.load(fontSpec),
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]);
      } catch {
        // Fallback gracefully if offline
      }
    }

    if (this.isDestroyed) return;
    this.buildGarden();
    this.resize();
  }

  public buildGarden(): void {
    this.letters = buildGarden(this.text, this.ctx, this.fontFamily, this.seed);
    this.layout();
  }

  public setText(newText: string): void {
    if (this.text === newText) return;
    this.text = newText;
    this.buildGarden();
  }

  public resize(): void {
    if (this.isDestroyed) return;
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.width = rect.width || this.canvas.parentElement?.clientWidth || window.innerWidth;
    this.height = rect.height || this.canvas.parentElement?.clientHeight || 400;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.layout();
  }

  public layout(): void {
    if (!this.width || !this.height || this.letters.length === 0) return;

    const totalUnitW = this.letters.reduce((sum, l) => sum + l.unitW, 0);
    const maxW = this.width * 0.88;
    const maxH = this.height * 0.62;

    // Compact layout engine that respects mobile viewport heights
    // Restricts font scale so top and bottom branches never bleed beyond container bounds
    this.scaleSize = Math.min(this.height * 0.35, maxW / Math.max(1, totalUnitW), maxH);
    this.scaleSize = Math.min(this.scaleSize, 90);
    this.scaleSize = Math.max(this.scaleSize, 18);

    let curX = this.width / 2 - (totalUnitW * this.scaleSize) / 2;
    const baselineY = this.height / 2 + this.scaleSize * 0.25;

    for (const l of this.letters) {
      const charW = l.unitW * this.scaleSize;
      l.tx = curX + charW / 2;
      l.ty = baselineY;
      l.tw = charW;
      l.x = l.tx;
      l.y = l.ty;
      curX += charW;
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer = [e.clientX - rect.left, e.clientY - rect.top];
  }

  private handlePointerLeave(): void {
    this.pointer = null;
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.stop();
    } else {
      this.start();
    }
  }

  public start(): void {
    if (this.isRunning || this.isDestroyed) return;
    this.isRunning = true;
    const loop = (time: number) => {
      if (!this.isRunning) return;
      this.render(time);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.stop();
    this.unbindEvents();
    this.letters = [];
  }

  // --- Rendering Pass Implementation ---

  private drawSmoothPath(pts: [number, number][], closed: boolean): void {
    const n = pts.length;
    if (n < 2) return;
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.ctx.beginPath();
    if (closed) {
      const s = mid(pts[n - 1], pts[0]);
      this.ctx.moveTo(s[0], s[1]);
      for (let i = 0; i < n; i++) {
        const q = mid(pts[i], pts[(i + 1) % n]);
        this.ctx.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]);
      }
      this.ctx.closePath();
    } else {
      this.ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const q = mid(pts[i], pts[i + 1]);
        this.ctx.quadraticCurveTo(pts[i][0], pts[i][1], q[0], q[1]);
      }
      this.ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  }

  private drawLeaf(bx: number, by: number, a: number, L: number, bend: number, colors: GardenPalette): void {
    if (L < 1) return;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const px = -sa;
    const py = ca;

    const axis = (u: number): [number, number] => {
      const b = Math.sin(Math.PI * u) * bend * 0.15 * L;
      return [bx + ca * u * L + px * b, by + sa * u * L + py * b];
    };
    const halfW = (u: number) => L * 0.18 * Math.sin(Math.PI * Math.pow(u, 0.8));
    const s1: [number, number][] = [];
    const s2: [number, number][] = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const c = axis(u);
      const w = halfW(u);
      s1.push([c[0] + px * w, c[1] + py * w]);
      s2.push([c[0] - px * w, c[1] - py * w]);
    }
    const tip = axis(1);
    const base = axis(0);
    this.drawSmoothPath([base, ...s1.slice(1, N), tip, ...s2.slice(1, N).reverse(), base], true);
    this.ctx.fillStyle = colors.stem;
    this.ctx.fill();

    // Central leaf vein
    if (L > 6) {
      const veinPts: [number, number][] = [];
      for (let i = 0; i <= 5; i++) {
        veinPts.push(axis(0.1 + (0.8 * i) / 5));
      }
      this.drawSmoothPath(veinPts, false);
      this.ctx.strokeStyle = colors.vein;
      this.ctx.lineWidth = Math.max(0.7, L * 0.035);
      this.ctx.stroke();
    }
  }

  private drawRose(cx: number, cy: number, R: number, rot: number, e: LetterElem, age: number, colors: GardenPalette): void {
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    const transform = (x: number, y: number): [number, number] => [cx + (x * cr - y * sr), cy + (x * sr + y * cr)];

    const Petals = [
      [0, -0.36, 0.56, 0.54, 0],
      [-0.5, -0.06, 0.6, 0.6, -0.35],
      [0.52, -0.06, 0.6, 0.6, 0.35],
      [-0.42, 0.3, 0.62, 0.48, 0.2],
      [0.47, 0.3, 0.62, 0.48, -0.2],
      [0.05, 0.42, 0.56, 0.38, 0],
    ];

    Petals.forEach((q, i) => {
      const s = spring((age - i * 70) / 1000, 8, 14);
      if (s <= 0.001) return;
      const ang = q[4];
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const pts: [number, number][] = [];
      for (let k = 0; k < 18; k++) {
        const th = (k / 18) * Math.PI * 2;
        const rr = 1 + 0.08 * Math.sin(3 * th + (e.ph1 || 0) + i);
        const lx = Math.cos(th) * q[2] * rr;
        const ly = Math.sin(th) * q[3] * rr;
        const px = q[0] + (lx * ca - ly * sa) * s;
        const py = q[1] + (lx * sa + ly * ca) * s;
        pts.push(transform(px * R, py * R));
      }
      this.drawSmoothPath(pts, true);
      this.ctx.fillStyle = colors.rose;
      this.ctx.fill();
    });

    // Rose internal spiral stamen
    const fr = easeOut((age - 450) / 450);
    if (fr > 0 && R > 4) {
      const spiral: [number, number][] = [];
      const turns = e.turns || 1.8;
      for (let i = 0; i <= 36; i++) {
        const u = i / 36;
        const th = (e.ph1 || 0) + u * turns * Math.PI * 2;
        const rr = R * (0.08 + 0.55 * u);
        spiral.push(transform(Math.cos(th) * rr, Math.sin(th) * rr * 0.75));
      }
      this.drawSmoothPath(spiral, false);
      this.ctx.strokeStyle = colors.line;
      this.ctx.lineWidth = Math.max(0.7, R * 0.045);
      this.ctx.stroke();
    }
  }

  public render(time: number): void {
    // Dynamic theme evaluation on each frame (seamless transitions without re-seeding)
    this.activeTheme = this.getResolvedTheme();
    const currentColors = this.palettes[this.activeTheme];

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Seamless background adaptation: clear transparently or fill with background color
    if (this.transparent) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    } else {
      this.ctx.fillStyle = currentColors.bg;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    const S = this.scaleSize;
    const f = Math.floor(time / 120); // 120ms frame-quantized line-boil
    const boilAmp = Math.max(0.7, S * 0.008);

    // Dynamic tilt toward pointer/touch
    for (const l of this.letters) {
      let tx = 0;
      let ty = 0;
      if (this.pointer) {
        const dx = this.pointer[0] - l.x;
        const dy = this.pointer[1] - (l.y - S * 0.6);
        const dist = Math.hypot(dx, dy);
        if (dist < 260 && dist > 1) {
          const w = 1 - dist / 260;
          tx = (dx / dist) * w;
          ty = (dy / dist) * w;
        }
      }
      const c = l.lean || (l.lean = [0, 0]);
      c[0] += (tx - c[0]) * 0.08;
      c[1] += (ty - c[1]) * 0.08;
    }

    // Harmonic "Breathe" mode sway warp
    const swayWarp = (px: number, py: number, l: LetterData): [number, number] => {
      const ph = (time / 3000) * Math.PI * 2;
      const h = Math.max(0, (l.y - py) / S);
      let wx = px + Math.sin(ph + l.x * 0.004 + h * 1.1) * S * 0.025 * h;
      let wy = py + Math.cos(ph + px * 0.003) * S * 0.007 * h;
      if (l.lean) {
        wx += l.lean[0] * S * 0.08 * h;
        wy += l.lean[1] * S * 0.04 * h;
      }
      return [wx, wy];
    };

    const drawPass = (currentLayer: number) => {
      for (const l of this.letters) {
        if (l.ch === ' ') continue;
        for (const e of l.els) {
          const j = jitter(e.id, f, boilAmp);
          if (e.t === 'stem' && e.pts && e.segs) {
            const warpedPts = e.pts.map((p) => swayWarp(l.x + p[0] * S + j[0], l.y + p[1] * S + j[1], l));
            for (const seg of e.segs) {
              if (seg.layer !== currentLayer) continue;
              const startIdx = Math.floor(seg.u0 * (warpedPts.length - 1));
              const endIdx = Math.ceil(seg.u1 * (warpedPts.length - 1));
              const subPts = warpedPts.slice(startIdx, endIdx + 1);
              this.drawSmoothPath(subPts, false);
              this.ctx.strokeStyle = currentColors.stem;
              this.ctx.lineWidth = S * 0.022 * (e.w || 1);
              this.ctx.lineCap = 'round';
              this.ctx.lineJoin = 'round';
              this.ctx.stroke();
            }

            // Draw thorns if in this layer
            if (e.thorns && e.thorns.length > 0) {
              for (const th of e.thorns) {
                if (layerAt(e.segs, th.u) !== currentLayer) continue;
                const [q, a] = getAt(e.pts, th.u);
                const sq = swayWarp(l.x + q[0] * S + j[0], l.y + q[1] * S + j[1], l);
                const thornLen = S * 0.035;
                const thornAng = a + (Math.PI / 2) * th.s + 0.2;
                const tipX = sq[0] + Math.cos(thornAng) * thornLen;
                const tipY = sq[1] + Math.sin(thornAng) * thornLen;
                this.ctx.beginPath();
                this.ctx.moveTo(sq[0], sq[1]);
                this.ctx.lineTo(tipX, tipY);
                this.ctx.strokeStyle = currentColors.stem;
                this.ctx.lineWidth = Math.max(1, S * 0.015);
                this.ctx.stroke();
              }
            }
          } else if (e.layer === currentLayer) {
            const [wx, wy] = swayWarp(l.x + (e.x || 0) * S + j[0], l.y + (e.y || 0) * S + j[1], l);
            if (e.t === 'leaf') {
              this.drawLeaf(wx, wy, (e.a || 0) + j[2], (e.L || 0.14) * S, e.bend || 0, currentColors);
            } else if (e.t === 'rose') {
              this.drawRose(wx, wy, (e.R || 0.13) * S, (e.rot || 0) + j[2], e, time, currentColors);
            }
          }
        }
      }
    };

    // PASS 1: Foliage behind typography (Layer 0)
    drawPass(0);

    // PASS 2: Typography (Adapts color between light mode #111111 and dark mode #FFFFFF)
    // NOTE: Absolutely NO cursor / blinking caret line is rendered.
    this.ctx.font = `700 ${S}px ${this.fontFamily}`;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillStyle = currentColors.text;
    for (const l of this.letters) {
      if (l.ch !== ' ') {
        this.ctx.fillText(l.ch, l.x, l.y);
      }
    }

    // PASS 3: Foliage in front of typography (Layer 1 - weaves over the letters)
    drawPass(1);
  }
}
