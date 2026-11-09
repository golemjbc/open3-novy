// Google Analytics (G-9387YV40M7) - načte se AŽ po souhlasu návštěvníka (cookies _ga).
// Souhlas se pamatuje v localStorage (oooAnalyticsConsent = 'yes' | 'no').
// Dřív (leden 2026) byla značka vložená natvrdo v každé stránce a při novém designu
// (11. 8. 2026) se ztratila; teď je na jednom místě. Admin stránky ji nenačítají.
(function () {
  var GA_ID = 'G-9387YV40M7';
  var KEY = 'oooAnalyticsConsent';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGA() {
    if (window.__oooGaLoaded) return;
    window.__oooGaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  function showBanner() {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Souhlas s měřením návštěvnosti');
    bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:560px;margin:0 auto;' +
      'background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--border,#dcdce6);border-radius:12px;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.18);padding:14px 16px;font:14px/1.45 system-ui,sans-serif;';
    bar.innerHTML = '<div style="margin-bottom:10px">Pro zlepšování webu měříme návštěvnost přes Google Analytics (cookies). Spustíme to jen s tvým souhlasem.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button type="button" data-v="no" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border,#dcdce6);background:transparent;color:inherit;cursor:pointer">Nesouhlasím</button>' +
      '<button type="button" data-v="yes" style="padding:8px 14px;border-radius:8px;border:0;background:var(--primary,#a23a6a);color:#fff;cursor:pointer">Souhlasím</button></div>';
    bar.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
      if (!v) return;
      set(v);
      bar.remove();
      if (v === 'yes') loadGA();
    });
    document.body.appendChild(bar);
  }

  var c = get();
  if (c === 'yes') loadGA();
  else if (c !== 'no') {
    if (document.body) showBanner();
    else document.addEventListener('DOMContentLoaded', showBanner);
  }
})();
