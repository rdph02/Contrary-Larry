// ============================================================================
// data.js — content tables and tuning constants.
// Load order: data → audio → engine → systems → render → ui (classic scripts,
// shared global scope; inline onclick handlers in index.html need globals).
// ============================================================================

const MAX_BULLET_SIZE = 8;
const MAX_BULLET_HITBOX = 12;
const MIN_FIRE_RATE = 50;          // ms between shots, lower bound
const BASE_CANVAS_WIDTH = 800;
const BASE_CANVAS_HEIGHT = 600;
const MAX_CANVAS_WIDTH = 1160;
const MAX_CANVAS_HEIGHT = 860;
const BASE_DAMAGE_START = 15;      // damage-modifier display baseline
const ENEMY_DAMAGE_MULT = 1.35;    // global scalar on all damage dealt to the player
                                    // (contact, enemy bullets, mines, boss/hazard hits)

const TICK_MS = 1000 / 60;         // fixed timestep; all timers count ticks
function msToTicks(ms) { return Math.max(1, Math.round(ms / TICK_MS)); }

const LEADERBOARD_KEY = 'contraryLarryLocalLeaderboardV1';

function makeInitialPlayer() {
    return {
        x: BASE_CANVAS_WIDTH / 2,
        y: BASE_CANVAS_HEIGHT / 2,
        radius: 10,
        speed: 2.8,
        health: 100,
        maxHealth: 100,
        fireRate: 300,             // ms between shots before weapon multiplier
        lastShotTick: -9999,
        damage: 15,
        bulletSpeed: 6,
        bulletSize: 4,
        piercing: false,
        spread: 1,
        multishot: 1,
        lifeSteal: 0,
        explosiveRounds: false,
        recoil: 0,
        armor: 0,
        skillLevels: {},
        lockedTrees: [],
        chosenTree: null,
        chosenBranches: {},
        iframes: 0,
        lastHitTick: -9999,
        critChance: 0,
        invulnDuration: 30,
        dashCooldown: 0,
        hasDash: false,
        hasRegen: false,
        hasKnockbackAura: false,
        autoDodge: false,
        autoDodgeCooldown: 0,
        hasBarrage: false,
        barrageDamage: 0,
        barrageTimer: 0,
        chainExplosions: false,
        killBoostTimer: 0,
        paybackTimer: 0,
        dashBoostTimer: 0,
        godMode: false,
        // REANIMATION (necromancy) tree state
        hasReanimation: false,
        minionsPerPickup: 1,
        minionDamageMult: 1,
        minionHealthMult: 1,
        minionLifespan: 600,       // ticks
        minionShoots: false,
        minionExplodes: false,
        minionSpawnsOnKill: 0,     // chance 0..1
        minionAura: false,
        // SABOTAGE tree state
        slowOnHit: 0,              // 0..1 strength
        slowDuration: 0,           // ticks
        poisonDamage: 0,
        poisonDuration: 0,         // ticks
        poisonTickFast: false,     // TOTAL SABOTAGE doubles tick rate
        weakenStrength: 0,
        stunChance: 0,
        confuseEnemies: false,
        saboteurMark: false,
        bossDamageBonus: 1,
        executeThreshold: 0,
        thorns: 0,
        slowField: false,
        // BERSERKER tree state (sword replaces the gun while drawn)
        hasSword: false,
        swordMult: 0,              // sword damage = player.damage * swordMult
        swordRange: 70,
        swordSwingRate: 400,       // ms between swings
        swordLastSwingTick: -9999,
        swordSwingTimer: 0,        // ticks remaining in active swing arc
        swordSwingDir: 1,          // alternates -1/1 each swing for a left-right slash
        swordWhirlwindVisualTimer: 0,
        swordAngle: 0,
        swordArcWidth: Math.PI * 0.55, // arc half-width in radians
        swordOnFire: false,
        swordFireDamage: 0,        // burn dps per tick
        swordLifesteal: 0,
        berserkerRage: false,      // rage mode on low HP
        rageThreshold: 0.4,
        swordWhirlwind: false,
        whirlwindTimer: 0,
        whirlwindCooldownMax: 300,
        swordShockwave: false,
        shockwaveCharge: 0,
        swordEchoBlade: false,
        fireTrails: [],            // lingering fire pools on the ground
        firePoolRadius: 18,
        firePoolLife: 90,
        pyreLord: false,           // burn executes weakened enemies + fire aura
        // NECROMANCER awakening state (REANIMATION specialization)
        permanentStaff: false,
        staffCharge: 0,            // 0..1, held-click charge
        staffPowerBonus: false,
        minionTaunt: false,
        undyingLoyalty: false,
        loyaltyUsed: false,
        // Other awakening state
        theWall: false,            // STUBBORNNESS: bastion meter + turret stance
        bastionMeter: 0,           // 0..100, fills from damage taken
        stillTicks: 0,
        turretStance: false,
        deadeyeAwakened: false,    // DEFIANCE: focus bullet-time
        focusMeter: 0,             // 0..100, fills from kills/crits
        focusTimer: 0,             // ticks of bullet-time remaining
        warhead: false,            // CHAOS: cluster shots + airstrikes
        shotCounter: 0,
        airstrikeTimer: 0,
        phantom: false,            // CONTRARIAN: dash decoys
        shotHistory: [],           // recent shot angles for decoy replay
        puppetmaster: false,       // SABOTAGE: converts + virus zones
        virusCooldown: 0,
        permanentThralls: 0,
        trueAwakened: null         // capstone id that fired the tier-2 awakening, if any
    };
}

