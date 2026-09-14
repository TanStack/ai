import type { Reactor, ReactorMessage } from '@reactor-team/js-sdk'
import type { ReactorWorldModel } from '@tanstack/ai-reactor'

export function worldNeedsSeedImage(model: ReactorWorldModel): boolean {
  return model === 'lingbot' || model === 'lingbot-world-2'
}

/**
 * LingBot drifts the camera unless every prompt pins it. The Reactor prompt
 * guide calls this the camera layer. Keep it verbatim across prompts.
 */
const LINGBOT_CAMERA =
  'First-person view at standing eye height, horizon level across the middle of the frame, camera height constant. The camera does not move on its own; movement input is the only source of motion.'

/** Compose a LingBot prompt: scene base, optional steer detail, camera layer. */
export function lingbotPrompt(base: string, detail = ''): string {
  return [base.trim(), detail.trim(), LINGBOT_CAMERA]
    .filter((part) => part.length > 0)
    .join(' ')
}

/** Default is 5 deg per latent frame, which spins past the target on a tap. */
export const LINGBOT_ROTATION_SPEED_DEG = 1.5

/**
 * Orbis has no camera commands. The Reactor Orbis guide steers the camera in
 * prose, so each active control adds one camera sentence to the scene prompt.
 * A prompt lands at the next ~1.8 s chunk and morphs in, so controls latch.
 */
const ORBIS_CAMERA: Record<string, string> = {
  forward: 'The camera glides steadily forward into the scene.',
  back: 'The camera pulls steadily back away from the scene.',
  strafe_left: 'The camera tracks steadily sideways to the left.',
  strafe_right: 'The camera tracks steadily sideways to the right.',
  left: 'The camera pans steadily to the left.',
  right: 'The camera pans steadily to the right.',
  up: 'The camera tilts steadily upward.',
  down: 'The camera tilts steadily downward.',
}

/** Scene prompt plus the active camera moves, or a still camera when none. */
export function orbisPrompt(
  base: string,
  moves: ReadonlyArray<string>,
): string {
  const camera = moves.map((value) => ORBIS_CAMERA[value] ?? '').join(' ')
  const tail =
    camera.length > 0
      ? `${camera} Continuous camera motion, no cuts.`
      : 'The camera holds steady, no cuts.'
  return `${base.trim()} ${tail}`
}

export function isOrbisModel(model: ReactorWorldModel): boolean {
  return model === 'visko-orbis-stable' || model === 'visko-orbis-dynamic'
}

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

export type CameraAxis =
  | 'move_longitudinal'
  | 'move_lateral'
  | 'look_horizontal'
  | 'look_vertical'

/**
 * Set one held camera axis. Values persist until you send `idle`.
 * LingBot has one movement axis (`set_movement`). LingBot World 2 splits it.
 */
export async function setLingbotAxis(
  reactor: Reactor,
  model: ReactorWorldModel,
  axis: CameraAxis,
  value: string,
): Promise<void> {
  if (model === 'lingbot' && axis.startsWith('move_')) {
    await reactor.sendCommand('set_movement', { movement: value })
    return
  }
  await reactor.sendCommand(`set_${axis}`, { [axis]: value })
}
