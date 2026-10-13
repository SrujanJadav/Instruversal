# Instruversal Progress Log

This document tracks progress across all steps of Instruversal, including foundation work and the Master Build Plan steps defined in [BUILD_PLAN.md](file:///c:/Users/sruja/.vscode/instruversal/docs/BUILD_PLAN.md).

## Foundation & Pre-Plan Steps

| Step / Milestone | Date | Commit | Notes |
|---|---|---|---|
| Project scaffold & audio start gate | 2026-10-11 | `0e5b95b` | Vite + strict TypeScript, design tokens, warm paper canvas, audio gesture wake |
| Vector drawing & normalized coords | 2026-10-11 | `f7c0a59` | Pointer events, normalized (0-1) vector coordinates, DPR scaling |
| Scale quantization & pitch guides | 2026-10-11 | `3c94ea9` | Musical scale quantization, pitch guides, live note preview |
| Instrument bank & master audio chain | 2026-10-11 | `4a04b6b` | 6 color tracks, synthesis voice pool, master limiter |
| Tone transport & scheduled note playback | 2026-10-11 | `d985171` | Tone.Transport as single clock, Tone.Part note scheduling, playhead & hit ripples |
| Bottom toolbar & canvas controls | 2026-10-11 | `d67f129` | Play/pause, BPM stepper, undo/redo, clear canvas |
| Per-track instruments & mobile panels | 2026-10-11 | `3a53c87` | Track selector, instrument assignment, key/scale picker, mute/solo |
| Layered canvas rendering & visual trails | 2026-10-11 | `43d33ab` | Layered 2D canvas, smooth quadratic curves, playhead ink trail, ripple rings |
| Flow mode & effects rack | 2026-10-11 | `eea62df` | Flow mode continuous glide, effects rack (reverb, delay, filter, distortion) |
| Latency compensation & sync calibration | 2026-10-11 | `86bc839` | Sync-compensated visual playhead, user sync offset calibration (-200ms to +400ms) |
| Dock toolbar redesign | 2026-10-11 | `a606f09` | Scrollable dock toolbar with grouped controls, hairline borders |
| Drum engine & beat lanes | 2026-10-11 | `dc31b78` | 8-voice drum kit engine (808, lofi, acoustic, electro), 4 drum lanes |
| Beat flow mode | 2026-10-11 | `5814e07` | Drum flow styles: straight, roll, sweep, syncopated |
| Key & scale audition | 2026-10-11 | `da5ac93` | Audition root notes and scale intervals with visual scale strip |
| Dark/light themes & mobile polish | 2026-10-11 | `fef4418`, `62b84c7` | Sky toggle component, CSS custom properties, touch targets, haptics |
| Partial eraser (stroke splitting) | 2026-10-11 | `05421b7` | Capsule hit-testing, splitting strokes into sub-segments on erase |
| Library & 3D circular gallery | 2026-10-11 | `0eff987` | IndexedDB creation storage, OGL-based 3D gallery, start-page Load button |
| Cloud sync & Supabase authentication | 2026-10-11 | `30c096d` | Optional cloud sync, auth modal, account sheet, delete account edge function |
| Audit fixes: aesthetics, accessibility, chunks | 2026-10-11 | `20fbe9f` | Removed gradients/backdrop-filters, manualChunks, safe textContent rendering |
| PWA, offline shell & social previews | 2026-10-12 | `87c7729` | vite-plugin-pwa, icons, webmanifest, NetworkOnly for Supabase, robots & sitemap |
| Per-colour musical keys & defaults | 2026-10-12 | Working tree | Per-color key mode with `effectiveKey`, DB migration 002 |
| Loop lengths (1, 2, 4, 8) & audio export | 2026-10-12 | Working tree | Variable loop lengths, real-time WAV & WebM recording, DB migration 003 |

---

## Master Build Plan Steps

| Step | Phase | Status | Date | Commit | Notes |
|---|---|---|---|---|---|
| **0: Verify starting point & PROGRESS.md** | Gate | Done | 2026-10-12 | `4244cad` | Verified 15 subsystem items. Confirmed tsc clean & 115 tests pass. Found copyrighted songs to remove in Step 1 and missing folded shape multi-branch playback. |
| **1: Try-yourself examples** | Editor features | Done | 2026-10-12 | `b9a9928` | 3 lazy-loaded examples (Ode to Joy, Marimba Pop (original), Dreamy Arpeggio (original)), notesToStrokes converter, 1ms round-trip tests, dev midi parser, start page carousel. Zero copyrighted content. |
| **1c: Multi-intersection branch playback** | Editor features | Done | 2026-10-12 | `feat(step-1c)` | Branch splitting engine, turning-point hysteresis, Flow & Notes chords for folded shapes, playhead multi-dot riding, polyphony cap (4/8/12) with smooth voice thinning. |
| **2: Lasso select, move, duplicate, snap** | Editor features | Done | 2026-10-13 | `ce934cf` | Third tool in dock (V), tap/lasso/rect selection, move, duplicate (+1 beat), copy/cut/paste (Ctrl+C/X/V), flip H/V, recolour, snap (16th/scale), 1 undo step. |
| **3: MIDI export (single drawing)** | Editor features | Done | 2026-10-13 | `a0c6075` | Pure SMF Format 1 encoder, multi-track export, GM drums ch10, flow/notes/beat extraction, 1/2/4 repeats, iPhone fallback link. |
| **4: Practice aids (drone, metronome, count-in)** | Editor features | Done | 2026-10-13 | `c4de17f` | Mixer sheet Practice section, sustained root+5th pad drone with key glide, Transport metronome, 1-bar count-in pre-roll with 1 2 3 4 overlay. |
| **5: Resume link and keyboard shortcuts** | Editor features | Done | 2026-10-13 | `step-5` | Start page resume link (30m session / 24h fresh visit), desktop-only shortcuts list in ? sheet, full keyboard workflow with input guard. |
| **6: Song data model, storage and database** | Song Studio | Done | 2026-10-13 | `feat: song data model, local and cloud storage` | Song data model, schema validator & migration, pure arrangement helpers, IndexedDB v2 & CloudSongStore, 002_songs.sql & 004_songs.sql, compact preview, privacy sheet update. |
| **7: Studio screen: arrangement canvas** | Song Studio | Done | 2026-10-13 | `feat: song studio arrangement canvas and drawing import` | Multi-lane timeline, drawing clips with thumbnails, clip inspector, picker sheet with preview audition, list view, history. |
| **8: Song playback engine** | Song Studio | Done | 2026-10-13 | `feat: song playback engine` | Pure project/song event compilers, Tone.Transport windowed scheduler, lazy lane instruments & drum kit cache, clip transposition, polyphony caps, 30ms anti-click releases, sounding pulse & follow playhead. |
| **9: Mix master** | Song Studio | Queued | - | - | Lane strips, master chain (EQ, compressor, limiter), level meters, presets. |
| **10: Song export, sharing & Library** | Song Studio | Queued | - | - | Song WAV/MIDI export, Library songs tab, public song remix. |
| **11: Studio polish, performance & accessibility** | Song Studio | Queued | - | - | Stress test (6 lanes/12 assets), memory profiling, a11y pass. |
| **12: Final audit of everything** | Ship | Queued | - | - | Comprehensive design, audio, security, a11y & code health audit. |
| **13: Deploy config, security headers, CI** | Ship | Queued | - | - | Cloudflare Pages config, _headers, CSP, GitHub Actions CI. |
| **14: Pre-launch QA on live site** | Ship | Queued | - | - | Real device testing matrix, Lighthouse, edge cases. |
| **15: Launch** | Ship | Queued | - | - | Documentation finalization, custom SMTP verification, launch checklist. |
