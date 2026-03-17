# Handball Scout Pad

Static web app for live handball scouting and match event entry.

## Local use

Open [index.html](/c:/tmp/codex_playground/HandbollGameAnalysis/index.html) in a browser.

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
