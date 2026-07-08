const fs = require('fs');
const path = require('path');
const { sqlConnect } = require('../backend/db');

const categories = [
  'Fresh Produce',
  'Bakery',
  'Dairy',
  'Meat & Seafood',
  'Pantry',
  'Frozen Foods',
  'Snacks',
  'Beverages',
  'Household',
  'Personal Care'
];

const productFamilies = [
  'Organic Apples',
  'Wholegrain Bread',
  'Greek Yogurt',
  'Chicken Breast Fillets',
  'Penne Pasta',
  'Mixed Vegetables',
  'Sea Salt Crisps',
  'Sparkling Mineral Water',
  'Laundry Detergent',
  'Hand Soap'
];

function generateDefaultCatalog(count = 4000) {
  return Array.from({ length: count }, (_, index) => {
    const category = categories[index % categories.length];
    const family = productFamilies[index % productFamilies.length];
    const packNumber = Math.floor(index / productFamilies.length) + 1;
    const price = Number((1.29 + (index % 37) * 0.35).toFixed(2));

    return {
      name: `${family} - Store Pack ${packNumber}`,
      category,
      price,
      description: `ALDI ${category.toLowerCase()} item prepared for the production demo catalog. Pack ${packNumber} uses clean product copy and approved stock metadata.`,
      image: `/assets/images/products/${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.jpg`
    };
  });
}

function loadProducts() {
  const productsPath = path.join(__dirname, 'products.json');
  if (!fs.existsSync(productsPath)) {
    const generatedProducts = generateDefaultCatalog();
    console.log(`products.json not found. Generated ${generatedProducts.length} clean default catalog records.`);
    return generatedProducts;
  }

  const rawData = fs.readFileSync(productsPath, 'utf8');
  const products = JSON.parse(rawData);
  console.log(`Loaded ${products.length} products from products.json.`);
  return products;
}

async function seedProducts() {
  try {
    console.log('Connecting to Firebase SQL Connect...');

    const products = loadProducts();

    // Wipe existing products
    console.log('Wiping existing products...');
    const deleteMutation = `
      mutation DeleteAllProducts {
        product_deleteMany(all: true)
      }
    `;
    const deleteResult = await sqlConnect.executeGraphql(deleteMutation);
    const deletedCount = deleteResult.data.product_deleteMany;
    console.log(`Deleted ${deletedCount} existing products.`);

    // Insert new products
    console.log(`Seeding ${products.length} products to the database...`);
    const insertMutation = `
      mutation InsertProduct($name: String!, $category: String!, $price: Float!, $description: String, $imageUrl: String) {
        product_insert(data: {
          name: $name,
          category: $category,
          price: $price,
          description: $description,
          imageUrl: $imageUrl
        })
      }
    `;

    const insertStockBatch = `
      mutation InsertStockBatch($productId: UUID!, $initialQuantity: Int!, $currentQuantity: Int!, $expiryDate: Timestamp!) {
        stockBatch_insert(data: {
          product: { id: $productId },
          initialQuantity: $initialQuantity,
          currentQuantity: $currentQuantity,
          expiryDate: $expiryDate
        })
      }
    `;

    // Set expiry date to 6 months from now for seeded stock
    const expiryDate = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();

    for (const product of products) {
      console.log(`Inserting: ${product.name}...`);
      const result = await sqlConnect.executeGraphql(insertMutation, {
        variables: {
          name: product.name,
          category: product.category,
          price: product.price,
          description: product.description || '',
          imageUrl: product.image || ''
        }
      });

      // Create a stock batch for each product
      const productId = result.data.product_insert.id;
      await sqlConnect.executeGraphql(insertStockBatch, {
        variables: {
          productId,
          initialQuantity: 100,
          currentQuantity: 100,
          expiryDate
        }
      });
      console.log(`  → Stock batch created (100 units)`);
    }

    console.log('\n--- Product Seeding Complete ---');
    console.log('Products table populated successfully.\n');
    return products.length;
  } catch (error) {
    console.error('Error during product seeding:', error);
    throw error;
  }
}

if (require.main === module) {
  seedProducts()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = {
  seedProducts,
  generateDefaultCatalog
};
