/**
 * The bridge protocol, host side (Draft 0.2 §6). Framework-agnostic: given a
 * transport (`send`) and host callbacks, it validates every inbound envelope,
 * answers `frame.ready` with `host.init`, persists `frame.state.set`, and
 * routes `frame.intent.*` through the host (which owns approval, §6.3).
 *
 * The React renderer (`../react/frame`) and the §10.2 contract tests both use
 * this; there is no second copy of the protocol logic.
 */

import { FRAME_PROTOCOL } from './types'
import type {
  BridgeEnvelope,
  FrameErrorPayload,
  FrameIntentPayload,
  FrameMessageType,
  FrameTheme,
} from './types'

/** Version of the shell/bridge contract, reported in `frame.ready` (§6.2). */
export const SHELL_VERSION = '0.2.0'

/** The frame→host subset of the message set (§6.2). */
export type FrameToHostType =
  | 'frame.ready'
  | 'frame.resize'
  | 'frame.error'
  | 'frame.state.set'
  | 'frame.intent.submit'
  | 'frame.intent.action'

const FRAME_TO_HOST: ReadonlySet<FrameMessageType> = new Set<FrameToHostType>([
  'frame.ready',
  'frame.resize',
  'frame.error',
  'frame.state.set',
  'frame.intent.submit',
  'frame.intent.action',
])

/** Result of validating an inbound message against the protocol (§6.1). */
export type EnvelopeCheck =
  | { ok: true; envelope: BridgeEnvelope }
  | { ok: false; reason: string }

/**
 * Validate an inbound value as a frame→host envelope for this instance (§6.1).
 * Unknown types and shape-invalid payloads are rejected (caller drops + logs).
 */
export function validateInbound(
  data: unknown,
  expected: { artifactId: string; instanceId: string },
): EnvelopeCheck {
  if (!data || typeof data !== 'object') return { ok: false, reason: 'not an object' }
  const e = data as Record<string, unknown>
  if (e.ns !== FRAME_PROTOCOL) return { ok: false, reason: `bad ns: ${String(e.ns)}` }
  if (typeof e.type !== 'string' || !FRAME_TO_HOST.has(e.type as FrameMessageType)) {
    return { ok: false, reason: `unknown or non-frame type: ${String(e.type)}` }
  }
  if (e.artifactId !== expected.artifactId) return { ok: false, reason: 'artifactId mismatch' }
  if (e.instanceId !== expected.instanceId) return { ok: false, reason: 'instanceId mismatch' }
  if (!e.payload || typeof e.payload !== 'object') return { ok: false, reason: 'missing payload' }

  // Light per-type payload checks; anything malformed is dropped.
  const p = e.payload as Record<string, unknown>
  switch (e.type as FrameToHostType) {
    case 'frame.ready':
      break
    case 'frame.resize':
      if (typeof p.height !== 'number' || !isFinite(p.height)) return { ok: false, reason: 'resize.height' }
      break
    case 'frame.error':
      if (typeof p.message !== 'string') return { ok: false, reason: 'error.message' }
      break
    case 'frame.state.set':
      if (!p.state || typeof p.state !== 'object') return { ok: false, reason: 'state.set.state' }
      break
    case 'frame.intent.submit':
    case 'frame.intent.action':
      if (typeof p.intent !== 'string') return { ok: false, reason: 'intent.intent' }
      if (!p.state || typeof p.state !== 'object') return { ok: false, reason: 'intent.state' }
      break
  }
  return {
    ok: true,
    envelope: {
      ns: FRAME_PROTOCOL,
      type: e.type as FrameMessageType,
      artifactId: e.artifactId,
      instanceId: e.instanceId,
      requestId: typeof e.requestId === 'string' ? e.requestId : undefined,
      payload: e.payload,
    },
  }
}

export interface IntentDispatch {
  intentClass: 'submit' | 'action'
  intent: string
  payload?: unknown
  state: Record<string, unknown>
}

export interface FrameHostCallbacks {
  getTheme: () => FrameTheme
  getState: () => Record<string, unknown>
  /** Persist a full-replacement state snapshot per instance (§6.4). */
  setState: (state: Record<string, unknown>) => void
  getData?: () => unknown
  registryVersion?: string
  /**
   * Route a submit/action intent through the host (§6.3). Action intents go to
   * the host's approval machinery; the returned value becomes host.intent.result.
   */
  onIntent?: (dispatch: IntentDispatch) => Promise<{ ok: boolean; result?: unknown; error?: string }> | void
  onReady?: () => void
  onResize?: (height: number) => void
  onError?: (err: FrameErrorPayload) => void
  /** Dropped-message hook (§6.1: "logged host-side"). */
  onDrop?: (reason: string, data: unknown) => void
  /** Transport: deliver a host→frame envelope to the frame. */
  send: (envelope: BridgeEnvelope) => void
}

/**
 * The host endpoint for one rendered instance (§6, "Instance" §2). Owns the
 * conversation with exactly one frame; `handleMessage` is wired to the
 * transport's receive, the `push*` helpers send host→frame updates.
 */
export function createFrameHost(
  ctx: { artifactId: string; instanceId: string },
  cb: FrameHostCallbacks,
) {
  const envelope = <P>(type: FrameMessageType, payload: P, requestId?: string): BridgeEnvelope<P> => ({
    ns: FRAME_PROTOCOL,
    type,
    artifactId: ctx.artifactId,
    instanceId: ctx.instanceId,
    ...(requestId ? { requestId } : {}),
    payload,
  })

  const sendInit = () =>
    cb.send(
      envelope('host.init', {
        theme: cb.getTheme(),
        state: cb.getState(),
        data: cb.getData?.(),
        registryVersion: cb.registryVersion,
      }),
    )

  async function handleMessage(data: unknown): Promise<void> {
    const check = validateInbound(data, ctx)
    if (!check.ok) {
      cb.onDrop?.(check.reason, data)
      return
    }
    const { type, payload, requestId } = check.envelope
    switch (type as FrameToHostType) {
      case 'frame.ready':
        cb.onReady?.()
        sendInit()
        return
      case 'frame.resize':
        cb.onResize?.((payload as { height: number }).height)
        return
      case 'frame.error':
        cb.onError?.(payload as FrameErrorPayload)
        return
      case 'frame.state.set':
        cb.setState((payload as { state: Record<string, unknown> }).state)
        return
      case 'frame.intent.submit':
      case 'frame.intent.action': {
        const ip = payload as FrameIntentPayload
        const intentClass = type === 'frame.intent.submit' ? 'submit' : 'action'
        const outcome = await cb.onIntent?.({ intentClass, intent: ip.intent, payload: ip.payload, state: ip.state })
        if (requestId) {
          const res = outcome ?? { ok: true }
          cb.send(envelope('host.intent.result', { requestId, ...res }, requestId))
        }
        return
      }
    }
  }

  return {
    /** Wire to transport receive. */
    handleMessage,
    /** Proactively (re)send host.init — usually triggered by frame.ready. */
    init: sendInit,
    pushTheme: (theme: FrameTheme) => cb.send(envelope('host.theme', { theme })),
    pushState: (state: Record<string, unknown>) => cb.send(envelope('host.state', { state })),
    pushData: (data: unknown) => cb.send(envelope('host.data', { data })),
  }
}

export type FrameHost = ReturnType<typeof createFrameHost>
