/**
 * Live check of @tanstack/ai-computer-sandbox on one sandbox provider.
 *
 *   pnpm smoke <provider> [--install]
 *
 * It creates one sandbox, starts the desktop, opens xterm, clicks, types,
 * takes two screenshots into ./out, and destroys the sandbox.
 * `--install` installs the desktop tools with apt-get first, for images
 * that do not have them.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createSandboxComputerDriver } from '@tanstack/ai-computer-sandbox'
import type { SandboxProvider } from '@tanstack/ai-sandbox'

try {
  process.loadEnvFile(new URL('../../.env.local', import.meta.url))
} catch {
  // No .env.local. The provider SDKs read process.env.
}

/** A desktop image for providers that take one. Build it from ./Dockerfile. */
const image = process.env.DESKTOP_IMAGE ?? 'tanstack-desktop-smoke'

// Import only the chosen provider, so one SDK loads.
const providers: Record<string, () => Promise<SandboxProvider>> = {
  docker: async () =>
    (await import('@tanstack/ai-sandbox-docker')).dockerSandbox({ image }),
  e2b: async () =>
    (await import('@tanstack/ai-sandbox-e2b')).e2bSandbox({
      template: 'desktop',
    }),
  daytona: async () =>
    (await import('@tanstack/ai-sandbox-daytona')).daytonaSandbox({
      snapshot: process.env.DAYTONA_SNAPSHOT,
    }),
  blaxel: async () =>
    (await import('@tanstack/ai-sandbox-blaxel')).blaxelSandbox({
      image: process.env.DESKTOP_IMAGE,
    }),
  boxd: async () => (await import('@tanstack/ai-sandbox-boxd')).boxdSandbox(),
  railway: async () =>
    (await import('@tanstack/ai-sandbox-railway')).railwaySandbox(),
  sprites: async () =>
    (await import('@tanstack/ai-sandbox-sprites')).spritesSandbox(),
  'upstash-box': async () =>
    (await import('@tanstack/ai-sandbox-upstash-box')).upstashBoxSandbox(),
  vercel: async () =>
    (await import('@tanstack/ai-sandbox-vercel')).vercelSandbox({
      teamId: process.env.VERCEL_TEAM_ID ?? process.env.VERCEL_TEAM,
    }),
}

// Debian and Ubuntu: apt-get. Alpine (Blaxel): apk. Amazon Linux (Vercel): dnf has no xdotool or
// scrot, so build xdotool, and the driver takes screenshots with ImageMagick.
const INSTALL = `S=; [ "$(id -u)" = 0 ] || S=sudo
if command -v apt-get >/dev/null; then
  $S apt-get update -qq && $S env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends xvfb xdotool scrot x11-utils xterm
elif command -v dnf >/dev/null; then
  $S dnf -y -q install gcc make git libXtst-devel libXinerama-devel libxkbcommon-devel libXi-devel xorg-x11-server-Xvfb xdpyinfo xterm ImageMagick \\
    && rm -rf /tmp/xdotool && git clone -q --depth 1 https://github.com/jordansissel/xdotool /tmp/xdotool \\
    && make -s -C /tmp/xdotool WITHOUT_RPATH_FIX=1 && $S make -s -C /tmp/xdotool install PREFIX=/usr WITHOUT_RPATH_FIX=1 && $S ldconfig
elif command -v apk >/dev/null; then
  $S apk add -q --no-cache xvfb xdotool scrot xdpyinfo xterm font-misc-misc
else
  echo "No apt-get, dnf, or apk" >&2; exit 1
fi`

const [name, flag] = process.argv.slice(2)
const makeProvider = name ? providers[name] : undefined
if (!name || !makeProvider) {
  console.error(
    `Usage: pnpm smoke <${Object.keys(providers).join('|')}> [--install]`,
  )
  process.exit(1)
}

async function step<T>(label: string, fn: () => Promise<T>) {
  const start = performance.now()
  const result = await fn()
  console.log(`${label.padEnd(28)} ${Math.round(performance.now() - start)} ms`)
  return result
}

const sandbox = await step('create sandbox', async () =>
  (await makeProvider()).create({}),
)
try {
  if (flag === '--install') {
    await step('install desktop tools', async () => {
      const result = await sandbox.process.exec(INSTALL)
      if (result.exitCode !== 0) throw new Error(result.stderr)
    })
  }
  const driver = await step('start desktop + driver', () =>
    createSandboxComputerDriver({ sandbox }),
  )
  console.log('display', driver.display)

  // Open a terminal to type into. The E2B template has xfce4-terminal, not xterm.
  await sandbox.process.spawn(
    'export DISPLAY=:0; if command -v xterm >/dev/null; then xterm -geometry 80x20+50+50; else xfce4-terminal --geometry=80x20+50+50; fi >/dev/null 2>&1',
  )
  await new Promise((resolve) => setTimeout(resolve, 1500))

  await mkdir(new URL('./out/', import.meta.url), { recursive: true })
  const before = await step('screenshot', () => driver.screenshot())
  await writeFile(new URL(`./out/${name}-1.png`, import.meta.url), before)

  await step('click', () =>
    driver.click(200, 150, { button: 'left', count: 1 }),
  )
  await step('type', () => driver.type('echo hello from tanstack'))
  await step('press Enter', () => driver.press(['Enter']))
  await step('scroll', () => driver.scroll(200, 150, 0, 300))
  const position = await step('cursor position', () => driver.cursorPosition())
  console.log('cursor', position)

  const after = await step('screenshot', () => driver.screenshot())
  await writeFile(new URL(`./out/${name}-2.png`, import.meta.url), after)
  console.log(
    `\n${name}: OK. Screenshots in testing/computer-sandbox-smoke/out/`,
  )
} finally {
  await step('destroy sandbox', () => sandbox.destroy())
}
