import * as React from 'react'
import type {
  Step,
  StepConfig,
  UpdateLinearIssueConfig
} from '../../../../../shared/automations-types'
import type { AvailableVariables } from '../../../lib/template-dry-run'
import { TemplateInput } from './TemplateInput'
import { StepCardChrome } from './StepCardChrome'

export type UpdateLinearIssueStepCardProps = {
  step: Step
  stepIndex: number
  available: AvailableVariables
  onIdChange: (newId: string) => void
  onConfigChange: (config: UpdateLinearIssueConfig) => void
  onOnFailureChange: (val: 'halt' | 'continue') => void
  onTimeoutChange: (val: number | null) => void
  onDelete: () => void
}

/**
 * Body for an `update-linear-issue` step. Three TemplateInputs cover the only
 * fields the runner reads — issueRef is required, assigneeRef and stateRef are
 * optional, but the runner fails fast at tick time if both are empty after
 * template resolution. V1 ships template inputs only; a future revision can
 * swap a Linear users/states picker into the assignee/state fields once the
 * picker plumbing exists in the renderer.
 */
export function UpdateLinearIssueStepCard(
  props: UpdateLinearIssueStepCardProps
): React.JSX.Element {
  const config = props.step.config as UpdateLinearIssueConfig
  const update = (patch: Partial<UpdateLinearIssueConfig>): void => {
    props.onConfigChange({ ...config, ...patch })
  }

  return (
    <StepCardChrome
      step={props.step}
      stepIndex={props.stepIndex}
      available={props.available}
      onIdChange={props.onIdChange}
      onConfigChange={props.onConfigChange as (config: StepConfig) => void}
      onOnFailureChange={props.onOnFailureChange}
      onTimeoutChange={props.onTimeoutChange}
      onDelete={props.onDelete}
    >
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Linear issue ID</span>
        <TemplateInput
          value={config.issueRef}
          onChange={(v) => update({ issueRef: v })}
          placeholder="{{trigger.linear.issue.id}}"
          available={props.available}
          ariaLabel="Issue ref"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Assignee (optional)</span>
        <TemplateInput
          value={config.assigneeRef ?? ''}
          onChange={(v) => update({ assigneeRef: v })}
          placeholder="Linear user ID (templated or literal)"
          available={props.available}
          ariaLabel="Assignee ref"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">State (optional)</span>
        <TemplateInput
          value={config.stateRef ?? ''}
          onChange={(v) => update({ stateRef: v })}
          placeholder="Linear state ID (templated or literal)"
          available={props.available}
          ariaLabel="State ref"
        />
      </label>
      <p className="text-[11px] text-muted-foreground">
        At least one of assignee or state is required.
      </p>
    </StepCardChrome>
  )
}
