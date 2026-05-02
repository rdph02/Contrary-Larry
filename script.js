const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const larrySprite = new Image();
larrySprite.src = 'spritesheets/characters/larry.png';

const pistolSprite = new Image();
pistolSprite.src = 'spritesheets/weapons/pistol.png';
const sniperSprite = new Image();
sniperSprite.src = 'spritesheets/weapons/pistol.png';
const shotgunSprite = new Image();
shotgunSprite.src = 'spritesheets/weapons/pistol.png';
const machinegunSprite = new Image();
machinegunSprite.src = 'spritesheets/weapons/pistol.png';
const flamethrowerSprite = new Image();
flamethrowerSprite.src = 'spritesheets/weapons/flamethrower.png';
const railgunSprite = new Image();
railgunSprite.src = 'spritesheets/weapons/flamethrower.png';
const grenadelauncherSprite = new Image();
grenadelauncherSprite.src = 'spritesheets/weapons/pistol.png';


const MAX_BULLET_SIZE = 8;
const MAX_BULLET_HITBOX = 12;
const MIN_FIRE_RATE = 50;
const BASE_CANVAS_WIDTH = 800;
const BASE_CANVAS_HEIGHT = 600;
const MAX_CANVAS_WIDTH = 1160;
const MAX_CANVAS_HEIGHT = 860;

let gameState = 'menu';
let previousGameState = 'menu';
let isPaused = false;
let wave = 1;
let score = 0;
let kills = 0;
let waveSpawned = 0;
let waveTarget = 0;
let activeSpawnInterval = null;
let barrageTimer = 0;

const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 10,
    speed: 2.8,
    health: 100,
    maxHealth: 100,
    fireRate: 300, // was 300, smaller is better
    lastShot: 0,
    damage: 15, // was 15, bigger is better
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
    lastHitTime: 0,
    critChance: 0,
    invulnDuration: 30,
    dashCooldown: 0,
    hasDash: false,
    hasRegen: false,
    hasKnockbackAura: false,
    autoDodge: false,
    hasBarrage: false,
    barrageDamage: 0,
    chainExplosions: false,
    // REANIMATION (necromancy) tree state
    hasReanimation: false,
    minionsPerPickup: 1,
    minionDamageMult: 1,
    minionHealthMult: 1,
    minionLifespan: 600, // frames
    minionShoots: false,
    minionExplodes: false,
    minionSpawnsOnKill: 0, // chance %
    minionAura: false,
    // SABOTAGE tree state
    slowOnHit: 0, // 0..1 strength
    slowDuration: 0, // frames
    poisonDamage: 0, // dps multiplier
    poisonDuration: 0, // frames
    weakenStrength: 0, // 0..1, increases damage taken by enemy
    stunChance: 0, // 0..1
    confuseEnemies: false,
    saboteurMark: false, // marked enemies take more damage
    bossDamageBonus: 1,
    executeThreshold: 0,
    thorns: 0,
    slowField: false
};

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let powerups = [];
let minions = [];
let weaponSelected = false;

// Track initial damage for modifier display
const BASE_DAMAGE_START = 15;

// Weapon definitions — base stats are MULTIPLIERS on top of player stats from upgrades
const WEAPONS = [
    {
        id: 'pistol',
        name: 'STANDARD ISSUE',
        emoji: '🔫',
        desc: 'Reliable sidearm. No changes to your current stats.',
        sprite: pistolSprite,
        fireRateMult: 1,
        damageMult: 1,
        bulletSpeedMult: 1,
        multishotAdd: 0,
        spreadAdd: 0,
        flamethrower: false,
        sniper: false,
    },
    {
        id: 'sniper',
        name: 'SNIPER RIFLE',
        emoji: '🎯',
        desc: '+80% damage, +50% bullet speed. Much slower fire rate. Bigger bullet hitbox.',
        sprite: sniperSprite,
        fireRateMult: 2.4,
        damageMult: 1.8,
        bulletSpeedMult: 1.5,
        multishotAdd: 0,
        spreadAdd: 0,
        bulletSizeBonus: 3,
        flamethrower: false,
        sniper: true,
    },
    {
        id: 'shotgun',
        name: 'COMBAT SHOTGUN',
        emoji: '💥',
        desc: '+3 spread, +2 multishot, -20% damage per bullet. Short range.',
        sprite: shotgunSprite,
        fireRateMult: 1.7,
        damageMult: 0.8,
        bulletSpeedMult: 0.7,
        multishotAdd: 2,
        spreadAdd: 3,
        flamethrower: false,
        sniper: false,
    },
    {
        id: 'machinegun',
        name: 'MACHINE GUN',
        emoji: '⚙️',
        desc: '-55% fire rate delay (much faster). -15% damage per bullet. +1 multishot.',
        sprite: machinegunSprite,
        fireRateMult: 0.45,
        damageMult: 0.85,
        bulletSpeedMult: 1.1,
        multishotAdd: 1,
        spreadAdd: 0,
        flamethrower: false,
        sniper: false,
    },
    {
        id: 'flamethrower',
        name: 'FLAMETHROWER',
        emoji: '🔥',
        desc: 'Rapid short-range fire blasts. +3 spread, very fast fire rate, reduced range. Always applies burn.',
        sprite: flamethrowerSprite,
        fireRateMult: 0.22,
        damageMult: 0.45,
        bulletSpeedMult: 0.38,
        multishotAdd: 0,
        spreadAdd: 3,
        flamethrower: true,
        sniper: false,
    },
    {
        id: 'railgun',
        name: 'RAILGUN',
        emoji: '⚡',
        desc: '+120% damage, always piercing, +1 multishot. Very slow fire rate. Bullets arc through everything.',
        sprite: railgunSprite,
        fireRateMult: 3.2,
        damageMult: 2.2,
        bulletSpeedMult: 1.8,
        multishotAdd: 1,
        spreadAdd: 0,
        alwaysPiercing: true,
        flamethrower: false,
        sniper: false,
    },
    {
        id: 'grenadelauncher',
        name: 'GRENADE LAUNCHER',
        emoji: '💣',
        desc: '+60% damage, always explosive on hit (stacks with Explosive Dissent). Slow arc, medium fire rate. Great crowd clearing.',
        sprite: grenadelauncherSprite,
        fireRateMult: 1.55,
        damageMult: 1.6,
        bulletSpeedMult: 0.55,
        multishotAdd: 0,
        spreadAdd: 0,
        alwaysPiercing: false,
        flamethrower: false,
        sniper: false,
        grenade: true,
    },
];

