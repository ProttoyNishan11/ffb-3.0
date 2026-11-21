const modal = document.getElementById('modeModal');
const roomField = document.getElementById('participantRoomField');
let currentRole = 'host';

const isStaticHosting =
  location.hostname.endsWith('.github.io') ||
  location.hostname.endsWith('.web.app') ||
  location.hostname.endsWith('.firebaseapp.com');

const localModeButton = document.getElementById('chooseLocal');
if (isStaticHosting && localModeButton) {
  localModeButton.disabled = true;
  localModeButton.title = 'Local Wi-Fi mode requires the Node.js server.';
  const note = localModeButton.querySelector('small');
  if (note) note.textContent = 'Requires Node.js server';
}

function openModes(role) {
  currentRole = role;
  modal.hidden = false;
  roomField.hidden = role !== 'participant';
  document.getElementById('modeTitle').textContent = role === 'host' ? 'Admin / Host' : 'Participants';
  document.getElementById('modeDescription').textContent = role === 'host'
    ? 'আপনার গেমের সংযোগ পদ্ধতি নির্বাচন করুন।'
    : 'Host যে পদ্ধতিতে Room তৈরি করেছেন, সেটি নির্বাচন করুন।';
  document.getElementById('modeIcon').textContent = role === 'host' ? '🎙️' : '👥';
  document.getElementById('modeFootnote').textContent = role === 'host'
    ? 'Cloud mode-এর জন্য Firebase configuration এবং Host account প্রয়োজন।'
    : 'Participants-এর আলাদা account প্রয়োজন নেই। Cloud mode-এ নিরাপদ anonymous sign-in ব্যবহৃত হয়।';
  if (role === 'participant') document.getElementById('participantRoomCode').focus();
}

document.getElementById('openHostModes').addEventListener('click', () => openModes('host'));
document.getElementById('openParticipantModes').addEventListener('click', () => openModes('participant'));
document.getElementById('closeModes').addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', event => { if (event.target === modal) modal.hidden = true; });
document.addEventListener('keydown', event => { if (event.key === 'Escape') modal.hidden = true; });

document.getElementById('chooseLocal').addEventListener('click', () => {
  if (isStaticHosting) return;
  window.location.href = currentRole === 'host' ? 'host.html?mode=local' : 'participant.html?mode=local';
});

document.getElementById('chooseCloud').addEventListener('click', () => {
  if (currentRole === 'host') {
    window.location.href = 'host.html?mode=cloud';
    return;
  }
  roomField.hidden = false;
  document.getElementById('participantRoomCode').focus();
});

document.getElementById('joinCloudRoom').addEventListener('click', () => {
  const code = document.getElementById('participantRoomCode').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (code.length < 6) {
    document.getElementById('roomCodeError').textContent = 'সঠিক Room Code লিখুন।';
    return;
  }
  const target = new URL('participant.html', window.location.href);
  target.searchParams.set('mode', 'cloud');
  target.searchParams.set('room', code);
  window.location.href = target.toString();
});

document.getElementById('participantRoomCode').addEventListener('keydown', event => {
  if (event.key === 'Enter') document.getElementById('joinCloudRoom').click();
});
