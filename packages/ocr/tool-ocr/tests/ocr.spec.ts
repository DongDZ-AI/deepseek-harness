/**
 * Unit and integration tests for the `ocr_image` tool. The tesseract child
 * process is mocked at the `node:child_process` boundary; the filesystem
 * (`ctx.fs` via the real local backend), the tool registry, and the plugin
 * body are the shipping code.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { CallId } from '@deepseek-ai/dsh-llm'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as tool from '../src/index.ts'
import {
  buildTesseractArgs,
  truncateOutput,
  validateLanguageCode,
  validatePsm,
} from '../src/invariant.ts'

/** The execFile options our tool passes to the child process. */
interface ExecOptions {
  timeout?: number
  signal?: AbortSignal
  maxBuffer?: number
}

/** The mocked `execFile` shape the plugin promisifies. */
type ExecFileFn = (
  file: string,
  args: string[],
  options: ExecOptions,
  callback: (err: Error | null, result?: { stdout: string; stderr: string }) => void,
) => void

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn<ExecFileFn>() }))

vi.mock('node:child_process', () => ({ execFile: mockExecFile }))

const testToolSignal = new AbortController().signal

let root: string
let ctx: Context

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tool-ocr-'))
  mockExecFile.mockReset()
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(tool, {
    binPath: '/usr/bin/tesseract',
    defaultLanguage: 'eng',
    timeoutMs: 5000,
    maxOutputChars: 1000,
  })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

let callCounter = 0
function callOcr(args: unknown): Promise<ToolExecutionResult> {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: CallId(`call-${++callCounter}`),
    name: 'ocr_image',
    arguments: args,
  })
}

