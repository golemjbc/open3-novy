// Sdílená logika přihlášení - stejný backend, stejný localStorage klíč jako produkce.
// Funkčně 1:1 s open3-novy, jen bez jQuery.

const API_BASE = 'https://ooo-functions-hjajhxe2b4aqgqc5.westeurope-01.azurewebsites.net';
const DISCORD_AUTH_URL =
  "https://discord.com/oauth2/authorize?client_id=1452709238601154580&response_type=code&" +
  "redirect_uri=https%3A%2F%2Fooo-functions-hjajhxe2b4aqgqc5.westeurope-01.azurewebsites.net%2Fapi%2Flogin-callback&" +
  "scope=identify%20guilds.members.read";

const GOOGLE_CLIENT_ID = '16887022098-fp2i853o893838s0390v763j8m1davj4.apps.googleusercontent.com';
const GOOGLE_VERIFY_URL = API_BASE + '/api/verify-google';

function getRealLoggedUser() {
  const raw = localStorage.getItem('oooUser');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// "Zobrazit jako" / ghost mode (2026-08-28, na žádost - podpora: "co mi nejde" jde ověřit
// tak, že admin uvidí web přesně očima toho člověka). Cíleně jen Discord identita - Google
// cestu backend ověřuje skutečným tokenem (viz Identitní model v BACKEND-AZURE-FUNCTIONS.md),
// takže "vydávat se" za Google účet bez zásahu do backendu vůbec nejde a nezkoušíme to.
// sessionStorage (ne localStorage) záměrně - drží se jen v týhle kartě, zavření karty/
// odhlášení ho samo smaže, nemůže tak omylem "prosáknout" do jiné karty/dalšího přihlášení.
const GHOST_KEY = 'oooGhostTarget';

function getGhostTarget() {
  try { return JSON.parse(sessionStorage.getItem(GHOST_KEY) || 'null'); } catch (e) { return null; }
}

function setGhostTarget(target) { sessionStorage.setItem(GHOST_KEY, JSON.stringify(target)); }
function clearGhostTarget() { sessionStorage.removeItem(GHOST_KEY); }

// getLoggedUser() je to, co čte úplně každá stránka (kdo jsem, co je "moje") - v ghost
// modu proto vrací CÍLOVÉHO uživatele, ne skutečně přihlášeného admina, ať se web chová
// 1:1 stejně, jako by ho otevřel on sám (žádná stránka se kvůli tomu nemusí upravovat
// zvlášť). Skutečná admin identita jde zjistit přes getRealLoggedUser(), používá to jen
// banner níž (na "Ukončit náhled").
function getLoggedUser() {
  const ghost = getGhostTarget();
  if (ghost) return { userId: ghost.discord_id, userName: ghost.jmeno + ' (náhled)', avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==', provider: 'discord' };
  return getRealLoggedUser();
}

function isGoogleUser(user) {
  return !!(user && (user.provider === 'google' || /^google_/.test(user.userId || '')));
}

// Bezpečnostní pojistka ghost modu - "jen vidět, ne klikat". I když getLoggedUser() výš
// vrací cizí identitu, backend u Discord cesty dnes věří poslanému user_id bez ověření
// (viz riziko #1 v BEZPECNOST-A-RIZIKA.md) - kdyby admin v náhledu omylem klikl na
// "Přihlásit se"/"Zrušit účast"/formulář, ve skutečnosti by to odeslal ZA toho člověka.
// Proto se v ghost modu smí projít na backend jen explicitně vyjmenované READ endpointy
// (allowlist, ne blocklist - bezpečnější default, kdyby se na něco zapomnělo).
const GHOST_SAFE_ENDPOINTS = new Set([
  // Veřejné/vlastní čtení (co běžný uživatel vidí procházením webu):
  'events', 'members', 'my-registrations', 'get-deposit-info', 'get-questionnaire', 'my-profile', 'my-roles',
  'event-gallery', 'gallery-events',
  // Admin čtení (pro případ, že by se v náhledu omylem otevřela admin stránka - i tak
  // to zůstává jen ČTENÍ, žádný z panel-*-list/detail endpointů nic nezapisuje):
  'panel-list-events', 'panel-list-members', 'panel-list-registrations', 'panel-list-questionnaires',
  'panel-list-fio-payments', 'panel-member-detail', 'panel-gallery-list', 'panel-gallery-legacy-events',
]);
const _oooRealFetch = window.fetch.bind(window);
window.fetch = function (input, init) {
  const ghost = getGhostTarget();
  if (ghost) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.startsWith(API_BASE)) {
      const path = url.slice(API_BASE.length).split('?')[0];
      const name = path.replace(/^\/api\//, '');
      if (!GHOST_SAFE_ENDPOINTS.has(name)) {
        console.warn('Ghost mode: zablokovaný pokus o zápis přes', name);
        return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'Prohlížecí režim (náhled za uživatele) - tahle akce je záměrně zakázaná, ukonči náhled tlačítkem nahoře.' }), { status: 423, headers: { 'Content-Type': 'application/json' } }));
      }
    }
  }
  return _oooRealFetch(input, init);
};

