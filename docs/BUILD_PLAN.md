# INSTRUVERSAL: MASTER BUILD PLAN

This file is the single source of instructions for the coding agent. Put it in the repo as `docs/BUILD_PLAN.md`.

**Live jam (multiplayer) is OUT of scope. Do not build it.**

---

## PART 1: FOR ME (the human). How to use this file

1. Put this file at `docs/BUILD_PLAN.md`, commit it, then start a fresh agent chat.
2. Send the agent this kickoff message:

```text
Read docs/BUILD_PLAN.md completely, then do STEP 0 only and stop. Follow the working protocol in Part 2 exactly. Do not start any other step until I say "go step N".
```

3. After every step the agent stops and gives a report. You check it with the **"You check"** list in that step (on your phone as well as the desktop).
4. If it is good, say `go step N` (the next one). If not, tell the agent exactly what is wrong and it fixes only that.
5. One git branch per step. Merge to `main` only after you checked it.
6. When the agent asks something, pick its recommended option unless you have a reason not to.
7. SQL and Supabase: the agent shows you the SQL first. You read it and run it yourself in the Supabase SQL editor. The agent never touches your accounts or database.

---

## PART 2: FOR THE AGENT. Working protocol (applies to EVERY step)

### What the app is
Instruversal is a draw-to-music web app. The user draws strokes on a canvas, a playhead loops across it, and the strokes play as notes. Stack: Vite + TypeScript + Tone.js, Canvas 2D, plain CSS, Supabase (login and database), `ogl` (lazy-loaded Load gallery), `vite-plugin-pwa`. It is a static site deployed to Cloudflare Pages.

### Non-negotiable rules (never undo these)
- **Design:** warm paper-and-ink look, six pigments only (vermilion, indigo, ochre, sage, plum, slate) plus paper and ink, light and dark themes via CSS variables. No gradients (except the one soft shadow on the theme toggle), no `backdrop-filter`, no emoji or unicode symbols as icons (inline SVG, 1.5px stroke), no generic marketing copy, no card-inside-card layouts. Fonts: Fraunces (name and big moments), Instrument Sans (UI), DM Mono (numbers and tags).
- **Audio:** `Tone.Transport` is the only clock. Notes are scheduled ahead of time, never triggered from `requestAnimationFrame`. Strokes are stored in normalized coordinates. Playback uses branch-based multi-intersection playback (every line a playhead crosses plays). Keys always go through `effectiveKey` (per-colour keys). Loop lengths are 1, 2, 4 and 8 bars. The latency-compensated playhead and the user's Sync offset must keep working. No stuck notes, no pops, release voices with short fades.
- **Code:** strict TypeScript, small modules, no `any` without a comment, user-provided text inserted with `textContent` only (never `innerHTML`), everything loaded from storage, cloud, share links or imports is validated, listeners and Tone/WebGL resources are always disposed. Extend the existing `vite.config.ts` and keep its `manualChunks`. Hash routing (`#/...`) only.
- **Settings:** device settings (theme, sync offset, polyphony, eraser size, practice aids, etc.) stay in `localStorage` under the `instruversal:` prefix and never go into projects or the cloud.
- **UX:** works at 360px width, portrait and landscape, both themes, 44px touch targets, visible focus, focus returns to the opener when a sheet or modal closes, `prefers-reduced-motion` respected, calm human error messages (never a blank screen). Nothing new in the editor header bar (it has no space on phones).
- **Security:** no secrets in the repo (only the Supabase URL and anon key may exist in the client), Row Level Security on every table, SQL is shown to the human first and never run by you. Copyrighted music is forbidden in the repo (no copyrighted melodies, lyrics or note data).
- **Dependencies:** none unless a step explicitly allows one.

### The loop for each step
1. Read the step. Reply with a **short PLAN**: files to change, data or schema changes, any SQL, risks, and any questions (ask all questions at once, each with your recommended answer). **Wait for "go".**
2. Build only what the step asks. No refactors of unrelated code. No extra features.
3. Run the **quality gate**: `tsc --noEmit` zero errors, all tests pass, production build succeeds, zero console warnings or errors on every touched screen, both themes, 360px and landscape check, keyboard and focus check, reduced motion check.
4. Write tests for new logic (pure functions especially).
5. Update `docs/PROGRESS.md` (see Step 0): mark the step, add the date and notes.
6. Commit on the step's branch with the suggested message (do not merge or push unless I ask).
7. **STOP and give the REPORT in exactly this format, then wait:**

```text
STEP N REPORT
Built: (bullet list, plain language)
Files changed: (list)
How to test it: (exact steps I should follow, desktop and phone)
Quality gate: tsc / tests (count) / build / console / 360px / themes / keyboard / reduced motion, each pass or fail with detail
Deliberately NOT done: (list)
Risks or open questions: (list)
Commit: (message and hash)
WAITING FOR: go step N+1
```

Never say a step is done if any gate item failed. Be honest about anything untested. If you cannot test something (a real phone, a real login), say so and tell me exactly what to test.

---

## PART 3: STEPS

| Step | What | Phase |
|---|---|---|
| 0 | Verify the starting point and create PROGRESS.md | Gate |
| 1 | Try-yourself examples (public domain and original) | Editor features |
| 2 | Lasso select, move, duplicate, snap | Editor features |
| 3 | MIDI export (single drawing) | Editor features |
| 4 | Practice aids: drone, metronome, count-in | Editor features |
| 5 | Resume link and keyboard shortcuts | Editor features |
| 6 | Song data model, storage and database | Song Studio |
| 7 | Studio screen: arrangement canvas and importing drawings | Song Studio |
| 8 | Song playback engine | Song Studio |
| 9 | Mix master (mixer, master chain, meters) | Song Studio |
| 10 | Song export, sharing and Library integration | Song Studio |
| 11 | Studio polish, performance and accessibility | Song Studio |
| 12 | Final audit of everything | Ship |
| 13 | Deploy config, security headers, CI | Ship |
| 14 | Pre-launch QA on the live site | Ship |
| 15 | Launch | Ship |

(Old numbering for reference: old 28 to 32 are Steps 1 to 5. Old 26 and 27 are Steps 13 and 14. The old Step 33 live jam is cancelled.)

---

### STEP 0: Verify the starting point

**Goal:** know exactly what exists before building more. Do NOT fix anything in this step.

