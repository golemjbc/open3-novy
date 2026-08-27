// Věková brána (2026-08-27, na žádost - "web je jen pro osoby starší 18 let, obsah je
// pro dospělé"). Jednou potvrzeno = uloží se do localStorage (stejný vzorec jako
// přihlášení v auth.js), příště se už neptá - NENÍ potřeba cookie lišta, localStorage
// nespadá pod cookie souhlas.
//
// Musí být PRVNÍ věc v <body>, ne na konci jako auth.js/profile-modal.js - potřebuje
// zakrýt obsah stránky dřív, než se stačí vykreslit (position:fixed překryv, viz CSS).
(function () {
  var KEY = 'oooAgeConfirmed';
  if (localStorage.getItem(KEY) === '1') return;

  var overlay = document.createElement('div');
  overlay.className = 'age-gate-overlay';
  overlay.innerHTML =
    '<div class="age-gate-card">' +
      '<img src="assets/images/OOOlogo.png" alt="OOO logo" class="age-gate-logo">' +
      '<h2>OOO Community</h2>' +
      '<p>Tenhle web obsahuje materiály pro dospělé a je určený výhradně osobám starším 18 let.</p>' +
      '<div class="age-gate-actions">' +
        '<button type="button" class="btn btn-primary" id="age-gate-yes">Ano, je mi 18 a více</button>' +
        '<button type="button" class="btn btn-outline" id="age-gate-no">Ne, je mi méně</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector('#age-gate-yes').addEventListener('click', function () {
    localStorage.setItem(KEY, '1');
    overlay.remove();
  });
  overlay.querySelector('#age-gate-no').addEventListener('click', function () {
    window.location.href = 'https://www.google.com';
  });
})();
