import { getOrCreateUser, loadGame, saveGame } from "./firebase.js";

const elGrid = document.getElementById("grid");
const elCoins = document.getElementById("coins");
const elBet = document.getElementById("bet");
const elBetVal = document.getElementById("betVal");
const elMode = document.getElementById("mode");
const elLights = document.getElementById("lights");
const elMilestones = document.getElementById("milestones");
const elLog = document.getElementById("log");
const elStatus = document.getElementById("status");
const elNick = document.getElementById("nick");

const elLines = document.getElementById("lines"); // unused now, keep
const elWinOverlay = document.getElementById("winOverlay");
const elWinTitle = document.getElementById("winTitle");
const elWinAmount = document.getElementById("winAmount");
const elWinSub = document.getElementById("winSub");
const btnWinClose = document.getElementById("winClose");

const elScatterMeter = document.getElementById("scatterMeter");

const btnSpin = document.getElementById("spin");
const btnBetDown = document.getElementById("betDown");
const btnBetUp = document.getElementById("betUp");
const btnReset = document.getElementById("reset");
const btnMute = document.getElementById("mute");

// === AUDIO ===
const audio = {
  bg: new Audio("./assets/audio/bg.mp3"),
  spin: new Audio("./assets/audio/spin.wav"),
  win: new Audio("./assets/audio/win.wav"),
  light: new Audio("./assets/audio/light.wav"),
  freespins: new Audio("./assets/audio/freespins.wav"),
};
audio.bg.loop = true;
audio.bg.volume = 0.35;

let muted = false;
function safePlay(a) {
  if (muted) return;
  try { a.currentTime = 0; a.play(); } catch {}
}

const NICKNAME = "Valentinsgift";

// ✅ House edge (RTP < 100%): payouts get multiplied by this
// 0.92 = spürbar aber nicht brutal
const HOUSE_FACTOR = 0.92;

// === milestones ===
const MILESTONES = [
  { lights: 2,  place: "gersberg bei leinburg" },
  { lights: 4,  place: "garmisch-partenkirchen" },
  { lights: 6,  place: "görlitz + stop in leipzig" },
  { lights: 8,  place: "grünheide + trip nach berlin" },
  { lights: 10, place: "london (infinite light)" },
];

// === symbols ===
// ✅ LIGHT slightly higher again (but still rare + degressive)
// ✅ FS wilds very rare stays as you wanted
const SYM = {
  HEART: { k:"HEART", emoji:"💕", wBase: 20,  wFS: 20,  payout3: 0.5, payout4: 1.2, payout5: 2.6 },
  MOON:  { k:"MOON",  emoji:"🌙", wBase: 18,  wFS: 18,  payout3: 0.45,payout4: 1.1, payout5: 2.4 },
  MOTH:  { k:"MOTH",  emoji:"🦋", wBase: 16,  wFS: 16,  payout3: 0.6, payout4: 1.4, payout5: 3.0 },
  ROSE:  { k:"ROSE",  emoji:"🌹", wBase: 10,  wFS: 10,  payout3: 0.9, payout4: 2.0, payout5: 4.0 },
  STAR:  { k:"STAR",  emoji:"✨", wBase: 9,   wFS: 9,   payout3: 1.0, payout4: 2.2, payout5: 4.4 },

  NIGHT: { k:"NIGHT", emoji:"🌑", wBase: 3.25, wFS: 3.70, payout3: 0.7, payout4: 1.6, payout5: 3.2 },

  // ✅ slightly higher than before
  LIGHT: { k:"LIGHT", emoji:"💡", wBase: 0.040, wFS: 0.070 },

  // FS wilds very rare
  WILD:  { k:"WILD",  emoji:"🔮", wBase: 1.2,  wFS: 0.55,  mult: 1 },
  WILD2: { k:"WILD2", emoji:"🔮", wBase: 0.0,  wFS: 0.05,  mult: 2 },
  WILD3: { k:"WILD3", emoji:"🔮", wBase: 0.0,  wFS: 0.018, mult: 3 },
  WILD4: { k:"WILD4", emoji:"🔮", wBase: 0.0,  wFS: 0.006, mult: 4 },
};

const BASE_SYMBOLS = [
  SYM.HEART, SYM.MOON, SYM.MOTH, SYM.ROSE, SYM.STAR,
  SYM.NIGHT, SYM.LIGHT,
  SYM.WILD, SYM.WILD2, SYM.WILD3, SYM.WILD4
];