let activeWeapon = WEAPONS[0]; // default pistol


const keys = {};
let mouse = { x: canvas.width/2, y: canvas.height/2, down: false };

const treeNames = ['STUBBORNNESS', 'DEFIANCE', 'CHAOS', 'CONTRARIAN', 'REANIMATION', 'SABOTAGE'];
const SPECIALIZATION_THRESHOLD = 4;
const LEADERBOARD_KEY = 'contraryLarryLocalLeaderboardV1';
const BRANCH_NAMES = {
    STUBBORNNESS: { A: 'BULWARK', B: 'RETALIATION' },
    DEFIANCE: { A: 'SNIPER', B: 'GUNSLINGER' },
    CHAOS: { A: 'EXPLOSIONS', B: 'BARRAGE' },
    CONTRARIAN: { A: 'DASHER', B: 'PHANTOM' },
    REANIMATION: { A: 'HORDE', B: 'SPECTERS' },
    SABOTAGE: { A: 'POISON', B: 'CONTROL' }
};

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
    { id: 'reanA4', tree: 'REANIMATION', branch: 'A', name: 'GRAVE COMMANDER', desc: 'Thrall aura slows enemies.', max: 1, requires: 'reanA3', apply: () => { player.minionAura = true; }},
    { id: 'reanB1', tree: 'REANIMATION', branch: 'B', name: 'Embalmed Bones', desc: 'Thralls have +75% health and live longer.', max: 1, requires: 'rean2', apply: () => { player.minionHealthMult *= 1.75; player.minionLifespan += 320; }},
    { id: 'reanB2', tree: 'REANIMATION', branch: 'B', name: 'Spectral Volley', desc: 'Thralls fire ghostly shots.', max: 1, requires: 'reanB1', apply: () => { player.minionShoots = true; }},
    { id: 'reanB3', tree: 'REANIMATION', branch: 'B', name: 'PENULTIMATE: Death Pact', desc: 'Thralls explode when they fall.', max: 1, requires: 'reanB2', apply: () => { player.minionExplodes = true; }},
    { id: 'reanB4', tree: 'REANIMATION', branch: 'B', name: 'SPECTER CAPTAIN', desc: 'Elite thrall stat boost.', max: 1, requires: 'reanB3', apply: () => { player.minionDamageMult *= 1.65; player.minionHealthMult *= 1.45; player.minionLifespan += 420; }},

    // SABOTAGE: poison damage or battlefield control.
    { id: 'sab1', tree: 'SABOTAGE', branch: 'ROOT', name: 'Slick Rounds', desc: 'Bullets slow enemies on hit.', max: 2, apply: () => { player.slowOnHit = Math.min(0.42, player.slowOnHit + 0.16); player.slowDuration = Math.max(player.slowDuration, 85); } },
    { id: 'sab2', tree: 'SABOTAGE', branch: 'ROOT', name: 'Soft Targets', desc: 'Hit enemies take +15% damage.', max: 2, requires: 'sab1', apply: () => { player.weakenStrength = Math.min(0.36, player.weakenStrength + 0.15); } },
    { id: 'sabA1', tree: 'SABOTAGE', branch: 'A', name: 'Tainted Ammo', desc: 'Bullets poison enemies over time.', max: 2, requires: 'sab1', apply: () => { player.poisonDamage += 0.45; player.poisonDuration = Math.max(player.poisonDuration, 120); }},
    { id: 'sabA2', tree: 'SABOTAGE', branch: 'A', name: 'Acidic Trail', desc: 'Poison spreads to nearby enemies.', max: 1, requires: 'sabA1', apply: () => { player.poisonSpreads = true; }},
    { id: 'sabA3', tree: 'SABOTAGE', branch: 'A', name: 'PENULTIMATE: Marked for Death', desc: 'Poisoned enemies become marked.', max: 1, requires: 'sabA2', apply: () => { player.saboteurMark = true; }},
    { id: 'sabA4', tree: 'SABOTAGE', branch: 'A', name: 'TOTAL SABOTAGE', desc: 'Poison ticks faster and hits harder.', max: 1, requires: 'sabA3', apply: () => { player.poisonDamage *= 1.85; player.poisonDuration += 70; }},
    { id: 'sabB1', tree: 'SABOTAGE', branch: 'B', name: 'Concussion', desc: '12% chance to stun on hit.', max: 2, requires: 'sab2', apply: () => { player.stunChance = Math.min(0.32, player.stunChance + 0.12); }},
    { id: 'sabB2', tree: 'SABOTAGE', branch: 'B', name: 'False Orders', desc: 'Some hit enemies attack each other.', max: 1, requires: 'sabB1', apply: () => { player.confuseEnemies = true; }},
    { id: 'sabB3', tree: 'SABOTAGE', branch: 'B', name: 'PENULTIMATE: Dead Zone', desc: 'Larry emits a slowing field.', max: 1, requires: 'sabB2', apply: () => { player.slowField = true; }},
    { id: 'sabB4', tree: 'SABOTAGE', branch: 'B', name: 'BLACKOUT PROTOCOL', desc: 'Stuns last longer and field is stronger.', max: 1, requires: 'sabB3', apply: () => { player.stunBonus = 18; player.slowFieldPower = 0.42; }},

    // UNIVERSAL upgrades are intentionally limited, so the supply reward choice can appear later.
    { id: 'heal1', tree: 'UNIVERSAL', branch: 'ROOT', name: 'First Aid', desc: 'Restore 40 HP now.', max: 3, apply: () => { player.health = Math.min(player.health + 40, player.maxHealth); } },
    { id: 'uni1', tree: 'UNIVERSAL', branch: 'ROOT', name: 'Field Upgrade', desc: '+15 HP, +8% damage.', max: 3, apply: () => { player.maxHealth += 15; player.health += 15; player.damage *= 1.08; } },
    { id: 'uni2', tree: 'UNIVERSAL', branch: 'ROOT', name: 'Spy Map', desc: '+8% speed, +8% bullet speed.', max: 2, apply: () => { player.speed *= 1.08; player.bulletSpeed *= 1.08; } }
];

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
    player.bulletSize = Math.min(player.bulletSize, MAX_BULLET_SIZE);
    player.fireRate = Math.max(player.fireRate, MIN_FIRE_RATE);
    document.getElementById('upgradeMenu').classList.add('hidden');
    wave++;
    gameState = 'playing';
    spawnWave();
}

