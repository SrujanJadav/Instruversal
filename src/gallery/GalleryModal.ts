import * as Tone from 'tone';
import { state, events } from '../state';
import { CreationMeta } from '../library/types';
import { getCreationStore } from '../library/store';
import { getCreationManager } from '../library/manager';
import { renderThumbnailCanvas } from './thumbnail';
import { GALLERY_CONSTANTS } from './constants';

export class GalleryModal {
  private overlay: HTMLElement;
  private canvasContainer: HTMLElement;
  private fallbackRow: HTMLElement;
  private captionEl: HTMLElement;
  private backBtn: HTMLElement;
  private openBtn: HTMLElement;
  private srMirror: HTMLElement;

  private galleryInstance: any | null = null;
  private creations: CreationMeta[] = [];
  private currentCenteredMeta: CreationMeta | null = null;
  private isOpen: boolean = false;
  private isAnimating: boolean = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'gallery-screen';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-label', 'Saved creations 3D gallery');

    this.overlay.innerHTML = `
      <div class="gallery-topbar">
        <div class="gallery-topbar-left" style="display: flex; align-items: center; gap: var(--space-3);">
          <button type="button" class="gallery-back-btn" id="gal-back-btn" aria-label="Back to start page">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>Back</span>
          </button>
          <a href="#/" class="header-title gallery-home-btn" id="gal-home-btn" aria-label="Instruversal, go to the start page">Instruversal</a>
        </div>
        <span class="gallery-hint">Drag or swipe to browse</span>
      </div>

      <div class="gallery-canvas-container" id="gal-canvas-container"></div>

      <div class="gallery-fallback-row" id="gal-fallback-row"></div>

      <div class="gallery-bottom-bar">
        <div class="gallery-centered-caption" id="gal-caption"></div>
        <button type="button" class="gallery-open-action-btn" id="gal-open-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
          <span>Open project</span>
        </button>
      </div>

      <div class="gallery-sr-mirror" id="gal-sr-mirror" aria-live="polite"></div>
    `;

    document.body.appendChild(this.overlay);

    this.canvasContainer = this.overlay.querySelector('#gal-canvas-container')!;
    this.fallbackRow = this.overlay.querySelector('#gal-fallback-row')!;
    this.captionEl = this.overlay.querySelector('#gal-caption')!;
    this.backBtn = this.overlay.querySelector('#gal-back-btn')!;
    this.openBtn = this.overlay.querySelector('#gal-open-btn')!;
    this.srMirror = this.overlay.querySelector('#gal-sr-mirror')!;

