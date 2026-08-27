// ============================================================================
// engine.js — canvas, game state, input, fixed-timestep loop, spawn director,
// scheduling, reset. All simulation timers count ticks at 60/sec; pausing
// stops ticks, so nothing advances while paused.
// ============================================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const DEBUG = new URLSearchParams(location.search).has('debug');

const game = {
    state: 'menu',        // menu | playing | upgrade | paused | gameover
    prevState: 'playing',
    tick: 0,
    wave: 1,
    score: 0,
    kills: 0,
    shake: 0,
    hitStop: 0,
    spawner: null,        // { budget, nextTick, intervalTicks }
    stage: null,
    pendingEvent: null,
    blackoutTimer: 0,
    waveDamageTaken: 0,
    loopRunning: false,
    modifiers: {},        // wave-curse multipliers, see WAVE_CURSES / modVal()
    activeCurse: null,
};

// Reads a wave-curse multiplier, defaulting to a no-op value when none is active.
function modVal(key, def = 1) {
    return (game.modifiers && game.modifiers[key] !== undefined) ? game.modifiers[key] : def;
}

const player = makeInitialPlayer();

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let powerups = [];
let minions = [];
let soulShards = [];
let mines = [];       // Nikita's proximity mines
let telegraphs = [];  // warning circles that resolve into damage/effects
let decoys = [];      // PHANTOM afterimages
let virusZones = [];  // PUPPETMASTER zones
let tarPools = [];    // TAR THROWER ground slicks
let obstacles = [];   // stage pillars / crates / acid pools
let stageState = {};  // per-wave hazard state (freight, vents, searchlights, wind)
let weaponSelected = false;
let weaponEvolved = false;
let weaponMythic = false;  // second evolution tier, offered at wave 35+
let mythicMode = false;    // showEvolutionMenu() is presenting the mythic tier
let cacheMode = false; // weapon cache re-pick flow (mid-run weapon swap)
let activeWeapon = { ...WEAPONS[0] }; // per-run copy so evolutions never touch the table

// Awakening overlay (specialization announcements)
let awakeningTimer = 0;
let awakeningText = '';
function showAwakening(title, lines) {
    awakeningText = lines ? title + '\n' + lines : title;
    awakeningTimer = 220;
}

// Top-of-screen banner (wave starts, surges, events)
let banner = { text: '', timer: 0 };
function showBanner(text) {
    banner.text = text;
    banner.timer = 130;
}

// Floating damage numbers
let damageNumbers = [];
function spawnDamageNumber(x, y, value, color, big) {
    if (damageNumbers.length > 60) damageNumbers.shift();
    damageNumbers.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y - 6,
        vy: -0.7 - Math.random() * 0.4,
        value: Math.round(value),
        color: color || '#fff',
        big: !!big,
        life: 45
    });
}
function updateDamageNumbers() {
    damageNumbers = damageNumbers.filter(d => {
        d.y += d.vy;
        d.vy *= 0.96;
        d.life--;
        return d.life > 0;
    });
}

const keys = {};
let mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };

// Actions queued to run N ticks from now (replaces setTimeout — never fires
// while paused, dies with the run on reset).
let pendingActions = [];
function schedule(ticksFromNow, fn) {
    pendingActions.push({ at: game.tick + ticksFromNow, fn });
}
function runPendingActions() {
    if (!pendingActions.length) return;
    const due = pendingActions.filter(a => a.at <= game.tick);
    if (!due.length) return;
    pendingActions = pendingActions.filter(a => a.at > game.tick);
    due.forEach(a => a.fn());
}

