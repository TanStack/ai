import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { createApprovalStore } from '../src/approval'
import { createConfirmTool, guardTools } from '../src/guard'
import type { ApprovalRequired } from '../src/approval'
import type { AuditEntry, AuditLog } from '../src/audit'
import type { SecureRequestContext } from '../src/guard'
import type {
  AccessPolicy,
  ClientRecord,
  SecurityEvent,
  SecurityNotifier,
} from '../src/types'

function capturingNotifier(): SecurityNotifier & { events: Array<SecurityEvent> } {
  const events: Array<SecurityEvent> = []
  return { events, notify: async (event) => void events.push(event) }
}

function capturingAudit(): AuditLog & { entries: Array<AuditEntry> } {
  const entries: Array<AuditEntry> = []
  return { entries, record: async (entry) => void entries.push(entry) }
}

const noopEgress = async () => new Response()

function contextFor(client: ClientRecord) {
  return { context: { secure: { client }, egress: noopEgress } } satisfies {
    context: SecureRequestContext
  }
}

const setLights = toolDefinition({
  name: 'setLights',
  description: 'Set a room light',
  inputSchema: z.object({ room: z.string(), on: z.boolean() }),
}).server(async ({ room, on }) => ({ room, on }))

const buyMovie = toolDefinition({
  name: 'buyMovie',
  description: 'Buy a movie',
  inputSchema: z.object({ movieId: z.string() }),
}).server(async ({ movieId }) => ({ bought: movieId }))

function setup(policy: AccessPolicy) {
  const notify = capturingNotifier()
  const audit = capturingAudit()
  const approvals = createApprovalStore({ newId: () => 'prop-1' })
  const [guardedLights, guardedMovie] = guardTools([setLights, buyMovie], {
    policy,
    approvals,
    audit,
    notify,
    summarize: (name, args) => `${name}:${JSON.stringify(args)}`,
  })
  return { notify, audit, approvals, guardedLights, guardedMovie }
}

const control: ClientRecord = {
  id: 'alice',
  tokenHash: 'x',
  scopes: ['control'],
}

describe('guardTools — scopes', () => {
  it('runs the tool when the client holds the scope', async () => {
    const { guardedLights, audit } = setup({ scopes: { setLights: 'control' } })
    const result = await guardedLights!.execute!(
      { room: 'den', on: true },
      contextFor(control),
    )
    expect(result).toEqual({ room: 'den', on: true })
    expect(audit.entries.at(-1)).toMatchObject({ outcome: 'ok', tool: 'setLights' })
  })

  it('refuses and notifies when the client lacks the scope', async () => {
    const { guardedLights, notify, audit } = setup({
      scopes: { setLights: 'control' },
    })
    const reader: ClientRecord = { id: 'bob', tokenHash: 'y', scopes: ['read'] }
    await expect(
      guardedLights!.execute!({ room: 'den', on: true }, contextFor(reader)),
    ).rejects.toMatchObject({ code: 'forbidden_scope' })
    expect(notify.events).toContainEqual({
      kind: 'forbidden_scope',
      client: 'bob',
      tool: 'setLights',
    })
    expect(audit.entries.at(-1)).toMatchObject({ outcome: 'denied' })
  })
})

describe('guardTools — target allowlist', () => {
  it('refuses a target not in the client allowlist', async () => {
    const { guardedLights } = setup({ targetParam: { setLights: 'room' } })
    const scoped: ClientRecord = {
      id: 'kid',
      tokenHash: 'z',
      scopes: [],
      targets: ['living-room'],
    }
    await expect(
      guardedLights!.execute!({ room: 'bedroom', on: true }, contextFor(scoped)),
    ).rejects.toMatchObject({ code: 'forbidden_scope' })
    // An allowed target runs.
    await expect(
      guardedLights!.execute!(
        { room: 'living-room', on: true },
        contextFor(scoped),
      ),
    ).resolves.toEqual({ room: 'living-room', on: true })
  })
})

describe('guardTools — two-phase approval', () => {
  it('returns a proposal instead of acting, then confirms', async () => {
    const { guardedMovie, approvals, notify, audit } = setup({
      approve: ['buyMovie'],
    })
    const envelope = (await guardedMovie!.execute!(
      { movieId: 'tt1' },
      contextFor(control),
    )) as ApprovalRequired
    expect(envelope).toMatchObject({
      status: 'approval_required',
      proposalId: 'prop-1',
    })
    expect(notify.events).toContainEqual({
      kind: 'approval_pending',
      proposalId: 'prop-1',
      summary: 'buyMovie:{"movieId":"tt1"}',
    })

    const confirm = createConfirmTool({ approvals, audit })
    const confirmed = await confirm.execute!(
      { proposalId: 'prop-1' },
      contextFor(control),
    )
    expect(confirmed).toEqual({ confirmed: true, result: { bought: 'tt1' } })
  })

  it('refuses an unauthenticated call', async () => {
    const { guardedLights } = setup({})
    await expect(
      guardedLights!.execute!({ room: 'den', on: true }, undefined),
    ).rejects.toMatchObject({ code: 'auth_failure' })
  })
})
