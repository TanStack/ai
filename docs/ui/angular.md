---
title: Angular Chat UI
id: typed-headless-ui-angular
order: 8
description: "Build a typed, headless Angular chat UI with createChatHook. Widgets are standalone components. Chat state is signals."
keywords:
  - tanstack ai
  - createChatHook
  - angular
  - injectAppChat
  - headless ui
  - ToolProps
---

Install `@tanstack/ai-angular`. Import the UI factory from `@tanstack/ai-angular/ui`. Call `createChatHook({ options, ...components })` once at module scope.

This is not a React port. Widgets are standalone Angular components. Chat state from `injectAppChat()` is signals. Layout slots are component classes. Your layout template uses `NgComponentOutlet` to render `Messages`, `Interrupts`, `Queue`, and `Input`.

The factory returns `injectAppChat`, `injectChatContext`, and `Chat`. Call `injectAppChat()` in a component injection context. Bind the instance with `<ai-chat [chat]="chat" />`.

The factory needs a `toolsComponents` entry for every tool name in `chatOptions`. It also needs an `interruptsComponents.generic` entry for every interrupt id. `generic.fallback` is optional.

The server route matches the [React page](./react). The [chat UI recipes](./recipes/index) show the same option groups. The code there is React. On Angular, each widget is a component class with `input()`.

## Client

```ts
import { Component, input } from '@angular/core'
import { NgComponentOutlet } from '@angular/common'
import type { Type } from '@angular/core'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { createChatHook } from '@tanstack/ai-angular/ui'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Look up weather',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({ temperature: z.number() }),
}).client()

const chatOptions = {
  connection: fetchServerSentEvents('/api/chat'),
  tools: [getWeather],
}

@Component({
  selector: 'app-chat-layout',
  imports: [NgComponentOutlet],
  template: `
    <ng-container [ngComponentOutlet]="Messages()" />
    @if (Input(); as inputCmp) {
      <ng-container [ngComponentOutlet]="inputCmp" />
    }
  `,
})
export class ChatLayout {
  Messages = input.required<Type<unknown>>()
  Interrupts = input.required<Type<unknown>>()
  Queue = input.required<Type<unknown>>()
  Input = input<Type<unknown>>()
}

@Component({
  selector: 'app-chat-message',
  imports: [NgComponentOutlet],
  template: `
    <article>
      <ng-container
        [ngComponentOutlet]="Parts()"
        [ngComponentOutletInputs]="{ message: message() }"
      />
    </article>
  `,
})
export class ChatMessage {
  message = input.required<unknown>()
  Parts = input.required<Type<unknown>>()
}

@Component({
  selector: 'app-weather-tool',
  template: `<strong>{{ part().input?.city }}</strong>`,
})
export class WeatherTool {
  part = input.required<{ input?: { city?: string } }>()
  result = input<unknown>()
  interrupt = input<unknown>()
}

const { injectAppChat, Chat } = createChatHook({
  options: chatOptions,
  components: { layout: ChatLayout, message: ChatMessage },
  partsComponents: { fallback: ChatMessage },
  toolsComponents: { getWeather: WeatherTool },
})

@Component({
  selector: 'app-chat-screen',
  imports: [Chat],
  template: `<ai-chat [chat]="chat" />`,
})
export class ChatScreen {
  chat = injectAppChat()
}
```