function getHealthPackHealAmount() {
    const startPct = 0.20;
    const endPct = 0.05;
    const t = Math.min(1, Math.max(0, (wave - 1) / 24));
    return Math.max(1, player.maxHealth * (startPct + (endPct - startPct) * t));
}

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
    const rows = entries.length
        ? entries.map((e, i) => '<div>' + (i + 1) + '. ' + e.name + ' — ' + e.score + ' pts · W' + e.wave + '</div>').join('')
        : '<div>No scores yet.</div>';
    panel.innerHTML = '<h3>LOCAL HIGH SCORES</h3>' + rows;
}

function submitHighScore() {
    const input = document.getElementById('scoreNameInput');
    const raw = (input ? input.value : 'LARRY').trim().toUpperCase();
    const name = (raw || 'LARRY').replace(/[^A-Z0-9 _-]/g, '').slice(0, 12) || 'LARRY';
    const entries = loadLeaderboard();
    entries.push({ name, score, wave, kills, date: new Date().toLocaleDateString() });
    entries.sort((a, b) => b.score - a.score || b.wave - a.wave || b.kills - a.kills);
    saveLeaderboard(entries);
    const entry = document.getElementById('highScoreEntry');
    if (entry) entry.classList.add('hidden');
    renderLeaderboard('leaderboardGameOver');
}

renderLeaderboard('leaderboardPanel');

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
    if (e.key === ' ' && gameState === 'playing') dash();
});
document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

function startGame() {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('pauseBtn').classList.remove('hidden');
    gameState = 'playing';
    spawnWave();
    gameLoop();
}

function togglePause() {
    if (gameState === 'menu' || gameState === 'gameover' || gameState === 'upgrade') return;
    const menu = document.getElementById('pauseMenu');
    if (!isPaused) {
        previousGameState = gameState;
        gameState = 'paused';
        isPaused = true;
        menu.classList.remove('hidden');
        document.getElementById('pauseBtn').textContent = 'RESUME';
    } else {
        gameState = previousGameState === 'paused' ? 'playing' : previousGameState;
        isPaused = false;
        menu.classList.add('hidden');
        document.getElementById('pauseBtn').textContent = 'PAUSE';
    }
}

function setMapSizeForWave() {
    const growthSteps = Math.min(3, Math.floor((wave - 1) / 4));
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

function spawnWave() {
    setMapSizeForWave();
    waveSpawned = 0;
    waveTarget = 8 + wave * 4 + Math.floor(wave / 3) * 2;
    const spawnDelay = Math.max(150, 500 - wave * 18);
    if (activeSpawnInterval) clearInterval(activeSpawnInterval);
    spawnScheduledBosses();
    activeSpawnInterval = setInterval(() => {
        if (gameState !== 'playing') return;
        if (waveSpawned >= waveTarget) {
            clearInterval(activeSpawnInterval);
            activeSpawnInterval = null;
            return;
        }
        spawnEnemy();
        waveSpawned++;
    }, spawnDelay);
}

function spawnScheduledBosses() {
    if (wave > 0 && wave % 10 === 0) spawnBoss('full');
    else if (wave > 0 && wave % 5 === 0) spawnBoss('mini');
}

function spawnBoss(rank) {
    const full = rank === 'full';
    const scale = 1 + wave * (full ? 0.22 : 0.14);
    const side = Math.floor(Math.random() * 4);
    let x = side === 1 ? canvas.width + 50 : side === 3 ? -50 : Math.random() * canvas.width;
    let y = side === 0 ? -50 : side === 2 ? canvas.height + 50 : Math.random() * canvas.height;
    enemies.push({
        x, y, vx: 0, vy: 0,
        kind: full ? 'nikitaBoss' : 'miniBoss',
        bossRank: rank,
        radius: full ? 34 : 24,
        speed: full ? 1.05 + wave * 0.018 : 1.25 + wave * 0.025,
        health: (full ? 650 : 310) * scale,
        maxHealth: (full ? 650 : 310) * scale,
        contact: full ? 7 + wave * 0.18 : 4.2 + wave * 0.12,
        armor: full ? 0.18 : 0.10,
        shootRate: full ? 55 : 80,
        shootTimer: 35,
        patternTimer: 120,
        summonTimer: full ? 260 : 9999,
        color: full ? '#dc2626' : '#f97316',
        points: full ? 1600 + wave * 90 : 650 + wave * 45
    });
    createParticles(x, y, full ? '#dc2626' : '#f97316', full ? 60 : 35);
}


function chooseEnemyType() {
    const pool = [
        { kind: 'scout', radius: 7, speed: 2.2 + wave * 0.08, health: 25 + wave * 4, contact: 0.8, color: '#00ff41', points: 10 },
        { kind: 'agent', radius: 9, speed: 1.5 + wave * 0.06, health: 45 + wave * 8, contact: 1.2, color: '#ff0041', points: 15 }
    ];
    if (wave >= 2) pool.push({ kind: 'bruiser', radius: 12, speed: 1.0 + wave * 0.04, health: 80 + wave * 12, contact: 2.0, armor: 0.15, color: '#ff6b00', points: 25 });
    if (wave >= 3) pool.push({ kind: 'shield', radius: 10, speed: 1.2 + wave * 0.05, health: 60 + wave * 10, contact: 1.0, armor: 0.25, color: '#c77dff', points: 20 });
    if (wave >= 5) pool.push({ kind: 'marksman', radius: 8, speed: 1.0 + wave * 0.03, health: 55 + wave * 9, contact: 0.7, shootRate: 110, shootTimer: 60, color: '#facc15', points: 35 });
    if (wave >= 7) pool.push({ kind: 'saboteur', radius: 8, speed: 2.6 + wave * 0.05, health: 45 + wave * 7, contact: 2.5, sprintTimer: 0, color: '#fb7185', points: 40 });
    if (wave >= 9) pool.push({ kind: 'handler', radius: 11, speed: 1.1 + wave * 0.03, health: 120 + wave * 14, contact: 1.3, aura: true, color: '#38bdf8', points: 60 });
    if (wave >= 12 && Math.random() < 0.18) pool.push({ kind: 'nikitaGuard', radius: 14, speed: 1.3 + wave * 0.03, health: 220 + wave * 20, contact: 2.8, armor: 0.20, shootRate: 80, shootTimer: 40, color: '#ef4444', points: 120 });
    return pool[Math.floor(Math.random() * pool.length)];
}

function spawnEnemy() {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    if (side === 0) { x = Math.random() * canvas.width; y = -25; }
    else if (side === 1) { x = canvas.width + 25; y = Math.random() * canvas.height; }
    else if (side === 2) { x = Math.random() * canvas.width; y = canvas.height + 25; }
    else { x = -25; y = Math.random() * canvas.height; }
    const type = chooseEnemyType();
    enemies.push({ x, y, vx: 0, vy: 0, ...type, maxHealth: type.health });
}

function shoot() {
    const now = Date.now();
    const w = activeWeapon;
    let currentFireRate = player.fireRate * w.fireRateMult;
    if (player.killBoostTimer > 0) currentFireRate *= 0.85;
    if (now - player.lastShot < currentFireRate) return;
    player.lastShot = now;
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const shots = player.multishot + w.multishotAdd;
    const spreads = player.spread + w.spreadAdd;
    const shotDamage = player.damage * w.damageMult;
    for (let i = 0; i < shots; i++) {
        for (let s = 0; s < spreads; s++) {
            const spreadAngle = (s - (spreads - 1) / 2) * 0.25;
            // Flamethrower adds extra random scatter
            const jitter = w.flamethrower ? (Math.random() - 0.5) * 0.45 : (Math.random() - 0.5) * 0.08;
            const finalAngle = angle + spreadAngle + jitter;
            bullets.push(makeBullet(player.x, player.y, finalAngle, shotDamage, w));
        }
    }
}

function makeBullet(x, y, angle, damage, w) {
    w = w || activeWeapon;
    const speed = player.bulletSpeed * w.bulletSpeedMult;
    const sizeBonus = w.bulletSizeBonus || 0;
    const size = Math.min(player.bulletSize + sizeBonus, MAX_BULLET_SIZE);
    const isPiercing = player.piercing || w.alwaysPiercing;
    return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: size,
        hitRadius: Math.min(size * 1.5, MAX_BULLET_HITBOX),
        damage,
        piercing: isPiercing,
        hits: 0,
        age: 0,
        bounces: player.ricochet ? 1 : 0,
        flamethrower: w.flamethrower || false,
        grenade: w.grenade || false
    };
}

