'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // ── Route detection ──────────────────────────────────────
  const onProducts = !!document.getElementById('products-grid');
  const onDetail   = !!document.getElementById('product-detail-container');

  if (onProducts) initCatalog();
  if (onDetail)   initDetail();

  // ════════════════════════════════════════════════════════
  // CATALOG PAGE
  // ════════════════════════════════════════════════════════
  async function initCatalog() {
    const grid        = document.getElementById('products-grid');
    const loader      = document.getElementById('catalog-loader');
    const searchInput = document.getElementById('search-input');
    const catLinks    = document.querySelectorAll('.sidebar-link');
    const heading     = document.getElementById('catalog-heading');

    let allProducts   = [];
    let activeCategory = 'all';

    // Fetch products
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Network error');
      allProducts = await res.json();
    } catch (err) {
      loader.innerHTML = '<p style="color:#CC0000;">Failed to load products. Please refresh.</p>';
      return;
    }

    loader.style.display = 'none';
    render(allProducts);

    // Search
    searchInput.addEventListener('input', () => filterAndRender());

    // Sidebar category links
    catLinks.forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        catLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        activeCategory = link.dataset.cat;
        heading.textContent = activeCategory === 'all' ? 'All Products' : activeCategory;
        filterAndRender();
      });
    });

    function filterAndRender() {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = allProducts.filter(p => {
        const matchCat = activeCategory === 'all' || p.category === activeCategory;
        const matchQ   = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
        return matchCat && matchQ;
      });
      render(filtered);
    }

    function render(products) {
      if (!products.length) {
        grid.innerHTML = '<p class="catalog-empty">No products found.</p>';
        return;
      }
      grid.innerHTML = products.map(p => `
        <article class="product-card" id="product-card-${p.id}" onclick="location.href='/product-detail.html?id=${p.id}'">
          <div class="card-img-wrap">
            <img src="${p.image}" alt="${p.name}" class="card-img" loading="lazy">
          </div>
          <div class="card-body">
            <span class="card-category">${p.category}</span>
            <h2 class="card-name">${p.name}</h2>
            <span class="card-size">${p.size}</span>
            <div class="card-footer">
              <span class="card-price">&euro;${p.price.toFixed(2)}</span>
              <a href="/product-detail.html?id=${p.id}"
                 class="btn-add"
                 id="view-btn-${p.id}"
                 onclick="event.stopPropagation()">View</a>
            </div>
          </div>
        </article>
      `).join('');
    }
  }

  // ════════════════════════════════════════════════════════
  // DETAIL PAGE
  // ════════════════════════════════════════════════════════
  async function initDetail() {
    const container = document.getElementById('product-detail-container');
    const loader    = document.getElementById('detail-loader');

    const id = new URLSearchParams(window.location.search).get('id');

    if (!id) {
      loader.style.display = 'none';
      container.innerHTML = errorHtml('No product selected.', 'Please choose a product from the catalog.');
      return;
    }

    let product;
    try {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) throw new Error(res.status === 404 ? 'Product not found.' : 'Network error.');
      product = await res.json();
    } catch (err) {
      loader.style.display = 'none';
      container.innerHTML = errorHtml('Could not load product.', err.message);
      return;
    }

    loader.style.display = 'none';
    document.title = `${product.name} – ALDI Online`;

    // Features list HTML
    const featuresHtml = product.features
      ? product.features.map(f => `<li>${f}</li>`).join('')
      : '';

    // Specs rows HTML
    const specsHtml = product.specifications
      ? Object.entries(product.specifications)
          .map(([k, v]) => `<tr><td class="spec-key">${k}</td><td class="spec-val">${v}</td></tr>`)
          .join('')
      : '<tr><td colspan="2" class="spec-key">No specifications available.</td></tr>';

    container.innerHTML = `
      <!-- Breadcrumb -->
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="/index.html"    id="bc-home">Home</a>
        <span class="breadcrumb-sep">›</span>
        <a href="/products.html" id="bc-products">Products</a>
        <span class="breadcrumb-sep">›</span>
        <span>${product.name}</span>
      </nav>

      <!-- Product detail grid -->
      <div class="detail-grid">

        <!-- Image -->
        <div class="detail-img-panel">
          <img src="${product.image}" alt="${product.name}" class="detail-img" id="detail-product-img">
        </div>

        <!-- Info -->
        <div class="detail-info">
          <p class="detail-category">${product.category}</p>
          <h1 class="detail-name" id="detail-product-name">${product.name}</h1>
          <p class="detail-size">${product.size}</p>
          <p class="detail-price" id="detail-product-price">&euro;${product.price.toFixed(2)}</p>

          <div class="divider"></div>

          <p class="detail-description">${product.description}</p>

          ${featuresHtml ? `<ul class="features-list">${featuresHtml}</ul>` : ''}

          <!-- Add to cart -->
          <div class="detail-actions">
            <div class="qty-control">
              <button class="qty-btn" id="qty-minus" aria-label="Decrease quantity">−</button>
              <input  type="number" class="qty-num" id="qty-input" value="1" min="1" max="99">
              <button class="qty-btn" id="qty-plus"  aria-label="Increase quantity">+</button>
            </div>
            <button class="btn-primary" id="add-to-cart-btn">Add to Cart</button>
          </div>

          <!-- Tabs: Specifications -->
          <div>
            <div class="tabs-bar">
              <button class="tab-btn active" data-tab="specs"   id="tab-btn-specs">Specifications</button>
            </div>
            <div class="tab-pane active" id="tab-specs">
              <table class="specs-table">
                <tbody>${specsHtml}</tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    `;

    // Quantity controls
    const qtyInput = document.getElementById('qty-input');
    document.getElementById('qty-minus').addEventListener('click', () => {
      const v = parseInt(qtyInput.value, 10);
      if (v > 1) qtyInput.value = v - 1;
    });
    document.getElementById('qty-plus').addEventListener('click', () => {
      const v = parseInt(qtyInput.value, 10);
      if (v < 99) qtyInput.value = v + 1;
    });
    qtyInput.addEventListener('change', () => {
      let v = parseInt(qtyInput.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 99) v = 99;
      qtyInput.value = v;
    });

    // Add to cart
    document.getElementById('add-to-cart-btn').addEventListener('click', () => {
      const qty = qtyInput.value;
      alert(`Added ${qty}× "${product.name}" to your cart.`);
    });
  }

  // ── Helpers ───────────────────────────────────────────
  function errorHtml(title, msg) {
    return `
      <div style="padding:3rem 0; text-align:center;">
        <h2 style="color:var(--aldi-navy);margin-bottom:.5rem;">${title}</h2>
        <p style="color:var(--aldi-muted);margin-bottom:1.5rem;">${msg}</p>
        <a href="/products.html" style="color:var(--aldi-red);font-weight:600;">← Back to Products</a>
      </div>`;
  }
});
