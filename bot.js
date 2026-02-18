require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN environment variable is required');

const CHANNELS = [
  { name: 'CEFR Demo', url: 'https://t.me/cefrwithdemo', id: '@cefrwithdemo' },
  { name: 'Demo Materials', url: 'https://t.me/demo_materials', id: '@demo_materials' },
  { name: 'Study Need Future', url: 'https://t.me/studyneedfuture', id: '@studyneedfuture' },
];

const WEBSITE_URL = (process.env.WEBSITE_URL || 'https://imtihonnnitopshirishuchunmengabos.netlify.app/').trim();
const bot = new Telegraf(BOT_TOKEN);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildSiteCardText() {
  return [
    '<b>🎯 Testga kirish tayyor</b>',
    '',
    'Barcha kanallarga obunangiz tasdiqlandi.',
    'Davom etish uchun pastdagi <b>Testni boshlash</b> tugmasini bosing.',
  ].join('\n');
}

function buildStartText() {
  return [
    '<b>✨ Xush kelibsiz!</b>',
    '',
    '<pre>╔════════════════════════════╗',
    '║   OBUNA TEKSHIRUV BOTI    ║',
    '╚════════════════════════════╝</pre>',
    '<b>Imtihonni boshlash uchun:</b>',
    '1. Quyidagi kanallarga obuna bo\'ling',
    '2. So\'ng <b>Tekshirish</b> tugmasini bosing',
  ].join('\n');
}

function buildFailText(notJoined) {
  return [
    '<b>⚠️ Hali obuna bo\'lmagan kanallar:</b>',
    '',
    ...notJoined.map((name) => `• ${escapeHtml(name)}`),
    '',
    'Obuna bo\'lib, qayta <b>Tekshirish</b> tugmasini bosing.',
  ].join('\n');
}

function buildSuccessText() {
  return [
    '<b>✅ Tabriklaymiz, hammasi tayyor!</b>',
    '',
    'Siz barcha kanallarga muvaffaqiyatli obuna bo\'ldingiz.',
    '',
    buildSiteCardText(),
  ].join('\n');
}

function buildJoinedChannelsText() {
  return [
    '<b>✅ Obuna tasdiqlandi</b>',
    '',
    'Barcha kanallar tekshirildi. Pastda test uchun yangi xabar yuborildi.',
  ].join('\n');
}

function getWebhookConfig(rawWebhookUrl) {
  if (!rawWebhookUrl) return null;

  try {
    const url = new URL(rawWebhookUrl);
    if (url.hostname.toLowerCase() === 'yourdomain.com') return null;

    const hookPath = url.pathname && url.pathname !== '/' ? url.pathname : undefined;
    return {
      domain: url.origin,
      hookPath,
    };
  } catch {
    return null;
  }
}

async function isSubscribed(telegram, channelId, userId) {
  try {
    const member = await telegram.getChatMember(channelId, userId);
    return ['creator', 'administrator', 'member'].includes(member.status);
  } catch (err) {
    console.error(`getChatMember error (${channelId}):`, err.message);
    return false;
  }
}

async function checkAllChannels(telegram, userId) {
  return Promise.all(CHANNELS.map((ch) => isSubscribed(telegram, ch.id, userId)));
}

function buildChannelKeyboard(subscribed = []) {
  const rows = CHANNELS.map((ch, i) => [
    Markup.button.url(`${subscribed[i] ? '✅' : '❌'} ${ch.name}`, ch.url),
  ]);

  rows.push([Markup.button.callback('🔄 Tekshirish', 'check_subscription')]);
  return Markup.inlineKeyboard(rows);
}

function buildSuccessKeyboard() {
  return Markup.inlineKeyboard([[buildWebsiteButton('🚀 Testni boshlash')]]);
}

function buildWebsiteButton(text = '🌐 Saytni ochish') {
  if (typeof Markup.button.webApp === 'function') {
    return Markup.button.webApp(text, WEBSITE_URL);
  }

  return Markup.button.url(text, WEBSITE_URL);
}

async function sendOrEditMessage(ctx, text, keyboard) {
  const extra = { parse_mode: 'HTML', ...keyboard };

  try {
    await ctx.editMessageText(text, extra);
  } catch (err) {
    const description = err?.description || err?.message || '';

    if (description.includes('message is not modified')) {
      await ctx.answerCbQuery('Holat o\'zgarmadi.').catch(() => {});
      return;
    }

    await ctx.reply(text, extra);
  }
}

bot.start(async (ctx) => {
  await ctx.reply(buildStartText(), {
    parse_mode: 'HTML',
    ...buildChannelKeyboard([]),
  });
});

bot.command('site', async (ctx) => {
  await ctx.reply(buildSiteCardText(), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[buildWebsiteButton('🚀 Testni boshlash')]]),
  });
});

bot.action('check_subscription', async (ctx) => {
  await ctx.answerCbQuery('Tekshirilmoqda...').catch(() => {});

  const userId = ctx.from.id;
  const results = await checkAllChannels(ctx.telegram, userId);
  const allJoined = results.every(Boolean);

  if (allJoined) {
    await sendOrEditMessage(ctx, buildJoinedChannelsText(), buildChannelKeyboard(results));
    await ctx.reply(buildSuccessText(), {
      parse_mode: 'HTML',
      ...buildSuccessKeyboard(),
    });
    return;
  }

  const notJoinedNames = CHANNELS.filter((_, i) => !results[i]).map((ch) => ch.name);
  await sendOrEditMessage(ctx, buildFailText(notJoinedNames), buildChannelKeyboard(results));
});

bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx?.answerCbQuery('Xatolik yuz berdi. Qayta urinib ko\'ring.').catch(() => {});
});

const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_CONFIG = getWebhookConfig(process.env.WEBHOOK_URL);

if (process.env.NODE_ENV === 'production' && WEBHOOK_CONFIG) {
  bot
    .launch({
      webhook: {
        ...WEBHOOK_CONFIG,
        port: PORT,
      },
    })
    .then(() => {
      console.log(`Bot is running in webhook mode on port ${PORT}`);
    });
} else {
  bot.launch();
  console.log('Bot is running in long polling mode');
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

