import { Component } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { fetchServerSentEvents, injectChat } from '@tanstack/ai-angular'
import { clientTools } from '@tanstack/ai-client'
import { getTimeTool } from './lib/chat-tools'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex h-screen flex-col bg-gray-900 text-white">
      <header class="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <h1 class="text-lg font-semibold">TanStack AI — Angular Chat</h1>
      </header>

      <div class="flex-1 overflow-y-auto p-4 space-y-3">
        @for (message of chat.messages(); track message.id) {
          <div
            class="rounded-lg px-3 py-2"
            [class]="message.role === 'user' ? 'bg-orange-600/30 ml-auto max-w-[80%]' : 'bg-gray-800 max-w-[80%]'"
          >
            @for (part of message.parts; track $index) {
              @if (part.type === 'text') {
                <span>{{ part.content }}</span>
              }
            }
          </div>
        }
        @if (chat.isLoading()) {
          <p class="text-sm text-gray-400">Thinking…</p>
        }
      </div>

      <form
        class="flex gap-2 border-t border-orange-500/20 bg-gray-800 p-3"
        (submit)="send($event)"
      >
        <input
          class="flex-1 rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          [(ngModel)]="draft"
          name="draft"
          [disabled]="chat.isLoading()"
          placeholder="Ask something…"
        />
        @if (chat.isLoading()) {
          <button type="button" class="rounded-lg bg-gray-700 px-4 py-2 text-sm" (click)="chat.stop()">Stop</button>
        } @else {
          <button type="submit" class="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium">Send</button>
        }
      </form>
    </div>
  `,
})
export class AppComponent {
  draft = ''
  chat = injectChat({
    connection: fetchServerSentEvents('/api/chat'),
    tools: clientTools(getTimeTool),
  })

  send(event: Event) {
    event.preventDefault()
    const text = this.draft.trim()
    if (!text) return
    this.draft = ''
    void this.chat.sendMessage(text)
  }
}
