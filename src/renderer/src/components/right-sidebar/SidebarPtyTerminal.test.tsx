import { renderToStaticMarkup } from 'react-dom/server'
import type * as ReactNS from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Why: vitest runs in `node` (no jsdom), so we cannot actually mount xterm.
// We mock xterm + the addon and the pty-dispatcher subscriptions so we can
// assert the wiring (subscribe on mount, write data through, unsubscribe on
// cleanup, re-subscribe on ptyId change) by invoking the effect callback
// recorded via a mocked React.useEffect.

// Per-test mutable state for the mocks. Re-built in beforeEach so cases
// don't bleed into one another.
type MockTerm = {
  loadAddon: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  onData: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  cols: number
  rows: number
}

type MockFit = {
  fit: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
}

const createdTerms: MockTerm[] = []
const createdFits: MockFit[] = []
const inputDisposers: ReturnType<typeof vi.fn>[] = []
const dataSubs: { ptyId: string; cb: (d: string) => void; off: ReturnType<typeof vi.fn> }[] = []
const exitSubs: { ptyId: string; cb: (c: number) => void; off: ReturnType<typeof vi.fn> }[] = []

vi.mock('@xterm/xterm', () => {
  // Why: vi.fn().mockImplementation does not produce a callable constructor in
  // node — `new MockFn()` throws "is not a constructor". A real class works.
  class Terminal {
    loadAddon = vi.fn()
    open = vi.fn()
    write = vi.fn()
    onData: ReturnType<typeof vi.fn>
    dispose = vi.fn()
    cols = 100
    rows = 30
    constructor() {
      const onInputDispose = vi.fn()
      inputDisposers.push(onInputDispose)
      this.onData = vi.fn().mockReturnValue({ dispose: onInputDispose })
      createdTerms.push(this as unknown as MockTerm)
    }
  }
  return { Terminal }
})

vi.mock('@xterm/addon-fit', () => {
  class FitAddon {
    fit = vi.fn()
    dispose = vi.fn()
    constructor() {
      createdFits.push(this as unknown as MockFit)
    }
  }
  return { FitAddon }
})

// Why: SidebarPtyTerminal builds its initial xterm options via the shared
// settings → ITerminalOptions module (the same one the regular pane uses)
// and reapplies on settings/theme change. Mock both entry points so we can
// assert that the wiring fires without depending on real settings shape.
const buildOptionsCalls: { settings: unknown; deps: unknown }[] = []
const applyOptionsCalls: { terminal: unknown; settings: unknown; deps: unknown }[] = []
vi.mock('@/lib/pane-manager/build-terminal-options', () => ({
  buildTerminalOptionsFromSettings: (settings: unknown, deps: unknown) => {
    buildOptionsCalls.push({ settings, deps })
    return { fontSize: 14 }
  },
  applyTerminalOptionsToTerminal: (terminal: unknown, settings: unknown, deps: unknown) => {
    applyOptionsCalls.push({ terminal, settings, deps })
  }
}))

// Why: the settings + system-theme reactivity hooks read out of the
// renderer store / a matchMedia subscription. Stub both so the component
// gets deterministic inputs. The store mock is keyed by selector so callers
// can assert which slice was read.
const fakeSettings = {
  theme: 'system',
  terminalFontSize: 14,
  terminalFontFamily: 'JetBrainsMono Nerd Font'
}
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => selector({ settings: fakeSettings })
}))
vi.mock('@/components/terminal-pane/use-system-prefers-dark', () => ({
  useSystemPrefersDark: () => true
}))
// Why: the regular pane resolves a four-mode Option-as-Alt value via a
// hook that subscribes to a probe; the sidebar terminal does the same so
// keystroke handling stays consistent. Stub it to a fixed value.
vi.mock('@/lib/keyboard-layout/use-effective-mac-option-as-alt', () => ({
  useEffectiveMacOptionAsAlt: () => 'true'
}))

vi.mock('@/components/terminal-pane/pty-dispatcher', () => ({
  subscribeToPtyData: (ptyId: string, cb: (d: string) => void) => {
    const off = vi.fn()
    dataSubs.push({ ptyId, cb, off })
    return off
  },
  subscribeToPtyExit: (ptyId: string, cb: (c: number) => void) => {
    const off = vi.fn()
    exitSubs.push({ ptyId, cb, off })
    return off
  }
}))

