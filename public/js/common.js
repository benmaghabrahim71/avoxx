/* Avox Roleplay — shared frontend (v4 Avox District) */

const Avox = (() => {
  const TOKEN_KEY = 'avox.token';
  const USER_KEY  = 'avox.user';
  const SERVER_ADDR = '45.146.252.233:7681';
  const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2310b981'/%3E%3Ctext x='32' y='44' font-family='sans-serif' font-size='38' font-weight='800' fill='%23040406' text-anchor='middle'%3EA%3C/text%3E%3C/svg%3E";
  let SITE_CFG = { adminMinLevel: 1 };

  function getApiBase() {
    // Configurable base URL for API requests (useful when serving /public from static hosting).
    // Supported:
    // - window.__AVOX_API_BASE__ = "https://example.com"
    // - <meta name="avox-api-base" content="https://example.com">
    const winBase = (typeof window !== 'undefined' && window.__AVOX_API_BASE__) ? String(window.__AVOX_API_BASE__) : '';
    if (winBase) return winBase.replace(/\/$/, '');
    const meta = (typeof document !== 'undefined')
      ? document.querySelector('meta[name="avox-api-base"]')
      : null;
    const metaBase = meta?.getAttribute('content') ? String(meta.getAttribute('content')) : '';
    if (metaBase) return metaBase.replace(/\/$/, '');
    return '';
  }

  async function refreshUser() {
    if (!getToken()) return null;
    try {
      const { user } = await api('/api/auth/me');
      if (user) {
        const cur = getUser() || {};
        setUser({ ...cur, uid: user.uid, username: user.username, adminlevel: user.adminlevel || 0 });
        return user;
      }
    } catch (_) {}
    return getUser();
  }

  async function loadConfig() {
    try {
      SITE_CFG = await api('/api/config');
    } catch (_) {}
    return SITE_CFG;
  }

  function isAdmin(user) {
    if (!user) return false;
    const min = SITE_CFG.adminMinLevel ?? 1;
    return (user.adminlevel || 0) >= min;
  }

  /* ─── Auth ───────────────────────────────────────────────────────────── */
  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function setUser(u) { u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); }
  function logout() { setToken(null); setUser(null); location.href = '/login'; }

  /* ─── API ──────────────────────────────────────────────────────────── */
  async function api(path, opts = {}) {
    const base = getApiBase();
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const tok = getToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const timeoutMs = opts.timeout ?? 25000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      const url = (base && typeof path === 'string' && path.startsWith('/')) ? (base + path) : path;
      res = await fetch(url, { ...opts, headers, signal: ctrl.signal });
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new Error('Request timed out. Check your connection or try again.');
        err.status = 408;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();

    // If a reverse proxy/static host isn't forwarding /api, servers often return an HTML 404 page.
    // Surface a clearer error than "Unexpected token < in JSON" or raw HTML.
    const ct = res.headers?.get?.('content-type') || '';
    const looksLikeHtml = /text\/html/i.test(ct) || /^\s*<!doctype html/i.test(text) || /^\s*<html[\s>]/i.test(text);
    if (looksLikeHtml) {
      const err = new Error('API returned HTML instead of JSON. Your website host is not forwarding `/api/*` to the backend. Start the backend or configure a reverse-proxy for `/api`.');
      err.status = res.status || 0;
      err.data = { error: 'HTML response from API', status: res.status, contentType: ct };
      throw err;
    }
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { error: text }; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }

  /* ─── DOM ──────────────────────────────────────────────────────────── */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null) continue;
      if      (k === 'class')      node.className = v;
      else if (k === 'style')      Object.assign(node.style, v);
      else if (k === 'html')       node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else                          node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number'
        ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  /* ─── Formatters ───────────────────────────────────────────────────── */
  function fmtMoney(n) {
    if (n == null) return '$0';
    return '$' + Number(n).toLocaleString('en-US');
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }
  function fmtCompact(n) {
    const x = Number(n || 0);
    if (x >= 1e9) return (x / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (x >= 1e6) return (x / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (x >= 1e3) return (x / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(x);
  }
  function fmtDate(d) {
    if (d == null || d === '') return '—';
    if (typeof d === 'number' || (/^\d+$/.test(String(d)))) {
      const n = Number(d);
      const ms = n < 1e12 ? n * 1000 : n;
      const date = new Date(ms);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      }
    }
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return String(d);
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  function fmtRelative(d) {
    if (!d) return '—';
    const date = new Date(d);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60)        return 'just now';
    if (diff < 3600)      return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400)     return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd ago';
    return date.toLocaleDateString();
  }

  /* ─── Icons ────────────────────────────────────────────────────────── */
  const Icons = {
    home:        '<path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5Z"/>',
    trophy:      '<path d="M6 4h12v3a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V4Zm6 8v5m-4 4h8M3 6h3v1a3 3 0 0 1-3 3V6Zm15 0h3v4a3 3 0 0 1-3-3V6Z"/>',
    shield:      '<path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z"/>',
    user:        '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users:       '<circle cx="9" cy="8" r="3.5"/><path d="M2 21a7 7 0 0 1 14 0"/><circle cx="17" cy="9" r="3"/><path d="M16 21a6 6 0 0 1 6-6"/>',
    car:         '<path d="M5 11 6.6 6.4A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.4L19 11m-14 0h14m-14 0v6a1 1 0 0 0 1 1h2v-3h8v3h2a1 1 0 0 0 1-1v-6"/><circle cx="8" cy="14" r="1.2"/><circle cx="16" cy="14" r="1.2"/>',
    house:       '<path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z"/>',
    money:       '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
    bolt:        '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    ban:         '<circle cx="12" cy="12" r="9"/><path d="m5 5 14 14"/>',
    settings:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    play:        '<path d="M8 5v14l11-7L8 5Z"/>',
    arrow:       '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    copy:        '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    check:       '<path d="m5 12 5 5 9-11"/>',
    flame:       '<path d="M12 2c1 4 5 5 5 11a5 5 0 0 1-10 0c0-2.5 1-3.5 2-5 1 2 3 2 3-1 0-2-1-3 0-5Z"/>',
    crown:       '<path d="M3 7l4 5 5-7 5 7 4-5v12H3V7Z"/>',
    pulse:       '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
    cart:        '<circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.5 12h11l2-9H6"/>',
    sparkle:     '<path d="M12 3v6m0 6v6M3 12h6m6 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4"/>',
    globe:       '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    lock:        '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    eye:         '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff:      '<path d="M3 3l18 18"/><path d="M10.6 6.1A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a17.3 17.3 0 0 1-3.3 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.5 7 10 7c1.6 0 3-.3 4.3-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    mail:        '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    discord:     '<path d="M9 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Zm6 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM19.3 5.6A17.3 17.3 0 0 0 15 4.3l-.2.4c-1.5-.4-3.1-.4-4.6 0L10 4.3a17 17 0 0 0-4.3 1.3C2.9 9.6 2.2 13.4 2.5 17.2A17.5 17.5 0 0 0 7.8 20l.6-1c-.7-.3-1.4-.6-2-1l.1-.1c3.6 1.7 7.5 1.7 11 0l.2.1c-.7.4-1.3.7-2 1l.6 1a17.4 17.4 0 0 0 5.3-2.8c.4-4.5-.6-8.3-2.3-11.6Z"/>',
    menu:        '<path d="M4 7h16M4 12h16M4 17h16"/>',
    x:           '<path d="M6 6l12 12M18 6 6 18"/>',
    ticket:      '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V14a2 2 0 0 1 0-4V8Z"/>',
    news:        '<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5M8 17h8"/>',
  };

  function svgIcon(name, attrs = {}) {
    const path = Icons[name] || '';
    const cls  = attrs.class || '';
    const size = attrs.size  || 18;
    return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  function avGrad(name) {
    const s = String(name || 'x');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 8;
  }
  function initials(name) {
    return String(name || '?').split(/[_\s]+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  function countUp(node, target, opts = {}) {
    if (!node) return;
    const start = Number(node.dataset.cur || 0);
    const end   = Number(target);
    if (Number.isNaN(end)) { node.textContent = String(target); return; }
    const dur   = opts.duration || 800;
    const fmt   = opts.format || ((v) => Math.round(v).toLocaleString());
    const t0    = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = fmt(start + (end - start) * eased);
      if (p < 1) requestAnimationFrame(step);
      else node.dataset.cur = end;
    }
    requestAnimationFrame(step);
  }

  /* ─── Toast ────────────────────────────────────────────────────────── */
  function ensureToastRoot() {
    let r = document.getElementById('toastRoot');
    if (!r) {
      r = document.createElement('div');
      r.id = 'toastRoot';
      r.className = 'toast-root';
      document.body.appendChild(r);
    }
    return r;
  }
  function toast(msg, kind = 'info') {
    const root = ensureToastRoot();
    const t = el('div', { class: `toast toast-${kind}` }, msg);
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); }, 3000);
    setTimeout(() => t.remove(), 3400);
  }

  /* ─── Nav links config ───────────────────────────────────────────────── */
  function navLinks(user, isAdmin) {
    const links = [
      { href: '/',            label: 'Home',        key: 'home',        icon: 'home' },
      { href: '/shop',        label: 'Shop',        key: 'shop',        icon: 'cart' },
      { href: '/news',        label: 'News',        key: 'news',        icon: 'news' },
      { href: '/leaderboard', label: 'Leaderboard', key: 'leaderboard', icon: 'trophy' },
      { href: '/factions',    label: 'Factions',    key: 'factions',    icon: 'shield' },
      { href: '/gangs',       label: 'Gangs',       key: 'gangs',       icon: 'flame' },
      { href: '/staff',       label: 'Staff',       key: 'staff',       icon: 'users' },
      { href: '/bans',        label: 'Banlist',     key: 'bans',        icon: 'ban' },
      { href: '/rules',       label: 'Rules',       key: 'rules',       icon: 'shield' },
    ];
    if (user)    links.push({ href: '/tickets', label: 'Tickets', key: 'tickets', icon: 'ticket' });
    if (user)    links.push({ href: '/ucp',     label: 'UCP',     key: 'ucp',     icon: 'user' });
    if (isAdmin) links.push({ href: '/admin',   label: 'Admin',   key: 'admin',   icon: 'settings' });
    return links;
  }

  /* Primary links shown in the top bar (rest are in the mobile drawer). */
  const NAV_PRIMARY = new Set(['home', 'shop', 'news', 'leaderboard', 'rules', 'ucp']);

  /* UCP-only dock — Shop, Tickets, Rules; Admin shown for in-game staff */
  const UCP_DOCK_BASE = [
    { href: '/ucp',              label: 'Information', icon: 'ic-dock-info',     key: 'ucp' },
    { href: '/shop',             label: 'Shop',        icon: 'ic-dock-shop',     key: 'shop' },
    { href: '/tickets',          label: 'Tickets',     icon: 'ic-dock-ticket',   key: 'tickets' },
    { href: '/rules',            label: 'Rules',       icon: 'ic-dock-help',     key: 'rules' },
    { href: '/ucp#settings',     label: 'Settings',    icon: 'ic-dock-settings', key: 'settings' },
  ];

  function getUcpDock(user) {
    const dock = [...UCP_DOCK_BASE];
    if (isAdmin(user)) {
      dock.splice(dock.length - 1, 0, {
        href: '/admin', label: 'Admin', icon: 'ic-dock-admin', key: 'admin',
      });
    }
    return dock;
  }

  const DOCK_PATH_MAP = {
    '/ucp': 'ucp', '/shop': 'shop', '/tickets': 'tickets', '/rules': 'rules', '/admin': 'admin',
  };

  const ACTIVE_DOCK_MAP = {
    ucp: 'ucp', shop: 'shop', tickets: 'tickets', rules: 'rules', admin: 'admin',
  };

  function dockKeyFromPath(path = location.pathname, hash = location.hash) {
    if (hash === '#settings') return 'settings';
    const p = path.replace(/\/$/, '') || '/';
    return DOCK_PATH_MAP[p] ?? null;
  }

  function activeToDockKey(active) {
    return ACTIVE_DOCK_MAP[active] ?? null;
  }

  function renderUcpDock(activeKey) {
    let wrap = document.getElementById('ucpDockWrap') || document.querySelector('.ucp-dock-wrap');
    if (!wrap) {
      wrap = el('nav', { class: 'ucp-dock-wrap', id: 'ucpDockWrap', 'aria-label': 'UCP navigation' });
      wrap.appendChild(el('div', { class: 'ucp-dock', id: 'ucpDock' }));
      document.body.appendChild(wrap);
    } else if (!wrap.id) {
      wrap.id = 'ucpDockWrap';
    }
    let dock = document.getElementById('ucpDock') || wrap.querySelector('.ucp-dock');
    if (!dock) {
      dock = el('div', { class: 'ucp-dock', id: 'ucpDock' });
      wrap.appendChild(dock);
    }
    dock.innerHTML = getUcpDock(getUser()).map((d) => `
      <a href="${d.href}" class="${d.key === activeKey ? 'active' : ''}">
        <span class="dock-ic">${dashIcon(d.icon, 22)}</span>
        ${d.label}
      </a>`).join('');
  }

  function mountUcpDock(activeKey) {
    document.body.classList.add('ucp-mode', 'has-dock');
    renderUcpDock(activeKey || dockKeyFromPath() || 'ucp');
    if (!window.__avoxDockHash) {
      window.__avoxDockHash = true;
      window.addEventListener('hashchange', () => {
        renderUcpDock(dockKeyFromPath() || 'ucp');
        handleUcpHashScroll();
      });
    }
    handleUcpHashScroll();
  }

  async function mountUcpPage({ active, title, public: allowGuest } = {}) {
    mountFavicon();
    document.body.classList.add('ucp-mode');
    const main = document.querySelector('main');
    if (main) main.classList.add('ucp-subpage', 'ucp-shell');

    if (!getToken()) {
      if (!allowGuest) {
        requireLogin();
        return false;
      }
      await loadConfig();
      document.body.prepend(renderPublicSubHeader(title));
      initReveal();
      return true;
    }

    await loadConfig();
    await refreshUser();
    document.body.prepend(renderUcpSubHeader(title));
    mountUcpDock(activeToDockKey(active) || active);
    initReveal();
    return true;
  }

  async function mountUcpAdminPage({ title } = {}) {
    if (!requireLogin()) return false;
    await loadConfig();
    await refreshUser();
    const user = getUser();
    if (!isAdmin(user)) {
      mountFavicon();
      document.body.classList.add('ucp-mode');
      const main = document.querySelector('main');
      if (main) {
        main.classList.add('ucp-subpage', 'ucp-shell');
        main.innerHTML = `
          <div class="ucp-panel center" style="max-width:480px;margin:40px auto;padding:32px;">
            <div class="alert-error">Admin access required. Your in-game admin level must be ${SITE_CFG.adminMinLevel ?? 1} or higher.</div>
            <a class="btn btn-primary" href="/ucp" style="margin-top:16px;display:inline-flex;">Back to UCP</a>
          </div>`;
      }
      document.body.prepend(renderUcpSubHeader('Admin'));
      mountUcpDock('ucp');
      return false;
    }
    return mountUcpPage({ active: 'admin', title: title || 'Admin Control' });
  }

  function renderPublicSubHeader(title) {
    return el('header', { class: 'ucp-sub-top' },
      el('a', { class: 'ucp-sub-brand', href: '/login' },
        el('span', { class: 'logo' }, 'A'),
        el('span', {}, 'Avox Roleplay'),
      ),
      title ? el('h1', { class: 'ucp-sub-title' }, title) : null,
      el('div', { class: 'ucp-sub-right' },
        el('a', { class: 'btn btn-sm btn-primary', href: '/login' }, 'Log in'),
        el('a', { class: 'btn btn-sm btn-ghost', href: '/register' }, 'Register'),
      ),
    );
  }

  function renderUcpSubHeader(title) {
    const user = getUser();
    return el('header', { class: 'ucp-sub-top' },
      el('a', { class: 'ucp-sub-brand', href: '/ucp' },
        el('span', { class: 'logo' }, 'A'),
        el('span', {}, 'Avox Control Panel'),
      ),
      title ? el('h1', { class: 'ucp-sub-title' }, title) : null,
      el('div', { class: 'ucp-sub-right' },
        user ? el('span', { class: 'ucp-sub-user' }, user.username) : null,
        el('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: logout }, 'Log out'),
      ),
    );
  }

  function renderNav(active) {
    const user    = getUser();
    const links   = navLinks(user, isAdmin(user));

    const burger = el('button', {
      class: 'nav-burger',
      type: 'button',
      'aria-label': 'Open menu',
      onclick: () => openDrawer(active),
    });
    burger.innerHTML = svgIcon('menu', { size: 20 });

    const connectBtn = el('a', {
      class: 'btn btn-sm btn-primary nav-connect',
      href: `samp://${SERVER_ADDR}`,
      title: 'Connect to server',
    });
    connectBtn.innerHTML = svgIcon('play', { size: 14 }) + ' Play';

    const shopBtn = el('a', { class: 'btn btn-sm btn-shop-nav', href: '/shop' });
    shopBtn.innerHTML = svgIcon('cart', { size: 14 }) + ' Shop';

    const barLinks = links.filter((l) => NAV_PRIMARY.has(l.key) || l.key === active);

    return el('header', { class: 'nav-wrap' },
      el('nav', { class: 'nav' },
        el('a', { class: 'brand', href: '/' },
          el('span', { class: 'logo' }, 'A'),
          el('span', { class: 'logo-text' },
            el('span', { class: 'logo-name' }, 'Avox'),
            el('span', { class: 'logo-sub' }, 'RP'),
          ),
        ),
        burger,
        el('div', { class: 'links' },
          ...barLinks.map((l) => el('a', {
            href: l.href,
            class: l.key === active ? 'active' : '',
          }, l.label)),
        ),
        el('div', { class: 'right' },
          connectBtn,
          shopBtn,
          ...(user
            ? [
                el('a', { class: 'user-chip', href: '/ucp' },
                  el('span', { class: `av av-grad-${avGrad(user.username)}` }, initials(user.username)),
                  el('span', { class: 'uname' }, user.username),
                ),
                el('button', { class: 'btn btn-sm btn-ghost', onclick: logout }, 'Out'),
              ]
            : [
                el('a', { class: 'btn btn-sm btn-login-nav', href: '/login', html: svgIcon('user', { size: 14 }) + ' Log in' }),
              ]),
        ),
      ),
    );
  }

  function openDrawer(active) {
    const user    = getUser();
    const links   = navLinks(user, isAdmin(user));

    const backdrop = el('div', { class: 'drawer-backdrop', onclick: closeDrawer });
    const drawer = el('aside', { class: 'drawer' },
      el('div', { class: 'drawer-head' },
        el('a', { class: 'brand', href: '/' },
          el('span', { class: 'logo' }, 'A'),
          el('span', { class: 'logo-text' },
            el('span', { class: 'logo-name' }, 'Avox'),
            el('span', { class: 'logo-sub' }, 'Roleplay'),
          ),
        ),
        el('button', { class: 'drawer-close', type: 'button', onclick: closeDrawer, html: svgIcon('x', { size: 20 }) }),
      ),
      el('div', { class: 'drawer-links' },
        ...links.map((l) => el('a', {
          href: l.href,
          class: l.key === active ? 'active' : '',
          html: svgIcon(l.icon, { size: 18 }) + l.label,
          onclick: closeDrawer,
        })),
      ),
      el('div', { class: 'drawer-foot' },
        el('a', { class: 'btn btn-primary btn-full', href: `samp://${SERVER_ADDR}`, html: svgIcon('play', { size: 16 }) + ' Connect to server' }),
        el('div', { class: 'drawer-addr mono' }, SERVER_ADDR),
      ),
    );
    backdrop.id = 'drawerBackdrop';
    drawer.id = 'drawerPanel';
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);
    document.body.classList.add('drawer-open');
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      drawer.classList.add('show');
    });
  }

  function closeDrawer() {
    const backdrop = document.getElementById('drawerBackdrop');
    const drawer   = document.getElementById('drawerPanel');
    if (backdrop) backdrop.classList.remove('show');
    if (drawer)   drawer.classList.remove('show');
    document.body.classList.remove('drawer-open');
    setTimeout(() => { backdrop?.remove(); drawer?.remove(); }, 300);
  }

  function renderFooter() {
    const year = new Date().getFullYear();
    const f = el('footer', { class: 'footer' });
    f.innerHTML = `
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="brand-line"><span class="logo">A</span>
            <div><strong>AVOX ROLEPLAY</strong><span>Premium SA-MP experience</span></div>
          </div>
          <p class="footer-desc">Build your story in San Andreas. Factions, gangs, jobs, properties — your city, your rules.</p>
          <div class="footer-social">
            <a href="${SITE_CFG.discordUrl || 'https://discord.gg/'}" target="_blank" rel="noopener" class="social-btn" title="Discord">${svgIcon('discord', { size: 18 })}</a>
            <a href="samp://${SITE_CFG.serverAddr || SERVER_ADDR}" class="social-btn" title="Connect">${svgIcon('play', { size: 18 })}</a>
          </div>
        </div>
        <div class="footer-col">
          <h4>Community</h4>
          <a href="/news">News</a>
          <a href="/staff">Staff Team</a>
          <a href="/leaderboard">Leaderboard</a>
          <a href="/rules">Server Rules</a>
        </div>
        <div class="footer-col">
          <h4>In-game</h4>
          <a href="/factions">Factions</a>
          <a href="/gangs">Gangs</a>
          <a href="/shop">Shop</a>
          <a href="/bans">Banlist</a>
        </div>
        <div class="footer-col">
          <h4>Account</h4>
          <a href="/login">Log in</a>
          <a href="/register">Register</a>
          <a href="/ucp">Control Panel</a>
          <a href="/tickets">Support Tickets</a>
        </div>
        <div class="footer-col footer-server">
          <h4>Server</h4>
          <div class="server-box">
            <span class="pill" id="footerStatus"><span class="dot"></span><span>Checking…</span></span>
            <code class="mono">${SERVER_ADDR}</code>
            <a class="btn btn-sm btn-outline" href="samp://${SERVER_ADDR}">Connect now</a>
          </div>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© ${year} Avox Roleplay. Not affiliated with Rockstar Games.</span>
        <span class="footer-meta">San Andreas Multiplayer · Roleplay</span>
      </div>
    `;
    pollFooterStatus();
    return f;
  }

  async function pollFooterStatus() {
    const pill = document.getElementById('footerStatus');
    if (!pill) return;
    try {
      const s = await api('/api/server/status');
      const span = pill.querySelector('span:last-child');
      if (s.online) {
        pill.classList.add('online'); pill.classList.remove('offline');
        span.textContent = `Online · ${s.players}/${s.maxPlayers}`;
      } else {
        pill.classList.add('offline'); pill.classList.remove('online');
        span.textContent = 'Offline';
      }
    } catch (_) {
      pill.classList.add('offline');
      pill.querySelector('span:last-child').textContent = 'Unreachable';
    }
  }

  function initScrollProgress() {
    const bar = el('div', { class: 'scroll-progress' });
    bar.innerHTML = '<span></span>';
    document.body.prepend(bar);
    window.addEventListener('scroll', () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.querySelector('span').style.width = p + '%';
    }, { passive: true });
  }

  function mountFavicon() {
    const existing = document.querySelector('link[rel="icon"]');
    if (existing) existing.href = FAVICON;
    else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = FAVICON;
      document.head.appendChild(link);
    }
  }

  function initReveal() {
    const nodes = document.querySelectorAll('.reveal, [data-reveal]');
    if (!nodes.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -32px 0px' });
    nodes.forEach((n) => io.observe(n));
  }

  function mountPageBanner({ eyebrow, title, hint, actions = '' }) {
    const main = document.querySelector('main');
    const textKids = [
      eyebrow ? el('div', { class: 'eyebrow' }, eyebrow) : null,
      el('h1', {}, title),
      hint ? el('p', { class: 'hint' }, hint) : null,
    ].filter(Boolean);
    const banner = el('section', { class: 'page-banner reveal' },
      el('div', { class: 'page-banner-inner' },
        el('div', { class: 'page-banner-text' }, ...textKids),
        actions ? el('div', { class: 'page-banner-actions', html: actions }) : null,
      ),
    );
    if (main) main.before(banner);
    else document.body.insertBefore(banner, document.querySelector('.footer'));
    requestAnimationFrame(() => banner.classList.add('visible'));
  }

  function mountShell(active) {
    mountFavicon();
    document.body.classList.add('shell');
    initScrollProgress();
    document.body.prepend(renderNav(active));
    document.body.appendChild(renderFooter());

    const wrap = document.querySelector('.nav-wrap');
    window.addEventListener('scroll', () => {
      wrap?.classList.toggle('scrolled', window.scrollY > 24);
    }, { passive: true });
    initReveal();
  }

  function mountPage({ active, eyebrow, title, hint, actions, skipBanner } = {}) {
    mountShell(active);
    if (!skipBanner && title) mountPageBanner({ eyebrow, title, hint, actions });
  }

  function requireLogin() {
    if (!getToken()) {
      const next = location.pathname + location.search + location.hash;
      location.href = '/login?next=' + encodeURIComponent(next);
      return false;
    }
    return true;
  }

  async function runUcpPage({ active, title } = {}, fn) {
    if (!await mountUcpPage({ active, title })) return;
    try { await fn?.(); } catch (e) { toast(e.message || 'Something went wrong', 'error'); }
  }

  function handleUcpHashScroll() {
    if (location.hash === '#settings') {
      requestAnimationFrame(() => document.getElementById('settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  function mountAuthPage() {
    mountFavicon();
    document.body.classList.add('ucp-mode');
    loadConfig().then(() => {
      const discord = SITE_CFG.discordUrl;
      if (discord) document.querySelectorAll('[data-discord]').forEach((a) => { a.href = discord; });
      const addr = SITE_CFG.serverAddr;
      if (addr) document.querySelectorAll('[data-server]').forEach((el) => { el.textContent = addr; });
    });
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function dashIcon(id, size = 56) {
    return `<svg class="dash-svg" width="${size}" height="${size}" aria-hidden="true"><use href="/img/icons.svg#${id}"/></svg>`;
  }

  return {
    api, el, esc, dashIcon,
    getToken, setToken, getUser, setUser, logout,
    fmtMoney, fmtNum, fmtCompact, fmtDate, fmtRelative,
    svgIcon, Icons, avGrad, initials, countUp, toast,
    renderNav, renderFooter, mountShell, mountPage, mountPageBanner, mountUcpPage, mountUcpAdminPage, runUcpPage, mountAuthPage,
    initReveal, mountFavicon, requireLogin, isAdmin, loadConfig, refreshUser, handleUcpHashScroll,
    UCP_DOCK_BASE, getUcpDock, renderUcpDock, mountUcpDock, dockKeyFromPath,
    SERVER_ADDR, FAVICON,
  };
})();
