import { describe, expect, it } from 'vitest'

import type { WorkspaceGroup } from '../shared/types'
import {
  findGroupForWorktree,
  resolveGroupRepoNames,
  resolveTerminalCwd
} from './workspace-group-runtime'

const makeGroup = (overrides: Partial<WorkspaceGroup> = {}): WorkspaceGroup => ({
  id: 'group:abc',
  workspaceName: 'daring_tiger',
  displayName: 'daring_tiger',
  parentPath: '/u/m/workspaces/daring_tiger',
  memberWorktreeIds: [
    'repo-orca::/u/m/workspaces/daring_tiger/orca',
    'repo-ploy::/u/m/workspaces/daring_tiger/ploy-client'
  ],
  branchName: 'daring_tiger',
  isArchived: false,
  archivedAt: null,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0,
  isUnread: false,
  comment: '',
  createdAt: 0,
  linkedIssue: null,
  linkedLinearIssue: null,
  ...overrides
})

describe('resolveGroupRepoNames', () => {
  it('returns ordered member subfolder basenames', () => {
    expect(resolveGroupRepoNames(makeGroup())).toEqual(['orca', 'ploy-client'])
  })

  it('drops malformed worktreeIds that have no `::path` segment', () => {
    const group = makeGroup({
      memberWorktreeIds: ['repo-orca::/path/orca', 'bare-id-no-separator']
    })
    expect(resolveGroupRepoNames(group)).toEqual(['orca'])
  })

  it('returns an empty list when the group has no members', () => {
    expect(resolveGroupRepoNames(makeGroup({ memberWorktreeIds: [] }))).toEqual([])
  })
})

describe('findGroupForWorktree', () => {
  it('finds the group that contains the worktreeId', () => {
    const group = makeGroup()
    expect(
      findGroupForWorktree('repo-ploy::/u/m/workspaces/daring_tiger/ploy-client', [group])
    ).toBe(group)
  })

  it('returns undefined when no group contains the worktreeId', () => {
    expect(findGroupForWorktree('repo-other::/elsewhere', [makeGroup()])).toBeUndefined()
  })

  it('returns undefined when there are no groups', () => {
    expect(findGroupForWorktree('any-id', [])).toBeUndefined()
  })
})

describe('resolveTerminalCwd', () => {
  const group = makeGroup()
  const worktreePath = '/u/m/workspaces/daring_tiger/orca'

  it('falls through to suppliedCwd for non-grouped worktrees', () => {
    expect(
      resolveTerminalCwd({
        worktreePath,
        group: undefined,
        suppliedCwd: worktreePath
      })
    ).toBe(worktreePath)
  })

  it('falls through to undefined for non-grouped worktrees with no cwd', () => {
    expect(
      resolveTerminalCwd({
        worktreePath,
        group: undefined,
        suppliedCwd: undefined
      })
    ).toBeUndefined()
  })

  it('overrides default cwd (equal to worktreePath) to the group parentPath', () => {
    expect(
      resolveTerminalCwd({
        worktreePath,
        group,
        suppliedCwd: worktreePath
      })
    ).toBe(group.parentPath)
  })

  it('overrides absent cwd to the group parentPath', () => {
    expect(
      resolveTerminalCwd({
        worktreePath,
        group,
        suppliedCwd: undefined
      })
    ).toBe(group.parentPath)
  })

  it('keeps an explicit cwd override (e.g. "New terminal here" from a subfolder)', () => {
    expect(
      resolveTerminalCwd({
        worktreePath,
        group,
        suppliedCwd: `${worktreePath}/src/main`
      })
    ).toBe(`${worktreePath}/src/main`)
  })

  it('keeps an explicit cwd in a sibling member subfolder', () => {
    const siblingCwd = '/u/m/workspaces/daring_tiger/ploy-client/src'
    expect(
      resolveTerminalCwd({
        worktreePath,
        group,
        suppliedCwd: siblingCwd
      })
    ).toBe(siblingCwd)
  })
})
