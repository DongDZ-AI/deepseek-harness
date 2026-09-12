---
name: dsh-upgrade-checklist
description: Use when updating the deepseek-harness checkout to a newer upstream baseline — rebasing the customization layer onto a new upstream tag, after an upstream release sync, when deployed plugin tarballs no longer match the harness version, or when plugins fail to load after an upgrade — to drive the staged rebuild-and-verify sequence and keep the deployed profile working.
---

# DSH Upgrade Checklist

The harness runs from a source checkout with a customization layer (custom tool plugins, client UI changes, locally built plugin tarballs in `/Users/dongdz/Code/dsh-plugin-tarballs/`). Upstream treats public APIs as pre-stable and renames freely, so every baseline jump breaks something: the rebase conflicts, the native modules, the built artifacts, and the deployed tarballs. This skill sequences the work so each break is caught by a gate instead of by the running deployment.

Core rules: advance **one upstream tag at a time** (never span multiple release lines in one rebase), verify on a **backup branch**, treat `pnpm run typecheck` as the API-alignment probe, and **rebuild every deployed plugin tarball** whenever the DSH baseline changes.

## Before starting

```sh
git branch backup/pre-<target-version> <current-branch>
git fetch upstream --tags
git rev-list --count <baseline>..upstream/master   # size the jump; >500 commits means stage by tag
```

Record the deployed tarball inventory (`ls /Users/dongdz/Code/dsh-plugin-tarballs/*.tgz`) and scan upstream release notes for changes touching what the customization layer imports (custom tool plugins, `ui-conversation` client code, build aggregates).

## Stage 1 — rebase one tag at a time

Rebase onto the nearest upstream tag, resolve, verify, then advance to the next. Conflict policy per file class:

| Conflict | Resolution |
|---|---|
| `pnpm-lock.yaml` | Always take upstream (`git checkout --ours`), regenerate later via `pnpm install`. Never hand-merge. |
| `tsconfig.base.json` paths (generated block) | Take upstream, then rerun `pnpm run gen-tsconfig-paths` after the rebase. |
| Manifest double-additions (`.gitignore`, `package.json` deps) | Keep both sides; version bumps keep the customized values; JSON must stay valid. |
| Client files restructured upstream (e.g. `apply.ts`, `locales.ts`) | Take the upstream structure, re-thread only the customized feature code (imports, registration blocks, locale keys) into it. |

Install with the real store: `pnpm install --store-dir /Users/dongdz/Library/pnpm/store`. The sandbox blocks the default store location (`ERR_PNPM_UNEXPECTED_STORE`, then `ERR_SQLITE_ERROR: unable to open database file`); do not interpret either as a dependency problem. When retrying any failed command, re-issue the full command including `cd <repo>` — a retry that runs in the wrong directory reports "Done" while changing nothing.

## Stage 2 — rebuild and gates, in order

Each step exists because skipping it produced a real failure during the 0.1.2→0.1.5 upgrade:

1. `pnpm install --store-dir /Users/dongdz/Library/pnpm/store` — can exceed 10 minutes after a multi-release jump; run in background, verify completion, and never start a second install concurrently.
2. `pnpm run gen-tsconfig-paths` — registers custom packages in the generated aliases block.
3. `pnpm install` again — resync the lockfile after paths regeneration.
4. Build native modules (`pnpm run build:native` under `native/`): tests flood with `Cannot find module .../bin/system.node` until this exists; the addon source layout itself changes between baselines (`landlock-run` → `system`).
5. `pnpm run typecheck` — the API-alignment probe. Expect renames (`CallId`→`ToolCallId`), new required shape fields (tsdown 0.23 `UserConfigFnContext.watch`), and moved client modules. Note `scripts/` is outside every tsc program: oxlint type-aware rules are the only detector there, so an oxlint error in scripts is real until proven otherwise.
6. `npm run build` (full, both faces) — publint fails with `FILE_DOES_NOT_EXIST` on `lib/client.js` when only typecheck ran, because typecheck builds host bundles and client types but not client bundles.
7. `npm run lint:contracts-ready` — 0 warnings / 0 errors expected; fast-check major bumps move `timeout` into `fc.assert(..., { plugins: [fc.timeout(ms)] })`.
8. Focused Vitest on touched packages, then `pnpm run test`.
9. `pnpm run hygiene` — constraints requires custom package `version` to equal the root version and `files` to be exactly `["lib/index.js","lib/types/**/*.d.ts"]`.
10. `pnpm run website:build` — doubles as the dead-link check.

Commit the realignment (regenerated paths, lockfile, version bumps) as its own commit before moving on.

## Stage 3 — rebuild deployed plugin tarballs

A tarball bakes in the DSH API surface of its build time. After the baseline moves, rebuild every tarball under `/Users/dongdz/Code/dsh-plugin-tarballs/` against the new checkout and name the artifact with its baseline (e.g. `dsh-ppt-0.4.1-onto-0.1.5.tgz`). Never reuse a tarball built on an older baseline; keep the previous generation as `.bak-<date>` only for rollback.

## Stage 4 — deploy and smoke

```sh
pnpm dsh --profile headless "smoke task"   # needs DEEPSEEK_API_KEY
```

Then start the real profile and watch plugin loading. The profile resolves bare plugin rows through the healed `~/.dsh/profiles/node_modules` fallback, so a baseline jump can break rows whose packages were renamed or re-versioned upstream — a row whose package no manifest declares fails to import. Deployed plugins that fail to adapt are a rollback signal, not something to debug in place.

## Rollback

Reset the checkout to the backup branch, rebuild (`pnpm install`, full build), and restore the matching tarball generation. Keep the rebased work alive in a branch (e.g. `backup/rebased-onto-<version>`) — a completed conflict resolution is expensive to redo and reflog entries are gc food.
