// ─── Deterministic seed data for dashboard demo ──────────────────────────

export interface Product {
  id: number
  name: string
  category: string
  price: number
  unitsSold: number
}

export interface Sale {
  id: number
  productId: number
  region: string
  quarter: string
  year: number
  revenue: number
  units: number
}

export interface Customer {
  id: number
  name: string
  email: string
  tier: string
  region: string
  signupDate: string
  lifetimeValue: number
}

export interface SupportTicket {
  id: number
  customerId: number
  subject: string
  status: string
  priority: string
  category: string
  createdAt: string
  resolvedAt: string | null
  resolutionHours: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

const CATEGORIES = ['Electronics', 'Clothing', 'Home & Garden', 'Sports', 'Books']
const REGIONS = ['APAC', 'EMEA', 'NA', 'LATAM']
const TIERS = ['enterprise', 'pro', 'starter']
const TICKET_STATUSES = ['open', 'closed', 'pending']
const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical']
const TICKET_CATEGORIES = ['billing', 'technical', 'account', 'feature_request', 'bug']

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Wei', 'Yuki', 'Ahmed', 'Priya', 'Carlos',
]
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Lee', 'Chen', 'Kim', 'Patel', 'Singh', 'Tanaka',
  'Mueller', 'Santos', 'Okafor', 'Nakamura',
]

const PRODUCT_NAMES: Record<string, string[]> = {
  Electronics: [
    'Wireless Earbuds', 'Smart Watch', 'Portable Charger', 'Bluetooth Speaker',
    'USB-C Hub', 'Webcam Pro', 'Mechanical Keyboard', 'Gaming Mouse',
    'Monitor Light', 'Tablet Stand',
  ],
  Clothing: [
    'Cotton T-Shirt', 'Denim Jacket', 'Running Shoes', 'Wool Sweater',
    'Cargo Pants', 'Baseball Cap', 'Silk Scarf', 'Leather Belt',
    'Athletic Shorts', 'Rain Jacket',
  ],
  'Home & Garden': [
    'LED Desk Lamp', 'Plant Pot Set', 'Kitchen Scale', 'Air Purifier',
    'Throw Blanket', 'Wall Clock', 'Ceramic Vase', 'Tool Kit',
    'Garden Hose', 'Shelf Organizer',
  ],
  Sports: [
    'Yoga Mat', 'Resistance Bands', 'Water Bottle', 'Jump Rope',
    'Foam Roller', 'Dumbbell Set', 'Tennis Racket', 'Soccer Ball',
    'Cycling Gloves', 'Hiking Backpack',
  ],
  Books: [
    'TypeScript Handbook', 'AI Fundamentals', 'Clean Code', 'System Design',
    'Data Structures', 'Machine Learning', 'Web Dev Guide', 'Cloud Computing',
    'DevOps Manual', 'Security Primer',
  ],
}

const TICKET_SUBJECTS = [
  'Cannot access dashboard', 'Billing discrepancy', 'Feature request: export',
  'Login issues', 'Slow performance', 'Integration not working', 'Data sync error',
  'Account upgrade request', 'API rate limit hit', 'Missing data in reports',
  'Password reset failed', 'Invoice correction needed', 'Webhook not firing',
  'Permission denied error', 'Mobile app crash',
]

// ─── Generate Products ───────────────────────────────────────────────────

const rand = seededRandom(42)

export const PRODUCTS: Product[] = []
let productId = 1
for (const category of CATEGORIES) {
  const names = PRODUCT_NAMES[category]!
  for (const name of names) {
    const price = Math.round((rand() * 200 + 10) * 100) / 100
    PRODUCTS.push({
      id: productId++,
      name,
      category,
      price,
      unitsSold: Math.floor(rand() * 5000 + 100),
    })
  }
}

// ─── Generate Sales ──────────────────────────────────────────────────────

export const SALES: Sale[] = []
let saleId = 1
const YEARS = [2024, 2025]
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

for (const product of PRODUCTS) {
  for (const year of YEARS) {
    for (const quarter of QUARTERS) {
      for (const region of REGIONS) {
        const baseRevenue = product.price * (rand() * 50 + 10)
        let revenue = Math.round(baseRevenue * 100) / 100
        const units = Math.floor(revenue / product.price)

        // Anomaly: APAC Q3 2025 revenue dip (~12%)
        if (region === 'APAC' && quarter === 'Q3' && year === 2025) {
          revenue = Math.round(revenue * 0.88 * 100) / 100
        }

        // Anomaly: Electronics spiking in Q4 2025
        if (product.category === 'Electronics' && quarter === 'Q4' && year === 2025) {
          revenue = Math.round(revenue * 1.45 * 100) / 100
        }

        SALES.push({
          id: saleId++,
          productId: product.id,
          region,
          quarter,
          year,
          revenue,
          units,
        })
      }
    }
  }
}

