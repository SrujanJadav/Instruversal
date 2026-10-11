import {
  getCurrentUser,
  getSupabase,
  signInWithGoogle,
  signInWithMagicLink,
  signOut,
  onAuthStateChange,
  isCloudEnabled,
} from '../auth/auth';

export class AccountSheet {
  private overlay: HTMLElement;
  private isOpen = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'account-overlay';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', 'Account and cloud sync');

    document.body.appendChild(this.overlay);

    this.bindEvents();
    onAuthStateChange(() => {
      if (this.isOpen) {
        this.render();
      }
    });
  }

  private bindEvents() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  public open() {
    this.isOpen = true;
    this.render();
    this.overlay.classList.add('open');
  }

  public close() {
    this.isOpen = false;
    this.overlay.classList.remove('open');
  }

  private render() {
    const user = getCurrentUser();

    if (!isCloudEnabled) {
      this.overlay.innerHTML = `
        <div class="account-sheet">
          <header class="account-header">
            <h2 class="account-title">Account</h2>
            <button type="button" class="account-close-btn" id="account-close-btn" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>
          <p class="account-desc">Cloud sync is not configured on this installation. All creations remain saved locally on your device.</p>
        </div>
      `;
      this.overlay.querySelector('#account-close-btn')?.addEventListener('click', () => this.close());
      return;
    }

    if (user) {
      // Signed in view
      const email = user.email || 'Signed in';
      this.overlay.innerHTML = `
        <div class="account-sheet">
          <header class="account-header">
            <h2 class="account-title">Account</h2>
            <button type="button" class="account-close-btn" id="account-close-btn" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>

          <div class="account-user-card">
            <span class="account-user-email">${email}</span>
            <span class="account-user-status">Cloud sync active</span>
          </div>

          <button type="button" class="account-btn" id="account-signout-btn">
            Sign out
          </button>

          <button type="button" class="account-btn account-btn-danger" id="account-delete-creations-btn">
            Delete all my cloud creations
          </button>

          <button type="button" class="account-btn account-btn-danger" id="account-delete-account-btn">
            Delete my account
          </button>

          <div class="account-footer-links">
            <button type="button" class="account-link-btn" id="account-privacy-btn">Privacy note (draft)</button>
          </div>
        </div>
      `;

      this.overlay.querySelector('#account-close-btn')?.addEventListener('click', () => this.close());

      this.overlay.querySelector('#account-signout-btn')?.addEventListener('click', async () => {
        await signOut();
        this.render();
      });

      this.overlay.querySelector('#account-delete-creations-btn')?.addEventListener('click', async () => {
        const confirmed = window.confirm('Delete all your creations from the cloud? Local creations on this device will not be deleted.');
        if (!confirmed) return;
        // Import dynamically to avoid cycles
        const { getCreationStore } = await import('../library/store');
        const store = getCreationStore();
        const list = await store.list();
        for (const meta of list) {
          await store.remove(meta.id);
        }
        window.alert('Cloud creations deleted.');
        this.close();
      });

      this.overlay.querySelector('#account-delete-account-btn')?.addEventListener('click', async () => {
        const confirmed = window.confirm('Are you sure you want to permanently delete your account? This action cannot be undone.');
        if (!confirmed) return;

        const supabase = getSupabase();
        let deleted = false;
        if (supabase) {
          try {
            const { error } = await supabase.functions.invoke('delete-account');
            if (!error) {
              deleted = true;
              await signOut();
              window.alert('Your account has been permanently deleted.');
              this.close();
            }
          } catch (err) {
            console.warn('Edge function deletion failed, falling back to mailto:', err);
          }
        }

        if (!deleted) {
          window.location.href = `mailto:support@instruversal.app?subject=Account Deletion Request (${encodeURIComponent(email)})&body=Please permanently delete my Instruversal account and all associated data for ${encodeURIComponent(email)}.`;
        }
      });

      this.overlay.querySelector('#account-privacy-btn')?.addEventListener('click', () => {
        this.showPrivacyModal();
      });

    } else {
      // Signed out view
      this.overlay.innerHTML = `
        <div class="account-sheet">
          <header class="account-header">
            <h2 class="account-title">Sign in</h2>
            <button type="button" class="account-close-btn" id="account-close-btn" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>

          <p class="account-desc">Keep your creations synced across your phone and computer. Or continue as a guest anytime.</p>

          <button type="button" class="account-btn" id="account-google-btn">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            <span>Continue with Google</span>
          </button>

          <div class="account-divider">or</div>

          <form id="account-magic-form" class="account-input-group">
            <label for="account-email-input" class="account-label">Email magic link</label>
            <input type="email" id="account-email-input" class="account-input" placeholder="name@example.com" required autocomplete="email" />
            <button type="submit" class="account-btn account-btn-primary" id="account-submit-btn">
              Send magic link
            </button>
          </form>

          <div class="account-message" id="account-msg"></div>

          <div class="account-footer-links">
            <span class="account-desc" style="font-size: 0.8rem;">No password needed.</span>
            <button type="button" class="account-link-btn" id="account-privacy-btn">Privacy note (draft)</button>
          </div>
        </div>
      `;

      this.overlay.querySelector('#account-close-btn')?.addEventListener('click', () => this.close());

      this.overlay.querySelector('#account-google-btn')?.addEventListener('click', async () => {
        const { error } = await signInWithGoogle();
        if (error) {
          this.showMessage(error.message, true);
        }
      });

      const form = this.overlay.querySelector<HTMLFormElement>('#account-magic-form');
      const emailInput = this.overlay.querySelector<HTMLInputElement>('#account-email-input');
      const submitBtn = this.overlay.querySelector<HTMLButtonElement>('#account-submit-btn');

      form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput?.value.trim();
        if (!email) return;

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sending…';
        }

        const { error } = await signInWithMagicLink(email);

        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send magic link';
        }

        if (error) {
          this.showMessage(error.message, true);
        } else {
          this.showMessage('Check your inbox for a sign-in link.', false);
          if (emailInput) emailInput.value = '';
        }
      });

      this.overlay.querySelector('#account-privacy-btn')?.addEventListener('click', () => {
        this.showPrivacyModal();
      });
    }
  }

  private showMessage(text: string, isError: boolean) {
    const el = this.overlay.querySelector<HTMLElement>('#account-msg');
    if (!el) return;
    el.textContent = text;
    el.className = `account-message visible ${isError ? 'error' : ''}`;
  }

  private showPrivacyModal() {
    const modal = document.createElement('div');
    modal.className = 'account-overlay open';
    modal.style.zIndex = '1200';
    modal.innerHTML = `
      <div class="account-sheet privacy-note-modal">
        <header class="account-header">
          <div>
            <span class="privacy-draft-badge">Draft for Review</span>
            <h2 class="account-title">Privacy Note</h2>
          </div>
          <button type="button" class="account-close-btn" id="privacy-close-btn" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <p class="account-desc"><strong>What we store:</strong> Your email address (to identify your account) and the musical sketches you choose to sync.</p>
        <p class="account-desc"><strong>What we never do:</strong> We do not sell your personal data, track your activity across websites, or serve ads.</p>
        <p class="account-desc"><strong>How to delete:</strong> You can delete all your creations anytime from the Account sheet, or request full account deletion.</p>
        <p class="account-desc" style="font-size: 0.8rem; color: var(--ink-soft);">Guest mode requires no email and stores all sketches purely within your browser storage.</p>

        <button type="button" class="account-btn account-btn-primary" id="privacy-done-btn">Done</button>
      </div>
    `;

    document.body.appendChild(modal);

    const dismiss = () => modal.remove();
    modal.querySelector('#privacy-close-btn')?.addEventListener('click', dismiss);
    modal.querySelector('#privacy-done-btn')?.addEventListener('click', dismiss);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) dismiss();
    });
  }
}

let sharedAccountSheet: AccountSheet | null = null;

export function getAccountSheet(): AccountSheet {
  if (!sharedAccountSheet) {
    sharedAccountSheet = new AccountSheet();
  }
  return sharedAccountSheet;
}
