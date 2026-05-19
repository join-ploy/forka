import { useEffect } from 'react'
import { launchAgentBackgroundSession } from '@/lib/launch-agent-background-session'
import { FIRST_PANE_ID } from '../../../shared/pane-key'
import type { TuiAgent } from '../../../shared/types'

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
      async ({ requestId, worktreeId, agentId, prompt }) => {
        try {
          const result = await launchAgentBackgroundSession({
            agent: agentId as TuiAgent,
            worktreeId,
            prompt,
            launchSource: 'unknown'
          })
          if (!result) {
            // Why: launchAgentBackgroundSession returns null when no startup
            // plan can be built (e.g. unknown agent). Surface that as a
            // missing reply so the main-side helper times out cleanly rather
            // than receiving a malformed paneKey.
            return
          }
          const paneKey = `${result.tabId}:${FIRST_PANE_ID}`
          window.api.automations.replyOpenPromptPane(requestId, { paneKey })
        } catch {
          // Why: swallowing here lets the main-side helper hit its timeout
          // path with a consistent error shape. A future task can add a
          // structured error reply if the chain executor needs richer
          // diagnostics.
        }
      }
    )
    return unsubscribe
  }, [])
}