function ghostBannerEnsure() {
  const ghost = getGhostTarget();
  const existing = document.getElementById('ooo-ghost-banner');
  if (!ghost) { if (existing) existing.remove(); document.body.classList.remove('ooo-ghost-active'); return; }
  if (existing) return;
  const escDiv = document.createElement('div');
  escDiv.textContent = ghost.jmeno || ghost.discord_id;
  const safeName = escDiv.innerHTML;
  const bar = document.createElement('div');
  bar.id = 'ooo-ghost-banner';
  bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#3d2a00;color:#ffd580;font-size:0.85rem;font-weight:600;padding:9px 14px;display:flex;gap:10px;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.25);';
  bar.innerHTML = `<span>👻 Prohlížíš web očima uživatele <strong>${safeName}</strong> - jen náhled, akce jsou zakázané.</span>
    <button type="button" id="ooo-ghost-exit" style="background:#ffd580;color:#3d2a00;border:none;border-radius:6px;padding:4px 10px;font-weight:700;cursor:pointer;">Ukončit náhled</button>`;
  document.body.prepend(bar);
  document.body.classList.add('ooo-ghost-active');
  const style = document.createElement('style');
  style.textContent = 'body.ooo-ghost-active { padding-top: 40px; } body.ooo-ghost-active .site-header { top: 40px; }';
  document.head.appendChild(style);
  document.getElementById('ooo-ghost-exit').addEventListener('click', () => {
    clearGhostTarget();
    location.reload();
  });
}

// Tělo požadavku na identitu pro backend (2026-08-25, na žádost - "stačila by na to jedna
// funkce" - tahle přesná logika byla nezávisle přepsaná na 4 místech: admin-akce.html,
// admin-clenove.html, admin-dotazniky.html, member-modal.js, profile-modal.js). Google
// cesta posílá credential (ověří se serverem), Discord cesta jen ID (server si identitu
// dohledá sám, stejný důvěryhodnostní model jako u zbytku backendu).
function getIdentityPayload(user) {
  if (!user) return null;
  return isGoogleUser(user) ? { credential: user.credential } : { discord_user_id: user.userId };
}

