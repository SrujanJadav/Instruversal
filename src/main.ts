import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/theme-toggle.css';
import './styles/library.css';
import './styles/gallery.css';
import './styles/account.css';
import './styles/studio.css';

// MUST be first before any Tone.js module instantiates nodes
import { initLowLatencyContext } from './audio/context';
initLowLatencyContext();

import * as Tone from 'tone';
import { CONFIG } from './config';
import { isStudioEnabled, isGardenFlagEnabled } from './config/flags';
import { state, events } from './state';
import { DrawingCanvas } from './canvas/DrawingCanvas';
import { getTrackManager } from './audio/tracks';
import { getLoopScheduler } from './audio/schedule';
import { getTransport } from './audio/transport';
import { effectiveKey, formatShortKeyLabel } from './audio/scales';
import { Toolbar } from './ui/Toolbar';
import { TrackPanel } from './ui/TrackPanel';
import { FxPanel } from './ui/FxPanel';
import { SyncSettingsPill } from './ui/SyncSettingsPill';
import { initAudioLifecycle, fadeMasterOut, restoreMasterGain } from './audio/lifecycle';
import { clearThumbnailCache } from './gallery/thumbnail';
import { showFirstRunHintOverlay } from './ui/hintOverlay';
import { loadSavedProject } from './audio/projectState';
import { initTheme, getTheme } from './ui/theme';
import { ThemeToggle } from './ui/ThemeToggle';
import { getCreationManager } from './library/manager';
import { getCreationStore } from './library/store';
import { getLibraryModal } from './ui/Library';
import { getGalleryModal } from './gallery/GalleryModal';
import { getStartChoiceModal } from './ui/StartChoiceModal';
import { getExportModal } from './ui/ExportModal';
import { getHeaderMoreSheet } from './ui/HeaderMoreSheet';
import { Creation } from './library/types';
import { handleAuthRedirect, onAuthStateChange, getCurrentUser } from './auth/auth';
import { getAccountSheet } from './ui/AccountSheet';
import { getMigrationSheet } from './ui/MigrationSheet';
import { generateUuid } from './library/manager';
import { registerServiceWorker } from './pwa/registerSw';
import { initCountInOverlay } from './ui/CountInOverlay';
import { getPracticeEngine } from './audio/practice';
import {
  resolveActiveResumeTarget,
  setStoredResumeData,
  clearStoredResumeData,
  CreationSummary,
} from './library/resume';

// Initialize color theme system
initTheme();

// Handle incoming PKCE auth redirects (?code=...)
handleAuthRedirect();

// Register PWA offline service worker
registerServiceWorker();