// Why: capture the effect bodies so tests can run them explicitly with a
// non-null containerRef. React's static renderer otherwise skips effects.
// We track each effect (mount + reactive re-apply) separately so a test can
// drive them in the order React would.
type EffectRecord = {
  fn: () => void | (() => void)
  cleanup: (() => void) | void
}
const recordedEffects: EffectRecord[] = []
function runEffect(idx: number): void {
  const eff = recordedEffects[idx]
  if (!eff) {
    throw new Error(`no effect recorded at index ${idx}`)
  }
  const cleanup = eff.fn()
  eff.cleanup = typeof cleanup === 'function' ? cleanup : undefined
}
function cleanupEffect(idx: number): void {
  const eff = recordedEffects[idx]
  if (eff?.cleanup) {
    eff.cleanup()
  }
}

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof ReactNS>('react')
  return {
    ...actual,
    useRef: <T,>(_initial: T) => ({ current: { tagName: 'DIV' } as unknown as T }),
    useEffect: (fn: () => void | (() => void)) => {
      recordedEffects.push({ fn, cleanup: undefined })
    }
  }
})

const ptyResize = vi.fn()
const ptyWrite = vi.fn()

beforeEach(() => {
  createdTerms.length = 0
  createdFits.length = 0
  inputDisposers.length = 0
  dataSubs.length = 0
  exitSubs.length = 0
  ptyResize.mockClear()
  ptyWrite.mockClear()
  recordedEffects.length = 0
  buildOptionsCalls.length = 0
  applyOptionsCalls.length = 0

  // Why: window.api is the preload bridge. Stub the two methods the
  // component calls directly (resize after fit, write on user keystrokes).
  ;(globalThis as unknown as { window: { api: unknown } }).window = {
    api: {
      pty: {
        resize: ptyResize,
        write: ptyWrite
      }
    }
  }

  // Why: ResizeObserver / requestAnimationFrame are DOM APIs missing in node.
  // Provide noop / immediate shims so the component's deferred fit branch can
  // execute without throwing.
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }

  let nextRafId = 1
  const rafCallbacks = new Map<number, FrameRequestCallback>()
  ;(
    globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }
  ).requestAnimationFrame = ((cb: FrameRequestCallback) => {
    const id = nextRafId++
    rafCallbacks.set(id, cb)
    queueMicrotask(() => {
      const fn = rafCallbacks.get(id)
      if (fn) {
        rafCallbacks.delete(id)
        fn(performance.now())
      }
    })
    return id
  }) as typeof requestAnimationFrame
  ;(
    globalThis as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }
  ).cancelAnimationFrame = ((id: number) => {
    rafCallbacks.delete(id)
  }) as typeof cancelAnimationFrame
})

afterEach(() => {
  recordedEffects.length = 0
})

