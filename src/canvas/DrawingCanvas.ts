import {
  Stroke,
  state,
  events,
  pushHistorySnapshot,
  recordDeltaHistory,
  HistoryDeltaItem,
} from '../state';
import {
  buildScaleNotes,
  yToMidi,
  midiToNoteName,
  isRootNote,
} from '../audio/scales';
import { getTrackManager } from '../audio/tracks';
import { getTransport } from '../audio/transport';
import { DRUM_LANES } from '../audio/drums';
import { getThemeTokens, getTrackThemeColor, getTheme } from '../ui/theme';
import { eraseStrokes, Capsule, Point2D } from './eraser';
import { getFlowVoicePool } from '../audio/voicePool';
import { getBeatFlowVoicePool } from '../audio/beatFlowVoices';

interface HitEffect {
  x: number;
  y: number;
  color: string;
  noteName: string;
  startTime: number;
  duration: number;
  isBeat?: boolean;
}

export class DrawingCanvas {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Offscreen canvas for cached static layers (guides + committed strokes)
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private staticLayerDirty: boolean = true;

  private resizeObserver: ResizeObserver;

  private width: number = 0;
  private height: number = 0;
  private dpr: number = 1;

  private activePointerId: number | null = null;
  private currentStroke: Stroke | null = null;
  private strokeStartTime: number = 0;
  private lastPointTime: number = 0;
  private lastPointPos: { x: number; y: number } | null = null;

  // Partial eraser state
  private isAltHeld: boolean = false;
  private eraserDragActive: boolean = false;
  private lastEraserPos: Point2D | null = null;
  private eraserPos: Point2D | null = null;
  private affectedOriginalsInDrag: Map<string, HistoryDeltaItem> = new Map();
  private createdFragmentIdsInDrag: Set<string> = new Set();
  private audioRebuildThrottleTimer: number | null = null;
  private lastAudioRebuildTime: number = 0;

  // Live pitch preview & readout
  private lastPreviewMidi: number | null = null;
  private lastPreviewLane: number = -1;
  private lastPreviewTime: number = 0;
  private activeNoteDisplay: { name: string; x: number; y: number } | null = null;

  // Hit effects & stroke highlight
  private hitEffects: HitEffect[] = [];
  private strokeHighlights: Map<string, number> = new Map();

  // Animation frame loop
  private animFrameId: number | null = null;

  // Event cleanup
  private unsubs: (() => void)[] = [];

  // Dynamic theme-aware line styling
  private get lineColor(): string {
    return getThemeTokens().line;
  }
  private get lineRootColor(): string {
    return getThemeTokens().lineRoot;
  }
  private get lineSubtleColor(): string {
    return getThemeTokens().lineSubtle;
  }

  constructor(container: HTMLElement) {
    this.container = container;

    // Main visible canvas
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

    // Static offscreen buffer
    this.offscreenCanvas = document.createElement('canvas');
    const offContext = this.offscreenCanvas.getContext('2d');
    if (!offContext) {
      throw new Error('Could not acquire offscreen 2D canvas context');
    }
    this.offscreenCtx = offContext;

    this.container.appendChild(this.canvas);

    this.setupEvents();

    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);

    window.addEventListener('resize', this.onWindowResize);
    window.addEventListener('orientationchange', this.onWindowResize);

    this.setupAppListeners();

