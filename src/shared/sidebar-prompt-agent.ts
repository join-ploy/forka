import { TUI_AGENT_CONFIG } from './tui-agent-config'
import type { TuiAgent } from './types'

export function inferSidebarPromptAgent(command: string): TuiAgent | null {
  const firstToken = readFirstShellToken(command.trim())
  if (!firstToken) {
    return null
  }
  const normalized = firstToken.split(/[\\/]/).pop() ?? firstToken
  for (const [agent, config] of Object.entries(TUI_AGENT_CONFIG) as [
    TuiAgent,
    (typeof TUI_AGENT_CONFIG)[TuiAgent]
  ][]) {
    if (
      normalized === agent ||
      normalized === config.launchCmd ||
      normalized === config.detectCmd ||
      normalized.endsWith(`/${config.launchCmd}`) ||
      normalized.endsWith(`\\${config.launchCmd}`)
    ) {
      return agent
    }
  }
  return null
}

function readFirstShellToken(value: string): string {
  if (!value) {
    return ''
  }
  const quote = value[0] === '"' || value[0] === "'" ? value[0] : ''
  if (quote) {
    const end = value.indexOf(quote, 1)
    return end === -1 ? value.slice(1) : value.slice(1, end)
  }
  return value.split(/\s+/)[0] ?? ''
}
