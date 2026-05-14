import { beforeEach, describe, expect, it } from 'vitest'

import { _testing as registry } from './run-script'

describe('runPtyByRepo registry', () => {
  beforeEach(() => registry.clear())

  it('records and returns the live pty for a repo', () => {
    registry.set('repo-1', { ptyId: 'pty-A', worktreeId: 'wt-1', generation: 1 })
    expect(registry.get('repo-1')).toEqual({
      ptyId: 'pty-A',
      worktreeId: 'wt-1',
      generation: 1
    })
  })

  it('returns null for an unknown repo', () => {
    expect(registry.get('missing')).toBeNull()
  })

  it('clearIfMatches only clears when generation matches', () => {
    registry.set('repo-1', { ptyId: 'pty-A', worktreeId: 'wt-1', generation: 1 })
    // Stale generation (e.g. an onExit from a previous PTY race) must not clear.
    registry.clearIfMatches('repo-1', 'pty-A', 0)
    expect(registry.get('repo-1')).not.toBeNull()
    // Matching generation clears.
    registry.clearIfMatches('repo-1', 'pty-A', 1)
    expect(registry.get('repo-1')).toBeNull()
  })

  it('clearIfMatches only clears when ptyId matches', () => {
    registry.set('repo-1', { ptyId: 'pty-A', worktreeId: 'wt-1', generation: 1 })
    // A PTY id that does not match the current entry must not clear it
    // (defends against onExit firing for a sibling PTY in another repo flow).
    registry.clearIfMatches('repo-1', 'pty-OTHER', 1)
    expect(registry.get('repo-1')).not.toBeNull()
  })

  it('nextGen returns strictly increasing values', () => {
    const a = registry.nextGen()
    const b = registry.nextGen()
    const c = registry.nextGen()
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})
