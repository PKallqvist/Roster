// app.js - core logic for SA Roster Scheduler

let players = [];
const basePositions = ['G', 'D', 'LW', 'RW', 'F'];
let nrSubs = 0;
let subs = [];
let positions = [];
let phasesPerPeriod = 2;
let phases = phasesPerPeriod * 3;
let currentSchedule = null;

function isSubPosition(pos) {
  return pos.startsWith("SUB");
}

function isGoalie(player) {
  return player === players[0] || player === players[1] || player === players[2];
}

function updatePlayers() {
  const input = document.getElementById("playerInput").value;
  players = input.split(/[\n,]+/).map(p => p.trim()).filter(p => p);

  nrSubs = players.length - 5;
  subs = Array.from({ length: nrSubs }, (_, i) => `SUB${i + 1}`);
  positions = basePositions.concat(subs);
}

function updatePhases() {
  phasesPerPeriod = parseInt(document.getElementById("phasesPerPeriod").value, 10);
  phases = phasesPerPeriod * 3;
//   console.log('Phases updated to:', phases);
}

function generateInitialState() {
  const state = [];
  for (let i = 0; i < phases; i++) {
    const phasePlayers = [...players].sort(() => Math.random() - 0.5);
    state.push(phasePlayers);
  }
  return state;
}

function applyGoalieLocks(state) {
  for (let phase = 0; phase < state.length; phase++) {
    const periodIndex = Math.floor(phase / phasesPerPeriod);
    const goalie = players[periodIndex % 3]; // Rotate among first 3 players
    const filtered = state[phase].filter(p => p !== goalie);
    state[phase] = [goalie, ...filtered];
  }
}

function getNeighbor(state) {
  const newState = JSON.parse(JSON.stringify(state));
  const phase = Math.floor(Math.random() * phases);
  let i = Math.floor(Math.random() * players.length);
  let j = Math.floor(Math.random() * players.length);
  while (j === i) j = Math.floor(Math.random() * players.length);
  if (i === 0 || j === 0) return newState; // avoid goalie swapping here
  [newState[phase][i], newState[phase][j]] = [newState[phase][j], newState[phase][i]];
  return newState;
}

function optimizeSchedule(initialState, iterations = 5000, temp = 1000, alpha = 0.98) {
  let current = initialState;
  applyGoalieLocks(current);
  let best = JSON.parse(JSON.stringify(current));
  let bestScore = fitness(current);
  let T = temp;

  while (T > 1e-3 && iterations-- > 0) {
    const neighbor = getNeighbor(current);
    applyGoalieLocks(neighbor);
    const delta = fitness(neighbor) - fitness(current);
    if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
      current = neighbor;
      const score = fitness(current);
      if (score < bestScore) {
        best = JSON.parse(JSON.stringify(neighbor));
        bestScore = score;
      }
    }
    T *= alpha;
  }

  return best;
}
