import { z } from 'zod'

export const tableSchema = z.object({
  title: z.string().meta({ description: 'Short title for the table' }),
  rows: z.array(
    z.object({
      name: z.string().meta({ description: 'Row name' }),
      year: z.number().meta({ description: 'First release year' }),
      kind: z.string().meta({ description: 'Category or paradigm' }),
      note: z.string().meta({ description: 'One-line typical use' }),
    }),
  ),
})
