import { ipcMain } from 'electron'
import { writePromptFile } from '../prompts-cache'

// Why: a single small IPC surface mirrors the issue-command writer pattern.
// Returns the absolute path so the renderer can splice it directly into the
// shell command the right-sidebar Review / Create PR dropdowns invoke.
export function registerPromptsHandlers(): void {
  ipcMain.handle(
    'prompts:write',
    async (_event, args: { label: string; body: string }): Promise<string> => {
      return writePromptFile(args.label, args.body)
    }
  )
}
