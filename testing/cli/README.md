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

The contract tests above need no API keys — they exercise version, introspect,
and the error/exit-code paths. Tests that perform real generations point a
provider `baseURL` at a local mock (aimock for chat/text; media-endpoint mock
routes are added here as those commands gain coverage) and supply a dummy key.
