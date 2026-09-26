<div align="center">
  <picture>
    <source
      media="(prefers-color-scheme: dark)"
      srcset="https://tanstack.com/api/readme/ai.png?theme=dark"
    />
    <source
      media="(prefers-color-scheme: light)"
      srcset="https://tanstack.com/api/readme/ai.png"
    />
    <img
      src="https://tanstack.com/api/readme/ai.png"
      alt="TanStack AI"
      width="900"
    />
  </picture>
</div>

<br />

# @tanstack/ai-harness-cli

Run a TanStack AI harness from the terminal: an interactive UI, a print mode for scripts and CI, NDJSON output, an ACP mode for editors, and an HTTP server.

## Installation

```bash
npm install @tanstack/ai-harness @tanstack/ai-harness-cli
```

The interactive UI uses Ink, which needs Node 22 or later.

## Usage

```ts
#!/usr/bin/env node
import { defineHarness } from '@tanstack/ai-harness'
import { runCli } from '@tanstack/ai-harness-cli'
import { openaiText } from '@tanstack/ai-openai'

const assistant = defineHarness({
  name: 'acme/assistant',
  adapter: openaiText('gpt-5.6'),
})

process.exitCode = await runCli(assistant)
```

| Flag                          | Mode                                               |
| ----------------------------- | -------------------------------------------------- |
| (none)                        | Interactive UI                                     |
| `-p "prompt"`                 | Run one prompt and print the answer                |
| `-p "prompt" --output ndjson` | Print every AG-UI event as JSON lines              |
| `--acp`                       | ACP v2 agent over stdio (needs `@tanstack/ai-acp`) |
| `--serve`                     | Session protocol over HTTP, with a bearer token    |

## Documentation

Read [Run a harness in the terminal](https://tanstack.com/ai/latest/docs/harness/cli).

## License

MIT
