// Sdílená logika přihlášení - stejný backend, stejný localStorage klíč jako produkce.
// Funkčně 1:1 s open3-novy, jen bez jQuery.

const API_BASE = 'https://ooo-functions-hjajhxe2b4aqgqc5.westeurope-01.azurewebsites.net';
const DISCORD_AUTH_URL =
  "https://discord.com/oauth2/authorize?client_id=1452709238601154580&response_type=code&" +
  "redirect_uri=https%3A%2F%2Fooo-functions-hjajhxe2b4aqgqc5.westeurope-01.azurewebsites.net%2Fapi%2Flogin-callback&" +
  "scope=identify%20guilds.members.read";

const GOOGLE_CLIENT_ID = '16887022098-fp2i853o893838s0390v763j8m1davj4.apps.googleusercontent.com';
const GOOGLE_VERIFY_URL = API_BASE + '/api/verify-google';

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

  // Avatar + mini menu místo přímého tlačítka "Odhlásit" (2026-08-25, plán sekce 7c,
  // nápad 2026-08-23) - klik na avatar rozbalí menu "Profil"/"Odhlásit" místo dřívějšího
  // rovnou-odhlásit. Menu se staví jednou dynamicky (žádná statická značka na stránkách
  // není potřeba měnit) a vkládá se jako potomek #user-info, co má position:relative.
  let userMenu = null;
  function ensureUserMenu() {
    if (userMenu) return userMenu;
    userMenu = document.createElement('div');
    userMenu.className = 'user-menu hidden';
    userMenu.innerHTML = `
      <button type="button" class="user-menu-item" id="user-menu-profil">Profil</button>
      <button type="button" class="user-menu-item user-menu-item--danger" id="user-menu-logout">Odhlásit</button>
    `;
    userInfo.appendChild(userMenu);
    userMenu.querySelector('#user-menu-logout').addEventListener('click', (e) => {
      e.stopPropagation();
      closeUserMenu();
      setLoggedOut();
      if (typeof window.onOooLogout === 'function') window.onOooLogout();
    });
    userMenu.querySelector('#user-menu-profil').addEventListener('click', (e) => {
      e.stopPropagation();
      closeUserMenu();
      if (typeof window.openProfileModal === 'function') window.openProfileModal();
    });
    document.addEventListener('click', (e) => {
      if (userMenu && !userMenu.classList.contains('hidden') && !userInfo.contains(e.target)) closeUserMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeUserMenu(); });
    return userMenu;
  }
  function closeUserMenu() { if (userMenu) userMenu.classList.add('hidden'); }
  function toggleUserMenu() { ensureUserMenu().classList.toggle('hidden'); }

  function setLoggedIn(user) {
    userName.textContent = user.userName;
    userAvatar.src = user.avatarUrl;
    userInfo.style.display = 'flex';
    userInfo.onclick = toggleUserMenu;
    loginBtn.style.display = 'none';
  }

  function setLoggedOut() {
    userInfo.style.display = 'none';
    userInfo.onclick = null;
    closeUserMenu();
    loginBtn.style.display = '';
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

  // loginBtn je teď vidět jen odhlášený (přihlášený stav řeší #user-info + jeho menu),
  // takže tenhle klik je vždycky "chci se přihlásit".
  loginBtn.addEventListener('click', function (e) {
    e.preventDefault();
    showLoginChoiceModal();
  });

  function showLoginChoiceModal() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(10,16,69,0.6);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = `
      <div style="background:var(--surface,#fff);border-radius:16px;padding:32px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <h3 style="margin-top:0;margin-bottom:20px;font-family:'Bebas Neue',sans-serif;letter-spacing:0.03em;font-size:1.4rem;">Jak se chceš přihlásit?</h3>
        <div id="ooo-google-btn-holder" style="display:flex;justify-content:center;"></div>
        <p style="font-size:0.72rem;color:var(--text-muted,#888);margin:6px 0 16px;">Omezené funkce, s možností dalšího rozšíření</p>
        <button id="ooo-login-discord" class="btn btn-primary" style="width:100%;justify-content:center;gap:10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          Přihlásit přes Discord
        </button>
        <p style="font-size:0.72rem;color:var(--text-muted,#888);margin:6px 0 16px;">Plné funkce</p>
        <button id="ooo-login-cancel" style="background:none;border:none;color:var(--text-muted,#999);cursor:pointer;font-size:0.85rem;">Zrušit</button>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.getElementById('ooo-login-cancel').addEventListener('click', () => overlay.remove());
    document.getElementById('ooo-login-discord').addEventListener('click', () => {
      overlay.remove();
      window.open(DISCORD_AUTH_URL, 'discordLogin', 'width=500,height=700');
    });

    function loadGoogleScript(cb) {
      if (window.google && window.google.accounts) return cb();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = cb;
      document.head.appendChild(s);
    }

    loadGoogleScript(() => {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const res = await fetch(GOOGLE_VERIFY_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            });
            const data = await res.json();
            if (!data.ok) { alert('Přihlášení se nepovedlo: ' + data.error); return; }
            const user = {
              userId: 'google_' + data.google_id,
              userName: data.name || data.email,
              avatarUrl: data.picture,
              provider: 'google',
              credential: response.credential, // znovupoužije se při registraci na akci, ať se nemusí přihlašovat podruhé
            };
            localStorage.setItem('oooUser', JSON.stringify(user));
            overlay.remove();
            setLoggedIn(user);
            if (typeof window.onOooLogin === 'function') window.onOooLogin(user);
          } catch (err) {
            alert('Chyba při ověřování: ' + err.message);
          }
        },
      });
      const holder = document.getElementById('ooo-google-btn-holder');
      if (holder) {
        google.accounts.id.renderButton(holder, {
          theme: 'outline', size: 'large', text: 'signin_with',
          shape: 'pill', logo_alignment: 'left', width: 296,
        });
      }
    });
  }

  const navToggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  }
}

document.addEventListener('DOMContentLoaded', initAuthUI);
