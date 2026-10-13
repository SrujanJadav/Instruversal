# Instruversal — Session Handover

## 1. Project Summary
Instruversal is a vector-drawing-based musical loop sequencer for the web. Users draw brush strokes on a warm paper canvas, a vertical playhead loops across the screen, and intersecting strokes trigger synthesized notes and chords. The app includes scale quantization, continuous flow gliding, an 8-voice drum engine, multi-branch chord playback, and an experimental Song Studio arrangement DAW. The live production target is Cloudflare Pages (static hosting) with Supabase for authentication and optional cloud sync. The codebase is hosted on GitHub under owner `SrujanJadav` with an MIT license (confirmed from `LICENSE`).

## 2. Session and Handover Notes
The repository owner is switching AI accounts due to usage quota limits. A new AI session starts with zero conversation memory; this file and `docs/BUILD_PLAN.md` serve as the sole source of context and historical decisions. Do not assume or hallucinate previous chat context; refer strictly to the documented decisions in Section 6.

## 3. Git State
- **Current Branch**: `feat/polish-mobile-grid`
- **Working Tree**: Clean (`nothing to commit, working tree clean`)
- **Remote & Local Sync**: Local `main` points to commit `e64a4c3`, identical to `origin/main` (`[origin/main]`). Current branch `feat/polish-mobile-grid` is 15 commits ahead of `main` (not yet merged).
- **Uncommitted Files**: None.
- **Existing Branches**:
  - `main` (`e64a4c3`): Tracking `origin/main`.
  - `feat/polish-mobile-grid` (`4fc28c4`): Current branch. NOT MERGED into `main`.
  - `feat/brand-and-garden` (`8264e9d`): Ancestor of current branch. NOT MERGED into `main`.
  - `feat/partial-eraser` (`0eff987`): Historical branch.
  - `backup-before-author-rewrite` (`59fc58f`): Historical backup.
  - `step-0` through `step-10`: Milestone branches for Studio progression. Linear ancestors of current branch; NOT MERGED into `main`.
  - `release/v1`: NOT CREATED yet.
- **Last 15 Commits on `feat/polish-mobile-grid`**:
  - `4fc28c4` feat: polish mobile header, dock overflow, and persistent canvas grid toggle
  - `8264e9d` feat: polish Type Garden title and studio home navigation
  - `125b2ad` feat: transparent rose wordmark hero and centered vine garden with restored gate controls
  - `74f2479` feat: SVG wordmark on start page and clean-room Type Garden background
  - `5177b97` feat: song export, public sharing and library songs tab
  - `d2d4d25` feat: mix master with channel strips, master chain, meters and presets
  - `a26c714` feat: song playback engine
  - `a615f6c` fix: support /studio pathname routing, add desktop Studio button, and safeguard clip pointer capture
  - `ec5aeaf` feat: song studio arrangement canvas and drawing import
  - `8a46e00` feat: song data model, local and cloud storage
  - `e7a7f8e` feat: resume link and shortcuts
  - `0f975fb` feat: drone, metronome and count-in
  - `5b42b79` chore: enable host for mobile testing
  - `58c0fed` feat: midi export
  - `1ac2e4a` feat: lasso select, move, duplicate and snap

## 4. Step and Task Status Table

