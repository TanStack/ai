import { useMemo, useState } from 'react'
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  fetchHttpStream,
  useChat,
  xhrHttpStream,
  xhrServerSentEvents,
  type ConnectionAdapter,
} from '@tanstack/ai-react'

const chatUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_CHAT_URL ?? 'http://127.0.0.1:8787/chat'

type TransportKey = 'fetch-http' | 'xhr-sse' | 'xhr-http'

const transportLabels: Record<TransportKey, string> = {
  'fetch-http': 'Fetch HTTP stream',
  'xhr-sse': 'XHR server-sent events',
  'xhr-http': 'XHR HTTP stream',
}

function useConnection(transport: TransportKey): ConnectionAdapter {
  return useMemo(() => {
    switch (transport) {
      case 'fetch-http':
        return fetchHttpStream(chatUrl)
      case 'xhr-sse':
        return xhrServerSentEvents(chatUrl)
      case 'xhr-http':
        return xhrHttpStream(chatUrl)
    }
  }, [transport])
}

export default function App() {
  const [transport, setTransport] = useState<TransportKey>('fetch-http')
  const [input, setInput] = useState('Hello from React Native')
  const connection = useConnection(transport)

  const { messages, sendMessage, isLoading, error, stop } = useChat({
    id: `rn-smoke-${transport}`,
    connection,
  })

  async function send() {
    const next = input.trim()
    if (!next || isLoading) return
    setInput('')
    await sendMessage(next)
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>TanStack AI RN Smoke</Text>
        <Text style={styles.subtitle}>{chatUrl}</Text>
      </View>

      <View style={styles.transportRow}>
        {Object.entries(transportLabels).map(([key, label]) => (
          <Button
            key={key}
            title={label}
            color={transport === key ? '#0f766e' : '#475569'}
            onPress={() => setTransport(key as TransportKey)}
          />
        ))}
      </View>

      <ScrollView style={styles.messages}>
        {messages.map((message) => (
          <View key={message.id} style={styles.message}>
            <Text style={styles.role}>{message.role}</Text>
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <Text key={index} style={styles.part}>
                  {part.content}
                </Text>
              ) : null,
            )}
          </View>
        ))}
        {error ? <Text style={styles.error}>{error.message}</Text> : null}
      </ScrollView>

      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message"
          style={styles.input}
          value={input}
          onChangeText={setInput}
          editable={!isLoading}
          multiline
        />
        <Button
          title={isLoading ? 'Stop' : 'Send'}
          onPress={isLoading ? stop : send}
        />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 16,
    gap: 4,
  },
  title: {
    color: '#0f172a',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#475569',
    fontSize: 12,
  },
  transportRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  messages: {
    flex: 1,
    padding: 16,
  },
  message: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 12,
  },
  role: {
    color: '#0f766e',
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  part: {
    color: '#0f172a',
    lineHeight: 20,
  },
  error: {
    color: '#b91c1c',
  },
  composer: {
    borderTopColor: '#cbd5e1',
    borderTopWidth: 1,
    gap: 8,
    padding: 16,
  },
  input: {
    minHeight: 72,
    borderColor: '#94a3b8',
    borderRadius: 12,
    borderWidth: 1,
    color: '#0f172a',
    padding: 12,
  },
})