const GRID_W = 5;
const GRID_H = 5;

let uid = null;
let state = defaultState();

let spinning = false;

function defaultState() {
  return {
    nickname: NICKNAME,
    coins: 1000,
    bet: 10,
    lights: 0,
    unlocked: [],
    freeSpinsLeft: 0,
    stickyWilds: [], // {x,y,k}
    lastGrid: null,
  };
}

function log(msg) { elLog.textContent = msg; }
function status(msg){ elStatus.textContent = msg; }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
const wait = (ms)=> new Promise(r=>setTimeout(r, ms));

function setSpinLocked(locked){
  spinning = locked;
  btnSpin.disabled = locked;
  btnSpin.style.opacity = locked ? "0.65" : "";
  btnSpin.style.cursor = locked ? "not-allowed" : "";
}

function weightedPick(items, weights) {
  let sum = weights.reduce((s,w)=>s+w,0);
  let r = Math.random() * sum;
  for (let i=0;i<items.length;i++){
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length-1];
}

function isAnyWild(sym){
  return sym.k === "WILD" || sym.k === "WILD2" || sym.k === "WILD3" || sym.k === "WILD4";
}
function wildMult(sym){
  if (sym.k === "WILD2") return 2;
  if (sym.k === "WILD3") return 3;
  if (sym.k === "WILD4") return 4;
  return 1;
}

// ✅ degressive remains strong
// 0 lights => 1.0
// 5 lights => ~0.059
// 10 lights => ~0.0035
function lightDegressiveFactor(){
  return Math.pow(0.57, state.lights);
}

function symbolWeights(isFS){
  const w = BASE_SYMBOLS.map(s => isFS ? s.wFS : s.wBase);

  const lightIndex = BASE_SYMBOLS.findIndex(s => s.k === "LIGHT");
  if (lightIndex !== -1){
    const betFactor = clamp(1 + ((state.bet - 10) / 900), 0.99, 1.06);
    w[lightIndex] *= betFactor * lightDegressiveFactor();
  }
  return w;
}

function applyStickyWildsToGrid(grid){
  if (state.freeSpinsLeft <= 0) return;
  if (!state.stickyWilds.length) return;

  for (const p of state.stickyWilds){
    if (grid[p.y]?.[p.x]){
      grid[p.y][p.x] = SYM[p.k] || SYM.WILD;
    }
  }
}

function genGrid() {
  const isFS = state.freeSpinsLeft > 0;
  const weights = symbolWeights(isFS);

  const grid = Array.from({length:GRID_H}, () => Array.from({length:GRID_W}, () => null));
  for (let y=0;y<GRID_H;y++){
    for (let x=0;x<GRID_W;x++){
      grid[y][x] = weightedPick(BASE_SYMBOLS, weights);
    }
  }

  if (isFS) applyStickyWildsToGrid(grid);
  return grid;
}

// === CLUSTER WINS (>=5) ===
const PAYABLE = [SYM.HEART, SYM.MOON, SYM.MOTH, SYM.ROSE, SYM.STAR, SYM.NIGHT];
const PAYABLE_KEYS = new Set(PAYABLE.map(s => s.k));
const CLUSTER_MIN = 5;

function symbolByKey(k){ return PAYABLE.find(s=>s.k===k); }

function payoutMultForSize(sym, size){
  if (size >= 9) return sym.payout5;
  if (size >= 7) return sym.payout4;
  return sym.payout3;
}

function evalClusters(grid, bet){
  const visited = Array.from({length:GRID_H}, () => Array(GRID_W).fill(false));
  const wins = [];
  let totalWin = 0;

  const inBounds = (x,y)=> x>=0 && x<GRID_W && y>=0 && y<GRID_H;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  for (let y=0;y<GRID_H;y++){
    for (let x=0;x<GRID_W;x++){
      if (visited[y][x]) continue;

      const start = grid[y][x];
      if (!PAYABLE_KEYS.has(start.k)) continue;

      const key = start.k;
      const q = [{x,y}];
      visited[y][x] = true;

      const cells = [];
      let maxWild = 1;

      while (q.length){
        const cur = q.pop();
        const sHere = grid[cur.y][cur.x];
        if (isAnyWild(sHere)) maxWild = Math.max(maxWild, wildMult(sHere));
        cells.push(cur);

        for (const [dx,dy] of dirs){
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (!inBounds(nx,ny)) continue;
          if (visited[ny][nx]) continue;

          const s = grid[ny][nx];
          if (s.k === key || isAnyWild(s)){
            visited[ny][nx] = true;
            q.push({x:nx, y:ny});
          }
        }
      }

      if (cells.length >= CLUSTER_MIN){
        const sym = symbolByKey(key);
        const baseMult = payoutMultForSize(sym, cells.length);

        // ✅ house edge applied here
        const amount = Math.floor(bet * baseMult * maxWild * HOUSE_FACTOR);

        totalWin += amount;
        wins.push({ key, size: cells.length, amount, cells, maxWild });
      }
    }
  }

  return { totalWin, wins };
}

