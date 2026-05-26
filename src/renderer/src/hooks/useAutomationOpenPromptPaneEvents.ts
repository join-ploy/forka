import { useEffect } from 'react'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { FIRST_PANE_ID } from '../../../shared/pane-key'
import type { TuiAgent } from '../../../shared/types'

type OpenPromptPaneReply = { ok: true; paneKey: string } | { ok: false; error: string }

const openPromptPaneByDedupeKey = new Map<string, Promise<OpenPromptPaneReply>>()
const MAX_DEDUPE_ENTRIES = 500

function rememberOpenPromptPane(
  key: string,
  launch: () => Promise<OpenPromptPaneReply>
): Promise<OpenPromptPaneReply> {
  const existing = openPromptPaneByDedupeKey.get(key)
  if (existing) {
    return existing
  }
  // Why: parallel automation ticks can retry or duplicate-deliver the same
  // run-step open request while an agent immediately flips to waiting. Cache
  // by stable runId/stepId so the renderer launches at most one pane.
  const promise = launch()
  openPromptPaneByDedupeKey.set(key, promise)
  if (openPromptPaneByDedupeKey.size > MAX_DEDUPE_ENTRIES) {
    const oldest = openPromptPaneByDedupeKey.keys().next().value
    if (oldest) {
      openPromptPaneByDedupeKey.delete(oldest)
    }
  }
  return promise
}

/**
 * Handle main-process chain-executor requests to open a prompt pane.
 *
 * The main-process helper {@link openPromptPane} sends a request keyed by
 * requestId on `automations:openPromptPane`. This hook resolves it by
 * calling the same {@link launchAgentBackgroundSession} primitive that the
 * legacy automation dispatcher uses, then replies with the resulting
 * paneKey so the chain executor can track agent status.
 */
export function useAutomationOpenPromptPaneEvents(): void {
  useEffect(() => {
    const unsubscribe = window.api.automations.onOpenPromptPane(
      async ({
        requestId,
        dedupeKey,
        worktreeId,
        agentId,
        prompt,
        worktreePath,
        connectionId,
        memberScoped
      }) => {
        const key = dedupeKey ?? requestId
        const reply = await rememberOpenPromptPane(key, async () => {
          try {
            const result = await launchAgentBackgroundSession({
              agent: agentId as TuiAgent,
              worktreeId,
              prompt,
              launchSource: 'unknown',
              ...(typeof worktreePath === 'string'
                ? { worktreeOverride: { path: worktreePath, connectionId: connectionId ?? null } }
                : {}),
              // Why (Ask C): when the main-side runner flags this as a member-
              // scoped run, suppress Phase J1's CWD override so the agent stays
              // rooted at the member worktree (not the group's parentPath).
              ...(memberScoped ? { keepCwd: true } : {})
            })
            if (!result) {
              // Why: launchAgentBackgroundSession returns null when no startup
              // plan can be built (e.g. unknown agent, empty prompt). Surface
              // that as a structured failure so the chain executor fails-fast
              // instead of waiting out the 30s timeout.
              return {
                ok: false,
                error: 'Could not build an agent startup plan for the requested prompt.'
              }
            }
            const paneKey = `${result.tabId}:${FIRST_PANE_ID}`
            return { ok: true, paneKey }
          } catch (err) {
            // Why: surface the renderer-side reason verbatim so the chain
            // executor can fail-fast with a meaningful step error. Empty catch
            // here would silently degrade into a 30s timeout in main.
            const message = err instanceof Error ? err.message : String(err)
            return { ok: false, error: message }
          }
        })
        window.api.automations.replyOpenPromptPane(requestId, reply)
      }
    )
    return unsubscribe
  }, [])
}
