use crate::stream::types::ChunkStrategy;
use regex::Regex;

/// Immediate Strategy - emit on every chunk (default behavior).
#[derive(Debug, Clone)]
pub struct ImmediateStrategy;

impl ChunkStrategy for ImmediateStrategy {
    fn should_emit(&mut self, _chunk: &str, _accumulated: &str) -> bool {
        true
    }
}

/// Punctuation Strategy - emit when chunk contains punctuation.
#[derive(Debug, Clone)]
pub struct PunctuationStrategy {
    pattern: Regex,
}

impl PunctuationStrategy {
    pub fn new() -> Self {
        Self {
            pattern: Regex::new(r"[.,!?;:\n]").unwrap(),
        }
    }
}

impl Default for PunctuationStrategy {
    fn default() -> Self {
        Self::new()
    }
}

impl ChunkStrategy for PunctuationStrategy {
    fn should_emit(&mut self, chunk: &str, _accumulated: &str) -> bool {
        self.pattern.is_match(chunk)
    }
}

/// Batch Strategy - emit every N chunks.
#[derive(Debug, Clone)]
pub struct BatchStrategy {
    batch_size: usize,
    chunk_count: usize,
}

impl BatchStrategy {
    pub fn new(batch_size: usize) -> Self {
        Self {
            batch_size,
            chunk_count: 0,
        }
    }
}

impl Default for BatchStrategy {
    fn default() -> Self {
        Self::new(5)
    }
}

impl ChunkStrategy for BatchStrategy {
    fn should_emit(&mut self, _chunk: &str, _accumulated: &str) -> bool {
        self.chunk_count += 1;
        if self.chunk_count >= self.batch_size {
            self.chunk_count = 0;
            true
        } else {
            false
        }
    }

    fn reset(&mut self) {
        self.chunk_count = 0;
    }
}

/// Word Boundary Strategy - emit at word boundaries (whitespace).
#[derive(Debug, Clone)]
pub struct WordBoundaryStrategy;

impl ChunkStrategy for WordBoundaryStrategy {
    fn should_emit(&mut self, chunk: &str, _accumulated: &str) -> bool {
        chunk.ends_with(|c: char| c.is_whitespace())
    }
}

/// Composite Strategy - combine multiple strategies with OR logic.
pub struct CompositeStrategy {
    strategies: Vec<Box<dyn ChunkStrategy>>,
}

impl CompositeStrategy {
    pub fn new(strategies: Vec<Box<dyn ChunkStrategy>>) -> Self {
        Self { strategies }
    }
}

impl ChunkStrategy for CompositeStrategy {
    fn should_emit(&mut self, chunk: &str, accumulated: &str) -> bool {
        self.strategies
            .iter_mut()
            .any(|s| s.should_emit(chunk, accumulated))
    }

    fn reset(&mut self) {
        for s in &mut self.strategies {
            s.reset();
        }
    }
}
