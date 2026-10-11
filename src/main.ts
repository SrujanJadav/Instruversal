import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import * as Tone from 'tone';
import { CONFIG } from './config';
import { state, events } from './state';

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
    <div class="canvas-placeholder-container" id="canvas-container">
      <p class="placeholder-note">Canvas will be built in Step 2</p>
    </div>
  </main>
`;

const startBtn = document.querySelector<HTMLButtonElement>('#start-btn')!;
const gateScreen = document.querySelector<HTMLElement>('#gate-screen')!;
const mainView = document.querySelector<HTMLElement>('#main-view')!;
const headerStatus = document.querySelector<HTMLElement>('#header-status')!;

async function handleStart() {
  startBtn.disabled = true;
  startBtn.textContent = 'Starting…';

  try {
    // Tone.start() must be called directly within a user gesture
    await Tone.start();
    state.audioStarted = true;
    events.emit('audio:started', undefined);

    // Play a soft test note to confirm audio output
    const testSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.8 },
    }).toDestination();

    testSynth.volume.value = -14;
    testSynth.triggerAttackRelease('C4', '8n');

    // Clean up test synth after release
    window.setTimeout(() => {
      testSynth.dispose();
    }, 1500);

    // Smoothly transition from gate to main placeholder view
    gateScreen.classList.add('hidden');
    window.setTimeout(() => {
      gateScreen.style.display = 'none';
      mainView.style.display = 'flex';
      mainView.removeAttribute('aria-hidden');
      if (headerStatus) {
        headerStatus.textContent = `AUDIO RUNNING (${Tone.context.state.toUpperCase()})`;
      }
    }, 220);
  } catch (err) {
    console.error('Audio initialization error:', err);
    startBtn.disabled = false;
    startBtn.textContent = 'Tap to start';
  }
}

startBtn.addEventListener('click', handleStart);
