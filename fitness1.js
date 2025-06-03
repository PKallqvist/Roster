function isGoalie(player) {
  return player === players[0] || player === players[1] || player === players[2];
}

function isSwapPatternAllowed(prev, curr) {
    const prevGoalie = prev[0];
    const currGoalie = curr[0];
    const goalieChanged = prevGoalie !== currGoalie;
    const goalieMovedOut = curr.includes(prevGoalie); // old goalie still on field
    const goalieReplacementIsSub = isSubPosition(positions[0]);

    // Count unchanged field players (positions 1–4)
    let stableCount = 0;
    for (let i = 1; i <= 4; i++) {
        if (prev[i] === curr[i]) stableCount++;
    }
    const fieldSwaps = 4 - stableCount;


    if (goalieChanged) {
        return (
            (!goalieMovedOut && goalieReplacementIsSub && fieldSwaps === 2) || // Case 1
            (goalieMovedOut && goalieReplacementIsSub && fieldSwaps === 1) ||  // Case 2
            (goalieMovedOut && !goalieReplacementIsSub && fieldSwaps === 1) || // Case 3
            (goalieMovedOut && !goalieReplacementIsSub && fieldSwaps === 2)    // Case 4
        );
    } else {
        // Goalie didn't change → allow if 2+ field players stayed
        return stableCount >= 2;
    }
}

function fitness1(state) {
    const playCounts = {};
    const posHistory = {};
    let penalty = 0;

    // Count how many subs are used based on total players
    const nrSubs = players.length - 5;  // 5 field positions
    const targetPlaytime = (phases * 5) / players.length; // Expected play time
    const phasesPerPeriod = phases / 3;
    // const goaliePhaseTime = Math.floor(targetPlaytime / 3) / phasesPerPeriod;
    const goaliePhaseTime = targetPlaytime / 3 / phasesPerPeriod;

    // Init tracking
    for (const p of players) {
        playCounts[p] = 0;
        posHistory[p] = [];
    }

    // Phase loop: accumulate playCounts and position history
    for (let phase = 0; phase < phases; phase++) {
        const currentPlayers = [];

        for (let pos = 0; pos < positions.length; pos++) {
            const player = state[phase][pos];
            const isSub = isSubPosition(positions[pos]);

            if (!isSub) {
                if (pos === 0) {
                    // Rule: goalie only gets partial credit per phase
                    playCounts[player] += goaliePhaseTime;
                } else {
                    playCounts[player] += 1;
                }
            }

            posHistory[player].push(positions[pos]);
            currentPlayers.push(player);
        }

        if (phase > 0) {
            const prev = state[phase - 1];
            const curr = state[phase];
            let stableCount = 0;
            const goalieChanged = prev[0] !== curr[0]; // goalie is index 0

            // // Rule 1: Penalize instability if goalie hasn’t changed
            // for (let i = 1; i <= 4; i++) {
            // 	if (prev[i] === curr[i]) stableCount++;
            // }

            // if (goalieChanged) {
            // 	if (stableCount < 1) {
            // 		penalty += (1 - stableCount) * 10;
            // 	}
            // } else {
            // 	if (stableCount < 2) {
            // 		penalty += (2 - stableCount) * 20;
            // 	}
            // }
            if (!isSwapPatternAllowed(prev, curr)) {
                penalty += 10; // or tweak weight
            }
            // console.log("Penalty pos 1: ", penalty);

            // Rule 2: Penalize deviation from 2 substitutions per phase
            const prevPlayers = new Set(prev.slice(1, 5));  // Exclude goalie at 0 and subs
            const currPlayers = new Set(curr.slice(1, 5));
            let changes = 0;
            for (const p of currPlayers) {
                if (!prevPlayers.has(p)) changes++;
            }
            const subCount = changes;
            penalty += 2 * Math.pow(subCount - 2, 2);

            if (subCount === 2) {
                penalty -= 3; // reward for hitting the sweet spot
            }
            //console.log("subCount pos 2: ", subCount);
        }

    }
    // let lastSwap = 0;
    // // Rule X: Penalize every player swap per position across all phases
    // for (let pos = 0; pos < positions.length; pos++) {
    // 	for (let phase = 1; phase < phases; phase++) {
    // 		if (state[phase][pos] !== state[phase - 1][pos]) {
    // 			penalty += 2 + lastSwap;
    // 			lastSwap += 2;
    // 		} else {
    // 			lastSwap = 0;
    // 		}
    // 	}
    // }
    // console.log("Penalty pos 3: ", penalty);
    // Rule X: Penalize sub time imbalance
    const subCounts = players.map(p => posHistory[p].filter(isSubPosition).length);
    const maxSubs = Math.max(...subCounts);
    const minSubs = Math.min(...subCounts);
    penalty += (maxSubs - minSubs) * 10;

    // Player loop: apply penalties and rewards
    for (const p of players) {
        const history = posHistory[p];
        const subs = history.filter(isSubPosition).length;

        // Rule 4: Penalize consecutive SUBs
        let subPen = 0;
        let subPenCost = nrSubs < 3 ? 8 : 3;

        for (let i = 1; i < history.length; i++) {
            if (isSubPosition(history[i]) && isSubPosition(history[i - 1])) {
                subPen += subPen * 2 + subPenCost;
            }
        }
        penalty += subPen

        // Rule 6: Penalize 3+ consecutive same position
        let runLength = 1;
        const posCounts = {};

        for (let i = 0; i < history.length; i++) {
            const pos = history[i];
            posCounts[pos] = (posCounts[pos] || 0) + 1;

            if (i > 0 && pos === history[i - 1]) {
                runLength++;
                if (runLength >= 3) penalty += 5;
            } else {
                runLength = 1;
            }
        }

        // Rule 6b: Penalize deviation from 2 uses per non-goalie, non-sub position
        for (const pos in posCounts) {
            if (!isSubPosition(pos) && pos !== 'G') {
                const delta = 2 * (posCounts[pos] - 2);
                penalty += delta * delta;
            }
        }

        // Rule 7: Goalies - discourage >1 sub (low priority for now)
        if (isGoalie(p) && subs > 1) {
            // Currently zero penalty (disabled logic)
            // penalty += Math.pow(subs - 1, 2) * 5;
        }


        // Rule 5: Fair playtime for all players
        const time = playCounts[p];
        const dist = time - targetPlaytime;
        penalty += 4 * dist * dist;

        // Rule 8: Reward position variety
        const uniqueCount = new Set(history.filter(h => !isSubPosition(h))).size;
        penalty -= uniqueCount * 2;
        // console.log("Penalty pos 4: ", penalty);
        // Rule 9: Encourage 2-phase consistency
        for (let i = 1; i < history.length; i++) {
            const prev = history[i - 1];
            const curr = history[i];
            if (!isSubPosition(prev) && !isSubPosition(curr)) {
                if (curr === prev) penalty -= 1;
                else penalty += 2;
            }
        }
    }

    return penalty;
}