function collectWinPositionsFromClusters(wins){
  const set = new Set();
  for (const w of wins){
    for (const p of w.cells){
      set.add(`${p.x},${p.y}`);
    }
  }
  return set;
}

function applyCascade(grid, winPosSet){
  const isFS = state.freeSpinsLeft > 0;
  const weights = symbolWeights(isFS);

  const g = grid.map(row => row.slice());

  for (const key of winPosSet){
    const [x,y] = key.split(",").map(Number);
    g[y][x] = null;
  }

  for (let x=0; x<GRID_W; x++){
    const col = [];
    for (let y=GRID_H-1; y>=0; y--){
      if (g[y][x] !== null) col.push(g[y][x]);
    }
    while (col.length < GRID_H){
      col.push(weightedPick(BASE_SYMBOLS, weights));
    }
    for (let y=GRID_H-1, i=0; y>=0; y--, i++){
      g[y][x] = col[i];
    }
  }

  if (isFS) applyStickyWildsToGrid(g);
  return g;
}

// === LIGHT mechanics ===
// each LIGHT: +3*bet coins and +1 lamp (up to 10)
// ✅ house edge also affects this payout
function awardLightsFromGrid(grid){
  let found = 0;
  for (let y=0;y<GRID_H;y++){
    for (let x=0;x<GRID_W;x++){
      if (grid[y][x].k === "LIGHT") found++;
    }
  }
  if (found > 0){
    const payout = Math.floor(found * (3 * state.bet) * HOUSE_FACTOR);
    state.coins += payout;

    const before = state.lights;
    state.lights = clamp(state.lights + found, 0, 10);
    if (state.lights > before) safePlay(audio.light);
  }
  return found;
}

// === FS trigger + retrigger ===
function nightCount(grid){
  let c = 0;
  for (let y=0;y<GRID_H;y++){
    for (let x=0;x<GRID_W;x++){
      if (grid[y][x].k === "NIGHT") c++;
    }
  }
  return c;
}

function renderScatter(count){
  const fill = Math.min(4, count);
  elScatterMeter.innerHTML = "";
  for (let i=0;i<4;i++){
    const d = document.createElement("div");
    d.className = "scatterDot" + (i < fill ? " on" : "");
    d.textContent = "🌑";
    elScatterMeter.appendChild(d);
  }
}

function addStickyWildsFromGrid(grid){
  if (state.freeSpinsLeft <= 0) return;

  for (let y=0;y<GRID_H;y++){
    for (let x=0;x<GRID_W;x++){
      const s = grid[y][x];
      if (!isAnyWild(s)) continue;

      const exists = state.stickyWilds.some(p => p.x===x && p.y===y);
      if (!exists){
        state.stickyWilds.push({x,y,k:s.k});
      }
    }
  }
}

function unlockMilestonesIfNeeded(){
  for (const m of MILESTONES){
    if (state.lights >= m.lights && !state.unlocked.includes(m.place)){
      state.unlocked.push(m.place);
      showBigUnlock(m.place);
    }
  }
}

// === UI render ===
function renderGrid(grid){
  elGrid.innerHTML = "";
  for (let y=0;y<GRID_H;y++){
    for (let x=0;x<GRID_W;x++){
      const cell = document.createElement("div");
      cell.className = "cell";
      const sym = grid[y][x];

      cell.textContent = sym.emoji;

      cell.classList.toggle("wild", isAnyWild(sym));
      if (isAnyWild(sym) && wildMult(sym) > 1) cell.dataset.mult = `${wildMult(sym)}x`;
      else delete cell.dataset.mult;

      cell.classList.toggle("light", sym.k === "LIGHT");

      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      elGrid.appendChild(cell);
    }
  }
}

