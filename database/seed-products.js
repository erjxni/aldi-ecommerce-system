const fs = require('fs');
const path = require('path');
const { sqlConnect } = require('../backend/db');

async function seedProducts() {
  try {
    console.log('Connecting to Firebase SQL Connect...');

    // Load products from products.json
    const productsPath = path.join(__dirname, 'products.json');
    if (!fs.existsSync(productsPath)) {
      throw new Error(`products.json not found at: ${productsPath}`);
    }
    const rawData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(rawData);

    console.log(`Loaded ${products.length} products from products.json.`);

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
    process.exit(0);
  } catch (error) {
    console.error('Error during product seeding:', error);
    process.exit(1);
  }
}

seedProducts();
