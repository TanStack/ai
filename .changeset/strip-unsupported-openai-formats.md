---
'@tanstack/openai-base': patch
---

Strip JSON Schema `format` values that OpenAI's strict Structured Outputs subset rejects (e.g. `uri`, `uri-reference`, `iri`) from tool and response schemas before sending. Tools whose input schemas declare an unsupported `format` — common with MCP server tools — previously caused the entire request to fail with `400 ... '<format>' is not a valid format`. Supported formats (`date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`) are preserved, and the caller's original tool definition is never mutated.
