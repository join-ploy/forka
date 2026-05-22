import type { LinearClient } from '@linear/sdk'
import type {
  LinearLabel,
  LinearMember,
  LinearTeam,
  LinearWorkflowState
} from '../../../shared/types'
import {
  listTeams as defaultListTeams,
  getTeamLabels as defaultGetTeamLabels,
  getTeamMembers as defaultGetTeamMembers,
  getTeamStates as defaultGetTeamStates
} from '../../linear/teams'
import type { CandidateEvent, FieldDescriptor, PollCtx, TriggerSource } from './types'

export type LinearIssueSourceDeps = {
  client: LinearClient | null
  // Injectable for tests; defaults call the real `src/main/linear/teams.ts` helpers.
  listTeams?: () => Promise<LinearTeam[]>
  getTeamMembers?: (teamId: string) => Promise<LinearMember[]>
  getTeamLabels?: (teamId: string) => Promise<LinearLabel[]>
  getTeamStates?: (teamId: string) => Promise<LinearWorkflowState[]>
}

const PAGE_SIZE = 50
const MAX_PAGES = 5

const STATIC_PRIORITY_OPTIONS = [
  { value: '0', label: 'No priority' },
  { value: '1', label: 'Urgent' },
  { value: '2', label: 'High' },
  { value: '3', label: 'Medium' },
  { value: '4', label: 'Low' }
]

export function makeLinearIssueSource(deps: LinearIssueSourceDeps): TriggerSource {
  const listTeams = deps.listTeams ?? defaultListTeams
  const getTeamMembers = deps.getTeamMembers ?? defaultGetTeamMembers
  const getTeamLabels = deps.getTeamLabels ?? defaultGetTeamLabels
  const getTeamStates = deps.getTeamStates ?? defaultGetTeamStates

  const fieldCatalog: FieldDescriptor[] = [
    {
      field: 'linear.assignee',
      label: 'Assignee',
      valueKind: 'user',
      ops: ['is', 'is-not', 'is-any-of', 'is-none-of'],
      fetchOptions: () => fetchAssigneeOptions(deps.client, listTeams, getTeamMembers)
    },
    {
      field: 'linear.tag',
      label: 'Has tag',
      valueKind: 'label',
      ops: ['contains-any', 'contains-all', 'contains-none'],
      fetchOptions: () => fetchLabelOptions(listTeams, getTeamLabels)
    },
    {
      field: 'linear.state',
      label: 'State',
      valueKind: 'state',
      ops: ['is', 'is-any-of', 'is-none-of'],
      fetchOptions: () => fetchStateOptions(listTeams, getTeamStates)
    },
    {
      field: 'linear.priority',
      label: 'Priority',
      valueKind: 'priority',
      ops: ['eq', 'is-any-of', 'gte', 'lte'],
      fetchOptions: async () => STATIC_PRIORITY_OPTIONS
    }
  ]

  return {
    id: 'linear-issue',
    displayName: 'Linear issue',
    fieldCatalog,
    poll: (ctx) => pollLinearIssues(deps.client, ctx)
  }
}

// Why: use `client.issues({ filter: { updatedAt } })` (workspace-wide) rather
// than `client.viewer.assignedIssues` so the engine sees issues assigned to
// any user — the rule editor lets users target arbitrary assignees, so a
// viewer-scoped poll would silently miss those rules. More API traffic now;
// scope tuning is a follow-up.
async function* pollLinearIssues(
  client: LinearClient | null,
  ctx: PollCtx
): AsyncIterable<CandidateEvent> {
  if (!client) {
    return
  }
  try {
    let after: string | undefined = undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const conn = await client.issues({
        first: PAGE_SIZE,
        after,
        filter: { updatedAt: { gte: new Date(ctx.since) } }
      })
      for (const issue of conn.nodes) {
        const event = await mapIssueToEvent(issue as unknown as IssueLike)
        if (event) {
          yield event
        }
      }
      if (!conn.pageInfo.hasNextPage || !conn.pageInfo.endCursor) {
        break
      }
      after = conn.pageInfo.endCursor
    }
  } catch (err) {
    console.warn('[linear-issue source] poll failed:', err)
  }
}