function fireBarrage() {
    if (!player.hasBarrage) return;
    barrageTimer--;
    const rate = Math.max(20, 70 - (player.barrageRateBonus || 0));
    if (barrageTimer > 0) return;
    barrageTimer = rate;
    for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 / 12) * i + Date.now() / 500;
        bullets.push(makeBullet(player.x, player.y, angle, player.barrageDamage || player.damage * 0.5));
    }
}

function dash() {
    if (!player.hasDash || player.dashCooldown > 0) return;
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const dashDist = player.dashDistance || 80;
    player.x += Math.cos(angle) * dashDist;
    player.y += Math.sin(angle) * dashDist;
    if (player.dashDamageBoost) player.dashBoostTimer = 90;
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    player.iframes = 35;
    player.dashCooldown = player.dashMaxCooldown || 70;
    createParticles(player.x, player.y, '#9bf6ff', 25);
    if (player.dashBlast) {
        enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < 90) e.health -= player.damage * 1.2;
        });
    }
}

function update() {
    if (gameState !== 'playing') return;
    if (player.iframes > 0) player.iframes--;
    if (player.dashCooldown > 0) player.dashCooldown--;
    if (player.autoDodgeCooldown > 0) player.autoDodgeCooldown--;
    if (player.killBoostTimer > 0) player.killBoostTimer--;
    if (player.paybackTimer > 0) player.paybackTimer--;
    if (player.dashBoostTimer > 0) player.dashBoostTimer--;
    if (player.hasRegen && waveSpawned % 6 === 0 && Math.random() < 0.02) player.health = Math.min(player.maxHealth, player.health + 0.25);
    
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (dx || dy) {
        const mag = Math.hypot(dx, dy);
        player.x += (dx / mag) * player.speed;
        player.y += (dy / mag) * player.speed;
    }
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    
    if (mouse.down) shoot();
    fireBarrage();
    updateBullets();
    updateEnemies();
    updateEnemyBullets();
    updateMinions();
    updatePowerupsAndParticles();
    
    if (enemies.length === 0 && waveSpawned >= waveTarget && gameState === 'playing') {
        gameState = 'upgrade';
        if (wave === 10 && !weaponSelected) {
            showWeaponMenu();
        } else {
            showUpgradeMenu();
        }
    }
    if (player.health <= 0) gameOver();
    updateUI();
}

function updateBullets() {
    bullets = bullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.age++;
        // Grenade arc: slight gravity pull
        if (b.grenade) b.vy += 0.12;
        const maxAge = b.flamethrower ? 30 : 120;
        if (b.bounces > 0 && (b.x < 0 || b.x > canvas.width)) { b.vx *= -1; b.bounces--; }
        if (b.bounces > 0 && (b.y < 0 || b.y > canvas.height)) { b.vy *= -1; b.bounces--; }
        const alive = b.x > -30 && b.x < canvas.width + 30 && b.y > -30 && b.y < canvas.height + 30 && b.age < maxAge;
        // Grenade explodes when it expires (hits the ground / goes off-screen)
        if (!alive && b.grenade) createExplosion(b.x, b.y, player.chainExplosions);
        return alive;
    });
    bullets.forEach(b => {
        enemies.forEach(e => {
            const dist = Math.hypot(b.x - e.x, b.y - e.y);
            if (dist < b.hitRadius + e.radius) {
                const armor = e.armor || 0;
                let dmg = b.damage;
                const crit = Math.random() < (player.critChance || 0);
                if (crit) {
                    dmg *= 2;
                    if (player.critReload) player.lastShot -= player.fireRate * 0.35;
                }
                if (player.lastStand && player.health < player.maxHealth * 0.35) dmg *= 1.35;
                if (player.killBoostTimer > 0) dmg *= player.noWitnesses ? 1.38 : 1.22;
                if (player.paybackTimer > 0) dmg *= (player.paybackPower || 1.35);
                if (player.dashBoostTimer > 0) dmg *= 1.28;
                if (e.bossRank) dmg *= (player.bossDamageBonus || 1);
                // Sabotage: weakened enemies take more damage
                if (player.weakenStrength > 0 && e._weakTimer > 0) dmg *= (1 + player.weakenStrength);
                // Sabotage: marked enemies take +60% damage
                if (player.saboteurMark && e._marked) dmg *= 1.6;
                e.health -= dmg * (1 - armor);
                if (crit && player.executeThreshold > 0 && !e.bossRank && e.maxHealth && e.health < e.maxHealth * player.executeThreshold) e.health = 0;
                // Apply Sabotage status effects (skip if bullet from minion to keep minions from stacking buffs unfairly)
                if (!b.fromMinion) {
                    if (player.slowOnHit > 0) {
                        e._slowAmount = Math.max(e._slowAmount || 0, player.slowOnHit);
                        e._slowTimer = Math.max(e._slowTimer || 0, player.slowDuration);
                    }
                    // Flamethrower always burns even without Sabotage upgrades
                    if (b.flamethrower) {
                        e._poisonDps = Math.max(e._poisonDps || 0, player.poisonDamage > 0 ? player.poisonDamage : 0.3);
                        e._poisonTimer = Math.max(e._poisonTimer || 0, player.poisonDuration > 0 ? player.poisonDuration : 80);
                    } else if (player.poisonDamage > 0) {
                        e._poisonDps = Math.max(e._poisonDps || 0, player.poisonDamage);
                        e._poisonTimer = Math.max(e._poisonTimer || 0, player.poisonDuration);
                    }
                    if (player.weakenStrength > 0) e._weakTimer = 60;
                    if (player.stunChance > 0 && Math.random() < player.stunChance) e._stunTimer = 30 + (player.stunBonus || 0);
                    if (player.saboteurMark && (e._poisonTimer > 0 || Math.random() < 0.2)) e._marked = true;
                    if (player.confuseEnemies && Math.random() < 0.10) e._confused = 90;
                }
                if (player.explosiveRounds || b.grenade) createExplosion(e.x, e.y, player.chainExplosions);
                if (player.recoil > 0) {
                    const knockbackAngle = Math.atan2(e.y - player.y, e.x - player.x);
                    e.x += Math.cos(knockbackAngle) * player.recoil * 6;
                    e.y += Math.sin(knockbackAngle) * player.recoil * 6;
                }
                if (!b.piercing) b.x = -999;
                else if (++b.hits > 3) b.x = -999;
                createParticles(e.x, e.y, crit ? '#ffffff' : e.color, crit ? 10 : 5);
            }
        });
    });
}

