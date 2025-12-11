# TanStack AI - Vue Chat Example

A Vue 3 chat application demonstrating the use of `@tanstack/ai-vue`.

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

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Features

- Real-time streaming chat with multiple AI providers
- Support for OpenAI, Anthropic, Gemini, and Ollama
- Client-side and server-side tools
- Tool approval workflow
- Guitar recommendation demo

## Project Structure

```
src/
├── main.ts           # App entry point
├── App.vue           # Root component
├── router.ts         # Vue Router setup
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
- @tanstack/ai-vue
