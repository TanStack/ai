import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { deployProgress } from '@/lib/activity-types'

/**
 * Harness page for AG-UI activity. `/api/activity-test` yields live
 * ACTIVITY_SNAPSHOT / ACTIVITY_DELTA (default) or a MESSAGES_SNAPSHOT that
 * already contains an ActivityMessage (`?mode=snapshot`).
 *
 * `?mode=persist&threadId=` saves each run on the server. The chat uses
 * `persistence: true`, so a reload loads the thread and its activity rows
 * from the server.
 */
export const Route = createFileRoute('/activity-test')({
  component: ActivityTestPage,
  validateSearch: (search: Record<string, unknown>) => ({
    mode:
      search.mode === 'snapshot'
        ? ('snapshot' as const)
        : search.mode === 'persist'
          ? ('persist' as const)
          : ('live' as const),
    threadId: typeof search.threadId === 'string' ? search.threadId : undefined,
  }),
})

const connectionUrls = {
  live: '/api/activity-test',
  snapshot: '/api/activity-test?mode=snapshot',
  persist: '/api/activity-test?mode=persist-live',
}

function ActivityTestPage() {
  const { mode, threadId } = Route.useSearch()
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, respondToSandboxApproval } =
    useChat({
      threadId: threadId ?? `activity-${mode}`,
      connection: fetchServerSentEvents(connectionUrls[mode]),
      persistence: mode === 'persist',
      activities: [deployProgress],
    })

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div data-testid="activity-test-page" style={{ padding: 16 }}>
      <div data-testid="message-list">
        {messages.map((message) => {
          if (message.role === 'activity') {
            const part = message.parts[0]
            const activity = part && part.type === 'activity' ? part : undefined
            return (
              <div
                key={message.id}
                data-testid="activity-message"
                data-activity-id={message.id}
                data-activity-type={activity?.activityType ?? ''}
              >
                <span data-testid="activity-content">
                  {activity ? JSON.stringify(activity.content) : ''}
                </span>
                {activity?.activityType === 'deploy.progress' && (
                  <span data-testid="deploy-progress">
                    step {activity.content.step} of {activity.content.total}
                  </span>
                )}
                {activity?.activityType === 'sandbox.approval' && (
                  <>
                    <span data-testid="approval-status">
                      {activity.content.status}
                    </span>
                    <button
                      data-testid="approve-sandbox"
                      type="button"
                      disabled={activity.content.status !== 'pending'}
                      onClick={() =>
                        void respondToSandboxApproval(
                          activity.content.approvalId,
                          true,
                        )
                      }
                    >
                      Approve
                    </button>
                  </>
                )}
              </div>
            )
          }
          return (
            <div
              key={message.id}
              data-testid={
                message.role === 'user' ? 'user-message' : 'assistant-message'
              }
            >
              {message.parts.map((part, index) =>
                part.type === 'text' ? (
                  <span key={`${message.id}-${index}`} data-testid="text-part">
                    {part.content}
                  </span>
                ) : null,
              )}
            </div>
          )
        })}
      </div>

      {isLoading && <div data-testid="loading-indicator">Generating...</div>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type a message..."
        />
        <button
          data-testid="send-button"
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
