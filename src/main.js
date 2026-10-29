import './style.css';
import { requireSupabase } from './supabase.js';
import { STEPS } from './questions.js';
import './guard.js';

const app = document.querySelector('#app');
const DISCORD_URL = 'https://discord.gg/YEmmkfBhE';
const SAVED_KEY = 'kickmods-application-id';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULT_VIEW = {
  pending: { tone: 'wait', title: 'استنى يوم ونتيجتك هتظهر هنا', text: 'وصلنا تقديمك والإدارة هتراجعه. ارجع للصفحة دي بعد يوم وهتلاقي القرار هنا.' },
  reviewing: { tone: 'wait', title: 'تقديمك تحت المراجعة دلوقتي', text: 'الإدارة بتراجع طلبك حاليًا. ارجع بعد شوية وشوف النتيجة.' },
  accepted: { tone: 'ok', title: 'تم قبولك في فريق المودريتورز 🎉', text: 'ادخل سيرفر الديسكورد وهتلاقي رول مود معاك.' },
  rejected: { tone: 'no', title: 'تقديمك مش مقبول المرة دي', text: 'شكرًا على وقتك. تقدر تقدّم تاني في وقت لاحق.' },
};
const MAX_BYTES = 44 * 1024 * 1024; // bucket limit is 50 MB; warn before that
const MAX_PROOF_BYTES = 8 * 1024 * 1024;

// crypto.randomUUID only exists in secure contexts (https/localhost); fall back so the page never dies on plain http.
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const state = {
  stream: null, recorder: null, chunks: [], bytes: 0, blob: null, mime: 'video/webm',
  startedAt: null, timerId: null, visibility: [], step: 0,
  appId: uuid(), uploaded: { video: false, proof: null }, warned: false, listenersOn: false,
};

const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ intro + loader */
function renderIntro() {
  app.innerHTML = `
    <div class="loader" id="loader" role="status" aria-label="جاري التحميل">
      <div class="loader-inner">
        <div class="loader-word" aria-hidden="true">
          <span class="ghost">KICK MODS</span>
          <span class="fill">KICK <em>MODS</em></span>
        </div>
        <div class="loader-meta"><div class="loader-bar"><i></i></div><span><span data-pct>0</span>%</span></div>
      </div>
    </div>
    <main class="shell booting" id="shell">
      <nav class="nav">
        <span class="wordmark">KICK <b>MODS</b></span>
        <span class="pill live">التقديم مفتوح</span>
      </nav>

      <section class="hero">
        <div>
          <h1 class="hero-enter" style="--enter-delay:.05s">مش مجرد مود.<span>إنت مسؤول عن الشات.</span></h1>
          <p class="lead hero-enter" style="--enter-delay:.2s">قدّم للانضمام لفريق KICK MODS. جاوب بنفسك وبوضوح، وكل تقديم بيتراجع من الإدارة واحد واحد.</p>
          <div class="cta-row hero-enter" style="--enter-delay:.35s">
            <button id="begin" class="primary">ابدأ التقديم <span class="arrow">←</span></button>
            <button id="check" class="ghost-btn">شوف نتيجة تقديمي</button>
          </div>
        </div>
        <div class="chat hero-enter" style="--enter-delay:.3s" aria-hidden="true">
          <div class="chat-head"><span>#chat</span><span class="live">LIVE</span></div>
          <div class="chat-body">
            <div class="msg struck" style="--i:0"><b class="c1">spam_king</b><span>buy followers cheap cheap cheap</span></div>
            <div class="msg action" style="--i:1">🛡 تم تايم أوت 5 دقائق للمستخدم spam_king</div>
            <div class="msg" style="--i:2"><b class="c2">omar_22</b>شكرًا يا مود، الشات بقى أهدى</div>
            <div class="msg" style="--i:3"><b class="c3">nour</b>الفريق ده شغال صح 👏</div>
          </div>
        </div>
      </section>

      <section class="flow hero-enter" style="--enter-delay:.5s">
        <div><em>01</em><strong>بياناتك وإجاباتك</strong><span>أربع خطوات قصيرة عن خبرتك وطريقة تفكيرك.</span></div>
        <div><em>02</em><strong>تسجيل الشاشة</strong><span>بيشتغل أثناء التقديم بعد موافقتك وإذن المتصفح. من غير كاميرا ولا ميكروفون.</span></div>
        <div><em>03</em><strong>مراجعة الإدارة</strong><span>بنراجع الطلب وبنرد عليك لو اتقبلت.</span></div>
      </section>

      <section id="application-area" class="panel hidden"></section>
      <footer><span>KICK MODS · Moderator Recruitment</span><span>بياناتك بتتشاف من فريق المراجعة فقط</span></footer>
    </main>`;

  document.querySelector('#begin').addEventListener('click', renderConsent);
  document.querySelector('#check').addEventListener('click', () => {
    const saved = localStorage.getItem(SAVED_KEY);
    saved ? showResult(saved) : renderLookup();
  });
  runLoader(() => {
    const shell = document.querySelector('#shell');
    shell.classList.remove('booting');
    shell.classList.add('ready');
    // Returning applicant on the same device: show their result straight away.
    const saved = localStorage.getItem(SAVED_KEY);
    if (saved && UUID_RE.test(saved)) setTimeout(() => showResult(saved), 700);
  });
}

