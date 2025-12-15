import os
import re
import subprocess
import datetime
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
from phonetic import PHONETIC_MAP

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model = WhisperModel("base", compute_type="int8")

SAVE_DIR = "saved_clips"
os.makedirs(SAVE_DIR, exist_ok=True)

# ---------- phonetic ----------
def interpret_phonetic(text: str) -> str:
    tokens = re.sub(r"[^a-zA-Z\s-]", " ", text.lower()).split()
    letters = []

    for tok in tokens:
        if tok in PHONETIC_MAP:
            letters.append(PHONETIC_MAP[tok])
        elif len(tok) == 1 and tok.isalpha():
            letters.append(tok.upper())

    return "".join(letters)

# ---------- decode audio ----------
def webm_to_numpy(webm_bytes: bytes) -> np.ndarray:
    cmd = [
        "ffmpeg",
        "-loglevel", "error",
        "-i", "pipe:0",
        "-ac", "1",
        "-ar", "16000",
        "-f", "f32le",
        "pipe:1"
    ]
    process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE
    )
    out, _ = process.communicate(webm_bytes)
    return np.frombuffer(out, dtype=np.float32)

# ---------- endpoint ----------
@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), spelling: bool = False):
    data = await audio.read()

    # save clip for debugging
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    with open(f"{SAVE_DIR}/{ts}.webm", "wb") as f:
        f.write(data)

    audio_np = webm_to_numpy(data)

    segments, _ = model.transcribe(
        audio_np,
        language="en",
        vad_filter=True
    )

    text = " ".join(seg.text.strip() for seg in segments)
    letters = interpret_phonetic(text) if spelling else ""

    return {
        "raw": text,
        "letters": letters,
        "mode": "spelling" if spelling else "normal"
    }
