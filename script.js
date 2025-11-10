// main.js — handles UI + event wiring
import { recognize, stopRecognize, getFinalText, textIncludes, textClear} from './recognizer.js';
import {data} from './data.js';
const time_progress = document.querySelector('.time-progress');
const mic = document.getElementById('mic');
const dialog = document.getElementById('bee-text');
const phase1 = 120; // 2 min for asking questions
const phase2 = 40; // 40 s for spelling
// === Speak helper ===
function speak(text, rate = 1, pitch = 1) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;
    utterance.pitch = pitch;
    speechSynthesis.speak(utterance);
}

let current_task = data[0];
let seconds = 0;
clear_dialog();
recognize(dialog, mic, { prioritizeAlphabet: false, showDebug: true });

function answerQ(query)
{
    console.log("query: ", query);
    let ans = "";
    if(query == "repeat") 
        ans = current_task.pronunciation;
    else if(query == "definition")
        ans = current_task.definition;
    else if(query == "part")
        ans = current_task.part;
    else if(query == "example")
        ans = current_task.example;

    set_dialog(ans);
    speak(ans);
}


let answerloop = setInterval(() => {
    let answered = false;
    if(textIncludes("repeat")) 
    {
        answerQ("repeat");
        answered = true;
    }
    else if(textIncludes("definition")) 
    {
        answerQ("definition");
        answered = true;
    }
    else if(textIncludes("part")) 
    {
        answerQ("part");
        answered = true;
    }
    else if(textIncludes("example")) 
    {
        answerQ("example");
        answered = true;
    }
    if(answered) textClear();
}, 500);

// // === Mic event listeners (desktop + mobile) ===
// function startRecording() {
//     clear_dialog();
//     recognize(dialog, mic, { prioritizeAlphabet: true, showDebug: true });
// }
// function stopRecording() {
//     stopRecognize();
//     mic.classList.remove('recording');
// }

// mic.addEventListener('mousedown', startRecording);
// mic.addEventListener('mouseup', stopRecording);

// mic.addEventListener('touchstart', e => {
//     e.preventDefault();
//     startRecording();
// });
// mic.addEventListener('touchend', e => {
//     e.preventDefault();
//     stopRecording();
// });

// === Helpers ===
function set_time_bar(percent) {
    time_progress.style.width = percent + '%';
}
function set_dialog(text) {
    dialog.innerHTML = text;
}
function clear_dialog() {
    dialog.innerHTML = '';
}

function add_dialog(text) {
    dialog.innerHTML += text + '\n';
}

set_time_bar(0);
