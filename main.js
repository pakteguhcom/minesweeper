// main.js — Minesweeper (vanilla JS) — no dependencies
// UX highlights: first-click safe, mobile long-press flag, keyboard support, chording,
// a11y labels & roles, dark/light, best time via localStorage.

/* ---------------------------- Utilities ---------------------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const fmtTime = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const r = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${r}`;
};
const keyFor = (x, y) => `${x},${y}`;
const randInt = (n) => Math.floor(Math.random() * n);

/* ------------------------------ Board ------------------------------ */
class Board {
  constructor(w, h, mines) {
    this.w = w; this.h = h; this.mineCount = mines;
    this.firstClick = true;
    this.state = 'ready'; // 'ready' | 'playing' | 'won' | 'lost'
    this.revealedCount = 0;
    this.flaggedCount = 0;
    this.grid = [];
    this._initGrid();
  }

  _initGrid() {
    this.grid = Array.from({length: this.h}, () => (
      Array.from({length: this.w}, () => ({
        isMine: false,
        isRevealed: false,
        isFlagged: false,
        isQuestion: false,
        adj: 0
      }))
    ));
  }

  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  neighbors(x, y) {
    const res = [];
    for (let dy=-1; dy<=1; dy++) for (let dx=-1; dx<=1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (this.inBounds(nx, ny)) res.push([nx, ny]);
    }
    return res;
  }

