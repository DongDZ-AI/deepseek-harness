/**
 * Model-facing `vision_describe` tool: wraps the local MiniMax VLM CLI
 * (`mmx vision describe`) for full image understanding on model routes that
 * declare text-only input — the gap the multimodal `read_image` tool cannot
 * serve on such routes. Pairs with `ocr_image` (text extraction): use
 * `vision_describe` when the picture's content — layout, objects, scene —
 * matters, not just its words.
 *
 * The tool resolves its target through `ctx.fs` (session cwd, observation
 * events, regular-file validation) and only then hands the resolved process
 * path to the mmx CLI, keeping the framework's filesystem discipline.
 * @module @deepseek-ai/dsh-tool-vision
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
  DEFAULT_MAX_OUTPUT_CHARS,
  DEFAULT_PROMPT,
  DEFAULT_TIMEOUT_MS,
  truncateOutput,
} from './defaults.ts'

const execFile = promisify(execFileCb)

export const name = 'tool-vision'
export const inject = ['tools', 'fs']

/** Deployment-varying vision policy; every field is overridable from cordis.yml. */
export interface Config {
  /** The mmx executable name or absolute path. */
  binPath: string
  /** Default question when the model omits `prompt`. */
  defaultPrompt: string
  /** Child-process timeout in milliseconds; the tool declares this as its cooperative budget. */
  timeoutMs: number
  /** Cap on returned characters; longer output is truncated with a notice. */
  maxOutputChars: number
}

/** Schemastery configuration for the vision tool consumer. */
export const Config: z<Config> = z.object({
  binPath: z.string().default(DEFAULT_BIN_PATH),
  defaultPrompt: z.string().default(DEFAULT_PROMPT),
  timeoutMs: z.number().min(1000).default(DEFAULT_TIMEOUT_MS),
  maxOutputChars: z.number().min(1000).default(DEFAULT_MAX_OUTPUT_CHARS),
})

const TOOL_DESCRIPTION =
  'Describe an image with MiniMax VLM and return the visual content as text. '
  // 2026-09-12: 原描述断言"本路由是纯文本、read_image 永远失败" —— 过时且会误导模型绕道
  // (实测:模型因此不试原生读图,还为它复制文件补扩展名)。改为**条件说明**并要求先试 read_image。
  + 'Use this tool when you need to UNDERSTAND a picture (screenshots, diagrams, photos) on a '
  + 'route that cannot take image input. FIRST check whether native image input works: try '
  + '`read_image` — it succeeds whenever the session model declares image input, and only then '
  + 'fails with "model does not declare image input" on a text-only route. Reach for '
  + 'vision_describe ONLY after that attempt fails: it is the fallback for text-only routes. '
  + 'Pairs with `ocr_image` (which extracts text only): pick vision_describe when the layout, '
  + 'objects, or scene matter. '
  + '`file_path` resolves against the session workspace (pasted attachments live under '
  + '.dsh/tmp/attachments/); pass a focused `prompt` to steer what to look for.'

/** The canonical `vision_describe` outcome. */
export interface VisionDescribeValue {
  content: string
}

/**
 * Extract the VLM's answer from mmx's JSON envelope (`{ content, base_resp }`),
 * falling back to the raw output when the CLI did not emit JSON.
 * @param stdout - the mmx vision describe stdout.
 * @returns the description text.
 */
export function parseMmxOutput(stdout: string): string {
  const trimmed = stdout.trim()
  try {
    const parsed = JSON.parse(trimmed) as { content?: unknown }
    if (typeof parsed.content === 'string' && parsed.content.length > 0) return parsed.content
  } catch {
    // Not JSON — keep the raw output.
  }
  return trimmed
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
    throw new FsError(`cannot describe "${target.displayPath}": not found`, 'FS_NOT_FOUND')
  }
  if (info.type !== 'file') {
    ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
    throw new FsError(`cannot describe "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
  }
  ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
  return { target, info }
}

/**
 * Register the `vision_describe` tool on `ctx.tools`.
 * @param ctx - the registrant context carrying the tool registry and fs service.
 * @param config - the deployment's vision policy.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(defineTool({
    name: 'vision_describe',
    description: TOOL_DESCRIPTION,
    parameters: {
      file_path: {
        type: 'string',
        required: true,
        description: 'Path to the image file, resolved against the session workspace.',
      },
      prompt: {
        type: 'string',
        description: 'What to look for in the image; defaults to a general description.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          content: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.content }],
    },
    // Independent child processes over read-only inputs: concurrent calls commute.
    isConcurrencySafe: () => true,
    // Cooperative cancellation: exec.signal is forwarded to the child process.
    timeoutMs: config.timeoutMs,
    async execute(args: { file_path: string; prompt?: string }, exec: ToolRunContext): Promise<VisionDescribeValue> {
      if (args.file_path.trim().length === 0) throw new Error('file_path must be a non-empty string')
      const { target } = await resolveRegularFile(ctx, exec, args.file_path)
      const processPath = ctx.fs.processPath(target)
      const rawPrompt = args.prompt?.trim()
      const prompt = rawPrompt !== undefined && rawPrompt.length > 0 ? rawPrompt : config.defaultPrompt
      const childArgs = ['vision', 'describe', '--image', processPath, '--prompt', prompt]
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
            `cannot run vision_describe: mmx binary not found at "${config.binPath}"; ensure mmx is on PATH or set the tool-vision binPath config`,
            { cause: error },
          )
        }
        const stderr = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
        throw new Error(
          `mmx vision describe failed on "${target.displayPath}": ${error instanceof Error ? error.message : String(error)}${stderr ? `\nstderr: ${stderr.slice(0, 2000)}` : ''}`,
          { cause: error },
        )
      }
      return { content: truncateOutput(parseMmxOutput(stdout), config.maxOutputChars) }
    },
    presentCall(args: { file_path: string }) {
      return {
        card: 'generic' as const,
        title: `Describe ${args.file_path}`,
        kind: 'read' as const,
        locations: [{ path: args.file_path }],
      }
    },
  }))
}
