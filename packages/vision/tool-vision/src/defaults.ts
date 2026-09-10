/** Defaults and pure helpers for the `vision_describe` tool. */

/** Executable name of the MiniMax VLM CLI (resolved from PATH by the tool). */
export const DEFAULT_BIN_PATH = 'mmx'

/** Default question when the model omits `prompt`. */
export const DEFAULT_PROMPT = 'Describe the image in detail.'

/** Child-process timeout in milliseconds (MiniMax VLM calls can be slow). */
export const DEFAULT_TIMEOUT_MS = 120_000

/** Cap on returned characters; longer output is truncated with a notice. */
export const DEFAULT_MAX_OUTPUT_CHARS = 40_000

/** Clip overlong output, keeping a trailing notice so the model knows it is incomplete. */
export function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n… [truncated ${text.length - maxChars} characters]`
}
