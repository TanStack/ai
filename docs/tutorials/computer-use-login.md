---
title: Sign In Without the Model
id: computer-use-login
order: 9
description: "Let a computer use agent sign in to a site, and keep the password away from the model. The user types the password in a card, and the server fills the form in a Docker desktop."
keywords:
  - tanstack ai
  - tutorial
  - computer use
  - sign in
  - password
  - requestLogin
  - sandboxComputer
  - docker
  - harness
---

Give the model a `requestLogin` tool with `needsApproval: true`. When a page asks for a password, the run stops and your chat shows a login card. The server fills the form in the browser, so the model never sees the password.

This tutorial uses React, TanStack Start, the harness, OpenAI, and a Docker desktop with Chromium. It takes about 30 minutes. Start Docker before you begin.

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. Then install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai @tanstack/ai-harness @tanstack/ai-persistence @tanstack/ai-computer-use @tanstack/ai-computer-sandbox @tanstack/ai-sandbox @tanstack/ai-sandbox-docker zod

<!-- ::end:tabs -->

Put your OpenAI key in `.env.local`:

```bash
OPENAI_API_KEY=sk-...
```

## Client and server

- The **desktop** is a Docker container with a screen and Chromium. Each chat thread gets its own container.
- The **server** runs the harness. The model clicks and types on the desktop with the `computer` tool. The `requestLogin` tool fills the sign-in form.
- The **client** shows the chat and the login card. It sends the password to its own route, not to the chat.

The approval of a tool call goes into the harness log. So the card approves the call with only "yes", and the password takes another path.

## 2. Build the desktop

Create a `sandbox` folder in your app with five files.

`sandbox/Dockerfile` installs the screen, the tools of the sandbox computer driver, Chromium, and Python:

```dockerfile
FROM debian:bookworm-slim

RUN printf 'Acquire::Retries "10";\nAcquire::ForceIPv4 "true";\n' > /etc/apt/apt.conf.d/80retries \
  && apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    xvfb xdotool scrot x11-utils chromium fonts-dejavu-core \
    python3 python3-websockets ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY policy.json /etc/chromium/policies/managed/policy.json
COPY desktop.sh browser.sh login.py /opt/desktop/
RUN chmod +x /opt/desktop/desktop.sh /opt/desktop/browser.sh
```

`sandbox/policy.json` keeps passwords off the screen. The model sees the screen and moves the mouse, so Chromium must not offer to show a saved password:

```json
{
  "PasswordManagerEnabled": false,
  "AutofillAddressEnabled": false,
  "AutofillCreditCardEnabled": false,
  "URLBlocklist": ["javascript://*"],
  "RestoreOnStartup": 1
}
```

`RestoreOnStartup` opens the last tabs when Chromium starts again. It also keeps the session cookies, so a restarted Chromium is still signed in.

`sandbox/desktop.sh` is the main process of the container. It starts the screen and Chromium:

```bash
#!/bin/sh
rm -f /tmp/.X0-lock
Xvfb :0 -ac -screen 0 1024x768x24 -nolisten tcp &
until DISPLAY=:0 xdpyinfo >/dev/null 2>&1; do sleep 0.2; done

while true; do
  # browser.sh stop pauses this loop while a snapshot saves or restores the profile.
  while [ -e /tmp/chromium-paused ]; do sleep 0.2; done
  # --no-sandbox: Chromium runs as root in the container, which is the sandbox.
  DISPLAY=:0 chromium --no-sandbox --test-type --no-first-run \
    --no-default-browser-check --disable-dev-shm-usage \
    --user-data-dir=/root/chromium-profile --password-store=basic \
    --remote-debugging-port=9222 \
    --window-position=0,0 --window-size=1024,768
  sleep 1
done
```

- `--user-data-dir` keeps the cookies. A restarted container is still signed in.
- `--password-store=basic` uses the same cookie key in every container. A profile that a new container restores can read its cookies.
- `--remote-debugging-port` listens on 127.0.0.1 inside the container only. That port never leaves the container.

