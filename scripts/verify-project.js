const fs = require('node:fs');
const path = require('node:path');
const { parseSet, parseAnswer } = require('./ensure-question-bank');
const root = path.join(__dirname, '..');
const required = [
  'server.js', 'package.json', '.env.example', 'firebase.json',
  'firebase/database.rules.json', 'public/index.html', 'public/host.html',
  'public/participant.html', 'public/js/host.js', 'public/js/participant.js',
  'public/js/cloud-adapter.js', 'public/js/firebase-config.js'
];
for (const item of required) {
  if (!fs.existsSync(path.join(root, item))) throw new Error(`Missing required file: ${item}`);
}
const rules = JSON.parse(fs.readFileSync(path.join(root, 'firebase/database.rules.json'), 'utf8'));
if (rules.rules['.read'] !== false || rules.rules['.write'] !== false) throw new Error('Firebase root must deny public read/write access.');
if (fs.existsSync(path.join(root, 'public/data/sets.json'))) throw new Error('Full answer bank must not be stored in the public folder.');
if (!fs.readFileSync(path.join(root, 'firebase/database.rules.json'), 'utf8').includes('REPLACE_WITH_HOST_UID')) throw new Error('Firebase rules must retain a clear Host UID placeholder until configured.');
const sample = Array.from({ length: 10 }, (_, i) => `<div class="question-card"><h2>প্রশ্ন ${i + 1}: নমুনা প্রশ্ন?</h2><ol><li><span>1. নমুনা উত্তর – 20 পয়েন্ট</span></li></ol></div>`).join('\n');
const parsed = parseSet(sample, 1);
if (parsed.questions.length !== 10 || parsed.questions[0].answers[0].points !== 20) throw new Error('Question parser validation failed.');
const answer = parseAnswer('1. নমুনা উত্তর (25)', 0);
if (answer.text !== 'নমুনা উত্তর' || answer.points !== 25) throw new Error('Answer parser validation failed.');
console.log('FFB 3.0 project structure and question parser checks passed.');
console.log('Reminder: run npm start once with internet access to download the 10 private question sets.');
