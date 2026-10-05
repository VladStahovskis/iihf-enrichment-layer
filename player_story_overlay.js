/**
 * IIHF WSC custom enrichment overlay — player story card.
 *
 * Host this file on a public URL (no CORS block) and give WSC Sports that URL
 * plus bounds.json. The Flutter app does not pass this URL into the player.
 *
 * Contract: https://dev.wsc-sports.com/docs/create-a-custom-enrichment-file
 */

const DEFAULTS = {
  playerName: 'Mikko Lehtonen',
  photoUrl: '',
  goals: '14',
  assists: '2',
  points: '18',
  homeScore: '4',
  awayScore: '2',
  homeFlagCode: 'FIN',
  awayFlagCode: 'USA',
  pageCount: 4,
  activePage: 1,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

function readContext(context) {
  const sdk = (context && context.sdkContext) || {};
  const user = (context && context.userContext) || {};
  const pageCount = Math.max(1, Number(user.pageCount) || DEFAULTS.pageCount);
  const activePage = Math.min(
    pageCount,
    Math.max(1, Number(user.activePage) || DEFAULTS.activePage),
  );

  return {
    sdk,
    user,
    playerName: user.playerName || DEFAULTS.playerName,
    photoUrl: isHttpUrl(user.photoUrl) ? user.photoUrl.trim() : DEFAULTS.photoUrl,
    goals: user.goals != null ? String(user.goals) : DEFAULTS.goals,
    assists: user.assists != null ? String(user.assists) : DEFAULTS.assists,
    points: user.points != null ? String(user.points) : DEFAULTS.points,
    homeScore: user.homeScore != null ? String(user.homeScore) : DEFAULTS.homeScore,
    awayScore: user.awayScore != null ? String(user.awayScore) : DEFAULTS.awayScore,
    homeFlagCode: (user.homeFlagCode || DEFAULTS.homeFlagCode).toUpperCase(),
    awayFlagCode: (user.awayFlagCode || DEFAULTS.awayFlagCode).toUpperCase(),
    homeFlagUrl: isHttpUrl(user.homeFlagUrl) ? user.homeFlagUrl.trim() : '',
    awayFlagUrl: isHttpUrl(user.awayFlagUrl) ? user.awayFlagUrl.trim() : '',
    playerFlagUrl: isHttpUrl(user.playerFlagUrl) ? user.playerFlagUrl.trim() : '',
    playerFlagCode: (user.playerFlagCode || user.homeFlagCode || DEFAULTS.homeFlagCode).toUpperCase(),
    fontUrl: isHttpUrl(user.fontUrl) ? user.fontUrl.trim() : '',
    pageCount,
    activePage,
  };
}

function flagMarkup(code, imageUrl, extraClass) {
  const cls = extraClass ? `flag-circle ${extraClass}` : 'flag-circle';
  if (imageUrl) {
    return `<img class="${cls} flag-img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(code)}" />`;
  }
  if (code === 'FIN' || code === 'FI') {
    return `<div class="${cls} flag-fin" aria-label="Finland"></div>`;
  }
  if (code === 'USA' || code === 'US') {
    return `<div class="${cls} flag-usa" aria-label="USA"></div>`;
  }
  return `<div class="${cls} flag-fallback" aria-label="${escapeHtml(code)}">${escapeHtml(code.slice(0, 3))}</div>`;
}

function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function pagerMarkup(pageCount, activePage) {
  let dots = '';
  for (let i = 1; i <= pageCount; i += 1) {
    const active = i === activePage;
    dots += `<span class="pager-dot${active ? ' is-active' : ''}" data-page="${i}" ${active ? 'aria-current="true"' : ''}></span>`;
  }
  return `<div class="pager" id="iihf-pager" role="tablist">${dots}</div>`;
}

function avatarMarkup(data) {
  const photo = data.photoUrl
    ? `<img class="avatar-img" src="${escapeHtml(data.photoUrl)}" alt="${escapeHtml(data.playerName)}" />`
    : `<div class="avatar-fallback">${escapeHtml(initials(data.playerName))}</div>`;
  const flag = flagMarkup(data.playerFlagCode, data.playerFlagUrl, 'player-flag');
  return `<div class="avatar-wrap">${photo}${flag}</div>`;
}

export async function renderEnrichment(context) {
  const data = readContext(context);
  const userContext = data.user;

  window.iihfStoryOverlay_onVote = function iihfStoryOverlay_onVote() {
    const payload = Object.assign({}, userContext, {
      iihfVote: {
        action: 'vote',
        playerId: data.sdk.playerId,
        teamId: data.sdk.teamId,
        gameId: data.sdk.gameId,
        roundId: data.sdk.roundId,
        seasonId: data.sdk.seasonId,
        playerName: data.playerName,
        ts: Date.now(),
      },
    });

    if (typeof window.triggerExternalFunction === 'function') {
      window.triggerExternalFunction('setAppContext', payload);
    }

    const root = window.clientDocument;
    if (!root) {
      return;
    }
    const button = root.getElementById('iihf-vote-btn');
    if (button) {
      button.disabled = true;
      button.classList.add('is-voted');
      const label = button.querySelector('.vote-label');
      if (label) {
        label.textContent = 'Voted';
      }
    }
  };

  window.iihfStoryOverlay_bind = function iihfStoryOverlay_bind() {
    const root = window.clientDocument;
    if (!root) {
      return;
    }

    const button = root.getElementById('iihf-vote-btn');
    if (button) {
      button.addEventListener('click', function onVoteClick(event) {
        event.preventDefault();
        event.stopPropagation();
        window.iihfStoryOverlay_onVote();
      });
    }

    let currentPage = data.activePage;
    const pageCount = data.pageCount;
    const swipeLayer = root.getElementById('iihf-swipe-layer');
    const pager = root.getElementById('iihf-pager');
    const swipeState = { tracking: false, startX: 0, startY: 0, pointerId: null };

    function updatePager(page) {
      if (!pager) {
        return;
      }
      const dots = pager.querySelectorAll('.pager-dot');
      for (let i = 0; i < dots.length; i += 1) {
        const isActive = i + 1 === page;
        dots[i].classList.toggle('is-active', isActive);
        if (isActive) {
          dots[i].setAttribute('aria-current', 'true');
        } else {
          dots[i].removeAttribute('aria-current');
        }
      }
    }

    function controlPlayer(command, payload) {
      if (typeof window.triggerExternalFunction !== 'function') {
        return;
      }
      if (payload === undefined) {
        window.triggerExternalFunction(command);
      } else {
        window.triggerExternalFunction(command, payload);
      }
    }

    function goToAdjacent(direction) {
      const command = direction > 0 ? 'goToNextPage' : 'goToPreviousPage';
      controlPlayer(command);
      const nextPage = currentPage + direction;
      if (nextPage >= 1 && nextPage <= pageCount) {
        currentPage = nextPage;
        updatePager(currentPage);
      }
    }

    window.iihfStoryOverlay_goToNextPage = function iihfStoryOverlay_goToNextPage() {
      goToAdjacent(1);
    };

    window.iihfStoryOverlay_goToPreviousPage = function iihfStoryOverlay_goToPreviousPage() {
      goToAdjacent(-1);
    };

    function onPointerDown(event) {
      swipeState.tracking = true;
      swipeState.startX = event.clientX;
      swipeState.startY = event.clientY;
      swipeState.pointerId = event.pointerId;
      if (swipeLayer && swipeLayer.setPointerCapture) {
        try {
          swipeLayer.setPointerCapture(event.pointerId);
        } catch (e) {}
      }
    }

    function onPointerUp(event) {
      if (!swipeState.tracking) {
        return;
      }
      if (swipeState.pointerId != null && event.pointerId !== swipeState.pointerId) {
        return;
      }
      swipeState.tracking = false;
      const dx = event.clientX - swipeState.startX;
      const dy = event.clientY - swipeState.startY;
      if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) {
        return;
      }
      if (dx < 0) {
        goToAdjacent(1);
      } else {
        goToAdjacent(-1);
      }
    }

    function onPointerCancel() {
      swipeState.tracking = false;
    }

    if (swipeLayer) {
      swipeLayer.addEventListener('pointerdown', onPointerDown);
      swipeLayer.addEventListener('pointerup', onPointerUp);
      swipeLayer.addEventListener('pointercancel', onPointerCancel);
    }
  };

  const fontLoader = data.fontUrl
    ? `<script>
(function loadIihfFont() {
  try {
    var font = new FontFace('IIHF', 'url(${JSON.stringify(data.fontUrl)})', { style: 'normal', weight: '400 700' });
    font.load().then(function (loaded) {
      document.fonts.add(loaded);
    });
  } catch (e) {}
})();
</script>`
    : '';

  return `
<style>
  :host, .overlay-root {
    font-family: IIHF, "IIHF-Std", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .overlay-root {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 5% 0 0;
    color: #ffffff;
    pointer-events: none;
    position: relative;
  }
  .overlay-root *, .overlay-root *::before, .overlay-root *::after {
    box-sizing: border-box;
  }
  .scrim-top, .scrim-bottom {
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;
  }
  .scrim-top {
    top: 0;
    height: 28%;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.55) 0%, rgba(0, 0, 0, 0) 100%);
  }
  .scrim-bottom {
    bottom: 0;
    height: 42%;
    background: linear-gradient(0deg, rgba(5, 31, 75, 0.55) 0%, rgba(0, 0, 0, 0) 100%);
  }
  .swipe-layer, .top-bar, .pager, .player-card, .close-btn, .vote-btn, .score-chip {
    pointer-events: auto;
  }
  .swipe-layer {
    position: absolute;
    inset: 0;
    z-index: 1;
    touch-action: pan-y;
  }
  .top-bar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0 4%;
  }
  .score-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.30);
    border: 1px solid rgba(255, 255, 255, 0.20);
    border-radius: 1.875rem;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  .score-text {
    min-width: 1.5rem;
    text-align: center;
    color: #04193C;
    font-size: 0.6875rem;
    font-weight: 500;
    line-height: 1rem;
    letter-spacing: 0.5px;
  }
  .close-btn {
    width: 1.5rem;
    height: 1.5rem;
    border: 0;
    padding: 0;
    background: transparent;
    color: #C0C1C9;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .close-btn svg {
    width: 1.25rem;
    height: 1.25rem;
    display: block;
  }
  .mid-space {
    flex: 1 1 auto;
    min-height: 2rem;
    pointer-events: none;
  }
  .pager {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: 0.75rem;
    margin: 0 4% 0.75rem;
  }
  .pager-dot {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.30);
    flex-shrink: 0;
    transform-origin: center;
    transition:
      width 280ms cubic-bezier(0.4, 0, 0.2, 1),
      background-color 280ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .pager-dot.is-active {
    width: 2.25rem;
    background: #2E2EE5;
  }
  .player-card {
    position: relative;
    z-index: 2;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    padding: 1rem;
    background: #051F4B;
    border-top-left-radius: 1rem;
    border-top-right-radius: 1rem;
    backdrop-filter: blur(11.5px);
    -webkit-backdrop-filter: blur(11.5px);
  }
  .player-identity {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 9rem;
    flex: 0 0 9rem;
  }
  .avatar-wrap {
    position: relative;
    width: 3.5rem;
    height: 3.5rem;
    flex-shrink: 0;
  }
  .avatar-img, .avatar-fallback {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 9999px;
    object-fit: cover;
    display: block;
  }
  .avatar-fallback {
    background: #0E2999;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    font-weight: 500;
  }
  .player-flag {
    position: absolute;
    right: -0.125rem;
    bottom: 0;
    width: 1.25rem;
    height: 1.25rem;
    z-index: 1;
  }
  .player-name {
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    letter-spacing: 0.1px;
    text-align: center;
    width: 100%;
  }
  .player-meta {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 0.5rem;
    flex: 0 1 11.5rem;
    min-width: 0;
  }
  .stats-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    flex: 1 1 0;
  }
  .stat-label {
    color: #C0C1C9;
    font-size: 0.6875rem;
    font-weight: 500;
    line-height: 1rem;
    letter-spacing: 0.5px;
  }
  .stat-value {
    color: #ffffff;
    font-size: 1rem;
    font-weight: 400;
    line-height: 1.5rem;
    letter-spacing: 0.5px;
  }
  .vote-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    height: 2rem;
    padding: 0 1.5rem 0 1rem;
    border: 0;
    border-radius: 0.5rem;
    background: #ffffff;
    color: #051F4B;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    letter-spacing: 0.1px;
    cursor: pointer;
  }
  .vote-btn svg {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }
  .vote-btn.is-voted {
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
  }
  .vote-btn:disabled {
    cursor: default;
  }
  .flag-circle {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    overflow: hidden;
    position: relative;
    flex-shrink: 0;
    background: #f0f0f0;
  }
  .flag-img {
    object-fit: cover;
    display: block;
  }
  .flag-fin {
    background:
      linear-gradient(#002F6C, #002F6C) 24% 0 / 27% 100% no-repeat,
      linear-gradient(#002F6C, #002F6C) 0 36% / 100% 28% no-repeat,
      #ffffff;
  }
  .flag-usa {
    background:
      linear-gradient(#192F5D, #192F5D) 0 0 / 40% 54% no-repeat,
      repeating-linear-gradient(
        to bottom,
        #BD3D44 0 12.5%,
        #ffffff 12.5% 25%
      );
  }
  .flag-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0E2999;
    color: #ffffff;
    font-size: 0.375rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
</style>
<div class="overlay-root" role="region" aria-label="Player story overlay">
  <div class="swipe-layer" id="iihf-swipe-layer"></div>
  <div class="scrim-top"></div>
  <div class="scrim-bottom"></div>
  <div class="top-bar">
    <div class="score-chip">
      ${flagMarkup(data.homeFlagCode, data.homeFlagUrl)}
      <span class="score-text">${escapeHtml(data.homeScore)}:${escapeHtml(data.awayScore)}</span>
      ${flagMarkup(data.awayFlagCode, data.awayFlagUrl)}
    </div>
    <button class="close-btn" type="button" aria-label="Close" tabindex="-1">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6.4 19L5 17.6L10.6 12L5 6.4L6.4 5L12 10.6L17.6 5L19 6.4L13.4 12L19 17.6L17.6 19L12 13.4L6.4 19Z" fill="currentColor"/>
      </svg>
    </button>
  </div>
  <div class="mid-space"></div>
  ${pagerMarkup(data.pageCount, data.activePage)}
  <div class="player-card">
    <div class="player-identity">
      ${avatarMarkup(data)}
      <div class="player-name">${escapeHtml(data.playerName)}</div>
    </div>
    <div class="player-meta">
      <div class="stats-row">
        <div class="stat">
          <span class="stat-label">Goals</span>
          <span class="stat-value">${escapeHtml(data.goals)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Assists</span>
          <span class="stat-value">${escapeHtml(data.assists)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Points</span>
          <span class="stat-value">${escapeHtml(data.points)}</span>
        </div>
      </div>
      <button id="iihf-vote-btn" class="vote-btn" type="button">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 21H18.2C18.83 21 19.4 20.63 19.68 20.06L22.78 12.95C22.93 12.63 23 12.32 23 12V10C23 8.9 22.1 8 21 8H14.69L15.64 3.43L15.67 3.11C15.67 2.7 15.5 2.32 15.23 2.05L14.17 1L7.59 7.59C7.22 7.95 7 8.45 7 9V19C7 20.1 7.9 21 9 21ZM9 9L13.34 4.66L12 10H21V12L18.2 19H9V9ZM1 9H5V21H1V9Z" fill="currentColor"/>
        </svg>
        <span class="vote-label">Vote</span>
      </button>
    </div>
  </div>
</div>
<script>
window.iihfStoryOverlay_bind();
</script>
${fontLoader}
`;
}
