# Instruversal: Build Prompt Pack

A draw-to-music loop sequencer for desktop and phone. Draw on a canvas, a playhead loops across it, and your strokes become music.

**Working name:** Instruversal (change it in one place: `src/config.ts`)
**Stack:** Vite + TypeScript + Tone.js, plain Canvas 2D, plain CSS. No UI framework.

---

## How to use this file

1. Open an empty folder in your coding agent (Antigravity / Cursor / Claude Code / whichever you use).
2. Paste **Prompt 0 (Project Rules)** first. If your tool has a "rules" or "project instructions" file, save it there (for example `AGENTS.md` or `.rules`) so it is read on every task.
3. Run the prompts **one at a time, in order**. Never paste two steps together.
4. After each step: run `npm run dev`, do the **Test it** checklist in the browser (and on your real phone), fix problems, then **commit** using the suggested message.
5. If a step breaks something, do not move on. Use the **Fix prompts** at the bottom.
6. Do not skip Step 12. That is the pass that removes the "AI made this" feel.

Tip for testing on your phone: run `npm run dev -- --host`, open the shown network URL on a phone connected to the same Wi-Fi. Note: audio on phones only starts after a tap.

---

## Design direction (decided once, used everywhere)

Default look: **warm paper and ink**. Calm, tactile, hand-made, the opposite of neon-dashboard AI style.
If you prefer a dark glowing look instead, tell the agent in Prompt 0 to swap the "Palette" section for a dark one and keep everything else the same.

---

## PROMPT 0: Project Rules (paste first, keep forever)

```text
You are a senior front-end engineer and a careful designer building "Instruversal", a draw-to-music web app. A user draws strokes on a canvas, a vertical playhead loops left to right, and the strokes play as notes. It must work great on desktop and on phones.

WORKING RULES
- Build in small steps. Only do what the current step asks. Do not add features I did not request.
- After each step, tell me in 3-6 lines: what you built, how to test it, and what you deliberately did NOT do yet.
- Keep code simple, typed (strict TypeScript), and split into small modules. No giant files. No unnecessary dependencies. Dependencies allowed: vite, typescript, tone.
- Never use localStorage keys without a prefix "instruversal:".
- Prefer boring, reliable solutions over clever ones.

ARCHITECTURE (must hold in every step)
- Strokes are stored as vectors in NORMALIZED coordinates (x and y between 0 and 1), never as pixels. Resizing or rotating the phone must never break a drawing.
- The audio clock (Tone.Transport) is the single source of timing. Notes are scheduled ahead of time through Tone.Part or Tone.Loop. The visual playhead is only DRAWN from Tone.Transport progress. Never trigger sound from requestAnimationFrame.
- Audio code, drawing code, and UI code live in separate modules and talk through a small typed state/event layer.
- Use Pointer Events only (no separate mouse/touch handlers). The canvas has touch-action: none.
- Scale the canvas with devicePixelRatio so lines are crisp on phones. Redraw on resize and orientation change.
- Audio must only start after a user gesture (Tone.start()). Handle iOS Safari.

DESIGN SYSTEM
Palette (CSS variables, use only these):
  --paper: #F3ECDD;  --paper-deep: #E9DFCB;  --ink: #1C1A16;  --ink-soft: #5B554A;
  --line: rgba(28,26,22,0.14)
  Track pigments (muted, like gouache): 
  --vermilion: #D2432A;  --indigo: #2E3F8F;  --ochre: #D49A2A;  --sage: #3F7A63;  --plum: #7A3A66;  --slate: #4A5560
Typography: display font "Fraunces" (headings, name, big numbers), UI font "Instrument Sans" (labels, buttons), "DM Mono" for BPM and tiny readouts. Load from Google Fonts with display=swap and sensible fallbacks.
Surface: warm paper background with a very subtle grain overlay (SVG noise, 3-5% opacity). Hairline borders. Corners vary: small radii (4-8px), not the same big radius everywhere.
Strokes: round caps, slight width variation by pointer pressure or speed, smoothed with quadratic curves. They should look like brush or ink, not CAD lines.
Motion: short and purposeful (120-250ms ease-out). Playhead is a thin ink line with a faint soft trail. When it crosses a stroke, a small ring ripple appears at the hit point and the stroke briefly brightens. No bouncing, no confetti, no parallax.
Layout: the canvas is the hero and takes about 80% of the screen. Controls live in a slim toolbar (bottom on phones, a left rail or top bar on desktop). Touch targets at least 44px.

THINGS THAT MAKE APPS LOOK "AI-GENERATED". DO NOT DO ANY OF THESE
- No purple/blue gradients, no gradient text, no glassmorphism/blur cards, no glowing neon shadows.
- No emoji used as icons. Use a small set of custom inline SVG icons drawn with consistent 1.5px strokes, or plain text labels.
- No "card inside a card inside a card". No centered hero with a big gradient and two buttons.
- No generic copy like "Welcome to your music journey" or "Unleash your creativity". Write short, specific, human microcopy (examples: "Draw to compose", "Tap to wake the sound", "Nothing here yet. Draw something.").
- No identical 16px rounded corners on everything, no heavy drop shadows, no everything-centered layout.
- No more than the six pigments plus ink and paper. No random extra colours.
- No placeholder lorem ipsum, no fake stats, no filler sections.
- Do not add a marketing landing page. The app IS the first screen.

QUALITY BAR
- Works in latest Chrome, Safari (iOS), Firefox. Smooth at 60fps on a mid-range phone.
- Accessible basics: visible focus states, aria-labels on icon buttons, respect prefers-reduced-motion, sufficient contrast.
- No console errors or warnings.

Confirm you understood these rules in 5 lines or fewer, then wait for my first step.
```

