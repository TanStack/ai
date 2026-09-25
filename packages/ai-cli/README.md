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

# @tanstack/ai-cli

`ts-ai` runs TanStack AI from your terminal or from an agent harness. It can
chat, and it can make images, video, audio, speech, transcripts, and summaries.

## Install

```bash
npx @tanstack/ai-cli image "a watercolor fox" -o fox.png

# or install it globally
pnpm add -g @tanstack/ai-cli
```

Node.js 22 or newer is necessary.

## Use it

```bash
export OPENAI_API_KEY=sk-...
ts-ai chat "Explain MCP in one sentence" --model openai/gpt-5.6 --json
```

- `--json` prints one JSON result to stdout.
- `--stream` prints the AG-UI event stream as NDJSON.
- `ts-ai introspect` prints a manifest of all commands and flags.
- `ts-ai mcp` starts an MCP server (stdio) with one tool for each command.

Read the full guide: [ts-ai CLI](https://tanstack.com/ai/latest/docs/cli/overview).