  placeMinesAvoiding(sx, sy) {
    // Avoid first click cell and its neighbors for a friendlier start
    const avoid = new Set([keyFor(sx, sy)]);
    for (const [nx, ny] of this.neighbors(sx, sy)) avoid.add(keyFor(nx, ny));
    const pool = [];
    for (let y=0; y<this.h; y++) {
      for (let x=0; x<this.w; x++) {
        const k = keyFor(x,y);
        if (!avoid.has(k)) pool.push([x,y]);
      }
    }
    // Guard: clamp mines to max available
    const maxMines = Math.min(this.mineCount, this.w*this.h - avoid.size);
    // Fisher-Yates shuffle then take first N
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let i=0; i<maxMines; i++) {
      const [mx, my] = pool[i];
      this.grid[my][mx].isMine = true;
    }
    this.mineCount = maxMines;
    this.computeAdjacency();
    this.firstClick = false;
    this.state = 'playing';
  }

  computeAdjacency() {
    for (let y=0; y<this.h; y++) for (let x=0; x<this.w; x++) {
      const cell = this.grid[y][x];
      if (cell.isMine) { cell.adj = -1; continue; }
      let c = 0;
      for (const [nx, ny] of this.neighbors(x, y)) if (this.grid[ny][nx].isMine) c++;
      cell.adj = c;
    }
  }

  toggleFlag(x, y, allowQuestion) {
    const c = this.grid[y][x];
    if (this.state === 'lost' || this.state === 'won') return {changed:[{x,y,cell:c}], sound:null};
    if (c.isRevealed) return {changed:[], sound:null};
    // cycle: none -> flag -> (question?) -> none
    let changed = false;
    if (!c.isFlagged && !c.isQuestion) {
      c.isFlagged = true; this.flaggedCount++; changed = true;
      return {changed:[{x,y,cell:c}], sound:'flag'};
    }
    if (c.isFlagged) {
      c.isFlagged = false; this.flaggedCount--; changed = true;
      if (allowQuestion) { c.isQuestion = true; return {changed:[{x,y,cell:c}], sound:'question'}; }
      return {changed:[{x,y,cell:c}], sound:'unflag'};
    }
    if (c.isQuestion) {
      c.isQuestion = false; changed = true;
      return {changed:[{x,y,cell:c}], sound:'clear'};
    }
    return {changed: changed ? [{x,y,cell:c}] : [], sound:null};
  }

  reveal(x, y) {
    const firstAction = this.firstClick;
    if (this.state === 'lost' || this.state === 'won') return {opened:[], exploded:false};
    const c = this.grid[y][x];
    if (c.isFlagged || c.isRevealed) return {opened:[], exploded:false};

    if (this.firstClick) this.placeMinesAvoiding(x, y);

    if (c.isMine) {
      c.isRevealed = true;
      this.state = 'lost';
      // Reveal all mines; mark incorrect flags
      const opened = [{x,y,cell:c, exploded:true}];
      for (let yy=0; yy<this.h; yy++) for (let xx=0; xx<this.w; xx++) {
        const cc = this.grid[yy][xx];
        if (cc.isMine && !cc.isRevealed) { cc.isRevealed = true; opened.push({x:xx,y:yy,cell:cc}); }
        if (cc.isFlagged && !cc.isMine) opened.push({x:xx,y:yy,cell:cc, misflag:true});
      }
      return {opened, exploded:true};
    }

    // BFS flood fill
    const q = [[x,y]];
    const opened = [];
    while (q.length) {
      const [cx, cy] = q.shift();
      const cell = this.grid[cy][cx];
      if (cell.isRevealed || cell.isFlagged) continue;
      cell.isRevealed = true;
      this.revealedCount++;
      opened.push({x:cx,y:cy,cell});
      if (cell.adj === 0) {
        for (const [nx, ny] of this.neighbors(cx, cy)) {
          const nc = this.grid[ny][nx];
          if (!nc.isRevealed && !nc.isFlagged) q.push([nx, ny]);
        }
      }
    }

    const won = this.checkWin();
    if (won) {
      this.state = 'won';
      // Optionally mark correctly flagged
      for (let yy=0; yy<this.h; yy++) for (let xx=0; xx<this.w; xx++) {
        const cc = this.grid[yy][xx];
        if (cc.isMine && cc.isFlagged) opened.push({x:xx,y:yy,cell:cc, correctFlag:true});
      }
    }
    return {opened, exploded:false, won};
  }

  chord(x, y) {
    if (this.state !== 'playing') return {opened:[], exploded:false};
    const c = this.grid[y][x];
    if (!c.isRevealed || c.adj <= 0) return {opened:[], exploded:false};
    let flags = 0;
    for (const [nx, ny] of this.neighbors(x, y)) if (this.grid[ny][nx].isFlagged) flags++;
    if (flags !== c.adj) return {opened:[], exploded:false};
    // Reveal all non-flag neighbors
    let exploded = false;
    const opened = [];
    for (const [nx, ny] of this.neighbors(x, y)) {
      const n = this.grid[ny][nx];
      if (!n.isFlagged && !n.isRevealed) {
        const res = this.reveal(nx, ny);
        if (res.exploded) exploded = true;
        opened.push(...res.opened);
      }
    }
    const won = this.checkWin();
    return {opened, exploded, won};
  }

  checkWin() {
    return (this.w * this.h - this.revealedCount) === this.mineCount && this.state !== 'lost';
  }

  remainingMines() { return Math.max(0, this.mineCount - this.flaggedCount); }
}

/* --------------------------- Game / UI ---------------------------- */
const gridEl = $('#grid');
const levelSel = $('#level');
const customWrap = $('#customWrap');
const wInput = $('#wInput');
const hInput = $('#hInput');
const mInput = $('#mInput');
const mineCounter = $('#mineCounter');
const timerEl = $('#timer');
const bestTimeEl = $('#bestTime');
const questionToggle = $('#questionToggle');
const resetBtn = $('#resetBtn');
const announcer = $('#announcer');

