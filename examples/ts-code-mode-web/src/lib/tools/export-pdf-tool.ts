import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Tool definition for exporting conversation to PDF.
 * This is a client-side tool - the LLM can call it to trigger a PDF export,
 * and the client handles the actual export logic.
 */
export const exportConversationToPdfTool = toolDefinition({
  name: 'export_conversation_to_pdf',
  description:
    'Export the current conversation to a PDF file. The PDF will be downloaded automatically. Use this when the user asks to save, export, or download the conversation.',
  inputSchema: z.object({
    title: z
      .string()
      .optional()
      .describe('Optional title for the PDF document'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    filename: z.string().optional(),
  }),
})
