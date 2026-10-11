import {
  state,
  events,
  undo,
  redo,
  canUndo,
  canRedo,
  clearStrokes,
  ToolMode,
  BeatFlowStyle,
  BeatRollVoice,
  BeatSweepCharacter,
} from '../state';
import { getTransport } from '../audio/transport';
import { DEFAULT_TRACK_CONFIGS, getTrackManager, Track } from '../audio/tracks';
import { INSTRUMENTS_MAP } from '../audio/instruments';
import { DRUM_KITS, DrumKitId } from '../audio/drums';
import { BeatRate } from '../audio/beatSchedule';

// 1.5px stroke custom inline SVGs (strictly matching design system)
const ICONS = {
  play: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="none"><polygon points="7 4 19 12 7 20 7 4"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>`,
  pen: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>`,
  eraser: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m19 11-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3L6 18l4 4h10"/><path d="m14 16 4-4"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  minus: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  chevron: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
};

export class Toolbar {
  private element: HTMLElement;
  private scrollContainer: HTMLElement | null = null;
  private fadeLeft: HTMLElement | null = null;
  private fadeRight: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private unsubs: (() => void)[] = [];
  private clearConfirmTimer: number | null = null;
  private hasDragged: boolean = false;

  constructor(container: HTMLElement) {
    this.element = document.createElement('footer');
    this.element.className = 'instruversal-toolbar';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Controls and tools');

    container.appendChild(this.element);
    this.render();
    this.setupListeners();
    this.setupKeyboardShortcuts();
    this.setupScrollInteractions();
  }

  private getCurrentInstrumentName(): string {
    const tm = getTrackManager();
    const track = tm.getTrack(state.selectedTrackId);
    if (!track) return 'Pluck';
    if (track.trackType === 'beat') {
      const kit = DRUM_KITS[track.kitId];
      return kit ? kit.name : '808 Kit';
    }
    const meta = INSTRUMENTS_MAP[track.instrumentId];
    return meta ? meta.name : track.instrumentId;
  }

