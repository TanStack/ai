import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { WorkerConnection } from './cloudflare-stores'

/** The folder in your home folder for what stays on this PC. */
export const SAVE_DIR = join(homedir(), '.tanstack-harness-cloudflare')

// The Worker URL and secret stay on your PC: they are how the CLI reaches
// everything else, which lives in the Worker.
const FILE = join(SAVE_DIR, 'worker.json')

/** The saved Worker, or `undefined` before the first start. */
export async function loadWorker() {
  try {
    const parsed: unknown = JSON.parse(await readFile(FILE, 'utf8'))
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('url' in parsed) ||
      typeof parsed.url !== 'string' ||
      !('secret' in parsed) ||
      typeof parsed.secret !== 'string'
    ) {
      return undefined
    }
    return { url: parsed.url, secret: parsed.secret }
  } catch {
    return undefined
  }
}

/** Save the Worker. The file is readable by your user only. */
export async function saveWorker(worker: WorkerConnection) {
  await mkdir(dirname(FILE), { recursive: true })
  await writeFile(
    FILE,
    JSON.stringify({ url: worker.url, secret: worker.secret }, null, 2),
    { mode: 0o600 },
  )
}

// The Worker of this process. The CLI sets it before it opens a session.
let current: WorkerConnection | undefined

/** Use `worker` from now on, for the stores, code mode, and the header. */
export function setCurrentWorker(worker: WorkerConnection) {
  current = worker
}

/** The Worker of this process. Throws before the CLI set it. */
export function currentWorker() {
  if (!current) throw new Error('No Worker yet. Start the CLI to set it up.')
  return current
}

/** The Worker's host, for the header: `tanstack-harness.acme.workers.dev`. */
export function workerHost(worker: WorkerConnection) {
  try {
    return new URL(worker.url).host
  } catch {
    return worker.url
  }
}
