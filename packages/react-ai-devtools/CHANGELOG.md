# @tanstack/react-ai-devtools

## 0.2.48

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.5

## 0.2.47

### Patch Changes

- Updated dependencies [[`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f)]:
  - @tanstack/ai-devtools-core@0.4.4

## 0.2.46

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.3

## 0.2.45

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.2

## 0.2.44

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.1

## 0.2.43

### Patch Changes

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-devtools-core@0.4.0

## 0.2.42

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.38

## 0.2.41

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.37

## 0.2.40

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-devtools-core@0.3.36

## 0.2.39

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.35

## 0.2.38

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.34

## 0.2.37

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
  - @tanstack/ai-devtools-core@0.3.33

## 0.2.36

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.32

## 0.2.35

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.31

## 0.2.34

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.30

## 0.2.33

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.29

## 0.2.32

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.28

## 0.2.31

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.27

## 0.2.30

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.26

## 0.2.29

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.25

## 0.2.28

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.24

## 0.2.27

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.23

## 0.2.26

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.22

## 0.2.25

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.21

## 0.2.24

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.20

## 0.2.23

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.19

## 0.2.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.18

## 0.2.21

### Patch Changes

- Updated dependencies [[`7ebf6c2`](https://github.com/TanStack/ai/commit/7ebf6c286e57e05c341cd90b1cda8a9e4b73bc5c)]:
  - @tanstack/ai-devtools-core@0.3.17

## 0.2.20

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai-devtools-core@0.3.16

## 0.2.19

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.15

## 0.2.18

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.14

## 0.2.17

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.13

## 0.2.16

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.12

## 0.2.15

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai-devtools-core@0.3.11

## 0.2.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.10

## 0.2.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.9

## 0.2.12

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.8

## 0.2.11

### Patch Changes

- Bump up package versions ([#334](https://github.com/TanStack/ai/pull/334))

- Updated dependencies [[`d40adfe`](https://github.com/TanStack/ai/commit/d40adfed2dc2964eb77f8f192e74c3e0aae08460), [`d40adfe`](https://github.com/TanStack/ai/commit/d40adfed2dc2964eb77f8f192e74c3e0aae08460)]:
  - @tanstack/ai-devtools-core@0.3.7

## 0.2.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.6

## 0.2.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.5

## 0.2.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.4

## 0.2.7

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.3

## 0.2.6

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.2

## 0.2.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.1

## 0.2.4

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai-devtools-core@0.3.0

## 0.2.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.2.3

## 0.2.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.2.2

## 0.2.1

### Patch Changes

- Fix issue with double mounting of devtools ([#123](https://github.com/TanStack/ai/pull/123))

- Updated dependencies [[`a19b247`](https://github.com/TanStack/ai/commit/a19b247d6e7fe44749ede2416e21c6d9e2045912)]:
  - @tanstack/ai-devtools-core@0.2.1

## 0.2.0

### Minor Changes

- Bump tanstack-devtools to 0.2.3 ([#204](https://github.com/TanStack/ai/pull/204))

### Patch Changes

- Updated dependencies [[`b2a5fab`](https://github.com/TanStack/ai/commit/b2a5fab6b4f2f6d9980c9691f7fc864f01eb48d1)]:
  - @tanstack/ai-devtools-core@0.2.0

## 0.1.2

### Patch Changes

- fix up readmes ([#188](https://github.com/TanStack/ai/pull/188))

- Updated dependencies [[`181e0ac`](https://github.com/TanStack/ai/commit/181e0acdfb44b27db6cf871b36593c0f867cadf9)]:
  - @tanstack/ai-devtools-core@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.1.1

## 0.1.0

### Minor Changes

- Split up adapters for better tree shaking into separate functionalities ([#137](https://github.com/TanStack/ai/pull/137))

### Patch Changes

- Updated dependencies [[`8d77614`](https://github.com/TanStack/ai/commit/8d776146f94ffd1579e1ab01b26dcb94d1bb3092)]:
  - @tanstack/ai-devtools-core@0.1.0

## 0.0.3

### Patch Changes

- Updated dependencies [[`52c3172`](https://github.com/TanStack/ai/commit/52c317244294a75b0c7f5e6cafc8583fbb6abfb7)]:
  - @tanstack/ai-devtools-core@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.0.2

## 0.0.1

### Patch Changes

- initial release of AI ([#76](https://github.com/TanStack/ai/pull/76))

## 0.0.1

### Patch Changes

- Initial release of TanStack AI ([#72](https://github.com/TanStack/ai/pull/72))

- Updated dependencies [[`a9b54c2`](https://github.com/TanStack/ai/commit/a9b54c21282d16036a427761e0784b159a6f2d99)]:
  - @tanstack/ai-devtools-core@0.0.1
