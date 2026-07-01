class CartError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'CartError';
    this.status = status;
  }
}

function requirePositiveInteger(value, field = 'quantity') {
  if (!Number.isInteger(value) || value < 1) {
    throw new CartError(400, `${field} must be a positive integer`);
  }
}

function createCartService(repository) {
  async function getCart(userId) {
    const cart = await repository.findCartByUser(userId);
    if (!cart) return { id: null, items: [], subtotal: 0, itemCount: 0 };

    const items = await repository.listItems(cart.id);
    const mappedItems = items.map(item => ({
      id: item.product.id,
      cartItemId: item.id,
      name: item.product.name,
      category: item.product.category,
      price: item.product.price,
      stockQuantity: item.stockQuantity || 0,
      description: item.product.description,
      image: item.product.imageUrl,
      imageUrl: item.product.imageUrl,
      quantity: item.quantity
    }));

    return {
      id: cart.id,
      items: mappedItems,
      subtotal: Math.round(mappedItems.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100,
      itemCount: mappedItems.reduce((sum, item) => sum + item.quantity, 0)
    };
  }

  async function addItem(userId, productId, quantity) {
    requirePositiveInteger(quantity);
    const product = await repository.findProduct(productId);
    if (!product) throw new CartError(404, 'Product not found');

    let cart = await repository.findCartByUser(userId);
    if (!cart) cart = await repository.createCart(userId);

   const existing = await repository.findItem(cart.id, productId);
const requestedQuantity = (existing ? existing.quantity : 0) + quantity;

if (typeof repository.getStockForProduct === 'function') {
    const totalStock = await repository.getStockForProduct(productId);

    if (requestedQuantity > totalStock) {
        throw new CartError(400, `Only ${totalStock} item(s) are available in stock`);
    }
}
    if (existing) {
      await repository.updateItem(existing.id, requestedQuantity);
    } else {
      await repository.createItem(cart.id, productId, quantity);
    }
    await repository.touchCart(cart.id);
    return getCart(userId);
  }

  async function updateItem(userId, productId, quantity) {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new CartError(400, 'quantity must be a non-negative integer');
    }
    const cart = await repository.findCartByUser(userId);
    if (!cart) throw new CartError(404, 'Cart not found');

    const existing = await repository.findItem(cart.id, productId);
    if (!existing) throw new CartError(404, 'Cart item not found');

    if (quantity === 0) {
      await repository.deleteItem(existing.id);
    } else {
     const product = await repository.findProduct(productId);
if (!product) throw new CartError(404, 'Product not found');

if (typeof repository.getStockForProduct === 'function') {
    const totalStock = await repository.getStockForProduct(productId);

    if (quantity > totalStock) {
        throw new CartError(400, `Only ${totalStock} item(s) are available in stock`);
    }
}
      await repository.updateItem(existing.id, quantity);
    }
    await repository.touchCart(cart.id);
    return getCart(userId);
  }

  async function removeItem(userId, productId) {
    const cart = await repository.findCartByUser(userId);
    if (!cart) throw new CartError(404, 'Cart not found');
    const existing = await repository.findItem(cart.id, productId);
    if (!existing) throw new CartError(404, 'Cart item not found');

    await repository.deleteItem(existing.id);
    await repository.touchCart(cart.id);
    return getCart(userId);
  }

  return { getCart, addItem, updateItem, removeItem };
}

function createFirebaseCartRepository(sqlConnect) {
  const productFields = `
    id
    name
    category
    price
    description
    imageUrl
  `;

  return {
    async findCartByUser(userId) {
      const result = await sqlConnect.executeGraphqlRead(`
        query FindCart($userId: UUID!) {
          carts(where: { user: { id: { eq: $userId } } }) { id updatedAt }
        }
      `, { variables: { userId } });
      return result.data?.carts?.[0] || null;
    },

    async createCart(userId) {
      const result = await sqlConnect.executeGraphql(`
        mutation CreateCart($userId: UUID!) {
          cart_insert(data: { user: { id: $userId } })
        }
      `, { variables: { userId } });
      return result.data.cart_insert;
    },

    async touchCart(id) {
      await sqlConnect.executeGraphql(`
        mutation TouchCart($id: UUID!, $updatedAt: Timestamp!) {
          cart_update(id: $id, data: { updatedAt: $updatedAt })
        }
      `, { variables: { id, updatedAt: new Date().toISOString() } });
    },

    async listItems(cartId) {
      const result = await sqlConnect.executeGraphqlRead(`
        query ListCartItems($cartId: UUID!) {
          cartItems(where: { cart: { id: { eq: $cartId } } }) {
            id
            quantity
            product { ${productFields} }
          }
        }
      `, { variables: { cartId } });
      const items = result.data?.cartItems || [];
      // Enrich each item with computed stock
      for (const item of items) {
        item.stockQuantity = await this.getStockForProduct(item.product.id);
      }
      return items;
    },

    async getStockForProduct(productId) {
      try {
        const result = await sqlConnect.executeGraphqlRead(`
          query GetStock($productId: UUID!) {
            stockBatches(where: { product: { id: { eq: $productId } } }) {
              currentQuantity
            }
          }
        `, { variables: { productId } });
        const batches = result.data?.stockBatches || [];
        return batches.reduce((sum, b) => sum + (b.currentQuantity || 0), 0);
      } catch (err) {
        console.warn('Could not fetch stock for product', productId, err.message);
        return 0;
      }
    },

    async findItem(cartId, productId) {
      const result = await sqlConnect.executeGraphqlRead(`
        query FindCartItem($cartId: UUID!, $productId: UUID!) {
          cartItems(where: {
            cart: { id: { eq: $cartId } }
            product: { id: { eq: $productId } }
          }) { id quantity }
        }
      `, { variables: { cartId, productId } });
      return result.data?.cartItems?.[0] || null;
    },

    async findProduct(id) {
      const result = await sqlConnect.executeGraphqlRead(`
        query FindCartProduct($id: UUID!) {
          product(id: $id) { ${productFields} }
        }
      `, { variables: { id } });
      return result.data?.product || null;
    },

    async createItem(cartId, productId, quantity) {
      const result = await sqlConnect.executeGraphql(`
        mutation CreateCartItem($cartId: UUID!, $productId: UUID!, $quantity: Int!) {
          cartItem_insert(data: {
            cart: { id: $cartId }
            product: { id: $productId }
            quantity: $quantity
          })
        }
      `, { variables: { cartId, productId, quantity } });
      return result.data.cartItem_insert;
    },

    async updateItem(id, quantity) {
      const result = await sqlConnect.executeGraphql(`
        mutation UpdateCartItem($id: UUID!, $quantity: Int!) {
          cartItem_update(id: $id, data: { quantity: $quantity })
        }
      `, { variables: { id, quantity } });
      return result.data.cartItem_update;
    },

    async deleteItem(id) {
      await sqlConnect.executeGraphql(`
        mutation DeleteCartItem($id: UUID!) { cartItem_delete(id: $id) }
      `, { variables: { id } });
    }
  };
}

module.exports = { CartError, createCartService, createFirebaseCartRepository };