| Item | Status | Evidence | Open Work |
|---|---|---|---|
| Step 0: Starting point verification | DONE | Commit `b4c979e` | None |
| Step 1: "Try yourself" examples | DONE | Commit `f2c3286` | None. Ode to Joy, Marimba Pop (original), Dreamy Arpeggio (original) present. |
| Step 1b: Copyrighted songs removal | DONE (working tree) / PARTIAL (git history) | Commit `f2c3286` (clean tree) vs `ba49c97`, `7e74cf9`, `e96e770` in git history | Working tree is 100% clean of copyrighted notes. Git history on remote still contains older commits. |
| Step 1c: Multi-intersection branch playback | DONE | Commit `dedec09` (`src/audio/branches.ts`) | None |
| Step 1c fix: Bounds & dev-only debug tools | DONE | Commit `e64a4c3` | None. Debug UI hidden by default (`#debug`, `instruversal:debug`, or `Ctrl+Shift+D`). |
| Step 2: Lasso select, duplicate, snap | DONE | Commit `1ac2e4a` (`src/canvas/selection.ts`) | None |
| Step 3: MIDI export (single drawing) | DONE | Commit `58c0fed` (`src/export/midiWriter.ts`) | None |
| Step 4: Practice aids (drone, metronome, count-in) | DONE | Commit `0f975fb` (`src/audio/practice.ts`) | None |
| Step 5: Resume link and shortcuts | DONE | Commit `e7a7f8e` (`src/library/resume.ts`) | None |
| Steps 6–10: Song Studio DAW | DONE | Commits `8a46e00`, `ec5aeaf`, `a26c714`, `d2d4d25`, `5177b97` | Arrangement canvas, playback engine, mixer master, export, and public sharing fully functional. |
| Step 11: Studio polish & performance | NOT STARTED | `docs/PROGRESS.md` (Queued) | Memory profiling, multi-clip stress testing. |
| Step 12: Final audit of everything | NOT STARTED | `docs/PROGRESS.md` (Queued) | Pre-ship comprehensive audit. |
| Step 13: Deploy config, headers, CI | NOT STARTED | `docs/PROGRESS.md` (Queued) | Cloudflare Pages `_headers`, CSP, GitHub Actions CI. |
| Step 14: Pre-launch QA on live site | NOT STARTED | `docs/PROGRESS.md` (Queued) | Live device verification matrix. |
| Step 15: Launch | NOT STARTED | `docs/PROGRESS.md` (Queued) | Final launch checklist. |
| Step 22B: Per-colour keys (`effectiveKey`) | DONE | `src/audio/tracks.ts`, `002_per_colour_keys.sql` | Owner to confirm Supabase migration execution. |
| Step 23: Final audit (foundation) | DONE | Commit `20fbe9f` | Pushed to `origin/main`. |
| Step 24: Loop length (1, 2, 4, 8) & audio export | DONE | `src/export/exportAudio.ts`, `003_loop_length.sql` | None. Real-time master WAV/WebM recording. |
| Step 25: PWA, offline shell, robots, sitemap | DONE | Commit `87c7729` (`public/robots.txt`, `sitemap.xml`) | None |
| Mixer & studio overflow fixes | DONE | Commit `d2d4d25` | None |
| Brand wordmark SVGs & transparent assets | DONE | `public/brand/` (`logo-dark-transparent.svg`, etc.) | Owner to decide between SVG wordmark vs Type Garden canvas. |
| Procedural Type Garden title engine | DONE | `src/garden/` (`TypeGardenEngine.ts`, `TypeGardenTitle.ts`) | Owner to confirm licensing/permission for Type Garden concept. |
| Polish branch `feat/polish-mobile-grid` | DONE | Commit `4fc28c4` | Merge to `main`. |
| Release branch `release/v1` | NOT STARTED | No branch or commit exists yet | Remove test files, wire `VITE_ENABLE_STUDIO`, add CSP, CI, `DEPLOY.md`. |

## 5. Feature Inventory
- **Home & Start Gate**: Procedural blooming rose canvas title ("Instruverse"), audio unlock gesture gate, 3D circular gallery modal (OGL WebGL carousel of saved creations), resume previous sketch link, 3 interactive demos (Ode to Joy, Marimba Pop, Dreamy Arpeggio), Supabase authentication modal & account sheet.
- **Drawing Canvas**: Normalized 0–1 vector coordinates, DPR scaling, 6 gouache track pigments, smooth variable-width brush strokes, stroke-splitting partial eraser, lasso/tap selection tool with translation, +1 beat duplicate, clipboard copy/cut/paste, flip, recolor, and snap.
- **Musical Controls**: 7 musical scales + chromatic, root pitch guides, per-color root key overrides (`effectiveKey`), continuous Flow glide vs quantized Notes mode, 4 drum lanes (Kick, Snare, Hi-Hat, Perc) with 4 kits (808, Lofi, Acoustic, Electro), and variable loop lengths (1, 2, 4, 8 bars).
- **Canvas Grid Switch**: Accessible switch button (`G`/`g` shortcut) toggling pitch lines (melodic) or lane dividing bands (drums) with per-mode `localStorage` persistence (`instruversal:grid-melodic`, `instruversal:grid-beats`).
- **Audio Synthesis**: Multi-branch intersection scheduling with polyphony cap and voice thinning, master effects (reverb, stereo delay, filter, tape distortion), channel mixer (levels, pan, mute/solo), practice aids (sustained pad drone, metronome, 1-bar count-in pre-roll), audio-visual sync calibration slider (-200ms to +400ms).
- **Export & Storage**: IndexedDB storage, real-time Master WAV & WebM recording, multi-track SMF Format 1 MIDI export.
- **Song Studio (`#/studio`)**: Multi-lane arrangement timeline, clip import from drawings, transposition, multi-track playback scheduler, channel strips with 3-band EQ, glue compressor, limiter, VU meters, mix presets, and public read-only song sharing page (`#/s/<slug>`).
- **PWA & Offline**: Service worker precaching shell assets, install prompt banner, full offline drawing and audio playback.