**Do:**
1. Inspect the repo, run `tsc --noEmit`, the tests and the production build.
2. Create `docs/PROGRESS.md`: a checklist of every step in this plan plus the earlier work, with date, commit and notes columns.
3. Verify each item below by reading the code and, where possible, running it. Report **Done / Partial / Missing** with evidence (file paths or test names) for each:
   - Drawing canvas, scales, instrument bank, transport, playhead, ripples, sync-compensated playhead
   - Flow and Notes modes with glide, effects rack, key and scale audition
   - Beat tracks with drum lanes, kits and drum flow styles
   - Dock toolbar, partial eraser, dark and light theme with the sky toggle
   - Library with autosave, the Load gallery on the start page
   - Header fits at 360px with the circled "?" and the app name fully visible; Load page layout has no overlaps
   - Folded shapes (cone, circle) play every line crossed (branch-based playback), with a regression test
   - The app name goes home safely (autosave flushed, audio faded)
   - Accounts, cloud sync, sync badges, share links, public links, delete-account function, keepalive workflow
   - Per-colour keys and "one key for all", remembered in projects and device defaults
   - Loop lengths 1, 2, 4, 8 and real-time audio export (WAV and compressed)
   - PWA: manifest, icons in /public/icons, service worker with NetworkOnly for Supabase, install item in the "?" sheet, share previews, robots and sitemap
   - Step 23 audit results still hold (no gradients, no backdrop-filter, no unicode icons, no innerHTML with user data)
   - Any copyrighted example song data for example a copyrighted demo still in the working tree or git history (search and report)
   - Secrets search (`git grep` and `git log -S` for service_role and key-like strings), `.env.local` untracked
4. Report the bundle sizes, the number of tests, and any console warnings.

**Done when:** PROGRESS.md exists and the report table is complete.

**You check:** read the table. Anything marked Partial or Missing that you believed was done, tell the agent to fix it BEFORE you say go step 1 (it becomes "Step 0b"). Make sure nothing copyrighted remains.

---

### STEP 1: "Try yourself" examples (public domain and original only)

**Goal:** a few example loops on the start page that people can play, edit and save.

**Do:**
1. **Remove copyrighted content.** Search the whole repo and git history for any example built from a copyrighted song (note data, titles, artist names, lyrics, tests, assets). Delete it. Never replace it with imitations or "similar" melodies from memory. Report the search you ran.
2. **Data format** (`src/examples/types.ts`): `ExampleSong = { id, title, credit, licenseNote, bpm, bars (1, 2, 4 or 8), root, scale, keyMode?, tracks: [{ colorId, instrumentId, mode: "flow" | "notes" | "beat", root?, scale?, notes?: [{ midi, startBeat, durBeats, velocity }], hits?: [{ drum, startBeat, velocity }] }] }`. Time is in beats in 4/4.
3. **Exact converter** (`src/examples/notesToStrokes.ts`, pure, heavily tested): every note becomes one stroke. Flow: a nearly horizontal line at the exact centre of that pitch's band from `startBeat` to `startBeat + 0.92 * durBeats` (always a gap of at least 40ms so repeated notes re-articulate). Notes: a short line at the start. Beat hits become taps in the right drum lane at the exact x. Chords become several strokes. Every note must lie inside the track's effective scale: if not, fail loudly in tests, never silently snap.
4. **Round-trip test:** notes to strokes to the real branch builder and scheduler. Scheduled pitches, drums and start times must equal the originals within 1ms.
5. **Ship 3 examples:**
   - (a) Ode to Joy, first phrase (Beethoven, public domain). Fixture: C major, 4/4, MIDI C4=60 D4=62 E4=64 F4=65 G4=67. Notes (start beat, length): E4 0 (1), E4 1 (1), F4 2 (1), G4 3 (1), G4 4 (1), F4 5 (1), E4 6 (1), D4 7 (1), C4 8 (1), C4 9 (1), D4 10 (1), E4 11 (1), E4 12 (1.5), D4 13.5 (0.5), D4 14 (2). 100 BPM, 4 bars, melody on Marimba (Flow). Plus an original bass on Sub Bass: C2 at beats 0 and 8, G2 at beats 4 and 12, each 3 beats long.
   - (b) "Marimba Pop (original)" if it already exists, keep it unchanged. Verify it still works with per-colour keys and loop lengths.
   - (c) One ORIGINAL dreamy arpeggio over a plain I, V, vi, IV progression in C major, 84 BPM, 4 bars, Glass Harmonica or Warm Keys. Compose original motifs only. Do not recall, copy or approximate any existing copyrighted song.
   Each example's data lives in its own small lazy-loaded file.
6. **UI:** on the start page under Load, a quiet "Try yourself" row (max 3 cards, horizontal scroll on phones, no crowding at 360px). Card: a tiny vermilion DM Mono label "TRY YOURSELF", the title in Fraunces, a muted line "Tap to play and explore", and a credit line. Tapping unlocks audio, opens the example as a NEW UNSAVED creation (like a share link) and starts playing. Editing is allowed. The first edit or "Save to my creations" saves a copy. Examples are never modified.
7. **Dev tool (not shipped):** `scripts/midi-to-example.ts`, no dependency (hand-written MIDI parser). Input: a `.mid` path, optional `--bars` and `--bpm`. Output: an ExampleSong file. Merge notes per channel, quantize to 1/32, report tempo, list notes outside the chosen scale, refuse files longer than the bars limit. README note: only use MIDI files you have the right to use. Exclude `scripts/` from the production build.

**Done when:** round-trip tests pass for all examples, no copyrighted content remains, the cards work on desktop and phone.

**You check:** Ode to Joy is instantly recognisable at the right tempo and key (you know the tune). Edit an example and save: the original card is unchanged. The start page is not crowded at 360px. Nothing copyrighted anywhere.

**Commit:** `feat: try yourself examples (public domain and original)`

---

### STEP 2: Lasso select, move, duplicate, snap

