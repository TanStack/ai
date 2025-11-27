import { useEffect, useState } from 'react'
import type { ChatAPI } from './useChatConnection'

export interface ClaudeQueueStatus {
  current: string | null
  queue: string[]
  isProcessing: boolean
}

export function useClaude(api: ChatAPI | null, isConnected: boolean) {
  const [queueStatus, setQueueStatus] = useState<ClaudeQueueStatus>({
    current: null,
    queue: [],
    isProcessing: false,
  })

  // Poll for queue status
  useEffect(() => {
    if (!api || !isConnected) return

    const pollStatus = async () => {
      try {
        const status = await api.getClaudeQueueStatus()
        setQueueStatus(status)
      } catch (error) {
        console.error('Error polling Claude status:', error)
      }
    }

    // Poll immediately
    pollStatus()

    // Then poll every second
    const interval = setInterval(pollStatus, 1000)

    return () => clearInterval(interval)
  }, [api, isConnected])

  return { queueStatus }
}
