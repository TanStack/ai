import { ChatClient } from '@tanstack/ai-client'
import { createChatDevtoolsBridge } from '@tanstack/ai-client/devtools'
import { DestroyRef, inject, signal } from '@angular/core'
import type { AnyClientTool, SchemaInput } from '@tanstack/ai'
import type { InferredClientContext } from '@tanstack/ai-client'
import type { InjectChatOptions, InjectChatResult } from './types'

let nextId = 0

export function injectChat<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
>(
  options: InjectChatOptions<TTools, TSchema, TContext> = {} as InjectChatOptions<
    TTools,
    TSchema,
    TContext
  >,
): InjectChatResult<TTools, TSchema> {
  const destroyRef = inject(DestroyRef)
  const clientId = options.id || `injectChat-${nextId++}`

  const messages = signal<Array<any>>(options.initialMessages || [])
  const isLoading = signal(false)
  const error = signal<Error | undefined>(undefined)
  const status = signal<any>('ready')
  const isSubscribed = signal(false)
  const connectionStatus = signal<any>('disconnected')
  const sessionGenerating = signal(false)

  const transport = options.connection
    ? { connection: options.connection }
    : { fetcher: options.fetcher }

  const client = new ChatClient<TTools, TContext>({
    devtoolsBridgeFactory: createChatDevtoolsBridge,
    ...(transport as any),
    id: clientId,
    ...(options.initialMessages !== undefined && {
      initialMessages: options.initialMessages,
    }),
    devtools: {
      ...options.devtools,
      framework: 'angular',
      hookName: 'injectChat',
      outputKind: options.outputSchema ? 'structured' : 'chat',
    },
    onMessagesChange: (m: Array<any>) => messages.set(m),
    onLoadingChange: (v: boolean) => isLoading.set(v),
    onStatusChange: (v: any) => status.set(v),
    onErrorChange: (v: Error | undefined) => error.set(v),
    onSubscriptionChange: (v: boolean) => isSubscribed.set(v),
    onConnectionStatusChange: (v: any) => connectionStatus.set(v),
    onSessionGeneratingChange: (v: boolean) => sessionGenerating.set(v),
  } as any)

  messages.set(client.getMessages() as Array<any>)

  destroyRef.onDestroy(() => {
    client.stop()
    client.dispose()
  })

  return {
    messages: messages.asReadonly(),
    isLoading: isLoading.asReadonly(),
    error: error.asReadonly(),
    status: status.asReadonly(),
    isSubscribed: isSubscribed.asReadonly(),
    connectionStatus: connectionStatus.asReadonly(),
    sessionGenerating: sessionGenerating.asReadonly(),
    sendMessage: (c: any) => client.sendMessage(c as any),
    append: (m: any) => client.append(m as any),
    reload: () => client.reload(),
    stop: () => client.stop(),
    clear: () => client.clear(),
    setMessages: (m: any) => client.setMessagesManually(m as any),
    addToolResult: (r: any) => client.addToolResult(r as any),
    addToolApprovalResponse: (r: any) => client.addToolApprovalResponse(r),
  } as unknown as InjectChatResult<TTools, TSchema>
}
