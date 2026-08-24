// ============================================================================
// ui.js — HUD, upgrade/weapon menus, tree panel, leaderboard.
// ============================================================================

const UI = {
    wave: document.getElementById('wave'),
    score: document.getElementById('score'),
    kills: document.getElementById('kills'),
    healthBar: document.getElementById('healthBar'),
    dmgMod: document.getElementById('dmgMod'),
    weaponDisplay: document.getElementById('weaponDisplay'),
    weaponName: document.getElementById('weaponName'),
    modeDisplay: document.getElementById('modeDisplay'),
};

function updateUI() {
    UI.wave.textContent = game.wave;
    UI.score.textContent = game.score;
    UI.kills.textContent = game.kills;
    UI.healthBar.style.width = Math.max(0, player.health / player.maxHealth * 100) + '%';
    UI.dmgMod.textContent = 'x' + (player.damage / BASE_DAMAGE_START).toFixed(2);
    if (weaponSelected && activeWeapon.id !== 'pistol' && !player.hasSword && !player.permanentStaff) {
        UI.weaponDisplay.style.display = '';
        UI.weaponName.textContent = activeWeapon.name;
    } else {
        UI.weaponDisplay.style.display = 'none';
    }
    let mode = '';
    if (player.permanentStaff) mode = '☠ NECROMANCER [HOLD: CHARGE]';
    else if (player.hasSword) {
        mode = (player.swordOnFire ? '⚔🔥 BLAZING SWORD' : '⚔ SWORD MODE')
            + (player.swordWhirlwind ? ' · WHIRL ' + Math.ceil(player.whirlwindTimer / 60) + 's' : '');
    } else if (player.theWall) {
        mode = '🛡 BASTION ' + Math.floor(player.bastionMeter) + '%' + (player.turretStance ? ' · TURRET STANCE' : '');
    } else if (player.deadeyeAwakened) {
        mode = player.focusTimer > 0 ? '◎ FOCUS ACTIVE' : '◎ FOCUS ' + Math.floor(player.focusMeter) + '%' + (player.focusMeter >= 100 ? ' [SPACE]' : '');
    } else if (player.warhead) {
        mode = '💥 AIRSTRIKE ' + Math.ceil(player.airstrikeTimer / 60) + 's';
    } else if (player.puppetmaster) {
        mode = '🕷 VIRUS ' + (player.virusCooldown > 0 ? Math.ceil(player.virusCooldown / 60) + 's' : 'READY [SPACE]')
            + (player.permanentThralls > 0 ? ' · PUPPETS: ' + player.permanentThralls : '');
    } else if (minions.length > 0) {
        mode = 'THRALLS: ' + minions.length;
    }
    UI.modeDisplay.textContent = mode;
}

// --- Upgrade bookkeeping ----------------------------------------------------

function levelOf(id) { return player.skillLevels[id] || 0; }
function getChosenTree() { return player.chosenTree || 'NONE'; }

function picksInTree(tree) {
    return upgrades.filter(u => u.tree === tree).reduce((sum, u) => sum + levelOf(u.id), 0);
}

function lockOpposingTrees(tree) {
    if (tree === 'UNIVERSAL') return;
    const levelsInTree = picksInTree(tree);
    if (levelsInTree >= SPECIALIZATION_THRESHOLD && !player.chosenTree) {
        player.chosenTree = tree;
        player.lockedTrees = treeNames.filter(t => t !== tree);
        // Specialization awakening: the tree's signature mechanic unlocks
        const awakening = AWAKENINGS[tree];
        if (awakening) {
            awakening.apply();
            showAwakening(awakening.title, awakening.lines);
            sfx('awaken');
        }
    }
}

function branchName(tree, branch) {
    if (!branch || branch === 'ROOT') return 'ROOT';
    return (BRANCH_NAMES[tree] && BRANCH_NAMES[tree][branch]) || branch;
}

function branchLockedByChoice(u) {
    if (!u.branch || u.branch === 'ROOT' || u.tree === 'UNIVERSAL') return false;
    const chosen = player.chosenBranches[u.tree];
    return chosen && chosen !== u.branch;
}

function isUpgradeAvailable(u) {
    if (player.lockedTrees.includes(u.tree)) return false;
    if (branchLockedByChoice(u)) return false;
    if (levelOf(u.id) >= u.max) return false;
    if (u.requires && levelOf(u.requires) <= 0) return false;
    return true;
}

