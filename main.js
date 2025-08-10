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

function handleReveal(x, y) {
  const wasReady = board.state === 'ready';
  const res = board.reveal(x, y);
  for (const upd of res.opened) applyUpdate(upd);
  updateCounters();
  if (wasReady) startTimer();
  if (board.state === 'lost') {
    setFace('lost');
    stopTimer();
    announce('Boom! You hit a mine. Game over.');
  } else if (board.state === 'won') {
    setFace('won');
    stopTimer();
    saveBestIfBetter(elapsed);
    announce('You win! All safe cells revealed.');
  } else {
    setFace('playing');
  }
}

function handleFlag(x, y) {
  const res = board.toggleFlag(x, y, questionToggle.checked);
  for (const upd of res.changed) applyUpdate(upd);
  updateCounters();
}

function handleChord(x, y) {
  const res = board.chord(x, y);
  for (const upd of res.opened) applyUpdate(upd);
  updateCounters();
  if (res.exploded) {
    setFace('lost'); stopTimer(); announce('Boom! Chord exploded on a mine.');
  } else if (board.state === 'won') {
    setFace('won'); stopTimer(); saveBestIfBetter(elapsed); announce('You win!');
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