// Položka "Administrace" v hlavičce (2026-08-25, oprava - "zobrazuje se se zpožděním").
// Dřív to KAŽDÁ stránka zjišťovala vlastní kopií stejného kódu přes /api/members, což
// stahuje do prohlížeče celý seznam všech ~360 členů jen kvůli jedné vlastní řádce -
// proto to bylo vidět s citelnou prodlevou. Teď: (1) jedno místo pro všechny stránky,
// (2) lehký endpoint my-roles vrací jen dva booleany za volajícího, ne celou tabulku,
// (3) mezivýsledek z posledního přihlášení se ukáže hned z localStorage, na pozadí se
// ověří znovu - druhá a další návštěva tak nemá vidět žádnou prodlevu, jen případnou
// tichou opravu, kdyby se role mezitím změnila. Zároveň doplněna kontrola role
// Spolupracovník / tvůrce (dřív se kontrolovala jen Rada, i když admin panel už týden
// pouští oba).
function initAdminNavLink(user) {
  const nav = document.getElementById('nav-admin');
  // Admin stránky (admin-akce/clenove/dotazniky.html) mají vlastní přístupovou bránu, co
  // položku "Administrace" v menu řeší samy jako součást stejné kontroly, co pouští na
  // celou stránku (requireAdminIdentity) - tenhle obecný kód by jim do toho jen kolidoval
  // (souběh dvou nezávislých asynchronních kontrol). Značka data-self-managed to odliší.
  if (!nav || nav.dataset.selfManaged === '1') return;
  if (!user || !user.userId) { nav.style.display = 'none'; return; }
  const cacheKey = 'oooIsAdmin_' + user.userId;
  if (localStorage.getItem(cacheKey) === '1') nav.style.display = '';
  const payload = isGoogleUser(user) ? { credential: user.credential } : { discord_user_id: user.userId };
  fetch(API_BASE + '/api/my-roles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
    .then(r => r.json())
    .then(data => {
      // Organizátor (2026-08-28) vidí jen admin-akce.html (jediná stránka s
      // requireEventAdminIdentity fallbackem), ale položka v menu je společná pro
      // všechny tři admin stránky, tak ji musí odemknout stejně jako rada/spolupracovník -
      // jinak se organizátor bez Rada/Spolupracovník role vůbec neklikne na svoji akci.
      const isAdmin = !!(data.ok && (data.rada || data.spolupracovnik || data.organizator));
      nav.style.display = isAdmin ? '' : 'none';
      localStorage.setItem(cacheKey, isAdmin ? '1' : '0');
    })
    .catch(() => {});
}

// Skrytí tabů v ".admin-tabs" (Akce a přihlášky / Fronta dotazníků / Přehled členů /
// Platby / Fotogalerie), na které volající přes my-roles beztak nemá právo - dřív byly
// tyhle odkazy natvrdo v HTML na všech pěti admin-*.html a klikem na nedostupný tab
// zmizelo celé menu (stránka gate-denied). Volá se z gate-success větve na každé
// admin-*.html stránce zvlášť (2026-08-28, hlášeno - "kliknu na cokoliv jiného než akce
// a přihlášky a zmizí mi menu"), protože to, co je "dostupné", se liší podle role a
// stránky ho i tak už zjišťovala sama přes vlastní my-roles volání.
function applyAdminTabsVisibility(data) {
  const rules = {
    'tab-akce': data.rada || data.spolupracovnik || data.organizator,
    'tab-dotazniky': data.rada || data.patron,
    'tab-clenove': data.rada,
    'tab-platby': data.rada,
    'tab-galerie': data.rada || data.patron || data.organizator,
  };
  Object.entries(rules).forEach(([id, visible]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !visible);
  });
}

function initAuthUI() {
  ghostBannerEnsure();

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

  // U hlavičky se dřív ukazovalo Discord "username" (identifikační přezdívka, viz
  // login-callback) místo "Zobrazované jméno" z tabulky members (2026-08-28, na žádost -
  // "u avatara mám identifikační jméno a ne zobrazované"). Přepíše se dodatečně přes
  // my-profile (ten už "Zobrazované jméno" umí vrátit), ne rovnou při loginu - ať se
  // nemusí přihlašovací flow (Discord i Google) samo měnit. V ghost modu se přeskočí -
  // tam už getLoggedUser() vrací jméno cíle rovnou.
  function refreshDisplayName(user) {
    if (getGhostTarget() || !user || !user.userId) return;
    fetch(API_BASE + '/api/my-profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getIdentityPayload(user)),
    })
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.jmeno || data.jmeno === user.userName) return;
        user.userName = data.jmeno;
        localStorage.setItem('oooUser', JSON.stringify(user));
        if (userName) userName.textContent = user.userName;
      })
      .catch(() => {});
  }

  function setLoggedOut() {
    userInfo.style.display = 'none';
    userInfo.onclick = null;
    closeUserMenu();
    loginBtn.style.display = '';
    loginBtn.textContent = 'Přihlásit';
    loginBtn.dataset.mode = 'login';
    localStorage.removeItem('oooUser');
    clearGhostTarget();
    initAdminNavLink(null);
  }

  const stored = getLoggedUser();
  if (stored && stored.userId) setLoggedIn(stored); else setLoggedOut();
  initAdminNavLink(stored);
  refreshDisplayName(stored);

  window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || data.type !== 'ooo-discord-login') return;
    localStorage.setItem('oooUser', JSON.stringify(data.user));
    setLoggedIn(data.user);
    refreshDisplayName(data.user);
    initAdminNavLink(data.user);
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
            initAdminNavLink(user);
            refreshDisplayName(user);
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
