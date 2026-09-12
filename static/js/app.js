/* =========================================================
   MovieSphere — app.js
   Global app shell: nav, search, mock data, API layer,
   movie card renderer, home page init, toasts.
   ========================================================= */

/* =========================================================
   1) CENTRALIZED MOCK DATA
   ---------------------------------------------------------
   Used ONLY when the Flask API is unavailable.
   Keep all mock data here — never inline in the UI.
   ========================================================= */
const MockData = (() => {
  const movies = [
    { id: 1,  title: 'Inception',          year: 2010, rating: 4.21, ratingsCount: 31256, genres: ['Sci-Fi','Thriller'], popularity: 98, tags: ['Mind-bending','Dream','Complex'] },
    { id: 2,  title: 'Interstellar',       year: 2014, rating: 4.15, ratingsCount: 28411, genres: ['Sci-Fi','Drama'],    popularity: 95, tags: ['Space','Emotional','Epic'] },
    { id: 3,  title: 'The Dark Knight',    year: 2008, rating: 4.29, ratingsCount: 42108, genres: ['Action','Crime'],    popularity: 99, tags: ['Gritty','Hero','Iconic'] },
    { id: 4,  title: 'Pulp Fiction',       year: 1994, rating: 4.18, ratingsCount: 29876, genres: ['Crime','Drama'],     popularity: 92, tags: ['Nonlinear','Cult','Dialogue'] },
    { id: 5,  title: 'The Matrix',         year: 1999, rating: 4.19, ratingsCount: 33450, genres: ['Sci-Fi','Action'],   popularity: 96, tags: ['Cyberpunk','Philosophical','Iconic'] },
    { id: 6,  title: 'Fight Club',         year: 1999, rating: 4.13, ratingsCount: 27590, genres: ['Drama','Thriller'],  popularity: 90, tags: ['Twist','Gritty','Cult'] },
    { id: 7,  title: 'Forrest Gump',       year: 1994, rating: 4.05, ratingsCount: 25112, genres: ['Drama','Romance'],   popularity: 88, tags: ['Heartwarming','Historic'] },
    { id: 8,  title: 'The Godfather',      year: 1972, rating: 4.32, ratingsCount: 36400, genres: ['Crime','Drama'],     popularity: 97, tags: ['Classic','Family','Crime'] },
    { id: 9,  title: 'Parasite',           year: 2019, rating: 4.24, ratingsCount: 18900, genres: ['Thriller','Drama'],  popularity: 89, tags: ['Social','Twist','Korean'] },
    { id: 10, title: 'Whiplash',           year: 2014, rating: 4.20, ratingsCount: 17240, genres: ['Drama','Music'],     popularity: 86, tags: ['Intense','Ambition'] },
    { id: 11, title: 'Spirited Away',      year: 2001, rating: 4.27, ratingsCount: 21430, genres: ['Animation','Adventure'], popularity: 91, tags: ['Fantasy','Studio Ghibli'] },
    { id: 12, title: 'The Prestige',       year: 2006, rating: 4.16, ratingsCount: 19870, genres: ['Drama','Thriller'],  popularity: 87, tags: ['Magic','Rivalry','Twist'] },
    { id: 13, title: 'Gladiator',          year: 2000, rating: 4.10, ratingsCount: 22340, genres: ['Action','Drama'],    popularity: 85, tags: ['Epic','Revenge'] },
    { id: 14, title: 'The Departed',       year: 2006, rating: 4.12, ratingsCount: 18120, genres: ['Crime','Thriller'],  popularity: 84, tags: ['Undercover','Crime'] },
    { id: 15, title: 'Django Unchained',   year: 2012, rating: 4.14, ratingsCount: 20560, genres: ['Western','Drama'],   popularity: 86, tags: ['Revenge','Stylized'] },
    { id: 16, title: 'Shutter Island',     year: 2010, rating: 4.06, ratingsCount: 17980, genres: ['Mystery','Thriller'], popularity: 82, tags: ['Twist','Psychological'] },
  ];

  const kpis = [
    { key: 'ratings',  label: 'Ratings Processed', value: 25000000, display: '25M+',  icon: 'fa-database' },
    { key: 'movies',   label: 'Movies',            value: 62423,    display: '62K+',  icon: 'fa-film' },
    { key: 'users',    label: 'Users',             value: 162541,   display: '162K+', icon: 'fa-users' },
    { key: 'genres',   label: 'Genres',            value: 20,       display: '20+',   icon: 'fa-tags' },
  ];

  const genres = [
    { name: 'Action',   count: 8472, icon: 'fa-explosion' },
    { name: 'Drama',    count: 16234, icon: 'fa-masks-theater' },
    { name: 'Comedy',   count: 11208, icon: 'fa-face-laugh' },
    { name: 'Sci-Fi',   count: 3910, icon: 'fa-rocket' },
    { name: 'Thriller', count: 6240, icon: 'fa-bolt' },
    { name: 'Romance',  count: 5480, icon: 'fa-heart' },
  ];

  const analytics = { kpis };

  return { movies, kpis, genres, analytics };
})();

