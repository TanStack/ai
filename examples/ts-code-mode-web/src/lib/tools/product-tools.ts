import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'

interface Product {
  id: string
  name: string
  brand: string
  price: number
  category: string
  color: string
  sizeRange: string
}

const SHOES: Array<Product> = [
  {
    id: 'shoe-01',
    name: 'Air Max 90',
    brand: 'Nike',
    price: 130,
    category: 'Lifestyle',
    color: 'White/Red',
    sizeRange: '6-13',
  },
  {
    id: 'shoe-02',
    name: 'Ultra Boost 22',
    brand: 'Adidas',
    price: 190,
    category: 'Running',
    color: 'Core Black',
    sizeRange: '6-14',
  },
  {
    id: 'shoe-03',
    name: 'Gel-Kayano 30',
    brand: 'Asics',
    price: 160,
    category: 'Running',
    color: 'Black/Electric Blue',
    sizeRange: '7-13',
  },
  {
    id: 'shoe-04',
    name: 'Fresh Foam X 1080v13',
    brand: 'New Balance',
    price: 165,
    category: 'Running',
    color: 'Navy/Red',
    sizeRange: '7-14',
  },
  {
    id: 'shoe-05',
    name: 'Suede Classic XXI',
    brand: 'Puma',
    price: 75,
    category: 'Lifestyle',
    color: 'Peacoat/White',
    sizeRange: '6-13',
  },
  {
    id: 'shoe-06',
    name: 'Chuck Taylor All Star',
    brand: 'Converse',
    price: 60,
    category: 'Lifestyle',
    color: 'Optical White',
    sizeRange: '5-13',
  },
  {
    id: 'shoe-07',
    name: 'Old Skool',
    brand: 'Vans',
    price: 70,
    category: 'Lifestyle',
    color: 'Black/White',
    sizeRange: '5-13',
  },
  {
    id: 'shoe-08',
    name: 'Pegasus 41',
    brand: 'Nike',
    price: 140,
    category: 'Running',
    color: 'Volt/Black',
    sizeRange: '6-15',
  },
  {
    id: 'shoe-09',
    name: 'Samba OG',
    brand: 'Adidas',
    price: 110,
    category: 'Lifestyle',
    color: 'White/Black/Gum',
    sizeRange: '6-13',
  },
  {
    id: 'shoe-10',
    name: 'GEL-1130',
    brand: 'Asics',
    price: 120,
    category: 'Lifestyle',
    color: 'White/Clay Canyon',
    sizeRange: '6-13',
  },
  {
    id: 'shoe-11',
    name: 'Clifton 9',
    brand: 'Hoka',
    price: 145,
    category: 'Running',
    color: 'Black/White',
    sizeRange: '7-14',
  },
  {
    id: 'shoe-12',
    name: 'Speedcat OG',
    brand: 'Puma',
    price: 90,
    category: 'Lifestyle',
    color: 'Red/White',
    sizeRange: '6-12',
  },
  {
    id: 'shoe-13',
    name: '990v6',
    brand: 'New Balance',
    price: 200,
    category: 'Lifestyle',
    color: 'Grey',
    sizeRange: '6-14',
  },
  {
    id: 'shoe-14',
    name: 'Air Jordan 1 Low',
    brand: 'Nike',
    price: 115,
    category: 'Lifestyle',
    color: 'Chicago',
    sizeRange: '6-13',
  },
  {
    id: 'shoe-15',
    name: 'Bondi 8',
    brand: 'Hoka',
    price: 165,
    category: 'Running',
    color: 'Coastal Sky/All Aboard',
    sizeRange: '7-14',
  },
  {
    id: 'shoe-16',
    name: 'Gazelle',
    brand: 'Adidas',
    price: 100,
    category: 'Lifestyle',
    color: 'Collegiate Green/White',
    sizeRange: '6-13',
  },
  {
    id: 'shoe-17',
    name: 'Ghost 16',
    brand: 'Brooks',
    price: 140,
    category: 'Running',
    color: 'Peacoat/Silver',
    sizeRange: '7-14',
  },
  {
    id: 'shoe-18',
    name: 'Cloud 5',
    brand: 'On',
    price: 150,
    category: 'Running',
    color: 'All White',
    sizeRange: '7-14',
  },
  {
    id: 'shoe-19',
    name: 'Cloudmonster 2',
    brand: 'On',
    price: 180,
    category: 'Running',
    color: 'Undyed/Frost',
    sizeRange: '7-14',
  },
  {
    id: 'shoe-20',
    name: 'Alphafly 3',
    brand: 'Nike',
    price: 250,
    category: 'Racing',
    color: 'Volt/Concord',
    sizeRange: '6-13',
  },
]

const PAGE_SIZE = 10
const TOTAL_PAGES = 2

export const getProductListPageTool = toolDefinition({
  name: 'getProductListPage',
  description:
    'Get a page of product IDs from the catalog. Returns product IDs for the requested page and the total number of pages. Each page contains up to 10 product IDs.',
  inputSchema: z.object({
    page: z.number().describe('1-based page number'),
  }),
  outputSchema: z.object({
    productIds: z.array(z.string()),
    totalPages: z.number(),
  }),
}).server(async ({ page }) => {
  const start = (page - 1) * PAGE_SIZE
  const end = start + PAGE_SIZE
  return {
    productIds: SHOES.slice(start, end).map((s) => s.id),
    totalPages: TOTAL_PAGES,
  }
})

export const getProductByIDTool = toolDefinition({
  name: 'getProductByID',
  description: 'Get full product details for a single product by its ID.',
  inputSchema: z.object({
    id: z.string().describe('Product ID, e.g. "shoe-01"'),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    brand: z.string(),
    price: z.number(),
    category: z.string(),
    color: z.string(),
    sizeRange: z.string(),
  }),
}).server(async ({ id }) => {
  const shoe = SHOES.find((s) => s.id === id)
  if (!shoe) {
    throw new Error(`Product not found: ${id}`)
  }
  return shoe
})

export const productTools = [getProductListPageTool, getProductByIDTool]
