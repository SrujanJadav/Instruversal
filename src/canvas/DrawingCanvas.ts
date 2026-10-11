import { Stroke, state, events } from '../state';

export class DrawingCanvas {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private resizeObserver: ResizeObserver;

  private width: number = 0;
  private height: number = 0;
  private dpr: number = 1;

  private activePointerId: number | null = null;
  private currentStroke: Stroke | null = null;
  private strokeStartTime: number = 0;
  private lastPointTime: number = 0;
  private lastPointPos: { x: number; y: number } | null = null;

  // Track pigment for Step 2 (vermilion)
  private readonly defaultColor = '#D2432A';
  private readonly lineColor = 'rgba(28, 26, 22, 0.14)';
  private readonly lineSubtleColor = 'rgba(28, 26, 22, 0.07)';

  constructor(container: HTMLElement) {
    this.container = container;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'instruversal-canvas';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.canvas.style.touchAction = 'none';

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;

    this.container.appendChild(this.canvas);

    this.setupEvents();

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);

    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('orientationchange', this.onWindowResize);

    // Initial sizing
    this.handleResize();
  }

  private onWindowResize = () => {
    this.handleResize();
  };

  public handleResize() {
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;

    // Physical pixel dimensions
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    // CSS layout dimensions
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;

    // Scale drawing context so normalized coordinates scale seamlessly
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.redraw();
  }

  private setupEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);

    // Prevent context menu on long-press (mobile)
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onPointerDown = (e: PointerEvent) => {
    // Ignore secondary pointers to prevent multi-touch interference
    if (this.activePointerId !== null) return;
    if (e.button !== 0) return; // Main button only

    this.activePointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);

    const rect = this.canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, rawX / this.width));
    const normY = Math.max(0, Math.min(1, rawY / this.height));

    this.strokeStartTime = performance.now();
    this.lastPointTime = this.strokeStartTime;
    this.lastPointPos = { x: normX, y: normY };

    // Initial line width (modulated slightly by pointer pressure when available)
    const baseWidth = e.pressure && e.pressure > 0 
      ? Math.max(2.5, Math.min(6, 2 + e.pressure * 4))
      : 3.5;

    this.currentStroke = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `stroke-${Date.now()}-${Math.random()}`,
      trackId: state.selectedTrackId,
      points: [{ x: normX, y: normY, t: 0 }],
      width: baseWidth,
    };

    this.redraw();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointerId || !this.currentStroke) return;

    const rect = this.canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const normX = Math.max(0, Math.min(1, rawX / this.width));
    const normY = Math.max(0, Math.min(1, rawY / this.height));

    if (!this.lastPointPos) {
      this.lastPointPos = { x: normX, y: normY };
      return;
    }

    // Distance thinning: only add points if moved at least ~3 screen pixels
    const dxPx = (normX - this.lastPointPos.x) * this.width;
    const dyPx = (normY - this.lastPointPos.y) * this.height;
    const distSq = dxPx * dxPx + dyPx * dyPx;

    if (distSq < 9) {
      return;
    }

    const now = performance.now();
    const dt = Math.max(1, now - this.lastPointTime);

    // Speed in px/ms
    const speed = Math.sqrt(distSq) / dt;

    if (e.pressure && e.pressure > 0) {
      const targetWidth = Math.max(2.2, Math.min(5.8, 2 + e.pressure * 3.8));
      this.currentStroke.width = this.currentStroke.width * 0.7 + targetWidth * 0.3;
    } else {
      // Natural speed variation: faster stroke is slightly tapered
      const targetWidth = Math.max(2.4, Math.min(4.8, 4.4 - Math.min(speed, 2) * 0.9));
      this.currentStroke.width = this.currentStroke.width * 0.8 + targetWidth * 0.2;
    }

    const t = Math.round(now - this.strokeStartTime);
    this.currentStroke.points.push({ x: normX, y: normY, t });

    this.lastPointPos = { x: normX, y: normY };
    this.lastPointTime = now;

    this.redraw();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;

    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.activePointerId = null;

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      state.strokes.push(this.currentStroke);
      events.emit('stroke:added', this.currentStroke);
      events.emit('strokes:updated', state.strokes);
    }

    this.currentStroke = null;
    this.lastPointPos = null;
    this.redraw();
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId === this.activePointerId) {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      this.activePointerId = null;
      this.currentStroke = null;
      this.lastPointPos = null;
      this.redraw();
    }
  };

  public redraw() {
    if (this.width <= 0 || this.height <= 0) return;

    this.ctx.clearRect(0, 0, this.width, this.height);

    this.drawBackgroundGuides();

    // Draw committed strokes
    for (const stroke of state.strokes) {
      this.drawStroke(stroke);
    }

    // Draw currently active stroke
    if (this.currentStroke) {
      this.drawStroke(this.currentStroke);
    }
  }

  private drawBackgroundGuides() {
    const ctx = this.ctx;

    // Horizontal pitch guide lines (placeholder pitch divisions)
    const pitchLines = 10;
    ctx.lineWidth = 1;
    for (let i = 1; i <= pitchLines; i++) {
      const y = Math.round((i / (pitchLines + 1)) * this.height);
      ctx.beginPath();
      ctx.strokeStyle = i === Math.floor((pitchLines + 1) / 2) ? this.lineColor : this.lineSubtleColor;
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(this.width, y + 0.5);
      ctx.stroke();
    }

    // Vertical beat markers (8 beats in a 2-bar 4/4 loop)
    const totalBeats = 8;
    for (let i = 1; i < totalBeats; i++) {
      const x = Math.round((i / totalBeats) * this.width);
      ctx.beginPath();
      // Measure boundary at bar 2 (halfway) is slightly stronger
      const isBarBoundary = i === totalBeats / 2;
      ctx.strokeStyle = isBarBoundary ? this.lineColor : this.lineSubtleColor;
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, this.height);
      ctx.stroke();
    }
  }

  private drawStroke(stroke: Stroke) {
    const pts = stroke.points;
    if (pts.length === 0) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.defaultColor;
    ctx.fillStyle = this.defaultColor;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (pts.length === 1) {
      // Single tap: draw a clean circular ink dot
      const pt = pts[0];
      const px = pt.x * this.width;
      const py = pt.y * this.height;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2, stroke.width * 0.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (pts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x * this.width, pts[0].y * this.height);
      ctx.lineTo(pts[1].x * this.width, pts[1].y * this.height);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Smooth vector curve using quadratic curves between midpoints
    ctx.beginPath();
    ctx.moveTo(pts[0].x * this.width, pts[0].y * this.height);

    for (let i = 1; i < pts.length - 1; i++) {
      const midX = ((pts[i].x + pts[i + 1].x) / 2) * this.width;
      const midY = ((pts[i].y + pts[i + 1].y) / 2) * this.height;
      ctx.quadraticCurveTo(
        pts[i].x * this.width,
        pts[i].y * this.height,
        midX,
        midY
      );
    }

    const lastPt = pts[pts.length - 1];
    ctx.lineTo(lastPt.x * this.width, lastPt.y * this.height);
    ctx.stroke();

    ctx.restore();
  }

  public destroy() {
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('orientationchange', this.onWindowResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.remove();
  }
}
