# AGENTS.md

Rules for every AI agent in this repository. Humans follow them too.
`CLAUDE.md` is an identical copy. Keep both identical.

- Source: https://github.com/klangche/repo-starter
- Based on: https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md
  (sections 1-4). The rest extends it.
- Owner: the person who owns the repository or fork. Never an AI.
- Only the owner changes this file. Exceptions: the setup and
  `update repo-starter` commands below, in a pull request the owner merges.
- Caution over speed. For trivial tasks, use judgment.

## Commands

**Setup** (the owner pastes the prompt from the repo-starter README):

1. Download https://raw.githubusercontent.com/klangche/repo-starter/main/AGENTS.md
   and save it as `AGENTS.md` and `CLAUDE.md`. If the project already has
   either file, add its rules under "Project" in the new file, commit that,
   and quote the old text in the pull request description.
2. Ask the owner what is unclear. Propose the stack. In "Project" below,
   replace the repo-starter values with the project's own. Keep any rules
   added in step 1.
3. New repository: write `README.md` about the project (section 10).
   Existing repository: leave its README and code as they are.
4. One pull request, branch `docs/setup`. Nothing else starts until the owner
   merges it. Empty repository with no commits: ask the owner to make the
   first commit, so there is a main branch to open the pull request against.

**`update repo-starter`**:

1. Download the latest repo-starter `AGENTS.md` (link above) and the latest
   Karpathy `CLAUDE.md`
   (https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/main/CLAUDE.md).
2. Replace everything above "Project" in `AGENTS.md` and `CLAUDE.md` with the
   new repo-starter text. Drop the downloaded "Project" section and keep the
   project's own.
3. If the Karpathy file says something sections 1-4 do not, list it in the
   pull request. Do not add it yourself.
4. One pull request, branch `docs/update-repo-starter`, listing what changed.

## 0. Language

- Everything in English: code, comments, commits, pull requests, docs, file
  names, logs, and your replies about the repository. Whatever language the
  user writes in.
- Texts for end users in other languages: one strings file, stable keys,
  English first, a missing translation falls back to English. Never use the
  English sentence as the key.

## 1. Think before coding

- State assumptions. If unsure, ask.
- Several readings: list them and ask. Do not pick one silently.
- Unclear: stop, name what is unclear, ask.
- A simpler way exists: say so. Push back when the request looks wrong.
- Once the owner has decided (language, stack, design), build. Do not ask
  again.

## 2. Simplicity first

- Minimum code that solves the problem. No features, abstractions or settings
  nobody asked for. No abstractions for single-use code.
- No error handling for cases that cannot happen.
- 200 lines that could be 50: rewrite.

## 3. Surgical changes

- Touch only what the task needs. Do not reformat or "improve" other code.
  Do not refactor what is not broken.
- Match the existing style.
- Remove only what your change made unused. Mention other dead code, leave it.
- Every changed line traces to the request.

## 4. Goal-driven execution

- Turn the task into checks (a test, a command, an expected output).
- Short plan, one check per step. Work until the checks pass.
- Never claim it works without running it. If you could not run it, say so.

## 5. Context budget

- Estimate the context the task needs before you start. Above 60%: split it
  or hand it over. Do not start what you cannot finish cleanly.

## 6. Workflow

- Tasks are GitHub issues. A request without an issue: create one first. One
  task = one branch = one pull request. Small and often.
- Branch names: `feat/`, `fix/`, `docs/`, `debug/` plus a short slug.
- Roles: Planner (writes the plan), Builder (implements), Reviewer (a different
  agent instance than the Builder). A rejected review is normal: redo it.
- Pull request description: the plan with a check per step, what you verified,
  what you could not verify, and the Reviewer's verdict.
- Pull request title in the style `Added: ...`, `Changed: ...`, `Fixed: ...`,
  `Removed: ...` or `Security: ...`. Add `!` (for example `Changed!: ...`) for
  a breaking change. The release notes are built from these titles.