    this.bindEvents();
    this.handleHashChange();
  }

  private bindEvents() {
    window.addEventListener('hashchange', () => this.handleHashChange());

    this.backBtn.addEventListener('click', () => {
      this.close();
    });

    const homeBtn = this.overlay.querySelector('#gal-home-btn');
    homeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.close(false);
      window.location.hash = '#/';
    });

    this.openBtn.addEventListener('click', () => {
      if (this.currentCenteredMeta) {
        this.openProject(this.currentCenteredMeta.id);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        this.close();
      }
    });

    // Theme change listener
    window.addEventListener('themechange', () => {
      if (this.isOpen && this.galleryInstance) {
        this.galleryInstance.updateTheme();
      }
    });
  }

  private handleHashChange() {
    if (window.location.hash === '#/load') {
      this.open();
    } else if (this.isOpen) {
      this.close(false);
    }
  }

  public async open() {
    if (this.isAnimating) return;

    if (window.location.hash !== '#/load') {
      window.location.hash = '#/load';
      return;
    }

    // 1. Audio unlock check
    if (Tone.context.state !== 'running') {
      try {
        await Tone.start();
        state.audioStarted = true;
        events.emit('audio:started', undefined);
      } catch {}
    }

    this.isOpen = true;
    this.isAnimating = true;

    // 2. Fetch creations from CreationStore (max 12, newest first)
    const store = getCreationStore();
    const list = await store.list();
    this.creations = list.slice(0, 12);

    if (this.creations.length === 0) {
      // Nothing to load: close cleanly
      this.close();
      return;
    }

    // 3. Fade out gate-screen content
    const gateScreen = document.querySelector<HTMLElement>('#gate-screen');
    if (gateScreen) {
      gateScreen.style.transition = `opacity ${GALLERY_CONSTANTS.startContentFadeDurationMs}ms ease-out, transform ${GALLERY_CONSTANTS.startContentFadeDurationMs}ms ease-out`;
      gateScreen.style.transform = `translateY(-${GALLERY_CONSTANTS.startContentSlideUpPx}px)`;
      gateScreen.style.opacity = '0';
    }

    this.overlay.classList.add('open');

    // 4. Dynamically import and initialize CircularGallery
    try {
      // DYNAMIC IMPORT ONLY WHEN LOAD IS TAPPED
      const { CircularGallery } = await import('./CircularGallery');

      if (this.galleryInstance) {
        this.galleryInstance.destroy();
        this.galleryInstance = null;
      }

      this.canvasContainer.innerHTML = '';
      this.canvasContainer.style.display = 'block';
      this.fallbackRow.style.display = 'none';

      this.galleryInstance = new CircularGallery(this.canvasContainer, {
        items: this.creations,
        onSelect: (id) => this.openProject(id),
        onCenteredChange: (meta) => this.updateCenteredCaption(meta),
        onContextLost: () => this.showFallback(),
      });

      this.renderScreenReaderMirror();
    } catch (err) {
      console.warn('Could not launch 3D gallery, showing fallback:', err);
      this.showFallback();
    }

    setTimeout(() => {
      this.isAnimating = false;
    }, GALLERY_CONSTANTS.galleryTotalOpenDurationMs);
  }

  private updateCenteredCaption(meta: CreationMeta) {
    if (this.currentCenteredMeta?.id === meta.id && this.captionEl.textContent) return;
    this.currentCenteredMeta = meta;

    const elapsedSec = Math.floor((Date.now() - meta.updatedAt) / 1000);
    let timeStr = 'edited just now';
    if (elapsedSec >= 86400) {
      const days = Math.floor(elapsedSec / 86400);
      timeStr = `edited ${days}d ago`;
    } else if (elapsedSec >= 3600) {
      const hours = Math.floor(elapsedSec / 3600);
      timeStr = `edited ${hours}h ago`;
    } else if (elapsedSec >= 60) {
      const mins = Math.floor(elapsedSec / 60);
      timeStr = `edited ${mins}m ago`;
    }

    const newText = `${meta.bpm} BPM · ${meta.keyLabel || 'C Major Pentatonic'} · ${timeStr}`;

    if (this.captionEl.textContent && this.captionEl.textContent !== newText) {
      this.captionEl.style.opacity = '0';
      setTimeout(() => {
        this.captionEl.textContent = newText;
        this.captionEl.style.opacity = '1';
      }, 120);
    } else {
      this.captionEl.textContent = newText;
      this.captionEl.style.opacity = '1';
    }
  }

  private showFallback() {
    this.canvasContainer.style.display = 'none';
    this.fallbackRow.style.display = 'flex';
    this.fallbackRow.innerHTML = '';

    for (const meta of this.creations) {
      const card = document.createElement('div');
      card.className = 'gallery-fallback-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Open ${meta.title}`);

      const canvas = renderThumbnailCanvas(meta, 350, 437);
      canvas.className = 'gallery-fallback-canvas';
      card.appendChild(canvas);

      const titleEl = document.createElement('div');
      titleEl.className = 'gallery-fallback-title';
      titleEl.textContent = meta.title;
      card.appendChild(titleEl);

      card.addEventListener('click', () => {
        this.openProject(meta.id);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openProject(meta.id);
        }
      });

      this.fallbackRow.appendChild(card);
    }

    if (this.creations.length > 0) {
      this.updateCenteredCaption(this.creations[0]);
    }
  }

  private renderScreenReaderMirror() {
    this.srMirror.innerHTML = '';
    const list = document.createElement('ul');

    for (const meta of this.creations) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${meta.title}, ${meta.bpm} BPM, ${meta.keyLabel || 'Key'}`;
      btn.addEventListener('click', () => {
        this.openProject(meta.id);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }

    this.srMirror.appendChild(list);
  }

  private async openProject(creationId: string) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    // 1. Hide gallery overlay with clean zoom / fade
    this.overlay.style.transition = `opacity ${GALLERY_CONSTANTS.openProjectZoomDurationMs}ms ease-out`;
    this.overlay.style.opacity = '0';

    // 2. Hide gate-screen
    const gateScreen = document.querySelector<HTMLElement>('#gate-screen');
    if (gateScreen) {
      gateScreen.style.display = 'none';
      gateScreen.classList.add('hidden');
    }

    // 3. Trigger transition to main-view and unlock audio
    events.emit('app:start', { startAudio: true });

    // 4. Open the project cleanly and start playing
    await getCreationManager().openCreation(creationId, true);

    setTimeout(() => {
      this.close(false);
      this.isAnimating = false;
    }, GALLERY_CONSTANTS.openProjectZoomDurationMs);
  }

  public close(updateHash: boolean = true) {
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this.overlay.style.opacity = '';

    if (this.galleryInstance) {
      this.galleryInstance.destroy();
      this.galleryInstance = null;
    }

    // Restore gate screen position and opacity
    const gateScreen = document.querySelector<HTMLElement>('#gate-screen');
    if (gateScreen) {
      gateScreen.classList.remove('hidden');
      gateScreen.removeAttribute('aria-hidden');
      gateScreen.style.display = 'flex';
      gateScreen.style.visibility = 'visible';
      gateScreen.style.pointerEvents = 'auto';
      gateScreen.style.transition = `opacity ${GALLERY_CONSTANTS.backAnimationDurationMs}ms ease-out, transform ${GALLERY_CONSTANTS.backAnimationDurationMs}ms ease-out`;
      gateScreen.style.transform = 'translateY(0)';
      gateScreen.style.opacity = '1';
    }

    const startBtn = document.querySelector<HTMLButtonElement>('#start-btn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Tap to start';
    }

    if (updateHash && window.location.hash === '#/load') {
      window.location.hash = '#/';
    }
  }
}

let sharedGalleryModal: GalleryModal | null = null;

export function getGalleryModal(): GalleryModal {
  if (!sharedGalleryModal) {
    sharedGalleryModal = new GalleryModal();
  }
  return sharedGalleryModal;
}
