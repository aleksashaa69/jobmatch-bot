const { Telegraf, Markup } = require('telegraf');
const { getOrCreateUser, grantPremiumWeek, grantPack10, savePayment } = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

function webAppUrl(extraPath = '') {
  return `${process.env.PUBLIC_URL}${extraPath}`;
}

bot.start(async (ctx) => {
  const startPayload = ctx.startPayload; // например "r123456" — код пригласившего
  let referredBy = null;
  if (startPayload && startPayload.startsWith('r')) {
    referredBy = parseInt(startPayload.slice(1), 10);
    if (referredBy === ctx.from.id) referredBy = null; // нельзя пригласить самого себя
  }

  await getOrCreateUser(ctx.from, referredBy);

  await ctx.reply(
    `Привет! Я помогу собрать сильный отклик на вакансию за 60 секунд.\n\n` +
    `Вставляешь текст резюме + текст вакансии — получаешь:\n` +
    `• готовый отклик и сопроводительное письмо\n` +
    `• что поправить в резюме именно под эту вакансию\n` +
    `• сильные и слабые места\n` +
    `• сообщение рекрутеру и фоллоуап через 2-3 дня\n\n` +
    `Жми кнопку ниже 👇`,
    Markup.inlineKeyboard([
      Markup.button.webApp('🚀 Открыть приложение', webAppUrl('/'))
    ])
  );
});

bot.command('invite', async (ctx) => {
  const user = await getOrCreateUser(ctx.from, null);
  const link = `https://t.me/${ctx.botInfo.username}?start=${user.referral_code}`;
  await ctx.reply(
    `Пригласи друзей — за каждого получишь +3 отклика бесплатно 🎁\n\nТвоя ссылка:\n${link}`
  );
});

// Telegram Stars: подтверждение перед оплатой (обязательно отвечать быстро)
bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

// Успешная оплата
bot.on('message', async (ctx, next) => {
  if (ctx.message && ctx.message.successful_payment) {
    const sp = ctx.message.successful_payment;
    const userId = ctx.from.id;
    const product = sp.invoice_payload; // 'pack_10' | 'week_unlimited'

    if (product === 'pack_10') {
      await grantPack10(userId);
      await ctx.reply('Оплата прошла ✅ Начислено 10 откликов. Возвращайся в приложение — они уже доступны.');
    } else if (product === 'week_unlimited') {
      await grantPremiumWeek(userId);
      await ctx.reply('Оплата прошла ✅ Безлимит на 7 дней активирован. Хорошей охоты за офером!');
    }

    await savePayment(userId, product, sp.total_amount, sp.telegram_payment_charge_id);
    return;
  }
  return next();
});

module.exports = { bot };