## 6. Decisions and Rules (Never Undo)
1. **Design System**: Strict paper-and-ink palette (`--paper`, `--paper-deep`, `--ink`, `--ink-soft`, `--line`, and 6 pigments). Zero UI gradients, zero `backdrop-filter`, zero box-shadow blurs. Inline SVGs only (1.5px stroke); zero emoji or unicode icons. Minimum 44px touch targets.
2. **Audio Architecture**: `Tone.Transport` is the single source of timing truth. Notes are scheduled ahead of time via `Tone.Part`/`Tone.Loop`; never trigger audio from `requestAnimationFrame`. Coordinates are normalized (0–1).
3. **Multi-Intersection Branches**: Strokes that loop, fold, or cross over themselves generate branch intersection points (`src/audio/branches.ts`) so every crossing triggers a note.
4. **Recording**: Audio export records the live master bus in real time via Web Audio MediaRecorder. Never introduce an offline audio render engine.
5. **Settings**: Device preferences reside strictly in `localStorage` prefixed with `instruversal:`. Never save device settings to project JSON or database.
6. **Debug Tools**: Debug UI is hidden by default; accessible via `#debug` hash, `instruversal:debug` localStorage key, or `Ctrl+Shift+D`.
7. **Song Studio Visibility**: Song Studio must be hidden on the live production build behind `VITE_ENABLE_STUDIO` (default `false`). Code remains in the repository.
8. **Copyright**: No copyrighted song data, MIDI files, or melody transcriptions allowed. Demo Artist examples have been removed from the working tree. Use public domain or original music only.
9. **Test Files**: The release branch deletes test files from the working tree per owner's instruction. Do not delete them on feature or development branches.
10. **Type Garden**: Generative title is inspired by Akshat Agarwal's Type Garden. The owner must determine licensing or attribution permission; do not commit external reference code.
11. **Security**: Supabase Row Level Security (RLS) is enabled on all tables. Only publishable anon keys exist in client code; never include `service_role` keys in the repository.

## 7. Architecture Map
- `src/audio/`: Synthesizers, drum voice engines, scale quantization, branch scheduling (`branches.ts`), track management & per-color keys (`tracks.ts`), effects rack, practice aids, latency compensation.
- `src/canvas/`: Vector stroke engine, `DrawingCanvas.ts`, partial eraser, lasso selection, grid settings (`gridSettings.ts`).
- `src/ui/`: UI components, dock `Toolbar.ts`, theme toggle, mixer panel, action sheets, `HeaderMoreSheet.ts`, `AccountSheet.ts`.
- `src/library/`: IndexedDB storage for sketches, cloud sync manager, thumbnail generation, validation.
- `src/song/`: Song Studio data models, arrangement helpers, timeline scheduler, master bus, mix presets.
- `src/export/`: Real-time audio recording (`exportAudio.ts`), Standard MIDI File encoder (`midiWriter.ts`).
- `src/gallery/`: WebGL 3D circular gallery modal using OGL.
- `src/auth/`: Supabase client authentication wrapper.
- `src/pwa/`: Service worker registration, install banner prompt.
- `src/garden/`: Procedural canvas title generator (`TypeGardenEngine.ts`, `TypeGardenTitle.ts`, math and rendering modules).
- `supabase/migrations/`: PostgreSQL schemas and RLS policies (`001_creations.sql` through `004_songs.sql`).
- `scripts/`: Internal dev utilities.
- `docs/`: Documentation (`BUILD_PLAN.md`, `PROGRESS.md`, `HANDOVER.md`).
- **Core Entry Files**: `src/main.ts` (routing, app initialization, gate screen), `vite.config.ts` (Vite config, PWA plugin, chunk splitting), `index.html`.

