require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');

let express = null;
try {
  express = require('express');
} catch (err) {
  console.warn('express topilmadi, bot polling rejimida ishga tushadi.');
}

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error('BOT_TOKEN environment variable is required');

const CHANNELS = [
  { name: 'CEFR Demo', url: 'https://t.me/cefrwithdemo', id: '@cefrwithdemo' },
  { name: 'Demo Materials', url: 'https://t.me/demo_materials', id: '@demo_materials' },
  { name: 'Study Need Future', url: 'https://t.me/studyneedfuture', id: '@studyneedfuture' },
  { name: 'Multilevel Mock 01', url: 'https://t.me/multilevelmock01', id: '@multilevelmock01' },
];
const VIEW_CHANNEL = CHANNELS.find((channel) => channel.id === '@studyneedfuture') || CHANNELS[0];

const WEBSITE_URL = (process.env.WEBSITE_URL || 'https://imtihonnnitopshirishuchunmengabos.netlify.app/').trim();
const PORT = Number(process.env.PORT) || 3000;
const WEBHOOK_URL = (process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/+$/, '');
const USE_WEBHOOK = process.env.NODE_ENV === 'production' && WEBHOOK_URL.length > 0;

const bot = new Telegraf(BOT_TOKEN);
const app = typeof express === 'function' ? express() : null;

if (app) {
  app.use(express.json());
}

/* =========================
   HELPER FUNKSIYALAR
========================= */
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
    '<b>Testga kirish tayyor</b>',
    '',
    'Obuna tasdiqlandi va siz test bosqichiga otdingiz.',
    'Pastdagi <b>Testni boshlash</b> tugmasi orqali davom eting.',
  ].join('\n');
}

function buildChannelStatusLine(channel, isJoined, index) {
  const statusText = isJoined ? 'Tasdiqlandi' : 'Kutilmoqda';
  const statusBadge = isJoined ? '[OK]' : '[..]';
  return `${index + 1}. ${statusBadge} <a href="${channel.url}">${escapeHtml(channel.name)}</a> - ${statusText}`;
}

function buildChannelListText(subscribed = []) {
  return CHANNELS.map((channel, index) =>
    buildChannelStatusLine(channel, Boolean(subscribed[index]), index),
  ).join('\n');
}

function buildStartText() {
  return [
    '<b>Xush kelibsiz</b>',
    '',
    '<b>Imtihonni boshlash uchun 3 qadam:</b>',
    '1. Quyidagi kanallarga obuna bo\'ling.',
    '2. <b>Obunani tekshirish</b> tugmasini bosing.',
    '3. Tasdiqdan keyin <b>Testni boshlash</b> tugmasini bosing.',
    '',
    '<b>Kanal ro\'yxati:</b>',
    buildChannelListText(),
  ].join('\n');
}

function buildFailText(results) {
  const notJoined = CHANNELS.filter((_, index) => !results[index]);
  return [
    '<b>Hali obuna bo\'lmagan kanallar:</b>',
    ...notJoined.map((channel, index) => `${index + 1}. <a href="${channel.url}">${escapeHtml(channel.name)}</a>`),
    '',
    '<b>Avval obuna bo\'ling, keyin testni boshlashingiz mumkin.</b>',
    'Obuna bo\'lgach, pastdagi <b>Obunani tekshirish</b> tugmasini bosing.',
  ].join('\n');
}

function buildSuccessText() {
  return [
    '<b>Tabriklaymiz</b>',
    '',
    'Siz barcha kanallarga muvaffaqiyatli obuna bo\'ldingiz.',
    '',
    buildSiteCardText(),
  ].join('\n');
}

/* =========================
   KLAVIATURA
========================= */
function buildChannelKeyboard(subscribed = []) {
  const rows = CHANNELS.map((ch, i) => [
    Markup.button.url(
      `${i + 1}. ${ch.name} ${subscribed[i] ? '[OK]' : '[Obuna bo\'ling]'}`,
      ch.url,
    ),
  ]);
  rows.push([Markup.button.callback('Obunani tekshirish', 'check_subscription')]);
  return Markup.inlineKeyboard(rows);
}

function buildNotJoinedKeyboard(results) {
  const notJoinedChannels = CHANNELS.filter((_, index) => !results[index]);
  const rows = notJoinedChannels.map((channel, index) => [
    Markup.button.url(`${index + 1}. ${channel.name} [Obuna bo\'ling]`, channel.url),
  ]);
  rows.push([Markup.button.callback('Obunani tekshirish', 'check_subscription')]);
  return Markup.inlineKeyboard(rows);
}

