const products = [
  {
    id: 1,
    name: "Apple Juice",
    category: "Drinks",
    price: "€1.89",
    emoji: "🧃",
    rating: "★★★★☆",
    description: "Fresh apple juice with a sweet and refreshing taste. Perfect for breakfast or daily drinks."
  },
  {
    id: 2,
    name: "Bananas",
    category: "Fruits",
    price: "€0.99",
    emoji: "🍌",
    rating: "★★★★★",
    description: "Fresh bananas with natural sweetness and energy. A healthy fruit choice for everyday shopping."
  },
  {
    id: 3,
    name: "Milk",
    category: "Dairy",
    price: "€1.29",
    emoji: "🥛",
    rating: "★★★★☆",
    description: "Fresh dairy milk for breakfast, coffee, baking, and cooking."
  },
  {
    id: 4,
    name: "Bread",
    category: "Bakery",
    price: "€1.19",
    emoji: "🍞",
    rating: "★★★★☆",
    description: "Soft bakery bread for sandwiches, breakfast, and daily meals."
  },
  {
    id: 5,
    name: "Chicken Breast",
    category: "Meat",
    price: "€4.99",
    emoji: "🍗",
    rating: "★★★★★",
    description: "Fresh chicken breast, high in protein and suitable for healthy meals."
  },
  {
    id: 6,
    name: "Chocolate",
    category: "Snacks",
    price: "€1.49",
    emoji: "🍫",
    rating: "★★★★☆",
    description: "Sweet chocolate snack for a small treat during the day."
  }
];

function hideAllPages() {
  document.getElementById("homePage").classList.add("hidden");
  document.getElementById("catalogPage").classList.add("hidden");
  document.getElementById("detailsPage").classList.add("hidden");
  document.getElementById("loginPage").classList.add("hidden");
}

function showHome() {
  hideAllPages();
  document.getElementById("homePage").classList.remove("hidden");
}

function showCatalog() {
  hideAllPages();
  document.getElementById("catalogPage").classList.remove("hidden");
  displayProducts(products);
}

function showLogin() {
  hideAllPages();
  document.getElementById("loginPage").classList.remove("hidden");
}

function displayProducts(productList) {
  const productGrid = document.getElementById("productGrid");
  productGrid.innerHTML = "";

  if (productList.length === 0) {
    productGrid.innerHTML = "<p>No products found.</p>";
    return;
  }

  productList.forEach(product => {
    productGrid.innerHTML += `
      <div class="product-card">
        <div class="product-image">${product.emoji}</div>

        <div class="product-info">
          <div class="product-top">
            <h3>${product.name}</h3>
          </div>

          <span class="product-category">${product.category}</span>

          <p class="price">${product.price}</p>

          <p class="rating">${product.rating}</p>

          <div class="product-actions">
            <button class="view-btn" onclick="showProductDetails(${product.id})">View Details</button>
            <button class="cart-btn">Add to Basket</button>
          </div>
        </div>
      </div>
    `;
  });
}

function searchProducts() {
  const searchText = document.getElementById("searchInput").value.toLowerCase();
  const selectedCategory = document.getElementById("categoryFilter").value;

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchText);
    const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  displayProducts(filteredProducts);
}

function filterByCategory(category) {
  showCatalog();
  document.getElementById("categoryFilter").value = category;
  searchProducts();
}

function showProductDetails(productId) {
  hideAllPages();
  document.getElementById("detailsPage").classList.remove("hidden");

  const product = products.find(item => item.id === productId);

  document.getElementById("productDetails").innerHTML = `
    <div class="details-image">${product.emoji}</div>

    <div class="details-info">
      <h1>${product.name}</h1>
      <p><strong>Category:</strong> ${product.category}</p>
      <p class="price">${product.price}</p>
      <p class="rating">${product.rating}</p>
      <p>${product.description}</p>
      <button>Add to Basket</button>
    </div>
  `;
}

displayProducts(products);