## 8. Configuration
- **Environment Variables**:
  - `VITE_SUPABASE_URL`: Defined in `.env.example` and local `.env.local`.
  - `VITE_SUPABASE_ANON_KEY`: Defined in `.env.example` and local `.env.local`.
  - `VITE_SITE_URL`: Defined in `.env.example` and local `.env.local` (default placeholder: `https://instruversal.app`).
  - `VITE_ENABLE_STUDIO`: Planned flag to hide Song Studio on production builds. NOT YET in `.env.example` or `.env.local`.
- **GitHub Workflow Secrets**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (used by `.github/workflows/keepalive.yml` weekly ping).
- **Node Environment**: Running Node `v22.15.1`. No explicit version pin in `package.json` engines or `.nvmrc`.

## 9. Database State
Migrations present in `supabase/migrations/`:
- `001_creations.sql`: Base creations table, RLS policies, user storage bucket. Owner run status: UNKNOWN.
- `002_per_colour_keys.sql`: Adds `track_keys` JSONB column to `creations`. Owner run status: UNKNOWN.
- `002_songs.sql`: Initial songs table migration. Owner run status: UNKNOWN.
- `003_loop_length.sql`: Adds `loop_length` integer column to `creations`. Owner run status: UNKNOWN.
- `004_songs.sql`: Refined songs schema with indexes, triggers, and RLS. Owner run status: UNKNOWN.
*(Note: Do not execute any SQL migrations automatically. The owner manages remote database execution.)*

## 10. Test and Build State
- **TypeScript**: `npx tsc --noEmit` exits with code 0 (PASS, 0 errors).
- **Unit Tests**: `npm test` (`vitest run`):
  - Test files: 43 passed (43 total)
  - Tests: 289 passed (289 total, 0 failures, 0 skipped)
- **Production Build**: `npm run build` exits with code 0 (PASS).
- **Generated Bundle Chunks**:
  - `dist/assets/index-3OzfJBAz.js`: 350.23 kB (gzip: 85.28 kB)
  - `dist/assets/tone-CdR51F5b.js`: 293.38 kB (gzip: 69.85 kB)
  - `dist/assets/supabase-rnRQy25x.js`: 214.38 kB (gzip: 55.18 kB)
  - `dist/assets/StudioView-BEDdUFDT.js`: 83.17 kB (gzip: 19.24 kB)
  - `dist/assets/CircularGallery-BoYbP_BB.js`: 75.48 kB (gzip: 21.98 kB)
  - `dist/assets/tracks-Cw-Y5AA6.js`: 19.79 kB (gzip: 5.02 kB)
  - `dist/assets/garden-background-Cinpb-dP.js`: 14.65 kB (gzip: 5.61 kB)
  - `dist/assets/playbackEngine-Qx7yH_w8.js`: 12.47 kB (gzip: 3.96 kB)
  - `dist/assets/store-D6ThePD_.js`: 12.31 kB (gzip: 4.27 kB)
  - `dist/assets/PublicSongView-BLk-6ArR.js`: 8.28 kB (gzip: 2.47 kB)
  - `dist/assets/drums-DqLFMZuM.js`: 6.84 kB (gzip: 2.29 kB)
  - `dist/assets/state-D0pHkVoA.js`: 6.92 kB (gzip: 2.18 kB)
  - `dist/assets/scheduler-CqB_H-Kc.js`: 6.23 kB (gzip: 2.23 kB)
  - `dist/assets/workbox-window.prod.es5-Bd17z0YL.js`: 5.65 kB (gzip: 2.20 kB)
  - `dist/assets/examples-D14L4zKF.js`: 4.20 kB (gzip: 1.61 kB)
  - `dist/assets/midiExport-BdEjplgM.js`: 3.60 kB (gzip: 1.46 kB)
  - `dist/assets/helpers-BMqo7AqV.js`: 3.21 kB (gzip: 1.36 kB)
  - `dist/assets/auth-a0Iudasj.js`: 2.26 kB (gzip: 1.03 kB)
  - `dist/assets/marimbaPop-cGJ78DQ0.js`: 2.17 kB (gzip: 0.49 kB)
  - `dist/assets/dreamyArpeggio-aFguR9eW.js`: 2.07 kB (gzip: 0.49 kB)
  - `dist/assets/odeToJoy-jvJl0ppM.js`: 1.22 kB (gzip: 0.39 kB)
  - `dist/assets/rolldown-runtime-BpQH8Ho1.js`: 0.22 kB (gzip: 0.19 kB)
  - `dist/assets/index-4AM2tdHY.css`: 122.26 kB (gzip: 18.47 kB)
  - `dist/index.html`: 4.18 kB (gzip: 1.33 kB)
  - `dist/sw.js` & `dist/manifest.webmanifest`: generated for PWA

