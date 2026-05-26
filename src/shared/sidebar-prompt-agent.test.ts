import { describe, expect, it } from 'vitest'
import { inferSidebarPromptAgent } from './sidebar-prompt-agent'

describe('inferSidebarPromptAgent', () => {
  it('infers agents from stored sidebar command launch strings', () => {
    expect(inferSidebarPromptAgent('codex --model gpt-5')).toBe('codex')
    expect(inferSidebarPromptAgent('"claude" --dangerously-skip-permissions')).toBe('claude')
    expect(inferSidebarPromptAgent('/usr/local/bin/opencode run')).toBe('opencode')
  })

  it('returns null for unknown commands', () => {
    expect(inferSidebarPromptAgent('node scripts/review.js')).toBeNull()
  })
})
