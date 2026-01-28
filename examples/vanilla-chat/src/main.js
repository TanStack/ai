import { ChatClient, fetchServerSentEvents } from '@tanstack/ai-client'

// Initialize ChatClient
const client = new ChatClient({
  connection: fetchServerSentEvents('http://localhost:3001/chat'),
  onMessagesChange: (messages) => {
    renderMessages(messages)
  },
  onLoadingChange: (isLoading) => {
    updateLoadingState(isLoading)
  },
  onErrorChange: (error) => {
    showError(error)
  },
})

// DOM elements
const messagesContainer = document.getElementById('messages')
const chatForm = document.getElementById('chat-form')
const messageInput = document.getElementById('message-input')
const sendButton = document.getElementById('send-button')
const errorDiv = document.getElementById('error')

// Auto-resize textarea
messageInput.addEventListener('input', () => {
  messageInput.style.height = 'auto'
  messageInput.style.height = messageInput.scrollHeight + 'px'
})

// Handle form submission
chatForm.addEventListener('submit', async (e) => {
  e.preventDefault()

  const message = messageInput.value.trim()
  if (!message || client.getIsLoading()) return

  // Clear input
  messageInput.value = ''
  messageInput.style.height = 'auto'

  // Focus back on input
  messageInput.focus()

  try {
    await client.sendMessage(message)
  } catch (error) {
    console.error('Error sending message:', error)
    showError(error)
  }
})

// Allow Enter to send (Shift+Enter for new line)
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    chatForm.dispatchEvent(new Event('submit'))
  }
})

// Render messages
function renderMessages(messages) {
  if (!messagesContainer) return

  messagesContainer.innerHTML = ''

  messages.forEach((message) => {
    const messageDiv = document.createElement('div')
    messageDiv.className = `message ${message.role}`

    if (message.role === 'user') {
      // Extract text content from parts
      const textParts = message.parts.filter((p) => p.type === 'text')
      const content = textParts.map((p) => p.content).join('')

      messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(content)}</div>
      `
    } else if (message.role === 'assistant') {
      // Render parts in their original order (maintains chronological flow)
      const partsHtml = message.parts
        .map((part) => {
          if (part.type === 'thinking') {
            return `<div class="thinking">${escapeHtml(part.content)}</div>`
          } else if (part.type === 'text') {
            return `<div class="message-content">${escapeHtml(part.content)}</div>`
          } else if (part.type === 'tool-call') {
            return `
            <div class="tool-call">
              <div>
                <span class="tool-name">${escapeHtml(part.name)}</span>
                <span class="tool-state">${escapeHtml(part.state)}</span>
              </div>
              <pre class="tool-args">${escapeHtml(part.arguments)}</pre>
              ${part.output ? `<pre class="tool-output">${escapeHtml(JSON.stringify(part.output, null, 2))}</pre>` : ''}
            </div>
          `
          } else if (part.type === 'tool-result') {
            return `
            <div class="tool-result">
              <div class="tool-result-label">Tool Result:</div>
              <pre class="tool-result-content">${escapeHtml(part.content)}</pre>
            </div>
          `
          }
          return ''
        })
        .join('')

      messageDiv.innerHTML = partsHtml
    }

    messagesContainer.appendChild(messageDiv)
  })

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight
}

// Update loading state
function updateLoadingState(isLoading) {
  if (sendButton) {
    sendButton.disabled = isLoading
    sendButton.textContent = isLoading ? 'Sending...' : 'Send'
  }

  if (messageInput) {
    messageInput.disabled = isLoading
  }

  // Show typing indicator
  if (isLoading && messagesContainer) {
    const typingIndicator = document.createElement('div')
    typingIndicator.className = 'message assistant typing'
    typingIndicator.id = 'typing-indicator'
    typingIndicator.innerHTML = '<div class="message-content">...</div>'
    messagesContainer.appendChild(typingIndicator)
    messagesContainer.scrollTop = messagesContainer.scrollHeight
  } else {
    const indicator = document.getElementById('typing-indicator')
    if (indicator) {
      indicator.remove()
    }
  }
}

// Show error
function showError(error) {
  if (!errorDiv) return

  if (error) {
    errorDiv.textContent = error.message || 'An error occurred'
    errorDiv.style.display = 'block'
  } else {
    errorDiv.style.display = 'none'
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Initialize - render any existing messages
renderMessages(client.getMessages())

// Focus input on load
messageInput?.focus()
