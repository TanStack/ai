# Typed headless chat + shadcn AI components

One-route TanStack Start app. It uses `createUI()` from `@tanstack/ai-react-ui` and the chatbot pieces from [shadcn.io/ai/chatbot](https://www.shadcn.io/ai/chatbot): Conversation, Message, Prompt Input, Model Selector, Reasoning, Sources, plus Tool for approvals.

```bash
pnpm install
cp env.example .env
# set OPENAI_API_KEY
pnpm --filter ts-react-ui-chatbot dev
```

Open http://localhost:3000.
