import React, { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
// Why: xterm.css is imported globally from src/renderer/src/assets/main.css,
// so we don't repeat the import here — Vite would dedupe but the explicit
// duplicate has caused phantom-style ordering bugs in the past.
import {
  applyTerminalOptionsToTerminal,
  buildTerminalOptionsFromSettings
} from '@/lib/pane-manager/build-terminal-options'
import { subscribeToPtyData, subscribeToPtyExit } from '@/components/terminal-pane/pty-dispatcher'
import { useAppStore } from '@/store'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { useEffectiveMacOptionAsAlt } from '@/lib/keyboard-layout/use-effective-mac-option-as-alt'

// Why: minimal xterm renderer used by the right-sidebar Run/Setup panels to
// stream output of a single, eagerly-spawned PTY (the per-repo run/setup
// script). The full TerminalPane requires tabId + PaneManager + layout
// snapshot machinery — far too much for a single-PTY view. We reuse the
// canonical building blocks (`buildTerminalOptionsFromSettings`, the
// singleton pty dispatcher) so visual styling stays identical to multi-pane
// terminals: fonts, theme, cursor, scrollback, opacity, Option-as-Alt all
// resolved from the same settings + system-theme inputs.
//
// Subscribing via `subscribeToPtyData` (sidecar API) is intentional: the
// script PTY does not go through `createIpcPtyTransport`, so there is no
// primary `ptyDataHandlers` entry to collide with. Sidecars receive every
// `pty:data` payload for the id and remove cleanly on unsubscribe.

export type SidebarPtyTerminalProps = {
  /** PTY identifier returned by `runScript.start` / `setupScript.start`. */
  ptyId: string
}

export default function SidebarPtyTerminal({ ptyId }: SidebarPtyTerminalProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Why: hold the live xterm so the reactive settings/theme effect can call
  // applyTerminalOptionsToTerminal on it without recreating the terminal.
  const terminalRef = useRef<Terminal | null>(null)

  const settings = useAppStore((s) => s.settings)
  const systemPrefersDark = useSystemPrefersDark()
  // Why: 'auto' is resolved into 'true' | 'false' via the keyboard-layout
  // probe — same hook the regular pane uses so Option-as-Alt behavior stays
  // consistent (e.g. Turkish/German Option composes work in the sidebar
  // PTY too). Defaults to 'true' (US fallback) when settings haven't
  // hydrated, matching the regular pane's pre-hydration behavior.
  const effectiveMacOptionAsAlt = useEffectiveMacOptionAsAlt(settings?.terminalMacOptionAsAlt)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    // Why: the regular center-tab pane reads settings + system theme
    // through the same builder so the sidebar terminal looks identical at
    // first paint. settings can be null during the brief boot-time hydration
    // window — fall back to xterm defaults (the empty options bag merges
    // through the manager's default-merge path; here we just pass {}).
    const initialOptions = settings
      ? buildTerminalOptionsFromSettings(settings, {
          effectiveMacOptionAsAlt,
          systemPrefersDark
          // Why: no paneSize override — the sidebar has no Cmd+= zoom UI,
          // so the global terminalFontSize is the right (and only) value.
        })
      : {}
    const term = new Terminal(initialOptions)
    terminalRef.current = term
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)

    // Why: the container's real size is laid out a frame after `term.open`,
    // so a synchronous `fit()` would compute against zero/stale dimensions
    // and ship `pty.resize(id, 0, 0)`. Defer to the next animation frame.
    let pendingFitRaf: number | null = requestAnimationFrame(() => {
      pendingFitRaf = null
      runFit()
    })

    function runFit(): void {
      try {
        fit.fit()
      } catch {
        // Why: fit() throws when the container has no rendered geometry yet
        // (e.g. the panel is collapsed or the tab is not visible). Skipping
        // the resize lets the next ResizeObserver tick recover automatically
        // once layout settles.
        return
      }
      const cols = term.cols
      const rows = term.rows
      if (cols > 0 && rows > 0) {
        window.api.pty.resize(ptyId, cols, rows)
      }
    }

    // Why: ResizeObserver fires synchronously on layout changes (panel
    // resize, window resize, sidebar collapse). Coalesce into rAF so a
    // burst of size events triggers exactly one fit per frame.
    let resizeRaf: number | null = null
    const ro = new ResizeObserver(() => {
      if (resizeRaf !== null) {
        return
      }
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null
        runFit()
      })
    })
    ro.observe(container)

    const offData = subscribeToPtyData(ptyId, (data) => {
      term.write(data)
    })
    const offExit = subscribeToPtyExit(ptyId, () => {
      // Why: when the script exits we keep the final output on screen so
      // the user can read the failure / completion banner. The store's
      // `handleRunExited` (driven by the run:exited IPC, see useIpcEvents)
      // updates the panel header; we don't need to react here.
    })

    const onInput = term.onData((data) => {
      // Why: forward keystrokes (incl. Ctrl+C) so the user can interrupt
      // the running script directly from the sidebar terminal.
      window.api.pty.write(ptyId, data)
    })

    return () => {
      if (pendingFitRaf !== null) {
        cancelAnimationFrame(pendingFitRaf)
      }
      if (resizeRaf !== null) {
        cancelAnimationFrame(resizeRaf)
      }
      ro.disconnect()
      onInput.dispose()
      offData()
      offExit()
      try {
        fit.dispose()
      } catch {
        /* ignore */
      }
      try {
        term.dispose()
      } catch {
        /* ignore */
      }
      terminalRef.current = null
    }
    // Why: deliberately depend on ptyId only — settings and theme live on
    // their own reactive effect below so a font/theme change does not
    // recreate the terminal (which would clear scrollback and tear down
    // the PTY subscription). The mount effect captures the *initial*
    // settings via the closure; later changes flow through the apply effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId])

  // Why: live re-apply of settings + system theme to the existing terminal,
  // mirroring how use-terminal-pane-lifecycle re-runs applyTerminalAppearance
  // on every settings/systemPrefersDark/effectiveMacOptionAsAlt change. Same
  // helper underneath, so the sidebar PTY tracks the regular pane's styling
  // exactly.
  useEffect(() => {
    const term = terminalRef.current
    if (!term || !settings) {
      return
    }
    applyTerminalOptionsToTerminal(term, settings, {
      effectiveMacOptionAsAlt,
      systemPrefersDark
    })
  }, [settings, systemPrefersDark, effectiveMacOptionAsAlt])

  // Why: `min-h-0` lets this flex child shrink below its content height so
  // the parent's flex column can size the terminal area to remaining space
  // instead of overflowing. `overflow-hidden` keeps xterm's render surface
  // from leaking past the rounded panel container.
  return <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
}
