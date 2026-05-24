/**
 * Unit tests for `sanitizeRepoDescription` — the IPC-boundary sanitizer that
 * normalizes user-authored Repo.description before it lands in persisted
 * state. The description gets dumped into automation prompts via
 * `group.members.<repo>.description`, so the sanitizer must be paranoid about
 * control chars, bidi-override escapes, and unbounded length the same way
 * `sanitizeWorktreeDisplayName` is for worktree titles.
 *
 * Why a direct unit test on the helper (not the full IPC handler): the handler
 * already delegates input shape validation to TypeScript via Repo's allow-list;
 * the load-bearing logic is the per-character normalization in this helper.
 */

import { describe, expect, it } from 'vitest'
import { sanitizeRepoDescription } from './repos'

describe('sanitizeRepoDescription', () => {
  it('trims leading and trailing whitespace', () => {
    expect(sanitizeRepoDescription('   hello   ')).toBe('hello')
  })

  it('collapses internal whitespace runs to a single space', () => {
    expect(sanitizeRepoDescription('a   b\tc')).toBe('a b c')
  })

  it('replaces C0 control chars (incl. embedded newlines) with spaces', () => {
    expect(sanitizeRepoDescription('line one\nline two')).toBe('line one line two')
    expect(sanitizeRepoDescription('bell\x07alert')).toBe('bell alert')
  })

  it('replaces C1 control chars (0x7f–0x9f) with spaces', () => {
    expect(sanitizeRepoDescription('a\x7fb\x9fc')).toBe('a b c')
  })

  it('strips bidi-override controls (LRO/RLO/PDF/LRI/RLI/FSI/PDI)', () => {
    // U+202E RIGHT-TO-LEFT OVERRIDE — classic display-spoofing vector.
    expect(sanitizeRepoDescription('Hello‮World')).toBe('HelloWorld')
    // U+2066 LEFT-TO-RIGHT ISOLATE + U+2069 POP DIRECTIONAL ISOLATE.
    expect(sanitizeRepoDescription('A⁦B⁩C')).toBe('ABC')
  })

  it('caps the result at 240 chars', () => {
    const long = 'x'.repeat(500)
    const result = sanitizeRepoDescription(long)
    expect(result).toBeDefined()
    expect(result?.length).toBe(240)
  })

  it('returns undefined when the input is empty', () => {
    expect(sanitizeRepoDescription('')).toBeUndefined()
  })

  it('returns undefined when the input collapses to empty after sanitization', () => {
    // Bidi overrides + whitespace + control chars only — nothing left after
    // stripping. Treating this as "no description" lets the IPC layer drop
    // the key from the patch so persisted state stays clean.
    expect(sanitizeRepoDescription('   ‮⁦\n\t  ')).toBeUndefined()
  })

  it('preserves Unicode letters (CJK, accented Latin, emoji)', () => {
    // Why: descriptions are user-authored prose; only attacker-controlled
    // bytes (bidi, control chars) need stripping. Real text should pass
    // through cleanly.
    expect(sanitizeRepoDescription('日本語の説明')).toBe('日本語の説明')
    expect(sanitizeRepoDescription('café')).toBe('café')
    expect(sanitizeRepoDescription('  ship it 🚀  ')).toBe('ship it 🚀')
  })
})
