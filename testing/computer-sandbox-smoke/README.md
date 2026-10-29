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

With OrbStack, run `docker` with `DOCKER_HOST=unix://$HOME/.orbstack/run/docker.sock`.

`--install` installs the desktop tools with `apt-get`, `dnf`, or `apk` before the test. Use it when the image has no desktop.

| Provider                                    | Desktop                                                                                              | Command                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| `docker`                                    | Build the image first: `pnpm --filter @tanstack/ai-computer-sandbox-smoke build:image`               | `smoke docker`               |
| `e2b`                                       | The E2B `desktop` template                                                                           | `smoke e2b`                  |
| `daytona`                                   | The default image has XFCE. Install the tools at start                                               | `smoke daytona --install`    |
| `blaxel`                                    | The default image is Alpine. Install the tools at start                                              | `smoke blaxel --install`     |
| `boxd`, `railway`, `sprites`, `upstash-box` | Install at start                                                                                     | `smoke <provider> --install` |
| `vercel`                                    | Amazon Linux. Install builds `xdotool` from source (about 40 s) and uses ImageMagick for screenshots | `smoke vercel --install`     |
| `cloudflare`                                | Not in this script: it runs only in a Worker                                                         |                              |

## Results

| Provider  | Result                   | Date       |
| --------- | ------------------------ | ---------- |
| `docker`  | Passed                   | 2026-10-21 |
| `daytona` | Passed, with `--install` | 2026-10-21 |
| `e2b`     | Passed                   | 2026-10-21 |
| `vercel`  | Passed, with `--install` | 2026-10-21 |
| `blaxel`  | Passed, with `--install` | 2026-10-21 |
| `boxd`    | Passed, with `--install` | 2026-10-21 |
| Others    | Not run: no account keys |            |