// ─── Generate Customers ──────────────────────────────────────────────────

export const CUSTOMERS: Customer[] = []
for (let i = 1; i <= 200; i++) {
  const firstName = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]!
  const lastName = LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]!
  const tier = TIERS[Math.floor(rand() * TIERS.length)]!
  const region = REGIONS[Math.floor(rand() * REGIONS.length)]!
  const month = Math.floor(rand() * 24) + 1
  const year = month <= 12 ? 2024 : 2025
  const m = month <= 12 ? month : month - 12
  const day = Math.floor(rand() * 28) + 1
  const ltv =
    tier === 'enterprise'
      ? Math.round((rand() * 50000 + 10000) * 100) / 100
      : tier === 'pro'
        ? Math.round((rand() * 10000 + 1000) * 100) / 100
        : Math.round((rand() * 1000 + 50) * 100) / 100

  CUSTOMERS.push({
    id: i,
    name: `${firstName} ${lastName}`,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@example.com`,
    tier,
    region,
    signupDate: `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    lifetimeValue: ltv,
  })
}

// ─── Generate Support Tickets ────────────────────────────────────────────

export const SUPPORT_TICKETS: SupportTicket[] = []
for (let i = 1; i <= 500; i++) {
  const customerId = Math.floor(rand() * 200) + 1
  const region = CUSTOMERS[customerId - 1]!.region
  const subject = TICKET_SUBJECTS[Math.floor(rand() * TICKET_SUBJECTS.length)]!
  const priority = TICKET_PRIORITIES[Math.floor(rand() * TICKET_PRIORITIES.length)]!
  const category = TICKET_CATEGORIES[Math.floor(rand() * TICKET_CATEGORIES.length)]!

  // Anomaly: EMEA has higher open:closed ratio
  let status: string
  if (region === 'EMEA') {
    status = rand() < 0.45 ? 'open' : rand() < 0.7 ? 'pending' : 'closed'
  } else {
    status = TICKET_STATUSES[Math.floor(rand() * TICKET_STATUSES.length)]!
  }

  const month = Math.floor(rand() * 24) + 1
  const year = month <= 12 ? 2024 : 2025
  const m = month <= 12 ? month : month - 12
  const day = Math.floor(rand() * 28) + 1
  const createdAt = `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  let resolvedAt: string | null = null
  let resolutionHours: number | null = null
  if (status === 'closed') {
    resolutionHours = Math.round((rand() * 72 + 1) * 10) / 10
    const resolveDay = Math.min(day + Math.floor(resolutionHours / 24) + 1, 28)
    resolvedAt = `${year}-${String(m).padStart(2, '0')}-${String(resolveDay).padStart(2, '0')}`
  }

  SUPPORT_TICKETS.push({
    id: i,
    customerId,
    subject,
    status,
    priority,
    category,
    createdAt,
    resolvedAt,
    resolutionHours,
  })
}

// ─── Table access ────────────────────────────────────────────────────────

export type TableName = 'products' | 'sales' | 'customers' | 'support_tickets'

export const TABLES: Record<TableName, Array<Record<string, unknown>>> = {
  products: PRODUCTS as unknown as Array<Record<string, unknown>>,
  sales: SALES as unknown as Array<Record<string, unknown>>,
  customers: CUSTOMERS as unknown as Array<Record<string, unknown>>,
  support_tickets: SUPPORT_TICKETS as unknown as Array<Record<string, unknown>>,
}

export const TABLE_SCHEMAS: Record<TableName, Record<string, string>> = {
  products: {
    id: 'number',
    name: 'string',
    category: 'string',
    price: 'number',
    unitsSold: 'number',
  },
  sales: {
    id: 'number',
    productId: 'number',
    region: 'string',
    quarter: 'string',
    year: 'number',
    revenue: 'number',
    units: 'number',
  },
  customers: {
    id: 'number',
    name: 'string',
    email: 'string',
    tier: 'string',
    region: 'string',
    signupDate: 'string (date)',
    lifetimeValue: 'number',
  },
  support_tickets: {
    id: 'number',
    customerId: 'number',
    subject: 'string',
    status: 'string (open|closed|pending)',
    priority: 'string (low|medium|high|critical)',
    category: 'string',
    createdAt: 'string (date)',
    resolvedAt: 'string (date) | null',
    resolutionHours: 'number | null',
  },
}
