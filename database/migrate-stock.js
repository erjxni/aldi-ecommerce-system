const { sqlConnect } = require('../backend/db');
const crypto = require('crypto');

async function migrateStock() {
  try {
    console.log('Connecting to database...');
    
    // 1. Fetch all products and their current stock
    const productsQuery = `
      query GetProductStock {
        products {
          id
          name
          stockQuantity
        }
      }
    `;
    const result = await sqlConnect.executeGraphqlRead(productsQuery);
    const products = (result.data && result.data.products) || [];
    
    console.log(`Found ${products.length} products to check.`);
    
    let migratedCount = 0;
    
    // 2. Insert a default active batch for each product with stock > 0
    for (const product of products) {
      if (product.stockQuantity && product.stockQuantity > 0) {
        const batchId = crypto.randomUUID();
        // 30 days default expiry date
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);
        
        console.log(`Migrating: ${product.name} (Stock: ${product.stockQuantity}) -> Batch: ${batchId}`);
        
        const insertBatchSql = `
          mutation InsertInitialBatch($id: UUID!, $productId: UUID!, $qty: Int!, $expiry: Timestamp!) {
            _execute(
              sql: "INSERT INTO \\"stock_batch\\" (id, product_id, initial_quantity, current_quantity, expiry_date, received_at) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)",
              params: [$id, $productId, $qty, $qty, $expiry]
            )
          }
        `;
        
        await sqlConnect.executeGraphql(insertBatchSql, {
          variables: {
            id: batchId,
            productId: product.id,
            qty: product.stockQuantity,
            expiry: expiryDate.toISOString()
          }
        });
        
        migratedCount++;
      }
    }
    
    console.log(`\n--- Stock Migration Complete ---`);
    console.log(`Created starting stock batches for ${migratedCount} products.`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  }
  process.exit(0);
}

migrateStock();
