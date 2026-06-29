document.addEventListener('DOMContentLoaded', () => {
  // Views
  const loginView = document.getElementById('login-view');
  const registerView = document.getElementById('register-view');
  const goToRegister = document.getElementById('go-to-register');
  const goToLogin = document.getElementById('go-to-login');

  // Forms and message elements
  const loginForm = document.getElementById('login-form');
  const registrationForm = document.getElementById('registration-form');
  
  const loginError = document.getElementById('login-error');
  const passwordError = document.getElementById('password-error');
  const successMessage = document.getElementById('success-message');

  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm-password');

  // --- Toggle Views ---
  goToRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginView.classList.add('hidden');
    registerView.classList.remove('hidden');
    resetForms();
  });

  goToLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerView.classList.add('hidden');
    loginView.classList.remove('hidden');
    resetForms();
  });

  function resetForms() {
    loginForm.reset();
    registrationForm.reset();
    loginError.textContent = '';
    passwordError.textContent = '';
    successMessage.classList.add('hidden');
    
    // Reset passwords back to password input type
    document.querySelectorAll('.password-wrapper input').forEach(input => {
      input.type = 'password';
    });
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.textContent = 'Show';
    });
  }

  // --- Login Submission ---
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = '';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      loginError.textContent = 'Please fill out all fields.';
      return;
    }

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = 'Login failed';
        if (errorData && errorData.detail) {
          errorMessage = errorData.detail;
        }
        throw new Error(errorMessage);
      }
      return response.json();
    })
    .then((data) => {
      // Store session data in localStorage
      localStorage.setItem('userId', data.id);
      localStorage.setItem('userEmail', data.email);
      localStorage.setItem('userToken', data.token);
      localStorage.setItem('userRole', data.role || 'customer');
      localStorage.setItem('userPhoto', data.photoUrl || '');

      // Role-based redirection: staff → admin, customers → storefront
      const staffRoles = ['admin', 'financial_officer', 'employee'];
      if (staffRoles.includes(data.role)) {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/index.html';
      }
    })
    .catch((error) => {
      loginError.textContent = error.message;
      submitBtn.textContent = 'Log In';
      submitBtn.disabled = false;
    });
  });

  // --- Registration Submission ---
  registrationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    passwordError.textContent = '';
    successMessage.classList.add('hidden');

    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Client-side validations
    if (!email) {
      passwordError.textContent = 'Email address is required.';
      document.getElementById('email').focus();
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      passwordError.textContent = 'Please enter a valid email format.';
      document.getElementById('email').focus();
      return;
    }
    if (!password) {
      passwordError.textContent = 'Password is required.';
      passwordInput.focus();
      return;
    }
    if (!confirmPassword) {
      passwordError.textContent = 'Confirm password is required.';
      confirmPasswordInput.focus();
      return;
    }
    if (password !== confirmPassword) {
      passwordError.textContent = 'Passwords do not match. Please try again.';
      confirmPasswordInput.focus();
      return;
    }

    const submitBtn = registrationForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        password: password,
        confirm_password: confirmPassword
      })
    })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = 'Registration failed';
        if (errorData && errorData.detail) {
          if (Array.isArray(errorData.detail)) {
            errorMessage = errorData.detail.map(err => err.msg).join(', ');
          } else {
            errorMessage = errorData.detail;
          }
        }
        throw new Error(errorMessage);
      }
      return response.json();
    })
    .then((data) => {
      // Show success message
      successMessage.classList.remove('hidden');
      registrationForm.reset();
      
      // Reset toggled password fields
      passwordInput.type = 'password';
      confirmPasswordInput.type = 'password';
      document.querySelectorAll('.password-wrapper button').forEach(btn => btn.textContent = 'Show');
      
      submitBtn.textContent = 'Register Account';
      submitBtn.disabled = false;
    })
    .catch((error) => {
      passwordError.textContent = error.message;
      submitBtn.textContent = 'Register Account';
      submitBtn.disabled = false;
    });
  });

  // Clear errors on input
  confirmPasswordInput.addEventListener('input', () => {
    if (passwordError.textContent) {
      passwordError.textContent = '';
    }
  });

  // Password Visibility Toggle
  const toggleButtons = document.querySelectorAll('.toggle-password');
  toggleButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetId = button.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        button.textContent = 'Hide';
      } else {
        input.type = 'password';
        button.textContent = 'Show';
      }
    });
  });
});
