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
import { handOffTool } from './hand-off'
import { requestLoginTool } from './request-login'

// One Docker container for each chat thread. The image comes from
// `sandbox/Dockerfile`. Its main process starts the screen, Chromium, and the
// live view (noVNC on port 6080).
const LIVE_VIEW_PORT = 6080
const provider = dockerSandbox({
  image: 'computer-use-login-desktop',
  keepAliveCommand: ['/opt/desktop/desktop.sh'],
  publishPorts: [LIVE_VIEW_PORT],
})

// The container id of each thread, in a file. A thread keeps its container,
// and so its signed-in browser, also after the server restarts.
// ponytail: one file and one process. Use your database with more servers.
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

/**
 * The container of a thread, or null before the model's first action. The
 * container can be stopped, for example when the user answers a card hours
 * later. `resume` starts it again.
 */
async function threadSandbox(threadId: string) {
  const id = await sandboxIds.get(threadId)
  return id === undefined ? null : provider.resume({ id })
}

/** The noVNC address of a thread's desktop, or null when it has none yet. */
export async function liveViewUrl(threadId: string) {
  const sandbox = await threadSandbox(threadId)
  if (!sandbox) return null
  const [{ url }, password] = await Promise.all([
    sandbox.ports.connect(LIVE_VIEW_PORT),
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

// The Chromium profile of each thread, saved after a sign-in and when the
// thread goes idle. A thread whose container is gone gets a new container
// with this profile, so it is still signed in.
// ponytail: memory only, like the chat. Use durable stores to keep a sign-in
// after a server restart. The profile holds session cookies: keep it secret.
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

// The username and password of each thread, between the login card and the
// sign-in. Only in memory, and never in a log.
// ponytail: one process. With more servers, use a store with a time limit.
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

/** Keep a username and password for the next sign-in of a thread. */
export function saveLogin({ threadId, ...login }: z.infer<typeof loginSchema>) {
  clearTimeout(logins.get(threadId)?.timer)
  const timer = setTimeout(() => logins.delete(threadId), LOGIN_TTL_MS)
  timer.unref()
  logins.set(threadId, { ...login, timer })
}

/** Take the saved login of a thread. It is deleted, so it is used once. */
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

const loginResultSchema = z.object({
  url: z.string(),
  hasPasswordField: z.boolean(),
})

// The model asks for a sign-in, and it never sees the password.
const requestLogin = requestLoginTool.server(async ({ site }, context) => {
  const threadId = context?.threadId
  if (!threadId) throw new Error('requestLogin runs only in a chat thread.')
  const login = takeLogin(threadId, site)

  const sandbox = await threadSandbox(threadId)
  if (!sandbox) {
    throw new Error(
      'This thread has no computer. Take a screenshot, then call requestLogin again.',
    )
  }

  // The password goes in the environment of one process, not on its command
  // line. The script opens the site, checks its origin, then fills the form.
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
  // A wrong password. The error brings the login card back, and the card
  // asks the user to try again.
  if (page.hasPasswordField) {
    throw new Error(
      `The sign-in failed: ${page.url} still asks for a password. Call requestLogin again, so the user can try again.`,
    )
  }
  // Save the signed-in profile now. A server that stops skips the idle save.
  await saveComputerSnapshot(sandbox, threadId, snapshots)
  return `Signed in. The browser shows ${page.url}. Take a screenshot to see it.`
})

// The model is stuck. The user used the desktop in the live view and clicked
// Done. A click on Cancel declines the call, and the model gets told so.
const handOff = handOffTool.server(
  () => 'The user is done. Take a screenshot to see the screen.',
)

// One time, outside `plugins`, so every session shares the containers.
const computer = computerUse({
  driver: sandboxComputer({ provider, sandboxIds, snapshots }),
  // Pages load in a real browser. Give each one time to draw.
  screenshotDelay: 1000,
})

const agent = defineHarness({
  name: 'computer-use-login',
  adapter: openaiText('gpt-6.1-sol'),
  systemPrompts: [
    'You use a Linux desktop with Chromium on it. When a page asks you to sign in, call requestLogin with the address of the sign-in page. Never ask for a password in the chat, and never type one.',
    'When a sign-in fails, call requestLogin again. When you are stuck on anything else and cannot continue alone, call handOff. The user then uses the desktop and tells you when they are done.',
  ],
  tools: [requestLogin, handOff],
  plugins: () => [permissions(), computer],
})

const host = createHarnessHost({ persistence: memoryPersistence() })

// No login: run this app only on your own machine.
export const handler = createHarnessHandler({
  host,
  harness: agent,
  openAccess: true,
})
