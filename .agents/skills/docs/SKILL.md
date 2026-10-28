---
name: docs
description: Use when writing, editing, or organizing documentation, when planning what docs a feature needs, and whenever planning or implementing a new feature or change in a repo (docs ship with the code). Also use when tempted to write docs without naming the readers, without picking a tone, or without loading simple-english and i-have-adhd. Triggers on "write docs for X", "document this feature", "add a guide", "update the docs", "reorganize the docs", "plan feature X", "implement X", or /docs.
---

# docs

Write docs a real person wants to read. Short, plain, built around someone trying to do a real thing.

"Document feature X" is not the job. "Help someone do Y with X" is the job.

Work in two phases. First plan the story: who reads this, what they want, and how many pages it should be. Then write.

Do not ask the user to approve the plan or the tone. Pick sane defaults, state them in one line each, and keep going. The user can correct you after.

```text
Find docs
  → read neighbors
  → Phase 1: readers + pages
  → state the readers + pages (one line each, no question)
  → state the tone (match neighbors, no question)   [when writing pages]
  → load simple-english + i-have-adhd   [when writing pages]
  → Phase 2: write
```

A doc-impact list in a feature plan still names the reader for each page. It does not pick a tone or load the writing skills until pages are actually written.

## When to run

Docs ship with the code. Run this skill at three moments, not only when asked.

- Someone asks for docs. Write them.
- Planning a feature or change in a repo. Before the plan is done, list which docs are new and which need updating. This doc-impact list is part of the plan, the same as the code changes. Name the reader for each page.
- Finishing an implementation. Write or update those docs before you call the work done. A change to how something behaves that ships no doc change is not finished.

## Required skills for the final pages

`simple-english` and `i-have-adhd` are prerequisites. They apply to the documentation pages, not to this planning chat.

Load both immediately before writing page content. Use the Skill tool if this harness has one. If it does not, Read:

- `.claude/skills/simple-english/SKILL.md`
- `.claude/skills/i-have-adhd/SKILL.md`

Copies also live at `.agents/skills/` (Codex) and `.grok/skills/` (Grok). Keep those three files identical.

If either file is missing, stop and tell the user. Do not write the pages without them.

How they compose:

- This skill owns who the page is for, the page split, the call-first opener, show-don't-tell, no history leak, forbidden glyphs, and neighbor structure.
- `simple-english` owns the sentences. Use pragmatic mode. Run its self-check before you call a page done.
- `i-have-adhd` owns the shape of the page: next action first, numbered steps, lists capped at 5 (split must vs later, or split the page), no preamble, a visible win at the end.

When `i-have-adhd` is loaded from this skill, apply it to the pages only. Do not switch the rest of the session into ADHD mode. The persistence section of `i-have-adhd` does not apply here.

## Find the docs first

Before writing anything, find where docs live.

1. Look for a docs folder. Check `docs/` first, then `documentation/`, `content/docs/`, `site/`, `website/docs/`.
2. Found nothing? Put the page in the README or the closest existing docs file, and say where you put it. Do not create a new docs folder on a hunch.
3. Open 2 or 3 existing pages near where the new content belongs. Read them for copy, structure, frontmatter fields, and components. Note their tone. That is the tone you write in.
4. Note which components the site already uses (steps, tabs, callouts, cards, accordions, code groups, and so on). Different sites have different ones.
5. Reuse those components to tell the story. If the site has a steps component, use it for walkthroughs. If it has tabs, use them for framework variations. If the site has none, use plain markdown. Never invent a component the site does not have.

### Package manager tabs

Install commands use the site's package-manager tabs. Do not stack `npm` / `pnpm` / `yarn` in one fence.

Core chat install (every framework):

```md
<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-vue @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-solid @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-svelte @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-preact @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-angular @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-octane @tanstack/ai-openai octane
vanilla: @tanstack/ai @tanstack/ai-client @tanstack/ai-openai

<!-- ::end:tabs -->
```

Rules:

- A page that is already one framework lists only that framework's line.
- A package that does not change by framework repeats the same packages on every framework line (`react` through `vanilla` and `octane`).
- Octane's UI package is `@tanstack/ai-octane` plus the `octane` compiler package.
- `mode="install"` is the default add. `mode="dev-install"` is `-D`. `mode="local-install"` is `npx` / `pnpx` / `yarn dlx` / `bunx`. `mode="custom"` is any other command shape (`install -g ...`).
- Repeat a framework line to emit more than one command.
- Do not use this for env files, sandbox `setup:` arrays, or a fence that mixes install with other commands. Split the install out, then leave the rest as a fence.

