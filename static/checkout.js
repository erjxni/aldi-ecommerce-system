const checkoutForm = document.getElementById("checkout-form");
const checkoutMessage = document.getElementById("checkout-message");
const cartSummary = document.getElementById("cart-summary");
const subtotalElement = document.getElementById("subtotal");
const totalElement = document.getElementById("total");

function formatCurrency(amount) {
    return `€${Number(amount).toFixed(2)}`;
}

function getStoredCartItems() {
    const userEmail = localStorage.getItem('userEmail');
    const dynamicCartKey = userEmail ? `cart_${userEmail}` : 'cart_guest';
    const keys = [dynamicCartKey, "aldiCart", "cart", "cartItems", "shoppingCart"];

    for (const key of keys) {
        const rawValue = localStorage.getItem(key);

        if (!rawValue) {
            continue;
        }

        try {
            const parsedValue = JSON.parse(rawValue);

            if (Array.isArray(parsedValue)) {
                return parsedValue;
            }

            if (parsedValue && Array.isArray(parsedValue.items)) {
                return parsedValue.items;
            }
        } catch (error) {
            console.warn(`Could not parse cart data from localStorage key: ${key}`, error);
        }
    }

    return [];
}

function renderCartSummary() {
    const cartItems = getStoredCartItems();

    if (cartItems.length === 0) {
        cartSummary.innerHTML = "<p>Your cart is empty.</p>";
        subtotalElement.textContent = formatCurrency(0);
        totalElement.textContent = formatCurrency(0);
        return;
    }

    let subtotal = 0;

    cartSummary.innerHTML = cartItems.map((item) => {
        const itemPrice = Number(item.price || item.priceAtPurchase || 0);
        const itemQuantity = Number(item.quantity || 1);
        const lineTotal = itemPrice * itemQuantity;

        subtotal += lineTotal;

        return `
            <div class="cart-item">
                <div>
                    <div class="cart-item-name">${item.name || "Cart Item"}</div>
                    <div class="cart-item-meta">
                        Quantity: ${itemQuantity} × ${formatCurrency(itemPrice)}
                    </div>
                </div>
                <strong>${formatCurrency(lineTotal)}</strong>
            </div>
        `;
    }).join("");

    subtotalElement.textContent = formatCurrency(subtotal);
    totalElement.textContent = formatCurrency(subtotal);
}

function getAuthToken() {
    return (
        localStorage.getItem("userToken") ||
        localStorage.getItem("token") ||
        localStorage.getItem("authToken")
    );
}

function getCardLastFour(cardNumber) {
    const digitsOnly = cardNumber.replace(/\D/g, "");
    return digitsOnly.slice(-4);
}

function setCheckoutMessage(message, type) {
    checkoutMessage.textContent = message;
    checkoutMessage.className = `checkout-message ${type}`;
}

checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = checkoutForm.querySelector("button[type='submit']");
    const formData = new FormData(checkoutForm);
    const cardNumber = String(formData.get("cardNumber") || "");
    const token = getAuthToken();

    if (!token) {
        setCheckoutMessage("Please log in before completing checkout.", "error");
        return;
    }

    const payload = {
        firstName: String(formData.get("firstName") || "").trim(),
        lastName: String(formData.get("lastName") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        address: String(formData.get("address") || "").trim(),
        city: String(formData.get("city") || "").trim(),
        postalCode: String(formData.get("postalCode") || "").trim(),
        paymentMethod: String(formData.get("paymentMethod") || "").trim(),
        cardLastFour: getCardLastFour(cardNumber),
        cartItems: getStoredCartItems()
    };

    submitButton.disabled = true;
    setCheckoutMessage("Processing your order...", "");

    try {
        const response = await fetch("/api/checkout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            setCheckoutMessage(result.error || "Checkout failed.", "error");
            submitButton.disabled = false;
            return;
        }

        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
            localStorage.removeItem(`cart_${userEmail}`);
        }
        localStorage.removeItem("cart_guest");
        localStorage.removeItem("cart");
        localStorage.removeItem("aldiCart");
        localStorage.removeItem("cartItems");
        localStorage.removeItem("shoppingCart");

        window.location.href = `order-confirmation.html?orderId=${result.orderId}&total=${result.totalAmount}`;
    } catch (error) {
        console.error("Checkout request failed:", error);
        setCheckoutMessage("Network error while processing checkout.", "error");
        submitButton.disabled = false;
    }
});

renderCartSummary();