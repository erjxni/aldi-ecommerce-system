(function () {
  const userToken = localStorage.getItem('userToken');
  const userRole = localStorage.getItem('userRole') || 'customer';
  const userEmail = localStorage.getItem('userEmail') || '';

  // --- Role-Based UI Hiding for Employees ---
  if (userRole === 'employee') {
    const financialSection = document.getElementById('financial-ledger-section');
    const revenueCard = document.getElementById('revenue-card');
    if (financialSection) financialSection.classList.add('section-hidden');
    if (revenueCard) revenueCard.classList.add('section-hidden');
  }

  // --- Update Topbar Profile Pic ---
  window.updateTopbarProfilePic = function () {
    const userPhoto = localStorage.getItem('userPhoto');
    const profilePicDiv = document.querySelector('.profile-pic');
    if (profilePicDiv) {
      const finalPhoto = userPhoto && userPhoto !== 'null' && userPhoto !== 'undefined' && userPhoto.trim() !== ''
        ? userPhoto
        : '/assets/images/default-photo.jpg';
      profilePicDiv.innerHTML = `<img src="${finalPhoto}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`;
    }
  };
  window.updateTopbarProfilePic();

  // Sync user profile photo from db if not cached locally
  if (userEmail && userToken && (!localStorage.getItem('userPhoto') || localStorage.getItem('userPhoto') === 'null' || localStorage.getItem('userPhoto') === '')) {
    fetch(`/api/admin/database/User`, {
      headers: { 'Authorization': `Bearer ${userToken}` }
    })
      .then(res => res.json())
      .then(users => {
        const me = users.find(u => u.email === userEmail);
        if (me) {
          if (me.photoUrl) {
            localStorage.setItem('userPhoto', me.photoUrl);
            window.updateTopbarProfilePic();
          }
          if (me.displayName) {
            localStorage.setItem('userName', me.displayName);
            const emailDisplay = document.getElementById('user-email-display');
            if (emailDisplay) {
              emailDisplay.textContent = `Hello, ${me.displayName}`;
            }
          }
        }
      })
      .catch(err => console.error('Failed to sync user profile:', err));
  }

  // --- Logout Button ---
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('userId');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userToken');
      localStorage.removeItem('userRole');
      localStorage.removeItem('userName');
      localStorage.removeItem('userPhoto');
      fetch('/api/logout', { method: 'POST', credentials: 'include' }).finally(() => {
        window.location.href = '/index.html';
      });
    });
  }

  // --- Track cumulative revenue from WebSocket events ---
  let cumulativeRevenue = 0;
  const revenueDisplay = document.getElementById('total-revenue-amount');

  function updateRevenueDisplay() {
    if (revenueDisplay) {
      revenueDisplay.textContent = '€' + cumulativeRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Animate the revenue change
      revenueDisplay.style.transform = 'scale(1.05)';
      revenueDisplay.style.color = '#10b981'; // green for increase
      setTimeout(() => {
        revenueDisplay.style.transform = 'scale(1)';
        revenueDisplay.style.color = '#1a1f36';
        revenueDisplay.style.transition = 'all 0.3s ease';
      }, 400);
    }
  }

  // --- Financial Ledger: add rows in real-time ---
  const ledgerBody = document.getElementById('financial-ledger-body');
  function addLedgerRow(data) {
    if (!ledgerBody) return;
    // Clear the placeholder on first real entry
    if (ledgerBody.querySelector('.ledger-empty')) {
      ledgerBody.innerHTML = '';
    }
    const tr = document.createElement('tr');
    const timestamp = new Date(data.timestamp).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    tr.innerHTML = `
          <td style="font-family:monospace;">${data.transactionId || 'N/A'}</td>
          <td><span class="status-pill status-success">Sale</span></td>
          <td style="font-weight:600;">€${data.amount.toFixed(2)}</td>
          <td style="font-family:monospace;">${data.orderId ? data.orderId.substring(0, 8) + '...' : 'N/A'}</td>
          <td>${timestamp}</td>
        `;
    // Insert at the top
    ledgerBody.insertBefore(tr, ledgerBody.firstChild);
  }

  // --- Toast Notification ---
  function showFinancialToast(amount) {
    const existing = document.querySelector('.financial-update-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'financial-update-toast';
    toast.innerHTML = `
          <div style="font-weight: 600; margin-bottom: 4px;">&#x1F4B0; New Revenue</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: #10b981;">+€${amount.toFixed(2)}</div>
        `;
    toast.style.position = 'fixed';
    toast.style.top = '24px';
    toast.style.right = '24px';
    toast.style.zIndex = '9999';
    toast.style.background = '#ffffff';
    toast.style.border = '1px solid #e3e8ee';
    toast.style.color = '#1a1f36';
    toast.style.padding = '16px 24px';
    toast.style.borderRadius = '12px';
    toast.style.boxShadow = '0 8px 32px rgba(0,0,0,0.1)';
    toast.style.transform = 'translateX(120%)';
    toast.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';

    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.transform = 'translateX(0)');
    setTimeout(() => {
      toast.style.transform = 'translateX(120%)';
      setTimeout(() => toast.remove(), 400);
    }, 5000);
  }

  // --- WebSocket Connection ---
  const wsStatus = document.getElementById('ws-status');
  const wsStatusText = wsStatus ? wsStatus.querySelector('.ws-status-text') : null;
  const wsStatusDot = wsStatus ? wsStatus.querySelector('div') : null;

  if (!userToken) return;

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}?token=${encodeURIComponent(userToken)}`;

  let ws;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;

  function connectWebSocket() {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Connected to admin channel');
      reconnectAttempts = 0;
      if (wsStatusText) wsStatusText.textContent = 'Live';
      if (wsStatusDot) wsStatusDot.style.background = '#10b981';
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'financial_update') {
          const data = message.data;
          cumulativeRevenue += data.amount;
          updateRevenueDisplay();
          addLedgerRow(data);
          showFinancialToast(data.amount);
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onclose = (event) => {
      console.log('[WebSocket] Disconnected:', event.code, event.reason);
      if (wsStatusText) wsStatusText.textContent = 'Offline';
      if (wsStatusDot) wsStatusDot.style.background = '#991b1b';

      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        setTimeout(connectWebSocket, delay);
      }
    };

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
    };
  }

  // --- Document Upload Widget ---
  const uploadForm = document.getElementById('doc-upload-form');
  const uploadStatus = document.getElementById('upload-status');

  if (uploadForm && uploadStatus) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleInput = document.getElementById('doc-title');
      const categoryInput = document.getElementById('doc-category');
      const fileInput = document.getElementById('doc-file');

      if (!titleInput.value || !categoryInput.value || !fileInput.files[0]) {
        showStatus('Please fill in all fields and select a file.', '#991b1b');
        return;
      }

      const formData = new FormData();
      formData.append('title', titleInput.value);
      formData.append('category', categoryInput.value);
      formData.append('file', fileInput.files[0]);

      showStatus('Uploading...', '#2b58f9');

      try {
        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('userToken')}`
          },
          body: formData
        });

        const data = await res.json();

        if (res.ok) {
          showStatus('Document uploaded successfully!', '#10b981');
          uploadForm.reset();

          // Clear db viewer cache so if they click the Document tab, it fetches fresh data
          sessionStorage.removeItem('db_cache_Document');

          // If we are currently viewing the Document table, refresh the table view
          const activeTab = document.querySelector('.db-tab.active');
          if (activeTab && activeTab.dataset.table === 'Document') {
            activeTab.click();
          }
        } else {
          showStatus(data.error || data.detail || 'Upload failed.', '#991b1b');
        }
      } catch (error) {
        console.error('Upload error:', error);
        showStatus('Network error occurred during upload.', '#991b1b');
      }
    });

    function showStatus(text, color) {
      uploadStatus.textContent = text;
      uploadStatus.style.color = color;
      uploadStatus.style.display = 'block';
    }
  }

  connectWebSocket();
})();

