// Why: per-repo run-script IPC contract shared between main, preload, and
// renderer. Declared here (not in src/main/ipc/run-script.ts) so the renderer
// slice and preload bridge can import the result/event shapes without pulling
// in main-process modules. See docs/plans/2026-05-14-per-repo-run-script-design.md.

export type RunStartArgs = {
  repoId: string
  worktreeId: string
}

export type RunStopArgs = {
  repoId: string
}

export type RunStartFailureReason =
  | 'no-run-script'
  | 'repo-not-found'
  | 'invalid-worktree'
  | 'no-provider'
  | 'spawn-failed'

export type RunStartResult =
  | { ok: true; ptyId: string }
  | { ok: false; reason: RunStartFailureReason }

export type RunStopFailureReason = 'not-running' | 'no-provider'

export type RunStopResult = { ok: true } | { ok: false; reason: RunStopFailureReason }

export type RunStartedEvent = {
  repoId: string
  worktreeId: string
  ptyId: string
}

export type RunExitedEvent = {
  repoId: string
  worktreeId: string
  code: number
}
