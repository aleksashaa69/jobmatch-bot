const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function genReferralCode(id) {
  return 'r' + id.toString(36);
}

// Найти пользователя, а если его нет — создать
async function getOrCreateUser(tgUser, referredBy) {
  const { rows } = await pool.query('select * from users where id = $1', [tgUser.id]);
  if (rows[0]) return rows[0];

  const code = genReferralCode(tgUser.id);
  const { rows: created } = await pool.query(
    `insert into users (id, username, first_name, referred_by, referral_code)
     values ($1, $2, $3, $4, $5) returning *`,
    [tgUser.id, tgUser.username || null, tgUser.first_name || null, referredBy || null, code]
  );

  // Бонус пригласившему: +3 бесплатные генерации сверх лимита (кладём как packs_left)
  if (referredBy) {
    await pool.query(
      `update users set packs_left = packs_left + 3, referral_count = referral_count + 1
       where id = $1`,
      [referredBy]
    );
  }

  return created[0];
}

// Сбросить дневной счётчик, если наступил новый день
async function resetDailyIfNeeded(user) {
  const today = new Date().toISOString().slice(0, 10);
  if (user.free_reset_date && user.free_reset_date.toISOString) {
    if (user.free_reset_date.toISOString().slice(0, 10) === today) return user;
  }
  const { rows } = await pool.query(
    `update users set free_used_today = 0, free_reset_date = current_date
     where id = $1 returning *`,
    [user.id]
  );
  return rows[0];
}

// Проверка: может ли пользователь сделать генерацию, и списание лимита
async function canGenerateAndConsume(userId, freeDailyLimit) {
  let { rows } = await pool.query('select * from users where id = $1', [userId]);
  let user = rows[0];
  user = await resetDailyIfNeeded(user);

  const premiumActive = user.is_premium && user.premium_until && new Date(user.premium_until) > new Date();

  if (premiumActive) {
    return { allowed: true, reason: 'premium' };
  }
  if (user.packs_left > 0) {
    await pool.query('update users set packs_left = packs_left - 1 where id = $1', [userId]);
    return { allowed: true, reason: 'pack' };
  }
  if (user.free_used_today < freeDailyLimit) {
    await pool.query('update users set free_used_today = free_used_today + 1 where id = $1', [userId]);
    return { allowed: true, reason: 'free' };
  }
  return { allowed: false, reason: 'limit_reached' };
}

async function saveGeneration(userId, resumeText, vacancyText, result) {
  await pool.query(
    `insert into generations (user_id, resume_text, vacancy_text, result) values ($1,$2,$3,$4)`,
    [userId, resumeText, vacancyText, result]
  );
}

async function grantPremiumWeek(userId) {
  await pool.query(
    `update users set is_premium = true,
     premium_until = greatest(coalesce(premium_until, now()), now()) + interval '7 days'
     where id = $1`,
    [userId]
  );
}

async function grantPack10(userId) {
  await pool.query('update users set packs_left = packs_left + 10 where id = $1', [userId]);
}

async function savePayment(userId, product, amountStars, chargeId) {
  await pool.query(
    `insert into payments (user_id, product, amount_stars, telegram_charge_id) values ($1,$2,$3,$4)`,
    [userId, product, amountStars, chargeId]
  );
}

module.exports = {
  pool,
  getOrCreateUser,
  canGenerateAndConsume,
  saveGeneration,
  grantPremiumWeek,
  grantPack10,
  savePayment
};
