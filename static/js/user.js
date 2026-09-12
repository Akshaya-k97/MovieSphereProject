/* =========================================================
   MovieSphere — user.js
   User profile analytics with a per-user picker.
   API: GET /api/user/<id>/insights
   Falls back to deterministic mock profiles so the page
   renders standalone.
   ========================================================= */

(() => {

  /* ---------------------------------------------------------
     1) DETERMINISTIC MOCK PROFILES
     Same userId always produces the same profile.
     --------------------------------------------------------- */
  const MockProfiles = (() => {
    const USER_COUNT = 10;
    const GENRES = ['Sci-Fi','Drama','Action','Comedy','Thriller','Romance','Crime','Animation'];

    // Small deterministic pseudo-random in [0,1)
    function rand(seed) {
      const x = Math.sin(seed * 9301 + 49297) * 233280;
      return x - Math.floor(x);
    }

    function profileFor(userId) {
      const id = Number(userId) || 1;
      const r = (n) => rand(id * 7919 + n);

      const favoriteGenre  = GENRES[Math.floor(r(1) * GENRES.length)];
      let   mostActive     = GENRES[Math.floor(r(2) * GENRES.length)];
      if (mostActive === favoriteGenre) {
        mostActive = GENRES[(GENRES.indexOf(mostActive) + 1) % GENRES.length];
      }

      const moviesRated = 60 + Math.floor(r(3) * 220);          // 60 .. 279
      const avgRating   = 3.3 + r(4) * 1.3;                     // 3.3 .. 4.6

      // Favorite genres distribution (donut)
      const favoriteGenres = GENRES
        .map((g, i) => ({
          genre: g,
          count: Math.round(6 + r(20 + i) * (g === favoriteGenre ? 70 : 40)),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Rating behaviour histogram (5★ → 1★), shaped by avgRating
      const highBias = avgRating / 5;
      const weights = [
        Math.pow(highBias, 2) * 1.8 + 0.05,                          // 5★
        highBias * 1.3 + 0.10,                                       // 4★
        0.45 + (1 - Math.abs(avgRating - 3) / 2) * 0.35,             // 3★
        (1 - highBias) * 0.9 + 0.05,                                 // 2★
        Math.pow(1 - highBias, 2) * 1.4 + 0.02,                      // 1★
      ];
      const sum = weights.reduce((s, w) => s + w, 0);
      const ratingBehaviour = weights.map(w => Math.round((w / sum) * moviesRated));

      return {
        userId: id,
        displayName: `User #${id}`,
        moviesRated,
        avgRating: Number(avgRating.toFixed(2)),
        favoriteGenre,
        mostActiveGenre: mostActive,
        favoriteGenres,
        ratingBehaviour,
      };
    }

    return { USER_COUNT, profileFor };
  })();

  /* ---------------------------------------------------------
     2) STATE & ELS
     --------------------------------------------------------- */
  const state = {
    users: [],
    currentUserId: 1,
    charts: {},
  };

  const els = {};

  function cacheEls() {
    els.select    = document.getElementById('userSelect');
    els.avatar    = document.getElementById('profileAvatar');
    els.stats     = document.getElementById('profileStats');
    els.recGrid   = document.getElementById('userRecGrid');
    els.recSub    = document.getElementById('recSubtitle');
  }

  /* ---------------------------------------------------------
     3) HELPERS
     --------------------------------------------------------- */
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function chartDefaults() {
    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
  }

  const PALETTE = [
    '#E50914', '#F97316', '#FBBF24', '#22C55E', '#38BDF8',
    '#6366F1', '#A855F7', '#EC4899',
  ];

  /* ---------------------------------------------------------
     4) DATA FETCH (with fallback)
     --------------------------------------------------------- */
  async function fetchInsights(userId) {
    try {
      const data = await API.getUserInsights(userId);
      if (data && typeof data === 'object' && data.userId) return data;
    } catch {
      // fall through
    }
    return MockProfiles.profileFor(userId);
  }

  /* ---------------------------------------------------------
     5) RENDER — HEADER + STATS
     --------------------------------------------------------- */
  function renderHeader(profile) {
    if (els.avatar) els.avatar.textContent = `U${profile.userId}`;
  }

  function renderStats(profile) {
    if (!els.stats) return;

    const stats = [
      { icon: 'fa-clapperboard',   label: 'Movies Rated',       value: profile.moviesRated,                  format: v => String(v) },
      { icon: 'fa-star',           label: 'Avg Rating Given',   value: profile.avgRating,                    format: v => `${v.toFixed(2)} ★` },
      { icon: 'fa-heart',          label: 'Favorite Genre',     value: profile.favoriteGenre,                format: v => v, text: true },
      { icon: 'fa-chart-simple',   label: 'Most Active Genre',  value: profile.mostActiveGenre,              format: v => v, text: true },
    ];

    els.stats.innerHTML = stats.map((s, i) => `
      <article class="profile-stat" style="animation-delay:${i * 50}ms">
        <div class="profile-stat__icon"><i class="fa-solid ${s.icon}" aria-hidden="true"></i></div>
        <div class="profile-stat__value" data-stat="${i}">${s.text ? escapeHtml(s.value) : '0'}</div>
        <div class="profile-stat__label">${escapeHtml(s.label)}</div>
      </article>
    `).join('');

    // Animate numeric counters
    stats.forEach((s, i) => {
      if (s.text) return;
      const node = els.stats.querySelector(`[data-stat="${i}"]`);
      if (!node) return;
      if (Number.isInteger(s.value)) {
        Counter.animate(node, s.value, { formatter: s.format });
      } else {
        animateFloat(node, s.value, s.format);
      }
    });
  }

  function animateFloat(el, target, formatter) {
    if (Utils.prefersReducedMotion()) {
      el.textContent = formatter(target);
      return;
    }
    const start = performance.now();
    const duration = 1100;
    const from = 0;
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(from + (target - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------
     6) RENDER — CHARTS
     --------------------------------------------------------- */
  function renderFavoriteGenres(profile) {
    const ctx = document.getElementById('chartFavGenres');
    if (!ctx) return;

    const labels = profile.favoriteGenres.map(g => g.genre);
    const data   = profile.favoriteGenres.map(g => g.count);

    const cfg = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: PALETTE,
          borderColor: '#0F1117',
          borderWidth: 2,
          hoverOffset: 8,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: {
            display: true,
            position: 'right',
            labels: {
              color: '#9CA3AF',
              padding: 10,
              boxWidth: 8, boxHeight: 8,
              usePointStyle: true,
              font: { size: 11, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: '#171A23',
            borderColor: 'rgba(255,255,255,0.10)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleColor: '#F5F5F5',
            bodyColor: '#9CA3AF',
            displayColors: false,
            callbacks: {
              label: c => {
                const total = c.dataset.data.reduce((s, v) => s + v, 0);
                const pct = ((c.raw / total) * 100).toFixed(1);
                return `${c.label}: ${c.raw} movies (${pct}%)`;
              },
            },
          },
        },
      },
    };

    if (state.charts.favGenres) {
      state.charts.favGenres.data = cfg.data;
      state.charts.favGenres.update();
    } else {
      state.charts.favGenres = new Chart(ctx, cfg);
    }
  }

  function renderRatingBehaviour(profile) {
    const ctx = document.getElementById('chartRatingBehaviour');
    if (!ctx) return;

    const labels = ['5 ★', '4 ★', '3 ★', '2 ★', '1 ★'];
    const data = profile.ratingBehaviour;

    const cfg = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: ['#E50914', '#F97316', '#FBBF24', '#38BDF8', '#6B7280'],
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 52,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#171A23',
            borderColor: 'rgba(255,255,255,0.10)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleColor: '#F5F5F5',
            bodyColor: '#9CA3AF',
            displayColors: false,
            callbacks: {
              label: c => {
                const total = c.dataset.data.reduce((s, v) => s + v, 0);
                const pct = ((c.raw / total) * 100).toFixed(1);
                return `${c.raw} ratings (${pct}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: '#9CA3AF' },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            border: { display: false },
            ticks: { color: '#6B7280' },
          },
        },
      },
    };

    if (state.charts.ratingBehaviour) {
      state.charts.ratingBehaviour.data = cfg.data;
      state.charts.ratingBehaviour.update();
    } else {
      state.charts.ratingBehaviour = new Chart(ctx, cfg);
    }
  }

  /* ---------------------------------------------------------
     7) RENDER — RECOMMENDATIONS
     --------------------------------------------------------- */
  function scoreForUser(movie, profile) {
    const genres = movie.genres || [];
    let score = 0;

    if (genres.includes(profile.favoriteGenre))  score += 40;
    if (genres.includes(profile.mostActiveGenre)) score += 15;

    // Reward higher ratings
    score += (movie.rating || 0) * 8;

    // Small deterministic bonus per user so different users see different orders
    const seed = (profile.userId * 9301 + (movie.id || 0) * 49297) % 1000;
    score += (seed / 1000) * 10;

    return score;
  }

async function renderRecommendations(profile) {
    if (!els.recGrid) return;

    // Tier 1: real ALS recommendations from the backend.
    let ranked = null;
    try {
      const res = await fetch(`/api/user/${profile.userId}/recommendations?limit=6`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length) ranked = data;
      }
    } catch { /* fall through to heuristic */ }

    // Tier 2: heuristic on the embedded mock list.
    if (!ranked) {
      const all = MockData.movies || [];
      ranked = [...all]
        .map(m => ({ m, s: scoreForUser(m, profile) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 6)
        .map(x => x.m);
    }

    if (!ranked.length) {
      els.recGrid.innerHTML = `
        <div class="state" style="grid-column:1/-1">
          <div class="state__icon"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></div>
          <p class="state__title">No recommendations yet</p>
          <p class="state__text">There isn't enough rating history for this profile.</p>
        </div>`;
      return;
    }

    MovieCard.renderGrid(els.recGrid, ranked);

    if (els.recSub) {
      const src = (ranked[0] && typeof ranked[0].match === 'number')
        ? 'ALS collaborative filtering'
        : 'genre-based heuristic';
      els.recSub.textContent =
        `Top 6 picks for ${profile.displayName} · favourite genre: ${profile.favoriteGenre} · ` +
        `based on ${profile.moviesRated} rated movies (avg ${profile.avgRating.toFixed(2)}★) · source: ${src}`;
    }
}

  /* ---------------------------------------------------------
     8) ORCHESTRATION
     --------------------------------------------------------- */
  async function loadUser(userId) {
    state.currentUserId = Number(userId) || 1;

    // Loading state on the picker + skeletons
    const picker = document.querySelector('.user-picker');
    picker?.classList.add('is-loading');

    els.stats.innerHTML = `
      <div class="skeleton skeleton--kpi"></div>
      <div class="skeleton skeleton--kpi"></div>
      <div class="skeleton skeleton--kpi"></div>
      <div class="skeleton skeleton--kpi"></div>`;

    els.recGrid.innerHTML = Array.from({ length: 6 }).map(() =>
      `<div class="skeleton skeleton--card"></div>`
    ).join('');

    try {
      const profile = await fetchInsights(state.currentUserId);

      renderHeader(profile);
      renderStats(profile);
      renderFavoriteGenres(profile);
      renderRatingBehaviour(profile);
      await renderRecommendations(profile);

      // Persist in URL so refresh keeps the chosen user
      const url = new URL(location.href);
      url.searchParams.set('user', profile.userId);
      history.replaceState(null, '', url);
    } catch {
      els.stats.innerHTML = `
        <div class="state" style="grid-column:1/-1">
          <div class="state__icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
          <p class="state__title">Unable to load profile</p>
          <p class="state__text">Please try again.</p>
        </div>`;
      els.recGrid.innerHTML = '';
    } finally {
      picker?.classList.remove('is-loading');
    }
  }

  /* ---------------------------------------------------------
     9) PICKER
     --------------------------------------------------------- */
  function buildPicker() {
    if (!els.select) return;
    const count = MockProfiles.USER_COUNT;
    els.select.innerHTML = Array.from({ length: count }, (_, i) => {
      const id = i + 1;
      return `<option value="${id}">User #${id}</option>`;
    }).join('');

    els.select.addEventListener('change', e => loadUser(e.target.value));
  }

  /* ---------------------------------------------------------
     10) INIT
     --------------------------------------------------------- */
  function init() {
    if (!document.getElementById('profileStats')) return;
    if (!window.Chart) {
      console.warn('Chart.js not loaded');
      return;
    }

    cacheEls();
    chartDefaults();
    buildPicker();

    // Read ?user= from URL, else default to 1
    const url = new URL(location.href);
    const initial = Number(url.searchParams.get('user')) || 1;
    if (els.select) els.select.value = String(initial);

    loadUser(initial);
  }

  document.addEventListener('DOMContentLoaded', init);

})();