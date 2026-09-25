# Bash AG-UI server

A deliberately minimal AG-UI server written in Bash. It uses:

- `socat` to accept concurrent HTTP connections
- `curl` to stream OpenAI or Anthropic responses
- `jq` to translate JSON and emit AG-UI SSE events

## Prerequisites

On macOS:

```bash
brew install bash jq socat
```

The server expects Bash 4+ and also requires `curl`.

## Run

From `examples/ag-ui`:

```bash
OPENAI_API_KEY=... pnpm dev:bash
```

The server listens on `http://127.0.0.1:8005`. Its endpoints are:

- `GET /health`
- `POST /` with an AG-UI `RunAgentInput` body
- `OPTIONS /` for CORS preflight

This server exists to demonstrate the portability of the AG-UI wire protocol.
It is intentionally a local development example, not a production HTTP
server.
