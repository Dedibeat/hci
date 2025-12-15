// === recognizer.js ===
// Improved letter recognition: consensus + extra phonetic variants
// Keeps the stable restart/no-speech handling from previous version.

let recognition = null;
let isRecognizing = false;
let shouldBeRecognizing = false;
let dialogEl = null;
let micEl = null;
let currentOptions = { prioritizeAlphabet: false, showDebug: false };
let finalText = "";

// Browser detection
if ("webkitSpeechRecognition" in window) recognition = new webkitSpeechRecognition();
else if ("SpeechRecognition" in window) recognition = new SpeechRecognition();
else alert("Speech Recognition not supported in this browser.");

if (recognition) {
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  recognition.maxAlternatives = 5;
}

// safe restart helper
function restartRecognitionSafely() {
  try { recognition.stop(); } catch (_) {}
  setTimeout(() => {
    try { recognition.start(); } catch (e) { console.warn("restart failed:", e); }
  }, 400);
}

/* ==========================
   PHONETIC MAP (trimmed)
   Add your full map here; below includes common extras
   ========================== */
const phoneticMap = {
  alpha: "A", alfa: "A", a: "A", ay: "A", "eight": "A", "hey": "A",
  bravo: "B", b: "B", bee: "B", be: "B",
  charlie: "C", c: "C", see: "C", sea: "C",
  delta: "D", d: "D", dee: "D",
  echo: "E", e: "E", ee: "E",
  foxtrot: "F", f: "F", ef: "F",
  golf: "G", g: "G", gee: "G", jee: "G", ghee: "G",
  hotel: "H", h: "H", aitch: "H",
  india: "I", i: "I", eye: "I",
  juliet: "J", j: "J", jay: "J",
  kilo: "K", k: "K", kay: "K",
  lima: "L", l: "L", el: "L",
  mike: "M", m: "M", em: "M",
  november: "N", n: "N", en: "N",
  oscar: "O", o: "O", oh: "O", zero: "O",
  papa: "P", p: "P", pee: "P",
  quebec: "Q", q: "Q", cue: "Q", queue: "Q",
  romeo: "R", r: "R", are: "R",
  sierra: "S", s: "S", ess: "S",
  tango: "T", t: "T", tee: "T",
  uniform: "U", u: "U", you: "U",
  victor: "V", v: "V", vee: "V",
  whiskey: "W", w: "W", doubleyou: "W", "double you": "W",
  "x-ray": "X", x: "X", ex: "X",
  yankee: "Y", y: "Y", why: "Y",
  zulu: "Z", z: "Z", zee: "Z", zed: "Z"
};

// ==========================
// helpers
// ==========================
function filterAlphabetOnly(str) {
  if (!str) return "";
  return str.replace(/[^A-Za-z]/g, "").toUpperCase();
}

function interpretLetters(rawText) {
  if (!rawText) return "";
  rawText = rawText
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .trim();

  const tokens = rawText.split(/\s+/).filter(Boolean);
  const letters = [];

  for (let tok of tokens) {
    // direct phonetic map
    if (phoneticMap[tok]) {
      letters.push(phoneticMap[tok]);
      continue;
    }

    // single-letter spelled as 'a' or 'b'
    if (/^[a-z]$/.test(tok)) {
      letters.push(tok.toUpperCase());
      continue;
    }

    // sometimes ASR returns 'bee tee' or 'b t' or joined forms
    // try first-letter fallback for tokens that are 1-3 chars (like 'apple' -> 'a' risky)
    // but prefer NOT to convert plain words to letters by default.
    // We'll use a more conservative fallback later in pickBestAlternative.
  }

  return letters.join("");
}

/* New: attempt to extract letters from a noisy transcript.
   Strategies:
   - interpretLetters (phonetic / single token)
   - if result empty: try initials of tokens when tokens count equals expected length or tokens are short
   - if still empty: for single-token transcripts try to map common 1-char homophones */
