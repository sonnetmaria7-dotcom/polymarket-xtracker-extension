const USERS_API = 'https://xtracker.polymarket.com/api/users';
const TRACKING_API = (id) => `https://xtracker.polymarket.com/api/trackings/${id}?includeStats=true`;
const SUMMARY_ID = 'xtracker-overlay-summary';
const BADGE_CLASS = 'xtracker-overlay-badge';
const TAG_CLASS = 'xtracker-overlay-tag';

let cachedUsers = null;
let cachedTracking = null;
let lastRenderKey = null;

function normalizeText(value) {
  return (value || '')
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();
}

function cleanUrl(url) {
  try {
    const parsed = new URL(url, location.origin);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return (url || '').replace(/\/$/, '');
  }
}

function formatNum(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(digits);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

function parseRange(label) {
  const text = (label || '').trim();
  let match = text.match(/^(\d+)\s*-\s*(\d+)$/);
  if (match) {
    return { lower: Number(match[1]), upper: Number(match[2]), label: text };
  }
  match = text.match(/^(\d+)\s*\+$/);
  if (match) {
    return { lower: Number(match[1]), upper: Infinity, label: text };
  }
  match = text.match(/^under\s*(\d+)$/i);
  if (match) {
    return { lower: 0, upper: Number(match[1]) - 1, label: text };
  }
  match = text.match(/^(\d+)\s*or more$/i);
  if (match) {
    return { lower: Number(match[1]), upper: Infinity, label: text };
  }
  return null;
}

function findTitleElement() {
  return document.querySelector('h1');
}

function getCurrentTitle() {
  return findTitleElement()?.textContent?.trim() || '';
}

async function fetchUsers() {
  if (cachedUsers) return cachedUsers;
  const response = await fetch(USERS_API, { credentials: 'omit' });
  if (!response.ok) throw new Error(`xtracker users api failed: ${response.status}`);
  const json = await response.json();
  cachedUsers = json?.data || [];
  return cachedUsers;
}

async function fetchTrackingDetails(id) {
  if (cachedTracking?.id === id) return cachedTracking;
  const response = await fetch(TRACKING_API(id), { credentials: 'omit' });
  if (!response.ok) throw new Error(`xtracker tracking api failed: ${response.status}`);
  const json = await response.json();
  cachedTracking = json?.data || null;
  return cachedTracking;
}

async function findTrackingForCurrentMarket() {
  const title = getCurrentTitle();
  if (!title) return null;

  const users = await fetchUsers();
  const currentUrl = cleanUrl(location.href);
  const normalizedTitle = normalizeText(title);
  const slug = location.pathname.replace(/\/$/, '');

  let matched = null;
  for (const user of users) {
    for (const tracking of user.trackings || []) {
      const marketLink = cleanUrl(tracking.marketLink || '');
      const sameLink = marketLink && marketLink.endsWith(slug);
      const sameTitle = normalizeText(tracking.title) === normalizedTitle;
      if (sameLink || sameTitle) {
        matched = { ...tracking, user };
        break;
      }
    }
    if (matched) break;
  }

  if (!matched) return null;
  return fetchTrackingDetails(matched.id);
}

function getRemainingDays(endDate) {
  const remainingMs = new Date(endDate).getTime() - Date.now();
  return Math.max(remainingMs / 86400000, 0);
}

function buildSummary(tracking) {
  const existing = document.getElementById(SUMMARY_ID);
  existing?.remove();

  const target = findTitleElement()?.closest('div');
  if (!target || !tracking?.stats) return;

  const total = Number(tracking.stats.total ?? tracking.stats.cumulative ?? 0);
  const remainingDays = getRemainingDays(tracking.endDate);
  const wrapper = document.createElement('div');
  wrapper.id = SUMMARY_ID;
  wrapper.className = 'xtracker-overlay-summary';
  wrapper.innerHTML = `
    <div><strong>XTracker</strong>：@${tracking.user?.handle || 'unknown'} ｜ 当前已发 <strong>${total}</strong> 条</div>
    <div>区间：${new Date(tracking.startDate).toLocaleString()} → ${new Date(tracking.endDate).toLocaleString()}</div>
    <div>剩余时间：<strong>${formatNum(remainingDays, 2)}</strong> 天 ｜ 数据源：xtracker.polymarket.com</div>
  `;

  target.parentElement?.insertBefore(wrapper, target.nextSibling);
}

function findOutcomeNodes() {
  const candidates = [...document.querySelectorAll('p, span, div')];
  const hits = [];
  const seen = new Set();

  for (const node of candidates) {
    const text = node.textContent?.trim();
    if (!text) continue;
    if (!parseRange(text)) continue;

    let card = null;
    let current = node;
    for (let i = 0; i < 8 && current; i += 1, current = current.parentElement) {
      const buyYes = current.querySelector?.('button');
      const hasBuyYes = [...(current.querySelectorAll?.('button') || [])].some((btn) => /buy\s+yes/i.test(btn.textContent || ''));
      if (buyYes && hasBuyYes) {
        card = current;
        break;
      }
    }

    if (!card) continue;
    if (seen.has(card)) continue;
    seen.add(card);
    hits.push({ labelNode: node, card, text });
  }
  return hits;
}

function describeRange(range, total, remainingDays) {
  if (remainingDays <= 0) {
    if (total >= range.lower && total <= range.upper) return { cls: 'hit', text: '已收盘，最终落在这个区间' };
    return { cls: 'dead', text: '已收盘，最终不在这个区间' };
  }

  if (total > range.upper) {
    return { cls: 'dead', text: `当前 ${total}，已高于区间上限 ${range.upper}` };
  }

  if (total >= range.lower && total <= range.upper) {
    if (range.upper === Infinity) {
      return { cls: 'hit', text: '当前已在该区间内' };
    }
    const maxStayPerDay = (range.upper - total) / remainingDays;
    return {
      cls: 'hit',
      text: `当前已在区间内；之后平均 ≤ ${formatNum(maxStayPerDay, 1)} 条/天，才有机会继续留在这里`
    };
  }

  const minPerDay = Math.max((range.lower - total) / remainingDays, 0);
  if (!Number.isFinite(minPerDay)) {
    return { cls: 'low', text: '无法计算所需日均速度' };
  }

  if (range.upper === Infinity) {
    return {
      cls: 'low',
      text: `至少 ${formatNum(minPerDay, 1)} 条/天`
    };
  }

  const maxPerDay = (range.upper - total) / remainingDays;
  return {
    cls: 'low',
    text: `${formatNum(minPerDay, 1)} ~ ${formatNum(maxPerDay, 1)} 条/天`
  };
}

function clearBadges() {
  document.querySelectorAll(`.${BADGE_CLASS}, .${TAG_CLASS}`).forEach((node) => node.remove());
}

function renderBadges(tracking) {
  if (!tracking?.stats) return;
  clearBadges();

  const total = Number(tracking.stats.total ?? tracking.stats.cumulative ?? 0);
  const remainingDays = getRemainingDays(tracking.endDate);
  const outcomes = findOutcomeNodes();

  for (const { labelNode, card, text } of outcomes) {
    const range = parseRange(text);
    if (!range) continue;

    const tag = document.createElement('span');
    tag.className = TAG_CLASS;
    tag.textContent = 'XTracker';
    labelNode.appendChild(tag);

    const desc = describeRange(range, total, remainingDays);
    const badge = document.createElement('div');
    badge.className = `${BADGE_CLASS} ${BADGE_CLASS}--${desc.cls}`;
    badge.textContent = desc.text;

    card.appendChild(badge);
  }
}

function showNotSupported(message) {
  clearBadges();
  const existing = document.getElementById(SUMMARY_ID);
  existing?.remove();
  const target = findTitleElement()?.closest('div');
  if (!target) return;
  const wrapper = document.createElement('div');
  wrapper.id = SUMMARY_ID;
  wrapper.className = 'xtracker-overlay-summary';
  wrapper.textContent = message;
  target.parentElement?.insertBefore(wrapper, target.nextSibling);
}

async function render() {
  const title = getCurrentTitle();
  const key = `${location.pathname}::${title}`;
  if (!title || key === lastRenderKey) return;

  try {
    const tracking = await findTrackingForCurrentMarket();
    if (!tracking?.stats) {
      showNotSupported('没在 xtracker 上匹配到这个市场，或者这个页面不是 tweet count 这类市场。');
      lastRenderKey = key;
      return;
    }

    buildSummary(tracking);
    renderBadges(tracking);
    lastRenderKey = key;
  } catch (error) {
    console.error('[xtracker-overlay]', error);
    showNotSupported(`XTracker 数据读取失败：${error.message}`);
    lastRenderKey = key;
  }
}

const observer = new MutationObserver(() => {
  window.clearTimeout(observer._timer);
  observer._timer = window.setTimeout(render, 600);
});

observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('popstate', () => {
  lastRenderKey = null;
  setTimeout(render, 300);
});
window.addEventListener('load', () => setTimeout(render, 800));
setTimeout(render, 1200);
