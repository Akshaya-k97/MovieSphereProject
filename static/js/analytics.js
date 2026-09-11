/* =========================================================
   MovieSphere — analytics.js
   Aggregates MockData into chart-ready datasets, renders
   Chart.js visualizations, and drives the filter toolbar.
   ========================================================= */

(() => {

  /* ---------- Palette ---------- */
  const COLORS = {
    accent:  '#E50914',
    star:    '#FBBF24',
    text:    '#9CA3AF',
    dim:     '#6B7280',
    grid:    'rgba(255,255,255,0.05)',
    tooltip: '#171A23',
    success: '#22C55E',
    info:    '#6366F1',
  };
  const PALETTE = [
    '#E50914', '#F97316', '#FBBF24', '#22C55E', '#38BDF8',
    '#6366F1', '#A855F7', '#EC4899', '#14B8A6', '#94A3B8',
  ];

  /* ---------- State ---------- */
  const state = {
    movies: [],
    filters: { genre: '', year: '', minRating: 0 },
    charts: {},
  };

  const els = {};

  /* =========================================================
     AGGREGATIONS
     ========================================================= */

  function filteredMovies() {
    const f = state.filters;
    return state.movies.filter(m => {
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
  }

  function countByGenre(movies, limit = 8) {
    const counts = {};
    movies.forEach(m => (m.genres || []).forEach(g => {
      counts[g] = (counts[g] || 0) + 1;
    }));
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  function avgRatingByGenre(movies, limit = 8) {
    const sums = {}, counts = {};
    movies.forEach(m => (m.genres || []).forEach(g => {
      sums[g]   = (sums[g] || 0) + (m.rating || 0);
      counts[g] = (counts[g] || 0) + 1;
    }));
    return Object.entries(sums)
      .map(([g, s]) => [g, s / counts[g]])
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  function ratingDistribution(movies) {
    // Distribute each movie's total ratings across 5..1 stars
    // using a Gaussian-like weight derived from its average rating.
    const dist = [0, 0, 0, 0, 0]; // index 0 → 5 stars, index 4 → 1 star
    movies.forEach(m => {
      const a = Math.max(0.5, Math.min(5, m.rating || 3));
      const weights = [
        Math.exp(-Math.pow(5 - a, 2) / 0.6),
        Math.exp(-Math.pow(4 - a, 2) / 0.6),
        Math.exp(-Math.pow(3 - a, 2) / 0.6),
        Math.exp(-Math.pow(2 - a, 2) / 0.6),
        Math.exp(-Math.pow(1 - a, 2) / 0.6),
      ];
      const total = weights.reduce((s, w) => s + w, 0);
      const count = m.ratingsCount || 1000;
      weights.forEach((w, i) => {
        dist[i] += Math.round((w / total) * count);
      });
    });
    return dist;
  }

  function mostRatedMovies(movies, limit = 10) {
    return [...movies]
      .sort((a, b) => (b.ratingsCount || 0) - (a.ratingsCount || 0))
      .slice(0, limit);
  }

  // Deterministic sample timeline (Jan 2018 – Dec 2019) scaled by scope.
  function ratingActivity(movies) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const pattern = [0.60, 0.72, 0.81, 0.68, 0.79, 0.92, 0.88, 0.95, 0.84, 0.91, 0.97, 1.00];
    const years = [2018, 2019];

    const labels = [];
    const values = [];

    const totalRatings = movies.reduce((s, m) => s + (m.ratingsCount || 0), 0);
    const share = totalRatings / Math.max(1, state.movies.reduce((s, m) => s + (m.ratingsCount || 0), 0));
    const baseline = totalRatings / 24; // spread across 24 months

    years.forEach(y => {
      months.forEach((mo, i) => {
        labels.push(`${mo} '${String(y).slice(2)}`);
        const seasonal = pattern[i];
        const yearMult = y === 2019 ? 1.15 : 1;
        values.push(Math.round(baseline * seasonal * yearMult));
      });
    });

    return { labels, values, share };
  }

  /* =========================================================
     KPI CARDS
     ========================================================= */

  function computeKPIs(movies) {
    const totalRatings = movies.reduce((s, m) => s + (m.ratingsCount || 0), 0);
    const totalMovies  = movies.length;
    const totalGenres  = new Set(movies.flatMap(m => m.genres || [])).size;
    const avgRating    = movies.length
      ? movies.reduce((s, m) => s + (m.rating || 0), 0) / movies.length
      : 0;

    // Derived users metric — deterministic proxy
    const globalRatings = state.movies.reduce((s, m) => s + (m.ratingsCount || 0), 0) || 1;
    const totalUsers = Math.round(162541 * (totalRatings / globalRatings));

    return [
      { key: 'ratings', icon: 'fa-database', label: 'Total Ratings', value: totalRatings,   format: v => Utils.formatNumber(v) },
      { key: 'movies',  icon: 'fa-film',     label: 'Total Movies',  value: totalMovies,    format: v => v.toString() },
      { key: 'users',   icon: 'fa-users',    label: 'Total Users',   value: totalUsers,     format: v => Utils.formatNumber(v) },
      { key: 'genres',  icon: 'fa-tags',     label: 'Total Genres',  value: totalGenres,    format: v => v.toString() },
      { key: 'avg',     icon: 'fa-star',     label: 'Average Rating',value: avgRating,      format: v => v.toFixed(2), float: true },
    ];
  }

  function renderKPIs(movies) {
    const grid = els.kpis;
    if (!grid) return;

    const kpis = computeKPIs(movies);

    grid.innerHTML = kpis.map((k, i) => `
      <article class="kpi-card" style="animation-delay:${i * 50}ms">
        <div class="kpi-card__icon"><i class="fa-solid ${k.icon}" aria-hidden="true"></i></div>
        <div class="kpi-card__value" data-kpi="${k.key}">0</div>
        <div class="kpi-card__label">${Utils.escapeHtml(k.label)}</div>
      </article>
    `).join('');

    // Animate counters
    kpis.forEach(k => {
      const node = grid.querySelector(`[data-kpi="${k.key}"]`);
      if (!node) return;
      if (k.float) {
        animateFloat(node, k.value);
      } else {
        Counter.animate(node, k.value);
      }
    });
  }

  function animateFloat(el, target) {
    if (Utils.prefersReducedMotion()) {
      el.textContent = target.toFixed(2);
      return;
    }
    const start = performance.now();
    const duration = 1100;
    const from = 0;
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (from + (target - from) * eased).toFixed(2);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* =========================================================
     CHART HELPERS
     ========================================================= */

  function chartDefaults() {
    Chart.defaults.color = COLORS.text;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.borderColor = COLORS.grid;
  }

  function baseOptions({ indexAxis = 'x', showLegend = false } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500, easing: 'easeOutQuart' },
      indexAxis,
      plugins: {
        legend: {
          display: showLegend,
          position: 'bottom',
          labels: {
            color: COLORS.text,
            padding: 14,
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            font: { size: 11, weight: '600' },
          },
        },
        tooltip: {
          backgroundColor: COLORS.tooltip,
          borderColor: 'rgba(255,255,255,0.10)',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          titleColor: '#F5F5F5',
          bodyColor: COLORS.text,
          titleFont: { weight: '700', size: 12 },
          bodyFont: { size: 12 },
          displayColors: false,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: COLORS.text, font: { size: 11 } },
        },
        y: {
          grid: { color: COLORS.grid },
          border: { display: false },
          ticks: { color: COLORS.dim, font: { size: 11 } },
        },
      },
    };
  }

  function upsertChart(key, canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (state.charts[key]) {
      state.charts[key].data = config.data;
      state.charts[key].options = config.options;
      state.charts[key].update();
    } else {
      state.charts[key] = new Chart(ctx, config);
    }
  }

  /* =========================================================
     CHART RENDERERS
     ========================================================= */

  function renderDistribution(movies) {
    const dist = ratingDistribution(movies);
    upsertChart('distribution', 'chartDistribution', {
      type: 'bar',
      data: {
        labels: ['5 ★', '4 ★', '3 ★', '2 ★', '1 ★'],
        datasets: [{
          data: dist,
          backgroundColor: ['#E50914', '#F97316', '#FBBF24', '#38BDF8', '#6B7280'],
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 52,
        }],
      },
      options: {
        ...baseOptions(),
        plugins: {
          ...baseOptions().plugins,
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: { label: c => `${Utils.formatNumber(c.raw)} ratings` },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: COLORS.text } },
          y: {
            grid: { color: COLORS.grid },
            border: { display: false },
            ticks: { color: COLORS.dim, callback: v => Utils.formatNumber(v) },
          },
        },
      },
    });
  }

  function renderDonut(movies) {
    const data = countByGenre(movies, 8);
    upsertChart('donut', 'chartDonut', {
      type: 'doughnut',
      data: {
        labels: data.map(d => d[0]),
        datasets: [{
          data: data.map(d => d[1]),
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
              color: COLORS.text,
              padding: 10,
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              font: { size: 11, weight: '600' },
            },
          },
          tooltip: {
            backgroundColor: COLORS.tooltip,
            borderColor: 'rgba(255,255,255,0.10)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            titleColor: '#F5F5F5',
            bodyColor: COLORS.text,
            displayColors: false,
            callbacks: {
              label: c => {
                const total = c.dataset.data.reduce((s, v) => s + v, 0);
                const pct = ((c.raw / total) * 100).toFixed(1);
                return `${c.label}: ${c.raw} titles (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  function renderByGenre(movies) {
    const data = countByGenre(movies, 10);
    upsertChart('byGenre', 'chartByGenre', {
      type: 'bar',
      data: {
        labels: data.map(d => d[0]),
        datasets: [{
          data: data.map(d => d[1]),
          backgroundColor: (ctx) => {
            const i = ctx.dataIndex;
            return PALETTE[i % PALETTE.length];
          },
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 30,
        }],
      },
      options: {
        ...baseOptions({ indexAxis: 'y' }),
        plugins: {
          ...baseOptions({ indexAxis: 'y' }).plugins,
          tooltip: {
            ...baseOptions({ indexAxis: 'y' }).plugins.tooltip,
            callbacks: { label: c => `${c.raw} titles` },
          },
        },
      },
    });
  }

  function renderAvgGenre(movies) {
    const data = avgRatingByGenre(movies, 8);
    upsertChart('avgGenre', 'chartAvgGenre', {
      type: 'bar',
      data: {
        labels: data.map(d => d[0]),
        datasets: [{
          data: data.map(d => d[1]),
          backgroundColor: 'rgba(229,9,20,0.75)',
          hoverBackgroundColor: '#E50914',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 34,
        }],
      },
      options: {
        ...baseOptions({ indexAxis: 'y' }),
        plugins: {
          ...baseOptions({ indexAxis: 'y' }).plugins,
          tooltip: {
            ...baseOptions({ indexAxis: 'y' }).plugins.tooltip,
            callbacks: { label: c => `Avg rating: ${c.raw.toFixed(2)}` },
          },
        },
        scales: {
          x: {
            min: 0, max: 5,
            grid: { color: COLORS.grid },
            border: { display: false },
            ticks: { color: COLORS.dim, stepSize: 1 },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: COLORS.text },
          },
        },
      },
    });
  }

  function renderMostRated(movies) {
    const data = mostRatedMovies(movies, 10);
    upsertChart('mostRated', 'chartMostRated', {
      type: 'bar',
      data: {
        labels: data.map(m => m.title),
        datasets: [{
          data: data.map(m => m.ratingsCount || 0),
          backgroundColor: 'rgba(99,102,241,0.75)',
          hoverBackgroundColor: '#6366F1',
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 20,
        }],
      },
      options: {
        ...baseOptions({ indexAxis: 'y' }),
        plugins: {
          ...baseOptions({ indexAxis: 'y' }).plugins,
          tooltip: {
            ...baseOptions({ indexAxis: 'y' }).plugins.tooltip,
            callbacks: { label: c => `${Utils.formatNumber(c.raw)} ratings` },
          },
        },
        scales: {
          x: {
            grid: { color: COLORS.grid },
            border: { display: false },
            ticks: { color: COLORS.dim, callback: v => Utils.formatNumber(v) },
          },
          y: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: COLORS.text, font: { size: 11 } },
          },
        },
      },
    });
  }

  function renderActivity(movies) {
    const series = ratingActivity(movies);
    upsertChart('activity', 'chartActivity', {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [{
          data: series.values,
          borderColor: '#E50914',
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'rgba(229,9,20,0.14)';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(229,9,20,0.28)');
            g.addColorStop(1, 'rgba(229,9,20,0.0)');
            return g;
          },
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#E50914',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        }],
      },
      options: {
        ...baseOptions(),
        interaction: { mode: 'index', intersect: false },
        plugins: {
          ...baseOptions().plugins,
          tooltip: {
            ...baseOptions().plugins.tooltip,
            callbacks: { label: c => `${Utils.formatNumber(c.raw)} ratings` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: COLORS.text,
              font: { size: 10 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
            },
          },
          y: {
            grid: { color: COLORS.grid },
            border: { display: false },
            ticks: { color: COLORS.dim, callback: v => Utils.formatNumber(v) },
          },
        },
      },
    });
  }

  /* =========================================================
     KEY INSIGHTS
     ========================================================= */

  function generateInsights(movies) {
    const insights = [];
    if (!movies.length) return insights;

    // 1. Top genre
    const byGenre = countByGenre(movies, 1);
    if (byGenre.length) {
      const [topGenre, topCount] = byGenre[0];
      insights.push({
        icon: 'fa-tags',
        text: `<strong>${Utils.escapeHtml(topGenre)}</strong> is the most represented genre in this scope with <strong>${topCount}</strong> titles.`,
      });
    }

    // 2. Rating vs popularity divergence
    const mostRated = [...movies].sort((a, b) => b.ratingsCount - a.ratingsCount)[0];
    const topRated  = [...movies].sort((a, b) => b.rating - a.rating)[0];
    if (mostRated && topRated && mostRated.id !== topRated.id) {
      insights.push({
        icon: 'fa-chart-line',
        text: `Highly rated movies do not always have the highest number of ratings — <strong>${Utils.escapeHtml(mostRated.title)}</strong> leads in volume, while <strong>${Utils.escapeHtml(topRated.title)}</strong> leads in score.`,
      });
    }

    // 3. Average rating
    const avg = movies.reduce((s, m) => s + (m.rating || 0), 0) / movies.length;
    insights.push({
      icon: 'fa-star',
      text: `Average user score across this filter scope is <strong>${avg.toFixed(2)}</strong> out of 5.00.`,
    });

    // 4. Era concentration
    const recent = movies.filter(m => (m.year || 0) >= 2010).length;
    const pct = Math.round((recent / movies.length) * 100);
    insights.push({
      icon: 'fa-clock-rotate-left',
      text: `<strong>${pct}%</strong> of titles in the current scope were released in 2010 or later, indicating a modern-skewed catalogue.`,
    });

    // 5. Rating activity variance
    const series = ratingActivity(movies).values;
    const peak = Math.max(...series);
    const trough = Math.min(...series);
    if (peak > 0) {
      const variance = Math.round(((peak - trough) / peak) * 100);
      insights.push({
        icon: 'fa-wave-square',
        text: `Rating activity varies by up to <strong>${variance}%</strong> across months — user engagement is not uniform over time.`,
      });
    }

    return insights;
  }

  function renderInsights(movies) {
    const list = els.insights;
    if (!list) return;

    const insights = generateInsights(movies);

    if (!insights.length) {
      list.innerHTML = `
        <div class="state">
          <div class="state__icon"><i class="fa-solid fa-circle-info" aria-hidden="true"></i></div>
          <p class="state__title">No insights available</p>
          <p class="state__text">Try a different filter combination.</p>
        </div>`;
      return;
    }

    list.innerHTML = insights.map((ins, i) => `
      <div class="key-insight" style="animation-delay:${i * 60}ms">
        <div class="key-insight__icon"><i class="fa-solid ${ins.icon}" aria-hidden="true"></i></div>
        <p class="key-insight__text">${ins.text}</p>
      </div>
    `).join('');
  }

  /* =========================================================
     RENDER PIPELINE
     ========================================================= */

  function renderAll() {
    const movies = filteredMovies();

    if (!movies.length) {
      renderKPIs([]);
      renderInsights([]);
      // Clear charts
      Object.values(state.charts).forEach(c => {
        c.data.labels = [];
        c.data.datasets.forEach(d => d.data = []);
        c.update();
      });
      return;
    }

    renderKPIs(movies);
    renderDistribution(movies);
    renderDonut(movies);
    renderByGenre(movies);
    renderAvgGenre(movies);
    renderMostRated(movies);
    renderActivity(movies);
    renderInsights(movies);
  }

  /* =========================================================
     FILTER TOOLBAR
     ========================================================= */

  const FILTER_OPTIONS = {
    genre: () => {
      const all = new Set(state.movies.flatMap(m => m.genres || []));
      return [
        { label: 'All Genres', value: '' },
        ...[...all].sort().map(g => ({ label: g, value: g })),
      ];
    },
    year: () => ([
      { label: 'Any Year', value: '' },
      { label: '2020s',    value: '2020' },
      { label: '2010s',    value: '2010' },
      { label: '2000s',    value: '2000' },
      { label: '1990s',    value: '1990' },
      { label: 'Older',    value: '0' },
    ]),
    rating: () => ([
      { label: 'Any Rating', value: '0' },
      { label: '4.5+',       value: '4.5' },
      { label: '4.0+',       value: '4' },
      { label: '3.5+',       value: '3.5' },
      { label: '3.0+',       value: '3' },
    ]),
  };

  const FILTER_DEFAULT_LABEL = {
    genre: 'Genre',
    year: 'Year',
    rating: 'Rating',
  };

  function openMenu(kind, button) {
    const menu = document.querySelector(`.filter-menu[data-menu="${kind}"]`);
    if (!menu) return;

    const options = FILTER_OPTIONS[kind]();
    const current = String(state.filters[kind] ?? '');

    menu.innerHTML = options.map(o => `
      <button class="filter-menu__item ${o.value === current ? 'is-selected' : ''}"
              type="button" role="option"
              data-value="${Utils.escapeHtml(o.value)}">
        <span>${Utils.escapeHtml(o.label)}</span>
        ${o.value === current ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ''}
      </button>
    `).join('');

    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  }

  function closeAllMenus() {
    document.querySelectorAll('.filter-menu').forEach(m => m.hidden = true);
    document.querySelectorAll('[data-filter]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  function bindFilters() {
    const toolbar = els.filters;
    if (!toolbar) return;

    toolbar.addEventListener('click', e => {
      // Pill click (opens menu or resets)
      const pill = e.target.closest('.filter-pill');
      if (pill) {
        const kind = pill.dataset.filter;

        if (kind === 'all') {
          state.filters = { genre: '', year: '', minRating: 0 };
          updatePillLabels();
          closeAllMenus();
          renderAll();
          return;
        }

        const open = !pill.parentElement.querySelector('.filter-menu').hidden;
        closeAllMenus();
        if (!open) openMenu(kind, pill);
        return;
      }

      // Menu item click
      const item = e.target.closest('.filter-menu__item');
      if (item) {
        const menu = item.closest('.filter-menu');
        const kind = menu.dataset.menu;
        const value = item.dataset.value;

        if (kind === 'rating') {
          state.filters.minRating = parseFloat(value) || 0;
        } else {
          state.filters[kind] = value;
        }

        closeAllMenus();
        updatePillLabels();
        renderAll();
      }
    });

    // Click outside closes menus
    document.addEventListener('click', e => {
      if (!e.target.closest('.analytics-filters')) closeAllMenus();
    });

    // Escape closes
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAllMenus();
    });
  }

  function updatePillLabels() {
    const set = (kind, label, hasValue) => {
      const pill = document.querySelector(`.filter-pill[data-filter="${kind}"]`);
      if (!pill) return;
      pill.querySelector('.filter-pill__value').textContent = label;
      pill.classList.toggle('has-value', hasValue);
    };

    set('genre', state.filters.genre || FILTER_DEFAULT_LABEL.genre, !!state.filters.genre);
    set('year',
      state.filters.year ? document.querySelector(`.filter-menu__item[data-value="${state.filters.year}"] span`)?.textContent || FILTER_DEFAULT_LABEL.year : FILTER_DEFAULT_LABEL.year,
      !!state.filters.year
    );
    set('rating',
      state.filters.minRating ? `${state.filters.minRating}+` : FILTER_DEFAULT_LABEL.rating,
      state.filters.minRating > 0
    );

    // "All Data" pill active only when nothing is set
    const allPill = document.querySelector('.filter-pill[data-filter="all"]');
    if (allPill) {
      const empty = !state.filters.genre && !state.filters.year && !state.filters.minRating;
      allPill.classList.toggle('is-active', empty);
    }
  }

  /* =========================================================
     INIT
     ========================================================= */
     async function init() {
    els.filters  = document.getElementById('analyticsFilters');
    els.kpis     = document.getElementById('analyticsKpis');
    els.insights = document.getElementById('insightList');

    if (!window.Chart) {
      console.warn('Chart.js not loaded');
      return;
    }
    chartDefaults();

    try {
      const data = await API.getMovies();
      state.movies = Array.isArray(data) ? data : [];
    } catch {
      state.movies = [];
    }

    if (!state.movies.length) {
      els.kpis.innerHTML = `
        <div class="state" style="grid-column:1/-1">
          <div class="state__icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
          <p class="state__title">Unable to load analytics</p>
          <p class="state__text">Please try again.</p>
        </div>`;
      return;
    }

    bindFilters();
    updatePillLabels();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);

})();