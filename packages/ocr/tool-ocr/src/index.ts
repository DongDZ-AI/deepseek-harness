/**
 * Model-facing `ocr_image` tool: runs a locally installed Tesseract binary on an
 * image file and returns the extracted text. The result is plain text, so the
 * tool works on model routes that declare text-only input — the gap the
 * multimodal `read_image` tool cannot serve on such routes.
 *
 * The tool resolves its target through `ctx.fs` (session cwd, observation
 * events, regular-file validation) and only then hands the resolved process
 * path to Tesseract, keeping the framework's filesystem discipline.
 * @module @deepseek-ai/dsh-tool-ocr
 */

import type { Context } from '@deepseek-ai/cordis'
import { execFile as execFileCb } from 'node:child_process'
import { promisify } from 'node:util'
import z from '@deepseek-ai/schemastery'
import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsInfo, FsTarget } from '@deepseek-ai/dsh-fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolExecution, ToolRunContext } from '@deepseek-ai/dsh-tools'
import {
  DEFAULT_BIN_PATH,
  DEFAULT_LANGUAGE,
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_TIMEOUT_MS,
  buildTesseractArgs,
  truncateOutput,
  validateLanguageCode,
  validatePsm,
} from './defaults.ts'

const execFile = promisify(execFileCb)

export const name = 'tool-ocr'
export const inject = ['tools', 'fs']

/** Deployment-varying OCR policy; every field is overridable from cordis.yml. */
export interface Config {
  /** Absolute path to the tesseract executable. */
  binPath: string
  /** Default language code when the model omits `language`. */
  defaultLanguage: string
  /** Child-process timeout in milliseconds; the tool declares this as its cooperative budget. */
  timeoutMs: number
  /** Cap on extracted characters; longer output is truncated with a notice. */
  maxOutputChars: number
}

/** Schemastery configuration for the OCR tool consumer. */
export const Config: z<Config> = z.object({
  binPath: z.string().default(DEFAULT_BIN_PATH),
  defaultLanguage: z.string().default(DEFAULT_LANGUAGE),
  timeoutMs: z.number().min(1000).default(DEFAULT_TIMEOUT_MS),
  maxOutputChars: z.number().min(1000).default(DEFAULT_MAX_OUTPUT_CHARS),
})

const TOOL_DESCRIPTION =
  'Run Tesseract OCR on a local image file and return the extracted text. '
  // 2026-09-12: 原描述断言"本部署模型路由是纯文本、read_image 永远失败" —— 那是过时的,
  // 曾误导模型绕道 vision_describe 而从不试 read_image。改为**条件说明**:
  // 能不能原生读图取决于当前所选模型是否声明 image 输入,以实测为准。
  + 'Use this tool for text extraction when the current model cannot take image input, '
  + 'or when you specifically want raw OCR text. FIRST check whether native image input '
  + 'works: try `read_image` — it succeeds whenever the session model declares image '
  + 'input (a multimodal route), and only then fails with "model does not declare image '
  + 'input" on a text-only route. Do not assume it will fail: take one real attempt, and '
  + 'fall back to this tool (or `mmx vision describe --image <path> --prompt "..."` via '
  + 'bash for full scene understanding) only after that attempt fails. '
  + '`language` is a tesseract language code such as "eng" or "chi_sim", '
  + 'and `psm` is an optional page-segmentation mode from 0 to 13 (defaults to tesseract\'s own choice).'

/** The canonical `ocr_image` outcome. */
export interface OcrReadValue {
  text: string
  language: string
}

/** Parent traversal that would make a symlinked session cwd's identity observable; canonicalize then. */
const PARENT_PATH_SEGMENT = /(?:^|[\\/])\.\.(?:[\\/]|$)/

/**
 * The session workspace cwd for this call, or undefined for a non-agent caller
 * (the fs backend then applies its own default). Mirrors the semantics of the
 * model-facing filesystem tools so relative paths act on the calling session's
 * workspace.
 * @param exec - the tool-execution context; only its optional `agent` is read.
 * @param requestedPath - the path about to be resolved.
 * @returns the agent's session cwd, or undefined.
 */