**Do:**
1. A third tool in the Draw / Erase segmented control: **Select** (shortcut V), 44px touch target, aria-label.
2. **Selecting:** tap a stroke to select it (generous tolerance, larger on touch). Shift-tap, or an "Add" toggle on touch, adds or removes strokes. **Lasso:** dragging on empty canvas draws a freehand dashed lasso that closes itself. On release, every stroke with at least 50 percent of its length inside is selected, across ALL colours (a "This colour only" toggle restricts it). Alt/Option drag gives a rectangle on desktop. Selected strokes get a thin dashed outline, a bounding box and a move handle. A small chip shows how many are selected.
3. **Actions:** drag to move (x moves in time, y changes pitch, or the drum lane on beat colours; stay inside the canvas; folded shapes move as one piece). Arrow keys nudge by one grid step. Delete. Duplicate (Ctrl/Cmd+D or a button) offsets by one beat. A colour chooser reassigns the selection to another track. Flip horizontally and vertically. Select all (Ctrl/Cmd+A), Esc to deselect. Vertical moves on melodic strokes use each track's effective key.
4. **Snap** toggle (default off): 16th-note grid in x, scale notes in y. State visible in the toolbar.
5. Move, duplicate, recolour, delete and flip are each ONE undo step.
6. **Audio:** debounce schedule rebuilds while dragging (about 150ms), rebuild on release, recompute branches only for changed strokes, no stuck notes, polyphony caps respected.
7. **Touch:** one finger on a selection moves it without scrolling the page, the lasso works with a finger, two-finger gestures stay disabled.
8. Works with beat tracks, folded shapes, the eraser, all loop lengths, autosave, Library, cloud sync and share links.

**Done when:** all of the above works and has tests for the pure parts (hit-testing, lasso inclusion, snapping, move transforms).

**You check:** lasso a cone and a bass line together and move them as one, then duplicate and hear both lines in the copy. Snap makes a rough rhythm land on the grid. Undo and redo restore exactly. 60 strokes stay smooth on your phone.

**Commit:** `feat: lasso select, move, duplicate and snap`

---

### STEP 3: MIDI export (single drawing)

**Do:**
1. "Export MIDI (.mid)" in the Share / Save menu. Hand-written Standard MIDI File writer (format 1, 480 ticks per quarter), no dependency.
2. One MIDI track per colour track, named after its instrument. Tempo from BPM, 4/4, key signature from the base key where possible. In per-colour key mode write each track's key in its track name or a text event.
3. Flow branches become notes: each time the held pitch changes, end the previous note and start the next with a few ticks of overlap. Notes-mode crossings become notes. Folded shapes export as simultaneous notes. Velocity from stroke width.
4. Beat tracks map to the General MIDI drum channel (channel 10): kick 36, snare 38, clap 39, closed hat 42, open hat 46, tom 45, cowbell 56, shaker 70. Flow styles export as the closest notes.
5. Export the loop N times (choose 1, 2 or 4 repeats), current loop length (1 to 8 bars), respect mute and solo. Filename `instruversal-<title>-<bpm>bpm-<date>.mid` (sanitize the title). Works on iPhone Safari (blob download with a visible "Save file" fallback).
6. Tests: writer (variable-length quantities, tempo and track chunks, channel assignment) and a round trip that re-parses the file with the dev MIDI parser and compares notes and times with the schedule.

**Done when:** tests pass and the file opens in a MIDI player.

**You check:** open the `.mid` in an online MIDI player or a DAW: melody, bass and beat match the app (instrument sounds will differ). Try a per-colour-key project and an 8-bar loop.

**Commit:** `feat: midi export`

---

### STEP 4: Practice aids (drone, metronome, count-in)

**Do:** a "Practice" section in the Mixer sheet.
1. **Drone:** toggle for a quiet sustained root note and fifth under the loop (soft pad voice through the master chain, own volume). "Follows": base key, or the selected colour's key (default: selected colour in per-colour mode, base key otherwise). Re-tunes with a short glide on key change, fades in and out over 200ms, does not count toward the polyphony cap.
2. **Metronome:** soft click on every beat (accent on beat one), scheduled on the Transport, own volume. Excluded from audio and MIDI export unless "Include metronome" is ticked.
3. **Count-in:** one bar of clicks before playback from a stopped state, with a clear 1 2 3 4 overlay (reduced-motion safe).
4. Device settings only (localStorage with the `instruversal:` prefix).
5. Stays in sync with the latency-compensated playhead, works at every loop length, no stuck notes on pause, no drift.

**Done when:** works on desktop and phone with and without a beat track.

**You check:** drone follows a key change; metronome stays on the beat with your Bluetooth Sync offset set; count-in only happens when starting from stopped.

**Commit:** `feat: drone, metronome and count-in`

---

### STEP 5: Resume link and keyboard shortcuts

**Do:**
1. **Resume:** when I return to the start page from a creation that has strokes (via the app name), show a quiet link under the Load button: "Resume <title>". It unlocks audio and reopens that creation. It disappears after 30 minutes or when I open something else. It also shows on a fresh visit if the last-edited creation was edited in the last 24 hours.
2. **Shortcuts:** a "Keyboard shortcuts" list in the "?" sheet (desktop only): Space play and pause, D draw, E erase, V select, Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z redo, Ctrl/Cmd+D duplicate, Ctrl/Cmd+A select all, arrows nudge, Esc closes sheets. Every listed shortcut must work and never fire while typing in a text field. (Studio shortcuts are added in Step 7.)

**You check:** go home from a drawing and resume it in one tap. Shortcuts all work.

**Commit:** `feat: resume link and shortcuts`

---

## PHASE: SONG STUDIO (Steps 6 to 11)

### What the Song Studio is
Today one drawing is a short loop (1 to 8 bars). The **Song Studio** is a second canvas, a **timeline**, where I import my saved drawings and arrange them one after another (and on top of each other) to build a long song, then mix it with a mixer and a master section and export it.

Concepts (keep these names):
- **Creation (sketch):** an existing saved drawing loop.
- **Asset:** a snapshot copy of a creation stored inside a song (so the song never changes if the sketch is edited later, and sharing and cloud sync work without the original).
- **Lane:** a horizontal row in the timeline (1 to 6 lanes) with its own mixer channel.
- **Placement (clip):** one asset placed on a lane from a start bar for a number of bars. The drawing's loop repeats to fill the placement.
- **Song:** assets + lanes + placements + markers + master settings.

