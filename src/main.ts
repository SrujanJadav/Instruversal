import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import * as Tone from 'tone';
import { CONFIG } from './config';
import { state, events } from './state';
import { DrawingCanvas } from './canvas/DrawingCanvas';
import { getTrackManager } from './audio/tracks';
import { getLoopScheduler } from './audio/schedule';
import { Toolbar } from './ui/Toolbar';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <section class="gate-screen" id="gate-screen">
    <h1 class="app-title">${CONFIG.appName}</h1>
    <p class="app-subtitle">Draw strokes to compose. Notes loop in time.</p>
    <button class="start-btn" id="start-btn" type="button" aria-label="Start audio and enter Instruversal">
      Tap to start
    </button>
  </section>

  <main class="main-view" id="main-view" aria-hidden="true" style="display: none;">
    <header class="app-header">
      <h2 class="header-title">${CONFIG.appName}</h2>
      <span class="header-status" id="header-status">AUDIO READY</span>
    </header>

    <div class="canvas-container" id="canvas-container"></div>

    <div id="toolbar-container"></div>
  </main>
`;

const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const gateScreen = document.querySelector<HTMLElement>('#gate-screen')!;
const mainView = document.querySelector<HTMLElement>('#main-view')!;
const headerStatus = document.querySelector<HTMLElement>('#header-status')!;

let drawingCanvas: DrawingCanvas | null = null;
let toolbar: Toolbar | null = null;

async function handleStart() {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';

  try {
    // Tone.start() must be called directly within user gesture
    await Tone.start();
    state.audioStarted = true;
    events.emit('audio:started', undefined);

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

      if (headerStatus && defaultTrack) {
        headerStatus.textContent = `${defaultTrack.name.toUpperCase()} · ${defaultTrack.instrumentId.toUpperCase()}`;
      }

      const canvasContainer = document.querySelector<HTMLElement>('#canvas-container');
      if (canvasContainer && !drawingCanvas) {
        drawingCanvas = new DrawingCanvas(canvasContainer);
      }

      const toolbarContainer = document.querySelector<HTMLElement>('#toolbar-container');
      if (toolbarContainer && !toolbar) {
        toolbar = new Toolbar(toolbarContainer);
      }
    }, 220);
  } catch (err) {
    console.error('Audio initialization error:', err);
    startBtn.disabled = false;
    startBtn.textContent = 'Tap to start';
  }
}

startBtn.addEventListener('click', handleStart);

events.on('track:select', (trackId) => {
  const track = getTrackManager().getTrack(trackId);
  if (track && headerStatus) {
    headerStatus.textContent = `${track.name.toUpperCase()} · ${track.instrumentId.toUpperCase()}`;
  }
});
