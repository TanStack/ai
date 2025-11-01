# Vanilla Chat Example

A simple vanilla JavaScript chat interface using `@tanstack/ai-client` and the Python FastAPI server.

## Features

- ✅ Pure vanilla JavaScript (no frameworks)
- ✅ Uses `@tanstack/ai-client` for chat functionality
- ✅ Connects to FastAPI server on port 8080
- ✅ Real-time streaming messages
- ✅ Beautiful, responsive UI

## Setup

1. **Install dependencies:**

```bash
cd examples/vanilla-chat
npm install
# or
pnpm install
```

2. **Make sure the FastAPI server is running:**

```bash
cd ../python-fastapi
python main.py
```

The FastAPI server should be running on `http://localhost:8080`

3. **Start the Vite dev server:**

```bash
npm run dev
# or
pnpm dev
```

The app will be available at `http://localhost:3000`

## Usage

1. Open `http://localhost:3000` in your browser
2. Type a message and press Enter (or click Send)
3. Watch the AI response stream in real-time!

## Project Structure

```
vanilla-chat/
├── index.html      # Main HTML file
├── src/
│   ├── main.js    # Chat client logic
│   └── style.css   # Styles
├── package.json    # Dependencies
└── vite.config.ts # Vite configuration
```

## How It Works

The app uses `ChatClient` from `@tanstack/ai-client` with the `fetchServerSentEvents` connection adapter to connect to the FastAPI server:

```javascript
import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client';

const client = new ChatClient({
  connection: fetchServerSentEvents('http://localhost:8080/chat'),
  onMessagesChange: (messages) => {
    // Update UI when messages change
  },
  onLoadingChange: (isLoading) => {
    // Update loading state
  },
});
```

The FastAPI server streams responses in Server-Sent Events (SSE) format, which the client automatically parses and displays.


