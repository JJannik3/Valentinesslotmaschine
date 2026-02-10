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

// === symbols (rarer LIGHT + rarer NIGHT) ===
const SYM = {
  HEART: { k:"HEART", emoji:"💕", wBase: 20,  wFS: 20,  payout3: 0.5, payout4: 1.2, payout5: 2.6 },
  MOON:  { k:"MOON",  emoji:"🌙", wBase: 18,  wFS: 18,  payout3: 0.45,payout4: 1.1, payout5: 2.4 },
  MOTH:  { k:"MOTH",  emoji:"🦋", wBase: 16,  wFS: 16,  payout3: 0.6, payout4: 1.4, payout5: 3.0 },
  ROSE:  { k:"ROSE",  emoji:"🌹", wBase: 10,  wFS: 10,  payout3: 0.9, payout4: 2.0, payout5: 4.0 }, // premium
  STAR:  { k:"STAR",  emoji:"✨", wBase: 9,   wFS: 9,   payout3: 1.0, payout4: 2.2, payout5: 4.4 }, // premium

  // ↑ Boost: slightly higher chance to see NIGHT, so free spins happen more often
  NIGHT: { k:"NIGHT", emoji:"🌑", wBase: 3.0, wFS: 3.4, payout3: 0.7, payout4: 1.6, payout5: 3.2 },

  // ↑ Boost: more LIGHT in free spins + tiny in base
  LIGHT: { k:"LIGHT", emoji:"💡", wBase: 0.60, wFS: 1.35 },

  WILD:  { k:"WILD",  emoji:"🔮", wBase: 1.2, wFS: 1.6 }, // sticky in FS
};

const BASE_SYMBOLS = [SYM.HEART, SYM.MOON, SYM.MOTH, SYM.ROSE, SYM.STAR, SYM.NIGHT, SYM.LIGHT, SYM.WILD];

const GRID_W = 5;
const GRID_H = 5;

// 10 simple paylines (row indices per reel)
const PAYLINES = [
  [0,0,0,0,0],
  [1,1,1,1,1],
  [2,2,2,2,2],
  [3,3,3,3,3],
  [4,4,4,4,4],
  [0,1,2,1,0],
  [4,3,2,3,4],
  [0,0,1,0,0],
  [4,4,3,4,4],
  [1,2,3,2,1],
];

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