// --- Input ------------------------------------------------------------------

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mousedown', () => { mouse.down = true; });
canvas.addEventListener('mouseup', () => { mouse.down = false; });
document.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'p' || e.key === 'Escape') togglePause();
    if (e.key.toLowerCase() === 'm') toggleMute();
    if (e.key === ' ' && game.state === 'playing') onSpace();
    if (DEBUG) handleDebugKey(e.key.toLowerCase());
});
document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function handleDebugKey(k) {
    if (game.state !== 'playing') return;
    if (k === 'g') { player.godMode = !player.godMode; }
    if (k === 'k') { enemies.forEach(e => e.health = 0); }
    if (k === 'n') { // skip wave: stop spawning, clear field without rewards
        if (game.spawner) game.spawner.budget = 0;
        enemies = [];
        enemyBullets = [];
    }
    if (k === 'u') { game.state = 'upgrade'; showUpgradeMenu(); }
    const treeIdx = parseInt(k, 10) - 1;
    if (treeIdx >= 0 && treeIdx < treeNames.length) {
        const next = upgrades.find(u => u.tree === treeNames[treeIdx] && isUpgradeAvailable(u));
        if (next) { player.skillLevels[next.id] = levelOf(next.id) + 1; lockOpposingTrees(next.tree); next.apply(); }
    }
}

// --- Run lifecycle ----------------------------------------------------------

function resetRun() {
    for (const k of Object.keys(player)) delete player[k];
    Object.assign(player, makeInitialPlayer());
    bullets = [];
    enemyBullets = [];
    enemies = [];
    particles = [];
    powerups = [];
    minions = [];
    soulShards = [];
    mines = [];
    telegraphs = [];
    decoys = [];
    virusZones = [];
    tarPools = [];
    obstacles = [];
    stageState = {};
    weaponEvolved = false;
    weaponMythic = false;
    mythicMode = false;
    cacheMode = false;
    pendingActions = [];
    awakeningTimer = 0;
    banner = { text: '', timer: 0 };
    damageNumbers = [];
    weaponSelected = false;
    activeWeapon = { ...WEAPONS[0] };
    game.state = 'menu';
    game.tick = 0;
    game.wave = 1;
    game.score = 0;
    game.kills = 0;
    game.shake = 0;
    game.hitStop = 0;
    game.spawner = null;
    game.stage = null;
    game.pendingEvent = null;
    game.blackoutTimer = 0;
    game.waveDamageTaken = 0;
    game.flawlessWaves = 0;
    game.modifiers = {};
    game.activeCurse = null;
    canvas.width = BASE_CANVAS_WIDTH;
    canvas.height = BASE_CANVAS_HEIGHT;
    ctx.imageSmoothingEnabled = false;
    mouse.x = canvas.width / 2;
    mouse.y = canvas.height / 2;
    applyMetaBonuses(player);
}

function startGame() {
    resetRun();
    initAudio();
    ['menu', 'pauseMenu', 'upgradeMenu', 'weaponMenu', 'evolutionMenu', 'gameOver'].forEach(id =>
        document.getElementById(id).classList.add('hidden'));
    document.getElementById('pauseBtn').classList.remove('hidden');
    document.getElementById('pauseBtn').textContent = 'PAUSE';
    game.state = 'playing';
    spawnWave();
    if (!game.loopRunning) {
        game.loopRunning = true;
        requestAnimationFrame((ts) => { lastFrameTime = ts; requestAnimationFrame(gameLoop); });
    }
}

function restartRun() {
    startGame();
}

function togglePause() {
    if (game.state === 'menu' || game.state === 'gameover' || game.state === 'upgrade') return;
    const menu = document.getElementById('pauseMenu');
    if (game.state !== 'paused') {
        game.prevState = game.state;
        game.state = 'paused';
        menu.classList.remove('hidden');
        document.getElementById('pauseBtn').textContent = 'RESUME';
    } else {
        game.state = game.prevState === 'paused' ? 'playing' : game.prevState;
        menu.classList.add('hidden');
        document.getElementById('pauseBtn').textContent = 'PAUSE';
    }
}

