# @tanstack/preact-ai-devtools

## 0.1.60

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.17

## 0.1.59

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.16

## 0.1.58

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.15

## 0.1.57

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.14

## 0.1.56

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.13

## 0.1.55

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.12

## 0.1.54

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.11

## 0.1.53

### Patch Changes

- [#769](https://github.com/TanStack/ai/pull/769) [`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b) - Add repository metadata (`homepage`, `bugs`, `funding`), fix `repository.directory` to point at each package, and include an MIT `LICENSE` file in every published package.

- Updated dependencies [[`1d1bb52`](https://github.com/TanStack/ai/commit/1d1bb5219a38d9718cc926148e93fc27d5d2305b)]:
  - @tanstack/ai-devtools-core@0.4.10

## 0.1.52

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.9

## 0.1.51

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.8

## 0.1.50

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.7

## 0.1.49

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.6

## 0.1.48

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.5

## 0.1.47

### Patch Changes

- Updated dependencies [[`c251038`](https://github.com/TanStack/ai/commit/c251038c6d8aa84e498f89e314ce5bb233bc689f)]:
  - @tanstack/ai-devtools-core@0.4.4

## 0.1.46

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.3

## 0.1.45

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.2

## 0.1.44

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.4.1

## 0.1.43

### Patch Changes

- Updated dependencies [[`5634f18`](https://github.com/TanStack/ai/commit/5634f186a4946ca3e1942fbfcbf1291ec9bd9855)]:
  - @tanstack/ai-devtools-core@0.4.0

## 0.1.42

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.38

## 0.1.41

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.37

## 0.1.40

### Patch Changes

- Refresh package README content and npm metadata for better discoverability. ([#626](https://github.com/TanStack/ai/pull/626))

- Updated dependencies [[`ebeb22e`](https://github.com/TanStack/ai/commit/ebeb22ec68f456b09e0181ac6f5d1ac25a0affd2)]:
  - @tanstack/ai-devtools-core@0.3.36

## 0.1.39

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.35

## 0.1.38

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.34

## 0.1.37

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

## 0.1.36

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.32

## 0.1.35

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.31

## 0.1.34

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.30

## 0.1.33

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.29

## 0.1.32

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.28

## 0.1.31

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.27

## 0.1.30

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.26

## 0.1.29

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.25

## 0.1.28

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.24

## 0.1.27

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.23

## 0.1.26

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.22

## 0.1.25

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.21

## 0.1.24

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.20

## 0.1.23

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.19

## 0.1.22

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.18

## 0.1.21

### Patch Changes

- Updated dependencies [[`7ebf6c2`](https://github.com/TanStack/ai/commit/7ebf6c286e57e05c341cd90b1cda8a9e4b73bc5c)]:
  - @tanstack/ai-devtools-core@0.3.17

## 0.1.20

### Patch Changes

- Updated dependencies [[`54abae0`](https://github.com/TanStack/ai/commit/54abae063c91b8b04b91ecb2c6785f5ff9168a7c)]:
  - @tanstack/ai-devtools-core@0.3.16

## 0.1.19

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.15

## 0.1.18

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.14

## 0.1.17

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.13

## 0.1.16

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.12

## 0.1.15

### Patch Changes

- Updated dependencies [[`f62eeb0`](https://github.com/TanStack/ai/commit/f62eeb0d7efd002894435c7f2c8a9f2790f0b6d7)]:
  - @tanstack/ai-devtools-core@0.3.11

## 0.1.14

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.10

## 0.1.13

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.9

## 0.1.12

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.8

## 0.1.11

### Patch Changes

- Bump up package versions ([#334](https://github.com/TanStack/ai/pull/334))

- Updated dependencies [[`d40adfe`](https://github.com/TanStack/ai/commit/d40adfed2dc2964eb77f8f192e74c3e0aae08460), [`d40adfe`](https://github.com/TanStack/ai/commit/d40adfed2dc2964eb77f8f192e74c3e0aae08460)]:
  - @tanstack/ai-devtools-core@0.3.7

## 0.1.10

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.6

## 0.1.9

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.5

## 0.1.8

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.4

## 0.1.7

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.3

## 0.1.6

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.2

## 0.1.5

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.3.1

## 0.1.4

### Patch Changes

- Updated dependencies [[`0158d14`](https://github.com/TanStack/ai/commit/0158d14df00639ff5325680ae91b7791c189e60f)]:
  - @tanstack/ai-devtools-core@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.2.3

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @tanstack/ai-devtools-core@0.2.2

## 0.1.1

### Patch Changes

- Fix issue with double mounting of devtools ([#123](https://github.com/TanStack/ai/pull/123))

- Updated dependencies [[`a19b247`](https://github.com/TanStack/ai/commit/a19b247d6e7fe44749ede2416e21c6d9e2045912)]:
  - @tanstack/ai-devtools-core@0.2.1

## 0.1.0

### Minor Changes

- Initial release ([#204](https://github.com/TanStack/ai/pull/204))

### Patch Changes

- Updated dependencies [[`b2a5fab`](https://github.com/TanStack/ai/commit/b2a5fab6b4f2f6d9980c9691f7fc864f01eb48d1)]:
  - @tanstack/ai-devtools-core@0.2.0
