/* render.js - turns the HUB data (data.js) into cards, download buttons, and a
   details dialog (with a commit sparkline and language bar) on the page.
   No framework. Any element with a data-cards / data-downloads attribute is filled.
   Reads top-to-bottom: entry point first, helpers below it. */

document.addEventListener('DOMContentLoaded', renderHub);
document.addEventListener('click', handleDetailsClick);

function renderHub() {
  fillEveryCardContainer();
  fillEveryDownloadContainer();
  stampLiveCount();
  stampCurrentYear();
  refreshCardVersions(); // live version chips read from the served feed
  openDetailsFromHash(); // deep-link: /#slug opens that card's details
}

function refreshCardVersions() {
  document.querySelectorAll('[data-live-version][data-feed]').forEach(async (el) => {
    const version = await fetchFeedVersion(el.dataset.feed);
    if (version) el.textContent = version;
  });
}

// Read the current version from a served feed manifest (same-origin). Returns 'vX.Y.Z' or null.
async function fetchFeedVersion(feedBase) {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch(`${feedBase}/releases.win-x64.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json();
    const version = manifest.Assets && manifest.Assets[0] && manifest.Assets[0].Version;
    return version ? `v${String(version).replace(/^v/, '')}` : null;
  } catch {
    return null;
  }
}

function stampLiveCount() {
  const slot = document.querySelector('[data-live-count]');
  if (slot) slot.textContent = String(HUB.projects.length + HUB.bots.length);
}

function fillEveryCardContainer() {
  document.querySelectorAll('[data-cards]').forEach(fillCardContainer);
}

function fillCardContainer(container) {
  const collectionName = container.dataset.cards;
  const limit = readLimit(container.dataset.limit);
  const items = sortedByOrder(HUB[collectionName]).slice(0, limit);
  container.innerHTML = items.length
    ? items.map((item) => renderCard(toCardModel(collectionName, item))).join('')
    : renderEmptyState();
}

function fillEveryDownloadContainer() {
  document.querySelectorAll('[data-downloads]').forEach(fillDownloadContainer);
}

function fillDownloadContainer(container) {
  const project = findByName('projects', null, container.dataset.downloads, 'page');
  const downloads = project ? project.downloads || [] : [];
  container.innerHTML = downloads.length ? downloads.map(renderDownload).join('') : renderEmptyState();
}

function stampCurrentYear() {
  const slot = document.querySelector('[data-current-year]');
  if (slot) slot.textContent = String(new Date().getFullYear());
}

/* ── domain -> card model ─────────────────────────────────────── */

function toCardModel(collectionName, item) {
  const isBot = collectionName === 'bots';
  return {
    collection: collectionName,
    name: item.name,
    description: item.blurb,
    icon: cardIcon(item),
    badges: cardBadges(item),
    release: item.release,
    feed: item.feed,
    statline: statline(item.stats),
    tags: techStack(item),
    actions: cardActions(item, isBot),
  };
}

function cardBadges(item) {
  const badges = [];
  if (item.status) badges.push(statusBadge(item.status));
  if (item.platform === 'Discord') badges.push({ label: 'Discord', variant: 'discord', icon: discordIcon() });
  if (item.fork) badges.push({ label: 'fork', variant: 'fork', icon: forkIcon() });
  if (item.private) badges.push({ label: 'private', variant: 'private' });
  return badges;
}

function statusBadge(status) {
  const variantByStatus = { live: 'live', beta: 'accent', wip: 'accent', archived: 'warn' };
  return { label: status, variant: variantByStatus[status] || 'accent', dot: status === 'live' };
}

function cardActions(item, isBot) {
  const actions = [{ label: 'details', detailsFor: { collection: isBot ? 'bots' : 'projects', name: item.name } }];
  if (isBot && item.invite) actions.push({ label: 'invite', url: item.invite });
  if (item.repo) actions.push({ label: 'source', url: item.repo });
  return actions;
}

/* ── card model -> HTML ───────────────────────────────────────── */

function renderCard({ collection, name, description, icon, badges, release, feed, statline, tags, actions }) {
  const meta = badges.map(renderBadge).join('') + renderVersionBadge(release, feed);
  return `
    <article class="card">
      ${meta ? `<div class="card__meta">${meta}</div>` : ''}
      <div class="card__head">
        ${renderIcon(icon)}
        <h3 class="card__title">${renderTitle(collection, name)}</h3>
      </div>
      <p class="card__description">${escapeHtml(description)}</p>
      ${renderTechStack(tags)}
      ${renderStatline(statline)}
      ${renderActions(actions)}
    </article>`;
}

function renderIcon(icon) {
  if (!icon) return '';
  return `<img class="card__icon" src="${escapeAttribute(icon)}" alt="" width="30" height="30" loading="lazy" />`;
}

// The title opens the details panel (same as the "details" action).
function renderTitle(collection, name) {
  return `<button type="button" class="card__title-btn" data-details-collection="${escapeAttribute(collection)}" data-details-name="${escapeAttribute(name)}">${escapeHtml(name)} <span class="card__title-arrow" aria-hidden="true">→</span></button>`;
}

// A version chip on the card face. Carries the live-fetch hook when a feed is served.
function renderVersionBadge(release, feed) {
  if (!release || !release.version) return '';
  const liveAttrs = feed ? ` data-live-version data-feed="${escapeAttribute(feed)}"` : '';
  return `<span class="badge badge--version"${liveAttrs}>${escapeHtml(release.version)}</span>`;
}

function renderBadge({ label, variant, dot, icon }) {
  const lead = dot ? '<span class="badge__dot" aria-hidden="true">●</span>' : icon || '';
  return `<span class="badge badge--${variant}">${lead}${escapeHtml(label)}</span>`;
}

function renderStatline(statline) {
  if (!statline) return '';
  const parts = statline.map((part) => `<span>${escapeHtml(part)}</span>`).join('<span class="statline__sep" aria-hidden="true">·</span>');
  return `<p class="statline">${parts}</p>`;
}

function renderTechStack(stack) {
  if (!stack || stack.length === 0) return '';
  const chips = stack.map((tech) => `<li class="tech">${renderTechLogo(tech)}${escapeHtml(tech)}</li>`).join('');
  return `<div class="card__stack"><span class="card__stack-label">stack</span><ul class="tech-list">${chips}</ul></div>`;
}

function renderTechLogo(language) {
  const url = languageIconUrl(language);
  return url ? `<img class="tech__logo" src="${escapeAttribute(url)}" alt="" width="13" height="13" loading="lazy" />` : '';
}

function renderActions(actions) {
  if (!actions || actions.length === 0) return '';
  return `<div class="card__actions">${actions.map(renderAction).join('')}</div>`;
}

function renderAction(action) {
  if (action.detailsFor) {
    return `<button type="button" class="card__action" data-details-collection="${escapeAttribute(action.detailsFor.collection)}" data-details-name="${escapeAttribute(action.detailsFor.name)}">${escapeHtml(action.label)}</button>`;
  }
  return `<a class="card__action" href="${escapeAttribute(action.url)}"${externalAttributes(action.url)}>${escapeHtml(action.label)}<span aria-hidden="true"> ${arrowFor(action.url)}</span></a>`;
}

function renderDownload({ label, platform, url, portable }) {
  return `
    <div class="download">
      <a class="download__main" href="${escapeAttribute(url)}">
        <span class="download__label">${escapeHtml(label)}</span>
        <span class="download__platform">${escapeHtml(platform)}</span>
        <span class="download__arrow" aria-hidden="true">↓</span>
      </a>
      ${portable ? `<a class="download__portable" href="${escapeAttribute(portable)}">portable .zip <span aria-hidden="true">↓</span></a>` : ''}
    </div>`;
}

function renderEmptyState() {
  return '<p class="empty-state">Nothing here yet.</p>';
}

/* ── details dialog ───────────────────────────────────────────── */

let lastTrigger = null; // card control to refocus when the dialog closes

function handleDetailsClick(event) {
  const trigger = event.target.closest('[data-details-name]');
  if (!trigger) return;
  // Remember the originating card control, but not when navigating inside the dialog.
  if (!trigger.closest('#details-dialog')) lastTrigger = trigger;
  openDetails(trigger.dataset.detailsCollection, trigger.dataset.detailsName);
}

function openDetails(collection, name) {
  const item = findByName(collection, name);
  if (!item) return;
  const dialog = ensureDialog();
  dialog.innerHTML = renderDetails(collection, item);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  if (!dialog.open) dialog.showModal();
  setHash(item.slug);
  dialog.querySelector('[data-close]').focus();
  refreshLiveVersion(dialog); // override the baked release version with the live feed's
}

// The baked release version is a snapshot. When a card has a served feed, read the
// current version straight from it (same-origin) so the panel never goes stale.
async function refreshLiveVersion(dialog) {
  const line = dialog.querySelector('.details__release[data-feed]');
  if (!line) return;
  const version = await fetchFeedVersion(line.dataset.feed);
  if (!version) return; // offline or feed missing: keep the baked snapshot
  const slot = line.querySelector('[data-release-version]');
  const meta = line.querySelector('[data-release-meta]');
  if (slot) slot.textContent = version;
  if (meta) meta.textContent = 'live';
}

function openDetailsBySlug(slug) {
  for (const collection of ['projects', 'bots']) {
    const item = (HUB[collection] || []).find((entry) => entry.slug === slug);
    if (item) {
      lastTrigger = null;
      openDetails(collection, item.name);
      return;
    }
  }
}

function ensureDialog() {
  let dialog = document.getElementById('details-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'details-dialog';
    dialog.className = 'details';
    dialog.addEventListener('click', closeDialogOnBackdrop);
    dialog.addEventListener('close', onDialogClose);
    document.body.appendChild(dialog);
  }
  return dialog;
}

function closeDialogOnBackdrop(event) {
  if (event.target.id === 'details-dialog') event.target.close();
}

function onDialogClose() {
  clearHash();
  if (lastTrigger) lastTrigger.focus();
}

function renderDetails(collection, item) {
  return `
    <div class="details__panel">
      <button type="button" class="details__close" data-close aria-label="Close">✕</button>
      <div class="card__meta">${cardBadges(item).map(renderBadge).join('')}</div>
      <div class="details__heading-row">
        ${renderIcon(cardIcon(item))}
        <h2 class="details__title">${escapeHtml(item.name)}</h2>
      </div>
      <p class="details__description">${escapeHtml(item.summary || item.blurb)}</p>
      ${renderFacts(item.facts)}
      ${renderReleaseLine(item)}
      ${renderModalDownloads(item.downloads)}
      ${renderStatGrid(item.stats)}
      ${renderLanguageBar(item.languages)}
      ${renderActivityChart(item.activity)}
      <div class="details__links">
        ${item.repo ? `<a class="button button--ghost" href="${escapeAttribute(item.repo)}" target="_blank" rel="noopener">source ↗</a>` : ''}
        ${item.page ? `<a class="button" href="/${escapeAttribute(item.page)}/">open page →</a>` : ''}
        ${item.invite ? `<a class="button" href="${escapeAttribute(item.invite)}" target="_blank" rel="noopener">invite ↗</a>` : ''}
      </div>
      ${renderModalNav(collection, item)}
    </div>`;
}

function renderReleaseLine(item) {
  const release = item.release;
  if (!release || !release.version) return '';
  const feedAttr = item.feed ? ` data-feed="${escapeAttribute(item.feed)}"` : '';
  return `<p class="details__release"${feedAttr}>Latest release <strong data-release-version>${escapeHtml(release.version)}</strong> · <span data-release-meta>${escapeHtml(formatRelativeDate(release.date))}</span></p>`;
}

function renderModalDownloads(downloads) {
  if (!downloads || downloads.length === 0) return '';
  return `
    <div class="details__block">
      <p class="details__heading">Download</p>
      <div class="download-grid">${downloads.map(renderDownload).join('')}</div>
    </div>`;
}

function renderModalNav(collection, item) {
  const siblings = sortedByOrder(HUB[collection]);
  const index = siblings.findIndex((entry) => entry.slug === item.slug);
  return `
    <nav class="details__nav">
      ${navButton('prev', collection, siblings[index - 1])}
      <span class="details__nav-count">${index + 1} / ${siblings.length}</span>
      ${navButton('next', collection, siblings[index + 1])}
    </nav>`;
}

function navButton(direction, collection, sibling) {
  const arrow = direction === 'prev' ? '←' : '→';
  if (!sibling) return `<span class="details__nav-btn details__nav-btn--off" aria-hidden="true">${arrow}</span>`;
  const label = direction === 'prev' ? `${arrow} ${escapeHtml(sibling.name)}` : `${escapeHtml(sibling.name)} ${arrow}`;
  return `<button type="button" class="details__nav-btn" data-details-collection="${escapeAttribute(collection)}" data-details-name="${escapeAttribute(sibling.name)}">${label}</button>`;
}

function setHash(slug) {
  history.replaceState(null, '', `#${slug}`);
}

function clearHash() {
  history.replaceState(null, '', location.pathname + location.search);
}

function openDetailsFromHash() {
  if (!location.hash || !document.querySelector('[data-cards]')) return;
  openDetailsBySlug(decodeURIComponent(location.hash.slice(1)));
}

function renderFacts(facts) {
  if (!facts || facts.length === 0) return '';
  const items = facts.map((fact) => `<li class="fact">${escapeHtml(fact)}</li>`).join('');
  return `<ul class="facts">${items}</ul>`;
}

function renderStatGrid(stats) {
  if (!stats) return '';
  const cells = [
    stats.language ? statCell('language', stats.language) : null,
    statCell('created', formatYear(stats.created)),
    statCell('last commit', formatRelativeDate(stats.updated)),
    statCell('commits / yr', String(stats.commitsLastYear)),
  ].filter(Boolean);
  return `<dl class="stat-grid">${cells.join('')}</dl>`;
}

function statCell(label, value) {
  return `<div class="stat"><dt class="stat__label">${escapeHtml(label)}</dt><dd class="stat__value">${escapeHtml(value)}</dd></div>`;
}

function renderLanguageBar(languages) {
  if (!languages || languages.length === 0) return '';
  const segments = languages
    .map((language, index) => `<span class="lang-bar__seg lang-bar__seg--${index}" style="width:${language.percent}%" title="${escapeAttribute(`${language.name} ${language.percent}%`)}"></span>`)
    .join('');
  const legend = languages
    .map((language, index) => {
      const logo = languageIconUrl(language.name);
      const mark = logo
        ? `<img class="tech__logo" src="${escapeAttribute(logo)}" alt="" width="14" height="14" loading="lazy" />`
        : `<span class="lang-bar__chip lang-bar__seg--${index}" aria-hidden="true"></span>`;
      return `<li>${mark}${escapeHtml(language.name)} <span class="lang-bar__pct">${language.percent}%</span></li>`;
    })
    .join('');
  return `
    <div class="details__block">
      <p class="details__heading">Languages</p>
      <div class="lang-bar">${segments}</div>
      <ul class="lang-bar__legend">${legend}</ul>
    </div>`;
}

function renderActivityChart(activity) {
  if (!activity || activity.length === 0 || sum(activity) === 0) {
    return '<div class="details__block"><p class="details__heading">Commit activity <span class="details__heading-note">52 weeks</span></p><p class="empty-state">No commits in the last year.</p></div>';
  }
  const peak = Math.max(...activity);
  const weeks = activity.length;
  const bars = activity
    .map((count, index) => {
      const height = Math.max(2, Math.round((count / peak) * 100));
      const tooltip = `${count} commit${count === 1 ? '' : 's'} · ${weekLabel(weeks - 1 - index)}`;
      return `<span class="spark__bar" style="height:${height}%" title="${escapeAttribute(tooltip)}"></span>`;
    })
    .join('');
  return `
    <div class="details__block">
      <p class="details__heading">Commit activity <span class="details__heading-note">52 weeks · ${sum(activity)} commits</span></p>
      <div class="spark" role="img" aria-label="Weekly commits over the last year">${bars}</div>
      <div class="spark-axis"><span>1y ago</span><span>6mo</span><span>now</span></div>
    </div>`;
}

function weekLabel(weeksAgo) {
  if (weeksAgo <= 0) return 'this week';
  if (weeksAgo === 1) return 'last week';
  return `${weeksAgo} weeks ago`;
}

/* ── small helpers ────────────────────────────────────────────── */

// A per-card icon: an explicit override, else a tech logo from the primary language.
function cardIcon(item) {
  if (item.icon) return item.icon;
  return languageIconUrl(item.stats && item.stats.language);
}

function languageIconUrl(language) {
  const slug = {
    'C#': 'csharp', Java: 'java', Python: 'python', JavaScript: 'javascript',
    TypeScript: 'typescript', CSS: 'css3', HTML: 'html5', Shell: 'bash', Dockerfile: 'docker',
  }[language];
  return slug ? `https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${slug}/${slug}-original.svg` : null;
}

// The card's tech stack: the repo's significant languages (>=1%), newest first.
function techStack(item) {
  const significant = (item.languages || []).filter((language) => language.percent >= 1);
  if (significant.length > 0) return significant.map((language) => language.name);
  return item.tags || [];
}

function statline(stats) {
  if (!stats) return null;
  const parts = [`updated ${formatRelativeDate(stats.updated)}`];
  if (stats.commitsLastYear > 0) parts.push(`${stats.commitsLastYear} commits/yr`);
  return parts;
}

function sortedByOrder(items) {
  const fallbackOrder = 100;
  return [...items].sort((a, b) => (a.order ?? fallbackOrder) - (b.order ?? fallbackOrder));
}

function findByName(collectionName, name, value, key) {
  const items = HUB[collectionName] || [];
  if (name) return items.find((item) => item.name === name);
  return items.find((item) => item[key] === value);
}

function readLimit(rawLimit) {
  const limit = Number.parseInt(rawLimit, 10);
  return Number.isFinite(limit) ? limit : Infinity;
}

function sum(numbers) {
  return numbers.reduce((total, n) => total + n, 0);
}

function forkIcon() {
  return '<svg class="badge__icon" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true" fill="currentColor"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878ZM11 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-3 8.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"></path></svg>';
}

function discordIcon() {
  return '<svg class="badge__icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="currentColor"><path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3c-.2.36-.43.84-.59 1.23a18.27 18.27 0 0 0-3.937 0A12.6 12.6 0 0 0 11.44 3 19.74 19.74 0 0 0 7.68 4.369C4.337 9.39 3.43 14.28 3.882 19.1a19.9 19.9 0 0 0 5.993 3.04c.484-.66.915-1.36 1.286-2.096-.703-.265-1.376-.593-2.02-.978.17-.124.335-.253.494-.386a14.2 14.2 0 0 0 12.13 0c.16.14.326.27.495.386-.646.385-1.323.713-2.022.98.37.735.8 1.434 1.285 2.094a19.84 19.84 0 0 0 5.995-3.04c.532-5.586-.91-10.432-3.812-14.732ZM9.68 15.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm4.64 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.334.955-2.42 2.157-2.42 1.21 0 2.176 1.095 2.157 2.42 0 1.335-.946 2.42-2.157 2.42Z"></path></svg>';
}

function formatYear(isoDate) {
  return isoDate ? `since ${isoDate.slice(0, 4)}` : 'unknown';
}

function formatRelativeDate(isoDate) {
  if (!isoDate) return 'unknown';
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function isExternalLink(url) {
  return /^https?:\/\//.test(url) && !url.includes('projects.lulustudio.dk');
}

function externalAttributes(url) {
  return isExternalLink(url) ? ' target="_blank" rel="noopener"' : '';
}

function arrowFor(url) {
  return isExternalLink(url) ? '↗' : '→';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
