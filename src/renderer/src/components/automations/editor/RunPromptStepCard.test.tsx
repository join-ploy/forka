import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { RunPromptStepCard } from './RunPromptStepCard'
import type { RunPromptConfig, Step } from '../../../../../shared/automations-types'
import type { AvailableVariables } from '../../../lib/template-dry-run'

const EMPTY_AVAIL: AvailableVariables = { automation: {}, trigger: {}, steps: {} }

function makeStep(overrides: Partial<RunPromptConfig> = {}): Step {
  const config: RunPromptConfig = {
    worktreeRef: '{{steps.cw-1.worktreeId}}',
    agentId: 'codex',
    prompt: 'do the thing',
    doneDebounceSeconds: 7,
    ...overrides
  }
  return {
    id: 'rp-1',
    kind: 'run-prompt',
    config,
    onFailure: 'continue',
    timeoutSeconds: null
  }
}

describe('RunPromptStepCard', () => {
  const markup = renderToStaticMarkup(
    <RunPromptStepCard
      step={makeStep()}
      stepIndex={2}
      available={EMPTY_AVAIL}
      reviewCommands={[]}
      createPrCommands={[]}
      onIdChange={() => {}}
      onConfigChange={() => {}}
      onOnFailureChange={() => {}}
      onTimeoutChange={() => {}}
      onDelete={() => {}}
    />
  )

  it('renders the worktree ref input with the current value', () => {
    expect(markup).toMatch(/aria-label=["']Worktree ref["']/)
    expect(markup).toContain('steps.cw-1.worktreeId')
  })

  it('renders the agent select with Claude, Codex, and Droid options', () => {
    expect(markup).toMatch(/aria-label=["']Agent["']/)
    expect(markup).toContain('Claude')
    expect(markup).toContain('Codex')
    expect(markup).toContain('Droid')
  })

  it('marks the current agent option as selected', () => {
    // React renders <select value=...> by emitting `selected` on the matching <option>.
    expect(markup).toMatch(/value=["']codex["'][^>]*selected/)
  })

  it('renders the prompt textarea (multiline) with the current value', () => {
    expect(markup).toMatch(/aria-label=["']Prompt["']/)
    expect(markup).toMatch(/<textarea[^>]*aria-label=["']Prompt["']/)
    expect(markup).toContain('do the thing')
  })

  it('renders the done-debounce number input with the current value', () => {
    expect(markup).toMatch(/aria-label=["']Done debounce seconds["']/)
    expect(markup).toMatch(/value=["']7["']/)
    expect(markup).toContain('Done debounce (seconds)')
  })

  it('renders the clean-main skip checkbox', () => {
    expect(markup).toMatch(/aria-label=["']Skip if no changes from main["']/)
    expect(markup).toContain('Skip if no changes from main')
  })

  it('renders stored prompt controls and disables the agent for preset-backed prompts', () => {
    const step = makeStep({
      source: 'review',
      commandId: 'review-codex',
      promptOverride: 'Review {{trigger.title}}'
    })
    const m = renderToStaticMarkup(
      <RunPromptStepCard
        step={step}
        stepIndex={2}
        available={EMPTY_AVAIL}
        reviewCommands={[
          {
            id: 'review-codex',
            label: 'Codex Review',
            command: 'codex',
            prompt: 'Stored review prompt'
          }
        ]}
        createPrCommands={[]}
        onIdChange={() => {}}
        onConfigChange={() => {}}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    expect(m).toMatch(/aria-label=["']Prompt source["']/)
    expect(m).toMatch(/aria-label=["']Stored prompt["']/)
    expect(m).toContain('Codex Review')
    expect(m).toContain('Review {{trigger.title}}')
    expect(m).toContain('Stored prompt selects the agent.')
    expect(m).toMatch(/aria-label=["']Agent["'][^>]*disabled/)
  })

  it('renders the kind badge from StepCardChrome', () => {
    expect(markup).toContain('Run prompt')
  })

  it('renders the paneRef field with empty value when config has no paneRef', () => {
    expect(markup).toMatch(/aria-label=["']Pane ref["']/)
    expect(markup).toContain('Reuse pane (optional)')
  })

  it('renders the paneRef value when config has it set', () => {
    const stepWithPane = makeStep({ paneRef: '{{steps.rp-0.paneKey}}' })
    const m = renderToStaticMarkup(
      <RunPromptStepCard
        step={stepWithPane}
        stepIndex={2}
        available={EMPTY_AVAIL}
        reviewCommands={[]}
        createPrCommands={[]}
        onIdChange={() => {}}
        onConfigChange={() => {}}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    expect(m).toMatch(/aria-label=["']Pane ref["']/)
    expect(m).toContain('steps.rp-0.paneKey')
  })

  it('dims the agentId select when paneRef is non-empty', () => {
    const stepWithPane = makeStep({ paneRef: '{{steps.rp-0.paneKey}}' })
    const m = renderToStaticMarkup(
      <RunPromptStepCard
        step={stepWithPane}
        stepIndex={2}
        available={EMPTY_AVAIL}
        reviewCommands={[]}
        createPrCommands={[]}
        onIdChange={() => {}}
        onConfigChange={() => {}}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    // The Agent label row carries an opacity-50 class when paneRef is set,
    // and renders the explanatory note.
    expect(m).toMatch(/opacity-50/)
    expect(m).toContain('Pane already has an agent.')
  })

  it('prioritizes paneRef as the agent owner for preset-backed prompts', () => {
    const step = makeStep({
      source: 'review',
      commandId: 'review-codex',
      paneRef: '{{steps.rp-0.paneKey}}'
    })
    const m = renderToStaticMarkup(
      <RunPromptStepCard
        step={step}
        stepIndex={2}
        available={EMPTY_AVAIL}
        reviewCommands={[
          {
            id: 'review-codex',
            label: 'Codex Review',
            command: 'codex',
            prompt: 'Stored review prompt'
          }
        ]}
        createPrCommands={[]}
        onIdChange={() => {}}
        onConfigChange={() => {}}
        onOnFailureChange={() => {}}
        onTimeoutChange={() => {}}
        onDelete={() => {}}
      />
    )
    expect(m).toContain('Pane already has an agent.')
    expect(m).not.toContain('Stored prompt selects the agent.')
  })

  it('keeps the agentId select bright when paneRef is empty', () => {
    // Default fixture has no paneRef — the agent label should not carry the
    // dim class, and the note should not appear.
    expect(markup).not.toContain('Pane already has an agent.')
    // Sanity: the Agent label is rendered.
    expect(markup).toMatch(/aria-label=["']Agent["']/)
  })
})