// ---------------------------------------------------------------------------
// Weapons — multipliers layered on top of the player's upgraded stats.
// spriteId resolves against the SPRITES registry in render.js; weapons without
// loaded art fall back to a procedural draw tinted with `color`.
// ---------------------------------------------------------------------------
const WEAPONS = [
    {
        id: 'pistol', name: 'STANDARD ISSUE', emoji: '🔫',
        desc: 'Reliable sidearm. No changes to your current stats.',
        spriteId: 'pistol', color: '#9ca3af',
        fireRateMult: 1, damageMult: 1, bulletSpeedMult: 1,
        multishotAdd: 0, spreadAdd: 0,
        flamethrower: false, sniper: false,
    },
    {
        id: 'sniper', name: 'SNIPER RIFLE', emoji: '🎯',
        desc: '+80% damage, +50% bullet speed. Much slower fire rate. Bigger bullet hitbox.',
        spriteId: null, color: '#86efac',
        fireRateMult: 2.4, damageMult: 1.8, bulletSpeedMult: 1.5,
        multishotAdd: 0, spreadAdd: 0, bulletSizeBonus: 3,
        flamethrower: false, sniper: true,
    },
    {
        id: 'shotgun', name: 'COMBAT SHOTGUN', emoji: '💥',
        desc: '+3 spread, +2 multishot, -20% damage per bullet. Short range.',
        spriteId: null, color: '#f59e0b',
        fireRateMult: 1.7, damageMult: 0.8, bulletSpeedMult: 0.7,
        multishotAdd: 2, spreadAdd: 3,
        flamethrower: false, sniper: false,
    },
    {
        id: 'machinegun', name: 'MACHINE GUN', emoji: '⚙️',
        desc: '-55% fire rate delay (much faster). -15% damage per bullet. +1 multishot.',
        spriteId: null, color: '#64748b',
        fireRateMult: 0.45, damageMult: 0.85, bulletSpeedMult: 1.1,
        multishotAdd: 1, spreadAdd: 0,
        flamethrower: false, sniper: false,
    },
    {
        id: 'flamethrower', name: 'FLAMETHROWER', emoji: '🔥',
        desc: 'Rapid short-range fire blasts. +3 spread, very fast fire rate, reduced range. Always applies burn.',
        spriteId: 'flamethrower', color: '#ff4500',
        fireRateMult: 0.22, damageMult: 0.45, bulletSpeedMult: 0.38,
        multishotAdd: 0, spreadAdd: 3,
        flamethrower: true, sniper: false,
    },
    {
        id: 'railgun', name: 'RAILGUN', emoji: '⚡',
        desc: '+120% damage, always piercing, +1 multishot. Very slow fire rate. Bullets arc through everything.',
        spriteId: null, color: '#38bdf8',
        fireRateMult: 3.2, damageMult: 2.2, bulletSpeedMult: 1.8,
        multishotAdd: 1, spreadAdd: 0, alwaysPiercing: true,
        flamethrower: false, sniper: false,
    },
    {
        id: 'grenadelauncher', name: 'GRENADE LAUNCHER', emoji: '💣',
        desc: '+60% damage, always explosive on hit (stacks with Explosive Dissent). Slow arc, medium fire rate. Great crowd clearing.',
        spriteId: null, color: '#4ade80',
        fireRateMult: 1.55, damageMult: 1.6, bulletSpeedMult: 0.55,
        multishotAdd: 0, spreadAdd: 0, alwaysPiercing: false,
        flamethrower: false, sniper: false, grenade: true,
    },
];

// ---------------------------------------------------------------------------
// Enemies — spawn director picks by weighted random within budget.
// cost drains the wave's spawn budget; weight(w) shapes the mix per wave.
// ---------------------------------------------------------------------------
const ENEMY_TYPES = [
    {
        id: 'scout', minWave: 1, cost: 1,
        weight: w => (w < 12 ? 1 : 0.55),
        make: w => ({ kind: 'scout', radius: 7, speed: 2.2 + w * 0.08, health: 25 + w * 4, contact: 0.8, color: '#00ff41', points: 10 })
    },
    {
        id: 'agent', minWave: 1, cost: 1.5,
        weight: w => 1,
        make: w => ({ kind: 'agent', radius: 9, speed: 1.5 + w * 0.06, health: 45 + w * 8, contact: 1.2, color: '#ff0041', points: 15 })
    },
    {
        id: 'bruiser', minWave: 2, cost: 2.5,
        weight: w => 1,
        make: w => ({ kind: 'bruiser', radius: 12, speed: 1.0 + w * 0.04, health: 80 + w * 12, contact: 2.0, armor: 0.15, color: '#ff6b00', points: 25 })
    },
    {
        id: 'shield', minWave: 3, cost: 2,
        weight: w => 1,
        make: w => ({ kind: 'shield', radius: 10, speed: 1.2 + w * 0.05, health: 60 + w * 10, contact: 1.0, armor: 0.25, color: '#c77dff', points: 20 })
    },
    {
        id: 'marksman', minWave: 5, cost: 3,
        weight: w => 1,
        make: w => ({ kind: 'marksman', radius: 8, speed: 1.0 + w * 0.03, health: 55 + w * 9, contact: 0.7, shootRate: 110, shootTimer: 60, color: '#facc15', points: 35 })
    },
    {
        id: 'saboteur', minWave: 7, cost: 3,
        weight: w => 1,
        make: w => ({ kind: 'saboteur', radius: 8, speed: 2.6 + w * 0.05, health: 45 + w * 7, contact: 2.5, sprintTimer: 0, color: '#fb7185', points: 40 })
    },
    {
        id: 'handler', minWave: 9, cost: 4.5,
        weight: w => 1,
        make: w => ({ kind: 'handler', radius: 11, speed: 1.1 + w * 0.03, health: 120 + w * 14, contact: 1.3, aura: true, color: '#38bdf8', points: 60 })
    },
    {
        id: 'nikitaGuard', minWave: 12, cost: 7,
        weight: w => 0.3,
        make: w => ({ kind: 'nikitaGuard', radius: 14, speed: 1.3 + w * 0.03, health: 220 + w * 20, contact: 2.8, armor: 0.20, shootRate: 80, shootTimer: 40, color: '#ef4444', points: 120 })
    },
    {
        id: 'splitter', minWave: 6, cost: 2.5,
        weight: w => 0.8,
        make: w => ({ kind: 'splitter', radius: 11, speed: 1.4 + w * 0.05, health: 70 + w * 10, contact: 1.4, splitsOnDeath: 2, color: '#4ade80', points: 30 })
    },
    {
        id: 'weaver', minWave: 8, cost: 3,
        weight: w => 0.9,
        make: w => ({ kind: 'weaver', radius: 8, speed: 1.7 + w * 0.05, health: 50 + w * 8, contact: 1.0, shootRate: 120, shootTimer: 70, fan: 3, weaves: true, _weavePhase: Math.random() * Math.PI * 2, color: '#e879f9', points: 45 })
    },
    {
        id: 'mender', minWave: 10, cost: 4,
        weight: w => 0.7,
        make: w => ({ kind: 'mender', radius: 9, speed: 1.3 + w * 0.03, health: 70 + w * 10, contact: 0.6, mender: true, keepAway: 300, color: '#fbbf24', points: 70 })
    },
    {
        id: 'bomber', minWave: 11, cost: 3,
        weight: w => 0.8,
        make: w => ({ kind: 'bomber', radius: 10, speed: 2.4 + w * 0.06, health: 55 + w * 8, contact: 1.0, bomber: true, fuseRange: 85, color: '#f97316', points: 50 })
    },
    {
        id: 'deadeye', minWave: 13, cost: 4,
        weight: w => 0.7,
        make: w => ({ kind: 'deadeye', radius: 8, speed: 1.6 + w * 0.03, health: 60 + w * 9, contact: 0.8, deadeye: true, color: '#f43f5e', points: 80 })
    },
    {
        id: 'warper', minWave: 14, cost: 4,
        weight: w => 0.7,
        make: w => ({ kind: 'warper', radius: 9, speed: 1.2 + w * 0.03, health: 65 + w * 9, contact: 1.2, warper: true, _warpTimer: 120, shootRate: 90, shootTimer: 55, color: '#22d3ee', points: 75 })
    },
    {
        id: 'aegisDrone', minWave: 15, cost: 3.5,
        weight: w => 0.6,
        make: w => ({ kind: 'aegisDrone', radius: 12, speed: 2.0 + w * 0.03, health: 90 + w * 10, contact: 0.8, blocksBullets: true, orbiter: true, _orbitAngle: Math.random() * Math.PI * 2, color: '#818cf8', points: 65 })
    },
    // --- Late-game roster (wave 20+): the field director keeps escalating ---
    {
        id: 'wraith', minWave: 20, cost: 4,
        weight: w => 0.6,
        make: w => ({ kind: 'wraith', radius: 9, speed: 2.1 + w * 0.04, health: 95 + w * 11, contact: 1.6, wraith: true, phased: false, _phaseTimer: 100 + Math.floor(Math.random() * 80), color: '#a3e635', points: 95 })
    },
    {
        id: 'railTrooper', minWave: 24, cost: 5,
        weight: w => 0.5,
        make: w => ({ kind: 'railTrooper', radius: 9, speed: 1.1 + w * 0.02, health: 90 + w * 10, contact: 1.0, railTrooper: true, color: '#fde047', points: 115 })
    },
    {
        id: 'bulwarkCommander', minWave: 28, cost: 6,
        weight: w => 0.4,
        make: w => ({ kind: 'bulwarkCommander', radius: 12, speed: 1.0 + w * 0.02, health: 170 + w * 16, contact: 1.6, bulwark: true, shieldRadius: 140, color: '#38bdf8', points: 150 })
    },
];

