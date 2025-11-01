import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";

// Initialize ChatClient
const client = new ChatClient({
  connection: fetchServerSentEvents("http://localhost:8000/chat"),
  onMessagesChange: (messages) => {
    renderMessages(messages);
  },
  onLoadingChange: (isLoading) => {
    updateLoadingState(isLoading);
  },
  onErrorChange: (error) => {
    showError(error);
  },
});

// DOM elements
const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const errorDiv = document.getElementById("error");

// Auto-resize textarea
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = messageInput.scrollHeight + "px";
});

// Handle form submission
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = messageInput.value.trim();
  if (!message || client.getIsLoading()) return;

  // Clear input
  messageInput.value = "";
  messageInput.style.height = "auto";

  // Focus back on input
  messageInput.focus();

  try {
    await client.sendMessage(message);
  } catch (error) {
    console.error("Error sending message:", error);
    showError(error);
  }
});

// Allow Enter to send (Shift+Enter for new line)
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event("submit"));
  }
});

// Render messages
function renderMessages(messages) {
  if (!messagesContainer) return;

  messagesContainer.innerHTML = "";

  messages.forEach((message) => {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${message.role}`;

    if (message.role === "user") {
      messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(message.content || "")}</div>
      `;
    } else if (message.role === "assistant") {
      const content = message.content || "";
      const toolCalls = message.toolCalls || [];

      messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(content)}</div>
        ${
          toolCalls.length > 0
            ? `
          <div class="tool-calls">
            ${toolCalls
              .map(
                (tc) => `
              <div class="tool-call">
                <span class="tool-name">${escapeHtml(tc.function.name)}</span>
                <pre class="tool-args">${escapeHtml(
                  tc.function.arguments
                )}</pre>
              </div>
            `
              )
              .join("")}
          </div>
        `
            : ""
        }
      `;
    }

    messagesContainer.appendChild(messageDiv);
  });

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Update loading state
function updateLoadingState(isLoading) {
  if (sendButton) {
    sendButton.disabled = isLoading;
    sendButton.textContent = isLoading ? "Sending..." : "Send";
  }

  if (messageInput) {
    messageInput.disabled = isLoading;
  }

  // Show typing indicator
  if (isLoading && messagesContainer) {
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "message assistant typing";
    typingIndicator.id = "typing-indicator";
    typingIndicator.innerHTML = '<div class="message-content">...</div>';
    messagesContainer.appendChild(typingIndicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  } else {
    const indicator = document.getElementById("typing-indicator");
    if (indicator) {
      indicator.remove();
    }
  }
}

// Show error
function showError(error) {
  if (!errorDiv) return;

  if (error) {
    errorDiv.textContent = error.message || "An error occurred";
    errorDiv.style.display = "block";
  } else {
    errorDiv.style.display = "none";
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Initialize - render any existing messages
renderMessages(client.getMessages());

// Focus input on load
messageInput?.focus();