/* ----------- Audio & Celebration ----------- */
class AudioEngine{
  constructor(){
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.loopTimer = null;
    this.currentStyle = 'off';
  }
  ensure(){
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.4;
    this.sfxGain.gain.value = 0.6;
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
  }
  setMusicVolume(v){
    this.ensure(); this.musicGain.gain.value = v;
  }
  stopLoop(){
    if (this.loopTimer){ clearInterval(this.loopTimer); this.loopTimer=null; }
  }
  stop(){
    this.stopLoop();
    this.currentStyle='off';
  }
  playMusic(style){
    if (style === 'off'){ this.stop(); return; }
    this.ensure();
    this.ctx.resume();
    this.stopLoop();
    this.currentStyle = style;
    // Simple scheduler
    let t = this.ctx.currentTime + 0.05;
    const tempo = (style==='calm') ? 84 : 112; // bpm
    const beat = 60/tempo;
    const scheduleAhead = 0.5;
    const notes = (style==='calm')
      ? [0,2,4,7,9,7,4,2]   // pentatonic
      : [0,7,12,7,0,5,9,5]; // arps
    let step = 0;
    const baseFreq = (style==='calm') ? 261.63 : 329.63;
    const wave = (style==='calm') ? 'sine' : 'square';
    const makeOsc = (freq, dur, gain=0.18) => {
      const o = this.ctx.createOscillator();
      o.type = wave;
      o.frequency.value = freq;
      const g = this.ctx.createGain();
      const now = this.ctx.currentTime;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
      const delay = this.ctx.createDelay();
      delay.delayTime.value = 0.22;
      const fb = this.ctx.createGain(); fb.gain.value = 0.25;
      o.connect(g);
      g.connect(this.musicGain);
      g.connect(delay);
      delay.connect(fb); fb.connect(delay);
      delay.connect(this.musicGain);
      o.start(); o.stop(now+dur+0.02);
    };
    const freqFor = (n)=> baseFreq * (2 ** (n/12));
    const scheduler = () => {
      while (t < this.ctx.currentTime + scheduleAhead){
        const idx = notes[step % notes.length];
        const f = freqFor(idx);
        const dur = (style==='calm') ? beat*0.9 : beat*0.6;
        makeOsc(f, dur);
        if (step % 2 === 0){
          const bass = freqFor(idx-24);
          const o = this.ctx.createOscillator();
          o.type = (style==='calm') ? 'sine' : 'square';
          o.frequency.value = bass;
          const g = this.ctx.createGain(); g.gain.value = 0.08;
          o.connect(g); g.connect(this.musicGain);
          o.start(t); o.stop(t + beat*0.45);
        }
        t += beat;
        step++;
      }
    };
    scheduler();
    this.loopTimer = setInterval(scheduler, 100);
  }
  blip(freq=800, dur=0.08){
    this.ensure();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type='square'; o.frequency.value=freq;
    g.gain.value=0.15;
    o.connect(g); g.connect(this.sfxGain);
    const now=this.ctx.currentTime;
    o.start(now); o.stop(now+dur);
  }
  click(){ this.blip(900, 0.05); }
  flag(){ this.blip(420, 0.08); }
  question(){ this.blip(250, 0.1); }
  unflag(){ this.blip(650, 0.06); }
  fanfareWin(){
    this.ensure(); this.ctx.resume();
    this.stopLoop();
    const seq = [ [880,.12], [988,.12], [1319,.24], [1175,.14], [1319,.28] ];
    let t = this.ctx.currentTime+0.02;
    for (const [f,d] of seq){
      const o = this.ctx.createOscillator(); o.type='triangle'; o.frequency.value=f;
      const g = this.ctx.createGain(); g.gain.value=0.22;
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t+d);
      t += d*0.9;
    }
    setTimeout(()=>{ if (this.currentStyle!=='off') this.playMusic(this.currentStyle); }, 1600);
  }
  fanfareLose(){
    this.ensure(); this.ctx.resume();
    this.stopLoop();
    let t = this.ctx.currentTime+0.02;
    for (let i=0;i<8;i++){
      const o=this.ctx.createOscillator(); o.type='sawtooth';
      const g=this.ctx.createGain(); g.gain.value=0.18;
      o.frequency.setValueAtTime(600 - i*60, t+i*0.08);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t+i*0.08); o.stop(t+i*0.08+0.18);
    }
    setTimeout(()=>{ if (this.currentStyle!=='off') this.playMusic(this.currentStyle); }, 1200);
  }
}
const audio = new AudioEngine();
const musicSel = $('#musicSel');
const musicVol = $('#musicVol');
if (musicSel){
  const saved = localStorage.getItem('ms.music') || 'off';
  musicSel.value = saved;
  if (saved !== 'off') { audio.playMusic(saved); }
  musicSel.addEventListener('change', ()=>{
    const v = musicSel.value;
    localStorage.setItem('ms.music', v);
    if (v==='off') audio.stop();
    else audio.playMusic(v);
  });
}
if (musicVol){
  const savedVol = Number(localStorage.getItem('ms.musicVol') || '50');
  musicVol.value = String(savedVol);
  audio.setMusicVolume(savedVol/100);
  musicVol.addEventListener('input', ()=>{
    const v = Number(musicVol.value);
    localStorage.setItem('ms.musicVol', String(v));
    audio.setMusicVolume(v/100);
  });
}
window.addEventListener('pointerdown', ()=>{ try{ audio.ensure(); audio.ctx.resume(); }catch{} }, {once:true});

