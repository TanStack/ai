import type { ModelMessage, StreamChunk } from "@tanstack/ai";

/**
 * Stub LLM for testing tool calls without burning tokens
 * Detects which tool to call from user message keywords
 */
export async function* stubLLM(
  messages: ModelMessage[]
): AsyncIterable<StreamChunk> {
  const lastMessage = messages[messages.length - 1];
  const userMessage = lastMessage?.content?.toLowerCase() || "";

  const baseId = `stub_${Date.now()}`;
  const timestamp = Date.now();

  // Check if we have any assistant messages with tool calls already
  // If so, this is a continuation after approval/execution, not a new request
  // Handle both ModelMessage (toolCalls) and UIMessage (parts) formats
  const hasExistingToolCalls = messages.some((m) => {
    if (m.role !== "assistant") return false;
    // Check ModelMessage format
    if (m.toolCalls && m.toolCalls.length > 0) return true;
    // Check UIMessage format
    if ((m as any).parts) {
      const parts = (m as any).parts;
      return parts.some((p: any) => p.type === "tool-call");
    }
    return false;
  });
  
  if (hasExistingToolCalls && lastMessage?.role === "assistant") {
    // This means we're being called after an approval/tool execution
    // Check if the user approved or denied by looking at tool results
    let wasApproved = false;
    let wasDenied = false;
    
    // Check for tool results
    const toolResults = messages.filter((m) => m.role === "tool");
    if (toolResults.length > 0) {
      // Check if any were successful or had errors
      for (const result of toolResults) {
        try {
          const parsed = JSON.parse(result.content || "{}");
          if (parsed.error && parsed.error.includes("declined")) {
            wasDenied = true;
          } else if (parsed.success || !parsed.error) {
            wasApproved = true;
          }
        } catch {
          // If we can't parse, assume success
          wasApproved = true;
        }
      }
    } else {
      // No tool results yet, must have just gotten approval response
      // Check the assistant message for approval status in UIMessage format
      if ((lastMessage as any).parts) {
        const parts = (lastMessage as any).parts;
        for (const part of parts) {
          if (part.type === "tool-call" && part.approval) {
            if (part.approval.approved === true) {
              wasApproved = true;
            } else if (part.approval.approved === false) {
              wasDenied = true;
            }
          }
        }
      } else if (lastMessage.toolCalls) {
        // This is a ModelMessage, check if it has approval info in content
        // (won't have it here, but we can infer from lack of tool results)
        // Default to approved for now
        wasApproved = true;
      }
    }
    
    let response = "";
    if (wasDenied) {
      response = "No worries! Maybe another time. Let me know if you need anything else.";
    } else if (wasApproved) {
      response = "All set! Let me know if you need anything else.";
    } else {
      response = "Let me know if you need anything else!";
    }
    
    for (let i = 0; i < response.length; i++) {
      yield {
        type: "content",
        id: baseId,
        model: "stub-llm",
        timestamp,
        delta: response[i],
        content: response.substring(0, i + 1),
        role: "assistant",
      };
    }

    yield {
      type: "done",
      id: baseId,
      model: "stub-llm",
      timestamp,
      finishReason: "stop",
    };
    return;
  }

  // Check if this is a follow-up after tool execution
  const hasToolResults = messages.some((m) => m.role === "tool");
  
  if (hasToolResults) {
    // Check if user approved or denied
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.toolCalls);
    
    if (lastAssistant) {
      // Look for approval in tool results
      const approvedTools = messages
        .filter((m) => m.role === "tool")
        .filter((m) => {
          try {
            const result = JSON.parse(m.content || "{}");
            return !result.error;
          } catch {
            return true;
          }
        });
      
      const deniedTools = messages
        .filter((m) => m.role === "tool")
        .filter((m) => {
          try {
            const result = JSON.parse(m.content || "{}");
            return result.error?.includes("declined");
          } catch {
            return false;
          }
        });

      let responseText = "";
      if (approvedTools.length > 0) {
        responseText = "Good for you! I've processed that request.";
      } else if (deniedTools.length > 0) {
        responseText = "Bummer! Maybe another time.";
      } else {
        responseText = "Complete! If you need anything else, feel free to ask.";
      }

      // Send final response
      for (const char of responseText) {
        const accumulated = responseText.substring(0, responseText.indexOf(char) + 1);
        yield {
          type: "content",
          id: baseId,
          model: "stub-llm",
          timestamp,
          delta: char,
          content: accumulated,
          role: "assistant",
        };
      }

      yield {
        type: "done",
        id: baseId,
        model: "stub-llm",
        timestamp,
        finishReason: "stop",
      };
      return;
    }
  }

  // Detect which tool to call based on user message
  if (userMessage.includes("preference")) {
    // Send initial text
    const initText = "Let me check your preferences...";
    for (let i = 0; i < initText.length; i++) {
      yield {
        type: "content",
        id: baseId,
        model: "stub-llm",
        timestamp,
        delta: initText[i],
        content: initText.substring(0, i + 1),
        role: "assistant",
      };
    }

    // Call getPersonalGuitarPreference
    yield {
      type: "tool_call",
      id: baseId,
      model: "stub-llm",
      timestamp,
      toolCall: {
        id: `call_${Date.now()}`,
        type: "function",
        function: {
          name: "getPersonalGuitarPreference",
          arguments: "{}",
        },
      },
      index: 0,
    };

    yield {
      type: "done",
      id: baseId,
      model: "stub-llm",
      timestamp,
      finishReason: "tool_calls",
    };
    return;
  }

  if (userMessage.includes("recommend") || userMessage.includes("acoustic")) {
    // Send initial text
    const initText = "Let me find the perfect guitar for you!";
    for (let i = 0; i < initText.length; i++) {
      yield {
        type: "content",
        id: baseId,
        model: "stub-llm",
        timestamp,
        delta: initText[i],
        content: initText.substring(0, i + 1),
        role: "assistant",
      };
    }

    // Call getGuitars then recommendGuitar
    const getGuitarsId = `call_${Date.now()}_1`;
    yield {
      type: "tool_call",
      id: baseId,
      model: "stub-llm",
      timestamp,
      toolCall: {
        id: getGuitarsId,
        type: "function",
        function: {
          name: "getGuitars",
          arguments: "{}",
        },
      },
      index: 0,
    };

    yield {
      type: "done",
      id: baseId,
      model: "stub-llm",
      timestamp,
      finishReason: "tool_calls",
    };

    // After getGuitars result, call recommendGuitar
    const recommendId = `call_${Date.now()}_2`;
    yield {
      type: "tool_call",
      id: baseId + "_2",
      model: "stub-llm",
      timestamp: timestamp + 100,
      toolCall: {
        id: recommendId,
        type: "function",
        function: {
          name: "recommendGuitar",
          arguments: JSON.stringify({ id: "6" }),
        },
      },
      index: 0,
    };

    yield {
      type: "done",
      id: baseId + "_2",
      model: "stub-llm",
      timestamp: timestamp + 100,
      finishReason: "tool_calls",
    };
    return;
  }

  if (userMessage.includes("wish list")) {
    // Send initial text
    const initText = "I'll add that to your wish list. Just need your approval first!";
    for (let i = 0; i < initText.length; i++) {
      yield {
        type: "content",
        id: baseId,
        model: "stub-llm",
        timestamp,
        delta: initText[i],
        content: initText.substring(0, i + 1),
        role: "assistant",
      };
    }

    // Call addToWishList (needs approval)
    yield {
      type: "tool_call",
      id: baseId,
      model: "stub-llm",
      timestamp,
      toolCall: {
        id: `call_${Date.now()}`,
        type: "function",
        function: {
          name: "addToWishList",
          arguments: JSON.stringify({ guitarId: "6" }),
        },
      },
      index: 0,
    };

    yield {
      type: "done",
      id: baseId,
      model: "stub-llm",
      timestamp,
      finishReason: "tool_calls",
    };
    return;
  }

  if (userMessage.includes("cart")) {
    // Send initial text
    const initText = "Ready to add to your cart! I'll need your approval to proceed.";
    for (let i = 0; i < initText.length; i++) {
      yield {
        type: "content",
        id: baseId,
        model: "stub-llm",
        timestamp,
        delta: initText[i],
        content: initText.substring(0, i + 1),
        role: "assistant",
      };
    }

    // Call addToCart (needs approval)
    yield {
      type: "tool_call",
      id: baseId,
      model: "stub-llm",
      timestamp,
      toolCall: {
        id: `call_${Date.now()}`,
        type: "function",
        function: {
          name: "addToCart",
          arguments: JSON.stringify({ guitarId: "6", quantity: 1 }),
        },
      },
      index: 0,
    };

    yield {
      type: "done",
      id: baseId,
      model: "stub-llm",
      timestamp,
      finishReason: "tool_calls",
    };
    return;
  }

  // Default response
  const response = "I can help with guitar preferences, recommendations, wish lists, and cart!";
  for (const char of response) {
    const accumulated = response.substring(0, response.indexOf(char) + 1);
    yield {
      type: "content",
      id: baseId,
      model: "stub-llm",
      timestamp,
      delta: char,
      content: accumulated,
      role: "assistant",
    };
  }

  yield {
    type: "done",
    id: baseId,
    model: "stub-llm",
    timestamp,
    finishReason: "stop",
  };
}

