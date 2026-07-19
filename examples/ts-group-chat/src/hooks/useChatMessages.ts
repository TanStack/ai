import { useState, useEffect, useCallback, type RefObject } from 'react'
import type { RpcStub } from 'capnweb'
import type {
  ChatApi,
  ChatMessage,
  ChatNotification,
  ChatRoomState,
} from '../../chat-server/chat-api'
import type { ChatNotifier } from '@/lib/chat-notifier'

export type { ChatMessage, ChatRoomState }

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
  const [chatState, setChatState] = useState<ChatRoomState>({
    onlineUsers: [],
    messages: [],
  })

  const [isJoined, setIsJoined] = useState(false)

  useEffect(() => {
    if (!notifier) return

    return notifier.addHandler((notification: ChatNotification) => {
      // Status / sync events — not chat lines
      if (
        notification.type === 'todos_updated' ||
        notification.type === 'claude_mode_changed' ||
        notification.type === 'claude_responding' ||
        notification.type === 'claude_idle'
      ) {
        return
      }

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
        await activeApi.leaveChat()
        const result = await activeApi.joinChat(chatUsername)

        setChatState({
          onlineUsers: result.onlineUsers,
          messages: result.recentMessages,
        })
        setIsJoined(true)

        return { success: true }
      } catch (error) {
        console.error('Error joining chat:', formatError(error), error)
        setIsJoined(false)
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
    if (!activeApi || !isConnected) return

    let cancelled = false

    const switchPersona = async () => {
      setIsJoined(false)

      try {
        // Always leave first so the previous persona is removed from the room.
        await activeApi.leaveChat()
        if (cancelled) return

        if (!username) {
          setChatState({ onlineUsers: [], messages: [] })
          return
        }

        const result = await activeApi.joinChat(username)
        if (cancelled) return

        setChatState({
          onlineUsers: result.onlineUsers,
          messages: result.recentMessages,
        })
        setIsJoined(true)
      } catch (error) {
        if (!cancelled) {
          console.error(
            'Error switching chat persona:',
            formatError(error),
            error,
          )
        }
      }
    }

    void switchPersona()

    return () => {
      cancelled = true
    }
  }, [api, getApi, isConnected, username])

  return {
    chatState,
    sendMessage,
    joinChat,
    leaveChat,
    isJoined,
  }
}
