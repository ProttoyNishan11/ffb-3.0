const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'cloud' ? 'cloud' : 'local';
const roomIdFromUrl = (params.get('room') || '').toUpperCase();
const $ = id => document.getElementById(id);
const waitingPanel = $('waitingPanel');
const liveBoard = $('liveBoard');
const joinPanel = $('participantJoinPanel');
const connection = $('connectionStatus');

function setConnection(label, connected) {
  connection.textContent = label;
  connection.classList.toggle('connected', Boolean(connected));
}
function parseAnswer(answer) {
  if (typeof answer === 'string') {
    const clean = answer.replace(/^\s*\d+\s*[.।-]?\s*/, '').trim();
    const match = clean.match(/\s*[–—-]\s*(\d+)\s*পয়েন্ট\s*$/);
    return match ? { text: clean.slice(0, match.index).trim(), points: Number(match[1]) } : { text: clean, points: null };
  }
  return { text: String(answer?.text || ''), points: answer?.points ?? null };
}
function render(state) {
  if (!state || !state.visible) {
    waitingPanel.hidden = false;
    liveBoard.hidden = true;
    if (state?.closed) {
      waitingPanel.querySelector('h1').textContent = 'এই Game Room বন্ধ করা হয়েছে';
      waitingPanel.querySelector('p:not(.eyebrow)').textContent = 'নতুন Room link-এর জন্য Host-এর সাথে যোগাযোগ করুন।';
    }
    return;
  }
  waitingPanel.hidden = true;
  liveBoard.hidden = false;
  $('setLabel').textContent = state.setName || '';
  $('questionNumber').textContent = `QUESTION ${state.questionNumber || ''}`;
  $('liveQuestion').textContent = state.question || '';
  const shown = new Map((state.answers || []).map(item => [Number(item.index), item]));
  const slots = Math.min(Math.max(Number(state.answerCount || 10), 1), 12);
  $('answerBoard').replaceChildren();
  for (let index = 0; index < slots; index++) {
    const row = document.createElement('div');
    row.className = `answer-slot${shown.has(index) ? ' revealed' : ''}`;
    const number = document.createElement('span');
    number.className = 'answer-slot-number';
    number.textContent = String(index + 1).padStart(2, '0');
    row.append(number);
    if (shown.has(index)) {
      const parsed = parseAnswer(shown.get(index));
      const text = document.createElement('span');
      text.className = 'answer-slot-text';
      text.textContent = parsed.text;
      row.append(text);
      const points = document.createElement('strong');
      points.className = 'answer-slot-points';
      points.textContent = parsed.points !== null ? `${parsed.points} pts` : '';
      row.append(points);
    } else {
      const blank = document.createElement('span');
      blank.className = 'answer-slot-blank';
      blank.textContent = '••••••••••••';
      row.append(blank);
    }
    $('answerBoard').append(row);
  }
  $('boardHint').textContent = shown.size ? `${shown.size}টি উত্তর Host প্রকাশ করেছেন` : 'উত্তর প্রকাশের জন্য Host-এর অপেক্ষা করুন';
}

async function loadSocketClient() {
  if (window.io) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Local Socket.IO client could not load. Open this page from the FFB local server.'));
    document.head.append(script);
  });
}

async function initLocal() {
  joinPanel.hidden = true;
  setConnection('Connecting to Local Host…', false);
  await loadSocketClient();
  const socket = window.io();
  socket.on('connect', () => setConnection('Local · Connected', true));
  socket.on('disconnect', () => setConnection('Local · Reconnecting…', false));
  socket.on('public:state', render);
  const response = await fetch('/api/local/state');
  if (response.ok) render(await response.json());
}

async function joinCloud(roomId) {
  joinPanel.hidden = true;
  waitingPanel.hidden = false;
  setConnection('Connecting to Cloud…', false);
  const adapter = await import('./cloud-adapter.js');
  adapter.initializeFirebase();
  const auth = adapter.getAuthInstance();
  if (!auth.currentUser || !auth.currentUser.isAnonymous) {
  await adapter.participantSignIn();
}

const meta = await adapter.joinRoom(roomId);
  if (!meta) throw new Error('এই Room Code পাওয়া যায়নি।');
  if (meta.status !== 'active') throw new Error('Host এই Room বন্ধ করে দিয়েছেন।');
  adapter.watchRoomMeta(roomId, value => {
    if (!value || value.status !== 'active') {
      setConnection('Room closed', false);
      render({ visible: false, closed: true });
    }
  }, error => setConnection(error.message, false));
  adapter.watchRoomDisplay(roomId, state => {
    setConnection('Cloud · Connected', true);
    render(state);
  }, error => {
    setConnection('Cloud · Connection error', false);
    $('boardHint').textContent = error.message;
  });
}

function showJoinPanel() {
  joinPanel.hidden = false;
  waitingPanel.hidden = true;
  liveBoard.hidden = true;
  setConnection('Waiting for Room Code', false);
}
$('participantJoinButton').addEventListener('click', () => {
  const code = $('participantJoinInput').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (code.length < 6) { $('participantJoinError').textContent = 'সঠিক Room Code লিখুন।'; return; }
  const target = new URL(
  "participant.html",
  window.location.href
);

target.searchParams.set("mode", "cloud");
target.searchParams.set("room", code);

window.location.href = target.toString();
$('participantJoinInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('participantJoinButton').click();
});

if (mode === 'local') {
  initLocal().catch(error => setConnection(error.message || 'Local server not reachable', false));
} else if (roomIdFromUrl) {
  joinCloud(roomIdFromUrl).catch(error => {
    setConnection('Cloud · Could not connect', false);
    render({ visible: false });
    $('boardHint').textContent = error.message || 'Could not join this room.';
    $('waitingPanel').querySelector('h1').textContent = 'Room-এ যোগ দেওয়া যায়নি';
    $('waitingPanel').querySelector('p:not(.eyebrow)').textContent = error.message || 'Firebase setup এবং Room Code পরীক্ষা করুন।';
  });
} else showJoinPanel();
