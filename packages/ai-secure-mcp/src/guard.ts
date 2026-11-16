import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { SecureMcpError } from './types'
import type { AnyServerTool, ToolExecutionContext } from '@tanstack/ai'
import type { ApprovalStore } from './approval'
import type { AuditLog } from './audit'
import type { EgressFetch } from './egress'
import type { AccessPolicy, ClientRecord, SecurityNotifier } from './types'

/**
 * The per-request values the envelope injects into `ctx.context`. A tool reads
 * `ctx.context.egress` to reach the network. The guard reads `secure` to know
 * the caller.
 */
export interface SecureRequestContext {
  secure: { client: ClientRecord }
  egress: EgressFetch
}

interface GuardDeps {
  policy: AccessPolicy
  approvals: ApprovalStore
  audit?: AuditLog
  notify: SecurityNotifier
  summarize: (toolName: string, args: unknown) => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads the verified client the outer fetch injected into the tool context. */
function readClient(
  context: ToolExecutionContext<SecureRequestContext> | undefined,
): ClientRecord {
  // Typed as present, but a misuse could still leave it out at runtime.
  const client = context?.context?.secure?.client
  if (client === undefined) {
    throw new SecureMcpError('auth_failure', 'The request is not authenticated.')
  }
  return client
}

/**
 * Wraps each tool with the access guard: scope, then target allowlist, then
 * two-phase approval, then the call. Every outcome is audited. A refusal also
 * pings the notifier.
 */
export function guardTools(
  tools: ReadonlyArray<AnyServerTool>,
  deps: GuardDeps,
): Array<AnyServerTool> {
  return tools.map((tool) => {
    const original = tool.execute
    const execute = async (
      args: unknown,
      context?: ToolExecutionContext<SecureRequestContext>,
    ): Promise<unknown> => {
      const client = readClient(context)

      const scope = deps.policy.scopes?.[tool.name]
      if (scope !== undefined && !client.scopes.includes(scope)) {
        return refuse(deps, client, tool.name, args, 'forbidden_scope', `This token does not hold the "${scope}" scope.`)
      }

      const targetField = deps.policy.targetParam?.[tool.name]
      if (targetField !== undefined && client.targets !== undefined) {
        const value = isRecord(args) ? args[targetField] : undefined
        if (!client.targets.includes(String(value))) {
          return refuse(deps, client, tool.name, args, 'forbidden_scope', 'This token may not reach that target.')
        }
      }

      if (deps.policy.approve?.includes(tool.name)) {
        const summary = deps.summarize(tool.name, args)
        const envelope = deps.approvals.propose({
          owner: client.id,
          summary,
          run: async () => original?.(args, context),
        })
        await deps.audit?.record({
          client: client.id,
          event: 'tool_proposed',
          tool: tool.name,
          outcome: 'ok',
          args,
        })
        void deps.notify.notify({
          kind: 'approval_pending',
          proposalId: envelope.proposalId,
          summary,
        })
        return envelope
      }

      try {
        const result = await original?.(args, context)
        await deps.audit?.record({
          client: client.id,
          event: 'tool_call',
          tool: tool.name,
          outcome: 'ok',
          args,
        })
        return result
      } catch (error) {
        await deps.audit?.record({
          client: client.id,
          event: 'tool_call',
          tool: tool.name,
          outcome: 'error',
          code: error instanceof SecureMcpError ? error.code : undefined,
          args,
        })
        throw error
      }
    }
    return { ...tool, execute }
  })
}

async function refuse(
  deps: GuardDeps,
  client: ClientRecord,
  tool: string,
  args: unknown,
  code: 'forbidden_scope',
  message: string,
): Promise<never> {
  await deps.audit?.record({
    client: client.id,
    event: 'tool_call',
    tool,
    outcome: 'denied',
    code,
    args,
  })
  void deps.notify.notify({ kind: 'forbidden_scope', client: client.id, tool })
  throw new SecureMcpError(code, message)
}

/**
 * Builds the `approve_proposal` tool. A client confirms its own pending
 * proposal by id; the stored action then runs host-side.
 */
export function createConfirmTool(deps: {
  approvals: ApprovalStore
  audit?: AuditLog
}): AnyServerTool {
  const tool: AnyServerTool = toolDefinition({
    name: 'approve_proposal',
    description:
      'Confirm a pending approval by its proposalId. Runs the proposed action.',
    inputSchema: z.object({
      proposalId: z.string().describe('The id from an approval_required reply.'),
    }),
  }).server<SecureRequestContext>(async ({ proposalId }, context) => {
    const client = readClient(context)
    const result = await deps.approvals.confirm(proposalId, client.id)
    await deps.audit?.record({
      client: client.id,
      event: 'approval_confirmed',
      outcome: 'ok',
      args: { proposalId },
    })
    return { confirmed: true, result }
  })
  return tool
}
