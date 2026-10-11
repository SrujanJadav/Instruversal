import { state, events, undo, redo, canUndo, canRedo, clearStrokes, ToolMode } from '../state';
import { getTransport } from '../audio/transport';
import { DEFAULT_TRACK_CONFIGS, getTrackManager } from '../audio/tracks';

// 1.5px stroke custom inline SVGs
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
};

export class Toolbar {
  private element: HTMLElement;
  private unsubs: (() => void)[] = [];
  private clearConfirmTimer: number | null = null;

  constructor(container: HTMLElement) {
    this.element = document.createElement('footer');
    this.element.className = 'instruversal-toolbar';
    this.element.setAttribute('role', 'toolbar');
    this.element.setAttribute('aria-label', 'Controls and tools');

    container.appendChild(this.element);
    this.render();
    this.setupListeners();
    this.setupKeyboardShortcuts();
  }

  private render() {
    this.element.innerHTML = `
      <div class="toolbar-inner">
        <!-- Play / Pause primary button -->
        <button type="button" class="toolbar-btn toolbar-btn-play" id="tb-play-btn" aria-label="Play or pause loop">
          ${ICONS.play}
        </button>

        <div class="toolbar-divider"></div>

        <!-- BPM Stepper -->
        <div class="toolbar-stepper" aria-label="BPM control">
          <button type="button" class="stepper-btn" id="tb-bpm-dec" aria-label="Decrease BPM by 5">
            ${ICONS.minus}
          </button>
          <span class="bpm-display">
            <span class="bpm-num" id="tb-bpm-val">${state.bpm}</span>
            <span class="bpm-lbl">BPM</span>
          </span>
          <button type="button" class="stepper-btn" id="tb-bpm-inc" aria-label="Increase BPM by 5">
            ${ICONS.plus}
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <!-- Playback Mode: Flow vs Notes -->
        <div class="toolbar-mode-group">
          <div class="toolbar-mode-toggle" role="group" aria-label="Playback mode">
            <button type="button" class="mode-pill-btn ${state.playbackMode === 'flow' ? 'active' : ''}" id="tb-mode-flow" aria-label="Continuous flow mode">
              Flow
            </button>
            <button type="button" class="mode-pill-btn ${state.playbackMode === 'notes' ? 'active' : ''}" id="tb-mode-notes" aria-label="Stepped notes mode">
              Notes
            </button>
          </div>

          <div class="toolbar-glide-ctrl ${state.playbackMode === 'flow' ? '' : 'hidden'}" id="tb-glide-ctrl" title="Pitch glide">
            <span class="glide-lbl">Glide</span>
            <input type="range" class="glide-slider" id="tb-glide-slider" min="0" max="100" value="${state.glide}" aria-label="Pitch glide amount" />
            <span class="glide-val" id="tb-glide-val">${state.glide}%</span>
          </div>
        </div>

        <div class="toolbar-divider"></div>

        <!-- Tool Selection: Draw vs Eraser -->
        <div class="toolbar-tools" role="group" aria-label="Drawing tools">
          <button type="button" class="toolbar-btn tool-btn ${state.activeTool === 'draw' ? 'active' : ''}" id="tb-tool-draw" aria-label="Brush tool">
            ${ICONS.pen}
          </button>
          <button type="button" class="toolbar-btn tool-btn ${state.activeTool === 'eraser' ? 'active' : ''}" id="tb-tool-eraser" aria-label="Eraser tool">
            ${ICONS.eraser}
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <!-- Track Pigment Palette Dots -->
        <div class="toolbar-palette" role="group" aria-label="Track pigment selection">
          ${DEFAULT_TRACK_CONFIGS.map(
            (t) => `
            <button type="button" class="palette-dot-btn ${t.id === state.selectedTrackId ? 'active' : ''}" data-track-id="${t.id}" aria-label="Select ${t.name}">
              <span class="palette-dot" style="background-color: ${t.colorHex}"></span>
            </button>
          `
          ).join('')}
        </div>

        <div class="toolbar-divider"></div>

        <!-- History: Undo / Redo -->
        <div class="toolbar-history" role="group" aria-label="Undo and redo">
          <button type="button" class="toolbar-btn" id="tb-undo-btn" aria-label="Undo (Ctrl+Z)" ${canUndo() ? '' : 'disabled'}>
            ${ICONS.undo}
          </button>
          <button type="button" class="toolbar-btn" id="tb-redo-btn" aria-label="Redo (Ctrl+Shift+Z)" ${canRedo() ? '' : 'disabled'}>
            ${ICONS.redo}
          </button>
        </div>

        <div class="toolbar-divider"></div>

        <!-- Clear all with inline confirmation -->
        <div class="toolbar-clear-wrapper" id="tb-clear-wrapper">
          <button type="button" class="toolbar-btn toolbar-btn-clear" id="tb-clear-btn" aria-label="Clear drawing">
            ${ICONS.trash}
          </button>
        </div>
      </div>
    `;

    this.bindDomEvents();
  }

