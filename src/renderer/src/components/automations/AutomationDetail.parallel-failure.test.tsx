import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import type {
  Automation,
  AutomationRun,
  Step,
  StepRunState
} from '../../../../shared/automations-types'
import type { Worktree } from '../../../../shared/types'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children
}))
vi.mock('@/lib/agent-catalog', () => ({
  AGENT_CATALOG: [{ id: 'claude', label: 'Claude Code' }],
  AgentIcon: () => null
}))
vi.mock('@/components/icons/LinearIcon', () => ({ LinearIcon: () => null }))

const noop = (): void => {}

function parallelStep(id: string): Step {
  return {
    id,
    kind: 'run-prompt',
    config: { source: 'custom', prompt: 'x', agentId: 'claude', worktreeRef: 'wt-1' },
    onFailure: 'halt',
    timeoutSeconds: null
  } as Step
}

const automation: Automation = {
  id: 'a1',
  name: 'Parallel sweep',
  prompt: '',
  agentId: 'claude',
  projectId: 'p1',
  executionTargetType: 'local',
  executionTargetId: 'host-1',
  schedulerOwner: 'local_host_service',
  workspaceMode: 'existing',
  workspaceId: 'wt-1',
  baseBranch: null,
  timezone: 'UTC',
  rrule: '',
  dtstart: 0,
  enabled: true,
  nextRunAt: 0,
  missedRunPolicy: 'run_once_within_grace',
  missedRunGraceMinutes: 0,
  createdAt: 0,
  updatedAt: 0,
  trigger: { acceptsLinearTicket: false, acceptsProjectSelection: false },
  steps: [[parallelStep('p1'), parallelStep('p2'), parallelStep('p3')]]
} as Automation

const allFailedStates: StepRunState[] = ['p1', 'p2', 'p3'].map((id) => ({
  stepId: id,
  status: 'failed',
  startedAt: 100,
  finishedAt: 200,
  output: null,
  error: `${id} blew up`
}))

const run: AutomationRun = {
  id: 'r1',
  automationId: 'a1',
  title: 't',
  scheduledFor: 0,
  status: 'failed',
  trigger: 'manual',
  workspaceId: 'wt-1',
  sessionKind: 'terminal',
  chatSessionId: null,
  terminalSessionId: null,
  error: null,
  startedAt: 100,
  dispatchedAt: null,
  createdAt: 0,
  stepStates: allFailedStates,
  context: {}
} as AutomationRun

const worktreeMap = new Map<string, Worktree>()

describe('AutomationDetail — all-failed parallel group', () => {
  it('keeps the failed parallel group visible in run history', async () => {
    const { AutomationDetail } = await import('./AutomationDetail')
    const markup = renderToStaticMarkup(
      <AutomationDetail
        automation={automation}
        runs={[run]}
        projectName="repo"
        workspaceName="feature-x"
        projectDefaultBaseRef={null}
        worktreeMap={worktreeMap}
        now={0}
        onRunNow={noop}
        onOpenRunWorkspace={noop}
        onEdit={noop}
        onToggle={noop}
        onDelete={noop}
        onCancelRun={noop}
        onRetryRunFromStep={noop}
        onRetryParallelStep={noop}
      />
    )
    expect(markup).toContain('Parallel')
    expect(markup).toContain('p1')
    expect(markup).toContain('p2')
    expect(markup).toContain('p3')
    expect(markup).toContain('p1 blew up')
  })
})
