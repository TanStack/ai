# TanStack AI + CopilotKit — AG-UI Integration Example

This example demonstrates how **TanStack AI** and **CopilotKit** work together through the open [AG-UI protocol](https://docs.ag-ui.com) standard for agent-user interaction.

## What is AG-UI?

AG-UI (Agent-User Interaction) is an open protocol that standardizes how AI agents communicate with user interfaces. Both TanStack AI and CopilotKit are AG-UI compliant, meaning they can interoperate seamlessly.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Client                        │
│                                                  │
│  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  TanStack AI     │  │  CopilotKit          │  │
│  │  useChat() hook  │  │  <CopilotChat />     │  │
│  └────────┬─────────┘  └──────────┬───────────┘  │
│           │                       │              │
│           │    AG-UI Protocol     │              │
│           │   (SSE / Events)      │              │
│           └───────────┬───────────┘              │
└───────────────────────┼──────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────┐
│                    Server                         │
│                                                   │
│  ┌─────────────────────────────────────────────┐  │
│  │           TanStack AI Server                │  │
│  │                                             │  │
│  │   chat() → AG-UI Events → SSE Response      │  │
│  │                                             │  │
│  │   Adapters: OpenAI, Anthropic, Gemini, etc. │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

## What This Example Shows

1. **TanStack AI Server**: The `/api/chat` endpoint uses TanStack AI's `chat()` function with OpenAI adapter to process messages and stream AG-UI events via Server-Sent Events (SSE).

2. **TanStack AI Client**: Uses `useChat` hook from `@tanstack/ai-react` with `fetchServerSentEvents` to consume the AG-UI stream.

3. **CopilotKit Client**: Uses `<CopilotKit>` provider and `<CopilotChat>` component connected to the same AG-UI endpoint.

4. **AG-UI Protocol**: The shared communication protocol that enables both clients to work with the same server, demonstrating true interoperability.

## AG-UI Events

The server streams events following the AG-UI protocol:

| Event | Description |
|-------|------------|
| `RUN_STARTED` | Signals the beginning of an AI run |
| `TEXT_MESSAGE_START` | Marks the start of a text message |
| `TEXT_MESSAGE_CONTENT` | Streams text content chunks |
| `TEXT_MESSAGE_END` | Marks the end of a text message |
| `TOOL_CALL_START` | Initiates a tool call |
| `TOOL_CALL_ARGS` | Streams tool call arguments |
| `TOOL_CALL_END` | Completes a tool call |
| `RUN_FINISHED` | Signals completion of the run |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm
- An OpenAI API key

### Setup

1. Create a `.env` file in this directory:

```bash
OPENAI_API_KEY=your-openai-api-key
```

2. Install dependencies from the monorepo root:

```bash
cd ../..
pnpm install
```

3. Run the example:

```bash
cd examples/ts-react-copilotkit
pnpm dev
```

4. Open [http://localhost:3001](http://localhost:3001) in your browser.

### Switching Between Clients

Use the tabs at the top of the page to switch between:
- **🔥 TanStack AI Client** — Uses `@tanstack/ai-react`'s `useChat` hook
- **🪁 CopilotKit Client** — Uses CopilotKit's `<CopilotChat>` component

Both connect to the same TanStack AI server endpoint.

## Key Files

| File | Description |
|------|-------------|
| `src/routes/api.chat.ts` | Server endpoint using TanStack AI's `chat()` function |
| `src/routes/index.tsx` | Client page with both TanStack AI and CopilotKit UIs |
| `src/routes/__root.tsx` | Root layout |

## Learn More

- [TanStack AI Documentation](https://tanstack.com/ai)
- [CopilotKit Documentation](https://docs.copilotkit.ai)
- [AG-UI Protocol](https://docs.ag-ui.com)