// Confetti celebration
const confetti = $('#confetti');
let confettiRunning = false;
function startConfetti(duration=1800){
  if (!confetti) return;
  confetti.classList.remove('hidden');
  const ctx = confetti.getContext('2d');
  let W = confetti.width = window.innerWidth;
  let H = confetti.height = window.innerHeight;
  const N = Math.min(160, Math.floor((W*H)/25000));
  const parts = Array.from({length:N}, () => ({
    x: Math.random()*W,
    y: -20 - Math.random()*H*0.5,
    vx: (Math.random()-0.5)*2,
    vy: 2 + Math.random()*2.5,
    size: 4 + Math.random()*5,
    rot: Math.random()*Math.PI,
    vr: (Math.random()-0.5)*0.2,
    color: `hsl(${Math.floor(Math.random()*360)},80%,60%)`
  }));
  let start = null;
  confettiRunning = true;
  function frame(ts){
    if (!start) start = ts;
    const dt = 16/1000;
    ctx.clearRect(0,0,W,H);
    for (const p of parts){
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > H + 20) { p.y = -20; p.x = Math.random()*W; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.6);
      ctx.restore();
    }
    if (ts - start < duration && confettiRunning) requestAnimationFrame(frame);
    else { confetti.classList.add('hidden'); confettiRunning=false; }
  }
  requestAnimationFrame(frame);
}
function screenShake(){
  document.body.classList.add('shake');
  setTimeout(()=>document.body.classList.remove('shake'), 600);
}


const themeSel = $('#themeSel');
const helpBtn = $('#helpBtn');
const helpModal = $('#helpModal');
const helpClose = $('#helpClose');
let lastFocus = null;

function applyTheme(value){
  const root = document.documentElement;
  if (value === 'light') { root.setAttribute('data-theme','light'); }
  else if (value === 'dark') { root.setAttribute('data-theme','dark'); }
  else { root.removeAttribute('data-theme'); } // system
}

(function restoreTheme(){
  const t = localStorage.getItem('ms.theme') || 'system';
  if (themeSel) themeSel.value = t;
  applyTheme(t);
})();

if (themeSel){
  themeSel.addEventListener('change', () => {
    const v = themeSel.value;
    localStorage.setItem('ms.theme', v);
    applyTheme(v);
  });
}

// Help modal
function openHelp(){
  lastFocus = document.activeElement;
  helpModal.classList.remove('hidden');
  helpModal.querySelector('.modal__panel').focus();
}
function closeHelp(){
  helpModal.classList.add('hidden');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
helpBtn?.addEventListener('click', openHelp);
helpClose?.addEventListener('click', closeHelp);
helpModal?.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal__backdrop')) closeHelp();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !helpModal.classList.contains('hidden')) closeHelp();
});


