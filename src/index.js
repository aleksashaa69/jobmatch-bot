require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { bot } = require('./bot');
const apiRoutes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.use('/api', apiRoutes);
app.use(express.static(path.join(__dirname, '..', 'public')));

// Все остальные пути отдаём index.html (одностраничное приложение)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});

bot.launch().then(() => console.log('Бот запущен'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
