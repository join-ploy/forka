import type { WebContents } from 'electron'

export type ClosePromptPaneRequest = {
  paneKey: string
}

export type ClosePromptPaneDeps = {
  webContents: WebContents
}

/**
 * Ask the renderer to close a prompt pane previously opened by
 * {@link openPromptPane}. Fire-and-forget — the runner doesn't await a reply,
 * since a stale or already-closed pane is benign (the renderer skips unknown
 * tab ids). Used by retry flows to kill the old pane before the chain
 * executor opens a fresh one on the next tick.
 */
export function closePromptPane(req: ClosePromptPaneRequest, deps: ClosePromptPaneDeps): void {
  if (!deps.webContents || deps.webContents.isDestroyed()) {
    return
  }
  deps.webContents.send('automations:closePromptPane', req)
}