---

## PROMPT 1: Project setup and the "tap to start" gate

```text
Step 1. Set up the project.

1. Create a Vite + TypeScript project (vanilla, no framework) in the current folder. Install tone.
2. Folder structure:
   src/
     main.ts
     config.ts          (app name, default BPM, loop bars, constants)
     state.ts           (typed app state + tiny event emitter)
     audio/             (empty for now, add a README comment)
     canvas/            (empty for now)
     ui/                (empty for now)
     styles/
       tokens.css       (all CSS variables from the design system)
       base.css         (reset, body, paper grain, typography)
       app.css
3. Add the Google Fonts (Fraunces, Instrument Sans, DM Mono) in index.html with preconnect and display=swap.
4. Build only this screen: full-viewport paper background with grain, the app name in Fraunces, one line of microcopy, and a single button "Tap to start". Use viewport meta with viewport-fit=cover and respect safe-area insets.
5. On click or tap, call Tone.start(), then reveal an empty main area (just a placeholder rectangle for the future canvas) and play one soft test note to confirm audio works.
6. Add a .gitignore, a short README with run instructions, and set the page title and theme-color.

Do not build drawing, scales, or controls yet.
```

**Test it:** Opens without errors. Fonts load. Tap plays one note on desktop and on your phone. Layout fits a phone screen with no sideways scroll.
**Commit:** `chore: scaffold vite+ts, design tokens, audio start gate`

---

## PROMPT 2: Responsive canvas and vector drawing

```text
Step 2. Build the drawing engine. No sound yet.

1. Create src/canvas/DrawingCanvas.ts. It owns a <canvas> that fills its container and handles devicePixelRatio, ResizeObserver, and orientation change without losing data.
2. Data model (in state.ts or a types file):
   type Pt = { x: number; y: number; t: number }  // x,y normalized 0..1, t = ms since stroke start
   type Stroke = { id: string; trackId: string; points: Pt[]; width: number }
3. Use Pointer Events with setPointerCapture. Support mouse, touch, and stylus. canvas has touch-action: none. Prevent page scroll and pull-to-refresh while drawing. Ignore multi-touch gestures after the first pointer.
4. Record strokes as normalized points. Thin out points that are too close together. Smooth rendering with quadratic curves between midpoints. Vary line width a little with pointer pressure when available, otherwise with speed.
5. Draw in the currently selected track colour (for now hardcode vermilion).
6. Keep a strokes array in state and a full redraw function so resize re-renders perfectly.
7. Add faint horizontal guide lines and soft vertical beat markers behind the strokes (placeholders, style them in --line colour).

Do not add playback, scales, or the toolbar yet.
```

**Test it:** Draw with mouse and with finger. Rotate the phone or resize the window. The drawing stays in place and stays sharp. Page does not scroll while drawing.
**Commit:** `feat: responsive canvas with normalized vector strokes`

---

## PROMPT 3: Scales and pitch mapping