(function () {
  // --- View Toggling ---
  const dbBtn = document.getElementById('btn-db-viewer');
  const homeBtn = document.getElementById('btn-home-dashboard');
  const usersBtn = document.getElementById('btn-users-manager');
  const filesBtn = document.getElementById('btn-files-manager');
  const financialsBtn = document.getElementById('btn-financials');
  const pollsBtn = document.getElementById('btn-polls-manager');
  const notifsBtn = document.getElementById('btn-notifications-manager');
  const dashboardView = document.getElementById('dashboard-view');
  const dbViewer = document.getElementById('database-viewer');
  const usersViewer = document.getElementById('users-manager-view');
  const filesViewer = document.getElementById('files-manager-view');
  const financialsViewer = document.getElementById('financials-view');
  const pollsViewer = document.getElementById('polls-manager-view');
  const notifsViewer = document.getElementById('notifications-manager');

  // Helper to hide all main views
  function hideAllViews() {
    if (dashboardView) dashboardView.style.display = 'none';
    if (dbViewer) dbViewer.style.display = 'none';
    if (usersViewer) usersViewer.style.display = 'none';
    if (filesViewer) filesViewer.style.display = 'none';
    if (financialsViewer) financialsViewer.style.display = 'none';
    if (pollsViewer) pollsViewer.style.display = 'none';
    if (notifsViewer) notifsViewer.style.display = 'none';
  }
  function clearSidebarActive() {
    document.querySelectorAll('.admin-sidebar .sidebar-icon').forEach(i => i.classList.remove('active'));
  }

  if (
  dbBtn &&
  homeBtn &&
  usersBtn &&
  filesBtn &&
  financialsBtn &&
  dashboardView &&
  dbViewer &&
  usersViewer &&
  filesViewer &&
  financialsViewer
) {
    dbBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideAllViews();
      if (dbViewer) dbViewer.style.display = 'flex';
      clearSidebarActive();
      dbBtn.classList.add('active');
      const activeTab = document.querySelector('.db-tab.active');
      if (activeTab) loadTableData(activeTab.dataset.table);
    });

    homeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideAllViews();
      if (dashboardView) dashboardView.style.display = 'block';
      clearSidebarActive();
      homeBtn.classList.add('active');
    });

    financialsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideAllViews();
      if (financialsViewer) financialsViewer.style.display = 'flex';
      clearSidebarActive();
      financialsBtn.classList.add('active');
    });

    usersBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideAllViews();
      if (usersViewer) usersViewer.style.display = 'flex';
      clearSidebarActive();
      usersBtn.classList.add('active');
      loadUsersManagerData();
    });

    filesBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideAllViews();
      if (filesViewer) filesViewer.style.display = 'flex';
      clearSidebarActive();
      filesBtn.classList.add('active');
      loadFilesManagerData();
    });

    // Polls Manager button
    if (pollsBtn) {
      pollsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllViews();
        if (pollsViewer) pollsViewer.style.display = 'flex';
        clearSidebarActive();
        pollsBtn.classList.add('active');
        // Load polls when navigating to the view
        if (typeof window.loadPolls === 'function') window.loadPolls();
      });
    }

    // Notifications Manager button
    if (notifsBtn) {
      notifsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        hideAllViews();
        if (notifsViewer) notifsViewer.style.display = 'flex';
        clearSidebarActive();
        notifsBtn.classList.add('active');
      });
    }
  }

  // --- Tab and Data Fetching Logic ---
  const tabs = document.querySelectorAll('.db-tab');
  const tableHead = document.getElementById('db-table-head');
  const tableBody = document.getElementById('db-table-body');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadTableData(tab.dataset.table);
    });
  });

  // Navigate to record when foreign key is clicked
  document.addEventListener('click', (e) => {
    const fkLink = e.target.closest('.fk-link');
    if (fkLink) {
      const targetTable = fkLink.dataset.targetTable;
      const targetId = fkLink.dataset.targetId;
      const tab = document.querySelector(`.db-tab[data-table="${targetTable}"]`);
      if (tab) {
        window.highlightTargetId = targetId;
        tab.click();
      } else {
        alert(`Could not find table tab for ${targetTable}`);
      }
    }
  });

  function highlightRow(id) {
    setTimeout(() => {
      const rows = document.querySelectorAll('#db-table-body tr');
      for (let row of rows) {
        // Check if any cell matches the id
        if (row.innerHTML.includes(id)) {
          row.style.background = '#eef2ff';
          row.style.transition = 'background 0.5s';
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => {
            row.style.background = 'transparent';
          }, 3000);
          break;
        }
      }
    }, 100);
  }

  async function loadTableData(tableName) {
    if (!tableBody || !tableHead) return;

    tableBody.innerHTML = '<tr><td colspan="10" style="padding: 24px; text-align: center; color: #697386;">Loading data...</td></tr>';

    let targetData = null;

    // Check session storage cache
    const cacheKey = 'db_cache_' + tableName;
    const cachedStr = sessionStorage.getItem(cacheKey);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
        targetData = cached.data;
      }
    }

    if (!targetData) {
      try {
        const res = await fetch(`/api/admin/database/${tableName}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('userToken')}` }
        });
        if (!res.ok) throw new Error('Failed to fetch');
        targetData = await res.json();

        sessionStorage.setItem(cacheKey, JSON.stringify({
          timestamp: Date.now(),
          data: targetData
        }));
      } catch (error) {
        console.error(error);
        tableBody.innerHTML = '<tr><td colspan="10" style="padding: 24px; text-align: center; color: #991b1b;">Error loading data.</td></tr>';
        return;
      }
    }

    renderTable(targetData);

    if (window.highlightTargetId) {
      highlightRow(window.highlightTargetId);
      window.highlightTargetId = null;
    }
  }

  // --- Query Runner Logic ---
  const querySelect = document.getElementById('query-template-select');
  const queryInput = document.getElementById('query-input');
  const variablesInput = document.getElementById('variables-input');
  const runBtn = document.getElementById('run-query-btn');
  const queryOutput = document.getElementById('query-output');

  const templates = {
    'addProduct': {
      query: `mutation AddProduct($data: Product_Data!) {\n  product_insert(data: $data)\n}`,
      variables: `{\n  "data": {\n    "name": "New Item",\n    "category": "Electronics",\n    "price": 9.99,\n    "stockQuantity": 100,\n    "description": "A great new item."\n  }\n}`
    },
    'deleteOrder': {
      query: `mutation DeleteOrder($id: UUID!) {\n  orderItem_deleteMany(where: { orderId: { eq: $id } })\n  order_delete(id: $id)\n}`,
      variables: `{\n  "id": "PASTE_ORDER_ID_HERE"\n}`
    },
    'deleteUser': {
      query: `mutation DeleteUser($id: UUID!) {\n  user_delete(id: $id)\n}`,
      variables: `{\n  "id": "PASTE_USER_ID_HERE"\n}`
    }
  };

  if (querySelect) {
    querySelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (templates[val]) {
        queryInput.value = templates[val].query;
        variablesInput.value = templates[val].variables;
      } else {
        queryInput.value = '';
        variablesInput.value = '';
      }
    });
  }

  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      const query = queryInput.value.trim();
      let variables = {};
      if (!query) {
        alert('Please enter a query');
        return;
      }
      if (variablesInput.value.trim()) {
        try {
          variables = JSON.parse(variablesInput.value);
        } catch (err) {
          alert('Invalid variables JSON');
          return;
        }
      }

      queryOutput.textContent = 'Executing...';
      try {
        const res = await fetch('/api/admin/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('userToken')}`
          },
          body: JSON.stringify({ query, variables })
        });
        const data = await res.json();
        queryOutput.textContent = JSON.stringify(data, null, 2);

        // Clear caches since we might have mutated data
        if (query.trim().startsWith('mutation')) {
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith('db_cache_')) {
              sessionStorage.removeItem(key);
            }
          }
        }
      } catch (error) {
        queryOutput.textContent = 'Error executing query: ' + error.message;
      }
    });
  }

  function getTableNameFromCol(col) {
    const map = {
      'product': 'Product',
      'relatedorder': 'Order',
      'user': 'User',
      'cart': 'Cart',
      'cartitem': 'CartItem',
      'processedby': 'User',
      'customer': 'User',
      'poll': 'Poll'
    };
    return map[col.toLowerCase()] || col;
  }

  window.copyToClipboard = function (text, el) {
    navigator.clipboard.writeText(text);
    const original = el.innerHTML;
    el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom;"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    setTimeout(() => el.innerHTML = original, 2000);
  };

  function renderTable(data) {
    if (!data || data.length === 0) {
      tableHead.innerHTML = '';
      tableBody.innerHTML = '<tr><td colspan="10" style="padding: 24px; text-align: center; color: #697386;">No records found.</td></tr>';
      return;
    }

    const truncateStr = (str) => {
      if (!str) return '';
      if (str.length <= 10) return str;
      return str.substring(0, 4) + '...' + str.substring(str.length - 3);
    };

    const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;

    // Get columns from first object
    let columns = Object.keys(data[0]);
    // Force primary ID to the front
    const idIndex = columns.findIndex(c => c.toLowerCase() === 'id');
    if (idIndex > -1) {
      const idCol = columns.splice(idIndex, 1)[0];
      columns.unshift(idCol);
    }

    tableHead.innerHTML = '<tr>' + columns.map(col => `<th>${col}</th>`).join('') + '</tr>';

    tableBody.innerHTML = data.map(row => {
      return '<tr>' + columns.map(col => {
        let val = row[col];
        let tdClass = '';
        let copyBtn = '';

        if (col.toLowerCase().includes('id')) {
          tdClass = 'col-id';
        }

        if (typeof val === 'object' && val !== null) {
          if (val.id) {
            const targetTable = getTableNameFromCol(col);
            val = `<button class="fk-link btn-outline" data-target-table="${targetTable}" data-target-id="${val.id}" style="padding: 2px 8px; font-size: 0.75rem; border: 1px solid #2b58f9; color: #2b58f9; background: transparent; cursor: pointer; border-radius: 4px;">&#128279; ${truncateStr(val.id)}</button>`;
            copyBtn = `<span class="copy-btn" onclick="window.copyToClipboard('${val.id}', this)" style="cursor:pointer; margin-left:8px; color:#697386;" title="Copy ID">${copyIcon}</span>`;
          } else {
            let summaryText = 'JSON Data';
            const formattedJson = JSON.stringify(val, null, 2).replace(/</g, '&lt;').replace(/>/g, '&gt;');
            val = `<details style="cursor:pointer;">
                          <summary style="font-family:monospace; color:#2b58f9;">{ ${summaryText} }</summary>
                          <pre style="margin:4px 0 0; padding:6px; background:#f4f5f7; border-radius:4px; font-size:0.75rem; color:#1a1f36; white-space:pre-wrap;">${formattedJson}</pre>
                        </details>`;
          }
        } else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val)) {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            val = d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
          }
        } else if (typeof val === 'string' && val.length > 20 && col.toLowerCase().includes('id')) {
          let originalVal = val;
          val = `<span title="${val}" style="cursor:help;">${truncateStr(val)}</span>`;
          copyBtn = `<span class="copy-btn" onclick="window.copyToClipboard('${originalVal}', this)" style="cursor:pointer; margin-left:8px; color:#697386;" title="Copy ID">${copyIcon}</span>`;
        } else if (typeof val === 'string' && val.length > 40) {
          val = `<span title="${val}" style="cursor:help;">${val.substring(0, 37)}...</span>`;
        }

        return `<td class="${tdClass}">${val}${copyBtn}</td>`;
      }).join('') + '</tr>';
    }).join('');
  }

  // --- Users Manager Logic ---
  const usersCardContainer = document.getElementById('users-card-container');
  const addUserModal = document.getElementById('add-user-modal');
  const openAddUserBtn = document.getElementById('open-add-user-btn');
  const cancelAddUserBtn = document.getElementById('cancel-add-user-btn');
  const addUserForm = document.getElementById('add-user-form');
  const addUserError = document.getElementById('add-user-error');

  if (openAddUserBtn && addUserModal) {
    openAddUserBtn.addEventListener('click', () => {
      addUserForm.reset();
      addUserError.style.display = 'none';

      const previewContainer = document.getElementById('photo-preview-container');
      const previewImg = document.getElementById('photo-preview-img');
      if (previewContainer && previewImg) {
        previewContainer.style.display = 'none';
        previewImg.src = '';
      }

      addUserModal.showModal();
    });
    cancelAddUserBtn.addEventListener('click', () => {
      addUserModal.close();
    });

    const photoInputObj = document.getElementById('new-user-photo');
    const previewContainer = document.getElementById('photo-preview-container');
    const previewImg = document.getElementById('photo-preview-img');
    const clearPhotoBtn = document.getElementById('clear-photo-btn');

    if (photoInputObj && previewContainer && clearPhotoBtn) {
      photoInputObj.addEventListener('change', () => {
        if (photoInputObj.files && photoInputObj.files[0]) {
          previewImg.src = URL.createObjectURL(photoInputObj.files[0]);
          previewContainer.style.display = 'flex';
        } else {
          previewContainer.style.display = 'none';
          previewImg.src = '';
        }
      });

      clearPhotoBtn.addEventListener('click', () => {
        photoInputObj.value = '';
        previewContainer.style.display = 'none';
        previewImg.src = '';
      });
    }

    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-user-name').value.trim();
      const email = document.getElementById('new-user-email').value.trim();
      const password = document.getElementById('new-user-password').value;
      const role = document.getElementById('new-user-role').value;
      const photoInput = document.getElementById('new-user-photo');

      let photoUrl = '';
      if (photoInput && photoInput.files && photoInput.files[0]) {
        try {
          const file = photoInput.files[0];
          const formData = new FormData();
          formData.append('photo', file);

          const progressContainer = document.getElementById('upload-progress-container');
          const progressBar = document.getElementById('upload-progress-bar');
          if (progressContainer) progressContainer.style.display = 'block';
          if (progressBar) progressBar.style.width = '50%';

          const uploadRes = await fetch('/api/admin/users/upload-photo', {
            method: 'POST',
            body: formData
          });

          if (progressBar) progressBar.style.width = '100%';

          if (!uploadRes.ok) {
            throw new Error('Upload failed with status ' + uploadRes.status);
          }

          const uploadData = await uploadRes.json();
          photoUrl = uploadData.photoUrl;

          setTimeout(() => { if (progressContainer) progressContainer.style.display = 'none'; }, 500);
        } catch (err) {
          console.error('Failed to upload photo:', err);
          addUserError.textContent = `Failed to upload profile photo: ${err.message || 'Unknown error'}`;
          addUserError.style.display = 'block';
          addUserError.style.color = '#991b1b';
          const progressContainer = document.getElementById('upload-progress-container');
          if (progressContainer) progressContainer.style.display = 'none';
          return;
        }
      }

      addUserError.textContent = 'Creating user...';
      addUserError.style.display = 'block';
      addUserError.style.color = '#2b58f9';

      const finalPhotoUrl = photoUrl || '/assets/images/default-photo.jpg';
      const query = `mutation AddStaffUser($email: String!, $password: String!, $role: String!, $name: String!, $photoUrl: String!) {
            user_insert(data: { email: $email, passwordHash: $password, role: $role, displayName: $name, photoUrl: $photoUrl })
          }`;
      const variables = { email, password, role, name, photoUrl: finalPhotoUrl };

      try {
        const res = await fetch('/api/admin/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('userToken')}`
          },
          body: JSON.stringify({ query, variables })
        });
        const data = await res.json();
        if (data.errors || data.error) {
          addUserError.textContent = data.error || data.errors[0].message;
          addUserError.style.display = 'block';
        } else {
          addUserModal.close();
          loadUsersManagerData(); // Refresh list
        }
      } catch (err) {
        addUserError.textContent = 'Failed to create user. Server error.';
        addUserError.style.display = 'block';
      }
    });
  }

  window.deleteUserManager = async function (id) {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    const query = `mutation DeleteUser($id: UUID!) { user_delete(id: $id) }`;
    try {
      const res = await fetch('/api/admin/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        },
        body: JSON.stringify({ query, variables: { id } })
      });
      const data = await res.json();
      if (data.errors || data.error) {
        alert('Failed to delete user: ' + (data.error || data.errors[0].message));
      } else {
        loadUsersManagerData(); // Refresh list
      }
    } catch (err) {
      alert('Error connecting to server.');
    }
  };

  // --- EDIT USER LOGIC ---
  const editUserModal = document.getElementById('edit-user-modal');
  const editUserForm = document.getElementById('edit-user-form');
  const cancelEditUserBtn = document.getElementById('cancel-edit-user-btn');
  const editUserError = document.getElementById('edit-user-error');

  const editPhotoInput = document.getElementById('edit-user-photo');
  const editPreviewContainer = document.getElementById('edit-photo-preview-container');
  const editPreviewImg = document.getElementById('edit-photo-preview-img');
  const editClearPhotoBtn = document.getElementById('edit-clear-photo-btn');

  if (editPhotoInput && editPreviewContainer && editClearPhotoBtn) {
    editPhotoInput.addEventListener('change', () => {
      if (editPhotoInput.files && editPhotoInput.files[0]) {
        editPreviewImg.src = URL.createObjectURL(editPhotoInput.files[0]);
        editPreviewContainer.style.display = 'flex';
      } else {
        editPreviewContainer.style.display = 'none';
        editPreviewImg.src = '';
      }
    });

    editClearPhotoBtn.addEventListener('click', () => {
      editPhotoInput.value = '';
      editPreviewContainer.style.display = 'none';
      editPreviewImg.src = '';
    });
  }

  window.editUserManager = function (id, name, email, role, photoUrl) {
    if (!editUserModal) return;
    editUserForm.reset();
    editUserError.style.display = 'none';

    document.getElementById('edit-user-id').value = id;
    document.getElementById('edit-user-name').value = name;
    document.getElementById('edit-user-email').value = email;
    document.getElementById('edit-user-role').value = role;

    if (photoUrl) {
      editPreviewImg.src = photoUrl;
      editPreviewContainer.style.display = 'flex';
      // We attach the original URL to the image so we know if it wasn't changed
      editPreviewImg.dataset.originalUrl = photoUrl;
    } else {
      editPreviewContainer.style.display = 'none';
      editPreviewImg.src = '';
      editPreviewImg.dataset.originalUrl = '';
    }

    editUserModal.showModal();
  };

  if (cancelEditUserBtn && editUserModal) {
    cancelEditUserBtn.addEventListener('click', () => {
      editUserModal.close();
    });
  }

  if (editUserForm) {
    editUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-user-id').value;
      const name = document.getElementById('edit-user-name').value.trim();
      const email = document.getElementById('edit-user-email').value.trim();
      const role = document.getElementById('edit-user-role').value;

      let photoUrl = editPreviewImg.dataset.originalUrl; // Keep existing if no new file

      // If a new photo is selected, upload it
      if (editPhotoInput && editPhotoInput.files && editPhotoInput.files[0]) {
        try {
          const file = editPhotoInput.files[0];
          const formData = new FormData();
          formData.append('photo', file);

          const progressContainer = document.getElementById('edit-upload-progress-container');
          const progressBar = document.getElementById('edit-upload-progress-bar');
          if (progressContainer) progressContainer.style.display = 'block';
          if (progressBar) progressBar.style.width = '50%';

          const uploadRes = await fetch('/api/admin/users/upload-photo', {
            method: 'POST',
            body: formData
          });

          if (progressBar) progressBar.style.width = '100%';

          if (!uploadRes.ok) {
            throw new Error('Upload failed');
          }

          const uploadData = await uploadRes.json();
          photoUrl = uploadData.photoUrl;

          setTimeout(() => { if (progressContainer) progressContainer.style.display = 'none'; }, 500);
        } catch (err) {
          console.error('Failed to upload photo:', err);
          editUserError.textContent = `Failed to upload new profile photo.`;
          editUserError.style.display = 'block';
          const progressContainer = document.getElementById('edit-upload-progress-container');
          if (progressContainer) progressContainer.style.display = 'none';
          return;
        }
      }

      editUserError.textContent = 'Saving changes...';
      editUserError.style.display = 'block';
      editUserError.style.color = '#2b58f9';

      const query = `mutation UpdateStaffUser($id: UUID!, $email: String!, $role: String!, $name: String!, $photoUrl: String) {
            user_update(id: $id, data: { email: $email, role: $role, displayName: $name, photoUrl: $photoUrl })
          }`;
      const variables = { id, email, role, name, photoUrl };

      try {
        const res = await fetch('/api/admin/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('userToken')}`
          },
          body: JSON.stringify({ query, variables })
        });
        const data = await res.json();
        if (data.errors || data.error) {
          editUserError.textContent = data.error || data.errors[0].message;
          editUserError.style.color = '#991b1b';
        } else {
          if (id === localStorage.getItem('userId')) {
            localStorage.setItem('userPhoto', photoUrl);
            if (window.updateTopbarProfilePic) window.updateTopbarProfilePic();
          }
          editUserModal.close();
          loadUsersManagerData(); // Refresh list
        }
      } catch (err) {
        editUserError.textContent = 'Failed to update user. Server error.';
        editUserError.style.color = '#991b1b';
      }
    });
  }


  window.loadUsersManagerData = async function () {
    if (!usersCardContainer) return;
    usersCardContainer.innerHTML = '<div style="color: #697386;">Loading staff members...</div>';
    try {
      const res = await fetch('/api/admin/database/User', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('userToken')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const users = await res.json();

      if (!users || users.length === 0) {
        usersCardContainer.innerHTML = '<div style="color: #697386;">No users found.</div>';
        return;
      }

      const editIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
      const trashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

      usersCardContainer.innerHTML = users.map(u => {
        const photo = u.photoUrl && u.photoUrl !== 'null' && u.photoUrl !== 'undefined' && u.photoUrl.trim() !== ''
          ? u.photoUrl
          : '/assets/images/default-photo.jpg';
        const avatarHtml = `<img src="${photo}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; margin-right: 12px; border: 1px solid #e3e8ee;" />`;
        return `
            <div class="user-card">
              <div class="user-card-header" style="align-items: center;">
                <div style="display: flex; align-items: center;">
                  ${avatarHtml}
                  <div>
                    <div style="font-weight: 600; font-size: 1.1rem; color: #1a1f36;">${u.displayName || 'Unknown Name'}</div>
                    <div class="user-role-badge" style="margin-top: 4px;">${(u.role || 'customer').replace('_', ' ').toUpperCase()}</div>
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button class="edit-user-btn" onclick="window.editUserManager('${u.id}', \`${(u.displayName || '').replace(/`/g, '')}\`, '${u.email}', '${u.role}', '${u.photoUrl || ''}')" title="Edit User" style="background: none; border: 1px solid #e3e8ee; cursor: pointer; color: #697386; padding: 6px; border-radius: 6px; transition: color 0.2s, background 0.2s;" onmouseover="this.style.background='#f4f5f7'; this.style.color='#2b58f9'" onmouseout="this.style.background='none'; this.style.color='#697386'">
                    ${editIcon}
                  </button>
                  <button class="delete-user-btn" onclick="window.deleteUserManager('${u.id}')" title="Delete User">
                    ${trashIcon}
                  </button>
                </div>
              </div>
              <div class="user-card-body" style="margin-top: 12px;">
                <div><span style="font-weight: 500;">Email:</span> ${u.email}</div>
                <div><span style="font-weight: 500;">ID:</span> <span style="font-family: monospace;">${u.id ? u.id.substring(0, 8) + '...' : 'N/A'}</span></div>
                <div><span style="font-weight: 500;">Joined:</span> ${new Date(u.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
            `;
      }).join('');
    } catch (err) {
      console.error(err);
      usersCardContainer.innerHTML = '<div style="color: #991b1b;">Error loading users.</div>';
    }
  };

  // --- Files Manager Logic ---
  const filesUploadForm = document.getElementById('files-upload-form');
  const filesUploadStatus = document.getElementById('files-upload-status');

  if (filesUploadForm && filesUploadStatus) {
    filesUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleInput = document.getElementById('files-doc-title');
      const categoryInput = document.getElementById('files-doc-category');
      const fileInput = document.getElementById('files-doc-file');

      if (!titleInput.value || !categoryInput.value || !fileInput.files[0]) {
        showFilesStatus('Please fill in all fields and select a file.', '#991b1b');
        return;
      }

      const formData = new FormData();
      formData.append('title', titleInput.value);
      formData.append('category', categoryInput.value);
      formData.append('file', fileInput.files[0]);

      showFilesStatus('Uploading to Firebase Storage...', '#2b58f9');

      try {
        const res = await fetch('/api/documents/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('userToken')}`
          },
          body: formData
        });

        const data = await res.json();

        if (res.ok) {
          showFilesStatus('File uploaded successfully!', '#10b981');
          filesUploadForm.reset();

          // Clear db cache
          sessionStorage.removeItem('db_cache_Document');

          // Reload files
          loadFilesManagerData();
        } else {
          showFilesStatus(data.error || data.detail || 'Upload failed.', '#991b1b');
        }
      } catch (error) {
        console.error('Upload error:', error);
        showFilesStatus('Network error occurred during upload.', '#991b1b');
      }
    });

    function showFilesStatus(text, color) {
      filesUploadStatus.textContent = text;
      filesUploadStatus.style.color = color;
      filesUploadStatus.style.display = 'block';
    }
  }

  window.loadFilesManagerData = async function () {
    const filesListBody = document.getElementById('files-list-body');
    if (!filesListBody) return;

    filesListBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: #697386;">Loading files...</td></tr>';

    try {
      const res = await fetch('/api/admin/database/Document', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('userToken')}` }
      });
      if (!res.ok) throw new Error('Failed to fetch files');

      const files = await res.json();

      if (files.length === 0) {
        filesListBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: #697386;">No files stored in the cloud.</td></tr>';
        return;
      }

      filesListBody.innerHTML = files.map(file => {
        const dateStr = file.createdAt ? new Date(file.createdAt).toLocaleDateString() : 'N/A';
        const uploadedByStr = file.uploadedBy && file.uploadedBy.displayName ? file.uploadedBy.displayName : 'N/A';

        const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        const deleteIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        const previewIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

        return `
              <tr>
                <td style="font-weight: 500;">${file.title}</td>
                <td><span class="status-pill ${getCategoryClass(file.category)}">${file.category}</span></td>
                <td style="color: #4f566b;" title="${file.uploadedBy && file.uploadedBy.id ? file.uploadedBy.id : 'N/A'}">${uploadedByStr}</td>
                <td>${dateStr}</td>
                <td style="text-align: right; padding-right: 24px;">
                  <div style="display: inline-flex; gap: 8px; justify-content: flex-end;">
                    <button onclick="window.previewFile('${file.id}', \`${file.title.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, '${file.fileUrl}', '${file.extension || ''}')" class="btn-outline" style="padding: 6px 10px; display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; cursor: pointer;" title="Preview File">
                      ${previewIcon} Preview
                    </button>
                    <a href="${file.fileUrl}?download=true" download target="_blank" class="btn-outline" style="padding: 6px 10px; display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; text-decoration: none;" title="Download File">
                      ${downloadIcon} Download
                    </a>
                    <button class="delete-user-btn" onclick="window.deleteFile('${file.id}')" title="Delete File">
                      ${deleteIcon}
                    </button>
                  </div>
                </td>
              </tr>
            `;
      }).join('');
    } catch (error) {
      console.error('Error listing files:', error);
      filesListBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color: #991b1b;">Error loading files.</td></tr>';
    }
  };

  window.deleteFile = async function (id) {
    if (!confirm('Are you sure you want to delete this file? This will remove it from database and storage permanently.')) return;

    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('userToken')}`
        }
      });

      if (res.ok) {
        alert('File deleted successfully.');
        // Clear db cache
        sessionStorage.removeItem('db_cache_Document');
        // Refresh list
        loadFilesManagerData();
      } else {
        const data = await res.json();
        alert('Failed to delete file: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error(err);
      alert('Network error deleting file.');
    }
  };

  window.previewFile = function (id, title, fileUrl, extension) {
    const previewModal = document.getElementById('file-preview-modal');
    const previewTitle = document.getElementById('preview-modal-title');
    const previewBody = document.getElementById('preview-modal-body');
    if (!previewModal || !previewTitle || !previewBody) return;

    previewTitle.textContent = `Preview: ${title}`;
    previewBody.innerHTML = '<div style="color: #697386; font-family: inherit;">Loading preview...</div>';

    const ext = (extension || '').toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
    const isPDF = ext === 'pdf';

    if (isImage) {
      previewBody.innerHTML = `<img src="${fileUrl}" style="max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" />`;
    } else if (isPDF) {
      previewBody.innerHTML = `<iframe src="${fileUrl}" style="width: 100%; height: 100%; border: 1px solid #e3e8ee; border-radius: 6px;"></iframe>`;
    } else {
      previewBody.innerHTML = `
            <div style="text-align: center; padding: 32px; color: #4f566b; font-family: inherit;">
              <div style="font-size: 3rem; margin-bottom: 16px;">&#x1F4C4;</div>
              <p style="font-weight: 600; margin: 0 0 8px 0; font-size: 1.1rem; color: #1a1f36;">Preview not supported for this file type.</p>
              <p style="font-size: 0.85rem; color: #697386; margin-bottom: 20px;">Supported formats for preview are Images (PNG, JPG, JPEG) and PDFs.</p>
              <a href="${fileUrl}" download class="btn-outline" style="text-decoration: none; padding: 10px 20px; font-weight: 600; display: inline-block;">Download File to View</a>
            </div>
          `;
    }

    // Display dialog
    previewModal.style.display = 'flex';
    previewModal.showModal();
  };

  // Preview Modal close listeners
  const previewModal = document.getElementById('file-preview-modal');
  const closePreviewBtn = document.getElementById('close-preview-btn');
  if (previewModal && closePreviewBtn) {
    const closeHandler = () => {
      const previewBody = document.getElementById('preview-modal-body');
      if (previewBody) previewBody.innerHTML = '';
      previewModal.style.display = 'none';
      previewModal.close();
    };

    closePreviewBtn.addEventListener('click', closeHandler);
    previewModal.addEventListener('click', (e) => {
      if (e.target === previewModal) {
        closeHandler();
      }
    });
  }

  function getCategoryClass(cat) {
    if (cat === 'Governance') return 'status-warning';
    if (cat === 'E-Commerce') return 'status-success';
    return 'status-warning';
  }
})();

