document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registration-form');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const passwordError = document.getElementById('password-error');
  const successMessage = document.getElementById('success-message');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    // Reset messages
    passwordError.textContent = '';
    successMessage.classList.add('hidden');

    const email = document.getElementById('email').value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // 1. Client-side validation: Required fields check
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

    // 2. Client-side validation: Passwords must match
    if (password !== confirmPassword) {
      passwordError.textContent = 'Passwords do not match. Please try again.';
      confirmPasswordInput.focus();
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    fetch('http://127.0.0.1:8000/api/register', {
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
            // Format FastAPI validation errors (e.g. invalid email format)
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
      form.reset();
      
      // Reset toggled password fields back to password type for security
      passwordInput.type = 'password';
      confirmPasswordInput.type = 'password';
      document.querySelectorAll('.toggle-password').forEach(btn => btn.textContent = 'Show');
      
      submitBtn.textContent = 'Register Account';
      submitBtn.disabled = false;
    })
    .catch((error) => {
      passwordError.textContent = error.message;
      submitBtn.textContent = 'Register Account';
      submitBtn.disabled = false;
    });

  });

  // Clear error when user types in the confirm password field
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