If there is no page like the one you are about to write, read the closest one you can find and match it.

### What "match the neighbors" covers, and what it does not

Matching neighbors is about **copy, structure, frontmatter, and components**: whether headings are sentence case, how much setup a section gets, which components carry the walkthrough, how code samples are introduced, what the frontmatter fields are.

It is **not** permission to copy a neighbor's bad habits. Everything in [Forbidden](#forbidden) and every rule in this skill still applies to the content you write, no matter what the surrounding pages do. An existing page full of em dashes does not license one more.

So: never reason "the other pages do it, so I will too" about a rule this skill states. If existing pages break a rule and you think the whole set should be brought in line, that is a separate cleanup to raise with the user, not something to settle by quietly matching the violation.

## Phase 1: plan the story

Do this before you write a word of content.

1. List who reads this and what each one wants. A person building on a React SPA, a person on a server-rendered app, someone who just wants a quick demo, someone extending the internals. Do not stop at the first reader.
2. Write one user story per reader: "As a X, I want to Y, so I can Z."
3. Turn stories into pages. One journey is one page. Different journeys are different pages. A feature with three real journeys is three pages plus maybe a short overview, not one giant page.
4. Check every reader has a path. A reader with no page is a hole in the plan. Add a page or a route for them.

The page split comes out of this step. Do not skip it.

### State the readers

After step 4, put the readers and their pages in your message to the user, one line per reader: the user story and the page. Do not ask a question and do not wait. Continue to Phase 2 in the same turn.

The user reads the list and corrects you if a reader is wrong. A list that only lives in your thinking or a todo does not count. Skip the list only for a tiny copy edit (typo, broken link, code-fence language, factual fix).

## Less is more: split, do not cram

Do not force thousands of words into one page. Long pages hide the answer.

When a topic has several angles, give each its own short page and link them. A reader lands on the overview, then clicks into the exact thing they need.

Example. A feature for tool interrupts:

```text
Bad: one page
  interrupts.md   (overview + simple case + many interrupts + custom, all crammed in)

Good: a small set of linked pages
  interrupts/index.md            what it is, when to use it, links out
  interrupts/basic.md            one interrupt, start to finish
  interrupts/multiple.md         several interrupts in a flow
  interrupts/custom.md           build your own
```

Each page is short and does one thing. The overview stitches them into a story.

## Pick the tone

Use the tone of the neighboring pages. State it in one line (how formal, how much setup, second person or not) and continue. Do not ask.

If the user already named a tone in this conversation, use theirs.

## Phase 2: write like a human

Do not write page content until you have stated the readers and the tone, and `simple-english` plus `i-have-adhd` are loaded.

Legibility is the goal, above everything else.

- Keep it digestible. No walls of text, no huge paragraphs. Break ideas into small pieces. Give the smallest amount of info that does the job.
- Sentences follow `simple-english` (pragmatic mode). Do not inline a weaker substitute.
- Keep markdown light. Lists are fine. Bold headings on every line are not. Let the words carry the page.
- Prefer plain ASCII and normal keyboard characters over fancy glyphs. Write the way a person types.
- Second person, action first. Start with what the reader has now and what they will have at the end. No "In this guide we will explore..." openings. Just start.
- Shape the page with `i-have-adhd`: the first line is something the reader can do, multi-step work is numbered, a list longer than 5 is split, the page ends on a visible win.

### Open with the call

The first one or two sentences name the call and what the reader gets from it. A reader who lands from search knows in one line whether this page has their answer.

```text
Bad:
  Some tool calls shouldn't run without a human saying yes: moving money,
  deleting data. An interrupt pauses the run for that decision...

Good:
  Set `needsApproval: true` on a tool. The run pauses before the tool runs,
  and continues after a person approves it.

Good:
  `chat()` returns each token while the model writes the reply. `useChat`
  renders those tokens. Call `stop()` to cancel the run.
```

The opener is the page's only summary. The next line starts the steps or the code. Each idea in the opener is said once on the page, so the paragraph after it adds something new.

When the reader must know a limit to pick the right page, put it in the opener: "`chat()` with `outputSchema` returns one typed object. It does not stream or run tools."

The order for a guide is the call, then the steps and code. The code shows how it works, so the prose between snippets stays short.

