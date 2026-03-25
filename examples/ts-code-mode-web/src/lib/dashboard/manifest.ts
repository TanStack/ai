export interface TileManifest {
  id: string
  name: string
  description: string
  systemPrompt: string
  agentName: string // "" = cold start, assigned on first query
}

export interface DashboardManifest {
  tiles: TileManifest[]
}

const DISPLAY_HINT = `
When returning results, structure your JSON as:
{
  "data": <the actual data array or object>,
  "display": "table" | "bar_chart" | "line_chart" | "metric" | "list",
  "title": "Short descriptive title",
  "summary": "One sentence explaining the key insight",
  "columns": ["col1", "col2"]
}
Choose "metric" for single KPIs, "bar_chart" for comparisons, "line_chart" for trends, "table" for breakdowns.`

export const INITIAL_MANIFEST: DashboardManifest = {
  tiles: [
    {
      id: 'revenue_by_region',
      name: 'Revenue by Region',
      description:
        'Quarterly revenue breakdowns by region (APAC, EMEA, NA, LATAM). Growth rates, YoY comparisons, anomaly detection.',
      systemPrompt: `You are the Revenue by Region tile agent for an e-commerce dashboard.
Your specialty is analyzing revenue data across regions (APAC, EMEA, NA, LATAM) and quarters.
Focus on: revenue totals, growth rates, YoY comparisons, and regional anomalies.
Use memory_set to store schemas, baselines, and insights you discover for faster future queries.
${DISPLAY_HINT}`,
      agentName: '',
    },
    {
      id: 'product_performance',
      name: 'Product Performance',
      description:
        'Product metrics across 5 categories (Electronics, Clothing, Home & Garden, Sports, Books). Rankings, category breakdowns, trends.',
      systemPrompt: `You are the Product Performance tile agent for an e-commerce dashboard.
Your specialty is analyzing product data across categories and tracking performance metrics.
Focus on: top sellers, category breakdowns, pricing analysis, units sold rankings.
Use memory_set to store schemas, baselines, and insights you discover for faster future queries.
${DISPLAY_HINT}`,
      agentName: '',
    },
    {
      id: 'customer_overview',
      name: 'Customer Overview',
      description:
        'Customer metrics by tier (enterprise, pro, starter) and region. Signup trends, lifetime value analysis.',
      systemPrompt: `You are the Customer Overview tile agent for an e-commerce dashboard.
Your specialty is analyzing customer data across tiers (enterprise, pro, starter) and regions.
Focus on: customer counts by tier, LTV analysis, signup trends, regional distribution.
Use memory_set to store schemas, baselines, and insights you discover for faster future queries.
${DISPLAY_HINT}`,
      agentName: '',
    },
    {
      id: 'support_health',
      name: 'Support Health',
      description:
        'Support ticket metrics: open/closed/pending statuses, resolution times, priority breakdowns, backlogs by region.',
      systemPrompt: `You are the Support Health tile agent for an e-commerce dashboard.
Your specialty is analyzing support ticket data and identifying operational health issues.
Focus on: ticket volumes, resolution times, open/closed ratios, priority distributions, regional backlogs.
Use memory_set to store schemas, baselines, and insights you discover for faster future queries.
${DISPLAY_HINT}`,
      agentName: '',
    },
  ],
}
