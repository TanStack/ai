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

const RepoReportCardSchema = z
  .object({
    name: z.string().optional(),
    oneLiner: z.string().optional(),
    audience: z.string().optional(),
    howToRun: z.string().optional(),
    mainPackages: z
      .array(
        z.object({
          name: z.string().optional(),
          role: z.string().optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.oneLiner !== undefined ||
      value.audience !== undefined ||
      value.howToRun !== undefined ||
      value.mainPackages !== undefined,
  )

export type RepoReportCard = z.infer<typeof RepoReportCardSchema>

export function looksLikeReport(value: unknown): value is RepoReportCard {
  return RepoReportCardSchema.safeParse(value).success
}
