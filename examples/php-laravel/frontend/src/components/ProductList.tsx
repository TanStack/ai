import { useState, useEffect } from 'react'
import { ShoppingCart } from 'lucide-react'

interface Product {
  id: string
  attribute_data: {
    name?: {
      en?: string
    }
    description?: {
      en?: string
    }
  }
  variants?: Array<{
    id: string
    prices?: Array<{
      price: {
        value: number
        formatted: string
      }
    }>
  }>
  thumbnail?: {
    url: string
  }
}

interface ProductListProps {
  onAddToCart: (purchasableId: string) => void
}

export default function ProductList({ onAddToCart }: ProductListProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('http://localhost:8020/api/products')
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to fetch products')
        }
        const text = await res.text()
        // Extract JSON from response (handle extra HTML/errors after JSON)
        // Find the first complete JSON object
        let jsonStart = text.indexOf('{')
        if (jsonStart === -1) {
          throw new Error('No JSON found in response')
        }
        let braceCount = 0
        let jsonEnd = jsonStart
        for (let i = jsonStart; i < text.length; i++) {
          if (text[i] === '{') braceCount++
          if (text[i] === '}') braceCount--
          if (braceCount === 0) {
            jsonEnd = i + 1
            break
          }
        }
        return JSON.parse(text.substring(jsonStart, jsonEnd))
      })
      .then((data) => {
        setProducts(data.data || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  const getProductPrice = (product: Product) => {
    const variant = product.variants?.[0]
    const price = variant?.prices?.[0]?.price
    return price?.formatted || 'Price not available'
  }

  const getProductName = (product: Product) => {
    return product.attribute_data?.name?.en || 'Unnamed Product'
  }

  const getProductDescription = (product: Product) => {
    return product.attribute_data?.description?.en || ''
  }

  const getFirstVariantId = (product: Product) => {
    return product.variants?.[0]?.id
  }

  if (loading) {
    return (
      <div className="products-loading">
        <p>Loading products...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="products-error">
        <p>Error loading products: {error}</p>
        <p className="error-hint">
          Make sure Lunar is installed and products are seeded in the database.
        </p>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="products-empty">
        <p>No products available.</p>
        <p className="empty-hint">
          Use the Lunar admin panel to add products, or run the seeder.
        </p>
      </div>
    )
  }

  return (
    <div className="products-grid">
      {products.map((product) => {
        const variantId = getFirstVariantId(product)
        if (!variantId) return null

        return (
          <div key={product.id} className="product-card">
            {product.thumbnail?.url && (
              <div className="product-image">
                <img
                  src={product.thumbnail.url}
                  alt={getProductName(product)}
                />
              </div>
            )}
            <div className="product-info">
              <h3 className="product-name">{getProductName(product)}</h3>
              {getProductDescription(product) && (
                <p className="product-description">
                  {getProductDescription(product)}
                </p>
              )}
              <div className="product-footer">
                <span className="product-price">
                  {getProductPrice(product)}
                </span>
                <button
                  className="add-to-cart-button"
                  onClick={() => onAddToCart(variantId)}
                  aria-label={`Add ${getProductName(product)} to cart`}
                >
                  <ShoppingCart className="icon" />
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
