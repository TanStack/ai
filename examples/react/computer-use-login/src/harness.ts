import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { permissions } from '@tanstack/ai-harness/plugins'
import { createHarnessHandler } from '@tanstack/ai-harness/server'
import { computerUse } from '@tanstack/ai-computer-use/harness'
import { sandboxComputer } from '@tanstack/ai-computer-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { openaiText } from '@tanstack/ai-openai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { requestLoginTool } from './request-login'

// One Docker container for each chat thread. The image comes from
// `sandbox/Dockerfile`. Its main process starts the screen and Chromium.
const provider = dockerSandbox({
  image: 'computer-use-login-desktop',
  keepAliveCommand: ['/opt/desktop/desktop.sh'],
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

  // The user can answer the card hours later. The container of the thread
  // can be stopped by then. `resume` starts it again.
  const id = await sandboxIds.get(threadId)
  const sandbox = id === undefined ? null : await provider.resume({ id })
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
  return page.hasPasswordField
    ? `The form was sent, but ${page.url} still shows a password field. The sign-in may have failed. Take a screenshot to check.`
    : `Signed in. The browser shows ${page.url}. Take a screenshot to see it.`
})

// One time, outside `plugins`, so every session shares the containers.
const computer = computerUse({
  driver: sandboxComputer({ provider, sandboxIds }),
  // Pages load in a real browser. Give each one time to draw.
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

// No login: run this app only on your own machine.
export const handler = createHarnessHandler({
  host,
  harness: agent,
  openAccess: true,
})
