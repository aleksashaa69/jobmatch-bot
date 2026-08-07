const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const initData = tg?.initData || '';

const screens = {
  start: document.getElementById('screen-start'),
  resume: document.getElementById('screen-resume'),
  vacancy: document.getElementById('screen-vacancy'),
  loading: document.getElementById('screen-loading'),
  result: document.getElementById('screen-result'),
  paywall: document.getElementById('screen-paywall')
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  window.scrollTo(0, 0);
}

async function api(path, options = {}) {
  const res = await fetch('/api' + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'request_failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

let lastResumeText = '';
let lastVacancyText = '';
let botUsername = '';

fetch('/api/config').then((r) => r.json()).then((cfg) => {
  botUsername = cfg.botUsername || '';
  if (botUsername) {
    document.getElementById('brand-signature').textContent = `собрано в Match ⚡️ t.me/${botUsername}`;
  }
});

async function loadMe() {
  try {
    const me = await api('/me');
    const left = me.is_premium ? '∞' : Math.max(0, me.free_limit - me.free_used_today) + me.packs_left;
    document.getElementById('limit-hint').textContent = me.is_premium
      ? 'У тебя безлимит ✨'
      : `Доступно сегодня: ${left} генераций`;
    return me;
  } catch (e) {
    document.getElementById('limit-hint').textContent = '';
  }
}

function setRing(el, scoreElId, score) {
  const circumference = 327;
  const offset = circumference - (circumference * Math.min(100, Math.max(0, score))) / 100;
  requestAnimationFrame(() => { el.style.strokeDashoffset = offset; });
  if (scoreElId) document.getElementById(scoreElId).textContent = score + '%';
}

document.getElementById('btn-start').addEventListener('click', () => showScreen('resume'));

document.getElementById('btn-to-vacancy').addEventListener('click', () => {
  const val = document.getElementById('input-resume').value.trim();
  if (val.length < 20) { tg?.showAlert?.('Резюме слишком короткое — вставь чуть больше текста'); return; }
  lastResumeText = val;
  showScreen('vacancy');
});

const loadingMessages = ['Читаю резюме и вакансию…', 'Сравниваю требования…', 'Собираю отклик…', 'Почти готово…'];

document.getElementById('btn-generate').addEventListener('click', async () => {
  const val = document.getElementById('input-vacancy').value.trim();
  if (val.length < 20) { tg?.showAlert?.('Вставь текст вакансии полностью'); return; }
  lastVacancyText = val;

  showScreen('loading');
  let i = 0;
  const loadingText = document.getElementById('loading-text');
  const interval = setInterval(() => {
    i = (i + 1) % loadingMessages.length;
    loadingText.textContent = loadingMessages[i];
  }, 1400);

  try {
    const { result } = await api('/generate', {
      method: 'POST',
      body: JSON.stringify({ resume: lastResumeText, vacancy: lastVacancyText })
    });
    clearInterval(interval);
    renderResult(result);
    showScreen('result');
    loadMe();
  } catch (e) {
    clearInterval(interval);
    if (e.status === 402) {
      await renderPaywall();
      showScreen('paywall');
    } else {
      tg?.showAlert?.('Не получилось сгенерировать отклик. Попробуй ещё раз.');
      showScreen('vacancy');
    }
  }
});

function renderResult(r) {
  setRing(document.getElementById('result-ring'), 'result-score', r.match_score);
  const captions = { high: 'Сильное совпадение', mid: 'Есть над чем поработать', low: 'Резюме стоит адаптировать' };
  document.getElementById('score-caption').textContent =
    r.match_score >= 75 ? captions.high : r.match_score >= 45 ? captions.mid : captions.low;

  document.getElementById('out-cover-message').textContent = r.cover_message;
  document.getElementById('out-cover-letter').textContent = r.cover_letter;
  document.getElementById('out-recruiter').textContent = r.recruiter_message;
  document.getElementById('out-followup').textContent = r.followup_message;

  fillList('out-strong', r.strong_points);
  fillList('out-weak', r.weak_points);
  fillList('out-edits', r.resume_edits);
}

function fillList(id, items) {
  const ul = document.getElementById(id);
  ul.innerHTML = '';
  (items || []).forEach((t) => {
    const li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  });
}

document.querySelectorAll('.btn-copy').forEach((btn) => {
  btn.addEventListener('click', () => {
    const text = document.getElementById(btn.dataset.copy).textContent;
    navigator.clipboard?.writeText(text);
    btn.textContent = 'Скопировано ✓';
    setTimeout(() => (btn.textContent = 'Скопировать'), 1500);
  });
});

document.getElementById('btn-again').addEventListener('click', () => {
  document.getElementById('input-resume').value = '';
  document.getElementById('input-vacancy').value = '';
  showScreen('resume');
});

document.getElementById('btn-share').addEventListener('click', () => {
  const text = document.getElementById('out-cover-message').textContent;
  const shareText = encodeURIComponent(`Собрал отклик за 60 секунд в Match:\n\n${text}\n\nПопробуй и ты: https://t.me/${botUsername}`);
  tg?.openTelegramLink?.(`https://t.me/share/url?url=&text=${shareText}`);
});

document.getElementById('btn-invite-from-paywall').addEventListener('click', async () => {
  const me = await loadMe();
  const link = `https://t.me/${botUsername}?start=${me?.referral_code || ''}`;
  tg?.openTelegramLink?.(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Собрал сильный отклик за 60 секунд — попробуй тоже 👇')}`);
});

async function renderPaywall() {
  try {
    const [pack, week] = await Promise.all([
      api('/pay/create-link', { method: 'POST', body: JSON.stringify({ product: 'pack_10' }) }),
      api('/pay/create-link', { method: 'POST', body: JSON.stringify({ product: 'week_unlimited' }) })
    ]);
    document.getElementById('price-pack').textContent = '';
    document.getElementById('price-week').textContent = '';
    document.getElementById('plan-pack').onclick = () => tg?.openInvoice ? tg.openInvoice(pack.link, refreshAfterPay) : window.open(pack.link, '_blank');
    document.getElementById('plan-week').onclick = () => tg?.openInvoice ? tg.openInvoice(week.link, refreshAfterPay) : window.open(week.link, '_blank');
  } catch (e) {
    console.error(e);
  }
}

function refreshAfterPay(status) {
  if (status === 'paid') {
    loadMe();
    showScreen('resume');
  }
}

loadMe();
