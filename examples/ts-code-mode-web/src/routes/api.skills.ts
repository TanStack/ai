import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFileRoute } from '@tanstack/react-router'
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
import { createAlwaysTrustedStrategy } from '@tanstack/ai-code-mode-skills'

// Resolve skills directory relative to project root
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const skillsDir = resolve(__dirname, '../../../../.skills')

// Use the same trust strategy as the main skills endpoint
const trustStrategy = createAlwaysTrustedStrategy()

// Use the same storage as the skills endpoint
const skillStorage = createFileSkillStorage({
  directory: skillsDir,
  trustStrategy,
})

export const Route = createFileRoute('/api/skills')({
  server: {
    handlers: {
      // GET - List all skills with stats
      GET: async () => {
        try {
          const skillIndex = await skillStorage.loadIndex()

          // Load full stats for each skill
          const skillsWithStats = await Promise.all(
            skillIndex.map(async (skill) => {
              const full = await skillStorage.get(skill.name)
              return {
                id: skill.id,
                name: skill.name,
                description: skill.description,
                usageHints: skill.usageHints,
                trustLevel: skill.trustLevel,
                stats: full?.stats ?? { executions: 0, successRate: 0 },
              }
            }),
          )

          return new Response(JSON.stringify(skillsWithStats), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('[API Skills] Error loading skills:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to load skills' }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },

      // DELETE - Delete a skill by name
      DELETE: async ({ request }) => {
        try {
          const url = new URL(request.url)
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
          console.error('[API Skills] Error deleting skill:', error)
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
