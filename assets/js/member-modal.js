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

// Malý Discord avatar vedle jména (2026-09-18, na žádost - "vedle jména bych chtěl
// malého Discord avatara, ať poznám kdo to je"). `memberAvatarImg` jen vyrenderuje
// skrytý <img> placeholder u vykreslení tabulky/seznamu, `loadMemberAvatars(root)` se
// zavolá AŽ PO vložení HTML do stránky - posbírá všechna data-discord-avatar v `root`,
// dávkově je pošle na panel-discord-avatars (jeden request místo jednoho na osobu) a
// doplní src. Cache je sdílená pro celou stránku (jedna osoba se často opakuje jako
// partner u víc řádků), takže druhé volání stejné ID už síť nezatíží.
const memberAvatarCache = new Map(); // discord_id -> url|null

function memberAvatarImg(discordId, size) {
  if (!discordId) return '';
  const px = size || 20;
  return `<img class="member-avatar-icon" data-discord-avatar="${discordId}" width="${px}" height="${px}" style="border-radius:50%;vertical-align:middle;margin-right:4px;display:none;object-fit:cover;" alt="">`;
}

// Automatické dotažení zbytku (2026-09-18, na žádost - "klidně tu funkci volat nějak
// opakovaně, ať se to postupně za chvíli všechno načte") - u velkých seznamů
// (admin-clenove.html, stovky lidí) se první dávka kvůli Discord rate limitu nestihne
// celá (viz AVATAR_BATCH_DEADLINE_MS v lib/discord.js). Místo čekání na ruční obnovení
// stránky se `loadMemberAvatars` samo zavolá znovu za pár vteřin, dokud buď nedojdou
// všechny, nebo se to nepokusí příliš mnohokrát (ochrana proti nekonečné smyčce, kdyby
// byl Discord dlouhodobě nedostupný).
const MEMBER_AVATARS_MAX_RETRIES = 6;

async function loadMemberAvatars(root, attempt) {
  const scope = root || document;
  const imgs = Array.from(scope.querySelectorAll('img[data-discord-avatar]'));
  if (!imgs.length) return;
  const ids = [...new Set(imgs.map(img => img.dataset.discordAvatar).filter(Boolean))];
  const unknown = ids.filter(id => !memberAvatarCache.has(id));
  if (unknown.length) {
    const identity = memberModalIdentityPayload();
    if (identity) {
      try {
        const res = await fetch(API_BASE + '/api/panel-discord-avatars', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...identity, ids: unknown }),
        });
        if (res.ok) {
          const data = await res.json();
          // Jen ID, na které server SKUTEČNĚ stihl odpovědět (viz AVATAR_BATCH_DEADLINE_MS
          // v lib/discord.js - velké dávky, typicky admin-clenove.html, se kvůli Discord
          // rate limitu nemusí stihnout celé najednou). Co chybí, se NEcachuje jako "bez
          // avataru" - příští volání (další záložka, ruční obnovení) to zkusí znovu.
          const avatars = data.avatars || {};
          unknown.forEach(id => {
            if (Object.prototype.hasOwnProperty.call(avatars, id)) memberAvatarCache.set(id, avatars[id] || null);
          });
        }
      } catch (e) {
        // Nekritické - avatary jsou jen dekorace, chyba se nikam nehlásí, zkusí se příště.
      }
    }
  }
  imgs.forEach(img => {
    const url = memberAvatarCache.get(img.dataset.discordAvatar);
    if (url) { img.src = url; img.style.display = 'inline-block'; }
  });

  const stillMissing = ids.some(id => !memberAvatarCache.has(id));
  if (stillMissing && (attempt || 0) < MEMBER_AVATARS_MAX_RETRIES) {
    setTimeout(() => loadMemberAvatars(root, (attempt || 0) + 1), 4000);
  }
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

