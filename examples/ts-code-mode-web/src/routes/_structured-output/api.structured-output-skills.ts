import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileRoute } from '@tanstack/react-router'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import { createAlwaysTrustedStrategy } from '@tanstack/ai-code-mode-skills'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const skillsDir = resolve(__dirname, '../../../.structured-output-skills')
const trustStrategy = createAlwaysTrustedStrategy()
const skillStorage = createFileSkillStorage({
  directory: skillsDir,
  trustStrategy,
})

export const Route = createFileRoute(
  '/_structured-output/api/structured-output-skills',
)({
  server: {
    handlers: {
      GET: async () => {
        try {
          const skillIndex = await skillStorage.loadIndex()

          const skillsWithStats = await Promise.all(
            skillIndex.map(async (skill) => {
              const full = await skillStorage.get(skill.name)
              return {
                id: skill.id,
                name: skill.name,
                description: skill.description,
                usageHints: skill.usageHints,
                trustLevel: skill.trustLevel,
                code: full?.code ?? '',
                stats: full?.stats ?? { executions: 0, successRate: 0 },
              }
            }),
          )

          return new Response(JSON.stringify(skillsWithStats), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error(
            '[API Structured Output Skills] Error loading skills:',
            error,
          )
          return new Response(
            JSON.stringify({ error: 'Failed to load skills' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
          const deleteAll = url.searchParams.get('all') === 'true'

          if (deleteAll) {
            const skillIndex = await skillStorage.loadIndex()
            await Promise.all(
              skillIndex.map((skill) => skillStorage.delete(skill.name)),
            )
            return new Response(
              JSON.stringify({ success: true, deleted: skillIndex.length }),
              {
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const name = url.searchParams.get('name')

          if (!name) {
            return new Response(
              JSON.stringify({ error: 'Missing skill name' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const deleted = await skillStorage.delete(name)

          if (!deleted) {
            return new Response(
              JSON.stringify({ error: `Skill '${name}' not found` }),
              {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          return new Response(
            JSON.stringify({ success: true, deleted: name }),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error) {
          console.error(
            '[API Structured Output Skills] Error deleting skill:',
            error,
          )
          return new Response(
            JSON.stringify({ error: 'Failed to delete skill' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
