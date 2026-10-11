import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/theme-toggle.css';
import './styles/library.css';
import './styles/gallery.css';

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
import { initAudioLifecycle, fadeMasterOut, restoreMasterGain } from './audio/lifecycle';
import { clearThumbnailCache } from './gallery/thumbnail';
import { showFirstRunHintOverlay } from './ui/hintOverlay';
import { loadSavedProject } from './audio/projectState';
import { initTheme } from './ui/theme';
import { ThemeToggle } from './ui/ThemeToggle';
import { getCreationManager } from './library/manager';
import { getCreationStore } from './library/store';
import { getLibraryModal } from './ui/Library';
import { getGalleryModal } from './gallery/GalleryModal';

// Initialize color theme system
initTheme();

// Check if visiting via a share link
const hasShareLink = typeof window !== 'undefined' && window.location.hash.startsWith('#project=');
if (hasShareLink) {
  loadSavedProject();
}

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <section class="gate-screen" id="gate-screen">
    <div class="gate-theme-wrapper" id="gate-theme-container"></div>
    <h1 class="app-title">${CONFIG.appName}</h1>
    <p class="app-subtitle">Draw strokes to compose. Notes loop in time.</p>
    <button class="start-btn" id="start-btn" type="button" aria-label="Start audio and enter Instruversal">
      Tap to start
    </button>
    <div class="gate-load-group" id="gate-load-group" style="display: none;">
      <button class="load-btn" id="gate-load-btn" type="button" aria-label="Open saved creations 3D gallery">
        Load
      </button>
      <span class="load-count-badge" id="gate-load-count">0 saved</span>
    </div>
  </section>

  <main class="main-view" id="main-view" aria-hidden="true" style="display: none;">
    <header class="app-header">
      <div class="header-left">
        <a href="#/" class="header-title" id="header-home-btn" aria-label="Instruversal, go to the start page">${CONFIG.appName}</a>
        <span class="header-divider-dot">·</span>
        <div class="creation-title-group">
          <input type="text" class="creation-title-input" id="creation-title" value="Untitled sketch" maxlength="80" aria-label="Creation title" />
          <span class="creation-save-status faded" id="creation-save-status" aria-live="polite"></span>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" class="header-btn" id="header-library-btn" aria-label="Open creations library">
          <span class="hdr-text-long">Library</span>
          <span class="hdr-text-short">Lib</span>
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
        <button type="button" class="header-help-circle-btn" id="header-help-btn" aria-label="How it works">?</button>
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
const libraryBtn = document.querySelector<HTMLButtonElement>('#header-library-btn')!;
const titleInput = document.querySelector<HTMLInputElement>('#creation-title')!;
const saveStatusEl = document.querySelector<HTMLElement>('#creation-save-status')!;

const gateLoadGroup = document.querySelector<HTMLElement>('#gate-load-group')!;
const gateLoadBtn = document.querySelector<HTMLButtonElement>('#gate-load-btn')!;
const gateLoadCount = document.querySelector<HTMLElement>('#gate-load-count')!;

// Initialize creation manager
const creationManager = getCreationManager();

let currentActiveScreen: 'gate' | 'editor' = 'gate';
let drawingCanvas: DrawingCanvas | null = null;
let toolbar: Toolbar | null = null;
let trackPanel: TrackPanel | null = null;
let fxPanel: FxPanel | null = null;
let syncPill: SyncSettingsPill | null = null;
let saveFailureBanner: HTMLElement | null = null;
let isLeaving = false;

async function updateGateLoadButton() {
  try {
    const store = getCreationStore();
    const list = await store.list();
    if (list.length > 0) {
      gateLoadGroup.style.display = 'flex';
      gateLoadCount.textContent = `${list.length} saved`;
    } else {
      gateLoadGroup.style.display = 'none';
    }
  } catch {}
}

function hideSaveFailureBanner() {
  if (saveFailureBanner) {
    saveFailureBanner.remove();
    saveFailureBanner = null;
  }
}

function showSaveFailureBanner(onRetry: () => void, onLeaveAnyway: () => void) {
  hideSaveFailureBanner();
  saveFailureBanner = document.createElement('div');
  saveFailureBanner.className = 'save-failure-banner';
  saveFailureBanner.id = 'save-failure-banner';
  saveFailureBanner.setAttribute('role', 'alert');
  saveFailureBanner.innerHTML = `
    <span class="save-failure-text">Couldn't save. Stay here?</span>
    <div class="save-failure-actions">
      <button type="button" class="save-failure-btn save-failure-retry" id="save-failure-retry-btn">Retry</button>
      <button type="button" class="save-failure-btn save-failure-leave" id="save-failure-leave-btn">Leave anyway</button>
    </div>
  `;
  mainView.insertBefore(saveFailureBanner, mainView.firstChild);

  saveFailureBanner.querySelector('#save-failure-retry-btn')?.addEventListener('click', onRetry);
  saveFailureBanner.querySelector('#save-failure-leave-btn')?.addEventListener('click', onLeaveAnyway);
}

