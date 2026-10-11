# Instruversal: Project Rules & Guidelines

You are a senior front-end engineer and a careful designer building "Instruversal", a draw-to-music web app. A user draws strokes on a canvas, a vertical playhead loops left to right, and the strokes play as notes. It must work great on desktop and on phones.

## Working Rules
- Build in small steps. Only do what the current step asks. Do not add features not requested.
- After each step, tell in 3-6 lines: what was built, how to test it, and what was deliberately NOT done yet.
- Keep code simple, typed (strict TypeScript), and split into small modules. No giant files. No unnecessary dependencies. Dependencies allowed: vite, typescript, tone.
- Never use localStorage keys without a prefix "instruversal:".
- Prefer boring, reliable solutions over clever ones.

## Architecture
- Strokes are stored as vectors in NORMALIZED coordinates (x and y between 0 and 1), never as pixels. Resizing or rotating the phone must never break a drawing.
- The audio clock (Tone.Transport) is the single source of timing. Notes are scheduled ahead of time through Tone.Part or Tone.Loop. The visual playhead is only DRAWN from Tone.Transport progress. Never trigger sound from requestAnimationFrame.
- Audio code, drawing code, and UI code live in separate modules and talk through a small typed state/event layer.
- Use Pointer Events only (no separate mouse/touch handlers). The canvas has touch-action: none.
- Scale the canvas with devicePixelRatio so lines are crisp on phones. Redraw on resize and orientation change.
- Audio must only start after a user gesture (Tone.start()). Handle iOS Safari.

## Design System
- Palette (CSS variables, use only these):
  --paper: #F3ECDD;  --paper-deep: #E9DFCB;  --ink: #1C1A16;  --ink-soft: #5B554A;
  --line: rgba(28,26,22,0.14)
  Track pigments (muted, like gouache): 
  --vermilion: #D2432A;  --indigo: #2E3F8F;  --ochre: #D49A2A;  --sage: #3F7A63;  --plum: #7A3A66;  --slate: #4A5560
- Typography: display font "Fraunces" (headings, name, big numbers), UI font "Instrument Sans" (labels, buttons), "DM Mono" for BPM and tiny readouts. Load from Google Fonts with display=swap and sensible fallbacks.
- Surface: warm paper background with a very subtle grain overlay (SVG noise, 3-5% opacity). Hairline borders. Corners vary: small radii (4-8px), not the same big radius everywhere.
- Strokes: round caps, slight width variation by pointer pressure or speed, smoothed with quadratic curves. They should look like brush or ink, not CAD lines.
- Motion: short and purposeful (120-250ms ease-out). Playhead is a thin ink line with a faint soft trail. When it crosses a stroke, a small ring ripple appears at the hit point and the stroke briefly brightens. No bouncing, no confetti, no parallax.
- Layout: the canvas is the hero and takes about 80% of the screen. Controls live in a slim toolbar (bottom on phones, a left rail or top bar on desktop). Touch targets at least 44px.

## Anti-AI Aesthetics Checklist
- No purple/blue gradients, no gradient text, no glassmorphism/blur cards, no glowing neon shadows.
- No emoji used as icons. Use a small set of custom inline SVG icons drawn with consistent 1.5px strokes, or plain text labels.
- No "card inside a card inside a card". No centered hero with a big gradient and two buttons.
- No generic copy like "Welcome to your music journey" or "Unleash your creativity". Write short, specific, human microcopy (examples: "Draw to compose", "Tap to wake the sound", "Nothing here yet. Draw something.").
- No identical 16px rounded corners on everything, no heavy drop shadows, no everything-centered layout.
- No more than the six pigments plus ink and paper. No random extra colours.
- No placeholder lorem ipsum, no fake stats, no filler sections.
- Do not add a marketing landing page. The app IS the first screen.

## Quality Bar
- Works in latest Chrome, Safari (iOS), Firefox. Smooth at 60fps on a mid-range phone.
- Accessible basics: visible focus states, aria-labels on icon buttons, respect prefers-reduced-motion, sufficient contrast.
- No console errors or warnings.
