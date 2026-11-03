# Computer Use Login

Your agent uses a desktop, and a site asks it for a password. In this app, the model calls `requestLogin`. You type the username and password in a card in the chat. The server fills the form in the browser, and the model never sees the password.

The desktop is a Docker container with Chromium on it. Each chat thread keeps its own container, so it stays signed in when you come back later.

## Run it

1. Start Docker.
2. From the repo root, run `pnpm install`.
3. Build the desktop image one time: `pnpm --filter computer-use-login build:desktop`.
4. Copy `.env.example` to `.env.local`, then set `OPENAI_API_KEY`. Get a key at https://platform.openai.com/api-keys.
5. Run `pnpm --filter computer-use-login dev`.
6. Open http://localhost:3100 and click Send.

The model opens a practice sign-in page. When the login card shows, type `tomsmith` and `SuperSecretPassword!`, then click Sign in. The model then says what the page shows.

## How the password stays away from the model

1. The model calls `requestLogin({ site })`. The tool has `needsApproval: true`, so the run stops, and the login card shows.
2. The card sends the username and password to `/api/login`. That route keeps them in memory for 5 minutes, and logs nothing.
3. The card then approves the tool call. The approval is only "yes". The harness writes approvals to its log, so a password must never be in one.
4. The tool takes the login from memory and deletes it. It runs `sandbox/login.py` in the container, with the password in the environment of that one process, not on its command line.
5. The script opens the site in Chromium and checks its origin. It fills the username and the password field, then submits the form. Then it clears every password field.
6. The model gets "Signed in" and the address of the page.

The model sees the screen, so Chromium must never show a password. `sandbox/policy.json` turns off the password manager and `javascript:` URLs. Chromium listens for its debugging protocol only inside the container. No port leaves it.

## Files

- `src/harness.ts`: the harness, the Docker provider, the `requestLogin` tool, and the two stores.
- `src/request-login.ts`: the tool definition that the server and the browser share.
- `src/routes/api.login.ts`: the route that takes the username and password.
- `src/routes/index.tsx`: the chat and the login card.
- `sandbox/`: the desktop image. `desktop.sh` starts the screen and Chromium. `login.py` fills the form.

## Run it on a server

The Docker setup runs on your own machine. To host the app, use a sandbox provider that pauses a sandbox and keeps its memory, like E2B:

```ts
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const provider = e2bSandbox({
  template: 'your-desktop-template',
  onTimeout: 'pause',
})
```

Build an E2B template from `sandbox/Dockerfile`, and start `desktop.sh` in it. Then move the two stores of `src/harness.ts` to your database: the sandbox id of each thread, and the logins (with a time limit).

This app keeps the chat in `memoryPersistence()`. When the server restarts, the chat is gone, but the container stays. For a user who comes back the next day, give `createHarnessHost` a persistence store in your database. See [Chat persistence](https://tanstack.com/ai/latest/docs/persistence/chat-persistence).

Cloudflare containers do not fit this app. Their disk is empty after each restart, so the browser signs out.

## Not in this app

- Two-factor codes.
- A live view of the desktop for a captcha.
- A saved Chromium profile in sandbox snapshots.

CAUTION: The harness route has no login, and the browser can open every address that your server can reach. Run this app only on your own machine.
