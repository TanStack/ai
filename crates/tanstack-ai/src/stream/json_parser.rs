/// JSON parser for partial/incomplete JSON strings.
///
/// Used during streaming to parse tool call arguments that may be incomplete.

/// Parse a potentially incomplete JSON string.
///
/// Returns `None` if parsing fails or the input is empty.
pub fn parse_partial_json(json_string: &str) -> Option<serde_json::Value> {
    if json_string.trim().is_empty() {
        return None;
    }

    // Try standard JSON parse first
    if let Ok(value) = serde_json::from_str(json_string) {
        return Some(value);
    }

    // Attempt to close incomplete JSON structures
    let trimmed = json_string.trim();
    let mut attempt = trimmed.to_string();

    // Count open/close brackets and braces to determine what to close
    let mut brace_depth: i32 = 0;
    let mut bracket_depth: i32 = 0;
    let mut in_string = false;
    let mut escape_next = false;

    for ch in trimmed.chars() {
        if escape_next {
            escape_next = false;
            continue;
        }
        if ch == '\\' && in_string {
            escape_next = true;
            continue;
        }
        if ch == '"' {
            in_string = !in_string;
            continue;
        }
        if in_string {
            continue;
        }
        match ch {
            '{' => brace_depth += 1,
            '}' => brace_depth -= 1,
            '[' => bracket_depth += 1,
            ']' => bracket_depth -= 1,
            _ => {}
        }
    }

    // Close unclosed string
    if in_string {
        attempt.push('"');
    }

    // Close unclosed brackets and braces
    for _ in 0..bracket_depth {
        attempt.push(']');
    }
    for _ in 0..brace_depth {
        attempt.push('}');
    }

    serde_json::from_str(&attempt).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_complete_json() {
        let result = parse_partial_json(r#"{"name": "test"}"#).unwrap();
        assert_eq!(result["name"], "test");
    }

    #[test]
    fn test_partial_json_object() {
        let result = parse_partial_json(r#"{"name": "te"#).unwrap();
        assert_eq!(result["name"], "te");
    }

    #[test]
    fn test_partial_json_array() {
        let result = parse_partial_json(r#"[1, 2, 3"#).unwrap();
        assert_eq!(result, serde_json::json!([1, 2, 3]));
    }

    #[test]
    fn test_empty_string() {
        assert!(parse_partial_json("").is_none());
        assert!(parse_partial_json("   ").is_none());
    }

    #[test]
    fn test_nested_partial() {
        let result = parse_partial_json(r#"{"user": {"name": "Jo"#).unwrap();
        assert_eq!(result["user"]["name"], "Jo");
    }
}