function renderLights(){
  elLights.innerHTML = "";
  for (let i=0;i<10;i++){
    const d = document.createElement("div");
    d.className = "lightDot" + (i < state.lights ? " on" : "");
    elLights.appendChild(d);
  }

  const lines = [];
  for (const m of MILESTONES){
    const unlocked = state.unlocked.includes(m.place);
    lines.push(unlocked ? `${m.lights}/10 → ${m.place}  ✅ unlocked` : `${m.lights}/10 → ???`);
  }
  elMilestones.textContent = lines.join("\n");
}

function clearLines(){ elLines.innerHTML = ""; }

function renderHud(nightC = 0){
  elNick.textContent = state.nickname || NICKNAME;
  elCoins.textContent = state.coins;
  elBet.value = state.bet;
  elBetVal.textContent = state.bet;
  elMode.textContent = state.freeSpinsLeft > 0 ? `free spins (${state.freeSpinsLeft})` : "base";
  renderLights();
  renderScatter(nightC);
}

function showWinOverlay({title, amount, sub}){
  elWinTitle.textContent = title;
  elWinAmount.textContent = amount;
  elWinSub.textContent = sub || "";
  elWinOverlay.hidden = false;
}
function hideWinOverlay(){ elWinOverlay.hidden = true; }

function showBigUnlock(place){
  safePlay(audio.win);
  showWinOverlay({ title: "unlocked", amount: place, sub: "this destination is now saved forever." });
}

function clampBetAndPersist(){
  state.bet = clamp(state.bet, 1, 50);
  renderHud(nightCount(state.lastGrid || genGrid()));
  return persist();
}
async function persist(){ if (uid) await saveGame(uid, state); }

// === win highlighting ===
function markWinCells(winSet){
  const cells = [...elGrid.querySelectorAll(".cell")];
  for (const c of cells){
    const key = `${c.dataset.x},${c.dataset.y}`;
    if (winSet.has(key)) c.classList.add("win");
  }
}
function clearWinMarks(){
  const cells = [...elGrid.querySelectorAll(".cell")];
  for (const c of cells) c.classList.remove("win");
}

// === light hit flash ===
function flashLightCells(){
  const cells = [...elGrid.querySelectorAll(".cell.light")];
  for (const c of cells){
    c.classList.remove("lightHit");
    void c.offsetWidth;
    c.classList.add("lightHit");
    setTimeout(()=>c.classList.remove("lightHit"), 520);
  }
}

async function animateFill(grid){
  const cells = [...elGrid.querySelectorAll(".cell")];
  const getCellEl = (x,y)=> cells.find(c => c.dataset.x==String(x) && c.dataset.y==String(y));

  for (const c of cells) c.textContent = " ";

  const reelDelay = 60;
  const stepDelay = 28;

  for (let x=0;x<GRID_W;x++){
    for (let y=GRID_H-1;y>=0;y--){
      await wait(stepDelay);
      const el = getCellEl(x,y);
      const sym = grid[y][x];

      el.textContent = sym.emoji;

      el.classList.toggle("wild", isAnyWild(sym));
      if (isAnyWild(sym) && wildMult(sym) > 1) el.dataset.mult = `${wildMult(sym)}x`;
      else delete el.dataset.mult;

      el.classList.toggle("light", sym.k === "LIGHT");

      el.classList.add("pop");
      setTimeout(()=>el.classList.remove("pop"), 130);
    }
    await wait(reelDelay);
  }

  if (grid.flat().some(s => s.k === "LIGHT")) flashLightCells();
}

