import { expectTypeOf } from 'vitest'
import { createMCPClient } from '../../src/client'
import type { ManagedMCPClient, MCPClient } from '../../src/client'
import type {
  MCPEventAdapter,
  MCPEventStore,
  MCPEvents,
  ServerDescriptor,
} from '../../src/types'

interface MyDescriptor extends ServerDescriptor {
  tools: {}
  resources: {}
  prompts: {}
  capabilities: {}
}

declare const transport: { type: 'http'; url: string }
declare const adapter: MCPEventAdapter
declare const store: MCPEventStore

const managed = await createMCPClient({
  transport,
  experimental_events: { adapter },
})
expectTypeOf(managed).toEqualTypeOf<ManagedMCPClient>()
expectTypeOf(managed.experimental_events.subscribe).toBeFunction()

const direct = await createMCPClient({
  transport,
  experimental_events: { store },
})
expectTypeOf(direct.experimental_events).toEqualTypeOf<MCPEvents>()

const discovery = await createMCPClient({ transport })
expectTypeOf(discovery.experimental_events).toEqualTypeOf<MCPEvents>()

const typed = await createMCPClient<MyDescriptor>({
  transport,
  experimental_events: { adapter },
})
expectTypeOf(typed).toEqualTypeOf<ManagedMCPClient<MyDescriptor>>()
expectTypeOf(typed).toMatchTypeOf<
  Omit<MCPClient<MyDescriptor>, 'experimental_events'>
>()

await createMCPClient({
  transport,
  experimental_events: {
    store,
    // @ts-expect-error store and adapter together
    adapter,
  },
})

await createMCPClient({
  transport,
  experimental_events: { store },
}).then((client) =>
  client.experimental_events.subscribe({
    name: 'incident.created',
    delivery: {
      // @ts-expect-error poll is not a client delivery mode
      mode: 'poll',
      url: 'https://hooks.example.test/mcp',
    },
  }),
)
