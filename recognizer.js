// recognizer.js — Speech recognition with optional alphabet prioritization

let recognition;
if ('webkitSpeechRecognition' in window)
  recognition = new webkitSpeechRecognition();
else if ('SpeechRecognition' in window)
  recognition = new SpeechRecognition();
else {
  alert("Speech Recognition not supported in this browser.");
  recognition = null;
}

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 5;
}

/* ---------- Extended Alphabet Map ---------- */
const phoneticMap = {
  // NATO + common variants
  'alpha': 'A', 'alfa': 'A', 'a': 'A', 'ay': 'A', 'eight': 'A', 'hey': 'A',
  'bravo': 'B', 'b': 'B', 'bee': 'B', 'be': 'B',
  'charlie': 'C', 'c': 'C', 'see': 'C', 'sea': 'C',
  'delta': 'D', 'd': 'D', 'dee': 'D',
  'echo': 'E', 'e': 'E', 'ee': 'E',
  'foxtrot': 'F', 'f': 'F', 'ef': 'F',
  'golf': 'G', 'g': 'G', 'gee': 'G',
  'hotel': 'H', 'h': 'H', 'aitch': 'H',
  'india': 'I', 'i': 'I', 'eye': 'I',
  'juliet': 'J', 'juliett': 'J', 'j': 'J', 'jay': 'J',
  'kilo': 'K', 'k': 'K', 'kay': 'K',
  'lima': 'L', 'l': 'L', 'el': 'L',
  'mike': 'M', 'm': 'M', 'em': 'M',
  'november': 'N', 'n': 'N', 'en': 'N',
  'oscar': 'O', 'o': 'O', 'oh': 'O', 'zero': 'O',
  'papa': 'P', 'p': 'P', 'pee': 'P',
  'quebec': 'Q', 'q': 'Q', 'cue': 'Q', 'queue': 'Q',
  'romeo': 'R', 'r': 'R', 'are': 'R',
  'sierra': 'S', 's': 'S', 'ess': 'S',
  'tango': 'T', 't': 'T', 'tee': 'T',
  'uniform': 'U', 'u': 'U', 'you': 'U',
  'victor': 'V', 'v': 'V', 'vee': 'V',
  'whiskey': 'W', 'w': 'W', 'doubleyou': 'W', 'double you': 'W',
  'x-ray': 'X', 'x': 'X', 'ex': 'X',
  'yankee': 'Y', 'y': 'Y', 'why': 'Y',
  'zulu': 'Z', 'z': 'Z', 'zee': 'Z', 'zed': 'Z'
};

/* ---------- Utility: interpret raw text as letters ---------- */
function interpretLetters(rawText) {
  if (!rawText) return '';
  rawText = rawText.toLowerCase().replace(/[^a-z\s-]+/g, ' ').trim();

  const tokens = rawText.split(/\s+/).filter(Boolean);
  const letters = [];

  for (let tok of tokens) {
    if (phoneticMap[tok]) letters.push(phoneticMap[tok]);
    else if (/^[a-z]$/.test(tok)) letters.push(tok.toUpperCase());
    else if (tok.length > 1) letters.push(tok[0].toUpperCase());
  }

  return letters.join('');
}

/* ---------- Pick best alternative ---------- */
function pickBestAlternative(result, prioritizeAlphabet) {
  let best = '';
  let bestConf = -1;
  let bestRaw = '';

  for (let alt of result) {
    const raw = alt.transcript.trim();
    const conf = alt.confidence || 0;
    const mapped = prioritizeAlphabet ? interpretLetters(raw) : raw;

    // scoring: mapped length + confidence
    const score = (mapped.length * 1000) + Math.round(conf * 100);
    const bestScore = (best.length * 1000) + Math.round(bestConf * 100);

    if (score > bestScore) {
      best = mapped;
      bestRaw = raw;
      bestConf = conf;
    }
  }

  return { text: best, raw: bestRaw, conf: bestConf };
}

let finalText = '';
/* ---------- Main function ---------- */
export function recognize(dialog, mic, opts = {}) {
  if (!recognition) return;
  const { prioritizeAlphabet = false, showDebug = false } = opts;

  
  dialog.innerHTML = "🎙️ Listening...";
  mic.classList.add('recording');

  recognition.onresult = (event) => {
    let interim = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      const { text, raw, conf } = pickBestAlternative(res, prioritizeAlphabet);

      if (res.isFinal) finalText += text + ' ';
      else interim += text;

      if (showDebug)
        console.debug(`[${res.isFinal ? 'FINAL' : 'INTERIM'}]`, raw, '→', text, `(conf ${(
          conf * 100
        ).toFixed(1)}%)`);
    }

    dialog.innerHTML = `
      <span style="font-weight:600;color:#222;">${finalText}</span>
      <span style="color:#888;">${interim}</span>
    `;
  };
  recognition.onerror = (e) => {
    console.error(e);
    dialog.innerHTML = "⚠️ " + e.error;
    mic.classList.remove('recording');
  };

  recognition.onend = () => {
    mic.classList.remove('recording');
    if (!finalText.trim()) dialog.innerHTML = "No speech detected 🐝";
    else dialog.innerHTML = `<span style="color:#1b5e20;font-weight:600;">✅ ${finalText}</span>`;
  };

  recognition.start();
}

/* ---------- Stop Recognition ---------- */
export function stopRecognize() {
  if (recognition) recognition.stop();
}


// === Return the latest recognized text (trimmed & limited to last 200 chars)
export function getFinalText() {
  finalText = finalText.trim();

  // If it's longer than 200 chars, cut from the front
  // if (finalText.length > 200) {
  //   finalText = finalText.slice(finalText.length - 200);
  // }

  return finalText;
}
// === Substring matcher (case-insensitive)
export function textIncludes(substring) {
  const text = getFinalText().toLowerCase();
  return text.includes(substring.toLowerCase());
}

export function textClear()
{
    finalText = '';
}

