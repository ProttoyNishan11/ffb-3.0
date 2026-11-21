const fs = require('node:fs');
const path = require('node:path');
const { parseSet, parseAnswer } = require('./ensure-question-bank');
const root = path.join(__dirname, '..');

const required = [
  'server.js', 'package.json', '.env.example', '.gitignore', 'firebase.json',
  'firebase/database.rules.json',
  'public/index.html', 'public/styles.css', 'public/home.js',
  'public/host.html', 'public/participant.html',
  'public/js/host.js', 'public/js/participant.js',
  'public/js/cloud-adapter.js', 'public/js/firebase-config.js'
];

for (const item of required) {
  if (!fs.existsSync(path.join(root, item))) {
    throw new Error(`Missing required file: ${item}`);
  }
}

const rules = JSON.parse(fs.readFileSync(path.join(root, 'firebase/database.rules.json'), 'utf8'));
const rootRules = rules.rules;
if (rootRules['.read'] !== false || rootRules['.write'] !== false) {
  throw new Error('Firebase root must deny public read/write access.');
}

const bankRules = rootRules.questionBank?.$hostUid;
if (!bankRules || typeof bankRules['.read'] !== 'string' ||
    typeof bankRules['.write'] !== 'string' ||
    !bankRules['.read'].includes('auth != null') ||
    !bankRules['.write'].includes('auth != null') ||
    !bankRules['.read'].includes('auth.uid === $hostUid') ||
    !bankRules['.write'].includes('auth.uid === $hostUid')) {
  throw new Error('Question bank rules must restrict access to the authenticated Host UID.');
}

const roomRules = rootRules.rooms?.$roomId;
if (!roomRules?.meta || !roomRules?.publicDisplay ||
    typeof roomRules.publicDisplay['.read'] !== 'string' ||
    !roomRules.publicDisplay['.read'].includes('auth != null') ||
    typeof roomRules.publicDisplay['.write'] !== 'string' ||
    !roomRules.publicDisplay['.write'].includes('auth != null')) {
  throw new Error('Room display rules must require authentication.');
}

if (fs.existsSync(path.join(root, 'public/data/sets.json'))) {
  throw new Error('Full answer bank must not be stored in the public folder.');
}

const config = fs.readFileSync(path.join(root, 'public/js/firebase-config.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'public/js/cloud-adapter.js'), 'utf8');
if (!config.includes('FFB_FIREBASE_CONFIG') ||
    !adapter.includes('window.FFB_FIREBASE_CONFIG') ||
    !adapter.includes('window.firebaseConfig')) {
  throw new Error('Firebase config global does not match the Cloud adapter.');
}

const hostPage = fs.readFileSync(path.join(root, 'public/host.html'), 'utf8');
const hostScript = fs.readFileSync(path.join(root, 'public/js/host.js'), 'utf8');
if (!hostPage.includes('id="googleSignInButton"') ||
    !hostScript.includes('hostSignInWithGoogle')) {
  throw new Error('Google Host sign-in button is not wired to Firebase Authentication.');
}

const sample = Array.from(
  { length: 10 },
  (_, i) => `<div class="question-card"><h2>প্রশ্ন ${i + 1}: নমুনা প্রশ্ন?</h2><ol><li><span>1. নমুনা উত্তর – 20 পয়েন্ট</span></li></ol></div>`
).join('\n');
const parsed = parseSet(sample, 1);
if (parsed.questions.length !== 10 || parsed.questions[0].answers[0].points !== 20) {
  throw new Error('Question parser validation failed.');
}

const answer = parseAnswer('1. নমুনা উত্তর (25)', 0);
if (answer.text !== 'নমুনা উত্তর' || answer.points !== 25) {
  throw new Error('Answer parser validation failed.');
}

console.log('FFB 3.0 project structure, Firebase rules, auth wiring and question parser checks passed.');
console.log('Reminder: run npm start once with internet access to download the 10 private question sets.');