  private render() {
    const instName = this.getCurrentInstrumentName();

    this.element.innerHTML = `
      <div class="dock-wrapper">
        <div class="dock-fade dock-fade-left hidden" id="tb-fade-left" aria-hidden="true"></div>

        <div class="dock-scroll-container" id="tb-scroll-container">
          <div class="toolbar-inner" id="tb-inner">
            <!-- 1. Play / Pause primary button -->
            <button type="button" class="toolbar-btn toolbar-btn-play" id="tb-play-btn" aria-label="Play or pause loop" tabindex="0">
              ${state.isPlaying ? ICONS.pause : ICONS.play}
            </button>

            <div class="toolbar-divider" aria-hidden="true"></div>

            <!-- 2. BPM Stepper -->
            <div class="toolbar-stepper" aria-label="BPM control">
              <button type="button" class="stepper-btn" id="tb-bpm-dec" aria-label="Decrease BPM by 5" tabindex="0">
                ${ICONS.minus}
              </button>
              <span class="bpm-display">
                <span class="bpm-num" id="tb-bpm-val">${state.bpm}</span>
                <span class="bpm-lbl">BPM</span>
              </span>
              <button type="button" class="stepper-btn" id="tb-bpm-inc" aria-label="Increase BPM by 5" tabindex="0">
                ${ICONS.plus}
              </button>
            </div>

            <div class="toolbar-divider" aria-hidden="true"></div>

            <!-- 3. Context Controls: Flow/Notes + Glide (Melodic) OR Kit + Rate + Swing + Human (Beat) -->
            <div class="toolbar-context-container" id="tb-context-container"></div>

            <div class="toolbar-divider" aria-hidden="true"></div>

            <!-- 4. Tool Selection: Pencil & Eraser side-by-side segmented + Undo + Redo + Clear -->
            <div class="toolbar-tool-group" role="group" aria-label="Drawing tools and history">
              <div class="toolbar-tool-toggle" role="group" aria-label="Tool selection">
                <button type="button" class="tool-seg-btn ${state.activeTool === 'draw' ? 'active' : ''}" id="tb-tool-draw" aria-label="Pencil tool" tabindex="0">
                  ${ICONS.pen}
                </button>
                <button type="button" class="tool-seg-btn ${state.activeTool === 'eraser' ? 'active' : ''}" id="tb-tool-eraser" aria-label="Eraser tool" tabindex="0">
                  ${ICONS.eraser}
                </button>
              </div>

              <div class="toolbar-history-sub" role="group" aria-label="History">
                <button type="button" class="toolbar-btn tool-icon-btn" id="tb-undo-btn" aria-label="Undo" ${canUndo() ? '' : 'disabled'} tabindex="0">
                  ${ICONS.undo}
                </button>
                <button type="button" class="toolbar-btn tool-icon-btn" id="tb-redo-btn" aria-label="Redo" ${canRedo() ? '' : 'disabled'} tabindex="0">
                  ${ICONS.redo}
                </button>
              </div>

              <div class="toolbar-clear-wrapper" id="tb-clear-wrapper">
                <button type="button" class="toolbar-btn tool-icon-btn toolbar-btn-clear" id="tb-clear-btn" aria-label="Clear drawing" tabindex="0">
                  ${ICONS.trash}
                </button>
              </div>
            </div>

            <div class="toolbar-divider" aria-hidden="true"></div>

            <!-- 5. Track Pigment Palette Dots -->
            <div class="toolbar-palette" role="group" aria-label="Track pigment selection">
              ${DEFAULT_TRACK_CONFIGS.map(
                (t) => `
                <button type="button" class="palette-dot-btn ${t.id === state.selectedTrackId ? 'active' : ''}" data-track-id="${t.id}" aria-label="Select ${t.name}" tabindex="0">
                  <span class="palette-dot" style="background-color: ${t.colorHex}"></span>
                </button>
              `
              ).join('')}
            </div>

            <div class="toolbar-divider" aria-hidden="true"></div>

            <!-- 6. Instrument button: opens instrument picker for selected track -->
            <button type="button" class="toolbar-dock-btn" id="tb-inst-btn" aria-label="Choose instrument for track" tabindex="0">
              <span class="dock-btn-text" id="tb-inst-name">${instName}</span>
              <span class="dock-btn-chevron" aria-hidden="true">${ICONS.chevron}</span>
            </button>

            <div class="toolbar-divider" aria-hidden="true"></div>

            <!-- 7. Effects button -->
            <button type="button" class="toolbar-dock-btn" id="tb-fx-btn" aria-label="Open audio effects rack" tabindex="0">
              <span class="dock-btn-text">Effects</span>
            </button>

            <div class="toolbar-divider" aria-hidden="true"></div>

            <!-- 8. Mixer / Key button -->
            <button type="button" class="toolbar-dock-btn" id="tb-mixer-btn" aria-label="Open track mixer and musical key" tabindex="0">
              <span class="dock-btn-text">Mixer</span>
            </button>
          </div>
        </div>

        <div class="dock-fade dock-fade-right" id="tb-fade-right" aria-hidden="true"></div>
      </div>
    `;

    this.scrollContainer = this.element.querySelector<HTMLElement>('#tb-scroll-container');
    this.fadeLeft = this.element.querySelector<HTMLElement>('#tb-fade-left');
    this.fadeRight = this.element.querySelector<HTMLElement>('#tb-fade-right');

    this.bindDomEvents();
  }

