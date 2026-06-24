// CSS is linked in HTML

document.addEventListener('DOMContentLoaded', () => {
  const userEmail = localStorage.getItem('userEmail');
  const userToken = localStorage.getItem('userToken');
  const userRole = localStorage.getItem('userRole') || 'customer';
  const pathname = window.location.pathname;
  const staffRoles = ['admin', 'financial_officer', 'employee'];

  // --- 1. Dynamic Navigation & Auth Header Sync ---
  const navAuthSection = document.getElementById('nav-auth-section');
  if (navAuthSection) {
    if (userEmail && userToken) {
      // User is logged in
      navAuthSection.innerHTML = `
        <div class="user-profile">
          <span class="user-avatar">&#x1F464;</span>
          <span class="user-email" id="user-email-display">${userEmail}</span>
        </div>
        <button id="logout-btn" class="btn-logout" title="Log Out">
          <span class="logout-icon">&#x21AA;</span>
          <span class="logout-text">Logout</span>
        </button>
      `;

      // Bind logout button action
      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userToken');
          localStorage.removeItem('userRole');
          // Clear HttpOnly cookie via server
          fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
            window.location.href = '/index.html';
          });
        });
      }

      // If logged in as staff, dynamically inject the "Admin Dashboard" nav link
      if (staffRoles.includes(userRole)) {
        const navLinks = document.querySelector('.nav-left .nav-links');
        if (navLinks) {
          // Avoid duplicates
          if (!navLinks.querySelector('a[href="/admin.html"]')) {
            const adminLink = document.createElement('a');
            adminLink.href = '/admin.html';
            adminLink.className = 'nav-link' + (pathname.includes('/admin.html') ? ' active' : '');
            adminLink.textContent = 'Admin Dashboard';
            navLinks.appendChild(adminLink);
          }
        }
      }

      // If we are on the homepage, update the hero CTA "Sign In" button to be a welcome/browse action
      const heroLoginBtn = document.getElementById('hero-login-btn');
      if (heroLoginBtn) {
        heroLoginBtn.textContent = staffRoles.includes(userRole) ? "Admin Dashboard" : "Browse Products";
        heroLoginBtn.href = staffRoles.includes(userRole) ? "/admin.html" : "/products.html";
        heroLoginBtn.classList.remove("btn-login-nav");
        heroLoginBtn.classList.add("btn-shop-now");
      }
    } else {
      // User is a guest
      navAuthSection.innerHTML = `
        <a href="/login.html" class="btn-login-nav">Login / Register</a>
      `;
    }
  }

  // --- 2. Cart Drawer State & Operations (Shared) ---
  const cartKey = userEmail ? `cart_${userEmail}` : 'cart_guest';
  let cart = JSON.parse(localStorage.getItem(cartKey)) || [];

  const cartToggleBtn = document.getElementById('cart-toggle-btn');
  const cartDrawer = document.getElementById('cart-drawer');
  const cartCloseBtn = document.getElementById('cart-close-btn');
  const cartCountBadge = document.getElementById('cart-count-badge');
  const cartItemsContainer = document.getElementById('cart-items');
  const cartSubtotalPrice = document.getElementById('cart-subtotal-price');
  const checkoutBtn = document.getElementById('checkout-btn');
  const checkoutSuccessBanner = document.getElementById('checkout-success');
  const continueShoppingBtn = document.getElementById('continue-shopping-btn');

  let scroller = null;
  let sheet = null;

  if (cartDrawer) {
    scroller = cartDrawer.querySelector('.Drawer-scroller');
    sheet = cartDrawer.querySelector('.Drawer-sheet');
  }

  function saveCart() {
    localStorage.setItem(cartKey, JSON.stringify(cart));
    updateCartUI();
  }

  function addToCart(product, quantity = 1) {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({ ...product, quantity: quantity, emoji: product.emoji || '🛒' });
    }
    saveCart();
    openCart();
  }

  function incrementCartItem(productId) {
    const item = cart.find(item => item.id === productId);
    if (item) {
      item.quantity += 1;
      saveCart();
    }
  }

  function decrementCartItem(productId) {
    const item = cart.find(item => item.id === productId);
    if (item) {
      item.quantity -= 1;
      if (item.quantity <= 0) {
        cart = cart.filter(item => item.id !== productId);
      }
      saveCart();
    }
  }

  // Clear errors on input
  function removeCartItem(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
  }

  function updateCartUI() {
    if (!cartCountBadge) return;

    // 1. Badge Count
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCountBadge.textContent = totalCount;
    if (totalCount > 0) {
      cartCountBadge.classList.add('pop-animation');
      setTimeout(() => cartCountBadge.classList.remove('pop-animation'), 300);
    }

    // 2. Items List
    if (!cartItemsContainer) return;
    if (cart.length === 0) {
      cartItemsContainer.innerHTML = `
        <div class="empty-cart-state">
          <span class="empty-cart-icon">&#x1F6D2;</span>
          <p>Your cart is empty</p>
          <button class="btn-continue-shopping" id="continue-shopping-btn-dyn">Start Shopping</button>
        </div>
      `;
      const continueBtn = document.getElementById('continue-shopping-btn-dyn');
      if (continueBtn) {
        continueBtn.addEventListener('click', closeCart);
      }
      if (checkoutBtn) checkoutBtn.disabled = true;
    } else {
      cartItemsContainer.innerHTML = '';
      cart.forEach(item => {
        const itemRow = document.createElement('div');
        itemRow.className = 'cart-item-row';
        itemRow.innerHTML = `
          <div class="cart-item-visual">
            <img src="${item.image}" alt="${item.name}" class="cart-item-image" />
          </div>
          <div class="cart-item-info">
            <h4 class="cart-item-title">${item.name}</h4>
            <span class="cart-item-price">€${item.price.toFixed(2)}</span>
          </div>
          <div class="cart-item-actions">
            <button class="btn-remove-item" data-id="${item.id}">&times;</button>
            <div class="quantity-controller">
              <button class="btn-qty-dec" data-id="${item.id}">-</button>
              <span class="item-qty-value">${item.quantity}</span>
              <button class="btn-qty-inc" data-id="${item.id}">+</button>
            </div>
          </div>
        `;

        itemRow.querySelector('.btn-qty-dec').addEventListener('click', (e) => { e.stopPropagation(); decrementCartItem(item.id); });
        itemRow.querySelector('.btn-qty-inc').addEventListener('click', (e) => { e.stopPropagation(); incrementCartItem(item.id); });
        itemRow.querySelector('.btn-remove-item').addEventListener('click', (e) => { e.stopPropagation(); removeCartItem(item.id); });

        cartItemsContainer.appendChild(itemRow);
      });
      if (checkoutBtn) checkoutBtn.disabled = false;
    }

    // 3. Totals
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (cartSubtotalPrice) cartSubtotalPrice.textContent = `€${subtotal.toFixed(2)}`;

    const totalDisplay = document.querySelector('.total-amount');
    if (totalDisplay) totalDisplay.textContent = `€${subtotal.toFixed(2)}`;
  }

  // Drawer Open/Close Mechanics
  function openCart() {
    if (!cartDrawer || !scroller || !sheet) return;
    cartDrawer.showPopover();
    requestAnimationFrame(() => {
      scroller.scrollTo({
        left: scroller.scrollWidth,
        behavior: 'auto'
      });
    });
    cartToggleBtn.setAttribute('aria-expanded', 'true');
    sheet.focus();
  }

  function closeCart() {
    if (cartDrawer) {
      cartDrawer.hidePopover();
    }
    if (cartToggleBtn) {
      cartToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function onCartClosed() {
    if (!cartDrawer) return;
    cartDrawer.hidePopover();
    if (cartToggleBtn) cartToggleBtn.setAttribute('aria-expanded', 'false');
  }

  // Setup Drawer Observers & Handlers
  if (cartDrawer && scroller && sheet) {
    const visibleThreshold = 1 / window.innerWidth;
    const drawerObserver = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry.intersectionRatio < visibleThreshold) {
        onCartClosed();
      }
    }, {
      root: cartDrawer,
      threshold: [visibleThreshold, 1]
    });
    drawerObserver.observe(sheet);

    if (cartToggleBtn) cartToggleBtn.addEventListener('click', openCart);
    if (cartCloseBtn) cartCloseBtn.addEventListener('click', closeCart);
    if (continueShoppingBtn) continueShoppingBtn.addEventListener('click', closeCart);

    cartDrawer.addEventListener('click', (e) => {
      if (!sheet.contains(e.target)) {
        closeCart();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeCart();
      }
    });

    if (!CSS.supports('animation-timeline', 'scroll()')) {
      scroller.addEventListener('scroll', () => {
        const maxScroll = scroller.scrollWidth - scroller.clientWidth;
        if (maxScroll <= 0) return;
        const ratio = scroller.scrollLeft / maxScroll;
        cartDrawer.style.setProperty('--drawer-backdrop', ratio);
      });
    }
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!userToken) {
        let errorMsg = document.getElementById('checkout-login-error');
        if (!errorMsg) {
          errorMsg = document.createElement('div');
          errorMsg.id = 'checkout-login-error';
          errorMsg.style.color = '#d32f2f';
          errorMsg.style.backgroundColor = '#fde0e0';
          errorMsg.style.padding = '12px';
          errorMsg.style.borderRadius = '8px';
          errorMsg.style.marginTop = '15px';
          errorMsg.style.textAlign = 'center';
          errorMsg.style.fontWeight = '600';
          errorMsg.style.fontSize = '14px';
          errorMsg.style.border = '1px solid #f9c2c2';
          errorMsg.style.transition = 'opacity 0.3s ease';
          errorMsg.textContent = "You need to login to checkout";
          checkoutBtn.parentNode.insertBefore(errorMsg, checkoutBtn.nextSibling);
        }
        errorMsg.style.opacity = '1';
        errorMsg.style.display = 'block';
        setTimeout(() => {
          if (errorMsg) {
            errorMsg.style.opacity = '0';
            setTimeout(() => { errorMsg.style.display = 'none'; }, 300);
          }
        }, 3000);
      } else {
        window.location.href = '/checkout.html';
      }
    });
  }

  // --- 3. PAGE SPECIFIC ROUTING ---

  if (pathname.includes('/products.html')) {
    const productGrid = document.getElementById('product-grid');
    const searchInput = document.getElementById('search-input');
    const categoryTabs = document.querySelectorAll('.category-item');
    const pageTitle = document.getElementById('page-category-title');

    let allProducts = [];
    let activeCategory = 'all';
    let searchQuery = '';

    function renderProductGrid() {
      if (!productGrid) return;
      productGrid.innerHTML = '';

      const filtered = allProducts.filter(p => {
        const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
      });

      if (filtered.length === 0) {
        productGrid.innerHTML = `
          <div class="no-results">
            <p>No products found matching your search.</p>
          </div>
        `;
        return;
      }

      filtered.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';

        card.innerHTML = `
          <div class="product-visual clickable-visual" data-id="${p.id}">
            <img src="${p.image}" alt="${p.name}" class="product-image" />
          </div>
          <div class="product-details">
            <span class="product-category-text">${p.category.toUpperCase()}</span>
            <h3 class="product-title clickable-title" data-id="${p.id}">${p.name}</h3>
            <span class="product-size">${p.size}</span>
            <div class="product-footer">
              <span class="product-price">€${p.price.toFixed(2)}</span>
              <button class="btn-view" data-id="${p.id}">View</button>
            </div>
          </div>
        `;

        card.querySelectorAll('.clickable-visual, .clickable-title, .btn-view').forEach(el => {
          el.addEventListener('click', () => {
            window.location.href = `/product-detail.html?id=${p.id}`;
          });
        });

        productGrid.appendChild(card);
      });
    }

    fetch('/api/products')
      .then(res => {
        if (!res.ok) throw new Error("API call failed");
        return res.json();
      })
      .then(data => {
        allProducts = data;
        renderProductGrid();
      })
      .catch(err => {
        console.error("Failed to fetch products from backend API", err);
        productGrid.innerHTML = `<div class="no-results"><p>Failed to connect to backend server. Please verify it is running.</p></div>`;
      });

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderProductGrid();
      });
    }

    categoryTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        categoryTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeCategory = tab.getAttribute('data-category');
        if (pageTitle) {
          pageTitle.textContent = tab.textContent;
        }
        renderProductGrid();
      });
    });
  }

  // B. PRODUCT DETAILS PAGE (product-detail.html)
  if (pathname.includes('/product-detail.html')) {
    const detailCard = document.getElementById('product-detail-card');
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');

    if (!productId) {
      if (detailCard) {
        detailCard.innerHTML = `<div class="error-state"><p>Product ID is missing in query string.</p></div>`;
      }
    } else {
      fetch(`/api/products/${productId}`)
        .then(res => {
          if (res.status === 404) {
            window.location.href = '/404.html';
            return;
          }
          if (!res.ok) throw new Error("Product not found");
          return res.json();
        })
        .then(product => {
          const breadcrumbCurrent = document.getElementById('breadcrumb-current');
          if (breadcrumbCurrent) breadcrumbCurrent.textContent = product.name;

          let featuresHtml = '';
          if (product.features && product.features.length > 0) {
            featuresHtml = '<ul class="detail-features">' + product.features.map(f => `<li>${f}</li>`).join('') + '</ul>';
          }

          detailCard.className = 'product-detail-layout';
          detailCard.innerHTML = `
            <div class="detail-visual">
              <img src="${product.image}" alt="${product.name}" class="detail-image" />
            </div>
            <div class="detail-info">
              <div class="detail-category">${product.category.toUpperCase()}</div>
              <h1 class="detail-title">${product.name}</h1>
              <div class="detail-size">${product.size}</div>
              <div class="detail-price">€${product.price.toFixed(2)}</div>
              
              <p class="detail-description">${product.description}</p>
              ${featuresHtml}
              
              <div class="detail-actions">
                <div class="detail-quantity-wrapper">
                  <button class="btn-qty-minus">-</button>
                  <input type="number" class="detail-qty-input" value="1" min="1" id="detail-qty" readonly />
                  <button class="btn-qty-plus">+</button>
                </div>
                <button class="btn-add-to-cart-detail">Add to Cart</button>
              </div>
            </div>
          `;

          const specsSection = document.getElementById('product-specs-section');
          if (specsSection && product.specifications) {
            let specRows = '';
            for (const [key, value] of Object.entries(product.specifications)) {
              specRows += `
                <div class="spec-row">
                  <div class="spec-key">${key}</div>
                  <div class="spec-value">${value}</div>
                </div>
              `;
            }
            specsSection.innerHTML = `
              <div class="specs-tabs">
                <div class="spec-tab active">Specifications</div>
              </div>
              <div class="specs-content">
                ${specRows}
              </div>
            `;
          }

          // Qty logic
          let currentQty = 1;
          const qtyInput = detailCard.querySelector('#detail-qty');
          detailCard.querySelector('.btn-qty-minus').addEventListener('click', () => {
            if (currentQty > 1) { currentQty--; qtyInput.value = currentQty; }
          });
          detailCard.querySelector('.btn-qty-plus').addEventListener('click', () => {
            currentQty++; qtyInput.value = currentQty;
          });

          detailCard.querySelector('.btn-add-to-cart-detail').addEventListener('click', () => {
            addToCart(product, currentQty);
          });
        })
        .catch(err => {
          console.error("Failed to fetch product details", err);
          if (detailCard) {
            detailCard.innerHTML = `
              <div class="error-state">
                <p>Failed to load product details. Product may not exist or backend server is offline.</p>
              </div>
            `;
          }
        });
    }
  }

  // C. ADMINISTRATOR DASHBOARD PAGE (admin.html)
  if (pathname.includes('/admin.html')) {
    // DOM bindings for admin elements
    const totalLossAmount = document.getElementById('total-loss-amount');
    const lossCategoriesList = document.getElementById('loss-categories-list');
    const lossTrendChart = document.getElementById('loss-trend-chart');
    const customerTableBody = document.getElementById('customer-table-body');
    const customerSearchInput = document.getElementById('customer-search-input');
    const customerTableCount = document.getElementById('customer-table-count');

    // 1. Load Sales Losses Data
    fetch('/api/admin/sales-losses')
      .then(res => {
        if (!res.ok) throw new Error("Failed to load loss metrics");
        return res.json();
      })
      .then(data => {
        // Render total loss amount
        if (totalLossAmount) {
          totalLossAmount.textContent = `€${data.total_loss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }

        // Render categories list
        if (lossCategoriesList) {
          lossCategoriesList.innerHTML = '';
          data.categories.forEach(cat => {
            const row = document.createElement('div');
            row.className = 'loss-category-row';
            row.innerHTML = `
              <div class="loss-cat-info">
                <span class="loss-cat-name">${cat.name}</span>
                <span class="loss-cat-value">€${cat.amount.toFixed(2)} (${cat.loss_percentage}%)</span>
              </div>
              <div class="loss-progress-track">
                <div class="loss-progress-bar" style="width: ${cat.loss_percentage}%"></div>
              </div>
            `;
            lossCategoriesList.appendChild(row);
          });
        }

        // Render trend chart
        if (lossTrendChart) {
          lossTrendChart.innerHTML = '';
          const maxLoss = Math.max(...data.daily_trend.map(t => t.loss));

          data.daily_trend.forEach(trend => {
            const col = document.createElement('div');
            col.className = 'trend-bar-column';
            const pctHeight = maxLoss > 0 ? (trend.loss / maxLoss) * 100 : 0;

            col.innerHTML = `
              <div class="trend-bar-wrapper">
                <div class="trend-bar-inner" style="height: ${pctHeight}%" title="€${trend.loss.toFixed(2)} lost"></div>
              </div>
              <span class="trend-bar-day">${trend.day}</span>
              <span class="trend-bar-label">€${Math.round(trend.loss)}</span>
            `;
            lossTrendChart.appendChild(col);
          });
        }
      })
      .catch(err => {
        console.error("Failed to load admin analytics", err);
        if (lossCategoriesList) {
          lossCategoriesList.innerHTML = `<div class="error-state-admin"><p>Failed to load analytics.</p></div>`;
        }
      });

    // 2. Load Customer Records Table
    function fetchAndRenderCustomers(query = "") {
      if (!customerTableBody) return;
      customerTableBody.innerHTML = `<tr><td colspan="6" class="loading-state-admin">Loading customer database...</td></tr>`;

      fetch(`/api/admin/customers?search=${encodeURIComponent(query)}`)
        .then(res => {
          if (!res.ok) throw new Error("Failed to fetch customer list");
          return res.json();
        })
        .then(users => {
          customerTableBody.innerHTML = '';
          if (users.length === 0) {
            customerTableBody.innerHTML = `<tr><td colspan="6" class="no-results-admin">No customer records found.</td></tr>`;
            if (customerTableCount) customerTableCount.textContent = 'Showing 0 records';
            return;
          }

          users.forEach(user => {
            const tr = document.createElement('tr');

            // Format created_at date
            let displayDate = 'Legacy Ingested';
            if (user.created_at) {
              const dt = new Date(user.created_at);
              displayDate = dt.toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
            }

            const isStaff = ['admin', 'financial_officer', 'employee'].includes(user.role);
            const phone = user.phone ? user.phone : 'Unknown';
            const name = user.name ? user.name : 'Legacy User';

            tr.innerHTML = `
              <td class="col-id">#${user.id}</td>
              <td class="col-name">${name}</td>
              <td class="col-email">${user.email}</td>
              <td class="col-phone">${phone}</td>
              <td class="col-date">${displayDate}</td>
              <td class="col-status">
                <span class="status-pill ${isStaff ? 'admin-pill' : 'customer-pill'}">
                  ${user.role ? user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Customer'}
                </span>
              </td>
            `;
            customerTableBody.appendChild(tr);
          });

          if (customerTableCount) {
            customerTableCount.textContent = `Showing ${users.length} records (Database Limit)`;
          }
        })
        .catch(err => {
          console.error("Failed to fetch customer list", err);
          customerTableBody.innerHTML = `<tr><td colspan="6" class="error-state-admin"><p>Failed to query database records.</p></td></tr>`;
        });
    }

    // Trigger initial customer load
    fetchAndRenderCustomers();

    // Bind real-time search filtering
    if (customerSearchInput) {
      customerSearchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        fetchAndRenderCustomers(query);
      });
    }
  }

  if (pathname.includes('/checkout.html')) {
    if (!userToken) {
      window.location.href = '/login.html';
    }

    const checkoutItemsContainer = document.getElementById('checkout-items-container');
    const checkoutSubtotal = document.getElementById('checkout-subtotal');
    const checkoutTotal = document.getElementById('checkout-total');
    const checkoutForm = document.getElementById('checkout-form');

    // Auto-fill form if logged in
    if (userEmail) {
      const emailInput = document.getElementById('shipping-email');
      if (emailInput) emailInput.value = userEmail;
    }

    // Render Cart in Checkout
    if (cart.length === 0) {
      checkoutItemsContainer.innerHTML = '<p style="padding: 15px;">Your cart is empty. Please add items before checking out.</p>';
      const btn = document.getElementById('submit-order-btn');
      if (btn) btn.disabled = true;
    } else {
      let subtotal = 0;
      checkoutItemsContainer.innerHTML = '';
      cart.forEach(item => {
        subtotal += (item.price * item.quantity);
        const itemDiv = document.createElement('div');
        itemDiv.className = 'checkout-item';
        itemDiv.innerHTML = `
          <img src="${item.image}" alt="${item.name}" class="checkout-item-img" />
          <div class="checkout-item-details">
            <h4 class="checkout-item-title">${item.name}</h4>
            <div class="checkout-item-qty">Qty: ${item.quantity}</div>
            <div class="checkout-item-price">€${(item.price * item.quantity).toFixed(2)}</div>
          </div>
        `;
        checkoutItemsContainer.appendChild(itemDiv);
      });

      if (checkoutSubtotal) checkoutSubtotal.textContent = `€${subtotal.toFixed(2)}`;
      if (checkoutTotal) checkoutTotal.textContent = `€${subtotal.toFixed(2)}`;
    }

    // Handle Form Submission
    if (checkoutForm) {
      checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const checkoutError = document.getElementById('checkout-error');
        const submitBtn = document.getElementById('submit-order-btn');
        if (checkoutError) checkoutError.textContent = '';

        if (cart.length === 0) {
          if (checkoutError) checkoutError.textContent = 'Your cart is empty.';
          return;
        }

        // Build checkout payload
        const payload = {
          items: cart.map(item => ({
            productId: item.id,
            quantity: item.quantity,
            price: item.price
          })),
          shippingInfo: {
            firstName: document.getElementById('shipping-firstname')?.value || '',
            lastName: document.getElementById('shipping-lastname')?.value || '',
            email: document.getElementById('shipping-email')?.value || '',
            address: document.getElementById('shipping-address')?.value || '',
            city: document.getElementById('shipping-city')?.value || '',
            zip: document.getElementById('shipping-zip')?.value || ''
          }
        };

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Processing...';
        }

        try {
          const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userToken}`
            },
            credentials: 'include',
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Checkout failed');
          }

          const result = await response.json();

          // Clear cart on success
          cart = [];
          localStorage.setItem(cartKey, JSON.stringify(cart));

          // Store order info for confirmation page
          localStorage.setItem('lastOrderId', result.orderId);
          localStorage.setItem('lastTransactionId', result.transactionId);

          window.location.href = '/order-confirmation.html';
        } catch (error) {
          if (checkoutError) checkoutError.textContent = error.message;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Complete Order';
          }
        }
      });
    }
  }

  if (pathname.includes('/order-confirmation.html')) {
    // Generate Order ID
    const orderDisplay = document.getElementById('display-order-number');
    if (orderDisplay) {
      const randomOrderNum = Math.floor(100000 + Math.random() * 900000);
      orderDisplay.textContent = `#${randomOrderNum}`;
    }

    // Clear the cart
    cart = [];
    localStorage.setItem(cartKey, JSON.stringify(cart));
    updateCartUI();
  }

  // Initialize UI values
  updateCartUI();
});
