// Capsule browser shim — catch unhandled frontend errors and ship them to the
// app's /ingest route, which freezes a crash capsule via capsule.reportError().
(function () {
  function ship(error, kind) {
    try {
      fetch('/ingest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: (error && error.name) || 'Error',
          message: (error && error.message) || String(error) || kind,
          stack: error && error.stack,
          url: location.pathname + ' (browser)',
        }),
      }).then(function () {
        if (window.__capsuleLog) window.__capsuleLog('frontend error captured → capsule', 'cap');
      });
    } catch (_) {}
  }
  window.addEventListener('error', function (e) {
    ship(e.error || { name: 'Error', message: e.message }, 'window.onerror');
  });
  window.addEventListener('unhandledrejection', function (e) {
    ship(e.reason || { name: 'Error', message: 'unhandledrejection' }, 'unhandledrejection');
  });
})();
