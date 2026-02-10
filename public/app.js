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

const btnSpin = document.getElementById("spin");
const btnBetDown = document.getElementById("betDown");
const btnBetUp = document.getElementById("betUp");
const btnReset = document.getElementById("reset");
const btnMute = document.getElementById("mute");

// === AUDIO (pack deine files in public/assets/audio/) ===
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

const NICKNAME = "SlotMaschineLondon";

const MILESTONES = [
  { lights: 2,  place: "gersberg bei leinburg" },
  { lights: 4,  place: "garmisch-partenkirchen" },
  { lights: 6,  place: "görlitz + stop in leipzig" },
  { lights: 8,  place: "grünheide + trip nach berlin" },
  { lights: 10, place: "london (infinite light)" },
];

// symbols
const SYM = {
  HEART: { k:"HEART",  emoji:"💕", baseWeight: 18, payout3: 0.4, payout4: 0.9, payout5: 2.0 },
  MOON:  { k:"MOON",   emoji:"🌙", baseWeight: 16, payout3: 0.35,payout4: 0.8, payout5: 1.8 },
  MOTH:  { k:"MOTH",   emoji:"🦋", baseWeight: 14, payout3: 0.5, payout4: 1.2, payout5: 2.6 },
  ROSE:  { k:"ROSE",   emoji:"🌹", baseWeight: 10, payout3: 0.7, payout4: 1.6, payout5: 3.4 }, // premium
  STAR:  { k:"STAR",   emoji:"✨", baseWeight: 10, payout3: 0.75,payout4: 1.7, payout5: 3.6 }, // premium
  NIGHT: { k:"NIGHT",  emoji:"🌑", baseWeight: 9,  payout3: 0.6, payout4: 1.4, payout5: 3.0 }, // triggers freespins
  LIGHT: { k:"LIGHT",  emoji:"💡", baseWeight: 4  }, // progress symbol
  WILD:  { k:"WILD",   emoji:"🔮", baseWeight: 3  }, // acts as any symbol
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
    stickyWilds: [], // array of {x,y}
    lastGrid: null,
  };
}

function log(msg) { elLog.textContent = msg; }
function status(msg){ elStatus.textContent = msg; }

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function weightedPick(items, weights) {
  let sum = weights.reduce((s,w)=>s+w,0);
  let r = Math.random() * sum;
  for (let i=0;i<items.length;i++){
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length-1];
}

function symbolWeights(isFreeSpins){
  // In freespins: LIGHT higher chance, WILD a bit higher
  return BASE_SYMBOLS.map(s => {
    if (!isFreeSpins) return s.baseWeight;
    if (s.k === "LIGHT") return s.baseWeight * 3;
    if (s.k === "WILD")  return s.baseWeight * 1.6;
    return s.baseWeight;
  });
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

  // apply sticky wilds in freespins
  if (isFS && state.stickyWilds.length){
    for (const p of state.stickyWilds){
      if (grid[p.y]?.[p.x]) grid[p.y][p.x] = SYM.WILD;
    }
  }

  return grid;
}

// “Ways”-like evaluation: for each symbol, count occurrences per reel.
// Winning streak is consecutive reels from left with count>0 (WILD counts as match).
function evaluate(grid, bet) {
  const reels = [];
  for (let x=0;x<GRID_W;x++){
    const col = [];
    for (let y=0;y<GRID_H;y++) col.push(grid[y][x]);
    reels.push(col);
  }

  const payables = [SYM.HEART,SYM.MOON,SYM.MOTH,SYM.ROSE,SYM.STAR,SYM.NIGHT]; // LIGHT not paid, WILD not directly paid
  let totalWin = 0;

  for (const sym of payables){
    const counts = reels.map(col => col.filter(s => s.k===sym.k || s.k==="WILD").length);
    let streak = 0;
    for (let i=0;i<counts.length;i++){
      if (counts[i] > 0) streak++;
      else break;
    }
    if (streak >= 3){
      const ways = counts.slice(0,streak).reduce((p,c)=>p*c,1);
      const mult = streak===3 ? sym.payout3 : streak===4 ? sym.payout4 : sym.payout5;
      const win = Math.floor(bet * ways * mult);
      totalWin += win;
    }
  }

  // LIGHT occurrences: if >=3 anywhere -> +1 light progress
  const lightCount = grid.flat().filter(s=>s.k==="LIGHT").length;
  const gainedLight = lightCount >= 3 ? 1 : 0;

  // Freespins: if >=4 NIGHT anywhere -> 10 FS (only if currently not in FS)
  const nightCount = grid.flat().filter(s=>s.k==="NIGHT").length;
  const triggerFS = (state.freeSpinsLeft === 0) && (nightCount >= 4);

  // In freespins: any WILD landed becomes sticky (add positions)
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

  return { totalWin, gainedLight, triggerFS, newSticky };
}

