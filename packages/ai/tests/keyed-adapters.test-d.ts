import { chat } from '../src/activities/chat/index'
import { keyedAdapters } from '../src/byok'
import { keyedAdapterFromRequest } from '../src/byok/server'
import { fakeText } from '../src/testing'

const models = keyedAdapters({
  acme: (_key: string) => fakeText({ model: 'acme-model' }),
  other: (_key: string) => fakeText({ model: 'other-model' }),
})
const messages = [{ role: 'user' as const, content: 'hi' }]

// A keyed adapter is not an adapter until it has a key.
// @ts-expect-error -- call `create(key)` or `keyedAdapterFromRequest` first
chat({ adapter: models.acme, messages })

// One provider's adapter is fully typed.
chat({ adapter: models.acme.create('sk'), messages })

// The adapter picked from a request is accepted too.
const picked = keyedAdapterFromRequest(new Request('http://x'), models)
if (picked) chat({ adapter: picked, messages })
