import type { HarnessSession } from '@tanstack/ai-harness'

export const HELP_TEXT = [
  'Type a message and press Enter. While the agent works, a new message steers it.',
  'Commands:',
  '  /agents                  list the agents',
  '  /agent <name> [json]     run an agent in the background',
  '  /config [key value]      show or change a setting',
  '  /connect <id>            sign in to a connector (and /disconnect <id>)',
  '  /cancel                  cancel the running turn (or press Esc)',
  '  /status                  show the session status',
  '  /exit                    quit',
].join('\n')

/** A command argument: JSON when it parses, else the text itself. */
function parseArg(text: string): unknown {
  if (text === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function show(value: unknown): string {
  if (value === undefined) return 'Done.'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

/**
 * Turn the user's reply into an answer: `y`/`n` for yes-or-no questions,
 * JSON when it parses, else the text.
 */
export function parseAnswer(reply: string, schema: unknown): unknown {
  const text = reply.trim()
  const isBoolean =
    typeof schema === 'object' &&
    schema !== null &&
    'type' in schema &&
    schema.type === 'boolean'
  if (isBoolean && /^(y|yes)$/i.test(text)) return true
  if (isBoolean && /^(n|no)$/i.test(text)) return false
  return parseArg(text)
}

async function runCommand(
  session: HarnessSession,
  name: string,
  input: unknown,
): Promise<LineResult> {
  const describe = (
    outcome: { ok: true; value: unknown } | { ok: false; error: unknown },
  ) =>
    outcome.ok
      ? show(outcome.value)
      : `/${name} failed: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`
  const settled = Promise.resolve(
    session.command(name, input).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  )
  // A command that asks a question waits for the next line, so return now
  // and print its result when it is done.
  let done = false
  void settled.then(() => {
    done = true
  })
  while (!done) {
    if (session.snapshot().pendingQuestions.length > 0) {
      return { type: 'notice', text: '', later: settled.then(describe) }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  return { type: 'notice', text: describe(await settled) }
}

/** What the UI does after a line of input. */
export type LineResult =
  | { type: 'notice'; text: string; later?: Promise<string> }
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
  const [question] = session.snapshot().pendingQuestions
  if (question) {
    const receipt = await session.answer(
      question.questionId,
      parseAnswer(text, question.schema),
    )
    return {
      type: 'notice',
      text:
        receipt.status === 'rejected'
          ? `Answer again: ${receipt.reason ?? ''}`
          : '',
    }
  }
  if (!text.startsWith('/')) {
    if (session.snapshot().status === 'running') await session.steer(text)
    else void session.prompt(text)
    return { type: 'sent' }
  }
  const [name = '', ...rest] = text.slice(1).split(' ')
  const argText = rest.join(' ').trim()
  switch (name) {
    case 'help': {
      const commands = session.commands()
      return {
        type: 'notice',
        text:
          commands.length === 0
            ? HELP_TEXT
            : `${HELP_TEXT}\nPlugin commands:\n${commands
                .map((command) => `  /${command.name}  ${command.description}`)
                .join('\n')}`,
      }
    }
    case 'config': {
      const [key = '', ...valueParts] = argText.split(' ')
      if (!key) {
        const entries = Object.entries(session.config())
        return {
          type: 'notice',
          text:
            entries.length === 0
              ? 'This harness has no settings.'
              : entries
                  .map(
                    ([name, entry]) =>
                      `  ${name} = ${JSON.stringify(entry.value)}`,
                  )
                  .join('\n'),
        }
      }
      const receipt = await session.setConfig(
        key,
        parseArg(valueParts.join(' ').trim()),
      )
      return {
        type: 'notice',
        text:
          receipt.status === 'rejected'
            ? `Not changed: ${receipt.reason ?? ''}`
            : `${key} changed.`,
      }
    }
    case 'connect':
    case 'disconnect':
      return runCommand(session, `${name}:${argText}`, undefined)
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
      if (session.commands().some((command) => command.name === name)) {
        return runCommand(session, name, parseArg(argText))
      }
      return { type: 'notice', text: `Unknown command: /${name}. Type /help.` }
  }
}
