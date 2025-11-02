# @tanstack/ai-fallback

Automatic fallback wrapper for TanStack AI - try multiple adapters in sequence until one succeeds.

## Installation

```bash
npm install @tanstack/ai-fallback
```

## Quick Start

```typescript
import { ai } from '@tanstack/ai';
import { openai } from '@tanstack/ai-openai';
import { anthropic } from '@tanstack/ai-anthropic';
import { fallback, withModel } from '@tanstack/ai-fallback';

// Create AI instances with model and options pre-bound
const openAI = withModel(ai(openai()), {
  model: 'gpt-4',
  temperature: 0.7,
});

const anthropicAI = withModel(ai(anthropic()), {
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.8,
});

// Create fallback wrapper - tries openAI first, then anthropicAI
const aiWithFallback = fallback([openAI, anthropicAI]);

// Use it - only need to pass messages now!
const stream = aiWithFallback.chat({
  messages: [{ role: 'user', content: 'Hello!' }],
});

for await (const chunk of stream) {
  if (chunk.type === 'content') {
    console.log(chunk.delta);
  }
}
```

## API

### `withModel(ai, options)`

Creates a `BoundAI` instance with model and options pre-configured.

**Parameters:**
- `ai`: An `AI<TAdapter>` instance
- `options`: Model and options to bind (everything except `messages`/`input`)

**Returns:** `BoundAI<TAdapter>` instance

### `fallback(instances, config?)`

Creates a `FallbackAI` instance that tries multiple `BoundAI` instances in sequence.

**Parameters:**
- `instances`: Array of `BoundAI` instances to try in order
- `config`: Optional configuration:
  - `onError?: (adapterName: string, error: Error) => void` - Called when an adapter fails
  - `stopOnError?: (error: Error) => boolean` - Return `true` to stop trying other adapters

**Returns:** `FallbackAI` instance

## Use Cases

### Rate Limit Protection

```typescript
const openAI = withModel(ai(openai()), { model: 'gpt-4' });
const anthropicAI = withModel(ai(anthropic()), { model: 'claude-3-5-sonnet-20241022' });

const aiWithFallback = fallback([openAI, anthropicAI]);

// If OpenAI hits rate limit, automatically uses Anthropic
const result = await aiWithFallback.chatCompletion({
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Cost Optimization

```typescript
const localAI = withModel(ai(ollama()), { model: 'llama3' });
const cloudAI = withModel(ai(openai()), { model: 'gpt-4' });

// Try cheap local option first, fall back to cloud if needed
const aiWithFallback = fallback([localAI, cloudAI]);
```

### Error Handling

```typescript
const aiWithFallback = fallback([openAI, anthropicAI], {
  onError: (adapterName, error) => {
    console.error(`Adapter ${adapterName} failed:`, error);
    // Send to monitoring service, etc.
  },
  stopOnError: (error) => {
    // Stop trying if it's a 401 (auth error) - won't work with other adapters
    return error.message.includes('401');
  },
});
```

## Supported Methods

All methods work the same as the regular `AI` class, but only require `messages`/`input`:

- `chat({ messages, ... })` - Stream chat with automatic tool execution
- `chatCompletion({ messages, ... })` - Complete chat with optional structured output
- `embed({ input, ... })` - Generate embeddings
- `summarize({ text, ... })` - Summarize text
- `image({ prompt, ... })` - Generate images
- `audio({ file, ... })` - Transcribe audio
- `speak({ input, voice, ... })` - Generate speech
- `video({ prompt, ... })` - Generate videos

## How It Works

1. When you call a method, `FallbackAI` tries the first `BoundAI` instance
2. If it fails (throws an error), it automatically tries the next one
3. Continues until one succeeds or all fail
4. If all fail, throws a comprehensive error listing all failures

## Streaming Behavior

For streaming methods (`chat`), the fallback works as follows:

- The stream must succeed before yielding chunks (can't retry mid-stream)
- If an error occurs before the first chunk, it tries the next adapter
- Once streaming starts, errors are forwarded (no retry)

This means fallback only happens before streaming begins, not during the stream.

## License

MIT