```text
Step 3. Add musical scale logic as a pure, tested module. No playback loop yet.

1. Create src/audio/scales.ts with:
   - SCALES: major pentatonic, minor pentatonic, major, natural minor, dorian, mixolydian (as semitone interval arrays).
   - buildScaleNotes(root: number, scaleName, lowOctave, highOctave): number[]  // MIDI notes
   - yToMidi(yNormalized: number, notes: number[]): number   // top = high pitch, snaps to the nearest valid note
   - midiToFreq / midiToNoteName helpers.
2. Default: C major pentatonic, 3 octaves (C3 to C6).
3. Write small unit tests (Vitest) for yToMidi edge cases (y=0, y=1, middle) and for scale building.
4. On the canvas, render horizontal pitch guide lines at each scale note. Make root notes slightly stronger than others. Show a note name label (tiny, DM Mono, ink-soft) on the left edge for root notes only.
5. As the user draws, show a small floating readout of the note under the pointer (for example "E4"), and play that note briefly with a simple Tone.Synth as live preview. Throttle it so it does not spam.

Do not add the loop or the instrument bank yet.
```

**Test it:** Drawing high gives high notes, low gives low. Only scale notes ever sound. Tests pass.
**Commit:** `feat: scale quantization, pitch guides, live note preview`

---

## PROMPT 4: Instrument bank and tracks

```text
Step 4. Build the instrument bank and the track system.

1. Create src/audio/instruments.ts exporting a registry of instruments. Each instrument is a factory returning an object { id, name, triggerNote(midi, duration, time, velocity), dispose(), output }. Build these 7 using Tone.js only (no sample downloads):
   - Pluck (triangle + fast decay, slight lowpass)
   - Bell (FM synth, harmonicity ~2.76, short high-pass tail)
   - Marimba (sine + short envelope + subtle body resonance)
   - Soft Pad (filtered sawtooth, slow attack, long release)
   - Warm Keys (FM electric-piano style)
   - Kalimba (plucky sine/triangle blend, bright and short)
   - Sub Bass (sine + low saw, mono, short)
2. Each instrument must be polyphonic where it makes sense (use PolySynth with a voice limit of 6-8 to protect phone CPU).
3. Create src/audio/tracks.ts. A Track = { id, colorVar, instrumentId, muted, solo, volume }. Create 6 default tracks, one per pigment colour, each with a different default instrument. Route tracks through a shared master chain: Tone.Gain -> light reverb -> Tone.Limiter -> destination. Keep reverb subtle.
4. State: selectedTrackId. Strokes already carry trackId. Draw each stroke in its track's colour.
5. For now add a TEMPORARY row of 6 colour dots above the canvas to switch tracks (the real toolbar comes later). Tapping a dot also plays a short sample phrase of that track's instrument so the user can hear it.

Do not build the transport or loop yet.
```

**Test it:** Each colour sounds clearly different. No clipping when tapping fast. Phone does not stutter.
**Commit:** `feat: instrument bank, tracks, master chain`

---

## PROMPT 5: Transport, scheduling, playhead

```text
Step 5. Make the loop play. This is the core of the app, so be careful.

1. Create src/audio/transport.ts wrapping Tone.Transport. Config: BPM (default 90), loop length in bars (default 2, 4/4 time), so loop duration = bars * 4 beats.
2. Event generation (src/audio/schedule.ts): convert strokes into note events and schedule them. Do NOT check intersections per frame. Algorithm:
   - Divide the loop into a grid of 16th-note steps across the canvas width.
   - For each stroke, for each grid step whose x position falls within the stroke's x-range, find the stroke's y at that x by linear interpolation along its segments, then yToMidi to get the note. Time = step position in the loop.
   - Near-vertical strokes: many y values share one x. Handle by sampling up to N notes (default 4) across the y-range at that step, as a quick strum (stagger by about 25ms) so it sounds like a chord or harp.
   - Per track, enforce a minimum gap between notes (about 60ms) and de-duplicate identical pitches in the same step.
   - Velocity from stroke width or pressure, with small natural variation.
   - Note duration: until the next event of the same stroke or one step, whichever is shorter.
3. Use Tone.Part (or Tone.Loop) with loop=true and loopEnd = loop duration. Rebuild the Part whenever strokes, scale, or tracks change, without audio glitches or restarting the transport if it is running (use a short debounce).
4. Playhead: in requestAnimationFrame, read Transport progress and draw the playhead at x = progress * canvasWidth. Style: thin ink line with a soft fading trail. Never trigger audio here.
5. When a scheduled note fires, push a UI event (via Tone.Draw so it syncs to the audio clock) containing x,y so the canvas can show a hit ripple at that point and brighten the stroke for about 200ms.
6. Temporary Play/Pause button. Respect that the audio context only starts after the first gesture.

Do not build the full toolbar yet.
```