function updateEnemies() {
    enemies.forEach(e => {
        // Status effect timers
        if (e._slowTimer > 0) e._slowTimer--; else e._slowAmount = 0;
        if (e._stunTimer > 0) e._stunTimer--;
        if (e._weakTimer > 0) e._weakTimer--;
        if (e._confused > 0) e._confused--;
        if (e._minionSlow > 0) e._minionSlow--;
        if (e._poisonTimer > 0) {
            e._poisonTimer--;
            const poisonInterval = (player.slowOnHit > 0.6 ? 8 : 16); // Total Sabotage doubles tick rate
            if (e._poisonTimer % poisonInterval === 0) {
                e.health -= e._poisonDps;
                if (player.poisonSpreads) {
                    enemies.forEach(other => {
                        if (other !== e && Math.hypot(other.x - e.x, other.y - e.y) < 60 && (other._poisonTimer || 0) <= 0) {
                            other._poisonDps = e._poisonDps * 0.7;
                            other._poisonTimer = 60;
                        }
                    });
                }
                if (Math.random() < 0.3) createParticles(e.x, e.y, '#84cc16', 2);
            }
        }

        // Stunned enemies don't move or shoot
        if (e._stunTimer > 0) return;

        // Determine target. Confused enemies target each other (or a minion)
        let targetX = player.x;
        let targetY = player.y;
        if (e._confused > 0) {
            const others = enemies.filter(o => o !== e);
            if (others.length > 0) {
                const o = others[Math.floor(Math.random() * Math.min(3, others.length))];
                targetX = o.x; targetY = o.y;
            }
        }

        const dx = targetX - e.x;
        const dy = targetY - e.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        let speed = e.speed;
        if (e.kind === 'saboteur') {
            e.sprintTimer = (e.sprintTimer || 0) + 1;
            if (e.sprintTimer % 160 > 115) speed *= 1.8;
        }
        if (e.kind === 'marksman' && dist < 250) speed *= 0.25;
        if (e.bossRank && dist < 180) speed *= 0.55;
        // Apply slow from sabotage / minion aura
        const slowFromBullets = e._slowAmount || 0;
        const slowFromMinions = e._minionSlow > 0 ? 0.35 : 0;
        const slowFromField = player.slowField && Math.hypot(e.x - player.x, e.y - player.y) < 155 ? (player.slowFieldPower || 0.28) : 0;
        const totalSlow = Math.min(0.85, slowFromBullets + slowFromMinions + slowFromField);
        speed *= (1 - totalSlow);
        e.vx = (dx / dist) * speed;
        e.vy = (dy / dist) * speed;
        e.x += e.vx;
        e.y += e.vy;
        
        if (e.shootRate) {
            e.shootTimer--;
            if (e.shootTimer <= 0) {
                e.shootTimer = Math.max(35, e.shootRate - wave * 2);
                const a = Math.atan2(player.y - e.y, player.x - e.x);
                const bulletSpeed = e.bossRank ? (e.bossRank === 'full' ? 4.1 : 3.7) : 3.2;
                const bulletDamage = e.bossRank === 'full' ? 11 + wave * 0.12 : e.bossRank === 'mini' ? 8 + wave * 0.08 : (e.kind === 'nikitaGuard' ? 8 : 5);
                enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * bulletSpeed, vy: Math.sin(a) * bulletSpeed, radius: e.bossRank ? 5 : 4, damage: bulletDamage, age: 0, color: e.bossRank ? '#ff0041' : (e.kind === 'nikitaGuard' ? '#ef4444' : '#facc15') });
            }
        }
        if (e.bossRank) updateBossPattern(e);
        if (e.aura && Math.random() < 0.03) createParticles(e.x, e.y, '#38bdf8', 1);
    });
    
    enemies = enemies.filter(e => {
        if (e.health <= 0) {
            score += e.points;
            kills++;
            if (player.killDamageBoost) player.killBoostTimer = 120;
            if (player.lifeSteal > 0) player.health = Math.min(player.health + player.lifeSteal, player.maxHealth);
            createParticles(e.x, e.y, e.color, 15);
            if (Math.random() < 0.10) powerups.push({ x: e.x, y: e.y, type: Math.random() < 0.65 ? 'health' : 'damage', radius: 7 });
            // REANIMATION: Restless Dead — chance to raise enemy as thrall
            if (player.minionSpawnsOnKill > 0 && Math.random() < player.minionSpawnsOnKill) {
                spawnMinionsAt(e.x, e.y, 1);
            }
            if (player.fragmentKills && Math.random() < 0.45) {
                for (let i = 0; i < 6; i++) bullets.push(makeBullet(e.x, e.y, (Math.PI * 2 / 6) * i, player.damage * 0.35));
            }
            return false;
        }
        return true;
    });
    
    const now = Date.now();
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < e.radius + player.radius) {
            if (player.iframes <= 0 && now - player.lastHitTime > 90) {
                const reduction = Math.max(0, Math.min(0.75, player.armor + (player.lastStand && player.health < player.maxHealth * 0.35 ? 0.20 : 0)));
                player.health -= e.contact * (1 - reduction);
                player.lastHitTime = now;
                player.iframes = (player.invulnDuration || 30) + (player.iframeBonus || 0);
                if (player.payback) player.paybackTimer = 150;
                if (player.thorns > 0) e.health -= player.damage * player.thorns;
            }
            const pushAngle = Math.atan2(e.y - player.y, e.x - player.x);
            const pushForce = 3.5;
            e.x += Math.cos(pushAngle) * pushForce;
            e.y += Math.sin(pushAngle) * pushForce;
        }
        if (player.hasKnockbackAura && dist < 75) {
            const a = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(a) * 1.5;
            e.y += Math.sin(a) * 1.5;
        }
    });
}

