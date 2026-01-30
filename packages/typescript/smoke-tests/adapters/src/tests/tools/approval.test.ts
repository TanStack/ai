import { describe, expect, it, vi } from 'vitest'
import { chat, maxIterations, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { SimulatorScripts, createLLMSimulator } from '../../llm-simulator'
import type { SimulatorScript } from '../../llm-simulator'

/**
 * Helper to collect all chunks from a stream
 */
async function collectChunks<T>(stream: AsyncIterable<T>): Promise<Array<T>> {
  const chunks: Array<T> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

describe('Approval Flow Tests', () => {
  describe('Approval Requested', () => {
    it('should emit approval-requested for tools with needsApproval', async () => {
      const script = SimulatorScripts.approvalTool(
        'delete_file',
        { path: '/tmp/important.txt' },
        'The file has been deleted.',
      )
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async (args: { path: string }) => {
        return JSON.stringify({ deleted: true, path: args.path })
      })

      const deleteTool = toolDefinition({
        name: 'delete_file',
        description: 'Delete a file from the filesystem',
        inputSchema: z.object({
          path: z.string().describe('The file path to delete'),
        }),
        needsApproval: true,
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Delete /tmp/important.txt' }],
        tools: [deleteTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should have approval-requested chunk (emitted as CUSTOM event)
      const approvalChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'approval-requested',
      )
      expect(approvalChunks.length).toBe(1)

      const approvalChunk = approvalChunks[0] as any
      expect(approvalChunk.data.toolName).toBe('delete_file')
      expect(approvalChunk.data.input).toEqual({ path: '/tmp/important.txt' })
      expect(approvalChunk.data.approval.needsApproval).toBe(true)

      // Tool should NOT be executed yet (waiting for approval)
      expect(executeFn).not.toHaveBeenCalled()
    })

    it('should stop iteration when approval is needed', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'I will delete the file for you.',
            toolCalls: [
              { name: 'dangerous_action', arguments: { confirm: true } },
            ],
          },
          {
            content: 'Action completed.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async () => 'done')

      const tool = toolDefinition({
        name: 'dangerous_action',
        description: 'A dangerous action requiring approval',
        inputSchema: z.object({ confirm: z.boolean() }),
        needsApproval: true,
      }).server(executeFn)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Do the dangerous thing' }],
        tools: [tool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should stop after first iteration
      const finishedChunks = chunks.filter((c) => c.type === 'RUN_FINISHED')
      expect(finishedChunks.length).toBeGreaterThanOrEqual(1)

      // Tool should not be executed
      expect(executeFn).not.toHaveBeenCalled()

      // Simulator should be waiting at iteration 1
      expect(adapter.getCurrentIteration()).toBe(1)
    })
  })

  describe('Approval Accepted', () => {
    it('should execute tool when approval is granted via messages', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            // After receiving approval, LLM responds
            content: 'The file has been successfully deleted.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async (args: { path: string }) => {
        return JSON.stringify({ deleted: true, path: args.path })
      })

      const deleteTool = toolDefinition({
        name: 'delete_file',
        description: 'Delete a file',
        inputSchema: z.object({ path: z.string() }),
        needsApproval: true,
      }).server(executeFn)

      // Messages with approval already granted
      const messagesWithApproval = [
        { role: 'user' as const, content: 'Delete /tmp/test.txt' },
        {
          role: 'assistant' as const,
          content: 'I will delete the file.',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function' as const,
              function: {
                name: 'delete_file',
                arguments: '{"path":"/tmp/test.txt"}',
              },
            },
          ],
          parts: [
            {
              type: 'tool-call' as const,
              id: 'call-1',
              name: 'delete_file',
              arguments: '{"path":"/tmp/test.txt"}',
              state: 'approval-responded' as const,
              approval: {
                id: 'approval_call-1',
                needsApproval: true,
                approved: true, // User approved
              },
            },
          ],
        },
      ]

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: messagesWithApproval,
        tools: [deleteTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Tool should have been executed because approval was granted
      expect(executeFn).toHaveBeenCalledTimes(1)
      expect(executeFn).toHaveBeenCalledWith({ path: '/tmp/test.txt' })

      // Should have tool_result chunk
      const toolResultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolResultChunks.length).toBe(1)
    })
  })

  describe('Approval Denied', () => {
    it('should not execute tool when approval is denied', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'I understand. I will not delete the file.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeFn = vi.fn(async () => 'deleted')

      const deleteTool = toolDefinition({
        name: 'delete_file',
        description: 'Delete a file',
        inputSchema: z.object({ path: z.string() }),
        needsApproval: true,
      }).server(executeFn)

      // Messages with approval denied
      const messagesWithDenial = [
        { role: 'user' as const, content: 'Delete /tmp/test.txt' },
        {
          role: 'assistant' as const,
          content: 'I will delete the file.',
          toolCalls: [
            {
              id: 'call-1',
              type: 'function' as const,
              function: {
                name: 'delete_file',
                arguments: '{"path":"/tmp/test.txt"}',
              },
            },
          ],
          parts: [
            {
              type: 'tool-call' as const,
              id: 'call-1',
              name: 'delete_file',
              arguments: '{"path":"/tmp/test.txt"}',
              state: 'approval-responded' as const,
              approval: {
                id: 'approval_call-1',
                needsApproval: true,
                approved: false, // User denied
              },
            },
          ],
        },
      ]

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: messagesWithDenial,
        tools: [deleteTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Tool should NOT have been executed
      expect(executeFn).not.toHaveBeenCalled()

      // Should have content response
      const contentChunks = chunks.filter(
        (c) => c.type === 'TEXT_MESSAGE_CONTENT',
      )
      expect(contentChunks.length).toBeGreaterThan(0)
    })
  })

  describe('Multiple Approval Tools', () => {
    it('should handle multiple tools requiring approval', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'I need to perform two dangerous operations.',
            toolCalls: [
              { name: 'tool_a', arguments: { value: 'A' } },
              { name: 'tool_b', arguments: { value: 'B' } },
            ],
          },
          {
            content: 'Both operations completed.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const executeFnA = vi.fn(async () => 'A done')
      const executeFnB = vi.fn(async () => 'B done')

      const toolA = toolDefinition({
        name: 'tool_a',
        description: 'Tool A',
        inputSchema: z.object({ value: z.string() }),
        needsApproval: true,
      }).server(executeFnA)

      const toolB = toolDefinition({
        name: 'tool_b',
        description: 'Tool B',
        inputSchema: z.object({ value: z.string() }),
        needsApproval: true,
      }).server(executeFnB)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Do both operations' }],
        tools: [toolA, toolB],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Should have approval-requested for both tools (emitted as CUSTOM events)
      const approvalChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'approval-requested',
      )
      expect(approvalChunks.length).toBe(2)

      // Neither tool should be executed
      expect(executeFnA).not.toHaveBeenCalled()
      expect(executeFnB).not.toHaveBeenCalled()
    })
  })

  describe('Mixed Approval and Non-Approval Tools', () => {
    it('should execute non-approval tools and request approval for approval tools', async () => {
      const script: SimulatorScript = {
        iterations: [
          {
            content: 'I will check status and then delete.',
            toolCalls: [
              { name: 'check_status', arguments: { id: '123' } },
              { name: 'delete_item', arguments: { id: '123' } },
            ],
          },
          {
            content: 'Done.',
          },
        ],
      }
      const adapter = createLLMSimulator(script)

      const checkExecute = vi.fn(async () => ({ status: 'active' }))
      const deleteExecute = vi.fn(async () => ({ deleted: true }))

      const checkTool = toolDefinition({
        name: 'check_status',
        description: 'Check status',
        inputSchema: z.object({ id: z.string() }),
        // No needsApproval - will execute immediately
      }).server(checkExecute)

      const deleteTool = toolDefinition({
        name: 'delete_item',
        description: 'Delete item',
        inputSchema: z.object({ id: z.string() }),
        needsApproval: true, // Needs approval
      }).server(deleteExecute)

      const stream = chat({
        adapter,
        model: 'simulator-model',
        messages: [{ role: 'user', content: 'Check and delete 123' }],
        tools: [checkTool, deleteTool],
        agentLoopStrategy: maxIterations(10),
      })

      const chunks = await collectChunks(stream)

      // Non-approval tool should execute
      expect(checkExecute).toHaveBeenCalledTimes(1)

      // Approval tool should NOT execute (waiting for approval)
      expect(deleteExecute).not.toHaveBeenCalled()

      // Should have approval request for delete tool (emitted as CUSTOM event)
      const approvalChunks = chunks.filter(
        (c: any) => c.type === 'CUSTOM' && c.name === 'approval-requested',
      )
      expect(approvalChunks.length).toBe(1)
      expect((approvalChunks[0] as any).data.toolName).toBe('delete_item')

      // Check tool should have been executed (verify via mock call)
      expect(checkExecute).toHaveBeenCalledWith({ id: '123' })
    })
  })
})