function extractLettersFallback(rawText) {
  if (!rawText) return "";

  // 1) try interpretLetters first
  let out = interpretLetters(rawText);
  if (out) return out;

  // 2) tokens initials heuristic: if transcript looks like "g p t" or "g p t " etc.
  const clean = rawText.toLowerCase().replace(/[^a-z\s]/g, " ").trim();
  const toks = clean.split(/\s+/).filter(Boolean);
  // only use initials if tokens are short (<=3) to avoid words -> letters conversions
  if (toks.length > 0 && toks.every(t => t.length <= 3)) {
    const initials = toks.map(t => {
      if (phoneticMap[t]) return phoneticMap[t];
      if (/^[a-z]$/.test(t)) return t.toUpperCase();
      return t[0] ? t[0].toUpperCase() : "";
    }).join("");
    if (initials) return initials;
  }

  // 3) single token fuzzy checks for common spelled forms e.g. "jee" -> G, "dee" -> D
  const single = clean.split(/\s+/)[0] || "";
  if (phoneticMap[single]) return phoneticMap[single];

  // 4) final fallback: return only letters from raw
  return filterAlphabetOnly(rawText);
}

/* ==========================
   Consensus-based pickBestAlternative
   - For alphabet mode: collect candidate letter sequences from ALL alternatives,
     score them by (sum of confidences + length weight), pick most supported.
   - For normal mode: pick highest-confidence transcript as before.
   ========================== */
function pickBestAlternative(result, prioritizeAlphabet) {
  if (!result || result.length === 0) return { text: "", raw: "", conf: 0 };

  // Build alternatives array
  const alts = [];
  for (let alt of result) {
    const raw = (alt.transcript || "").trim();
    const conf = alt.confidence || 0;
    alts.push({ raw, conf });
  }

  if (!prioritizeAlphabet) {
    // non-alphabet: pick highest (conf * length) heuristic
    let best = { text: "", raw: "", conf: 0 };
    for (let a of alts) {
      const mapped = a.raw;
      const score = (mapped ? mapped.length : 0) * 1000 + Math.round(a.conf * 100);
      const bestScore = best.text.length * 1000 + Math.round(best.conf * 100);
      if (score > bestScore) {
        best.text = mapped;
        best.raw = a.raw;
        best.conf = a.conf;
      }
    }
    return best;
  }

  // Alphabet mode: gather candidate letter sequences
  const candidates = new Map(); // seq -> {score, count, bestRaw}
  for (let a of alts) {
    // primary extraction
    let seq = interpretLetters(a.raw);
    if (!seq) seq = extractLettersFallback(a.raw);

    seq = filterAlphabetOnly(seq);

    // ignore empty
    if (!seq) continue;

    const score = seq.length * 1000 + Math.round(a.conf * 100);

    if (!candidates.has(seq)) {
      candidates.set(seq, { score: 0, count: 0, bestRaw: a.raw });
    }
    const ent = candidates.get(seq);
    ent.score += score;
    ent.count += 1;
    // keep highest-confidence raw example
    if (!ent.bestRaw || a.conf > (ent.bestRawConf || 0)) {
      ent.bestRaw = a.raw;
      ent.bestRawConf = a.conf;
    }
  }

  // If no candidates derived, fallback to filtering letters from the top alternative
  if (candidates.size === 0) {
    const top = alts[0];
    const fallbackSeq = filterAlphabetOnly(extractLettersFallback(top.raw));
    return { text: fallbackSeq, raw: top.raw, conf: top.conf || 0 };
  }

  // choose best candidate by highest cumulative score, tiebreaker: longest then highest count
  let bestSeq = "";
  let bestMeta = null;
  for (const [seq, meta] of candidates) {
    if (!bestMeta) {
      bestSeq = seq; bestMeta = meta; continue;
    }
    if (meta.score > bestMeta.score) {
      bestSeq = seq; bestMeta = meta;
    } else if (meta.score === bestMeta.score) {
      if (seq.length > bestSeq.length) { bestSeq = seq; bestMeta = meta; }
      else if (meta.count > bestMeta.count) { bestSeq = seq; bestMeta = meta; }
    }
  }

  return { text: bestSeq, raw: bestMeta.bestRaw || "", conf: bestMeta.bestRawConf || 0 };
}