// ================================================================
// POLLS MANAGER MODULE — SCRUM-192
// ================================================================
(function () {
  const userToken = localStorage.getItem('userToken');
  const userRole = localStorage.getItem('userRole') || 'customer';
  let currentPolls = [];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function coerceVoteCounts(voteCounts) {
    return Array.isArray(voteCounts)
      ? voteCounts.map(vote => ({
        option: String(vote.option || ''),
        count: Number(vote.count || 0)
      }))
      : [];
  }

  // ---- DOM Elements ----
  const pollsList = document.getElementById('polls-list');
  const pollsLoading = document.getElementById('polls-loading');
  const pollsEmpty = document.getElementById('polls-empty');
  const createPollPanel = document.getElementById('create-poll-panel');
  const createPollForm = document.getElementById('create-poll-form');
  const createPollStatus = document.getElementById('create-poll-status');
  const pollsStatusBadge = document.getElementById('polls-status-badge');
  const pollsRefreshBtn = document.getElementById('polls-refresh-btn');
  const addOptionBtn = document.getElementById('add-poll-option-btn');
  const optionsContainer = document.getElementById('poll-options-container');

  // ---- Access Control: hide create form for non-admins ----
  if (createPollPanel && userRole !== 'admin') {
    createPollPanel.classList.add('non-admin-create-hide');
  }

  // ---- Toast helper ----
  function showPollToast(title, message, isError = false) {
    const existing = document.querySelector('.poll-vote-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'poll-vote-toast' + (isError ? ' error' : '');
    toast.innerHTML = `<div class="poll-vote-toast-title">${title}</div><div class="poll-vote-toast-msg">${message}</div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // ---- Build result bars HTML ----
  function buildResultBars(poll) {
    const options = Array.isArray(poll.options) ? poll.options : [];
    const voteCounts = coerceVoteCounts(poll.voteCounts);
    const userVote = poll.userVote;
    const totalVotes = voteCounts.reduce((s, v) => s + (v.count || 0), 0);
    const maxCount = voteCounts.reduce((m, v) => Math.max(m, v.count || 0), 0);

    return options.map((option) => {
      const match = voteCounts.find(v => v.option === option);
      const count = match ? (match.count || 0) : 0;
      const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
      const isTop = count > 0 && count === maxCount;
      const isUserVote = userVote === option;
      const escapedOption = escapeHtml(option);
      const encodedOption = encodeURIComponent(option);

      // If user hasn't voted, show vote buttons
      if (!userVote && poll.status === 'open') {
        return `
          <button class="vote-option-btn" data-poll-id="${escapeHtml(poll.id)}" data-option="${encodedOption}" title="Vote for ${escapedOption}">
            ${escapedOption}
          </button>
        `;
      }

      // After voting or poll closed — show result bars
      return `
        <div class="poll-result-row">
          <div class="poll-result-label">
            <span class="result-option-name${isUserVote ? '" style="color:#2b58f9;font-weight:700;' : ''}">${escapedOption}${isUserVote ? ' ✓' : ''}</span>
            <span class="poll-result-count">${count} <span class="poll-result-percentage">${pct}%</span></span>
          </div>
          <div class="poll-bar-bg">
            <div class="poll-bar-fill${isTop ? ' top-option' : ''}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ---- Render a single poll card ----
  function renderPollCard(poll) {
    const { id, title, description, status, createdAt, closesAt, userVote } = poll;
    const voteCounts = coerceVoteCounts(poll.voteCounts);
    const totalVotes = voteCounts.reduce((s, v) => s + (v.count || 0), 0);
    const hasVoted = !!userVote;
    const isClosed = status !== 'open';
    const closesLabel = closesAt ? new Date(closesAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No deadline';
    const createdLabel = createdAt ? new Date(createdAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

    const card = document.createElement('div');
    card.className = 'poll-card';
    card.id = `poll-card-${id}`;

    const adminActions = userRole === 'admin' && status === 'open'
      ? `<button class="poll-close-btn" data-poll-id="${escapeHtml(id)}">Close Poll</button>`
      : '';

    card.innerHTML = `
      <div class="poll-card-header">
        <div style="flex:1;min-width:0;">
          <h3 class="poll-card-title">${escapeHtml(title)}</h3>
          ${description ? `<p class="poll-card-description">${escapeHtml(description)}</p>` : ''}
        </div>
        <span class="poll-status-badge poll-status-${escapeHtml(status)}">${escapeHtml(status.charAt(0).toUpperCase() + status.slice(1))}</span>
      </div>
      <div class="poll-card-body">
        ${hasVoted || isClosed
          ? `<div class="poll-results">${buildResultBars(poll)}</div>`
          : `<div class="poll-options-grid">${buildResultBars(poll)}</div><div class="poll-divider"></div><div class="poll-results"></div>`
        }
      </div>
      <div class="poll-card-footer">
        <div>
          <span class="poll-total-votes">🗳️ ${totalVotes} vote${totalVotes !== 1 ? 's' : ''}</span>
          <span class="poll-meta" style="margin-left:12px;">Closes: ${closesLabel}</span>
          ${createdLabel ? `<span class="poll-meta" style="margin-left:12px;">Created: ${createdLabel}</span>` : ''}
        </div>
        ${adminActions}
      </div>
    `;

    return card;
  }

  // ---- Render all polls ----
  function renderPolls(polls) {
    if (!pollsList) return;
    pollsList.innerHTML = '';

    if (polls.length === 0) {
      if (pollsLoading) pollsLoading.style.display = 'none';
      if (pollsEmpty) pollsEmpty.style.display = 'block';
      return;
    }

    if (pollsLoading) pollsLoading.style.display = 'none';
    if (pollsEmpty) pollsEmpty.style.display = 'none';

    polls.forEach(poll => {
      const card = renderPollCard(poll);
      pollsList.appendChild(card);
    });

    // Update status badge
    if (pollsStatusBadge) {
      pollsStatusBadge.textContent = `${polls.length} active poll${polls.length !== 1 ? 's' : ''}`;
    }

    // Attach vote button handlers
    pollsList.querySelectorAll('.vote-option-btn').forEach(btn => {
      btn.addEventListener('click', () => submitVote(btn.dataset.pollId, decodeURIComponent(btn.dataset.option)));
    });

    // Attach close poll handlers (admin only)
    pollsList.querySelectorAll('.poll-close-btn').forEach(btn => {
      btn.addEventListener('click', () => closePoll(btn.dataset.pollId));
    });
  }

  // ---- Fetch active polls ----
  async function loadPolls() {
    if (!pollsList) return;
    if (pollsLoading) pollsLoading.style.display = 'block';
    if (pollsEmpty) pollsEmpty.style.display = 'none';
    pollsList.innerHTML = '';

    try {
      const res = await fetch('/api/polls/active', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        credentials: 'include'
      });

      if (res.status === 403) {
        if (pollsLoading) pollsLoading.innerHTML = '⛔ Access denied. This section is for internal staff only.';
        return;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      currentPolls = await res.json();
      renderPolls(currentPolls);
    } catch (err) {
      console.error('[Polls] Failed to load polls:', err);
      if (pollsLoading) pollsLoading.textContent = 'Failed to load polls. Please refresh.';
    }
  }

  // Expose globally for sidebar button access
  window.loadPolls = loadPolls;

  // ---- Submit a vote ----
  async function submitVote(pollId, selectedOption) {
    try {
      const res = await fetch(`/api/polls/${pollId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        credentials: 'include',
        body: JSON.stringify({ selectedOption })
      });

      const data = await res.json();

      if (res.status === 201) {
        showPollToast('✅ Vote Recorded!', `You voted for "${selectedOption}"`);
        // Refresh polls to show updated counts
        await loadPolls();
      } else if (res.status === 409) {
        // SCRUM-194: Duplicate vote
        if (data.code === 'DUPLICATE_VOTE') {
          showPollToast('⚠️ Already Voted', 'You have already submitted a vote on this poll.', true);
        } else {
          showPollToast('⚠️ Poll Closed', data.error || 'This poll is no longer accepting votes.', true);
        }
      } else {
        showPollToast('❌ Error', data.error || 'Failed to submit vote.', true);
      }
    } catch (err) {
      console.error('[Polls] Vote submission failed:', err);
      showPollToast('❌ Network Error', 'Failed to reach the server. Please try again.', true);
    }
  }

  // ---- Close a poll (admin only) ----
  async function closePoll(pollId) {
    if (!confirm('Are you sure you want to close this poll? No more votes will be accepted.')) return;
    try {
      const res = await fetch(`/api/polls/${pollId}/close`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${userToken}` },
        credentials: 'include'
      });
      if (res.ok) {
        showPollToast('✅ Poll Closed', 'The poll has been closed successfully.');
        await loadPolls();
      } else {
        const data = await res.json();
        showPollToast('❌ Error', data.error || 'Failed to close poll.', true);
      }
    } catch (err) {
      console.error('[Polls] Failed to close poll:', err);
      showPollToast('❌ Network Error', 'Could not close the poll. Please try again.', true);
    }
  }

  // ---- Refresh button ----
  if (pollsRefreshBtn) {
    pollsRefreshBtn.addEventListener('click', loadPolls);
  }

  // ---- Dynamic option add/remove ----
  if (addOptionBtn && optionsContainer) {
    addOptionBtn.addEventListener('click', () => {
      const rows = optionsContainer.querySelectorAll('.poll-option-row');
      const optionLetter = String.fromCharCode(65 + rows.length); // A, B, C...
      const row = document.createElement('div');
      row.className = 'poll-option-row';
      row.style.cssText = 'display: flex; gap: 8px; align-items: center;';
      row.innerHTML = `
        <input type="text" class="poll-option-input" required placeholder="Option ${optionLetter}"
          style="flex: 1; padding: 8px 10px; border: 1px solid #e3e8ee; border-radius: 8px; outline: none; font-size: 0.85rem; font-family: inherit;" />
        <button type="button" class="remove-option-btn"
          style="background: none; border: 1px solid #e3e8ee; width: 30px; height: 30px; border-radius: 6px; cursor: pointer; color: #697386; font-size: 1rem; flex-shrink: 0;">×</button>
      `;
      row.querySelector('.remove-option-btn').addEventListener('click', () => {
        const remaining = optionsContainer.querySelectorAll('.poll-option-row');
        if (remaining.length > 2) {
          row.remove();
        }
      });
      optionsContainer.appendChild(row);
    });
  }

  // ---- Create Poll form submission ----
  if (createPollForm && userRole === 'admin') {
    createPollForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('poll-title').value.trim();
      const description = document.getElementById('poll-description').value.trim();
      const closesAt = document.getElementById('poll-closes-at').value;
      const optionInputs = optionsContainer.querySelectorAll('.poll-option-input');
      const options = Array.from(optionInputs).map(i => i.value.trim()).filter(Boolean);

      if (!title) {
        showPollStatus('Poll title is required.', '#991b1b');
        return;
      }
      if (options.length < 2) {
        showPollStatus('At least 2 options are required.', '#991b1b');
        return;
      }

      showPollStatus('Creating poll...', '#2b58f9');

      try {
        const res = await fetch('/api/polls', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
          },
          credentials: 'include',
          body: JSON.stringify({ title, description, options, closesAt: closesAt || undefined })
        });

        const data = await res.json();

        if (res.status === 201) {
          showPollStatus('✅ Poll created successfully!', '#10b981');
          createPollForm.reset();
          // Reset options to 2 default rows
          const defaultRows = optionsContainer.querySelectorAll('.poll-option-row');
          defaultRows.forEach((row, idx) => { if (idx >= 2) row.remove(); });
          // Reload polls list
          await loadPolls();
          showPollToast('🗳️ Poll Created!', `"${title}" is now live and accepting votes.`);
          setTimeout(() => {
            if (createPollStatus) createPollStatus.style.display = 'none';
          }, 3000);
        } else {
          showPollStatus(data.error || 'Failed to create poll.', '#991b1b');
        }
      } catch (err) {
        console.error('[Polls] Failed to create poll:', err);
        showPollStatus('Network error. Please try again.', '#991b1b');
      }
    });

    function showPollStatus(text, color) {
      if (!createPollStatus) return;
      createPollStatus.textContent = text;
      createPollStatus.style.color = color;
      createPollStatus.style.display = 'block';
    }
  }

  // --- Notifications Manager Logic ---
  const sendNotifBtn = document.getElementById('sendNotifBtn');
  const notifType = document.getElementById('notifType');
  const notifMessage = document.getElementById('notifMessage');
  const notifStatus = document.getElementById('notifStatus');

  if (sendNotifBtn) {
    sendNotifBtn.addEventListener('click', async () => {
      // Get selected roles
      const roleCheckboxes = document.querySelectorAll('.notif-role-checkbox:checked');
      const roles = Array.from(roleCheckboxes).map(cb => cb.value);

      if (roles.length === 0) {
        showNotifStatus('Please select at least one target role.', '#991b1b');
        return;
      }

      const message = notifMessage.value.trim();
      if (!message) {
        showNotifStatus('Please enter a message to broadcast.', '#991b1b');
        return;
      }

      sendNotifBtn.disabled = true;
      sendNotifBtn.style.opacity = '0.7';
      showNotifStatus('Sending broadcast...', '#2b58f9');

      try {
        const userToken = localStorage.getItem('userToken');
        const res = await fetch('/api/notifications/broadcast', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userToken}`
          },
          body: JSON.stringify({
            roles,
            type: notifType.value,
            message
          })
        });

        const data = await res.json();

        if (res.ok && data.success) {
          showNotifStatus(`✅ Broadcast sent to ${data.sent} users.`, '#10b981');
          notifMessage.value = '';
          setTimeout(() => {
            if (notifStatus) notifStatus.style.opacity = '0';
          }, 3000);
        } else {
          showNotifStatus(data.error || 'Failed to send broadcast.', '#991b1b');
        }
      } catch (error) {
        console.error('Broadcast error:', error);
        showNotifStatus('Network error occurred.', '#991b1b');
      } finally {
        sendNotifBtn.disabled = false;
        sendNotifBtn.style.opacity = '1';
      }
    });

    function showNotifStatus(text, color) {
      if (!notifStatus) return;
      notifStatus.textContent = text;
      notifStatus.style.color = color;
      notifStatus.style.opacity = '1';
    }
  }

})();
