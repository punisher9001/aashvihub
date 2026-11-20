// ------------------- Helper -------------------
function showMessage(text, isError = false) {
  const msgDiv = document.getElementById('message');
  msgDiv.textContent = text;
  msgDiv.style.color = isError ? 'red' : 'green';
}

// ------------------- Login -------------------
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
      showMessage('Login successful! Redirecting...');
      // Simple redirect – आप चाहें तो dashboard जोड़ सकते हैं
      setTimeout(() => window.location.href = '/admin/dashboard.html', 1500);
    } else {
      showMessage(data.error || 'Login failed', true);
    }
  } catch (err) {
    showMessage('Server error', true);
  }
});

// ------------------- Signup -------------------
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;

  try {
    const res = await fetch('/api/admin/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (res.ok) {
      showMessage('Signup successful! You can now login.');
    } else {
      showMessage(data.error || 'Signup failed', true);
    }
  } catch (err) {
    showMessage('Server error', true);
  }
});
