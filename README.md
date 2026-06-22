# Caption Splitter (V2)

Interactive caption editor built on the **word-table model**: words are immutable
atoms (id + raw Premiere start/end); cards only reference word ids plus a
highlight span, and every in/out/duration is derived live. Exports the per-row
captions JSON that `CaptionBuilder.jsx` reads, plus a lossless word-table for
re-editing.

V2 adds: WAV/MP3 audio with a real waveform + segment playback, word/card
**timing merges**, the script aligned **in the timeline**, and **undo/redo**
(Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).

Everything runs in the browser — transcripts, audio, and exports never leave the
visitor's device. No backend.

## Requirements
- Node.js 18+ and npm

## Run locally
```bash
npm install
npm run dev
```
Open the printed `localhost` URL.

## Build for the web
```bash
npm run build      # outputs a static site to dist/
npm run preview    # serve that build locally to check it
```
`dist/` is a plain static folder (HTML + JS + CSS). Host it on any static host.

## Deploy
Any static host works. The build uses relative asset paths (`base: "./"` in
`vite.config.js`), so `dist/` works at a domain root or a sub-path without changes.

- **Netlify / Vercel / Cloudflare Pages (Git):** import the repo; build command
  `npm run build`, publish directory `dist`. Pushes auto-deploy.
- **Drag-and-drop:** run `npm run build`, then drag the `dist` folder onto
  app.netlify.com/drop.
- **GitHub Pages:** publish `dist`. (Relative base means no extra config needed;
  if you prefer an absolute base for a project site, set `base: "/repo-name/"`.)

## Notes
- Serve over https:// or localhost — never `file://`. The audio waveform uses
  the Web Audio API, which is blocked on `file://`.
- A prebuilt `dist/` is included so you can deploy without building first; rerun
  `npm run build` after any edit to `src/CaptionSplitter.jsx`.
- Dependencies are version-pinned (React 18.3.1, lucide-react 0.460.0,
  Vite 5.4.10) for reproducible builds.

## Project layout
```
index.html              app shell (mount point)
vite.config.js          Vite + React plugin, relative base
src/main.jsx            renders <CaptionSplitter />
src/CaptionSplitter.jsx the tool (edit here)
dist/                   prebuilt static site (regenerate with npm run build)
```