// ---------------------------------------------------------------------------
// Elite modifiers — rolled onto regular spawns from wave 8. Elites get
// 3x HP, 4x points, a glow ring, and a guaranteed drop.
// ---------------------------------------------------------------------------
const ELITE_MODS = {
    shielded: { name: 'SHIELDED', color: '#38bdf8', apply: e => { e.bulletResist = 0.55; } },
    volatile: { name: 'VOLATILE', color: '#f97316', apply: e => { e.volatile = true; } },
    vampiric: { name: 'VAMPIRIC', color: '#dc2626', apply: e => { e.vampiric = true; } },
    blinker: { name: 'BLINKER', color: '#c084fc', apply: e => { e.blinker = true; } },
    commander: { name: 'COMMANDER', color: '#facc15', apply: e => { e.commander = true; } },
    juggernaut: { name: 'JUGGERNAUT', color: '#94a3b8', apply: e => { e.radius = Math.round(e.radius * 1.6); e.health *= 2.2; e.maxHealth = e.health; e.speed *= 0.8; e.stunImmune = true; } },
    cursed: { name: 'CURSED', color: '#84cc16', apply: e => { e.cursed = true; } },
    // Tier-3 mods (wave 30+): active mechanics, not just stat sticks.
    berserk: { name: 'BERSERK', color: '#dc2626', apply: e => { e.berserkMod = true; } },
    phasing: { name: 'PHASING', color: '#a3e635', apply: e => { e.wraith = true; e.phased = false; e._phaseTimer = 70 + Math.floor(Math.random() * 50); } },
    swarming: { name: 'SWARMING', color: '#fb923c', apply: e => { e.swarmingMod = true; e._swarmTimer = 220; e._swarmSpawns = 0; } },
};

function eliteChance(w) {
    if (w < 8) return 0;
    return Math.min(0.25, 0.03 + w * 0.008);
}

function eliteModCount(w) {
    if (w >= 30) return 3;
    if (w >= 18) return 2;
    return 1;
}

// Global enemy stat scaling: linear early, compounding after wave 15
function enemyScale(w) {
    return w <= 15 ? 1 : Math.pow(1.045, w - 15);
}

// ---------------------------------------------------------------------------
// Upgrade trees
// ---------------------------------------------------------------------------
const treeNames = ['STUBBORNNESS', 'DEFIANCE', 'CHAOS', 'CONTRARIAN', 'REANIMATION', 'SABOTAGE', 'BERSERKER'];
const SPECIALIZATION_THRESHOLD = 4;
const BRANCH_NAMES = {
    STUBBORNNESS: { A: 'BULWARK', B: 'RETALIATION' },
    DEFIANCE: { A: 'SNIPER', B: 'GUNSLINGER' },
    CHAOS: { A: 'EXPLOSIONS', B: 'BARRAGE' },
    CONTRARIAN: { A: 'DASHER', B: 'PHANTOM' },
    REANIMATION: { A: 'HORDE', B: 'SPECTERS' },
    SABOTAGE: { A: 'POISON', B: 'CONTROL' },
    BERSERKER: { A: 'INFERNO', B: 'WARLORD' }
};

// Specialization awakenings: fired once when a tree hits SPECIALIZATION_THRESHOLD.
// Each grants a game-changing mechanic on top of the tree's upgrades.
const AWAKENINGS = {
    STUBBORNNESS: {
        title: '🛡 THE WALL',
        lines: 'Bastion meter absorbs punishment and erupts · Stand still 1s for Turret Stance',
        apply: () => {
            player.theWall = true;
            player.bastionMeter = 0;
        }
    },
    DEFIANCE: {
        title: '🎯 DEADEYE',
        lines: 'Kills and crits build Focus · SPACE: bullet-time — the world slows, you do not',
        apply: () => {
            player.deadeyeAwakened = true;
            player.focusMeter = 0;
        }
    },
    CHAOS: {
        title: '💥 WARHEAD',
        lines: 'Every 8th shot is a cluster bomb · Airstrikes rain on your cursor every 12s',
        apply: () => {
            player.warhead = true;
            player.shotCounter = 0;
            player.airstrikeTimer = 720;
        }
    },
    CONTRARIAN: {
        title: '👤 PHANTOM',
        lines: 'Dashing leaves a taunting decoy that replays your shots, then detonates',
        apply: () => {
            player.phantom = true;
            player.hasDash = true; // phantoms always dash
        }
    },
    REANIMATION: {
        title: '☠ NECROMANCER AWAKENED',
        lines: 'Gun becomes the Staff · Hold click to charge · Thralls taunt and intercept death',
        apply: () => {
            player.permanentStaff = true;
            player.minionTaunt = true;
            player.undyingLoyalty = true;
        }
    },
    SABOTAGE: {
        title: '🕷 PUPPETMASTER',
        lines: 'Poisoned and marked kills may join you forever · SPACE: deploy a virus zone',
        apply: () => {
            player.puppetmaster = true;
            player.virusCooldown = 0;
        }
    },
    BERSERKER: {
        title: '⚔ BLADE MASTER',
        lines: 'Sword mastered · Shockwave unlocked · Rage awakened · Lunging swings',
        apply: () => {
            player.swordMult *= 1.4;
            player.swordSwingRate = Math.max(200, player.swordSwingRate * 0.75);
            player.swordShockwave = true;
            player.berserkerRage = true;
            player.speed *= 1.1;
        }
    },
};

