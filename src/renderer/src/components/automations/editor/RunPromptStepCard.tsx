import * as React from 'react'
import { cn } from '@/lib/utils'
import type { RunPromptConfig, Step, StepConfig } from '../../../../../shared/automations-types'
import type { SidebarPromptCommand, TuiAgent } from '../../../../../shared/types'
import { inferSidebarPromptAgent } from '../../../../../shared/sidebar-prompt-agent'
import type { AvailableVariables } from '../../../lib/template-dry-run'
import { TemplateInput } from './TemplateInput'
import { StepCardChrome } from './StepCardChrome'

export type RunPromptStepCardProps = {
  step: Step
  stepIndex: number
  available: AvailableVariables
  reviewCommands: SidebarPromptCommand[]
  createPrCommands: SidebarPromptCommand[]
  disableDrag?: boolean
  onIdChange: (newId: string) => void
  onConfigChange: (config: RunPromptConfig) => void
  onOnFailureChange: (val: 'halt' | 'continue') => void
  onTimeoutChange: (val: number | null) => void
  onDelete: () => void
}

const AGENT_CHOICES: { value: TuiAgent; label: string }[] = [
  { value: 'claude', label: 'Claude' },
  { value: 'codex', label: 'Codex' },
  { value: 'droid', label: 'Droid' }
]

type SourceChoice = { value: NonNullable<RunPromptConfig['source']>; label: string }
const SOURCE_CHOICES: SourceChoice[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'review', label: 'Review' },
  { value: 'create-pr', label: 'Create PR' }
]

/**
 * Body for a `run-prompt` step. Uses a native <select> for the agent picker
 * — the shadcn Select primitive renders via Radix Portal which doesn't show
 * up in renderToStaticMarkup-based tests, and we already use native <input>
 * elsewhere in the editor.
 */
export function RunPromptStepCard(props: RunPromptStepCardProps): React.JSX.Element {
  const config = props.step.config as RunPromptConfig
  const update = (patch: Partial<RunPromptConfig>): void => {
    props.onConfigChange({ ...config, ...patch })
  }
  const source = config.source ?? 'custom'
  const commandOptions =
    source === 'review'
      ? props.reviewCommands
      : source === 'create-pr'
        ? props.createPrCommands
        : []
  const selectedCommand = commandOptions.find((cmd) => cmd.id === config.commandId)
  const inferredAgent = selectedCommand ? inferSidebarPromptAgent(selectedCommand.command) : null
  const effectiveAgent = source === 'custom' ? config.agentId : (inferredAgent ?? config.agentId)
  const displayedAgentChoices = AGENT_CHOICES.some((choice) => choice.value === effectiveAgent)
    ? AGENT_CHOICES
    : [...AGENT_CHOICES, { value: effectiveAgent, label: effectiveAgent }]
  const promptValue =
    source === 'custom' ? config.prompt : (config.promptOverride ?? selectedCommand?.prompt ?? '')
  const changeSource = (nextSource: NonNullable<RunPromptConfig['source']>): void => {
    if (nextSource === source) {
      return
    }
    if (nextSource === 'custom') {
      update({ source: nextSource, commandId: undefined, promptOverride: undefined })
    } else {
      update({ source: nextSource, commandId: undefined, promptOverride: undefined })
    }
  }
  // Why: when the user supplies a paneRef, the chain executor reuses the
  // existing pane's agent rather than the configured one — surface that with
  // a dim treatment + note so it's clear the agentId select is inert.
  const paneRef = config.paneRef ?? ''
  const agentDimmed = paneRef.length > 0 || source !== 'custom'
  const agentDimReason =
    paneRef.length > 0
      ? 'Pane already has an agent.'
      : source !== 'custom'
        ? 'Stored prompt selects the agent.'
        : ''

  return (
    <StepCardChrome
      step={props.step}
      stepIndex={props.stepIndex}
      available={props.available}
      disableDrag={props.disableDrag}
      onIdChange={props.onIdChange}
      onConfigChange={props.onConfigChange as (config: StepConfig) => void}
      onOnFailureChange={props.onOnFailureChange}
      onTimeoutChange={props.onTimeoutChange}
      onDelete={props.onDelete}
    >
      <TemplateInput
        value={config.worktreeRef}
        onChange={(v) => update({ worktreeRef: v })}
        placeholder="{{steps.<id>.worktreeId}}"
        available={props.available}
        ariaLabel="Worktree ref"
      />
      <div
        role="group"
        aria-label="Prompt source"
        className="inline-flex overflow-hidden rounded-md border border-input"
      >
        {SOURCE_CHOICES.map((choice, i) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={source === choice.value}
            onClick={() => changeSource(choice.value)}
            className={cn(
              'px-2 py-1 text-xs',
              i > 0 && 'border-l border-input',
              source === choice.value
                ? 'bg-accent text-foreground'
                : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {source !== 'custom' ? (
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Stored prompt</span>
          <select
            aria-label="Stored prompt"
            value={config.commandId ?? ''}
            onChange={(e) =>
              update({ commandId: e.target.value || undefined, promptOverride: undefined })
            }
            className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/50"
          >
            <option value="">(none)</option>
            {commandOptions.map((cmd) => (
              <option key={cmd.id} value={cmd.id}>
                {cmd.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Reuse pane (optional)</span>
        <TemplateInput
          value={paneRef}
          onChange={(v) => update({ paneRef: v })}
          placeholder={`{{steps.${props.step.id}.paneKey}}`}
          available={props.available}
          ariaLabel="Pane ref"
        />
      </label>
      <label className={cn('flex items-center gap-2 text-xs', agentDimmed && 'opacity-50')}>
        <span className="text-muted-foreground">Agent</span>
        <select
          aria-label="Agent"
          value={effectiveAgent}
          onChange={(e) => update({ agentId: e.target.value as TuiAgent })}
          disabled={agentDimmed}
          className="rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-[2px] focus-visible:ring-ring/50"
        >
          {displayedAgentChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        {agentDimReason ? <span className="text-muted-foreground">{agentDimReason}</span> : null}
      </label>
      <TemplateInput
        value={promptValue}
        onChange={(v) =>
          source === 'custom' ? update({ prompt: v }) : update({ promptOverride: v })
        }
        placeholder="Prompt"
        available={props.available}
        ariaLabel="Prompt"
        multiline
      />
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          aria-label="Skip if no changes from main"
          checked={config.skipIfNoChangesFromMain === true}
          onChange={(e) => update({ skipIfNoChangesFromMain: e.target.checked })}
          className="h-4 w-4 rounded border-input bg-background text-primary focus-visible:ring-[2px] focus-visible:ring-ring/50"
        />
        <span className="text-muted-foreground">Skip if no changes from main</span>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Done debounce (seconds)</span>
        <input
          type="number"
          aria-label="Done debounce seconds"
          min={1}
          value={config.doneDebounceSeconds}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10)
            update({ doneDebounceSeconds: Number.isFinite(n) && n > 0 ? n : 1 })
          }}
          className="w-20 rounded-md border border-input bg-background px-2 py-1 outline-none focus-visible:ring-[2px] focus-visible:ring-ring/50"
        />
      </label>
    </StepCardChrome>
  )
}
