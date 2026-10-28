---
title: Angular Chat UI
id: typed-headless-ui-angular
order: 8
description: "Render a streaming chat in Angular with your own standalone components. createChatHook types every tool, part, and interrupt, and chat state is signals."
keywords:
  - tanstack ai
  - createChatHook
  - angular
  - injectAppChat
  - headless ui
  - ToolProps
---

`createChatHook` from `@tanstack/ai-angular/ui` binds your chat options and components once. Tool calls and approvals stay typed.

Each screen then creates a chat with `injectAppChat()` and renders it with `<ai-chat [chat]="chat" />`.

- Widgets are standalone Angular components with signal inputs.
- Chat state is signals.
- The layout renders its slots with `NgComponentOutlet`.

You supply every visible component. There is no default markup or style.

## Quick setup

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put `OPENAI_API_KEY` in your server environment. Then add a `POST` route at `/api/chat`:

```ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
  })

  return toServerSentEventsResponse(stream)
}
```

3. Create `src/app/chat.ts`:

```ts
import { Component, input } from '@angular/core'
import type { Type } from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import { fetchServerSentEvents } from '@tanstack/ai-angular'
import {
  createChatHook,
  type MessageProps,
  type PartProps,
} from '@tanstack/ai-angular/ui'

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
}

@Component({
  selector: 'app-chat-layout',
  imports: [NgComponentOutlet],
  template: `
    <section>
      <ng-container [ngComponentOutlet]="Messages()" />
    </section>
  `,
})
class ChatLayout {
  Messages = input.required<Type<unknown>>()
  Interrupts = input.required<Type<unknown>>()
  Queue = input.required<Type<unknown>>()
  Input = input<Type<unknown>>()
}

@Component({
  selector: 'app-chat-message',
  imports: [NgComponentOutlet],
  template: `
    <article [attr.data-role]="message().role">
      <ng-container
        [ngComponentOutlet]="Parts()"
        [ngComponentOutletInputs]="{ message: message() }"
      />
    </article>
  `,
})
class ChatMessage {
  message = input.required<MessageProps<typeof chatOptions>['message']>()
  Parts = input.required<Type<unknown>>()
}

@Component({
  selector: 'app-text-part',
  template: `<p>{{ part().content }}</p>`,
})
class TextPartView {
  part = input.required<PartProps<typeof chatOptions, 'text'>['part']>()
}

@Component({
  selector: 'app-empty-part',
  template: ``,
})
class EmptyPart {
  part = input<unknown>()
}

const { injectAppChat, Chat } = createChatHook({
  options: chatOptions,
  components: { layout: ChatLayout, message: ChatMessage },
  partsComponents: { text: TextPartView, fallback: EmptyPart },
})

@Component({
  selector: 'app-chat',
  imports: [Chat],
  template: `
    <main>
      <ai-chat [chat]="chat" />
      <form (submit)="send($event, field)">
        <input #field name="message" />
        <button type="submit">Send</button>
      </form>
    </main>
  `,
})
export class ChatScreen {
  chat = injectAppChat({ threadId: 'support-chat' })

  send(event: Event, field: HTMLInputElement) {
    event.preventDefault()
    const text = field.value.trim()
    if (!text) return
    field.value = ''
    void this.chat.sendMessage(text)
  }
}
```

4. Render `<app-chat />` and send a message.

The reply streams into the page as the model writes it.

## How it works

- `createChatHook` runs once, at module scope. It binds `chatOptions` to your components. It returns `injectAppChat` and the `Chat` component (`<ai-chat>`).
- `injectAppChat({ threadId })` creates one chat instance. Call it in a field initializer or a constructor.
- The layout gets `Messages`, `Interrupts`, `Queue`, and `Input` as component inputs. `message` gets one message plus `Parts`.
- `partsComponents.text` renders text. `fallback` catches every part type that you did not register.

Declare every input that the factory passes to a widget, even when the template does not use it.

## Next steps

Each step adds one thing to the quick setup. The [chat UI recipes](./recipes/index) have the full file for each one. The recipes use React. In Angular, each widget is a component class with `input()`.

### Render a tool

Add the tool to `tools` in `chatOptions`. Then register a component under the tool name in `toolsComponents`. A tool component gets the `part`, `result`, and `interrupt` inputs:

```ts ignore
@Component({
  selector: 'app-weather-tool',
  template: `
    @if (part().state === 'complete') {
      <p>{{ part().input?.city }}: {{ part().output?.temperature }}</p>
    } @else {
      <p>Looking up weather</p>
    }
  `,
})
class WeatherTool {
  part = input.required<ToolProps<typeof chatOptions, 'getWeather'>['part']>()
  result = input<unknown>()
  interrupt = input<unknown>()
}

// In createChatHook:
toolsComponents: { getWeather: WeatherTool },
```

The factory needs one entry for every tool in `chatOptions`. Full example: [Make a tool look right](./recipes/format-a-tool).

### Ask before a tool runs

Set `needsApproval: true` on the tool. The tool component then gets an `interrupt` input:

