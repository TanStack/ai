import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createMCPEventSecret } from '../../src/events/secret'
import {
  signMCPEventPayload,
  verifyMCPEventSignature,
} from '../../src/events/signature'

// Official Standard Webhooks JS library test vector
// (standard-webhooks/libraries/javascript/src/webhook.test.ts, "sign function works").
const SPEC_SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const SPEC_ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek'
const SPEC_TS = 1614265330
const SPEC_BODY = '{"test": 2432232314}'
const SPEC_SIGNATURE = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE='

function nodeOracle(
  secret: string,
  messageId: string,
  timestamp: number,
  body: string,
) {
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const signed = `${messageId}.${timestamp}.${body}`
  return `v1,${createHmac('sha256', key).update(signed).digest('base64')}`
}

describe('signMCPEventPayload', () => {
  it('matches the Standard Webhooks test vector', async () => {
    const signature = await signMCPEventPayload({
      secret: SPEC_SECRET,
      messageId: SPEC_ID,
      timestamp: SPEC_TS,
      body: new TextEncoder().encode(SPEC_BODY),
    })
    expect(signature).toBe(SPEC_SIGNATURE)
  })

  it('matches a node:crypto createHmac oracle', async () => {
    const secret = createMCPEventSecret()
    const body = new TextEncoder().encode('{"ok":true}')
    const signature = await signMCPEventPayload({
      secret,
      messageId: 'msg_1',
      timestamp: 1_700_000_000,
      body,
    })
    expect(signature).toBe(
      nodeOracle(secret, 'msg_1', 1_700_000_000, '{"ok":true}'),
    )
  })
})

describe('verifyMCPEventSignature', () => {
  it('verifies when a good v1 entry sits after a bad one', async () => {
    const ok = await verifyMCPEventSignature({
      secret: SPEC_SECRET,
      messageId: SPEC_ID,
      timestamp: SPEC_TS,
      body: new TextEncoder().encode(SPEC_BODY),
      header: `v1,bad ${SPEC_SIGNATURE}`,
    })
    expect(ok).toBe(true)
  })

  it('ignores a v1a entry and a malformed garbage entry', async () => {
    const ok = await verifyMCPEventSignature({
      secret: SPEC_SECRET,
      messageId: SPEC_ID,
      timestamp: SPEC_TS,
      body: new TextEncoder().encode(SPEC_BODY),
      header: `v1a,abc garbage ${SPEC_SIGNATURE}`,
    })
    expect(ok).toBe(true)
  })

  it('rejects the wrong secret', async () => {
    const ok = await verifyMCPEventSignature({
      secret: createMCPEventSecret(),
      messageId: SPEC_ID,
      timestamp: SPEC_TS,
      body: new TextEncoder().encode(SPEC_BODY),
      header: SPEC_SIGNATURE,
    })
    expect(ok).toBe(false)
  })

  it('rejects when the body was re-serialized', async () => {
    const resent = JSON.stringify(JSON.parse(SPEC_BODY))
    const ok = await verifyMCPEventSignature({
      secret: SPEC_SECRET,
      messageId: SPEC_ID,
      timestamp: SPEC_TS,
      body: new TextEncoder().encode(resent),
      header: SPEC_SIGNATURE,
    })
    expect(ok).toBe(false)
  })

  it('verifies a multi-byte UTF-8 body over the raw bytes', async () => {
    const body = new TextEncoder().encode('"é🙂"')
    const secret = createMCPEventSecret()
    const signature = await signMCPEventPayload({
      secret,
      messageId: 'msg_utf8',
      timestamp: SPEC_TS,
      body,
    })
    const ok = await verifyMCPEventSignature({
      secret,
      messageId: 'msg_utf8',
      timestamp: SPEC_TS,
      body,
      header: signature,
    })
    expect(ok).toBe(true)
  })
})
