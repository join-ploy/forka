import type { IpcMain, IpcMainEvent, WebContents } from 'electron'

export type OpenPromptPaneRequest = {
  worktreeId: string
  agentId: string
  prompt: string
}

export type OpenPromptPaneResult = { paneKey: string }

/**
 * Subset of {@link IpcMain} that the helper depends on. Narrowing the surface
 * here lets tests pass a tiny fake without faking the full Electron module.
 */
export type OpenPromptPaneIpc = Pick<IpcMain, 'once' | 'removeAllListeners'>

export type OpenPromptPaneDeps = {
  webContents: WebContents
  ipc: OpenPromptPaneIpc
  requestId: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Ask the renderer to open a background tab in a worktree, launch the chosen
 * agent with the given prompt, and return the resulting paneKey so the
 * chain executor can track agent status.
 *
 * Each call uses a requestId-scoped reply channel so concurrent calls cannot
 * race on a shared listener.
 */
export function openPromptPane(
  req: OpenPromptPaneRequest,
  deps: OpenPromptPaneDeps
): Promise<OpenPromptPaneResult> {
  if (!deps.webContents || deps.webContents.isDestroyed()) {
    return Promise.reject(new Error('No renderer available to open prompt pane.'))
  }
  const channel = `automations:openPromptPane:reply:${deps.requestId}`
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return new Promise<OpenPromptPaneResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Why: drop the listener so a late renderer reply cannot resolve a
      // promise the caller has already given up on.
      deps.ipc.removeAllListeners(channel)
      reject(new Error(`Renderer did not respond to openPromptPane within ${timeoutMs}ms.`))
    }, timeoutMs)
    deps.ipc.once(channel, (_event: IpcMainEvent, payload: OpenPromptPaneResult) => {
      clearTimeout(timer)
      resolve(payload)
    })
    deps.webContents.send('automations:openPromptPane', { requestId: deps.requestId, ...req })
  })
}
