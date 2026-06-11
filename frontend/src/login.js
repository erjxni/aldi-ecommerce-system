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

    const email = document.getElementById('email').value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validation: Passwords must match
    if (password !== confirmPassword) {
      passwordError.textContent = 'Passwords do not match. Please try again.';
      confirmPasswordInput.focus();
      return;
    }

    // Optional: Add further password strength validation here if needed

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
        throw new Error(errorData.detail || 'Registration failed');
      }
      return response.json();
    })
    .then((data) => {
      // Show success message
      successMessage.classList.remove('hidden');
      form.reset();
      
      // Simulate redirecting to a login view or clearing the form
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
});
