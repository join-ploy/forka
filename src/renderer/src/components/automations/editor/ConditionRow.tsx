import * as React from 'react'
import type {
  Condition,
  ConditionOp,
  ConditionValue,
  SerializableFieldDescriptor
} from '../../../../../shared/automations-types'

export type ConditionRowProps = {
  condition: Condition
  fieldCatalog: SerializableFieldDescriptor[]
  /** Returns options for the given field. The component calls this when the
   *  user opens an option-backed value editor. Caching is the caller's
   *  responsibility (TriggersModal memoizes by (sourceId, field)). */
  loadOptions: (field: string) => Promise<{ value: string; label: string }[]>
  onChange: (next: Condition) => void
  onRemove: () => void
}

// Why: human labels for each op. Kept here (not in shared/) because they are
// presentation-only — the wire format uses the op identifier.
const OP_LABEL: Record<ConditionOp, string> = {
  is: 'is',
  'is-not': 'is not',
  'is-any-of': 'is any of',
  'is-none-of': 'is none of',
  'contains-any': 'has any of',
  'contains-all': 'has all of',
  'contains-none': 'has none of',
  gte: '≥',
  lte: '≤',
  eq: '='
}

// Why: ops whose value editor renders as multi-select. Single-select ops
// (is/is-not/eq/gte/lte) get a single-value editor instead. Centralized here
// so the field-change reset logic and the value-editor renderer agree.
const MULTI_OPS: ReadonlySet<ConditionOp> = new Set<ConditionOp>([
  'is-any-of',
  'is-none-of',
  'contains-any',
  'contains-all',
  'contains-none'
])

function isMultiOp(op: ConditionOp): boolean {
  return MULTI_OPS.has(op)
}

function defaultValueFor(
  op: ConditionOp,
  valueKind: SerializableFieldDescriptor['valueKind']
): ConditionValue {
  if (isMultiOp(op)) {
    return []
  }
  if (valueKind === 'number') {
    return 0
  }
  return ''
}

/** Pure helper: when the user switches the field, derive a new Condition that
 *  remains valid against the chosen descriptor. Exported for unit tests. */
export function resetConditionForField(
  condition: Condition,
  descriptor: SerializableFieldDescriptor
): Condition {
  const opAllowed = descriptor.ops.includes(condition.op)
  const nextOp: ConditionOp = opAllowed ? condition.op : (descriptor.ops[0] ?? 'is')
  return {
    field: descriptor.field,
    op: nextOp,
    value: defaultValueFor(nextOp, descriptor.valueKind)
  }
}

function findDescriptor(
  catalog: SerializableFieldDescriptor[],
  field: string
): SerializableFieldDescriptor | undefined {
  return catalog.find((d) => d.field === field)
}

type ValueEditorProps = {
  condition: Condition
  descriptor: SerializableFieldDescriptor
  loadOptions: ConditionRowProps['loadOptions']
  onValueChange: (value: ConditionValue) => void
}

function ValueEditor(props: ValueEditorProps): React.JSX.Element {
  const { condition, descriptor, loadOptions, onValueChange } = props
  const usesOptions =
    descriptor.valueKind === 'user' ||
    descriptor.valueKind === 'label' ||
    descriptor.valueKind === 'state' ||
    descriptor.valueKind === 'priority'

  const [options, setOptions] = React.useState<{ value: string; label: string }[]>([])

  // Why: lazy-load options on mount and whenever the bound field changes so
  // the dropdown is populated by the time the user opens it. The parent caches
  // by field, so flipping back to a previously-loaded field is free.
  React.useEffect(() => {
    if (!usesOptions || !descriptor.hasFetchOptions) {
      return
    }
    let cancelled = false
    void loadOptions(descriptor.field).then((next) => {
      if (!cancelled) {
        setOptions(next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [descriptor.field, descriptor.hasFetchOptions, usesOptions, loadOptions])

  if (descriptor.valueKind === 'number') {
    const numeric = typeof condition.value === 'number' ? condition.value : 0
    return (
      <input
        type="number"
        aria-label="Value"
        value={numeric}
        onChange={(e) => onValueChange(Number(e.target.value))}
        className="rounded border border-border bg-background px-1 py-0.5"
      />
    )
  }

  if (descriptor.valueKind === 'string') {
    const text = typeof condition.value === 'string' ? condition.value : ''
    return (
      <input
        type="text"
        aria-label="Value"
        value={text}
        onChange={(e) => onValueChange(e.target.value)}
        className="rounded border border-border bg-background px-1 py-0.5"
      />
    )
  }

  if (isMultiOp(condition.op)) {
    const selected = Array.isArray(condition.value) ? condition.value.map(String) : []
    return (
      <select
        multiple
        aria-label="Value"
        value={selected}
        onChange={(e) => {
          const next = Array.from(e.target.selectedOptions, (o) => o.value)
          onValueChange(next)
        }}
        className="rounded border border-border bg-background px-1 py-0.5"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  const single = typeof condition.value === 'string' ? condition.value : ''
  return (
    <select
      aria-label="Value"
      value={single}
      onChange={(e) => onValueChange(e.target.value)}
      className="rounded border border-border bg-background px-1 py-0.5"
    >
      <option value="">— Select —</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function ConditionRow(props: ConditionRowProps): React.JSX.Element {
  const { condition, fieldCatalog, loadOptions, onChange, onRemove } = props
  const descriptor = findDescriptor(fieldCatalog, condition.field) ?? fieldCatalog[0]

  // Why: condition references a field not present in the catalog (e.g. a stale
  // saved rule whose source registered a different field set). Surface a
  // disabled stub rather than crashing — the user can pick a valid field or
  // remove the row.
  if (!descriptor) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Unknown field: {condition.field}</span>
        <button
          type="button"
          aria-label="Remove condition"
          onClick={onRemove}
          className="rounded border border-border bg-background px-1 hover:bg-accent hover:text-foreground"
        >
          ✕
        </button>
      </div>
    )
  }

  const handleFieldChange = (nextField: string): void => {
    const nextDescriptor = findDescriptor(fieldCatalog, nextField)
    if (!nextDescriptor) {
      return
    }
    onChange(resetConditionForField(condition, nextDescriptor))
  }

  const handleOpChange = (nextOp: ConditionOp): void => {
    // Why: switching between single- and multi- ops invalidates the existing
    // value shape (e.g. '' -> [] or vice versa), so reset to a type-appropriate
    // default on op transitions that cross that boundary.
    const wasMulti = isMultiOp(condition.op)
    const willMulti = isMultiOp(nextOp)
    const nextValue =
      wasMulti === willMulti ? condition.value : defaultValueFor(nextOp, descriptor.valueKind)
    onChange({ ...condition, op: nextOp, value: nextValue })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select
        aria-label="Field"
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        className="rounded border border-border bg-background px-1 py-0.5"
      >
        {fieldCatalog.map((d) => (
          <option key={d.field} value={d.field}>
            {d.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Op"
        value={condition.op}
        onChange={(e) => handleOpChange(e.target.value as ConditionOp)}
        className="rounded border border-border bg-background px-1 py-0.5"
      >
        {descriptor.ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABEL[op]}
          </option>
        ))}
      </select>
      <ValueEditor
        condition={condition}
        descriptor={descriptor}
        loadOptions={loadOptions}
        onValueChange={(value) => onChange({ ...condition, value })}
      />
      <button
        type="button"
        aria-label="Remove condition"
        onClick={onRemove}
        className="ml-auto rounded border border-border bg-background px-2 py-0.5 hover:bg-accent hover:text-foreground"
      >
        ✕
      </button>
    </div>
  )
}
