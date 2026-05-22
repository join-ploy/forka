import { basename } from 'path'

import type { WorkspaceGroup } from '../shared/types'
import { splitWorktreeId } from '../shared/worktree-id'

/**
 * Resolve the ordered list of member subfolder names for a group.
 * Each entry is the basename of the corresponding member worktree's path
 * (i.e. the `<repoFolderName>` segment under `<parentPath>/`). Used to
 * populate the `CONDUCTOR_WORKSPACE_REPOS` env var.
 */
export function resolveGroupRepoNames(group: WorkspaceGroup): string[] {
  // Why: members live at `<parentPath>/<repoFolderName>`, encoded in the
  // worktreeId as `<repoId>::<path>`. Pull the basename out of the path
  // segment so the list mirrors what users see on disk.
  return group.memberWorktreeIds
    .map((id) => splitWorktreeId(id)?.worktreePath)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .map((p) => basename(p))
}

/**
 * Find the group that owns `worktreeId`, if any. Linear scan over a small N
 * (typically < 10 groups); fine for terminal-spawn frequency.
 */
export function findGroupForWorktree(
  worktreeId: string,
  groups: readonly WorkspaceGroup[]
): WorkspaceGroup | undefined {
  return groups.find((g) => g.memberWorktreeIds.includes(worktreeId))
}

/**
 * Decide the effective `cwd` for a new terminal in a group member.
 *
 * Default new terminals (no supplied cwd, or supplied cwd equal to the
 * worktree path the renderer fed in) land at the group's `parentPath` so
 * `pwd` shows the shared workspace folder and users can `cd` into any
 * member. Explicit overrides — "Open terminal here" from a file pane, or
 * a Cmd+D split inheriting a live cwd — keep whatever the caller supplied.
 *
 * Non-grouped worktrees fall through unchanged.
 */
export function resolveTerminalCwd(input: {
  worktreePath: string | undefined
  group: WorkspaceGroup | undefined
  suppliedCwd: string | undefined
}): string | undefined {
  const { worktreePath, group, suppliedCwd } = input
  if (!group) {
    return suppliedCwd
  }
  if (suppliedCwd === undefined || suppliedCwd === worktreePath) {
    return group.parentPath
  }
  return suppliedCwd
}