Song data model (v1):
```
Song = {
  schemaVersion, id, title,
  bpm (50-180), beatsPerBar: 4, totalBars (derived, max 128),
  assets: { [assetId]: { name, project: ProjectData, sourceCreationId?, sourceUpdatedAt? } },   // max 12 unique assets
  lanes: [{ id, name, volumeDb, pan, mute, solo, sendReverb, sendDelay }],                       // 1 to 6
  placements: [{ id, assetId, laneId, startBar, lengthBars, offsetBars, gainDb, transpose, fadeInBars, fadeOutBars, mute }], // max 200
  markers: [{ id, bar, label }],                                                                // max 40
  master: { gainDb, eq: { lowDb, midDb, highDb }, compressor: { on, thresholdDb, ratio, attackMs, releaseMs, makeupDb }, effects: <existing effects rack settings>, preset },
  loopRegion: { startBar, endBar } | null
}
```
`offsetBars` is where inside the drawing's own loop the placement starts (used when a placement is trimmed from the left or split, so the musical phase continues). Song tempo is global: every asset plays at the song BPM. Transpose is in semitones and only affects melodic (non-drum) notes.

---

### STEP 6: Song data model, storage and database

**Goal:** the foundation only. No Studio UI yet.

**Do:**
1. `src/song/types.ts` and `validateSong`: clamp every number, enforce limits (6 lanes, 12 assets, 200 placements, 40 markers, 128 total bars, title length, no unknown keys), validate each asset's project with the existing `validateProject`, reject songs over 3 MB serialized, never crash on bad data. `schemaVersion` plus a migration function.
2. Pure helpers with tests: `songLengthBars`, placement overlap detection (placements on the same lane must not overlap), `findFreeSlot(lane, startBar, lengthBars)`, `splitPlacement(placement, atBar)` (maintains `offsetBars`), `trimPlacementLeft/Right`, `createSongFromCreation(creation)`, `addAsset(song, creation)` (dedupes by `sourceCreationId` + `updatedAt`), `removeUnusedAssets`.
3. **Storage interface** `SongStore` (list, get, save, remove) parallel to `CreationStore`. `LocalSongStore` in IndexedDB (a new object store `songs`, DB version bump with a safe upgrade that keeps all existing data). Autosave with debounce (never blocks drawing or audio), `navigator.storage.persist()` already requested. Cap at 30 local songs.
4. **Cloud:** `CloudSongStore` behind the same interface, local-first, 2 second debounced push, `pagehide` and `visibilitychange` flush, offline queue, conflict copies named "Title (from another device)", reuse the existing sync badges.
5. **SQL (show me, do not run):** `supabase/migrations/002_songs.sql`. Table `songs`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade default auth.uid()`, `title text` (1 to 80 chars), `song jsonb` with a size check (at most 3,000,000 bytes), `preview jsonb` (compact timeline preview: lanes and block positions and colours, at most 20 KB), `bpm int`, `total_bars int`, `is_public boolean default false`, `public_slug text unique`, `schema_version int`, `created_at`, `updated_at` with a trigger. Index on `(user_id, updated_at desc)`. A limit of 20 songs per user. Row Level Security with the same policy pattern as `creations` (owner full access, anon select only where `is_public`). Review the policies for holes and explain each in a comment.
6. Compact preview generator `buildSongPreview(song)` (pure, tested).
7. Update the privacy sheet text to mention songs.

**Done when:** tests pass (validators with hostile input, helpers, store round trips, migration), the SQL file exists, and nothing visible changed in the app yet.

**You check:** read the SQL carefully (RLS enabled, size limits, per-user limit). Then run it yourself in the Supabase SQL editor and confirm the table appears with RLS on. The app should look and behave exactly as before.

**Commit:** `feat: song data model, local and cloud storage`

---

### STEP 7: Studio screen. Arrangement canvas and importing drawings

**Goal:** a timeline where I can bring in drawings and arrange them. No sound from the song yet (Step 8), except a preview when adding a clip.

**Do:**
1. **Routes and entry points:** `#/studio/<songId>` and `#/studio` (list or new). Entry points: a "Songs" tab in the Library with a "New song" button; a quiet "Open Studio" link on the start page under Load; "Add to song..." in the editor's Share / Save menu (choose a song or "New song", the drawing is added at the end). Nothing new in the editor header. The app name still goes home safely.
2. **Layout (desktop):** top bar (Back to Library, editable song title, BPM stepper, Play/Pause, Stop, time readout in bars and mm:ss, zoom - and +), the **timeline** (ruler in bars with markers, lanes with headers, playhead), and a bottom inspector area. **Phone:** the timeline fills the screen, lane headers collapse to small chips (name, mute, solo), the inspector and the picker are bottom sheets, a hint says "Landscape gives you more room" (do not force rotation). Both themes, paper-and-ink style, no gradients.
3. **Timeline:** horizontal scroll and zoom (zoom buttons, Ctrl+wheel on desktop, pinch inside the timeline on touch with the page zoom still disabled), bar and beat grid that adapts to the zoom level, snapping to bars (and to beats when zoomed in), a draggable playhead, a loop region (drag on the ruler), markers (tap the ruler to add "Intro", "Verse"... editable names, text inserted with textContent), and an empty state in the app's voice ("Nothing here yet. Add a drawing.").
4. **Clips:** each placement is a rounded block showing the drawing's colourful thumbnail (reuse the thumbnail renderer, fit to the block, repeated per loop with faint loop dividers), the title, and its length. Edit: drag to move (snap to bars, may change lane), drag the right edge to extend or shorten (loops repeat to fill), drag the left edge to trim (updates `offsetBars`), split at the playhead (S), duplicate (Ctrl/Cmd+D), delete, multi-select with a lasso or Shift-click. Overlap on a lane is not allowed: a drop that would overlap snaps to the nearest free slot or returns to where it was. Colour of the block edge uses the asset's most-used track colour.
5. **Touch editing:** long-press (about 300ms) picks up a clip so normal dragging scrolls the timeline; handles are at least 44px; selected clips show a clear outline.
6. **Importing drawings:** an "Add drawing" button opens a picker (bottom sheet on phone, side panel on desktop) listing my Library creations as colourful cards (search, newest first) with a Preview button (plays the drawing using the existing preview engine, through the master chain) and an Add button. Add places the clip at the playhead (snapped to a bar) on the selected lane, or the first lane with a free slot, with `lengthBars` equal to the drawing's loop length (so one full loop). Adding the first clip sets the song BPM from that drawing. On desktop, dragging a card onto a lane works too. Creating the asset stores a snapshot copy (dedupe). In the inspector, "Update from original" shows when the source creation changed since the snapshot; "Edit drawing" opens the asset in the editor and, on return (a clear "Back to song" button), saves the changes back into the song's asset only.
7. **Inspector (selected clip):** name, start bar, length in bars, gain (dB), transpose (semitones), fade in and out (bars), mute, "Repeat" shortcut (set length to N loops), and "Replace drawing". Numbers are typed or stepped.
8. **Lanes:** add and remove lanes (1 to 6), rename, reorder by dragging the header handle. Lane headers show name, mute, solo (the full mixer arrives in Step 9).
9. **List view:** a "Timeline | List" toggle. List view shows each lane with its clips as rows with form fields (start, length, gain...) and move up/down buttons. It is the accessible and precise way to edit on a phone.
10. **Undo and redo** for every Studio edit (a separate stack per open song, each action one step), Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z. Autosave through `SongStore` with a calm "Saved" status. Studio shortcuts listed in the "?" sheet: Space play/pause, S split, Delete, Ctrl/Cmd+D duplicate, arrows move by one bar, Shift+arrows resize, +/- zoom, Esc deselect.
11. **Accessibility:** timeline blocks are focusable buttons with aria-labels ("Marimba Pop, lane 1, bar 5, 4 bars"), keyboard move and resize, polite live announcements, focus returns to the opener when sheets close, reduced motion respected.

