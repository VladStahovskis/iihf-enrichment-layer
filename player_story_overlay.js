
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nonempty(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstNonempty(values) {
  for (let i = 0; i < values.length; i += 1) {
    const text = nonempty(values[i]);
    if (text) return text;
  }
  return '';
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(nonempty(value));
}

function httpUrl(value) {
  const text = nonempty(value);
  return isHttpUrl(text) ? text : '';
}

function readCandidates(raw) {
  if (!raw) return [];
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (e) {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object');
}

function sameId(left, right) {
  const a = nonempty(left);
  const b = nonempty(right);
  return a !== '' && a === b;
}

function matchByKey(candidates, key, ids) {
  for (let i = 0; i < ids.length; i += 1) {
    const found = candidates.find((item) => sameId(item[key], ids[i]));
    if (found) return found;
  }
  return null;
}

function objectLayer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

// WSC page extra info may sit on sdkContext itself, or under current /
// extraInfo.current. Page id wins, then the page's player id.
function pageCandidate(candidates, sdk) {
  const extra = objectLayer(sdk.extraInfo);
  const contentExtra = objectLayer(sdk.contentExtraInfo);
  const page = objectLayer(sdk.current)
    || objectLayer(sdk.story_page_content_extra_info)
    || objectLayer(sdk.storyPageContentExtraInfo)
    || (extra && objectLayer(extra.current))
    || (contentExtra && objectLayer(contentExtra.current))
    || {};
  return matchByKey(candidates, 'pageId', [
    page.pageId,
    sdk.pageId,
    sdk.story_page_id,
    sdk.storyPageId,
  ]) || matchByKey(candidates, 'playerId', [
    page.playerId,
    sdk.playerId,
  ]);
}

function titleCaseName(raw) {
  const trimmed = nonempty(raw);
  if (!trimmed) return '';
  return trimmed.split(/\s+/).map(titleCaseToken).join(' ');
}

function titleCaseToken(token) {
  return token
    .split('-')
    .map((part) => {
      if (!part) return part;
      const hasLower = /[a-z]/.test(part);
      const hasUpper = /[A-Z]/.test(part);
      if (!hasUpper || hasLower) return part;
      const lower = part.toLowerCase();
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join('-');
}

function layerWith(layers, key) {
  for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    if (layer && nonempty(layer[key])) return layer;
  }
  return null;
}

function displayName(givenName, familyName, playerName) {
  const joined = [titleCaseName(givenName), titleCaseName(familyName)]
    .filter(Boolean)
    .join(' ');
  if (joined) return joined;
  return titleCaseName(playerName);
}

function positionLabel(position) {
  switch (nonempty(position).toUpperCase()) {
    case 'F':
      return 'Forward';
    case 'D':
      return 'Defender';
    case 'G':
    case 'GK':
      return 'Goaltender';
    default:
      return nonempty(position);
  }
}

function present(source, key) {
  return !!source && source[key] !== null && source[key] !== undefined && source[key] !== '';
}

function optionalCount(sdk, user, key) {
  const source = present(sdk, key) ? sdk : present(user, key) ? user : null;
  if (!source) return null;
  const count = Number(source[key]);
  if (!Number.isFinite(count) || count < 1) return null;
  return Math.floor(count);
}

function readContext(context) {
  const sdk = (context && context.sdkContext) || {};
  const user = (context && context.userContext) || {};
  const candidates = readCandidates(user.goalCandidates ?? sdk.goalCandidates);
  // The flat user fields belong to the page that opened the story. A later
  // page only changes sdkContext ids, so the candidate for those ids has to
  // win or the card stays on the first player.
  const onPage = pageCandidate(candidates, sdk);
  const opened = matchByKey(candidates, 'pageId', [user.pageId])
    || matchByKey(candidates, 'playerId', [user.playerId]);
  const layers = onPage ? [sdk, onPage, user] : [sdk, user, opened || {}];

  function field(key) {
    return firstNonempty(layers.map((layer) => layer && layer[key]));
  }

  const givenName = field('givenName');
  const familyName = field('familyName');
  const nameLayer = layerWith(layers, 'givenName')
    || layerWith(layers, 'familyName')
    || layerWith(layers, 'playerName');
  const matched = onPage || opened;
  const pollPlayerId = firstNonempty([
    nameLayer && nameLayer.playerId,
    user.playerId,
    matched && matched.playerId,
  ]);

  const pageCount = optionalCount(sdk, user, 'pageCount');
  const activePage = pageCount
    ? Math.min(pageCount, Math.max(1, optionalCount(sdk, user, 'activePage') || 1))
    : 0;

  return {
    sdk,
    user,
    pollPlayerId,
    playerName: displayName(givenName, familyName, field('playerName')),
    photoUrl: httpUrl(field('portraitUrl')) || httpUrl(field('photoUrl')),
    jerseyNumber: field('jerseyNumber').replace(/^#/, ''),
    positionLabel: positionLabel(field('position')),
    playerFlagUrl: httpUrl(field('playerFlagUrl')),
    goals: field('goals'),
    assists: field('assists'),
    points: field('points'),
    playerFlagCode: (field('teamCode') || field('playerFlagCode')).toUpperCase(),
    fontUrl: httpUrl(field('fontUrl')),
    pageCount,
    activePage,
  };
}

// IIHF team codes are not all ISO alpha-2. flagcdn serves the circular crop.
const TEAM_ISO2 = {
  ALG: 'dz', ARG: 'ar', ARM: 'am', AUS: 'au', AUT: 'at', AZE: 'az',
  BEL: 'be', BHR: 'bh', BIH: 'ba', BLR: 'by', BRA: 'br', BUL: 'bg',
  CAN: 'ca', CHI: 'cl', CHN: 'cn', COL: 'co', CZE: 'cz',
  DEN: 'dk', ESP: 'es', EST: 'ee', FIN: 'fi', FRA: 'fr',
  GBR: 'gb', GEO: 'ge', GER: 'de', GRE: 'gr',
  HKG: 'hk', HUN: 'hu', INA: 'id', IND: 'in', IRI: 'ir', IRL: 'ie',
  ISL: 'is', ISR: 'il', ITA: 'it', JAM: 'jm', JPN: 'jp',
  KEN: 'ke', KGZ: 'kg', KOR: 'kr', KUW: 'kw',
  LAT: 'lv', LIE: 'li', LTU: 'lt', LUX: 'lu',
  MAC: 'mo', MAR: 'ma', MAS: 'my', MDA: 'md', MEX: 'mx', MKD: 'mk',
  MGL: 'mn', NED: 'nl', NEP: 'np', NOR: 'no', NZL: 'nz',
  PHI: 'ph', POL: 'pl', POR: 'pt', PRK: 'kp', PUR: 'pr',
  QAT: 'qa', ROC: 'ru', ROU: 'ro', RSA: 'za', RUS: 'ru',
  SGP: 'sg', SLO: 'si', SUI: 'ch', SVK: 'sk', SWE: 'se',
  THA: 'th', TKM: 'tm', TPE: 'tw', TUN: 'tn', TUR: 'tr',
  UAE: 'ae', UKR: 'ua', USA: 'us', UZB: 'uz',
};

function flagSrc(code, imageUrl) {
  const explicit = httpUrl(imageUrl);
  if (explicit) return explicit;
  const iso = TEAM_ISO2[nonempty(code).toUpperCase()];
  return iso ? `https://flagcdn.com/${iso}.svg` : '';
}

function flagMarkup(code, imageUrl, extraClass) {
  if (!imageUrl && !code) return '';
  const cls = extraClass ? `flag-circle ${extraClass}` : 'flag-circle';
  const src = flagSrc(code, imageUrl);
  if (src) {
    return `<img class="${cls} flag-img" src="${escapeHtml(src)}" alt="${escapeHtml(code)}" />`;
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
  if (!pageCount) return '';
  let dots = '';
  for (let i = 1; i <= pageCount; i += 1) {
    const active = i === activePage;
    dots += `<span class="pager-dot${active ? ' is-active' : ''}" data-page="${i}" ${active ? 'aria-current="true"' : ''}></span>`;
  }
  return `<div class="pager" id="iihf-pager" role="tablist">${dots}</div>`;
}

function avatarMarkup(data) {
  const photo = data.photoUrl
    ? `<img class="avatar-img" src="${escapeHtml(data.photoUrl)}" alt="" />`
    : `<div class="avatar-fallback">${escapeHtml(initials(data.playerName))}</div>`;
  const flag = flagMarkup(data.playerFlagCode, data.playerFlagUrl, 'player-flag');
  return `<div class="avatar-wrap">${photo}${flag}</div>`;
}

function statMarkup(label, value) {
  const shown = nonempty(value) ? value : '\u2013';
  return `<div class="stat"><span class="stat-label">${escapeHtml(label)}</span><span class="stat-value">${escapeHtml(shown)}</span></div>`;
}

function metaMarkup(data) {
  return `<div class="stats-row">${statMarkup('Goals', data.goals)}${statMarkup('Assists', data.assists)}${statMarkup('Points', data.points)}</div>`;
}

export async function renderEnrichment(context) {
  const data = readContext(context);
  const userContext = data.user;

  window.iihfStoryOverlay_onVote = function iihfStoryOverlay_onVote() {
    // The native SDK parses setAppContext as Map<String, String> (Gson) and then
    // replaces hostingAppContext with it. Nested objects/arrays/booleans make
    // parsing fail silently, so every value must be a string. The vote is sent
    // as a JSON string; the Flutter app jsonDecodes it.
    const payload = {};
    Object.keys(userContext || {}).forEach(function (key) {
      const value = userContext[key];
      if (value === null || value === undefined) {
        return;
      }
      payload[key] =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
    payload.iihfVote = JSON.stringify({
      action: 'vote',
      playerId: data.pollPlayerId || data.sdk.playerId,
      teamId: data.sdk.teamId,
      gameId: data.sdk.gameId,
      roundId: data.sdk.roundId,
      seasonId: data.sdk.seasonId,
      playerName: data.playerName,
      ts: Date.now(),
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
  :host {
    display: block;
    width: 100%;
    height: 100%;
  }
  .overlay-root {
    box-sizing: border-box;
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    color: #ffffff;
    pointer-events: none;
  }
  .overlay-root *, .overlay-root *::before, .overlay-root *::after {
    box-sizing: border-box;
  }
  .pager, .vote-btn {
    pointer-events: auto;
  }
  .pager {
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
    background: #0E2999;
    color: transparent;
    font-size: 0;
    overflow: hidden;
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
    bottom: -0.0625rem;
    width: 1.25rem;
    height: 1.25rem;
    z-index: 1;
    border: 1.5px solid #051F4B;
  }
  .player-name {
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.25rem;
    letter-spacing: 0.1px;
    text-align: center;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    min-width: 0;
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
    min-height: 1.5rem;
  }
  .vote-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
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
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    background: #f0f0f0;
  }
  .flag-circle.player-flag {
    position: absolute;
    right: -0.125rem;
    bottom: -0.0625rem;
    width: 1.25rem;
    height: 1.25rem;
  }
  .flag-img {
    width: 1.25rem;
    height: 1.25rem;
    object-fit: cover;
    display: block;
  }
  .flag-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0E2999;
    color: #ffffff;
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }
</style>
<div class="overlay-root" role="region" aria-label="Player story overlay">
  ${pagerMarkup(data.pageCount, data.activePage)}
  <div class="player-card">
    <div class="player-identity">
      ${avatarMarkup(data)}
      <div class="player-name">${escapeHtml(data.playerName)}</div>
    </div>
    <div class="player-meta">
      ${metaMarkup(data)}
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
