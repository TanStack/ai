# TanStack AI - Vue Start Chat Example

A Vue 3 chat application demonstrating the use of `@tanstack/ai-vue` with
file-based routing powered by `@tanstack/vue-start`.

## Setup

1. Copy `env.example` to `.env` and add your API keys:

```bash
cp env.example .env
```

2. Install dependencies:

```bash
pnpm install
```

3. Start the development server:

```bash
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features

- Real-time streaming chat with multiple AI providers
- Support for OpenAI, Anthropic, Gemini, and Ollama
- Client-side and server-side tools
- Tool approval workflow
- Guitar recommendation demo

## Project Structure

```
src/
├── routes/           # File-based routes (TanStack Router/Start)
│   ├── __root.tsx
│   ├── index.ts
│   ├── vue-ui.ts
│   ├── api.chat.ts   # Server route for chat
│   └── guitars/
│       ├── index.ts
│       └── $id.ts
├── router.ts         # TanStack Vue Router setup
├── routeTree.gen.ts  # Generated route tree
├── styles.css        # Global styles
├── components/       # UI components
│   ├── Header.vue
│   ├── ChatInput.vue
│   ├── Messages.vue
│   ├── ThinkingPart.vue
│   └── GuitarRecommendation.vue
├── lib/              # Utilities
│   ├── model-selection.ts
│   └── guitar-tools.ts
├── data/             # Example data
│   └── guitars.ts
└── views/            # Page components
    ├── ChatView.vue
    └── GuitarDetailView.vue
```

## Tech Stack

- Vue 3 with Composition API
- TypeScript
- Vite
- Tailwind CSS
- @tanstack/vue-start
- @tanstack/vue-router
- @tanstack/ai-vue
