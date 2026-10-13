import * as Tone from 'tone';
import { Song } from '../song/types';
import { validateSong } from '../song/validator';
import { SongPlaybackEngine } from '../song/playbackEngine';
import { buildSongPreview, renderSongTimelineThumbnailSvg } from '../song/preview';
import { getSongStore } from '../song/store';
import { generateUuid } from '../library/manager';

export class PublicSongView {
  public element: HTMLElement;
  private slug: string;
  private song: Song | null = null;
  private playbackEngine: SongPlaybackEngine | null = null;
  private isPlaying: boolean = false;
  private volumeGain: Tone.Gain | null = null;
  private playheadLineEl: HTMLElement | null = null;
  private timeReadoutEl: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;

  constructor(slug: string) {
    this.slug = slug;
    this.element = document.createElement('div');
    this.element.className = 'public-song-view';
    this.element.id = 'public-song-view';

    this.renderLoading();
    this.loadSong();
  }

  private renderLoading() {
    this.element.innerHTML = `
      <div class="public-song-container">
        <header class="public-song-header">
          <a href="#/" class="header-title" aria-label="Instruversal, go to start page">
            <img src="/icon.svg" alt="" class="header-brand-icon icon-light-mode" />
            <img src="/icon-dark.svg" alt="" class="header-brand-icon icon-dark-mode" />
            <span>Instruversal</span>
          </a>
        </header>
        <div class="public-song-loading">
          <p class="public-song-message">Loading shared song…</p>
        </div>
      </div>
    `;
  }

  private async loadSong() {
    try {
      const songStore = getSongStore();
      const rawSong = songStore.getPublicSong
        ? await songStore.getPublicSong(this.slug)
        : null;

      if (!rawSong) {
        this.renderNotFound();
        return;
      }

      // Security check: validate song strictly before running
      const val = validateSong(rawSong);
      if (!val.isValid || !val.data) {
        this.renderNotFound();
        return;
      }

      this.song = val.data;
      this.initPlaybackEngine();
      this.renderPlayer();
    } catch (err) {
      console.error('Failed to load public song:', err);
      this.renderNotFound();
    }
  }

  private renderNotFound() {
    this.element.innerHTML = `
      <div class="public-song-container">
        <header class="public-song-header">
          <a href="#/" class="header-title" aria-label="Instruversal, go to start page">
            <img src="/icon.svg" alt="" class="header-brand-icon icon-light-mode" />
            <img src="/icon-dark.svg" alt="" class="header-brand-icon icon-dark-mode" />
            <span>Instruversal</span>
          </a>
        </header>
        <div class="public-song-card not-found">
          <h2 class="public-song-title">Song not found</h2>
          <p class="public-song-message">This song may be private, deleted, or the link may be incorrect.</p>
          <a href="#/" class="studio-btn studio-btn-primary" style="margin-top: 16px;">Go to start page</a>
        </div>
      </div>
    `;
  }

  private initPlaybackEngine() {
    if (!this.song) return;

    // Mix-safe device volume gain
    this.volumeGain = new Tone.Gain(0.9);
    this.volumeGain.toDestination();

    this.playbackEngine = new SongPlaybackEngine(this.song, {
      onPlayheadTick: (bar, beat, totalSeconds) => {
        this.updatePlayhead(bar, beat, totalSeconds);
      },
      onPlaybackStateChange: (playing) => {
        this.isPlaying = playing;
        this.updatePlayButton();
      },
    });
  }

  private updatePlayhead(bar: number, beat: number, totalSeconds: number) {
    if (!this.song || !this.playheadLineEl || !this.timeReadoutEl) return;

    const totalBars = this.song.totalBars || 16;
    const progress = Math.min(1, Math.max(0, (bar - 1 + (beat - 1) / 4) / totalBars));
    this.playheadLineEl.style.left = `${(progress * 100).toFixed(2)}%`;

    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    this.timeReadoutEl.textContent = `${bar}.${beat} · ${timeStr}`;
  }

  private updatePlayButton() {
    if (!this.playBtn) return;
    if (this.isPlaying) {
      this.playBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
        <span>Pause</span>
      `;
      this.playBtn.setAttribute('aria-label', 'Pause song');
    } else {
      this.playBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span>Play</span>
      `;
      this.playBtn.setAttribute('aria-label', 'Play song');
    }
  }