**Done when:** I can create a song, import several drawings, arrange, trim, split, duplicate, add markers, undo everything, close and reopen the song and find it unchanged.

**You check:** import 3 different drawings, put two on the same lane one after another, stack one on a second lane. Trim the left edge, split in the middle, undo it all. Close the tab and reopen: everything is saved. On your phone: long-press a clip to move it, use the picker sheet, switch to List view. Check 360px, landscape, both themes. Look for overlapping text.

**Commit:** `feat: song studio arrangement canvas and drawing import`

---

### STEP 8: Song playback engine

**Goal:** press Play in the Studio and hear the whole arrangement in time.

**Do:**
1. Reuse the existing scheduling code. Refactor ONLY what is needed so event generation is a **pure function** `buildProjectEvents(project, options)` that returns scheduled events (time in bars/beats, pitch, drum, duration, velocity, track) without touching Tone. The editor must keep working exactly as before (regression tests prove the same events as today for existing projects).
2. **Song scheduler:** for each placement, generate its events for the region (looping the drawing's loop to fill `lengthBars`, starting at `offsetBars`, cutting notes at the region end with a short fade), apply `transpose` (melodic only), per-placement gain and fades (as velocity or gain automation), and place them at `startBar` on the song's timeline at the **song BPM**. Muted placements and muted or non-soloed lanes are skipped or silenced.
3. **Engine:** schedule on `Tone.Transport` as `Tone.Part`s per placement (or per lane), built only for a window around the playhead (for example the current bar plus the next 2 to 4 bars) and extended as the song plays, so a 128-bar song does not allocate everything at once. Rebuild only what changed after an edit (debounced about 150ms), without restarting the Transport and without stuck notes. Seeking, looping a region, pausing and stopping all release voices with short fades.
4. **Voices and instruments:** each lane has its own instrument instances for the asset's colour tracks, created lazily when a placement is within the look-ahead window and disposed when no longer needed. Respect the polyphony setting (Low 4, Medium 8, High 12 flow voices) across the whole song using the existing voice allocation. If a moment exceeds the cap, thin the lowest-priority voices and show the existing calm "thinned" note. Light mode forces Low.
5. **Per-colour keys, branch playback, beat tracks** inside every asset work exactly as in the editor (every line a playhead crosses plays).
6. **Effects:** the song uses ONE master effects rack (song-level settings from `song.master.effects`). Per-asset effect settings stored in the asset's project are ignored in the song (the inspector says so in one short line).
7. **Playhead and visuals:** the Studio playhead is drawn from `Tone.Transport` with the same latency compensation and Sync offset as the editor. Clips that are sounding get a gentle highlight (reduced-motion safe). Auto-scroll follows the playhead during playback (a "Follow" toggle, default on, pauses when I scroll manually). Play from the playhead, Space toggles, Stop returns to the start (or loop start). Count-in, metronome and drone from Step 4 work in the Studio (metronome and count-in follow the song BPM; drone follows the base key of the first clip, with a note).
8. **Transitions between clips:** at clip boundaries release voices with a short fade (about 30ms) so nothing clicks, while reverb and delay tails keep ringing through the master.
9. **Resource safety:** hard limits so a phone does not choke: at most 6 lanes sounding at once, at most 12 assets with live instruments, instruments of finished placements disposed within a few seconds. Report timings for a 6-lane stress song.
10. Clean up: leaving the Studio, going home, signing out or switching song stops and disposes everything with no leaks (test 20 enter/leave cycles).

**Done when:** a multi-lane, multi-section song plays correctly from any position, loops a region, and survives edits while playing.

**You check:** build a 16-bar song: intro (one drawing), a section where two drawings play together on two lanes, then a section with a beat added. Listen for: correct order and timing, no clicks at boundaries, no stuck notes after pausing in the middle or deleting a playing clip, and the playhead matching what you hear (check with Bluetooth if you use it). Seek around and loop a region. Edit a clip while playing. Test on your phone for crackling and heat after 2 minutes.

**Commit:** `feat: song playback engine`

---

### STEP 9: Mix master

**Goal:** a real mixer and mastering section for songs.

**Do:**
1. **Signal path:** each lane channel (`Tone.Channel`: volume, pan, mute, solo) feeds a **song bus**; two shared send buses (reverb and delay) return into the song bus; the song bus goes into the **master chain**: song effects rack (existing, song-level settings) then a 3-band EQ (low, mid, high, around -12 to +12 dB) then a compressor (on/off, threshold, ratio, attack, release, makeup gain) then master gain then the existing brickwall limiter (ceiling -0.5 dB, always last, not user-removable) then destination. All parameter changes use short ramps (about 50ms) so there are no clicks. Solo overrides mute, multiple solos allowed.
2. **Mixer UI ("Mix" panel):** a collapsible panel at the bottom of the Studio (desktop: horizontal channel strips with vertical faders; phone: a bottom sheet with a horizontal row of channel strips and large 44px+ sliders you can drag without scrolling the sheet). Each lane strip: name, volume fader (dB readout in DM Mono, double-tap resets to 0 dB), pan, M and S buttons, reverb send and delay send, a small level meter. A **Master** strip: gain, level meter with a peak-hold marker, EQ (three small sliders with a reset), compressor controls (collapsed under "Glue"), and the effects rack opening as in the editor.
3. **Per-clip controls** (already in the inspector): gain, fades, transpose. Add per-clip "Mute track colours" (choose which of the drawing's colours play in that clip, so one drawing can contribute only its bass or only its beat). Store as part of the placement (a small `mutedColors` list, validated).
4. **Meters:** use `Tone.Meter` on lanes and master. Draw at no more than 30fps with requestAnimationFrame only while the Mix panel is visible and playing, pause when hidden. Show peak with a hold. Add a **clip warning** (a small red-pigment dot on the master meter that stays lit for 2 seconds) and a text note "Quiet it down a little" if the master peaks above -1 dB. Also an approximate loudness readout labelled "approx. loudness" (RMS-based, honest that it is not true LUFS).
5. **Mastering presets** (text chips, applied with a smooth ramp, never hide the individual controls): "Clean" (flat EQ, light glue), "Warm" (low shelf +2, high -1.5, gentle glue), "Bright" (high +2, light glue), "Loud" (stronger glue, makeup gain, still limited), "Lo-fi" (high cut and low cut feel, soft glue). Each is a small data object so more can be added. The current preset name shows; changing any control marks it "Custom".
6. **Auto-balance helper:** a button "Balance lanes" that sets sensible starting lane volumes (beat slightly lower than melody, bass centred, pads wider) and lowers the master gain if the loudest section peaks above -3 dB. It is an undoable single step and explains what it did in one line.
7. **Persistence:** everything is saved in the song (`lanes` and `master`), validated with clamped ranges, included in autosave, cloud sync, share links and exports. Mix changes are undoable (merge continuous slider drags into one undo step).
8. **Performance and safety:** report CPU cost of the reverb and delay sends, the EQ and the compressor on a mid-range phone with 6 lanes. If crackling occurs, reduce the send reverb quality and tell me. Light mode disables the send reverb. Nothing in the mixer may click, pop or cause timing drift. Everything is disposed on leaving the Studio.
9. **Accessibility:** faders are real range inputs with labels and dB values (aria-valuetext), keyboard arrows adjust by 0.5 dB (Shift for 3 dB), M and S toggles use aria-pressed, meters have text alternatives (a hidden live region that announces clipping), both themes, reduced motion respected.

**Done when:** the mixer works live during playback and is saved with the song.

**You check:** during playback pull a fader down and up (no clicks), solo and mute lanes, add reverb send to one lane, try each mastering preset, push the master gain up and see the clip warning, use "Balance lanes" and undo it, mute one colour in a clip. Reload the song: the mix is unchanged. On your phone: can you drag faders without the sheet scrolling away? Does it stay smooth?

**Commit:** `feat: mix master with channel strips, master chain, meters and presets`

---

### STEP 10: Song export, sharing and Library integration

**Do:**
1. **Export audio:** "Export audio" in the Studio menu. Record the real master output (after all effects and the limiter) in real time, for the whole song or for the loop region (a chooser), plus a 2 second tail. Reuse the Step 24 exporter (WAV 16-bit stereo as the main option and the compressed MediaRecorder option where supported). Progress bar with the remaining time, a Cancel button, edits locked while recording, a screen Wake Lock held during recording, a warning if the tab is hidden or the phone locks, the clip check ("Quiet it down a little" with a re-export that lowers the master by 3 dB). Filename `instruversal-song-<title>-<bpm>bpm-<date>.wav`. Works on iPhone Safari with the visible "Save file" fallback.
2. **Export MIDI:** the whole song to a `.mid` using the Step 3 writer: one MIDI track per lane and colour (named "Lane 1 / Pluck"), tempo from the song BPM, markers as MIDI markers, transpose and clip gain applied, drums on channel 10, mute and solo respected.
3. **Library integration:** the Library gets two tabs, **Sketches** and **Songs**. Song cards show the compact timeline preview (lanes as rows, clips as coloured blocks in track pigments, theme-aware SVG), title, length ("32 bars · 1:25"), BPM and sync badges. Card menu: Open, Rename, Duplicate, Delete (undo window), Share. The start-page "Load" gallery stays for sketches. A saved song also appears under "Resume" if it was the last thing edited.
4. **Sharing:** the Share modal for songs with "Anyone with the link can listen" (public slug), link `#/s/<slug>`. The public page is a read-only player: title, big Play button, the timeline view (no editing), a simple mix-safe volume slider (device volume only), and "Remix to my songs" (copies the song into the visitor's own library: local if signed out, cloud if signed in). Public song loading validates with `validateSong` and never executes anything from the data. Private songs never leak (test with the anon key). A "Report" mailto link on public pages.
5. **Cloud:** songs sync like creations (badges, offline queue, conflict copies). The first-login migration sheet also offers local songs.
6. **Privacy sheet and README** updated to describe songs and public links.

**Done when:** a song can be exported to audio and MIDI, saved in the cloud, opened on another device, shared publicly and remixed.

**You check:** export a 32-bar song to WAV (it takes real time: note the length), play the file in another player and compare it to the app. Export MIDI and open it in a MIDI player. Open the song on your phone while signed in. Share the public link and open it in a private window: it plays; "Remix" makes a copy. Check that a private song is not reachable. Test with two accounts.

**Commit:** `feat: song export, public sharing and library songs tab`

---

### STEP 11: Studio polish, performance and accessibility

**Do (no new features):**
1. Stress test: 6 lanes, 12 assets, 60 bars, 8-bar drawings with beats and folded shapes. Report frame rate while scrolling and zooming the timeline, schedule rebuild time after an edit, memory after 20 open and close cycles, and audio stability for 5 minutes on a phone. Fix the worst offenders (virtualize off-screen clips, cache thumbnails, throttle meters, reduce DOM nodes).
2. Edge cases: empty song, one-bar song, deleting an asset's source creation, a creation edited after import, missing instrument ids, 8-bar assets cut mid-loop, transposing out of range, deleting a clip while it plays, undo spam during playback, tab hidden then shown, phone lock and unlock, signing out while the Studio is open, going offline and online. No crashes, no stuck notes, calm messages.
3. Design pass at 360, 390 and 430px portrait and landscape and on desktop, both themes: no overlaps, readable text, consistent radii and spacing, empty and loading states (skeletons, no spinners), 44px targets, focus visible. Rewrite generic copy.
4. Accessibility pass: keyboard-only use of the whole Studio (timeline and list view), screen reader announcements, contrast 4.5:1 text and 3:1 controls, reduced motion.
5. Security pass: validators and SQL limits still hold, RLS for songs checked with two accounts and the anon key, no `innerHTML` with user data, no secrets.
6. Update the README (features, Song Studio explanation, how to use) and the "?" help sheet with a short "How the Studio works" section.

**Done when:** the numbers and checks above are reported and fixed.

**You check:** use the Studio for 10 minutes as a user would: make a real song. Hand it to a friend on a phone and watch where they hesitate. Write down annoyances and give them to the agent as a short list.

**Commit:** `chore: studio polish, performance and accessibility`

---

## PHASE: SHIP (Steps 12 to 15)

### STEP 12: Final audit of everything

**Do (no new features).** Review the real code and the running app on desktop and phone widths (360, 390, 430) in both themes. Output a table: issue, where, fix.
1. **Design:** tokens only, no gradients or glass or emoji icons, consistent radii and spacing, correct fonts, header at 360px (name fully visible, circled "?", nothing overlapping), Load page, Studio, Mixer, all sheets and modals. Every state exists (hover, focus, active, disabled, loading, empty, error).
2. **Audio:** loudness balanced across instruments, drum kits, songs and effects; nothing clips with 6 lanes busy; edge cases (loop and clip boundaries, rapid undo, tab hidden, phone locked, going home and back 20 times) leave no stuck notes or drift; the sync-compensated playhead still matches.
3. **Security:** secrets search (working tree and history), RLS for `creations` and `songs` re-tested (wrong user_id, reading private rows, editing someone else's public row, oversized payloads), every validator hit with hostile data (project, song, share link, import), no `eval` or `insertAdjacentHTML`, `innerHTML` justified or removed, third-party requests listed (only own domain, Google Fonts, Supabase). Confirm the privacy sheet matches reality exactly.
4. **Accessibility:** keyboard-only use of editor, Library, Load gallery, Studio and sheets; aria on icon buttons and toggles; contrast; reduced motion.
5. **Code health:** dead code, console logs, unused files and dependencies removed; no unexplained `any`; all Tone nodes and WebGL resources disposed; listeners removed; `tsc` clean; all tests pass; production build passes; bundle sizes per chunk (the Studio, export and examples code should be lazy-loaded).
6. **Docs:** README, `.env.example`, PROGRESS.md up to date.

**You check:** read the table, look at the fixes list, test the app on your phone for 10 minutes.

**Commit:** `chore: final audit fixes`

---

### STEP 13: Deploy config, security headers, CI (HOST = Cloudflare Pages)

**Do not deploy anything yourself and do not touch my accounts.** Prepare files and tell me exactly what to click.
1. **Build:** build command `npm run build`, output `dist`, Node pinned (`.nvmrc` plus an `engines` field). Hash routing means no SPA rewrite rules (confirm and explain; routes include `#/studio/<id>` and `#/s/<slug>`). Env variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, documented with placeholders in `.env.example`.
2. **Headers (`public/_headers`):** check the current Cloudflare docs for exact syntax and tell me if anything differs for Workers static assets.
   - Caching: hashed files under `/assets/` get `public, max-age=31536000, immutable`. `index.html`, `sw.js`, any `workbox-*.js`, the registration script and `manifest.webmanifest` get `no-cache`. Match the real file names the build produces.
   - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a Permissions-Policy that denies camera, microphone, geolocation, payment and usb but does NOT block anything the app uses (the app uses Screen Wake Lock: allow `screen-wake-lock` for self; check the code for every other browser feature in use, such as vibrate, clipboard write, fullscreen).
   - Do NOT add Cross-Origin-Embedder-Policy or Cross-Origin-Opener-Policy (COEP would block Google Fonts and Supabase, COOP can break login flows, and the app does not need cross-origin isolation). Explain this in a comment.
   - Content-Security-Policy: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; manifest-src 'self'; connect-src 'self'` plus my Supabase https URL and its wss address from the env variable at build time; `base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'`.
   - Inline scripts (the theme flash-prevention script and any inline service worker registration) would be blocked by `script-src 'self'`. Check the built `index.html`: move the theme script to a tiny external file loaded synchronously in `<head>`, and make sure PWA registration is NOT injected inline. Confirm no flash of the wrong theme.
   - Ship the CSP first as `Content-Security-Policy-Report-Only`. Test everything with the console open (editor, Studio, audio, export download, WebGL gallery, theme toggle, Supabase login, fonts online and offline, service worker update, share links, install prompt), fix every violation, then switch to enforcing and tell me when you did.
3. **CI (`.github/workflows/ci.yml`):** on pull requests and pushes to main: checkout, setup-node (pinned version, npm cache), `npm ci`, `tsc --noEmit`, `npm test`, `npm run build`. Deploy nothing. The build fails without `VITE_SITE_URL`, so set harmless PLACEHOLDER values for the CI build step only (`VITE_SITE_URL=https://example.com`, `VITE_SUPABASE_URL=https://placeholder.supabase.co`, `VITE_SUPABASE_ANON_KEY=placeholder`). Never put real keys in workflow files. Keep the keepalive workflow separate. Add `.github/dependabot.yml` (weekly npm and Actions, grouped, max 5 open PRs) and a non-failing `npm audit --omit=dev` step (explain how to read it).
4. **`DEPLOY.md`:** exact click-by-click for me: connect the GitHub repo to Cloudflare Pages, production branch `main`, the three env variables (with the real live address as `VITE_SITE_URL`), deploy; then the Supabase steps (Site URL, redirect URLs for the live address and localhost, Google OAuth authorized origins if used, custom SMTP, run `001` and `002` SQL if not already run); then a post-deploy test list (install on Android, Add to Home Screen on iPhone, offline test, login test, share link and public song link test, headers check in DevTools). Include rollback, rotating the anon key, and checking Supabase usage.
5. **Verify locally** with `npm run build` and `npm run preview`: CSP report-only shows zero violations (list every one found and fixed), no inline scripts in the built `index.html`, filenames match the `_headers` rules, login works against the preview, offline works, `tsc`, tests, build and CI file all pass.

**You check:** read DEPLOY.md. Check the CI run is green on GitHub after you push the branch. Then follow DEPLOY.md to deploy; open the live address on your phone and run its post-deploy tests. In DevTools, Network tab, click the document and confirm the CSP and caching headers.

**Commit:** `chore: deployment config, security headers and ci`

---

### STEP 14: Pre-launch QA on the live site

**You do first (about 40 minutes, real devices):**

| Device | Test |
|---|---|
| iPhone Safari | Draw, play, eraser, lasso, Flow and Notes, beats, effects, per-colour keys, 8-bar loop, export, Add to Home Screen, silent switch, lock and unlock, rotate, Studio (import, arrange, mix, export) |
| Android Chrome | Same, plus the Install prompt |
| Desktop Chrome, Firefox, Safari | Mouse, trackpad, keyboard shortcuts, resize the window, Studio |
| Slow network (DevTools throttling) | First load, login, sync |
| Offline | Open, draw, play, open a song, reconnect and sync |
| Two accounts | Private sketches and songs stay private, public links, remix |
| Reduce motion on | Gallery, toggle, Studio |

Hand the phone to a friend and say nothing. Time how long they take to make their first sound. Write down where they hesitate.

**Agent, on the deployed site (do not add features):**
1. Lighthouse (mobile and desktop) on the start page, editor, Load gallery and Studio. Report scores, fix cheap and safe issues. Targets: performance 90+, accessibility 95+, best practices 95+, installable PWA.
2. Automated accessibility check (`npx @axe-core/cli` or equivalent, not added as a dependency) on the main screens in both themes. Fix serious and critical issues.
3. Console check on every screen and flow (sign-in, sign-out, sharing, remixing, export, Studio, loop changes, service worker update, offline). Confirm the CSP is enforcing with zero violations.
4. Network check: only my own domain, Google Fonts and Supabase; no trackers; report first-load and repeat-visit transfer.
5. Failure paths with calm human messages and never a blank screen: audio blocked, WebGL unavailable (HTML fallback), IndexedDB blocked (private mode), Supabase unreachable, expired login, quota exceeded, corrupted share link, deleted public creation or song, very old browser.
6. Report a GO or NO-GO list with blocking problems.

**You check:** fix every blocking item before launch.

---

### STEP 15: Launch

**Agent tasks:**
1. README final: live link, features, light and dark screenshots (ask me to supply them; do not fabricate), how it works, run locally, env variables, credits (play_music_theory inspiration, Tone.js, ogl, the sky toggle and gallery components with their sources and licences as I provide them), licence.
2. Confirm `docs/PROGRESS.md` is complete and the repo contains nothing copyrighted or secret.

**You do (manual checklist):**
- [ ] Live site works at its address. Magic-link login works on the live site.
- [ ] **Custom SMTP for Supabase email** (the built-in sender has very low limits): add a provider (Resend, Postmark, Brevo or similar, check each one's current free limits), verify the sender, send yourself a test login email.
- [ ] Supabase Site URL and redirect URLs point to the live address (plus localhost). Google OAuth authorized origins updated if used.
- [ ] Share links and public song links open on another phone.
- [ ] Privacy note reviewed by you, says only what is true, with a contact email. (This is not legal advice. Get proper advice if you grow or collect more data.)
- [ ] GitHub repo description and topics set (music, web-audio, tonejs, creative-coding, typescript, vite, drawing, sequencer, daw).
- [ ] Supabase: check the usage page, confirm the keepalive workflow runs, export a manual backup of `creations` and `songs`.
- [ ] Optional: privacy-friendly analytics (add its script domain to the CSP first), a custom domain, a short demo video of drawing a cone and hearing both lines, and arranging a song.
- [ ] Share with 3 to 5 people and collect feedback before posting widely.

---

## TROUBLESHOOTING PROMPTS (give these to the agent when needed)

**Build or CI fails**
```text
The build (or CI) fails with this output: [paste]. Find the root cause, fix it with the smallest safe change, and re-run tsc, tests and the production build. Explain what was wrong. Do not disable checks or loosen types.
```

**Deployed site is blank or old**
```text
The deployed site shows a blank page or an old version. Check in order: console errors, CSP report entries for blocked scripts or connections, service worker caching of index.html or old chunks, wrong asset paths, missing env variables on the host (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE_URL). Fix the cause, add safe cleanup for old service worker caches, and tell me exactly what to redeploy or clear.
```

**Login works locally but not live**
```text
Sign-in works on localhost but fails on the live site. Check: Supabase Site URL and redirect URLs contain the exact live address, env variables are set on the host, CSP connect-src includes the Supabase URL and wss address, the PKCE ?code= is handled and cleaned from the address, the service worker does not intercept auth requests, the email link opens the same origin, custom SMTP is configured. Show me the exact settings to check.
```

**Audio problems on phones**
```text
Audio is silent, delayed, crackling or cuts out on my phone. Check: Tone.start() inside a direct user gesture, AudioContext state after interruptions (call, lock, tab hidden) and resume handling, the silent switch hint, latency and my Sync offset, polyphony cap and light mode, effects and mixer CPU cost, 8-bar loops and large songs, rebuilding schedules too often. Log timings and fix with the smallest safe change.
```

**Layout overlap on a device**
```text
Something overlaps or is clipped at [width]px on [device]. Reproduce at that width in portrait and landscape with safe-area insets, find the CSS cause (fixed widths, missing min-width: 0 on flex children, absolute positioning, 100vh instead of 100dvh), fix it without changing other layouts, and test at 360, 390 and 430 in both themes.
```

**Something plays wrong (editor or Studio)**
```text
When I [describe what I did] I hear [describe]. I expected [describe]. Log the strokes, branches, scheduled events (time, pitch, voice slot, key used, lane, placement) for exactly this case, find which step is wrong (branch splitting, quantization, per-colour key, placement offset, transpose, scheduling window, voice allocation, mixer, effects), fix it, and add a regression test.
```

**Song Studio feels slow**
```text
The Studio is slow when [describe]. Profile it. Virtualize off-screen clips, cache clip thumbnails, avoid layout thrash while dragging (use transforms), throttle meters, reduce DOM nodes, build the audio schedule only for a window around the playhead, and report before and after frame times and rebuild times.
```

---

## IDEAS FOR LATER (NOT NOW, do not build)
Live jam (real-time multiplayer), tempo changes inside a song, volume automation curves, audio import, in-app MIDI import, public gallery with likes.