    // Initial sizing
    this.handleResize();
  }

  private setupAppListeners() {
    const onThemeChange = () => this.markStaticDirty();
    window.addEventListener('themechange', onThemeChange);
    this.unsubs.push(() => window.removeEventListener('themechange', onThemeChange));

    this.unsubs.push(
      events.on('track:select', () => this.markStaticDirty()),
      events.on('track:type-change', () => this.markStaticDirty()),
      events.on('track:beat-param-change', () => this.markStaticDirty()),
      events.on('scale:change', () => this.markStaticDirty()),
      events.on('tool:change', () => this.updateCursor()),
      events.on('eraser:radius-change', () => this.redraw()),
      events.on('eraser:mode-change', () => this.redraw()),
      events.on('strokes:updated', () => this.markStaticDirty()),
      events.on('stroke:added', () => this.markStaticDirty()),
      events.on('transport:play', () => this.startAnimation()),
      events.on('transport:pause', () => this.redraw()),
      events.on('note:hit', (hit) => {
        const color = this.getTrackColor(hit.trackId);
        const noteName = hit.isBeat
          ? (DRUM_LANES[hit.midi]?.shortLabel || 'BD')
          : midiToNoteName(hit.midi);
        this.hitEffects.push({
          x: hit.x,
          y: hit.y,
          color,
          noteName,
          startTime: performance.now(),
          duration: hit.isBeat ? 170 : 400,
          isBeat: hit.isBeat,
        });
        if (hit.strokeId) {
          this.strokeHighlights.set(hit.strokeId, performance.now() + 200);
        }
        this.startAnimation();
      })
    );
  }

  private get isEraserActive(): boolean {
    return state.activeTool === 'eraser' || this.isAltHeld;
  }

  private markStaticDirty() {
    this.staticLayerDirty = true;
    this.redraw();
  }

  private updateCursor() {
    this.canvas.style.cursor = this.isEraserActive ? 'none' : 'default';
    this.redraw();
  }

  private startAnimation() {
    if (this.animFrameId === null) {
      this.renderLoop();
    }
  }

  private renderLoop = () => {
    this.redraw();

    const hasActiveHits = this.hitEffects.length > 0;
    const isDrawing = this.currentStroke !== null;
    const isErasing = this.eraserPos !== null;
    const isPlaying = state.isPlaying;

    if (isPlaying || hasActiveHits || isDrawing || isErasing) {
      this.animFrameId = requestAnimationFrame(this.renderLoop);
    } else {
      this.animFrameId = null;
    }
  };

  /**
   * Pauses the animation loop and playhead redraws to save battery.
   */
  public pause() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  /**
   * Resumes the canvas render loop and requests a fresh redraw.
   */
  public resume() {
    this.markStaticDirty();
    if (state.isPlaying) {
      this.startAnimation();
    }
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
    const physW = Math.round(this.width * this.dpr);
    const physH = Math.round(this.height * this.dpr);

    this.canvas.width = physW;
    this.canvas.height = physH;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Offscreen buffer dimensions
    this.offscreenCanvas.width = physW;
    this.offscreenCanvas.height = physH;
    this.offscreenCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.markStaticDirty();
  }

  private setupEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') {
      if (!this.isAltHeld) {
        this.isAltHeld = true;
        this.updateCursor();
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt') {
      if (this.isAltHeld) {
        this.isAltHeld = false;
        this.updateCursor();
      }
    }
  };

  private onWindowBlur = () => {
    if (this.isAltHeld) {
      this.isAltHeld = false;
      this.updateCursor();
    }
  };

  private onPointerLeave = () => {
    if (this.activePointerId === null) {
      this.eraserPos = null;
      this.redraw();
    }
  };

  private getTrackColor(trackId: string): string {
    return getTrackThemeColor(trackId);
  }

  private triggerLivePitch(normX: number, normY: number) {
    const tm = getTrackManager();
    const track = tm.getTrack(state.selectedTrackId);

    // If currently drawing on a beat track: live preview drum sound
    if (track && track.trackType === 'beat') {
      const laneIndex = Math.max(0, Math.min(7, Math.floor(normY * 8)));
      const meta = DRUM_LANES[laneIndex];
      this.activeNoteDisplay = { name: meta.shortLabel, x: normX, y: normY };

      if (!state.audioStarted) return;
      const now = performance.now();
      if (laneIndex !== this.lastPreviewLane || now - this.lastPreviewTime > 120) {
        try {
          track.triggerDrum(meta.id, undefined, 0.75);
          this.lastPreviewLane = laneIndex;
          this.lastPreviewTime = now;
        } catch {}
      }
      return;
    }

    const scaleNotes = buildScaleNotes(state.rootNote, state.scaleName, 3, 6);
    const midi = yToMidi(normY, scaleNotes);
    const noteName = midiToNoteName(midi);

    this.activeNoteDisplay = { name: noteName, x: normX, y: normY };

    if (!state.audioStarted) return;

    const now = performance.now();
    if (midi !== this.lastPreviewMidi || now - this.lastPreviewTime > 110) {
      try {
        tm.triggerNoteOnTrack(
          state.selectedTrackId,
          midi,
          '16n',
          undefined,
          0.75
        );
        this.lastPreviewMidi = midi;
        this.lastPreviewTime = now;
      } catch {
        // Safe guard
      }
    }
  }

  private performCapsuleErase(capsule: Capsule) {
    const res = eraseStrokes(
      state.strokes,
      capsule,
      this.width,
      this.height,
      {
        mode: state.eraserMode,
        filterTrack: state.eraserSelectedTrackOnly,
        selectedTrackId: state.selectedTrackId,
      }
    );

    if (res.modified) {
      // Record affected originals before any cuts in this drag
      for (const orig of res.affectedOriginals) {
        if (
          !this.affectedOriginalsInDrag.has(orig.stroke.id) &&
          !this.createdFragmentIdsInDrag.has(orig.stroke.id)
        ) {
          this.affectedOriginalsInDrag.set(orig.stroke.id, orig);
        }
      }

      // Add resulting fragments to our tracker
      for (const frag of res.resultingFragments) {
        this.createdFragmentIdsInDrag.add(frag.id);
      }

      // Release flow voices belonging to removed/cut strokes with 30ms fade
      for (const removedId of res.removedStrokeIds) {
        getFlowVoicePool().releaseStrokeVoice(removedId, 0.03);
        getBeatFlowVoicePool().releaseStrokeVoice(removedId, 0.03);
      }

      state.strokes = res.newStrokes;
      this.markStaticDirty();
      this.scheduleThrottledAudioRebuild();
    }
  }

  private scheduleThrottledAudioRebuild() {
    const now = performance.now();
    if (now - this.lastAudioRebuildTime >= 150) {
      this.lastAudioRebuildTime = now;
      if (this.audioRebuildThrottleTimer !== null) {
        window.clearTimeout(this.audioRebuildThrottleTimer);
        this.audioRebuildThrottleTimer = null;
      }
      events.emit('strokes:updated', state.strokes);
    } else if (this.audioRebuildThrottleTimer === null) {
      const delay = Math.max(15, 150 - (now - this.lastAudioRebuildTime));
      this.audioRebuildThrottleTimer = window.setTimeout(() => {
        this.audioRebuildThrottleTimer = null;
        this.lastAudioRebuildTime = performance.now();
        events.emit('strokes:updated', state.strokes);
      }, delay);
    }
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.activePointerId !== null) return;
    if (e.button !== 0) return;

    this.activePointerId = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);

    const rect = this.canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    const isErasing = this.isEraserActive || e.altKey;

    if (isErasing) {
      this.eraserDragActive = true;
      this.lastEraserPos = { x: rawX, y: rawY };
      this.eraserPos = { x: rawX, y: rawY };
      this.affectedOriginalsInDrag.clear();
      this.createdFragmentIdsInDrag.clear();

      const capsule: Capsule = {
        p0: { x: rawX, y: rawY },
        p1: { x: rawX, y: rawY },
        radius: state.eraserRadius,
      };
      this.performCapsuleErase(capsule);
      this.startAnimation();
      return;
    }

    const normX = Math.max(0, Math.min(1, rawX / this.width));
    const normY = Math.max(0, Math.min(1, rawY / this.height));

    this.strokeStartTime = performance.now();
    this.lastPointTime = this.strokeStartTime;
    this.lastPointPos = { x: normX, y: normY };

    const baseWidth = e.pressure && e.pressure > 0 
      ? Math.max(2.5, Math.min(6, 2 + e.pressure * 4))
      : 3.5;

    this.currentStroke = {
      id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `stroke-${Date.now()}-${Math.random()}`,
      trackId: state.selectedTrackId,
      points: [{ x: normX, y: normY, t: 0 }],
      width: baseWidth,
    };

    this.triggerLivePitch(normX, normY);
    this.startAnimation();
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;

    // Passive hover tracking for desktop eraser ring cursor when not actively dragging
    if (this.isEraserActive && !this.eraserDragActive && this.activePointerId === null && e.pointerType !== 'touch') {
      this.eraserPos = { x: rawX, y: rawY };
      this.redraw();
      return;
    }

    if (e.pointerId !== this.activePointerId) return;

    if (this.eraserDragActive) {
      const curPos: Point2D = { x: rawX, y: rawY };
      this.eraserPos = curPos;

      const prevPos = this.lastEraserPos || curPos;
      const capsule: Capsule = {
        p0: prevPos,
        p1: curPos,
        radius: state.eraserRadius,
      };
      this.lastEraserPos = curPos;
      this.performCapsuleErase(capsule);
      this.startAnimation();
      return;
    }

    if (!this.currentStroke) return;

    const normX = Math.max(0, Math.min(1, rawX / this.width));
    const normY = Math.max(0, Math.min(1, rawY / this.height));

    if (!this.lastPointPos) {
      this.lastPointPos = { x: normX, y: normY };
      return;
    }

    const dxPx = (normX - this.lastPointPos.x) * this.width;
    const dyPx = (normY - this.lastPointPos.y) * this.height;
    const distSq = dxPx * dxPx + dyPx * dyPx;

    if (distSq < 9) {
      return;
    }

    const now = performance.now();
    const dt = Math.max(1, now - this.lastPointTime);
    const speed = Math.sqrt(distSq) / dt;

    if (e.pressure && e.pressure > 0) {
      const targetWidth = Math.max(2.2, Math.min(5.8, 2 + e.pressure * 3.8));
      this.currentStroke.width = this.currentStroke.width * 0.7 + targetWidth * 0.3;
    } else {
      const targetWidth = Math.max(2.4, Math.min(4.8, 4.4 - Math.min(speed, 2) * 0.9));
      this.currentStroke.width = this.currentStroke.width * 0.8 + targetWidth * 0.2;
    }

    const t = Math.round(now - this.strokeStartTime);
    this.currentStroke.points.push({ x: normX, y: normY, t });

    this.lastPointPos = { x: normX, y: normY };
    this.lastPointTime = now;

    this.triggerLivePitch(normX, normY);
    this.startAnimation();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== this.activePointerId) return;

    if (this.canvas.hasPointerCapture(e.pointerId)) {
      this.canvas.releasePointerCapture(e.pointerId);
    }
    this.activePointerId = null;
    this.activeNoteDisplay = null;
    this.lastPreviewMidi = null;

    if (this.eraserDragActive) {
      this.eraserDragActive = false;
      this.lastEraserPos = null;
      if (e.pointerType === 'touch') {
        this.eraserPos = null;
      }

      // Final audio schedule rebuild once on pointerup
      if (this.audioRebuildThrottleTimer !== null) {
        window.clearTimeout(this.audioRebuildThrottleTimer);
        this.audioRebuildThrottleTimer = null;
      }
      this.lastAudioRebuildTime = performance.now();
      events.emit('strokes:updated', state.strokes);

      // Record single undo step for the entire eraser drag
      if (this.affectedOriginalsInDrag.size > 0) {
        const before = Array.from(this.affectedOriginalsInDrag.values());
        const after: HistoryDeltaItem[] = [];
        for (let i = 0; i < state.strokes.length; i++) {
          const s = state.strokes[i];
          if (this.createdFragmentIdsInDrag.has(s.id)) {
            after.push({ index: i, stroke: s });
          }
        }
        recordDeltaHistory(before, after);
      }
      this.affectedOriginalsInDrag.clear();
      this.createdFragmentIdsInDrag.clear();
      this.markStaticDirty();
      return;
    }

    this.eraserPos = null;

    if (this.currentStroke && this.currentStroke.points.length > 0) {
      pushHistorySnapshot();
      state.strokes.push(this.currentStroke);
      events.emit('stroke:added', this.currentStroke);
      events.emit('strokes:updated', state.strokes);
    }

    this.currentStroke = null;
    this.lastPointPos = null;
    this.markStaticDirty();
  };

  private onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId === this.activePointerId) {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      this.activePointerId = null;
      this.activeNoteDisplay = null;
      this.lastPreviewMidi = null;

      if (this.eraserDragActive) {
        this.eraserDragActive = false;
        this.lastEraserPos = null;
        this.eraserPos = null;

        if (this.audioRebuildThrottleTimer !== null) {
          window.clearTimeout(this.audioRebuildThrottleTimer);
          this.audioRebuildThrottleTimer = null;
        }
        this.lastAudioRebuildTime = performance.now();
        events.emit('strokes:updated', state.strokes);

        if (this.affectedOriginalsInDrag.size > 0) {
          const before = Array.from(this.affectedOriginalsInDrag.values());
          const after: HistoryDeltaItem[] = [];
          for (let i = 0; i < state.strokes.length; i++) {
            const s = state.strokes[i];
            if (this.createdFragmentIdsInDrag.has(s.id)) {
              after.push({ index: i, stroke: s });
            }
          }
          recordDeltaHistory(before, after);
        }
        this.affectedOriginalsInDrag.clear();
        this.createdFragmentIdsInDrag.clear();
        this.markStaticDirty();
        return;
      }

      this.eraserPos = null;

      // Palm rejection: If user was drawing and OS cancelled, save if valid stroke
      if (this.currentStroke && this.currentStroke.points.length > 1) {
        pushHistorySnapshot();
        state.strokes.push(this.currentStroke);
        events.emit('stroke:added', this.currentStroke);
        events.emit('strokes:updated', state.strokes);
      }

      this.currentStroke = null;
      this.lastPointPos = null;
      this.markStaticDirty();
    }
  };

  /**
   * Updates cached static offscreen canvas (guides, beat markers, committed strokes, and empty state).
   */
  private renderStaticLayer() {
    if (this.width <= 0 || this.height <= 0) return;

    const ctx = this.offscreenCtx;
    ctx.clearRect(0, 0, this.width, this.height);

    // 1. Background pitch guides & beat markers
    this.drawBackgroundGuides(ctx);

    // 2. Empty state prompt if canvas has no strokes
    if (state.strokes.length === 0) {
      this.drawEmptyState(ctx);
    } else {
      // 3. Draw all committed strokes
      for (const stroke of state.strokes) {
        this.drawStroke(ctx, stroke, false);
      }
    }

    this.staticLayerDirty = false;
  }

  public redraw() {
    if (this.width <= 0 || this.height <= 0) return;

    // Refresh static buffer if strokes, scales, or sizes changed
    if (this.staticLayerDirty) {
      this.renderStaticLayer();
    }

    // 1. Blit cached static buffer onto visible canvas in 1 ultra-fast draw call
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.width, this.height);

    // 2. Dynamic layer: live stroke being drawn right now
    if (this.currentStroke) {
      this.drawStroke(this.ctx, this.currentStroke, false);
    }

    // 3. Dynamic layer: stroke brightening highlights
    const now = performance.now();
    for (const stroke of state.strokes) {
      if (this.strokeHighlights.has(stroke.id) && now < (this.strokeHighlights.get(stroke.id) || 0)) {
        this.drawStroke(this.ctx, stroke, true);
      }
    }

    // 4. Dynamic layer: playhead and soft trailing band
    this.drawPlayhead();

    // 5. Dynamic layer: in flow mode, calm dot riding along sounding stroke
    if (state.playbackMode === 'flow') {
      this.drawFlowPlayheadDots();
    }

    // 6. Dynamic layer: hit ripples and fading note readouts
    this.drawHitEffects();

    // 7. Floating note badge under finger/mouse when drawing
    if (this.activeNoteDisplay) {
      this.drawNoteBadge(this.activeNoteDisplay);
    }

    // 7. Eraser indicator cursor ring
    if (state.activeTool === 'eraser' && this.eraserPos) {
      this.drawEraserRing(this.eraserPos.x, this.eraserPos.y);
    }
  }

  private drawBackgroundGuides(ctx: CanvasRenderingContext2D) {
    const tm = getTrackManager();
    const track = tm.getTrack(state.selectedTrackId);
    if (track && track.trackType === 'beat') {
      this.drawDrumLanes(ctx);
      this.drawBeatMarkers(ctx);
      return;
    }

    const scaleNotes = buildScaleNotes(state.rootNote, state.scaleName, 3, 6);
    const noteCount = scaleNotes.length;

    // Pitch guide lines
    for (let i = 0; i < noteCount; i++) {
      const midi = scaleNotes[i];
      const yNorm = 1 - i / (noteCount - 1);
      const y = Math.round(yNorm * this.height);
      const isRoot = isRootNote(midi, state.rootNote);

      ctx.beginPath();
      ctx.lineWidth = isRoot ? 1.2 : 0.8;
      ctx.strokeStyle = isRoot ? this.lineRootColor : this.lineSubtleColor;
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(this.width, y + 0.5);
      ctx.stroke();

      if (isRoot) {
        ctx.save();
        ctx.font = '500 10px "DM Mono", monospace';
        ctx.fillStyle = getThemeTokens().inkSoft;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const label = midiToNoteName(midi);
        ctx.fillText(label, 6, y - 7);
        ctx.restore();
      }
    }

    this.drawBeatMarkers(ctx);
  }

  private drawBeatMarkers(ctx: CanvasRenderingContext2D) {
    const totalBeats = 8;
    for (let i = 1; i < totalBeats; i++) {
      const x = Math.round((i / totalBeats) * this.width);
      ctx.beginPath();
      const isBarBoundary = i === totalBeats / 2;
      ctx.lineWidth = 1;
      ctx.strokeStyle = isBarBoundary ? this.lineColor : this.lineSubtleColor;
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, this.height);
      ctx.stroke();
    }
  }

  private drawDrumLanes(ctx: CanvasRenderingContext2D) {
    const tm = getTrackManager();
    const selTrack = tm.getTrack(state.selectedTrackId);
    const isFlow = selTrack?.beatMode === 'flow';
    const flowStyle = selTrack?.beatFlowStyle || 'glide';
    const isDark = getTheme() === 'dark';
    const tokens = getThemeTokens();

    const laneHeight = this.height / 8;
    for (let i = 0; i < 8; i++) {
      const meta = DRUM_LANES[i];
      const yTop = i * laneHeight;
      if (i % 2 === 1) {
        ctx.fillStyle = isDark ? "rgba(237, 229, 211, 0.035)" : "rgba(28, 26, 22, 0.025)";
        ctx.fillRect(0, yTop, this.width, laneHeight);
      }
      ctx.beginPath();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = this.lineSubtleColor;
      ctx.moveTo(0, Math.round(yTop) + 0.5);
      ctx.lineTo(this.width, Math.round(yTop) + 0.5);
      ctx.stroke();

      ctx.save();
      ctx.font = '600 10px "DM Mono", monospace';
      ctx.fillStyle = isFlow
        ? (isDark ? "rgba(163, 155, 136, 0.22)" : "rgba(91, 85, 74, 0.18)")
        : tokens.inkSoft;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.shortLabel, 10, yTop + laneHeight / 2);

      // On narrow screens (<600px), only show 2-letter code to keep lanes readable
      if (this.width >= 600) {
        ctx.font = '500 11px "Instrument Sans", sans-serif';
        ctx.fillStyle = isFlow
          ? (isDark ? "rgba(237, 229, 211, 0.14)" : "rgba(28, 26, 22, 0.12)")
          : (isDark ? "rgba(237, 229, 211, 0.55)" : "rgba(28, 26, 22, 0.45)");
        ctx.fillText(meta.name, 36, yTop + laneHeight / 2);
      }
      ctx.restore();
    }

    // In Flow mode, draw left edge axis hint describing what height means
    if (isFlow) {
      ctx.save();
      const axisName = flowStyle === 'glide' ? 'Pitch' : flowStyle === 'roll' ? 'Intensity' : 'Brightness';
      const topDesc = flowStyle === 'glide' ? '▲ High (C4)' : flowStyle === 'roll' ? '▲ 1/64 Rate' : '▲ 10 kHz';
      const botDesc = flowStyle === 'glide' ? '▼ Low (C1)' : flowStyle === 'roll' ? '▼ 1/8 Rate' : '▼ 400 Hz';

      // Left axis pill indicator
      ctx.fillStyle = isDark ? 'rgba(35, 32, 26, 0.92)' : 'rgba(233, 223, 203, 0.9)';
      ctx.strokeStyle = tokens.line;
      ctx.lineWidth = 1;

      // Small top hint badge
      ctx.beginPath();
      ctx.roundRect(8, 8, 86, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.font = '600 9.5px "DM Mono", monospace';
      ctx.fillStyle = tokens.ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(topDesc, 14, 18);

      // Center axis title tag
      ctx.fillStyle = isDark ? 'rgba(237, 229, 211, 0.08)' : 'rgba(28, 26, 22, 0.08)';
      ctx.beginPath();
      ctx.roundRect(8, this.height / 2 - 12, 104, 24, 4);
      ctx.fill();
      ctx.stroke();
      ctx.font = '600 10px "DM Mono", monospace';
      ctx.fillStyle = tokens.ink;
      ctx.fillText(`Axis: ${axisName}`, 14, this.height / 2);

      // Small bottom hint badge
      ctx.fillStyle = isDark ? 'rgba(35, 32, 26, 0.92)' : 'rgba(233, 223, 203, 0.9)';
      ctx.beginPath();
      ctx.roundRect(8, this.height - 28, 86, 20, 4);
      ctx.fill();
      ctx.stroke();
      ctx.font = '600 9.5px "DM Mono", monospace';
      ctx.fillStyle = tokens.ink;
      ctx.fillText(botDesc, 14, this.height - 18);

      ctx.restore();
    }
  }

  private drawEmptyState(ctx: CanvasRenderingContext2D) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const tokens = getThemeTokens();
    const isDark = getTheme() === 'dark';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 15px "Fraunces", serif';
    ctx.fillStyle = tokens.inkSoft;
    ctx.fillText('Draw something. Anything.', cx, cy - 8);

    // Hand-drawn style ink squiggle arrow
    ctx.strokeStyle = isDark ? 'rgba(237, 229, 211, 0.32)' : 'rgba(28, 26, 22, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const arrowY = cy + 18;
    ctx.beginPath();
    ctx.moveTo(cx - 36, arrowY);
    ctx.quadraticCurveTo(cx - 4, arrowY + 12, cx + 28, arrowY + 3);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(cx + 20, arrowY - 2);
    ctx.lineTo(cx + 29, arrowY + 3);
    ctx.lineTo(cx + 22, arrowY + 10);
    ctx.stroke();

    ctx.restore();
  }

  private drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, isHighlightOverlay: boolean) {
    const pts = stroke.points;
    if (pts.length === 0) return;

    const strokeColor = this.getTrackColor(stroke.trackId);
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = isHighlightOverlay ? stroke.width * 1.25 : stroke.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isHighlightOverlay) {
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 6;
    }

    if (pts.length === 1) {
      const pt = pts[0];
      const px = pt.x * this.width;
      const py = pt.y * this.height;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2, (stroke.width * (isHighlightOverlay ? 1.3 : 1)) * 0.7), 0, Math.PI * 2);
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

  private drawPlayhead() {
    if (!state.isPlaying) return;

    const progress = getTransport().getProgress();
    const px = progress * this.width;
    const ctx = this.ctx;
    const tokens = getThemeTokens();
    const isDark = getTheme() === 'dark';

    // Faint fading band behind playhead (3% to 8% width)
    const trailWidth = Math.max(16, Math.min(36, this.width * 0.05));
    const grad = ctx.createLinearGradient(px - trailWidth, 0, px, 0);
    if (isDark) {
      grad.addColorStop(0, 'rgba(237, 229, 211, 0)');
      grad.addColorStop(0.7, 'rgba(237, 229, 211, 0.04)');
      grad.addColorStop(1, 'rgba(237, 229, 211, 0.10)');
    } else {
      grad.addColorStop(0, 'rgba(28, 26, 22, 0)');
      grad.addColorStop(0.7, 'rgba(28, 26, 22, 0.03)');
      grad.addColorStop(1, 'rgba(28, 26, 22, 0.08)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(px - trailWidth, 0, trailWidth, this.height);

    // Crisp ink line
    ctx.beginPath();
    ctx.strokeStyle = tokens.ink;
    ctx.lineWidth = 1.5;
    ctx.moveTo(px + 0.5, 0);
    ctx.lineTo(px + 0.5, this.height);
    ctx.stroke();
  }

  private drawFlowPlayheadDots() {
    if (!state.isPlaying) return;
    const progress = getTransport().getProgress();
    const ctx = this.ctx;
    const now = performance.now();

    for (const stroke of state.strokes) {
      const tr = getTrackManager().getTrack(stroke.trackId);
      const isBeat = tr && tr.trackType === 'beat';
      if (isBeat) {
        if (tr.beatMode !== 'flow') continue;
      } else {
        if (state.playbackMode !== 'flow') continue;
      }

      const pts = stroke.points;
      if (pts.length === 0) continue;

      let minX = Infinity;
      let maxX = -Infinity;
      for (const p of pts) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
      }

      const isNearVertical = (maxX - minX) < 0.03;
      const effectiveMinX = isNearVertical ? Math.max(0, minX - 0.015) : minX;
      const effectiveMaxX = isNearVertical ? Math.min(1, maxX + 0.015) : maxX;

      if (progress < effectiveMinX || progress > effectiveMaxX) continue;

      let interpY: number | null = null;
      if (pts.length === 1 || isNearVertical) {
        interpY = pts[0].y;
      } else {
        for (let k = 0; k < pts.length - 1; k++) {
          const p1 = pts[k];
          const p2 = pts[k + 1];
          const segMinX = Math.min(p1.x, p2.x);
          const segMaxX = Math.max(p1.x, p2.x);
          if (progress >= segMinX && progress <= segMaxX) {
            const dx = p2.x - p1.x;
            const t = Math.abs(dx) > 0.00001 ? (progress - p1.x) / dx : 0.5;
            interpY = p1.y + t * (p2.y - p1.y);
            break;
          }
        }
        if (interpY === null) {
          let closestDist = Infinity;
          for (const p of pts) {
            const d = Math.abs(p.x - progress);
            if (d < closestDist) {
              closestDist = d;
              interpY = p.y;
            }
          }
        }
      }

      if (interpY === null) continue;

      const px = progress * this.width;
      const py = interpY * this.height;
      const color = this.getTrackColor(stroke.trackId);

      const pulse = Math.sin(now * 0.007) * 0.6;
      const radius = 4.8 + pulse;

      ctx.save();
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.45 + pulse * 0.15;
      ctx.arc(px, py, radius + 2.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
  }

  private drawHitEffects() {
    if (this.hitEffects.length === 0) return;
    const now = performance.now();
    const ctx = this.ctx;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.hitEffects = this.hitEffects.filter((r) => now - r.startTime < r.duration);

    for (const r of this.hitEffects) {
      const elapsed = now - r.startTime;
      const progress = elapsed / r.duration;
      const alpha = Math.max(0, 1 - progress);
      const px = r.x * this.width;
      const py = r.y * this.height;

      ctx.save();

      if (r.isBeat) {
        // Step 16-B7: Solid pulse in track colour, no expanding ripple rings
        const pulseRadius = 5 + (1 - progress) * 2.5;
        ctx.beginPath();
        ctx.fillStyle = r.color;
        ctx.globalAlpha = alpha * 0.95;
        ctx.arc(px, py, pulseRadius, 0, Math.PI * 2);
        ctx.fill();
      } else if (prefersReducedMotion) {
        // Reduced motion: simple opacity flash (no expanding ring)
        ctx.beginPath();
        ctx.fillStyle = r.color;
        ctx.globalAlpha = alpha * 0.7;
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Expanding ring ripple (stroke only, no fill, ~24px expansion)
        const radius = 3 + progress * 21;
        ctx.beginPath();
        ctx.strokeStyle = r.color;
        ctx.globalAlpha = alpha * 0.85;
        ctx.lineWidth = 1.5;
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Floating note readout for melodic hits
      if (!r.isBeat && state.showHitNotes && elapsed < 320) {
        const tokens = getThemeTokens();
        const noteAlpha = Math.max(0, 1 - elapsed / 320);
        ctx.font = '500 10px "DM Mono", monospace';
        ctx.fillStyle = tokens.ink;
        ctx.globalAlpha = noteAlpha * 0.9;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(r.noteName, px, py - 10 - progress * 8);
      }

      ctx.restore();
    }
  }

  private drawEraserRing(x: number, y: number) {
    const ctx = this.ctx;
    const tokens = getThemeTokens();
    const radius = state.eraserRadius;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = tokens.inkSoft;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawNoteBadge(display: { name: string; x: number; y: number }) {
    const ctx = this.ctx;
    const px = display.x * this.width;
    const py = display.y * this.height;

    const badgeW = 32;
    const badgeH = 20;
    const badgeX = Math.min(px + 14, this.width - badgeW - 8);
    const badgeY = Math.max(py - 26, 8);

    const tokens = getThemeTokens();
    ctx.save();
    ctx.fillStyle = tokens.paperDeep;
    ctx.strokeStyle = tokens.line;
    ctx.lineWidth = 1;

    const r = 4;
    ctx.beginPath();
    ctx.moveTo(badgeX + r, badgeY);
    ctx.lineTo(badgeX + badgeW - r, badgeY);
    ctx.arcTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + r, r);
    ctx.lineTo(badgeX + badgeW, badgeY + badgeH - r);
    ctx.arcTo(badgeX + badgeW, badgeY + badgeH, badgeX + badgeW - r, badgeY + badgeH, r);
    ctx.lineTo(badgeX + r, badgeY + badgeH);
    ctx.arcTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - r, r);
    ctx.lineTo(badgeX, badgeY + r);
    ctx.arcTo(badgeX, badgeY, badgeX + r, badgeY, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.font = '500 11px "DM Mono", monospace';
    ctx.fillStyle = tokens.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(display.name, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

    ctx.restore();
  }

  public destroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioRebuildThrottleTimer !== null) {
      window.clearTimeout(this.audioRebuildThrottleTimer);
      this.audioRebuildThrottleTimer = null;
    }
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('orientationchange', this.onWindowResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.remove();
  }
}
