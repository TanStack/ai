import { useEffect, useState, useCallback, type RefObject } from 'react'
import type { RpcStub } from 'capnweb'
import type {
  ChatApi,
  ChatNotification,
  ClaudeQueueStatus,
} from '../../chat-server/chat-api'
import type { ChatNotifier } from '@/lib/chat-notifier'

export type { ClaudeQueueStatus }

const idleStatus: ClaudeQueueStatus = {
  current: null,
  queue: [],
  isProcessing: false,
  showResponding: false,
}

export function useClaude(
  api: RpcStub<ChatApi> | null,
  apiRef: RefObject<RpcStub<ChatApi> | null>,
  notifier: ChatNotifier | null,
  isConnected: boolean,
  isJoined: boolean,
) {
  const [queueStatus, setQueueStatus] = useState<ClaudeQueueStatus>(idleStatus)

  const getApi = useCallback(() => apiRef.current ?? api, [api, apiRef])

  useEffect(() => {
    if (!notifier) return

    return notifier.addHandler((notification: ChatNotification) => {
      if (notification.type === 'claude_responding') {
        setQueueStatus((prev) => ({
          ...prev,
          isProcessing: true,
          showResponding: true,
          current: notification.username ?? prev.current,
        }))
        return
      }

      if (notification.type === 'claude_idle') {
        void (async () => {
          const activeApi = getApi()
          if (!activeApi) {
            setQueueStatus(idleStatus)
            return
          }
          try {
            setQueueStatus(await activeApi.getClaudeQueueStatus())
          } catch {
            setQueueStatus(idleStatus)
          }
        })()
      }
    })
  }, [notifier, getApi])

  useEffect(() => {
    const activeApi = getApi()
    if (!activeApi || !isConnected || !isJoined) {
      setQueueStatus(idleStatus)
      return
    }

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