function runLoader(onReveal) {
  const el = document.querySelector('#loader');
  const pct = el.querySelector('[data-pct]');
  const MIN = 1700;
  let fontsReady = !document.fonts;
  document.fonts?.ready.then(() => { fontsReady = true; });
  setTimeout(() => { fontsReady = true; }, 2600);
  const t0 = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const tick = now => {
    const t = Math.min((now - t0) / (reduce ? 200 : MIN), 1);
    let p = 1 - Math.pow(1 - t, 3);
    if (!fontsReady) p = Math.min(p, 0.92);
    el.style.setProperty('--p', p.toFixed(4));
    pct.textContent = Math.round(p * 100);
    if (p >= 1) {
      el.classList.add('done');
      onReveal();
      setTimeout(() => el.remove(), 1400);
    } else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ------------------------------------------------------------------ consent */
function renderConsent() {
  const area = document.querySelector('#application-area');
  area.classList.remove('hidden');
  area.classList.add('enter');
  area.innerHTML = `
    <h2>قبل ما نبدأ</h2>
    <p class="sub">لإكمال التقديم لازم تسمح بتسجيل الشاشة. مفيش كاميرا ولا ميكروفون بيتفتحوا. التسجيل بيبدأ بعد موافقتك فقط، وبيفضل شغال لحد ما تبعت التقديم.</p>
    <div class="notice">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span>التسجيل والبيانات بتتخزن في مساحة خاصة، وبيشوفها فريق مراجعة التقديمات فقط. لو رفضت تسجيل الشاشة مش هتقدر تكمل التقديم.</span>
    </div>
    <label class="checkline"><input type="checkbox" id="consent"> قرأت ووافقت على تسجيل شاشتي واستخدامه لمراجعة التقديم.</label>
    <button class="primary" id="allow-screen">موافقة وبدء تسجيل الشاشة</button>
    <p id="screen-error" class="error" role="alert"></p>`;
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.querySelector('#allow-screen').addEventListener('click', async () => {
    const err = document.querySelector('#screen-error');
    err.textContent = '';
    if (!document.querySelector('#consent').checked) { err.textContent = 'لازم توافق على التسجيل الأول.'; return; }
    if (!navigator.mediaDevices?.getDisplayMedia || !window.MediaRecorder) {
      err.textContent = 'المتصفح ده مش بيدعم تسجيل الشاشة. افتح الموقع من كمبيوتر بمتصفح Chrome أو Edge أو Firefox حديث.'; return;
    }
    const allow = document.querySelector('#allow-screen');
    allow.disabled = true;
    try {
      // Screen only: no camera, no microphone, no system audio.
      state.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 10, max: 15 }, width: { max: 1280 }, height: { max: 720 } },
        audio: false,
      });
      state.stream.getVideoTracks()[0]?.addEventListener('ended', () => toast('مشاركة الشاشة اتوقفت. شغّلها تاني وإلا التسجيل مش هيكمل.'));
      startRecording();
      renderForm();
    } catch {
      err.textContent = 'لازم تسمح بمشاركة الشاشة عشان تكمل. اختار الشاشة واضغط مشاركة وحاول تاني.';
      allow.disabled = false; allow.textContent = 'موافقة وبدء تسجيل الشاشة';
    }
  });
}

/* ------------------------------------------------------------------ result (status) */
let resultTimer;
function openPanel(html) {
  clearInterval(resultTimer);
  const area = document.querySelector('#application-area');
  area.classList.remove('hidden');
  area.classList.remove('enter'); void area.offsetWidth; area.classList.add('enter');
  area.innerHTML = html;
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return area;
}

