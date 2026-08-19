# @deepseek-ai/dsh-tool-vision

English | [中文](README.zh.md)

The model-facing `vision_describe` tool: wraps the local MiniMax VLM CLI (`mmx vision describe`) for full image understanding on model routes whose adapter declares text-only input — the gap the multimodal `read_image` tool cannot serve on such routes.

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