/* =========================================================
   2) API LAYER
   ---------------------------------------------------------
   All fetch() calls live here. Each function falls back to
   mock data if the Flask route is unavailable, so the
   frontend can always be previewed standalone.
   ========================================================= */
const API = (() => {
  const BASE = ''; // same-origin

  async function request(path, { fallback, timeout = 4000 } = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(BASE + path, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(t);
      if (fallback !== undefined) return fallback;
      throw err;
    }
  }

  return {
    getMovies:           ()     => request('/api/movies',                  { fallback: MockData.movies }),
    searchMovies:        (q)    => request(`/api/movies/search?q=${encodeURIComponent(q)}`,
                                            { fallback: MockData.movies.filter(m =>
                                              m.title.toLowerCase().includes(q.toLowerCase())) }),
    getMovieDetails:     (id)   => request(`/api/movies/${id}`,
                                            { fallback: MockData.movies.find(m => String(m.id) === String(id)) }),
    getRecommendations:  (id, u)=> request(`/api/recommendations/${id}${u ? `?user=${u}` : ''}`,
                                            { fallback: MockData.movies.filter(m => String(m.id) !== String(id)).slice(0, 8) }),
    getAnalytics:        ()     => request('/api/analytics',               { fallback: MockData.analytics }),
    getUserInsights:     (u)    => request(`/api/user/${u}/insights`,      { fallback: null }),
    getCloudStatus:      ()     => request('/api/cloud/status',            { fallback: null }),
  };
})();

/* =========================================================
   3) UTILITIES
   ========================================================= */
const Utils = {
  formatNumber(n) {
    if (n == null) return '—';
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000)         return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  },

  formatRating(r) {
    return (typeof r === 'number') ? r.toFixed(2) : '—';
  },

  escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  },

  // Deterministic gradient from a string (poster fallback)
  gradientFor(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    const h2 = (h + 42) % 360;
    return `linear-gradient(150deg, hsl(${h} 55% 28%), hsl(${h2} 60% 14%))`;
  },

  prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },
};

/* =========================================================
   4) TOASTS
   ========================================================= */
