require('dotenv').config();
const express = require('express');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const session = require('express-session');
const helmet = require('helmet');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PORT = Number(process.env.PORT || 3000);
const ADMIN_NAME = process.env.ADMIN_NAME || 'Prottoy Nishan';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString('hex');
const PUBLIC_DIR = path.join(__dirname, 'public');
const PRIVATE_DIR = path.join(__dirname, 'private');
const BANK_FILE = path.join(__dirname, '.local', 'question-bank.json');
const BANK = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));

if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD is missing. Copy .env.example to .env and set a Host password.');
  process.exit(1);
}
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET is not set; a temporary secret will be generated for this run.');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '40kb' }));

const sessionMiddleware = session({
  name: 'ffb.local.host',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 8 * 60 * 60 * 1000 }
});
app.use(sessionMiddleware);
app.use(express.static(PUBLIC_DIR, { index: false, dotfiles: 'ignore' }));

function hostOnly(req, res, next) {
  if (req.session?.isHost) return next();
  return res.status(401).json({ error: 'Host login required.' });
}
function constantTimeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
function cleanPublicState() {
  return JSON.parse(JSON.stringify(game.publicDisplay));
}
function broadcast() {
  game.publicDisplay.updatedAt = Date.now();
  io.emit('public:state', cleanPublicState());
}
function findQuestion(setId, questionIndex) {
  const set = BANK.sets.find(item => item.id === setId);
  if (!set || !Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= set.questions.length) return null;
  return { set, question: set.questions[questionIndex] };
}
function lanAddresses() {
  const addresses = [];
  for (const items of Object.values(os.networkInterfaces())) {
    for (const nic of items || []) {
      if ((nic.family === 'IPv4' || nic.family === 4) && !nic.internal) addresses.push(nic.address);
    }
  }
  return [...new Set(addresses)];
}

let game = {
  setId: null,
  questionIndex: null,
  revealedIndexes: [],
  publicDisplay: {
    visible: false,
    setId: null,
    setName: null,
    questionNumber: null,
    question: null,
    answerCount: 10,
    answers: [],
    updatedAt: Date.now()
  }
};

app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
app.get('/host', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'host.html')));
app.get('/participant', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'participant.html')));
app.get('/api/local/state', (_req, res) => res.json(cleanPublicState()));
app.get('/api/local/session', (req, res) => res.json({ isHost: Boolean(req.session?.isHost), name: req.session?.hostName || null }));
app.get('/api/local/host/sets', hostOnly, (_req, res) => res.json(BANK.sets));
app.get('/api/local/host/export-bank', hostOnly, (_req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ffb-question-bank-private.json"');
  res.sendFile(BANK_FILE);
});
app.get('/api/local/join-info', hostOnly, (_req, res) => {
  const urls = lanAddresses().map(ip => `http://${ip}:${PORT}/participant?mode=local`);
  res.json({ urls, local: `http://localhost:${PORT}/participant?mode=local` });
});

const loginAttempts = new Map();
function loginThrottle(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, start: now };
  if (now - record.start > 15 * 60 * 1000) { record.count = 0; record.start = now; }
  if (record.count >= 12) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  record.count++;
  loginAttempts.set(ip, record);
  next();
}

app.post('/api/local/login', loginThrottle, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  const validName = name.toLocaleLowerCase() === ADMIN_NAME.toLocaleLowerCase();
  if (!validName || !constantTimeEqual(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'নাম অথবা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।' });
  }
  req.session.regenerate(error => {
    if (error) return res.status(500).json({ error: 'Could not create a login session.' });
    req.session.isHost = true;
    req.session.hostName = ADMIN_NAME;
    req.session.save(saveError => {
      if (saveError) return res.status(500).json({ error: 'Could not save the login session.' });
      res.json({ ok: true, name: ADMIN_NAME });
    });
  });
});
app.post('/api/local/logout', hostOnly, (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.post('/api/local/host/reveal-question', hostOnly, (req, res) => {
  const setId = String(req.body?.setId || '');
  const questionIndex = Number(req.body?.questionIndex);
  const found = findQuestion(setId, questionIndex);
  if (!found) return res.status(400).json({ error: 'প্রশ্নটি পাওয়া যায়নি।' });
  game.setId = setId;
  game.questionIndex = questionIndex;
  game.revealedIndexes = [];
  game.publicDisplay = {
    visible: true,
    setId,
    setName: found.set.name,
    questionNumber: questionIndex + 1,
    question: found.question.question,
    answerCount: found.question.answers.length,
    answers: [],
    updatedAt: Date.now()
  };
  broadcast();
  res.json({ ok: true, state: cleanPublicState() });
});

app.post('/api/local/host/toggle-answer', hostOnly, (req, res) => {
  const answerIndex = Number(req.body?.answerIndex);
  const found = game.setId ? findQuestion(game.setId, game.questionIndex) : null;
  if (!found || !game.publicDisplay.visible) return res.status(400).json({ error: 'প্রথমে একটি প্রশ্ন প্রকাশ করুন।' });
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= found.question.answers.length) {
    return res.status(400).json({ error: 'উত্তরটি পাওয়া যায়নি।' });
  }
  const existing = game.revealedIndexes.includes(answerIndex);
  game.revealedIndexes = existing
    ? game.revealedIndexes.filter(index => index !== answerIndex)
    : [...game.revealedIndexes, answerIndex].sort((a, b) => a - b);
  game.publicDisplay.answers = game.revealedIndexes.map(index => ({ index, ...found.question.answers[index] }));
  broadcast();
  res.json({ ok: true, state: cleanPublicState() });
});

app.post('/api/local/host/hide-question', hostOnly, (_req, res) => {
  game.setId = null;
  game.questionIndex = null;
  game.revealedIndexes = [];
  game.publicDisplay = {
    visible: false, setId: null, setName: null, questionNumber: null,
    question: null, answerCount: 10, answers: [], updatedAt: Date.now()
  };
  broadcast();
  res.json({ ok: true, state: cleanPublicState() });
});

io.engine.use(sessionMiddleware);
io.on('connection', socket => {
  socket.emit('public:state', cleanPublicState());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nFamily Feud Bangladesh — FFB 3.0');
  console.log(`Local computer: http://localhost:${PORT}`);
  for (const ip of lanAddresses()) console.log(`Local Wi-Fi participant link: http://${ip}:${PORT}/participant?mode=local`);
  console.log(`Local Host name: ${ADMIN_NAME}`);
  console.log('Local Host password: configured in .env (not printed)');
  console.log('Cloud mode is served from this same frontend when Firebase is configured.');
  console.log('Keep this process running during a Local Wi-Fi game.\n');
});
