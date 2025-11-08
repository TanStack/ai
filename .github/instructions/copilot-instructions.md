---
applyTo: '**'
---
Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

Whenever you want to build the packages to test if they work you should run `pnpm run build` from the root of the repository.
 
If you want to check if the examples work you need to go to `examples/<example-name>` and run   `pnpm run dev`.

When writing code, please follow these guidelines:
- Use TypeScript for all new code.
- Ensure all new code is covered by tests.
- Do not use `any` type; prefer specific types or generics.
- Follow existing code style and conventions.

If you get an error "address already in use :::42069 you should kill the process using that port.  

