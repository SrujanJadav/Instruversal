import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

const AUTH_REDIRECT_KEY = 'instruversal:auth_redirect_route';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isCloudEnabled = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseInstance: SupabaseClient | null = null;
let cachedUser: User | null = null;
let cachedSession: Session | null = null;
const authListeners = new Set<(user: User | null) => void>();

if (isCloudEnabled) {
  try {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    });

    // Populate initial session
    supabaseInstance.auth.getSession().then(({ data }) => {
      cachedSession = data.session;
      cachedUser = data.session?.user ?? null;
      notifyListeners();
    });

    // Listen to changes
    supabaseInstance.auth.onAuthStateChange((_event, session) => {
      cachedSession = session;
      cachedUser = session?.user ?? null;
      notifyListeners();
    });
  } catch (err) {
    console.warn('Failed to initialize Supabase client:', err);
  }
}

function notifyListeners() {
  authListeners.forEach((fn) => {
    try {
      fn(cachedUser);
    } catch (err) {
      console.error('Auth listener error:', err);
    }
  });
}

export function getSupabase(): SupabaseClient | null {
  return supabaseInstance;
}

export function getCurrentUser(): User | null {
  return cachedUser;
}

export function getCurrentSession(): Session | null {
  return cachedSession;
}

export function onAuthStateChange(fn: (user: User | null) => void): () => void {
  authListeners.add(fn);
  fn(cachedUser);
  return () => authListeners.delete(fn);
}

/**
 * Initiates Google OAuth using PKCE. Saves current hash route in sessionStorage.
 */
export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  if (!supabaseInstance) {
    return { error: new Error('Cloud features are not configured.') };
  }

  try {
    const currentRoute = window.location.hash || '#/';
    sessionStorage.setItem(AUTH_REDIRECT_KEY, currentRoute);

    const { error } = await supabaseInstance.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * Sends a passwordless email magic link. Saves current hash route in sessionStorage.
 */
export async function signInWithMagicLink(email: string): Promise<{ error: Error | null }> {
  if (!supabaseInstance) {
    return { error: new Error('Cloud features are not configured.') };
  }

  try {
    const currentRoute = window.location.hash || '#/';
    sessionStorage.setItem(AUTH_REDIRECT_KEY, currentRoute);

    const { error } = await supabaseInstance.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    return { error };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * Signs the user out cleanly without refreshing the page or touching in-memory editor audio.
 */
export async function signOut(): Promise<{ error: Error | null }> {
  if (!supabaseInstance) return { error: null };
  try {
    const { error } = await supabaseInstance.auth.signOut();
    return { error };
  } catch (err: any) {
    return { error: err };
  }
}

/**
 * Handles incoming PKCE auth redirect ?code= parameter on boot.
 * Cleans the URL query parameter and restores the user's prior hash route.
 */
export async function handleAuthRedirect(): Promise<void> {
  if (!supabaseInstance || typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');

  if (code) {
    try {
      const { data, error } = await supabaseInstance.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        cachedSession = data.session;
        cachedUser = data.session.user;
        notifyListeners();
      }
    } catch (err) {
      console.warn('PKCE exchange error:', err);
    }

    // Clean URL query parameter (?code=...) without adding history entries
    url.searchParams.delete('code');
    const restoredRoute = sessionStorage.getItem(AUTH_REDIRECT_KEY) || url.hash || '#/';
    sessionStorage.removeItem(AUTH_REDIRECT_KEY);

    const cleanSearch = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
    const cleanUrl = `${url.pathname}${cleanSearch}${restoredRoute}`;
    const pageTitle = typeof document !== 'undefined' ? document.title : '';
    window.history.replaceState({}, pageTitle, cleanUrl);
  }
}
