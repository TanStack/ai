import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import type { Type } from '@angular/core'
import {
  automaticPartsForMessage,
  collectInlineToolNames,
  resolveInterruptComponent,
  selectChatUI,
  selectMessageUI,
} from '@tanstack/ai-client/ui'
import type {
  ChatUIHasNamedInterrupts,
  ChatUIHasNamedTools,
  ChatUIInterrupt,
  ChatUIInterruptName,
  ChatUIInterruptOf,
  ChatUIInterruptsOf,
  ChatUIMessages,
  ChatUINamedInterruptId,
  ChatUIPartKey,
  ChatUIPartOf,
  ChatUISchemaOf,
  ChatUISelectedPart,
  ChatUIToolApproval,
  ChatUIToolName,
  ChatUIToolsOf,
} from '@tanstack/ai-client/ui'
import type {
  QueuedMessage,
  ToolCallPart,
  ToolResultPart,
} from '@tanstack/ai-client'
import type { InferredClientContext } from '@tanstack/ai-client'
import type { InjectChatResult } from '../types'
import { ChatHostRef, defaultChatUITokens } from './tokens'
import type { ChatUITokens } from './tokens'

export type ChatUIHost<TOptions = unknown> = InjectChatResult<
  ChatUIToolsOf<TOptions>,
  ChatUISchemaOf<TOptions>,
  ChatUIInterruptsOf<TOptions>
>

export type ChatUIQueueItem = QueuedMessage & {
  cancelQueued: () => void
}

export type LayoutProps<
  TOptions,
  TInput extends Type<unknown> | undefined = Type<unknown>,
> = {
  Messages: Type<unknown>
  Interrupts: Type<unknown>
  Queue: Type<unknown>
  readonly __ui?: TOptions
} & (TInput extends Type<unknown> ? { Input: Type<unknown> } : {})

export type MessageProps<TOptions> = {
  message: ChatUIMessages<TOptions>[number]
  Parts: Type<unknown>
}

export type InputProps<TOptions> = {
  readonly __ui?: TOptions
}

export type QueueProps<TOptions> = {
  item: ChatUIQueueItem
  readonly __ui?: TOptions
}

export type PartProps<TOptions, TKey extends ChatUIPartKey = ChatUIPartKey> = {
  part: ChatUIPartOf<TOptions, TKey>
}

export type ToolProps<
  TOptions,
  TName extends ChatUIToolName<TOptions> = ChatUIToolName<TOptions>,
> = {
  part: Extract<ToolCallPart<ChatUIToolsOf<TOptions>>, { name: TName }>
  result?: ToolResultPart
  interrupt?: ChatUIToolApproval<TOptions, TName>
}

export type InterruptProps<
  TOptions,
  TName extends ChatUIInterruptName<TOptions> = never,
> = {
  interrupt: ChatUIInterruptOf<TOptions, TName>
  readonly __ui?: TOptions
}

type GenericInterruptComponents<TOptions> =
  ChatUIHasNamedInterrupts<TOptions> extends true
    ? {
        [K in ChatUINamedInterruptId<TOptions>]: Type<unknown>
      } & {
        fallback?: Type<unknown>
      }
    : {
        fallback?: Type<unknown>
      }

type ToolApprovalMap<TOptions> = {
  [K in ChatUIToolName<TOptions>]?: Type<unknown>
}

export type ChatUIChromeComponents<
  TOptions,
  TInput extends Type<unknown> | undefined = Type<unknown>,
> = {
  layout: Type<unknown>
  message: Type<unknown>
  input?: TInput
  queue?: Type<unknown>
  readonly __ui?: TOptions
}

export type ChatUIPartsComponents<TOptions> = {
  [K in ChatUIPartKey]?: Type<unknown>
} & {
  fallback?: Type<unknown>
  readonly __ui?: TOptions
}

export type ChatUIInterruptsComponents<TOptions> = {
  tools?: ToolApprovalMap<TOptions>
  generic: GenericInterruptComponents<TOptions>
}

export type ChatUIComponents<
  TOptions,
  TInput extends Type<unknown> | undefined = Type<unknown>,
> = {
  components: ChatUIChromeComponents<TOptions, TInput>
  partsComponents: ChatUIPartsComponents<TOptions>
} & (ChatUIHasNamedTools<TOptions> extends true
  ? {
      toolsComponents: {
        [K in ChatUIToolName<TOptions>]: Type<unknown>
      }
    }
  : {
      toolsComponents?: {
        [K in ChatUIToolName<TOptions>]?: Type<unknown>
      }
    }) &
  (ChatUIHasNamedInterrupts<TOptions> extends true
    ? { interruptsComponents: ChatUIInterruptsComponents<TOptions> }
    : {
        interruptsComponents?: {
          tools?: ToolApprovalMap<TOptions>
          generic?: GenericInterruptComponents<TOptions>
        }
      })