function updateBossPattern(e) {
    e.patternTimer--;
    e.summonTimer--;
    if (e.patternTimer <= 0) {
        e.patternTimer = e.bossRank === 'full' ? Math.max(75, 145 - wave * 2) : Math.max(95, 170 - wave * 2);
        const count = e.bossRank === 'full' ? 16 : 10;
        const speed = e.bossRank === 'full' ? 3.3 + wave * 0.035 : 2.8 + wave * 0.025;
        for (let i = 0; i < count; i++) {
            const a = (Math.PI * 2 / count) * i + Date.now() / 650;
            enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, radius: e.bossRank === 'full' ? 5 : 4, damage: e.bossRank === 'full' ? 8 + wave * 0.10 : 5 + wave * 0.08, age: 0, color: e.bossRank === 'full' ? '#dc2626' : '#f97316' });
        }
        createParticles(e.x, e.y, e.bossRank === 'full' ? '#dc2626' : '#f97316', 20);
    }
    if (e.summonTimer <= 0) {
        e.summonTimer = Math.max(190, 330 - wave * 3);
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const type = chooseEnemyType();
            enemies.push({ x: e.x + Math.cos(a) * 45, y: e.y + Math.sin(a) * 45, vx: 0, vy: 0, ...type, health: type.health * 0.65, maxHealth: type.health * 0.65, points: Math.floor(type.points * 0.5) });
        }
    }
}


function updateEnemyBullets() {
    enemyBullets = enemyBullets.filter(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.age++;
        const dist = Math.hypot(b.x - player.x, b.y - player.y);
        if (dist < b.radius + player.radius) {
            if (player.autoDodge && player.autoDodgeCooldown <= 0) {
                player.iframes = 35;
                player.autoDodgeCooldown = player.autoDodgeBase || 240;
                createParticles(player.x, player.y, '#ffffff', 15);
                return false;
            }
            if (player.iframes <= 0) {
                const reduction = Math.max(0, Math.min(0.75, (player.bulletArmor || 0) + player.armor * 0.5));
                player.health -= b.damage * (1 - reduction);
                player.iframes = 20 + (player.iframeBonus || 0);
            }
            return false;
        }
        return b.x > -20 && b.x < canvas.width + 20 && b.y > -20 && b.y < canvas.height + 20 && b.age < 240;
    });
}

function updateMinions() {
    minions = minions.filter(m => {
        m.life--;
        if (m.life <= 0 || m.health <= 0) {
            if (player.minionExplodes) {
                enemies.forEach(e => {
                    if (Math.hypot(e.x - m.x, e.y - m.y) < 70) e.health -= m.damage * 1.5;
                });
                createParticles(m.x, m.y, '#a78bfa', 28);
            } else {
                createParticles(m.x, m.y, '#7c3aed', 10);
            }
            return false;
        }
        return true;
    });

    minions.forEach(m => {
        let target = null;
        let bestDist = 99999;
        enemies.forEach(e => {
            const d = Math.hypot(e.x - m.x, e.y - m.y);
            if (d < bestDist) { bestDist = d; target = e; }
        });
        if (target) {
            const a = Math.atan2(target.y - m.y, target.x - m.x);
            m.vx = Math.cos(a) * m.speed;
            m.vy = Math.sin(a) * m.speed;
            m.x += m.vx;
            m.y += m.vy;
            // Melee contact
            if (bestDist < target.radius + m.radius) {
                target.health -= m.damage * 0.08; // per-frame damage tick
                if (player.minionAura) target._minionSlow = 30;
            }
            // Aura slow
            if (player.minionAura) {
                enemies.forEach(e => {
                    if (Math.hypot(e.x - m.x, e.y - m.y) < 80) e._minionSlow = Math.max(e._minionSlow || 0, 10);
                });
            }
            // Shooting
            if (player.minionShoots) {
                m.shootTimer--;
                if (m.shootTimer <= 0 && bestDist < 260) {
                    m.shootTimer = 75;
                    const ang = Math.atan2(target.y - m.y, target.x - m.x);
                    bullets.push({
                        x: m.x, y: m.y,
                        vx: Math.cos(ang) * 5,
                        vy: Math.sin(ang) * 5,
                        radius: 3,
                        hitRadius: 5,
                        damage: m.damage * 0.7,
                        piercing: false,
                        hits: 0,
                        age: 0,
                        bounces: 0,
                        fromMinion: true
                    });
                }
            }
        }
        // Take damage from contact with enemies
        enemies.forEach(e => {
            const d = Math.hypot(e.x - m.x, e.y - m.y);
            if (d < e.radius + m.radius) {
                m.health -= e.contact * 0.5;
            }
        });
    });
}

function drawMinion(m) {
    const x = m.x, y = m.y, s = 2;
    shadow(x, y, m.radius * 2, m.radius * 1.2);
    // Translucent ghost-spy: pale cap, sunken face, faded coat.
    ctx.globalAlpha = 0.85;
    px(x - 6, y - 7, 6, 7, '#4c1d95', s);
    px(x - 4, y - 12, 4, 4, '#e9d5ff', s);
    px(x - 5, y - 14, 5, 2, '#7c3aed', s);
    px(x - 2, y - 11, 1, 1, '#000', s);
    px(x + 2, y - 11, 1, 1, '#000', s);
    px(x - 4, y + 6, 2, 4, '#1e1b4b', s);
    px(x + 2, y + 6, 2, 4, '#1e1b4b', s);
    ctx.globalAlpha = 1;
    // life bar
    const w = 18;
    const pct = Math.max(0, m.health / m.maxHealth);
    ctx.fillStyle = '#000';
    ctx.fillRect(x - w/2, y - 18, w, 3);
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(x - w/2, y - 18, w * pct, 3);
}

