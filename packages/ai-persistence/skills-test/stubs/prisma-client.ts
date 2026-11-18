// Shadows `@prisma/client` for kiira. The real client has no Chat* models
// until `prisma generate`, which these recipes do not run.

export interface ChatThread {
  threadId: string
  messagesJson: string
  updatedAt: bigint
}

export interface ChatRun {
  runId: string
  threadId: string
  status: string
  startedAt: bigint
  finishedAt: bigint | null
  error: string | null
  errorCode: string | null
  usageJson: string | null
  sandboxKey: string | null
  detachedSince: bigint | null
  cancelRequested: boolean | null
  driverEpoch: number | null
  parentRunId: string | null
  subagentRunId: string | null
  name: string | null
}

export interface ChatInterrupt {
  interruptId: string
  runId: string
  threadId: string
  status: string
  requestedAt: bigint
  resolvedAt: bigint | null
  payloadJson: string
  responseJson: string | null
}

export interface ChatMetadata {
  namespace: string
  key: string
  valueJson: string
}

export namespace Prisma {
  export interface ChatRunUpdateManyMutationInput {
    status?: string
    finishedAt?: bigint | null
    error?: string | null
    errorCode?: string | null
    usageJson?: string | null
    sandboxKey?: string | null
    detachedSince?: bigint | null
    cancelRequested?: boolean | null
    driverEpoch?: number | null
  }

  export interface ChatInterruptWhereInput {
    interruptId?: string
    threadId?: string
    runId?: string
    status?: string
  }
}

export interface PrismaClient {
  chatThread: {
    findUnique(args: {
      where: { threadId: string }
    }): Promise<ChatThread | null>
    upsert(args: {
      where: { threadId: string }
      create: { threadId: string; messagesJson: string; updatedAt: bigint }
      update: { messagesJson: string; updatedAt: bigint }
    }): Promise<ChatThread>
  }
  chatRun: {
    findUnique(args: { where: { runId: string } }): Promise<ChatRun | null>
    upsert(args: {
      where: { runId: string }
      create: {
        runId: string
        threadId: string
        status: string
        startedAt: bigint
        parentRunId?: string
        subagentRunId?: string
        name?: string
      }
      update: Record<string, never>
    }): Promise<ChatRun>
    updateMany(args: {
      where: { runId: string }
      data: Prisma.ChatRunUpdateManyMutationInput
    }): Promise<unknown>
    findFirst(args: {
      where: { threadId: string; status: string }
      orderBy: { startedAt: 'desc' }
    }): Promise<ChatRun | null>
    findMany(
      args:
        | {
            where: { threadId: string } | { parentRunId: string }
            orderBy: { startedAt: 'asc' }
          }
        | {
            where: {
              status: string
              detachedSince: { not: null; lte: bigint }
            }
          },
    ): Promise<Array<ChatRun>>
  }
  chatInterrupt: {
    findUnique(args: {
      where: { interruptId: string }
    }): Promise<ChatInterrupt | null>
    findMany(args: {
      where: Prisma.ChatInterruptWhereInput
      orderBy: { requestedAt: 'asc' }
    }): Promise<Array<ChatInterrupt>>
    upsert(args: {
      where: { interruptId: string }
      create: {
        interruptId: string
        runId: string
        threadId: string
        status: string
        requestedAt: bigint
        payloadJson: string
        responseJson?: string
      }
      update: Record<string, never>
    }): Promise<ChatInterrupt>
    updateMany(args: {
      where: { interruptId: string }
      data: { status: string; resolvedAt: bigint; responseJson?: string }
    }): Promise<unknown>
  }
  chatMetadata: {
    findUnique(args: {
      where: { namespace_key: { namespace: string; key: string } }
    }): Promise<ChatMetadata | null>
    upsert(args: {
      where: { namespace_key: { namespace: string; key: string } }
      create: { namespace: string; key: string; valueJson: string }
      update: { valueJson: string }
    }): Promise<ChatMetadata>
    deleteMany(args: {
      where: { namespace: string; key: string }
    }): Promise<unknown>
  }
}
