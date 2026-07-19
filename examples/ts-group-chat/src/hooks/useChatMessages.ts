import { useState, useEffect, useCallback, type RefObject } from 'react'
import type { RpcStub } from 'capnweb'
import type {
  ChatApi,
  ChatMessage,
  ChatNotification,
  ChatState,
} from '../../chat-server/chat-api'
import type { ChatNotifier } from '@/lib/chat-notifier'

export type { ChatMessage, ChatState }

function notificationToMessage(notification: ChatNotification): ChatMessage {
  return {
    id: notification.id || Math.random().toString(36).slice(2, 11),
    username: notification.username || 'System',
    message: notification.message,
    timestamp: notification.timestamp || new Date().toISOString(),
    type: notification.type,
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

export function useChatMessages(
  api: RpcStub<ChatApi> | null,
  apiRef: RefObject<RpcStub<ChatApi> | null>,
  notifier: ChatNotifier | null,
  isConnected: boolean,
  username: string | null,
) {
  const getApi = useCallback(
    () => apiRef.current ?? api,
    [api, apiRef],
  )
  const [chatState, setChatState] = useState<ChatState>({
    onlineUsers: [],
    messages: [],
  })

  const [isJoined, setIsJoined] = useState(false)

  useEffect(() => {
    if (!notifier) return

    notifier.setHandler((notification: ChatNotification) => {
      setChatState((prev) => {
        const nextMessages = [
          ...prev.messages,
          notificationToMessage(notification),
        ]

        return {
          onlineUsers: notification.onlineUsers ?? prev.onlineUsers,
          messages: nextMessages.slice(-100),
        }
      })
    })
  }, [notifier])

  const sendMessage = useCallback(
    async (messageText: string) => {
      const activeApi = getApi()
      if (!activeApi || !messageText.trim()) {
        return { success: false, error: 'Cannot send empty message' }
      }

      if (!isJoined) {
        return { success: false, error: 'Still joining the chat room…' }
      }

      try {
        await activeApi.sendMessage(messageText)
        return { success: true }
      } catch (error) {
        console.error('Error sending message:', formatError(error), error)
        return {
          success: false,
          error: formatError(error) || 'Failed to send message',
        }
      }
    },
    [getApi, isJoined],
  )

  const joinChat = useCallback(
    async (chatUsername: string) => {
      const activeApi = getApi()
      if (!activeApi) return { success: false, error: 'Not connected' }

      try {
        const result = await activeApi.joinChat(chatUsername)

        setChatState({
          onlineUsers: result.onlineUsers,
          messages: result.recentMessages,
        })

        return { success: true }
      } catch (error) {
        console.error('Error joining chat:', formatError(error), error)
        return {
          success: false,
          error: formatError(error) || 'Failed to join chat',
        }
      }
    },
    [getApi],
  )

  const leaveChat = useCallback(async () => {
    const activeApi = getApi()
    if (!activeApi) return

    try {
      await activeApi.leaveChat()
      setChatState({ onlineUsers: [], messages: [] })
      setIsJoined(false)
    } catch (error) {
      console.error('Error leaving chat:', formatError(error), error)
    }
  }, [getApi])

  useEffect(() => {
    const activeApi = getApi()
    if (!activeApi || !isConnected || !username) return

    let cancelled = false

    const autoJoin = async () => {
      setIsJoined(false)
      try {
        const result = await activeApi.joinChat(username)
        if (cancelled) return

        setChatState({
          onlineUsers: result.onlineUsers,
          messages: result.recentMessages,
        })
        setIsJoined(true)
      } catch (error) {
        if (!cancelled) {
          console.error('Error auto-joining chat:', formatError(error), error)
        }
      }
    }

    void autoJoin()

    return () => {
      cancelled = true
    }
  }, [api, getApi, isConnected, username])

  useEffect(() => {
    if (!username && isJoined && getApi()) {
      void leaveChat()
    }
  }, [username, isJoined, getApi, leaveChat])

  return {
    chatState,
    sendMessage,
    joinChat,
    leaveChat,
    isJoined,
  }
}