async function spin(){
  if (spinning) return;
  setSpinLocked(true);

  try {
    if (!muted && audio.bg.paused) { try { await audio.bg.play(); } catch {} }

    hideWinOverlay();
    clearLines();
    clearWinMarks();

    const wasFS = state.freeSpinsLeft > 0;

    if (!wasFS){
      if (state.coins < state.bet){
        log("not enough coins. (unlocked places stay saved.)");
        return;
      }
      state.coins -= state.bet;
    } else {
      state.freeSpinsLeft -= 1;
    }

    safePlay(audio.spin);

    let grid = genGrid();
    await animateFill(grid);

    if (state.freeSpinsLeft > 0) addStickyWildsFromGrid(grid);

    const light0 = awardLightsFromGrid(grid);

    let nCount = nightCount(grid);
    let triggerFS = (state.freeSpinsLeft === 0) && (nCount >= 4);

    // FS retrigger: during FS, if NIGHT >= 4 => +10 FS (once per spin max)
    let retriggeredThisSpin = false;
    if (state.freeSpinsLeft > 0 && nCount >= 4 && !retriggeredThisSpin){
      state.freeSpinsLeft += 10;
      retriggeredThisSpin = true;
      safePlay(audio.freespins);
    }

    let totalWin = 0;
    let lastWins = [];
    let cascadeStep = 0;

    while (cascadeStep < 12){
      const res = evalClusters(grid, state.bet);
      if (res.totalWin <= 0) break;

      totalWin += res.totalWin;
      lastWins = res.wins;

      state.coins += res.totalWin;
      safePlay(audio.win);

      const winSet = collectWinPositionsFromClusters(res.wins);

      clearWinMarks();
      markWinCells(winSet);
      await wait(240);

      grid = applyCascade(grid, winSet);

      clearWinMarks();
      await wait(90);
      await animateFill(grid);

      if (state.freeSpinsLeft > 0) addStickyWildsFromGrid(grid);

      awardLightsFromGrid(grid);

      nCount = nightCount(grid);

      if (!triggerFS && state.freeSpinsLeft === 0 && nCount >= 4) triggerFS = true;

      if (state.freeSpinsLeft > 0 && nCount >= 4 && !retriggeredThisSpin){
        state.freeSpinsLeft += 10;
        retriggeredThisSpin = true;
        safePlay(audio.freespins);
      }

      cascadeStep++;
    }

    state.lastGrid = grid;

    if (triggerFS){
      state.freeSpinsLeft = 8;
      state.stickyWilds = [];
      safePlay(audio.freespins);
    }

    unlockMilestonesIfNeeded();
    renderHud(nCount);

    const parts = [];
    if (totalWin > 0) parts.push(`win: ${totalWin}`);
    else parts.push("no win");
    if (light0 > 0) parts.push(`💡 x${light0} paid (house edge)`);
    if (triggerFS) parts.push("→ FREE SPINS!");
    if (retriggeredThisSpin) parts.push("+10 retrigger!");
    log(parts.join(" · "));

    if (totalWin > 0){
      const summary = lastWins
        .slice(0,3)
        .map(w => `${w.key.toLowerCase()} cluster x${w.size}${w.maxWild>1 ? ` · ${w.maxWild}x` : ""} = +${w.amount}`)
        .join("\n");

      showWinOverlay({
        title: "win",
        amount: `+${totalWin} coins`,
        sub: summary || "nice."
      });
    } else if (!wasFS && nCount === 3){
      showWinOverlay({
        title: "so close…",
        amount: "3/4 night",
        sub: "need 4 night symbols to unlock free spins."
      });
    }

    await persist();
  } finally {
    setSpinLocked(false);
  }
}

function toggleMute(){
  muted = !muted;
  btnMute.textContent = muted ? "unmute" : "mute";
  if (muted){
    try { audio.bg.pause(); } catch {}
  } else {
    try { audio.bg.play(); } catch {}
  }
}

// === events ===
elBet.addEventListener("input", async () => {
  state.bet = Number(elBet.value);
  await clampBetAndPersist();
});
btnBetDown.addEventListener("click", async ()=> {
  state.bet = clamp(state.bet - 1, 1, 50);
  await clampBetAndPersist();
});
btnBetUp.addEventListener("click", async ()=> {
  state.bet = clamp(state.bet + 1, 1, 50);
  await clampBetAndPersist();
});

btnSpin.addEventListener("click", spin);

btnReset.addEventListener("click", async ()=> {
  state = defaultState();
  clearLines();
  clearWinMarks();
  renderGrid(genGrid());
  renderHud(0);
  log("reset done.");
  await persist();
});

btnMute.addEventListener("click", toggleMute);
btnWinClose.addEventListener("click", hideWinOverlay);
elWinOverlay.addEventListener("click", (e)=> {
  if (e.target === elWinOverlay) hideWinOverlay();
});

// === init ===
(async function init(){
  log("connecting…");
  status("connecting…");

  const user = await getOrCreateUser();
  uid = user.uid;

  const saved = await loadGame(uid);
  if (saved){
    state = { ...defaultState(), ...saved, nickname: NICKNAME };
  } else {
    await persist();
  }

  renderGrid(state.lastGrid || genGrid());
  renderHud(nightCount(state.lastGrid || genGrid()));
  clearLines();

  log("ready. spin when you want.");
  status("ready ✅");
})();
