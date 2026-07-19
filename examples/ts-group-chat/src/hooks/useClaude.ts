import { useEffect, useState, useCallback, type RefObject } from 'react'
import type { RpcStub } from 'capnweb'
import type { ChatApi, ClaudeQueueStatus } from '../../chat-server/chat-api'

export type { ClaudeQueueStatus }

export function useClaude(
  api: RpcStub<ChatApi> | null,
  apiRef: RefObject<RpcStub<ChatApi> | null>,
  isConnected: boolean,
  isJoined: boolean,
) {
  const [queueStatus, setQueueStatus] = useState<ClaudeQueueStatus>({
    current: null,
    queue: [],
    isProcessing: false,
  })

  const getApi = useCallback(
    () => apiRef.current ?? api,
    [api, apiRef],
  )

  useEffect(() => {
    const activeApi = getApi()
    if (!activeApi || !isConnected || !isJoined) return

    const pollStatus = async () => {
      try {
        const status = await activeApi.getClaudeQueueStatus()
        setQueueStatus(status)
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : typeof error === 'object' &&
                error !== null &&
                'message' in error
              ? String((error as { message: unknown }).message)
              : 'Unknown error'
        console.error('Error polling Claude status:', message, error)
      }
    }

    void pollStatus()

    const interval = setInterval(pollStatus, 1000)

    return () => clearInterval(interval)
  }, [getApi, isConnected, isJoined])

  return { queueStatus }
}
