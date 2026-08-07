const express = require('express');
const crypto = require('crypto');
const { generateMatch } = require('./ai');
const { getOrCreateUser, canGenerateAndConsume, saveGeneration, pool } = require('./db');

const router = express.Router();

// Проверка подлинности данных Telegram WebApp (initData)
// см. https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function verifyTelegramInitData(initData) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort()) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const userJson = params.get('user');
  return userJson ? JSON.parse(userJson) : null;
}

// Достаём и проверяем пользователя из заголовка X-Telegram-Init-Data
async function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'no_init_data' });

  const tgUser = verifyTelegramInitData(initData);
  if (!tgUser) return res.status(401).json({ error: 'invalid_init_data' });

  req.tgUser = tgUser;
  req.dbUser = await getOrCreateUser(tgUser, null);
  next();
}

// Публичный конфиг, без авторизации — нужен, чтобы фронтенд знал username бота
router.get('/config', (req, res) => {
  res.json({ botUsername: process.env.BOT_USERNAME || '' });
});

router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await pool.query('select * from users where id = $1', [req.dbUser.id]);
  const u = rows[0];
  res.json({
    id: u.id,
    is_premium: u.is_premium && u.premium_until && new Date(u.premium_until) > new Date(),
    premium_until: u.premium_until,
    packs_left: u.packs_left,
    free_used_today: u.free_used_today,
    free_limit: parseInt(process.env.FREE_DAILY_LIMIT || '2', 10),
    referral_code: u.referral_code,
    referral_count: u.referral_count
  });
});

router.post('/generate', authMiddleware, async (req, res) => {
  const { resume, vacancy } = req.body;
  if (!resume || !vacancy || resume.trim().length < 20 || vacancy.trim().length < 20) {
    return res.status(400).json({ error: 'too_short' });
  }

  const freeDailyLimit = parseInt(process.env.FREE_DAILY_LIMIT || '2', 10);
  const check = await canGenerateAndConsume(req.dbUser.id, freeDailyLimit);
  if (!check.allowed) {
    return res.status(402).json({ error: 'limit_reached' });
  }

  try {
    const result = await generateMatch(resume, vacancy);
    await saveGeneration(req.dbUser.id, resume, vacancy, result);
    res.json({ result });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'generation_failed', message: e.message });
  }
});

// Создание ссылки на оплату Telegram Stars
router.post('/pay/create-link', authMiddleware, async (req, res) => {
  const { product } = req.body; // 'pack_10' | 'week_unlimited'
  const prices = {
    pack_10: { amount: parseInt(process.env.PRICE_PACK_10 || '99', 10), title: '10 откликов', desc: 'Пакет из 10 генераций откликов и разбора резюме' },
    week_unlimited: { amount: parseInt(process.env.PRICE_WEEK_UNLIMITED || '249', 10), title: 'Безлимит на 7 дней', desc: 'Неограниченные генерации на 7 дней' }
  };
  const p = prices[product];
  if (!p) return res.status(400).json({ error: 'unknown_product' });

  try {
    const { bot } = require('./bot');
    const link = await bot.telegram.createInvoiceLink({
      title: p.title,
      description: p.desc,
      payload: product,
      provider_token: '', // для Stars всегда пусто
      currency: 'XTR',
      prices: [{ label: p.title, amount: p.amount }]
    });
    res.json({ link });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'invoice_failed', message: e.message });
  }
});

module.exports = router;
