import { getCreationStore } from '../library/store';
import { getCurrentUser } from '../auth/auth';

class MigrationSheet {
  private overlay: HTMLElement;
  private isOpen: boolean = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'migration-sheet-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Add local creations to account');

    this.overlay.innerHTML = `
      <div class="migration-sheet-dialog">
        <div class="migration-sheet-header">
          <h2 class="migration-sheet-title">Sync existing sketches?</h2>
          <button type="button" class="migration-sheet-close" aria-label="Close">✕</button>
        </div>
        <div class="migration-sheet-body">
          <p class="migration-desc" id="migration-desc">
            You have sketches on this device. Would you like to add them to your cloud account so they are backed up and accessible across your devices?
          </p>
          <div class="migration-actions">
            <button type="button" class="migration-primary-btn" id="migration-add-all-btn">Add sketches to account</button>
            <button type="button" class="migration-secondary-btn" id="migration-dismiss-btn">Keep on this device only</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.overlay.querySelector('.migration-sheet-close')?.addEventListener('click', () => {
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

  public async checkAndPrompt(): Promise<void> {
    const user = getCurrentUser();
    if (!user || typeof localStorage === 'undefined') return;

    const migrationKey = `instruversal:migrated_user_${user.id}`;
    const alreadyHandled = localStorage.getItem(migrationKey);
    if (alreadyHandled) return;

    try {
      const store = getCreationStore();
      const localCreations = store.getAllFull ? await store.getAllFull() : [];

      if (localCreations.length === 0) {
        localStorage.setItem(migrationKey, 'true');
        return;
      }

      this.open(localCreations.length, user.id);
    } catch (err) {
      console.warn('Failed to check local creations for migration:', err);
    }
  }

  private open(count: number, userId: string) {
    const desc = this.overlay.querySelector('#migration-desc');
    const addBtn = this.overlay.querySelector('#migration-add-all-btn') as HTMLButtonElement;
    const dismissBtn = this.overlay.querySelector('#migration-dismiss-btn') as HTMLButtonElement;
    const migrationKey = `instruversal:migrated_user_${userId}`;

    if (desc) {
      desc.textContent = `You have ${count} sketch${count === 1 ? '' : 'es'} saved on this device. Would you like to add them to your account so they are backed up and available across all your devices?`;
    }

    if (addBtn) {
      addBtn.textContent = `Add all ${count} to account`;
      addBtn.onclick = async () => {
        addBtn.disabled = true;
        addBtn.textContent = 'Syncing...';
        try {
          const store = getCreationStore();
          const items = store.getAllFull ? await store.getAllFull() : [];
          for (const item of items) {
            await store.save(item);
          }
          if ((store as any).flushPendingSync) {
            await (store as any).flushPendingSync();
          }
          localStorage.setItem(migrationKey, 'true');
          this.close();
        } catch (err) {
          console.error('Migration failed:', err);
          this.close();
        }
      };
    }

    if (dismissBtn) {
      dismissBtn.onclick = () => {
        localStorage.setItem(migrationKey, 'dismissed');
        this.close();
      };
    }

    this.isOpen = true;
    this.overlay.classList.add('visible');
  }

  public close() {
    this.isOpen = false;
    this.overlay.classList.remove('visible');
  }
}

let sharedMigrationSheet: MigrationSheet | null = null;

export function getMigrationSheet(): MigrationSheet {
  if (!sharedMigrationSheet) {
    sharedMigrationSheet = new MigrationSheet();
  }
  return sharedMigrationSheet;
}
