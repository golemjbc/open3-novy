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

function profileIdentityPayload() { return getIdentityPayload(getLoggedUser()); }

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

// Kontaktní údaje (2026-10-28, na žádost - "Moje údaje v knihovně jsou duplicitní s
// profilem na webu"). Profil je JEDINÉ místo, kde se upravují: jméno a příjmení, telefon,
// kontaktní e-mail a Instagram (members.jmeno_prijmeni/telefon/korespondencni_email/
// instagram přes update-contact-info). Knihovna je jen čte (Zásilkovna, kontakt mezi
// stranami předání) a sem odkazuje.
function profileEsc(v) {
  return (v == null ? '' : String(v)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderContactSection(data, editing, intro) {
  const kontaktniEmail = data.kontaktni_email || data.emails[0] || '';
  if (!editing) {
    const row = (label, value) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--border);"><span style="color:var(--text-muted);">${label}</span><span style="text-align:right;word-break:break-word;">${value ? profileEsc(value) : '<span style="color:var(--text-muted);">nevyplněno</span>'}</span></div>`;
    return `
      <div id="profile-contact">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;"><h4 style="margin:0;">Kontaktní údaje</h4><button type="button" class="btn btn-outline btn-sm" id="pc-edit">Upravit</button></div>
        <div style="font-size:0.9rem;margin-top:6px;">
          ${row('Jméno a příjmení', data.jmeno_prijmeni)}
          ${row('Telefon', data.telefon)}
          ${row('Kontaktní e-mail', kontaktniEmail)}
          ${row('Instagram', data.instagram)}
        </div>
        <p style="font-size:0.78rem;color:var(--text-muted);margin:6px 0 0;">Používají se třeba v Knihovně, když ti někdo posílá knihu přes Zásilkovnu – uvidí je jen ten, kdo ti ji posílá.</p>
      </div>`;
  }
  const field = (id, label, value, type, extra) => `<label for="${id}" style="display:block;font-size:0.82rem;font-weight:600;margin:10px 0 4px;">${label}</label><input id="${id}" type="${type}" value="${profileEsc(value)}" ${extra || ''} style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border);font:inherit;">`;
  return `
    <form id="profile-contact" style="margin-top:14px;">
      <h4 style="margin:0;">Kontaktní údaje</h4>
      ${intro ? `<p style="font-size:0.86rem;margin:6px 0 0;">${profileEsc(intro)}</p>` : ''}
      ${field('pc-name', 'Jméno a příjmení (na zásilku)', data.jmeno_prijmeni, 'text', 'autocomplete="name"')}
      ${field('pc-tel', 'Telefon', data.telefon, 'tel', 'autocomplete="tel"')}
      ${field('pc-mail', 'Kontaktní e-mail', kontaktniEmail, 'email', 'autocomplete="email"')}
      ${field('pc-ig', 'Instagram (nepovinné)', data.instagram, 'text', 'placeholder="uživatelské jméno"')}
      <p id="pc-msg" style="font-size:0.82rem;margin:8px 0 0;color:var(--text-muted);"></p>
      <div style="display:flex;gap:8px;margin-top:10px;"><button type="submit" class="btn btn-primary btn-sm">Uložit</button><button type="button" class="btn btn-outline btn-sm" id="pc-cancel">Zrušit</button></div>
    </form>`;
}
function wireContactSection(data, payload, opts) {
  const box = () => document.getElementById('profile-contact');
  const redraw = (editing) => {
    box().outerHTML = renderContactSection(data, editing, editing ? opts.intro : '');
    wireContactSection(data, payload, editing ? opts : { ...opts, intro: '' });
  };
  const el = box();
  if (!el) return;
  if (el.tagName !== 'FORM') {
    el.querySelector('#pc-edit').addEventListener('click', () => redraw(true));
    return;
  }
  el.querySelector('#pc-cancel').addEventListener('click', () => redraw(false));
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = el.querySelector('#pc-msg');
    const vals = {
      jmeno_prijmeni: el.querySelector('#pc-name').value.trim(),
      telefon: el.querySelector('#pc-tel').value.trim(),
      kontaktni_email: el.querySelector('#pc-mail').value.trim(),
      instagram: el.querySelector('#pc-ig').value.trim(),
    };
    if (vals.telefon && vals.telefon.replace(/\D/g, '').length < 9) { msg.textContent = 'Telefon potřebuje aspoň 9 číslic.'; return; }
    if (vals.kontaktni_email && !/^\S+@\S+\.\S+$/.test(vals.kontaktni_email)) { msg.textContent = 'Zkontroluj prosím e-mail.'; return; }
    msg.textContent = 'Ukládám…';
    fetch(API_BASE + '/api/update-contact-info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...vals }),
    })
      .then(r => r.json())
      .then(res => {
        if (!res.ok) { msg.textContent = res.error || 'Uložení se nepovedlo.'; return; }
        Object.assign(data, vals);
        if (opts.onSaved) { closeProfileModal(); opts.onSaved(vals); return; }
        redraw(false);
      })
      .catch(() => { msg.textContent = 'Uložení se nepovedlo, zkus to prosím znovu.'; });
  });
}

// opts: { edit: true (rovnou otevřít úpravu kontaktů), intro: text nad formulářem,
// onSaved(vals): po uložení zavře profil a zavolá se (Knihovna tak pokračuje v žádosti) }.
function openProfileModal(opts) {
  opts = opts && typeof opts === 'object' && !(opts instanceof Event) ? opts : {};
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
        ${renderContactSection(data, !!opts.edit, opts.intro)}
        ${data.souhlas_datum ? `<p class="member-modal-contact">Souhlas s pravidly/GDPR: ${data.souhlas_datum}</p>` : ''}
        <a href="dotaznik.html" class="btn btn-outline btn-sm" style="margin-top:10px; display:inline-block;">Vyplnit dotazník</a>
        ${renderPairingSection(data)}
        <h4>Tvoje akce</h4>
        ${akceHtml}
      `;
      wirePairingSection(payload);
      wireContactSection(data, payload, opts);
      if (opts.edit) { const f = document.getElementById('pc-name'); if (f) f.focus(); }
    })
    .catch(err => { body.innerHTML = `<p class="member-modal-error">Chyba: ${err.message}</p>`; });
}

window.openProfileModal = openProfileModal;