function chooseUpgrade(upgrade) {
    if (!isUpgradeAvailable(upgrade)) return;
    if (upgrade.branch && upgrade.branch !== 'ROOT' && upgrade.tree !== 'UNIVERSAL' && !player.chosenBranches[upgrade.tree]) {
        player.chosenBranches[upgrade.tree] = upgrade.branch;
    }
    player.skillLevels[upgrade.id] = levelOf(upgrade.id) + 1;
    lockOpposingTrees(upgrade.tree);
    upgrade.apply();
    // TRUE AWAKENING: finishing a branch's capstone (final ALL-CAPS) node
    // fires a second, quieter power spike on top of its own effect.
    const trueAwakening = TRUE_AWAKENINGS[upgrade.id];
    if (trueAwakening && !player.trueAwakened) {
        player.trueAwakened = upgrade.id;
        trueAwakening.apply();
        showAwakening(trueAwakening.title, trueAwakening.lines);
        sfx('awaken');
    }
    player.bulletSize = Math.min(player.bulletSize, MAX_BULLET_SIZE);
    player.fireRate = Math.max(player.fireRate, MIN_FIRE_RATE);
    advanceWave();
}

function advanceWave() {
    document.getElementById('upgradeMenu').classList.add('hidden');
    game.wave++;
    game.state = 'playing';
    spawnWave();
    sfx('waveStart');
}

// --- Leaderboard ------------------------------------------------------------

function loadLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]'); }
    catch { return []; }
}

function saveLeaderboard(entries) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries.slice(0, 10)));
}

function renderLeaderboard(targetId) {
    const panel = document.getElementById(targetId);
    if (!panel) return;
    const entries = loadLeaderboard();
    panel.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = 'LOCAL HIGH SCORES';
    panel.appendChild(h);
    if (!entries.length) {
        const d = document.createElement('div');
        d.textContent = 'No scores yet.';
        panel.appendChild(d);
        return;
    }
    entries.forEach((e, i) => {
        const d = document.createElement('div');
        // V1 entries lack weapon/tree — render what exists
        const extra = (e.weapon ? ' ' + e.weapon : '') + (e.tree ? ' · ' + e.tree : '');
        d.textContent = (i + 1) + '. ' + e.name + ' — ' + e.score + ' pts · W' + e.wave + extra;
        panel.appendChild(d);
    });
}

function submitHighScore() {
    const input = document.getElementById('scoreNameInput');
    const raw = (input ? input.value : 'LARRY').trim().toUpperCase();
    const name = (raw || 'LARRY').replace(/[^A-Z0-9 _-]/g, '').slice(0, 12) || 'LARRY';
    const entries = loadLeaderboard();
    const weaponTag = player.hasSword ? '⚔' : player.permanentStaff ? '☠' : activeWeapon.emoji;
    entries.push({
        name, score: game.score, wave: game.wave, kills: game.kills,
        weapon: weaponTag, tree: player.chosenTree || '',
        date: new Date().toLocaleDateString()
    });
    entries.sort((a, b) => b.score - a.score || b.wave - a.wave || b.kills - a.kills);
    saveLeaderboard(entries);
    document.getElementById('highScoreEntry').classList.add('hidden');
    renderLeaderboard('leaderboardGameOver');
}

// --- Upgrade menu -----------------------------------------------------------

function renderTreeStatus() {
    const panel = document.getElementById('treeStatus');
    panel.innerHTML = '';
    treeNames.forEach(t => {
        const picks = picksInTree(t);
        const isChosen = player.chosenTree === t;
        const isLocked = player.lockedTrees.includes(t);
        const willTrigger = !player.chosenTree && picks >= SPECIALIZATION_THRESHOLD - 1 && picks < SPECIALIZATION_THRESHOLD;
        const chosenBranch = player.chosenBranches[t] ? ' · ' + branchName(t, player.chosenBranches[t]) : '';
        let cls = 'tree-pill';
        let suffix = '';
        if (isChosen) { cls += ' chosen'; suffix = ' ★ SPECIALIZED'; }
        else if (isLocked) { cls += ' locked'; suffix = ' LOCKED'; }
        else if (willTrigger) { cls += ' warn'; suffix = ' ⚠ NEXT PICK LOCKS OTHERS'; }
        const pill = document.createElement('span');
        pill.className = cls;
        pill.innerHTML = t + chosenBranch + ' <span class="pill-count">' + picks + '/' + SPECIALIZATION_THRESHOLD + '</span>' + suffix;
        panel.appendChild(pill);
    });
    const uniPicks = picksInTree('UNIVERSAL');
    const uniPill = document.createElement('span');
    uniPill.className = 'tree-pill';
    uniPill.style.borderColor = '#9ca3af';
    uniPill.style.color = '#9ca3af';
    uniPill.innerHTML = 'UNIVERSAL <span class="pill-count">' + uniPicks + '</span> · never locks';
    panel.appendChild(uniPill);
}

