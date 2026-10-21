# Computer sandbox smoke test

A live check of `@tanstack/ai-computer-sandbox` on one sandbox provider. It creates a sandbox, starts the desktop, opens xterm, clicks, types, saves two screenshots to `out/`, and destroys the sandbox.

This test uses real provider accounts and can cost money.

## Run it

1. Build the packages: `pnpm build:all`.
2. Put the provider keys in the root `.env.local`.
3. Run one provider:

```bash
pnpm --filter @tanstack/ai-computer-sandbox-smoke smoke <provider> [--install]
```

`--install` installs the desktop tools with `apt-get` before the test. Use it when the image has no desktop.

| Provider                                    | Desktop                                                                                | Command                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------- |
| `docker`                                    | Build the image first: `pnpm --filter @tanstack/ai-computer-sandbox-smoke build:image` | `smoke docker`               |
| `e2b`                                       | The E2B `desktop` template                                                             | `smoke e2b`                  |
| `daytona`                                   | Set `DAYTONA_SNAPSHOT` to a snapshot of `Dockerfile`, or install                       | `smoke daytona --install`    |
| `blaxel`                                    | Set `DESKTOP_IMAGE` to a pushed copy of `Dockerfile`                                   | `smoke blaxel`               |
| `boxd`, `railway`, `sprites`, `upstash-box` | Install at start                                                                       | `smoke <provider> --install` |
| `vercel`                                    | Not supported: the image has no `apt-get`                                              |                              |
| `cloudflare`                                | Not in this script: it runs only in a Worker                                           |                              |
