import { StreamProcessor, chat } from '@tanstack/ai'
import {
  instantiateAdapter,
  resolveApiKey,
  resolveModelSlug,
} from '../core/providers'
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
 * animated wordmark + menu. Acts as a hub — after each action (or pressing Esc
 * inside a sub-flow) it returns to the menu, until the user quits.
 */
export async function runHome(modelOverride?: string): Promise<number> {
  let first = true
  for (;;) {
    const choice = await renderMenu(first)
    first = false
    if (choice.command === 'quit') return 0

    try {
      if (choice.command === 'chat') {
        // Esc in the REPL unmounts it and returns here → back to the menu.
        await runChatRepl(
          modelOverride ?? DEFAULT_MODELS['chat'] ?? 'openai/gpt-5.5',
        )
        continue
      }

      const model = modelOverride ?? DEFAULT_MODELS[choice.command]
      const spec = findCommand(choice.command)
      if (!model || !spec) {
        process.stderr.write(
          `Run it with a model, e.g.:\n  ts-ai ${choice.command} "${choice.prompt ?? '<prompt>'}" --model <provider/model>\n`,
        )
        continue
      }
      await dispatchCommand(spec, choice.prompt ? [choice.prompt] : [], {
        model,
        preview: true,
      })
    } catch (err) {
      // A failed action shouldn't crash the hub — report and return to the menu.
      process.stderr.write(
        `error: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
  }
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

  await renderChatRepl({
    model: `${resolved.provider}/${resolved.model}`,
    respond,
  })
  return 0
}