function renderGrid(grid){
  elGrid.innerHTML = "";
  for (let y=0;y<GRID_H;y++){
    for (let x=0;x<GRID_W;x++){
      const cell = document.createElement("div");
      cell.className = "cell pop";
      const sym = grid[y][x];
      cell.textContent = sym.emoji;
      if (sym.k === "WILD") cell.classList.add("wild");
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
    const statusTxt = unlocked ? "✅ unlocked" : (state.lights >= m.lights ? "✨ ready" : "—");
    lines.push(`${m.lights}/10 → ${m.place}  ${statusTxt}`);
  }
  elMilestones.textContent = lines.join("\n");
}

function renderHud(){
  elNick.textContent = state.nickname || NICKNAME;
  elCoins.textContent = state.coins;
  elBet.value = state.bet;
  elBetVal.textContent = state.bet;
  elMode.textContent = state.freeSpinsLeft > 0 ? `free spins (${state.freeSpinsLeft})` : "base";
  renderLights();
}

function unlockMilestonesIfNeeded(){
  for (const m of MILESTONES){
    if (state.lights >= m.lights && !state.unlocked.includes(m.place)){
      state.unlocked.push(m.place);
    }
  }
}

async function persist(){
  if (!uid) return;
  await saveGame(uid, state);
}

async function spin(){
  // start bg music on first interaction
  if (!muted && audio.bg.paused) {
    try { await audio.bg.play(); } catch {}
  }

  const isFS = state.freeSpinsLeft > 0;

  if (!isFS){
    if (state.coins < state.bet){
      log("not enough coins. (unlocked places stay saved.)");
      return;
    }
    state.coins -= state.bet;
  } else {
    state.freeSpinsLeft -= 1;
  }

  safePlay(audio.spin);

  const grid = genGrid();
  state.lastGrid = grid;

  const r = evaluate(grid, state.bet);

  // apply sticky wilds gained in FS
  if (r.newSticky.length){
    state.stickyWilds.push(...r.newSticky);
  }

  // wins
  if (r.totalWin > 0){
    state.coins += r.totalWin;
    safePlay(audio.win);
  }

  // lights
  if (r.gainedLight > 0 && state.lights < 10){
    state.lights += r.gainedLight;
    state.lights = clamp(state.lights, 0, 10);
    safePlay(audio.light);
  }

  // freespins trigger
  if (r.triggerFS){
    state.freeSpinsLeft = 10;
    state.stickyWilds = []; // reset sticky set when FS start
    safePlay(audio.freespins);
  }

  unlockMilestonesIfNeeded();

  renderGrid(grid);
  renderHud();

  const winText = r.totalWin > 0 ? `win: ${r.totalWin}` : "no win";
  const lightText = r.gainedLight ? " +1 light" : "";
  const fsText = r.triggerFS ? " → FREE SPINS!" : "";
  log(`${winText}${lightText}${fsText}`);

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

// UI events
elBet.addEventListener("input", async () => {
  state.bet = Number(elBet.value);
  renderHud();
  await persist();
});

btnBetDown.addEventListener("click", async ()=> {
  state.bet = clamp(state.bet - 1, 1, 50);
  renderHud();
  await persist();
});
btnBetUp.addEventListener("click", async ()=> {
  state.bet = clamp(state.bet + 1, 1, 50);
  renderHud();
  await persist();
});

btnSpin.addEventListener("click", spin);

btnReset.addEventListener("click", async ()=> {
  state = defaultState();
  renderGrid(genGrid());
  renderHud();
  log("reset done.");
  await persist();
});

btnMute.addEventListener("click", toggleMute);

// init
(async function init(){
  log("connecting…");
  status("connecting…");

  const user = await getOrCreateUser();
  uid = user.uid;

  const saved = await loadGame(uid);
  if (saved){
    state = { ...defaultState(), ...saved };
  } else {
    await persist();
  }

  renderGrid(state.lastGrid || genGrid());
  renderHud();

  log("ready. spin when you want.");
  status("ready ✅");
})();