**Test it:** Draw a line, press play, hear it loop in steady time with the playhead matching what you hear. Tempo does not drift after a minute. Vertical lines strum, not machine-gun.
**Commit:** `feat: tone transport, scheduled note events, playhead and hit ripples`

---

## PROMPT 6: Real controls (play/pause, BPM, undo/redo, eraser, clear)

```text
Step 6. Replace the temporary controls with the real toolbar.

1. Create src/ui/Toolbar.ts. Layout: bottom bar on phones (max-width 720px), left rail or top bar on desktop. Include:
   - Play/Pause (large, the most prominent control)
   - BPM control: a tactile slider or a stepper with a DM Mono readout (range 50-180). Changing BPM while playing must not break timing.
   - Undo and Redo (history stack of stroke operations, with keyboard shortcuts Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z)
   - Eraser mode: drag across the canvas to remove strokes the pointer touches (hit-test against stroke segments with a tolerance)
   - Clear all, with a confirmation that is NOT a browser alert (a small inline "Sure? Yes / No" state on the button)
   - Space bar toggles play on desktop
2. Icons: simple custom inline SVGs, 1.5px stroke, consistent grid. Each button has an aria-label and a visible focus ring. Active state is clear but not loud.
3. Remove the temporary colour dots and temporary play button.
4. Make sure the toolbar never covers the drawing area when the phone keyboard or browser bars show, and respects safe-area insets.

Keep copy minimal. Prefer short labels or icons, no tooltips that block touch.
```

**Test it:** Undo and redo work repeatedly. Eraser removes the right strokes. BPM changes smoothly while playing. Bottom bar is comfortable with one thumb.
**Commit:** `feat: toolbar with play, bpm, undo/redo, eraser, clear`

---

## PROMPT 7: Your touch-ups. Per-colour instrument, scale, mute and solo

```text
Step 7. Add the signature features.

1. Track panel (src/ui/TrackPanel.ts): a compact row or drawer of the 6 tracks. Each shows its pigment dot, instrument name, a mute toggle, a solo toggle, and a small volume control. Tapping a track selects it for drawing. Selected state is clear.
2. Instrument change: long-press or tap a small chevron on a track to open an instrument picker listing all 7 instruments with a tiny audition (tap to hear). Choosing an instrument swaps the track's instrument live, without stopping the loop and without hanging notes. Dispose the old instrument safely.
3. Scale and root: add a "Key" control with a root note selector (C to B) and a scale picker (the six scales from Step 3). Changing key must re-quantize existing strokes' pitches live (strokes keep their Y position, pitches are recomputed) and update the pitch guides on canvas.
4. Mute and solo logic: solo overrides mute, multiple solos allowed, state is visually obvious.
5. On phones, the track panel and key picker open as a bottom sheet that can be dismissed by tapping outside or swiping down. On desktop they sit in a side panel. The sheet must not block the playhead view completely, so keep the canvas visible above it.
6. All changes must be undoable where it makes sense (instrument change and key change are not required to be in undo; stroke edits are).
```

**Test it:** Change a colour from Pluck to Pad mid-loop with no click, glitch, or stuck sound. Change key and the drawing re-pitches. Mute and solo behave like a real mixer.
**Commit:** `feat: per-track instruments, key/scale picker, mute/solo, mobile sheets`

---

## PROMPT 8: Visual life and feedback

```text
Step 8. Polish the visual feedback, tastefully.

1. Hit effects: a small ring ripple (stroke only, no fill) in the track colour at each hit point, expanding about 24px and fading over 400ms. Strokes brighten and thicken about 15% for 200ms when hit. Respect prefers-reduced-motion by reducing to a simple opacity flash.
2. Playhead trail: faint fading band behind the playhead, 3% to 8% of canvas width, using ink at low opacity.
3. Empty state: when there are no strokes, show a single quiet line of text in the middle of the canvas ("Draw something. Anything.") with a hand-drawn style squiggle arrow, drawn as an SVG path. It disappears on first stroke.
4. Idle state: when paused, strokes sit calm. When playing, subtle life only at hits. No constant animation elsewhere.
5. Performance: batch canvas drawing, cache static layers (guides and strokes) to an offscreen canvas and only redraw the dynamic layer (playhead and ripples) per frame. Make sure 40+ strokes still run at 60fps on a phone.
6. Add a small note readout near the playhead hit (for example "G4") that fades quickly. Make it optional via a toggle in a small settings menu.
```

