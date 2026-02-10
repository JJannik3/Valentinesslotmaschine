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

const elLines = document.getElementById("lines");
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

// === milestones (hidden until unlocked) ===
const MILESTONES = [
  { lights: 2,  place: "gersberg bei leinburg" },
  { lights: 4,  place: "garmisch-partenkirchen" },
  { lights: 6,  place: "görlitz + stop in leipzig" },
  { lights: 8,  place: "grünheide + trip nach berlin" },
  { lights: 10, place: "london (infinite light)" },
];

// === symbols ===
// ✅ +1% LIGHT overall
// ✅ LIGHT in FS higher
// ✅ NIGHT slightly higher so FS is more reachable (unchanged from your last version)
const SYM = {
  HEART: { k:"HEART", emoji:"💕", wBase: 20,  wFS: 20,  payout3: 0.5, payout4: 1.2, payout5: 2.6 },
  MOON:  { k:"MOON",  emoji:"🌙", wBase: 18,  wFS: 18,  payout3: 0.45,payout4: 1.1, payout5: 2.4 },
  MOTH:  { k:"MOTH",  emoji:"🦋", wBase: 16,  wFS: 16,  payout3: 0.6, payout4: 1.4, payout5: 3.0 },
  ROSE:  { k:"ROSE",  emoji:"🌹", wBase: 10,  wFS: 10,  payout3: 0.9, payout4: 2.0, payout5: 4.0 },
  STAR:  { k:"STAR",  emoji:"✨", wBase: 9,   wFS: 9,   payout3: 1.0, payout4: 2.2, payout5: 4.4 },

  NIGHT: { k:"NIGHT", emoji:"🌑", wBase: 3.0, wFS: 3.4, payout3: 0.7, payout4: 1.6, payout5: 3.2 },

  // LIGHT +1% overall + still “very rare”
  LIGHT: { k:"LIGHT", emoji:"💡", wBase: 0.606, wFS: 1.3635 },

  // WILD stays (and is used in cluster wins)
  WILD:  { k:"WILD",  emoji:"🔮", wBase: 1.2, wFS: 1.6 },
};

const BASE_SYMBOLS = [SYM.HEART, SYM.MOON, SYM.MOTH, SYM.ROSE, SYM.STAR, SYM.NIGHT, SYM.LIGHT, SYM.WILD];

const GRID_W = 5;
const GRID_H = 5;

let uid = null;
let state = defaultState();

function defaultState() {
  return {
    nickname: NICKNAME,
    coins: 1000,
    bet: 10,
    lights: 0,
    unlocked: [],
    freeSpinsLeft: 0,
    stickyWilds: [], // {x,y}
    lastGrid: null,
  };
}

function log(msg) { elLog.textContent = msg; }
function status(msg){ elStatus.textContent = msg; }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

function weightedPick(items, weights) {
  let sum = weights.reduce((s,w)=>s+w,0);
  let r = Math.random() * sum;
  for (let i=0;i<items.length;i++){
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length-1];
}

// ✅ LIGHT: am Anfang höher, später niedriger (degressiv)
// ✅ LIGHT: minimal bet-abhängig (bleibt sehr mild)
function symbolWeights(isFS){
  const w = BASE_SYMBOLS.map(s => isFS ? s.wFS : s.wBase);

  const lightIndex = BASE_SYMBOLS.findIndex(s => s.k === "LIGHT");
  if (lightIndex !== -1){
    // degressiv: 0 lights => ~1.25x, 10 lights => ~0.75x
    const degressive = clamp(1.25 - (state.lights * 0.05), 0.75, 1.25);

    // betFactor mild: bet 1..50 => ~0.98..1.20
    const betFactor = clamp(1 + ((state.bet - 10) / 200), 0.98, 1.20);

    w[lightIndex] *= degressive * betFactor;

    // FS tiny extra “magic”
    if (isFS) w[lightIndex] *= 1.06;
  }

  return w;
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

  // sticky wilds in FS
  if (isFS && state.stickyWilds.length){
    for (const p of state.stickyWilds){
      if (grid[p.y]?.[p.x]) grid[p.y][p.x] = SYM.WILD;
    }
  }

  return grid;
}

// === CLUSTER WIN LOGIC (NO PAYLINES) ===
const PAYABLE = [SYM.HEART, SYM.MOON, SYM.MOTH, SYM.ROSE, SYM.STAR, SYM.NIGHT];
const PAYABLE_KEYS = new Set(PAYABLE.map(s => s.k));

function symbolByKey(k){ return PAYABLE.find(s=>s.k===k); }

// cluster thresholds (feel free to tweak)
const CLUSTER_MIN = 4;

