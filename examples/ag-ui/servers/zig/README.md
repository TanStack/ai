# Zig AG-UI server

Hand-rolled AG-UI SSE server on `http://127.0.0.1:8004`.

## Run

From `examples/ag-ui`:

```bash
pnpm dev:zig
```

Requires Zig with stdlib HTTP client support (tested with Zig 0.16).

## Environment

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/` | AG-UI chat (SSE) |
| GET | `/health` | Health check (`ok`) |
| OPTIONS | `/` | CORS preflight |

The client sends `forwardedProps: { provider, model }` in the AG-UI `RunAgentInput` body.