describe('SidebarPtyTerminal', () => {
  it('subscribes to pty data + exit on mount with the given ptyId', async () => {
    const { default: SidebarPtyTerminal } = await import('./SidebarPtyTerminal')
    renderToStaticMarkup(<SidebarPtyTerminal ptyId="pty-A" />)
    // The component records two effects: (0) mount/teardown, (1) reactive
    // settings/theme apply. Run the mount effect first so the terminal
    // exists before the apply effect targets it.
    expect(recordedEffects.length).toBeGreaterThanOrEqual(1)
    runEffect(0)

    expect(createdTerms).toHaveLength(1)
    expect(createdFits).toHaveLength(1)
    expect(dataSubs).toHaveLength(1)
    expect(dataSubs[0].ptyId).toBe('pty-A')
    expect(exitSubs).toHaveLength(1)
    expect(exitSubs[0].ptyId).toBe('pty-A')
    expect(createdTerms[0].loadAddon).toHaveBeenCalledWith(createdFits[0])
  })

  it('forwards pty data to terminal.write and unsubscribes on cleanup', async () => {
    const { default: SidebarPtyTerminal } = await import('./SidebarPtyTerminal')
    renderToStaticMarkup(<SidebarPtyTerminal ptyId="pty-1" />)
    runEffect(0)

    // Push a data chunk through the recorded callback and confirm it lands on
    // the (mocked) terminal.
    dataSubs[0].cb('hello\r\n')
    expect(createdTerms[0].write).toHaveBeenCalledWith('hello\r\n')

    // Cleanup: every subscription + addon must be released.
    cleanupEffect(0)
    expect(dataSubs[0].off).toHaveBeenCalledOnce()
    expect(exitSubs[0].off).toHaveBeenCalledOnce()
    expect(inputDisposers[0]).toHaveBeenCalledOnce()
    expect(createdFits[0].dispose).toHaveBeenCalledOnce()
    expect(createdTerms[0].dispose).toHaveBeenCalledOnce()
  })

  it('forwards user keystrokes through window.api.pty.write', async () => {
    const { default: SidebarPtyTerminal } = await import('./SidebarPtyTerminal')
    renderToStaticMarkup(<SidebarPtyTerminal ptyId="pty-2" />)
    runEffect(0)

    // term.onData is the input subscription. Replay the registered callback
    // to simulate the user typing Ctrl+C (\x03).
    const onDataCalls = createdTerms[0].onData.mock.calls
    expect(onDataCalls).toHaveLength(1)
    const inputCb = onDataCalls[0][0] as (d: string) => void
    inputCb('\x03')
    expect(ptyWrite).toHaveBeenCalledWith('pty-2', '\x03')
  })

  it('re-subscribes with the new ptyId when remounted with a different id', async () => {
    const { default: SidebarPtyTerminal } = await import('./SidebarPtyTerminal')

    renderToStaticMarkup(<SidebarPtyTerminal ptyId="pty-old" />)
    runEffect(0)
    expect(dataSubs).toHaveLength(1)
    expect(dataSubs[0].ptyId).toBe('pty-old')

    // Tear down the first subscription as React would on a key/dep change.
    cleanupEffect(0)
    expect(dataSubs[0].off).toHaveBeenCalledOnce()

    // Re-mount with a new id; the new effect must subscribe to the new id.
    recordedEffects.length = 0
    renderToStaticMarkup(<SidebarPtyTerminal ptyId="pty-new" />)
    runEffect(0)
    expect(dataSubs).toHaveLength(2)
    expect(dataSubs[1].ptyId).toBe('pty-new')
    expect(createdTerms).toHaveLength(2)
  })

  it('builds initial xterm options via the shared settings → ITerminalOptions module', async () => {
    // The single sidebar PTY must visually match the regular pane: same
    // font size, font family, theme. We assert the wiring (correct module
    // is called with current settings + system theme + resolved Option-as-
    // Alt) rather than re-asserting the builder's outputs, which the
    // build-terminal-options tests cover end-to-end.
    const { default: SidebarPtyTerminal } = await import('./SidebarPtyTerminal')
    renderToStaticMarkup(<SidebarPtyTerminal ptyId="pty-styled" />)
    runEffect(0)

    expect(buildOptionsCalls).toHaveLength(1)
    expect(buildOptionsCalls[0].settings).toBe(fakeSettings)
    expect(buildOptionsCalls[0].deps).toMatchObject({
      effectiveMacOptionAsAlt: 'true',
      systemPrefersDark: true
    })
    // Sidebar has no zoom UI, so it must not pass a paneSize override —
    // letting the global terminalFontSize win.
    expect((buildOptionsCalls[0].deps as { paneSize?: number }).paneSize).toBeUndefined()
  })

  it('reapplies settings + theme via applyTerminalOptionsToTerminal when the reactive effect runs', async () => {
    // Settings + system theme can change mid-session (font swap, dark/light
    // flip, terminal-color override). The component's reactive effect must
    // call the per-terminal apply helper so the live PTY view picks up the
    // change without a remount.
    const { default: SidebarPtyTerminal } = await import('./SidebarPtyTerminal')
    renderToStaticMarkup(<SidebarPtyTerminal ptyId="pty-react" />)
    runEffect(0)
    // Now simulate React running the reactive apply effect (settings dep).
    runEffect(1)

    expect(applyOptionsCalls).toHaveLength(1)
    expect(applyOptionsCalls[0].terminal).toBe(createdTerms[0])
    expect(applyOptionsCalls[0].settings).toBe(fakeSettings)
    expect(applyOptionsCalls[0].deps).toMatchObject({
      effectiveMacOptionAsAlt: 'true',
      systemPrefersDark: true
    })
  })
})