### Show, do not tell

Do not explain in four paragraphs what one sentence and a code block can show. Readers grasp a diff or a snippet faster than prose.

```text
Bad:
  Three paragraphs describing how the config object accepts a
  middleware array, what each slot does, and how ordering works.

Good:
  Add your middleware to the `middleware` array. Order runs top to bottom:

  const app = createApp({
    middleware: [auth, logging],
  })
```

One good runnable example beats a page of description. Every code sample must run when copied, not need imagination to fill gaps.

### List anything that is a list

The moment a sentence covers more than one item, option, store, flag, or step, it becomes a list. Do not chain them into a paragraph with commas and semicolons. A reader scanning a bulleted list finds their item in a second. In a paragraph they have to read the whole thing to learn it does not apply to them.

The tell is a sentence that names two or more things and says something about each. Cut it into one bullet per thing, one or two sentences each.

```text
Bad:
  Each store is independent. Provide only the ones you need. For chat:
  `messages` for the transcript, `runs` for run lifecycle, `interrupts` for
  durable approvals (needs `runs`), `metadata` for namespaced key/value state.
  For generation: `generationRuns` for the run lifecycle, plus `artifacts` and
  `blobs` to keep generated bytes.

Good:
  Each store is independent, so provide only the ones you need.

  For chat:

  - `messages`: the transcript.
  - `runs`: run lifecycle.
  - `interrupts`: durable approvals. Needs `runs`.
  - `metadata`: namespaced key/value state.

  For generation:

  - `generationRuns`: run lifecycle for a generation.
  - `artifacts` + `blobs`: keep the generated bytes.
```

Which form to reach for:

- **Bullets** for a set where order does not matter: options, stores, fields, reasons, gotchas.
- **Numbered steps** for a sequence the reader performs in order.
- **A table** when every item has the same two or three attributes to compare (name, meaning, when to use).
- **A paragraph** only for a single idea that genuinely flows as prose. One thought, two or three sentences, no embedded set.

Keep bullets short and parallel: the same grammatical shape, the item in `code` or bold at the front, the explanation after it. A bullet that grows past two sentences wants to be its own subsection.

If a list grows past five items, split it. Put "do now" first. Put the rest on a later page, or under "later". That is the `i-have-adhd` cap, not a style preference.

### Page shape for a guide

Call, steps, done.

- Open with the call and what the reader gets from it, in one or two sentences.
- Walk through steps they can follow and test as they go, with the code doing the explaining.
- End when they reach the goal. Show what now works. Do not close with a vague "next steps" dump.

Reference pages (props, types, signatures) stay scannable and link back to the guide that shows them in use.

## Write for the reader, not the history

Docs describe what exists now. The reader never saw the old design, the earlier name, the draft PR, or the API you replaced along the way. Do not make them read about it.

Never justify the current API by comparing it to a version that did not ship. A line like "instead of `useAssistant`, this uses `usePlugin`, which makes more sense because..." is noise to someone who never knew `useAssistant` existed. Cut it and just describe `usePlugin`.

```text
Bad:
  We renamed useAssistant to usePlugin and moved the tools onto it,
  so instead of calling assistant.addTool you now use plugin.tools.

Good:
  Register tools on the plugin with plugin.tools:

  const plugin = usePlugin({ tools: [search] })
```

Ban this framing from the output: "instead of X", "we renamed", "previously called", "this replaces the old", "unlike the earlier", and any transitional name that never reached a release.

The one exception is a real migration. If users had X in a shipped, public release and you are moving them to Y, a short "Migrating from X" note is worth writing, because those readers actually used X. A name that only lived in a branch or a draft is not that. When unsure whether an old name shipped, leave it out.

## Don't leak the build process

The doc is read by someone who just arrived. They never saw the pull request, the refactor, or the conversation where the design was decided (including a conversation with an agent while writing the code and the docs). Write as if the current design was always the design. Anything that only makes sense to someone who watched it change is noise to the reader.

**Cut rejected alternatives.** If a discussion weighed option A against option B and picked B, the doc documents B. It never names A, never says B is "better than" A, never says A "is no longer needed." The reader is not choosing between them; they use what shipped.

```text
Bad:
  We use a plain JSON Schema here instead of zod, since it is lighter
  and zod is no longer a dependency.

Good:
  Pass the tool's input shape as a JSON Schema:

  [code]
```

