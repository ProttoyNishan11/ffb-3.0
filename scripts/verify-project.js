const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { parseSet, parseAnswer } = require('./ensure-question-bank');
const root = path.join(__dirname, '..');

const required = [
  'server.js', 'package.json', '.env.example', '.gitignore', '.github/workflows/deploy-pages.yml', 'firebase.json',
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

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rules = JSON.parse(read('firebase/database.rules.json'));
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
if (!roomRules?.meta || !roomRules?.hostState || !roomRules?.publicDisplay || !roomRules?.participants ||
    typeof roomRules.publicDisplay['.read'] !== 'string' ||
    !roomRules.publicDisplay['.read'].includes('participants') ||
    !roomRules.publicDisplay['.read'].includes('.exists()') ||
    typeof roomRules.publicDisplay['.write'] !== 'string' ||
    !roomRules.publicDisplay['.write'].includes('auth != null')) {
  throw new Error('Participant display reads must be gated by anonymous room membership; writes must require authentication.');
}

const participantRules = roomRules.participants.$participantUid;
if (!participantRules ||
    !participantRules['.write'].includes('auth.uid === $participantUid') ||
    !participantRules['.write'].includes("sign_in_provider === 'anonymous'") ||
    !participantRules['.write'].includes("status').val() === 'active'")) {
  throw new Error('Only an authenticated anonymous participant may register in an active room under their own UID.');
}

if (fs.existsSync(path.join(root, 'public/data/sets.json'))) {
  throw new Error('Full answer bank must not be stored in the public folder.');
}

const config = read('public/js/firebase-config.js');
const adapter = read('public/js/cloud-adapter.js');
if (!config.includes('FFB_FIREBASE_CONFIG') ||
    !adapter.includes('window.FFB_FIREBASE_CONFIG') ||
    !adapter.includes('window.firebaseConfig') ||
    !adapter.includes('export async function joinRoom')) {
  throw new Error('Firebase config globals or participant room registration are missing.');
}

// Parse browser scripts so malformed edits fail before deployment.
for (const file of ['public/js/firebase-config.js', 'public/home.js', 'public/js/participant.js', 'public/js/host.js']) {
  try {
    new vm.Script(read(file), { filename: file });
  } catch (error) {
    throw new Error(`JavaScript syntax error in ${file}: ${error.message}`);
  }
}
const moduleCheck = spawnSync(process.execPath, ['--check', '--input-type=module'], {
  input: adapter, encoding: 'utf8'
});
if (moduleCheck.status !== 0) {
  throw new Error(`JavaScript syntax error in public/js/cloud-adapter.js: ${moduleCheck.stderr || moduleCheck.stdout}`);
}

const homeScript = read('public/home.js');
if (!homeScript.includes('host.html?mode=cloud') ||
    !homeScript.includes('participant.html') ||
    !homeScript.includes('isStaticHosting') ||
    !homeScript.includes('if (isStaticHosting)')) {
  throw new Error('Static hosting must disable Local mode and use project-relative HTML routes.');
}

const participantScript = read('public/js/participant.js');
if (!participantScript.includes("new URL('participant.html', window.location.href)") ||
    !participantScript.includes('adapter.joinRoom(roomId)') ||
    !participantScript.includes('auth.authStateReady()')) {
  throw new Error('Cloud participants must use a project-relative join URL and register after restoring anonymous auth.');
}

const hostPage = read('public/host.html');
const hostScript = read('public/js/host.js');
if (!hostPage.includes('id="googleSignInButton"') ||
    !hostScript.includes('hostSignInWithGoogle')) {
  throw new Error('Google Host sign-in button is not wired to Firebase Authentication.');
}

const sample = Array.from(
  { length: 10 },
  (_, i) => `<div class="question-card"><h2>প্রশ্ন ${i + 1}: নমুনা প্রশ্ন?</h2><ol><li><span>1. নমুনা উত্তর – 20 পয়েন্ট</span></li></ol></div>`
).join('\\n');
const parsed = parseSet(sample, 1);
if (parsed.questions.length !== 10 || parsed.questions[0].answers[0].points !== 20) {
  throw new Error('Question parser validation failed.');
}

const answer = parseAnswer('1. নমুনা উত্তর (25)', 0);
if (answer.text !== 'নমুনা উত্তর' || answer.points !== 25) {
  throw new Error('Answer parser validation failed.');
}

const pagesWorkflow = read('.github/workflows/deploy-pages.yml');
if (!pagesWorkflow.includes('path: public') || !pagesWorkflow.includes('actions/deploy-pages@v4')) {
  throw new Error('GitHub Pages workflow must publish the public directory.');
}

console.log('FFB 3.0 structure, Firebase membership rules, browser syntax, auth wiring, Pages routing and question parser checks passed.');
console.log('Reminder: run npm start once with internet access to download the 10 private question sets.');
