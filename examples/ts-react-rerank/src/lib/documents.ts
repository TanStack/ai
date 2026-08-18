/**
 * The corpus this example reranks.
 *
 * These are *objects*, not strings, on purpose: `rerank()` is generic over the
 * document element type. Object documents are serialized with `JSON.stringify`
 * before they go to the provider, and the original object comes back on
 * `ranking[n].document` — fully typed, so the UI can read `.title` off a result
 * without a cast or an id lookup.
 *
 * The array order below is deliberately unhelpful. It is roughly "newest
 * article first", which is what a plain CMS listing gives you, and it is a poor
 * answer to every query in `EXAMPLE_QUERIES`. That contrast is the whole point
 * of the demo: the left column is this order, the right column is what the
 * rerank model does with it.
 */
export interface SupportDoc {
  id: string
  title: string
  body: string
}

export const SUPPORT_DOCS: Array<SupportDoc> = [
  {
    id: 'shipping-zones',
    title: 'Shipping zones and delivery estimates',
    body: 'Orders ship from the closest fulfilment centre. Domestic delivery takes two to five business days; international delivery takes seven to twenty-one business days and may be held by customs.',
  },
  {
    id: 'password-reset',
    title: 'Resetting your password',
    body: 'Use "Forgot password" on the sign-in screen. The reset link is valid for one hour. If it expires, request a new one — old links cannot be reused.',
  },
  {
    id: 'gift-cards',
    title: 'Buying and redeeming gift cards',
    body: 'Gift cards are delivered by email and never expire. Redeem one by entering its code at checkout. Gift card balances cannot be transferred back to a bank account.',
  },
  {
    id: 'cancel-subscription',
    title: 'Cancelling your subscription',
    body: 'Open Settings → Billing → Cancel plan. Cancellation takes effect at the end of the current billing period, so you keep access until then. You are not charged again after cancelling.',
  },
  {
    id: 'two-factor',
    title: 'Turning on two-factor authentication',
    body: 'Settings → Security → Two-factor. We support authenticator apps and hardware keys. Save your recovery codes somewhere safe — support cannot regenerate them for you.',
  },
  {
    id: 'refund-window',
    title: 'Refund window and how refunds are paid',
    body: 'Ask for a refund within thirty days of a charge. Approved refunds go back to the original payment method and usually clear within five to ten business days.',
  },
  {
    id: 'seat-management',
    title: 'Adding and removing team seats',
    body: 'Workspace owners can add or remove seats at any time. Adding a seat is billed pro rata immediately; removing a seat credits the unused time to your next invoice.',
  },
  {
    id: 'downgrade-plan',
    title: 'Downgrading instead of cancelling',
    body: 'If you want to stop paying but keep your data, downgrade to the free tier rather than cancelling. Downgrades apply at the next renewal and your projects stay read-only rather than being deleted.',
  },
  {
    id: 'export-data',
    title: 'Exporting your data',
    body: 'Settings → Data → Export produces a ZIP archive of your projects as JSON. Exports are generated in the background; you get an email with a download link valid for 24 hours.',
  },
  {
    id: 'api-rate-limits',
    title: 'API rate limits',
    body: 'The API allows 600 requests per minute per key. Exceeding it returns HTTP 429 with a Retry-After header. Rate limits are per key, not per workspace.',
  },
]

/** Prompts shown as one-click chips above the query box. */
export const EXAMPLE_QUERIES = [
  'how do I stop being billed every month?',
  'I want my money back for a charge',
  'I lost access to my account',
  'can I keep my projects without paying?',
]
