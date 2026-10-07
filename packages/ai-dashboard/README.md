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

# @tanstack/ai-dashboard

A self-hosted dashboard for TanStack AI harnesses. Watch sessions, approve tool calls, answer questions, and send prompts from a browser or a phone. Agents dial out to it, so they need no open port.

## Start the dashboard

```bash
npx @tanstack/ai-dashboard --port 8790
```

It prints a sign-in link with the owner token. Set `DASHBOARD_OWNER_TOKEN` to keep the same token across restarts.

## Connect an agent

```ts
import { connectDashboard } from '@tanstack/ai-dashboard/connect'

await connectDashboard({
  host,
  harness: studio,
  url: 'http://127.0.0.1:8790',
  threads: ['main'],
  onPairingCode: (code) => console.log(`Approve ${code} in the dashboard`),
  onToken: (token) => console.log(`Save this host token: ${token}`),
})
```

With `@tanstack/ai-harness-cli`, run your CLI with `--dashboard <url>`.

## When the dashboard restarts

The dashboard keeps host tokens in memory. After a restart, it refuses the saved token of each agent. It also refuses the token of a revoked host. What the agent does next depends on `onPairingCode`:

- If `onPairingCode` is set, the agent pairs again. It calls `onPairingCode` with a new code, then `onToken` with the new token.
- If `onPairingCode` is not set, the agent stops and calls `onError`.

```ts
const connection = await connectDashboard({
  host,
  harness: studio,
  url: 'http://127.0.0.1:8790',
  token: savedToken,
  onError: (error) => console.error(`Dashboard: ${error.message}`),
})
```

`onError` also gets an error when the agent cannot handle a frame from the dashboard, for example when a thread cannot open. Then the connection stays.

`connection.token` always holds the current host token.

## Documentation

Read [Self-host the dashboard](https://tanstack.com/ai/latest/docs/harness/dashboard).

## License

MIT