function renderUpgradeTree() {
    const panel = document.getElementById('upgradeTreePanel');
    if (!panel) return;
    panel.innerHTML = '';
    [...treeNames, 'UNIVERSAL'].forEach(tree => {
        const block = document.createElement('div');
        block.className = 'tree-block';
        const chosenBranch = player.chosenBranches[tree] ? ' · chosen: ' + branchName(tree, player.chosenBranches[tree]) : '';
        block.innerHTML = '<div class="tree-title">' + tree + chosenBranch + '</div>';
        const roots = upgrades.filter(u => u.tree === tree && (!u.branch || u.branch === 'ROOT'));
        const rootLine = document.createElement('div');
        rootLine.className = 'branch-line';
        rootLine.innerHTML = 'ROOT: ' + (roots.map(renderUpgradeNode).join(' → ') || '—');
        block.appendChild(rootLine);
        ['A', 'B'].forEach(branch => {
            const list = upgrades.filter(u => u.tree === tree && u.branch === branch);
            if (!list.length) return;
            const line = document.createElement('div');
            line.className = 'branch-line' + (player.chosenBranches[tree] === branch ? ' branch-chosen' : '');
            line.innerHTML = branchName(tree, branch) + ': ' + list.map(renderUpgradeNode).join(' → ');
            block.appendChild(line);
        });
        panel.appendChild(block);
    });
}

function renderUpgradeNode(u) {
    const owned = levelOf(u.id) >= u.max;
    const open = isUpgradeAvailable(u);
    const cls = owned ? 'node-owned' : open ? 'node-open' : 'node-locked';
    return '<span class="' + cls + '">' + u.name + ' ' + levelOf(u.id) + '/' + u.max + '</span>';
}

function showFallbackRewards(options) {
    const healCard = document.createElement('div');
    healCard.className = 'upgrade-card';
    healCard.innerHTML = `<span class="tree-tag">SUPPLY DROP</span><h3>FIELD MEDIC</h3><p>Heal 25% of max HP.</p>`;
    healCard.addEventListener('click', () => chooseReward('heal'));
    options.appendChild(healCard);
    const scoreCard = document.createElement('div');
    scoreCard.className = 'upgrade-card';
    scoreCard.innerHTML = `<span class="tree-tag">SUPPLY DROP</span><h3>INTEL CACHE</h3><p>Gain 500 points.</p>`;
    scoreCard.addEventListener('click', () => chooseReward('score'));
    options.appendChild(scoreCard);
}

function chooseReward(type) {
    if (type === 'heal') player.health = Math.min(player.maxHealth, player.health + player.maxHealth * 0.25);
    if (type === 'score') game.score += 500;
    advanceWave();
}