function updatePowerupsAndParticles() {
    powerups = powerups.filter(p => {
        const dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist < p.radius + player.radius) {
            if (p.type === 'health') player.health = Math.min(player.health + getHealthPackHealAmount(), player.maxHealth);
            else player.damage *= 1.04;
            createParticles(p.x, p.y, '#ffff00', 10);
            if (player.hasReanimation) spawnMinionsAt(p.x, p.y, player.minionsPerPickup);
            return false;
        }
        return true;
    });
    particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        return p.life > 0;
    });
}

function spawnMinionsAt(x, y, count) {
    for (let i = 0; i < count; i++) {
        const offsetA = Math.random() * Math.PI * 2;
        minions.push({
            x: x + Math.cos(offsetA) * 12,
            y: y + Math.sin(offsetA) * 12,
            vx: 0, vy: 0,
            radius: 8,
            speed: 2.0,
            health: 30 * player.minionHealthMult,
            maxHealth: 30 * player.minionHealthMult,
            damage: 10 * player.minionDamageMult,
            contact: 0.5,
            life: player.minionLifespan,
            shootTimer: 30 + Math.floor(Math.random() * 30)
        });
    }
    createParticles(x, y, '#a78bfa', 18);
}

function updateUI() {
    document.getElementById('wave').textContent = wave;
    document.getElementById('score').textContent = score;
    document.getElementById('kills').textContent = kills;
    document.getElementById('healthBar').style.width = Math.max(0, player.health / player.maxHealth * 100) + '%';
    // Damage modifier relative to starting base
    const modRaw = player.damage / BASE_DAMAGE_START;
    document.getElementById('dmgMod').textContent = 'x' + modRaw.toFixed(2);
    // Weapon display
    if (weaponSelected && activeWeapon.id !== 'pistol') {
        document.getElementById('weaponDisplay').style.display = '';
        document.getElementById('weaponName').textContent = activeWeapon.name;
    }
}

function createParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push({ x, y, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.5) * 5, color, life: 20 + Math.random() * 25 });
    }
}

function createExplosion(x, y, chain = false) {
    enemies.forEach(e => {
        const dist = Math.hypot(e.x - x, e.y - y);
        const boomRadius = 55 * (player.explosionScale || 1);
        if (dist < boomRadius) {
            e.health -= player.damage * 0.45 * (player.explosionScale || 1);
            if (chain && dist > 8 && Math.random() < 0.25) createParticles(e.x, e.y, '#ff6b00', 12);
        }
    });
    createParticles(x, y, '#ff6b00', 35);
}

function px(x, y, w, h, color, scale = 2) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w * scale, h * scale);
}
function shadow(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - w / 2, y + h / 2, w, 5);
}

function px(x, y, w, h, color, scale = 2) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w * scale, h * scale);
}

function shadow(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - w / 2, y + h / 2, w, 5);
}

function drawLarry() {
    const x = player.x;
    const y = player.y;
    const angle = Math.atan2(mouse.y - y, mouse.x - x);

    const width = 32;
    const height = 32;

    const weaponW = 24;
    const weaponH = 12;

    const gunOffsetY = 0;
    const offsetX = 10;
    const offsetY = 0;

    if (player.iframes > 0 && Math.floor(Date.now() / 100) % 2 === 0) {
        ctx.globalAlpha = 0.5;
    }

    shadow(x, y, width, height-2);

    // --- DRAW LARRY ---
    ctx.save();
    ctx.translate(x, y);

    ctx.drawImage(
        larrySprite,
        -width / 2,
        -height / 2,
        width,
        height
    );

    ctx.restore();

    // --- DRAW WEAPON ON TOP ---
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.drawImage(
        activeWeapon.sprite,
        -weaponW / 2 + offsetX,
        -weaponH / 2 + offsetY,
        weaponW,
        weaponH
    );

    ctx.restore();

    // --- AIM LINE (unchanged) ---
    const aimLength = 18;

    // --- BULLET PREVIEW ---
    const bulletOffset = 16;

    px(
        x + Math.cos(angle) * bulletOffset - 2,
        y + gunOffsetY + Math.sin(angle) * bulletOffset - 2,
        3,
        3,
        '#00ff41',
        1
    );

    ctx.globalAlpha = 1;
}

function drawAgent(e) {
    const x = e.x, y = e.y, s = 2;
    shadow(x, y, e.radius * 2.3, e.radius * 1.4);
    const coatColors = { scout: '#064e3b', agent: '#2b2d42', bruiser: '#7f1d1d', shield: '#3b0764', marksman: '#713f12', saboteur: '#881337', handler: '#075985', nikitaGuard: '#450a0a' };
    const coat = coatColors[e.kind] || '#2b2d42';
    // Nikita's agents: masculine spy silhouettes with coats, boots, hats, and no feminine sprite cues.
    px(x - 7, y - 9, 7, 9, coat, s);
    px(x - 5, y - 15, 5, 5, '#f1c27d', s);
    px(x - 6, y - 11, 6, 2, '#7c2d12', s); // jaw/beard line
    px(x - 7, y - 17, 7, 2, e.kind === 'nikitaGuard' ? '#ef4444' : '#8b0000', s);
    px(x - 9, y - 13, 2, 5, e.kind === 'nikitaGuard' ? '#ef4444' : '#8b0000', s);
    px(x + 8, y - 13, 2, 5, e.kind === 'nikitaGuard' ? '#ef4444' : '#8b0000', s);
    px(x - 5, y + 8, 2, 5, '#111', s);
    px(x + 4, y + 8, 2, 5, '#111', s);
    px(x - 3, y - 13, 1, 1, '#000', s);
    px(x + 4, y - 13, 1, 1, '#000', s);
    if (e.kind === 'marksman' || e.kind === 'nikitaGuard') {
        px(x + 7, y - 5, 8, 1, '#f8fafc', s);
    }
    if (e.kind === 'saboteur') {
        px(x - 10, y - 4, 3, 3, '#fb7185', s);
        px(x + 8, y - 4, 3, 3, '#fb7185', s);
    }
    if (e.kind === 'handler') {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.stroke();
    }
    if (e.kind === 'shield') {
        ctx.strokeStyle = '#c77dff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 13, y - 15, 26, 30);
    }
    if (e.kind === 'nikitaGuard') {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(x - 16, y - 18, 32, 36);
    }
    if (e.bossRank) {
        const bossColor = e.bossRank === 'full' ? '#dc2626' : '#f97316';
        ctx.strokeStyle = bossColor;
        ctx.lineWidth = e.bossRank === 'full' ? 4 : 3;
        ctx.strokeRect(x - e.radius, y - e.radius, e.radius * 2, e.radius * 2);
        px(x - 10, y - 25, 10, 3, bossColor, s);
        px(x - 8, y - 30, 8, 2, '#111827', s);
        const pct = Math.max(0, e.health / e.maxHealth);
        ctx.fillStyle = '#000';
        ctx.fillRect(x - 28, y - e.radius - 12, 56, 5);
        ctx.fillStyle = bossColor;
        ctx.fillRect(x - 28, y - e.radius - 12, 56 * pct, 5);
    }
}

