---
title: "Quick Start: Angular"
id: quick-start-angular
order: 4
description: "Build a streaming TanStack AI chat component in an Angular app using the injectChat function and the OpenAI adapter."
keywords:
  - tanstack ai
  - angular
  - quick start
  - injectChat
  - streaming chat
  - openai
  - signals
---

You have an Angular app and want to add AI chat. By the end of this guide, you'll have a streaming chat component powered by TanStack AI and OpenAI.

> **Tip:** If you'd prefer not to sign up with individual AI providers, [OpenRouter](../adapters/openrouter) gives you access to 300+ models with a single API key and is the easiest way to get started.

## Installation

```bash
npm install @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
# or
yarn add @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
```

## Server Setup

Angular apps typically use a separate backend. Here's an Express server that streams chat responses:

```typescript
import express from 'express'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
    return
  }

  try {
    // `chat()` uses the AG-UI `threadId` for devtools correlation
    // when available — no need to plumb `conversationId` manually.
    const stream = chat({
      adapter: openaiText('gpt-5.5'),
      messages,
    })

    const response = toServerSentEventsResponse(stream)
    res.writeHead(response.status, Object.fromEntries(response.headers))

    const body = response.body
    if (body) {
      const reader = body.getReader()
      const pump = async () => {
        const { done, value } = await reader.read()
        if (done) {
          res.end()
          return
        }
        res.write(value)
        await pump()
      }
      await pump()
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'An error occurred',
    })
  }
})

app.listen(3000, () => console.log('Server running on port 3000'))
```

> **Tip:** Any backend that returns the TanStack AI SSE format works — you can use Fastify, Hono, Nitro, or any other Node.js framework.

## Client Setup

Create a standalone `ChatComponent` using the `injectChat` function:

```typescript
import { Component, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectChat } from '@tanstack/ai-angular'
import { fetchServerSentEvents } from '@tanstack/ai-client'

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="chat">
      <div class="messages">
        @for (message of chat.messages(); track message.id) {
          <div [class]="message.role">
            <strong>{{ message.role === 'assistant' ? 'Assistant' : 'You' }}</strong>
            @for (part of message.parts; track $index) {
              @if (part.type === 'text') {
                <p>{{ part.content }}</p>
              }
            }
          </div>
        }
      </div>

      <form (ngSubmit)="handleSubmit()">
        <input
          [(ngModel)]="input"
          name="input"
          placeholder="Type a message..."
          [disabled]="chat.isLoading()"
        />
        <button
          type="submit"
          [disabled]="!input().trim() || chat.isLoading()"
        >
          Send
        </button>
      </form>
    </div>
  `,
})
export class ChatComponent {
  // injectChat is called in a field initializer — this is a valid injection context.
  chat = injectChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  input = signal('')

  handleSubmit() {
    const text = this.input().trim()
    if (text && !this.chat.isLoading()) {
      this.chat.sendMessage(text)
      this.input.set('')
    }
  }
}
```

## Environment Variables

Create a `.env` file (or `.env.local` depending on your setup) with your API key:

```bash
# OpenRouter (recommended — access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

Your server reads this key at runtime. Never expose it to the browser.

## Angular-Specific Notes

**State is exposed as Angular `Signal`s.** The `injectChat` function returns state wrapped in read-only `Signal`s. Read them by calling them as functions:

```typescript
// In component class
if (this.chat.isLoading()) { /* ... */ }
const count = this.chat.messages().length

// In template — same syntax, no .value needed
```

```html
<!-- In template, call the signal as a function -->
@if (chat.isLoading()) {
  <p>Thinking...</p>
}
<span>{{ chat.messages().length }} messages</span>
```

**`injectChat` must be called in an injection context.** Angular's dependency injection requires that `inject()` is called during component construction. The recommended approach is a field initializer (shown above). You can also call it in the constructor or inside `runInInjectionContext`:

```typescript
// Field initializer (recommended)
export class MyComponent {
  chat = injectChat({ connection: fetchServerSentEvents('/api/chat') })
}

// Constructor
export class MyComponent {
  chat: ReturnType<typeof injectChat>
  constructor() {
    this.chat = injectChat({ connection: fetchServerSentEvents('/api/chat') })
  }
}
```

Calling `injectChat` outside an injection context — for example, in a lifecycle hook like `ngOnInit` — will throw a runtime error.

**Automatic cleanup.** The function subscribes to `DestroyRef` internally, so in-flight requests are stopped when the component is destroyed. No manual cleanup needed.

**Same API shape as React and Vue.** If you're coming from `@tanstack/ai-react` or `@tanstack/ai-vue`, `injectChat` returns the same properties (`messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `reload`, `clear`). The only difference is that each property is an Angular `Signal` rather than a React state value or a Vue `ShallowRef`.

## That's It!

You now have a working Angular chat application. The `injectChat` function handles:

- Message state management
- Streaming responses
- Loading states
- Error handling

## Next Steps

- Learn about [Tools](../tools/tools) to add function calling
- Check out the [Adapters](../adapters/openai) to connect to different providers
- See the [React Quick Start](./quick-start) if you're comparing frameworks
