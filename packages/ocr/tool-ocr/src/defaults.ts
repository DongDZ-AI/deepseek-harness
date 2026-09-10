/**
 * Constants, defaults, and pure argument/format helpers for the `ocr_image`
 * tool. Deployment-varying choices live in the plugin `Config` (see
 * `src/index.ts`); the defaults here are the schema's fallback values,
 * overridable from cordis.yml.
 * @module @deepseek-ai/dsh-tool-ocr/defaults
 */

/** Default Tesseract binary path (macOS Homebrew layout). Override via `binPath`. */
export const DEFAULT_BIN_PATH = '/opt/homebrew/bin/tesseract'
/** Default Tesseract language code when the model omits `language`. */
export const DEFAULT_LANGUAGE = 'eng'
/** Default child-process timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000
/** Default cap on extracted characters; longer output is truncated with a notice. */
export const DEFAULT_MAX_OUTPUT_CHARS = 200_000
/** Tesseract page-segmentation mode bounds (inclusive), per the tesseract manual. */
export const PSM_MIN = 0
export const PSM_MAX = 13

/** Tesseract language codes: letters, digits, underscore, and `+` for compound codes. */
export const LANGUAGE_CODE_PATTERN = /^[A-Za-z0-9_+]+$/

/**
 * Build the tesseract CLI argument vector for one OCR run.
 * @param processPath - the resolved process path of the image file.
 * @param language - the tesseract language code (validated by caller).
 * @param psm - optional page-segmentation mode within {@link PSM_MIN}..{@link PSM_MAX}.
 * @returns the argument vector after `tesseract <image> stdout`.
 */
export function buildTesseractArgs(processPath: string, language: string, psm?: number): string[] {
  const args = [processPath, 'stdout', '-l', language]
  if (psm !== undefined) args.push('--psm', String(psm))
  return args
}

/**
 * Validate a tesseract language code, returning the code when valid.
 * @param language - the raw language argument from the model.
 * @returns the validated code.
 * @throws a plain Error when the code contains characters tesseract never accepts.
 */
export function validateLanguageCode(language: string): string {
  if (!LANGUAGE_CODE_PATTERN.test(language)) {
    throw new Error(`invalid tesseract language code "${language}"; expected letters/digits/underscore, optionally joined by "+" (e.g. "eng", "chi_sim", "eng+chi_sim")`)
  }
  return language
}

/**
 * Validate a page-segmentation mode, returning it when in range.
 * @param psm - the raw psm argument from the model.
 * @returns the validated mode.
 * @throws a plain Error when outside {@link PSM_MIN}..{@link PSM_MAX}.
 */
export function validatePsm(psm: number): number {
  if (!Number.isInteger(psm) || psm < PSM_MIN || psm > PSM_MAX) {
    throw new Error(`invalid tesseract psm ${psm}; expected an integer between ${PSM_MIN} and ${PSM_MAX}`)
  }
  return psm
}

/**
 * Cap extracted text at `maxChars`, appending an explicit truncation notice so
 * the model knows the result is partial rather than silently short.
 * @param text - the raw tesseract stdout.
 * @param maxChars - the configured output cap.
 * @returns the (possibly truncated) text.
 */
export function truncateOutput(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n\n[output truncated at ${maxChars} characters]`
}
