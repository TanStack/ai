---
title: "Quick Start: Angular"
id: quick-start-angular
order: 4
description: "Streaming chat in Angular with injectChat signals and an OpenAI backend."
keywords:
  - tanstack ai
  - angular
  - quick start
  - injectChat
  - streaming chat
  - openai
  - signals
---

If you need Angular chat → install packages, stream from a backend, call `injectChat` in an injection context.

Prefer one key for many models → [OpenRouter](../adapters/openrouter).

## 1. Install

```bash
npm install @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
# or
pnpm add @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
# or
yarn add @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
```

## 2. Server

Express example (Fastify, Hono, Nitro work if they return TanStack AI SSE):

```typescript ignore
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

## 3. Chat component

Call `injectChat` in a field initializer (or constructor) — not in `ngOnInit`.

```typescript group=quick-start-angular
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

## 4. API keys

`.env` or `.env.local` — server only:

```bash
# OpenRouter (recommended — access 300+ models with one key)
OPENROUTER_API_KEY=sk-or-...

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

## Angular notes (when you hit them)

**State is read-only signals** — call them as functions:

```typescript ignore
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

**Injection context only**

```typescript
import { injectChat } from '@tanstack/ai-angular'
import { fetchServerSentEvents } from '@tanstack/ai-client'

// Field initializer (recommended)
export class MyComponentA {
  chat = injectChat({ connection: fetchServerSentEvents('/api/chat') })
}

// Constructor
export class MyComponentB {
  chat: ReturnType<typeof injectChat>
  constructor() {
    this.chat = injectChat({ connection: fetchServerSentEvents('/api/chat') })
  }
}
```

Destroy stops in-flight requests (`DestroyRef`). Same API shape as React/Vue (`messages`, `sendMessage`, `isLoading`, `error`, `status`, `stop`, `reload`, `clear`) as signals.

## Next

- [Tools](../tools/tools)
- [Adapters](../adapters/openai)
- [React Quick Start](./quick-start)