  private bindDomEvents() {
    // Play button
    const playBtn = this.element.querySelector<HTMLButtonElement>('#tb-play-btn')!;
    playBtn.addEventListener('click', async () => {
      const transport = getTransport();
      await transport.toggle();
    });

    // BPM controls
    const decBtn = this.element.querySelector<HTMLButtonElement>('#tb-bpm-dec')!;
    const incBtn = this.element.querySelector<HTMLButtonElement>('#tb-bpm-inc')!;
    const bpmVal = this.element.querySelector<HTMLElement>('#tb-bpm-val')!;

    decBtn.addEventListener('click', () => {
      const transport = getTransport();
      const nextBpm = transport.getBpm() - 5;
      transport.setBpm(nextBpm);
      bpmVal.textContent = String(transport.getBpm());
    });

    incBtn.addEventListener('click', () => {
      const transport = getTransport();
      const nextBpm = transport.getBpm() + 5;
      transport.setBpm(nextBpm);
      bpmVal.textContent = String(transport.getBpm());
    });

    // Playback mode (Flow vs Notes)
    const flowBtn = this.element.querySelector<HTMLButtonElement>('#tb-mode-flow')!;
    const notesBtn = this.element.querySelector<HTMLButtonElement>('#tb-mode-notes')!;
    const glideCtrl = this.element.querySelector<HTMLElement>('#tb-glide-ctrl')!;
    const glideSlider = this.element.querySelector<HTMLInputElement>('#tb-glide-slider')!;
    const glideVal = this.element.querySelector<HTMLElement>('#tb-glide-val')!;

    flowBtn.addEventListener('click', () => {
      state.playbackMode = 'flow';
      flowBtn.classList.add('active');
      notesBtn.classList.remove('active');
      glideCtrl.classList.remove('hidden');
      events.emit('playback-mode:change', 'flow');
    });

    notesBtn.addEventListener('click', () => {
      state.playbackMode = 'notes';
      notesBtn.classList.add('active');
      flowBtn.classList.remove('active');
      glideCtrl.classList.add('hidden');
      events.emit('playback-mode:change', 'notes');
    });

    glideSlider.addEventListener('input', () => {
      const val = parseInt(glideSlider.value, 10);
      state.glide = val;
      glideVal.textContent = `${val}%`;
      events.emit('glide:change', val);
    });

    // Tool toggle
    const drawBtn = this.element.querySelector<HTMLButtonElement>('#tb-tool-draw')!;
    const eraserBtn = this.element.querySelector<HTMLButtonElement>('#tb-tool-eraser')!;

    drawBtn.addEventListener('click', () => this.setTool('draw'));
    eraserBtn.addEventListener('click', () => this.setTool('eraser'));

    // Track Palette dots
    const dotBtns = this.element.querySelectorAll<HTMLButtonElement>('.palette-dot-btn');
    dotBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const trackId = btn.dataset.trackId;
        if (!trackId) return;

        state.selectedTrackId = trackId;
        dotBtns.forEach((b) => b.classList.toggle('active', b.dataset.trackId === trackId));

        const track = getTrackManager().getTrack(trackId);
        if (track) {
          track.audition();
        }
        events.emit('track:select', trackId);
      });
    });

    // Undo / Redo
    const undoBtn = this.element.querySelector<HTMLButtonElement>('#tb-undo-btn')!;
    const redoBtn = this.element.querySelector<HTMLButtonElement>('#tb-redo-btn')!;

    undoBtn.addEventListener('click', () => undo());
    redoBtn.addEventListener('click', () => redo());

    // Clear with inline confirmation
    const clearWrapper = this.element.querySelector<HTMLElement>('#tb-clear-wrapper')!;
    const clearBtn = this.element.querySelector<HTMLButtonElement>('#tb-clear-btn')!;

    clearBtn.addEventListener('click', () => {
      this.showClearConfirmation(clearWrapper);
    });
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
        <button type="button" class="confirm-btn confirm-yes" id="tb-confirm-yes">Yes</button>
        <button type="button" class="confirm-btn confirm-no" id="tb-confirm-no">No</button>
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

    // Automatically revert after 4 seconds if untouched
    this.clearConfirmTimer = window.setTimeout(() => {
      this.resetClearButton(wrapper);
    }, 4000);
  }

  private resetClearButton(wrapper: HTMLElement) {
    if (this.clearConfirmTimer !== null) {
      window.clearTimeout(this.clearConfirmTimer);
      this.clearConfirmTimer = null;
    }

    wrapper.innerHTML = `
      <button type="button" class="toolbar-btn toolbar-btn-clear" id="tb-clear-btn" aria-label="Clear drawing">
        ${ICONS.trash}
      </button>
    `;

    const clearBtn = wrapper.querySelector<HTMLButtonElement>('#tb-clear-btn')!;
    clearBtn.addEventListener('click', () => {
      this.showClearConfirmation(wrapper);
    });
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
    // Avoid interfering if focus is in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
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
  };

  public destroy() {
    if (this.clearConfirmTimer !== null) {
      window.clearTimeout(this.clearConfirmTimer);
      this.clearConfirmTimer = null;
    }
    window.removeEventListener('keydown', this.onKeyDown);
    for (const unsub of this.unsubs) {
      unsub();
    }
    this.unsubs = [];
    this.element.remove();
  }
}
