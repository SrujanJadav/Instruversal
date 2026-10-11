import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import * as Tone from 'tone';
import { CONFIG } from './config';
import { state, events } from './state';
import { DrawingCanvas } from './canvas/DrawingCanvas';
import { DEFAULT_TRACK_CONFIGS, getTrackManager } from './audio/tracks';

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

    <!-- Temporary Track Selector Dots (Step 4) -->
    <nav class="track-dot-row" id="track-dot-row" aria-label="Select track colour and instrument"></nav>

    <div class="canvas-container" id="canvas-container"></div>
  </main>
`;

const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const gateScreen = document.querySelector<HTMLElement>('#gate-screen')!;
const mainView = document.querySelector<HTMLElement>('#main-view')!;
const headerStatus = document.querySelector<HTMLElement>('#header-status')!;
const trackDotRow = document.querySelector<HTMLElement>('#track-dot-row')!;

let drawingCanvas: DrawingCanvas | null = null;

function renderTrackDots() {
  trackDotRow.innerHTML = '';
  const trackManager = getTrackManager();

  DEFAULT_TRACK_CONFIGS.forEach((trackConfig) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `track-dot-btn ${trackConfig.id === state.selectedTrackId ? 'active' : ''}`;
    btn.setAttribute('aria-label', `Select ${trackConfig.name} (${trackConfig.instrumentId})`);
    btn.dataset.trackId = trackConfig.id;

    const circle = document.createElement('span');
    circle.className = 'track-dot-circle';
    circle.style.backgroundColor = trackConfig.colorHex;

    btn.appendChild(circle);

    btn.addEventListener('click', () => {
      state.selectedTrackId = trackConfig.id;

      // Update active button state
      trackDotRow.querySelectorAll('.track-dot-btn').forEach((el) => {
        el.classList.toggle('active', (el as HTMLElement).dataset.trackId === trackConfig.id);
      });

      // Update header info
      if (headerStatus) {
        headerStatus.textContent = `${trackConfig.name.toUpperCase()} · ${trackConfig.instrumentId.toUpperCase()}`;
      }

      // Audition instrument with a short pleasant phrase
      const track = trackManager.getTrack(trackConfig.id);
      if (track) {
        track.audition();
      }

      events.emit('track:select', trackConfig.id);
    });

    trackDotRow.appendChild(btn);
  });
}

async function handleStart() {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';

  try {
    // Tone.start() must be called directly within user gesture
    await Tone.start();
    state.audioStarted = true;
    events.emit('audio:started', undefined);

    // Initialize track manager and audition default track
    const trackManager = getTrackManager();
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

      renderTrackDots();

      if (headerStatus && defaultTrack) {
        headerStatus.textContent = `${defaultTrack.name.toUpperCase()} · ${defaultTrack.instrumentId.toUpperCase()}`;
      }

      const canvasContainer = document.querySelector<HTMLElement>('#canvas-container');
      if (canvasContainer && !drawingCanvas) {
        drawingCanvas = new DrawingCanvas(canvasContainer);
      }
    }, 220);
  } catch (err) {
    console.error('Audio initialization error:', err);
    startBtn.disabled = false;
    startBtn.textContent = 'Tap to start';
  }
}

startBtn.addEventListener('click', handleStart);