export function sessionCwd(exec: ToolExecution, requestedPath: string): string | undefined {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined || (!PARENT_PATH_SEGMENT.test(cwd) && !PARENT_PATH_SEGMENT.test(requestedPath))) return cwd
  return cwd
}

/**
 * Resolve the model-supplied path, require an existing regular file, and emit
 * the fs observation event so the read is auditable like the built-in read
 * tools' reads.
 * @param ctx - the plugin context with the `fs` service.
 * @param exec - the current tool execution (cwd and cancellation).
 * @param requestedPath - the raw path from the model.
 * @returns the resolved target and its stat result.
 */
async function resolveRegularFile(ctx: Context, exec: ToolExecution, requestedPath: string): Promise<{ target: FsTarget; info: FsInfo }> {
  const cwd = sessionCwd(exec, requestedPath)
  const target = await ctx.fs.resolve(requestedPath, {
    ...cwd === undefined ? {} : { cwd },
    signal: exec.signal,
  })
  const info = await ctx.fs.stat(target, exec.signal)
  if (info === undefined) {
    ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
    throw new FsError(`cannot OCR "${target.displayPath}": not found`, 'FS_NOT_FOUND')
  }
  if (info.type !== 'file') {
    ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
    throw new FsError(`cannot OCR "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
  }
  ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
  return { target, info }
}

/**
 * Register the `ocr_image` tool on `ctx.tools`.
 * @param ctx - the registrant context carrying the tool registry and fs service.
 * @param config - the deployment's OCR policy.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'ocr_image',
    description: TOOL_DESCRIPTION,
    parameters: {
      file_path: {
        type: 'string',
        required: true,
        description: 'Path to the image file, resolved against the session workspace.',
      },
      language: {
        type: 'string',
        description: 'Tesseract language code, e.g. "eng" or "chi_sim"; defaults to the configured language.',
      },
      psm: {
        type: 'integer',
        description: 'Optional Tesseract page-segmentation mode, 0-13.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          language: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    // Independent OS processes over read-only inputs: concurrent calls commute.
    isConcurrencySafe: () => true,
    // Cooperative cancellation: exec.signal is forwarded to the child process.
    timeoutMs: config.timeoutMs,
    async execute(args: { file_path: string; language?: string; psm?: number }, exec: ToolRunContext): Promise<OcrReadValue> {
      if (args.file_path.trim().length === 0) throw new Error('file_path must be a non-empty string')
      const language = validateLanguageCode(args.language ?? config.defaultLanguage)
      const psm = args.psm === undefined ? undefined : validatePsm(args.psm)
      const { target } = await resolveRegularFile(ctx, exec, args.file_path)
      const processPath = ctx.fs.processPath(target)
      const childArgs = buildTesseractArgs(processPath, language, psm)
      let stdout: string
      try {
        const result = await execFile(config.binPath, childArgs, {
          timeout: config.timeoutMs,
          maxBuffer: Math.max(config.maxOutputChars * 4, 1 << 20),
          signal: exec.signal,
        })
        stdout = result.stdout
      } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          throw new Error(
            `cannot run OCR: tesseract binary not found at "${config.binPath}"; install tesseract or set the tool-ocr binPath config`,
            { cause: error },
          )
        }
        const stderr = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
        throw new Error(
          `tesseract failed on "${target.displayPath}": ${error instanceof Error ? error.message : String(error)}${stderr ? `\nstderr: ${stderr.slice(0, 2000)}` : ''}`,
          { cause: error },
        )
      }
      return { text: truncateOutput(stdout, config.maxOutputChars), language }
    },
    presentCall(args: { file_path: string }) {
      return {
        card: 'generic' as const,
        title: `OCR ${args.file_path}`,
        kind: 'read' as const,
        locations: [{ path: args.file_path }],
      }
    },
  }))
}
