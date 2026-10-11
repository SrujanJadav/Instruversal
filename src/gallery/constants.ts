/**
 * Animation and geometry constants for the 3D Circular Gallery.
 * All durations, easings and dimension tuning parameters are centralized here.
 */

export const GALLERY_CONSTANTS = {
  // Dimension & Geometry
  aspectRatio: 4 / 5, // Portrait card ratio (width / height)
  cardPhoneWidth: 560,
  cardPhoneHeight: 700,
  cardDesktopWidth: 700,
  cardDesktopHeight: 875,
  borderRadius: 0.045, // Rounded shader box SDF radius (0.03 to 0.05)
  bend: 2.8, // Curvature bend factor
  cameraFov: 45,
  cameraZ: 20,

  // Scrolling & Physics
  scrollSpeed: 1.8,
  scrollEase: 0.06, // Smooth ease factor (around 0.06 per spec)
  snapDebounceMs: 180,
  tapMaxDistancePx: 6,
  tapMaxDurationMs: 300,

  // Opening Gallery Animations
  startContentFadeDurationMs: 300,
  startContentSlideUpPx: 24,
  galleryTotalOpenDurationMs: 700,
  cardStaggerMs: 50, // Stagger per card outward from center
  captionFadeDelayMs: 150,

  // Opening Project from Gallery
  openProjectZoomDurationMs: 600,

  // Back to Start Page
  backAnimationDurationMs: 400,

  // Reduced motion fallback duration
  reducedMotionDurationMs: 150,

  // Cloth ripple
  rippleFrequencyX: 4.0,
  rippleFrequencyY: 2.0,
  rippleSpeedScale: 0.5,
  rippleBaseAmp: 0.08,
} as const;