## 11. Known Issues
- Sky toggle phone sizing: RESOLVED on `feat/polish-mobile-grid` (`--toggle-size: 10px–10.5px`, $\ge 44\text{px}$ touch target).
- Header and dock overflow on phones: RESOLVED on `feat/polish-mobile-grid` (Header More sheet, reordered dock, 3px visible scrollbar).
- Grid switch: IMPLEMENTED on `feat/polish-mobile-grid` with `G` keyboard shortcut and device persistence.
- Beat mode drum lane box outlines: RESOLVED on `feat/polish-mobile-grid` (clean plain-text labels).
- Wordmark artwork background: Standalone SVGs in `public/brand/` have transparent backgrounds; start screen currently mounts procedural Type Garden canvas.
- Procedural floral garden: Functioning smoothly on canvas; owner must confirm whether to keep procedural canvas or use static SVG.
- CSP in enforcing mode: NOT TESTED; no `_headers` file or CSP meta tag exists in repository yet.
- Studio hiding flag: `VITE_ENABLE_STUDIO` is not yet implemented in code or build config.
- Remote git history: Commits `ba49c97`, `7e74cf9`, and `e96e770` contain historical Demo demo references on `origin/main` (working tree is clean).

## 12. Deployment Plan and Order
1. **Merge Polish Branch**: Verify `feat/polish-mobile-grid`, review changes, and merge into `main`.
2. **Align on Wordmark & Garden**: Confirm owner choice between procedural `TypeGardenTitle` vs static SVG wordmark, resolve attribution/licensing, and merge.
3. **Release Branch (`release/v1`)**:
   - Create `release/v1` from `main`.
   - Delete all `*.test.ts` files from the working tree per owner's instruction.
   - Wire `VITE_ENABLE_STUDIO` in `src/main.ts` and `vite.config.ts` (default `false`) to hide Studio links and route.
   - Add Cloudflare Pages `public/_headers` with Content-Security-Policy (CSP) and security headers.
   - Add `.github/workflows/ci.yml` for pull request validation.
   - Add `docs/DEPLOY.md` guide and commit. Owner pushes `release/v1`.
4. **Owner Manual Setup**:
   - Configure Cloudflare Pages project pointing to repo with environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`).
   - Configure Supabase Site URL and redirect URLs for magic link authentication.
   - Set up custom SMTP provider in Supabase dashboard.
   - Perform post-deploy manual checks on physical iPhone and Android devices.
5. **Post-Launch**:
   - Restore test files on development branch.
   - Complete Step 11 Studio polish on a dedicated branch.
   - Flip `VITE_ENABLE_STUDIO=true` only after Song Studio passes thorough testing.

## 13. Open Questions for the Owner
- **UNKNOWN**: Has the owner executed migrations `001_creations.sql`, `002_per_colour_keys.sql`, `002_songs.sql`, `003_loop_length.sql`, and `004_songs.sql` in their remote Supabase project?
- **UNKNOWN**: Which wordmark presentation is preferred for launch: the interactive procedural `TypeGardenTitle` canvas or static SVG assets in `public/brand/`?
- **UNKNOWN**: What license or attribution approach will be taken for the Type Garden procedural concept (inspired by Akshat Agarwal)?
- **UNKNOWN**: Should test files remain permanently deleted in production `main`, or kept on development branches?
- **UNKNOWN**: Which custom SMTP service provider will be configured in Supabase for authentication emails?
- **UNKNOWN**: What is the final production domain name (placeholder: `https://instruversal.app`)?
- **UNKNOWN**: Should remote git history on `origin/main` be rewritten to purge historical Demo demo commits (`ba49c97`, `7e74cf9`, `e96e770`) before making repository public?

## 14. How to Continue (For Next Session)
1. Read this file (`docs/HANDOVER.md`), `docs/BUILD_PLAN.md`, and `docs/PROGRESS.md`.
2. Run `git status`, `git branch -vv`, `npx tsc --noEmit`, and `npm test` to confirm baseline health (all 289 tests passing, 0 type errors).
3. Compare the current state with this document and identify any differences.
4. Ask the owner the open questions listed in Section 13 before modifying any files.
5. Proceed with the deployment order in Section 12, starting with merging `feat/polish-mobile-grid` into `main`.