export type ChatUIContextConfig = {
  chatRef?: ChatUITokens['chatRef']
  part?: ChatUITokens['part']
  interrupt?: ChatUITokens['interrupt']
}

export type ChatUIFactoryConfig<
  TOptions,
  TInput extends Type<unknown> | undefined = Type<unknown>,
> = ChatUIComponents<TOptions, TInput> & {
  context?: ChatUIContextConfig
}

function createWarnOnce() {
  const seen = new Set<string>()
  return (key: string, message: string) => {
    if (process.env.NODE_ENV === 'production') return
    if (seen.has(key)) return
    seen.add(key)
    console.warn(message)
  }
}

/**
 * Bind chat options and Angular widgets once at module scope.
 *
 * Layout, message, input, queue, parts, tools, and interrupts are
 * standalone component classes. The factory builds `Chat`, `Messages`,
 * `Interrupts`, and `Queue` as Angular components that inject the active
 * chat through DI.
 */
export function createChatUI<
  const TOptions,
  TInput extends Type<unknown> | undefined = Type<unknown> | undefined,
>(options: TOptions, config: ChatUIFactoryConfig<NoInfer<TOptions>, TInput>) {
  void options
  const {
    context: contextOption,
    components,
    partsComponents: parts,
    toolsComponents: tools,
    interruptsComponents: interrupts,
  } = config as ChatUIFactoryConfig<TOptions, TInput> & {
    toolsComponents?: Record<string, Type<unknown> | undefined>
    interruptsComponents?: {
      tools?: Record<string, Type<unknown> | undefined>
      generic?: Record<string, Type<unknown> | undefined>
    }
  }
  const {
    layout: Layout,
    message: MessageComponent,
    input: InputComponent,
    queue: QueueItemComponent,
  } = components
  const warn = createWarnOnce()
  const tokens = {
    chatRef: contextOption?.chatRef ?? defaultChatUITokens.chatRef,
    part: contextOption?.part ?? defaultChatUITokens.part,
    interrupt: contextOption?.interrupt ?? defaultChatUITokens.interrupt,
  }
  const inlineToolNames = collectInlineToolNames(
    interrupts?.tools as Record<string, unknown> | undefined,
    Object.keys(tools ?? {}),
  )

  function injectChatContext() {
    const ref = inject(tokens.chatRef)
    const chat = ref.host()
    if (!chat) {
      throw new Error(
        '`injectChatContext` must be used within `Chat` or `ChatProvider`.',
      )
    }
    return chat as ChatUIHost<TOptions>
  }

  @Component({
    selector: 'ai-chat-missing-input',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '',
  })
  class MissingInput {
    constructor() {
      warn(
        'input',
        '[tanstack-ai-ui] Rendered Input but no `input` component is registered.',
      )
    }
  }

  @Component({
    selector: 'ai-chat-queue',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    template: `
      @if (itemComponent) {
        @for (row of rows(); track row.item.id) {
          <ng-container
            [ngComponentOutlet]="itemComponent"
            [ngComponentOutletInputs]="{ item: row.item }"
          />
        }
      }
    `,
  })
  class Queue {
    readonly ref = inject(tokens.chatRef)
    readonly itemComponent = QueueItemComponent
    readonly rows = computed(() => {
      const chat = this.ref.host()
      if (!chat || !QueueItemComponent) return []
      const items = chat.queue()
      return items.map((item) => ({
        item: {
          ...item,
          cancelQueued: () => {
            chat.cancelQueued(item.id)
          },
        },
      }))
    })
  }

  @Component({
    selector: 'ai-chat-parts',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    template: `
      @for (selected of selectedParts(); track $index) {
        <ng-container
          [ngComponentOutlet]="outletFor(selected)"
          [ngComponentOutletInputs]="inputsFor(selected)"
          [ngComponentOutletInjector]="injectorFor(selected)"
        />
      }
    `,
  })
  class Parts {
    readonly injector = inject(Injector)
    readonly ref = inject(tokens.chatRef)
    message = input.required<ChatUIMessages<TOptions>[number]>()

    readonly selectedParts = computed(() => {
      const chat = this.ref.host()
      return automaticPartsForMessage(
        selectMessageUI(this.message(), {
          interrupts: (chat?.interrupts() ??
            []) as ReadonlyArray<ChatUIInterrupt>,
          inlineToolNames,
        }),
      )
    })

    outletFor(selected: ChatUISelectedPart) {
      if (selected.key === 'toolCall') {
        const name = selected.part.name
        const Tool = tools?.[name as ChatUIToolName<TOptions>]
        if (!Tool) {
          warn(
            `tool:${name}`,
            `[tanstack-ai-ui] Missing tools.${name} component`,
          )
          return null
        }
        return Tool
      }
      const PartComponent = (parts[selected.key] ?? parts.fallback) as
        | Type<unknown>
        | undefined
      if (!PartComponent) {
        warn(
          `part:${selected.key}`,
          `[tanstack-ai-ui] Missing parts.${selected.key} component`,
        )
        return null
      }
      return PartComponent
    }

    inputsFor(selected: ChatUISelectedPart) {
      if (selected.key === 'toolCall') {
        return {
          part: selected.part,
          result: selected.result,
          interrupt: selected.interrupt,
        }
      }
      return { part: selected.part }
    }

    injectorFor(selected: ChatUISelectedPart) {
      return Injector.create({
        parent: this.injector,
        providers: [{ provide: tokens.part, useValue: selected }],
      })
    }
  }

  @Component({
    selector: 'ai-chat-messages',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    template: `
      @for (message of messages(); track message.id) {
        <ng-container
          [ngComponentOutlet]="messageComponent"
          [ngComponentOutletInputs]="{
            message,
            Parts,
          }"
        />
      }
    `,
  })
  class Messages {
    readonly ref = inject(tokens.chatRef)
    readonly messageComponent = MessageComponent
    readonly Parts = Parts
    readonly messages = computed(() => {
      const chat = this.ref.host()
      return (chat?.messages() ?? []) as ChatUIMessages<TOptions>
    })
  }

  @Component({
    selector: 'ai-chat-interrupts',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    template: `
      @for (interrupt of interrupts(); track interrupt.id) {
        <ng-container
          [ngComponentOutlet]="outletFor(interrupt)"
          [ngComponentOutletInputs]="{ interrupt }"
          [ngComponentOutletInjector]="injectorFor(interrupt)"
        />
      }
    `,
  })
  class Interrupts {
    readonly injector = inject(Injector)
    readonly ref = inject(tokens.chatRef)
    readonly interrupts = computed(() => {
      const chat = this.ref.host()
      const selected = selectChatUI({
        messages: (chat?.messages() ?? []) as ChatUIMessages<TOptions>,
        interrupts: (chat?.interrupts() ?? []) as ReadonlyArray<ChatUIInterrupt>,
        inlineToolNames,
      })
      return selected.interrupts
    })

    outletFor(interrupt: ChatUIInterrupt) {
      const Component = resolveInterruptComponent(interrupt, interrupts) as
        | Type<unknown>
        | undefined
      if (!Component) {
        warn(
          `interrupt:${interrupt.id}`,
          `[tanstack-ai-ui] Missing interrupt component for ${interrupt.kind}`,
        )
        return null
      }
      return Component
    }

    injectorFor(interrupt: ChatUIInterrupt) {
      return Injector.create({
        parent: this.injector,
        providers: [{ provide: tokens.interrupt, useValue: interrupt }],
      })
    }
  }

  const layoutInputs = {
    Messages,
    Interrupts,
    Queue,
    Input: (InputComponent ?? MissingInput) as Type<unknown>,
  }

  @Component({
    selector: 'ai-chat',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgComponentOutlet],
    providers: [{ provide: tokens.chatRef, useClass: ChatHostRef }],
    template: `
      <ng-container
        [ngComponentOutlet]="layout"
        [ngComponentOutletInputs]="layoutInputs"
      />
    `,
  })
  class Chat {
    chat = input.required<ChatUIHost<TOptions>>()
    readonly layout = Layout
    readonly layoutInputs = layoutInputs
    readonly ref = inject(tokens.chatRef)

    constructor() {
      effect(() => {
        const next = this.chat()
        untracked(() => this.ref.host.set(next as InjectChatResult))
      })
    }
  }

  @Component({
    selector: 'ai-chat-provider',
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [{ provide: tokens.chatRef, useClass: ChatHostRef }],
    template: `<ng-content />`,
  })
  class ChatProvider {
    chat = input.required<ChatUIHost<TOptions>>()
    readonly ref = inject(tokens.chatRef)

    constructor() {
      effect(() => {
        const next = this.chat()
        untracked(() => this.ref.host.set(next as InjectChatResult))
      })
    }
  }

  return {
    Chat,
    ChatProvider,
    Messages,
    Interrupts,
    Queue,
    Parts,
    injectChatContext,
    Input: InputComponent,
  } as ChatUIKit<TOptions, TInput>
}

export type ChatUIKit<
  TOptions,
  TInput extends Type<unknown> | undefined = Type<unknown>,
> = {
  Chat: Type<unknown>
  ChatProvider: Type<unknown>
  Messages: Type<unknown>
  Interrupts: Type<unknown>
  Queue: Type<unknown>
  Parts: Type<unknown>
  injectChatContext: () => ChatUIHost<TOptions>
  Input: TInput
}

export type { InferredClientContext }