const LEVELS = {
  beginner:   { w:9,  h:9,  m:10, key:'beginner' },
  intermediate:{ w:16, h:16, m:40, key:'intermediate' },
  expert:     { w:30, h:16, m:99, key:'expert' }
};

let board = null;
let timer = null;
let elapsed = 0;
let touchTimer = null;
let longPressFired = false;

// Restore prefs
(function restorePrefs(){
  const q = localStorage.getItem('ms.question') === '1';
  questionToggle.checked = q;
  const savedLevel = localStorage.getItem('ms.level') || 'beginner';
  levelSel.value = savedLevel in LEVELS ? savedLevel : 'beginner';
  customWrap.classList.toggle('hidden', levelSel.value !== 'custom');
  if (levelSel.value === 'custom') customWrap.setAttribute('aria-hidden', 'false');
})();

function bestKey() {
  const k = (levelSel.value === 'custom') ? `custom_${wInput.value}x${hInput.value}_${mInput.value}` : levelSel.value;
  return `ms.best.${k}`;
}
function loadBest() {
  const v = localStorage.getItem(bestKey());
  bestTimeEl.textContent = v ? fmtTime(Number(v)) : '—';
}
function saveBestIfBetter(seconds) {
  const k = bestKey();
  const cur = Number(localStorage.getItem(k) || '1e12');
  if (seconds < cur) {
    localStorage.setItem(k, String(seconds));
    loadBest();
  }
}

function setGridTemplate(w) {
  gridEl.style.setProperty('--cols', w);
}

function updateCounters() {
  mineCounter.textContent = String(board.remainingMines()).padStart(3, '0');
}

function startTimer() {
  if (timer) return;
  timer = setInterval(() => {
    elapsed += 1;
    timerEl.textContent = fmtTime(elapsed);
  }, 1000);
}
function stopTimer() { clearInterval(timer); timer = null; }

function setFace(state) {
  // 'ready' | 'playing' | 'won' | 'lost'
  const map = { ready:'😊', playing:'🙂', won:'😎', lost:'💥' };
  resetBtn.textContent = map[state] || '😊';
}

function announce(msg) { announcer.textContent = msg; }

function buildGrid() {
  gridEl.innerHTML = '';
  gridEl.setAttribute('aria-rowcount', board.h);
  gridEl.setAttribute('aria-colcount', board.w);
  setGridTemplate(board.w);
  const frag = document.createDocumentFragment();
  for (let y=0; y<board.h; y++) {
    for (let x=0; x<board.w; x++) {
      const btn = document.createElement('button');
      btn.id = `c-${x}-${y}`;
      btn.className = 'cell hidden';
      btn.setAttribute('role','gridcell');
      btn.setAttribute('aria-label', `cell (${x+1},${y+1}), hidden`);
      btn.dataset.x = String(x);
      btn.dataset.y = String(y);
      btn.dataset.adj = '0';
      btn.tabIndex = (x===0 && y===0) ? 0 : -1; // roving tabindex
      frag.appendChild(btn);
    }
  }
  gridEl.appendChild(frag);
  // initial focus
  $('#c-0-0')?.focus({preventScroll:true});
}

function revealCellEl(el, cell) {
  el.classList.remove('hidden','flag','question');
  el.classList.add('revealed');
  el.removeAttribute('aria-pressed');
  el.setAttribute('aria-label', `cell (${Number(el.dataset.x)+1},${Number(el.dataset.y)+1}), revealed`);
  if (cell.isMine) {
    el.classList.add('mine');
  } else if (cell.adj > 0) {
    el.dataset.adj = String(cell.adj);
    el.textContent = String(cell.adj);
  } else {
    el.textContent = '';
    el.dataset.adj = '0';
  }
}

