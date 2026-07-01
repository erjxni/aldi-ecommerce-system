(function () {
  const bellBtn = document.getElementById('bell-btn');
  const notifBadge = document.getElementById('notif-badge');
  const notifDropdown = document.getElementById('notif-dropdown');
  const notifBell = document.getElementById('notification-bell');

  if (!bellBtn || !notifDropdown) return;

  let notifications = [];
  let socket = null;

  // Toggle dropdown on bell click
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle('open');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    notifDropdown.classList.remove('open');
  });

  // Render notifications in dropdown
  function renderNotifications() {
    const unread = notifications.filter(n => !n.isRead).length;
    notifBadge.textContent = unread;
    notifBadge.style.display = unread > 0 ? 'flex' : 'none';

    if (notifications.length === 0) {
      notifDropdown.innerHTML = '';
      notifDropdown.classList.remove('open');
      return;
    }

    notifDropdown.innerHTML = notifications.map(n => `
      <div class="notif-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}">
        <div>${n.message}</div>
        <div style="font-size:0.75rem; color:#888; margin-top:4px;">${new Date(n.createdAt).toLocaleString()}</div>
      </div>
    `).join('');

    // Mark as read on click
    notifDropdown.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        markAsRead(id);
      });
    });
  }

  // Mark notification as read
  async function markAsRead(id) {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      const notif = notifications.find(n => n.id === id);
      if (notif) notif.isRead = true;
      renderNotifications();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  }

  // Fetch existing notifications from API
  async function fetchNotifications() {
    try {
      const token = localStorage.getItem('userToken') || '';
      const res = await fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        notifications = await res.json();
        renderNotifications();
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    }
  }

  // Connect to WebSocket for real-time notifications
  function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${wsProtocol}//${window.location.host}`);

    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_notification') {
          notifications.unshift(data.notification);
          renderNotifications();
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    });

    socket.addEventListener('error', (err) => {
      console.error('WebSocket error:', err);
    });
  }

  // Show bell only when logged in
  const token = localStorage.getItem('userToken');
  if (token && notifBell) {
    notifBell.style.display = 'inline-block';
    fetchNotifications();
    connectWebSocket();
  }
})();
