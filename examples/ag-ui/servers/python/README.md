# Python AG-UI server

A dependency-free AG-UI server built with Python's standard library. It uses
`ThreadingHTTPServer` for HTTP and `urllib.request` to stream OpenAI or
Anthropic responses.

## Prerequisites

- Python 3.9+
- An OpenAI or Anthropic API key

## Run

From `examples/ag-ui`:

```bash
OPENAI_API_KEY=... pnpm dev:python
```

The server listens on `http://127.0.0.1:8006`. Its endpoints are:

- `GET /health`
- `POST /` with an AG-UI `RunAgentInput` body
- `OPTIONS /` for CORS preflight

This server exists to demonstrate the portability of the AG-UI wire protocol.
It is intentionally a local development example, not a production HTTP
server.
