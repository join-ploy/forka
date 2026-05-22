// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PRInfo, Repo, WorkspaceGroup, Worktree } from '../../../../shared/types'
import type { CacheEntry } from '@/store/slices/github'
import type { WorktreeScriptsEntry } from '@/store/slices/scripts'

// Why: GroupCard reads members/repos/prCache/scriptsByWorktree off the store.
// Provide a minimal in-memory slice surface so each test seeds the data it
// needs without booting the real zustand store.
type StoreState = {
  worktreesByRepo: Record<string, Worktree[]>
  repos: Repo[]
  workspaceGroups: WorkspaceGroup[]
  prCache: Record<string, CacheEntry<PRInfo>>
  scriptsByWorktree: Record<string, WorktreeScriptsEntry>
  setActiveWorktree: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => {
  return {
    state: {
      worktreesByRepo: {},
      repos: [],
      workspaceGroups: [],
      prCache: {},
      scriptsByWorktree: {},
      setActiveWorktree: vi.fn()
    } as StoreState
  }
})

vi.mock('@/store', () => ({
  useAppStore: <T,>(selector: (state: StoreState) => T): T => selector(mocks.state)
}))

const runGroupArchiveMock = vi.fn()
vi.mock('./archive-group-flow', () => ({
  runGroupArchive: (id: string, name: string) => runGroupArchiveMock(id, name)
}))

import GroupCard from './GroupCard'

const IDLE_SCRIPT = {
  ptyId: null,
  status: 'idle' as const,
  exitCode: null,
  startedAt: null
}

function makeWorktree(overrides: Partial<Worktree> & { id: string; repoId: string }): Worktree {
  const { id, repoId, ...rest } = overrides
  return {
    id,
    repoId,
    path: `/tmp/${id}`,
    head: 'abc123',
    branch: 'refs/heads/feature',
    isBare: false,
    isMainWorktree: false,
    displayName: id,
    workspaceName: '',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    archivedAt: null,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    ...rest
  }
}

function makeRepo(overrides: Partial<Repo> & { id: string; displayName: string }): Repo {
  return {
    path: `/tmp/${overrides.id}`,
    badgeColor: '#000',
    addedAt: 0,
    ...overrides
  } as Repo
}

function makeGroup(overrides: Partial<WorkspaceGroup> & { id: string }): WorkspaceGroup {
  return {
    workspaceName: 'daring_tiger',
    displayName: 'daring_tiger',
    parentPath: '/tmp/workspaces/daring_tiger',
    memberWorktreeIds: [],
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
  }
}

function seed({
  worktrees,
  repos,
  groups,
  prCache,
  scriptsByWorktree
}: {
  worktrees: Worktree[]
  repos: Repo[]
  groups: WorkspaceGroup[]
  prCache?: Record<string, CacheEntry<PRInfo>>
  scriptsByWorktree?: Record<string, WorktreeScriptsEntry>
}): void {
  const worktreesByRepo: Record<string, Worktree[]> = {}
  for (const wt of worktrees) {
    worktreesByRepo[wt.repoId] = [...(worktreesByRepo[wt.repoId] ?? []), wt]
  }
  mocks.state.worktreesByRepo = worktreesByRepo
  mocks.state.repos = repos
  mocks.state.workspaceGroups = groups
  mocks.state.prCache = prCache ?? {}
  mocks.state.scriptsByWorktree = scriptsByWorktree ?? {}
}

