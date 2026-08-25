// Vlastní profil člena (2026-08-25, plán sekce 7c "Vlastní profil uživatele", nápad
// 2026-08-23) - otevírá se z mini menu po kliknutí na avatar (viz auth.js). Používá
// stejné modální okno jako admin detail člena (member-modal.js) - stejné CSS třídy,
// jiný obsah a jiný, neadminovský zdroj dat (my-profile vrací vždycky jen data
// volajícího, žádná role není potřeba). Vyžaduje, aby stránka měla načtený
// assets/js/auth.js (getLoggedUser, API_BASE) - stejný předpoklad jako member-modal.js.

function profileModalEnsureDom() {
  if (document.getElementById('profile-modal-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'profile-modal-overlay';
  overlay.className = 'member-modal-overlay hidden';
  overlay.innerHTML = `
    <div class="member-modal">
      <button type="button" class="member-modal-close" aria-label="Zavřít">&times;</button>
      <div class="member-modal-body" id="profile-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProfileModal(); });
  overlay.querySelector('.member-modal-close').addEventListener('click', closeProfileModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfileModal(); });
}

function closeProfileModal() {
  const overlay = document.getElementById('profile-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function profileIdentityPayload() {
  const user = getLoggedUser();
  if (!user) return null;
  const isGoogleUser = !!(user.provider === 'google' || /^google_/.test(user.userId || ''));
  return isGoogleUser ? { credential: user.credential } : { discord_user_id: user.userId };
}

// Sekce "propojení účtů" (2026-08-25, na žádost - "obousměrné párování"). Google → Discord
// už existovalo (generate-pair-code + /parovat na Discordu), jen se to nikde hezky
// nezobrazovalo - tady se to jen ukáže s návodem. Discord → e-mail je nové: dvoukrokový
// formulář (request-email-pair pošle kód na zadaný e-mail, confirm-email-pair ho pak
// napojí na volající Discord účet - samotné sloučení řádků dělá bot, viz oba endpointy).
function renderPairingSection(data) {
  if (!data.discord_id) {
    // Google cesta, Discord ještě nespárovaný.
    if (!data.pairing_code) return '';
    return `
      <div class="member-notes-section">
        <p class="member-modal-contact">Discord účet ještě není propojený. Napiš na Discordu příkaz:</p>
        <p style="font-size:1.3rem;font-weight:800;letter-spacing:0.08em;text-align:center;margin:10px 0;">/parovat ${data.pairing_code}</p>
        <p class="form-hint">(nebo pošli tenhle kód jako obyčejnou zprávu botovi OOO asistent)</p>
      </div>`;
  }
  if (data.emails.length) return ''; // uz ma email, neni co parovat
  // Discord cesta, e-mail ještě nepřipojený - dvoukrokový formulář.
  return `
    <div class="member-notes-section">
      <p class="member-modal-contact">E-mail zatím není propojený. Zadej ho, přijde ti tam párovací kód:</p>
      <div id="pair-step-email" style="display:flex; gap:6px; margin-top:6px;">
        <input type="email" id="pair-email-input" placeholder="tvuj@email.cz" style="flex:1; padding:8px 10px; border-radius:8px; border:1.5px solid var(--border);">
        <button type="button" class="btn btn-outline btn-sm" id="pair-email-send">Poslat kód</button>
      </div>
      <div id="pair-step-code" class="hidden" style="display:flex; gap:6px; margin-top:10px;">
        <input type="text" id="pair-code-input" placeholder="kód z e-mailu" maxlength="4" style="width:110px; padding:8px 10px; border-radius:8px; border:1.5px solid var(--border);">
        <button type="button" class="btn btn-outline btn-sm" id="pair-code-confirm">Potvrdit</button>
      </div>
      <p class="member-modal-msg" id="pair-msg"></p>
    </div>`;
}

function wirePairingSection(payload) {
  const sendBtn = document.getElementById('pair-email-send');
  if (!sendBtn) return;
  const msg = document.getElementById('pair-msg');
  sendBtn.addEventListener('click', () => {
    const email = document.getElementById('pair-email-input').value.trim();
    if (!email) return;
    msg.textContent = 'Odesílám…';
    fetch(API_BASE + '/api/request-email-pair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, email }),
    })
      .then(r => r.json())
      .then(res => {
        if (!res.ok) { msg.textContent = 'Chyba: ' + (res.error || 'neznámá'); return; }
        msg.textContent = 'Kód poslán na ' + email + ' - zkontroluj schránku a zadej ho níž.';
        document.getElementById('pair-step-code').classList.remove('hidden');
      })
      .catch(err => { msg.textContent = 'Chyba: ' + err.message; });
  });
  document.getElementById('pair-code-confirm').addEventListener('click', () => {
    const kod = document.getElementById('pair-code-input').value.trim();
    if (!kod) return;
    msg.textContent = 'Ověřuji…';
    fetch(API_BASE + '/api/confirm-email-pair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, kod }),
    })
      .then(r => r.json())
      .then(res => {
        if (!res.ok) { msg.textContent = 'Chyba: ' + (res.error || 'neznámá'); return; }
        msg.textContent = 'Hotovo! Propojení chvíli trvá (do cca půl minuty), pak přijde potvrzení DM/e-mailem.';
      })
      .catch(err => { msg.textContent = 'Chyba: ' + err.message; });
  });
}

function openProfileModal() {
  profileModalEnsureDom();
  const overlay = document.getElementById('profile-modal-overlay');
  const body = document.getElementById('profile-modal-body');
  overlay.classList.remove('hidden');
  body.innerHTML = '<p class="member-modal-loading">Načítám…</p>';

  const payload = profileIdentityPayload();
  if (!payload) { body.innerHTML = '<p class="member-modal-error">Nejsi přihlášen/a.</p>'; return; }

  fetch(API_BASE + '/api/my-profile', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
    .then(r => r.json())
    .then(data => {
      if (!data.ok) { body.innerHTML = `<p class="member-modal-error">${data.error || 'Chyba při načítání profilu.'}</p>`; return; }
      const akceHtml = data.akce.length
        ? `<ul class="member-history-list">${data.akce.map(a => `<li>${a.nazev}${a.datum ? ' — ' + a.datum : ''}</li>`).join('')}</ul>`
        : '<p class="member-modal-empty">Zatím žádné přihlášky.</p>';
      body.innerHTML = `
        <div class="member-modal-header">
          <div>
            <h3>${data.jmeno}</h3>
            <p class="member-modal-contact">${data.emails.join(' · ') || '—'}</p>
          </div>
        </div>
        ${data.telefon ? `<p class="member-modal-contact">Telefon: ${data.telefon}</p>` : ''}
        ${data.instagram ? `<p class="member-modal-contact">Instagram: ${data.instagram}</p>` : ''}
        ${data.souhlas_datum ? `<p class="member-modal-contact">Souhlas s pravidly/GDPR: ${data.souhlas_datum}</p>` : ''}
        <a href="dotaznik.html" class="btn btn-outline btn-sm" style="margin-top:10px; display:inline-block;">Vyplnit dotazník</a>
        ${renderPairingSection(data)}
        <h4>Tvoje akce</h4>
        ${akceHtml}
      `;
      wirePairingSection(payload);
    })
    .catch(err => { body.innerHTML = `<p class="member-modal-error">Chyba: ${err.message}</p>`; });
}

window.openProfileModal = openProfileModal;
