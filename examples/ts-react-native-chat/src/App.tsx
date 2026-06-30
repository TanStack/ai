import { useMemo, useState } from 'react'
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
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
  type UIMessage,
} from '@tanstack/ai-react'

const baseUrl =
  process.env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL ?? 'http://127.0.0.1:8787'

const expectedFetchErrorMessage =
  'This phone runtime cannot stream with fetch; choose XHR HTTP or XHR SSE.'

const starterPrompts = [
  'Make it vegan',
  'Remove mushrooms',
  'Add more protein',
  'Dinner for 4',
]

const transports = [
  {
    key: 'fetch-http',
    label: 'Fetch',
    shortLabel: 'Fetch',
    description: 'Try this only on phone runtimes that support it.',
    endpoint: '/chat/http',
  },
  {
    key: 'xhr-http',
    label: 'XHR HTTP',
    shortLabel: 'XHR HTTP',
    description: 'Recommended for most phones and emulators.',
    endpoint: '/chat/http',
  },
  {
    key: 'xhr-sse',
    label: 'XHR SSE',
    shortLabel: 'XHR SSE',
    description: 'Alternate phone-friendly delivery mode.',
    endpoint: '/chat/sse',
  },
] as const

type TransportKey = (typeof transports)[number]['key']
type MessagePart = UIMessage['parts'][number]
type StructuredRecipePart = Extract<MessagePart, { type: 'structured-output' }>

type RecipeValue = {
  title?: unknown
  summary?: unknown
  servings?: unknown
  totalMinutes?: unknown
  tags?: unknown
  ingredients?: unknown
  steps?: unknown
  tips?: unknown
  warnings?: unknown
  allergens?: unknown
  revision?: unknown
  fromPrompt?: unknown
}

function endpointUrl(path: string): string {
  return `${baseUrl}${path}`
}

function useConnection(transport: TransportKey): ConnectionAdapter {
  return useMemo(() => {
    const selected = transports.find((item) => item.key === transport)
    const url = endpointUrl(selected?.endpoint ?? '/chat/http')

    switch (transport) {
      case 'fetch-http':
        return fetchHttpStream(url)
      case 'xhr-http':
        return xhrHttpStream(url)
      case 'xhr-sse':
        return xhrServerSentEvents(url)
    }
  }, [transport])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'Not available yet'
  if (typeof value === 'string') return value
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value)
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return '[Unserializable value]'
  }
}

function valueToString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return formatValue(value)
}

function itemToString(item: unknown): string | undefined {
  if (!isRecord(item)) return valueToString(item)

  const amount = valueToString(item.amount)
  const name = valueToString(item.name)
  const title = valueToString(item.title)
  const text = valueToString(item.text)
  const minutes = valueToString(item.minutes)
  const pantry = item.pantry === true ? 'pantry' : undefined

  if (amount || name) {
    return [amount, name, pantry ? `(${pantry})` : undefined]
      .filter(Boolean)
      .join(' ')
  }

  if (title || text || minutes) {
    const body = [title, text].filter(Boolean).join(': ')
    return minutes ? `${body} (${minutes} min)` : body
  }

  return valueToString(item)
}

function valueToList(value: unknown): Array<string> {
  if (Array.isArray(value)) {
    return value
      .map((item) => itemToString(item))
      .filter((item): item is string => Boolean(item))
  }

  const item = itemToString(value)
  return item ? [item] : []
}

function dedupeLabels(labels: Array<string>): Array<string> {
  const seen = new Set<string>()

  return labels.filter((label) => {
    const key = label.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseRawRecipe(raw: string | undefined): RecipeValue | undefined {
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function getRecipeSource(part?: StructuredRecipePart): RecipeValue | undefined {
  if (!part) return undefined

  if (isRecord(part.data)) return part.data
  if (isRecord(part.partial)) return part.partial
  return parseRawRecipe(part.raw)
}

function findLatestRecipePart(
  messages: Array<UIMessage>,
): StructuredRecipePart | undefined {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type === 'structured-output') return part
    }
  }

  return undefined
}

function isExpectedFetchStreamingError(error: Error | undefined): boolean {
  if (!error) return false
  return (
    error.name === 'UnsupportedResponseStreamError' ||
    error.message.includes('Response.body') ||
    error.message.includes('response.body')
  )
}

function RecipeMetaPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaPillLabel}>{label}</Text>
      <Text style={styles.metaPillValue}>{value}</Text>
    </View>
  )
}

