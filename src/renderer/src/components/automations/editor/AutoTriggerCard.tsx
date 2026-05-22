import * as React from 'react'
import type { AutoTrigger, Rule, TriggerSourceId } from '../../../../../shared/automations-types'

export type AutoTriggerCardProps = {
  trigger: AutoTrigger
  onChange: (next: AutoTrigger) => void
  onRemove: () => void
  /** Used for the per-rule project picker. */
  projects: { id: string; displayName: string }[]
}

// Why: per-source human label; mirrors TriggerPill's SOURCE_LABEL but uses the
// long form because this surface is the editor, not the chip.
const SOURCE_LABEL: Record<TriggerSourceId, string> = {
  'linear-issue': 'Linear issue'
}

function sourceLabelFor(source: TriggerSourceId): string {
  return SOURCE_LABEL[source] ?? source
}

// Pure helpers — exported so they can be unit-tested without rendering. The
// component composes them and emits the result through `onChange`.

export function toggleEnabled(trigger: AutoTrigger): AutoTrigger {
  return { ...trigger, enabled: !trigger.enabled }
}

export function addRule(trigger: AutoTrigger): AutoTrigger {
  const next: Rule = { id: crypto.randomUUID(), conditions: [], projectId: '' }
  return { ...trigger, rules: [...trigger.rules, next] }
}

export function removeRule(trigger: AutoTrigger, ruleId: string): AutoTrigger {
  return { ...trigger, rules: trigger.rules.filter((r) => r.id !== ruleId) }
}

export function reorderRule(trigger: AutoTrigger, fromIdx: number, toIdx: number): AutoTrigger {
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= trigger.rules.length ||
    toIdx >= trigger.rules.length
  ) {
    return trigger
  }
  const next = trigger.rules.slice()
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  return { ...trigger, rules: next }
}

export function updateRule(
  trigger: AutoTrigger,
  ruleId: string,
  patch: Partial<Rule>
): AutoTrigger {
  return {
    ...trigger,
    rules: trigger.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r))
  }
}

export function AutoTriggerCard(props: AutoTriggerCardProps): React.JSX.Element {
  const { trigger, onChange, onRemove, projects } = props

  const onToggle = (): void => {
    onChange(toggleEnabled(trigger))
  }
  const onAddRule = (): void => {
    onChange(addRule(trigger))
  }

  return (
    <div aria-label={`auto trigger ${trigger.id}`} className="rounded border bg-card p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{sourceLabelFor(trigger.source)}</span>
          <label className="flex items-center gap-1 text-muted-foreground">
            <input
              type="checkbox"
              aria-label="Trigger enabled"
              checked={trigger.enabled}
              onChange={onToggle}
            />
            Enabled
          </label>
        </div>
        <button
          type="button"
          aria-label={`remove trigger ${trigger.id}`}
          onClick={onRemove}
          className="rounded border border-border bg-background px-2 py-0.5 hover:bg-accent hover:text-foreground"
        >
          Remove
        </button>
      </div>

      <ul className="mt-2 space-y-2">
        {trigger.rules.map((rule, idx) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            index={idx}
            total={trigger.rules.length}
            projects={projects}
            onProjectChange={(projectId) => onChange(updateRule(trigger, rule.id, { projectId }))}
            onMoveUp={() => onChange(reorderRule(trigger, idx, idx - 1))}
            onMoveDown={() => onChange(reorderRule(trigger, idx, idx + 1))}
            onDelete={() => onChange(removeRule(trigger, rule.id))}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={onAddRule}
        className="mt-2 rounded border border-border bg-background px-2 py-0.5 hover:bg-accent hover:text-foreground"
      >
        + Add rule
      </button>
    </div>
  )
}

type RuleRowProps = {
  rule: Rule
  index: number
  total: number
  projects: { id: string; displayName: string }[]
  onProjectChange: (projectId: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

function RuleRow(props: RuleRowProps): React.JSX.Element {
  const { rule, index, total, projects, onProjectChange, onMoveUp, onMoveDown, onDelete } = props
  const isFirst = index === 0
  const isLast = index === total - 1
  return (
    <li aria-label={`rule ${rule.id}`} className="rounded border border-border bg-background p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Rule {index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Move up"
            disabled={isFirst}
            onClick={onMoveUp}
            className="rounded border border-border bg-background px-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={isLast}
            onClick={onMoveDown}
            className="rounded border border-border bg-background px-1 hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            ▼
          </button>
          <button
            type="button"
            aria-label="Delete rule"
            onClick={onDelete}
            className="rounded border border-border bg-background px-2 py-0.5 hover:bg-accent hover:text-foreground"
          >
            Delete rule
          </button>
        </div>
      </div>

      <label className="mt-2 flex items-center gap-2">
        <span className="text-muted-foreground">Project:</span>
        <select
          aria-label="Project"
          value={rule.projectId}
          onChange={(e) => onProjectChange(e.target.value)}
          className="rounded border border-border bg-background px-1 py-0.5"
        >
          <option value="">— Select project —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>
      </label>

      {/* Why: Phase 13 plugs the real condition editor in here. The stub keeps
          the surface stable for the modal's tests. */}
      <p className="mt-2 text-muted-foreground">Conditions (Phase 13)</p>
    </li>
  )
}
