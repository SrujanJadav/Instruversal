# Instruversal

Instruversal is a draw-to-compose loop sequencer for desktop and phones. Draw strokes freely on a warm paper canvas, watch a playhead loop across your drawing, and hear your lines speak as musical tones and rhythms.

<!-- Screenshot placeholder -->
<!-- Replace with actual app screenshot at docs/screenshot.png -->
![Instruversal Screenshot](docs/screenshot.png)

---

## Features

- **Draw to Compose:** Normalized vector strokes adapt smoothly across screen sizes, device rotations, and high-DPI displays without distortion.
- **Flow & Notes Modes:** Play strokes either as sustained, pitch-bending instruments that track every curve or as rhythmic stepped notes.
- **Continuous Pitch Glide:** Expressive portamento and glissando with adjustable glide speed.
- **Per-Pigment Instruments:** Six dedicated tracks inspired by muted gouache pigments (Vermilion, Indigo, Ochre, Sage, Plum, Slate), each mapped to synthesizers, plucks, bells, brass, or pads.
- **Beat Tracks & Drum Lanes:** Dedicated 8-voice drum kit engine with 8 visual drum lanes, rhythm quantization, swing, humanization, and continuous Glide/Roll/Sweep beat flow modes.
- **Master Effects Rack:** 7-module studio chain featuring Soft Drive saturation, Sweeping Auto-Filter, 3-Band Parametric EQ, Dimension Chorus, Ping-Pong Delay, Lush Algorithmic Reverb, and Master Peak Limiter with one-tap presets.
- **Key & Scale Audition:** 12 root keys and 6 diatonic/pentatonic musical scales with interactive audio scale strips and chord auditions.
- **My Creations Library:** Device-local IndexedDB storage for sketches with auto-save, RDP-simplified live SVG thumbnails that recolor with light/dark themes, card duplication, and JSON backup export/import.
- **3D Circular Gallery:** Dynamic WebGL gallery powered by [OGL](https://github.com/oframe/ogl) on the start screen (#/load), presenting creations as colorful portrait cards on a curved arc with momentum physics and drag/swipe navigation.
- **Light & Dark Themes:** Tactile paper-and-ink light mode and inked-night dark mode with a sky-style sun/moon toggle, zero theme flash, and WCAG-compliant contrast.
- **Share Links & Autosave:** Share entire compositions via self-contained URL fragments with local backup autosave.
- **Mobile-First & Accessible:** 44px+ touch targets, hardware haptics, pointer events, screen wake lock during playback, and audio interruption handling.

---

## How It Works

The canvas functions as a tactile graphic score:
- **Horizontal Axis (X):** Represents musical time across the loop. The playhead traverses left to right synchronized strictly with the Web Audio clock.
- **Vertical Axis (Y):** Represents pitch quantized to your chosen musical scale (higher on canvas = higher pitch) or drum lane instruments in beat mode.
- **Colour:** Determines instrument voice and channel settings. Select a palette dot in the bottom toolbar to paint with a different instrument.

---

## Tech Stack

- **Runtime:** Vanilla TypeScript (strict mode, zero UI framework overhead)
- **Audio Engine:** [Tone.js](https://tonejs.github.io/) running on interactive low-latency Web Audio Context
- **Rendering:** HTML5 Canvas 2D with offscreen static layer caching and [OGL](https://github.com/oframe/ogl) for the 3D gallery
- **Styling:** Vanilla CSS with custom paper-and-ink design tokens
- **Build Tool:** [Vite](https://vitejs.dev/)

---

## Running Locally

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Setup

```bash
# Clone repository
git clone https://github.com/SrujanJadav/Instruversal.git
cd Instruversal

# Install dependencies
npm install

# Start development server
npm run dev
```

### Testing on a Phone

To test touch gestures and low-latency audio on a real mobile device connected to the same Wi-Fi network:

```bash
npm run dev -- --host
```

Open the displayed Network URL (e.g., `http://192.168.1.x:5173`) in Safari (iOS) or Chrome (Android).

### Other Scripts

```bash
# Run unit test suite
npm test

# Build production bundle
npm run build

# Preview production build locally
npm run preview
```

---

## Browser & Device Notes

- **Audio Gesture Requirement:** Browsers require a user interaction before Web Audio can output sound. Tap the "Tap to start" screen to wake the audio engine.
- **iOS Silent Switch:** On iPhones, ensure the physical silent switch on the side of the device is toggled off (or headphones are connected) for Web Audio playback.
- **Latency Calibration:** If hardware Bluetooth delay occurs, open the **Sync** button in the top bar to calibrate visual playhead compensation.

---

## Project Structure

```text
instruversal/
├── src/
│   ├── audio/              # Tone.js synthesis, drum engines, voice pooling, scales & FX
│   │   ├── context.ts      # Low-latency Web Audio setup & calibration
│   │   ├── drums.ts        # 8-voice drum kit synthesis & lane mapping
│   │   ├── effects.ts      # Master effects rack (Drive, Filter, EQ, Chorus, Delay, Reverb)
│   │   ├── instruments.ts  # Melodic synthesizer voices & presets
│   │   ├── lifecycle.ts    # Backgrounding, audio interruptions, and screen wake lock
│   │   ├── projectState.ts # URL hash serialization & localStorage autosave
│   │   ├── scales.ts       # Scale quantization & pitch transformations
│   │   ├── schedule.ts     # Loop transport & step scheduler
│   │   ├── tracks.ts       # Track channels, mute/solo & auditioning
│   │   └── voicePool.ts    # Polyphonic dynamic voice allocator for Flow mode
│   ├── canvas/             # Canvas 2D renderer & touch/pen pointer handlers
│   │   ├── eraser.ts       # Partial stroke circle intersection & geometry splitting
│   │   └── DrawingCanvas.ts# Offscreen static buffer, playhead & hit ripple animator
│   ├── gallery/            # 3D Circular Gallery on start page (#/load)
│   │   ├── CircularGallery.ts # Plain TypeScript & OGL 3D curved gallery component
│   │   ├── GalleryModal.ts # Route handler, opening/zoom animations & accessibility
│   │   ├── thumbnail.ts    # Bounding-box fitted portrait thumbnail canvas renderer
│   │   └── constants.ts    # Tunable animation timings, easings and physics
│   ├── library/            # Device-local IndexedDB creations library
│   │   ├── types.ts        # Creation, CreationMeta & CreationStore interfaces
│   │   ├── store.ts        # IndexedDB wrapper with in-memory fallback & quota handling
│   │   ├── manager.ts      # Active creation tracking & 800ms debounced autosave
│   │   ├── simplify.ts     # Ramer-Douglas-Peucker stroke simplification for previews
│   │   └── validator.ts    # Untrusted data validation, clamping & instrument fallback
│   ├── styles/             # Design tokens, typography & component styles
│   │   ├── tokens.css      # Paper, ink, and gouache pigment palette variables
│   │   ├── base.css        # Reset, typography, paper grain & focus outlines
│   │   ├── app.css         # Layout, toolbar dock, panels & responsiveness
│   │   ├── library.css     # My creations library modal & card grid styling
│   │   ├── gallery.css     # 3D circular gallery screen & load button styling
│   │   └── theme-toggle.css# Sky theme switch animations and geometry
│   ├── ui/                 # Accessible DOM components & dialog sheets
│   │   ├── Library.ts      # Library screen with SVG thumbnails & 3-dot management
│   │   ├── FxPanel.ts      # Master effects drawer
│   │   ├── SyncSettingsPill.ts # Audio latency calibration popup
│   │   ├── ThemeToggle.ts  # Sky theme switch controller
│   │   ├── Toolbar.ts      # Bottom control dock with grouped controls
│   │   ├── TrackPanel.ts   # Mixer & Key/Scale audition sheet
│   │   ├── haptics.ts      # Tactile vibration triggers
│   │   └── theme.ts        # Dynamic theme engine & token cache
│   ├── config.ts           # Global application configuration
│   ├── main.ts             # Application bootstrapper
│   └── state.ts            # Reactive application state & event bus
├── index.html              # HTML entry point with zero-flash theme bootstrap
├── package.json
└── tsconfig.json
```

---

## Credits & Acknowledgements

- Inspired by the exploratory design of the `play_music_theory` web application by **Tala Rae Schlossberg**.
- Audio engine powered by [Tone.js](https://tonejs.github.io/).
- 3D gallery graphics powered by [OGL](https://github.com/oframe/ogl).
- Circular gallery concept adapted to vanilla TypeScript & OGL from community component. *(Note: If you have author or license details, please submit an issue or pull request to update attribution).*
- Typography set in **Fraunces**, **Instrument Sans**, and **DM Mono** via Google Fonts.
- Sky-style theme toggle component adapted from community component. *(Note: If you have author or license details, please submit an issue or pull request to update attribution).*

---

## License

This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.