function renderLookup() {
  const area = openPanel(`
    <h2>شوف نتيجة تقديمك</h2>
    <p class="sub">اكتب رمز المتابعة اللي ظهرلك بعد ما بعتّ التقديم.</p>
    <form id="lookup-form" novalidate>
      <label>رمز المتابعة<input id="lookup-code" dir="ltr" autocomplete="off" spellcheck="false" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label>
      <button class="primary" type="submit">اعرض النتيجة</button>
      <p id="lookup-error" class="error" role="alert"></p>
    </form>`);
  area.querySelector('#lookup-form').addEventListener('submit', e => {
    e.preventDefault();
    const code = area.querySelector('#lookup-code').value.trim();
    if (!UUID_RE.test(code)) { area.querySelector('#lookup-error').textContent = 'الرمز مش صح. انسخه من صفحة تأكيد التقديم.'; return; }
    showResult(code, { save: true });
  });
}

async function fetchStatus(id) {
  const { data, error } = await requireSupabase().rpc('get_application_status', { p_id: id });
  if (error) throw error;
  return data; // null when the code is unknown
}

async function showResult(id, { save = false } = {}) {
  const area = openPanel(`<div class="result-load"><div class="spinner"></div><p class="sub">جاري تحميل النتيجة...</p></div>`);
  const draw = async (silent = false) => {
    try {
      const status = await fetchStatus(id);
      if (!status) {
        localStorage.removeItem(SAVED_KEY);
        area.innerHTML = `<h2>الرمز مش موجود</h2><p class="sub">مفيش تقديم بالرمز ده. اتأكد إنك نسخته كامل.</p><button class="ghost-btn" id="retry-code">جرّب رمز تاني</button>`;
        area.querySelector('#retry-code').addEventListener('click', renderLookup);
        clearInterval(resultTimer);
        return;
      }
      if (save) localStorage.setItem(SAVED_KEY, id);
      const v = RESULT_VIEW[status] || RESULT_VIEW.pending;
      area.innerHTML = `
        <div class="result ${v.tone}">
          <div class="result-icon">${v.tone === 'ok' ? '✓' : v.tone === 'no' ? '–' : '<span class="spinner small"></span>'}</div>
          <h2>${v.title}</h2>
          <p class="sub">${v.text}</p>
          ${status === 'accepted' ? `<a class="primary discord" href="${DISCORD_URL}" target="_blank" rel="noopener">ادخل سيرفر الديسكورد <span class="arrow">←</span></a>` : ''}
          ${status === 'pending' || status === 'reviewing' ? `<button class="ghost-btn" id="refresh-result">تحديث النتيجة</button>` : ''}
          <p class="hint code-line">رمز المتابعة: <span dir="ltr">${id}</span></p>
        </div>`;
      area.querySelector('#refresh-result')?.addEventListener('click', () => draw());
      if (status === 'accepted' || status === 'rejected') clearInterval(resultTimer);
    } catch (e) {
      if (!silent) area.innerHTML = `<h2>تعذر تحميل النتيجة</h2><p class="sub">${esc(e.message || 'حاول تاني بعد شوية.')}</p><button class="ghost-btn" id="retry-result">حاول تاني</button>`;
      area.querySelector('#retry-result')?.addEventListener('click', () => showResult(id));
    }
  };
  await draw();
  clearInterval(resultTimer);
  resultTimer = setInterval(() => draw(true), 60000);
}

/* ------------------------------------------------------------------ recording */
function startRecording() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  const mime = candidates.find(t => MediaRecorder.isTypeSupported(t));
  state.chunks = []; state.bytes = 0;
  // Low bitrate keeps a long answer session under the storage file-size limit.
  state.recorder = new MediaRecorder(state.stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 500_000 });
  state.recorder.ondataavailable = e => {
    if (!e.data?.size) return;
    state.chunks.push(e.data);
    state.bytes += e.data.size;
    if (state.bytes > MAX_BYTES && !state.warned) { state.warned = true; toast('التسجيل قرّب من الحد الأقصى. كمّل الإرسال في أسرع وقت.'); }
  };
  state.recorder.onstop = () => {
    state.mime = (state.recorder.mimeType || mime || 'video/webm').split(';')[0];
    state.blob = new Blob(state.chunks, { type: state.mime });
  };
  state.recorder.start(1000);
  state.startedAt = new Date().toISOString();

  if (!state.listenersOn) {
    state.listenersOn = true;
    document.addEventListener('visibilitychange', () => {
      if (state.recorder?.state === 'recording') state.visibility.push({ event: document.visibilityState, at: new Date().toISOString() });
    });
    window.addEventListener('beforeunload', warnBeforeLeave);
  }
}
const warnBeforeLeave = e => { if (state.recorder?.state === 'recording') { e.preventDefault(); e.returnValue = ''; } };

