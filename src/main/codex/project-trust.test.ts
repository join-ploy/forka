import { describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/types'

const testState = { fakeHomeDir: '' }

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os') // eslint-disable-line @typescript-eslint/consistent-type-imports -- vi.importActual requires inline import()
  return {
    ...actual,
    homedir: () => testState.fakeHomeDir
  }
})

function createSettings(overrides: Partial<GlobalSettings> = {}): GlobalSettings {
  return {
    codexTrustCreatedWorkspaces: true,
    codexManagedAccounts: [],
    ...overrides
  } as GlobalSettings
}

describe('Codex project trust', () => {
  let dir = ''

  function setup(): string {
    dir = mkdtempSync(join(tmpdir(), 'orca-codex-project-trust-'))
    testState.fakeHomeDir = join(dir, 'home')
    mkdirSync(testState.fakeHomeDir, { recursive: true })
    return dir
  }

  function cleanup(): void {
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
    dir = ''
    testState.fakeHomeDir = ''
  }

  it('adds a trusted project entry to the canonical Codex config', async () => {
    setup()
    try {
      const { stampCodexProjectTrustForSettings } = await import('./project-trust')
      const projectPath = join(dir, 'workspaces', 'feature-a')
      mkdirSync(projectPath, { recursive: true })

      const results = stampCodexProjectTrustForSettings([projectPath], createSettings())

      expect(results).toEqual([
        { configPath: join(testState.fakeHomeDir, '.codex', 'config.toml'), changed: true }
      ])
      expect(readFileSync(results[0].configPath, 'utf-8')).toContain(
        `[projects."${projectPath}"]\ntrust_level = "trusted"`
      )
    } finally {
      cleanup()
    }
  })

  it('updates existing trust_level without dropping other project settings', async () => {
    setup()
    try {
      const { upsertCodexProjectTrust } = await import('./project-trust')
      const configPath = join(dir, 'config.toml')
      const projectPath = join(dir, 'workspaces', 'feature-b')
      mkdirSync(projectPath, { recursive: true })
      writeFileSync(
        configPath,
        `[projects."${projectPath}"]\nmodel = "gpt-5"\ntrust_level = "untrusted"\n\n[profiles.default]\nmodel = "gpt-5"\n`,
        'utf-8'
      )

      expect(upsertCodexProjectTrust(configPath, projectPath)).toBe(true)

      expect(readFileSync(configPath, 'utf-8')).toBe(
        `[projects."${projectPath}"]\nmodel = "gpt-5"\ntrust_level = "trusted"\n\n[profiles.default]\nmodel = "gpt-5"\n`
      )
    } finally {
      cleanup()
    }
  })

  it('stamps managed Codex homes that carry Orca ownership markers', async () => {
    setup()
    try {
      const { stampCodexProjectTrustForSettings } = await import('./project-trust')
      const projectPath = join(dir, 'workspaces', 'feature-c')
      const managedHomePath = join(dir, 'managed-home')
      mkdirSync(projectPath, { recursive: true })
      mkdirSync(managedHomePath, { recursive: true })
      writeFileSync(join(managedHomePath, '.orca-managed-home'), 'account-1\n', 'utf-8')

      const results = stampCodexProjectTrustForSettings(
        [projectPath],
        createSettings({
          codexManagedAccounts: [
            {
              id: 'account-1',
              email: 'dev@example.com',
              managedHomePath,
              providerAccountId: null,
              workspaceLabel: null,
              workspaceAccountId: null,
              createdAt: 1,
              updatedAt: 1,
              lastAuthenticatedAt: 1
            }
          ]
        })
      )

      expect(results).toHaveLength(2)
      expect(existsSync(join(managedHomePath, 'config.toml'))).toBe(true)
      expect(readFileSync(join(managedHomePath, 'config.toml'), 'utf-8')).toContain(
        `[projects."${projectPath}"]\ntrust_level = "trusted"`
      )
    } finally {
      cleanup()
    }
  })
})
