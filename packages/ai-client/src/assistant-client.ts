import { ChatClient } from './chat-client.js'
import { GenerationClient } from './generation-client.js'
import type { AssistantDefinition } from '@tanstack/ai/assistant'
import type { AnyClientTool } from '@tanstack/ai/client'
import type {
  AssistantClientOptions,
  OneShotCapabilityName,
} from './assistant-types.js'

/**
 * Composes one `ChatClient` and/or one `GenerationClient` per one-shot
 * capability declared on an `AssistantDefinition`, sharing the single
 * `connection` adapter passed in `options`.
 *
 * No connection wrapping happens here: each sub-client tags its own
 * requests with the capability name — `ChatClient` via
 * `forwardedProps: { capability: 'chat' }`, `GenerationClient` via
 * `body: { capability: <name> }` — so a single server endpoint can route
 * on that field.
 */
export class AssistantClient<
  TDef extends AssistantDefinition<any> = AssistantDefinition<any>,
  TChatTools extends ReadonlyArray<AnyClientTool> = [],
> {
  /** The chat sub-client, present only if the definition declares `chat`. */
  chat?: ChatClient<TChatTools>
  private readonly oneShots = new Map<string, GenerationClient<any, any, any>>()
  readonly capabilities: ReadonlyArray<string>

  constructor(options: AssistantClientOptions<TDef, TChatTools>) {
    const { assistant, connection, id, threadId, chat, callbacks } = options
    this.capabilities = assistant.capabilities

    for (const capability of assistant.capabilities) {
      if (capability === 'chat') {
        this.chat = new ChatClient<TChatTools>({
          connection,
          id: id ? `${id}:chat` : undefined,
          threadId,
          tools: chat?.tools,
          forwardedProps: { ...chat?.forwardedProps, capability: 'chat' },
          ...callbacks?.chat,
        })
        continue
      }

      const oneShotCapability = capability as OneShotCapabilityName
      this.oneShots.set(
        oneShotCapability,
        new GenerationClient({
          connection,
          id: id ? `${id}:${oneShotCapability}` : undefined,
          body: { capability: oneShotCapability },
          ...callbacks?.oneShot?.(oneShotCapability),
        }),
      )
    }
  }

  /** Whether the assistant declares the given capability. */
  has(capability: string): boolean {
    return this.capabilities.includes(capability)
  }

  /** The one-shot `GenerationClient` for a declared capability, if any. */
  get(
    capability: OneShotCapabilityName,
  ): GenerationClient<any, any, any> | undefined {
    return this.oneShots.get(capability)
  }

  /** Tears down the chat client and every one-shot client. */
  dispose(): void {
    this.chat?.dispose()
    for (const oneShot of this.oneShots.values()) {
      oneShot.dispose()
    }
  }
}