function text(result: ToolExecutionResult): string {
  return result.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

/** Resolve the OS-real path the fs backend hands tesseract (macOS `/var` → `/private/var`). */
async function resolvedImage(name: string): Promise<string> {
  return realpath(join(root, name))
}

/** The last execFile invocation, typed for option assertions. */
function lastExecCall(): { file: string; args: string[]; options: ExecOptions } {
  const [file, args, options] = mockExecFile.mock.calls.at(-1)!
  return { file, args, options }
}

describe('dsh-tool-ocr', () => {
  it('registers an `ocr_image` tool with file_path/language/psm parameters', async () => {
    const schema = ctx.tools.schemas().find(s => s.name === 'ocr_image')
    expect(schema).toBeDefined()
    const props = (schema!.parameters as { properties?: Record<string, { type?: string }> }).properties ?? {}
    expect(Object.keys(props)).toEqual(['file_path', 'language', 'psm'])
    expect(props.file_path?.type).toBe('string')
  })

  describe('pure argument and formatting helpers', () => {
    it('builds the tesseract argv with default and custom language', () => {
      expect(buildTesseractArgs('/img.png', 'eng')).toEqual(['/img.png', 'stdout', '-l', 'eng'])
      expect(buildTesseractArgs('/img.png', 'chi_sim', 6)).toEqual(['/img.png', 'stdout', '-l', 'chi_sim', '--psm', '6'])
    })

    it('accepts valid language codes and compound codes', () => {
      expect(validateLanguageCode('eng')).toBe('eng')
      expect(validateLanguageCode('chi_sim')).toBe('chi_sim')
      expect(validateLanguageCode('eng+chi_sim')).toBe('eng+chi_sim')
      expect(() => validateLanguageCode('eng;rm -rf')).toThrow(/invalid tesseract language code/)
    })

    it('enforces the psm range', () => {
      expect(validatePsm(0)).toBe(0)
      expect(validatePsm(13)).toBe(13)
      expect(() => validatePsm(14)).toThrow(/psm/)
      expect(() => validatePsm(-1)).toThrow(/psm/)
      expect(() => validatePsm(1.5)).toThrow(/psm/)
    })

    it('truncates long output with an explicit notice', () => {
      expect(truncateOutput('short', 10)).toBe('short')
      const truncated = truncateOutput('a'.repeat(50), 10)
      expect(truncated.startsWith('a'.repeat(10))).toBe(true)
      expect(truncated).toContain('[output truncated at 10 characters]')
    })
  })

  describe('execution', () => {
    it('extracts text from an existing file through the mocked tesseract', async () => {
      const image = join(root, 'scan.png')
      await writeFile(image, 'fake image bytes')
      mockExecFile.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout: 'hello ocr\nworld', stderr: '' })
      })
      const result = await callOcr({ file_path: 'scan.png' })
      expect(result.isError).toBe(false)
      expect(text(result)).toBe('hello ocr\nworld')
      const { file, args, options } = lastExecCall()
      expect(file).toBe('/usr/bin/tesseract')
      expect(args).toEqual([await resolvedImage('scan.png'), 'stdout', '-l', 'eng'])
      expect(options.timeout).toBe(5000)
      expect(options.signal).toBeInstanceOf(AbortSignal)
    })

    it('passes an explicit language and psm through to tesseract', async () => {
      const image = join(root, 'doc.png')
      await writeFile(image, 'fake image bytes')
      mockExecFile.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout: '内容', stderr: '' })
      })
      const result = await callOcr({ file_path: 'doc.png', language: 'chi_sim', psm: 6 })
      expect(result.isError).toBe(false)
      expect(text(result)).toBe('内容')
      const { file, args } = lastExecCall()
      expect(file).toBe('/usr/bin/tesseract')
      expect(args).toEqual([await resolvedImage('doc.png'), 'stdout', '-l', 'chi_sim', '--psm', '6'])
    })

    it('rejects a missing file without invoking tesseract', async () => {
      const result = await callOcr({ file_path: 'nope.png' })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('not found')
      expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('rejects a non-regular file', async () => {
      const result = await callOcr({ file_path: '.' })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('not a regular file')
      expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('reports a missing tesseract binary with guidance', async () => {
      const image = join(root, 'scan.png')
      await writeFile(image, 'fake image bytes')
      mockExecFile.mockImplementation((_file, _args, _options, callback) => {
        callback(Object.assign(new Error('spawn /usr/bin/tesseract ENOENT'), { code: 'ENOENT' }), undefined)
      })
      const result = await callOcr({ file_path: 'scan.png' })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('tesseract binary not found')
      expect(text(result)).toContain('binPath')
    })

    it('surfaces tesseract stderr on failure', async () => {
      const image = join(root, 'scan.png')
      await writeFile(image, 'fake image bytes')
      mockExecFile.mockImplementation((_file, _args, _options, callback) => {
        callback(Object.assign(new Error('exited with code 1'), { stderr: 'read_params_file: error' }), undefined)
      })
      const result = await callOcr({ file_path: 'scan.png' })
      expect(result.isError).toBe(true)
      expect(text(result)).toContain('read_params_file: error')
    })

    it('rejects invalid language and psm arguments before touching the filesystem', async () => {
      const badLanguage = await callOcr({ file_path: 'scan.png', language: 'bad lang' })
      expect(badLanguage.isError).toBe(true)
      expect(text(badLanguage)).toContain('invalid tesseract language code')
      const badPsm = await callOcr({ file_path: 'scan.png', psm: 99 })
      expect(badPsm.isError).toBe(true)
      expect(text(badPsm)).toContain('psm')
      expect(mockExecFile).not.toHaveBeenCalled()
    })

    it('truncates oversized output', async () => {
      const image = join(root, 'big.png')
      await writeFile(image, 'fake image bytes')
      mockExecFile.mockImplementation((_file, _args, _options, callback) => {
        callback(null, { stdout: 'x'.repeat(5000), stderr: '' })
      })
      const result = await callOcr({ file_path: 'big.png' })
      expect(result.isError).toBe(false)
      expect(text(result)).toContain('[output truncated at 1000 characters]')
    })
  })
})