`sandbox/browser.sh` stops and starts Chromium, so a snapshot saves a complete profile. Copy it from the [example](https://github.com/TanStack/ai/blob/main/examples/react/computer-use-login/sandbox/browser.sh):

- `browser.sh stop` pauses the loop in `desktop.sh`, then closes Chromium with the debugging command `Browser.close`. A clean close writes the cookies to disk. A kill signal can lose them.
- `browser.sh start` ends the pause, then waits until Chromium answers on its debugging port.

`sandbox/login.py` signs in. Copy it from the [example](https://github.com/TanStack/ai/blob/main/examples/react/computer-use-login/sandbox/login.py). It reads the site, the username, and the password from its environment, then talks to Chromium over the debugging port:

1. It opens the site in the current tab.
2. It stops if the page is not on the origin of the site, so a redirect cannot get the password.
3. It fills the username field and the password field, then submits the form.
4. It clears every password field, and prints the address of the page.

Build the image:

```bash
docker build -t computer-use-login-desktop sandbox
```

## 3. Share the tool definition

The server and the browser both import the tool definition. Create `src/request-login.ts`:

```typescript ignore
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const requestLoginTool = toolDefinition({
  name: 'requestLogin',
  description:
    'Ask the user to sign in to a site. The user types the username and password in a form that you never see, and the server fills the sign-in form in the browser. Call it when a page asks for a password. Pass the address of the sign-in page.',
  // The run stops until the user answers the login card.
  needsApproval: true,
  inputSchema: z.object({
    site: z
      .url({ protocol: /^https?$/ })
      .describe(
        'The address of the sign-in page, for example https://example.com/login',
      ),
  }),
})
```

## 4. Set up the harness

Create `src/harness.ts`. It has the Docker provider, three stores, the tool, and the harness.

First the provider and the sandbox ids. `sandboxIds` keeps the container of each thread, so the thread finds its signed-in browser again later:

```typescript ignore
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { computerUse } from '@tanstack/ai-computer-use/harness'
import {
  saveComputerSnapshot,
  sandboxComputer,
} from '@tanstack/ai-computer-sandbox'
import { memorySandboxSnapshots } from '@tanstack/ai-sandbox'
import type { SandboxHandle } from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { requestLoginTool } from './request-login'

const provider = dockerSandbox({
  image: 'computer-use-login-desktop',
  keepAliveCommand: ['/opt/desktop/desktop.sh'],
})

// The container id of each thread, in a file.
const SANDBOX_IDS_FILE = resolve('.data/sandbox-ids.json')
const sandboxIdsSchema = z.record(z.string(), z.string())
let sandboxIdsWrite: Promise<void> = Promise.resolve()

async function readSandboxIds() {
  try {
    return sandboxIdsSchema.parse(
      JSON.parse(await readFile(SANDBOX_IDS_FILE, 'utf8')),
    )
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {}
    }
    throw error
  }
}

const sandboxIds = {
  get: async (threadId: string) => (await readSandboxIds())[threadId],
  set: (threadId: string, sandboxId: string) => {
    // One write at a time, so two threads do not lose each other's id.
    sandboxIdsWrite = sandboxIdsWrite.then(async () => {
      const ids = await readSandboxIds()
      await mkdir(dirname(SANDBOX_IDS_FILE), { recursive: true })
      await writeFile(
        SANDBOX_IDS_FILE,
        JSON.stringify({ ...ids, [threadId]: sandboxId }),
      )
    })
    return sandboxIdsWrite
  },
}
```

Then the snapshots of the Chromium profile. `sandboxIds` brings back a container that still exists. A snapshot brings the profile into a new container, when the old one is gone. This also works with providers whose disk does not last, like Cloudflare:

```typescript ignore
const PROFILE = '/root/chromium-profile'
// Only the files that keep a sign-in. Caches stay out of the snapshot.
const PROFILE_FILES = [
  'Local State',
  'Default/Cookies',
  'Default/Cookies-journal',
  'Default/Preferences',
  'Default/Sessions',
  'Default/Local Storage',
  'Default/Session Storage',
]
const keepInProfile = (path: string) =>
  PROFILE_FILES.some(
    (file) =>
      path === file ||
      path.startsWith(`${file}/`) ||
      file.startsWith(`${path}/`),
  )

async function browser(sandbox: SandboxHandle, action: 'stop' | 'start') {
  const result = await sandbox.process.exec(`/opt/desktop/browser.sh ${action}`)
  if (result.exitCode !== 0) {
    throw new Error(`Could not ${action} Chromium: ${result.stderr.trim()}`)
  }
}

const snapshots = {
  store: await memorySandboxSnapshots(),
  root: PROFILE,
  policy: { exclude: (path: string) => !keepInProfile(path) },
  // Chromium writes its profile all the time. Stop it, so the files are complete.
  before: (sandbox: SandboxHandle) => browser(sandbox, 'stop'),
  after: (sandbox: SandboxHandle) => browser(sandbox, 'start'),
}
```

- The driver saves the profile when a thread closes or goes idle. The tool below also saves it right after a sign-in.
- `memorySandboxSnapshots()` keeps the snapshots in memory, like the chat. For a user who comes back the next day, build the stores with `createSandboxSnapshots` on your database.
- The profile holds session cookies. Keep the blob store secret, and encrypt it in production.

Then the logins. The card sends a login, and the tool takes it once. A login that nobody takes is deleted after 5 minutes:

```typescript ignore
const LOGIN_TTL_MS = 5 * 60_000
const logins = new Map<
  string,
  {
    site: string
    username: string
    password: string
    timer: ReturnType<typeof setTimeout>
  }
>()

export const loginSchema = z.object({
  threadId: z.string().min(1).max(200),
  site: z.url({ protocol: /^https?$/ }).max(2000),
  username: z.string().min(1).max(500),
  password: z.string().min(1).max(500),
})

export function saveLogin({ threadId, ...login }: z.infer<typeof loginSchema>) {
  clearTimeout(logins.get(threadId)?.timer)
  const timer = setTimeout(() => logins.delete(threadId), LOGIN_TTL_MS)
  timer.unref()
  logins.set(threadId, { ...login, timer })
}

function takeLogin(threadId: string, site: string) {
  const login = logins.get(threadId)
  logins.delete(threadId)
  clearTimeout(login?.timer)
  if (!login) {
    throw new Error(
      'The user gave no username and password. Call requestLogin again.',
    )
  }
  if (new URL(login.site).origin !== new URL(site).origin) {
    throw new Error(
      `The user signed in for ${new URL(login.site).origin}, not ${new URL(site).origin}.`,
    )
  }
  return login
}
```

Then the tool. It runs after the user approves the card:

```typescript ignore
const loginResultSchema = z.object({
  url: z.string(),
  hasPasswordField: z.boolean(),
})

const requestLogin = requestLoginTool.server(async ({ site }, context) => {
  const threadId = context?.threadId
  if (!threadId) throw new Error('requestLogin runs only in a chat thread.')
  const login = takeLogin(threadId, site)

  // The user can answer the card hours later. `resume` starts a stopped
  // container again.
  const id = await sandboxIds.get(threadId)
  const sandbox = id === undefined ? null : await provider.resume({ id })
  if (!sandbox) {
    throw new Error(
      'This thread has no computer. Take a screenshot, then call requestLogin again.',
    )
  }

  // The password goes in the environment of one process, not on its command line.
  const result = await sandbox.process.exec('python3 /opt/desktop/login.py', {
    env: {
      LOGIN_SITE: site,
      LOGIN_USERNAME: login.username,
      LOGIN_PASSWORD: login.password,
    },
  })
  if (result.exitCode !== 0) {
    throw new Error(`The sign-in failed: ${result.stderr.trim()}`)
  }
  const page = loginResultSchema.parse(JSON.parse(result.stdout))
  if (page.hasPasswordField) {
    return `The form was sent, but ${page.url} still shows a password field. The sign-in may have failed. Take a screenshot to check.`
  }
  // Save the signed-in profile now. A server that stops skips the idle save.
  await saveComputerSnapshot(sandbox, threadId, snapshots)
  return `Signed in. The browser shows ${page.url}. Take a screenshot to see it.`
})
```

- `takeLogin` deletes the login, so the server uses each password once.
- The tool result has no password. The model gets only the address of the page.

Last, the harness and its HTTP handler:

```typescript ignore
const computer = computerUse({
  driver: sandboxComputer({ provider, sandboxIds, snapshots }),
  screenshotDelay: 1000,
})

const agent = defineHarness({
  name: 'computer-use-login',
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: [
    'You use a Linux desktop with Chromium on it. When a page asks you to sign in, call requestLogin with the address of the sign-in page. Never ask for a password in the chat, and never type one.',
  ],
  tools: [requestLogin],
  plugins: () => [permissions(), computer],
})

const host = createHarnessHost({ persistence: memoryPersistence() })

export const handler = createHarnessHandler({
  host,
  harness: agent,
  openAccess: true,
})
```

- `sandboxComputer` makes one container for each thread. With `sandboxIds`, it keeps the container and reconnects to it later. With `snapshots`, a new container gets the saved profile.
- `memoryPersistence()` keeps the chat in memory. A server restart loses the chat, but not the container. For a user who comes back the next day, use a persistence store in your database. See [Chat persistence](../persistence/chat-persistence).
- `openAccess` serves every request with no login. Use it only on your own machine. See [Serve with no login](../harness/access#serve-with-no-login).

The Docker provider loads `dockerode`, which has native addons. Keep it out of the bundle in `vite.config.ts`:

```typescript ignore
export default defineConfig({
  optimizeDeps: { exclude: ['dockerode'] },
  ssr: { external: ['dockerode'] },
  build: { rollupOptions: { external: ['dockerode'] } },
  // ...your plugins
})
```

## 5. Add the two routes

Create `src/routes/api.harness.$.ts`. It serves the harness under `/api/harness`:

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { handler } from '@/harness'

export const Route = createFileRoute('/api/harness/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
})
```

Create `src/routes/api.login.ts`. The card sends the login here. The route checks the input, keeps the login in memory, and logs nothing:

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { loginSchema, saveLogin } from '@/harness'

export const Route = createFileRoute('/api/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json().catch(() => undefined)
        const login = loginSchema.safeParse(body)
        if (!login.success) {
          return Response.json(
            { error: 'Send a thread id, a site, a username, and a password.' },
            { status: 400 },
          )
        }
        saveLogin(login.data)
        return new Response(null, { status: 204 })
      },
    },
  },
})
```

## 6. Show the login card

In `src/routes/index.tsx`, give `useChat` the tool definition. The tool has no browser code, but `useChat` now types its approval:

```tsx ignore
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { requestLoginTool } from '@/request-login'

const THREAD_ID = 'computer-use-login'

const { messages, sendMessage, interrupts } = useChat({
  connection: fetchServerSentEvents('/api/harness/run'),
  threadId: THREAD_ID,
  tools: [requestLoginTool.client()],
  // Load the thread from the server after a reload.
  persistence: true,
})
```

Add the card. It sends the login to `/api/login` first. Then it approves the tool call:

```tsx ignore
function LoginCard({
  site,
  onAnswer,
}: {
  site: string
  onAnswer: (approved: boolean) => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: THREAD_ID, site, username, password }),
      })
      if (!response.ok) {
        throw new Error(`The server did not take the login (${response.status}).`)
      }
      setPassword('')
      onAnswer(true)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError))
    }
  }

  return (
    <form onSubmit={signIn}>
      <p>Sign in to {new URL(site).origin}</p>
      <input
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
        aria-label="Username"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        aria-label="Password"
        required
      />
      {error ? <p>{error}</p> : null}
      <button type="submit">Sign in</button>
      <button type="button" onClick={() => onAnswer(false)}>
        Cancel
      </button>
    </form>
  )
}
```

Show a card for each approval of `requestLogin`, below the messages:

```tsx ignore
{interrupts.map((interrupt) =>
  interrupt.kind === 'tool-approval' ? (
    <LoginCard
      key={interrupt.id}
      site={interrupt.originalArgs.site}
      onAnswer={(approved) => interrupt.resolveInterrupt(approved)}
    />
  ) : null,
)}
```

The harness keeps each screenshot in its media store. A tool result has a `harness-media:<id>` URL for it. Show it from the `media` path of the handler:

```tsx ignore
const src = `/api/harness/media?${new URLSearchParams({ threadId: THREAD_ID, id })}`
```

The example has the full page, with the screenshots and the card for OpenAI safety checks.

## 7. Sign in

Start the app with `npm run dev`. Send this task:

```text
Open https://the-internet.herokuapp.com/login in Chromium and sign in.
When you are signed in, say what the page shows and stop.
```

The model opens the practice page and calls `requestLogin`. Type `tomsmith` and `SuperSecretPassword!` in the card, then click Sign in. The model says that the page shows the Secure Area. Your password is not in the chat, the tool result, or the harness log.

## 8. Watch the desktop and take over

Show the desktop live next to the chat. When the model is stuck, it calls a `handOff` tool, and the user uses the desktop until they click Done.

1. Add the live view to `sandbox/Dockerfile`. Put `x11vnc novnc python3-websockify` after `ca-certificates` in the `apt-get install` line.

2. Start it in `sandbox/desktop.sh`, after the `until` line. Each start makes a new VNC password:

   ```bash
   head -c 64 /dev/urandom | tr -dc 'A-Za-z0-9' | head -c 8 > /tmp/vnc-password
   x11vnc -display :0 -localhost -forever -shared -quiet \
     -passwdfile /tmp/vnc-password -rfbport 5900 &
   websockify --web /usr/share/novnc 6080 localhost:5900 >/dev/null 2>&1 &
   ```

3. Build the image again, then publish the noVNC port in `src/harness.ts`. Docker publishes it on 127.0.0.1 only:

   ```typescript ignore
   const provider = dockerSandbox({
     image: 'computer-use-login-desktop',
     keepAliveCommand: ['/opt/desktop/desktop.sh'],
     publishPorts: [6080],
   })
   ```

4. Add a function to `src/harness.ts` that gives the address of the live view, with its password:

   ```typescript ignore
   export async function liveViewUrl(threadId: string) {
     const id = await sandboxIds.get(threadId)
     const sandbox = id === undefined ? null : await provider.resume({ id })
     if (!sandbox) return null
     const [{ url }, password] = await Promise.all([
       sandbox.ports.connect(6080),
       sandbox.process.exec('cat /tmp/vnc-password'),
     ])
     if (password.exitCode !== 0) {
       throw new Error(`No live view password: ${password.stderr.trim()}`)
     }
     const params = new URLSearchParams({
       autoconnect: '1',
       reconnect: '1',
       resize: 'scale',
       password: password.stdout.trim(),
     })
     return `${url}/vnc.html?${params}`
   }
   ```

   Return it from a `GET /api/live?threadId=...` route as `{ url }`. Copy [`api.live.ts`](https://github.com/TanStack/ai/blob/main/examples/react/computer-use-login/src/routes/api.live.ts) from the example.

5. Create `src/hand-off.ts`. The tool has `needsApproval: true`, so the run stops until the user clicks Done:

   ```typescript
   import { toolDefinition } from '@tanstack/ai'
   import { z } from 'zod'

   export const handOffTool = toolDefinition({
     name: 'handOff',
     description:
       'Give the desktop to the user, and wait until the user is done. Call it when you are stuck and cannot continue alone: a captcha, a two-factor code, a page that you cannot use, or a choice that only the user can make. Then take a screenshot to see what the user did.',
     needsApproval: true,
     inputSchema: z.object({
       reason: z
         .string()
         .describe('What the user must do, in one sentence. The user reads it.'),
     }),
   })
   ```

6. Give the server tool to the harness in `src/harness.ts`:

   ```typescript ignore
   const handOff = handOffTool.server(
     () => 'The user is done. Take a screenshot to see the screen.',
   )

   // In defineHarness:
   tools: [requestLogin, handOff],
   ```

7. In `src/routes/index.tsx`, add `handOffTool.client()` to the `tools` of `useChat`. Then show the live view in an `<iframe>`. Add `&view_only=1` to its address, except while a `handOff` approval waits:

   ```tsx ignore
   const handedOff = interrupts.some(
     (interrupt) =>
       interrupt.kind === 'tool-approval' && interrupt.toolName === 'handOff',
   )

   <iframe
     src={handedOff ? url : `${url}&view_only=1`}
     title="Live view of the desktop"
   />
   ```

   For the `handOff` approval, show `interrupt.originalArgs.reason` with a Done button that calls `interrupt.resolveInterrupt(true)`. Copy the `LiveView` and `HandOffCard` components from the [example](https://github.com/TanStack/ai/blob/main/examples/react/computer-use-login/src/routes/index.tsx).

Start the app, and send a task that needs a person, for example "Open https://www.google.com/recaptcha/api2/demo and send the form." The model calls `handOff`. Tick the captcha in the live view, then click Done. The model continues.

The model sees only the screenshots that it takes after you click Done. If the user types a password in the live view, the model sees only dots.

The full example is on GitHub: [TanStack/ai `examples/react/computer-use-login`](https://github.com/TanStack/ai/tree/main/examples/react/computer-use-login). To host it, see [Run it on a server](https://github.com/TanStack/ai/tree/main/examples/react/computer-use-login#run-it-on-a-server) in its README.
