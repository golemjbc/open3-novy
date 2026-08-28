// Znovupoužitelné okno s detailem člena (Část B, 2026-08-24) - otevírá se kliknutím na
// jméno jak v přehledu přihlášek (admin-akce.html), tak v přehledu členů/frontě
// dotazníků (admin-clenove.html). Vyžaduje, aby stránka už měla načtený assets/js/auth.js
// (kvůli getLoggedUser()) a definovaný API_BASE.

const CANONICAL_PATRONS = ['Káča & Adam', 'Viktorie & Oliver', 'Karin & Zbyšek', 'Káča'];

function memberModalIdentityPayload() { return getIdentityPayload(getLoggedUser()); }

// Stejná konverze na náhled jako u fotek akcí jinde na webu (akce.html/detail-akce.html) -
// funguje jen tomu, kdo je v prohlížeči přihlášený Google účtem se sdíleným přístupem ke
// složce fotek (stejné omezení, jaké platí dnes).
function memberModalImageUrl(url) {
  if (!url) return null;
  // Historické odkazy (Google Forms import) mají tvar "...open?id=FILEID", ne "/d/FILEID/"
  // - stejná oprava jako na serveru (2026-08-24, "fotky tam pořád nejsou").
  const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w400`;
  if (url.includes('photos.app.goo.gl') || url.includes('photos.google.com')) {
    return 'https://images.weserv.nl/?url=' + encodeURIComponent(url);
  }
  return url;
}

function memberModalStatusIcon(status) {
  if (status === 'ok') return '✓';
  if (status === 'waiting') return '⏳';
  return '✗';
}

function memberModalEnsureDom() {
  if (document.getElementById('member-modal-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'member-modal-overlay';
  overlay.className = 'member-modal-overlay hidden';
  overlay.innerHTML = `
    <div class="member-modal">
      <button type="button" class="member-modal-close" aria-label="Zavřít">&times;</button>
      <div class="member-modal-body" id="member-modal-body"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeMemberModal(); });
  overlay.querySelector('.member-modal-close').addEventListener('click', closeMemberModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMemberModal(); });
}

function closeMemberModal() {
  const overlay = document.getElementById('member-modal-overlay');
  if (overlay) overlay.classList.add('hidden');
}

