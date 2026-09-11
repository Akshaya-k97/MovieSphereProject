/* =========================================================
   MovieSphere — explore.js
   Client-side filtering, sorting, pagination for Explore.
   ========================================================= */

(() => {
  const PAGE_SIZE = 12;

  const state = {
    all: [],
    filtered: [],
    shown: 0,
    filters: { q: '', genre: '', minRating: 0, year: '', sort: 'rating' },
  };

  const els = {};

  function cacheEls() {
    els.grid       = document.getElementById('exploreGrid');
    els.meta       = document.getElementById('resultsMeta');
    els.search     = document.getElementById('exploreSearch');
    els.clear      = document.getElementById('searchClear');
    els.genre      = document.getElementById('filterGenre');
    els.rating     = document.getElementById('filterRating');
    els.year       = document.getElementById('filterYear');
    els.sort       = document.getElementById('sortBy');
    els.reset      = document.getElementById('filterReset');
    els.loadMore   = document.getElementById('loadMoreBtn');
    els.loadWrap   = document.getElementById('loadMoreWrap');
  }

  function readUrlParams() {
    const p = new URLSearchParams(location.search);
    if (p.get('q'))      state.filters.q         = p.get('q');
    if (p.get('genre'))  state.filters.genre     = p.get('genre');
    if (p.get('rating')) state.filters.minRating = parseFloat(p.get('rating')) || 0;
    if (p.get('year'))   state.filters.year      = p.get('year');
    if (p.get('sort'))   state.filters.sort      = p.get('sort');
  }

  function syncInputsFromState() {
    if (els.search) els.search.value = state.filters.q;
    if (els.genre)  els.genre.value  = state.filters.genre;
    if (els.rating) els.rating.value = String(state.filters.minRating);
    if (els.year)   els.year.value   = state.filters.year;
    if (els.sort)   els.sort.value   = state.filters.sort;
  }

  function applyFilters() {
    const f = state.filters;
    const q = f.q.trim().toLowerCase();

    let list = state.all.filter(m => {
      if (q && !m.title.toLowerCase().includes(q)) return false;

      if (f.genre && !(m.genres || []).some(g => g.toLowerCase() === f.genre.toLowerCase())) {
        return false;
      }

      if (f.minRating && (m.rating || 0) < f.minRating) return false;

      if (f.year) {
        const y = Number(f.year);
        const my = Number(m.year) || 0;
        if (y === 0 && my >= 1980) return false;
        if (y === 1980 && (my < 1980 || my >= 1990)) return false;
        if (y === 1990 && (my < 1990 || my >= 2000)) return false;
        if (y === 2000 && (my < 2000 || my >= 2010)) return false;
        if (y === 2010 && (my < 2010 || my >= 2020)) return false;
        if (y === 2020 && my < 2020) return false;
      }
      return true;
    });

    switch (f.sort) {
      case 'rating':  list.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      case 'popular': list.sort((a, b) => (b.ratingsCount || 0) - (a.ratingsCount || 0)); break;
      case 'newest':  list.sort((a, b) => (b.year || 0) - (a.year || 0)); break;
      case 'oldest':  list.sort((a, b) => (a.year || 0) - (b.year || 0)); break;
      case 'alpha':   list.sort((a, b) => a.title.localeCompare(b.title)); break;
    }

    state.filtered = list;
    state.shown = 0;
    render(true);
  }

  function render(reset = false) {
    if (reset) els.grid.innerHTML = '';

    if (!state.filtered.length) {
      els.grid.innerHTML = '';
      els.grid.insertAdjacentHTML('beforeend', emptyState());
      els.meta.innerHTML = `<span>No matches</span>`;
      els.loadWrap.hidden = true;
      return;
    }

    const next = state.filtered.slice(state.shown, state.shown + PAGE_SIZE);
    const frag = document.createElement('div');
    frag.innerHTML = next.map((m, i) =>
      MovieCard.render(m).replace(
        'class="movie-card"',
        `class="movie-card" style="animation-delay:${Math.min(i * 30, 240)}ms"`
      )
    ).join('');
    [...frag.children].forEach(el => els.grid.appendChild(el));

    state.shown += next.length;

    const total = state.filtered.length;
    els.meta.innerHTML = `<span>Showing <strong>${state.shown}</strong> of <strong>${total}</strong> movies</span>`;
    els.loadWrap.hidden = state.shown >= total;
  }

  function emptyState() {
    return `
      <div class="state" style="grid-column:1/-1">
        <div class="state__icon"><i class="fa-regular fa-face-frown" aria-hidden="true"></i></div>
        <p class="state__title">No movies found</p>
        <p class="state__text">Try changing your search or filters.</p>
        <div class="state__actions">
          <button class="btn btn--ghost btn--sm" id="emptyReset">
            <i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset filters
          </button>
        </div>
      </div>`;
  }

  function debounce(fn, wait = 200) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
  }

  function bind() {
    const onSearch = debounce(v => {
      state.filters.q = v;
      els.clear.hidden = !v;
      applyFilters();
    }, 180);

    els.search?.addEventListener('input', e => onSearch(e.target.value));
    els.search?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); state.filters.q = e.target.value; applyFilters(); }
    });

    els.clear?.addEventListener('click', () => {
      els.search.value = '';
      state.filters.q = '';
      els.clear.hidden = true;
      applyFilters();
      els.search.focus();
    });

    els.genre?.addEventListener('change',  e => { state.filters.genre     = e.target.value; applyFilters(); });
    els.rating?.addEventListener('change', e => { state.filters.minRating = parseFloat(e.target.value); applyFilters(); });
    els.year?.addEventListener('change',   e => { state.filters.year      = e.target.value; applyFilters(); });
    els.sort?.addEventListener('change',   e => { state.filters.sort      = e.target.value; applyFilters(); });

    els.reset?.addEventListener('click', () => {
      state.filters = { q: '', genre: '', minRating: 0, year: '', sort: 'rating' };
      syncInputsFromState();
      if (els.clear) els.clear.hidden = true;
      applyFilters();
    });

    els.loadMore?.addEventListener('click', () => render(false));

    els.grid?.addEventListener('click', e => {
      const r = e.target.closest('#emptyReset');
      if (r) els.reset?.click();
    });

    // Favorites (reuse from app.js pattern)
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-fav]');
      if (!btn) return;
      e.preventDefault();
      btn.classList.toggle('is-active');
      const icon = btn.querySelector('i');
      if (!icon) return;
      const active = btn.classList.contains('is-active');
      icon.className = active ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
      Toast.show(active ? 'Added to favorites' : 'Removed from favorites', 'success', 1600);
    });
  }

  async function init() {
    cacheEls();
    readUrlParams();
    syncInputsFromState();
    bind();

    try {
      const data = await API.getMovies();
      state.all = Array.isArray(data) ? data : [];
      applyFilters();
    } catch {
      els.grid.innerHTML = `
        <div class="state" style="grid-column:1/-1">
          <div class="state__icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
          <p class="state__title">Unable to load movies</p>
          <p class="state__text">Please try again.</p>
        </div>`;
      els.meta.innerHTML = '';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();