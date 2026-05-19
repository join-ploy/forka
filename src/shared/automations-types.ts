import type { TuiAgent } from './types'

export type AutomationWorkspaceMode = 'existing' | 'new_per_run'
export type AutomationExecutionTargetType = 'local' | 'ssh'
export type AutomationSchedulerOwner = 'local_host_service' | 'ssh_bridge' | 'remote_host_service'
export type AutomationMissedRunPolicy = 'run_once_within_grace'
export type AutomationRunStatus =
  | 'pending'
  | 'dispatching'
  | 'dispatched'
  | 'completed'
  | 'skipped_missed'
  | 'skipped_unavailable'
  | 'skipped_needs_interactive_auth'
  | 'dispatch_failed'
export type AutomationRunTrigger = 'scheduled' | 'manual'

export type AutomationSchedulePreset = 'hourly' | 'daily' | 'weekdays' | 'weekly'

export type Automation = {
  id: string
  name: string
  prompt: string
  agentId: TuiAgent
  projectId: string
  executionTargetType: AutomationExecutionTargetType
  executionTargetId: string
  schedulerOwner: AutomationSchedulerOwner
  workspaceMode: AutomationWorkspaceMode
  workspaceId: string | null
  baseBranch: string | null
  timezone: string
  rrule: string
  dtstart: number
  enabled: boolean
  nextRunAt: number
  lastRunAt?: number
  missedRunPolicy: AutomationMissedRunPolicy
  missedRunGraceMinutes: number
  createdAt: number
  updatedAt: number
  // ── Phase 1 additions (optional during migration) ──
  trigger?: TriggerConfig
  steps?: Step[]
  haltOnFailure?: boolean
  maxConcurrentRuns?: number
  deduplicationKey?: string | null
}

export type AutomationRun = {
  id: string
  automationId: string
  title: string
  scheduledFor: number
  status: AutomationRunStatus
  trigger: AutomationRunTrigger
  workspaceId: string | null
  sessionKind: 'terminal'
  chatSessionId: string | null
  terminalSessionId: string | null
  error: string | null
  startedAt: number | null
  dispatchedAt: number | null
  createdAt: number
  // ── Phase 1 additions (optional during migration) ──
  stepStates?: StepRunState[]
  context?: Record<string, unknown>
}

export type AutomationCreateInput = {
  name: string
  prompt: string
  agentId: TuiAgent
  projectId: string
  workspaceMode: AutomationWorkspaceMode
  workspaceId?: string | null
  baseBranch?: string | null
  timezone: string
  rrule: string
  dtstart: number
  enabled?: boolean
  missedRunGraceMinutes?: number
}

export type AutomationUpdateInput = Partial<
  Pick<
    Automation,
    | 'name'
    | 'prompt'
    | 'agentId'
    | 'projectId'
    | 'workspaceMode'
    | 'workspaceId'
    | 'baseBranch'
    | 'timezone'
    | 'rrule'
    | 'dtstart'
    | 'enabled'
    | 'missedRunGraceMinutes'
  >
>

export type AutomationDispatchRequest = {
  automation: Automation
  run: AutomationRun
}

export type AutomationDispatchResult = {
  runId: string
  status: AutomationRunStatus
  workspaceId?: string | null
  terminalSessionId?: string | null
  error?: string | null
}

// ── Chain engine (Phase 1) ───────────────────────────────────────────

export type TriggerConfig = { kind: 'manual' }
// Phase 3 adds: | { kind: 'schedule'; rrule, dtstart, timezone, missedRunGraceMinutes }
// Phase 4 adds: | { kind: 'linear'; teamId, eventTypes, filters }

export type StepKind = 'run-prompt'
// Phase 2 adds: 'create-worktree' | 'wait-for-setup' | 'run-command'

export type RunPromptConfig = {
  worktreeRef: string // template, e.g. '{{automation.workspaceId}}'
  agentId: TuiAgent
  prompt: string // template
  doneDebounceSeconds: number // default 15
}

export type StepConfig = RunPromptConfig
// Future kinds union additional configs here.

export type Step = {
  id: string
  kind: StepKind
  config: StepConfig
  onFailure: 'halt' | 'continue'
  timeoutSeconds: number | null
}

export type StepRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'timed-out'

export type StepRunState = {
  stepId: string
  status: StepRunStatus
  startedAt: number | null
  finishedAt: number | null
  output: unknown // shape depends on kind; documented per-runner
  error: string | null
}
