---
'@tanstack/ai-sandbox-cloudflare': minor
---

Make the Cloudflare sandbox factory **harness-agnostic about auth**. `SandboxAgentEnv` / `ContainerCoordinatorEnv` no longer bind a hardcoded `ANTHROPIC_API_KEY` field, and neither the do-drives default sandbox nor the colocated container runner injects an Anthropic key anymore. Instead the run's workspace **declares** the secret names it needs (via `createSecrets`), and the coordinator copies each declared name out of the Worker `env` into the sandbox/container env — so a Claude Code app declares `ANTHROPIC_API_KEY`, a Codex app declares `CODEX_API_KEY`, and the package binds no key of its own.

**Breaking:** apps that relied on the implicit `ANTHROPIC_API_KEY` field must now add it to their own env type and supply it via a `sandbox`/`workspace` resolver, e.g.:

```ts
interface AppEnv extends SandboxAgentEnv {
  ANTHROPIC_API_KEY: string
}
createCloudflareSandboxAgent<AppEnv>({
  adapter: () => claudeCodeText('sonnet'),
  sandbox: (input, env) =>
    defineSandbox({
      // …
      workspace: defineWorkspace({
        source: { type: 'none' },
        secrets: createSecrets({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }),
      }),
    }),
})
```