// ---------------------------------------------------------------------------
// Weapon evolutions — offered at wave 20 (and on cache re-picks). Each entry
// mutates the run's activeWeapon copy; behaviors key off the flags it sets.
// ---------------------------------------------------------------------------
const EVOLUTIONS = {
    pistol: [
        { id: 'dualberettas', name: 'DUAL BERETTAS', emoji: '🔫🔫', desc: 'Twice the fire rate. Alternating barrels never let up.',
          apply: w => { w.fireRateMult *= 0.5; w.color = '#d1d5db'; } },
        { id: 'handcannon', name: 'HAND CANNON', emoji: '🦣', desc: '+200% damage, heavy knockback, much slower fire.',
          apply: w => { w.damageMult *= 3; w.fireRateMult *= 2.2; w.knockbackShots = true; w.bulletSizeBonus = (w.bulletSizeBonus || 0) + 2; w.color = '#a16207'; } },
    ],
    sniper: [
        { id: 'railcannon', name: 'RAILCANNON', emoji: '🌩', desc: 'Rounds pierce everything. +50% damage, +40% velocity.',
          apply: w => { w.alwaysPiercing = true; w.damageMult *= 1.5; w.bulletSpeedMult *= 1.4; w.color = '#22d3ee'; } },
        { id: 'deadshot', name: 'DEADSHOT', emoji: '☠', desc: 'Killing shots ricochet toward the nearest enemy.',
          apply: w => { w.deadshot = true; w.damageMult *= 1.2; w.color = '#f43f5e'; } },
    ],
    shotgun: [
        { id: 'dragonsbreath', name: "DRAGON'S BREATH", emoji: '🐉', desc: 'Pellets ignite. +1 spread, everything burns.',
          apply: w => { w.flamethrower = true; w.spreadAdd += 1; w.color = '#f97316'; } },
        { id: 'slugcannon', name: 'SLUG CANNON', emoji: '🧱', desc: 'One massive stunning slug. +140% damage, huge round.',
          apply: w => { w.spreadAdd = 0; w.multishotAdd = 0; w.damageMult *= 2.4; w.bulletSizeBonus = 4; w.stunShots = true; w.color = '#e7e5e4'; } },
    ],
    machinegun: [
        { id: 'minigun', name: 'MINIGUN', emoji: '🌀', desc: 'Spools up while firing — fire rate ramps to double.',
          apply: w => { w.spoolup = true; w.color = '#475569'; } },
        { id: 'smartsmgs', name: 'SMART SMGs', emoji: '🛰', desc: 'Rounds gently home toward targets. +1 multishot.',
          apply: w => { w.homingShots = true; w.multishotAdd += 1; w.color = '#38bdf8'; } },
    ],
    flamethrower: [
        { id: 'blueflame', name: 'BLUE FLAME', emoji: '🔵', desc: '+80% damage, shreds armor off targets.',
          apply: w => { w.damageMult *= 1.8; w.armorShred = true; w.color = '#3b82f6'; } },
        { id: 'tarthrower', name: 'TAR THROWER', emoji: '🛢', desc: 'Coats the ground in slowing tar pools.',
          apply: w => { w.tarShots = true; w.damageMult *= 1.2; w.color = '#292524'; } },
    ],
    railgun: [
        { id: 'teslalance', name: 'TESLA LANCE', emoji: '⚡', desc: 'Hits chain lightning to 3 nearby enemies.',
          apply: w => { w.chainLightning = true; w.color = '#a5f3fc'; } },
        { id: 'voidlance', name: 'VOID LANCE', emoji: '🕳', desc: 'Impacts drag nearby enemies into the beam.',
          apply: w => { w.voidPull = true; w.damageMult *= 1.25; w.color = '#7c3aed'; } },
    ],
    grenadelauncher: [
        { id: 'clusterbomber', name: 'CLUSTER BOMBER', emoji: '🎆', desc: 'Every blast splits into 3 bomblets.',
          apply: w => { w.clusterGrenades = true; w.color = '#86efac'; } },
        { id: 'stickymines', name: 'STICKY MINES', emoji: '🧲', desc: 'Grenades stick in place and blow when enemies close in.',
          apply: w => { w.stickyGrenades = true; w.damageMult *= 1.3; w.color = '#fbbf24'; } },
    ],
};

// ---------------------------------------------------------------------------
// Mythic evolutions — a second evolution tier offered at wave 35 once the
// weapon has already evolved once. Keyed by the ORIGINAL base weapon id (the
// weapon keeps its tier-1 identity/flags; these layer further mutations on).
// ---------------------------------------------------------------------------
const MYTHIC_EVOLUTIONS = {
    pistol: [
        { id: 'apexpredator', name: 'APEX PREDATOR', emoji: '👑', desc: 'Every 5th shot is an execution round: 3x damage, always pierces.',
          apply: w => { w.apexRounds = true; w._apexCounter = 0; w.color = '#fbbf24'; } },
    ],
    sniper: [
        { id: 'oblivion', name: 'OBLIVION ROUNDS', emoji: '🌌', desc: 'Every impact detonates a small shockwave.',
          apply: w => { w.riftShots = true; w.damageMult *= 1.15; w.color = '#4c1d95'; } },
    ],
    shotgun: [
        { id: 'judgeswrath', name: "JUDGE'S WRATH", emoji: '⚡', desc: 'Pellets arc chain lightning between nearby targets.',
          apply: w => { w.chainLightning = true; w.color = '#facc15'; } },
    ],
    machinegun: [
        { id: 'hurricane', name: 'HURRICANE', emoji: '🌀', desc: 'Rounds always pierce one extra target. +1 multishot.',
          apply: w => { w.alwaysPiercing = true; w.multishotAdd = (w.multishotAdd || 0) + 1; w.color = '#0ea5e9'; } },
    ],
    flamethrower: [
        { id: 'hellstorm', name: 'HELLSTORM', emoji: '☄', desc: '+50% damage, wider cone, poison burns far hotter.',
          apply: w => { w.damageMult *= 1.5; w.spreadAdd = (w.spreadAdd || 0) + 1; w.poisonBoost = true; w.color = '#b91c1c'; } },
    ],
    railgun: [
        { id: 'annihilator', name: 'ANNIHILATOR', emoji: '💫', desc: 'Each enemy the beam pierces makes the next hit harder.',
          apply: w => { w.annihilator = true; w.color = '#e0f2fe'; } },
    ],
    grenadelauncher: [
        { id: 'armageddon', name: 'ARMAGEDDON', emoji: '🌋', desc: 'Blast sites keep burning, poisoning anything that stands in them.',
          apply: w => { w.armageddon = true; w.color = '#dc2626'; } },
    ],
};