function gameOver() {
    game.state = 'gameover';
    const meta = loadMeta();
    if (game.wave > (meta.bestWave || 0)) {
        meta.bestWave = game.wave;
        saveMeta(meta);
    }
    renderMetaStatus();
    document.getElementById('pauseBtn').classList.add('hidden');
    document.getElementById('finalWave').textContent = game.wave;
    document.getElementById('finalScore').textContent = game.score;
    // Run summary
    const stats = document.getElementById('runStats');
    if (stats) {
        const build = player.chosenTree
            ? player.chosenTree + (player.chosenBranches[player.chosenTree] ? ' · ' + branchName(player.chosenTree, player.chosenBranches[player.chosenTree]) : '')
            : 'NO SPECIALIZATION';
        const armament = player.hasSword ? '⚔ THE SWORD' : player.permanentStaff ? '☠ THE STAFF' : activeWeapon.emoji + ' ' + activeWeapon.name;
        stats.textContent = game.kills + ' KILLS · ' + (game.flawlessWaves || 0) + ' FLAWLESS · ' + armament + ' · ' + build;
    }
    document.getElementById('highScoreEntry').classList.remove('hidden');
    renderLeaderboard('leaderboardGameOver');
    document.getElementById('gameOver').classList.remove('hidden');
    sfx('death');
}

// --- Arena size -------------------------------------------------------------

function setMapSizeForWave() {
    const growthSteps = Math.min(3, Math.floor((game.wave - 1) / 4));
    const newW = Math.min(MAX_CANVAS_WIDTH, BASE_CANVAS_WIDTH + growthSteps * 120);
    const newH = Math.min(MAX_CANVAS_HEIGHT, BASE_CANVAS_HEIGHT + growthSteps * 90);
    if (canvas.width !== newW || canvas.height !== newH) {
        const oldW = canvas.width;
        const oldH = canvas.height;
        canvas.width = newW;
        canvas.height = newH;
        ctx.imageSmoothingEnabled = false;
        player.x += (newW - oldW) / 2;
        player.y += (newH - oldH) / 2;
        mouse.x += (newW - oldW) / 2;
        mouse.y += (newH - oldH) / 2;
    }
}

// --- Spawn director ---------------------------------------------------------

function waveBudget() {
    // Calibrated so early waves match the old per-count pacing (~1.6 avg cost);
    // grows superlinearly past wave 15 so late waves stay dangerous.
    const base = (8 + game.wave * 4 + Math.floor(game.wave / 3) * 2) * 1.6;
    const late = 1 + Math.max(0, game.wave - 15) * 0.03;
    return Math.round(base * late);
}

function spawnWave() {
    setMapSizeForWave();
    player.loyaltyUsed = false;
    soulShards = [];
    mines = [];
    telegraphs = [];
    game.waveDamageTaken = 0;

    // Wave curses: from wave 20, non-boss waves have a chance to roll a
    // global modifier that changes HOW the wave plays, not just its numbers.
    game.modifiers = {};
    game.activeCurse = null;
    if (game.wave >= 20 && game.wave % 5 !== 0 && Math.random() < 0.28) {
        const curse = WAVE_CURSES[Math.floor(Math.random() * WAVE_CURSES.length)];
        game.activeCurse = curse;
        curse.apply();
    }

    // Stage transition every 10 waves
    const stage = stageForWave(game.wave);
    if (!game.stage || game.stage.id !== stage.id) {
        game.stage = stage;
        setupStage(stage);
        showAwakening('◈ RELOCATING ◈', stage.name);
        sfx('waveStart');
    } else {
        refreshStageWaveState(stage);
    }

    spawnScheduledBosses();
    const budget = waveBudget();
    game.spawner = {
        budget,
        startBudget: budget,
        surged: false,
        nextTick: game.tick + 30,
        intervalTicks: Math.max(9, Math.round(30 - game.wave * 1.1)),
    };

    // Mid-wave event roll (from wave 6)
    game.pendingEvent = null;
    if (game.wave >= 6 && Math.random() < 0.18) {
        const events = ['supplyDrop', 'blackout', 'assassin'];
        game.pendingEvent = {
            type: events[Math.floor(Math.random() * events.length)],
            at: game.tick + 240 + Math.floor(Math.random() * 360),
        };
    }

    showBanner('WAVE ' + game.wave);
    if (game.activeCurse) {
        const curse = game.activeCurse; // captured now — game.activeCurse may reset before this fires
        schedule(80, () => showAwakening(curse.name, curse.desc));
    }
}

