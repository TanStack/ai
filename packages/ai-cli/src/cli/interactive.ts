import { StreamProcessor, chat } from '@tanstack/ai'
import { instantiateAdapter, resolveApiKey, resolveModelSlug } from '../core/providers'
import { findCommand } from '../manifest/manifest'
import { renderChatRepl, renderMenu } from '../render/lazy'
import { dispatchCommand } from './dispatch'
import type { ReplMessage } from '../render/repl'

/** Best-known default models per command for the zero-config interactive flow. */
const DEFAULT_MODELS: Record<string, string> = {
  chat: 'openai/gpt-5.5',
  summarize: 'openai/gpt-5.5',
  image: 'openai/gpt-image-1',
  speech: 'openai/gpt-4o-mini-tts',
  transcribe: 'openai/gpt-4o-mini-transcribe',
}

/**
 * The home screen shown when `ts-ai` is run with no command on a TTY: an
 * animated wordmark + menu. Resolves the chosen action and runs it.
 */
export async function runHome(modelOverride?: string): Promise<number> {
  const choice = await renderMenu()
  if (choice.command === 'quit') return 0

  if (choice.command === 'chat') {
    return runChatRepl(modelOverride ?? DEFAULT_MODELS['chat'] ?? 'openai/gpt-5.5')
  }

  const model = modelOverride ?? DEFAULT_MODELS[choice.command]
  if (!model) {
    process.stderr.write(
      `Run it with a model, e.g.:\n  ts-ai ${choice.command} "${choice.prompt ?? '<prompt>'}" --model <provider/model>\n`,
    )
    return 0
  }

  const spec = findCommand(choice.command)
  if (!spec) return 0
  await dispatchCommand(spec, choice.prompt ? [choice.prompt] : [], { model, preview: true })
  return 0
}

/** Launch the interactive chat REPL (also used by `ts-ai chat` with no prompt on a TTY). */
export async function runChatRepl(modelSlug: string): Promise<number> {
  const resolved = resolveModelSlug(modelSlug)
  const apiKey = resolveApiKey(resolved.entry, resolved.provider, undefined)
  const adapter = await instantiateAdapter({
    resolved,
    activity: 'chat',
    apiKey,
  })

  const respond = async (messages: Array<ReplMessage>): Promise<string> => {
    const processor = new StreamProcessor()
    const result = await processor.process(
      chat({
        adapter: adapter as never,
        messages,
        stream: true,
        debug: false,
      }),
    )
    return result.content || '(no response)'
  }

  await renderChatRepl({ model: `${resolved.provider}/${resolved.model}`, respond })
  return 0
}