// ---------------------------------------------------------------------------
// True Awakenings — a second, quieter power spike that fires the moment a
// player finishes the CAPSTONE (final, ALL-CAPS) node of their specialized
// tree's chosen branch. Rewards committing all the way down one path.
// ---------------------------------------------------------------------------
const TRUE_AWAKENINGS = {
    stubA4: { title: '🛡 UNBREAKABLE WILL', lines: '+8% armor, +40 max HP', apply: () => { player.armor += 0.08; player.maxHealth += 40; player.health += 40; } },
    stubB4: { title: '🩸 ETERNAL SPITE', lines: 'Payback and thorns hit far harder', apply: () => { player.paybackPower = (player.paybackPower || 1.35) + 0.3; player.thorns += 0.25; } },
    defA4: { title: '🎯 PERFECT AIM', lines: '+15% crit chance, executes trigger sooner', apply: () => { player.critChance += 0.15; player.executeThreshold += 0.07; } },
    defB4: { title: '🔫 RELENTLESS', lines: 'Faster, harder-hitting fire permanently', apply: () => { player.fireRate = Math.max(player.fireRate * 0.85, MIN_FIRE_RATE); player.damage *= 1.15; } },
    chaosA4: { title: '💥 CHAIN REACTOR', lines: 'Explosions grow larger and hit harder', apply: () => { player.explosionScale = (player.explosionScale || 1) * 1.4; player.damage *= 1.1; } },
    chaosB4: { title: '🌀 MAELSTROM', lines: 'Barrage fires faster and hits harder', apply: () => { player.barrageRateBonus = (player.barrageRateBonus || 0) + 20; player.barrageDamage = (player.barrageDamage || 0) * 1.4; } },
    contraA4: { title: '👻 GHOST STEP', lines: 'Dash cooldown falls further, hits harder', apply: () => { player.dashMaxCooldown = Math.max(20, (player.dashMaxCooldown || 42) - 14); player.dashDamageBoost = true; player.speed *= 1.08; } },
    contraB4: { title: '🫥 UNSEEN', lines: 'Auto-dodge triggers far more often', apply: () => { player.autoDodgeBase = Math.max(90, (player.autoDodgeBase || 165) - 50); player.invulnDuration = Math.max(player.invulnDuration, 100); } },
    reanA4: { title: '💀 BONE EMPEROR', lines: '+2 thralls per drop, harder-hitting horde', apply: () => { player.minionsPerPickup += 2; player.minionDamageMult *= 1.2; } },
    reanB4: { title: '👑 LICH LORD', lines: 'Thralls become far tougher and deadlier', apply: () => { player.minionHealthMult *= 1.3; player.minionDamageMult *= 1.2; player.staffPowerBonus = true; } },
    sabA4: { title: '☣ PLAGUE LORD', lines: 'Poison hits harder and always spreads', apply: () => { player.poisonDamage *= 1.3; player.poisonSpreads = true; } },
    sabB4: { title: '🕶 SHADOW GOVERNMENT', lines: 'Stuns and the slow field grow far stronger', apply: () => { player.stunBonus = (player.stunBonus || 0) + 12; player.slowFieldPower = (player.slowFieldPower || 0.28) + 0.15; } },
    berkA4: { title: '🔥 ASH REBORN', lines: 'Fire burns hotter over a wider pool', apply: () => { player.swordFireDamage *= 1.25; player.firePoolRadius += 10; } },
    berkB4: { title: '⚔ GOD OF WAR', lines: 'The blade and its whirlwind reach new heights', apply: () => { player.swordMult *= 1.2; player.whirlwindCooldownMax = Math.max(60, player.whirlwindCooldownMax - 40); } },
};

// ---------------------------------------------------------------------------
// Wave curses — global modifiers rolled from wave 20 on (never on boss
// waves) that make a wave qualitatively different, not just numerically
// harder. Read through game.modifiers via modVal() in systems.js/engine.js.
// ---------------------------------------------------------------------------
const WAVE_CURSES = [
    { id: 'glassCannon', name: '⚠ GLASS CANNON PROTOCOL', desc: '+35% damage dealt, but your armor is halved this wave.', color: '#f87171',
      apply: () => { game.modifiers.playerDamageMult = 1.35; game.modifiers.armorMult = 0.5; } },
    { id: 'bulletStorm', name: '⚠ BULLET STORM', desc: 'Enemy fire is faster and denser this wave.', color: '#facc15',
      apply: () => { game.modifiers.enemyBulletSpeedMult = 1.4; game.modifiers.enemyFireRateMult = 0.75; } },
    { id: 'ironLegion', name: '⚠ IRON LEGION', desc: 'Enemies field +30% health this wave.', color: '#94a3b8',
      apply: () => { game.modifiers.enemyHealthMult = 1.3; } },
    { id: 'blackoutProtocol', name: '⚠ COMMS BLACKOUT', desc: 'Vision is limited to a small radius this wave.', color: '#7c3aed',
      apply: () => { game.modifiers.fogOfWar = true; } },
];

// ---------------------------------------------------------------------------
// Meta progression — small permanent bonuses unlocked by reaching wave
// milestones, persisted across runs in localStorage.
// ---------------------------------------------------------------------------
const META_KEY = 'contraryLarryMetaV1';
const META_MILESTONES = [
    { wave: 20, label: '+10 max HP', apply: p => { p.maxHealth += 10; p.health += 10; } },
    { wave: 30, label: '+5% damage', apply: p => { p.damage *= 1.05; } },
    { wave: 50, label: '+5% armor', apply: p => { p.armor += 0.05; } },
];
function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}'); }
    catch { return {}; }
}
function saveMeta(meta) { localStorage.setItem(META_KEY, JSON.stringify(meta)); }
function applyMetaBonuses(p) {
    const meta = loadMeta();
    const best = meta.bestWave || 0;
    META_MILESTONES.forEach(m => { if (best >= m.wave) m.apply(p); });
}

