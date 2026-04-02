use thiserror::Error;

/// Result type alias using `AiError`.
pub type AiResult<T> = Result<T, AiError>;

/// Errors that can occur in the TanStack AI SDK.
#[derive(Error, Debug)]
pub enum AiError {
    /// Error from the underlying AI provider.
    #[error("provider error: {0}")]
    Provider(String),

    /// HTTP request error.
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),

    /// JSON serialization/deserialization error.
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    /// Tool execution error.
    #[error("tool execution error: {0}")]
    ToolExecution(String),

    /// Unknown tool requested by the model.
    #[error("unknown tool: {0}")]
    UnknownTool(String),

    /// Input validation error.
    #[error("validation error: {0}")]
    Validation(String),

    /// Stream processing error.
    #[error("stream error: {0}")]
    Stream(String),

    /// Request was aborted.
    #[error("request aborted: {0}")]
    Aborted(String),

    /// Agent loop exceeded maximum iterations.
    #[error("agent loop exceeded max iterations ({0})")]
    MaxIterationsExceeded(u32),

    /// Generic error.
    #[error("{0}")]
    Other(String),
}

impl From<String> for AiError {
    fn from(s: String) -> Self {
        AiError::Other(s)
    }
}

impl From<&str> for AiError {
    fn from(s: &str) -> Self {
        AiError::Other(s.to_string())
    }
}
