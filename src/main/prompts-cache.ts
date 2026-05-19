import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Why: keep prompt artifacts under ~/.orca so they coexist with other
// per-user Orca state (issue-command override, prompts cache) and never
// land inside any individual repo. homedir() is used rather than '~' so
// the path resolves correctly on Windows and on non-bash shells. Resolved
// lazily so tests can mock homedir() before the path is materialized.
export function getPromptsCacheDir(): string {
  return join(homedir(), '.orca', 'prompts')
}

// Why: sanitize the user-provided label to a safe filename. Keep ASCII
// letters/digits/dash/underscore; everything else becomes a dash. Lowercase
// so 'Create PR' and 'create pr' don't fight over the same file. Empty
// labels would otherwise produce '.md' (a hidden file with no stem) so we
// fall back to 'prompt'.
export function slugifyPromptLabel(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'prompt'
}

/** Write the resolved prompt content for a label, returning the absolute
 *  path that the caller can splice into a shell `$(cat ...)` expansion.
 *  Overwrites are intentional — re-invoking the same labeled command with
 *  a refreshed body should replace the previous payload in place so the
 *  shell expansion always picks up the latest content. */
export async function writePromptFile(label: string, body: string): Promise<string> {
  const cacheDir = getPromptsCacheDir()
  await mkdir(cacheDir, { recursive: true })
  const slug = slugifyPromptLabel(label)
  const filePath = join(cacheDir, `${slug}.md`)
  await writeFile(filePath, body, 'utf-8')
  return filePath
}
