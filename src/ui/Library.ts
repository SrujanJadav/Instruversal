import { CreationMeta, Creation } from '../library/types';
import { getCreationStore } from '../library/store';
import { getCreationManager, generateUuid } from '../library/manager';
import { validateCreation } from '../library/validator';
import { events } from '../state';
import { getCurrentUser, onAuthStateChange } from '../auth/auth';
import { getAccountSheet } from './AccountSheet';
import { getShareModal } from './ShareModal';

export class LibraryModal {
  private overlay: HTMLElement;
  private gridContainer: HTMLElement;
  private searchInput: HTMLInputElement;
  private sortToggleRecent: HTMLButtonElement;
  private sortToggleAlpha: HTMLButtonElement;
  private countBadge: HTMLElement;
  private emptyState: HTMLElement;
  private toastContainer: HTMLElement;

  private creations: CreationMeta[] = [];
  private searchQuery: string = '';
  private sortBy: 'recent' | 'alpha' = 'recent';
  private isOpen: boolean = false;
  private pendingDeletions: Map<string, { timer: number; meta: CreationMeta; creation?: Creation }> = new Map();
  private activeMenuCardId: string | null = null;
  private confirmingDeleteId: string | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'library-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'My creations library');

    this.overlay.innerHTML = `
      <div class="library-modal">
        <header class="library-header">
          <div class="library-title-group" style="display: flex; align-items: center; gap: var(--space-2);">
            <a href="#/" class="header-title library-home-btn" id="lib-home-btn" aria-label="Instruversal, go to the start page">
              <img src="/icon.svg" alt="" class="header-brand-icon icon-light-mode" />
              <img src="/icon-dark.svg" alt="" class="header-brand-icon icon-dark-mode" />
              <span>Instruversal</span>
            </a>
            <span class="header-divider-dot">·</span>
            <h2 class="library-heading">My creations</h2>
            <span class="library-count-badge" id="lib-count-badge">0 saved</span>
          </div>
          <div class="library-header-actions">
            <div id="lib-account-container" style="display: flex; align-items: center;"></div>
            <button type="button" class="library-btn library-btn-primary" id="lib-new-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>New</span>
            </button>
            <button type="button" class="library-btn" id="lib-backup-btn" title="Download backup of all creations">
              <span>Backup</span>
            </button>
            <button type="button" class="library-btn" id="lib-import-btn" title="Import creations from backup file">
              <span>Import</span>
            </button>
            <input type="file" id="lib-import-input" accept=".json" style="display: none;" />
            <button type="button" class="library-btn library-btn-icon-only" id="lib-close-btn" aria-label="Close library">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </header>

        <div id="lib-guest-prompt" style="display: none; padding: var(--space-2) var(--space-4); background-color: var(--paper-deep); border-bottom: 1px solid var(--line); font-size: 0.82rem; justify-content: space-between; align-items: center;">
          <span>Sign in to keep your creations on every device.</span>
          <div style="display: flex; gap: var(--space-2); align-items: center;">
            <button type="button" class="auth-pill-btn" id="lib-prompt-signin-btn" style="height: 26px; font-size: 0.75rem;">Sign in</button>
            <button type="button" class="account-link-btn" id="lib-prompt-dismiss-btn" style="font-size: 0.75rem;">Dismiss</button>
          </div>
        </div>

        <div class="library-subbar">
          <div class="library-search-wrapper">
            <span class="library-search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input type="search" class="library-search-input" id="lib-search-input" placeholder="Search creations…" aria-label="Search creations by title" />
          </div>

          <div class="library-filter-group">
            <div class="library-sort-chips" role="radiogroup" aria-label="Sort creations">
              <button type="button" class="library-sort-chip active" id="lib-sort-recent" role="radio" aria-checked="true">Recent</button>
              <button type="button" class="library-sort-chip" id="lib-sort-alpha" role="radio" aria-checked="false">A to Z</button>
            </div>
          </div>
        </div>

        <div id="lib-private-banner" style="display: none;" class="library-private-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Saving is off in private mode</span>
        </div>

        <div class="library-scroll-area" id="lib-scroll-area">
          <div class="library-grid" id="lib-grid"></div>

          <div class="library-empty" id="lib-empty" style="display: none;">
            <div class="library-empty-title">Nothing saved yet</div>
            <div class="library-empty-desc">Draw something and it shows up here.</div>
          </div>
        </div>

        <div id="lib-toast-container"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.gridContainer = this.overlay.querySelector('#lib-grid')!;
    this.searchInput = this.overlay.querySelector('#lib-search-input')!;
    this.sortToggleRecent = this.overlay.querySelector('#lib-sort-recent')!;
    this.sortToggleAlpha = this.overlay.querySelector('#lib-sort-alpha')!;
    this.countBadge = this.overlay.querySelector('#lib-count-badge')!;
    this.emptyState = this.overlay.querySelector('#lib-empty')!;
    this.toastContainer = this.overlay.querySelector('#lib-toast-container')!;

    this.bindEvents();
    this.handleHashChange();
  }

  private bindEvents() {
    window.addEventListener('hashchange', () => this.handleHashChange());

    const closeBtn = this.overlay.querySelector('#lib-close-btn')!;
    closeBtn.addEventListener('click', () => this.close());

    const homeBtn = this.overlay.querySelector('#lib-home-btn');
    homeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.close(false);
      window.location.hash = '#/';
    });

    const accountContainer = this.overlay.querySelector<HTMLElement>('#lib-account-container');
    const guestPrompt = this.overlay.querySelector<HTMLElement>('#lib-guest-prompt');
    const DISMISS_KEY = 'instruversal:dismiss_cloud_prompt';

    const updateAuthUI = () => {
      const user = getCurrentUser();
      if (accountContainer) {
        if (user) {
          const initial = (user.email || 'U')[0].toUpperCase();
          const shortEmail = (user.email || '').split('@')[0];
          accountContainer.innerHTML = `
            <button type="button" class="auth-pill-btn" id="lib-auth-pill-btn" aria-label="Account: ${user.email}">
              <span class="auth-avatar-circle">${initial}</span>
              <span>${shortEmail}</span>
            </button>
          `;
        } else {
          accountContainer.innerHTML = `
            <button type="button" class="auth-pill-btn" id="lib-auth-pill-btn" aria-label="Sign in to your account">
              Sign in
            </button>
          `;
        }
        accountContainer.querySelector('#lib-auth-pill-btn')?.addEventListener('click', () => {
          getAccountSheet().open();
        });
      }

      if (guestPrompt) {
        let dismissed = false;
        try {
          dismissed = localStorage.getItem(DISMISS_KEY) === 'true';
        } catch {}
        if (!user && !dismissed) {
          guestPrompt.style.display = 'flex';
        } else {
          guestPrompt.style.display = 'none';
        }
      }
    };

    onAuthStateChange(() => updateAuthUI());

    this.overlay.querySelector('#lib-prompt-signin-btn')?.addEventListener('click', () => {
      getAccountSheet().open();
    });

    this.overlay.querySelector('#lib-prompt-dismiss-btn')?.addEventListener('click', () => {
      try {
        localStorage.setItem(DISMISS_KEY, 'true');
      } catch {}
      if (guestPrompt) guestPrompt.style.display = 'none';
    });

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        if (this.activeMenuCardId) {
          this.activeMenuCardId = null;
          this.renderGrid();
        } else {
          this.close();
        }
      }
    });

    // New button
    this.overlay.querySelector('#lib-new-btn')?.addEventListener('click', async () => {
      await getCreationManager().createNewCreation();
      this.close();
    });

    // Backup download
    this.overlay.querySelector('#lib-backup-btn')?.addEventListener('click', () => {
      this.downloadBackup();
    });

    // Import backup
    const importInput = this.overlay.querySelector<HTMLInputElement>('#lib-import-input')!;
    this.overlay.querySelector('#lib-import-btn')?.addEventListener('click', () => {
      importInput.value = '';
      importInput.click();
    });

    importInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        this.handleImportFile(file);
      }
    });

    // Search input
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.trim().toLowerCase();
      this.renderGrid();
    });

    // Sort toggles
    this.sortToggleRecent.addEventListener('click', () => {
      if (this.sortBy !== 'recent') {
        this.sortBy = 'recent';
        this.sortToggleRecent.classList.add('active');
        this.sortToggleRecent.setAttribute('aria-checked', 'true');
        this.sortToggleAlpha.classList.remove('active');
        this.sortToggleAlpha.setAttribute('aria-checked', 'false');
        this.renderGrid();
      }
    });

    this.sortToggleAlpha.addEventListener('click', () => {
      if (this.sortBy !== 'alpha') {
        this.sortBy = 'alpha';
        this.sortToggleAlpha.classList.add('active');
        this.sortToggleAlpha.setAttribute('aria-checked', 'true');
        this.sortToggleRecent.classList.remove('active');
        this.sortToggleRecent.setAttribute('aria-checked', 'false');
        this.renderGrid();
      }
    });

    // Arrow navigation in grid
    this.gridContainer.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement;
      const card = target.closest<HTMLElement>('.library-card');
      if (!card) return;

      const cards = Array.from(this.gridContainer.querySelectorAll<HTMLElement>('.library-card'));
      const index = cards.indexOf(card);
      if (index === -1) return;

      if (e.key === 'ArrowRight' && index < cards.length - 1) {
        e.preventDefault();
        cards[index + 1].focus();
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault();
        cards[index - 1].focus();
      } else if (e.key === 'ArrowDown' && index + 2 < cards.length) {
        e.preventDefault();
        cards[Math.min(cards.length - 1, index + 2)].focus();
      } else if (e.key === 'ArrowUp' && index - 2 >= 0) {
        e.preventDefault();
        cards[Math.max(0, index - 2)].focus();
      }
    });
  }

  private handleHashChange() {
    if (window.location.hash === '#/library') {
      this.open();
    } else if (this.isOpen) {
      this.close(false);
    }
  }

  public async open() {
    if (window.location.hash !== '#/library') {
      window.location.hash = '#/library';
      return;
    }

    this.isOpen = true;
    this.overlay.classList.add('open');
    this.activeMenuCardId = null;
    this.confirmingDeleteId = null;

    // Check private mode
    const store = getCreationStore();
    const banner = this.overlay.querySelector<HTMLElement>('#lib-private-banner');
    if (banner) {
      banner.style.display = store.isInMemory ? 'flex' : 'none';
    }

    this.renderSkeletons();
    await this.refreshCreations();
    this.searchInput.focus();
  }

  public close(updateHash: boolean = true) {
    this.isOpen = false;
    this.overlay.classList.remove('open');
    this.activeMenuCardId = null;
    this.confirmingDeleteId = null;

    if (updateHash && window.location.hash === '#/library') {
      window.location.hash = '#/app';
    }
  }

  public async refreshCreations() {
    const store = getCreationStore();
    this.creations = await store.list();
    this.countBadge.textContent = `${this.creations.length} saved`;
    this.renderGrid();
  }

  private renderSkeletons() {
    this.gridContainer.innerHTML = `
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    `;
    this.emptyState.style.display = 'none';
  }

  private formatRelativeTime(timestamp: number): string {
    const elapsedSec = Math.floor((Date.now() - timestamp) / 1000);
    if (elapsedSec < 60) return 'edited just now';
    const elapsedMin = Math.floor(elapsedSec / 60);
    if (elapsedMin < 60) return `edited ${elapsedMin}m ago`;
    const elapsedHours = Math.floor(elapsedMin / 60);
    if (elapsedHours < 24) return `edited ${elapsedHours}h ago`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) return `edited ${elapsedDays}d ago`;
    return `edited on ${new Date(timestamp).toLocaleDateString()}`;
  }

  private renderSvgThumbnail(meta: CreationMeta): string {
    const strokes = meta.simplifiedStrokes || [];
    if (strokes.length === 0) {
      return `
        <svg viewBox="0 0 100 100" class="card-svg-thumb" preserveAspectRatio="none">
          <line x1="30" y1="50" x2="70" y2="50" stroke="var(--line)" stroke-width="2" stroke-dasharray="4,4" />
        </svg>
      `;
    }

    const pathsHtml = strokes
      .map((s) => {
        const pts = s.points;
        if (!pts || pts.length === 0) return '';
        const colorVar = `var(${s.trackId ? (meta.trackColors?.[0] || '--ink') : '--ink'})`;
        const width = Math.max(1.8, Math.min(6, (s.width || 3) * 0.9));

        if (pts.length === 1) {
          return `<circle cx="${pts[0].x * 100}" cy="${pts[0].y * 100}" r="${width * 0.8}" fill="${colorVar}" />`;
        }

        let d = `M ${(pts[0].x * 100).toFixed(1)} ${(pts[0].y * 100).toFixed(1)}`;
        for (let i = 1; i < pts.length; i++) {
          d += ` L ${(pts[i].x * 100).toFixed(1)} ${(pts[i].y * 100).toFixed(1)}`;
        }

        return `<path d="${d}" fill="none" stroke="${colorVar}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" />`;
      })
      .join('');

    return `
      <svg viewBox="0 0 100 100" class="card-svg-thumb" preserveAspectRatio="none">
        ${pathsHtml}
      </svg>
    `;
  }

  private renderSyncBadge(meta: CreationMeta): string {
    const status = meta.syncStatus || 'local';
    if (status === 'synced') {
      return `<span class="card-sync-badge synced" title="Synced to cloud">Synced</span>`;
    }
    if (status === 'syncing') {
      return `<span class="card-sync-badge syncing" title="Syncing to cloud">Syncing</span>`;
    }
    if (status === 'error') {
      return `<span class="card-sync-badge error" title="Couldn't sync, will retry">Couldn't sync</span>`;
    }
    return `<span class="card-sync-badge local" title="Saved on this device only">This device</span>`;
  }

  private renderGrid() {
    let items = [...this.creations];

    // Filter pending deletions
    items = items.filter((c) => !this.pendingDeletions.has(c.id));

    // Search filter
    if (this.searchQuery) {
      items = items.filter((c) => c.title.toLowerCase().includes(this.searchQuery));
    }

    // Sort
    if (this.sortBy === 'alpha') {
      items.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      items.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    if (items.length === 0) {
      this.gridContainer.innerHTML = '';
      this.emptyState.style.display = 'flex';
      return;
    }

    this.emptyState.style.display = 'none';
    this.gridContainer.innerHTML = '';

    const currentActiveId = getCreationManager().getCurrentId();

    for (const meta of items) {
      const card = document.createElement('div');
      card.className = `library-card ${meta.id === currentActiveId ? 'active-creation' : ''}`;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Open ${meta.title}`);
      card.dataset.id = meta.id;

      const isMenuOpen = this.activeMenuCardId === meta.id;
      const isConfirmingDelete = this.confirmingDeleteId === meta.id;

      card.innerHTML = `
        <div class="card-thumbnail-box">
          ${this.renderSvgThumbnail(meta)}
          <button type="button" class="card-play-btn" data-play-id="${meta.id}" aria-label="Play ${meta.title} immediately">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
          </button>
        </div>

        <div class="card-info">
          <div class="card-title-row">
            <h3 class="card-title"></h3>
            <button type="button" class="card-menu-btn" data-menu-id="${meta.id}" aria-label="Creation options" tabindex="0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
          </div>

          <div class="card-meta-row">
            <span class="card-date">${this.formatRelativeTime(meta.updatedAt)}</span>
            ${this.renderSyncBadge(meta)}
          </div>

          <div class="card-tags">
            <span class="card-tag">${meta.bpm} BPM</span>
            <span class="card-tag">${meta.keyLabel || 'C Major Pentatonic'}</span>
            ${meta.strokeCount > 0 ? `<span class="card-tag">${meta.strokeCount} stroke${meta.strokeCount === 1 ? '' : 's'}</span>` : ''}
          </div>
        </div>

        ${
          isMenuOpen
            ? `
          <div class="card-inline-menu" role="menu">
            <button type="button" class="card-inline-menu-item" data-action="rename" data-id="${meta.id}">Rename</button>
            <button type="button" class="card-inline-menu-item" data-action="duplicate" data-id="${meta.id}">Duplicate</button>
            <button type="button" class="card-inline-menu-item" data-action="share" data-id="${meta.id}">Share link</button>
            <button type="button" class="card-inline-menu-item danger" data-action="delete" data-id="${meta.id}">Delete</button>
          </div>
        `
            : ''
        }

        ${
          isConfirmingDelete
            ? `
          <div class="card-confirm-delete">
            <span>Sure?</span>
            <div class="card-confirm-actions">
              <button type="button" class="card-confirm-btn yes" data-confirm-yes="${meta.id}">Yes</button>
              <button type="button" class="card-confirm-btn" data-confirm-no="${meta.id}">No</button>
            </div>
          </div>
        `
            : ''
        }
      `;

      // Insert title as textContent for absolute safety against HTML injection
      const titleEl = card.querySelector<HTMLElement>('.card-title')!;
      titleEl.textContent = meta.title;

      // Card tap opens paused
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (
          target.closest('.card-play-btn') ||
          target.closest('.card-menu-btn') ||
          target.closest('.card-inline-menu') ||
          target.closest('.card-confirm-delete')
        ) {
          return;
        }
        this.openCreationAndClose(meta.id, false);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const target = e.target as HTMLElement;
          if (
            target.closest('.card-play-btn') ||
            target.closest('.card-menu-btn') ||
            target.closest('.card-inline-menu') ||
            target.closest('.card-confirm-delete')
          ) {
            return;
          }
          e.preventDefault();
          this.openCreationAndClose(meta.id, false);
        }
      });

      // Play button opens and plays right away
      const playBtn = card.querySelector<HTMLElement>('.card-play-btn')!;
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openCreationAndClose(meta.id, true);
      });

      // Menu button
      const menuBtn = card.querySelector<HTMLElement>('.card-menu-btn')!;
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.confirmingDeleteId = null;
        this.activeMenuCardId = this.activeMenuCardId === meta.id ? null : meta.id;
        this.renderGrid();
      });

      // Menu actions
      if (isMenuOpen) {
        card.querySelector('[data-action="rename"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.activeMenuCardId = null;
          this.handleInlineRename(meta);
        });

        card.querySelector('[data-action="duplicate"]')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          this.activeMenuCardId = null;
          await this.duplicateCreation(meta.id);
        });

        card.querySelector('[data-action="share"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.activeMenuCardId = null;
          this.renderGrid();
          getShareModal().open(meta.id, meta.title, meta.isPublic, meta.publicSlug);
        });

        card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.activeMenuCardId = null;
          this.confirmingDeleteId = meta.id;
          this.renderGrid();
        });
      }

      // Inline delete confirmation
      if (isConfirmingDelete) {
        card.querySelector('[data-confirm-yes]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.confirmingDeleteId = null;
          this.initiateSoftDelete(meta);
        });

        card.querySelector('[data-confirm-no]')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.confirmingDeleteId = null;
          this.renderGrid();
        });
      }

      this.gridContainer.appendChild(card);
    }
  }

  private async openCreationAndClose(id: string, startPlaying: boolean) {
    this.close();
    const mainViewEl = document.querySelector<HTMLElement>('#main-view');
    if (!mainViewEl || mainViewEl.style.display === 'none') {
      events.emit('app:start', { startAudio: startPlaying });
    }
    await getCreationManager().openCreation(id, startPlaying);
  }

  private handleInlineRename(meta: CreationMeta) {
    const newTitle = window.prompt('Rename creation:', meta.title);
    if (newTitle !== null && newTitle.trim()) {
      const sanitized = newTitle.trim().slice(0, 80);
      const store = getCreationStore();
      store.get(meta.id).then(async (creation) => {
        if (creation) {
          creation.title = sanitized;
          creation.updatedAt = Date.now();
          await store.save(creation);
          if (getCreationManager().getCurrentId() === meta.id) {
            getCreationManager().setTitle(sanitized);
          }
          await this.refreshCreations();
        }
      });
    }
  }

  private async duplicateCreation(id: string) {
    const store = getCreationStore();
    const original = await store.get(id);
    if (!original) return;

    const newId = generateUuid();
    const duplicated: Creation = {
      id: newId,
      title: `${original.title} (copy)`.slice(0, 80),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: original.schemaVersion || 1,
      project: JSON.parse(JSON.stringify(original.project)),
    };

    await store.save(duplicated);
    await this.refreshCreations();
  }

  private initiateSoftDelete(meta: CreationMeta) {
    const store = getCreationStore();

    store.get(meta.id).then((fullCreation) => {
      // 6-second undo countdown requirement
      const timer = window.setTimeout(async () => {
        this.pendingDeletions.delete(meta.id);
        await store.remove(meta.id);
        await this.refreshCreations();
      }, 6000);

      this.pendingDeletions.set(meta.id, {
        timer,
        meta,
        creation: fullCreation || undefined,
      });

      this.renderGrid();
      this.showUndoToast(meta.id, meta.title);
    });
  }

  private showUndoToast(id: string, title: string) {
    this.toastContainer.innerHTML = `
      <div class="library-toast">
        <span>Deleted "${title.slice(0, 20)}".</span>
        <button type="button" class="library-toast-undo-btn" id="lib-undo-btn">Undo</button>
      </div>
    `;

    const undoBtn = this.toastContainer.querySelector('#lib-undo-btn')!;
    undoBtn.addEventListener('click', () => {
      const pending = this.pendingDeletions.get(id);
      if (pending) {
        window.clearTimeout(pending.timer);
        this.pendingDeletions.delete(id);
        this.toastContainer.innerHTML = '';
        this.renderGrid();
      }
    });

    window.setTimeout(() => {
      if (this.toastContainer.querySelector('#lib-undo-btn') === undoBtn) {
        this.toastContainer.innerHTML = '';
      }
    }, 6000);
  }

  private async downloadBackup() {
    const store = getCreationStore();
    const allCreations = store.getAllFull
      ? await store.getAllFull()
      : await Promise.all(this.creations.map((m) => store.get(m.id))).then((arr) =>
          arr.filter((c): c is Creation => c !== null)
        );

    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `instruversal-library-${dateStr}.json`;
    const jsonStr = JSON.stringify(allCreations, null, 2);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private async handleImportFile(file: File) {
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        alert('Could not read backup file: invalid JSON format.');
        return;
      }

      if (!Array.isArray(parsed)) {
        alert('Invalid backup format: expected an array of creations.');
        return;
      }

      const store = getCreationStore();
      const existingList = await store.list();
      const existingIds = new Set(existingList.map((c) => c.id));

      let importedCount = 0;
      let skippedCount = 0;

      for (const item of parsed) {
        const val = validateCreation(item);
        if (val.isValid && val.data) {
          if (existingIds.has(val.data.id)) {
            skippedCount++;
          } else {
            await store.save(val.data);
            existingIds.add(val.data.id);
            importedCount++;
          }
        }
      }

      await this.refreshCreations();
      alert(`Import complete: ${importedCount} creations imported (${skippedCount} duplicates skipped).`);
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import creations backup.');
    }
  }
}

let sharedLibraryModal: LibraryModal | null = null;

export function getLibraryModal(): LibraryModal {
  if (!sharedLibraryModal) {
    sharedLibraryModal = new LibraryModal();
  }
  return sharedLibraryModal;
}
