import React, { useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import type { PRState, WorkspaceGroup } from '../../../../shared/types'
import { getMemberWorktreesForGroup, getRepoMapFromState } from '@/store/selectors'
import { groupIsRunning } from './group-aggregation'
import { getWorktreeCardPrDisplay } from './worktree-card-pr-display'
import { prStateLabel, branchDisplayName } from './WorktreeCardHelpers'

export type GroupCardProps = {
  group: WorkspaceGroup
  isActive?: boolean
}

// Why: PR-state coloring mirrors the swatches used in WorktreeCardMeta's PR
// section so grouped rows speak the same visual language as ungrouped cards
// without pulling in the full HoverCard/dropdown chrome.
const PR_STATE_CLASSES: Record<PRState, string> = {
  open: 'text-emerald-500/80',
  draft: 'text-muted-foreground/60',
  merged: 'text-purple-600/70 dark:text-purple-400/70',
  closed: 'text-muted-foreground/60'
}

const GroupCard = React.memo(function GroupCard({ group, isActive = false }: GroupCardProps) {
  const setActiveWorktree = useAppStore((s) => s.setActiveWorktree)

  const members = useAppStore(useShallow((s) => getMemberWorktreesForGroup(s, group.id)))
  const repoMap = useAppStore((s) => getRepoMapFromState(s))
  const prCache = useAppStore((s) => s.prCache)

  // Why: runningWorktreeIds is not a first-class store field yet; derive it
  // from scriptsByWorktree on the fly. Mirrors how WorktreeCard reads its own
  // run-active flag (slices/scripts.ts). TODO: lift to a shared selector once
  // GroupsSection (E4) and other surfaces start needing it.
  const runningWorktreeIds = useAppStore(
    useShallow((s) => {
      const ids = new Set<string>()
      for (const [worktreeId, entry] of Object.entries(s.scriptsByWorktree)) {
        if (entry.run.status === 'running') {
          ids.add(worktreeId)
        }
      }
      return ids
    })
  )

  const isRunning = useMemo(
    () => groupIsRunning(members, runningWorktreeIds),
    [members, runningWorktreeIds]
  )

  const handleClick = useCallback(() => {
    // TODO: real group-activation lands when Phase F/G wires the main pane.
    // For now, activate the first member so clicking the card has feedback.
    const firstMemberId = group.memberWorktreeIds[0]
    if (firstMemberId) {
      setActiveWorktree(firstMemberId)
    }
  }, [group.memberWorktreeIds, setActiveWorktree])

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Group ${group.displayName}`}
      aria-pressed={isActive}
      className={cn(
        'group relative flex flex-col gap-1.5 px-2 py-2 cursor-pointer transition-all duration-200 outline-none select-none ml-1 rounded-lg',
        isActive
          ? 'bg-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-black/[0.015] dark:bg-white/[0.10] dark:border-border/40 dark:shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
          : 'border border-transparent hover:bg-sidebar-accent/40'
      )}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
      data-testid="group-card"
    >
      {/* Header row: optional running dot + group displayName */}
      <div className="flex items-center gap-1.5 min-w-0">
        {isRunning && (
          <span
            aria-label="A member is running"
            role="img"
            className="inline-block size-2 rounded-full bg-emerald-500 shrink-0"
            data-testid="group-running-dot"
          />
        )}
        <span className="text-[13px] font-normal truncate leading-tight text-foreground">
          {group.displayName}
        </span>
      </div>

      {/* Body: one row per member repo */}
      {members.length > 0 && (
        <div className="flex flex-col gap-0.5 pl-0.5">
          {members.map((member) => {
            const repo = repoMap.get(member.repoId)
            const repoName = repo?.displayName ?? member.repoId
            // Why: prCache is keyed by `${repo.path}::${branch}` (see
            // WorktreeCard.tsx where the same key is computed), not by
            // worktreeId — match that layout so a member's cached PR
            // resolves the same way it does on its standalone card.
            const branch = branchDisplayName(member.branch)
            const prCacheKey = repo && branch ? `${repo.path}::${branch}` : ''
            const prEntry = prCacheKey ? prCache[prCacheKey] : undefined
            const pr = prEntry?.data ?? undefined
            const prDisplay = getWorktreeCardPrDisplay(pr, member.linkedPR)
            const prState = prDisplay?.state
            return (
              <div
                key={member.id}
                className="flex items-center gap-1.5 min-w-0 text-[12px] leading-tight"
                data-testid="group-member-row"
                data-member-id={member.id}
              >
                <span className="text-muted-foreground truncate flex-1 min-w-0">{repoName}</span>
                {prDisplay && (
                  <span className="flex items-center gap-1 shrink-0 tabular-nums">
                    <span className="text-muted-foreground/80">#{prDisplay.number}</span>
                    {prState && (
                      <span className={cn('text-[11px]', PR_STATE_CLASSES[prState])}>
                        {prStateLabel(prState).toLowerCase()}
                      </span>
                    )}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

export default GroupCard
