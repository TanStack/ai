# TanStack AI - Laravel + React Example

This example demonstrates how to use TanStack AI with a Laravel 11+ backend and React frontend, showcasing Laravel's native `response()->eventStream()` method for Server-Sent Events (SSE) streaming.

## Features

- ✅ Laravel 11+ backend with native SSE streaming support
- ✅ React frontend using `@tanstack/ai-react` hook
- ✅ Support for both Anthropic and OpenAI providers
- ✅ Real-time streaming chat interface
- ✅ Proper error handling and CORS configuration
- ✅ Uses TanStack AI PHP package for message conversion

## Prerequisites

- **PHP 8.2+** with Composer
- **Node.js 18+** with pnpm
- **Anthropic API Key** (for Anthropic provider)
- **OpenAI API Key** (for OpenAI provider)

## Project Structure

```
php-laravel/
├── backend/                    # Laravel application
│   ├── app/
│   │   └── Http/
│   │       └── Controllers/
│   │           └── ChatController.php
│   ├── routes/
│   │   └── api.php
│   ├── config/
│   │   ├── cors.php
│   │   └── services.php
│   ├── composer.json
│   └── .env.example
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── components/
│   │       └── Chat.tsx
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Setup Instructions

### 1. Install Dependencies

From the root directory:

```bash
pnpm run setup
```

Or install separately:

**Backend:**

```bash
cd backend
composer install
```

**Frontend:**

```bash
cd frontend
pnpm install
```

### 2. Configure Backend

1. Copy the environment example file:

   ```bash
   cd backend
   cp .env.example .env
   ```

2. Generate Laravel application key:

   ```bash
   php artisan key:generate
   ```

3. Edit `.env` and add your API keys:
   ```env
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   OPENAI_API_KEY=your-openai-api-key-here
   ```

### 3. Run the Application

**Terminal 1 - Backend (Laravel):**

```bash
cd backend
php artisan serve --host=0.0.0.0 --port=8020
```

Or use the npm script:

```bash
pnpm run backend:start
```

The backend will be available at `http://localhost:8020`

**Terminal 2 - Frontend (React):**

```bash
cd frontend
pnpm dev
```

Or use the npm script:

```bash
pnpm run frontend:dev
```

The frontend will be available at `http://localhost:3200`

## Usage

1. Open `http://localhost:3200` in your browser
2. Type a message in the chat input
3. Press Enter or click Send
4. Watch the AI response stream in real-time!

## Architecture

### Data Flow

```
React Frontend (localhost:3200)
  ↓ POST /api/chat
Laravel Backend (localhost:8020)
  ↓ Convert messages (MessageFormatters)
  ↓ Stream from Provider API (Anthropic/OpenAI)
  ↓ Convert events to StreamChunks (StreamChunkConverter)
  ↓ Yield StreamedEvent instances
  ↓ SSE stream back to frontend
React Frontend
  ↓ Parse SSE chunks
  ↓ Update UI with streaming messages
```

### Key Components

**Backend (`ChatController.php`):**

- Uses Laravel's `response()->eventStream()` for SSE streaming
- Converts TanStack AI message format to provider format using `MessageFormatters`
- Streams provider events and converts them to `StreamChunk` format using `StreamChunkConverter`
- Yields `StreamedEvent` instances with JSON-encoded chunks
- Sends `[DONE]` marker before stream completion

**Frontend (`Chat.tsx`):**

- Uses `useChat` hook from `@tanstack/ai-react`
- Configures `fetchServerSentEvents` connection adapter
- Displays messages with support for text, thinking, and tool call parts
- Handles loading states and errors

### SSE Format Compatibility

Laravel's `eventStream()` method automatically:

- Sets proper SSE headers (`Content-Type: text/event-stream`)
- Formats events as `event: <name>` and `data: <content>` lines
- Sends `</stream>` marker when the stream completes

The TanStack AI client parser:

- Reads lines starting with `data: ` prefix
- Parses JSON-encoded chunks
- Handles `[DONE]` marker for stream completion

**Note:** Laravel sends both the `event:` line and `data:` line. The TanStack AI client parser skips non-`data:` lines, so this works seamlessly.

## Provider Selection

By default, the example uses Anthropic. To use OpenAI, modify the frontend connection:

```typescript
const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents('http://localhost:8020/api/chat', {
    // You can pass provider selection in the request body
    // The backend checks data.provider field
  }),
})
```

Or modify the backend to accept a `provider` parameter in the request `data` object:

```json
{
  "messages": [...],
  "data": {
    "provider": "openai",
    "model": "gpt-4o"
  }
}
```

## CORS Configuration

CORS is configured in `backend/config/cors.php` to allow requests from the frontend dev server (`localhost:3200`). For production, update the `allowed_origins` array.

## Error Handling

- Backend errors are converted to error `StreamChunk` format using `StreamChunkConverter::convertError()`
- Frontend displays errors in the chat interface
- Network errors are handled by the `useChat` hook

## Development

### Backend Development

The Laravel backend uses the local `tanstack/ai` PHP package from `packages/php/tanstack-ai`. Changes to the PHP package will be reflected immediately after running `composer update tanstack/ai`.

### Frontend Development

The React frontend uses workspace dependencies for `@tanstack/ai-react` and `@tanstack/ai-client`. Changes to these packages will be reflected after restarting the dev server.

## Troubleshooting

**CORS Errors:**

- Ensure the backend CORS config includes your frontend URL
- Check that both servers are running on the expected ports

**API Key Errors:**

- Verify your `.env` file has the correct API keys
- Check that the keys are not wrapped in quotes
- Ensure the API keys have the correct format (Anthropic: `sk-ant-...`, OpenAI: `sk-...`)

**Streaming Not Working:**

- Check browser console for errors
- Verify the backend is receiving requests (check Laravel logs)
- Ensure SSE headers are being sent correctly

## See Also

- [TanStack AI Documentation](../../../docs/)
- [PHP Package Documentation](../../../packages/php/tanstack-ai/README.md)
- [Laravel SSE Documentation](https://laravel.com/docs/11.x/responses#server-sent-events)
