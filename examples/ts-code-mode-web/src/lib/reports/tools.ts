import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import type { ToolExecutionContext } from '@tanstack/ai'
import type { Report } from './types'
import { createReportState, deleteReportState } from './report-storage'

/**
 * Tool to create a new report.
 * The report will automatically open in the UI so the user can watch it being built.
 */
export const newReportTool = toolDefinition({
  name: 'new_report',
  description: `Create a new report for displaying data visualizations. 
The report will automatically open in the UI so the user can watch it being built.
After creating a report, use execute_typescript with external_report_* functions to add components.`,
  inputSchema: z.object({
    id: z
      .string()
      .describe('Unique identifier for the report (snake_case recommended)'),
    title: z.string().describe('Display title shown at the top of the report'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    reportId: z.string(),
    message: z.string(),
  }),
}).server(async ({ id, title }, context?: ToolExecutionContext) => {
  const report: Report = {
    id,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  createReportState(report)

  // Emit event to create report and auto-select it
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('report:created', {
    report,
    autoSelect: true,
  })

  return {
    success: true,
    reportId: id,
    message: `Report "${title}" created and opened. Use external_report_* functions in execute_typescript to add components.`,
  }
})

/**
 * Tool to list all reports in the current session.
 * Note: Reports are stored in client-side state, so this tool returns
 * information about what reports exist for the LLM's awareness.
 */
export const listReportsTool = toolDefinition({
  name: 'list_reports',
  description:
    'List all reports in the current session. Returns report metadata including IDs and titles.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    message: z.string(),
    hint: z.string(),
  }),
}).server(async () => {
  // Reports are managed client-side, so we can't enumerate them from the server.
  // This tool exists mainly for LLM awareness of the report system.
  return {
    message:
      'Reports are managed in the client UI. Check the reports sidebar to see existing reports.',
    hint: 'Use new_report to create a new report, or reference an existing report ID when adding components.',
  }
})

/**
 * Tool to delete a report by ID.
 */
export const deleteReportTool = toolDefinition({
  name: 'delete_report',
  description:
    'Delete a report by ID. This will remove the report from the UI.',
  inputSchema: z.object({
    reportId: z.string().describe('ID of the report to delete'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
}).server(async ({ reportId }, context?: ToolExecutionContext) => {
  deleteReportState(reportId)
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('report:deleted', { reportId })

  return {
    success: true,
    message: `Report "${reportId}" deleted.`,
  }
})

// Export all report tools as a collection
export const reportTools = [newReportTool, listReportsTool, deleteReportTool]
