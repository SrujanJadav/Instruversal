import { getCreationStore } from '../library/store';
import { getCurrentUser } from '../auth/auth';
import { getAccountSheet } from './AccountSheet';
import { getExportModal } from './ExportModal';

class ShareModal {
  private overlay: HTMLElement;
  private isOpen: boolean = false;
  private currentId: string | null = null;
  private currentTitle: string = '';
  private currentSlug: string | null = null;
  private isPublic: boolean = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'share-modal-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Share sketch');

    this.overlay.innerHTML = `
      <div class="share-modal-dialog">
        <div class="share-modal-header">
          <h2 class="share-modal-title">Share Sketch</h2>
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

  public open(id: string, title: string, isPublic: boolean = false, publicSlug: string | null = null) {
    this.openerElement = document.activeElement as HTMLElement | null;
    this.currentId = id;
    this.currentTitle = title;
    this.isPublic = isPublic;
    this.currentSlug = publicSlug;
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
      titleEl.textContent = this.currentTitle ? `Share "${this.currentTitle}"` : 'Share Sketch';
    }

    const body = this.overlay.querySelector('#share-modal-body');
    if (!body) return;

    const user = getCurrentUser();

    if (!user) {
      body.innerHTML = `
        <div class="share-signed-out-note">
          <p class="share-desc">Sign in to create a public link and share your sketches with anyone.</p>
          <button type="button" class="auth-submit-btn" id="share-signin-btn">Sign in with Account</button>
        </div>
      `;
      body.querySelector('#share-signin-btn')?.addEventListener('click', () => {
        this.close();
        getAccountSheet().open();
      });
      return;
    }

    const shareUrl = this.currentSlug
      ? `${window.location.origin}${window.location.pathname}#/c/${this.currentSlug}`
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
      </div>
    `;

    const toggle = body.querySelector<HTMLInputElement>('#share-public-toggle');
    const linkBox = body.querySelector<HTMLElement>('#share-link-box');
    const linkInput = body.querySelector<HTMLInputElement>('#share-link-input');
    const copyBtn = body.querySelector<HTMLButtonElement>('#share-copy-btn');
    const toast = body.querySelector<HTMLElement>('#share-toast');
    const exportBtn = body.querySelector<HTMLButtonElement>('#share-export-audio-btn');
    const exportMidiBtn = body.querySelector<HTMLButtonElement>('#share-export-midi-btn');

    exportBtn?.addEventListener('click', () => {
      const title = this.currentTitle;
      this.close();
      getExportModal().open(title, 'wav');
    });

    exportMidiBtn?.addEventListener('click', () => {
      const title = this.currentTitle;
      this.close();
      getExportModal().open(title, 'midi');
    });

    toggle?.addEventListener('change', async () => {
      if (!this.currentId) return;
      const willBePublic = toggle.checked;
      toggle.disabled = true;

      try {
        const store = getCreationStore();
        if (store.setPublic) {
          const slug = await store.setPublic(this.currentId, willBePublic);
          this.isPublic = willBePublic;
          this.currentSlug = slug;

          if (willBePublic && slug) {
            const newUrl = `${window.location.origin}${window.location.pathname}#/c/${slug}`;
            if (linkInput) linkInput.value = newUrl;
            if (linkBox) linkBox.classList.add('active');
          } else {
            if (linkInput) linkInput.value = '';
            if (linkBox) linkBox.classList.remove('active');
          }
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
