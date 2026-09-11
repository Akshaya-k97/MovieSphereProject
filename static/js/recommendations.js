/* =========================================================
   MovieSphere — recommendations.js
   Movie picker + hybrid recommendation results with
   match rings and "Why recommended?" panels.
   ========================================================= */

(() => {
  const state = {
    all: [],
    selected: null,
    recs: [],
    active: -1,
  };

  const els = {};

  function cacheEls() {
    els.input     = document.getElementById('recSearchInput');
    els.dropdown  = document.getElementById('recDropdown');
    els.go        = document.getElementById('recGoBtn');
    els.because   = document.getElementById('becauseSection');
    els.becauseCard = document.getElementById('becauseCard');
    els.loading   = document.getElementById('recLoading');
    els.results   = document.getElementById('recResults');
    els.grid      = document.getElementById('recGrid');
    els.subtitle  = document.getElementById('recSubtitle');
    els.empty     = document.getElementById('recEmpty');
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function gradientFor(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return `linear-gradient(150deg, hsl(${h} 55% 28%), hsl(${(h + 42) % 360} 60% 14%))`;
  }

  // Deterministic match % — replaced by backend score if provided
  function computeMatch(selected, candidate) {
    if (!selected) return 70;
    const a = new Set(selected.genres || []);
    const b = new Set(candidate.genres || []);
    const overlap = [...a].filter(g => b.has(g)).length;
    const maxOverlap = Math.max(a.size, 1);
    const genreScore = (overlap / maxOverlap) * 40;

    const ratingDiff = Math.abs((selected.rating || 3) - (candidate.rating || 3));
    const ratingScore = Math.max(0, 30 - ratingDiff * 12);

    const popScore = Math.min(20, ((candidate.popularity || 50) / 100) * 20);

    const base = 30;
    return Math.min(99, Math.round(base + genreScore + ratingScore + popScore));
  }

  // Pseudo explanations derived from genre overlap + ratings
  function computeReasons(selected, candidate) {
    const reasons = [];
    const a = new Set(selected.genres || []);
    const b = new Set(candidate.genres || []);
    const shared = [...a].filter(g => b.has(g));

    if (shared.length) {
      reasons.push(`Shares the ${shared.join(' & ')} genre${shared.length > 1 ? 's' : ''}`);
    }
    if ((candidate.rating || 0) >= 4.1) {
      reasons.push(`Highly rated by similar users (${candidate.rating.toFixed(2)})`);
    }
    if ((candidate.ratingsCount || 0) > 20000) {
      reasons.push('Popular across a large user base');
    }
    if (Math.abs((selected.year || 2000) - (candidate.year || 2000)) <= 10) {
      reasons.push('Released in a similar era');
    }
    if (!reasons.length) reasons.push('Recommended by collaborative filtering');
    return reasons.slice(0, 4);
  }

  function renderMatchRing(pct) {
    const offset = 100 - pct;
    const color = pct >= 85 ? '#22C55E' : pct >= 70 ? '#FBBF24' : '#9CA3AF';
    return `
      <svg class="match-ring" viewBox="0 0 36 36" width="46" height="46" aria-label="${pct}% match">
        <circle cx="18" cy="18" r="15.9155" fill="none"
                stroke="rgba(255,255,255,0.10)" stroke-width="3"/>
        <circle cx="18" cy="18" r="15.9155" fill="none"
                stroke="${color}" stroke-width="3"
                stroke-dasharray="100" stroke-dashoffset="${offset}"
                stroke-linecap="round"
                transform="rotate(-90 18 18)"/>
        <text x="18" y="18.6" text-anchor="middle" dominant-baseline="middle"
              font-size="9.5" font-weight="700" fill="#F5F5F5">${pct}</text>
      </svg>`;
  }

  function renderRecCard(movie, index) {
    const match = movie.match ?? computeMatch(state.selected, movie);
    const reasons = computeReasons(state.selected, movie);

    const posterInner = movie.poster
      ? `<img src="${escapeHtml(movie.poster)}" alt="${escapeHtml(movie.title)} poster" loading="lazy">`
      : `<div class="poster-fallback" style="background:${gradientFor(movie.title)}">${escapeHtml(movie.title)}</div>`;

    return `
      <article class="movie-card rec-card" data-id="${movie.id}" data-index="${index}">
        <div class="movie-card__poster">
          ${posterInner}
          ${renderMatchRing(match)}
          <span class="movie-card__rating-badge">
            <i class="fa-solid fa-star" aria-hidden="true"></i>${(movie.rating || 0).toFixed(2)}
          </span>
          <div class="movie-card__overlay">
            <a href="/movie/${movie.id}" class="btn btn--primary btn--sm">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i> View Details
            </a>
          </div>
        </div>
        <div class="movie-card__body">
          <h3 class="movie-card__title">${escapeHtml(movie.title)}</h3>
          <div class="movie-card__meta">
            <span>${movie.year || '—'}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>${escapeHtml((movie.genres || [])[0] || '')}</span>
          </div>
          <p class="movie-card__genres">${escapeHtml((movie.genres || []).join(' • '))}</p>
          <button class="why-btn" type="button"
                  aria-expanded="false"
                  data-why="${index}">
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i> Why recommended?
          </button>
          <div class="why-panel" id="why-${index}" hidden>
            <div class="why-panel__title">Signals used</div>
            <ul class="why-panel__list">
              ${reasons.map(r => `
                <li class="why-panel__item">
                  <i class="fa-solid fa-check" aria-hidden="true"></i>
                  <span>${escapeHtml(r)}</span>
                </li>`).join('')}
            </ul>
          </div>
        </div>
      </article>`;
  }

  /* ---------- Dropdown picker ---------- */
  function openDropdown(items) {
    if (!els.dropdown) return;
    if (!items.length) {
      els.dropdown.innerHTML = `<div class="rec-dropdown__empty">No movies found</div>`;
      els.dropdown.hidden = false;
      return;
    }
    els.dropdown.innerHTML = items.slice(0, 8).map(m => `
      <button class="rec-dropdown__item" type="button" role="option" data-id="${m.id}">
        <div class="search-result__poster">
          ${m.poster
            ? `<img src="${escapeHtml(m.poster)}" alt="" loading="lazy">`
            : `<div class="poster-fallback" style="background:${gradientFor(m.title)}"></div>`}
        </div>
        <div style="flex:1;min-width:0">
          <div class="rec-dropdown__title">${escapeHtml(m.title)}</div>
          <div class="rec-dropdown__meta">
            ${m.year || '—'} · ⭐ ${(m.rating || 0).toFixed(2)} · ${escapeHtml((m.genres || [])[0] || '')}
          </div>
        </div>
      </button>
    `).join('');
    els.dropdown.hidden = false;
    state.active = -1;
  }

  function closeDropdown() {
    if (els.dropdown) els.dropdown.hidden = true;
    state.active = -1;
  }

  function pickMovie(movie) {
    state.selected = movie;
    els.input.value = movie.title;
    els.go.disabled = false;
    closeDropdown();

    const posterInner = movie.poster
      ? `<img src="${escapeHtml(movie.poster)}" alt="${escapeHtml(movie.title)} poster">`
      : `<div class="poster-fallback" style="background:${gradientFor(movie.title)}">${escapeHtml(movie.title)}</div>`;

    els.becauseCard.innerHTML = `
      <div class="because-card__poster">${posterInner}</div>
      <div class="because-card__info">
        <div class="because-card__label">Selected Movie</div>
        <div class="because-card__title">${escapeHtml(movie.title)}</div>
        <div class="because-card__meta">
          <span>${movie.year || '—'}</span>
          <span class="dot"></span>
          <span><i class="fa-solid fa-star" style="color:var(--star)"></i> ${(movie.rating || 0).toFixed(2)}</span>
          <span class="dot"></span>
          <span>${escapeHtml((movie.genres || []).join(' • '))}</span>
        </div>
      </div>`;
    els.because.hidden = false;
  }

  async function generate() {
    if (!state.selected) return;

    els.empty.hidden = true;
    els.results.hidden = true;
    els.loading.hidden = false;

    try {
      const recs = await API.getRecommendations(state.selected.id);
      state.recs = Array.isArray(recs) ? recs.slice(0, 10) : [];

      // Simulate minimum visible loading to avoid flicker
      await new Promise(r => setTimeout(r, 400));

      els.loading.hidden = true;

      if (!state.recs.length) {
        els.empty.hidden = false;
        return;
      }

      els.grid.innerHTML = state.recs.map((m, i) => renderRecCard(m, i)).join('');
      els.subtitle.textContent =
        `Ranked by hybrid score · ${state.recs.length} results · CF 70% / CB 30%`;
      els.results.hidden = false;
      els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      els.loading.hidden = true;
      els.empty.hidden = false;
      els.empty.querySelector('.state__title').textContent = 'Unable to generate recommendations';
      els.empty.querySelector('.state__text').textContent = 'Please try again.';
      Toast.show('Unable to generate recommendations', 'error');
    }
  }

  /* ---------- Events ---------- */
  function bind() {
    els.input?.addEventListener('focus', () => {
      if (!els.input.value) openDropdown(state.all);
    });

    els.input?.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      const list = !q
        ? state.all
        : state.all.filter(m => m.title.toLowerCase().includes(q));
      openDropdown(list);
    });

    els.input?.addEventListener('keydown', e => {
      const items = els.dropdown?.querySelectorAll('.rec-dropdown__item') || [];
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.active = (state.active + 1) % items.length;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.active = (state.active - 1 + items.length) % items.length;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[state.active]) items[state.active].click();
        return;
      } else if (e.key === 'Escape') {
        closeDropdown();
        return;
      } else {
        return;
      }

      items.forEach((el, i) => el.classList.toggle('is-focused', i === state.active));
      items[state.active]?.scrollIntoView({ block: 'nearest' });
    });

    els.dropdown?.addEventListener('click', e => {
      const item = e.target.closest('.rec-dropdown__item');
      if (!item) return;
      const movie = state.all.find(m => String(m.id) === item.dataset.id);
      if (movie) pickMovie(movie);
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.rec-select')) closeDropdown();
    });

    els.go?.addEventListener('click', generate);

    // Why recommended? toggles
    els.grid?.addEventListener('click', e => {
      const btn = e.target.closest('.why-btn');
      if (!btn) return;
      const idx = btn.dataset.why;
      const panel = document.getElementById(`why-${idx}`);
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (panel) panel.hidden = open;
    });

    // Pre-select from ?movie= query param
    const p = new URLSearchParams(location.search);
    const preId = p.get('movie');
    if (preId) {
      const m = state.all.find(x => String(x.id) === String(preId));
      if (m) {
        pickMovie(m);
        generate();
      }
    }
  }

  async function init() {
    cacheEls();
    try {
      const data = await API.getMovies();
      state.all = Array.isArray(data) ? data : [];
      bind();
    } catch {
      Toast.show('Unable to load movies', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();