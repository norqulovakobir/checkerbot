# Telegram Bot - Channel Subscription Checker

Bu bot foydalanuvchi majburiy kanallarga obuna bo'lganini tekshiradi va tasdiqlangach sayt linkini chiroyli card (ramka) ko'rinishida beradi.

## Asosiy imkoniyatlar

- `/start` orqali obuna tekshiruv jarayoni
- Kanal tugmalari holati: `✅` yoki `❌`
- `Tekshirish` tugmasi orqali real-time qayta tekshiruv
- To'liq obunadan keyin sayt linki ramkali ko'rinishda va alohida tugma bilan
- Qo'shimcha `/site` komandasi orqali sayt card'ini alohida yuborish

## O'rnatish

1. Dependensiyalarni o'rnating:
```bash
npm install
```

2. `.env` fayl yarating (`.env.example` asosida):
```env
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
WEBSITE_URL=https://imtihonnnitopshirishuchunmengabos.netlify.app/
NODE_ENV=development
PORT=3000
WEBHOOK_URL=
```

3. Botni ishga tushiring:
```bash
npm start
```

## Eslatma

- Bot kanallarda a'zolikni tekshirishi uchun bot o'sha kanallarda admin bo'lishi kerak.
- `NODE_ENV=production` bo'lsa va `WEBHOOK_URL` valid bo'lsa webhook rejimda ishlaydi.
- `WEBHOOK_URL` bo'sh yoki noto'g'ri bo'lsa bot avtomatik long-polling rejimga tushadi.
