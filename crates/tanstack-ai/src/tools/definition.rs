use crate::error::AiResult;
use crate::types::{JsonSchema, Tool, ToolExecutionContext};

/// Tool definition builder for creating isomorphic tools.
///
/// Tools defined with `ToolDefinition` can be used directly in chat or
/// converted to server/client variants.
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Option<JsonSchema>,
    pub output_schema: Option<JsonSchema>,
    pub needs_approval: bool,
    pub lazy: bool,
    pub metadata: Option<serde_json::Value>,
}

impl ToolDefinition {
    /// Create a new tool definition.
    pub fn new(name: impl Into<String>, description: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema: None,
            output_schema: None,
            needs_approval: false,
            lazy: false,
            metadata: None,
        }
    }

    /// Set the input schema.
    pub fn input_schema(mut self, schema: JsonSchema) -> Self {
        self.input_schema = Some(schema);
        self
    }

    /// Set the output schema.
    pub fn output_schema(mut self, schema: JsonSchema) -> Self {
        self.output_schema = Some(schema);
        self
    }

    /// Mark tool as requiring approval.
    pub fn needs_approval(mut self, value: bool) -> Self {
        self.needs_approval = value;
        self
    }

    /// Mark tool as lazy.
    pub fn lazy(mut self, value: bool) -> Self {
        self.lazy = value;
        self
    }

    /// Set metadata.
    pub fn metadata(mut self, metadata: serde_json::Value) -> Self {
        self.metadata = Some(metadata);
        self
    }

    /// Convert to a `Tool` definition (without execute function).
    pub fn to_tool(&self) -> Tool {
        Tool {
            name: self.name.clone(),
            description: self.description.clone(),
            input_schema: self.input_schema.clone(),
            output_schema: self.output_schema.clone(),
            needs_approval: self.needs_approval,
            lazy: self.lazy,
            metadata: self.metadata.clone(),
            execute: None,
        }
    }

    /// Convert to a server `Tool` with an execute function.
    pub fn to_server_tool<F, Fut>(&self, execute: F) -> Tool
    where
        F: Fn(serde_json::Value, ToolExecutionContext) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = AiResult<serde_json::Value>> + Send + 'static,
    {
        Tool {
            name: self.name.clone(),
            description: self.description.clone(),
            input_schema: self.input_schema.clone(),
            output_schema: self.output_schema.clone(),
            needs_approval: self.needs_approval,
            lazy: self.lazy,
            metadata: self.metadata.clone(),
            execute: Some(std::sync::Arc::new(move |args, ctx| {
                Box::pin(execute(args, ctx))
            })),
        }
    }
}

/// Convenience function to create a tool definition.
pub fn tool_definition(name: impl Into<String>, description: impl Into<String>) -> ToolDefinition {
    ToolDefinition::new(name, description)
}

/// Fallible helper to create a JSON Schema from a JSON value.
pub fn try_json_schema(value: serde_json::Value) -> Result<JsonSchema, serde_json::Error> {
    serde_json::from_value(value)
}

/// Helper to create a JSON Schema from a JSON value.
pub fn json_schema(value: serde_json::Value) -> JsonSchema {
    try_json_schema(value).expect("invalid json schema value")
}
