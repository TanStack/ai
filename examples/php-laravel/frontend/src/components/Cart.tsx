import { useState, useEffect } from 'react'
import { ShoppingCart, X, Plus, Minus } from 'lucide-react'

interface CartItem {
  id: string
  purchasable: {
    id: string
    attribute_data?: {
      name?: {
        en?: string
      }
    }
  }
  quantity: number
  unit_price: {
    value: number
    formatted: string
  }
  sub_total: {
    value: number
    formatted: string
  }
}

interface Cart {
  id: string
  total: {
    value: number
    formatted: string
  }
}

interface CartData {
  cart: Cart | null
  items: CartItem[]
  total: {
    value: number
    formatted: string
  }
}

export default function CartComponent() {
  const [cartData, setCartData] = useState<CartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  const fetchCart = () => {
    fetch('http://localhost:8020/api/cart')
      .then((res) => res.json())
      .then((data) => {
        setCartData(data)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Error fetching cart:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchCart()

    const handleCartUpdate = () => {
      fetchCart()
    }

    window.addEventListener('cartUpdated', handleCartUpdate)
    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate)
    }
  }, [])

  const updateQuantity = (lineId: string, quantity: number) => {
    fetch(`http://localhost:8020/api/cart/items/${lineId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quantity }),
    })
      .then((res) => res.json())
      .then(() => {
        fetchCart()
      })
      .catch((err) => {
        console.error('Error updating cart:', err)
      })
  }

  const removeItem = (lineId: string) => {
    fetch(`http://localhost:8020/api/cart/items/${lineId}`, {
      method: 'DELETE',
    })
      .then(() => {
        fetchCart()
      })
      .catch((err) => {
        console.error('Error removing item:', err)
      })
  }

  const itemCount =
    cartData?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0

  if (loading) {
    return (
      <div className="cart-button">
        <ShoppingCart className="icon" />
        <span>Loading...</span>
      </div>
    )
  }

  return (
    <>
      <button
        className="cart-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Shopping cart"
      >
        <ShoppingCart className="icon" />
        <span>Cart</span>
        {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
      </button>

      {isOpen && (
        <div className="cart-overlay" onClick={() => setIsOpen(false)}>
          <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cart-header">
              <h2>Shopping Cart</h2>
              <button
                className="close-button"
                onClick={() => setIsOpen(false)}
                aria-label="Close cart"
              >
                <X className="icon" />
              </button>
            </div>

            <div className="cart-content">
              {!cartData?.items || cartData.items.length === 0 ? (
                <div className="cart-empty">
                  <p>Your cart is empty</p>
                </div>
              ) : (
                <>
                  <div className="cart-items">
                    {cartData.items.map((item) => (
                      <div key={item.id} className="cart-item">
                        <div className="cart-item-info">
                          <h4>
                            {item.purchasable?.attribute_data?.name?.en ||
                              'Product'}
                          </h4>
                          <p className="cart-item-price">
                            {item.unit_price.formatted}
                          </p>
                        </div>
                        <div className="cart-item-controls">
                          <button
                            className="quantity-button"
                            onClick={() =>
                              updateQuantity(item.id, item.quantity - 1)
                            }
                            aria-label="Decrease quantity"
                          >
                            <Minus className="icon" />
                          </button>
                          <span className="quantity">{item.quantity}</span>
                          <button
                            className="quantity-button"
                            onClick={() =>
                              updateQuantity(item.id, item.quantity + 1)
                            }
                            aria-label="Increase quantity"
                          >
                            <Plus className="icon" />
                          </button>
                          <button
                            className="remove-button"
                            onClick={() => removeItem(item.id)}
                            aria-label="Remove item"
                          >
                            <X className="icon" />
                          </button>
                        </div>
                        <div className="cart-item-total">
                          {item.sub_total.formatted}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="cart-footer">
                    <div className="cart-total">
                      <strong>
                        Total: {cartData.total?.formatted || '0.00'}
                      </strong>
                    </div>
                    <button className="checkout-button">Checkout</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