// Klik na fotku ji zvětší přes celé okno, další klik zavře (2026-08-24, na žádost).
function toggleMemberPhotoLightbox(src) {
  const existing = document.getElementById('member-photo-lightbox');
  if (existing) { existing.remove(); return; }
  const lightbox = document.createElement('div');
  lightbox.id = 'member-photo-lightbox';
  lightbox.className = 'member-photo-lightbox';
  const img = document.createElement('img');
  img.src = src;
  lightbox.appendChild(img);
  lightbox.addEventListener('click', () => lightbox.remove());
  document.body.appendChild(lightbox);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// oooId a discordId - ne každý člen má ooo_id (přiřazuje se až první interakcí s webem,
// kdo přišel jen přes Discord bota, ho ještě mít nemusí) - proto Discord ID jako záložní
// klíč, ať jde otevřít okno úplně každého, ne jen těch, co už ooo_id mají (2026-08-24,
// oprava na žádost - "ne na všechny uživatele se nedá kliknout"). dotaznikRowIndex otevírá
// OSIŘELÝ dotazník (starý import z Google Forms bez ooo_id, 2026-08-24, na žádost - "ty
// stavy že staré tabulky nesouhlasí") - použije se jen když oooId i discordId chybí.
async function openMemberModal(oooId, discordId, dotaznikRowIndex) {
  memberModalEnsureDom();
  const overlay = document.getElementById('member-modal-overlay');
  const body = document.getElementById('member-modal-body');
  overlay.classList.remove('hidden');
  body.innerHTML = '<p class="member-modal-loading">Načítám…</p>';

  const identity = memberModalIdentityPayload();
  if (!identity) {
    body.innerHTML = '<p class="member-modal-error">Nejsi přihlášený/á.</p>';
    return;
  }
  if (!oooId && !discordId && !dotaznikRowIndex) {
    body.innerHTML = '<p class="member-modal-error">Chybí identifikátor člena.</p>';
    return;
  }

  try {
    const res = await fetch(API_BASE + '/api/panel-member-detail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...identity,
        ooo_id: oooId || '',
        target_discord_id: oooId ? '' : (discordId || ''),
        dotaznik_row_index: (!oooId && !discordId) ? (dotaznikRowIndex || '') : '',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      body.innerHTML = `<p class="member-modal-error">${escapeHtml(data.error || 'Nepodařilo se načíst detail.')}</p>`;
      return;
    }
    renderMemberModal(body, data);
  } catch (err) {
    body.innerHTML = `<p class="member-modal-error">Chyba: ${escapeHtml(err.message)}</p>`;
  }
}

// Cíl akce (schválit/zamítnout/přiřadit patrona/poznámky) - u osiřelého dotazníku (bez
// napojení na člena) se cílí přes dotaznik_row_index, jinak přes ooo_id.
function memberModalActionTarget(data) {
  return data.questionnaire.orphaned
    ? { dotaznik_row_index: data.questionnaire.dotaznik_row_index }
    : { ooo_id: data.ooo_id };
}

function memberModalReopen(data) {
  return data.questionnaire.orphaned
    ? openMemberModal('', '', data.questionnaire.dotaznik_row_index)
    : openMemberModal(data.ooo_id, data.discord_id);
}

function renderMemberModal(body, data) {
  // Fotka se dřív zobrazovala přímým odkazem na Disk - fungovalo to jen tomu, kdo byl v
  // prohlížeči zrovna přihlášený Google účtem se sdíleným přístupem (na žádost uživatele
  // 2026-08-24 - "pořád nenačítá fotky" - opraveno: server ji teď stáhne sám přes vlastní
  // servisní účet a pošle jako data URL, foto_data_url funguje vždy). Starý přímý odkaz
  // zůstává jen jako záloha, kdyby se stažení na serveru z nějakého důvodu nepovedlo.
  const photoUrl = data.questionnaire.exists
    ? (data.questionnaire.foto_data_url || (data.questionnaire.foto_url.length ? memberModalImageUrl(data.questionnaire.foto_url[0]) : null))
    : null;

  // Osiřelý dotazník (bez napojení na profil) nemá koho by se stav přístupu/historie
  // týkaly - access je od backendu null.
  const accessRows = data.access ? ['A', 'B', 'C'].map(typ => {
    const a = data.access[typ];
    return `<div class="member-access-row member-access-${a.status}">
      <span class="member-access-icon">${memberModalStatusIcon(a.status)}</span>
      <span class="member-access-label">Typ ${typ}: ${escapeHtml(a.label)}</span>
    </div>`;
  }).join('') : '';

  const historyRows = data.eventHistory.length
    ? data.eventHistory.map(h => `<li>${escapeHtml(h.nazev)} <span class="member-history-status">(záloha: ${escapeHtml(h.deposit_status || '—')}${h.doplatek_status ? ', doplatek: ' + escapeHtml(h.doplatek_status) : ''})</span></li>`).join('')
    : '<li class="member-modal-empty">Zatím bez historie akcí.</li>';

  let questionnaireHtml = '<p class="member-modal-empty">Dotazník zatím nevyplnil/a.</p>';
  if (data.questionnaire.exists) {
    const q = data.questionnaire;
    const field = (label, val) => val ? `<div class="member-q-field"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(val)}</div>` : '';
    const stavLabel = { approved: 'Schváleno', rejected: 'Zamítnuto', pending: 'Čeká na rozhodnutí' }[q.souhlas_status] || q.souhlas_status;
    questionnaireHtml = q.orphaned ? `
      <p class="member-modal-msg" style="background:var(--warning-bg); color:var(--warning); padding:10px 14px; border-radius:var(--radius-sm);">
        Starý dotazník z historického importu (Google Forms) bez napojení na aktuální profil člena - jméno a Discord jméno níže jsou z doby vyplnění, mohou se od té doby lišit. Podle nich zkus dohledat, o koho jde; propojení s profilem se zatím dělá ručně v tabulce.
      </p>
    ` : '';
    questionnaireHtml += `
      <div class="member-q-fields">
        ${field('Přezdívka v dotazníku', q.jmeno_prezdivka)}
        ${field('Profily', q.profily)}
        ${field('Upřesnění', q.upresneni)}
        ${field('Lokalita', q.lokalita)}
        ${field('Sociálně-demografické', q.socialne_demograficke)}
        ${field('Aktuální situace', q.aktualni_situace)}
        ${field('Co může nabídnout', q.co_nabidnout)}
        ${field('Sny a přání', q.sny_prani)}
        ${q.zna_patrony.length ? field('Zná patrony', q.zna_patrony.join(', ')) : ''}
        ${q.locked ? field('Stav rozhodnutí', stavLabel) : ''}
        ${q.souhlas_status === 'approved' ? field('Schválil/a', q.schvalil_patron) : ''}
        ${(q.souhlas_status === 'pending' && q.souhlas) ? field('Starý nejasný zápis souhlasu', q.souhlas) : ''}
      </div>
    `;
    // Poznámky patrona (proběhl kontakt, osobní setkání, volný text) - dřív se psaly jen
    // ručně do Sheetu, teď editovatelné přímo tady, u schválených i neschválených
    // (2026-08-24, na žádost - "dělat administraci jako patron, abych nemusel do tabulky").
    questionnaireHtml += `
      <div class="member-notes-section">
        <div class="member-notes-checks">
          <label><input type="checkbox" id="member-kontakt-check" ${q.probehl_kontakt ? 'checked' : ''}> Proběhl první kontakt</label>
          <label><input type="checkbox" id="member-setkani-check" ${q.osobni_setkani ? 'checked' : ''}> Proběhlo osobní setkání</label>
        </div>
        <div>
          <label class="member-notes-label" for="member-poznamka">Poznámka</label>
          <textarea id="member-poznamka">${escapeHtml(q.poznamka)}</textarea>
        </div>
        <div>
          <label class="member-notes-label" for="member-poznamka2">Poznámka 2</label>
          <textarea id="member-poznamka2">${escapeHtml(q.poznamka2)}</textarea>
        </div>
        <div>
          <button type="button" class="btn btn-outline btn-sm" id="member-save-notes-btn">Uložit poznámky</button>
          <p class="member-modal-msg" id="member-notes-msg"></p>
        </div>
      </div>
    `;
    if (!q.locked) {
      // Patron už často vybraný ze starého dotazníku (2026-08-24, na žádost - "nepotřebuji
      // nového, použij toho ze starého dotazníku") - starší záznamy mají patrona zapsaného
      // volným textem (např. "Adam (Liberec, Praha...) IG: ..."), ne dnešním krátkým
      // formátem, takže se nedá porovnávat s CANONICAL_PATRONS. Pokud už nějaký je zapsaný
      // (v jakémkoliv tvaru), zobrazí se rovnou jako hotová věc - výběr nového je schovaný
      // za "Změnit", ne vnucený jako výchozí krok.
      const hasExistingPatron = !!(q.patron_kdo_historicky || '').trim();
      // patron_normalized (2026-08-24, na žádost - "ty řetězce nejsou stejný ale logika
      // ano") - server dopočítá, ke kterému z dnešních 4 patronů starý volný text patří
      // (podle toho, čí jméno v textu je), ať jde podle toho i filtrovat a předvybrat.
      questionnaireHtml += `
        <div class="member-patron-actions">
          ${hasExistingPatron ? `
            <div>Patron: <strong>${escapeHtml(q.patron_normalized || q.patron_kdo_historicky)}</strong>
              <button type="button" class="member-link" id="member-change-patron-toggle" style="margin-left:8px;">Změnit</button>
            </div>
          ` : ''}
          <div id="member-patron-picker" class="${hasExistingPatron ? 'hidden' : ''}">
            <label>Přiřadit patrona:
              <select id="member-patron-select">
                <option value="">— vyber —</option>
                ${CANONICAL_PATRONS.map(p => `<option value="${escapeHtml(p)}" ${q.patron_normalized === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
              </select>
            </label>
            <button type="button" class="btn btn-outline btn-sm" id="member-assign-patron-btn">Přiřadit</button>
          </div>
          <div class="member-patron-buttons">
            <button type="button" class="btn btn-primary btn-sm" id="member-approve-btn">Schválit</button>
            <button type="button" class="btn btn-outline btn-sm" id="member-reject-btn">Odmítnout</button>
          </div>
          <p class="member-modal-msg" id="member-patron-msg"></p>
        </div>
      `;
    }
  }

  body.innerHTML = `
    <div class="member-modal-header">
      ${photoUrl ? `<img src="${photoUrl}" alt="" class="member-modal-photo" id="member-modal-photo-el" title="Klikni pro zvětšení">` : '<div class="member-modal-photo member-modal-photo-empty"></div>'}
      <div>
        <h3>${escapeHtml(data.jmeno || data.ooo_id)}</h3>
        <p class="member-modal-contact">
          ${data.discord_username ? '@' + escapeHtml(data.discord_username) + ' · ' : ''}
          ${escapeHtml(data.email || '')}${data.telefon ? ' · ' + escapeHtml(data.telefon) : ''}
        </p>
      </div>
    </div>
    ${data.access ? `<div class="member-access-list">${accessRows}</div>` : ''}
    ${data.access ? `<h4>Historie akcí</h4><ul class="member-history-list">${historyRows}</ul>` : ''}
    <h4>Dotazník</h4>
    ${questionnaireHtml}
  `;

  const photoEl = document.getElementById('member-modal-photo-el');
  if (photoEl) photoEl.addEventListener('click', () => toggleMemberPhotoLightbox(photoEl.src));

  const changePatronToggle = document.getElementById('member-change-patron-toggle');
  if (changePatronToggle) {
    changePatronToggle.addEventListener('click', () => {
      document.getElementById('member-patron-picker').classList.toggle('hidden');
    });
  }

  const assignBtn = document.getElementById('member-assign-patron-btn');
  const approveBtn = document.getElementById('member-approve-btn');
  const rejectBtn = document.getElementById('member-reject-btn');
  const msgEl = document.getElementById('member-patron-msg');
  if (assignBtn) {
    assignBtn.addEventListener('click', async () => {
      const select = document.getElementById('member-patron-select');
      if (!select.value) { msgEl.textContent = 'Vyber prosím patrona.'; return; }
      msgEl.textContent = 'Ukládám…';
      const identity = memberModalIdentityPayload();
      try {
        const res = await fetch(API_BASE + '/api/panel-review-questionnaire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...identity, ...memberModalActionTarget(data), action: 'assign_patron', patron: select.value }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.ok) { msgEl.textContent = resData.error || 'Nepodařilo se uložit.'; return; }
        msgEl.textContent = 'Patron přiřazen.';
        memberModalReopen(data);
      } catch (err) { msgEl.textContent = 'Chyba: ' + err.message; }
    });
  }
  if (approveBtn) {
    approveBtn.addEventListener('click', async () => {
      if (!confirm(`Opravdu schválit dotazník uživatele ${data.jmeno || data.ooo_id}?`)) return;
      msgEl.textContent = 'Ukládám…';
      const identity = memberModalIdentityPayload();
      try {
        const res = await fetch(API_BASE + '/api/panel-review-questionnaire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...identity, ...memberModalActionTarget(data), action: 'approve' }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.ok) { msgEl.textContent = resData.error || 'Nepodařilo se schválit.'; return; }
        msgEl.textContent = 'Schváleno.';
        memberModalReopen(data);
      } catch (err) { msgEl.textContent = 'Chyba: ' + err.message; }
    });
  }
  if (rejectBtn) {
    rejectBtn.addEventListener('click', async () => {
      if (!confirm(`Opravdu zamítnout dotazník uživatele ${data.jmeno || data.ooo_id}?`)) return;
      msgEl.textContent = 'Ukládám…';
      const identity = memberModalIdentityPayload();
      try {
        const res = await fetch(API_BASE + '/api/panel-review-questionnaire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...identity, ...memberModalActionTarget(data), action: 'reject' }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.ok) { msgEl.textContent = resData.error || 'Nepodařilo se zamítnout.'; return; }
        msgEl.textContent = 'Zamítnuto.';
        memberModalReopen(data);
      } catch (err) { msgEl.textContent = 'Chyba: ' + err.message; }
    });
  }

  const saveNotesBtn = document.getElementById('member-save-notes-btn');
  if (saveNotesBtn) {
    saveNotesBtn.addEventListener('click', async () => {
      const notesMsgEl = document.getElementById('member-notes-msg');
      notesMsgEl.textContent = 'Ukládám…';
      const identity = memberModalIdentityPayload();
      try {
        const res = await fetch(API_BASE + '/api/panel-review-questionnaire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...identity, ...memberModalActionTarget(data), action: 'update_notes',
            probehl_kontakt: document.getElementById('member-kontakt-check').checked,
            osobni_setkani: document.getElementById('member-setkani-check').checked,
            poznamka: document.getElementById('member-poznamka').value,
            poznamka2: document.getElementById('member-poznamka2').value,
          }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.ok) { notesMsgEl.textContent = resData.error || 'Nepodařilo se uložit.'; return; }
        notesMsgEl.textContent = 'Uloženo.';
      } catch (err) { notesMsgEl.textContent = 'Chyba: ' + err.message; }
    });
  }
}