function showUpgradeMenu() {
    const menu = document.getElementById('upgradeMenu');
    const options = document.getElementById('upgradeOptions');
    const specHint = document.getElementById('specHint');
    options.innerHTML = '';
    renderTreeStatus();
    renderUpgradeTree();

    if (player.chosenTree) {
        specHint.innerHTML = `Specialized in <b style="color:#facc15;">${player.chosenTree}</b>. All other main trees are permanently locked. UNIVERSAL upgrades remain available.`;
    } else {
        specHint.innerHTML = `Pick <b>${SPECIALIZATION_THRESHOLD}</b> upgrades from the same main tree to specialize. Doing so <b style="color:#ff0041;">permanently locks</b> the other main trees. UNIVERSAL upgrades never trigger this.`;
    }

    const available = upgrades.filter(isUpgradeAvailable);
    const locked = upgrades.filter(u => !isUpgradeAvailable(u) && levelOf(u.id) < u.max).slice(0, 2);
    // Show variety: pick at most 1-2 cards per tree so all available paths are visible
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const choices = [];
    const treeCount = {};
    for (const u of shuffled) {
        if ((treeCount[u.tree] || 0) >= (player.chosenTree ? 2 : 1)) continue;
        choices.push(u);
        treeCount[u.tree] = (treeCount[u.tree] || 0) + 1;
        if (choices.length >= 4) break;
    }
    if (choices.length < 4) {
        for (const u of shuffled) {
            if (choices.includes(u)) continue;
            choices.push(u);
            if (choices.length >= 4) break;
        }
    }
    if (available.length === 0) {
        menu.querySelector('p').innerHTML = `Wave ${game.wave} survived! No upgrades remain because your path is complete or locked out. Choose a supply reward.`;
        showFallbackRewards(options);
        menu.classList.remove('hidden');
        return;
    }
    if (choices.length < 4) choices.push(...locked.slice(0, 4 - choices.length));
    choices.forEach(upgrade => {
        const usable = isUpgradeAvailable(upgrade);
        const lockedReason = player.lockedTrees.includes(upgrade.tree)
            ? `LOCKED — ${getChosenTree()} specialization closed this tree.`
            : (branchLockedByChoice(upgrade)
                ? `LOCKED — you chose the ${branchName(upgrade.tree, player.chosenBranches[upgrade.tree])} branch.`
                : (upgrade.requires && levelOf(upgrade.requires) <= 0
                    ? `LOCKED — requires earlier skill in ${upgrade.tree} tree.`
                    : 'LOCKED — already maxed.'));

        let warningHTML = '';
        if (usable && upgrade.tree !== 'UNIVERSAL' && !player.chosenTree) {
            const currentPicks = picksInTree(upgrade.tree);
            const afterPicks = currentPicks + 1;
            if (afterPicks >= SPECIALIZATION_THRESHOLD) {
                const others = treeNames.filter(t => t !== upgrade.tree).join(', ');
                warningHTML = `<div class="lock-warning danger">⚠ PICKING THIS LOCKS: ${others}</div>`;
            } else {
                const remaining = SPECIALIZATION_THRESHOLD - afterPicks;
                warningHTML = `<div class="lock-progress">${upgrade.tree}: ${currentPicks} → ${afterPicks}/${SPECIALIZATION_THRESHOLD} · ${remaining} more pick${remaining === 1 ? '' : 's'} in this tree locks others</div>`;
            }
        }
        if (usable && upgrade.branch && upgrade.branch !== 'ROOT' && upgrade.tree !== 'UNIVERSAL' && !player.chosenBranches[upgrade.tree]) {
            warningHTML += `<div class="lock-warning">Branch choice: ${branchName(upgrade.tree, upgrade.branch)} locks the other branch in this tree.</div>`;
        } else if (usable && upgrade.branch && upgrade.branch !== 'ROOT' && player.chosenBranches[upgrade.tree] === upgrade.branch) {
            warningHTML += `<div class="lock-progress">Continuing ${branchName(upgrade.tree, upgrade.branch)} branch.</div>`;
        } else if (usable && upgrade.tree === 'UNIVERSAL') {
            warningHTML = `<div class="lock-progress">Universal — does not affect tree locking.</div>`;
        } else if (usable && player.chosenTree) {
            warningHTML = `<div class="lock-progress">In your chosen tree — safe to take.</div>`;
        }

        const card = document.createElement('div');
        card.className = 'upgrade-card' + (usable ? '' : ' locked');
        const branchLabel = upgrade.branch && upgrade.branch !== 'ROOT' ? ' · ' + branchName(upgrade.tree, upgrade.branch) : '';
        card.innerHTML = `<span class="tree-tag">${upgrade.tree}${branchLabel} ${levelOf(upgrade.id)}/${upgrade.max}</span><h3>${upgrade.name}</h3><p>${upgrade.desc}</p>${usable ? warningHTML : `<div class="lock-text">${lockedReason}</div>`}`;
        if (usable) {
            card.addEventListener('click', () => chooseUpgrade(upgrade));
        }
        options.appendChild(card);
    });
    menu.querySelector('p').innerHTML = `Wave ${game.wave} survived! ${player.chosenTree ? 'Specialized path: ' + player.chosenTree + '.' : 'Choose carefully — 4 picks in one main tree locks the others.'}`;
    menu.classList.remove('hidden');
}

// --- Weapon menu ------------------------------------------------------------

