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
      mutation InsertProduct($name: String!, $category: String!, $price: Float!, $stockQuantity: Int!, $description: String, $imageUrl: String) {
        product_insert(data: {
          name: $name,
          category: $category,
          price: $price,
          stockQuantity: $stockQuantity,
          description: $description,
          imageUrl: $imageUrl
        })
      }
    `;

    for (const product of products) {
      console.log(`Inserting: ${product.name}...`);
      await sqlConnect.executeGraphql(insertMutation, {
        variables: {
          name: product.name,
          category: product.category,
          price: product.price,
          stockQuantity: 100, // default stock quantity
          description: product.description || '',
          imageUrl: product.image || ''
        }
      });
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