const Toast = {
  host: null,
  init() { this.host = document.getElementById('toastHost'); },

  show(message, type = 'info', duration = 2800) {
    if (!this.host) return;
    const icons = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-triangle-exclamation' };
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i><span>${Utils.escapeHtml(message)}</span>`;
    this.host.appendChild(el);

    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 200);
    }, duration);
  },
};

/* =========================================================
   5) MOVIE CARD RENDERER
   ========================================================= */
const MovieCard = {
  render(movie, opts = {}) {
    const { match, showMatch = false, showFav = true } = opts;
    const safeTitle = Utils.escapeHtml(movie.title);
    const genres = (movie.genres || []).join(' • ');
    const rating = Utils.formatRating(movie.rating);
    const year = movie.year || '—';

    const posterInner = movie.poster
      ? `<img src="${Utils.escapeHtml(movie.poster)}" alt="${safeTitle} poster" loading="lazy">`
      : `<div class="poster-fallback" style="background:${Utils.gradientFor(movie.title)}">${safeTitle}</div>`;

    const matchBadge = (showMatch && match != null)
      ? `<span class="movie-card__match"><span class="movie-card__match-dot"></span>${match}% Match</span>`
      : `<span class="movie-card__meta"><span>${Utils.formatNumber(movie.ratingsCount)} ratings</span></span>`;

    return `
      <article class="movie-card" data-id="${movie.id}">
        <div class="movie-card__poster">
          ${posterInner}
          ${showFav ? `
            <button class="movie-card__fav" type="button"
                    aria-label="Add ${safeTitle} to favorites"
                    data-fav="${movie.id}">
              <i class="fa-regular fa-heart" aria-hidden="true"></i>
            </button>` : ''}
          <span class="movie-card__rating-badge">
            <i class="fa-solid fa-star" aria-hidden="true"></i>${rating}
          </span>
          <div class="movie-card__overlay">
            <a href="/movie/${movie.id}" class="btn btn--primary btn--sm">
              <i class="fa-solid fa-circle-info" aria-hidden="true"></i> View Details
            </a>
            <a href="/recommendations?movie=${movie.id}" class="btn btn--ghost btn--sm">
              <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Recommend
            </a>
          </div>
        </div>
        <div class="movie-card__body">
          <h3 class="movie-card__title" title="${safeTitle}">${safeTitle}</h3>
          <div class="movie-card__meta">
            <span>${year}</span>
            <span class="dot" aria-hidden="true"></span>
            <span>${Utils.escapeHtml(genres.split(' • ')[0] || '—')}</span>
          </div>
          <p class="movie-card__genres">${Utils.escapeHtml(genres)}</p>
          <div class="movie-card__footer">${matchBadge}</div>
        </div>
      </article>
    `;
  },

  renderGrid(container, movies, opts = {}) {
    if (!container) return;
    if (!movies || !movies.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = movies.map((m, i) => {
      const html = this.render(m, opts);
      // stagger entrance
      return html.replace('class="movie-card"', `class="movie-card" style="animation-delay:${Math.min(i * 40, 320)}ms"`);
    }).join('');
  },
};

/* =========================================================
   6) KPI COUNTER ANIMATION
   ========================================================= */
const Counter = {
  animate(el, target, { duration = 1200, formatter = Utils.formatNumber } = {}) {
    if (Utils.prefersReducedMotion()) {
      el.textContent = formatter(target);
      return;
    }
    const start = performance.now();
    const from = 0;

    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      const value = Math.round(from + (target - from) * eased);
      el.textContent = formatter(value);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  },
};

/* =========================================================
   7) NAVBAR
   ========================================================= */
const Navbar = {
  init() {
    const nav = document.getElementById('nav');
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');

    // Scroll state
    const onScroll = () => {
      if (window.scrollY > 12) nav.classList.add('is-scrolled');
      else nav.classList.remove('is-scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    // Mobile toggle
    if (toggle && links) {
      toggle.addEventListener('click', () => {
        const open = links.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        toggle.innerHTML = open
          ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
          : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
      });

      // Close on link click (mobile)
      links.addEventListener('click', e => {
        if (e.target.closest('a') && window.innerWidth <= 900) {
          links.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        }
      });

      // Close on Escape
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && links.classList.contains('is-open')) {
          links.classList.remove('is-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        }
      });
    }

    // Active link
    const page = document.body.dataset.page;
    document.querySelectorAll('.nav__link').forEach(a => {
      if (a.dataset.nav === page) a.classList.add('is-active');
    });
  },
};

/* =========================================================
   8) GLOBAL SEARCH OVERLAY
   ========================================================= */
const GlobalSearch = {
  overlay: null,
  input: null,
  results: null,
  openBtn: null,
  closeBtn: null,
  focusIndex: -1,

  init() {
    this.overlay  = document.getElementById('searchOverlay');
    this.input    = document.getElementById('globalSearchInput');
    this.results  = document.getElementById('globalSearchResults');
    this.openBtn  = document.getElementById('searchBtn');
    this.closeBtn = document.getElementById('searchClose');
    if (!this.overlay) return;

    this.openBtn?.addEventListener('click', () => this.open());
    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', e => {
      if (e.target === this.overlay) this.close();
    });

    // Keyboard
    document.addEventListener('keydown', e => {
      // Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.open();
      }
      if (e.key === 'Escape' && !this.overlay.hidden) this.close();

      if (!this.overlay.hidden) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.move(1); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); this.move(-1); }
        if (e.key === 'Enter') {
          const items = this.results.querySelectorAll('.search-result');
          if (items[this.focusIndex]) items[this.focusIndex].click();
        }
      }
    });

    // Debounced input
    let timer;
    this.input?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.run(this.input.value.trim()), 180);
    });
  },

  open() {
    this.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.input?.focus(), 30);
    this.renderHint();
  },

  close() {
    this.overlay.hidden = true;
    document.body.style.overflow = '';
    if (this.input) this.input.value = '';
    this.focusIndex = -1;
  },

  renderHint() {
    this.results.innerHTML = `
      <div class="state" style="border:none;background:transparent;padding:var(--s-6) var(--s-4)">
        <div class="state__icon"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></div>
        <p class="state__text">Start typing to search movies by title.</p>
      </div>`;
  },

  async run(query) {
    if (!query) { this.renderHint(); return; }

    this.results.innerHTML = Array.from({ length: 4 }).map(() =>
      `<div class="skeleton skeleton--row" style="margin:var(--s-2)"></div>`
    ).join('');

    let movies = [];
    try {
      movies = await API.searchMovies(query);
    } catch {
      movies = [];
    }

    if (!movies.length) {
      this.results.innerHTML = `
        <div class="state" style="border:none;background:transparent;padding:var(--s-6) var(--s-4)">
          <div class="state__icon"><i class="fa-regular fa-face-frown" aria-hidden="true"></i></div>
          <p class="state__title">No movies found</p>
          <p class="state__text">Try a different title.</p>
        </div>`;
      return;
    }

    this.focusIndex = -1;
    this.results.innerHTML = movies.slice(0, 8).map(m => {
      const poster = m.poster
        ? `<img src="${Utils.escapeHtml(m.poster)}" alt="" loading="lazy">`
        : `<div class="poster-fallback" style="background:${Utils.gradientFor(m.title)}"></div>`;
      return `
        <button class="search-result" type="button" data-id="${m.id}"
                onclick="location.href='/movie/${m.id}'">
          <span class="search-result__poster">${poster}</span>
          <span class="search-result__info">
            <span class="search-result__title">${Utils.escapeHtml(m.title)}</span>
            <span class="search-result__meta">
              <i class="fa-solid fa-star" aria-hidden="true"></i>
              ${Utils.formatRating(m.rating)} · ${m.year} · ${Utils.escapeHtml((m.genres||[])[0] || '')}
            </span>
          </span>
          <i class="fa-solid fa-arrow-right text-dim" aria-hidden="true"></i>
        </button>`;
    }).join('');
  },

  move(dir) {
    const items = this.results.querySelectorAll('.search-result');
    if (!items.length) return;
    this.focusIndex = (this.focusIndex + dir + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle('is-focused', i === this.focusIndex));
    items[this.focusIndex].scrollIntoView({ block: 'nearest' });
  },
};

/* =========================================================
   9) HOME PAGE
   ========================================================= */
const Home = {
  async init() {
    this.renderHeroStats();
    await this.renderTrending();
    await this.renderKPIs();
    this.renderGenres();
    this.bindFavorites();
  },

  async renderHeroStats() {
    const el = document.getElementById('heroStats');
    if (!el) return;

    let analytics;
    try {
      analytics = await API.getAnalytics();
    } catch {
      analytics = MockData.analytics;
    }

    const kpis = analytics?.kpis || MockData.kpis;
    const items = kpis.slice(0, 4);

    el.innerHTML = items.map(k => `
      <div class="hero__stat">
        <span class="hero__stat-value" data-count="${k.value}">0</span>
        <span class="hero__stat-label">${Utils.escapeHtml(k.label)}</span>
      </div>
    `).join('');

    el.querySelectorAll('[data-count]').forEach(node => {
      const target = Number(node.dataset.count);
      Counter.animate(node, target);
    });
  },

  async renderTrending() {
    const grid = document.getElementById('trendingGrid');
    if (!grid) return;

    try {
      const movies = await API.getMovies();
      const trending = [...(movies || [])]
        .sort((a, b) => (b.ratingsCount || 0) - (a.ratingsCount || 0))
        .slice(0, 8);

      if (!trending.length) {
        grid.innerHTML = this.emptyState('No trending movies available.');
        return;
      }
      MovieCard.renderGrid(grid, trending);
    } catch {
      grid.innerHTML = this.errorState();
    }
  },

  async renderKPIs() {
    const grid = document.getElementById('kpiGrid');
    if (!grid) return;

    let kpis = MockData.kpis;
    try {
      const data = await API.getAnalytics();
      if (data && Array.isArray(data.kpis) && data.kpis.length) {
        kpis = data.kpis;
      }
    } catch { /* fall back to mock */ }

    grid.innerHTML = kpis.map((k, i) => `
      <article class="kpi-card" style="animation-delay:${i * 60}ms">
        <div class="kpi-card__icon"><i class="fa-solid ${k.icon}" aria-hidden="true"></i></div>
        <div class="kpi-card__value" data-count="${k.value}">0</div>
        <div class="kpi-card__label">${Utils.escapeHtml(k.label)}</div>
      </article>
    `).join('');

    // Animate when scrolled into view
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.querySelectorAll('[data-count]').forEach(node => {
          Counter.animate(node, Number(node.dataset.count));
        });
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.35 });

    grid.querySelectorAll('.kpi-card').forEach(card => io.observe(card));
  },

  renderGenres() {
    const grid = document.getElementById('genreGrid');
    if (!grid) return;

    grid.innerHTML = MockData.genres.map((g, i) => `
      <a href="/explore?genre=${encodeURIComponent(g.name)}"
         class="genre-card" style="animation-delay:${i * 50}ms">
        <i class="fa-solid ${g.icon} genre-card__icon" aria-hidden="true"></i>
        <span class="genre-card__count">${Utils.formatNumber(g.count)} movies</span>
        <span class="genre-card__name">${Utils.escapeHtml(g.name)}</span>
      </a>
    `).join('');
  },

  bindFavorites() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-fav]');
      if (!btn) return;
      e.preventDefault();
      btn.classList.toggle('is-active');
      const icon = btn.querySelector('i');
      if (!icon) return;
      const active = btn.classList.contains('is-active');
      icon.className = active ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
      Toast.show(active ? 'Added to favorites' : 'Removed from favorites', 'success', 1800);
    });
  },

  emptyState(message) {
    return `
      <div class="state" style="grid-column:1/-1">
        <div class="state__icon"><i class="fa-regular fa-folder-open" aria-hidden="true"></i></div>
        <p class="state__title">Nothing to show</p>
        <p class="state__text">${Utils.escapeHtml(message)}</p>
      </div>`;
  },

  errorState() {
    return `
      <div class="state" style="grid-column:1/-1">
        <div class="state__icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
        <p class="state__title">Unable to load movies</p>
        <p class="state__text">Please try again in a moment.</p>
        <div class="state__actions">
          <button class="btn btn--ghost btn--sm" onclick="location.reload()">
            <i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Retry
          </button>
        </div>
      </div>`;
  },
};

/* =========================================================
   10) APP BOOTSTRAP
   ========================================================= */
const MovieSphere = {
  initHome() { Home.init(); },

  init() {
    Toast.init();
    Navbar.init();
    GlobalSearch.init();

    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  },
};

document.addEventListener('DOMContentLoaded', () => MovieSphere.init());

/* Expose for page-specific scripts and template usage */
window.MovieSphere = MovieSphere;
window.API = API;
window.MovieCard = MovieCard;
window.MockData = MockData;
window.Utils = Utils;
window.Toast = Toast;
window.Counter = Counter;