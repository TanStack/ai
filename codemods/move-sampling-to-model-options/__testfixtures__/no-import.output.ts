// Negative case: no `@tanstack/ai` import. A local `chat` helper that
// happens to share the name and use `temperature`/`maxTokens` must be
// left completely untouched.

function chat(opts: { temperature?: number; maxTokens?: number }) {
  return opts
}

export const result = chat({
  adapter: 'whatever',
  temperature: 0.3,
  maxTokens: 100,
})
