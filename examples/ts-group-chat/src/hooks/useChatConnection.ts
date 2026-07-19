import { useState, useRef, useCallback, useEffect } from 'react'
import { newWebSocketRpcSession } from 'capnweb'
import type { RpcStub } from 'capnweb'
import type { ChatApi } from '../../chat-server/chat-api'
import { ChatNotifier } from '@/lib/chat-notifier'

export interface ConnectionState {
  isConnected: boolean
  isConnecting: boolean
  connectionStatus: string
  error: string | null
}

export function useChatConnection() {
  const [state, setState] = useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    connectionStatus: 'Disconnected',
    error: null,
  })

  const [api, setApi] = useState<RpcStub<ChatApi> | null>(null)
  const [notifier, setNotifier] = useState<ChatNotifier | null>(null)
  const apiRef = useRef<RpcStub<ChatApi> | null>(null)
  const connectingRef = useRef(false)
  const connectionIdRef = useRef(0)

  const disconnect = useCallback(() => {
    connectionIdRef.current += 1
    connectingRef.current = false
    if (apiRef.current) {
      apiRef.current[Symbol.dispose]()
      apiRef.current = null
    }
    setApi(null)
    setNotifier(null)
    setState({
      isConnected: false,
      isConnecting: false,
      connectionStatus: 'Disconnected',
      error: null,
    })
  }, [])

  const connect = useCallback(() => {
    if (connectingRef.current || apiRef.current) {
      return
    }

    connectingRef.current = true
    const connectionId = ++connectionIdRef.current
    const sessionNotifier = new ChatNotifier()

    setState((prev) => ({
      ...prev,
      isConnecting: true,
      connectionStatus: 'Connecting...',
      error: null,
    }))

    try {
      const protocol =
        typeof window !== 'undefined' && window.location.protocol === 'https:'
          ? 'wss:'
          : 'ws:'
      const wsUrl =
        typeof window !== 'undefined'
          ? `${protocol}//${window.location.host}/api/websocket`
          : 'ws://localhost:3000/api/websocket'

      console.log('Connecting to chat:', wsUrl)

      const stub = newWebSocketRpcSession<ChatApi>(wsUrl, sessionNotifier)
      apiRef.current = stub

      void (async () => {
        try {
          const chatState = await stub.getChatState()
          if (connectionId !== connectionIdRef.current) {
            stub[Symbol.dispose]()
            return
          }
          if (!chatState || !Array.isArray(chatState.onlineUsers)) {
            throw new Error('Invalid chat state from server')
          }

          console.log('Chat RPC connection established')
          setNotifier(sessionNotifier)
          setApi(stub)
          connectingRef.current = false
          setState({
            isConnected: true,
            isConnecting: false,
            connectionStatus: 'Connected',
            error: null,
          })
        } catch (error) {
          if (connectionId !== connectionIdRef.current) {
            stub[Symbol.dispose]()
            return
          }
          console.error('Chat connection failed:', error)
          stub[Symbol.dispose]()
          apiRef.current = null
          setApi(null)
          setNotifier(null)
          connectingRef.current = false
          setState({
            isConnected: false,
            isConnecting: false,
            connectionStatus: 'Failed to connect',
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      })()
    } catch (error) {
      connectingRef.current = false
      console.error('Failed to create chat session:', error)
      setState({
        isConnected: false,
        isConnecting: false,
        connectionStatus: 'Failed to connect',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }, [])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    ...state,
    api,
    apiRef,
    notifier,
    connect,
    disconnect,
  }
}