async function attemptSaveBeforeLeaving(): Promise<boolean> {
  const savePromise = creationManager.flushSave();
  const timeoutPromise = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), 1000)
  );
  return await Promise.race([savePromise, timeoutPromise]);
}

function closeAllOpenSheets() {
  trackPanel?.close();
  fxPanel?.close();
  syncPill?.close();
  getLibraryModal().close(false);
  getGalleryModal().close(false);
  document.querySelector('.first-run-hint-overlay')?.remove();
}

export async function goHome() {
  if (isLeaving) return;
  isLeaving = true;

  // 1. Close all open sheets/panels first
  closeAllOpenSheets();

  // 2. If in editor, flush autosave and wait up to 1 second
  if (currentActiveScreen === 'editor') {
    const saveSuccess = await attemptSaveBeforeLeaving();
    if (!saveSuccess) {
      isLeaving = false;
      showSaveFailureBanner(
        async () => {
          hideSaveFailureBanner();
          const retrySuccess = await attemptSaveBeforeLeaving();
          if (retrySuccess) {
            completeGoHome();
          } else {
            showSaveFailureBanner(
              () => goHome(),
              () => {
                hideSaveFailureBanner();
                completeGoHome();
              }
            );
          }
        },
        () => {
          hideSaveFailureBanner();
          completeGoHome();
        }
      );
      return;
    }
  }

  await completeGoHome();
  isLeaving = false;
}

function showGateScreen() {
  gateScreen.classList.remove('hidden');
  gateScreen.removeAttribute('aria-hidden');
  gateScreen.style.transform = 'translateY(0)';
  gateScreen.style.display = 'flex';
  gateScreen.style.opacity = '1';
  gateScreen.style.visibility = 'visible';
  gateScreen.style.pointerEvents = 'auto';

  startBtn.disabled = false;
  startBtn.textContent = 'Tap to start';

  mainView.style.display = 'none';
  mainView.style.opacity = '0';
  mainView.setAttribute('aria-hidden', 'true');

  currentActiveScreen = 'gate';
  updateGateLoadButton();
}

async function completeGoHome() {
  // Stop audio cleanly: fade master gain over 150ms, pause transport, release voices
  await fadeMasterOut(0.15);

  // Pause canvas render loop to save battery
  drawingCanvas?.pause();

  // Clear thumbnail cache so fresh thumbnail with latest strokes is drawn
  clearThumbnailCache();

  // Update gate load count
  await updateGateLoadButton();

  // Reset start button text and disabled state
  startBtn.disabled = false;
  startBtn.textContent = 'Tap to start';

  // Prepare gate screen: unhide and reset transforms/visibility
  gateScreen.classList.remove('hidden');
  gateScreen.removeAttribute('aria-hidden');
  gateScreen.style.transform = 'translateY(0)';
  gateScreen.style.visibility = 'visible';
  gateScreen.style.pointerEvents = 'auto';

  // Cross-fade between editor and start page (250ms, no animation if prefers-reduced-motion)
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    mainView.style.display = 'none';
    mainView.style.opacity = '0';
    mainView.setAttribute('aria-hidden', 'true');
    gateScreen.style.display = 'flex';
    gateScreen.style.opacity = '1';
  } else {
    // Both screens visible during crossfade
    gateScreen.style.display = 'flex';
    gateScreen.style.opacity = '0';
    mainView.style.transition = 'opacity 250ms ease-out';
    gateScreen.style.transition = 'opacity 250ms ease-out';
    void gateScreen.offsetWidth; // Force layout reflow
    gateScreen.style.opacity = '1';
    mainView.style.opacity = '0';
    await new Promise((resolve) => setTimeout(resolve, 250));
    mainView.style.display = 'none';
    mainView.setAttribute('aria-hidden', 'true');
  }

  currentActiveScreen = 'gate';
  if (window.location.hash !== '#/' && window.location.hash !== '') {
    window.location.hash = '#/';
  }
}

gateLoadBtn.addEventListener('click', async () => {
  // Unlock audio within the user tap gesture
  if (Tone.context.state !== 'running') {
    try {
      await Tone.start();
      state.audioStarted = true;
      events.emit('audio:started', undefined);
    } catch {}
  }
  getGalleryModal().open();
});

// Sync title with manager
let titleBeforeEdit = titleInput.value;
titleInput.addEventListener('focus', () => {
  titleBeforeEdit = titleInput.value;
});

titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    titleInput.blur();
  } else if (e.key === 'Escape') {
    titleInput.value = titleBeforeEdit;
    titleInput.blur();
  }
});

titleInput.addEventListener('blur', () => {
  const trimmed = titleInput.value.trim() || 'Untitled sketch';
  titleInput.value = trimmed;
  creationManager.setTitle(trimmed);
});

creationManager.onTitleChange((title) => {
  titleInput.value = title;
});

