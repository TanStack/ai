// Fetch all necessary data
const customersResult = await external_queryTable({ table: 'customers' })
const productsResult = await external_queryTable({ table: 'products' })
const purchasesResult = await external_queryTable({ table: 'purchases' })

const customers = customersResult.rows as any[]
const products = productsResult.rows as any[]
const purchases = purchasesResult.rows as any[]

// Create lookup maps
const customerMap = new Map(customers.map((c) => [c.id, c]))
const productMap = new Map(products.map((p) => [p.id, p]))

// Organize data by city
const cityData: Record<
  string,
  {
    totalRevenue: number
    uniqueCustomers: Set<number>
    categoryCounts: Record<string, number>
  }
> = {}

// Process each purchase
for (const purchase of purchases) {
  const customer = customerMap.get(purchase.customer_id)
  const product = productMap.get(purchase.product_id)

  if (!customer || !product) continue

  const city = customer.city

  if (!cityData[city]) {
    cityData[city] = {
      totalRevenue: 0,
      uniqueCustomers: new Set(),
      categoryCounts: {},
    }
  }

  cityData[city].totalRevenue += purchase.total
  cityData[city].uniqueCustomers.add(purchase.customer_id)

  // Track category purchases
  const category = product.category
  cityData[city].categoryCounts[category] =
    (cityData[city].categoryCounts[category] || 0) + purchase.quantity
}

// Build the result
const result = Object.entries(cityData)
  .map(([city, data]) => {
    // Find most purchased category
    const mostPurchasedCategory = Object.entries(data.categoryCounts).reduce(
      (prev, curr) => (curr[1] > prev[1] ? curr : prev),
      ['', 0],
    )[0]

    return {
      city,
      totalRevenue: parseFloat(data.totalRevenue.toFixed(2)),
      uniqueCustomers: data.uniqueCustomers.size,
      mostPurchasedCategory: mostPurchasedCategory,
    }
  })
  .sort((a, b) => a.city.localeCompare(b.city))

return result
