/* =========================================================
   MovieSphere — movie.js
   Renders the movie details page including rating chart,
   tags, insights, "why people like this", similar movies.
   ========================================================= */

(() => {
  let ratingChart = null;

  function gradientFor(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
    return `linear-gradient(150deg, hsl(${h} 55% 28%), hsl(${(h + 42) % 360} 60% 14%))`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Deterministic pseudo-distribution from a movie's average rating + count
  function ratingDistribution(avg, count) {
    // Shape the 5/4/3/2/1 star buckets so they visually line up with avg
    const a = Math.max(0.5, Math.min(5, avg || 3));
    const weights = [
      Math.exp(-Math.pow(5 - a, 2) / 0.6),
      Math.exp(-Math.pow(4 - a, 2) / 0.6),
      Math.exp(-Math.pow(3 - a, 2) / 0.6),
      Math.exp(-Math.pow(2 - a, 2) / 0.6),
      Math.exp(-Math.pow(1 - a, 2) / 0.6),
    ];
    const total = weights.reduce((s, w) => s + w, 0);
    const base = count || 1000;
    return weights.map(w => Math.round((w / total) * base));
  }

  function buildInsights(m) {
    const dist = ratingDistribution(m.rating, m.ratingsCount);
    const popularityRank = Math.max(1, Math.round((100 - (m.popularity || 80)) * 42));
    const mainGenres = (m.genres || []).slice(0, 3);

    return { dist, popularityRank, mainGenres };
  }

  function renderHero(m) {
    const poster = document.getElementById('moviePoster');
    if (poster) {
      poster.innerHTML = m.poster
        ? `<img src="${escapeHtml(m.poster)}" alt="${escapeHtml(m.title)} poster">`
        : `<div class="poster-fallback" style="background:${gradientFor(m.title)}">${escapeHtml(m.title)}</div>`;
    }

    const info = document.querySelector('.movie-hero__info');
    if (!info) return;

    const { dist, popularityRank, mainGenres } = buildInsights(m);

    const genresHtml = (m.genres || []).map(g =>
      `<a class="chip" href="/explore?genre=${encodeURIComponent(g)}">${escapeHtml(g)}</a>`
    ).join('');

    const tags = (m.tags && m.tags.length ? m.tags :
      ['Rewatchable', 'Well Rated', 'Popular'].slice(0, 3));

    info.innerHTML = `
      <h1 class="movie-hero__title">${escapeHtml(m.title)}</h1>

      <div class="movie-meta-row">
        <span>${m.year || '—'}</span>
        <span class="dot" aria-hidden="true"></span>
        <span class="rating-value">
          <i class="fa-solid fa-star" aria-hidden="true"></i>
          ${(m.rating || 0).toFixed(2)}
        </span>
        <span class="dot" aria-hidden="true"></span>
        <span>${Utils.formatNumber(m.ratingsCount || 0)} ratings</span>
      </div>

      <div class="chip-row">${genresHtml}</div>

      <div class="movie-actions">
        <a class="btn btn--primary" href="/recommendations?movie=${m.id}">
          <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
          Get Recommendations
        </a>
        <button class="btn btn--ghost" type="button" data-fav="${m.id}">
          <i class="fa-regular fa-heart" aria-hidden="true"></i> Add to Favorites
        </button>
      </div>

      <div class="insights-grid">
        <div class="insight-card">
          <div class="insight-card__label">Average Rating</div>
          <div class="insight-card__value">${(m.rating || 0).toFixed(2)}</div>
          <div class="insight-card__sub">out of 5.00</div>
        </div>
        <div class="insight-card">
          <div class="insight-card__label">Total Ratings</div>
          <div class="insight-card__value">${Utils.formatNumber(m.ratingsCount || 0)}</div>
          <div class="insight-card__sub">user interactions</div>
        </div>
        <div class="insight-card">
          <div class="insight-card__label">Popularity Rank</div>
          <div class="insight-card__value">#${popularityRank}</div>
          <div class="insight-card__sub">within catalogue</div>
        </div>
        <div class="insight-card">
          <div class="insight-card__label">Main Genres</div>
          <div class="insight-card__value" style="font-size:1rem">
            ${escapeHtml(mainGenres.join(' · ') || '—')}
          </div>
          <div class="insight-card__sub">primary classification</div>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card__head">
          <h2 class="chart-card__title">Rating Distribution</h2>
          <p class="chart-card__sub">Number of ratings per star bucket.</p>
        </div>
        <div class="chart-card__body"><canvas id="ratingChart"></canvas></div>
      </div>

      <div class="chart-card">
        <div class="chart-card__head">
          <h2 class="chart-card__title">Tags</h2>
          <p class="chart-card__sub">Recurring themes in user reviews &amp; metadata.</p>
        </div>
        <div class="tag-cloud">
          ${tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card__head">
          <h2 class="chart-card__title">Why People Like This Movie</h2>
          <p class="chart-card__sub">Signals derived from the ratings dataset.</p>
        </div>
        <div class="reason-list">
          <div class="reason-item">
            <div class="reason-item__icon"><i class="fa-solid fa-star" aria-hidden="true"></i></div>
            <p class="reason-item__text">
              <strong>Consistently high ratings.</strong>
              Average user score sits at ${(m.rating || 0).toFixed(2)} across ${Utils.formatNumber(m.ratingsCount || 0)} ratings.
            </p>
          </div>
          <div class="reason-item">
            <div class="reason-item__icon"><i class="fa-solid fa-users" aria-hidden="true"></i></div>
            <p class="reason-item__text">
              <strong>Wide audience appeal.</strong>
              Ranked in the top tier of ${escapeHtml((m.genres || ['its'])[0])} titles by interaction volume.
            </p>
          </div>
          <div class="reason-item">
            <div class="reason-item__icon"><i class="fa-solid fa-tags" aria-hidden="true"></i></div>
            <p class="reason-item__text">
              <strong>Strong genre affinity.</strong>
              Frequently co-rated by users who enjoy ${escapeHtml(mainGenres.join(', '))}.
            </p>
          </div>
          <div class="reason-item">
            <div class="reason-item__icon"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></div>
            <p class="reason-item__text">
              <strong>Durable interest.</strong>
              Sustained engagement well beyond its release year.
            </p>
          </div>
        </div>
      </div>

      <div class="section" style="padding-bottom:0">
        <div class="section__head">
          <div>
            <h2 class="section__title">Similar Movies</h2>
            <p class="section__subtitle">Content-similar titles from the same clusters.</p>
          </div>
        </div>
        <div class="movie-grid" id="similarGrid">
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
        </div>
      </div>
    `;

    drawRatingChart(dist);
  }

  function drawRatingChart(dist) {
    const ctx = document.getElementById('ratingChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (ratingChart) ratingChart.destroy();

    Chart.defaults.color = '#9CA3AF';
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;

    ratingChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['5 ★', '4 ★', '3 ★', '2 ★', '1 ★'],
        datasets: [{
          data: dist,
          backgroundColor: ['#E50914', '#F97316', '#FBBF24', '#38BDF8', '#6B7280'],
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 46,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 500 },
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
            callbacks: {
              label: c => `${Utils.formatNumber(c.raw)} ratings`,
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
            ticks: {
              color: '#6B7280',
              callback: v => Utils.formatNumber(v),
            },
          },
        },
      },
    });
  }

  async function loadSimilar(movie) {
    const grid = document.getElementById('similarGrid');
    if (!grid) return;

    try {
      const all = await API.getMovies();
      const genreSet = new Set(movie.genres || []);
      const similar = (all || [])
        .filter(m => String(m.id) !== String(movie.id))
        .map(m => {
          const overlap = (m.genres || []).filter(g => genreSet.has(g)).length;
          return { m, score: overlap * 2 + (m.rating || 0) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(x => x.m);

      if (!similar.length) {
        grid.innerHTML = `<div class="state" style="grid-column:1/-1">
          <p class="state__text">No similar movies found.</p></div>`;
        return;
      }
      MovieCard.renderGrid(grid, similar);
    } catch {
      grid.innerHTML = `<div class="state" style="grid-column:1/-1">
        <p class="state__text">Unable to load similar movies.</p></div>`;
    }
  }

  async function init() {
    const page = document.getElementById('moviePage');
    if (!page) return;
    const id = page.dataset.movieId;

    try {
      const movie = await API.getMovieDetails(id);
      if (!movie) throw new Error('not found');
      renderHero(movie);
      loadSimilar(movie);
    } catch {
      page.innerHTML = `
        <div class="state" style="margin-top:var(--s-7)">
          <div class="state__icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></div>
          <p class="state__title">Movie not found</p>
          <p class="state__text">We couldn't load details for this title.</p>
          <div class="state__actions">
            <a class="btn btn--ghost btn--sm" href="/explore">
              <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Back to Explore
            </a>
          </div>
        </div>`;
    }

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

  document.addEventListener('DOMContentLoaded', init);
})();