describe('<GroupCard />', () => {
  beforeEach(() => {
    cleanup()
    mocks.state.setActiveWorktree.mockClear()
    runGroupArchiveMock.mockClear()
    seed({ worktrees: [], repos: [], groups: [] })
  })

  it('renders the group displayName in the header', () => {
    const wt = makeWorktree({ id: 'wt-orca', repoId: 'repo-orca' })
    const repo = makeRepo({ id: 'repo-orca', displayName: 'orca' })
    const group = makeGroup({
      id: 'group:1',
      displayName: 'daring_tiger',
      memberWorktreeIds: [wt.id]
    })
    seed({ worktrees: [wt], repos: [repo], groups: [group] })

    render(<GroupCard group={group} />)

    expect(screen.getByText('daring_tiger')).toBeTruthy()
  })

  it('renders one row per member repo using each repo display name', () => {
    const wtOrca = makeWorktree({ id: 'wt-orca', repoId: 'repo-orca' })
    const wtPloy = makeWorktree({ id: 'wt-ploy', repoId: 'repo-ploy' })
    const repos = [
      makeRepo({ id: 'repo-orca', displayName: 'orca' }),
      makeRepo({ id: 'repo-ploy', displayName: 'ploy-client' })
    ]
    const group = makeGroup({
      id: 'group:1',
      memberWorktreeIds: [wtOrca.id, wtPloy.id]
    })
    seed({ worktrees: [wtOrca, wtPloy], repos, groups: [group] })

    render(<GroupCard group={group} />)

    const rows = screen.getAllByTestId('group-member-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('orca')
    expect(rows[1].textContent).toContain('ploy-client')
  })

  it('renders a PR row when a member has a linkedPR and prCache entry', () => {
    const wt = makeWorktree({
      id: 'wt-orca',
      repoId: 'repo-orca',
      branch: 'refs/heads/daring_tiger',
      linkedPR: 123
    })
    const repo = makeRepo({ id: 'repo-orca', displayName: 'orca' })
    const group = makeGroup({ id: 'group:1', memberWorktreeIds: [wt.id] })
    // Why: prCache is keyed `${repo.path}::${branch}` — same convention used
    // by WorktreeCard. Mirror that here so GroupCard's lookup hits.
    const prCacheKey = `${repo.path}::daring_tiger`
    const prCache: Record<string, CacheEntry<PRInfo>> = {
      [prCacheKey]: {
        data: {
          number: 123,
          title: 'feat: thing',
          state: 'open',
          url: 'https://example.test/pr/123',
          checksStatus: 'neutral',
          updatedAt: '2026-05-22T00:00:00Z',
          mergeable: 'MERGEABLE'
        },
        fetchedAt: 0
      }
    }
    seed({ worktrees: [wt], repos: [repo], groups: [group], prCache })

    render(<GroupCard group={group} />)

    const row = screen.getByTestId('group-member-row')
    expect(row.textContent).toContain('#123')
    expect(row.textContent).toContain('open')
  })

  it('right-click → Archive Group fires runGroupArchive with the group id', () => {
    const wt = makeWorktree({ id: 'wt-orca', repoId: 'repo-orca' })
    const repo = makeRepo({ id: 'repo-orca', displayName: 'orca' })
    const group = makeGroup({
      id: 'group:1',
      displayName: 'daring_tiger',
      memberWorktreeIds: [wt.id]
    })
    seed({ worktrees: [wt], repos: [repo], groups: [group] })

    render(<GroupCard group={group} />)

    const card = screen.getByTestId('group-card')
    fireEvent.contextMenu(card)

    const archiveItem = screen.getByTestId('group-card-archive-action')
    fireEvent.click(archiveItem)

    expect(runGroupArchiveMock).toHaveBeenCalledWith('group:1', 'daring_tiger')
  })

  it('renders the archive-cleanup error inline when one is stamped on the group', () => {
    const wt = makeWorktree({ id: 'wt-orca', repoId: 'repo-orca' })
    const repo = makeRepo({ id: 'repo-orca', displayName: 'orca' })
    const group = makeGroup({
      id: 'group:1',
      memberWorktreeIds: [wt.id],
      archiveCleanupError: 'repo-b refused: dirty tree'
    })
    seed({ worktrees: [wt], repos: [repo], groups: [group] })

    render(<GroupCard group={group} />)

    const errorRow = screen.getByTestId('group-archive-cleanup-error')
    expect(errorRow.textContent).toContain('repo-b refused')
  })

  it('shows a running indicator when at least one member has a running run script', () => {
    const wtA = makeWorktree({ id: 'wt-a', repoId: 'repo-a' })
    const wtB = makeWorktree({ id: 'wt-b', repoId: 'repo-b' })
    const repos = [
      makeRepo({ id: 'repo-a', displayName: 'a' }),
      makeRepo({ id: 'repo-b', displayName: 'b' })
    ]
    const group = makeGroup({
      id: 'group:1',
      memberWorktreeIds: [wtA.id, wtB.id]
    })
    const scriptsByWorktree: Record<string, WorktreeScriptsEntry> = {
      [wtB.id]: {
        run: { ptyId: 'p-1', status: 'running', exitCode: null, startedAt: 0 },
        setup: IDLE_SCRIPT
      }
    }
    seed({
      worktrees: [wtA, wtB],
      repos,
      groups: [group],
      scriptsByWorktree
    })

    render(<GroupCard group={group} />)

    expect(screen.getByTestId('group-running-dot')).toBeTruthy()
  })
})
