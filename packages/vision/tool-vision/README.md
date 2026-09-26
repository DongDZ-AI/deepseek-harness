---
description: "MiniMax VLM vision tool: describe or answer questions about an image through the local `mmx` CLI, for text-only routes that cannot take native image blocks."
kind: "package-reference"
---
# @deepseek-ai/dsh-tool-vision

English | [中文](README.zh.md)

## Summary

The model-facing `vision_describe` tool: wraps the local MiniMax VLM CLI (`mmx vision describe`) for full image understanding on model routes whose adapter declares text-only input — the gap the multimodal `read_image` tool cannot serve on such routes.

## Table of Contents

- [Summary](#summary)
- [What it does](#what-it-does)
- [Configuration](#configuration)
- [Mount](#mount)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## What it does

Registers one tool, `vision_describe(file_path, prompt?)`, on `ctx.tools`. It resolves the target through `ctx.fs` (session cwd, existence and regular-file validation, `fs/observed` events), then executes `mmx vision describe --image <resolved-path> --prompt <text>` and returns `{ content }` — the VLM's description extracted from mmx's JSON envelope.

Pairs with `ocr_image` (text extraction): use `vision_describe` when the picture's layout, objects, or scene matter.

## Configuration

| Field | Default | Meaning |
|---|---|---|
| `binPath` | `mmx` | The mmx executable name (resolved from PATH) or an absolute path. |
| `defaultPrompt` | `Describe the image in detail.` | Question used when the model omits `prompt`. |
| `timeoutMs` | `120000` | Child-process timeout; declared as the tool's cooperative budget. |
| `maxOutputChars` | `40000` | Output cap; longer output is truncated with an explicit notice. |

## Mount

Add a row to the profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: tool-vision
      name: '@deepseek-ai/dsh-tool-vision'
```

Requires the `mmx` CLI (`mmx vision describe`) to be installed and reachable on PATH.

## Model Experience

### vision_describe

#### What the model sees

The gated `vision_describe` schema in the [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-tool-vision) requires `file_path` and takes an optional `prompt`; the result is the VLM's description as text. It answers questions about layout, objects, and scene where `ocr_image` returns only characters.

#### Token effect

One tool schema per mounted agent. Each call appends the description, bounded by `maxOutputChars` (40000 by default) with an explicit truncation notice; image bytes never enter model messages.

#### KV Cache effect

The tool schema is a stable prefix contribution; per-call output appends after the cached prefix and does not rewrite it.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **External CLI required** — the tool shells out to `mmx vision describe`; a missing CLI, or an mmx profile that is not signed in, fails the call rather than degrading to another route.
- **Latency is provider-bound** — one call may consume the whole `timeoutMs` (120 s by default), which is the tool's cooperative budget rather than a product limit.
- **Description only** — no bounding boxes or verbatim text; pair with `ocr_image` when exact characters matter.

### Dev Note

- No runtime invariant companion is published because the tool owns no independent lifecycle stream to compare; its output is the VLM's description bounded by the configured character cap.