function buildSuccessKeyboard() {
  return Markup.inlineKeyboard([
    [buildWebsiteButton('Testni boshlash')],
    [Markup.button.url('View Channel', VIEW_CHANNEL.url)],
  ]);
}

function buildWebsiteButton(text = 'Saytni ochish') {
  if (typeof Markup.button.webApp === 'function') {
    return Markup.button.webApp(text, WEBSITE_URL);
  }
  return Markup.button.url(text, WEBSITE_URL);
}

/* =========================
   KANAL TEKSHIRUV
========================= */
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

/* =========================
   XABAR YUBORISH / TAHRIRLASH
========================= */
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

const lastStartTimestampByChat = new Map();
function isDuplicateStart(ctx) {
  const chatId = ctx?.chat?.id;
  if (!chatId) return false;

  const now = Date.now();
  const lastTimestamp = lastStartTimestampByChat.get(chatId) || 0;
  lastStartTimestampByChat.set(chatId, now);
  return now - lastTimestamp < 1500;
}

const lastCheckTimestampByUser = new Map();
function isDuplicateCheck(ctx) {
  const userId = ctx?.from?.id;
  if (!userId) return false;

  const now = Date.now();
  const lastTimestamp = lastCheckTimestampByUser.get(userId) || 0;
  lastCheckTimestampByUser.set(userId, now);
  return now - lastTimestamp < 1200;
}

/* =========================
   BOT HANDLERLAR
========================= */
bot.start(async (ctx) => {
  if (isDuplicateStart(ctx)) return;

  await ctx.reply(buildStartText(), {
    parse_mode: 'HTML',
    ...buildChannelKeyboard([]),
  });
});

bot.command('site', async (ctx) => {
  await ctx.reply(buildSiteCardText(), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[buildWebsiteButton('Testni boshlash')]]),
  });
});

bot.action('check_subscription', async (ctx) => {
  if (isDuplicateCheck(ctx)) {
    await ctx.answerCbQuery('Tekshiruv yuborildi, biroz kuting...').catch(() => {});
    return;
  }

  await ctx.answerCbQuery('Tekshirilmoqda...').catch(() => {});

  const userId = ctx.from.id;
  const results = await checkAllChannels(ctx.telegram, userId);
  const allJoined = results.every(Boolean);

  if (allJoined) {
    await sendOrEditMessage(ctx, buildSuccessText(), buildSuccessKeyboard());
    return;
  }

  await ctx.reply(buildFailText(results), {
    parse_mode: 'HTML',
    ...buildNotJoinedKeyboard(results),
  });
});

bot.catch((err, ctx) => {
  console.error('Bot xatosi:', err);
  ctx?.answerCbQuery('Xatolik yuz berdi. Qayta urinib ko\'ring.').catch(() => {});
});

/* =========================
   EXPRESS ROUTES
========================= */
if (app) {
  app.get('/', (req, res) => {
    res.send(`
      <html>
        <body style="font-family: Arial; padding: 20px;">
          <h1>Bot ishlayapti!</h1>
          <p>Rejim: ${USE_WEBHOOK ? 'Webhook' : 'Polling'}</p>
        </body>
      </html>
    `);
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'OK', uptime: process.uptime() });
  });
}

/* =========================
   ISHGA TUSHIRISH
========================= */
async function startBot() {
  try {
    if (USE_WEBHOOK) {
      if (!app) {
        throw new Error('Webhook rejimi uchun express kerak: npm install express');
      }

      const hookPath = `/bot${BOT_TOKEN}`;
      const webhookFullUrl = `${WEBHOOK_URL}${hookPath}`;

      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('Eski webhook ochirildi');

      app.post(hookPath, async (req, res) => {
        try {
          await bot.handleUpdate(req.body);
          res.sendStatus(200);
        } catch (err) {
          console.error('Update xatosi:', err.message);
          res.sendStatus(200);
        }
      });

      await bot.telegram.setWebhook(webhookFullUrl);
      console.log('Webhook ornatildi:', webhookFullUrl);

      const info = await bot.telegram.getWebhookInfo();
      console.log('Webhook holati:', {
        url: info.url,
        pending: info.pending_update_count,
        lastError: info.last_error_message || 'Xato yoq',
      });

      console.log('Bot ishga tushdi (Webhook rejimi)');
      return;
    }

    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    console.log('Webhook ochirildi');

    await bot.launch();
    console.log('Bot ishga tushdi (Polling rejimi)');
  } catch (error) {
    console.error('Bot ishga tushmadi:', error.message);
    if (error.response) {
      console.error('API javobi:', JSON.stringify(error.response.data));
    }
    process.exit(1);
  }
}

if (app) {
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portda ishlamoqda`);
    startBot();
  });
} else {
  startBot();
}

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
