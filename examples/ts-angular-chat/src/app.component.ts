import { Component, ElementRef, effect, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { fetchServerSentEvents, injectChat } from '@tanstack/ai-angular'
import { clientTools } from '@tanstack/ai-client'
import { chatTools } from './lib/chat-tools'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand__mark">TanStack <em>AI</em></span>
          <span class="brand__tag">Angular Chat</span>
        </div>
        <span class="status-pill">
          <span class="status-dot"></span>
          gpt-5.5 · streaming
        </span>
      </header>

      <main class="convo" #scroller>
        <div class="convo__inner">
          @if (chat.messages().length === 0) {
            <section class="hero">
              <p class="hero__eyebrow">Powered by signals · 5 client tools</p>
              <h2 class="hero__title">What can I help you <em>ship</em>?</h2>
              <p class="hero__sub">
                A streaming chat built with injectChat and the OpenAI adapter.
                The model can call browser-side tools — try one below.
              </p>
              <div class="chips">
                @for (s of suggestions; track s) {
                  <button class="chip" type="button" (click)="pick(s)">
                    {{ s }}
                  </button>
                }
              </div>
            </section>
          }

          @for (message of chat.messages(); track message.id) {
            @if (isRenderable(message)) {
              <div
                class="msg"
                [class]="
                  message.role === 'user' ? 'msg--user' : 'msg--assistant'
                "
              >
                @if (message.role !== 'user') {
                  <span class="avatar">AI</span>
                }
                <div class="msg__stack">
                  @for (part of message.parts; track $index) {
                    @if (part.type === 'text' && part.content) {
                      <div class="bubble">{{ part.content }}</div>
                    } @else if (part.type === 'tool-call') {
                      <div
                        class="tool"
                        [class.tool--running]="
                          part.state !== 'complete' && part.state !== 'error'
                        "
                      >
                        <span class="tool__glyph">⚙</span>
                        <span class="tool__name">{{ part.name }}</span>
                        @if (formatArgs(part.arguments)) {
                          <code class="tool__chip">{{
                            formatArgs(part.arguments)
                          }}</code>
                        }
                        @if (hasOutput(part.output)) {
                          <span class="tool__arrow">→</span>
                          <code class="tool__chip tool__chip--out">{{
                            formatOutput(part.output)
                          }}</code>
                        }
                      </div>
                    }
                  }
                </div>
              </div>
            }
          }

          @if (chat.isLoading()) {
            <div class="thinking">
              <span class="avatar">AI</span>
              <span class="thinking__dots"><i></i><i></i><i></i></span>
              <span class="thinking__label">Thinking</span>
            </div>
          }
        </div>
      </main>

      <footer class="composer">
        <form class="composer__inner" (submit)="send($event)">
          <div class="composer__bar">
            <input
              class="composer__input"
              [(ngModel)]="draft"
              name="draft"
              [disabled]="chat.isLoading()"
              placeholder="Ask something, or try a tool…"
              autocomplete="off"
            />
            @if (chat.isLoading()) {
              <button
                type="button"
                class="stop-btn"
                aria-label="Stop"
                (click)="chat.stop()"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  aria-hidden="true"
                >
                  <rect width="14" height="14" rx="3" fill="currentColor" />
                </svg>
              </button>
            } @else {
              <button
                type="submit"
                class="send-btn"
                aria-label="Send"
                [disabled]="draft.trim().length === 0"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M12 19V5M12 5l-6 6M12 5l6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            }
          </div>
          <p class="composer__hint">
            TanStack AI · Angular · responses are generated and may be
            inaccurate
          </p>
        </form>
      </footer>
    </div>
  `,
})
export class AppComponent {
  draft = ''
  scroller = viewChild<ElementRef<HTMLElement>>('scroller')

  suggestions = [
    'What time is it right now?',
    'Roll two dice',
    "What's the weather in Tokyo?",
    'What is 42 × 7?',
  ]

  chat = injectChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: clientTools(...chatTools),
  })

  constructor() {
    // Auto-scroll to the latest message as the conversation streams in.
    effect(() => {
      this.chat.messages()
      this.chat.isLoading()
      const el = this.scroller()?.nativeElement
      if (el) {
        queueMicrotask(() => {
          el.scrollTop = el.scrollHeight
        })
      }
    })
  }

  /** A message is worth rendering if it has visible text or a tool call. */
  isRenderable(message: {
    parts: ReadonlyArray<{ type: string; content?: unknown }>
  }): boolean {
    return message.parts.some(
      (part) =>
        (part.type === 'text' && !!part.content) || part.type === 'tool-call',
    )
  }

  /** Compact, readable tool arguments — hides empty `{}`. */
  formatArgs(args: string): string {
    try {
      const parsed: unknown = JSON.parse(args)
      const compact = JSON.stringify(parsed)
      return compact === '{}' ? '' : compact
    } catch {
      return ''
    }
  }

  hasOutput(output: unknown): boolean {
    return output !== undefined && output !== null && output !== ''
  }

  /** Render a tool's output as a compact string. */
  formatOutput(output: unknown): string {
    if (typeof output === 'string') return output
    try {
      return JSON.stringify(output)
    } catch {
      return String(output)
    }
  }

  pick(text: string) {
    this.draft = text
    this.send()
  }

  send(event?: Event) {
    event?.preventDefault()
    const text = this.draft.trim()
    if (!text) return
    this.draft = ''
    void this.chat.sendMessage(text)
  }
}