// The Linear SDK returns `assignee`, `state`, `team` as Promises and `labels`
// as a function returning a Promise — await each before mapping.
type IssueLike = {
  id: string
  identifier: string
  title: string
  description?: string | null
  url: string
  updatedAt: string | Date
  priority: number
  assignee: Promise<{ id: string; email?: string | null; displayName?: string } | null>
  state: Promise<{ name: string } | null>
  labels: () => Promise<{ nodes: { id: string; name: string }[] }>
}

async function mapIssueToEvent(issue: IssueLike): Promise<CandidateEvent | null> {
  const [assignee, state, labelConn] = await Promise.all([
    issue.assignee,
    issue.state,
    issue.labels()
  ])
  const labelNames = labelConn.nodes.map((l) => l.name)
  const stateName = state?.name ?? ''
  const updatedAtMs = new Date(issue.updatedAt).getTime()
  return {
    entityId: issue.id,
    entityIdentifier: issue.identifier,
    updatedAt: updatedAtMs,
    payload: {
      issue: {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        description: issue.description ?? '',
        url: issue.url,
        assigneeEmail: assignee?.email ?? '',
        stateName,
        priority: issue.priority
      }
    },
    fields: {
      'linear.assignee': assignee?.id ?? undefined,
      'linear.tag': labelNames,
      'linear.state': stateName,
      'linear.priority': issue.priority
    }
  }
}

async function fetchAssigneeOptions(
  client: LinearClient | null,
  listTeams: () => Promise<LinearTeam[]>,
  getTeamMembers: (teamId: string) => Promise<LinearMember[]>
): Promise<{ value: string; label: string }[]> {
  if (!client) {
    return []
  }
  // Why: a synthetic "me" entry resolves to the viewer's user id at lookup
  // time so the rule editor never persists a stale viewer id when a user
  // switches Linear accounts — the value is whatever client.viewer.id is now.
  const viewer = await client.viewer
  const teams = await listTeams()
  const memberLists = await Promise.all(teams.map((t) => getTeamMembers(t.id)))
  const seen = new Set<string>([viewer.id])
  const options: { value: string; label: string }[] = [{ value: viewer.id, label: 'me' }]
  for (const list of memberLists) {
    for (const m of list) {
      if (seen.has(m.id)) {
        continue
      }
      seen.add(m.id)
      options.push({ value: m.id, label: m.displayName })
    }
  }
  return options
}

async function fetchLabelOptions(
  listTeams: () => Promise<LinearTeam[]>,
  getTeamLabels: (teamId: string) => Promise<LinearLabel[]>
): Promise<{ value: string; label: string }[]> {
  const teams = await listTeams()
  const labelLists = await Promise.all(teams.map((t) => getTeamLabels(t.id)))
  const seen = new Set<string>()
  const options: { value: string; label: string }[] = []
  for (const list of labelLists) {
    for (const l of list) {
      if (seen.has(l.name)) {
        continue
      }
      seen.add(l.name)
      options.push({ value: l.name, label: l.name })
    }
  }
  return options
}

async function fetchStateOptions(
  listTeams: () => Promise<LinearTeam[]>,
  getTeamStates: (teamId: string) => Promise<LinearWorkflowState[]>
): Promise<{ value: string; label: string }[]> {
  const teams = await listTeams()
  const stateLists = await Promise.all(teams.map((t) => getTeamStates(t.id)))
  const seen = new Set<string>()
  const options: { value: string; label: string }[] = []
  for (const list of stateLists) {
    for (const s of list) {
      if (seen.has(s.name)) {
        continue
      }
      seen.add(s.name)
      options.push({ value: s.name, label: s.name })
    }
  }
  return options
}