const upgrades = [
    // STUBBORNNESS: survival, either pure defense or retaliation.
    { id: 'stub1', tree: 'STUBBORNNESS', branch: 'ROOT', name: 'Thick Skin', desc: 'Larry ignores 10% damage.', max: 2, apply: () => { player.armor += 0.10; } },
    { id: 'stub2', tree: 'STUBBORNNESS', branch: 'ROOT', name: 'Fortified', desc: '+22 max HP.', max: 2, apply: () => { player.maxHealth += 22; player.health += 22; } },
    { id: 'stubA1', tree: 'STUBBORNNESS', branch: 'A', name: 'Bunker Training', desc: 'Enemy bullets hurt 25% less.', max: 1, requires: 'stub1', apply: () => { player.bulletArmor = Math.max(player.bulletArmor || 0, 0.25); }},
    { id: 'stubA2', tree: 'STUBBORNNESS', branch: 'A', name: 'Iron Will', desc: '+30 HP, slow regen.', max: 1, requires: 'stubA1', apply: () => { player.maxHealth += 30; player.health += 30; player.hasRegen = true; }},
    { id: 'stubA3', tree: 'STUBBORNNESS', branch: 'A', name: 'PENULTIMATE: Last Stand', desc: 'Below 35% HP, gain armor and damage.', max: 1, requires: 'stubA2', apply: () => { player.lastStand = true; }},
    { id: 'stubA4', tree: 'STUBBORNNESS', branch: 'A', name: 'IMMOVABLE OBJECT', desc: 'Knockback aura, longer invulnerability.', max: 1, requires: 'stubA3', apply: () => { player.recoil += 2.2; player.hasKnockbackAura = true; player.invulnDuration = Math.max(player.invulnDuration, 95); }},
    { id: 'stubB1', tree: 'STUBBORNNESS', branch: 'B', name: 'Hard Counter', desc: 'Taking contact damage harms nearby enemies.', max: 1, requires: 'stub2', apply: () => { player.thorns = 0.45; }},
    { id: 'stubB2', tree: 'STUBBORNNESS', branch: 'B', name: 'Refusal to Fall', desc: 'Heal 2 HP per kill, +12% armor.', max: 1, requires: 'stubB1', apply: () => { player.lifeSteal += 2; player.armor += 0.12; }},
    { id: 'stubB3', tree: 'STUBBORNNESS', branch: 'B', name: 'PENULTIMATE: Payback', desc: 'When hit, next shots deal more damage.', max: 1, requires: 'stubB2', apply: () => { player.payback = true; player.paybackTimer = 0; }},
    { id: 'stubB4', tree: 'STUBBORNNESS', branch: 'B', name: 'NO SURRENDER', desc: 'Contact damage greatly fuels Payback.', max: 1, requires: 'stubB3', apply: () => { player.paybackPower = 1.65; player.recoil += 1; }},

    // DEFIANCE: single-target boss killing or rapid fire.
    { id: 'def1', tree: 'DEFIANCE', branch: 'ROOT', name: 'Defiant Rounds', desc: '+25% bullet damage.', max: 2, apply: () => { player.damage *= 1.25; } },
    { id: 'def2', tree: 'DEFIANCE', branch: 'ROOT', name: 'Rapid Defiance', desc: '-18% fire-rate delay.', max: 2, apply: () => { player.fireRate *= 0.82; } },
    { id: 'defA1', tree: 'DEFIANCE', branch: 'A', name: 'Armor Piercing', desc: 'Bullets pierce enemies.', max: 1, requires: 'def1', apply: () => { player.piercing = true; } },
    { id: 'defA2', tree: 'DEFIANCE', branch: 'A', name: 'Critical Strike', desc: '22% crit chance, 2x damage.', max: 1, requires: 'defA1', apply: () => { player.critChance = 0.22; } },
    { id: 'defA3', tree: 'DEFIANCE', branch: 'A', name: 'PENULTIMATE: Boss Breaker', desc: 'Deal +35% damage to bosses.', max: 1, requires: 'defA2', apply: () => { player.bossDamageBonus = 1.35; }},
    { id: 'defA4', tree: 'DEFIANCE', branch: 'A', name: 'ONE SHOT, ONE ARGUMENT', desc: 'Crits execute weakened normal enemies.', max: 1, requires: 'defA3', apply: () => { player.executeThreshold = 0.18; player.critReload = true; }},
    { id: 'defB1', tree: 'DEFIANCE', branch: 'B', name: 'Dead Drop Ammo', desc: 'Fire faster after kills.', max: 1, requires: 'def2', apply: () => { player.killDamageBoost = true; player.killBoostTimer = 0; }},
    { id: 'defB2', tree: 'DEFIANCE', branch: 'B', name: 'Magazine Trick', desc: '+1 bullet, slight damage loss.', max: 1, requires: 'defB1', apply: () => { player.multishot += 1; player.damage *= 0.92; }},
    { id: 'defB3', tree: 'DEFIANCE', branch: 'B', name: 'PENULTIMATE: No Witnesses', desc: 'Kills briefly boost damage and reload.', max: 1, requires: 'defB2', apply: () => { player.noWitnesses = true; }},
    { id: 'defB4', tree: 'DEFIANCE', branch: 'B', name: 'OVERWHELMING FORCE', desc: 'Big reload boost without unlimited fire.', max: 1, requires: 'defB3', apply: () => { player.damage *= 1.65; player.fireRate = Math.max(player.fireRate * 0.62, MIN_FIRE_RATE); player.bulletSpeed *= 1.25; }},

    // CHAOS: explosive chain reactions or bullet patterns.
    { id: 'chaos1', tree: 'CHAOS', branch: 'ROOT', name: 'Chaotic Burst', desc: '+1 bullet, -8% damage.', max: 2, apply: () => { player.multishot += 1; player.damage *= 0.92; } },
    { id: 'chaos2', tree: 'CHAOS', branch: 'ROOT', name: 'Scatter Shot', desc: 'Add 1 spread angle.', max: 2, apply: () => { player.spread += 1; } },
    { id: 'chaosA1', tree: 'CHAOS', branch: 'A', name: 'Explosive Dissent', desc: 'Bullets explode on hit.', max: 1, requires: 'chaos1', apply: () => { player.explosiveRounds = true; }},
    { id: 'chaosA2', tree: 'CHAOS', branch: 'A', name: 'Chain Reaction', desc: 'Explosions chain to nearby foes.', max: 1, requires: 'chaosA1', apply: () => { player.chainExplosions = true; }},
    { id: 'chaosA3', tree: 'CHAOS', branch: 'A', name: 'PENULTIMATE: Demolitionist', desc: 'Explosions are larger but bullets are slower.', max: 1, requires: 'chaosA2', apply: () => { player.explosionScale = 1.35; player.bulletSpeed *= 0.90; }},
    { id: 'chaosA4', tree: 'CHAOS', branch: 'A', name: 'TOTAL MAYHEM', desc: 'Explosive kills release fragments.', max: 1, requires: 'chaosA3', apply: () => { player.fragmentKills = true; }},
    { id: 'chaosB1', tree: 'CHAOS', branch: 'B', name: 'Wild Ricochet', desc: 'Some bullets bounce once off walls.', max: 1, requires: 'chaos2', apply: () => { player.ricochet = true; }},
    { id: 'chaosB2', tree: 'CHAOS', branch: 'B', name: 'Unpredictable', desc: '+25% bullet speed.', max: 1, requires: 'chaosB1', apply: () => { player.bulletSpeed *= 1.25; }},
    { id: 'chaosB3', tree: 'CHAOS', branch: 'B', name: 'PENULTIMATE: Spiral Pattern', desc: 'Unlocks a slow rotating barrage.', max: 1, requires: 'chaosB2', apply: () => { player.hasBarrage = true; player.barrageDamage = player.damage * 0.38; }},
    { id: 'chaosB4', tree: 'CHAOS', branch: 'B', name: 'BULLET HELL', desc: 'Barrage fires more often.', max: 1, requires: 'chaosB3', apply: () => { player.barrageRateBonus = 28; }},

    // CONTRARIAN: dash offense or dodge survival.
    { id: 'contra1', tree: 'CONTRARIAN', branch: 'ROOT', name: 'Contrary Steps', desc: '+18% move speed.', max: 2, apply: () => { player.speed *= 1.18; } },
    { id: 'contra2', tree: 'CONTRARIAN', branch: 'ROOT', name: 'Evasive', desc: '+0.20s invulnerability after hit.', max: 2, apply: () => { player.iframeBonus = (player.iframeBonus || 0) + 12; } },
    { id: 'contraA1', tree: 'CONTRARIAN', branch: 'A', name: 'Shadow Step', desc: 'Dash with Space.', max: 1, requires: 'contra1', apply: () => { player.hasDash = true; player.dashCooldown = 0; }},
    { id: 'contraA2', tree: 'CONTRARIAN', branch: 'A', name: 'Smoke Bomb', desc: 'Dash damages nearby enemies.', max: 1, requires: 'contraA1', apply: () => { player.dashBlast = true; }},
    { id: 'contraA3', tree: 'CONTRARIAN', branch: 'A', name: 'PENULTIMATE: Hit and Run', desc: 'After dashing, shots are stronger.', max: 1, requires: 'contraA2', apply: () => { player.dashDamageBoost = true; }},
    { id: 'contraA4', tree: 'CONTRARIAN', branch: 'A', name: 'PERFECT ESCAPE', desc: 'Dash cooldown drops and dash goes farther.', max: 1, requires: 'contraA3', apply: () => { player.dashMaxCooldown = 42; player.dashDistance = 105; }},
    { id: 'contraB1', tree: 'CONTRARIAN', branch: 'B', name: 'Fast Reflexes', desc: '+15% damage and speed.', max: 1, requires: 'contra2', apply: () => { player.damage *= 1.15; player.speed *= 1.15; }},
    { id: 'contraB2', tree: 'CONTRARIAN', branch: 'B', name: 'Spybreaker', desc: 'Auto-dodge every few seconds.', max: 1, requires: 'contraB1', apply: () => { player.autoDodge = true; player.autoDodgeCooldown = 0; }},
    { id: 'contraB3', tree: 'CONTRARIAN', branch: 'B', name: 'PENULTIMATE: Phantom Step', desc: 'Longer invulnerability after auto-dodge.', max: 1, requires: 'contraB2', apply: () => { player.invulnDuration = Math.max(player.invulnDuration, 75); }},
    { id: 'contraB4', tree: 'CONTRARIAN', branch: 'B', name: 'UNTOUCHABLE', desc: 'Auto-dodge cooldown is shorter.', max: 1, requires: 'contraB3', apply: () => { player.autoDodgeBase = 165; }},

    // REANIMATION: quantity or elite ghosts.
    { id: 'rean1', tree: 'REANIMATION', branch: 'ROOT', name: 'Field Reanimation', desc: 'Picking up a drop raises a thrall.', max: 1, apply: () => { player.hasReanimation = true; } },
    { id: 'rean2', tree: 'REANIMATION', branch: 'ROOT', name: 'Bone Orders', desc: 'Thralls deal +30% damage.', max: 1, requires: 'rean1', apply: () => { player.minionDamageMult *= 1.3; }},
    { id: 'reanA1', tree: 'REANIMATION', branch: 'A', name: 'Mass Grave', desc: '+1 thrall per drop.', max: 2, requires: 'rean1', apply: () => { player.minionsPerPickup += 1; }},
    { id: 'reanA2', tree: 'REANIMATION', branch: 'A', name: 'Restless Dead', desc: '12% chance kills rise as thralls.', max: 2, requires: 'reanA1', apply: () => { player.minionSpawnsOnKill += 0.12; }},
    { id: 'reanA3', tree: 'REANIMATION', branch: 'A', name: 'PENULTIMATE: Grave Swarm', desc: 'More thralls, shorter lifespan.', max: 1, requires: 'reanA2', apply: () => { player.minionsPerPickup += 2; player.minionLifespan = Math.max(360, player.minionLifespan - 160); }},
    { id: 'reanA4', tree: 'REANIMATION', branch: 'A', name: 'GRAVE COMMANDER', desc: 'Thrall aura slows enemies. Staff orbs grow larger and hit harder.', max: 1, requires: 'reanA3', apply: () => { player.minionAura = true; player.staffPowerBonus = true; }},
    { id: 'reanB1', tree: 'REANIMATION', branch: 'B', name: 'Embalmed Bones', desc: 'Thralls have +75% health and live longer.', max: 1, requires: 'rean2', apply: () => { player.minionHealthMult *= 1.75; player.minionLifespan += 320; }},
    { id: 'reanB2', tree: 'REANIMATION', branch: 'B', name: 'Spectral Volley', desc: 'Thralls fire ghostly shots.', max: 1, requires: 'reanB1', apply: () => { player.minionShoots = true; }},
    { id: 'reanB3', tree: 'REANIMATION', branch: 'B', name: 'PENULTIMATE: Death Pact', desc: 'Thralls explode when they fall.', max: 1, requires: 'reanB2', apply: () => { player.minionExplodes = true; }},
    { id: 'reanB4', tree: 'REANIMATION', branch: 'B', name: 'SPECTER CAPTAIN', desc: 'Elite thrall stat boost. Staff orbs grow larger and hit harder.', max: 1, requires: 'reanB3', apply: () => { player.minionDamageMult *= 1.65; player.minionHealthMult *= 1.45; player.minionLifespan += 420; player.staffPowerBonus = true; }},

    // SABOTAGE: poison damage or battlefield control.
    { id: 'sab1', tree: 'SABOTAGE', branch: 'ROOT', name: 'Slick Rounds', desc: 'Bullets slow enemies on hit.', max: 2, apply: () => { player.slowOnHit = Math.min(0.42, player.slowOnHit + 0.16); player.slowDuration = Math.max(player.slowDuration, 85); } },
    { id: 'sab2', tree: 'SABOTAGE', branch: 'ROOT', name: 'Soft Targets', desc: 'Hit enemies take +15% damage.', max: 2, requires: 'sab1', apply: () => { player.weakenStrength = Math.min(0.36, player.weakenStrength + 0.15); } },
    { id: 'sabA1', tree: 'SABOTAGE', branch: 'A', name: 'Tainted Ammo', desc: 'Bullets poison enemies over time.', max: 2, requires: 'sab1', apply: () => { player.poisonDamage += 0.45; player.poisonDuration = Math.max(player.poisonDuration, 120); }},
    { id: 'sabA2', tree: 'SABOTAGE', branch: 'A', name: 'Acidic Trail', desc: 'Poison spreads to nearby enemies.', max: 1, requires: 'sabA1', apply: () => { player.poisonSpreads = true; }},
    { id: 'sabA3', tree: 'SABOTAGE', branch: 'A', name: 'PENULTIMATE: Marked for Death', desc: 'Poisoned enemies become marked.', max: 1, requires: 'sabA2', apply: () => { player.saboteurMark = true; }},
    { id: 'sabA4', tree: 'SABOTAGE', branch: 'A', name: 'TOTAL SABOTAGE', desc: 'Poison ticks faster and hits harder.', max: 1, requires: 'sabA3', apply: () => { player.poisonDamage *= 1.85; player.poisonDuration += 70; player.poisonTickFast = true; }},
    { id: 'sabB1', tree: 'SABOTAGE', branch: 'B', name: 'Concussion', desc: '12% chance to stun on hit.', max: 2, requires: 'sab2', apply: () => { player.stunChance = Math.min(0.32, player.stunChance + 0.12); }},
    { id: 'sabB2', tree: 'SABOTAGE', branch: 'B', name: 'False Orders', desc: 'Some hit enemies attack each other.', max: 1, requires: 'sabB1', apply: () => { player.confuseEnemies = true; }},
    { id: 'sabB3', tree: 'SABOTAGE', branch: 'B', name: 'PENULTIMATE: Dead Zone', desc: 'Larry emits a slowing field.', max: 1, requires: 'sabB2', apply: () => { player.slowField = true; }},
    { id: 'sabB4', tree: 'SABOTAGE', branch: 'B', name: 'BLACKOUT PROTOCOL', desc: 'Stuns last longer and field is stronger.', max: 1, requires: 'sabB3', apply: () => { player.stunBonus = 18; player.slowFieldPower = 0.42; }},

    // BERSERKER: the gun is sheathed for a melee sword. Fire or fury.
    { id: 'berk1', tree: 'BERSERKER', branch: 'ROOT', name: 'Drawn Steel', desc: 'Larry ditches the gun and draws a blade. Wide, high-damage cleaving arc that shears through armor. Close-quarters stance grants armor and move speed.', max: 1, apply: () => { player.hasSword = true; player.swordMult = 2.2; player.armor += 0.12; player.speed *= 1.10; } },
    { id: 'berk2', tree: 'BERSERKER', branch: 'ROOT', name: 'Sharpened Edge', desc: '+35% sword damage, faster swings. Slightly wider arc.', max: 2, requires: 'berk1', apply: () => { player.swordMult *= 1.35; player.swordArcWidth = Math.min(Math.PI * 0.85, player.swordArcWidth + 0.1); player.swordSwingRate = Math.max(260, player.swordSwingRate * 0.92); }},
    { id: 'berkA1', tree: 'BERSERKER', branch: 'A', name: 'Blazing Edge', desc: 'Sword ignites. Hit enemies burn over time and fire pools linger on the ground.', max: 1, requires: 'berk1', apply: () => { player.swordOnFire = true; player.swordFireDamage = 6; }},
    { id: 'berkA2', tree: 'BERSERKER', branch: 'A', name: 'Inferno Blade', desc: 'Fire damage doubled. Burning enemies spread flames to nearby foes.', max: 1, requires: 'berkA1', apply: () => { player.swordFireDamage *= 2; }},
    { id: 'berkA3', tree: 'BERSERKER', branch: 'A', name: 'PENULTIMATE: Scorched Earth', desc: 'Fire pools are much larger and last far longer.', max: 1, requires: 'berkA2', apply: () => { player.firePoolRadius = 30; player.firePoolLife = 170; }},
    { id: 'berkA4', tree: 'BERSERKER', branch: 'A', name: 'PYRE LORD', desc: 'Burning enemies below 15% HP combust instantly. Larry radiates a searing aura. +50% fire damage.', max: 1, requires: 'berkA3', apply: () => { player.pyreLord = true; player.swordFireDamage *= 1.5; }},
    { id: 'berkB1', tree: 'BERSERKER', branch: 'B', name: 'Bloodthirst', desc: 'Heal 15% of sword damage dealt.', max: 2, requires: 'berk2', apply: () => { player.swordLifesteal += 0.15; }},
    { id: 'berkB2', tree: 'BERSERKER', branch: 'B', name: 'Whirlwind', desc: 'Every 5 seconds, automatically spin a full 360° arc hitting all nearby enemies.', max: 1, requires: 'berkB1', apply: () => { player.swordWhirlwind = true; player.whirlwindTimer = 300; }},
    { id: 'berkB3', tree: 'BERSERKER', branch: 'B', name: 'PENULTIMATE: Echo & Shock', desc: 'Each swing sends a spectral second strike. Every third swing erupts in a knockback shockwave.', max: 1, requires: 'berkB2', apply: () => { player.swordEchoBlade = true; player.swordShockwave = true; }},
    { id: 'berkB4', tree: 'BERSERKER', branch: 'B', name: 'WAR INCARNATE', desc: 'Colossal spirit blade: +100% damage, huge arc, Whirlwind every 2s, rage triggers at 60% HP.', max: 1, requires: 'berkB3', apply: () => { player.swordMult *= 2; player.swordRange = 90; player.swordArcWidth = Math.PI * 0.9; player.whirlwindCooldownMax = 120; player.berserkerRage = true; player.rageThreshold = 0.6; }},

    // UNIVERSAL upgrades are intentionally limited, so the supply reward choice can appear later.
    { id: 'heal1', tree: 'UNIVERSAL', branch: 'ROOT', name: 'First Aid', desc: 'Restore 40 HP now.', max: 3, apply: () => { player.health = Math.min(player.health + 40, player.maxHealth); } },
    { id: 'uni1', tree: 'UNIVERSAL', branch: 'ROOT', name: 'Field Upgrade', desc: '+15 HP, +8% damage.', max: 3, apply: () => { player.maxHealth += 15; player.health += 15; player.damage *= 1.08; } },
    { id: 'uni2', tree: 'UNIVERSAL', branch: 'ROOT', name: 'Spy Map', desc: '+8% speed, +8% bullet speed.', max: 2, apply: () => { player.speed *= 1.08; player.bulletSpeed *= 1.08; } }
];

