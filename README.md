# Handball Scout Pad

Static web app for live handball scouting and match event entry.

## Local use

You can open [index.html](/c:/tmp/codex_playground/HandbollGameAnalysis/index.html) directly in a browser.

Bundled sample PDF folders are embedded into the static app, so they also work when opening the app directly from disk.

If you add or replace files under `SamplePDFs`, regenerate the embedded bundle with:

```bash
node scripts/embed-sample-pdfs.mjs
```

Running from a local static server is still useful during development:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy on Render

This repo is configured for Render Static Site deployment with [render.yaml](/c:/tmp/codex_playground/HandbollGameAnalysis/render.yaml).

### Render setup

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Render, create a new Static Site from the repository.
3. Render should detect `render.yaml` automatically.
4. If you configure it manually, use:
   - Build Command: empty
   - Publish Directory: `.`

## Current app scope

- Static frontend only
- No backend or database yet
- Match data is in-memory in the browser session

## Profixio import helper

This repo now includes a local CLI helper for Profixio timeline imports:

```bash
node scripts/profixio-import.mjs list --team-id 1399914 --team-url https://www.profixio.com/app/leagueid17808/teams/1399914
node scripts/profixio-import.mjs timeline --team-id 1399914 --match-id 32357739 --team-url https://www.profixio.com/app/leagueid17808/teams/1399914
```

What it does:

- Lists matches for a Profixio team page and marks which ones are played
- Opens a selected `expandmatch` view
- Extracts the signed EMP API URL from the page
- Returns a minimal per-team timeline JSON with fields such as event id, action, player, clock, score, and comment

Important constraint:

- This is a local script, not an in-browser importer. The current app is static, while Profixio timeline data is exposed through a signed URL discovered from the expanded match page. That is practical from a local script, but not a robust direct browser import path for this repo as-is.
