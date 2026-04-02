use std::collections::HashMap;
use crate::error::{AiError, AiResult};
use crate::types::*;
use tokio::sync::mpsc;

/// Result of a tool execution.
#[derive(Debug, Clone)]
pub struct ToolResult {
    pub tool_call_id: String,
    pub tool_name: String,
    pub result: serde_json::Value,
    pub state: ToolResultOutputState,
    pub duration_ms: Option<u128>,
}

/// Output state for a tool result.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolResultOutputState {
    Available,
    Error,
}

/// A tool call that needs user approval.
#[derive(Debug, Clone)]
pub struct ApprovalRequest {
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
    pub approval_id: String,
}

/// A tool that needs client-side execution.
#[derive(Debug, Clone)]
pub struct ClientToolRequest {
    pub tool_call_id: String,
    pub tool_name: String,
    pub input: serde_json::Value,
}

/// Result from executing a batch of tool calls.
#[derive(Debug)]
pub struct ExecuteToolCallsResult {
    pub results: Vec<ToolResult>,
    pub needs_approval: Vec<ApprovalRequest>,
    pub needs_client_execution: Vec<ClientToolRequest>,
}

/// Custom event emitted during tool execution.
#[derive(Debug, Clone)]
pub struct ToolCustomEvent {
    pub name: String,
    pub value: serde_json::Value,
}

/// Manages tool call accumulation and execution for the chat engine.
#[derive(Debug, Default)]
pub struct ToolCallManager {
    tool_calls: HashMap<String, ToolCall>,
}

impl ToolCallManager {
    pub fn new() -> Self {
        Self {
            tool_calls: HashMap::new(),
        }
    }

    /// Add a TOOL_CALL_START event.
    pub fn add_start_event(&mut self, event: &StreamChunk) {
        if let StreamChunk::ToolCallStart {
            tool_call_id,
            tool_name,
            index: _,
            provider_metadata,
            ..
        } = event
        {
            self.tool_calls.insert(
                tool_call_id.clone(),
                ToolCall {
                    id: tool_call_id.clone(),
                    call_type: "function".to_string(),
                    function: ToolCallFunction {
                        name: tool_name.clone(),
                        arguments: String::new(),
                    },
                    provider_metadata: provider_metadata.clone(),
                },
            );
        }
    }

    /// Add a TOOL_CALL_ARGS event to accumulate arguments.
    pub fn add_args_event(&mut self, event: &StreamChunk) {
        if let StreamChunk::ToolCallArgs { tool_call_id, delta, .. } = event {
            if let Some(tc) = self.tool_calls.get_mut(tool_call_id) {
                tc.function.arguments.push_str(delta);
            }
        }
    }

    /// Complete a tool call with its final input.
    pub fn complete_tool_call(&mut self, event: &StreamChunk) {
        if let StreamChunk::ToolCallEnd { tool_call_id, input, .. } = event {
            if let Some(tc) = self.tool_calls.get_mut(tool_call_id) {
                if let Some(final_input) = input {
                    tc.function.arguments =
                        serde_json::to_string(final_input).unwrap_or_default();
                }
            }
        }
    }

    /// Check if there are any complete tool calls to execute.
    pub fn has_tool_calls(&self) -> bool {
        self.tool_calls
            .values()
            .any(|tc| !tc.id.is_empty() && !tc.function.name.trim().is_empty())
    }

    /// Get all tool calls as a Vec.
    pub fn tool_calls(&self) -> Vec<ToolCall> {
        self.tool_calls
            .values()
            .filter(|tc| !tc.id.is_empty() && !tc.function.name.trim().is_empty())
            .cloned()
            .collect()
    }

    /// Clear all tool calls for the next iteration.
    pub fn clear(&mut self) {
        self.tool_calls.clear();
    }
}