**Do not explain what something is not, when the reader never thought it was.** If a piece moved out of a module during a refactor, the doc for its new home does not warn against the old arrangement. A reader who never knew locks lived inside persistence is only confused by a paragraph insisting locks are not a persistence store and must not be passed in as one. State what the thing is now, in its own terms.

```text
Bad (in the locks doc):
  Locks are not a persistence store. Do not pass a lock into the stores
  map. That used to be possible but is wrong now.

Good (in the locks doc):
  A lock coordinates work across instances. Wire it with withLocks:

  [code]
```

The test: read the sentence as a brand-new user. If it answers a question they would never ask ("wait, was this somewhere else before?") or defends a choice they never knew existed, delete it. The doc has no memory of how it got here.

## Forbidden

Never use these. Ever. This list has no exceptions: not "the neighboring pages use them", not "the repo's house style uses them", not "it reads better here".

- Em dashes and en dashes: the long `—` and the shorter `–`. Rewrite the sentence with a comma, colon, period, or parentheses instead.
- Separator glyphs like `×` or `·`.
- The pattern "It's not X: it's Y." and the "Not just X, but Y" three-part build-up.
- The phrases "key insight", "gap", and variations of them.

If you catch yourself reaching for one of these, stop and rewrite the sentence in plain words.

Before you call a page done, search your own added text for `—`, `–`, `×`, and `·`. If a hit survived, you rationalized it. Fix it. Flagging it in your summary is not a substitute for fixing it.

Then run the `simple-english` self-check on the same added text.

## Cross-linking and placement

- Put new pages where they fit the reader's path, grouped by what the reader is doing ("Building with React"), not by code layer ("Frontend Package API"). Update the site's nav or index so the page is reachable. An orphan page does not ship.
- Link related pages at the moment they help, inline in the flow, not as a "Related" dump at the bottom.
- Cross-linking goes both ways. When you add a page, update the older pages that should point into it.
- Do not over-link. One well-placed "need X? see Y" beats a list of maybes.

## Red flags

| You catch yourself | Do instead |
|---|---|
| Opening with a scene, a background story, or "In this guide" | Open with the call and its result in one or two sentences, then the steps. |
| A second paragraph that restates the opener | Cut it. The paragraph after the opener starts the steps or adds a new fact. |
| Writing three paragraphs before any code | Cut to one sentence plus a snippet. Show it. |
| Writing a sentence that names two or more things and explains each | Make it a bulleted list, one item per bullet. |
| A paragraph with commas or semicolons separating a set of options/stores/flags | Same fix: that is a list, format it as one. |
| Cramming every angle into one page | Split into short linked pages, one job each. |
| "In this guide we will explore..." | Delete it. Start with the reader's state and goal. |
| "Let me describe what this component does" | Describe what the reader does with it. |
| Reaching for an em dash | Rewrite with a comma, period, or parentheses. |
| "The surrounding pages do X, so I will too" where X breaks a rule here | Match neighbors on structure only. Follow this skill on everything it covers, and raise the existing violations as their own cleanup. |
| Using a big word (utilize, leverage, facilitate) | Swap in the plain word. `simple-english` owns this. |
| One page for everyone | Name the readers. Give each a path or a page. State the list. |
| Posting a snippet "they can adapt" | Make it complete and runnable. |
| Guessing where docs go | Find the docs folder. Read neighbors first. |
| Calling a feature done with no doc change | If behavior changed, docs change too. Write them before you finish. |
| Planning a feature without a doc-impact list | Add the list of new and changed docs to the plan. Name the reader for each page. |
| "Unlike the old X, this now..." / "we renamed X to Y" | The reader never saw X. Describe only what ships now. |
| "we chose Y over zod because..." / "X is no longer needed" | Cut the rejected alternative. Document only what shipped, no comparison. |
| Warning readers not to do a thing they never knew was possible (e.g. "don't pass locks as a store") | Delete it. If they never saw the old arrangement, the warning only confuses. Describe the thing in its own terms. |
| Inventing a component the site lacks | Use only components the site already has. |
| Stacking `npm` / `pnpm` / `yarn` in one install fence | Use `<!-- ::start:tabs variant="package-manager" mode="install" -->`. |
| Writing pages without loading simple-english and i-have-adhd | Load both. If either is missing, stop. |
| Asking the user to confirm readers or tone, then ending the turn | Do not ask. State them in one line each and keep writing. |