```ts ignore
type DeleteFileProps = ToolProps<typeof chatOptions, 'deleteFile'>

@Component({
  selector: 'app-delete-file-tool',
  template: `
    @if (interrupt()?.status === 'pending') {
      <button (click)="interrupt()?.resolveInterrupt(true)">
        Delete {{ part().input?.path }}
      </button>
    } @else {
      <p>{{ part().input?.path }}</p>
    }
  `,
})
class DeleteFileTool {
  part = input.required<DeleteFileProps['part']>()
  result = input<DeleteFileProps['result']>()
  interrupt = input<DeleteFileProps['interrupt']>()
}
```

`resolveInterrupt(true)` approves. `resolveInterrupt(false)` denies. Full example: [Ask before a tool runs](./recipes/tool-approval).

### Ask the user your own question

Define the question with `defineInterrupt`. Add it to `interrupts` in `chatOptions`. Register a component under its id in `interruptsComponents.generic`, and render `Interrupts` in the layout:

```ts ignore
const choosePlan = defineInterrupt({
  id: 'choosePlan',
  payloadSchema: z.object({ title: z.string() }),
  responseSchema: z.string(),
})

@Component({
  selector: 'app-choose-plan',
  template: `
    <button (click)="interrupt().resolveInterrupt('pro')">
      {{ interrupt().payload?.title }}
    </button>
  `,
})
class ChoosePlan {
  interrupt =
    input.required<InterruptProps<typeof chatOptions, 'choosePlan'>['interrupt']>()
}

// In createChatHook:
interruptsComponents: { generic: { choosePlan: ChoosePlan } },
```

The factory needs one entry for every interrupt id in `chatOptions`. Full example: [Ask the user your own question](./recipes/custom-interrupt).

### Read chat state inside a widget

Mapped components do not get `chat` as an input. Call `injectChatContext()` in a field initializer of the widget. This also moves the composer into the layout: register it as `input`, then render `Input` in the layout.

Create the contexts first with `createChatHookContexts()`, and pass them under `context`:

```ts ignore
import { createChatHookContexts } from '@tanstack/ai-angular/ui'

const contexts = createChatHookContexts()

@Component({
  selector: 'app-chat-input',
  template: `
    <form (submit)="send($event, field)">
      <input #field name="message" [disabled]="chat.isLoading()" />
      <button type="submit">Send</button>
    </form>
  `,
})
class ChatInput {
  chat = contexts.injectChatContext()

  send(event: Event, field: HTMLInputElement) {
    event.preventDefault()
    const text = field.value.trim()
    if (!text) return
    field.value = ''
    void this.chat.sendMessage(text)
  }
}

// In createChatHook:
context: {
  chatRef: contexts.chatRef,
  part: contexts.part,
  interrupt: contexts.interrupt,
},
components: { input: ChatInput, layout: ChatLayout, message: ChatMessage },
```

In the layout template, render the input with `<ng-container [ngComponentOutlet]="Input()" />`. Then remove the form from `ChatScreen`.

Chat state is signals. Read it by calling it, such as `chat.messages()`.

### Render markdown

`@tanstack/ai-angular/ui` has no `TextPart` component. Render `part().content` in your own text part, with the markdown library of your choice.

### Type a widget in its own file

Type each signal input from the prop types: `ToolProps`, `PartProps`, `InterruptProps`, and `MessageProps`. Pass `typeof chatOptions` and a name, then index the prop that you need:

```ts ignore
part = input.required<ToolProps<typeof chatOptions, 'getWeather'>['part']>()
```

Put `chatOptions` in a shared module so every widget file can import its type.

You now have a typed chat UI in Angular. Each widget is your own component.

## Advanced

### Slots and props

The config keys, part keys, and prop types are the same as in React. See [Every widget slot](./react#every-widget-slot).

The factory passes these inputs to the chrome:

- `layout`: `Messages`, `Interrupts`, `Queue`, and `Input`. If you render `Input` with no registered `input`, it renders nothing and warns once in development.
- `message`: `message` and `Parts`. Pass `{ message: message() }` to `Parts`.

It passes these inputs to each widget:

- A part: `part`.
- A tool: `part`, `result`, and `interrupt`.
- An interrupt: `interrupt`.
- A queue item: `item`.

`injectAppChat()` takes per-instance options: `threadId` (required), `initialMessages`, `live`, and `forwardedProps`. The factory also returns `ChatProvider` and `injectChatContext`.

### Approvals and generic interrupts

- A tool approval renders in the tool when you read the `interrupt` input.
- To show it in the list instead, register a component under `interruptsComponents.tools` and render `Interrupts` in the layout.
- Generic interrupts always render in the list. `generic.fallback` renders an unregistered id and an unbound interrupt. If the copy must be different, branch on `interrupt().kind === 'unbound'`.

### Show queued messages

Register `queue` on `components`, then render `Queue` in the layout. A queue component gets one `item` input. Call `item().cancelQueued()` to drop it.