// Klik na fotku ji zvětší přes celé okno (2026-08-24) - rozšířeno 2026-09-13 (na žádost -
// "někteří přidávají víc fotek, ale nikde je nezobrazujeme") o galerii všech fotek
// nahraných k dotazníku, se šipkami vpřed/vzad. Klik mimo fotku (na tmavé pozadí) zavře,
// klik na samotnou fotku už ne (dřív zavíral první klik odkudkoliv, což je matoucí, když
// má člověk co pomocí šipek listovat).
function openMemberPhotoGallery(photos, startIndex) {
  const existing = document.getElementById('member-photo-lightbox');
  if (existing) existing.remove();
  if (!photos.length) return;

  let idx = startIndex || 0;
  const lightbox = document.createElement('div');
  lightbox.id = 'member-photo-lightbox';
  lightbox.className = 'member-photo-lightbox';
  lightbox.innerHTML = `
    <img alt="">
    ${photos.length > 1 ? `
      <button type="button" class="member-photo-lightbox-nav prev" aria-label="Předchozí">‹</button>
      <button type="button" class="member-photo-lightbox-nav next" aria-label="Další">›</button>
      <div class="member-photo-lightbox-counter"></div>
    ` : ''}
  `;
  document.body.appendChild(lightbox);

  function render() {
    lightbox.querySelector('img').src = photos[idx];
    const counter = lightbox.querySelector('.member-photo-lightbox-counter');
    if (counter) counter.textContent = (idx + 1) + ' / ' + photos.length;
  }
  render();

  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.remove(); });
  const prevBtn = lightbox.querySelector('.prev');
  const nextBtn = lightbox.querySelector('.next');
  if (prevBtn) prevBtn.addEventListener('click', () => { idx = (idx - 1 + photos.length) % photos.length; render(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { idx = (idx + 1) % photos.length; render(); });
  document.addEventListener('keydown', function onKey(e) {
    if (!document.getElementById('member-photo-lightbox')) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape') lightbox.remove();
    if (e.key === 'ArrowLeft' && prevBtn) prevBtn.click();
    if (e.key === 'ArrowRight' && nextBtn) nextBtn.click();
  });
}

// Preferovaný kontakt (2026-09-13, na žádost - "měl by mít možnost vybrat preferenci,
// jak chce kontaktovat primárně") - prázdná/neznámá hodnota = Discord (výchozí, stejně
// jako ve formuláři na dotaznik.html). Zobrazuje se jako malý barevný štítek hned pod
// kontaktní řádkou, ať patron na první pohled vidí, kudy má zkusit napsat jako první.
function memberPreferredContactBadge(pref) {
  const value = pref || 'discord';
  const icons = {
    discord: '<svg viewBox="0 0 24 24" fill="none"><path d="M20.3 6.3c-1.4-.65-2.9-1.12-4.5-1.4a.1.1 0 0 0-.1.05c-.2.35-.4.8-.55 1.15a16.6 16.6 0 0 0-5 0 8 8 0 0 0-.55-1.15.1.1 0 0 0-.1-.05c-1.6.28-3.1.75-4.5 1.4a.1.1 0 0 0-.05.04C2.3 10 1.6 13.6 1.9 17.1a.1.1 0 0 0 .04.07 17 17 0 0 0 5.1 2.55.1.1 0 0 0 .11-.04c.4-.53.74-1.1 1.03-1.7a.1.1 0 0 0-.05-.14 11 11 0 0 1-1.58-.75.1.1 0 0 1-.01-.16l.31-.24a.1.1 0 0 1 .1-.01c3.3 1.5 6.88 1.5 10.15 0a.1.1 0 0 1 .1.01l.31.24a.1.1 0 0 1-.01.16c-.5.29-1.03.54-1.58.75a.1.1 0 0 0-.05.14c.3.6.65 1.17 1.03 1.7a.1.1 0 0 0 .11.04 17 17 0 0 0 5.1-2.55.1.1 0 0 0 .04-.07c.36-4.05-.6-7.6-2.55-10.76a.08.08 0 0 0-.04-.04ZM8.68 14.9c-.99 0-1.8-.92-1.8-2.04 0-1.13.79-2.04 1.8-2.04 1.02 0 1.82.93 1.8 2.04 0 1.12-.79 2.04-1.8 2.04Zm6.64 0c-.99 0-1.8-.92-1.8-2.04 0-1.13.8-2.04 1.8-2.04 1.02 0 1.82.93 1.8 2.04 0 1.12-.78 2.04-1.8 2.04Z" fill="currentColor"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.06-1.33A10 10 0 1 0 12 2Zm0 18.1a8.06 8.06 0 0 1-4.13-1.13l-.3-.18-3 .78.8-2.93-.2-.3A8.1 8.1 0 1 1 12 20.1Zm4.44-6.07c-.24-.12-1.44-.71-1.66-.79-.22-.08-.39-.12-.55.12-.16.24-.63.79-.78.95-.14.16-.29.18-.53.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.29.36-.43.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.42-.55-.42h-.47c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.44-.59 1.64-1.15.2-.57.2-1.05.14-1.15-.06-.1-.22-.16-.46-.28Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>',
  };
  const labels = { discord: 'Přednostně přes Discord', whatsapp: 'Přednostně přes WhatsApp', instagram: 'Přednostně přes Instagram' };
  return `<span class="member-preferred-contact ${value}">${icons[value]}${labels[value]}</span>`;
}

// Čeština má tři tvary počtu ("1 další fotka" / "2-4 další fotky" / "5+ dalších fotek") -
// `extraCount` je počet fotek NAD tu už zobrazenou v hlavičce, ne celkový počet.
function memberPhotoCountLabel(extraCount) {
  if (extraCount === 1) return '+1 další fotka';
  if (extraCount >= 2 && extraCount <= 4) return `+${extraCount} další fotky`;
  return `+${extraCount} dalších fotek`;
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
  // Galerie všech fotek (2026-09-13, na žádost - "někteří přidávají víc fotek, ale
  // nikde je nezobrazujeme") - `foto_data_urls` je pole ve STEJNÉM pořadí jako
  // `foto_url` (server zkusil stáhnout každou zvlášť); kde se stažení nepovedlo (null),
  // spadne se pro TU KONKRÉTNÍ fotku na starý přímý odkaz, ne na zahození celé fotky.
  const allPhotos = data.questionnaire.exists
    ? (data.questionnaire.foto_url || []).map((u, i) =>
        (data.questionnaire.foto_data_urls && data.questionnaire.foto_data_urls[i]) || memberModalImageUrl(u))
      .filter(Boolean)
    : [];
  const photoUrl = allPhotos.length ? allPhotos[0] : null;

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
    ? data.eventHistory.map(h => `<li>${h.bez_omluvy ? '⚫ ' : ''}${escapeHtml(h.nazev)} <span class="member-history-status">(záloha: ${escapeHtml(h.deposit_status || '—')}${h.doplatek_status ? ', doplatek: ' + escapeHtml(h.doplatek_status) : ''})${h.bez_omluvy ? ' <strong>bez omluvy</strong>' : ''}</span></li>`).join('')
    : '<li class="member-modal-empty">Zatím bez historie akcí.</li>';

  // Docházka (2026-09-24, na žádost - "zelené kolik akcí byl, černé kolik bylo bez
  // omluvy") - malé puntíky nahoře u jména, počítané serverem (panel-member-detail) jen
  // z proběhlých, nezrušených akcí, kde byl skutečně účastníkem.
  const dochazkaHtml = data.dochazka ? `
    <p class="member-modal-dochazka" title="Zelené: kolik proběhlých akcí byl účastníkem. Černé: kolik z toho bez omluvy nedorazil.">
      <span class="member-dot member-dot--green">🟢 ${data.dochazka.zelene}</span>
      <span class="member-dot member-dot--black">⚫ ${data.dochazka.cerne}</span>
    </p>` : '';

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
        ${field('Amatéři', q.profil_amateri)}
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
      <div>
        ${photoUrl ? `<img src="${photoUrl}" alt="" class="member-modal-photo" id="member-modal-photo-el" title="Klikni pro zvětšení">` : '<div class="member-modal-photo member-modal-photo-empty"></div>'}
        ${allPhotos.length > 1 ? `<button type="button" class="member-photo-count" id="member-photo-count-el">${memberPhotoCountLabel(allPhotos.length - 1)}</button>` : ''}
      </div>
      <div>
        <h3>${escapeHtml(data.jmeno || data.email || data.ooo_id)}</h3>
        ${dochazkaHtml}
        <p class="member-modal-contact">
          ${data.discord_username ? '@' + escapeHtml(data.discord_username) + ' · ' : ''}
          ${escapeHtml(data.email || '')}${data.telefon ? ' · ' + escapeHtml(data.telefon) : ''}${data.instagram ? ' · ' + escapeHtml(data.instagram) : ''}
        </p>
        ${data.questionnaire && data.questionnaire.exists ? memberPreferredContactBadge(data.preferred_contact) : ''}
      </div>
    </div>
    ${data.access ? `<div class="member-access-list">${accessRows}</div>` : ''}
    ${data.access ? `<h4>Historie akcí</h4><ul class="member-history-list">${historyRows}</ul>` : ''}
    <h4>Dotazník</h4>
    ${questionnaireHtml}
    ${data.ooo_id ? `
    <div class="member-notes-section">
      <div>
        <label class="member-notes-label" for="member-message-text">Poslat zprávu přes bota</label>
        <textarea id="member-message-text" placeholder="Např. Snažím se tě kontaktovat na Discordu, ozvi se prosím…" maxlength="1900"></textarea>
        <p class="form-hint" style="margin-top:4px;">Odešle se jako DM (a e-mailem, pokud ho máme) - na konec se připojí odkaz na tvůj profil, ať adresát ví, s kým mluví, a může rovnou odepsat. Bot obchází Discordí "Žádosti o zprávy", takže zpráva přijde rovnou do schránky.</p>
      </div>
      <div>
        <button type="button" class="btn btn-outline btn-sm" id="member-send-message-btn">Odeslat zprávu</button>
        <p class="member-modal-msg" id="member-message-msg"></p>
      </div>
    </div>
    ` : ''}
  `;

  const photoEl = document.getElementById('member-modal-photo-el');
  if (photoEl) photoEl.addEventListener('click', () => openMemberPhotoGallery(allPhotos, 0));
  const photoCountEl = document.getElementById('member-photo-count-el');
  if (photoCountEl) photoCountEl.addEventListener('click', () => openMemberPhotoGallery(allPhotos, 0));

  const sendMessageBtn = document.getElementById('member-send-message-btn');
  if (sendMessageBtn) {
    sendMessageBtn.addEventListener('click', async () => {
      const textEl = document.getElementById('member-message-text');
      const msgEl = document.getElementById('member-message-msg');
      const text = textEl.value.trim();
      if (!text) { msgEl.textContent = 'Napiš prosím nějaký text.'; return; }
      sendMessageBtn.disabled = true;
      msgEl.textContent = 'Odesílám…';
      const identity = memberModalIdentityPayload();
      try {
        const res = await fetch(API_BASE + '/api/panel-send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...identity, ooo_id: data.ooo_id, message: text }),
        });
        const resData = await res.json();
        if (!res.ok || !resData.ok) { msgEl.textContent = resData.error || 'Nepodařilo se odeslat.'; return; }
        msgEl.textContent = resData.dmOk ? 'Odesláno (Discord DM).' : 'Odesláno e-mailem (Discord DM se nepodařilo doručit).';
        textEl.value = '';
      } catch (err) {
        msgEl.textContent = 'Chyba: ' + err.message;
      } finally {
        sendMessageBtn.disabled = false;
      }
    });
  }

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
      if (!confirm(`Opravdu schválit dotazník uživatele ${data.jmeno || data.email || data.ooo_id}?`)) return;
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
      if (!confirm(`Opravdu zamítnout dotazník uživatele ${data.jmeno || data.email || data.ooo_id}?`)) return;
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
