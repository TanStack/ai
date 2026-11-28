/**
 * A2UI action -> OGUI intent classification — addendum §A4.
 *
 * §8 keeps the approval model with the host; this helper only *suggests* a
 * class. A2UI events default to Submit. Names matching world-changing verbs
 * are suggested as Action so hosts route them through approval. The
 * suggestion never downgrades: a host may treat anything as Action. Local
 * never applies — an A2UI event always leaves the renderer.
 */

import type { A2uiAction } from './a2ui'
import type { IntentClass, IntentPayload } from '../types'

const ACTION_VERBS = [
  'book',
  'purchase',
  'buy',
  'pay',
  'charge',
  'approve',
  'delete',
  'remove',
  'send',
  'apply',
  'submit_order',
  'confirm_booking',
  'cancel',
  'refund',
  'transfer',
  'deploy',
]

export function classifyA2uiAction(name: string): IntentClass {
  const normalised = name.toLowerCase()
  return ACTION_VERBS.some((verb) => normalised.includes(verb))
    ? 'action'
    : 'submit'
}

/**
 * Build a host IntentPayload from an A2UI action, with the suggested class
 * already applied as `intentClass`. The host remains free to override it.
 */
export function a2uiActionToIntent(args: {
  graphId: string
  nodeId: string
  action: A2uiAction
  state?: Record<string, unknown>
}): IntentPayload {
  const { graphId, nodeId, action, state } = args
  return {
    graphId,
    nodeId,
    intent: action.event.name,
    intentClass: classifyA2uiAction(action.event.name),
    ...(action.event.context ? { payload: action.event.context } : {}),
    state: state ?? {},
  }
}