function TagRail({ tags }: { tags: Array<string> }) {
  if (tags.length === 0) return null

  return (
    <View style={styles.tagRail}>
      {tags.map((tag, index) => (
        <Text key={`${tag}-${index}`} style={styles.recipeTag}>
          {tag}
        </Text>
      ))}
    </View>
  )
}

function IngredientChecklist({ items }: { items: Array<string> }) {
  if (items.length === 0) {
    return (
      <View style={styles.emptyRecipeSection}>
        <Text style={styles.emptySectionText}>
          Gathering ingredients for your recipe.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.ingredientCard}>
      <Text style={styles.sectionTitle}>Ingredients</Text>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.ingredientRow}>
          <View style={styles.checkbox} />
          <Text style={styles.ingredientText}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

function StepCards({ steps }: { steps: Array<string> }) {
  if (steps.length === 0) {
    return (
      <View style={styles.emptyRecipeSection}>
        <Text style={styles.emptySectionText}>Drafting the cooking steps.</Text>
      </View>
    )
  }

  return (
    <View style={styles.stepStack}>
      <Text style={styles.sectionTitle}>Method</Text>
      {steps.map((step, index) => (
        <View key={`${step}-${index}`} style={styles.stepCard}>
          <Text style={styles.stepNumber}>{index + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  )
}

function NoteSection({
  title,
  items,
  tone = 'sage',
}: {
  title: string
  items: Array<string>
  tone?: 'sage' | 'tomato'
}) {
  if (items.length === 0) return null

  return (
    <View
      style={[
        styles.noteSection,
        tone === 'tomato' ? styles.tomatoNote : styles.sageNote,
      ]}
    >
      <Text style={styles.noteTitle}>{title}</Text>
      {items.map((item, index) => (
        <Text key={`${title}-${index}`} style={styles.noteText}>
          {item}
        </Text>
      ))}
    </View>
  )
}

function RecipeHero({
  part,
  isLoading,
}: {
  part?: StructuredRecipePart
  isLoading: boolean
}) {
  const recipe = getRecipeSource(part)
  const preparing = isLoading || part?.status === 'streaming'
  const title =
    valueToString(recipe?.title) ??
    (preparing ? 'Preparing your recipe...' : 'Your next recipe starts here')
  const summary =
    valueToString(recipe?.summary) ??
    (preparing
      ? 'Building a clear recipe with ingredients, steps, timing, and notes.'
      : 'Ask for a dinner idea, then revise it with follow-up prompts. Your latest recipe appears here.')
  const servings = valueToString(recipe?.servings)
  const totalMinutes = valueToString(recipe?.totalMinutes)
  const revision = valueToString(recipe?.revision)
  const tags = valueToList(recipe?.tags)
  const ingredients = valueToList(recipe?.ingredients)
  const steps = valueToList(recipe?.steps)
  const tips = valueToList(recipe?.tips)
  const warnings = [
    ...valueToList(recipe?.warnings),
    ...valueToList(recipe?.allergens),
  ]
  const prompts = valueToList(recipe?.fromPrompt)
  const tagLabels = dedupeLabels([...tags, ...prompts])

  return (
    <View
      style={[styles.recipeHero, preparing ? styles.recipeHeroPreparing : null]}
    >
      <View style={styles.heroTopRow}>
        <Text style={styles.heroEyebrow}>
          {preparing ? 'Preparing your recipe...' : 'Recipe card'}
        </Text>
        {revision ? (
          <Text style={styles.revisionBadge}>Revision {revision}</Text>
        ) : null}
      </View>

      {preparing ? (
        <View style={styles.preparingBanner}>
          <Text style={styles.preparingTitle}>
            {recipe ? 'Updating your recipe' : 'Starting a fresh recipe'}
          </Text>
          <Text style={styles.preparingText}>
            {recipe
              ? 'New ingredients and steps will replace this card as soon as they are ready.'
              : 'Preparing your recipe card now.'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.recipeTitle}>{title}</Text>
      <Text style={styles.recipeSummary}>{summary}</Text>

      <View style={styles.metaRail}>
        {totalMinutes ? (
          <RecipeMetaPill label="Total" value={`${totalMinutes} min`} />
        ) : null}
        {servings ? <RecipeMetaPill label="Serves" value={servings} /> : null}
        <RecipeMetaPill
          label="Recipe"
          value={preparing ? 'Preparing' : recipe ? 'Ready' : 'Waiting'}
        />
      </View>

      <TagRail tags={tagLabels} />
      <IngredientChecklist items={ingredients} />
      <StepCards steps={steps} />
      <NoteSection title="Cook's notes" items={tips} />
      <NoteSection
        title="Warnings and allergens"
        items={warnings}
        tone="tomato"
      />

      {part?.errorMessage ? (
        <Text style={styles.errorText}>
          We could not finish this recipe card. Try again or simplify the
          request.
        </Text>
      ) : null}
    </View>
  )
}

function UserRequest({ message }: { message: UIMessage }) {
  const text = message.parts
    .filter((part): part is Extract<MessagePart, { type: 'text' }> => {
      return part.type === 'text'
    })
    .map((part) => part.content)
    .join('\n')

  if (!text) return null

  return (
    <View style={styles.requestBubble}>
      <Text style={styles.requestLabel}>Request</Text>
      <Text style={styles.requestText}>{text}</Text>
    </View>
  )
}

function RequestHistory({ messages }: { messages: Array<UIMessage> }) {
  const userMessages = messages.filter((message) => message.role === 'user')

  if (userMessages.length === 0) return null

  return (
    <View style={styles.requestSection}>
      <Text style={styles.panelTitle}>Requests</Text>
      <View style={styles.requestList}>
        {userMessages.map((message) => (
          <UserRequest key={message.id} message={message} />
        ))}
      </View>
    </View>
  )
}

export default function App() {
  const [transport, setTransport] = useState<TransportKey>('xhr-http')
  const [input, setInput] = useState('15-minute veggie dinner')
  const connection = useConnection(transport)
  const selectedTransport =
    transports.find((item) => item.key === transport) ?? transports[1]

  const {
    messages,
    sendMessage,
    isLoading,
    error,
    stop,
    reload,
    clear,
    sessionGenerating,
  } = useChat({
    id: `rn-recipe-book-${transport}`,
    connection,
  })

  async function send(nextPrompt = input) {
    const next = nextPrompt.trim()
    if (!next || isLoading) return
    setInput('')
    await sendMessage(next)
  }

  async function reloadLast() {
    if (isLoading || messages.length === 0) return
    await reload()
  }

  function clearChat() {
    clear()
  }

  const latestRecipePart = findLatestRecipePart(messages)
  const expectedFetchError = isExpectedFetchStreamingError(error)
  const displayedError = expectedFetchError
    ? expectedFetchErrorMessage
    : error?.message

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.backgroundSauce} />
      <View style={styles.backgroundSage} />

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TanStack AI recipes</Text>
          <Text style={styles.title}>Weeknight Kitchen</Text>
          <Text style={styles.subtitle}>
            Ask for dinner, then revise the recipe card until it fits your
            pantry, taste, and table.
          </Text>
        </View>

        <View style={styles.connectionPanel}>
          <View style={styles.connectionHeader}>
            <View>
              <Text style={styles.panelTitle}>Testing mode</Text>
              <Text style={styles.panelCopy}>
                {selectedTransport.description}
              </Text>
            </View>
            <Text style={styles.connectionBadge}>
              {sessionGenerating || isLoading ? 'Cooking' : 'Ready'}
            </Text>
          </View>
          <View style={styles.transportRail}>
            {transports.map((item) => {
              const active = item.key === transport
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={item.key}
                  onPress={() => setTransport(item.key)}
                  style={[
                    styles.transportButton,
                    active ? styles.activeTransportButton : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.transportButtonText,
                      active ? styles.activeTransportButtonText : null,
                    ]}
                  >
                    {item.shortLabel}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {displayedError ? (
          <View
            style={[
              styles.banner,
              expectedFetchError ? styles.expectedBanner : styles.errorBanner,
            ]}
          >
            <Text style={styles.bannerTitle}>
              {expectedFetchError ? 'Fetch unsupported here' : 'Recipe alert'}
            </Text>
            <Text style={styles.bannerText}>{displayedError}</Text>
          </View>
        ) : null}

        <RecipeHero part={latestRecipePart} isLoading={isLoading} />
        <RequestHistory messages={messages} />
      </ScrollView>

      <View style={styles.composer}>
        <View style={styles.starterRail}>
          {starterPrompts.map((prompt) => (
            <Pressable
              accessibilityRole="button"
              disabled={isLoading}
              key={prompt}
              onPress={() => {
                if (messages.length === 0) {
                  void send(prompt)
                } else {
                  setInput(prompt)
                }
              }}
              style={[
                styles.starterChip,
                isLoading ? styles.disabledAction : null,
              ]}
            >
              <Text style={styles.starterChipText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          accessibilityLabel="Recipe prompt"
          style={styles.input}
          value={input}
          onChangeText={setInput}
          editable={!isLoading}
          multiline
          placeholder="Ask for a recipe or revision..."
          placeholderTextColor={colors.cocoaMuted}
        />
        <View style={styles.composerActions}>
          <Pressable
            accessibilityRole="button"
            onPress={isLoading ? stop : () => void send()}
            style={[styles.primaryAction, isLoading ? styles.stopAction : null]}
          >
            <Text style={styles.primaryActionText}>
              {isLoading ? 'Stop' : 'Create recipe'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isLoading || messages.length === 0}
            onPress={reloadLast}
            style={[
              styles.secondaryAction,
              isLoading || messages.length === 0 ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.secondaryActionText}>Retry</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={messages.length === 0}
            onPress={clearChat}
            style={[
              styles.secondaryAction,
              messages.length === 0 ? styles.disabledAction : null,
            ]}
          >
            <Text style={styles.secondaryActionText}>Clear</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const colors = {
  ink: '#2a1a12',
  cocoa: '#543225',
  cocoaMuted: '#8f6652',
  line: '#d7b98f',
  parchment: '#fbefd3',
  card: '#fffaf0',
  tomato: '#c84f32',
  tomatoSoft: '#ffe1d4',
  olive: '#687a3e',
  oliveDark: '#3f4b25',
  sage: '#dce7c8',
  butter: '#f2c96b',
  white: '#fffdf7',
  danger: '#b83a2f',
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.parchment,
  },
  backgroundSauce: {
    position: 'absolute',
    right: -76,
    top: 52,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: colors.tomatoSoft,
    opacity: 0.82,
  },
  backgroundSage: {
    position: 'absolute',
    left: -54,
    top: 190,
    width: 138,
    height: 138,
    borderRadius: 69,
    backgroundColor: colors.sage,
    opacity: 0.86,
  },
  page: {
    flex: 1,
  },
  pageContent: {
    gap: 14,
    padding: 16,
    paddingBottom: 22,
  },
  header: {
    gap: 8,
    paddingTop: 8,
  },
  eyebrow: {
    color: colors.oliveDark,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.3,
    lineHeight: 43,
  },
  subtitle: {
    color: colors.cocoa,
    fontSize: 15,
    lineHeight: 21,
    maxWidth: 560,
  },
  connectionPanel: {
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 250, 240, 0.88)',
    gap: 10,
    padding: 14,
  },
  connectionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  panelCopy: {
    color: colors.cocoaMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  connectionBadge: {
    borderColor: colors.olive,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.oliveDark,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    textTransform: 'uppercase',
  },
  transportRail: {
    flexDirection: 'row',
    gap: 8,
  },
  transportButton: {
    flex: 1,
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.white,
    paddingVertical: 8,
  },
  activeTransportButton: {
    borderColor: colors.oliveDark,
    backgroundColor: colors.oliveDark,
  },
  transportButtonText: {
    color: colors.cocoa,
    fontSize: 12,
    fontWeight: '900',
  },
  activeTransportButtonText: {
    color: colors.white,
  },
  banner: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 13,
    gap: 5,
  },
  expectedBanner: {
    borderColor: colors.tomato,
    backgroundColor: '#fff2bf',
  },
  errorBanner: {
    borderColor: colors.danger,
    backgroundColor: colors.tomatoSoft,
  },
  bannerTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  bannerText: {
    color: colors.cocoa,
    fontSize: 13,
    lineHeight: 18,
  },
  recipeHero: {
    borderColor: colors.line,
    borderRadius: 34,
    borderWidth: 1,
    backgroundColor: colors.card,
    gap: 15,
    padding: 18,
    shadowColor: colors.cocoa,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 3,
  },
  recipeHeroPreparing: {
    borderColor: colors.tomato,
    shadowColor: colors.tomato,
    shadowOpacity: 0.18,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    color: colors.tomato,
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  revisionBadge: {
    borderRadius: 999,
    backgroundColor: colors.sage,
    color: colors.oliveDark,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  preparingBanner: {
    borderColor: colors.butter,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#fff2bf',
    gap: 4,
    padding: 12,
  },
  preparingTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  preparingText: {
    color: colors.cocoa,
    fontSize: 13,
    lineHeight: 18,
  },
  recipeTitle: {
    color: colors.ink,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 36,
  },
  recipeSummary: {
    color: colors.cocoa,
    fontSize: 15,
    lineHeight: 22,
  },
  metaRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaPill: {
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    backgroundColor: colors.white,
    minWidth: 88,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  metaPillLabel: {
    color: colors.cocoaMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metaPillValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  tagRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  recipeTag: {
    borderRadius: 999,
    backgroundColor: colors.tomatoSoft,
    color: colors.tomato,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  ingredientCard: {
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: colors.white,
    gap: 10,
    padding: 14,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  ingredientRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderColor: colors.olive,
    borderRadius: 5,
    borderWidth: 2,
    marginTop: 1,
  },
  ingredientText: {
    color: colors.cocoa,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  stepStack: {
    gap: 10,
  },
  stepCard: {
    borderColor: colors.line,
    borderRadius: 21,
    borderWidth: 1,
    backgroundColor: '#fff5dc',
    flexDirection: 'row',
    gap: 12,
    padding: 13,
  },
  stepNumber: {
    color: colors.tomato,
    fontSize: 20,
    fontWeight: '900',
    minWidth: 24,
  },
  stepText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  emptyRecipeSection: {
    borderColor: colors.line,
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    backgroundColor: 'rgba(255, 253, 247, 0.62)',
    padding: 13,
  },
  emptySectionText: {
    color: colors.cocoaMuted,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  noteSection: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 7,
    padding: 13,
  },
  sageNote: {
    borderColor: colors.olive,
    backgroundColor: colors.sage,
  },
  tomatoNote: {
    borderColor: colors.tomato,
    backgroundColor: colors.tomatoSoft,
  },
  noteTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  noteText: {
    color: colors.cocoa,
    fontSize: 13,
    lineHeight: 19,
  },
  requestSection: {
    gap: 9,
  },
  requestList: {
    gap: 8,
  },
  requestBubble: {
    alignSelf: 'flex-end',
    maxWidth: '88%',
    borderRadius: 20,
    backgroundColor: colors.tomato,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  requestLabel: {
    color: '#ffe9de',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  requestText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 3,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '800',
  },
  composer: {
    borderTopColor: colors.line,
    borderTopWidth: 1,
    backgroundColor: colors.card,
    gap: 10,
    padding: 14,
  },
  starterRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  starterChip: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: colors.parchment,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  starterChipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  input: {
    minHeight: 66,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    padding: 13,
  },
  composerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryAction: {
    flex: 1.4,
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: colors.tomato,
    paddingVertical: 13,
  },
  stopAction: {
    backgroundColor: colors.cocoa,
  },
  primaryActionText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryAction: {
    flex: 0.75,
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: colors.white,
    paddingVertical: 13,
  },
  secondaryActionText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  disabledAction: {
    opacity: 0.35,
  },
})
