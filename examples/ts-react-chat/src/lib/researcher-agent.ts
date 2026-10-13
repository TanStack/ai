import { z } from 'zod'

// Shared by the server and the browser, so it holds no server code. The
// server adds `run` in `routes/api.subagent-brief.ts`. The browser passes it
// to `useChat`, which types `part.subagent.input` from `inputSchema`.
export const researcher = {
  name: 'researcher',
  description:
    'Researches one focused question and returns short findings. It cannot see this chat, so the task must hold every detail it needs.',
  inputSchema: z.object({
    task: z
      .string()
      .describe(
        'What to find and what to return. The researcher sees only this text.',
      ),
  }),
} as const
