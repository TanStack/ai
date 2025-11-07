# @tanstack/ai-devtools-client

Event client for TanStack AI Devtools communication.

## Installation

```bash
npm install @tanstack/ai-devtools-client
# or
pnpm add @tanstack/ai-devtools-client
```

## Usage

```typescript
import { aiDevtoolsEventClient } from '@tanstack/ai-devtools-client';

// Listen for events
aiDevtoolsEventClient.on('tanstack-ai-devtools:message-added', ({ sessionId, message }) => {
  console.log('New message:', message);
});

// Emit events
aiDevtoolsEventClient.emit('tanstack-ai-devtools:chat-session-started', {
  session: {
    id: 'session-1',
    provider: 'openai',
    model: 'gpt-4',
    messages: [],
    chunks: [],
    config: {},
    stats: {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      requestCount: 0,
      avgResponseTime: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
});
```

## Event Types

### Core Events
- `tanstack-ai-devtools:ready` - Devtools is ready
- `tanstack-ai-devtools:mounted` - Devtools UI mounted
- `tanstack-ai-devtools:trigger-toggled` - Devtools visibility toggled

### Chat Session Events
- `tanstack-ai-devtools:chat-session-started` - New chat session started
- `tanstack-ai-devtools:chat-session-updated` - Session data updated
- `tanstack-ai-devtools:chat-session-ended` - Session ended
- `tanstack-ai-devtools:message-added` - New message added to session
- `tanstack-ai-devtools:chunk-received` - Streaming chunk received
- `tanstack-ai-devtools:chunks-cleared` - Chunks cleared
- `tanstack-ai-devtools:config-updated` - Configuration updated
- `tanstack-ai-devtools:stats-updated` - Statistics updated
- `tanstack-ai-devtools:export-chunks` - Export chunks requested
- `tanstack-ai-devtools:chunks-exported` - Chunks export completed

## License

MIT