// Check if visiting via a share link
const hasShareLink = typeof window !== 'undefined' && window.location.hash.startsWith('#project=');
if (hasShareLink) {
  loadSavedProject();
}

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <section class="gate-screen" id="gate-screen">
    <div class="gate-topbar">
      <div id="gate-account-container"></div>
      <div class="gate-theme-wrapper" id="gate-theme-container"></div>
    </div>
    <div class="gate-brand-icon">
      <img src="/icon.svg" alt="Instruversal Brand Icon" class="gate-icon-img icon-light-mode" />
      <img src="/icon-dark.svg" alt="Instruversal Brand Icon" class="gate-icon-img icon-dark-mode" />
    </div>
    <div class="hero-wordmark-container" id="hero-wordmark-container" style="position: relative; width: 100%; overflow: hidden; background: transparent;">
      ${isGardenFlagEnabled ? `
      <canvas class="hero-garden-canvas" id="hero-garden-canvas" style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: default; touch-action: none;" role="img" aria-label="Instruverse"></canvas>
      <h1 class="sr-only">Instruverse</h1>
      ` : `
      <h1 class="app-title">
        <a href="#/" class="app-title-link" id="gate-home-link" aria-label="Instruversal, go to the start page">
          <img src="/brand/logo-light-transparent.svg" class="brand-wordmark wordmark-light" alt="Instruversal" width="1536" height="742.4" decoding="async" />
          <img src="/brand/logo-dark-transparent.svg" class="brand-wordmark wordmark-dark" alt="" aria-hidden="true" width="1536" height="742.4" decoding="async" />
        </a>
      </h1>
      `}
    </div>
    <button class="start-btn" id="start-btn" type="button" aria-label="Start audio and enter Instruversal">
      Tap to Art
    </button>
    <div class="gate-load-group" id="gate-load-group" style="display: none;">
      <button class="load-btn" id="gate-load-btn" type="button" aria-label="Open saved creations gallery">
        Gallery
      </button>
      <span class="load-count-badge" id="gate-load-count">0 saved</span>
    </div>
    ${isStudioEnabled ? `
    <div class="gate-studio-container" id="gate-studio-container" style="margin-top: 6px;">
      <a href="#/studio" class="gate-resume-link" id="gate-studio-btn" aria-label="Open Song Studio">
        Open Studio
      </a>
    </div>
    ` : ''}
    <div class="gate-resume-container" id="gate-resume-container" style="display: none;">
      <button class="gate-resume-link" id="gate-resume-btn" type="button" aria-label="Resume sketch">
        Resume <span class="gate-resume-title" id="gate-resume-title"></span>
      </button>
    </div>
    <div class="try-yourself-section" id="try-yourself-section">
      <div class="try-yourself-row" id="try-yourself-row" role="region" aria-label="Try yourself examples">
        <button type="button" class="try-yourself-card" data-example-id="example-ode-to-joy" aria-label="Try yourself: Ode to Joy — Ludwig van Beethoven">
          <span class="try-yourself-tag">TRY YOURSELF</span>
          <span class="try-yourself-title">Ode to Joy</span>
          <span class="try-yourself-subtitle">Tap to play and explore</span>
          <span class="try-yourself-credit">Ludwig van Beethoven</span>
        </button>
        <button type="button" class="try-yourself-card" data-example-id="example-shape-of-me" aria-label="Try yourself: Shape of Me — Ed Sheeran (Cover)">
          <span class="try-yourself-tag">TRY YOURSELF</span>
          <span class="try-yourself-title">Shape of Me</span>
          <span class="try-yourself-subtitle">Tap to play and explore</span>
          <span class="try-yourself-credit">Ed Sheeran (Cover)</span>
        </button>
        <button type="button" class="try-yourself-card" data-example-id="example-dreamy-arpeggio" aria-label="Try yourself: Dreamy Arpeggio — Original">
          <span class="try-yourself-tag">TRY YOURSELF</span>
          <span class="try-yourself-title">Dreamy Arpeggio</span>
          <span class="try-yourself-subtitle">Tap to play and explore</span>
          <span class="try-yourself-credit">Original</span>
        </button>
      </div>
    </div>
  </section>

  <main class="main-view" id="main-view" aria-hidden="true" style="display: none;">
    <header class="app-header">
      <div class="header-left">
        <a href="#/" class="header-title" id="header-home-btn" aria-label="Instruversal, go to the start page">
          <img src="/icon.svg" alt="" class="header-brand-icon icon-light-mode" />
          <img src="/icon-dark.svg" alt="" class="header-brand-icon icon-dark-mode" />
          <span>${CONFIG.appName}</span>
        </a>
        <span class="header-divider-dot">·</span>
        <div class="creation-title-group">
          <input type="text" class="creation-title-input" id="creation-title" value="Untitled sketch" maxlength="80" aria-label="Creation title" />
          <span class="creation-save-status faded" id="creation-save-status" aria-live="polite"></span>
        </div>
      </div>
      <div class="header-actions">
        ${isStudioEnabled ? `
        <button type="button" class="header-btn" id="header-studio-btn" aria-label="Open Song Studio">
          <span class="hdr-text-long">Studio</span>
          <span class="hdr-text-short">Studio</span>
        </button>
        ` : ''}
        <button type="button" class="header-btn" id="header-library-btn" aria-label="Open creations library">
          <span class="hdr-text-long">Library</span>
          <span class="hdr-text-short">Lib</span>
        </button>
        <button type="button" class="header-btn" id="header-export-btn" aria-label="Export audio as WAV or compressed">
          <span class="hdr-text-long">Export</span>
          <span class="hdr-text-short">WAV</span>
        </button>
        <button type="button" class="header-btn" id="header-fx-btn" aria-label="Open effects rack">
          <span class="hdr-text-long">Effects</span>
          <span class="hdr-text-short">FX</span>
        </button>
        <button type="button" class="header-btn" id="header-mixer-btn" aria-label="Open track mixer and key panel">
          <span class="hdr-text-long">Mixer · Key</span>
          <span class="hdr-text-short">Mixer</span>
        </button>
        <button type="button" class="header-btn header-more-btn" id="header-more-btn" aria-label="More options" aria-haspopup="dialog">
          <span class="hdr-text-short">More</span>
        </button>
        <span class="header-status" id="header-status">AUDIO READY</span>
        <button type="button" class="header-help-circle-btn" id="header-help-btn" aria-label="How it works">?</button>
      </div>
    </header>

    <div class="canvas-container" id="canvas-container">
      <button type="button" class="canvas-key-chip" id="canvas-key-chip" aria-label="Selected track key">
        <span class="canvas-key-dot" id="canvas-key-dot"></span>
        <span class="canvas-key-text" id="canvas-key-text"></span>
      </button>
    </div>

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