function showWeaponMenu() {
    const menu = document.getElementById('weaponMenu');
    const options = document.getElementById('weaponOptions');
    options.innerHTML = '';
    WEAPONS.forEach(w => {
        const card = document.createElement('div');
        card.className = 'weapon-card';
        card.innerHTML = `
            <span class="wtag">${w.emoji} WEAPON</span>
            <h3>${w.name}</h3>
            <p>${w.desc}</p>
            <div class="lock-progress" style="margin-top:8px;">
                DMG ×${w.damageMult.toFixed(2)} · SPEED ×${w.fireRateMult.toFixed(2)} fire delay ·
                ${w.multishotAdd > 0 ? '+' + w.multishotAdd + ' shots · ' : ''}
                ${w.spreadAdd > 0 ? '+' + w.spreadAdd + ' spread · ' : ''}
                ${w.alwaysPiercing ? 'ALWAYS PIERCING · ' : ''}
                ${w.flamethrower ? 'ALWAYS BURNS · ' : ''}
                ${w.sniper ? 'BIGGER BULLETS · ' : ''}
                Stacks with all upgrades.
            </div>`;
        card.addEventListener('click', () => selectWeapon(w));
        options.appendChild(card);
    });
    menu.classList.remove('hidden');
}

function selectWeapon(w) {
    activeWeapon = { ...w, baseId: w.id };
    weaponSelected = true;
    document.getElementById('weaponMenu').classList.add('hidden');
    if (cacheMode) {
        // Cache re-pick keeps the evolution tier: evolved players evolve the new gun now.
        if (weaponEvolved && EVOLUTIONS[w.id]) {
            showEvolutionMenu();
        } else {
            cacheMode = false;
            game.state = 'playing';
        }
        return;
    }
    // After weapon selection, show the normal upgrade menu
    showUpgradeMenu();
}

// --- Evolution menu ---------------------------------------------------------

function showEvolutionMenu(mythic = false) {
    mythicMode = mythic;
    const menu = document.getElementById('evolutionMenu');
    const title = document.getElementById('evolutionTitle');
    const options = document.getElementById('evolutionOptions');
    options.innerHTML = '';
    const table = mythic ? MYTHIC_EVOLUTIONS : EVOLUTIONS;
    if (title) {
        title.textContent = mythic ? 'WAVE ' + game.wave + ' — MYTHIC EVOLUTION' : 'WAVE ' + game.wave + ' — EVOLVE YOUR WEAPON';
    }
    const evos = table[activeWeapon.baseId || activeWeapon.id] || [];
    evos.forEach(evo => {
        const card = document.createElement('div');
        card.className = 'weapon-card';
        card.innerHTML = `
            <span class="wtag">${evo.emoji} ${mythic ? 'MYTHIC EVOLUTION' : 'EVOLUTION'}</span>
            <h3>${evo.name}</h3>
            <p>${evo.desc}</p>`;
        card.addEventListener('click', () => selectEvolution(evo));
        options.appendChild(card);
    });
    menu.classList.remove('hidden');
}

function selectEvolution(evo) {
    evo.apply(activeWeapon);
    activeWeapon.name = evo.name;
    activeWeapon.emoji = evo.emoji;
    if (mythicMode) weaponMythic = true; else weaponEvolved = true;
    mythicMode = false;
    document.getElementById('evolutionMenu').classList.add('hidden');
    showAwakening(evo.emoji + ' ' + evo.name, evo.desc);
    sfx('awaken');
    if (cacheMode) {
        cacheMode = false;
        game.state = 'playing';
        return;
    }
    showUpgradeMenu();
}

// --- Meta progression --------------------------------------------------------

function renderMetaStatus() {
    const panel = document.getElementById('metaStatus');
    if (!panel) return;
    const meta = loadMeta();
    const best = meta.bestWave || 0;
    if (best <= 0) { panel.textContent = ''; return; }
    const unlocked = META_MILESTONES.filter(m => best >= m.wave);
    const next = META_MILESTONES.find(m => best < m.wave);
    let text = 'BEST WAVE: ' + best;
    if (unlocked.length) text += ' · VETERAN BONUSES: ' + unlocked.map(m => m.label).join(', ');
    if (next) text += ' · NEXT AT WAVE ' + next.wave;
    panel.textContent = text;
}

renderLeaderboard('leaderboardPanel');
renderMetaStatus();