// size -> payout tier mapping using your existing payout3/4/5
function payoutMultForSize(sym, size){
  // 4-5 => payout3, 6-7 => payout4, 8+ => payout5
  if (size >= 8) return sym.payout5;
  if (size >= 6) return sym.payout4;
  return sym.payout3;
}

// BFS cluster: start from a payable symbol, include same-symbol and WILD connected (4-neighbor)
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
      // clusters only start on payable symbols (not wild, not light)
      if (!PAYABLE_KEYS.has(start.k)) continue;

      const key = start.k;
      const q = [{x,y}];
      visited[y][x] = true;
      const cells = [];

      while (q.length){
        const cur = q.pop();
        cells.push(cur);

        for (const [dx,dy] of dirs){
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (!inBounds(nx,ny)) continue;
          if (visited[ny][nx]) continue;

          const s = grid[ny][nx];
          // same symbol OR wild can join
          if (s.k === key || s.k === "WILD"){
            visited[ny][nx] = true;
            q.push({x:nx, y:ny});
          }
        }
      }

      if (cells.length >= CLUSTER_MIN){
        const sym = symbolByKey(key);
        const mult = payoutMultForSize(sym, cells.length);
        const amount = Math.floor(bet * mult);

        totalWin += amount;
        wins.push({ key, size: cells.length, amount, cells });
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

  // remove winning cells
  for (const key of winPosSet){
    const [x,y] = key.split(",").map(Number);
    g[y][x] = null;
  }

  // drop + refill per column
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

  // keep sticky wilds in FS
  if (isFS && state.stickyWilds.length){
    for (const p of state.stickyWilds){
      if (g[p.y]?.[p.x]) g[p.y][p.x] = SYM.WILD;
    }
  }

  return g;
}

// === LIGHT collection (unchanged mechanics) ===
function evalLightGain(grid){
  const isFS = state.freeSpinsLeft > 0;

  const isLight = (s)=> s.k==="LIGHT";
  const isWild = (s)=> s.k==="WILD";

  // rows
  let rowHit = false;
  for (let y=0;y<GRID_H;y++){
    const lights = grid[y].filter(isLight).length;
    if (lights >= 2) rowHit = true;
  }

  // cols
  let colHit = false;
  for (let x=0;x<GRID_W;x++){
    let lights = 0;
    let wilds = 0;
    for (let y=0;y<GRID_H;y++){
      if (isLight(grid[y][x])) lights++;
      if (isWild(grid[y][x])) wilds++;
    }
    if (!isFS && lights >= 2) colHit = true;
    if (isFS && (lights >= 2 || (lights>=1 && wilds>=1))) colHit = true;
  }

  if (!isFS){
    return (rowHit || colHit) ? 1 : 0;
  } else {
    const totalLights = grid.flat().filter(isLight).length;
    if (totalLights >= 2) return 1;

    const anyWild = grid.flat().some(isWild);
    if (totalLights >= 1 && anyWild){
      return Math.random() < 0.35 ? 1 : 0;
    }

    return colHit ? 1 : 0;
  }
}

// === Freespins meter: count reels with NIGHT ===
function nightReelsCount(grid){
  const reels = new Set();
  for (let x=0;x<GRID_W;x++){
    for (let y=0;y<GRID_H;y++){
      if (grid[y][x].k === "NIGHT") { reels.add(x); break; }
    }
  }
  return reels.size;
}

function evalStickyWilds(grid){
  const newSticky = [];
  if (state.freeSpinsLeft > 0){
    for (let y=0;y<GRID_H;y++){
      for (let x=0;x<GRID_W;x++){
        if (grid[y][x].k === "WILD"){
          const exists = state.stickyWilds.some(p=>p.x===x && p.y===y);
          if (!exists) newSticky.push({x,y});
        }
      }
    }
  }
  return newSticky;
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
      if (sym.k === "WILD") cell.classList.add("wild");
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
    if (unlocked){
      lines.push(`${m.lights}/10 → ${m.place}  ✅ unlocked`);
    } else {
      lines.push(`${m.lights}/10 → ???`);
    }
  }
  elMilestones.textContent = lines.join("\n");
}

function renderScatter(count){
  elScatterMeter.innerHTML = "";
  for (let i=0;i<4;i++){
    const d = document.createElement("div");
    d.className = "scatterDot" + (i < count ? " on" : "");
    d.textContent = "🌑";
    elScatterMeter.appendChild(d);
  }
}

function clearLines(){
  // we keep your SVG but we don’t use paylines anymore
  elLines.innerHTML = "";
}

function renderHud(scatterCount = 0){
  elNick.textContent = state.nickname || NICKNAME;
  elCoins.textContent = state.coins;
  elBet.value = state.bet;
  elBetVal.textContent = state.bet;
  elMode.textContent = state.freeSpinsLeft > 0 ? `free spins (${state.freeSpinsLeft})` : "base";
  renderLights();
  renderScatter(scatterCount);
}

