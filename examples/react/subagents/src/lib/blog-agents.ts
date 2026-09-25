// Shared by the server and the browser, so it holds no server code. The
// server adds `run` in `agents.ts`. The browser passes the list to the chat
// UI factory for types.
export const researcher = {
  name: 'researcher',
  description:
    'Does this turn need facts or sources? Answer yes when the user asks to look something up, even if they also ask for a draft or for SEO. Answer no when they do not ask to look anything up.',
} as const

export const writer = {
  name: 'writer',
  description:
    'Does this turn need a written article, post, or rewrite? Answer yes only when the user asks for an article, post, draft, or rewrite. Answer no when they ask for research or SEO and do not ask for an article.',
} as const

export const seo = {
  name: 'seo',
  description:
    'Does this turn need SEO work? Answer yes when the user asks for SEO, search titles, a meta description, or tags. Answer no when they do not mention SEO, titles, a meta description, or tags.',
} as const

export const blogAgents = [researcher, writer, seo] as const
