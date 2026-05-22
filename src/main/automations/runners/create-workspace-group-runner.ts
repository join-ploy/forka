import type { StepRunner, StepRunnerCtx, StepRunnerResult } from '../step-runner'
import type { CreateWorkspaceGroupConfig } from '../../../shared/automations-types'
import type { SetupDecision } from '../../../shared/types'
import { resolveTemplate, TemplateResolutionError } from '../template'

export type CreateWorkspaceGroupDeps = {
  /** Bridge from the chain executor's `create-workspace-group` step to the
   *  workspace-groups:create flow. The runner pre-resolves templates and hands
   *  over a normalized input shape; this dep wires straight onto the IPC
   *  handler's create logic in src/main/ipc/workspace-groups.ts. */
  createWorkspaceGroup: (input: {
    /** Doubles as the group's workspaceName, parent folder, and per-member
     *  branch name (the IPC enforces the triple-purpose use). */
    branchName: string
    displayName: string
    members: {
      repoId: string
      baseBranch: string
      setupDecision: SetupDecision
    }[]
    linkedIssue?: { provider: 'linear'; id: string } | null
    /** Attribution for the sidebar's automation indicator. Forwards ctx.runId
     *  so the persisted WorkspaceGroup carries a back-pointer to the
     *  AutomationRun that produced it. */
    createdByAutomationRunId?: string
  }) => Promise<{ groupId: string; memberWorktreeIds: string[]; parentPath: string }>
  now: () => number
}

type Tracker = {
  groupId: string
  memberWorktreeIds: string[]
  parentPath: string
}

export class CreateWorkspaceGroupRunner implements StepRunner {
  // Why: nested map by (runId, stepId) mirrors CreateWorktreeRunner so a
  // future run-level release hook can drop trackers for either step kind with
  // the same shape, and a step.id containing the delimiter character can't
  // collide across runs.
  private readonly trackers = new Map<string, Map<string, Tracker>>()

  constructor(private readonly deps: CreateWorkspaceGroupDeps) {}

  async tick(ctx: StepRunnerCtx): Promise<StepRunnerResult> {
    const config = ctx.step.config as CreateWorkspaceGroupConfig
    let runTrackers = this.trackers.get(ctx.runId)
    const existing = runTrackers?.get(ctx.step.id)
    if (existing) {
      // Why: defensive no-op on re-tick after success — the chain executor
      // shouldn't drive a succeeded step, but if it does, return the same
      // output rather than double-create the group.
      return {
        outcome: 'done',
        status: 'succeeded',
        output: existing,
        contextPatch: { steps: { [ctx.step.id]: existing } }
      }
    }

    // Why: validate up-front so a missing members array fails the step cleanly
    // rather than throwing inside the IPC layer with a less-targeted message.
    if (!Array.isArray(config.members) || config.members.length < 2) {
      return {
        outcome: 'failed',
        status: 'failed',
        error: 'CreateWorkspaceGroupRunner: at least 2 members are required.'
      }
    }

    let branchName: string
    let displayName: string
    let memberInputs: { repoId: string; baseBranch: string; setupDecision: SetupDecision }[]
    try {
      branchName = resolveTemplate(config.branchName, ctx.context)
      // Why: displayName falls back to branchName when omitted so the group
      // card has a sensible label without forcing every legacy upgrade path
      // to synthesize one. Templates still resolve when an explicit value is
      // provided.
      displayName = config.displayName
        ? resolveTemplate(config.displayName, ctx.context)
        : branchName
      memberInputs = config.members.map((member) => ({
        repoId: member.repoId,
        baseBranch: resolveTemplate(member.baseBranch, ctx.context),
        // Why: default to 'run' so chains can pair with a downstream
        // wait-for-setup step without each composer having to spell it out.
        setupDecision: member.setupDecision ?? 'run'
      }))
    } catch (e) {
      if (e instanceof TemplateResolutionError) {
        return { outcome: 'failed', status: 'failed', error: e.message }
      }
      throw e
    }

    const linkedIssue = config.linkLinearIssue ? extractLinearIssue(ctx.context) : null

    try {
      const result = await this.deps.createWorkspaceGroup({
        branchName,
        displayName,
        members: memberInputs,
        linkedIssue,
        createdByAutomationRunId: ctx.runId
      })
      const tracker: Tracker = {
        groupId: result.groupId,
        memberWorktreeIds: result.memberWorktreeIds,
        parentPath: result.parentPath
      }
      if (!runTrackers) {
        runTrackers = new Map()
        this.trackers.set(ctx.runId, runTrackers)
      }
      runTrackers.set(ctx.step.id, tracker)
      return {
        outcome: 'done',
        status: 'succeeded',
        output: tracker,
        contextPatch: { steps: { [ctx.step.id]: tracker } }
      }
    } catch (e) {
      // Why: createWorkspaceGroup errors are deterministic (namespace
      // collision, member rollback). Fail-fast rather than retry; the IPC
      // layer's own rollback path has already cleaned up any partial state.
      const message = e instanceof Error ? e.message : String(e)
      return { outcome: 'failed', status: 'failed', error: message }
    }
  }

  dropRun(runId: string): void {
    this.trackers.delete(runId)
  }

  dropStep(runId: string, stepId: string): void {
    const runTrackers = this.trackers.get(runId)
    if (!runTrackers) {
      return
    }
    runTrackers.delete(stepId)
    if (runTrackers.size === 0) {
      this.trackers.delete(runId)
    }
  }
}

function extractLinearIssue(
  context: Record<string, unknown>
): { provider: 'linear'; id: string } | null {
  const trigger = context.trigger
  if (!trigger || typeof trigger !== 'object') {
    return null
  }
  const linear = (trigger as Record<string, unknown>).linear
  if (!linear || typeof linear !== 'object') {
    return null
  }
  const issue = (linear as Record<string, unknown>).issue
  if (!issue || typeof issue !== 'object') {
    return null
  }
  const id = (issue as Record<string, unknown>).id
  if (typeof id !== 'string') {
    return null
  }
  return { provider: 'linear', id }
}
