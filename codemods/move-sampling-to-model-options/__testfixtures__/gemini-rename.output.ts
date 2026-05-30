import { chat } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'

export function run(messages: Array<unknown>) {
  return chat({
    adapter: geminiText('gemini-1.5-pro'),
    messages,

    modelOptions: {
      topP: 0.9,
      maxOutputTokens: 512
    }
  });
}
