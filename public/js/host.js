const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'cloud' ? 'cloud' : 'local';
const $ = id => document.getElementById(id);
const localLoginPanel = $('localLoginPanel');
const cloudLoginPanel = $('cloudLoginPanel');
const dashboard = $('hostDashboard');
const cloudSetupPanel = $('cloudSetupPanel');
const localExportPanel = $('localExportPanel');
const questionList = $('questionList');
const setTabs = $('setTabs');
const statusText = $('hostGameStatus');
let sets = [];
let activeSetId = 'set1';
let currentState = { visible: false, answers: [] };
let activeRoomId = null;
let cloudUser = null;
let cloudApi = null;
let stopDisplayListener = null;

function setModeBanner() {
  $('modeBannerIcon').textContent = mode === 'cloud' ? '☁️' : '📶';
  $('modeBannerTitle').textContent = mode === 'cloud' ? 'Online Cloud Mode' : 'Local Wi-Fi Mode';
  $('modeBannerText').textContent = mode === 'cloud'
    ? 'Firebase Realtime Database দিয়ে যেকোনো network থেকে live synchronization'
    : 'Node.js + Socket.IO দিয়ে একই Wi-Fi network-এ live synchronization';
  $('hostModeBadge').textContent = mode === 'cloud' ? '☁ HOST · CLOUD' : '📶 HOST · LOCAL';
}
function showError(id, message) { $(id).textContent = message || 'কাজটি সম্পন্ন করা যায়নি।'; }
function clearError(id) { $(id).textContent = ''; }
function showDashboard(name) {
  localLoginPanel.hidden = true;
  cloudLoginPanel.hidden = true;
  dashboard.hidden = false;
  $('hostDisplayName').textContent = name || 'Host';
}
function parseBank(data) {
  const normalized = Array.isArray(data) ? data : data?.sets;
  if (!Array.isArray(normalized) || normalized.length !== 10) throw new Error('Question bank must contain exactly 10 sets.');
  normalized.forEach((set, index) => {
    if (!Array.isArray(set.questions) || set.questions.length !== 10) throw new Error(`Set ${index + 1} must contain 10 questions.`);
    set.questions.forEach((question, qIndex) => {
      if (!question.question || !Array.isArray(question.answers) || question.answers.length < 1) throw new Error(`Set ${index + 1}, Question ${qIndex + 1} is incomplete.`);
      question.answers = question.answers.map((answer, aIndex) => {
        if (typeof answer === 'string') {
          const clean = answer.replace(/^\s*\d+\s*[.।-]?\s*/, '').trim();
          const match = clean.match(/\s*[–—-]\s*(\d+)\s*পয়েন্ট\s*$/);
          return { id: `a${aIndex + 1}`, text: match ? clean.slice(0, match.index).trim() : clean, points: match ? Number(match[1]) : null };
        }
        return { id: answer.id || `a${aIndex + 1}`, text: String(answer.text || ''), points: answer.points !== null && answer.points !== undefined && Number.isFinite(Number(answer.points)) ? Number(answer.points) : null };
      });
      question.id = question.id || `q${qIndex + 1}`;
    });
    set.id = set.id || `set${index + 1}`;
    set.name = set.name || `Set ${index + 1}`;
  });
  return normalized;
}
function activeQuestion(setId, questionIndex) {
  const set = sets.find(item => item.id === setId);
  if (!set || !Number.isInteger(questionIndex) || questionIndex < 0) return null;
  const question = set.questions[questionIndex];
  return question ? { set, question } : null;
}
function isActive(setId, questionIndex) {
  return currentState.visible && currentState.setId === setId && Number(currentState.questionIndex) === questionIndex;
}
function isRevealed(answerIndex) {
  return currentState.visible && (currentState.answers || []).some(item => Number(item.index) === answerIndex);
}
function renderTabs() {
  setTabs.replaceChildren();
  sets.forEach(set => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `set-tab${set.id === activeSetId ? ' active' : ''}`;
    button.textContent = set.name;
    button.addEventListener('click', () => { activeSetId = set.id; renderTabs(); renderQuestions(); });
    setTabs.append(button);
  });
  $('setCountLabel').textContent = `${sets.length} sets · ${sets.reduce((n, s) => n + s.questions.length, 0)} questions`;
}
function renderQuestions() {
  questionList.replaceChildren();
  const set = sets.find(item => item.id === activeSetId);
  if (!set) return;
  set.questions.forEach((question, questionIndex) => {
    const card = document.createElement('article');
    card.className = `question-card${isActive(set.id, questionIndex) ? ' is-live' : ''}`;
    const header = document.createElement('div');
    header.className = 'question-card-header';
    const title = document.createElement('h3');
    title.textContent = question.question;
    const revealQuestion = document.createElement('button');
    revealQuestion.className = 'primary-button reveal-question-button';
    revealQuestion.type = 'button';
    revealQuestion.textContent = isActive(set.id, questionIndex) ? '✓ Published' : 'Reveal question';
    revealQuestion.disabled = isActive(set.id, questionIndex) || (mode === 'cloud' && !activeRoomId);
    revealQuestion.addEventListener('click', async () => {
      try { await publishQuestion(set.id, questionIndex); }
      catch (error) { window.alert(error.message || 'Question publish failed.'); }
    });
    header.append(title, revealQuestion);
    card.append(header);
    if (isActive(set.id, questionIndex)) {
      const note = document.createElement('p');
      note.className = 'published-note';
      note.textContent = 'এই প্রশ্নটি Participants-এর screen-এ দেখা যাচ্ছে';
      card.append(note);
    }
    const answers = document.createElement('div');
    answers.className = 'host-answers';
    question.answers.forEach((answer, answerIndex) => {
      const revealed = isActive(set.id, questionIndex) && isRevealed(answerIndex);
      const row = document.createElement('div');
      row.className = `host-answer-row${revealed ? ' is-revealed' : ''}`;
      const number = document.createElement('span');
      number.className = 'host-answer-number';
      number.textContent = String(answerIndex + 1).padStart(2, '0');
      const text = document.createElement('span');
      text.className = 'host-answer-text';
      text.textContent = answer.text;
      const points = document.createElement('strong');
      points.className = 'host-answer-points';
      points.textContent = answer.points !== null ? `${answer.points} pts` : '';
      const reveal = document.createElement('button');
      reveal.type = 'button';
      reveal.className = `answer-control${revealed ? ' revealed' : ''}`;
      const canReveal = isActive(set.id, questionIndex) && (mode === 'local' || activeRoomId);
      reveal.textContent = revealed ? 'Hide' : 'Reveal';
      reveal.disabled = !canReveal;
      reveal.addEventListener('click', async () => {
        try { await toggleAnswer(answerIndex); }
        catch (error) { window.alert(error.message || 'Answer update failed.'); }
      });
      row.append(number, text, points, reveal);
      answers.append(row);
    });
    card.append(answers);
    questionList.append(card);
  });
}
function applyState(state) {
  currentState = state || { visible: false, answers: [] };
  if (currentState.visible) {
    statusText.textContent = `${currentState.setName || ''} · Question ${currentState.questionNumber || ''} is live`;
    activeSetId = currentState.setId || activeSetId;
  } else statusText.textContent = currentState.closed ? 'Room closed' : 'কোনো প্রশ্ন প্রকাশ করা হয়নি';
  renderTabs();
  renderQuestions();
}
function publicDisplayFor(set, question, setId, questionIndex, revealedIndexes = []) {
  return {
    visible: true,
    setId,
    setName: set.name,
    questionNumber: questionIndex + 1,
    question: question.question,
    answerCount: question.answers.length,
    answers: revealedIndexes.map(index => ({ index, ...question.answers[index] })),
    updatedAt: Date.now()
  };
}
async function localPost(path, body = {}) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Local server request failed.');
  return result;
}
async function publishQuestion(setId, questionIndex) {
  const found = activeQuestion(setId, questionIndex);
  if (!found) throw new Error('Question not found.');
  if (mode === 'local') {
    const result = await localPost('/api/local/host/reveal-question', { setId, questionIndex });
    applyState(result.state);
    return;
  }
  if (!activeRoomId) throw new Error('Create an online room first.');
  const display = publicDisplayFor(found.set, found.question, setId, questionIndex, []);
  await cloudApi.writeRoomState(activeRoomId, { setId, questionIndex, revealedIndexes: [] }, display);
  applyState(display);
}
async function toggleAnswer(answerIndex) {
  if (mode === 'local') {
    const result = await localPost('/api/local/host/toggle-answer', { answerIndex });
    applyState(result.state);
    return;
  }
  if (!activeRoomId || !currentState.visible) throw new Error('Reveal a question first.');
  const found = activeQuestion(currentState.setId, Number(currentState.questionNumber) - 1);
  if (!found) throw new Error('Question not found.');
  const oldIndexes = (currentState.answers || []).map(item => Number(item.index));
  const indexes = oldIndexes.includes(answerIndex) ? oldIndexes.filter(i => i !== answerIndex) : [...oldIndexes, answerIndex].sort((a, b) => a - b);
  const display = publicDisplayFor(found.set, found.question, found.set.id, Number(currentState.questionNumber) - 1, indexes);
  await cloudApi.writeRoomState(activeRoomId, { setId: found.set.id, questionIndex: Number(currentState.questionNumber) - 1, revealedIndexes: indexes }, display);
  applyState(display);
}
async function hideQuestion() {
  if (mode === 'local') {
    const result = await localPost('/api/local/host/hide-question');
    applyState(result.state);
    return;
  }
  if (!activeRoomId) return;
  const blank = { visible: false, setId: null, setName: null, questionNumber: null, question: null, answerCount: 10, answers: [], updatedAt: Date.now() };
  await cloudApi.writeRoomState(activeRoomId, { setId: null, questionIndex: null, revealedIndexes: [] }, blank);
  applyState(blank);
}
function setLocalJoinInfo(data) {
  const urls = data.urls || [];
  $('participantUrl').textContent = urls[0] || data.local || `${location.origin}/participant?mode=local`;
  $('participantUrl').title = urls.join('\n');
}
async function initLocal() {
  localLoginPanel.hidden = false;
  $('localHostName').value = 'Prottoy Nishan';
  $('localLoginForm').addEventListener('submit', async event => {
    event.preventDefault(); clearError('localLoginError');
    try {
      await localPost('/api/local/login', { name: $('localHostName').value, password: $('localHostPassword').value });
      await loadLocalDashboard();
    } catch (error) { showError('localLoginError', error.message); }
  });
  const session = await fetch('/api/local/session').then(r => r.json()).catch(() => ({ isHost: false }));
  if (session.isHost) await loadLocalDashboard();
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
async function loadLocalDashboard() {
  const session = await fetch('/api/local/session').then(r => r.json());
  showDashboard(session.name || 'Host');
  localExportPanel.hidden = false;
  const bankResponse = await fetch('/api/local/host/sets');
  if (!bankResponse.ok) throw new Error('Could not load private question bank.');
  sets = parseBank(await bankResponse.json());
  applyState(await fetch('/api/local/state').then(r => r.json()));
  setLocalJoinInfo(await fetch('/api/local/join-info').then(r => r.json()));
  await loadSocketClient();
  const socket = window.io();
  socket.on('public:state', applyState);
}
async function initCloud() {
  const adapter = await import('./cloud-adapter.js');
  adapter.initializeFirebase();
  cloudApi = adapter;
  cloudLoginPanel.hidden = false;
  $('cloudLoginForm').addEventListener('submit', async event => {
    event.preventDefault(); clearError('cloudLoginError');
    try { await adapter.hostSignIn($('cloudHostEmail').value.trim(), $('cloudHostPassword').value); }
    catch (error) { showError('cloudLoginError', friendlyFirebaseError(error)); }
  });
  $('googleSignInButton').addEventListener('click', async () => {
    clearError('cloudLoginError');
    $('googleSignInButton').disabled = true;
    try { await adapter.hostSignInWithGoogle(); }
    catch (error) { showError('cloudLoginError', friendlyFirebaseError(error)); }
    finally { $('googleSignInButton').disabled = false; }
  });
  adapter.authState(async user => {
    if (!user || user.isAnonymous) {
      cloudUser = null; dashboard.hidden = true; cloudLoginPanel.hidden = false;
      return;
    }
    cloudUser = user;
    await loadCloudDashboard(user);
  });
}
function friendlyFirebaseError(error) {
  const map = {
    'auth/invalid-credential': 'Email বা password সঠিক নয়।',
    'auth/user-not-found': 'এই Host account পাওয়া যায়নি।',
    'auth/wrong-password': 'Password সঠিক নয়।',
    'auth/too-many-requests': 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
    'auth/network-request-failed': 'Internet connection পরীক্ষা করুন।',
    'auth/unauthorized-domain': 'Firebase Authentication-এর Authorized domains-এ এই website domain যোগ করুন।',
    'auth/popup-blocked': 'Browser popup block করেছে। এই website-এর জন্য popup অনুমতি দিন।',
    'auth/popup-closed-by-user': 'Google sign-in window বন্ধ করা হয়েছে। আবার চেষ্টা করুন।',
    'auth/operation-not-allowed': 'Firebase Console-এ Google sign-in provider enable করুন।',
    'auth/account-exists-with-different-credential': 'এই email অন্য sign-in পদ্ধতিতে যুক্ত আছে। Firebase Authentication-এর account settings পরীক্ষা করুন।'
  };
  return map[error.code] || error.message || 'Firebase request failed.';
}
async function loadCloudDashboard(user) {
  showDashboard(user.displayName || user.email || 'Host');
  $('hostUidLabel').textContent = user.uid;
  $('cloudSetupPanel').hidden = false;
  $('cloudRoomPanel').hidden = false;
  $('localExportPanel').hidden = true;
  const bank = await cloudApi.readQuestionBank(user.uid).catch(() => null);
  if (bank) {
    try { sets = parseBank(bank); cloudSetupPanel.hidden = true; renderTabs(); renderQuestions(); }
    catch (error) { showError('bankImportMessage', `Stored question bank: ${error.message}`); }
  } else {
    sets = []; questionList.replaceChildren(); setTabs.replaceChildren();
    $('setCountLabel').textContent = 'Question bank not imported';
  }
  $('createRoomButton').disabled = !sets.length;
  if (!sets.length) $('participantUrl').textContent = 'Import the private question bank, then create a room';
  const roomFromStorage = sessionStorage.getItem('ffbCloudRoom');
  if (roomFromStorage) {
    const meta = await cloudApi.getRoomMeta?.(roomFromStorage).catch(() => null);
    if (meta?.hostUid === user.uid && meta.status === 'active') await attachCloudRoom(roomFromStorage);
  }
}
async function attachCloudRoom(roomId) {
  activeRoomId = roomId;
  $('cloudRoomTitle').textContent = `Room ${roomId}`;
  $('cloudRoomStatus').textContent = 'Participants can now join using the invitation link.';
  $('createRoomButton').hidden = true;
  $('closeRoomButton').hidden = false;
  const participantLink = new URL('participant.html', location.href);
  participantLink.searchParams.set('mode', 'cloud');
  participantLink.searchParams.set('room', roomId);
  $('participantUrl').textContent = participantLink.toString();
  if (stopDisplayListener) stopDisplayListener();
  stopDisplayListener = cloudApi.watchRoomDisplay(roomId, state => applyState(state), error => showError('bankImportMessage', friendlyFirebaseError(error)));
}
$('createRoomButton').addEventListener('click', async () => {
  if (!cloudUser || !sets.length) return;
  $('createRoomButton').disabled = true;
  try {
    const roomId = cloudApi.generateRoomCode();
    await cloudApi.createRoom(roomId, cloudUser.uid);
    sessionStorage.setItem('ffbCloudRoom', roomId);
    await attachCloudRoom(roomId);
  } catch (error) { window.alert(friendlyFirebaseError(error)); }
  finally { $('createRoomButton').disabled = false; }
});
$('closeRoomButton').addEventListener('click', async () => {
  if (!activeRoomId || !window.confirm('এই Online Room বন্ধ করবেন?')) return;
  try {
    await cloudApi.closeRoom(activeRoomId);
    if (stopDisplayListener) stopDisplayListener();
    sessionStorage.removeItem('ffbCloudRoom');
    activeRoomId = null;
    $('cloudRoomTitle').textContent = 'No room created';
    $('cloudRoomStatus').textContent = 'Create a room when you are ready to host.';
    $('createRoomButton').hidden = false;
    $('closeRoomButton').hidden = true;
    $('participantUrl').textContent = 'Create a room to generate a participant link';
    await hideQuestion();
  } catch (error) { window.alert(friendlyFirebaseError(error)); }
});
$('importBankButton').addEventListener('click', async () => {
  clearError('bankImportMessage');
  const file = $('bankFileInput').files?.[0];
  if (!file) return showError('bankImportMessage', 'প্রথমে question bank JSON file নির্বাচন করুন।');
  try {
    const parsed = JSON.parse(await file.text());
    const validated = parseBank(parsed);
    await cloudApi.writeQuestionBank(cloudUser.uid, validated);
    sets = validated;
    cloudSetupPanel.hidden = true;
    $('createRoomButton').disabled = false;
    renderTabs(); renderQuestions();
    window.alert('Question bank successfully imported. You can now create an Online Room.');
  } catch (error) { showError('bankImportMessage', friendlyFirebaseError(error)); }
});
$('hideQuestionButton').addEventListener('click', async () => {
  if (!window.confirm('Participant screen থেকে প্রশ্ন ও প্রকাশিত উত্তর লুকাবেন?')) return;
  try { await hideQuestion(); }
  catch (error) { window.alert(error.message || 'Board reset failed.'); }
});
$('copyJoinUrl').addEventListener('click', async () => {
  const value = $('participantUrl').textContent;
  if (!value || value.startsWith('Preparing') || value.startsWith('Create')) return;
  try { await navigator.clipboard.writeText(value); $('copyJoinUrl').textContent = 'Copied!'; setTimeout(() => $('copyJoinUrl').textContent = 'Copy link', 1500); }
  catch { window.prompt('Copy participant link:', value); }
});
$('logoutButton').addEventListener('click', async () => {
  try {
    if (mode === 'local') await localPost('/api/local/logout');
    else if (cloudApi) await cloudApi.signOutUser();
    window.location.href = 'index.html';
  } catch (error) { window.alert(error.message); }
});

setModeBanner();
if (mode === 'local') initLocal().catch(error => { localLoginPanel.hidden = false; showError('localLoginError', error.message); });
else initCloud().catch(error => { cloudLoginPanel.hidden = false; showError('cloudLoginError', error.message); });
