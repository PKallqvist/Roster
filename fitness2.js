// Constants (update based on your context)

// const basePositions = ['G', 'D', 'LW', 'RW', 'F'];
const outfieldStart = 1; // index for D
const outfieldEnd = 5;   // index after F
const basePositions = ['G', 'D', 'LW', 'RW', 'F'];
let players= [];
let positions = [];


// main fitness function
export function fitness2(state, all_players, all_positions) {
	players = all_players;
	positions = all_positions;
	let weights = {
		playtime: 5,
		stability: 8,
		consistency: 4,
		diversity: 2,
		diversityFairness: 3,
		consecSubs: 6,
		subFairness: 12
	};

	weights = {
		playtime: 1,    // High value - optimise around equal playtime
		stability: 0,
		consistency: 20,
		diversity: 1,
		diversityFairness: 0,
		consecSubs: 0,
		subFairness: 1  // High value - weight * Abs(max - min)
	};

	weights = {
		playtime: 1000,    // High value - optimise around equal playtime
		stability: 8,
		consistency: 20,
		diversity: 5,
		diversityFairness: 3,
		consecSubs: 10,
		subFairness: 1000  // High value - weight * Abs(max - min)
	};


	let score = 0;
	score += weights.playtime * ruleEqualPlaytime(state);
	score += weights.stability * ruleOutfieldSwapStability(state);  // 
	score += weights.consistency * ruleOutfieldConsistency(state);  // Per position, Same player two phases
	score += weights.diversity * rulePositionDiversity(state);
	score += weights.diversityFairness * rulePositionDiversityFairness(state);
	score += weights.consecSubs * ruleConsecutiveSubs(state);
	score += weights.subFairness * ruleSubFairness(state);

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

// Rule 2: Stability — outfield swaps per phase
function ruleOutfieldSwapStability(state) {
	let penalty = 0;

	const contribution = [-1, -3, 3, 2];

	for (let phase = 1; phase < state.length; phase++) {
		let phasePenalty = 2;
		let contributionCount = 0;

		for (let pos = outfieldStart; pos < outfieldEnd; pos++) {
			const prevRow = state[phase - 1];
			const currRow = state[phase];

			const prevPlayer = prevRow[pos];
			const currPlayer = currRow[pos];

			if (prevPlayer !== currPlayer) {
				// Determine where currPlayer was in the previous phase
				const prevIndex = prevRow.indexOf(currPlayer);

				if (prevIndex === 0 || prevIndex >= outfieldEnd) {
					// From goalie or sub
					if (contributionCount < contribution.length) {
						phasePenalty += contribution[contributionCount];
					}
					contributionCount++;
				} else {
					// From another outfield position → bad switch
					phasePenalty += 1;
				}
			}
		}

		penalty += phasePenalty;
	}

	return penalty;
}


// Rule 3: Penalize streaks in outfield positions that are not exactly 2 phases long
function ruleOutfieldConsistency(state) {
	let penalty = 0;
	let swapCount=1;

	for (let pos = outfieldStart; pos < outfieldEnd; pos++) {
		let streak = 1;

		for (let phase = 1; phase < state.length; phase++) {
			const prev = state[phase - 1][pos];
			const curr = state[phase][pos];

			if (prev === curr) {
				streak++;
				swapCount=1;
			} else {

				penalty += swapCount * Math.abs(streak - 2);
				swapCount += 2;
				streak = 1;
			}
		}
		// Handle end of streak at final phase
		penalty += Math.abs(streak - 2);
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

