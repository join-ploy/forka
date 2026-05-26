import type { IGitProvider } from '../providers/types'
import { getSshGitProvider } from '../providers/ssh-git-dispatch'
import { getBranchCompare, getStatus } from '../git/status'

export type PromptMainChangeTarget = {
  worktreeId: string
  path: string
  connectionId: string | null
}

export type PromptMainChangeResult = {
  hasChanges: boolean
  checkedWorktreeIds: string[]
}

const BASE_REF_CANDIDATES = ['origin/main', 'main'] as const

export async function hasPromptTargetChangesFromMain(
  targets: PromptMainChangeTarget[]
): Promise<PromptMainChangeResult> {
  const checkedWorktreeIds: string[] = []
  for (const target of targets) {
    checkedWorktreeIds.push(target.worktreeId)
    if (await targetHasChangesFromMain(target)) {
      return { hasChanges: true, checkedWorktreeIds }
    }
  }
  return { hasChanges: false, checkedWorktreeIds }
}

async function targetHasChangesFromMain(target: PromptMainChangeTarget): Promise<boolean> {
  try {
    const provider = getGitProviderForTarget(target)
    if (!provider && target.connectionId) {
      return true
    }

    const status = provider ? await provider.getStatus(target.path) : await getStatus(target.path)
    if (status.entries.length > 0) {
      return true
    }

    for (const baseRef of BASE_REF_CANDIDATES) {
      const compare = provider
        ? await provider.getBranchCompare(target.path, baseRef)
        : await getBranchCompare(target.path, baseRef)
      if (compare.summary.status === 'ready') {
        return compare.summary.changedFiles > 0
      }
      if (compare.summary.status !== 'invalid-base') {
        return true
      }
    }
  } catch {
    return true
  }

  // Why: if neither origin/main nor main resolves, running the prompt is safer
  // than silently skipping work on an unknown repository shape.
  return true
}

function getGitProviderForTarget(target: PromptMainChangeTarget): IGitProvider | null {
  if (!target.connectionId) {
    return null
  }
  return getSshGitProvider(target.connectionId) ?? null
}
