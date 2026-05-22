import { toast } from 'sonner'
import { useAppStore } from '@/store'

/**
 * Group archive entrypoint shared by the GroupCard context menu. Mirrors
 * `runWorktreeArchive` in archive-worktree-flow.ts but speaks to the
 * group-level IPC which fans cleanup out across every member in parallel.
 *
 * No undo affordance in v1: the design doc explicitly defers a "Restore
 * archived group" flow (see docs/plans/2026-05-22-grouped-workspaces-design.md
 * § "Out of scope for v1"). Failure surfaces a destructive toast — the
 * main-process handler has already stamped `archiveCleanupError` on the
 * group so the user can hover the "Cleanup blocked" badge in the visible
 * card to see which member(s) refused.
 */
export function runGroupArchive(groupId: string, displayName: string): void {
  useAppStore
    .getState()
    .archiveGroup(groupId)
    .then(() => {
      toast.info(`Archived group "${displayName}"`)
    })
    .catch((err: unknown) => {
      toast.error(`Failed to archive group "${displayName}"`, {
        description: err instanceof Error ? err.message : String(err)
      })
    })
}
