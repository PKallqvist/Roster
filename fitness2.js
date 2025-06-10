// Constants (update based on your context)

// const basePositions = ['G', 'D', 'LW', 'RW', 'F'];
const outfieldStart = 1; // index for D
const outfieldEnd = 5;   // index after F
const basePositions = ['G', 'D', 'LW', 'RW', 'F'];
let players= [];
let positions = [];
let preferences = {};


export function setPlayerPreferences(prefData) {
  preferences = prefData;
  //console.log(preferences);
}

export function setPlayers(playerData) {
  players = playerData;
}


// main fitness function
export function fitness2(state) {

	let weights = {
		playtime: 1000,    // High value - optimise around equal playtime
		stability: 8,
		consistency: 20,
		diversity: 5,
		diversityFairness: 4,
		consecSubs: 10,
		subFairness: 1000,  // High value - weight * Abs(max - min)
		preferedPosition: 1,
		inPeriodSwapPenalty: 4 
	};

	weights = {
		playtime: 100,    // High value - optimise around equal playtime
		stability: 1,
		consistency: 5,
		diversity: 5,
		diversityFairness: 2,
		consecSubs: 1,
		subFairness: 5,  // High value - weight * Abs(max - min)
		preferedPosition: 2,
		inPeriodSwapPenalty: 10
	};


	let score = 0;
	//console.log("score so far:", score);
	score += weights.playtime * ruleEqualPlaytime(state);
	score += weights.stability * ruleOutfieldSwapStability(state);  // 2 changes in the outfield per phase
	score += weights.consistency * ruleOutfieldBlockConsistency(state , 2);  // Seek to maintain same position two phases
	score += weights.diversity * rulePositionDiversity(state);
	score += weights.diversityFairness * rulePositionDiversityFairness(state);
	score += weights.consecSubs * ruleConsecutiveSubs(state);
	score += weights.subFairness * ruleSubFairness(state);
	score += weights.inPeriodSwapPenalty * ruleInPeriodOutfieldPositionSwitch(state);
	
	//console.log("score so far:", score);
	score += weights.preferedPosition * rulePositionPreferenceMatch(state);
	//console.log("score complete:", score);
	return score;
}



// Rule 1: Equal playtime
function ruleEqualPlaytime(state) {
	const phaseCount = state.length;
	const playCounts = {};

	for (const p of players) {
		playCounts[p] = 0;
	}
	// console.log(positions);
	const expectedPerPhase = (basePositions.length / players.length);
	const goaliePhaseValue = expectedPerPhase;

	for (let phase = 0; phase < phaseCount; phase++) {
		for (let pos = 0; pos < basePositions.length; pos++) {
			const player = state[phase][pos];
			if (basePositions[pos] === 'G') {
				playCounts[player] += goaliePhaseValue;
			} else {
				playCounts[player] += 1;
			}
		}
	}

	const playTimes = Object.values(playCounts);
	const maxTime = Math.max(...playTimes);
	const minTime = Math.min(...playTimes);
	return maxTime - minTime;
}

function ruleOutfieldSwapStability(state) {
	const outfieldStart = 1; // Assuming 0 = goalie
	const outfieldEnd = 5;   // Excludes subs

	const idealSwaps = Math.min(players.length - basePositions.length, 2); // 1 sub → 1 ideal swap, 2+ subs → 2
	
	let penalty = 0;

	for (let phase = 1; phase < state.length; phase++) {
		const prevRow = state[phase - 1];
		const currRow = state[phase];

		let swapCount = 0;

		for (let pos = outfieldStart; pos < outfieldEnd; pos++) {
			if (prevRow[pos] !== currRow[pos]) {
				swapCount++;
			}
		}

		const deviation = Math.abs(swapCount - idealSwaps);
		penalty += deviation * deviation; // Quadratic penalty
	}
	//console.log(idealSwaps, penalty);
	return penalty;
}



// Rule 3: Penalize streaks in outfield positions that are not exactly 2 phases long
function ruleOutfieldBlockConsistency(state, ideallength = 2) {
	let penalty = 0;

	for (let pos = outfieldStart; pos < outfieldEnd; pos++) {
		let streak = 1;

		for (let phase = 1; phase < state.length; phase++) {
			const prev = state[phase - 1][pos];
			const curr = state[phase][pos];

			if (curr === prev) {
				streak++;
			} else {
				penalty += Math.abs(streak - ideallength); // ideal streak is 2
				streak = 1;
			}
		}

		// End-of-state handling
		penalty += Math.abs(streak - ideallength);
	}

	return penalty;
}