- Rebase on main before review. Keep the pull request free of conflicts.
- Debugging: first write the diagnosis and the proposed fix in the issue. A
  separate Builder implements it.
- Never merge. Never approve your own pull request. Never push to main. Never
  change repository settings, rulesets, labels or secrets. If you pushed to
  main by mistake, stop and tell the owner. No force push.

## 7. Code

- Pick the right language per part, even if that means several languages or
  programs. Propose with one line of why; the owner decides.
- Follow each language's standard layout, formatter, linter and test tool
  (for example Prettier/ESLint, Black or Ruff/pytest, rustfmt/Clippy,
  clang-format/clang-tidy, dotnet format, swift-format, gofmt, PSScriptAnalyzer,
  ShellCheck).
- One file per responsibility, named after what it does. Small related
  functions may share a file named after the feature.
- Web: HTML, CSS and JavaScript in separate files. No inline scripts, styles or
  handlers. ES modules.
- Several operating systems: one shared front end, system-specific code in its
  own folder, one documented interface between the parts.
- Existing projects: their conventions win. Do not rewrite working code to
  match these rules.
- Secrets and configuration stay out of the code. Commit lock files. Prefer
  the standard library.

## 8. Build and release

- Everything is built by GitHub Actions. No local builds for releases.
- Versions: Semantic Versioning, git tags `vX.Y.Z`. The owner tags. A breaking
  change bumps MAJOR, a feature MINOR, a fix PATCH.
- Release notes: from the pull request titles since the last tag.
- Assets: `<name>-<version>-<platform>.<ext>`. Builds are unsigned, so when the
  user must run a terminal command or unblock a file, put a short
  `READ_ME_FIRST.txt` with the exact command in the zip.
- Windows: .msi, silent update if already installed. macOS: one universal
  build. Linux: only on request.

## 9. Secrets and safety

- Never commit passwords, tokens, keys or certificates. Use GitHub Actions
  secrets.
- Ask before destructive commands (delete, force push, reset).

## 10. README

- About the project only: what it is, features, install, usage, platforms,
  development, license. Nothing copied from repo-starter.
- The only reference to these rules: "Contributors and AI agents follow
  AGENTS.md."

## 11. Done

- Works and verified, or clearly says what was not verified.
- Reviewer approved, noted in the pull request.
- CI green, if the project has CI.

## 12. Style

- Short, direct, plain. No marketing language. No emojis.
- Not sure: say so instead of guessing.

## Project

Filled in by the setup pull request. Changed only by the owner.

- Branch protection: none (`enforced` if GitHub enforces a ruleset on main,
  else `none`: then these rules are the only guard)
- Goal: SlideStudio. A browser editor for social media slide carousels: 1-20
  slides of 1080 x 1920, images and rich text with snapping, export of each
  slide as 9:16, 4:5 and 1:1.
- Users and platforms: people who make social media posts. Modern desktop
  browsers, installable as a PWA. Not deployed yet.
- Stack: vanilla JavaScript ES modules, HTML, CSS. No build step, no
  package dependencies (web fonts load from Google Fonts and cdnfonts).
  Service worker for offline use. Local dev server: Python
  standard library (`dev-server.py`) with a PowerShell wrapper
  (`dev-server.ps1`).
- Decisions:
  - 2026-10-28: adopted repo-starter. Existing code and its conventions stay
    (section 7), for example the `window.*` bridges checked by
    `js/selfcheck.js`, and the inline styles and script in `index.html`
    until a task moves them.
  - 2026-10-28: Prettier and ESLint are added later, in their own pull
    request.
  - 2026-10-28: the old `repo-starter/` folder is removed in its own pull
    request after setup.
  - 2026-10-28: the `dev` branch is not used. Work starts from main.
  - 2026-10-28: hosting is not decided. `netlify.toml` and
    `docker-compose.yml` stay until it is.
