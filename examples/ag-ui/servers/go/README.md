# Go AG-UI chat server

AG-UI SSE server using the Go standard library. Streams simple chat completions from OpenAI or Anthropic.

## Run

From `examples/ag-ui`:

```bash
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...
pnpm dev:go
# or
go run -C servers/go .
```

Listens on `http://127.0.0.1:8001`.

## Protocol

- **Endpoint:** `POST /`
- **Request body:** AG-UI `RunAgentInput` JSON
- **Provider selection:** `forwardedProps.provider` (`openai` | `anthropic`) and optional `forwardedProps.model`
- **Response:** `Content-Type: text/event-stream`

Supports simple `user` / `assistant` / `system` messages with string `content` or TanStack-style text `parts`. Tool and reasoning fan-out entries are ignored.

## Environment

| Variable            | Required when         |
| ------------------- | --------------------- |
| `OPENAI_API_KEY`    | `provider: openai`    |
| `ANTHROPIC_API_KEY` | `provider: anthropic` |

Default models: `gpt-4o`, `claude-sonnet-4-6`.
