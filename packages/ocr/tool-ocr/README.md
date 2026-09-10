# @deepseek-ai/dsh-tool-ocr

English | [中文](README.zh.md)

The model-facing `ocr_image` tool: runs a locally installed Tesseract binary on an image file and returns the extracted text.

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

## Notes

- The tool is `isConcurrencySafe`: each call is an independent read-only OS process.
- Cancellation is cooperative: `exec.signal` is forwarded to the child process, and `timeoutMs` is declared as the tool's cooperative timeout budget.
- No runtime invariant companion is published because the tool owns no independent lifecycle stream to compare, and its output shape is enforced by the tool output schema at dispatch time.
