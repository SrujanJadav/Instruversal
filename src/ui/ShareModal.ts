import { getCreationStore } from '../library/store';
import { getCurrentUser } from '../auth/auth';
import { getAccountSheet } from './AccountSheet';
import { getExportModal } from './ExportModal';
import { isStudioEnabled } from '../config/flags';

class ShareModal {
  private overlay: HTMLElement;
  private isOpen: boolean = false;
  private currentId: string | null = null;
  private currentTitle: string = '';
  private currentSlug: string | null = null;
  private isPublic: boolean = false;
  private mode: 'sketch' | 'song' = 'sketch';

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'share-modal-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Share creation');

    this.overlay.innerHTML = `
      <div class="share-modal-dialog">
        <div class="share-modal-header">
          <h2 class="share-modal-title">Share</h2>
          <button type="button" class="share-modal-close" aria-label="Close share sheet">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
          </button>
        </div>
        <div class="share-modal-body" id="share-modal-body"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.overlay.querySelector('.share-modal-close')?.addEventListener('click', () => {
      this.close();
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (this.isOpen && e.key === 'Escape') {
        this.close();
      }
    });
  }

  private openerElement: HTMLElement | null = null;

  public open(
    id: string,
    title: string,
    isPublic: boolean = false,
    publicSlug: string | null = null,
    mode: 'sketch' | 'song' = 'sketch'
  ) {
    this.openerElement = document.activeElement as HTMLElement | null;
    this.currentId = id;
    this.currentTitle = title;
    this.isPublic = isPublic;
    this.currentSlug = publicSlug;
    this.mode = mode;
    this.isOpen = true;
    this.render();
    this.overlay.classList.add('visible');
    const closeBtn = this.overlay.querySelector<HTMLButtonElement>('.share-modal-close');
    closeBtn?.focus();
  }

  public close() {
    this.isOpen = false;
    this.overlay.classList.remove('visible');
    this.openerElement?.focus();
  }

  private render() {
    const titleEl = this.overlay.querySelector('.share-modal-title');
    if (titleEl) {
      titleEl.textContent = this.currentTitle
        ? `Share "${this.currentTitle}"`
        : this.mode === 'song'
        ? 'Share Song'
        : 'Share Sketch';
    }

    const body = this.overlay.querySelector('#share-modal-body');
    if (!body) return;

    const user = getCurrentUser();

    if (!user) {
      body.innerHTML = `
        <div class="share-signed-out-note">
          <p class="share-desc">Sign in to create a public link and share your ${this.mode === 'song' ? 'songs' : 'sketches'} with anyone.</p>
          <button type="button" class="auth-submit-btn" id="share-signin-btn">Sign in with Account</button>
        </div>
      `;
      body.querySelector('#share-signin-btn')?.addEventListener('click', () => {
        this.close();
        getAccountSheet().open();
      });
      return;
    }

    const routePrefix = this.mode === 'song' ? '#/s/' : '#/c/';
    const shareUrl = this.currentSlug
      ? `${window.location.origin}${window.location.pathname}${routePrefix}${this.currentSlug}`
      : '';

    body.innerHTML = `
      <div class="share-content">
        <div class="share-toggle-row">
          <div class="share-toggle-info">
            <span class="share-toggle-label">Public link</span>
            <span class="share-toggle-sub">Anyone with the link can listen and remix</span>
          </div>
          <label class="share-switch">
            <input type="checkbox" id="share-public-toggle" ${this.isPublic ? 'checked' : ''} />
            <span class="share-slider"></span>
          </label>
        </div>

        <div class="share-link-box ${this.isPublic && this.currentSlug ? 'active' : ''}" id="share-link-box">
          <input type="text" class="share-link-input" id="share-link-input" readonly value="${shareUrl}" />
          <button type="button" class="share-copy-btn" id="share-copy-btn">Copy link</button>
        </div>
        <div class="share-toast" id="share-toast"></div>

        <div class="share-export-row" style="margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: var(--space-2);">
          <div class="share-toggle-info">
            <span class="share-toggle-label">Export Audio</span>
            <span class="share-toggle-sub">High-quality 16-bit WAV or compressed file</span>
          </div>
          <button type="button" class="auth-submit-btn" id="share-export-audio-btn" style="width: auto; padding: 6px 14px; font-size: 0.82rem; white-space: nowrap;">Export audio</button>
        </div>

        <div class="share-export-row" style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: var(--space-2);">
          <div class="share-toggle-info">
            <span class="share-toggle-label">Export MIDI</span>
            <span class="share-toggle-sub">Multi-track .mid file for DAWs & instruments</span>
          </div>
          <button type="button" class="auth-submit-btn" id="share-export-midi-btn" style="width: auto; padding: 6px 14px; font-size: 0.82rem; white-space: nowrap;">Export MIDI</button>
        </div>

        ${isStudioEnabled ? `
        <div class="share-export-row" style="margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: var(--space-2);">
          <div class="share-toggle-info">
            <span class="share-toggle-label">Add to Song…</span>
            <span class="share-toggle-sub">Arrange this sketch in the Song Studio timeline</span>
          </div>
          <button type="button" class="auth-submit-btn" id="share-add-to-song-btn" style="width: auto; padding: 6px 14px; font-size: 0.82rem; white-space: nowrap;">Add to song</button>
        </div>
        ` : ''}
      </div>
    `;

    const toggle = body.querySelector<HTMLInputElement>('#share-public-toggle');
    const linkBox = body.querySelector<HTMLElement>('#share-link-box');
    const linkInput = body.querySelector<HTMLInputElement>('#share-link-input');
    const copyBtn = body.querySelector<HTMLButtonElement>('#share-copy-btn');
    const toast = body.querySelector<HTMLElement>('#share-toast');
    const exportBtn = body.querySelector<HTMLButtonElement>('#share-export-audio-btn');
    const exportMidiBtn = body.querySelector<HTMLButtonElement>('#share-export-midi-btn');
    const addToSongBtn = body.querySelector<HTMLButtonElement>('#share-add-to-song-btn');

    if (this.mode === 'song' && addToSongBtn) {
      const parentRow = addToSongBtn.closest('.share-export-row') as HTMLElement | null;
      if (parentRow) parentRow.style.display = 'none';
    }

    addToSongBtn?.addEventListener('click', async () => {
      if (!this.currentId) return;
      const creationStore = getCreationStore();
      const creation = await creationStore.get(this.currentId);
      if (!creation) return;

      const { getSongStore } = await import('../song/store');
      const { createSongFromCreation, addAsset, findFreeSlot } = await import('../song/helpers');
      const songStore = getSongStore();
      const existingSongs = await songStore.list();

      this.close();

      if (existingSongs.length === 0) {
        const newSong = createSongFromCreation(creation);
        await songStore.save(newSong);
        window.location.hash = `#/studio/${newSong.id}`;
      } else {
        const choice = window.prompt(
          `Add "${creation.title}" to which song?\nType "new" for a New Song, or enter existing title:\nAvailable: ${existingSongs.map((s) => s.title).join(', ')}`,
          'new'
        );
        if (!choice) return;

        if (choice.trim().toLowerCase() === 'new') {
          const newSong = createSongFromCreation(creation);
          await songStore.save(newSong);
          window.location.hash = `#/studio/${newSong.id}`;
        } else {
          const matched = existingSongs.find(
            (s) => s.title.toLowerCase() === choice.trim().toLowerCase()
          );
          const targetSong = matched ? await songStore.get(matched.id) : null;
          if (targetSong) {
            const { song: withAsset, assetId } = addAsset(targetSong, creation);
            const sketchBars = creation.project?.bars ?? 2;
            const laneId = withAsset.lanes[0].id;
            const startBar = findFreeSlot(withAsset.placements, laneId, withAsset.totalBars, sketchBars);
            withAsset.placements.push({
              id: `p-${Date.now()}`,
              assetId,
              laneId,
              startBar,
              lengthBars: sketchBars,
              offsetBars: 0,
              gainDb: 0,
              transpose: 0,
              fadeInBars: 0,
              fadeOutBars: 0,
              mute: false,
            });
            await songStore.save(withAsset);
            window.location.hash = `#/studio/${withAsset.id}`;
          } else {
            const newSong = createSongFromCreation(creation);
            await songStore.save(newSong);
            window.location.hash = `#/studio/${newSong.id}`;
          }
        }
      }
    });

    exportBtn?.addEventListener('click', async () => {
      const title = this.currentTitle;
      this.close();
      if (this.mode === 'song' && this.currentId) {
        window.location.hash = `#/studio/${this.currentId}`;
      } else {
        getExportModal().open(title, 'wav');
      }
    });

    exportMidiBtn?.addEventListener('click', async () => {
      const title = this.currentTitle;
      this.close();
      if (this.mode === 'song' && this.currentId) {
        const { getSongStore } = await import('../song/store');
        const songStore = getSongStore();
        const song = await songStore.get(this.currentId);
        if (song) {
          const { downloadSongMidiFile } = await import('../song/midiExport');
          downloadSongMidiFile(song);
        }
      } else {
        getExportModal().open(title, 'midi');
      }
    });

    toggle?.addEventListener('change', async () => {
      if (!this.currentId) return;
      const willBePublic = toggle.checked;
      toggle.disabled = true;

      try {
        let slug: string | null = null;
        if (this.mode === 'song') {
          const { getSongStore } = await import('../song/store');
          const store = getSongStore();
          if (store.setPublic) {
            slug = await store.setPublic(this.currentId, willBePublic);
          }
        } else {
          const store = getCreationStore();
          if (store.setPublic) {
            slug = await store.setPublic(this.currentId, willBePublic);
          }
        }

        this.isPublic = willBePublic;
        this.currentSlug = slug;

        const routePrefix = this.mode === 'song' ? '#/s/' : '#/c/';
        if (willBePublic && slug) {
          const newUrl = `${window.location.origin}${window.location.pathname}${routePrefix}${slug}`;
          if (linkInput) linkInput.value = newUrl;
          if (linkBox) linkBox.classList.add('active');
        } else {
          if (linkInput) linkInput.value = '';
          if (linkBox) linkBox.classList.remove('active');
        }
      } catch (err) {
        console.error('Failed to update public status:', err);
        toggle.checked = !willBePublic;
      } finally {
        toggle.disabled = false;
      }
    });

    copyBtn?.addEventListener('click', async () => {
      if (!linkInput || !linkInput.value) return;
      try {
        await navigator.clipboard.writeText(linkInput.value);
        copyBtn.textContent = 'Copied!';
        if (toast) {
          toast.textContent = 'Link copied to clipboard';
          toast.classList.add('visible');
          setTimeout(() => {
            copyBtn.textContent = 'Copy link';
            toast.classList.remove('visible');
          }, 2000);
        }
      } catch (err) {
        linkInput.select();
      }
    });
  }
}

let sharedShareModal: ShareModal | null = null;

export function getShareModal(): ShareModal {
  if (!sharedShareModal) {
    sharedShareModal = new ShareModal();
  }
  return sharedShareModal;
}
