import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { fetchServerSentEvents, injectChat, type UIMessage } from '@tanstack/ai-angular';

@Component({
  selector: 'app-root',
  imports: [CommonModule],
  templateUrl: './app.html',
})
export class App {
  // Minimal text-part shape for the template; other part types exist (tool calls, etc.).
  private static isTextPart(part: any): part is { type: 'text'; content: string } {
    return part?.type === 'text' && typeof part.content === 'string';
  }

  readonly chat = injectChat({
    // FastAPI example server: examples/python-fastapi/openai-server.py
    // Default: http://localhost:8001/chat
    connection: fetchServerSentEvents('http://localhost:8001/chat'),
  });

  readonly prompt = signal('');

  async send() {
    const content = this.prompt().trim();
    if (!content) return;

    this.prompt.set('');
    await this.chat.sendMessage(content);
  }

  textParts(message: UIMessage<any>): Array<{ type: 'text'; content: string }> {
    return (message.parts as Array<any>).filter(App.isTextPart);
  }
}
