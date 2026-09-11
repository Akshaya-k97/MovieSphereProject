/* =========================================================
   MovieSphere — cloud.js
   Fetches cloud status from /api/cloud/status, falls back to
   clearly-labelled sample values when the API is unavailable.
   ========================================================= */

(() => {

  /* ---------------------------------------------------------
     MOCK DATA — used only when /api/cloud/status is missing.
     Clearly marked so it's obvious this is preview data.
     --------------------------------------------------------- */
  const MockCloudStatus = {
    storage: {
      provider: 'Amazon S3',
      status: 'connected',
      region: 'ap-south-1',
      files: 12,
      size: '1.2 GB',
      buckets: {
        datasets: 'movielens/*.csv',
        processed: 'processed/parquet/',
        models: 'models/als_output/',
      },
    },
    application: {
      status: 'online',
      backend: 'Flask',
      processing: 'PySpark',
      storage: 'Amazon S3',
      environment: 'Local development',
    },
  };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ---------- Status pill ---------- */
  function setStatus(el, state, label) {
    if (!el) return;
    el.dataset.state = state;
    const labelEl = el.querySelector('.status-pill__label');
    if (labelEl) labelEl.textContent = label;
  }

  /* ---------- Render ---------- */
  function renderStorage(storage) {
    if (!storage) return;

    const filesEl  = document.getElementById('metricFiles');
    const sizeEl   = document.getElementById('metricSize');
    const regionEl = document.getElementById('metricRegion');
    const statusEl = document.getElementById('storageStatus');

    if (filesEl)  filesEl.textContent = storage.files ?? '—';
    if (sizeEl)   sizeEl.textContent  = storage.size  ?? '—';
    if (regionEl) regionEl.textContent = storage.region ?? '—';

    const connected = String(storage.status).toLowerCase() === 'connected';
    setStatus(
      statusEl,
      connected ? 'online' : 'offline',
      connected ? 'Connected' : 'Unavailable'
    );
  }

  function renderApplication(app) {
    if (!app) return;

    const envEl    = document.getElementById('appEnv');
    const statusEl = document.getElementById('appStatus');

    if (envEl && app.environment) envEl.textContent = app.environment;

    const online = String(app.status).toLowerCase() === 'online';
    setStatus(
      statusEl,
      online ? 'online' : 'offline',
      online ? 'Online' : 'Offline'
    );
  }

  /* ---------- Fetch + fallback ---------- */
  async function loadStatus() {
    let data = null;

    try {
      // Uses the shared API layer; falls back to null when route is missing.
      data = await API.getCloudStatus();
    } catch {
      data = null;
    }

    if (!data || (!data.storage && !data.application)) {
      data = MockCloudStatus;
    }

    renderStorage(data.storage);
    renderApplication(data.application);
  }

  /* ---------- Init ---------- */
  function init() {
    if (!document.getElementById('cloudCards')) return;
    loadStatus();

    // Re-check every 30s (silent — no flash if unchanged)
    setInterval(loadStatus, 30000);
  }

  document.addEventListener('DOMContentLoaded', init);

})();