const gateResumeContainer = document.querySelector<HTMLElement>('#gate-resume-container')!;
const gateResumeBtn = document.querySelector<HTMLButtonElement>('#gate-resume-btn')!;
const gateResumeTitle = document.querySelector<HTMLElement>('#gate-resume-title')!;
let activeResumeTarget: { id: string; title: string } | null = null;
let isFreshVisit = true;

// Initialize creation manager
const creationManager = getCreationManager();

export type ScreenName = 'home' | 'studio' | 'songStudio' | 'publicSong';
let currentActiveScreen: ScreenName = 'home';

export function getCurrentScreen(): ScreenName {
  return currentActiveScreen;
}

export function setScreen(screen: ScreenName) {
  currentActiveScreen = screen;
  if (screen === 'home') {
    // When on 'home', Studio/Canvas DOM must be completely hidden
    mainView.style.display = 'none';
    mainView.style.opacity = '0';
    mainView.style.visibility = 'hidden';
    mainView.style.pointerEvents = 'none';
    mainView.setAttribute('aria-hidden', 'true');

    // Home screen container must be visible
    gateScreen.classList.remove('hidden');
    gateScreen.removeAttribute('aria-hidden');
    gateScreen.style.transform = 'translateY(0)';
    gateScreen.style.display = 'flex';
    gateScreen.style.opacity = '1';
    gateScreen.style.visibility = 'visible';
    gateScreen.style.pointerEvents = 'auto';

    startBtn.disabled = false;
    startBtn.textContent = 'Tap to Art';
  } else if (screen === 'studio') {
    // When on 'studio', Home screen container must be completely hidden
    gateScreen.classList.add('hidden');
    gateScreen.setAttribute('aria-hidden', 'true');
    gateScreen.style.display = 'none';
    gateScreen.style.opacity = '0';
    gateScreen.style.visibility = 'hidden';
    gateScreen.style.pointerEvents = 'none';

    // Studio/Canvas DOM must be visible
    mainView.style.display = 'flex';
    mainView.style.opacity = '1';
    mainView.style.visibility = 'visible';
    mainView.style.pointerEvents = 'auto';
    mainView.removeAttribute('aria-hidden');
  } else {
    // Other routes (songStudio, publicSong) hide both
    gateScreen.classList.add('hidden');
    gateScreen.setAttribute('aria-hidden', 'true');
    gateScreen.style.display = 'none';
    gateScreen.style.opacity = '0';
    gateScreen.style.visibility = 'hidden';
    gateScreen.style.pointerEvents = 'none';

    mainView.style.display = 'none';
    mainView.style.opacity = '0';
    mainView.style.visibility = 'hidden';
    mainView.style.pointerEvents = 'none';
    mainView.setAttribute('aria-hidden', 'true');
  }
}

let drawingCanvas: DrawingCanvas | null = null;

function syncWordmarkA11y(theme?: string) {
  const current = theme || getTheme();
  const lightImg = document.querySelector<HTMLImageElement>('.wordmark-light');
  const darkImg = document.querySelector<HTMLImageElement>('.wordmark-dark');
  if (!lightImg || !darkImg) return;
  const isDark = current === 'dark';
  if (isDark) {
    darkImg.setAttribute('alt', 'Instruversal');
    darkImg.removeAttribute('aria-hidden');
    lightImg.setAttribute('alt', '');
    lightImg.setAttribute('aria-hidden', 'true');
  } else {
    lightImg.setAttribute('alt', 'Instruversal');
    lightImg.removeAttribute('aria-hidden');
    darkImg.setAttribute('alt', '');
    darkImg.setAttribute('aria-hidden', 'true');
  }
}

window.addEventListener('themechange', (e: Event) => {
  const custom = e as CustomEvent<{ theme?: string }>;
  syncWordmarkA11y(custom.detail?.theme);
});

syncWordmarkA11y();

let gardenModulePromise: Promise<typeof import('./garden/garden-background')> | null = null;

function loadAndMountGarden() {
  if (!isGardenFlagEnabled) return;
  if (typeof window === 'undefined') return;
  if (currentActiveScreen !== 'home') return;

  const load = () => {
    if (!gardenModulePromise) {
      if (import.meta.env.VITE_ENABLE_GARDEN !== 'false') {
        gardenModulePromise = import('./garden/garden-background');
      }
    }
    gardenModulePromise?.then(({ getGardenBackground }) => {
      if (currentActiveScreen === 'home') {
        const garden = getGardenBackground();
        garden.mount();
      }
    });
  };

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(load, { timeout: 1000 });
  } else {
    setTimeout(load, 50);
  }
}

function teardownGarden() {
  if (!isGardenFlagEnabled) return;
  if (gardenModulePromise) {
    gardenModulePromise.then(({ teardownGardenBackground }) => {
      teardownGardenBackground();
    });
  }
}

