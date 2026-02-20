---
'@tanstack/tests-adapters': patch
'@tanstack/ai-client': patch
'@tanstack/ai': patch
---

Refactor CustomEvent property from 'data' to 'value' for AG-UI compliance

## What Changed
The `CustomEvent` interface and class now use a `value` property instead of `data` to align with the AG-UI specification for custom events.

### TypeScript
```typescript
// Before
interface CustomEvent {
  type: 'CUSTOM'
  name: string
  data?: unknown
}

// After
interface CustomEvent {
  type: 'CUSTOM'
  name: string
  value?: unknown
}
```

### Python
```python
# Before
class CustomEvent:
    def __init__(self, name: str, data=None):
        self.data = data

# After
class CustomEvent:
    def __init__(self, name: str, value=None):
        self.value = value
```

## Migration Guide
Update any code that accesses the `data` property on CustomEvent objects:

```typescript
// Before
if (chunk.type === 'CUSTOM' && chunk.data) {
  console.log(chunk.data)
}

// After
if (chunk.type === 'CUSTOM' && chunk.value) {
  console.log(chunk.value)
}
```

This affects:
- Custom event handlers that access event data
- Test utilities that create or verify CustomEvent objects
- Stream processing code that handles CUSTOM event types
