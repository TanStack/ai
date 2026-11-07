// Daily sync of model metadata. Ported from .github/workflows/sync-models.yml.
// It force-pushes the changes to automated/sync-models, opens a PR for them,
// and opens (or comments on) a `sync-models` issue when a sync step fails.
import {
  defineWorkflow,
  forge,
  manual,
  schedule,
  setup,
} from '@tanstack-source/ci'

const branch = 'automated/sync-models'

const prBody = `Automated daily sync of model metadata from OpenRouter, Vercel AI Gateway, Lovable AI Gateway, LLM Gateway, Neon AI Gateway, and modelschemas (ElevenLabs text-to-speech, music, sound effects, and voice design).

- Fetches the latest model list from OpenRouter (chat + \`GET /api/v1/videos/models\`)
- Fetches the latest model list from Vercel AI Gateway
- Fetches the latest model list from Lovable AI Gateway
- Fetches the latest model list from LLM Gateway (\`GET /v1/models\`)
- Fetches the latest model list from Neon AI Gateway
- Converts to the internal adapter format
- Syncs provider-specific model metadata for affected packages
- Inserts new ElevenLabs text-to-speech, music, sound-effect, and voice-design models from modelschemas
- Creates a patch changeset for all changed packages`

// Each sync runs on its own, so one provider failing does not block the
// others. Whatever succeeded is still committed, then the job fails.
const syncs = {
  fetch: 'pnpm generate:models:fetch',
  convert: 'pnpm regenerate:models',
  elevenlabs: 'pnpm generate:models:elevenlabs',
  provider: 'pnpm exec tsx scripts/sync-provider-models.ts',
}

export default defineWorkflow('sync-models', {
  on: [schedule('0 6 * * *'), manual()],
}).job('sync', {
  checkout: { depth: 0 },
  env: { NX_NO_CLOUD: 'true' },
  // Optional: the Vercel gateway answers without a key today.
  secrets: { AI_GATEWAY_API_KEY: { optional: true } },
  permissions: {
    push: [branch],
    pulls: 'create',
    issues: 'write',
    comment: 'any-pr',
  },
  egress: [
    'registry.npmjs.org',
    'nodejs.org',
    'openrouter.ai',
    'ai-gateway.vercel.sh',
    'ai.gateway.lovable.dev',
    'api.llmgateway.io',
    'neon.com',
    'modelschemas.com',
  ],
  steps: [
    setup.node(),
    setup.pnpm(),
    { name: 'Install', run: 'pnpm install --frozen-lockfile' },
    {
      name: 'Sync models',
      do: async (ctx) => {
        let succeeded = false
        const outcomes: Array<string> = []
        const key = ctx.secrets.AI_GATEWAY_API_KEY ?? ''
        for (const [name, command] of Object.entries(syncs)) {
          const { code } = await ctx.sh
            .nothrow`AI_GATEWAY_API_KEY=${key} bash -c ${command}`
          outcomes.push(`${name}=${code === 0 ? 'success' : 'failure'}`)
        }
        const failed = outcomes.filter((o) => o.endsWith('=failure'))

        // Open or comment on the failure issue, also when a later step fails.
        ctx.afterJob(
          async (after) => {
            if (succeeded) return
            const client = forge(after)
            await client.labels.ensure({
              name: 'sync-models',
              color: 'B60205',
              description: 'Daily model sync failures',
            })
            const date = new Date().toISOString().slice(0, 10)
            const body = [
              `🚨 Sync Model Metadata failed on ${date}.`,
              '',
              `Job: ${after.env.TANSTACK_SOURCE_JOB_ID ?? 'unknown'}`,
              `Step outcomes: ${outcomes.join(', ')}`,
              '',
              `Steps that passed were still committed to \`${branch}\`. Close this issue when the sync is green again.`,
            ].join('\n')
            const [issue] = await client.issues.list({
              label: 'sync-models',
              state: 'open',
            })
            if (issue) await client.comments.create(issue.number, body)
            else
              await client.issues.create({
                title:
                  '🚨🚨🚨 DAILY MODEL SYNC IS FAILING 🚨🚨🚨 Model updates are NOT landing',
                body,
                labels: ['sync-models'],
              })
          },
          { name: 'Open or update failure issue', always: true },
        )

        await ctx.sh`pnpm format`

        const changed = await ctx.sh.nothrow`git diff --quiet -- packages/`
        if (changed.code !== 0) {
          await ctx.sh`git config user.name ${'TanStack Source'}`
          await ctx.sh`git config user.email ${'ci@source.tanstack.com'}`
          await ctx.sh`git add packages/ scripts/openrouter.models.json scripts/openrouter.video-models.json scripts/vercel-gateway.models.json scripts/lovable-gateway.models.json scripts/llmgateway.models.json scripts/neon.models.json scripts/.sync-models-last-run .changeset/`
          await ctx.sh`git commit -m ${'chore: sync model metadata'}`
          await ctx.sh`git push --force origin ${`HEAD:${branch}`}`

          const client = forge(ctx)
          const [open] = await client.pulls.list({
            head: branch,
            state: 'open',
          })
          if (open === undefined) {
            await client.pulls.create({
              title: 'chore: sync model metadata',
              head: branch,
              base: 'main',
              body: prBody,
            })
          }
        }

        if (failed.length > 0) {
          throw new Error(
            `A model sync step failed (${failed.join(', ')}). Passing steps were still committed.`,
          )
        }
        succeeded = true
      },
    },
  ],
})
