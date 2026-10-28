# React Native Smoke Fixture

This private workspace package exercises the narrow React Native support
surface: `useChat` plus chat connection transports from `@tanstack/ai-react`.

The smoke runs a real Expo/Metro export for the iOS platform, then keeps the
fallback import and esbuild guards to catch client-boundary regressions without
requiring a device or simulator.

- TypeScript typechecking for the React Native source.
- A source import graph assertion that rejects server/provider/UI-only imports.
- An Expo/Metro export to verify the fixture can bundle as an Expo app.
- An esbuild browser bundle with a small `react-native` runtime stub as an
  extra guard against obvious bundle regressions.

Run it with:

```bash
pnpm --filter @tanstack/ai-react-native-smoke smoke
```