**Test it:** Feels alive when notes hit, calm otherwise. Smooth on your phone with many strokes.
**Commit:** `feat: hit ripples, playhead trail, empty state, layered rendering`

---

## PROMPT 9: Mobile polish

```text
Step 9. Make the phone experience excellent.

1. Test and fix layout in portrait and landscape. In landscape, the toolbar moves to a side rail so the canvas keeps maximum height.
2. Prevent accidental browser gestures: pull-to-refresh, double-tap zoom, text selection, long-press context menus on the canvas and buttons. Keep pinch zoom of the page disabled only on the canvas area, not site-wide accessibility.
3. Add haptic feedback with navigator.vibrate(8) on play/pause and on track select, only where supported and only if the user has not enabled reduced motion.
4. Add a one-time small hint on first launch that explains the three core ideas in three short lines (left to right is time, up and down is pitch, colour is instrument). It is dismissible, appears once (remember in localStorage with the instruversal: prefix), and can be reopened from a small "How it works" link.
5. Show a gentle note if the iPhone ringer switch may be muting audio ("No sound? Check your silent switch.") shown once after the first play.
6. Check touch target sizes (44px minimum), text sizes (16px minimum for inputs), and that nothing overlaps at 360px width.
```

**Test it:** On a real phone, in both orientations, everything is reachable with one hand. No accidental zoom, scroll, or selection.
**Commit:** `feat: mobile polish, gestures, haptics, first-run hint`

---

## PROMPT 10: Save, share, export

```text
Step 10. Persistence and sharing.

1. Autosave the whole project (strokes, tracks, instruments, key, scale, bpm, loop length) to localStorage under "instruversal:project" with a version field and a safe migration path. Restore on load, with a "Start fresh" action.
2. Share link: compress the project (strokes simplified to fewer points, coordinates rounded to 3 decimals) and encode it in the URL hash so no backend is needed. Opening a shared link loads the drawing and shows a "Play" prompt (audio still needs a tap). Add a "Copy link" button with a small inline "Copied" confirmation. Warn gracefully if the link would be too long and offer to simplify further.
3. Export a short WAV or WebM of one loop using Tone.Recorder, with a clear download button. Name the file like "instruversal-90bpm-2026-10-11".
4. Add a loop length option (1, 2, 4 bars) in settings. Changing it must keep strokes scaled sensibly because x is normalized.

Keep the UI for these inside a small Share / Save menu, not as loud buttons.
```

**Test it:** Refresh and your drawing is still there. Send a link to your phone and it loads the same piece. Export plays back correctly.
**Commit:** `feat: autosave, share link, audio export, loop length`

---

## PROMPT 11: PWA and deployment

```text
Step 11. Make it installable and ship it.

1. Add a web app manifest (name, short_name, theme_color paper, background_color paper, display standalone, orientation any) and generate simple, tasteful icons: an ink brushstroke curving into a sound wave, on paper background. Draw them as SVG then export PNGs at 192 and 512 plus a maskable version.
2. Add a minimal service worker (vite-plugin-pwa or hand-written) that caches the app shell so it works offline after the first load. Do not cache in a way that traps old versions: show a small "New version ready, reload" notice.
3. Meta tags: description, Open Graph title and description, a clean OG image (1200x630) that shows the app name over paper texture and a few brush strokes.
4. Make a production build, check the bundle size, and report it. Lazy-load anything heavy.
5. Give me exact steps to deploy to Vercel or Netlify (connect the Git repo, build command, output folder) and a checklist to test the deployed URL on a phone, including "Add to Home Screen".
```

**Test it:** Lighthouse PWA and performance pass. Installs to the phone home screen. Works with airplane mode after first load.
**Commit:** `feat: pwa, offline shell, meta tags, deploy config`

---

## PROMPT 12: The "doesn't look AI-made" audit (do not skip)

