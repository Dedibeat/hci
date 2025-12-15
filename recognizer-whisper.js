// === recognizer-whisper.js (CORRECT & STABLE) ===

let dialogEl = null;
let micEl = null;
let finalText = "";

let mediaRecorder = null;
let sendTimer = null;

const SEND_MS = 700;
const WINDOW_MS = 2500;

let rollingChunks = [];
let currentChunk = null;

// ---------- Server ----------
function getServerURL() {
  const ip = localStorage.getItem("whisperServer");
  if (!ip) return null;
  return `http://${ip}/transcribe`;
}

// ---------- Send ----------
async function sendChunk(spelling = false) {
  if (rollingChunks.length === 0) return null;

  const blob = new Blob(rollingChunks, { type: "audio/webm" });
  const url = getServerURL();
  if (!url) return null;

  const form = new FormData();
  form.append("audio", blob);
  form.append("spelling", spelling);

  const res = await fetch(url, { method: "POST", body: form });
  return await res.json();
}

// ---------- Start ----------
export async function recognize(dialog, mic, opts = {}) {
  dialogEl = dialog;
  micEl = mic;
  finalText = "";
  rollingChunks = [];

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream, {
    mimeType: "audio/webm;codecs=opus"
  });

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) {
      currentChunk = e.data;
    }
  };

  mediaRecorder.onstop = async () => {
    if (!currentChunk) return;

    rollingChunks.push(currentChunk);

    // trim window
    const maxChunks = Math.ceil(WINDOW_MS / SEND_MS);
    if (rollingChunks.length > maxChunks) {
      rollingChunks.shift();
    }

    const result = await sendChunk(opts.prioritizeAlphabet || false);
    if (result) {
      if (opts.prioritizeAlphabet && result.letters) {
        finalText += result.letters;
      }

      dialogEl.innerHTML =
        `<b>${finalText}</b> <span style="color:#888">${result.raw || ""}</span>`;
    }

    currentChunk = null;

    // restart clean recorder
    mediaRecorder.start();
  };

  mediaRecorder.start();

  sendTimer = setInterval(() => {
    if (mediaRecorder.state === "recording") {
      mediaRecorder.stop();
    }
  }, SEND_MS);

  if (micEl) micEl.classList.add("recording");
}

// ---------- Stop ----------
export function stopRecognize() {
  clearInterval(sendTimer);
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (micEl) micEl.classList.remove("recording");
}

// ---------- Utils ----------
export function getFinalText() {
  return finalText.trim();
}
export function textClear() {
  finalText = "";
}
export function textIncludes(s) {
  return finalText.toLowerCase().includes(s.toLowerCase());
}