/// Execute tool calls with full approval and client-tool support.
///
/// Returns a stream of custom events during execution, and the final result.
pub async fn execute_tool_calls(
    tool_calls: &[ToolCall],
    tools: &[Tool],
    approvals: &HashMap<String, bool>,
    client_results: &HashMap<String, serde_json::Value>,
    event_tx: Option<mpsc::UnboundedSender<ToolCustomEvent>>,
) -> AiResult<ExecuteToolCallsResult> {
    let mut results = Vec::new();
    let mut needs_approval = Vec::new();
    let mut needs_client_execution = Vec::new();

    // Build tool lookup map
    let tool_map: HashMap<&str, &Tool> = tools.iter().map(|t| (t.name.as_str(), t)).collect();

    // Check if any tools need pending approvals (batch gating)
    let has_pending_approvals = tool_calls.iter().any(|tc| {
        tool_map
            .get(tc.function.name.as_str())
            .map(|t| t.needs_approval && !approvals.contains_key(&format!("approval_{}", tc.id)))
            .unwrap_or(false)
    });

    for tool_call in tool_calls {
        let tool_name = &tool_call.function.name;
        let tool = tool_map.get(tool_name.as_str()).copied();

        if tool.is_none() {
            results.push(ToolResult {
                tool_call_id: tool_call.id.clone(),
                tool_name: tool_name.clone(),
                result: serde_json::json!({"error": format!("Unknown tool: {}", tool_name)}),
                state: ToolResultOutputState::Error,
                duration_ms: None,
            });
            continue;
        }

        let tool = tool.unwrap();

        // Skip non-pending tools while approvals are outstanding
        if has_pending_approvals {
            if !tool.needs_approval || approvals.contains_key(&format!("approval_{}", tool_call.id))
            {
                continue;
            }
        }

        // Parse arguments
        let input: serde_json::Value = {
            let args_str = if tool_call.function.arguments.trim().is_empty() {
                "{}"
            } else {
                tool_call.function.arguments.trim()
            };
            match serde_json::from_str(args_str) {
                Ok(v) => v,
                Err(e) => {
                    return Err(AiError::ToolExecution(format!(
                        "Failed to parse tool arguments: {}",
                        e
                    )));
                }
            }
        };

        // CASE 1: Tool has no execute function (client-side tool)
        if tool.execute.is_none() {
            if tool.needs_approval {
                let approval_id = format!("approval_{}", tool_call.id);
                if let Some(&approved) = approvals.get(&approval_id) {
                    if approved {
                        if let Some(result) = client_results.get(&tool_call.id) {
                            results.push(ToolResult {
                                tool_call_id: tool_call.id.clone(),
                                tool_name: tool_name.clone(),
                                result: result.clone(),
                                state: ToolResultOutputState::Available,
                                duration_ms: None,
                            });
                        } else {
                            needs_client_execution.push(ClientToolRequest {
                                tool_call_id: tool_call.id.clone(),
                                tool_name: tool_name.clone(),
                                input,
                            });
                        }
                    } else {
                        results.push(ToolResult {
                            tool_call_id: tool_call.id.clone(),
                            tool_name: tool_name.clone(),
                            result: serde_json::json!({"error": "User declined tool execution"}),
                            state: ToolResultOutputState::Error,
                            duration_ms: None,
                        });
                    }
                } else {
                    needs_approval.push(ApprovalRequest {
                        tool_call_id: tool_call.id.clone(),
                        tool_name: tool_name.clone(),
                        input,
                        approval_id,
                    });
                }
            } else if let Some(result) = client_results.get(&tool_call.id) {
                results.push(ToolResult {
                    tool_call_id: tool_call.id.clone(),
                    tool_name: tool_name.clone(),
                    result: result.clone(),
                    state: ToolResultOutputState::Available,
                    duration_ms: None,
                });
            } else {
                needs_client_execution.push(ClientToolRequest {
                    tool_call_id: tool_call.id.clone(),
                    tool_name: tool_name.clone(),
                    input,
                });
            }
            continue;
        }

        // CASE 2: Server tool with approval
        if tool.needs_approval {
            let approval_id = format!("approval_{}", tool_call.id);
            if let Some(&approved) = approvals.get(&approval_id) {
                if approved {
                    execute_server_tool(
                        tool_call,
                        tool,
                        input,
                        &event_tx,
                        &mut results,
                    )
                    .await?;
                } else {
                    results.push(ToolResult {
                        tool_call_id: tool_call.id.clone(),
                        tool_name: tool_name.clone(),
                        result: serde_json::json!({"error": "User declined tool execution"}),
                        state: ToolResultOutputState::Error,
                        duration_ms: None,
                    });
                }
            } else {
                needs_approval.push(ApprovalRequest {
                    tool_call_id: tool_call.id.clone(),
                    tool_name: tool_name.clone(),
                    input,
                    approval_id,
                });
            }
            continue;
        }

        // CASE 3: Normal server tool - execute immediately
        execute_server_tool(tool_call, tool, input, &event_tx, &mut results).await?;
    }

    Ok(ExecuteToolCallsResult {
        results,
        needs_approval,
        needs_client_execution,
    })
}

async fn execute_server_tool(
    tool_call: &ToolCall,
    tool: &Tool,
    input: serde_json::Value,
    event_tx: &Option<mpsc::UnboundedSender<ToolCustomEvent>>,
    results: &mut Vec<ToolResult>,
) -> AiResult<()> {
    let start = std::time::Instant::now();

    let ctx = ToolExecutionContext {
        tool_call_id: Some(tool_call.id.clone()),
        custom_event_tx: None, // TODO: wire up custom event channel
    };

    let execute_fn = tool.execute.as_ref().unwrap();

    match execute_fn(input, ctx).await {
        Ok(result) => {
            let duration = start.elapsed().as_millis();

            // Emit custom event if channel is available
            if let Some(tx) = event_tx {
                let _ = tx.send(ToolCustomEvent {
                    name: "tool-result".to_string(),
                    value: serde_json::json!({
                        "toolCallId": tool_call.id,
                        "toolName": tool.name,
                        "result": result,
                    }),
                });
            }

            results.push(ToolResult {
                tool_call_id: tool_call.id.clone(),
                tool_name: tool.name.clone(),
                result,
                state: ToolResultOutputState::Available,
                duration_ms: Some(duration),
            });
        }
        Err(e) => {
            let duration = start.elapsed().as_millis();
            results.push(ToolResult {
                tool_call_id: tool_call.id.clone(),
                tool_name: tool.name.clone(),
                result: serde_json::json!({"error": e.to_string()}),
                state: ToolResultOutputState::Error,
                duration_ms: Some(duration),
            });
        }
    }

    Ok(())
}
