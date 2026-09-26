---
description: "Tesseract-based OCR tool: extract text from an image file through the local `tesseract` binary, returning plain text for the model to consume."
kind: "package-reference"
---
# @deepseek-ai/dsh-tool-ocr

English | [中文](README.zh.md)

## Summary

The model-facing `ocr_image` tool: runs a locally installed Tesseract binary on an image file and returns the extracted text.

## Table of Contents

- [Summary](#summary)
- [What it does](#what-it-does)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## What it does

Registers one tool, `ocr_image(file_path, language?, psm?)`, on `ctx.tools`. It resolves the target through `ctx.fs` (session cwd, existence and regular-file validation, `fs/observed` events), then executes `tesseract <resolved-path> stdout -l <language> [--psm <n>]` and returns `{ text, language }` as plain text. Because the result is text, the tool works on model routes whose adapter declares text-only input — the gap the multimodal `read_image` tool cannot serve on such routes.

`language` is a tesseract language code such as `eng` or `chi_sim` (compound codes like `eng+chi_sim` are accepted). `psm` is an optional page-segmentation mode from 0 to 13.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `binPath` | `/opt/homebrew/bin/tesseract` | Absolute path to the tesseract executable. |
| `defaultLanguage` | `eng` | Language used when the model omits `language`. |
| `timeoutMs` | `30000` | Child-process timeout; declared as the tool's cooperative budget. |
| `maxOutputChars` | `200000` | Output cap; longer output is truncated with an explicit notice. |

All fields are overridable from cordis.yml — the binary location and language packs are platform concerns, not code constants.

## Failure modes

- **Missing file / not a regular file** — surfaced before any child process starts, with the same `fs/observed` discipline as the built-in read tools.
- **Missing binary** — `ENOENT` becomes a message naming the fix: install tesseract or set `binPath`.
- **Tesseract failure** — non-zero exits surface the process stderr (capped) with the image path.
- **Invalid arguments** — malformed language codes and out-of-range `psm` are rejected before any filesystem work.

## Model Experience

### ocr_image

#### What the model sees

The gated `ocr_image` schema in the [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-ocr) requires `file_path` and takes optional `language` and `psm`; the result is the extracted text itself rather than a structured object. On a text-only route this is the way to read an image, and it returns characters instead of a description.

#### Token effect

One tool schema per mounted agent. Each call appends the extracted text, bounded by `maxOutputChars` (200000 by default) with an explicit truncation notice, so a dense scan cannot silently consume unlimited context.

#### KV Cache effect

The tool schema is a stable prefix contribution; per-call output appends after the cached prefix and does not rewrite it.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **External binary required** — the tool shells out to a locally installed `tesseract`; a missing binary, or a `binPath` that does not resolve, fails the call instead of falling back to another OCR path.
- **Language coverage follows the installed traineddata** — a language code with no Tesseract data behind it is rejected by Tesseract at run time, not by this tool's validation.
- **Whole-image text only** — no per-region, coordinate, or layout structure is returned; `psm` is the only layout control.

### Dev Note

- The tool is `isConcurrencySafe`: each call is an independent read-only OS process.
- Cancellation is cooperative: `exec.signal` is forwarded to the child process, and `timeoutMs` is declared as the tool's cooperative timeout budget.
- No runtime invariant companion is published because the tool owns no independent lifecycle stream to compare, and its output shape is enforced by the tool output schema at dispatch time.
