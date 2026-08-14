import { toolDefinition } from '@tanstack/ai'
import {
  GROK_CLI_INSTALL_COMMAND,
  grokBuildText,
} from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'
import { z } from 'zod'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  SandboxDefinition,
  SandboxEnsureContext,
} from '@tanstack/ai-sandbox'

export const PREVIEW_PORT = 5173

const SCAFFOLD =
  'Scaffold with the TanStack CLI via npx. Run it exactly like this: `npx --yes @tanstack/cli create my-app --framework react --no-examples --intent -y`. Do not guess other package names.'

const APP =
  'Turn it into a self-contained interactive app. No external APIs, no env vars, no keys. Keep state in the browser (localStorage). Make it look polished.'

const RUN = `Add \`server: { host: true, allowedHosts: true }\` to vite.config.ts. Start the dev server on port ${PREVIEW_PORT}: \`pnpm dev --host 0.0.0.0 --port ${PREVIEW_PORT}\`. When it is listening, call exposePreview with { "port": ${PREVIEW_PORT} } and share the URL.`

export function missingAppStudioEnv(): Array<string> {
  return process.env.XAI_API_KEY ? [] : ['XAI_API_KEY']
}

export function buildAppStudioAdapter(): AnyTextAdapter {
  return grokBuildText('grok-build')
}

export function buildAppStudioSandbox(): SandboxDefinition {
  const key = process.env.XAI_API_KEY
  return defineSandbox({
    id: 'app-studio',
    provider: dockerSandbox({
      image: process.env.SANDBOX_IMAGE ?? 'node:22',
      publishPorts: [PREVIEW_PORT],
    }),
    workspace: defineWorkspace({
      source: { type: 'none' },
      setup: ({ serial }) => serial(GROK_CLI_INSTALL_COMMAND),
      secrets: createSecrets(key ? { XAI_API_KEY: key } : {}),
    }),
    lifecycle: { reuse: 'thread' },
  })
}

export const tanstackStartRecipe = toolDefinition({
  name: 'tanstackStartRecipe',
  description:
    'The recipe for a self-contained TanStack Start app in this sandbox. Call this before you scaffold.',
  inputSchema: z.object({
    section: z
      .enum(['scaffold', 'app', 'run', 'all'])
      .describe('Which part of the recipe you need. Use all first.'),
  }),
}).server(({ section }) => {
  const recipe = { scaffold: SCAFFOLD, app: APP, run: RUN }
  return section === 'all' ? recipe : { [section]: recipe[section] }
})

export function makeExposePreviewTool(
  definition: SandboxDefinition,
  threadId: string,
  bookkeeping?: Pick<SandboxEnsureContext, 'store' | 'locks'>,
) {
  return toolDefinition({
    name: 'exposePreview',
    description: `Expose the sandbox port the dev server is listening on and return a preview URL. Call this after the server is up on port ${PREVIEW_PORT}.`,
    inputSchema: z.object({
      port: z.number().int().min(1024).max(65535),
    }),
  }).server(async ({ port }) => {
    const handle = await definition.ensure({
      threadId,
      runId: 'expose-preview',
      ...bookkeeping,
    })
    const channel = await handle.ports.connect(port)
    return { url: channel.url }
  })
}

export const APP_STUDIO_SYSTEM_PROMPT = [
  'You work in this sandbox.',
  'If the workspace is empty, call tanstackStartRecipe with section all, then scaffold, build the app, start the preview, and call exposePreview.',
  'If the workspace already has an app, do not scaffold again.',
  'Install dependencies if node_modules is missing.',
  'Apply the requested change.',
  `Restart the preview on port ${PREVIEW_PORT}.`,
  'Then call exposePreview.',
  `The preview port must be ${PREVIEW_PORT}.`,
].join(' ')
