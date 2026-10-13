import { events } from '../state';

export type Theme = 'light' | 'dark';

export interface ThemeTokens {
  theme: Theme;
  paper: string;
  paperDeep: string;
  ink: string;
  inkSoft: string;
  line: string;
  lineRoot: string;
  lineSubtle: string;
  vermilion: string;
  indigo: string;
  ochre: string;
  sage: string;
  plum: string;
  slate: string;
}

const THEME_STORAGE_KEY = 'instruversal:theme';

let currentTheme: Theme = 'light';
let cachedTokens: ThemeTokens | null = null;
let isInitialized = false;

function resolveComputedTokens(theme: Theme): ThemeTokens {
  const isDark = theme === 'dark';

  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
    return {
      theme,
      paper: isDark ? '#1A1814' : '#F3ECDD',
      paperDeep: isDark ? '#23201A' : '#E9DFCB',
      ink: isDark ? '#EDE5D3' : '#1C1A16',
      inkSoft: isDark ? '#A39B88' : '#5B554A',
      line: isDark ? 'rgba(237, 229, 211, 0.14)' : 'rgba(28, 26, 22, 0.14)',
      lineRoot: isDark ? 'rgba(237, 229, 211, 0.14)' : 'rgba(28, 26, 22, 0.14)',
      lineSubtle: isDark ? 'rgba(237, 229, 211, 0.04)' : 'rgba(28, 26, 22, 0.04)',
      vermilion: isDark ? '#E5573D' : '#D2432A',
      indigo: isDark ? '#7F92E0' : '#2E3F8F',
      ochre: isDark ? '#E0AC3F' : '#D49A2A',
      sage: isDark ? '#5FA386' : '#3F7A63',
      plum: isDark ? '#A8609A' : '#7A3A66',
      slate: isDark ? '#8593A3' : '#4A5560',
    };
  }

  const computed = window.getComputedStyle(document.documentElement);
  const getVar = (name: string, fallback: string) => {
    const val = computed ? computed.getPropertyValue(name).trim() : '';
    return val || fallback;
  };

  return {
    theme,
    paper: getVar('--paper', isDark ? '#1A1814' : '#F3ECDD'),
    paperDeep: getVar('--paper-deep', isDark ? '#23201A' : '#E9DFCB'),
    ink: getVar('--ink', isDark ? '#EDE5D3' : '#1C1A16'),
    inkSoft: getVar('--ink-soft', isDark ? '#A39B88' : '#5B554A'),
    line: getVar('--line', isDark ? 'rgba(237, 229, 211, 0.14)' : 'rgba(28, 26, 22, 0.14)'),
    lineRoot: isDark ? 'rgba(237, 229, 211, 0.14)' : 'rgba(28, 26, 22, 0.14)',
    lineSubtle: isDark ? 'rgba(237, 229, 211, 0.04)' : 'rgba(28, 26, 22, 0.04)',
    vermilion: getVar('--vermilion', isDark ? '#E5573D' : '#D2432A'),
    indigo: getVar('--indigo', isDark ? '#7F92E0' : '#2E3F8F'),
    ochre: getVar('--ochre', isDark ? '#E0AC3F' : '#D49A2A'),
    sage: getVar('--sage', isDark ? '#5FA386' : '#3F7A63'),
    plum: getVar('--plum', isDark ? '#A8609A' : '#7A3A66'),
    slate: getVar('--slate', isDark ? '#8593A3' : '#4A5560'),
  };
}

export function getTheme(): Theme {
  return currentTheme;
}

export function getThemeTokens(): ThemeTokens {
  if (!cachedTokens) {
    cachedTokens = resolveComputedTokens(currentTheme);
  }
  return cachedTokens;
}

export function getTrackThemeColor(trackId: string): string {
  const tokens = getThemeTokens();
  switch (trackId) {
    case 'track-1':
      return tokens.vermilion;
    case 'track-2':
      return tokens.indigo;
    case 'track-3':
      return tokens.ochre;
    case 'track-4':
      return tokens.sage;
    case 'track-5':
      return tokens.plum;
    case 'track-6':
      return tokens.slate;
    default:
      return tokens.vermilion;
  }
}

export function setTheme(theme: Theme, isManualUserChoice: boolean = true): void {
  currentTheme = theme;

  if (typeof document !== 'undefined') {
    // If user changed manually and not reduced motion, activate 250ms page fade transition
    const prefersReducedMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isInitialized && !prefersReducedMotion) {
      document.documentElement.classList.add('theme-transitioning');
      window.setTimeout(() => {
        document.documentElement.classList.remove('theme-transitioning');
      }, 260);
    }

    document.documentElement.setAttribute('data-theme', theme);

    // Update <meta name="theme-color">
    const metaTheme = document.getElementById('meta-theme-color') || document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#1A1814' : '#F3ECDD');
    }
  }

  if (isManualUserChoice) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }

  // Refresh cached tokens
  cachedTokens = resolveComputedTokens(theme);

  // Dispatch standard themechange event for canvas and UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('themechange', {
        detail: { theme, tokens: cachedTokens },
      })
    );
  }

  events.emit('theme:change', theme);
}

export function toggleTheme(): Theme {
  const nextTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(nextTheme, true);
  return nextTheme;
}

export function initTheme(): void {
  if (isInitialized) return;
  isInitialized = true;

  // Determine current active theme
  let initialTheme: Theme = 'light';
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (saved === 'dark' || saved === 'light') {
      initialTheme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      initialTheme = 'dark';
    }
  } catch {}

  // Apply without transition on initial load
  setTheme(initialTheme, false);

  // Listen to system theme changes only when user has not chosen manually
  if (window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    mql.addEventListener('change', (e) => {
      try {
        if (!localStorage.getItem(THEME_STORAGE_KEY)) {
          setTheme(e.matches ? 'dark' : 'light', false);
        }
      } catch {}
    });
  }
}