function tickSpawner() {
    const s = game.spawner;
    if (!s || s.budget <= 0) return;
    if (game.tick < s.nextTick) return;
    // Mid-wave surge: once half the budget is spent, chance of a reinforcement burst
    if (!s.surged && s.budget <= s.startBudget * 0.5) {
        s.surged = true;
        if (Math.random() < 0.25 && game.wave >= 4) {
            showBanner('⚠ REINFORCEMENTS ⚠');
            sfx('bossAlarm');
            for (let i = 0; i < 4 + Math.floor(game.wave / 8); i++) {
                const t = chooseEnemyType();
                spawnEnemyOfType(t);
                s.budget -= t.cost * 0.5; // surges are a partial freebie for the director
            }
        }
    }
    const type = chooseEnemyType();
    spawnEnemyOfType(type);
    s.budget -= type.cost;
    s.nextTick = game.tick + s.intervalTicks;
}

function waveCleared() {
    return enemies.length === 0 && (!game.spawner || game.spawner.budget <= 0);
}

// --- Main loop: fixed timestep at 60 ticks/sec ------------------------------

let lastFrameTime = 0;
let accumulator = 0;

function gameLoop(now) {
    const elapsed = Math.min(now - lastFrameTime, 100); // clamp tab-switch gaps
    lastFrameTime = now;
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= TICK_MS && steps < 4) {
        if (game.hitStop > 0) {
            game.hitStop--;
        } else if (game.state === 'playing') {
            game.tick++;
            update();
        }
        accumulator -= TICK_MS;
        steps++;
    }
    if (steps === 4) accumulator = 0; // drop backlog rather than spiral
    if (game.shake > 0) game.shake *= 0.92;
    if (game.shake < 0.1) game.shake = 0;
    draw();
    updateUI();
    requestAnimationFrame(gameLoop);
}

function addShake(amount) {
    game.shake = Math.min(18, game.shake + amount);
}

function update() {
    runPendingActions();
    tickSpawner();
    updatePlayer();
    if (player.hasSword) {
        if (mouse.down) swingSword();
    } else if (player.permanentStaff) {
        updateStaffInput();
    } else if (mouse.down) {
        shoot();
    }
    fireBarrage();
    updateAwakenings();
    updateSwordAndFire();
    updateBullets();
    // DEADEYE bullet-time: the enemy side of the world runs at half speed
    const slowWorld = player.focusTimer > 0 && game.tick % 2 === 1;
    if (!slowWorld) {
        updateEnemies();
        updateEnemyBullets();
        updateMinesAndTelegraphs();
        updateStageHazards();
    }
    updateEvents();
    updateDecoysAndZones();
    updateMinions();
    updatePowerupsAndParticles();
    updateSoulShards();
    updateDamageNumbers();
    if (awakeningTimer > 0) awakeningTimer--;
    if (banner.timer > 0) banner.timer--;

    if (waveCleared() && game.state === 'playing') {
        // Wave-clear bonus; flawless (no damage taken) pays +50%
        const base = 50 + game.wave * 10;
        if (game.waveDamageTaken === 0) {
            game.score += Math.round(base * 1.5);
            game.flawlessWaves = (game.flawlessWaves || 0) + 1;
            showBanner('FLAWLESS WAVE +' + Math.round(base * 1.5));
        } else {
            game.score += base;
        }
        game.state = 'upgrade';
        const usesGun = !player.hasSword && !player.permanentStaff;
        if (game.wave === 10 && !weaponSelected && usesGun) {
            showWeaponMenu();
        } else if (game.wave >= 20 && weaponSelected && !weaponEvolved && usesGun && EVOLUTIONS[activeWeapon.baseId || activeWeapon.id]) {
            showEvolutionMenu();
        } else if (game.wave >= 35 && weaponSelected && weaponEvolved && !weaponMythic && usesGun && MYTHIC_EVOLUTIONS[activeWeapon.baseId || activeWeapon.id]) {
            showEvolutionMenu(true);
        } else {
            showUpgradeMenu();
        }
    }
    if (player.health <= 0 && !player.godMode) gameOver();
}