loadAndMountGarden();
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

    const { getSongStore } = await import('./song/store');
    const songStore = getSongStore();
    const songList = await songStore.list();

    const summaries: (CreationSummary & { isSong?: boolean })[] = [
      ...list.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        strokesCount: c.strokeCount,
      })),
      ...songList.map((s) => ({
        id: s.id,
        title: s.title,
        updatedAt: s.updatedAt,
        strokesCount: s.placementsCount,
        isSong: true,
      })),
    ];

    activeResumeTarget = resolveActiveResumeTarget(summaries as any, isFreshVisit);
    if (activeResumeTarget) {
      gateResumeContainer.style.display = 'flex';
      gateResumeTitle.textContent = activeResumeTarget.title;
    } else {
      gateResumeContainer.style.display = 'none';
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
  getStartChoiceModal().close();
  getHeaderMoreSheet(() => {}).close();
  document.querySelector('.first-run-hint-overlay')?.remove();
}

export async function goHome() {
  if (isLeaving) return;
  isLeaving = true;

  isFreshVisit = false;

  // If there are strokes, store resume data; otherwise clear
  if (state.strokes.length > 0) {
    setStoredResumeData(
      creationManager.getCurrentId(),
      creationManager.getCurrentTitle(),
      true
    );
  } else {
    clearStoredResumeData();
  }

  // 1. Close all open sheets/panels first
  closeAllOpenSheets();

  // 2. If in studio, flush autosave and wait up to 1 second
  if (currentActiveScreen === 'studio') {
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
  document.querySelectorAll('.studio-view').forEach((el) => el.remove());
  document.querySelectorAll('.public-song-view').forEach((el) => el.remove());
  document.querySelectorAll('.studio-coming-soon-screen').forEach((el) => el.remove());

  setScreen('home');
  updateGateLoadButton();
  loadAndMountGarden();
}

async function completeGoHome() {
  // 1. Pause audio transport cleanly and fade master gain over 150ms
  try {
    const transport = getTransport();
    transport.pause();
  } catch {}
  await fadeMasterOut(0.15);

  // 2. Pause canvas render loop to save battery
  drawingCanvas?.pause();

  // 3. Clear thumbnail cache
  clearThumbnailCache();

  // 4. Update screen state to 'home' (mutually exclusive)
  setScreen('home');

  // 5. Re-initialize Home components and TypeGarden
  await updateGateLoadButton();
  loadAndMountGarden();

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

gateResumeBtn.addEventListener('click', async () => {
  if (!activeResumeTarget) return;
  const targetId = activeResumeTarget.id;
  const isSong = (activeResumeTarget as any).isSong;

  // Unlock audio within the user tap gesture
  if (Tone.context.state !== 'running') {
    try {
      await Tone.start();
      state.audioStarted = true;
      events.emit('audio:started', undefined);
    } catch {}
  }

  if (isSong) {
    window.location.hash = `#/studio/${targetId}`;
    return;
  }

  try {
    gateResumeBtn.disabled = true;
    await openStudio({ creationId: targetId, autoplay: true });
  } catch (err) {
    console.error('Failed to resume creation:', err);
  } finally {
    gateResumeBtn.disabled = false;
  }
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

// Studio buttons
document.querySelector('#header-studio-btn')?.addEventListener('click', () => {
  window.location.hash = '#/studio';
});
document.querySelector('#gate-studio-btn')?.addEventListener('click', (e) => {
  e.preventDefault();
  if (window.location.hash === '#/studio') {
    handleStudioRoute('#/studio');
  } else {
    window.location.hash = '#/studio';
  }
});

// Mount gate screen theme toggle
const gateThemeContainer = document.querySelector<HTMLElement>('#gate-theme-container');
if (gateThemeContainer) {
  const gateToggle = new ThemeToggle();
  gateThemeContainer.appendChild(gateToggle.element);
}

// Mount gate screen account button
const gateAccountContainer = document.querySelector<HTMLElement>('#gate-account-container');
function updateGateAccountButton() {
  if (!gateAccountContainer) return;
  const user = getCurrentUser();
  if (user) {
    const initial = (user.email || 'U')[0].toUpperCase();
    const shortEmail = (user.email || '').split('@')[0];
    gateAccountContainer.innerHTML = `
      <button type="button" class="auth-pill-btn" id="gate-auth-btn">
        <span class="auth-avatar-circle"></span>
        <span class="auth-email-label"></span>
      </button>
    `;
    const btn = gateAccountContainer.querySelector<HTMLButtonElement>('#gate-auth-btn')!;
    btn.setAttribute('aria-label', `Account: ${user.email}`);
    btn.querySelector('.auth-avatar-circle')!.textContent = initial;
    btn.querySelector('.auth-email-label')!.textContent = shortEmail;
  } else {
    gateAccountContainer.innerHTML = `
      <button type="button" class="auth-pill-btn" id="gate-auth-btn" aria-label="Sign in to your account">
        Sign in
      </button>
    `;
  }
  gateAccountContainer.querySelector('#gate-auth-btn')?.addEventListener('click', () => {
    getAccountSheet().open();
  });
}
onAuthStateChange(() => updateGateAccountButton());

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

export interface OpenStudioOptions {
  creationId?: string;
  creation?: Creation;
  projectData?: any;
  autoplay?: boolean;
  startAudio?: boolean;
}

export async function openStudio(opts: OpenStudioOptions = {}) {
  // 1. Coordinate audio unlocking within user gesture
  if (Tone.context.state !== 'running') {
    try {
      await Tone.start();
      state.audioStarted = true;
      events.emit('audio:started', undefined);
    } catch (err) {
      console.warn('AudioContext start error:', err);
    }
  }

  restoreMasterGain();
  getLoopScheduler();

  // 2. Cleanly teardown home background animations & listeners and dismiss any open modals
  teardownGarden();
  getGalleryModal().close(false, false);
  getLibraryModal().close(false);
  closeAllOpenSheets();

  // 3. Hydrate project data if provided (paused initially)
  if (opts.creationId) {
    await creationManager.openCreation(opts.creationId, false);
  } else if (opts.creation) {
    await creationManager.openCreation(opts.creation, false);
  }

  // 4. Transition view immediately to 'studio' (mutually exclusive)
  setScreen('studio');
  if (window.location.hash !== '#/app') {
    window.location.hash = '#/app';
  }

  updateHeaderStatus();

  // 5. Mount or resize DrawingCanvas
  const canvasContainer = document.querySelector<HTMLElement>('#canvas-container');
  if (canvasContainer && !drawingCanvas) {
    drawingCanvas = new DrawingCanvas(canvasContainer);
  } else if (drawingCanvas) {
    drawingCanvas.resume();
    drawingCanvas.handleResize();
  }
  // Dispatch resize event so canvas calculates dimensions immediately upon becoming visible
  window.dispatchEvent(new Event('resize'));

  // Initialize studio UI controls if not yet mounted
  initCountInOverlay();
  getPracticeEngine();

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

  updateCanvasKeyChip();
  checkStudioReturnButton();

  // 6. Coordinate audio playback:
  // Start audio playback ONLY AFTER view has changed to 'studio' and canvas has mounted
  const transport = getTransport();
  if (opts.autoplay) {
    await transport.play();
  } else if (!opts.creationId && !opts.creation && opts.startAudio !== false) {
    // Blank canvas from "Tap to start": audition default selected track
    const defaultTrack = getTrackManager().getTrack(state.selectedTrackId);
    if (defaultTrack) {
      defaultTrack.audition();
    }
  }
}

export async function enterMainView(startAudio: boolean = true) {
  await openStudio({ startAudio, autoplay: false });
}

async function handleStart() {
  try {
    const store = getCreationStore();
    const list = await store.list();

    if (list.length === 0) {
      // 0 saved creations: immediately open a fresh, blank canvas in Studio
      startBtn.disabled = true;
      startBtn.textContent = 'Starting…';

      try {
        await creationManager.createNewCreation();
        await openStudio({ autoplay: false, startAudio: true });
        showFirstRunHintOverlay(false);
      } catch (err) {
        console.error('Audio initialization error:', err);
      } finally {
        startBtn.disabled = false;
        startBtn.textContent = 'Tap to Art';
      }
    } else {
      // 1 or more saved creations: open Start Choice Modal
      getStartChoiceModal().open(
        {
          creationsCount: list.length,
          recentTitle: list[0]?.title || '',
          onNewCanvas: async () => {
            startBtn.disabled = true;
            startBtn.textContent = 'Starting…';
            try {
              await creationManager.createNewCreation();
              await openStudio({ autoplay: false, startAudio: true });
              showFirstRunHintOverlay(false);
            } catch (err) {
              console.error('Error starting new canvas:', err);
            } finally {
              startBtn.disabled = false;
              startBtn.textContent = 'Tap to Art';
            }
          },
          onOpenGallery: async () => {
            if (Tone.context.state !== 'running') {
              try {
                await Tone.start();
                state.audioStarted = true;
                events.emit('audio:started', undefined);
              } catch {}
            }
            getGalleryModal().open();
          },
        },
        startBtn
      );
    }
  } catch (err) {
    console.error('Start error:', err);
    startBtn.disabled = false;
    startBtn.textContent = 'Tap to Art';
  }
}

startBtn.addEventListener('click', handleStart);

const tryCards = document.querySelectorAll<HTMLButtonElement>('.try-yourself-card');
tryCards.forEach((card) => {
  card.addEventListener('click', async () => {
    const exampleId = card.dataset.exampleId;
    if (!exampleId || card.disabled) return;
    tryCards.forEach((c) => (c.disabled = true));
    try {
      clearStoredResumeData();
      if (Tone.context.state !== 'running') {
        try {
          await Tone.start();
          state.audioStarted = true;
          events.emit('audio:started', undefined);
        } catch {}
      }

      const { loadExampleProject } = await import('./examples');
      const { project, song } = await loadExampleProject(exampleId);

      const newId = `creation-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const creation: Creation = {
        id: newId,
        title: song.title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: 2,
        project,
      };

      await openStudio({ creation, autoplay: true });
    } catch (err) {
      console.error('Failed to load example:', err);
    } finally {
      tryCards.forEach((c) => (c.disabled = false));
    }
  });
});

events.on('app:start', (opts) => openStudio({ startAudio: opts?.startAudio, autoplay: false }));
events.on('studio:open', (opts) => openStudio(opts));
events.on('ui:close-all-sheets', () => closeAllOpenSheets());

// Periodic check for resume link 30-minute expiry on gate screen
window.setInterval(() => {
  if (currentActiveScreen === 'home' && activeResumeTarget) {
    updateGateLoadButton();
  }
}, 30000);

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

const exportBtn = document.querySelector<HTMLButtonElement>('#header-export-btn');
exportBtn?.addEventListener('click', () => {
  getExportModal().open(titleInput?.value);
});

const headerMoreBtn = document.querySelector<HTMLButtonElement>('#header-more-btn');
headerMoreBtn?.addEventListener('click', () => {
  getHeaderMoreSheet(() => {
    getExportModal().open(titleInput?.value);
  }).open(headerMoreBtn);
});

function updateCanvasKeyChip() {
  const chip = document.querySelector<HTMLButtonElement>('#canvas-key-chip');
  const dot = document.querySelector<HTMLElement>('#canvas-key-dot');
  const text = document.querySelector<HTMLElement>('#canvas-key-text');
  if (!chip || !dot || !text) return;

  const tm = getTrackManager();
  const selTrack = tm.getTrack(state.selectedTrackId);
  if (!selTrack) return;

  dot.style.backgroundColor = `var(${selTrack.colorVar})`;
  if (selTrack.trackType === 'beat') {
    text.textContent = 'Drums';
    chip.setAttribute('aria-label', `Track ${selTrack.name}: Drums (no key)`);
  } else {
    const key = effectiveKey(selTrack, state);
    const label = formatShortKeyLabel(key);
    text.textContent = label;
    chip.setAttribute('aria-label', `Track ${selTrack.name} key: ${label}. Tap to change.`);
  }
}

const canvasKeyChip = document.querySelector<HTMLButtonElement>('#canvas-key-chip');
canvasKeyChip?.addEventListener('click', () => {
  if (trackPanel) {
    trackPanel.open('key');
  }
});

events.on('track:select', () => {
  updateHeaderStatus();
  updateCanvasKeyChip();
});
events.on('track:type-change', () => {
  updateHeaderStatus();
  updateCanvasKeyChip();
});
events.on('track:update', () => {
  updateHeaderStatus();
  updateCanvasKeyChip();
});
events.on('scale:change', () => updateCanvasKeyChip());
events.on('key-mode:change', () => updateCanvasKeyChip());
events.on('track:key-change', () => updateCanvasKeyChip());
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

// Public shared sketch viewer (#/c/<slug>)
async function handlePublicSharedRoute(slug: string) {
  const store = getCreationStore();
  if (!store.getPublicCreation) {
    window.location.hash = '#/';
    return;
  }

  const creation = await store.getPublicCreation(slug);
  if (!creation) {
    alert('This sketch was not found or the share link has been disabled.');
    window.location.hash = '#/';
    return;
  }

  closeAllOpenSheets();
  await openStudio({ creation, autoplay: false });

  let banner = document.querySelector<HTMLElement>('#public-shared-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'public-shared-banner';
    banner.className = 'public-shared-banner';
    const mainView = document.querySelector<HTMLElement>('#main-view');
    mainView?.insertBefore(banner, mainView.firstChild);
  }

  banner.innerHTML = `
    <div class="public-shared-meta">
      <span class="public-shared-badge">Shared Sketch</span>
      <span class="public-shared-title">${creation.title}</span>
    </div>
    <div class="public-shared-actions">
      <button type="button" class="public-action-btn primary" id="public-remix-btn">Remix</button>
      <a class="public-action-btn report" href="mailto:abuse@instruversal.app?subject=Report%20creation%20${encodeURIComponent(slug)}" target="_blank" rel="noopener">Report</a>
    </div>
  `;

  banner.querySelector('#public-remix-btn')?.addEventListener('click', async () => {
    const clonedId = generateUuid();
    const clonedCreation = {
      ...creation,
      id: clonedId,
      title: `${creation.title} (remix)`.slice(0, 80),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic: false,
      publicSlug: null,
    };
    await store.save(clonedCreation);
    banner?.remove();
    window.location.hash = '#/app';
    await creationManager.openCreation(clonedId, false);
  });
}

function checkStudioReturnButton() {
  const returnSongId = sessionStorage.getItem('instruversal:studio_return_song_id');
  const existingBtn = document.querySelector('#studio-return-floating-btn');
  if (returnSongId) {
    if (!existingBtn) {
      const btn = document.createElement('button');
      btn.id = 'studio-return-floating-btn';
      btn.className = 'studio-btn studio-btn-primary';
      btn.style.cssText =
        'position: fixed; bottom: 84px; right: 20px; z-index: 60; box-shadow: 0 4px 12px rgba(28,26,22,0.25); border: 1.5px solid var(--paper);';
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg><span>Back to song</span>`;
      btn.addEventListener('click', async () => {
        const assetId = sessionStorage.getItem('instruversal:studio_return_asset_id');
        sessionStorage.removeItem('instruversal:studio_return_song_id');
        sessionStorage.removeItem('instruversal:studio_return_asset_id');
        btn.remove();

        const { getSongStore } = await import('./song/store');
        const songStore = getSongStore();
        const song = await songStore.get(returnSongId);
        if (song && assetId && song.assets[assetId]) {
          const currentProj = creationManager.getCurrentCreation().project;
          song.assets[assetId].project = JSON.parse(JSON.stringify(currentProj));
          song.assets[assetId].sourceUpdatedAt = Date.now();
          await songStore.save(song);
        }
        window.location.hash = `#/studio/${returnSongId}`;
      });
      document.body.appendChild(btn);
    }
  } else if (existingBtn) {
    existingBtn.remove();
  }
}

let currentStudioView: any = null;

async function cleanupStudioView() {
  document.querySelectorAll('.studio-coming-soon-screen').forEach((el) => el.remove());
  if (currentStudioView) {
    try {
      await currentStudioView.flushSave();
    } catch {}
    try {
      await fadeMasterOut(0.15);
    } catch {}
    try {
      currentStudioView.dispose();
    } catch (err) {
      console.warn('Error disposing studio view:', err);
    }
    try {
      currentStudioView.element.remove();
    } catch {}
    currentStudioView = null;
  }
  document.querySelectorAll('.studio-view').forEach((el) => el.remove());
}

async function handleStudioRoute(hash: string) {
  try {
    teardownGarden();
    closeAllOpenSheets();
    await cleanupStudioView();

    setScreen('songStudio');

    if (!isStudioEnabled) {
      document.querySelectorAll('.studio-coming-soon-screen').forEach((el) => el.remove());
      const placeholder = document.createElement('div');
      placeholder.className = 'studio-coming-soon-screen';
      placeholder.style.cssText = `
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-4, 16px);
        background-color: var(--paper, #F3ECDD);
        color: var(--ink, #1C1A16);
        text-align: center;
        z-index: 10;
      `;
      placeholder.innerHTML = `
        <div style="max-width: 440px; display: flex; flex-direction: column; align-items: center; gap: var(--space-3, 12px);">
          <img src="/icon.svg" alt="Instruversal Brand Icon" class="icon-light-mode" style="width: 56px; height: 56px; margin-bottom: 8px;" />
          <img src="/icon-dark.svg" alt="Instruversal Brand Icon" class="icon-dark-mode" style="width: 56px; height: 56px; margin-bottom: 8px;" />
          <h1 style="font-family: var(--font-display, serif); font-size: 1.8rem; margin: 0; font-weight: 600;">Song Studio is coming soon.</h1>
          <p style="font-family: var(--font-ui, sans-serif); color: var(--ink-soft, #5B554A); font-size: 0.95rem; line-height: 1.5; margin: 0 0 16px 0;">
            Multi-track timeline arrangement, clip editing, and song composition are currently in development.
          </p>
          <a href="#/" class="start-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 10px 24px;">
            Back to home
          </a>
        </div>
      `;
      app.appendChild(placeholder);
      return;
    }

    if (Tone.context.state !== 'running') {
      try {
        await Tone.start();
        state.audioStarted = true;
        events.emit('audio:started', undefined);
      } catch {}
    }

    restoreMasterGain();

    const { getSongStore } = await import('./song/store');
    const { createSongFromCreation } = await import('./song/helpers');
    const songStore = getSongStore();

    const parts = hash.split('/');
    const songId = parts[2];

    let targetSong = null;
    if (songId && songId !== 'new') {
      targetSong = await songStore.get(songId);
    }

    if (!targetSong) {
      const list = await songStore.list();
      if (list.length > 0 && (!songId || songId !== 'new')) {
        targetSong = await songStore.get(list[0].id);
      } else {
        const currentCreation = creationManager.getCurrentCreation();
        targetSong = createSongFromCreation(currentCreation);
        await songStore.save(targetSong);
      }
    }

    if (import.meta.env.VITE_ENABLE_STUDIO === 'true' && targetSong) {
      const { StudioView } = await import('./ui/studio/StudioView');
      currentStudioView = new StudioView(targetSong);
      app.appendChild(currentStudioView.element);
    }
  } catch (err) {
    console.error('Failed to open Studio view:', err);
  }
}

let currentPublicSongView: any = null;

function cleanupPublicSongView() {
  if (currentPublicSongView) {
    currentPublicSongView.dispose();
    currentPublicSongView = null;
  }
}

async function handlePublicSongRoute(slug: string) {
  try {
    teardownGarden();
    closeAllOpenSheets();
    await cleanupStudioView();
    cleanupPublicSongView();

    setScreen('publicSong');
    const { PublicSongView } = await import('./ui/PublicSongView');
    currentPublicSongView = new PublicSongView(slug);
    app.appendChild(currentPublicSongView.element);
  } catch (err) {
    console.error('Failed to open public song view:', err);
  }
}

// Global hash router
async function handleHashChange() {
  const hash = window.location.hash;

  if (!hash.startsWith('#/c/')) {
    document.querySelector('#public-shared-banner')?.remove();
  }
  if (!hash.startsWith('#/s/')) {
    cleanupPublicSongView();
  }

  if (hash.startsWith('#/studio')) {
    await handleStudioRoute(hash);
  } else if (hash.startsWith('#/s/')) {
    const slug = hash.slice(4).split('?')[0].trim();
    await handlePublicSongRoute(slug);
  } else {
    await cleanupStudioView();
    cleanupPublicSongView();

    if (hash === '#/' || hash === '' || hash === '#') {
      if (currentActiveScreen === 'studio') {
        await goHome();
      } else {
        await fadeMasterOut(0.15);
        closeAllOpenSheets();
        showGateScreen();
      }
    } else if (hash === '#/app') {
      if (currentActiveScreen !== 'studio') {
        closeAllOpenSheets();
        await openStudio({ autoplay: false });
      }
    } else if (hash === '#/load') {
      getGalleryModal().open();
    } else if (hash === '#/library') {
      getLibraryModal().open();
    } else if (hash.startsWith('#/c/')) {
      const slug = hash.slice(4).split('?')[0].trim();
      await handlePublicSharedRoute(slug);
    }
  }
}

window.addEventListener('hashchange', handleHashChange);

// One-time lifecycle and help listeners
initAudioLifecycle();
document.querySelector('#header-help-btn')?.addEventListener('click', () => {
  showFirstRunHintOverlay(true);
});

// Prompt migration on first login
onAuthStateChange((user) => {
  if (user) {
    getMigrationSheet().checkAndPrompt();
  }
});

// Initial boot route check
async function handleInitialRoute() {
  // Support pathname routing (e.g. /studio or /studio/song-123)
  if (window.location.pathname.startsWith('/studio')) {
    const songId = window.location.pathname.slice('/studio'.length).replace(/^\//, '');
    const targetHash = songId ? `#/studio/${songId}` : '#/studio';
    window.location.hash = targetHash;
    window.history.replaceState(null, '', '/' + targetHash);
  }

  await creationManager.init();
  await updateGateLoadButton();

  const hash = window.location.hash;
  if (hash.startsWith('#/studio')) {
    await handleStudioRoute(hash);
  } else if (hash.startsWith('#/c/')) {
    const slug = hash.slice(4).split('?')[0].trim();
    await handlePublicSharedRoute(slug);
  } else if (hash === '#/app') {
    const store = getCreationStore();
    const list = await store.list();
    if (list.length > 0) {
      await openStudio({ creationId: list[0].id, autoplay: false });
    } else {
      window.location.hash = '#/';
      showGateScreen();
    }
  } else if (hash === '#/load') {
    showGateScreen();
    getGalleryModal().open();
  } else if (hash === '#/library') {
    await openStudio({ autoplay: false });
    getLibraryModal().open();
  } else {
    showGateScreen();
    if (window.location.hash !== '#/' && window.location.hash !== '') {
      window.location.hash = '#/';
    }
  }
}

handleInitialRoute();
