import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { GlobalSettings } from '../../shared/types'
import { writeFileAtomically } from '../codex-accounts/fs-utils'

const MANAGED_HOME_MARKER = '.orca-managed-home'

export type StampCodexProjectTrustResult = {
  configPath: string
  changed: boolean
}

function resolveProjectPath(projectPath: string): string {
  try {
    return realpathSync(projectPath)
  } catch {
    return resolve(projectPath)
  }
}

function escapeTomlBasicString(value: string): string {
  let escaped = ''
  for (const char of value) {
    switch (char) {
      case '\\':
        escaped += '\\\\'
        break
      case '"':
        escaped += '\\"'
        break
      case String.fromCharCode(8):
        escaped += '\\b'
        break
      case '\t':
        escaped += '\\t'
        break
      case '\n':
        escaped += '\\n'
        break
      case '\f':
        escaped += '\\f'
        break
      case '\r':
        escaped += '\\r'
        break
      default:
        escaped += char
    }
  }
  return escaped
}

function codexProjectTableHeader(projectPath: string): string {
  return `[projects."${escapeTomlBasicString(projectPath)}"]`
}

function findProjectBlock(lines: string[], header: string): { start: number; end: number } | null {
  const start = lines.findIndex((line) => line.trim() === header)
  if (start === -1) {
    return null
  }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[/.test(lines[index])) {
      end = index
      break
    }
  }
  return { start, end }
}

function upsertTrustedProjectBlock(contents: string, projectPath: string): string {
  const normalizedPath = resolveProjectPath(projectPath)
  const header = codexProjectTableHeader(normalizedPath)
  const lines = contents.length > 0 ? contents.split('\n') : []
  const block = findProjectBlock(lines, header)

  if (!block) {
    const prefix = contents.length > 0 && !contents.endsWith('\n') ? '\n\n' : '\n'
    const separator = contents.length > 0 ? prefix : ''
    return `${contents}${separator}${header}\ntrust_level = "trusted"\n`
  }

  const nextLines = [...lines]
  const trustLineIndex = nextLines
    .slice(block.start + 1, block.end)
    .findIndex((line) => /^\s*trust_level\s*=/.test(line))

  if (trustLineIndex === -1) {
    nextLines.splice(block.start + 1, 0, 'trust_level = "trusted"')
  } else {
    nextLines[block.start + 1 + trustLineIndex] = 'trust_level = "trusted"'
  }

  let nextContents = nextLines.join('\n')
  if (contents.endsWith('\n') && !nextContents.endsWith('\n')) {
    nextContents += '\n'
  }
  return nextContents
}

export function upsertCodexProjectTrust(configPath: string, projectPath: string): boolean {
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : ''
  const next = upsertTrustedProjectBlock(existing, projectPath)
  if (next === existing) {
    return false
  }

  mkdirSync(dirname(configPath), { recursive: true })
  writeFileAtomically(configPath, next)
  return true
}

function getCodexHomeConfigPaths(settings: GlobalSettings): string[] {
  const paths = [join(homedir(), '.codex', 'config.toml')]
  for (const account of settings.codexManagedAccounts) {
    const managedHomePath = account.managedHomePath
    if (existsSync(join(managedHomePath, MANAGED_HOME_MARKER))) {
      paths.push(join(managedHomePath, 'config.toml'))
    }
  }
  return [...new Set(paths.map((path) => resolve(path)))]
}

export function stampCodexProjectTrustForSettings(
  projectPaths: string[],
  settings: GlobalSettings
): StampCodexProjectTrustResult[] {
  if (!settings.codexTrustCreatedWorkspaces) {
    return []
  }

  const uniqueProjectPaths = [...new Set(projectPaths.map(resolveProjectPath))]
  const configPaths = getCodexHomeConfigPaths(settings)
  const results: StampCodexProjectTrustResult[] = []
  for (const configPath of configPaths) {
    let changed = false
    for (const projectPath of uniqueProjectPaths) {
      changed = upsertCodexProjectTrust(configPath, projectPath) || changed
    }
    results.push({ configPath, changed })
  }
  return results
}
