# @tanstack/ai-cli-tests

Subprocess E2E suite for the `ts-ai` binary (`@tanstack/ai-cli`).

Each test spawns the **built** `ts-ai` binary as a real subprocess and asserts
the machine-facing contract: `--json` payload shape, `--stream` AG-UI events,
exit codes, written artifacts, the `introspect` manifest, and `ts-ai mcp`. This
mirrors exactly how an agent harness drives the CLI.

## Running

```bash
# Build the CLI first (the suite runs the compiled bin)
pnpm --filter @tanstack/ai-cli build

# Run the suite
pnpm --filter @tanstack/ai-cli-tests test:e2e
```

The contract tests need no API keys. They cover version, introspect, and the
error and exit-code paths. `tests/mock-provider.spec.ts` runs real generations
(`chat`, `speech`) against a small OpenAI-shaped `node:http` mock. It sets the
provider `baseURL` with `--config` and uses a dummy key.
