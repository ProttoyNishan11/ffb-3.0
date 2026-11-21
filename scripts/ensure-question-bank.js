try { require('dotenv').config(); } catch { /* dotenv is installed by npm install before app startup */ }
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const BANK_DIR = path.join(ROOT, '.local');
const BANK_FILE = path.join(BANK_DIR, 'question-bank.json');
const REPO = process.env.QUESTION_SOURCE_REPO || 'ProttoyNishan11/ffb';
const BRANCH = process.env.QUESTION_SOURCE_BRANCH || 'main';

function decodeHtml(value) {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAnswer(raw, fallbackIndex) {
  let text = decodeHtml(raw).replace(/^\s*\d+\s*[.।\-]?\s*/, '').trim();
  let points = null;
  let match = text.match(/\s*[–—-]\s*(\d+)\s*পয়েন্ট\s*$/);
  if (match) {
    points = Number(match[1]);
    text = text.slice(0, match.index).trim();
  } else {
    match = text.match(/\s*\((\d+)\)\s*$/);
    if (match) {
      points = Number(match[1]);
      text = text.slice(0, match.index).trim();
    }
  }
  return { id: `a${fallbackIndex + 1}`, text, points };
}

function parseSet(html, setNumber) {
  const cards = [...html.matchAll(/<div\s+class=["']question-card["'][^>]*>([\s\S]*?)<\/div>/gi)];
  const questions = cards.map((card, index) => {
    const block = card[1];
    const heading = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const question = heading ? decodeHtml(heading[1]) : '';
    const rawAnswers = [...block.matchAll(/<li[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/gi)].map(item => item[1]);
    const answers = rawAnswers.map((answer, answerIndex) => parseAnswer(answer, answerIndex));
    return { id: `q${index + 1}`, question, answers };
  }).filter(q => q.question && q.answers.length);
  if (questions.length !== 10) {
    throw new Error(`Set ${setNumber}: expected 10 questions, found ${questions.length}. The source HTML may have changed.`);
  }
  for (const [index, question] of questions.entries()) {
    if (question.answers.length < 1 || question.answers.length > 12) {
      throw new Error(`Set ${setNumber}, Question ${index + 1}: unexpected answer count ${question.answers.length}.`);
    }
  }
  return { id: `set${setNumber}`, name: `Set ${setNumber}`, questions };
}

async function main() {
  if (fs.existsSync(BANK_FILE)) {
    const current = JSON.parse(fs.readFileSync(BANK_FILE, 'utf8'));
    if (Array.isArray(current.sets) && current.sets.length === 10) {
      console.log(`Question bank found: ${current.sets.length} sets.`);
      return;
    }
  }
  fs.mkdirSync(BANK_DIR, { recursive: true });
  console.log(`Downloading the 10 original question sets from ${REPO} (${BRANCH})...`);
  const sets = [];
  for (let number = 1; number <= 10; number++) {
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/set${number}.html`;
    const response = await fetch(url, { headers: { 'User-Agent': 'FFB-QuestionBank-Setup/3.0' } });
    if (!response.ok) throw new Error(`Could not download set${number}.html (${response.status}). Check your internet connection and repository visibility.`);
    sets.push(parseSet(await response.text(), number));
  }

  // Correct two known source-data defects identified during the repository review.
  // Set 5 / Question 6 had a copied answer used as its heading.
  sets[4].questions[5].question = 'প্রশ্ন ৬: মানুষ মোবাইল ফোনে কী কী কাজ করে?';
  // Set 9 / Question 5 repeated its first answer; remove the duplicate copy only.
  const s9q5 = sets[8].questions[4];
  if (s9q5.answers.length === 11 && s9q5.answers[0].text === s9q5.answers[1].text && s9q5.answers[0].points === s9q5.answers[1].points) {
    s9q5.answers.splice(1, 1);
    s9q5.answers = s9q5.answers.map((answer, i) => ({ ...answer, id: `a${i + 1}` }));
  }

  // Optional: fetch the project's existing Bangla font into the public assets folder.
  const fontPath = path.join(ROOT, 'public', 'assets', 'Kalpurush.ttf');
  if (!fs.existsSync(fontPath)) {
    try {
      const fontResponse = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/Kalpurush.ttf`);
      if (fontResponse.ok) {
        fs.mkdirSync(path.dirname(fontPath), { recursive: true });
        fs.writeFileSync(fontPath, Buffer.from(await fontResponse.arrayBuffer()));
        console.log('Kalpurush font downloaded.');
      }
    } catch { console.log('Kalpurush font could not be downloaded; browser fallback fonts will be used.'); }
  }

  const bank = {
    schemaVersion: 1,
    source: `https://github.com/${REPO}/tree/${BRANCH}`,
    generatedAt: new Date().toISOString(),
    sets
  };
  fs.writeFileSync(BANK_FILE, JSON.stringify(bank, null, 2), 'utf8');
  const qCount = sets.reduce((sum, set) => sum + set.questions.length, 0);
  const aCount = sets.reduce((sum, set) => sum + set.questions.reduce((n, q) => n + q.answers.length, 0), 0);
  console.log(`Question bank ready: ${sets.length} sets, ${qCount} questions, ${aCount} answers.`);
  console.log(`Private local copy saved to .local/question-bank.json (excluded from Git by .gitignore).`);
}

if (require.main === module) main().catch(error => {
  console.error('\nQuestion bank setup failed:', error.message);
  console.error('Connect this computer to the internet and run npm start again.');
  process.exit(1);
});

module.exports = { decodeHtml, parseAnswer, parseSet };