  private setupScrollInteractions() {
    const sc = this.scrollContainer;
    if (!sc) return;

    // 1. Sideways wheel handler: translate vertical mouse wheel to horizontal scrolling
    sc.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          sc.scrollLeft += e.deltaY;
          this.updateFadeIndicators();
        }
      },
      { passive: false }
    );

    // 2. Drag-to-scroll on desktop mouse
    let isDown = false;
    let startX = 0;
    let scrollStart = 0;

    sc.addEventListener('mousedown', (e: MouseEvent) => {
      // Don't drag if clicking an input or slider
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      isDown = true;
      this.hasDragged = false;
      startX = e.pageX - sc.offsetLeft;
      scrollStart = sc.scrollLeft;
    });

    window.addEventListener('mouseup', () => {
      if (isDown) {
        isDown = false;
        // Keep hasDragged flag true for a tick so click handlers can check it
        window.setTimeout(() => {
          this.hasDragged = false;
        }, 50);
      }
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDown) return;
      const x = e.pageX - sc.offsetLeft;
      const walk = (x - startX) * 1.3;
      if (Math.abs(walk) > 4) {
        this.hasDragged = true;
      }
      sc.scrollLeft = scrollStart - walk;
      this.updateFadeIndicators();
    });

    // 3. Scroll & Resize listeners for edge fades
    sc.addEventListener('scroll', () => this.updateFadeIndicators(), { passive: true });

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.updateFadeIndicators());
      this.resizeObserver.observe(sc);
    }
    window.addEventListener('resize', this.onWindowResize);

    // Initial check
    requestAnimationFrame(() => this.updateFadeIndicators());
  }

  private onWindowResize = () => {
    this.updateFadeIndicators();
  };

  private updateFadeIndicators() {
    const sc = this.scrollContainer;
    if (!sc || !this.fadeLeft || !this.fadeRight) return;

    const canScrollLeft = sc.scrollLeft > 6;
    const canScrollRight = sc.scrollLeft < sc.scrollWidth - sc.clientWidth - 6;

    this.fadeLeft.classList.toggle('hidden', !canScrollLeft);
    this.fadeRight.classList.toggle('hidden', !canScrollRight);
  }

  private bindDomEvents() {
    // Suppress click if user was drag-scrolling
    this.scrollContainer?.addEventListener(
      'click',
      (e) => {
        if (this.hasDragged) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
      true
    );

    // Play button
    const playBtn = this.element.querySelector<HTMLButtonElement>('#tb-play-btn')!;
    playBtn.addEventListener('click', async () => {
      if (this.hasDragged) return;
      const transport = getTransport();
      await transport.toggle();
    });

    // BPM controls
    const decBtn = this.element.querySelector<HTMLButtonElement>('#tb-bpm-dec')!;
    const incBtn = this.element.querySelector<HTMLButtonElement>('#tb-bpm-inc')!;
    const bpmVal = this.element.querySelector<HTMLElement>('#tb-bpm-val')!;

    decBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      const transport = getTransport();
      const nextBpm = transport.getBpm() - 5;
      transport.setBpm(nextBpm);
      bpmVal.textContent = String(transport.getBpm());
    });

    incBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      const transport = getTransport();
      const nextBpm = transport.getBpm() + 5;
      transport.setBpm(nextBpm);
      bpmVal.textContent = String(transport.getBpm());
    });

    // 3. Render context controls (Flow/Notes + Glide or Drum Kit + Rate + Swing + Human)
    this.renderContextControls();

    // Segmented tool buttons (Pencil / Eraser side-by-side)
    const drawBtn = this.element.querySelector<HTMLButtonElement>('#tb-tool-draw')!;
    const eraserBtn = this.element.querySelector<HTMLButtonElement>('#tb-tool-eraser')!;

    drawBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      this.setTool('draw');
    });

    eraserBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      this.setTool('eraser');
    });

    // Track Palette dots
    const dotBtns = this.element.querySelectorAll<HTMLButtonElement>('.palette-dot-btn');
    dotBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.hasDragged) return;
        const trackId = btn.dataset.trackId;
        if (!trackId) return;

        state.selectedTrackId = trackId;
        dotBtns.forEach((b) => b.classList.toggle('active', b.dataset.trackId === trackId));

        const track = getTrackManager().getTrack(trackId);
        if (track) {
          track.audition();
        }
        events.emit('track:select', trackId);
        this.updateInstrumentButton();
      });
    });

    // Instrument picker button
    const instBtn = this.element.querySelector<HTMLButtonElement>('#tb-inst-btn')!;
    instBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      events.emit('ui:open-instruments', state.selectedTrackId);
    });

    // Effects button
    const fxBtn = this.element.querySelector<HTMLButtonElement>('#tb-fx-btn')!;
    fxBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      events.emit('ui:open-fx', undefined);
    });

    // Mixer button
    const mixerBtn = this.element.querySelector<HTMLButtonElement>('#tb-mixer-btn')!;
    mixerBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      events.emit('ui:open-mixer', 'tracks');
    });

    // Undo / Redo
    const undoBtn = this.element.querySelector<HTMLButtonElement>('#tb-undo-btn')!;
    const redoBtn = this.element.querySelector<HTMLButtonElement>('#tb-redo-btn')!;

    undoBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      undo();
    });

    redoBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      redo();
    });

    // Clear with inline confirmation
    const clearWrapper = this.element.querySelector<HTMLElement>('#tb-clear-wrapper')!;
    const clearBtn = this.element.querySelector<HTMLButtonElement>('#tb-clear-btn')!;

    clearBtn.addEventListener('click', () => {
      if (this.hasDragged) return;
      this.showClearConfirmation(clearWrapper);
    });
  }

  private updateInstrumentButton() {
    const instLabel = this.element.querySelector<HTMLElement>('#tb-inst-name');
    if (instLabel) {
      instLabel.textContent = this.getCurrentInstrumentName();
    }
  }

  private setTool(tool: ToolMode) {
    state.activeTool = tool;
    const drawBtn = this.element.querySelector('#tb-tool-draw');
    const eraserBtn = this.element.querySelector('#tb-tool-eraser');

    drawBtn?.classList.toggle('active', tool === 'draw');
    eraserBtn?.classList.toggle('active', tool === 'eraser');

    events.emit('tool:change', tool);
  }

  private showClearConfirmation(wrapper: HTMLElement) {
    if (this.clearConfirmTimer !== null) {
      window.clearTimeout(this.clearConfirmTimer);
    }

    wrapper.innerHTML = `
      <div class="inline-confirm">
        <span class="confirm-query">Sure?</span>
        <button type="button" class="confirm-btn confirm-yes" id="tb-confirm-yes" tabindex="0">Yes</button>
        <button type="button" class="confirm-btn confirm-no" id="tb-confirm-no" tabindex="0">No</button>
      </div>
    `;

    const yesBtn = wrapper.querySelector<HTMLButtonElement>('#tb-confirm-yes')!;
    const noBtn = wrapper.querySelector<HTMLButtonElement>('#tb-confirm-no')!;

    yesBtn.addEventListener('click', () => {
      clearStrokes();
      this.resetClearButton(wrapper);
    });

    noBtn.addEventListener('click', () => {
      this.resetClearButton(wrapper);
    });

    this.clearConfirmTimer = window.setTimeout(() => {
      this.resetClearButton(wrapper);
    }, 4000);

    this.updateFadeIndicators();
  }

  private resetClearButton(wrapper: HTMLElement) {
    if (this.clearConfirmTimer !== null) {
      window.clearTimeout(this.clearConfirmTimer);
      this.clearConfirmTimer = null;
    }

    wrapper.innerHTML = `
      <button type="button" class="toolbar-btn tool-icon-btn toolbar-btn-clear" id="tb-clear-btn" aria-label="Clear drawing" tabindex="0">
        ${ICONS.trash}
      </button>
    `;

    const clearBtn = wrapper.querySelector<HTMLButtonElement>('#tb-clear-btn')!;
    clearBtn.addEventListener('click', () => {
      this.showClearConfirmation(wrapper);
    });

    this.updateFadeIndicators();
  }

  private renderContextControls() {
    const container = this.element.querySelector<HTMLElement>('#tb-context-container');
    if (!container) return;

    const tm = getTrackManager();
    const track = tm.getTrack(state.selectedTrackId);
    const isBeat = track?.trackType === 'beat';

    if (isBeat && track) {
      container.innerHTML = `
        <div class="toolbar-beat-group" role="group" aria-label="Beat pattern controls">
          <!-- Hits | Flow toggle -->
          <div class="toolbar-mode-toggle" role="group" aria-label="Beat playback mode">
            <button type="button" class="mode-pill-btn ${track.beatMode === 'hits' ? 'active' : ''}" id="tb-beat-mode-hits" aria-label="Stepped drum hits mode" tabindex="0">
              Hits
            </button>
            <button type="button" class="mode-pill-btn ${track.beatMode === 'flow' ? 'active' : ''}" id="tb-beat-mode-flow" aria-label="Continuous beat flow mode" tabindex="0">
              Flow
            </button>
          </div>

          ${
            track.beatMode === 'hits'
              ? `
            <!-- Kit chips -->
            <div class="segmented-chips kit-chips" role="group" aria-label="Drum kit">
              <button type="button" class="chip-btn ${track.kitId === '808' ? 'active' : ''}" data-kit="808" title="808 Kit" tabindex="0">808</button>
              <button type="button" class="chip-btn ${track.kitId === 'lofi' ? 'active' : ''}" data-kit="lofi" title="Lo-fi Kit" tabindex="0">Lo-fi</button>
              <button type="button" class="chip-btn ${track.kitId === 'acoustic' ? 'active' : ''}" data-kit="acoustic" title="Acoustic Kit" tabindex="0">Acoustic</button>
              <button type="button" class="chip-btn ${track.kitId === 'electro' ? 'active' : ''}" data-kit="electro" title="Electro Kit" tabindex="0">Electro</button>
            </div>

            <!-- Rate chips -->
            <div class="segmented-chips rate-chips" role="group" aria-label="Repeat rate">
              <button type="button" class="chip-btn ${track.beatRate === '1/4' ? 'active' : ''}" data-rate="1/4" title="1/4 Note" tabindex="0">1/4</button>
              <button type="button" class="chip-btn ${track.beatRate === '1/8' ? 'active' : ''}" data-rate="1/8" title="1/8 Note" tabindex="0">1/8</button>
              <button type="button" class="chip-btn ${track.beatRate === '1/8T' ? 'active' : ''}" data-rate="1/8T" title="1/8 Triplet" tabindex="0">1/8T</button>
              <button type="button" class="chip-btn ${track.beatRate === '1/16' ? 'active' : ''}" data-rate="1/16" title="1/16 Note" tabindex="0">1/16</button>
              <button type="button" class="chip-btn ${track.beatRate === '1/32' ? 'active' : ''}" data-rate="1/32" title="1/32 Note" tabindex="0">1/32</button>
            </div>

            <!-- Swing slider -->
            <div class="toolbar-mini-slider" title="Swing timing (0-60%)">
              <span class="mini-slider-lbl">Swing</span>
              <input type="range" class="mini-slider-input" id="tb-swing-slider" min="0" max="60" step="5" value="${track.swing}" aria-label="Swing percentage" tabindex="0" />
              <span class="mini-slider-val" id="tb-swing-val">${track.swing}%</span>
            </div>

            <!-- Humanize slider -->
            <div class="toolbar-mini-slider" title="Humanize jitter (0-100%)">
              <span class="mini-slider-lbl">Human</span>
              <input type="range" class="mini-slider-input" id="tb-human-slider" min="0" max="100" step="5" value="${track.humanize}" aria-label="Humanize percentage" tabindex="0" />
              <span class="mini-slider-val" id="tb-human-val">${track.humanize}%</span>
            </div>
          `
              : `
            <!-- Flow Style chips -->
            <div class="segmented-chips style-chips" role="group" aria-label="Flow style">
              <button type="button" class="chip-btn ${track.beatFlowStyle === 'glide' ? 'active' : ''}" data-style="glide" title="Glide sub/bass" tabindex="0">Glide</button>
              <button type="button" class="chip-btn ${track.beatFlowStyle === 'roll' ? 'active' : ''}" data-style="roll" title="Retrigger drum roll" tabindex="0">Roll</button>
              <button type="button" class="chip-btn ${track.beatFlowStyle === 'sweep' ? 'active' : ''}" data-style="sweep" title="Filtered noise sweep" tabindex="0">Sweep</button>
            </div>

            ${
              track.beatFlowStyle === 'glide'
                ? `
              <!-- Glide slider -->
              <div class="toolbar-glide-ctrl" id="tb-beat-glide-ctrl" title="Slide smoothness">
                <span class="glide-lbl">Glide</span>
                <input type="range" class="glide-slider" id="tb-beat-glide-slider" min="0" max="100" value="${state.glide}" aria-label="Glide percentage" tabindex="0" />
                <span class="glide-val" id="tb-beat-glide-val">${state.glide}%</span>
              </div>
            `
                : track.beatFlowStyle === 'roll'
                ? `
              <!-- Roll voice chips -->
              <div class="segmented-chips roll-voice-chips" role="group" aria-label="Roll voice">
                <button type="button" class="chip-btn ${track.beatRollVoice === 'snare' ? 'active' : ''}" data-voice="snare" title="Snare" tabindex="0">Snare</button>
                <button type="button" class="chip-btn ${track.beatRollVoice === 'hat' ? 'active' : ''}" data-voice="hat" title="Hi-Hat" tabindex="0">Hat</button>
                <button type="button" class="chip-btn ${track.beatRollVoice === 'tom' ? 'active' : ''}" data-voice="tom" title="Tom" tabindex="0">Tom</button>
              </div>
            `
                : `
              <!-- Sweep character chips -->
              <div class="segmented-chips sweep-char-chips" role="group" aria-label="Sweep character">
                <button type="button" class="chip-btn ${track.beatSweepCharacter === 'shaker' ? 'active' : ''}" data-char="shaker" title="Shaker noise" tabindex="0">Shaker</button>
                <button type="button" class="chip-btn ${track.beatSweepCharacter === 'hat' ? 'active' : ''}" data-char="hat" title="Hat noise" tabindex="0">Hat</button>
              </div>
            `
            }
          `
          }
        </div>
      `;
      this.bindBeatControls(container, track);
    } else {
      container.innerHTML = `
        <div class="toolbar-mode-group">
          <div class="toolbar-mode-toggle" role="group" aria-label="Playback mode">
            <button type="button" class="mode-pill-btn ${state.playbackMode === 'flow' ? 'active' : ''}" id="tb-mode-flow" aria-label="Continuous flow mode" tabindex="0">
              Flow
            </button>
            <button type="button" class="mode-pill-btn ${state.playbackMode === 'notes' ? 'active' : ''}" id="tb-mode-notes" aria-label="Stepped notes mode" tabindex="0">
              Notes
            </button>
          </div>

          <div class="toolbar-glide-ctrl ${state.playbackMode === 'flow' ? '' : 'hidden'}" id="tb-glide-ctrl" title="Pitch glide">
            <span class="glide-lbl">Glide</span>
            <input type="range" class="glide-slider" id="tb-glide-slider" min="0" max="100" value="${state.glide}" aria-label="Pitch glide amount" tabindex="0" />
            <span class="glide-val" id="tb-glide-val">${state.glide}%</span>
          </div>
        </div>
      `;
      this.bindMelodicControls(container);
    }

    this.updateFadeIndicators();
  }

  private bindMelodicControls(container: HTMLElement) {
    const flowBtn = container.querySelector<HTMLButtonElement>('#tb-mode-flow');
    const notesBtn = container.querySelector<HTMLButtonElement>('#tb-mode-notes');
    const glideCtrl = container.querySelector<HTMLElement>('#tb-glide-ctrl');
    const glideSlider = container.querySelector<HTMLInputElement>('#tb-glide-slider');
    const glideVal = container.querySelector<HTMLElement>('#tb-glide-val');

    flowBtn?.addEventListener('click', () => {
      if (this.hasDragged) return;
      state.playbackMode = 'flow';
      flowBtn.classList.add('active');
      notesBtn?.classList.remove('active');
      glideCtrl?.classList.remove('hidden');
      events.emit('playback-mode:change', 'flow');
      this.updateFadeIndicators();
    });

    notesBtn?.addEventListener('click', () => {
      if (this.hasDragged) return;
      state.playbackMode = 'notes';
      notesBtn.classList.add('active');
      flowBtn?.classList.remove('active');
      glideCtrl?.classList.add('hidden');
      events.emit('playback-mode:change', 'notes');
      this.updateFadeIndicators();
    });

    glideSlider?.addEventListener('input', () => {
      const val = parseInt(glideSlider.value, 10);
      state.glide = val;
      if (glideVal) glideVal.textContent = `${val}%`;
      events.emit('glide:change', val);
    });
  }

  private bindBeatControls(container: HTMLElement, track: Track) {
    // 1. Hits | Flow mode toggling
    const hitsBtn = container.querySelector<HTMLButtonElement>('#tb-beat-mode-hits');
    const flowBtn = container.querySelector<HTMLButtonElement>('#tb-beat-mode-flow');

    hitsBtn?.addEventListener('click', () => {
      if (this.hasDragged) return;
      track.setBeatMode('hits');
      events.emit('track:beat-param-change', { trackId: track.id, beatMode: 'hits' });
      events.emit('track:update', track.id);
      this.renderContextControls();
    });

    flowBtn?.addEventListener('click', () => {
      if (this.hasDragged) return;
      track.setBeatMode('flow');
      events.emit('track:beat-param-change', { trackId: track.id, beatMode: 'flow' });
      events.emit('track:update', track.id);
      this.renderContextControls();
    });

    if (track.beatMode === 'hits') {
      const kitBtns = container.querySelectorAll<HTMLButtonElement>('.kit-chips .chip-btn');
      kitBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          if (this.hasDragged) return;
          const kitId = btn.dataset.kit as DrumKitId;
          if (!kitId) return;
          track.setKit(kitId);
          track.audition();
          kitBtns.forEach((b) => b.classList.toggle('active', b.dataset.kit === kitId));
          this.updateInstrumentButton();
          events.emit('track:beat-param-change', { trackId: track.id, kitId });
          events.emit('track:update', track.id);
        });
      });

      const rateBtns = container.querySelectorAll<HTMLButtonElement>('.rate-chips .chip-btn');
      rateBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          if (this.hasDragged) return;
          const rate = btn.dataset.rate as BeatRate;
          if (!rate) return;
          track.beatRate = rate;
          rateBtns.forEach((b) => b.classList.toggle('active', b.dataset.rate === rate));
          events.emit('track:beat-param-change', { trackId: track.id, rate });
          events.emit('track:update', track.id);
        });
      });

      const swingSlider = container.querySelector<HTMLInputElement>('#tb-swing-slider');
      const swingVal = container.querySelector<HTMLElement>('#tb-swing-val');
      swingSlider?.addEventListener('input', () => {
        const val = parseInt(swingSlider.value, 10);
        track.swing = val;
        if (swingVal) swingVal.textContent = `${val}%`;
        events.emit('track:beat-param-change', { trackId: track.id, swing: val });
      });

      const humanSlider = container.querySelector<HTMLInputElement>('#tb-human-slider');
      const humanVal = container.querySelector<HTMLElement>('#tb-human-val');
      humanSlider?.addEventListener('input', () => {
        const val = parseInt(humanSlider.value, 10);
        track.humanize = val;
        if (humanVal) humanVal.textContent = `${val}%`;
        events.emit('track:beat-param-change', { trackId: track.id, humanize: val });
      });
    } else {
      // Flow mode controls
      const styleBtns = container.querySelectorAll<HTMLButtonElement>('.style-chips .chip-btn');
      styleBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          if (this.hasDragged) return;
          const style = btn.dataset.style as BeatFlowStyle;
          if (!style) return;
          track.setBeatFlowStyle(style);
          events.emit('track:beat-param-change', { trackId: track.id, beatFlowStyle: style });
          events.emit('track:update', track.id);
          this.renderContextControls();
        });
      });

      if (track.beatFlowStyle === 'glide') {
        const glideSlider = container.querySelector<HTMLInputElement>('#tb-beat-glide-slider');
        const glideVal = container.querySelector<HTMLElement>('#tb-beat-glide-val');
        glideSlider?.addEventListener('input', () => {
          const val = parseInt(glideSlider.value, 10);
          state.glide = val;
          if (glideVal) glideVal.textContent = `${val}%`;
          events.emit('glide:change', val);
        });
      } else if (track.beatFlowStyle === 'roll') {
        const rollVoiceBtns = container.querySelectorAll<HTMLButtonElement>('.roll-voice-chips .chip-btn');
        rollVoiceBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            if (this.hasDragged) return;
            const voice = btn.dataset.voice as BeatRollVoice;
            if (!voice) return;
            track.setBeatRollVoice(voice);
            events.emit('track:beat-param-change', { trackId: track.id, beatRollVoice: voice });
            events.emit('track:update', track.id);
            rollVoiceBtns.forEach((b) => b.classList.toggle('active', b.dataset.voice === voice));
          });
        });
      } else if (track.beatFlowStyle === 'sweep') {
        const sweepCharBtns = container.querySelectorAll<HTMLButtonElement>('.sweep-char-chips .chip-btn');
        sweepCharBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            if (this.hasDragged) return;
            const char = btn.dataset.char as BeatSweepCharacter;
            if (!char) return;
            track.setBeatSweepCharacter(char);
            events.emit('track:beat-param-change', { trackId: track.id, beatSweepCharacter: char });
            events.emit('track:update', track.id);
            sweepCharBtns.forEach((b) => b.classList.toggle('active', b.dataset.char === char));
          });
        });
      }
    }
  }

  private setupListeners() {
    this.unsubs.push(
      events.on('transport:play', () => this.updatePlayState(true)),
      events.on('transport:pause', () => this.updatePlayState(false)),
      events.on('bpm:change', (newBpm) => {
        const bpmVal = this.element.querySelector('#tb-bpm-val');
        if (bpmVal) bpmVal.textContent = String(newBpm);
      }),
      events.on('history:change', ({ canUndo: u, canRedo: r }) => {
        const undoBtn = this.element.querySelector<HTMLButtonElement>('#tb-undo-btn');
        const redoBtn = this.element.querySelector<HTMLButtonElement>('#tb-redo-btn');
        if (undoBtn) undoBtn.disabled = !u;
        if (redoBtn) redoBtn.disabled = !r;
      }),
      events.on('track:select', (trackId) => {
        const dotBtns = this.element.querySelectorAll<HTMLButtonElement>('.palette-dot-btn');
        dotBtns.forEach((b) => b.classList.toggle('active', b.dataset.trackId === trackId));
        this.updateInstrumentButton();
        this.renderContextControls();
      }),
      events.on('track:type-change', () => {
        this.updateInstrumentButton();
        this.renderContextControls();
      }),
      events.on('track:update', () => {
        this.updateInstrumentButton();
      }),
      events.on('playback-mode:change', () => {
        const tm = getTrackManager();
        const tr = tm.getTrack(state.selectedTrackId);
        if (tr?.trackType !== 'beat') {
          this.renderContextControls();
        }
      })
    );
  }

  private updatePlayState(isPlaying: boolean) {
    const playBtn = this.element.querySelector<HTMLButtonElement>('#tb-play-btn');
    if (!playBtn) return;
    playBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
    playBtn.classList.toggle('playing', isPlaying);
    playBtn.setAttribute('aria-label', isPlaying ? 'Pause loop' : 'Play loop');
  }

  private setupKeyboardShortcuts() {
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    // Avoid interfering if typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      // Arrow keys inside sliders are handled normally by the slider
      return;
    }

    // Space: toggle play/pause
    if (e.code === 'Space' && state.audioStarted) {
      e.preventDefault();
      const transport = getTransport();
      transport.toggle();
      return;
    }

    // Undo: Ctrl/Cmd + Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }

    // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
    if (
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y')
    ) {
      e.preventDefault();
      redo();
      return;
    }

    // E: Eraser tool
    if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
      this.setTool('eraser');
      return;
    }

    // B or D: Brush/Draw tool
    if ((e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'd') && !e.ctrlKey && !e.metaKey) {
      this.setTool('draw');
      return;
    }

    // Arrow keys: move focus between dock controls and scroll into view
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const activeEl = document.activeElement as HTMLElement | null;
      if (this.element.contains(activeEl)) {
        const focusable = Array.from(
          this.element.querySelectorAll<HTMLElement>(
            'button:not([disabled]):not([tabindex="-1"]), input:not([disabled])'
          )
        );

        if (focusable.length > 0) {
          e.preventDefault();
          const currentIndex = activeEl ? focusable.indexOf(activeEl) : -1;
          let nextIndex = 0;

          if (e.key === 'ArrowRight') {
            nextIndex = currentIndex >= 0 ? (currentIndex + 1) % focusable.length : 0;
          } else {
            nextIndex =
              currentIndex > 0 ? currentIndex - 1 : focusable.length - 1;
          }

          const target = focusable[nextIndex];
          target.focus();
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }
    }
  };

  public destroy() {
    if (this.clearConfirmTimer !== null) {
      window.clearTimeout(this.clearConfirmTimer);
      this.clearConfirmTimer = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.onWindowResize);
    window.removeEventListener('keydown', this.onKeyDown);
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    this.element.remove();
  }
}
