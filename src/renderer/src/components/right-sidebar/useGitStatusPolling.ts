import { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import {
  getOrderedGroupMemberIdsForWorktree,
  useActiveWorktree,
  useAllWorktrees,
  useRepoById,
  useRepoMap
} from '@/store/selectors'
import type { GitConflictOperation, GitStatusResult } from '../../../../shared/types'
import { isGitRepoKind } from '../../../../shared/repo-kind'
import { getConnectionId } from '@/lib/connection-context'

const POLL_INTERVAL_MS = 3000
// Why: sibling members of the active worktree's WorkspaceGroup share the
// sidebar viewport with the active row. Polling them on the same cadence
// keeps their changedFileCount, branch identity, and conflict op fresh —
// before this, those numbers were frozen at whatever the user had last
// warmed by visiting the sibling member directly, which felt unreactive
// in long-lived groups.
const GROUP_SIBLING_POLL_INTERVAL_MS = 3000

export function useGitStatusPolling(): void {
  const activeWorktree = useActiveWorktree()
  const allWorktrees = useAllWorktrees()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const updateWorktreeGitIdentity = useAppStore((s) => s.updateWorktreeGitIdentity)
  const setGitStatus = useAppStore((s) => s.setGitStatus)
  const fetchUpstreamStatus = useAppStore((s) => s.fetchUpstreamStatus)
  const setUpstreamStatus = useAppStore((s) => s.setUpstreamStatus)
  const setConflictOperation = useAppStore((s) => s.setConflictOperation)
  const conflictOperationByWorktree = useAppStore((s) => s.gitConflictOperationByWorktree)
  const repoMap = useRepoMap()

  const worktreePath = activeWorktree?.path ?? null
  const activeRepoId = activeWorktree?.repoId ?? null
  const activeRepo = useRepoById(activeRepoId)
  const activeRepoSupportsGit = activeRepo ? isGitRepoKind(activeRepo) : false

  // Why: build a list of non-active worktrees that still have a known conflict
  // operation (merge/rebase/cherry-pick). These need lightweight polling so
  // their sidebar badges clear when the operation finishes — the full git status
  // poll only covers the active worktree.
  const staleConflictWorktrees = useMemo(() => {
    const result: { id: string; path: string }[] = []
    for (const [worktreeId, op] of Object.entries(conflictOperationByWorktree)) {
      if (worktreeId === activeWorktreeId || op === 'unknown') {
        continue
      }
      const worktree = allWorktrees.find((entry) => entry.id === worktreeId)
      if (worktree) {
        const repo = repoMap.get(worktree.repoId)
        if (repo && !isGitRepoKind(repo)) {
          continue
        }
        result.push({ id: worktree.id, path: worktree.path })
      }
    }
    return result
  }, [allWorktrees, conflictOperationByWorktree, activeWorktreeId, repoMap])

  const fetchStatus = useCallback(async () => {
    if (!activeWorktreeId || !worktreePath || !activeRepoSupportsGit) {
      return
    }
    try {
      const connectionId = getConnectionId(activeWorktreeId) ?? undefined
      const status = (await window.api.git.status({
        worktreePath,
        connectionId
      })) as GitStatusResult
      setGitStatus(activeWorktreeId, status)
      // Why: branch switches can happen inside a terminal. `git status
      // --branch` gives us the new identity without a separate worktree-list
      // poll that would repeatedly touch repo/worktree roots.
      updateWorktreeGitIdentity(activeWorktreeId, {
        head: status.head,
        branch: status.branch
      })
      if (status.upstreamStatus) {
        setUpstreamStatus(activeWorktreeId, status.upstreamStatus)
      } else {
        await fetchUpstreamStatus(activeWorktreeId, worktreePath, connectionId)
      }
    } catch {
      // ignore
    }
  }, [
    activeRepoSupportsGit,
    activeWorktreeId,
    fetchUpstreamStatus,
    worktreePath,
    setGitStatus,
    setUpstreamStatus,
    updateWorktreeGitIdentity
  ])

  useEffect(() => {
    void fetchStatus()
    // Why: skip IPC-heavy git status calls when the window is not focused.
    // These intervals run at the App root level regardless of which sidebar tab
    // is open, so gating on document.hasFocus() prevents wasted CPU and IPC
    // traffic while the user is working in another application.
    const intervalId = setInterval(() => {
      if (document.hasFocus()) {
        void fetchStatus()
      }
    }, POLL_INTERVAL_MS)
    // Why: when the user returns to the window, poll immediately so the sidebar
    // shows up-to-date status without waiting up to POLL_INTERVAL_MS.
    const onFocus = (): void => void fetchStatus()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchStatus])

  // Why: build the active worktree's sibling-group member list once per
  // render. Using getOrderedGroupMemberIdsForWorktree keeps semantics aligned
  // with the aggregated tab strip (live + non-archived in declared order).
  const groupSiblingTargets = useAppStore(
    useShallow((state) => {
      if (!activeWorktreeId) {
        return [] as { id: string; path: string }[]
      }
      const orderedIds = getOrderedGroupMemberIdsForWorktree(state, activeWorktreeId)
      if (orderedIds.length === 0) {
        return [] as { id: string; path: string }[]
      }
      const out: { id: string; path: string }[] = []
      for (const id of orderedIds) {
        if (id === activeWorktreeId) {
          continue
        }
        const worktree = allWorktrees.find((entry) => entry.id === id)
        if (!worktree) {
          continue
        }
        const repo = repoMap.get(worktree.repoId)
        if (repo && !isGitRepoKind(repo)) {
          continue
        }
        out.push({ id: worktree.id, path: worktree.path })
      }
      return out
    })
  )

  const fetchSiblingStatus = useCallback(async () => {
    if (groupSiblingTargets.length === 0) {
      return
    }
    // Why: sequential await intentional. The sidebar typically has at most a
    // handful of sibling members per group; a Promise.all fan-out would push
    // multiple `git status` IPCs into flight concurrently, contending with
    // the active-worktree poll and any user-initiated git calls. Sequential
    // keeps the polling backpressure-friendly without measurable latency
    // (each call is ~30ms on local repos).
    for (const { id, path } of groupSiblingTargets) {
      try {
        const connectionId = getConnectionId(id) ?? undefined
        const status = (await window.api.git.status({
          worktreePath: path,
          connectionId
        })) as GitStatusResult
        setGitStatus(id, status)
        updateWorktreeGitIdentity(id, { head: status.head, branch: status.branch })
        if (status.upstreamStatus) {
          setUpstreamStatus(id, status.upstreamStatus)
        }
      } catch {
        // ignore — sibling worktree may have been removed mid-poll
      }
    }
  }, [groupSiblingTargets, setGitStatus, setUpstreamStatus, updateWorktreeGitIdentity])

  useEffect(() => {
    if (groupSiblingTargets.length === 0) {
      return
    }
    void fetchSiblingStatus()
    const intervalId = setInterval(() => {
      if (document.hasFocus()) {
        void fetchSiblingStatus()
      }
    }, GROUP_SIBLING_POLL_INTERVAL_MS)
    const onFocus = (): void => void fetchSiblingStatus()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [groupSiblingTargets, fetchSiblingStatus])

  // Why: poll conflict operation for non-active worktrees that have a stale
  // non-unknown operation. This is a lightweight fs-only check (no git status)
  // so it won't cause performance issues even with many worktrees.
  useEffect(() => {
    if (staleConflictWorktrees.length === 0) {
      return
    }

    const pollStale = async (): Promise<void> => {
      for (const { id, path } of staleConflictWorktrees) {
        try {
          const op = (await window.api.git.conflictOperation({
            worktreePath: path,
            connectionId: getConnectionId(id) ?? undefined
          })) as GitConflictOperation
          setConflictOperation(id, op)
        } catch {
          // ignore — worktree may have been removed
        }
      }
    }

    void pollStale()
    const intervalId = setInterval(() => {
      if (document.hasFocus()) {
        void pollStale()
      }
    }, POLL_INTERVAL_MS)
    const onFocus = (): void => void pollStale()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
    }
  }, [staleConflictWorktrees, setConflictOperation])
}