function mountPip() {
  document.querySelector('#pip')?.remove();
  const pip = document.createElement('div');
  pip.className = 'pip'; pip.id = 'pip';
  pip.innerHTML = `<div class="rec"><i></i><span id="rec-time">00:00</span> REC</div>`;
  document.body.append(pip);
  document.body.classList.add('has-pip');
  const t0 = Date.now();
  clearInterval(state.timerId);
  state.timerId = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    const el = document.querySelector('#rec-time');
    if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 500);
}

/* ------------------------------------------------------------------ form */
function fieldHtml(f) {
  const req = f.optional ? '' : 'required';
  const label = f.optional ? `${f.label} <small>(لو ينطبق)</small>` : f.label;
  if (f.type === 'textarea') return `<label>${label}<textarea name="${f.key}" rows="3" ${req}></textarea></label>`;
  if (f.type === 'select') return `<label>${label}<select name="${f.key}" ${req}><option value="">اختار</option><option>أيوه</option><option>لأ</option></select></label>`;
  const attrs = [f.min != null ? `min="${f.min}"` : '', f.max != null ? `max="${f.max}"` : '', f.inputmode ? `inputmode="${f.inputmode}"` : '',
    f.autocomplete ? `autocomplete="${f.autocomplete}"` : '', f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''].join(' ');
  return `<label>${label}<input name="${f.key}" type="${f.type}" ${attrs} ${req}></label>`;
}

function renderForm() {
  mountPip();
  const area = document.querySelector('#application-area');
  const steps = STEPS.map((s, i) => `
    <div class="step ${i ? 'hidden' : ''}" data-step="${i}">
      <h2>${s.title}</h2><p class="sub">${s.hint}</p>
      ${i === 0 ? `<div class="grid">${s.fields.map(fieldHtml).join('')}</div>
        <label>صورة إثبات السن <small>(اختياري، حتى 8MB)</small><input id="age-proof" type="file" accept="image/*"></label>
        <p class="hint">ارفع أقل قدر من البيانات الضرورية، ويُفضّل تغطية رقم البطاقة والعنوان قبل الرفع.</p>` : s.fields.map(fieldHtml).join('')}
      ${i === STEPS.length - 1 ? `<label class="checkline"><input type="checkbox" id="final-confirm" required> أؤكد أن الإجابات تخصني وأن الفيديو اتسجل أثناء التقديم.</label>` : ''}
    </div>`).join('');

  area.classList.add('enter');
  area.innerHTML = `
    <div class="wizard-top"><div><span class="pill live">الخطوة <span id="step-n">1</span> من ${STEPS.length}</span></div></div>
    <div class="progress" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
    <form id="application-form" novalidate>
      ${steps}
      <p id="submit-status" class="error" role="alert"></p>
      <div class="actions">
        <button type="button" class="ghost-btn" id="back" disabled>السابق</button>
        <button type="button" class="primary" id="next">التالي <span class="arrow">←</span></button>
        <button type="submit" class="primary hidden" id="submit-app">إرسال التقديم</button>
      </div>
    </form>`;
  area.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const form = document.querySelector('#application-form');
  document.querySelector('#next').addEventListener('click', () => { if (validateStep(state.step)) goTo(state.step + 1); });
  document.querySelector('#back').addEventListener('click', () => goTo(state.step - 1));
  form.addEventListener('submit', submitApplication);
}

