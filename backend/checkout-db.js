const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const databasePath = path.join(__dirname, "../database/checkout.sqlite");

function openDatabase() {
    return new sqlite3.Database(databasePath);
}

function run(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve(this);
        });
    });
}

function get(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

async function initializeCheckoutDatabase() {
    const db = openDatabase();

    await run(db, `
        CREATE TABLE IF NOT EXISTS Product (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            price REAL NOT NULL,
            stockQuantity INTEGER NOT NULL
        )
    `);

    await run(db, `
        CREATE TABLE IF NOT EXISTS CartItem (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userEmail TEXT NOT NULL,
            productId TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            FOREIGN KEY (productId) REFERENCES Product(id)
        )
    `);

    await run(db, `
        CREATE TABLE IF NOT EXISTS "Order" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userEmail TEXT NOT NULL,
            customerName TEXT NOT NULL,
            shippingEmail TEXT NOT NULL,
            shippingAddress TEXT NOT NULL,
            city TEXT NOT NULL,
            postalCode TEXT NOT NULL,
            totalAmount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            createdAt TEXT NOT NULL
        )
    `);

    await run(db, `
        CREATE TABLE IF NOT EXISTS OrderItem (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            orderId INTEGER NOT NULL,
            productId TEXT NOT NULL,
            productName TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            priceAtPurchase REAL NOT NULL,
            FOREIGN KEY (orderId) REFERENCES "Order"(id),
            FOREIGN KEY (productId) REFERENCES Product(id)
        )
    `);

    await run(db, `
        CREATE TABLE IF NOT EXISTS FinancialRecord (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transactionId TEXT NOT NULL UNIQUE,
            relatedOrderId INTEGER NOT NULL,
            amount REAL NOT NULL,
            transactionType TEXT NOT NULL DEFAULT 'ecommerce_sale',
            description TEXT,
            createdAt TEXT NOT NULL,
            FOREIGN KEY (relatedOrderId) REFERENCES "Order"(id)
        )
    `);

    const productCount = await get(db, "SELECT COUNT(*) AS count FROM Product");

    if (productCount.count === 0) {
        await run(db, `
            INSERT INTO Product (id, name, price, stockQuantity)
            VALUES
            ('p-1001', 'ALDI Organic Apple Juice', 2.49, 20),
            ('p-1002', 'ALDI Fresh Bread', 1.79, 15),
            ('p-1003', 'ALDI Chocolate Bar', 0.99, 30)
        `);
    }

    const cartCount = await get(db, "SELECT COUNT(*) AS count FROM CartItem");

    if (cartCount.count === 0) {
        await run(db, `
            INSERT INTO CartItem (userEmail, productId, quantity)
            VALUES
            ('demo@aldi.com', 'p-1001', 2),
            ('demo@aldi.com', 'p-1002', 1)
        `);
    }

    db.close();
}

async function processCheckout(userEmail, checkoutPayload) {
    const db = openDatabase();

    try {
        const {
            firstName,
            lastName,
            email,
            address,
            city,
            postalCode,
            paymentMethod,
            cardLastFour
        } = checkoutPayload;

        if (!firstName || !lastName || !email || !address || !city || !postalCode || !paymentMethod) {
            return {
                statusCode: 400,
                body: {
                    error: "Missing required checkout fields."
                }
            };
        }

        await run(db, "BEGIN IMMEDIATE TRANSACTION");

        const cartItems = await all(db, `
            SELECT
                CartItem.id AS cartItemId,
                CartItem.productId,
                CartItem.quantity,
                Product.name,
                Product.price,
                Product.stockQuantity
            FROM CartItem
            INNER JOIN Product ON CartItem.productId = Product.id
            WHERE CartItem.userEmail = ?
        `, [userEmail]);

        if (cartItems.length === 0) {
            await run(db, "ROLLBACK");

            return {
                statusCode: 400,
                body: {
                    error: "The active cart is empty."
                }
            };
        }

        let totalAmount = 0;

        for (const item of cartItems) {
            const remainingStock = item.stockQuantity - item.quantity;

            if (remainingStock <= 0) {
                await run(db, "ROLLBACK");

                return {
                    statusCode: 409,
                    body: {
                        error: `${item.name} is out of stock or does not have enough remaining stock.`,
                        productId: item.productId
                    }
                };
            }

            totalAmount += item.price * item.quantity;
        }

        const customerName = `${firstName} ${lastName}`;
        const createdAt = new Date().toISOString();

        const orderResult = await run(db, `
            INSERT INTO "Order" (
                userEmail,
                customerName,
                shippingEmail,
                shippingAddress,
                city,
                postalCode,
                totalAmount,
                status,
                createdAt
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `, [
            userEmail,
            customerName,
            email,
            address,
            city,
            postalCode,
            totalAmount,
            createdAt
        ]);

        const orderId = orderResult.lastID;

        for (const item of cartItems) {
            await run(db, `
                INSERT INTO OrderItem (
                    orderId,
                    productId,
                    productName,
                    quantity,
                    priceAtPurchase
                )
                VALUES (?, ?, ?, ?, ?)
            `, [
                orderId,
                item.productId,
                item.name,
                item.quantity,
                item.price
            ]);

            const updateResult = await run(db, `
                UPDATE Product
                SET stockQuantity = stockQuantity - ?
                WHERE id = ?
                  AND stockQuantity - ? > 0
            `, [
                item.quantity,
                item.productId,
                item.quantity
            ]);

            if (updateResult.changes === 0) {
                await run(db, "ROLLBACK");

                return {
                    statusCode: 409,
                    body: {
                        error: `${item.name} is out of stock.`,
                        productId: item.productId
                    }
                };
            }
        }

        await run(db, `
            INSERT INTO FinancialRecord (
                transactionId,
                relatedOrderId,
                amount,
                transactionType,
                description,
                createdAt
            )
            VALUES (?, ?, ?, 'ecommerce_sale', ?, ?)
        `, [
            `TXN-${orderId}-${Date.now()}`,
            orderId,
            totalAmount,
            `Mock checkout payment by ${paymentMethod}. Card ending ${cardLastFour || "N/A"}.`,
            createdAt
        ]);

        await run(db, "DELETE FROM CartItem WHERE userEmail = ?", [userEmail]);

        await run(db, "COMMIT");

        return {
            statusCode: 201,
            body: {
                message: "Order created successfully.",
                orderId,
                status: "pending",
                totalAmount: Number(totalAmount.toFixed(2))
            }
        };
    } catch (error) {
        try {
            await run(db, "ROLLBACK");
        } catch (rollbackError) {
            console.error("Rollback failed:", rollbackError);
        }

        console.error("Checkout transaction failed:", error);

        return {
            statusCode: 500,
            body: {
                error: "Checkout transaction failed."
            }
        };
    } finally {
        db.close();
    }
}

module.exports = {
    initializeCheckoutDatabase,
    processCheckout
};