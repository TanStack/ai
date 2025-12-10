# ts-svelte-chat

A SvelteKit chat application powered by TanStack AI.

## Features

- 🎯 Multiple AI providers (OpenAI, Anthropic, Gemini, Ollama)
- 🛠️ Tool execution (client-side and server-side)
- ✅ Tool approval workflow
- 🎸 Guitar recommendation example
- 💭 Thinking process visualization
- 🎨 Modern UI with Tailwind CSS

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

If `.env` doesn't exist, copy from the example:

```bash
cp env.example .env
```

Then edit `.env` and add your API keys:

```bash
OPENAI_API_KEY=sk-your-actual-key-here
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
GEMINI_API_KEY=your-actual-key-here
```

**Important Notes:**

- The `.env` file must be in the project root (`examples/ts-svelte-chat/.env`)
- You must **restart the dev server** after creating or modifying `.env`
- Environment variables in SvelteKit are loaded at server startup
- These are server-side only variables (not exposed to the browser)

3. Start (or restart) the development server:

```bash
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Architecture

This example demonstrates:

- **@tanstack/ai-svelte**: Svelte 5 hooks for chat functionality
- **SvelteKit**: Full-stack framework with API routes
- **Streaming**: Real-time response streaming
- **Tools**: Both client-side and server-side tool execution
- **Approvals**: Tool approval workflow

## License

MIT
