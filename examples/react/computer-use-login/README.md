# Computer Use Login

Your agent uses a desktop, and a site asks it for a password. In this app, the model calls `requestLogin`. You type the username and password in a card in the chat. The server fills the form in the browser, and the model never sees the password.

The desktop is a Docker container with Chromium on it. The chat shows it live, after the last message. When the model is stuck, it calls `handOff`, and you use the desktop yourself.

Each chat thread keeps its own container, so it stays signed in when you come back later. The app also saves the Chromium profile after each sign-in. When the container of a thread is gone, a new container gets the profile back, still signed in.

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
6. The tool saves a snapshot of the Chromium profile, with the cookies of the sign-in.
7. The model gets "Signed in" and the address of the page.

When the password is wrong, the tool fails, and the model calls `requestLogin` again. The card asks you to try again.

The model sees the screen, so Chromium must never show a password. `sandbox/policy.json` turns off the password manager and `javascript:` URLs. Chromium listens for its debugging protocol only inside the container. That port never leaves it.

## Take over the desktop

The live view is noVNC, a VNC viewer in the browser. It is view-only while the model works.

1. The model calls `handOff({ reason })`, for example for a captcha or a two-factor code. The tool has `needsApproval: true`, so the run stops.
2. A card shows the reason. The live view now takes your mouse and keyboard.
3. Do the step on the desktop, then click Done. The model takes a screenshot and continues. Click Cancel to tell the model that you did not do it.

The model sees only the screenshots that it takes after you click Done. If you type a password in the live view, the model sees only dots. The login card is still the better path for a password, because the server checks the origin of the page before it fills the form.

The live view needs a password. The container makes a new one at each start, and `/api/live` reads it. Docker publishes the noVNC port on 127.0.0.1 only, so other computers on your network cannot connect.

## Files

- `src/harness.ts`: the harness, the Docker provider, the `requestLogin` tool, and the three stores.
- `src/request-login.ts` and `src/hand-off.ts`: the tool definitions that the server and the browser share.
- `src/routes/api.login.ts`: the route that takes the username and password.
- `src/routes/api.live.ts`: the route that gives the address of the live view.
- `src/routes/index.tsx`: the chat, the cards, and the live view.
- `sandbox/`: the desktop image. `desktop.sh` starts the screen, the live view, and Chromium. `browser.sh` stops and starts Chromium for a snapshot. `login.py` fills the form.

## Run it on a server

The Docker setup runs on your own machine. To host the app, use a sandbox provider that pauses a sandbox and keeps its memory, like E2B:

```ts
import { e2bSandbox } from '@tanstack/ai-sandbox-e2b'

const provider = e2bSandbox({
  template: 'your-desktop-template',
  onTimeout: 'pause',
})
```

Build an E2B template from `sandbox/Dockerfile`, and start `desktop.sh` in it. Then move the three stores of `src/harness.ts` to your database:

- The sandbox id of each thread.
- The profile snapshots. Build them with `createSandboxSnapshots`. They hold session cookies, so encrypt them.
- The logins, with a time limit.

This app keeps the chat in `memoryPersistence()`. When the server restarts, the chat is gone, but the container stays. For a user who comes back the next day, give `createHarnessHost` a persistence store in your database. See [Chat persistence](https://tanstack.com/ai/latest/docs/persistence/chat-persistence).

A provider whose disk does not last, like Cloudflare, also keeps the sign-in. Each new container gets the profile snapshot back.

## Not in this app

- A live view on a hosted provider. E2B Desktop has its own stream that you can use instead of noVNC.

CAUTION: The harness route has no login, and the browser can open every address that your server can reach. Run this app only on your own machine.
