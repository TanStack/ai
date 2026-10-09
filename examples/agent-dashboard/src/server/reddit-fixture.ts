/**
 * A recorded slice of Reddit's public Atom feed (`/r/reactjs/new.rss`), trimmed
 * to three entries. It is the deterministic input for the parser unit test (see
 * reddit.test.ts) AND the response `fetchReactNews` serves under `VITE_E2E` so
 * the e2e loop is hermetic (no live network, no rate limits). The live tool
 * reads the real feed; this is only its stand-in for tests.
 */
export const redditReactNewsFixture = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <category term="reactjs" label="r/reactjs"/>
  <updated>2026-09-24T18:00:00+00:00</updated>
  <id>/r/reactjs.rss</id>
  <link rel="alternate" href="https://www.reddit.com/r/reactjs" type="text/html" />
  <title>newest submissions : reactjs</title>
  <entry>
    <author><name>/u/dan_abramov</name><uri>https://www.reddit.com/user/dan_abramov</uri></author>
    <category term="reactjs" label="r/reactjs"/>
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;After a long beta, the &lt;strong&gt;React Compiler&lt;/strong&gt; ships stable. It auto-memoizes components so you can drop most useMemo/useCallback calls. Migration guide inside.&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt;</content>
    <id>t3_1abcd1</id>
    <link href="https://www.reddit.com/r/reactjs/comments/1abcd1/react_compiler_is_now_stable_in_react_192/" />
    <updated>2026-09-24T17:00:00+00:00</updated>
    <title>React Compiler is now stable in React 19.2</title>
  </entry>
  <entry>
    <author><name>/u/signals_dev</name><uri>https://www.reddit.com/user/signals_dev</uri></author>
    <category term="reactjs" label="r/reactjs"/>
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;I built a minimal signals primitive that plays nicely with concurrent React. Feedback welcome &amp;#8212; is fine-grained reactivity worth it here?&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt;</content>
    <id>t3_1abcd2</id>
    <link href="https://www.reddit.com/r/reactjs/comments/1abcd2/show_rreactjs_a_tiny_1kb_signals_library_for/" />
    <updated>2026-09-24T16:00:00+00:00</updated>
    <title>Show /r/reactjs: a tiny 1kb signals library for React</title>
  </entry>
  <entry>
    <author><name>/u/confused_dev</name><uri>https://www.reddit.com/user/confused_dev</uri></author>
    <category term="reactjs" label="r/reactjs"/>
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;Frustrated. I moved data fetching into RSCs but every route change refetches everything. Am I holding it wrong or is this expected with the app router?&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt;</content>
    <id>t3_1abcd3</id>
    <link href="https://www.reddit.com/r/reactjs/comments/1abcd3/why_are_my_server_components_rerendering/" />
    <updated>2026-09-24T15:00:00+00:00</updated>
    <title>Why are my server components re-rendering on every navigation?</title>
  </entry>
</feed>`
