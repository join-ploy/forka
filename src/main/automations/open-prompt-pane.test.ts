import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { openPromptPane } from './open-prompt-pane'

function fakeWebContents() {
  return {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  }
}

function fakeIpc() {
  const ee = new EventEmitter()
  return {
    once: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ee.once(channel, (payload) => handler({}, payload))
    }),
    removeAllListeners: vi.fn((channel: string) => {
      ee.removeAllListeners(channel)
    }),
    emit: (channel: string, payload: unknown) => ee.emit(channel, payload)
  }
}

describe('openPromptPane', () => {
  it('sends the request on automations:openPromptPane with a requestId-scoped reply channel', async () => {
    const webContents = fakeWebContents()
    const ipc = fakeIpc()
    const pending = openPromptPane(
      { worktreeId: 'wt-1', agentId: 'claude', prompt: 'go' },
      { webContents: webContents as never, ipc: ipc as never, requestId: 'req-1' }
    )
    // Renderer responds
    ipc.emit('automations:openPromptPane:reply:req-1', { paneKey: 'tab-9:pane-2' })
    await expect(pending).resolves.toEqual({ paneKey: 'tab-9:pane-2' })
    expect(webContents.send).toHaveBeenCalledWith('automations:openPromptPane', {
      requestId: 'req-1',
      worktreeId: 'wt-1',
      agentId: 'claude',
      prompt: 'go'
    })
    expect(ipc.once).toHaveBeenCalledWith(
      'automations:openPromptPane:reply:req-1',
      expect.any(Function)
    )
  })

  it('rejects when the webContents has been destroyed', async () => {
    const webContents = fakeWebContents()
    webContents.isDestroyed.mockReturnValue(true)
    const ipc = fakeIpc()
    await expect(
      openPromptPane(
        { worktreeId: 'wt-1', agentId: 'claude', prompt: 'go' },
        { webContents: webContents as never, ipc: ipc as never, requestId: 'req-2' }
      )
    ).rejects.toThrow(/no renderer/i)
    expect(webContents.send).not.toHaveBeenCalled()
  })

  it('rejects with a timeout error when the renderer does not respond within the configured window', async () => {
    vi.useFakeTimers()
    const webContents = fakeWebContents()
    const ipc = fakeIpc()
    const pending = openPromptPane(
      { worktreeId: 'wt-1', agentId: 'claude', prompt: 'go' },
      { webContents: webContents as never, ipc: ipc as never, requestId: 'req-3', timeoutMs: 1000 }
    )
    // Why: prevent unhandled rejection while we advance the timer; the
    // assertion below still validates the rejection reason.
    pending.catch(() => {})
    vi.advanceTimersByTime(1500)
    await expect(pending).rejects.toThrow(/did not respond/i)
    expect(ipc.removeAllListeners).toHaveBeenCalledWith('automations:openPromptPane:reply:req-3')
    vi.useRealTimers()
  })
})