```text
Step 12. Do a critical design and quality audit of the whole app. Do not add features. Review the real code and the running UI, then fix issues you find.

A. DESIGN AUDIT. Check each item and fix violations:
   1. Is there any gradient, glow, blur card, or glassmorphism? Remove it.
   2. Are all colours only from the design tokens? Remove stray colours.
   3. Are there emoji icons or inconsistent icon styles? Replace with the consistent SVG set.
   4. Are corner radii and spacing consistent but not uniformly bubbly? Use a deliberate scale (for example 4, 8, 12) and a spacing scale (4, 8, 12, 16, 24, 32).
   5. Is typography clear? Fraunces only for the name and big moments, Instrument Sans for UI, DM Mono for numbers. Check sizes, weights and line heights.
   6. Is every piece of copy short, specific, and human? Rewrite anything generic.
   7. Is the canvas clearly the hero on both phone and desktop?
   8. Are hover, focus, active and disabled states designed for every control?

B. FEEL AUDIT.
   1. Do interactions respond within 100ms? Does anything stutter on a mid-range phone?
   2. Are the instrument sounds balanced against each other (similar loudness)? Adjust gains.
   3. Is reverb and master level safe (no clipping with all 6 tracks busy)?
   4. Does the app handle edge cases: very short strokes, one-point taps, thousands of points, rapid undo spam, switching instrument during playback, tab going to background and returning, phone locking?

C. CODE AUDIT.
   1. Remove dead code and console logs. Fix type holes (no "any").
   2. Check that no audio is triggered from animation frames and no Tone nodes leak (dispose on removal).
   3. Make sure every listener added is removed when needed.

Output a table: issue, where, fix applied. Then list 5 small remaining improvements I could do later, ranked by impact.
```

**Test it:** Hand the phone to a friend and see whether they figure it out in 10 seconds without being told.
**Commit:** `chore: design, feel and code audit fixes`

---

## Fix prompts (use these when something goes wrong)

**Audio is silent on phone**
```text
Audio is silent on my phone but works on desktop. Check that Tone.start() runs inside a direct user gesture handler, that the AudioContext state is "running" after the tap (log it), and add a visible fallback tap-to-enable if it is suspended. Also check the iOS silent switch note and that no code awaits something before calling Tone.start().
```

**Timing drifts or sounds jittery**
```text
The loop timing sounds uneven. Audit the code: confirm all notes are scheduled via Tone.Transport / Tone.Part with exact times and that no triggerAttackRelease is called inside requestAnimationFrame or setTimeout. Check that the Part is not being rebuilt too often and that the lookAhead is sensible. Fix and explain.
```

**Drawing breaks after resize or rotation**
```text
After resizing or rotating the device, strokes shift or blur. Verify all stored coordinates are normalized 0..1, that rendering multiplies by the current CSS size and then handles devicePixelRatio via ctx.setTransform, and that a ResizeObserver triggers a full redraw. Fix any place that stores pixels.
```

**Phone gets hot or laggy**
```text
The app lags on my phone with many strokes. Profile it. Cache static layers on an offscreen canvas, only redraw the playhead and ripples per frame, cap polyphony per instrument, reduce points per stroke with a simplification algorithm (Ramer-Douglas-Peucker), and pause rendering when the tab is hidden. Report what changed and the before/after frame time.
```

**It looks generic or AI-ish**
```text
The UI looks generic. Re-read the DESIGN SYSTEM and the "AI-generated look" list in the project rules, then redesign the toolbar and panels to follow them strictly: warm paper surfaces, hairline borders, muted pigments only, deliberate spacing, custom SVG icons, short human copy, no gradients and no glow. Show me the changed files and describe what you changed visually.
```

---

## Commit checklist (one commit per working step)

```
chore: scaffold vite+ts, design tokens, audio start gate
feat: responsive canvas with normalized vector strokes
feat: scale quantization, pitch guides, live note preview
feat: instrument bank, tracks, master chain
feat: tone transport, scheduled note events, playhead and hit ripples
feat: toolbar with play, bpm, undo/redo, eraser, clear
feat: per-track instruments, key/scale picker, mute/solo, mobile sheets
feat: hit ripples, playhead trail, empty state, layered rendering
feat: mobile polish, gestures, haptics, first-run hint
feat: autosave, share link, audio export, loop length
feat: pwa, offline shell, meta tags, deploy config
chore: design, feel and code audit fixes
```

## Personal reminders while you build

- One prompt at a time. Test on a real phone after every step, not only desktop.
- If the agent adds something you did not ask for (extra pages, gradients, new libraries), tell it to remove it.
- Keep the 6-colour palette and 7 instruments until the end. Adding more is easy later, fixing a messy first version is not.
- The app is good when a stranger draws a line, hears something nice, and smiles within 10 seconds.
