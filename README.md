# SlideStudio

## Files

- [README.md](README.md): this file, the entry point
- [AGENTS.md](AGENTS.md): rules for AI agents and LLMs (identical to CLAUDE.md)
- [CLAUDE.md](CLAUDE.md): same content as AGENTS.md
- [VERSIONS.md](VERSIONS.md): version history
- [BUILD.md](BUILD.md): what to build, how to release, repository setup
- [STATUS.md](STATUS.md): how work is tracked
- [TLDR.txt](TLDR.txt): one-line summary of every file (humans only, AI skips it)
- [languages.csv](languages.csv): translations of all user-facing texts
- [READ_ME_FIRST.txt](READ_ME_FIRST.txt): template for the install note inside release zips
- [changes/](changes/): one small file per change, collected at release
- [status/](status/): one small file per task in progress
- [index.html](index.html): main application
- [js/](js/): application source code
- [style.css](style.css): styles
- [manifest.json](manifest.json): PWA manifest
- [sw.js](sw.js): service worker

## What it is

A jacked-up social-media slide carousel editor. Build 1080 × 1920 story-sized slides
(1–20 of them), place and edit images and rich text, snap everything into alignment,
then export each slide in the SoMe formats that matter: **9:16 Stories, 3:4/4:5 Post,
1:1 Square**.

The whole app is **vanilla JavaScript ES modules** — no build step, no framework, no
dependencies. It runs as a static site (PWA via a service worker). You can run it by
opening `index.html`, but some features (Service Worker, PWA install) need a local
HTTP server — see [Running](#running).

## Install

Requires Python only for the local server (serves `/sw.js` at the root so the
Service Worker can register):

```powershell
powershell -File dev-server.ps1            # serves on http://localhost:8000
powershell -File dev-server.ps1 -Port 8080 # pick another port if 8000 is busy
```

The project is also configured for Netlify (`netlify.toml`) and works fully offline
once the service worker (`sw.js`) has cached the assets.

## Features

Every feature lists the version that introduced it. Rows are added by the release step.

| Feature | Since version | Notes |
| --- | --- | --- |
| Example feature | 0.1.0 | Delete this row |

## Supported platforms

- Web: modern browsers
- PWA: installable on supported platforms

## How work happens

- Agents work on many branches at the same time. Each branch has one pull request.
- Each pull request adds one file in `changes/`. Nobody edits `VERSIONS.md` by hand.
- CI checks every pull request and labels it `ready` or `needs attention`.
- The owner reviews `ready` pull requests and merges them.
- To release, the owner runs "Prepare release". See BUILD.md.

## Rules for updating this file

- The features table is filled in by the release step. Do not edit it in a normal task.
- Other changes to this file go in a separate pull request that touches only README.md.
- Keep the Files list at the top complete. If a file is added to the repo, link it here.
- Everything in this repository is written in English. See AGENTS.md section 0.

## Detailed documentation

For full architecture, module details, and implementation notes, see the original project documentation in the git history or additional docs like [TEXT_EDITOR_README.md](TEXT_EDITOR_README.md) and [IMPLEMENTATION_VISUAL.txt](IMPLEMENTATION_VISUAL.txt).
