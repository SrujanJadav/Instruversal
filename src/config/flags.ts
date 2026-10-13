/**
 * Feature flags for launch configuration.
 *
 * Rules:
 * - VITE_ENABLE_STUDIO: enabled only when exactly "true". Default false.
 * - VITE_ENABLE_GARDEN: ON by default (Owner Decision D1: Garden for launch: ON and NEVER OFF).
 *   Only off if explicitly set to "false".
 */

export const isStudioEnabled: boolean = import.meta.env.VITE_ENABLE_STUDIO === 'true';
export const isGardenFlagEnabled: boolean = import.meta.env.VITE_ENABLE_GARDEN !== 'false';

