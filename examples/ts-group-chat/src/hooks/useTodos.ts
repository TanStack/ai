import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { RpcStub } from 'capnweb'
import type {
  ChatApi,
  ChatNotification,
  ClaudeMode,
  TodoItem,
} from '../../chat-server/chat-api'
import type { ChatNotifier } from '@/lib/chat-notifier'

function formatError(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

export function useTodos(
  api: RpcStub<ChatApi> | null,
  apiRef: RefObject<RpcStub<ChatApi> | null>,
  notifier: ChatNotifier | null,
  isConnected: boolean,
  isJoined: boolean,
) {
  const getApi = useCallback(() => apiRef.current ?? api, [api, apiRef])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [claudeMode, setClaudeMode] = useState<ClaudeMode>('passive')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!notifier) return

    return notifier.addHandler((notification: ChatNotification) => {
      if (notification.type === 'todos_updated' && notification.todos) {
        setTodos(notification.todos)
      }
      if (
        notification.type === 'claude_mode_changed' &&
        notification.claudeMode
      ) {
        setClaudeMode(notification.claudeMode)
      }
    })
  }, [notifier])

  useEffect(() => {
    const activeApi = getApi()
    if (!activeApi || !isConnected || !isJoined) {
      if (!isJoined) {
        setTodos([])
        setClaudeMode('passive')
      }
      return
    }

    let cancelled = false

    const sync = async () => {
      try {
        const state = await activeApi.getChatState()
        if (cancelled) return
        setTodos(state.todos)
        setClaudeMode(state.claudeMode)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          console.error('Error syncing todos:', formatError(err), err)
          setError(formatError(err))
        }
      }
    }

    void sync()

    return () => {
      cancelled = true
    }
  }, [getApi, isConnected, isJoined])

  const addTodo = useCallback(
    async (text: string) => {
      const activeApi = getApi()
      if (!activeApi || !isJoined) {
        return { success: false as const, error: 'Not joined' }
      }

      try {
        const result = await activeApi.addTodo(text)
        setTodos(result.todos)
        setError(null)
        return { success: true as const, todo: result.todo }
      } catch (err) {
        const message = formatError(err)
        console.error('Error adding todo:', message, err)
        setError(message)
        return { success: false as const, error: message }
      }
    },
    [getApi, isJoined],
  )

  const removeTodo = useCallback(
    async (id: string) => {
      const activeApi = getApi()
      if (!activeApi || !isJoined) {
        return { success: false as const, error: 'Not joined' }
      }

      try {
        const result = await activeApi.removeTodo(id)
        setTodos(result.todos)
        setError(null)
        return { success: result.success }
      } catch (err) {
        const message = formatError(err)
        console.error('Error removing todo:', message, err)
        setError(message)
        return { success: false as const, error: message }
      }
    },
    [getApi, isJoined],
  )

  const updateClaudeMode = useCallback(
    async (mode: ClaudeMode) => {
      const activeApi = getApi()
      if (!activeApi || !isJoined) {
        return { success: false as const, error: 'Not joined' }
      }

      try {
        const result = await activeApi.setClaudeMode(mode)
        setClaudeMode(result.mode)
        setError(null)
        return { success: true as const, mode: result.mode }
      } catch (err) {
        const message = formatError(err)
        console.error('Error setting Claude mode:', message, err)
        setError(message)
        return { success: false as const, error: message }
      }
    },
    [getApi, isJoined],
  )

  return {
    todos,
    claudeMode,
    error,
    addTodo,
    removeTodo,
    setClaudeMode: updateClaudeMode,
  }
}
