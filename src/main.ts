import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/theme-toggle.css';

// MUST be first before any Tone.js module instantiates nodes
import { initLowLatencyContext, logAudioLatencyInfo } from './audio/context';
initLowLatencyContext();

import * as Tone from 'tone';
import { CONFIG } from './config';
import { state, events } from './state';
import { DrawingCanvas } from './canvas/DrawingCanvas';
import { getTrackManager } from './audio/tracks';
import { getLoopScheduler } from './audio/schedule';
import { Toolbar } from './ui/Toolbar';
import { TrackPanel } from './ui/TrackPanel';
import { FxPanel } from './ui/FxPanel';
import { SyncSettingsPill } from './ui/SyncSettingsPill';
import { loadSavedProject, initProjectAutosave } from './audio/projectState';
import { initAudioLifecycle } from './audio/lifecycle';
import { showFirstRunHintOverlay } from './ui/hintOverlay';
import { initTheme } from './ui/theme';
import { ThemeToggle } from './ui/ThemeToggle';

// Initialize color theme system
initTheme();

// Restore any saved project from share link or localStorage
loadSavedProject();
initProjectAutosave();

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <section class="gate-screen" id="gate-screen">
    <div class="gate-theme-wrapper" id="gate-theme-container"></div>
    <h1 class="app-title">${CONFIG.appName}</h1>
    <p class="app-subtitle">Draw strokes to compose. Notes loop in time.</p>
    <button class="start-btn" id="start-btn" type="button" aria-label="Start audio and enter Instruversal">
      Tap to start
    </button>
  </section>

  <main class="main-view" id="main-view" aria-hidden="true" style="display: none;">
    <header class="app-header">
      <h2 class="header-title">${CONFIG.appName}</h2>
      <div class="header-actions">
        <button type="button" class="header-btn" id="header-help-btn" aria-label="How Instruversal works">
          <span class="hdr-text-long">How it works</span>
          <span class="hdr-text-short">Help</span>
        </button>
        <button type="button" class="header-btn" id="header-fx-btn" aria-label="Open effects rack">
          <span class="hdr-text-long">Effects</span>
          <span class="hdr-text-short">FX</span>
        </button>
        <button type="button" class="header-btn" id="header-mixer-btn" aria-label="Open track mixer and key panel">
          <span class="hdr-text-long">Mixer · Key</span>
          <span class="hdr-text-short">Mixer</span>
        </button>
        <span class="header-status" id="header-status">AUDIO READY</span>
      </div>
    </header>

    <div class="canvas-container" id="canvas-container"></div>

    <div id="toolbar-container"></div>
  </main>
`;

const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const gateScreen = document.querySelector<HTMLElement>('#gate-screen')!;
const mainView = document.querySelector<HTMLElement>('#main-view')!;
const headerStatus = document.querySelector<HTMLElement>('#header-status')!;
const mixerBtn = document.querySelector<HTMLButtonElement>('#header-mixer-btn')!;
const fxBtn = document.querySelector<HTMLButtonElement>('#header-fx-btn')!;

// Mount gate screen theme toggle
const gateThemeContainer = document.querySelector<HTMLElement>('#gate-theme-container');
if (gateThemeContainer) {
  const gateToggle = new ThemeToggle();
  gateThemeContainer.appendChild(gateToggle.element);
}

let drawingCanvas: DrawingCanvas | null = null;
let toolbar: Toolbar | null = null;
let trackPanel: TrackPanel | null = null;
let fxPanel: FxPanel | null = null;

import { DRUM_KITS } from './audio/drums';

function updateHeaderStatus() {
  const track = getTrackManager().getTrack(state.selectedTrackId);
  if (track && headerStatus) {
    if (track.trackType === 'beat') {
      const kit = DRUM_KITS[track.kitId];
      headerStatus.textContent = `${track.name.toUpperCase()} · ${(kit?.name || '808 KIT').toUpperCase()}`;
    } else {
      headerStatus.textContent = `${track.name.toUpperCase()} · ${track.instrumentId.toUpperCase()}`;
    }
  }
}

async function handleStart() {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';

  try {
    // Tone.start() must be called directly within user gesture
    await Tone.start();
    state.audioStarted = true;
    events.emit('audio:started', undefined);

    // Log latency values for diagnosis
    logAudioLatencyInfo();

    // Initialize track manager and loop scheduler
    const trackManager = getTrackManager();
    getLoopScheduler();

    const defaultTrack = trackManager.getTrack(state.selectedTrackId);
    if (defaultTrack) {
      defaultTrack.audition();
    }

    // Transition to main screen
    gateScreen.classList.add('hidden');
    window.setTimeout(() => {
      gateScreen.style.display = 'none';
      mainView.style.display = 'flex';
      mainView.removeAttribute('aria-hidden');

      updateHeaderStatus();

      const canvasContainer = document.querySelector<HTMLElement>('#canvas-container');
      if (canvasContainer && !drawingCanvas) {
        drawingCanvas = new DrawingCanvas(canvasContainer);
      }

      const toolbarContainer = document.querySelector<HTMLElement>('#toolbar-container');
      if (toolbarContainer && !toolbar) {
        toolbar = new Toolbar(toolbarContainer);
      }

      if (!trackPanel) {
        trackPanel = new TrackPanel(app);
      }

      if (!fxPanel) {
        fxPanel = new FxPanel(app);
      }

      // Sync settings pill & Theme toggle
      const headerActionsEl = document.querySelector<HTMLElement>('.header-actions');
      if (headerActionsEl) {
        new SyncSettingsPill(headerActionsEl);
        const headerThemeToggle = new ThemeToggle();
        headerActionsEl.insertBefore(headerThemeToggle.element, headerActionsEl.firstChild);
      }

      // Initialize audio interruptions, wake lock & lifecycle
      initAudioLifecycle();

      // "How it works" button
      document.querySelector('#header-help-btn')?.addEventListener('click', () => {
        showFirstRunHintOverlay(true);
      });

      // Show first-run hint overlay if user is visiting for the first time
      showFirstRunHintOverlay(false);
    }, 220);
  } catch (err) {
    console.error('Audio initialization error:', err);
    startBtn.disabled = false;
    startBtn.textContent = 'Tap to start';
  }
}

startBtn.addEventListener('click', handleStart);

mixerBtn.addEventListener('click', () => {
  if (trackPanel) {
    trackPanel.toggle();
  }
});

fxBtn.addEventListener('click', () => {
  if (fxPanel) {
    fxPanel.toggle();
  }
});

events.on('track:select', () => updateHeaderStatus());
events.on('track:type-change', () => updateHeaderStatus());
events.on('track:update', () => updateHeaderStatus());
events.on('ui:open-fx', () => {
  if (fxPanel) {
    fxPanel.toggle();
  }
});