function showWinOverlay({title, amount, sub}){
  elWinTitle.textContent = title;
  elWinAmount.textContent = amount;
  elWinSub.textContent = sub || "";
  elWinOverlay.hidden = false;
}

function hideWinOverlay(){
  elWinOverlay.hidden = true;
}

function showBigUnlock(place){
  safePlay(audio.win);
  showWinOverlay({
    title: "unlocked",
    amount: place,
    sub: "this destination is now saved forever."
  });
}

function clampBetAndPersist(){
  state.bet = clamp(state.bet, 1, 50);
  renderHud();
  return persist();
}

async function persist(){
  if (!uid) return;
  await saveGame(uid, state);
}

// === Slot-like bottom-to-top fill animation ===
async function animateFill(grid){
  const cells = [...elGrid.querySelectorAll(".cell")];
  const getCellEl = (x,y)=> cells.find(c => c.dataset.x==String(x) && c.dataset.y==String(y));

  for (const c of cells) c.textContent = " ";

  const reelDelay = 60;
  const stepDelay = 28;

  for (let x=0;x<GRID_W;x++){
    for (let y=GRID_H-1;y>=0;y--){
      await new Promise(r => setTimeout(r, stepDelay));
      const el = getCellEl(x,y);
      el.textContent = grid[y][x].emoji;
      if (grid[y][x].k === "WILD") el.classList.add("wild"); else el.classList.remove("wild");
      el.classList.add("pop");
      setTimeout(()=>el.classList.remove("pop"), 130);
    }
    await new Promise(r => setTimeout(r, reelDelay));
  }
}

async function spin(){
  if (!muted && audio.bg.paused) { try { await audio.bg.play(); } catch {} }

  hideWinOverlay();
  clearLines();

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

  // initial scatter meter
  let scatterCount = nightReelsCount(grid);

  // FS trigger: 4/5 reels NIGHT OR 3/5 with chance
  const nearFS = (state.freeSpinsLeft === 0) && (scatterCount === 3);
  const triggerFSNow =
    (state.freeSpinsLeft === 0) &&
    (scatterCount >= 4 || (nearFS && Math.random() < 0.22));

  // === CASCADES with CLUSTER WINS ===
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

    // remove all winning clusters, tumble, refill
    const winSet = collectWinPositionsFromClusters(res.wins);
    grid = applyCascade(grid, winSet);

    await new Promise(r => setTimeout(r, 110));
    await animateFill(grid);

    cascadeStep++;
  }

  state.lastGrid = grid;

  // after cascades: recompute scatter (so NIGHT can “rutschen” into FS)
  scatterCount = nightReelsCount(grid);

  const nearFS2 = (state.freeSpinsLeft === 0) && (scatterCount === 3);
  const triggerFSAfter =
    (state.freeSpinsLeft === 0) &&
    (scatterCount >= 4 || (nearFS2 && Math.random() < 0.22));

  const triggerFS = triggerFSNow || triggerFSAfter;

  // lights gain
  const gainedLight = (state.lights < 10) ? evalLightGain(grid) : 0;
  if (gainedLight > 0){
    state.lights = clamp(state.lights + gainedLight, 0, 10);
    safePlay(audio.light);
  }

  // sticky wilds
  const newSticky = evalStickyWilds(grid);
  if (newSticky.length){
    state.stickyWilds.push(...newSticky);
  }

  // start FS
  if (triggerFS){
    state.freeSpinsLeft = 8;
    state.stickyWilds = [];
    safePlay(audio.freespins);
  }

  unlockMilestonesIfNeeded();
  renderHud(scatterCount);

  // log
  const parts = [];
  if (totalWin > 0) parts.push(`win: ${totalWin}`);
  else parts.push("no win");
  if (gainedLight) parts.push("+1 light");
  if (triggerFS) parts.push("→ FREE SPINS!");
  log(parts.join(" · "));

  // overlay
  if (totalWin > 0){
    const summary = lastWins
      .slice(0,3)
      .map(w => `${w.key.toLowerCase()} cluster x${w.size} = +${w.amount}`)
      .join("\n");

    showWinOverlay({
      title: "win",
      amount: `+${totalWin} coins`,
      sub: summary || "nice."
    });
  } else if (!wasFS && scatterCount === 3){
    showWinOverlay({
      title: "so close…",
      amount: "3/4 night reels",
      sub: "one more night reel unlocks free spins."
    });
  }

  await persist();
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
  renderHud(0);
  clearLines();

  log("ready. spin when you want.");
  status("ready ✅");
})();
