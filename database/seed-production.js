const { sqlConnect } = require('../backend/db');

const categories = [
  'Fresh Produce',
  'Bakery',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Pantry',
  'Frozen Foods',
  'Beverages',
  'Snacks',
  'Household',
  'Personal Care'
];

const productTemplates = [
  ['Organic Bananas', 'Fresh Produce', 1.39, 'Responsibly sourced organic bananas sold by the bunch.', '/assets/images/organic_strawberries.png'],
  ['Sourdough Country Bread', 'Bakery', 2.49, 'Slow-fermented bakery loaf with a crisp crust.', '/assets/images/sourdough_bread.png'],
  ['Free Range Eggs', 'Dairy & Eggs', 3.29, 'A dozen free range eggs for everyday cooking.', '/assets/images/sour_cream.png'],
  ['Ribeye Steak', 'Meat & Seafood', 9.99, 'Tender beef ribeye steak prepared for premium dinners.', '/assets/images/ribeye_steak.png'],
  ['Extra Virgin Olive Oil', 'Pantry', 5.49, 'Cold pressed olive oil suitable for dressings and cooking.', '/assets/images/olive_oil.png'],
  ['Frozen Garden Peas', 'Frozen Foods', 1.89, 'Quick-frozen peas picked at peak freshness.', '/assets/images/cashew_nuts.png'],
  ['Orange Juice', 'Beverages', 2.79, 'Smooth breakfast orange juice with no artificial colors.', '/assets/images/orange_juice.png'],
  ['Dark Chocolate Bar', 'Snacks', 1.59, 'Rich dark chocolate for baking or snacking.', '/assets/images/dark_chocolate.png'],
  ['Laundry Detergent', 'Household', 6.99, 'Concentrated detergent for everyday household laundry.', '/assets/images/flips.png'],
  ['Sensitive Hand Soap', 'Personal Care', 1.99, 'Gentle hand soap suitable for frequent use.', '/assets/images/organic_coffee.png']
];

const mockUsers = [
  ['admin@aldi-mock.com', 'adminPassword123', 'admin', 'Admin User'],
  ['financial@aldi-mock.com', 'financialPassword123', 'financial_officer', 'Financial Officer'],
  ['employee@aldi-mock.com', 'employeePassword123', 'employee', 'Store Employee'],
  ['test_customer@aldi-mock.com', 'customerPassword123', 'customer', 'Test Customer'],
  ['customer_1@aldi-mock.com', 'customerPassword1', 'customer', 'Patricia Martinez'],
  ['customer_2@aldi-mock.com', 'customerPassword2', 'customer', 'Jessica Thomas']
];

function buildProducts(count = 4000) {
  return Array.from({ length: count }, (_, index) => {
    const template = productTemplates[index % productTemplates.length];
    const itemNo = String(index + 1).padStart(4, '0');
    const category = categories[index % categories.length];
    return {
      name: `${template[0]} ${itemNo}`,
      category,
      price: Math.round((template[2] + (index % 17) * 0.11) * 100) / 100,
      description: `${template[3]} Catalog item ${itemNo} prepared for the final live demo.`,
      imageUrl: template[4],
      stock: 75 + (index % 125)
    };
  });
}

async function seedProduction() {
  console.log('Starting production seed for users and product catalog...');

  await sqlConnect.executeGraphql('mutation DeleteCartItems { cartItem_deleteMany(all: true) }');
  await sqlConnect.executeGraphql('mutation DeleteCarts { cart_deleteMany(all: true) }');
  await sqlConnect.executeGraphql('mutation DeleteOrderItems { orderItem_deleteMany(all: true) }');
  await sqlConnect.executeGraphql('mutation DeleteFinancialRecords { financialRecord_deleteMany(all: true) }');
  await sqlConnect.executeGraphql('mutation DeleteOrders { order_deleteMany(all: true) }');
  await sqlConnect.executeGraphql('mutation DeleteStockBatches { stockBatch_deleteMany(all: true) }');
  await sqlConnect.executeGraphql('mutation DeleteProducts { product_deleteMany(all: true) }');
  await sqlConnect.executeGraphql('mutation DeleteUsers { user_deleteMany(all: true) }');

  const insertUser = `
    mutation InsertUser($email: String!, $passwordHash: String!, $role: String!, $displayName: String!) {
      user_insert(data: { email: $email, passwordHash: $passwordHash, role: $role, displayName: $displayName })
    }
  `;

  for (const [email, passwordHash, role, displayName] of mockUsers) {
    await sqlConnect.executeGraphql(insertUser, {
      variables: { email, passwordHash, role, displayName }
    });
  }

  const insertProduct = `
    mutation InsertProduct($name: String!, $category: String!, $price: Float!, $description: String, $imageUrl: String) {
      product_insert(data: { name: $name, category: $category, price: $price, description: $description, imageUrl: $imageUrl })
    }
  `;
  const insertStockBatch = `
    mutation InsertStockBatch($productId: UUID!, $initialQuantity: Int!, $currentQuantity: Int!, $expiryDate: Timestamp!) {
      stockBatch_insert(data: { product: { id: $productId }, initialQuantity: $initialQuantity, currentQuantity: $currentQuantity, expiryDate: $expiryDate })
    }
  `;

  const products = buildProducts(4000);
  const expiryDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

  for (const [index, product] of products.entries()) {
    const result = await sqlConnect.executeGraphql(insertProduct, {
      variables: {
        name: product.name,
        category: product.category,
        price: product.price,
        description: product.description,
        imageUrl: product.imageUrl
      }
    });
    await sqlConnect.executeGraphql(insertStockBatch, {
      variables: {
        productId: result.data.product_insert.id,
        initialQuantity: product.stock,
        currentQuantity: product.stock,
        expiryDate
      }
    });
    if ((index + 1) % 250 === 0) {
      console.log(`Seeded ${index + 1} products...`);
    }
  }

  console.log('Production seed complete.');
  console.log(`Users: ${mockUsers.length}`);
  console.log(`Products: ${products.length}`);
}

if (require.main === module) {
  seedProduction().then(() => process.exit(0)).catch(error => {
    console.error('Production seed failed:', error);
    process.exit(1);
  });
}

module.exports = { buildProducts, seedProduction };
