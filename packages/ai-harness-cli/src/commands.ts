import type { HarnessSession } from '@tanstack/ai-harness'

export const HELP_TEXT = [
  'Type a message and press Enter. While the agent works, a new message steers it.',
  'Commands:',
  '  /agents                  list the agents',
  '  /agent <name> [json]     run an agent in the background',
  '  /cancel                  cancel the running turn (or press Esc)',
  '  /status                  show the session status',
  '  /exit                    quit',
].join('\n')

/** What the UI does after a line of input. */
export type LineResult =
  | { type: 'notice'; text: string }
  | { type: 'exit' }
  | { type: 'sent' }

/**
 * Handle one line of user input: a slash command, a steer while a turn runs,
 * or a new prompt. Shared by the interactive UI and the line mode.
 */
export async function handleLine(
  session: HarnessSession,
  line: string,
): Promise<LineResult> {
  const text = line.trim()
  if (text === '') return { type: 'notice', text: '' }
  if (!text.startsWith('/')) {
    if (session.snapshot().status === 'running') await session.steer(text)
    else void session.prompt(text)
    return { type: 'sent' }
  }
  const [name = '', ...rest] = text.slice(1).split(' ')
  const argText = rest.join(' ').trim()
  switch (name) {
    case 'help':
      return { type: 'notice', text: HELP_TEXT }
    case 'exit':
    case 'quit':
      return { type: 'exit' }
    case 'cancel': {
      const receipt = await session.cancel()
      return {
        type: 'notice',
        text:
          receipt.status === 'rejected' ? 'Nothing is running.' : 'Cancelled.',
      }
    }
    case 'status': {
      const snapshot = session.snapshot()
      const active = snapshot.activeOperations
        .map((operation) => operation.agent ?? operation.kind)
        .join(', ')
      return {
        type: 'notice',
        text: `Status: ${snapshot.status}. Running: ${active || 'nothing'}. Queued turns: ${snapshot.queuedTurns}.`,
      }
    }
    case 'agents': {
      const agents = session.registry.list()
      return {
        type: 'notice',
        text:
          agents.length === 0
            ? 'This harness has no agents.'
            : agents
                .map((agent) => `  ${agent.name}: ${agent.description}`)
                .join('\n'),
      }
    }
    case 'agent': {
      const [agentName = '', ...inputParts] = argText.split(' ')
      const handle = session.agent(agentName)
      if (!handle)
        return {
          type: 'notice',
          text: `Unknown agent: ${agentName || '(none)'}`,
        }
      const inputText = inputParts.join(' ').trim()
      let input: unknown
      try {
        input = inputText === '' ? undefined : JSON.parse(inputText)
      } catch {
        return {
          type: 'notice',
          text: 'The agent input must be JSON, for example {"vendor":"acme"}.',
        }
      }
      const operation = handle.start(input, { wake: true })
      operation.then(
        () => {},
        () => {},
      )
      return { type: 'notice', text: `Started ${agentName} in the background.` }
    }
    default:
      return { type: 'notice', text: `Unknown command: /${name}. Type /help.` }
  }
}