function goTo(i) {
  if (i < 0 || i >= STEPS.length) return;
  document.querySelectorAll('.step').forEach(el => el.classList.add('hidden'));
  const next = document.querySelector(`.step[data-step="${i}"]`);
  next.classList.remove('hidden');
  next.classList.remove('enter'); void next.offsetWidth; next.classList.add('enter');
  state.step = i;
  document.querySelectorAll('.progress i').forEach((b, n) => b.classList.toggle('on', n <= i));
  document.querySelector('#step-n').textContent = i + 1;
  document.querySelector('#back').disabled = i === 0;
  document.querySelector('#next').classList.toggle('hidden', i === STEPS.length - 1);
  document.querySelector('#submit-app').classList.toggle('hidden', i !== STEPS.length - 1);
  document.querySelector('#submit-status').textContent = '';
  document.querySelector('#application-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function validateStep(i) {
  const status = document.querySelector('#submit-status');
  status.textContent = '';
  for (const el of document.querySelectorAll(`.step[data-step="${i}"] input, .step[data-step="${i}"] textarea, .step[data-step="${i}"] select`)) {
    if (!el.checkValidity()) { el.reportValidity(); return false; }
  }
  const proof = document.querySelector('#age-proof')?.files[0];
  if (i === 0 && proof && proof.size > MAX_PROOF_BYTES) { status.textContent = 'صورة إثبات السن أكبر من 8MB. اختار صورة أصغر.'; return false; }
  return true;
}

/* ------------------------------------------------------------------ submit */
async function submitApplication(event) {
  event.preventDefault();
  const formEl = event.currentTarget; // event.currentTarget becomes null after the first await
  if (!validateStep(state.step)) return;
  const button = document.querySelector('#submit-app');
  const status = document.querySelector('#submit-status');
  const overlay = showSending('جاري إنهاء التسجيل...');
  button.disabled = true; status.textContent = '';
  try {
    const db = requireSupabase();
    if (state.recorder && state.recorder.state !== 'inactive') {
      await new Promise(resolve => { state.recorder.addEventListener('stop', resolve, { once: true }); state.recorder.stop(); });
    }
    if (!state.blob || state.blob.size === 0) throw new Error('التسجيل فاضي. اتأكد إن مشاركة الشاشة شغالة وحاول تاني.');
    const finishedAt = new Date().toISOString();

    const form = new FormData(formEl);
    const answers = {};
    for (const s of STEPS) for (const f of s.fields) answers[f.key] = String(form.get(f.key) ?? '').trim();

    const ext = state.mime.includes('mp4') ? 'mp4' : 'webm';
    const videoPath = `applications/${state.appId}/recording.${ext}`;
    if (!state.uploaded.video) {
      overlay('جاري رفع الفيديو... متقفلش الصفحة');
      const { error } = await db.storage.from('application-private').upload(videoPath, state.blob, { contentType: state.mime, upsert: false });
      if (error) throw error;
      state.uploaded.video = true;
    }

    const file = document.querySelector('#age-proof')?.files[0];
    let ageProofPath = state.uploaded.proof;
    if (file && !ageProofPath) {
      overlay('جاري رفع الصورة...');
      const safeExt = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'jpg';
      ageProofPath = `applications/${state.appId}/age-proof.${safeExt}`;
      const { error } = await db.storage.from('application-private').upload(ageProofPath, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (error) throw error;
      state.uploaded.proof = ageProofPath;
    }

    overlay('جاري حفظ التقديم...');
    const { error: insertError } = await db.from('applications').insert({
      id: state.appId,
      full_name: answers.full_name,
      age: Number(answers.age),
      kick_username: answers.kick_username.replace(/^@/, ''),
      availability_hours: answers.availability,
      answers,
      video_path: videoPath,
      age_proof_path: ageProofPath,
      recording_started_at: state.startedAt,
      recording_finished_at: finishedAt,
      visibility_events: state.visibility,
    });
    if (insertError) throw insertError;

    state.stream?.getTracks().forEach(t => t.stop());
    clearInterval(state.timerId);
    document.querySelector('#pip')?.remove();
    document.body.classList.remove('has-pip');
    document.querySelector('.sending')?.remove();
    localStorage.setItem(SAVED_KEY, state.appId);
    const area = document.querySelector('#application-area');
    area.innerHTML = `
      <div class="success">
        <div class="success-icon"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
        <h2>تم استلام تقديمك</h2>
        <p class="sub">استنى يوم ونتيجتك هتظهر هنا في الموقع. لو اتقبلت هيظهرلك رابط الديسكورد.</p>
        <div class="code-box">
          <small>رمز المتابعة (احتفظ بيه لو هتفتح من جهاز تاني)</small>
          <div class="code-row"><code dir="ltr" id="my-code">${state.appId}</code><button type="button" class="ghost-btn" id="copy-code">نسخ</button></div>
        </div>
        <button class="primary" id="see-result">شوف حالة التقديم</button>
      </div>`;
    area.querySelector('#copy-code').addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(state.appId); e.currentTarget.textContent = 'اتنسخ ✓'; } catch { toast('انسخ الرمز يدويًا.'); }
    });
    area.querySelector('#see-result').addEventListener('click', () => showResult(state.appId));
    area.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    console.error(e);
    document.querySelector('.sending')?.remove();
    status.textContent = `حصل خطأ في الإرسال: ${e.message || 'حاول تاني.'} تقدر تدوس إرسال مرة تانية.`;
    button.disabled = false;
  }
}

function showSending(text) {
  document.querySelector('.sending')?.remove();
  const el = document.createElement('div');
  el.className = 'sending';
  el.innerHTML = `<div role="status"><div class="spinner"></div><strong id="sending-text">${esc(text)}</strong></div>`;
  document.body.append(el);
  return t => { const n = el.querySelector('#sending-text'); if (n) n.textContent = t; };
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 5000);
}

renderIntro();