// ⬇️ changed: LIGHT becomes *slightly* more likely with higher bet (very mild)
function symbolWeights(isFS){
  const w = BASE_SYMBOLS.map(s => isFS ? s.wFS : s.wBase);

  const lightIndex = BASE_SYMBOLS.findIndex(s => s.k === "LIGHT");
  if (lightIndex !== -1){
    // bet 1..50 -> factor ~0.98..1.20 (mild)
    const betFactor = 1 + ((state.bet - 10) / 200);
    w[lightIndex] *= clamp(betFactor, 0.98, 1.20);

    // in FS: tiny extra so FS feels “magic”
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

// === helpers for line wins ===
const PAYABLE = [SYM.HEART, SYM.MOON, SYM.MOTH, SYM.ROSE, SYM.STAR, SYM.NIGHT];

function symbolByKey(k){ return PAYABLE.find(s=>s.k===k); }

function isMatch(sym, targetKey){
  return sym.k === targetKey || sym.k === "WILD";
}

function firstNonWildKey(lineSyms){
  for (const s of lineSyms){
    if (s.k !== "WILD") return s.k;
  }
  // all wild -> treat as STAR for payout (most premium)
  return "STAR";
}

function evalPaylines(grid, bet){
  let totalWin = 0;
  const wins = []; // {lineIndex, count, key, amount, points: [{x,y}...]}

  for (let li=0; li<PAYLINES.length; li++){
    const path = PAYLINES[li];
    const lineSyms = [];
    const points = [];
    for (let x=0;x<GRID_W;x++){
      const y = path[x];
      lineSyms.push(grid[y][x]);
      points.push({x,y});
    }

    const targetKey = firstNonWildKey(lineSyms);

    let count = 0;
    for (let x=0;x<GRID_W;x++){
      if (isMatch(lineSyms[x], targetKey)) count++;
      else break;
    }

    if (count >= 3){
      const sym = symbolByKey(targetKey);
      const mult = count===3 ? sym.payout3 : count===4 ? sym.payout4 : sym.payout5;
      const amount = Math.floor(bet * mult);
      totalWin += amount;
      wins.push({
        lineIndex: li,
        count,
        key: targetKey,
        amount,
        points: points.slice(0, count)
      });
    }
  }

  return { totalWin, wins };
}

// === NEW: cascade helpers ===
function collectWinPositions(wins){
  const set = new Set();
  for (const w of wins){
    for (const p of w.points){
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

// === LIGHT collection (hard mode) ===
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
    // FS: easier: 2 lights anywhere -> gain
    const totalLights = grid.flat().filter(isLight).length;
    if (totalLights >= 2) return 1;

    // FS boost: 1 light + any wild anywhere => small chance
    const anyWild = grid.flat().some(isWild);
    if (totalLights >= 1 && anyWild){
      return Math.random() < 0.35 ? 1 : 0;
    }

    return colHit ? 1 : 0;
  }
}

// === Freespins trigger meter: reels contain NIGHT ===
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
  elLines.innerHTML = "";
}

function drawWinningLines(wins){
  clearLines();
  if (!wins.length) return;

  const cellW = 1000 / GRID_W;
  const cellH = 1000 / GRID_H;

  for (const w of wins){
    const pts = w.points.map(p => {
      const cx = (p.x + 0.5) * cellW;
      const cy = (p.y + 0.5) * cellH;
      return [cx, cy];
    });

    const d = pts.map((pt, i) => `${i===0 ? "M":"L"} ${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`).join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d", d);
    elLines.appendChild(path);
  }
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

  const isFSStart = state.freeSpinsLeft > 0;

  if (!isFSStart){
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

  // animate initial fill
  await animateFill(grid);

  // freespin meter
  let scatterCount = nightReelsCount(grid);

  // Trigger logic:
  // - classic: 4/4 reels have NIGHT
  // - boost: if 3/4 reels, small chance to trigger anyway
  const nearFS = (state.freeSpinsLeft === 0) && (scatterCount === 3);
  const triggerFS =
    (state.freeSpinsLeft === 0) &&
    (scatterCount >= 4 || (nearFS && Math.random() < 0.22));

  // === CASCADES ===
  let totalWin = 0;
  let lastCascadeWins = [];
  let cascadeStep = 0;

  while (cascadeStep < 10){
    const res = evalPaylines(grid, state.bet);
    if (res.totalWin <= 0) break;

    totalWin += res.totalWin;
    lastCascadeWins = res.wins;

    state.coins += res.totalWin;
    safePlay(audio.win);

    drawWinningLines(res.wins);

    const winSet = collectWinPositions(res.wins);
    grid = applyCascade(grid, winSet);

    await new Promise(r => setTimeout(r, 120));
    await animateFill(grid);

    cascadeStep++;
  }

  // final grid
  state.lastGrid = grid;

  // re-check scatter after cascades (feels fair + cinematic)
  scatterCount = nightReelsCount(grid);

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

  // freespins start
  if (triggerFS){
    state.freeSpinsLeft = 8;
    state.stickyWilds = [];
    safePlay(audio.freespins);
  }

  unlockMilestonesIfNeeded();

  renderHud(scatterCount);
  drawWinningLines(lastCascadeWins);

  const parts = [];
  if (totalWin > 0) parts.push(`win: ${totalWin}`);
  else parts.push("no win");

  if (gainedLight) parts.push("+1 light");
  if (triggerFS) parts.push("→ FREE SPINS!");

  log(parts.join(" · "));

  if (totalWin > 0){
    const winSummary = lastCascadeWins
      .slice(0,3)
      .map(w => `line ${w.lineIndex+1}: ${w.key.toLowerCase()} x${w.count} = +${w.amount}`)
      .join("\n");

    showWinOverlay({
      title: "win",
      amount: `+${totalWin} coins`,
      sub: winSummary ? winSummary : "nice."
    });
  } else if (!isFSStart && scatterCount === 3){
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
