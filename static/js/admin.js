    (function() {
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

      // --- Logout Button ---
      const logoutBtn = document.getElementById('logout-btn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userToken');
          localStorage.removeItem('userRole');
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

    (function() {
      // --- View Toggling ---
      const dbBtn = document.getElementById('btn-db-viewer');
      const homeBtn = document.getElementById('btn-home-dashboard');
      const usersBtn = document.getElementById('btn-users-manager');
      const docBtn = document.getElementById('btn-document-manager');
      const dashboardView = document.getElementById('dashboard-view');
      const dbViewer = document.getElementById('database-viewer');
      const usersViewer = document.getElementById('users-manager-view');

      if (dbBtn && homeBtn && usersBtn && dashboardView && dbViewer && usersViewer) {
        dbBtn.addEventListener('click', (e) => {
          e.preventDefault();
          dashboardView.style.display = 'none';
          usersViewer.style.display = 'none';
          dbViewer.style.display = 'flex';
          
          document.querySelectorAll('.admin-sidebar .sidebar-icon').forEach(i => i.classList.remove('active'));
          dbBtn.classList.add('active');

          // Load default tab
          const activeTab = document.querySelector('.db-tab.active');
          if (activeTab) loadTableData(activeTab.dataset.table);
        });

        homeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          dbViewer.style.display = 'none';
          usersViewer.style.display = 'none';
          dashboardView.style.display = 'block';

          document.querySelectorAll('.admin-sidebar .sidebar-icon').forEach(i => i.classList.remove('active'));
          homeBtn.classList.add('active');
        });

        usersBtn.addEventListener('click', (e) => {
          e.preventDefault();
          dashboardView.style.display = 'none';
          dbViewer.style.display = 'none';
          usersViewer.style.display = 'flex';

          document.querySelectorAll('.admin-sidebar .sidebar-icon').forEach(i => i.classList.remove('active'));
          usersBtn.classList.add('active');
          
          loadUsersManagerData();
        });

        if (docBtn) {
          docBtn.addEventListener('click', (e) => {
            e.preventDefault();
            dashboardView.style.display = 'none';
            usersViewer.style.display = 'none';
            dbViewer.style.display = 'flex';
            
            document.querySelectorAll('.admin-sidebar .sidebar-icon').forEach(i => i.classList.remove('active'));
            docBtn.classList.add('active');

            const docTab = document.querySelector('.db-tab[data-table="Document"]');
            if (docTab) {
              docTab.click();
            }
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
          'customer': 'User'
        };
        return map[col.toLowerCase()] || col;
      }

      window.copyToClipboard = function(text, el) {
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
            
            if ((col.toLowerCase() === 'fileurl' || col.toLowerCase() === 'file_url') && val) {
              const urlVal = val;
              val = `<a href="${urlVal}" target="_blank" class="btn-outline" style="padding: 4px 10px; font-size: 0.8rem; border: 1px solid #10b981; color: white; background: #10b981; cursor: pointer; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: 500; transition: opacity 0.2s;">&#128190; Download</a>`;
            } else if (typeof val === 'object' && val !== null) {
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
          addUserModal.showModal();
        });
        cancelAddUserBtn.addEventListener('click', () => {
          addUserModal.close();
        });
        
        addUserForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const name = document.getElementById('new-user-name').value.trim();
          const email = document.getElementById('new-user-email').value.trim();
          const password = document.getElementById('new-user-password').value;
          const role = document.getElementById('new-user-role').value;

          const query = `mutation AddStaffUser($email: String!, $password: String!, $role: String!, $name: String!) {
            user_insert(data: { email: $email, passwordHash: $password, role: $role, displayName: $name })
          }`;
          
          try {
            const res = await fetch('/api/admin/query', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
              },
              body: JSON.stringify({ query, variables: { email, password, role, name } })
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

      window.deleteUserManager = async function(id) {
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

      window.loadUsersManagerData = async function() {
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

          const trashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
          
          usersCardContainer.innerHTML = users.map(u => `
            <div class="user-card">
              <div class="user-card-header">
                <div>
                  <div style="font-weight: 600; font-size: 1.1rem; color: #1a1f36;">${u.displayName || 'Unknown Name'}</div>
                  <div class="user-role-badge" style="margin-top: 4px;">${(u.role || 'customer').replace('_', ' ').toUpperCase()}</div>
                </div>
                <button class="delete-user-btn" onclick="window.deleteUserManager('${u.id}')" title="Delete User">
                  ${trashIcon}
                </button>
              </div>
              <div class="user-card-body" style="margin-top: 12px;">
                <div><span style="font-weight: 500;">Email:</span> ${u.email}</div>
                <div><span style="font-weight: 500;">ID:</span> <span style="font-family: monospace;">${u.id ? u.id.substring(0, 8) + '...' : 'N/A'}</span></div>
                <div><span style="font-weight: 500;">Joined:</span> ${new Date(u.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
          `).join('');
        } catch (err) {
          console.error(err);
          usersCardContainer.innerHTML = '<div style="color: #991b1b;">Error loading users.</div>';
        }
      };
    })();