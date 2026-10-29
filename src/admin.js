import './style.css';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { STEPS, STATUS_LABELS } from './questions.js';
import './guard.js';

const root = document.querySelector('#admin-app');
const TOKEN_KEY = 'kickmods-admin-token';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ui = { token: sessionStorage.getItem(TOKEN_KEY), apps: [], filter: 'all', query: '', open: new Set() };

/* ---------- API ---------- */
async function gate(body) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw Object.assign(new Error('بيانات Supabase ناقصة في إعدادات Vercel.'), { status: 0 });
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'خطأ في الخادم'), { status: res.status });
  return data;
}

/* ---------- login ---------- */
function renderLogin(message = '') {
  root.innerHTML = `
    <main class="shell admin-shell">
      <nav class="nav"><a class="wordmark" href="/">KICK <b>MODS</b></a><span class="pill">لوحة المراجعة</span></nav>
      <div class="login-wrap">
        <form class="login-card" id="login-form">
          <h1>دخول الإدارة</h1>
          <p class="sub" style="margin:0 0 6px">اكتب كلمة المرور لعرض التقديمات والفيديوهات.</p>
          <label>كلمة المرور
            <span class="pw"><input id="password" type="password" autocomplete="current-password" required autofocus><button type="button" id="toggle-pw">إظهار</button></span>
          </label>
          <button class="primary" id="login-btn">دخول</button>
          <p id="status" class="error" role="alert">${esc(message)}</p>
        </form>
      </div>
    </main>`;
  const input = document.querySelector('#password');
  document.querySelector('#toggle-pw').addEventListener('click', e => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.currentTarget.textContent = show ? 'إخفاء' : 'إظهار';
  });
  document.querySelector('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.querySelector('#login-btn');
    const status = document.querySelector('#status');
    btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> جاري التحقق';
    status.textContent = '';
    try {
      const { token } = await gate({ password: input.value });
      ui.token = token;
      sessionStorage.setItem(TOKEN_KEY, token);
      await showDashboard();
    } catch (err) {
      status.textContent = err.status === 429 ? 'محاولات كتير غلط. استنى 15 دقيقة وجرّب تاني.'
        : err.status === 401 ? 'كلمة المرور غلط.' : err.message;
      btn.disabled = false; btn.textContent = 'دخول';
    }
  });
}

/* ---------- dashboard ---------- */
async function showDashboard() {
  root.innerHTML = `
    <main class="shell admin-shell">
      <nav class="nav"><a class="wordmark" href="/">KICK <b>MODS</b></a><span class="pill live">متصل</span></nav>
      <div class="bar">
        <h1>التقديمات</h1>
        <div class="bar-actions"><button class="ghost-btn" id="refresh">تحديث</button><button class="ghost-btn" id="logout">خروج</button></div>
      </div>
      <div id="stats" class="stats"></div>
      <label class="search"><input id="search" type="search" placeholder="ابحث بالاسم أو يوزر Kick" aria-label="بحث"></label>
      <div id="list" class="app-list">${'<div class="skeleton"></div>'.repeat(3)}</div>
    </main>`;
  document.querySelector('#logout').addEventListener('click', logout);
  document.querySelector('#refresh').addEventListener('click', load);
  document.querySelector('#search').addEventListener('input', e => { ui.query = e.target.value.trim().toLowerCase(); renderList(); });
  await load();
}

function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  ui.token = null; ui.apps = []; ui.open.clear();
  renderLogin();
}

async function load() {
  try {
    const { applications } = await gate({ action: 'list', token: ui.token });
    ui.apps = applications;
    renderStats(); renderList();
  } catch (err) {
    if (err.status === 401) { sessionStorage.removeItem(TOKEN_KEY); renderLogin('انتهت الجلسة. سجّل الدخول تاني.'); return; }
    document.querySelector('#list').innerHTML = `<div class="empty">تعذر تحميل التقديمات.<br>${esc(err.message)}</div>`;
  }
}

