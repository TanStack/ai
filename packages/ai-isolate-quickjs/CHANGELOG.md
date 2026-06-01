# @tanstack/ai-isolate-quickjs

## 0.1.27

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.2

## 0.1.26

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.2.1

## 0.1.25

### Patch Changes

- Updated dependencies [[`8036b50`](https://github.com/TanStack/ai/commit/8036b5054330a180023c6e3225b8d2735a43a919)]:
  - @tanstack/ai-code-mode@0.2.0

## 0.1.24

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.24

## 0.1.23

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.23

## 0.1.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.22

## 0.1.21

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.21

## 0.1.20

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.20

## 0.1.19

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-code-mode@0.1.19

## 0.1.18

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.18

## 0.1.17

### Patch Changes

- Updated dependencies [[`ec1393d`](https://github.com/TanStack/ai/commit/ec1393db4383798e5f2574dfd87779c22c309529)]:
  - @tanstack/ai-code-mode@0.1.17

## 0.1.16

### Patch Changes

- Tighten TypeScript safety: enable `noImplicitOverride`, ([#579](https://github.com/TanStack/ai/pull/579))
  `noFallthroughCasesInSwitch`, and `useDefineForClassFields` in the
  root `tsconfig.json`; add a typed-ESLint block scoped to
  `packages/*/src/**` that turns on `no-floating-promises`,
  `no-misused-promises`, `await-thenable`,
  `switch-exhaustiveness-check`, `consistent-type-exports`,
  `prefer-readonly`, and `no-non-null-assertion` (errors), plus
  `no-explicit-any` (warning). `@ts-ignore` and `@ts-nocheck` are
  disallowed in library source via `@typescript-eslint/ban-ts-comment`,
  and `as unknown as <T>` double-casts are blocked by a
  `no-restricted-syntax` rule (escape hatches available with an inline
  reason). Two flags from the original five-flag set —
  `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes`
  — were tried and rolled back: they produced ~500 lines of bracket-
  access and conditional-spread churn without catching any real bugs,
  and `exactOptionalPropertyTypes` would have forced consumers using
  it themselves to deal with our internals' style preferences.

  User-visible API surface is unchanged; this is a hardening pass to
  keep streaming/agent-loop correctness and discriminated-union
  exhaustiveness honest going forward. See issue #564.

- Updated dependencies [[`2ad137b`](https://github.com/TanStack/ai/commit/2ad137bd22512248bd1684cccce35ba89597cf96)]:
  - @tanstack/ai-code-mode@0.1.16

## 0.1.15

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.15

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.14

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.13

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.12

## 0.1.11

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.11

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.10

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.9

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.8

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-code-mode@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`1d1c58f`](https://github.com/TanStack/ai/commit/1d1c58f33188ff98893edb626efd66ac73b8eadb)]:
  - @tanstack/ai-code-mode@0.1.1

## 0.1.0

### Minor Changes

- Add code mode and isolate packages for secure AI code execution ([#362](https://github.com/TanStack/ai/pull/362))

  Also includes fixes for Ollama tool call argument streaming and usage
  reporting, OpenAI realtime adapter handling of missing call_id/item_id,
  realtime client guards for missing toolCallId, and new DevtoolsChatMiddleware
  type export from ai-event-client.

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai-code-mode@0.1.0