function applyUpdate(upd) {
  const el = document.getElementById(`c-${upd.x}-${upd.y}`);
  if (!el) return;
  const cell = upd.cell;
  if (upd.misflag) {
    el.classList.add('revealed');
    el.classList.remove('flag');
    el.textContent = '✖';
    el.setAttribute('aria-label', `cell (${upd.x+1},${upd.y+1}), wrong flag`);
    return;
  }
  if (upd.correctFlag) {
    el.classList.add('correct-flag');
  }
  if (upd.exploded) {
    revealCellEl(el, cell);
    el.classList.add('exploded');
    el.setAttribute('aria-label', `cell (${upd.x+1},${upd.y+1}), mine exploded`);
    return;
  }
  if (cell.isRevealed) {
    revealCellEl(el, cell);
    return;
  }
  // flags/questions
  el.classList.toggle('flag', cell.isFlagged);
  el.classList.toggle('question', cell.isQuestion);
  if (cell.isFlagged) {
    el.setAttribute('aria-label', `cell (${upd.x+1},${upd.y+1}), flag`);
  } else if (cell.isQuestion) {
    el.setAttribute('aria-label', `cell (${upd.x+1},${upd.y+1}), question`);
  } else {
    el.setAttribute('aria-label', `cell (${upd.x+1},${upd.y+1}), hidden`);
  }
}

function newGame(fromReset=false) {
  // level config
  let cfg;
  if (levelSel.value === 'custom') {
    const w = Math.max(5, Math.min(60, Number(wInput.value || 9)));
    const h = Math.max(5, Math.min(40, Number(hInput.value || 9)));
    const maxM = Math.max(1, w*h - 9); // keep some space for first-click safe
    const m = Math.max(1, Math.min(maxM, Number(mInput.value || 10)));
    cfg = {w, h, m};
  } else {
    cfg = LEVELS[levelSel.value];
  }

  board = new Board(cfg.w, cfg.h, cfg.m);
  elapsed = 0;
  timerEl.textContent = '00:00';
  stopTimer();
  setFace('ready');
  buildGrid();
  updateCounters();
  loadBest();
  announce(fromReset ? 'New game started.' : '');
}

function cellFromEventTarget(target) {
  const el = target.closest('.cell');
  if (!el) return null;
  return { el, x: Number(el.dataset.x), y: Number(el.dataset.y) };
}

function handleReveal(x, y) { audio.click();
  const wasReady = board.state === 'ready';
  const res = board.reveal(x, y);
  for (const upd of res.opened) applyUpdate(upd);
  updateCounters();
  if (wasReady) startTimer();
  if (board.state === 'lost') {
    setFace('lost');
    stopTimer();
    announce('Boom! You hit a mine. Game over.');
    audio.fanfareLose();
    screenShake();
  } else if (board.state === 'won') {
    setFace('won');
    stopTimer();
    saveBestIfBetter(elapsed);
    announce('You win! All safe cells revealed.');
    audio.fanfareWin();
    startConfetti(2200);
  } else {
    setFace('playing');
  }
}

function handleFlag(x, y) {
  const res = board.toggleFlag(x, y, questionToggle.checked);
  for (const upd of res.changed) applyUpdate(upd);
  updateCounters();
  if (res.sound === 'flag') audio.flag();
  else if (res.sound === 'question') audio.question();
  else if (res.sound === 'unflag' || res.sound==='clear') audio.click();
}

function handleChord(x, y) {
  const res = board.chord(x, y);
  for (const upd of res.opened) applyUpdate(upd);
  updateCounters();
  if (res.exploded) {
    setFace('lost'); stopTimer(); announce('Boom! Chord exploded on a mine.'); audio.fanfareLose(); screenShake();
  } else if (board.state === 'won') {
    setFace('won'); stopTimer(); saveBestIfBetter(elapsed); announce('You win!'); audio.fanfareWin(); startConfetti(2200);
  }
}

/* ------------------------- Event Listeners ------------------------ */
gridEl.addEventListener('contextmenu', (e) => {
  const data = cellFromEventTarget(e.target);
  if (!data) return;
  e.preventDefault();
  handleFlag(data.x, data.y);
});