function renderStats() {
  const count = s => ui.apps.filter(a => a.status === s).length;
  const items = [['all', 'الكل', ui.apps.length], ...Object.entries(STATUS_LABELS).map(([k, v]) => [k, v, count(k)])];
  const el = document.querySelector('#stats');
  el.innerHTML = items.map(([k, label, n]) => `<button class="stat" data-filter="${k}" aria-pressed="${ui.filter === k}"><b>${n}</b><span>${label}</span></button>`).join('');
  el.querySelectorAll('.stat').forEach(b => b.addEventListener('click', () => { ui.filter = b.dataset.filter; renderStats(); renderList(); }));
}

function renderList() {
  const list = document.querySelector('#list');
  const rows = ui.apps.filter(a =>
    (ui.filter === 'all' || a.status === ui.filter) &&
    (!ui.query || `${a.full_name} ${a.kick_username}`.toLowerCase().includes(ui.query)));
  if (!rows.length) {
    list.innerHTML = `<div class="empty">${ui.apps.length ? 'مفيش نتائج بالفلتر ده.' : 'لسه مفيش تقديمات. أول ما حد يقدّم هيظهر هنا.'}</div>`;
    return;
  }
  list.innerHTML = rows.map(cardHtml).join('');
  list.querySelectorAll('.app-card').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.app-head').addEventListener('click', () => {
      ui.open.has(id) ? ui.open.delete(id) : ui.open.add(id);
      renderList();
    });
    card.querySelectorAll('[data-status]').forEach(btn => btn.addEventListener('click', () => setStatus(id, btn.dataset.status, card)));
  });
}

function cardHtml(a) {
  const open = ui.open.has(a.id);
  const initials = (a.full_name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const away = (a.visibility_events || []).filter(e => e.event === 'hidden').length;
  const qa = STEPS.slice(1).flatMap(s => s.fields).map(f => a.answers?.[f.key]
    ? `<div><dt>${esc(f.label)}</dt><dd>${esc(a.answers[f.key])}</dd></div>` : '').join('');
  const decide = (s, cls, label) => `<button class="${cls}" data-status="${s}" ${a.status === s ? 'aria-current="true"' : ''}>${label}</button>`;
  return `
    <article class="app-card ${open ? 'open' : ''}" data-id="${esc(a.id)}">
      <button class="app-head" aria-expanded="${open}">
        <span class="avatar">${esc(initials)}</span>
        <span><div class="app-title">${esc(a.full_name)}</div><div class="app-sub">@${esc(a.kick_username)} · ${esc(a.age)} سنة · ${new Date(a.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}</div></span>
        <span class="badge ${esc(a.status)}">${esc(STATUS_LABELS[a.status] || a.status)}</span>
      </button>
      ${open ? `
      <div class="app-body">
        <div class="meta">
          <span>التواجد: ${esc(a.availability_hours || '—')}</span>
          <span>${new Date(a.created_at).toLocaleString('ar-EG')}</span>
          <span>خرج من الصفحة ${away} مرة</span>
          <span><a href="https://kick.com/${encodeURIComponent(a.kick_username)}" target="_blank" rel="noopener">قناة Kick</a></span>
          ${a.age_proof_url ? `<span><a href="${esc(a.age_proof_url)}" target="_blank" rel="noopener">صورة إثبات السن</a></span>` : ''}
        </div>
        ${a.video_url ? `<video class="preview" controls playsinline preload="metadata" src="${esc(a.video_url)}#t=0.1"></video>` : '<p class="hint">الفيديو مش متاح.</p>'}
        <dl class="qa">${qa}</dl>
        <div class="decision">
          ${decide('accepted', 'accept', 'قبول')}${decide('reviewing', 'review', 'تحت المراجعة')}${decide('rejected', 'reject', 'رفض')}${decide('pending', '', 'رجوع لجديد')}
        </div>
      </div>` : ''}
    </article>`;
}

async function setStatus(id, status, card) {
  card.querySelectorAll('.decision button').forEach(b => { b.disabled = true; });
  try {
    await gate({ action: 'set_status', token: ui.token, id, status });
    const app = ui.apps.find(a => a.id === id);
    if (app) app.status = status;
    renderStats(); renderList();
  } catch (err) {
    card.querySelectorAll('.decision button').forEach(b => { b.disabled = false; });
    if (err.status === 401) { renderLogin('انتهت الجلسة. سجّل الدخول تاني.'); return; }
    alert('تعذر حفظ القرار: ' + err.message);
  }
}

/* ---------- boot ---------- */
if (ui.token) showDashboard(); else renderLogin();
