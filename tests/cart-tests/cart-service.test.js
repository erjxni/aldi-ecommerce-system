const test = require('node:test');
const assert = require('node:assert/strict');
const { CartError, createCartService } = require('../../backend/cart-service');

function createFakeRepository() {
  const state = {
    carts: [],
    items: [],
    products: [{
      id: 'product-1',
      name: 'Test Coffee',
      category: 'Drinks',
      price: 4.5,
      stockQuantity: 3,
      description: 'Test product',
      imageUrl: '/coffee.png'
    }]
  };

  return {
    state,
    async findCartByUser(userId) {
      return state.carts.find(cart => cart.userId === userId) || null;
    },
    async createCart(userId) {
      const cart = { id: `cart-${state.carts.length + 1}`, userId };
      state.carts.push(cart);
      return cart;
    },
    async touchCart() {},
    async listItems(cartId) {
      return state.items
        .filter(item => item.cartId === cartId)
        .map(item => ({ ...item, product: state.products.find(product => product.id === item.productId) }));
    },
    async findItem(cartId, productId) {
      return state.items.find(item => item.cartId === cartId && item.productId === productId) || null;
    },
    async findProduct(id) {
      return state.products.find(product => product.id === id) || null;
    },
    async getStockForProduct(productId) {
      const product = state.products.find(item => item.id === productId);
      return product ? product.stockQuantity : 0;
    },
    async createItem(cartId, productId, quantity) {
      const item = { id: `item-${state.items.length + 1}`, cartId, productId, quantity };
      state.items.push(item);
      return item;
    },
    async updateItem(id, quantity) {
      state.items.find(item => item.id === id).quantity = quantity;
    },
    async deleteItem(id) {
      state.items = state.items.filter(item => item.id !== id);
    }
  };
}

test('creates a user cart and adds a product', async () => {
  const repository = createFakeRepository();
  const service = createCartService(repository);
  const cart = await service.addItem('user-1', 'product-1', 2);

  assert.equal(repository.state.carts.length, 1);
  assert.equal(cart.itemCount, 2);
  assert.equal(cart.subtotal, 9);
  assert.equal(cart.items[0].quantity, 2);
});

test('adds to an existing CartItem instead of creating a duplicate', async () => {
  const repository = createFakeRepository();
  const service = createCartService(repository);
  await service.addItem('user-1', 'product-1', 1);
  const cart = await service.addItem('user-1', 'product-1', 2);

  assert.equal(repository.state.items.length, 1);
  assert.equal(cart.items[0].quantity, 3);
});

test('rejects quantities above Product.stockQuantity', async () => {
  const repository = createFakeRepository();
  const service = createCartService(repository);

  await assert.rejects(
    () => service.addItem('user-1', 'product-1', 4),
    error => error instanceof CartError && error.status === 400 && /3 item/.test(error.message)
  );
  assert.equal(repository.state.items.length, 0);
});

test('updates quantities and removes an item when quantity reaches zero', async () => {
  const repository = createFakeRepository();
  const service = createCartService(repository);
  await service.addItem('user-1', 'product-1', 2);
  let cart = await service.updateItem('user-1', 'product-1', 1);
  assert.equal(cart.items[0].quantity, 1);

  cart = await service.updateItem('user-1', 'product-1', 0);
  assert.equal(cart.itemCount, 0);
  assert.deepEqual(cart.items, []);
});

test('persists cart data when a new service instance is created', async () => {
  const repository = createFakeRepository();
  await createCartService(repository).addItem('user-1', 'product-1', 2);

  const cartAfterNewSession = await createCartService(repository).getCart('user-1');
  assert.equal(cartAfterNewSession.items[0].name, 'Test Coffee');
  assert.equal(cartAfterNewSession.items[0].quantity, 2);
});