// ---------------------------------------------------------------------------
// Stages — rotate every 10 waves. Each brings a backdrop, an obstacle layout,
// and a signature hazard.
// ---------------------------------------------------------------------------
const STAGES = [
    { id: 'warehouse', name: 'THE WAREHOUSE', bg: '#0f3460', grid: 'rgba(0, 255, 65, 0.05)', layout: 'crates', hazard: null },
    { id: 'trainyard', name: 'THE TRAINYARD', bg: '#26221b', grid: 'rgba(250, 204, 21, 0.05)', layout: 'pillars', hazard: 'freight' },
    { id: 'lab', name: 'THE LAB', bg: '#0d2b21', grid: 'rgba(132, 204, 22, 0.06)', layout: 'lab', hazard: 'vents' },
    { id: 'roof', name: "NIKITA'S ROOF", bg: '#1d1b2e', grid: 'rgba(196, 181, 253, 0.05)', layout: 'roof', hazard: 'wind' },
    { id: 'bunker', name: 'THE BUNKER', bg: '#1a1207', grid: 'rgba(251, 146, 60, 0.06)', layout: 'bunker', hazard: 'sentries' },
    { id: 'blacksite', name: 'THE BLACK SITE', bg: '#04070d', grid: 'rgba(96, 165, 250, 0.07)', layout: 'blacksite', hazard: 'pulse' },
];

// Rotates through every stage forever once the roster is exhausted, so wave
// 90 looks as different from wave 50 as wave 20 does from wave 10.
function stageForWave(w) {
    return STAGES[Math.floor((w - 1) / 10) % STAGES.length];
}
