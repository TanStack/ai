use std::collections::HashMap;
use std::sync::Arc;

use crate::types::Tool;

/// Registry for managing tools available to the chat engine.
#[derive(Debug, Clone)]
pub struct ToolRegistry {
    tools: HashMap<String, Tool>,
}

impl ToolRegistry {
    /// Create an empty registry.
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
        }
    }

    /// Create a registry from a list of tools.
    pub fn from_tools(tools: Vec<Tool>) -> Self {
        let mut registry = Self::new();
        for tool in tools {
            registry.register(tool);
        }
        registry
    }

    /// Register a tool.
    pub fn register(&mut self, tool: Tool) {
        self.tools.insert(tool.name.clone(), tool);
    }

    /// Get a tool by name.
    pub fn get(&self, name: &str) -> Option<&Tool> {
        self.tools.get(name)
    }

    /// Check if a tool exists.
    pub fn contains(&self, name: &str) -> bool {
        self.tools.contains_key(name)
    }

    /// Get all tool names.
    pub fn names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    /// Get all tools as a Vec.
    pub fn all(&self) -> Vec<&Tool> {
        self.tools.values().collect()
    }

    /// Get the number of tools.
    pub fn len(&self) -> usize {
        self.tools.len()
    }

    /// Check if the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }

    /// Remove a tool by name.
    pub fn remove(&mut self, name: &str) -> Option<Tool> {
        self.tools.remove(name)
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl From<Vec<Tool>> for ToolRegistry {
    fn from(tools: Vec<Tool>) -> Self {
        Self::from_tools(tools)
    }
}

/// Frozen/immutable tool registry for thread-safe sharing.
///
/// Use `FrozenToolRegistry` when multiple clients or tasks need to reuse the
/// same tool set. `ChatOptions` still accepts `Vec<Tool>` because a single chat
/// run owns its tool definitions outright.
#[derive(Debug, Clone)]
pub struct FrozenToolRegistry {
    tools: Arc<HashMap<String, Tool>>,
}

impl FrozenToolRegistry {
    /// Create a frozen registry from a mutable one.
    pub fn freeze(registry: ToolRegistry) -> Self {
        Self {
            tools: Arc::new(registry.tools),
        }
    }

    /// Get a tool by name.
    pub fn get(&self, name: &str) -> Option<&Tool> {
        self.tools.get(name)
    }

    /// Check if a tool exists.
    pub fn contains(&self, name: &str) -> bool {
        self.tools.contains_key(name)
    }

    /// Get all tool names.
    pub fn names(&self) -> Vec<String> {
        self.tools.keys().cloned().collect()
    }

    /// Get all tools.
    pub fn all(&self) -> Vec<&Tool> {
        self.tools.values().collect()
    }

    /// Get the number of tools.
    pub fn len(&self) -> usize {
        self.tools.len()
    }

    /// Check if the registry is empty.
    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }
}

/// Convenience function to create a frozen registry.
pub fn create_frozen_registry(tools: Vec<Tool>) -> FrozenToolRegistry {
    FrozenToolRegistry::freeze(ToolRegistry::from_tools(tools))
}
