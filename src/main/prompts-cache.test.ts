import type * as NodeOs from 'node:os'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Why: redirect homedir() at the os module so writePromptFile lands in a
// tmpdir we can introspect, without depending on the real ~/.orca path.
const homedirMock = vi.hoisted(() => vi.fn<() => string>())
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOs>()
  return { ...actual, homedir: homedirMock }
})

describe('slugifyPromptLabel', () => {
  it('lowercases and replaces non [a-z0-9_-] runs with a single dash', async () => {
    const { slugifyPromptLabel } = await import('./prompts-cache')
    expect(slugifyPromptLabel('Create PR')).toBe('create-pr')
    expect(slugifyPromptLabel('Review!! :: now')).toBe('review-now')
    expect(slugifyPromptLabel('keeps_underscores-and-dashes')).toBe('keeps_underscores-and-dashes')
  })

  it('treats labels that differ only by case/whitespace as the same slug', async () => {
    const { slugifyPromptLabel } = await import('./prompts-cache')
    expect(slugifyPromptLabel('Create PR')).toBe(slugifyPromptLabel('create pr'))
  })

  it('falls back to "prompt" when the label has no usable characters', async () => {
    const { slugifyPromptLabel } = await import('./prompts-cache')
    expect(slugifyPromptLabel('')).toBe('prompt')
    expect(slugifyPromptLabel('!!!')).toBe('prompt')
    expect(slugifyPromptLabel('   ')).toBe('prompt')
  })
})

describe('writePromptFile', () => {
  let tmpHome: string

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), 'orca-prompts-cache-'))
    homedirMock.mockReturnValue(tmpHome)
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
    homedirMock.mockReset()
  })

  it('writes the prompt body to ~/.orca/prompts/<slug>.md and returns the absolute path', async () => {
    const { writePromptFile } = await import('./prompts-cache')
    const filePath = await writePromptFile('Create PR', 'hello body')

    const expected = join(tmpHome, '.orca', 'prompts', 'create-pr.md')
    expect(filePath).toBe(expected)
    // Why: assert absolute by checking it begins with the OS path separator
    // (POSIX) or a Windows drive letter — we don't want to require a
    // specific tmpdir location, just that the returned path is absolute.
    expect(filePath.startsWith(sep) || /^[A-Za-z]:/.test(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf-8')).toBe('hello body')
  })

  it('overwrites the existing file in place on repeat writes', async () => {
    const { writePromptFile } = await import('./prompts-cache')
    const first = await writePromptFile('Review', 'first body')
    const second = await writePromptFile('Review', 'second body')

    expect(first).toBe(second)
    expect(readFileSync(second, 'utf-8')).toBe('second body')
  })

  it('creates the prompts cache directory when it does not exist yet', async () => {
    const { writePromptFile, getPromptsCacheDir } = await import('./prompts-cache')
    const filePath = await writePromptFile('Review', 'body')
    expect(filePath.startsWith(getPromptsCacheDir())).toBe(true)
  })
})