  private renderPlayer() {
    if (!this.song) return;

    const durationSec = Math.round(
      (this.song.totalBars || 16) * 4 * (60 / (this.song.bpm || 90))
    );
    const totalMins = Math.floor(durationSec / 60);
    const totalSecs = durationSec % 60;
    const totalTimeFormatted = `${totalMins}:${totalSecs < 10 ? '0' : ''}${totalSecs}`;
    const reportMailto = `mailto:abuse@instruversal.app?subject=Report%20song%20${encodeURIComponent(this.slug)}`;

    this.element.innerHTML = `
      <div class="public-song-container">
        <!-- Top bar -->
        <header class="public-song-header">
          <div class="public-header-left">
            <a href="#/" class="header-title" aria-label="Instruversal, go to start page">
              <img src="/icon.svg" alt="" class="header-brand-icon icon-light-mode" />
              <img src="/icon-dark.svg" alt="" class="header-brand-icon icon-dark-mode" />
              <span>Instruversal</span>
            </a>
            <span class="header-divider-dot">·</span>
            <span class="public-badge">Shared Song</span>
          </div>

          <div class="public-header-right">
            <button type="button" class="studio-btn studio-btn-primary" id="public-remix-btn">
              Remix to my songs
            </button>
            <a class="public-report-link" href="${reportMailto}" target="_blank" rel="noopener">Report</a>
          </div>
        </header>

        <!-- Main Card Player -->
        <main class="public-song-card">
          <div class="public-song-meta-header">
            <div>
              <h1 class="public-song-heading" id="public-song-title"></h1>
              <div class="public-song-subline">
                <span>${this.song.totalBars} bars · ${totalTimeFormatted}</span>
                <span class="header-divider-dot">·</span>
                <span>${this.song.bpm} BPM</span>
                <span class="header-divider-dot">·</span>
                <span>${this.song.lanes.length} lanes</span>
              </div>
            </div>
          </div>

          <!-- Read-only Timeline Canvas -->
          <div class="public-timeline-frame" id="public-timeline-frame">
            <div class="public-timeline-svg-wrapper">
              ${renderSongTimelineThumbnailSvg(buildSongPreview(this.song))}
            </div>
            <div class="public-timeline-playhead" id="public-playhead-line" style="left: 0%;"></div>
          </div>

          <!-- Transport and Volume Controls -->
          <div class="public-controls-row">
            <div class="public-transport-left">
              <button type="button" class="studio-btn studio-btn-primary public-big-play-btn" id="public-play-btn" aria-label="Play song">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                <span>Play</span>
              </button>
              <button type="button" class="studio-btn studio-btn-icon" id="public-stop-btn" aria-label="Stop playback">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
              </button>
              <span class="public-time-readout" id="public-time-readout">1.1 · 00:00</span>
            </div>

            <div class="public-volume-group">
              <label for="public-vol-slider" class="public-vol-label">Volume</label>
              <input type="range" class="studio-slider-mini" id="public-vol-slider" min="0" max="1" step="0.05" value="0.9" aria-label="Device playback volume" />
            </div>
          </div>
        </main>
      </div>
    `;

    // Title safe insertion
    const headingEl = this.element.querySelector<HTMLElement>('#public-song-title')!;
    headingEl.textContent = this.song.title;

    this.playheadLineEl = this.element.querySelector<HTMLElement>('#public-playhead-line');
    this.timeReadoutEl = this.element.querySelector<HTMLElement>('#public-time-readout');
    this.playBtn = this.element.querySelector<HTMLButtonElement>('#public-play-btn');

    this.bindEvents();
  }

  private bindEvents() {
    if (!this.song || !this.playbackEngine) return;

    // Play button
    this.playBtn?.addEventListener('click', async () => {
      if (Tone.context.state !== 'running') {
        try {
          await Tone.start();
        } catch {}
      }

      if (this.isPlaying) {
        this.playbackEngine?.pause();
      } else {
        this.playbackEngine?.play();
      }
    });

    // Stop button
    this.element.querySelector('#public-stop-btn')?.addEventListener('click', () => {
      this.playbackEngine?.stop();
    });

    // Volume slider
    const volSlider = this.element.querySelector<HTMLInputElement>('#public-vol-slider');
    volSlider?.addEventListener('input', () => {
      const vol = parseFloat(volSlider.value);
      if (this.volumeGain) {
        this.volumeGain.gain.rampTo(vol, 0.05);
      }
    });

    // Remix button
    this.element.querySelector('#public-remix-btn')?.addEventListener('click', async () => {
      if (!this.song) return;

      const remixSong: Song = {
        ...JSON.parse(JSON.stringify(this.song)),
        id: generateUuid(),
        title: `${this.song.title} (remix)`.slice(0, 80),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPublic: false,
        publicSlug: null,
      };

      const songStore = getSongStore();
      await songStore.save(remixSong);

      // Clean up player and open in studio
      this.dispose();
      window.location.hash = `#/studio/${remixSong.id}`;
    });
  }

  public dispose() {
    if (this.playbackEngine) {
      this.playbackEngine.stop();
      this.playbackEngine.dispose();
      this.playbackEngine = null;
    }
    if (this.volumeGain) {
      try {
        this.volumeGain.dispose();
      } catch {}
      this.volumeGain = null;
    }
    this.element.remove();
  }
}