creationManager.onStatusChange((status) => {
  if (status === 'saving') {
    saveStatusEl.textContent = 'Saving…';
    saveStatusEl.classList.remove('faded');
  } else if (status === 'saved') {
    saveStatusEl.textContent = 'Saved';
    saveStatusEl.classList.remove('faded');
    updateGateLoadButton();
  } else {
    saveStatusEl.classList.add('faded');
  }
});

// Library button click
libraryBtn.addEventListener('click', () => {
  getLibraryModal().open();
});

// Mount gate screen theme toggle
const gateThemeContainer = document.querySelector<HTMLElement>('#gate-theme-container');
if (gateThemeContainer) {
  const gateToggle = new ThemeToggle();
  gateThemeContainer.appendChild(gateToggle.element);
}

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

export async function enterMainView(startAudio: boolean = true) {
  if (startAudio && Tone.context.state !== 'running') {
    await Tone.start();
    state.audioStarted = true;
    events.emit('audio:started', undefined);
    logAudioLatencyInfo();
  }

  restoreMasterGain();

  const trackManager = getTrackManager();
  getLoopScheduler();

  if (startAudio) {
    const defaultTrack = trackManager.getTrack(state.selectedTrackId);
    if (defaultTrack) {
      defaultTrack.audition();
    }
  }

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    gateScreen.style.display = 'none';
    gateScreen.classList.add('hidden');
    gateScreen.setAttribute('aria-hidden', 'true');
    mainView.style.display = 'flex';
    mainView.style.opacity = '1';
    mainView.removeAttribute('aria-hidden');
  } else {
    mainView.style.display = 'flex';
    mainView.style.opacity = '0';
    gateScreen.style.transition = 'opacity 250ms ease-out';
    mainView.style.transition = 'opacity 250ms ease-out';
    void mainView.offsetWidth; // Force layout reflow
    mainView.style.opacity = '1';
    gateScreen.style.opacity = '0';
    await new Promise((resolve) => setTimeout(resolve, 250));
    gateScreen.style.display = 'none';
    gateScreen.classList.add('hidden');
    gateScreen.setAttribute('aria-hidden', 'true');
    mainView.removeAttribute('aria-hidden');
  }

  updateHeaderStatus();

  const canvasContainer = document.querySelector<HTMLElement>('#canvas-container');
  if (canvasContainer && !drawingCanvas) {
    drawingCanvas = new DrawingCanvas(canvasContainer);
  } else if (drawingCanvas) {
    drawingCanvas.resume();
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

  const headerActionsEl = document.querySelector<HTMLElement>('.header-actions');
  if (headerActionsEl && !syncPill) {
    syncPill = new SyncSettingsPill(headerActionsEl);
    const headerThemeToggle = new ThemeToggle();
    headerActionsEl.insertBefore(headerThemeToggle.element, headerActionsEl.firstChild);
  }

  currentActiveScreen = 'editor';
  if (window.location.hash !== '#/app') {
    window.location.hash = '#/app';
  }
}

async function handleStart() {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';

  try {
    await enterMainView(true);
    showFirstRunHintOverlay(false);
  } catch (err) {
    console.error('Audio initialization error:', err);
  } finally {
    startBtn.disabled = false;
    startBtn.textContent = 'Tap to start';
  }
}

startBtn.addEventListener('click', handleStart);
events.on('app:start', (opts) => enterMainView(opts?.startAudio));

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

// Home link listener
const headerHomeBtn = document.querySelector<HTMLElement>('#header-home-btn');
headerHomeBtn?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (window.location.hash === '#/' || window.location.hash === '') {
    return;
  }
  await goHome();
});

// Global hash router
async function handleHashChange() {
  const hash = window.location.hash;

  if (hash === '#/' || hash === '' || hash === '#') {
    if (currentActiveScreen === 'editor') {
      await goHome();
    } else {
      closeAllOpenSheets();
      showGateScreen();
    }
  } else if (hash === '#/app') {
    if (currentActiveScreen !== 'editor') {
      closeAllOpenSheets();
      await enterMainView(false);
    }
  } else if (hash === '#/load') {
    getGalleryModal().open();
  } else if (hash === '#/library') {
    getLibraryModal().open();
  }
}

window.addEventListener('hashchange', handleHashChange);

// One-time lifecycle and help listeners
initAudioLifecycle();
document.querySelector('#header-help-btn')?.addEventListener('click', () => {
  showFirstRunHintOverlay(true);
});

// Initial boot route check
async function handleInitialRoute() {
  await creationManager.init();
  await updateGateLoadButton();

  const hash = window.location.hash;
  if (hash === '#/app') {
    const store = getCreationStore();
    const list = await store.list();
    if (list.length > 0) {
      await creationManager.openCreation(list[0].id, false);
      await enterMainView(false);
    } else {
      window.location.hash = '#/';
      showGateScreen();
    }
  } else if (hash === '#/load') {
    showGateScreen();
    getGalleryModal().open();
  } else if (hash === '#/library') {
    await enterMainView(false);
    getLibraryModal().open();
  } else {
    showGateScreen();
    if (window.location.hash !== '#/' && window.location.hash !== '') {
      window.location.hash = '#/';
    }
  }
}

handleInitialRoute();
