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

If we add a new functionality add a section about it in the `docs/` folder explaining how to use it and update the `README.md` file to mention it.

Write tests for any new functionality.

When defining new types, first check if the types exist somewhere and re-use them, do not create new types that are similar to existing ones.

When modifying existing functionality, ensure backward compatibility unless there's a strong reason to introduce breaking changes. If breaking changes are necessary, document them clearly in the relevant documentation files.

When subscribing to an event using `aiEventClient.on` in the devtools packages, always add the option `{ withEventTarget: false }` as the second argument to prevent over-subscriptions in the devtools.

Under no circumstances should casting `as any` be used in the codebase. Always strive to find or create the appropriate type definitions. Avoid casting unless absolutely neccessary, and even then, prefer using `satisfies` for type assertions to maintain type safety.