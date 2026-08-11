// Sdílená logika přihlášení - stejný backend, stejný localStorage klíč jako produkce.
// Funkčně 1:1 s open3-novy, jen bez jQuery.

const API_BASE = 'https://ooo-functions-hjajhxe2b4aqgqc5.westeurope-01.azurewebsites.net';
const DISCORD_AUTH_URL =
  "https://discord.com/oauth2/authorize?client_id=1452709238601154580&response_type=code&" +
  "redirect_uri=https%3A%2F%2Fooo-functions-hjajhxe2b4aqgqc5.westeurope-01.azurewebsites.net%2Fapi%2Flogin-callback&" +
  "scope=identify%20guilds.members.read";

function getLoggedUser() {
  const raw = localStorage.getItem('oooUser');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function initAuthUI() {
  const userInfo = document.getElementById('user-info');
  const userName = document.getElementById('user-name');
  const userAvatar = document.getElementById('user-avatar');
  const loginBtn = document.getElementById('login-button');
  if (!loginBtn) return;

  function setLoggedIn(user) {
    userName.textContent = user.userName;
    userAvatar.src = user.avatarUrl;
    userInfo.style.display = 'flex';
    loginBtn.textContent = '';
    const uname = document.createElement('span');
    uname.className = 'btn-uname';
    uname.textContent = user.userName;
    const label = document.createElement('span');
    label.className = 'btn-logout-text';
    label.textContent = 'Odhlásit';
    loginBtn.appendChild(uname);
    loginBtn.appendChild(label);
    loginBtn.dataset.mode = 'logout';
  }

  function setLoggedOut() {
    userInfo.style.display = 'none';
    loginBtn.textContent = 'Přihlásit';
    loginBtn.dataset.mode = 'login';
    localStorage.removeItem('oooUser');
  }

  const stored = getLoggedUser();
  if (stored && stored.userId) setLoggedIn(stored); else setLoggedOut();

  window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || data.type !== 'ooo-discord-login') return;
    localStorage.setItem('oooUser', JSON.stringify(data.user));
    setLoggedIn(data.user);
    if (typeof window.onOooLogin === 'function') window.onOooLogin(data.user);
  });

  loginBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (loginBtn.dataset.mode === 'logout') {
      setLoggedOut();
      if (typeof window.onOooLogout === 'function') window.onOooLogout();
      return;
    }
    window.open(DISCORD_AUTH_URL, 'discordLogin', 'width=500,height=700');
  });

  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }
}

document.addEventListener('DOMContentLoaded', initAuthUI);
