import { z } from 'zod'

export const RepoReportSchema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  audience: z.string(),
  mainPackages: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
    }),
  ),
  howToRun: z.string(),
})

export type RepoReport = z.infer<typeof RepoReportSchema>
