import type { Reactor, ReactorMessage } from '@reactor-team/js-sdk'
import type { ReactorWorldModel } from '@tanstack/ai-reactor'

export function worldNeedsSeedImage(model: ReactorWorldModel): boolean {
  return model === 'lingbot' || model === 'lingbot-world-2'
}

/** LingBot start requires set_prompt. The UI treats the still as the start. */
export const LINGBOT_START_PROMPT = 'Follow the seed image.'

export function liveAcceptsSeedImage(model: string): boolean {
  return model === 'helios'
}

export function commandErrorMessage(data: unknown): string | null {
  if (typeof data === 'string' && data.length > 0) return data
  if (typeof data !== 'object' || data === null || !('reason' in data)) {
    return null
  }
  const reason = data.reason
  return typeof reason === 'string' && reason.length > 0 ? reason : null
}

export async function setReactorImage(
  reactor: Reactor,
  file: File,
): Promise<void> {
  const image = await reactor.uploadFile(file)
  await reactor.sendCommand('set_image', { image })
}

export function watchReactorFailure(
  reactor: Reactor,
  onFailure: (message: string) => void,
): () => void {
  const onError = (err: Error) => {
    onFailure(err.message)
  }
  const onMessage = (msg: ReactorMessage) => {
    if (msg.type !== 'command_error') return
    onFailure(commandErrorMessage(msg.data) ?? 'Command failed')
  }
  const onStatus = (status: string) => {
    if (status === 'disconnected') onFailure('Session disconnected')
  }
  reactor.on('error', onError)
  reactor.on('message', onMessage)
  reactor.on('statusChanged', onStatus)
  return () => {
    reactor.off('error', onError)
    reactor.off('message', onMessage)
    reactor.off('statusChanged', onStatus)
  }
}