gridEl.addEventListener('click', (e) => {
  // Ignore if a long-press already handled this touch
  if (e.pointerType === 'touch' && longPressFired) { longPressFired = false; return; }
  const data = cellFromEventTarget(e.target);
  if (!data) return;
  handleReveal(data.x, data.y);
});

gridEl.addEventListener('auxclick', (e) => {
  const data = cellFromEventTarget(e.target);
  if (!data) return;
  if (e.button === 1) { // middle
    e.preventDefault();
    handleChord(data.x, data.y);
  }
});

gridEl.addEventListener('dblclick', (e) => {
  const data = cellFromEventTarget(e.target);
  if (!data) return;
  e.preventDefault();
  handleChord(data.x, data.y);
});

// Mobile long-press for flag
gridEl.addEventListener('pointerdown', (e) => {
  const data = cellFromEventTarget(e.target);
  if (!data) return;
  if (e.pointerType !== 'touch') return;
  longPressFired = false;
  clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    handleFlag(data.x, data.y);
    longPressFired = true;
  }, 400);
});
gridEl.addEventListener('pointerup', () => clearTimeout(touchTimer));
gridEl.addEventListener('pointercancel', () => clearTimeout(touchTimer));

// Roving tabindex + keyboard controls
gridEl.addEventListener('keydown', (e) => {
  const active = document.activeElement.closest('.cell') || $('#c-0-0');
  if (!active) return;
  const x = Number(active.dataset.x), y = Number(active.dataset.y);
  let nx = x, ny = y;
  const move = (dx, dy) => {
    nx = Math.min(board.w-1, Math.max(0, x + dx));
    ny = Math.min(board.h-1, Math.max(0, y + dy));
    const next = document.getElementById(`c-${nx}-${ny}`);
    if (next) {
      active.tabIndex = -1;
      next.tabIndex = 0;
      next.focus({preventScroll:true});
    }
  };

  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); move(-1, 0); break;
    case 'ArrowRight': e.preventDefault(); move(1, 0); break;
    case 'ArrowUp': e.preventDefault(); move(0, -1); break;
    case 'ArrowDown': e.preventDefault(); move(0, 1); break;
    case 'f': case 'F': e.preventDefault(); handleFlag(x, y); break;
    case 'c': case 'C': e.preventDefault(); handleChord(x, y); break;
    case 'r': case 'R': e.preventDefault(); newGame(true); break;
    case 'Enter': case ' ': e.preventDefault(); handleReveal(x, y); break;
  }
});

// Top controls
levelSel.addEventListener('change', () => {
  localStorage.setItem('ms.level', levelSel.value);
  const isCustom = levelSel.value === 'custom';
  customWrap.classList.toggle('hidden', !isCustom);
  customWrap.setAttribute('aria-hidden', isCustom ? 'false' : 'true');
  newGame();
});
[wInput, hInput, mInput].forEach(inp => {
  inp.addEventListener('change', () => {
    // Basic validation
    const w = Math.max(5, Math.min(60, Number(wInput.value || 9)));
    const h = Math.max(5, Math.min(40, Number(hInput.value || 9)));
    const maxM = Math.max(1, w*h - 9);
    const m = Math.max(1, Math.min(maxM, Number(mInput.value || 10)));
    wInput.value = w; hInput.value = h; mInput.value = m;
    newGame();
  });
});

questionToggle.addEventListener('change', () => {
  localStorage.setItem('ms.question', questionToggle.checked ? '1' : '0');
});

resetBtn.addEventListener('click', () => newGame(true));

// Face press visual when mouse held on hidden cell
gridEl.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const data = cellFromEventTarget(e.target);
  if (!data) return;
  const c = board.grid[data.y][data.x];
  if (!c.isRevealed && !c.isFlagged) setFace('playing');
});
gridEl.addEventListener('mouseup', () => {
  if (board?.state) setFace(board.state === 'ready' ? 'ready' : 'playing');
});

/* ---------------------------- Start ------------------------------- */
newGame();
