// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { UpdateLinearIssueStepCard } from './UpdateLinearIssueStepCard'
import type { Step, UpdateLinearIssueConfig } from '../../../../../shared/automations-types'
import type { AvailableVariables } from '../../../lib/template-dry-run'

afterEach(() => cleanup())

const EMPTY_AVAIL: AvailableVariables = { automation: {}, trigger: {}, steps: {} }

function makeStep(overrides: Partial<UpdateLinearIssueConfig> = {}): Step {
  return {
    id: 'uli-1',
    kind: 'update-linear-issue',
    config: {
      issueRef: '{{trigger.linear.issue.id}}',
      assigneeRef: 'user-123',
      stateRef: 'state-456',
      ...overrides
    },
    onFailure: 'halt',
    timeoutSeconds: null
  }
}

describe('UpdateLinearIssueStepCard', () => {
  const markup = renderToStaticMarkup(
    <UpdateLinearIssueStepCard
      step={makeStep()}
      stepIndex={0}
      available={EMPTY_AVAIL}
      onIdChange={() => {}}
      onConfigChange={() => {}}
      onOnFailureChange={() => {}}
      onTimeoutChange={() => {}}
      onDelete={() => {}}
    />
  )

  it('renders all three TemplateInputs (issue, assignee, state)', () => {
    expect(markup).toMatch(/aria-label=["']Issue ref["']/)
    expect(markup).toMatch(/aria-label=["']Assignee ref["']/)
    expect(markup).toMatch(/aria-label=["']State ref["']/)
  })

  it('shows current values in the inputs', () => {
    expect(markup).toContain('trigger.linear.issue.id')
    expect(markup).toContain('user-123')
    expect(markup).toContain('state-456')
  })

  it('renders the placeholders for each ref', () => {
    const empty = renderToStaticMarkup(
      <UpdateLinearIssueStepCard
        step={{
          ...makeStep(),
          config: { issueRef: '', assigneeRef: '', stateRef: '' }
        }}
        stepIndex={0}
        available={EMPTY_AVAIL}
        onIdChange={() => {}}
        onConfigChange={() => {}}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    expect(empty).toContain('trigger.linear.issue.id')
    expect(empty).toContain('Linear user ID')
    expect(empty).toContain('Linear state ID')
  })

  it('renders the kind badge from StepCardChrome', () => {
    expect(markup).toContain('Update Linear issue')
  })

  it('shows the at-least-one hint', () => {
    expect(markup).toMatch(/at least one of assignee or state is required/i)
  })

  it('calls onConfigChange when the issue ref input changes', () => {
    const onConfigChange = vi.fn()
    const { getByLabelText } = render(
      <UpdateLinearIssueStepCard
        step={makeStep()}
        stepIndex={0}
        available={EMPTY_AVAIL}
        onIdChange={() => {}}
        onConfigChange={onConfigChange}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    fireEvent.change(getByLabelText('Issue ref'), { target: { value: 'new-issue-id' } })
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ issueRef: 'new-issue-id' })
    )
  })

  it('calls onConfigChange when the assignee ref input changes', () => {
    const onConfigChange = vi.fn()
    const { getByLabelText } = render(
      <UpdateLinearIssueStepCard
        step={makeStep()}
        stepIndex={0}
        available={EMPTY_AVAIL}
        onIdChange={() => {}}
        onConfigChange={onConfigChange}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    fireEvent.change(getByLabelText('Assignee ref'), { target: { value: 'user-new' } })
    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeRef: 'user-new' })
    )
  })

  it('calls onConfigChange when the state ref input changes', () => {
    const onConfigChange = vi.fn()
    const { getByLabelText } = render(
      <UpdateLinearIssueStepCard
        step={makeStep()}
        stepIndex={0}
        available={EMPTY_AVAIL}
        onIdChange={() => {}}
        onConfigChange={onConfigChange}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    fireEvent.change(getByLabelText('State ref'), { target: { value: 'state-new' } })
    expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({ stateRef: 'state-new' }))
  })
})