// Rule 4: Reward diversity in positions (excluding goalie and subs)
function rulePositionDiversity(state) {
	const playerPositions = {};
	for (const row of state) {
		row.forEach((player, i) => {
			if (i < outfieldEnd && !playerPositions[player]) {
				playerPositions[player] = new Set();
			}
			if (i < outfieldEnd) {
				playerPositions[player].add(i);  // using position index as identifier
			}
		});
	}

	let reward = 0;
	for (const player in playerPositions) {
		reward += playerPositions[player].size;
	}

	return -reward; // negative because more diversity is better
}

// Rule 5: Penalize uneven diversity (spread in distinct positions per player)
function rulePositionDiversityFairness(state) {
	const diversityCounts = {};
	for (const row of state) {
		row.forEach((player, i) => {
			if (i < outfieldEnd) {
				if (!diversityCounts[player]) diversityCounts[player] = new Set();
				diversityCounts[player].add(i); // use position index
			}
		});
	}

	const counts = Object.values(diversityCounts).map(set => set.size);
	const max = Math.max(...counts);
	const min = Math.min(...counts);
	const spread = max - min;

	return spread; // Higher spread = worse → positive penalty
}

function ruleConsecutiveSubs(state) {
	const subStart = outfieldEnd;
	let penalty = 0;

	// Track each player's history of positions
	const history = {};
	for (let phase = 0; phase < state.length; phase++) {
		for (let i = 0; i < state[phase].length; i++) {
			const player = state[phase][i];
			if (!history[player]) history[player] = [];
			history[player].push(i >= subStart ? 'SUB' : 'FIELD');
		}
	}

	// Penalize sub streaks
	for (const player in history) {
		const posList = history[player];
		let subStreak = 0;

		for (let i = 0; i < posList.length; i++) {
			if (posList[i] === 'SUB') {
				subStreak++;
			} else {
				if (subStreak >= 2) {
					penalty += Math.pow(subStreak, 2); // e.g. 4 for 2, 9 for 3, 16 for 4
				}
				subStreak = 0;
			}
		}

		// Final check in case the last phases ended on a sub streak
		if (subStreak >= 2) {
			penalty += Math.pow(subStreak, 2);
		}
	}

	return penalty;
}


function ruleSubFairness(state) {
	const subCounts = {};

	// Initialize all players with 0
	for (const p of players) {
		subCounts[p] = 0;
	}

	for (let phase = 0; phase < state.length; phase++) {
		for (let i = outfieldEnd; i < state[phase].length; i++) {
			const player = state[phase][i];
			subCounts[player]++;
		}
	}

	const counts = Object.values(subCounts);
	const spread = Math.max(...counts) - Math.min(...counts);
	return spread;
}

function rulePositionPreferenceMatch(state) {
	let score = 0;
	for (let phase = 0; phase < state.length; phase++) {
		for (let pos = 0; pos < basePositions.length; pos++) {
			const player = state[phase][pos];
			if (preferences[player] && preferences[player][basePositions[pos]] !== undefined) {
				score += preferences[player][basePositions[pos]];
			}
		}
	}
	return -score; // more preference match = better = lower fitness
}

// Avoid players switching positions mid period
function ruleInPeriodOutfieldPositionSwitch(state) {
	const totalPhases = state.length;
	const phasesPerPeriod = Math.floor(totalPhases / 3);
	let penalty = 0;

	for (let phase = 1; phase < totalPhases; phase++) {
		const isPeriodBoundary = phase % phasesPerPeriod === 0;
		if (isPeriodBoundary) continue;

		const prevRow = state[phase - 1];
		const currRow = state[phase];

		// For each player in the current phase
		for (let i = outfieldStart; i < outfieldEnd; i++) {
			const player = currRow[i];

			// Find previous position (if any)
			const prevPos = prevRow.indexOf(player);

			// If player existed in prev and has changed outfield position → penalize
			if (
				prevPos >= outfieldStart &&
				prevPos < outfieldEnd && // must have been in outfield
				prevPos !== i            // changed outfield position
			) {
				penalty++;
			}
		}
	}

	return penalty;
}

