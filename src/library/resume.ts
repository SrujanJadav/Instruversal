export const RESUME_STORAGE_KEY = 'instruversal:resume';

export const THIRTY_MINUTES_MS = 30 * 60 * 1000;
export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface StoredResumeData {
  id: string;
  title: string;
  timestamp: number;
  returnedFromSession?: boolean;
}

export interface CreationSummary {
  id: string;
  title: string;
  updatedAt: number;
  strokesCount?: number;
}

/**
 * Pure helper: Determines if a resume timestamp is still valid.
 * - In an active session after returning to start page: valid for up to 30 minutes.
 * - On a fresh visit: valid if last edited within 24 hours.
 */
export function isResumeTimestampValid(
  timestamp: number,
  isFreshVisit: boolean,
  now: number = Date.now()
): boolean {
  if (!timestamp || isNaN(timestamp)) return false;
  const elapsed = now - timestamp;
  if (elapsed < 0) return false;

  const maxAllowed = isFreshVisit ? TWENTY_FOUR_HOURS_MS : THIRTY_MINUTES_MS;
  return elapsed <= maxAllowed;
}

/**
 * Reads stored resume target from localStorage (instruversal:resume).
 */
export function getStoredResumeData(): StoredResumeData | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RESUME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.title !== 'string') {
      return null;
    }
    return {
      id: parsed.id,
      title: parsed.title,
      timestamp: Number(parsed.timestamp) || 0,
      returnedFromSession: Boolean(parsed.returnedFromSession),
    };
  } catch {
    return null;
  }
}

/**
 * Writes stored resume target to localStorage (instruversal:resume).
 */
export function setStoredResumeData(
  id: string,
  title: string,
  returnedFromSession: boolean = true,
  timestamp: number = Date.now()
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const data: StoredResumeData = {
      id,
      title: title.trim() || 'Untitled sketch',
      timestamp,
      returnedFromSession,
    };
    localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Clears stored resume target from localStorage.
 */
export function clearStoredResumeData(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(RESUME_STORAGE_KEY);
  } catch {}
}

/**
 * Resolves the active resume target:
 * 1. Checks stored session data (valid for 30m after returning).
 * 2. On a fresh visit, checks stored data or the most recent creation edited within 24 hours.
 */
export function resolveActiveResumeTarget(
  recentCreations: CreationSummary[],
  isFreshVisit: boolean,
  now: number = Date.now()
): { id: string; title: string } | null {
  const stored = getStoredResumeData();

  if (stored) {
    const isSessionReturn = Boolean(stored.returnedFromSession);
    const isValid = isResumeTimestampValid(
      stored.timestamp,
      isFreshVisit && !isSessionReturn,
      now
    );
    if (isValid) {
      if (isSessionReturn) {
        // Active session return within 30 minutes
        const match = recentCreations.find((c) => c.id === stored.id);
        return { id: stored.id, title: (match && match.title) || stored.title };
      }
      // Fresh visit with stored resume key
      if (recentCreations.length > 0) {
        const exists = recentCreations.find((c) => c.id === stored.id);
        if (exists && (exists.strokesCount === undefined || exists.strokesCount > 0)) {
          return { id: exists.id, title: exists.title || stored.title };
        }
      } else {
        return { id: stored.id, title: stored.title };
      }
    }
  }

  // On a fresh visit, check if the latest creation was edited in the last 24 hours and has strokes
  if (isFreshVisit && recentCreations.length > 0) {
    const latest = recentCreations[0];
    if (latest.updatedAt && (now - latest.updatedAt) <= TWENTY_FOUR_HOURS_MS) {
      if (latest.strokesCount === undefined || latest.strokesCount > 0) {
        return { id: latest.id, title: latest.title };
      }
    }
  }

  return null;
}