function draw() {
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
    for (let i = 0; i < canvas.height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }
    
    particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life / 40; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); });
    ctx.globalAlpha = 1;
    powerups.forEach(p => { ctx.fillStyle = p.type === 'health' ? '#ff0080' : '#ffff00'; ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2); });
    bullets.forEach(b => {
        if (b.fromMinion) { ctx.fillStyle = '#a78bfa'; }
        else if (b.flamethrower) { ctx.fillStyle = '#ff4500'; }
        else if (b.grenade) { ctx.fillStyle = '#4ade80'; ctx.strokeStyle = '#166534'; }
        else { ctx.fillStyle = player.explosiveRounds ? '#ff6b00' : '#00ff41'; }
        if (b.grenade) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
            ctx.fillStyle = '#4ade80';
            ctx.fill();
            ctx.strokeStyle = '#166534';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            ctx.fillRect(b.x - b.radius, b.y - b.radius, b.radius * 2, b.radius * 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
        }
    });
    enemyBullets.forEach(b => { ctx.fillStyle = b.color || '#facc15'; ctx.fillRect(b.x - b.radius, b.y - b.radius, b.radius * 2, b.radius * 2); });
    enemies.forEach(e => {
        drawAgent(e);
        // Status effect indicators
        if (e._poisonTimer > 0) {
            ctx.fillStyle = 'rgba(132, 204, 22, 0.35)';
            ctx.fillRect(e.x - e.radius - 2, e.y - e.radius - 2, e.radius * 2 + 4, e.radius * 2 + 4);
        }
        if (e._slowTimer > 0) {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (e._stunTimer > 0) {
            ctx.fillStyle = '#facc15';
            ctx.fillRect(e.x - 2, e.y - e.radius - 8, 4, 4);
        }
        if (e._marked) {
            ctx.strokeStyle = '#ff0041';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(e.x - 6, e.y - e.radius - 10);
            ctx.lineTo(e.x + 6, e.y - e.radius - 4);
            ctx.moveTo(e.x + 6, e.y - e.radius - 10);
            ctx.lineTo(e.x - 6, e.y - e.radius - 4);
            ctx.stroke();
        }
    });
    minions.forEach(drawMinion);
    drawLarry();
    
    if (gameState === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function showFallbackRewards(options) {
    const healCard = document.createElement('div');
    healCard.className = 'upgrade-card';
    healCard.innerHTML = `<span class="tree-tag">SUPPLY DROP</span><h3>FIELD MEDIC</h3><p>Heal 25% of max HP.</p>`;
    healCard.onclick = () => chooseReward('heal');
    options.appendChild(healCard);
    const scoreCard = document.createElement('div');
    scoreCard.className = 'upgrade-card';
    scoreCard.innerHTML = `<span class="tree-tag">SUPPLY DROP</span><h3>INTEL CACHE</h3><p>Gain 500 points.</p>`;
    scoreCard.onclick = () => chooseReward('score');
    options.appendChild(scoreCard);
}

function chooseReward(type) {
    if (type === 'heal') player.health = Math.min(player.maxHealth, player.health + player.maxHealth * 0.25);
    if (type === 'score') score += 500;
    document.getElementById('upgradeMenu').classList.add('hidden');
    wave++;
    gameState = 'playing';
    spawnWave();
}

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
    // Try to show variety: pick at most 1-2 cards per tree so all available paths are visible
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    const choices = [];
    const treeCount = {};
    for (const u of shuffled) {
        if ((treeCount[u.tree] || 0) >= (player.chosenTree ? 2 : 1)) continue;
        choices.push(u);
        treeCount[u.tree] = (treeCount[u.tree] || 0) + 1;
        if (choices.length >= 4) break;
    }
    // Fill remaining slots ignoring per-tree cap if we couldn't reach 4
    if (choices.length < 4) {
        for (const u of shuffled) {
            if (choices.includes(u)) continue;
            choices.push(u);
            if (choices.length >= 4) break;
        }
    }
    if (available.length === 0) {
        menu.querySelector('p').innerHTML = `Wave ${wave} survived! No upgrades remain because your path is complete or locked out. Choose a supply reward.`;
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

        // Lock-warning preview for available cards
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
            card.onclick = () => chooseUpgrade(upgrade);
        }
        options.appendChild(card);
    });
    menu.querySelector('p').innerHTML = `Wave ${wave} survived! ${player.chosenTree ? 'Specialized path: ' + player.chosenTree + '.' : 'Choose carefully — 4 picks in one main tree locks the others.'}`;
    menu.classList.remove('hidden');
}

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
                ${w.multishotAdd > 0 ? '+'+w.multishotAdd+' shots · ' : ''}
                ${w.spreadAdd > 0 ? '+'+w.spreadAdd+' spread · ' : ''}
                ${w.alwaysPiercing ? 'ALWAYS PIERCING · ' : ''}
                ${w.flamethrower ? 'ALWAYS BURNS · ' : ''}
                ${w.sniper ? 'BIGGER BULLETS · ' : ''}
                Stacks with all upgrades.
            </div>`;
        card.onclick = () => selectWeapon(w);
        options.appendChild(card);
    });
    menu.classList.remove('hidden');
}

function selectWeapon(w) {
    activeWeapon = w;
    weaponSelected = true;
    document.getElementById('weaponMenu').classList.add('hidden');
    // After weapon selection, show the normal upgrade menu
    showUpgradeMenu();
}

function gameOver() {
    gameState = 'gameover';
    if (activeSpawnInterval) clearInterval(activeSpawnInterval);
    document.getElementById('pauseBtn').classList.add('hidden');
    document.getElementById('finalWave').textContent = wave;
    document.getElementById('finalScore').textContent = score;
    renderLeaderboard('leaderboardGameOver');
    document.getElementById('gameOver').classList.remove('hidden');
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}
