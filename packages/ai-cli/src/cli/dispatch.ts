import { CliError } from '../core/exit-codes'
import { resolvePrompt } from '../core/io'
import { createRunContext } from './context'
import { runImage } from './activities/image'
import { runSummarize } from './activities/summarize'
import { runChat } from './activities/chat'
import { runSpeech } from './activities/speech'
import { runAudio } from './activities/audio'
import { runTranscribe } from './activities/transcribe'
import { runVideo } from './activities/video'
import type { CommandSpec } from '../manifest/types'

/**
 * Dispatch a parsed generation command to its activity handler. `chat`,
 * `image`, and `summarize` are fully wired; the remaining activities are
 * recognized (and introspectable) but not yet implemented in this build.
 */
export async function dispatchCommand(
  spec: CommandSpec,
  positional: Array<string>,
  rawFlags: Record<string, unknown>,
): Promise<void> {
  const ctx = await createRunContext(rawFlags)

  if (spec.experimental) {
    ctx.logger.warn(`"${spec.name}" is experimental and may change.`)
  }

  switch (spec.name) {
    case 'chat': {
      const prompt = await resolvePrompt(positional, { required: false })
      // No prompt on a TTY → drop into the interactive REPL.
      if (!prompt && ctx.mode === 'pretty') {
        const { runChatRepl } = await import('./interactive')
        const model =
          typeof ctx.options.model === 'string' && ctx.options.model
            ? ctx.options.model
            : 'openai/gpt-5.5'
        await runChatRepl(model)
        return
      }
      return runChat(ctx, prompt)
    }
    case 'image': {
      const prompt = await resolvePrompt(positional, { required: true })
      return runImage(ctx, prompt)
    }
    case 'summarize': {
      const prompt = await resolvePrompt(positional, { required: true })
      return runSummarize(ctx, prompt)
    }
    case 'speech': {
      const prompt = await resolvePrompt(positional, { required: true })
      return runSpeech(ctx, prompt)
    }
    case 'audio': {
      const prompt = await resolvePrompt(positional, { required: true })
      return runAudio(ctx, prompt)
    }
    case 'video': {
      const prompt = await resolvePrompt(positional, { required: true })
      return runVideo(ctx, prompt)
    }
    case 'transcribe':
      return runTranscribe(ctx, positional)
    default:
      throw new CliError('USAGE', `Unknown command "${spec.name}".`)
  }
}
