// Login + register pages.
'use strict';

(function () {
  const form = document.querySelector('form');
  const err = document.getElementById('authErr');
  if (!form) return;
  const isRegister = form.id === 'registerForm';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) { err.textContent = 'Fill both fields.'; return; }
    if (isRegister && password.length < 8) { err.textContent = 'Password needs at least 8 characters.'; return; }
    try {
      const res = await RR_AUTH.api(isRegister ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      const data = await RR_AUTH.parse(res);
      if (res.status === 200 && data.token) {
        RR_AUTH.set(data.token);
        window.location.href = '/';
      } else {
        err.textContent = data.error || 'Something went wrong. Try again.';
      }
    } catch {
      err.textContent = 'Network error. Try again.';
    }
  });
})();