/* ==========================
   Recognition handlers & wiring (stable restart behavior)
   ========================== */

function setupRecognitionHandlers() {
  if (!recognition) return;

  recognition.onstart = () => {
    isRecognizing = true;
    if (micEl) micEl.classList.add("recording");
    if (dialogEl && !finalText.trim()) dialogEl.innerHTML = "🎙️ Listening...";
  };

  recognition.onresult = (event) => {
    if (!dialogEl) return;
    let interim = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const res = event.results[i];
      const { text: mapped, raw, conf } = (function() {
        const p = pickBestAlternative(res, currentOptions.prioritizeAlphabet);
        return { text: p.text, raw: p.raw, conf: p.conf };
      })();

      if (res.isFinal) {
        if (currentOptions.prioritizeAlphabet) {
          // append only letters A-Z
          for (let ch of mapped) if (/^[A-Z]$/.test(ch)) finalText += ch;
        } else {
          if (mapped) finalText = (finalText + " " + mapped).trim();
        }
      } else {
        interim += mapped ? mapped + " " : "";
      }

      if (currentOptions.showDebug) {
        console.debug(`[${res.isFinal ? "FINAL" : "INTERIM"}]`, raw, "→", mapped, `(conf ${(conf*100).toFixed(1)}%)`);
      }
    }

    // Build display
    let display;
    if (currentOptions.prioritizeAlphabet) {
      display = `<span style="font-weight:600;color:#222;">${finalText}</span> <span style="color:#888;">${filterAlphabetOnly(interim)}</span>`;
    } else {
      display = `<span style="font-weight:600;color:#222;">${finalText}</span> <span style="color:#888;">${interim}</span>`;
    }

    if (display.replace(/<[^>]*>/g, "").trim() !== "") dialogEl.innerHTML = display;
  };

  recognition.onerror = (e) => {
    console.warn("recognition error", e.error);
    if (e.error === "no-speech") {
      if (shouldBeRecognizing) restartRecognitionSafely();
      return;
    }
    if (e.error === "aborted") return;
    shouldBeRecognizing = false;
    stopRecognize();
  };

  recognition.onend = () => {
    isRecognizing = false;
    if (micEl) micEl.classList.remove("recording");
    if (shouldBeRecognizing) {
      setTimeout(() => {
        try { recognition.start(); } catch (e) { console.warn("onend restart failed:", e); }
      }, 300);
    }
  };
}

setupRecognitionHandlers();

/* ==========================
   Public API
   ========================== */

export function recognize(dialog, mic, opts = {}) {
  if (!recognition) return;
  dialogEl = dialog;
  micEl = mic;
  currentOptions = opts || { prioritizeAlphabet: false, showDebug: false };
  shouldBeRecognizing = true;

  if (isRecognizing) return;

  try { recognition.start(); }
  catch (err) {
    try { recognition.stop(); } catch (_) {}
    setTimeout(() => {
      try { recognition.start(); } catch (e) { console.warn("recognition.start retry failed:", e); }
    }, 250);
  }
}

export function stopRecognize() {
  if (!recognition) return;
  shouldBeRecognizing = false;
  try { recognition.stop(); } catch (_) {}
}

export function getFinalText() {
  finalText = finalText.trim();
  if (finalText.length > 200) finalText = finalText.slice(-200);
  return finalText;
}

export function textIncludes(substring) {
  const text = getFinalText().toLowerCase();
  return text.includes(substring.toLowerCase());
}

export function textClear() {
  finalText = "";
}
