// ============================================================================
// systems.js — player, weapons, bullets, enemies, bosses, minions, pickups.
// ============================================================================

// Base damage routed through the active weapon — abilities (explosions,
// thorns, dash blast, barrage, fragments) scale off this so weapon choice
// matters for them too.
function effectiveDamage() {
    return player.damage * activeWeapon.damageMult * modVal('playerDamageMult', 1);
}

function updatePlayer() {
    if (player.iframes > 0) player.iframes--;
    if (player.dashCooldown > 0) player.dashCooldown--;
    if (player.autoDodgeCooldown > 0) player.autoDodgeCooldown--;
    if (player.killBoostTimer > 0) player.killBoostTimer--;
    if (player.paybackTimer > 0) player.paybackTimer--;
    if (player.dashBoostTimer > 0) player.dashBoostTimer--;
    if (player.hasRegen && game.tick % 6 === 0 && Math.random() < 0.02) {
        player.health = Math.min(player.maxHealth, player.health + 0.25);
    }
    // MINIGUN spool tracking
    if (activeWeapon.spoolup) {
        player.spoolTicks = mouse.down ? (player.spoolTicks || 0) + 1 : Math.max(0, (player.spoolTicks || 0) - 4);
    }

    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    // THE WALL: standing still for 1s enters Turret Stance
    if (player.theWall) {
        player.stillTicks = (dx || dy) ? 0 : player.stillTicks + 1;
        const wasStance = player.turretStance;
        player.turretStance = player.stillTicks >= 60;
        if (player.turretStance && !wasStance) {
            createParticles(player.x, player.y, '#94a3b8', 12);
            sfx('pickup');
        }
    }
    if (dx || dy) {
        const mag = Math.hypot(dx, dy);
        player.x += (dx / mag) * player.speed;
        player.y += (dy / mag) * player.speed;
    }
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    collideWithObstacles(player);
}

// --- Shooting ---------------------------------------------------------------

function shoot() {
    if (player.hasSword || player.permanentStaff) return; // melee/staff replace the gun
    const w = activeWeapon;
    let fireRateMs = player.fireRate * w.fireRateMult;
    if (player.killBoostTimer > 0) fireRateMs *= 0.85;
    // MINIGUN evolution: spools up while the trigger is held
    if (w.spoolup) fireRateMs *= 1 - Math.min(0.5, (player.spoolTicks || 0) / 180 * 0.5);
    fireRateMs = Math.max(fireRateMs, 30); // absolute floor after all multipliers
    if (game.tick - player.lastShotTick < msToTicks(fireRateMs)) return;
    player.lastShotTick = game.tick;
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const shots = player.multishot + w.multishotAdd;
    const spreads = player.spread + w.spreadAdd;
    const shotDamage = player.damage * w.damageMult * modVal('playerDamageMult', 1);
    // APEX PREDATOR (pistol mythic): every 5th shot is a piercing execution round
    let apexShot = false;
    if (w.apexRounds) {
        w._apexCounter = (w._apexCounter || 0) + 1;
        if (w._apexCounter >= 5) { w._apexCounter = 0; apexShot = true; }
    }
    for (let i = 0; i < shots; i++) {
        for (let s = 0; s < spreads; s++) {
            const spreadAngle = (s - (spreads - 1) / 2) * 0.25;
            // Flamethrower adds extra random scatter
            const jitter = w.flamethrower ? (Math.random() - 0.5) * 0.45 : (Math.random() - 0.5) * 0.08;
            const bullet = makeBullet(player.x, player.y, angle + spreadAngle + jitter, apexShot ? shotDamage * 3 : shotDamage, w);
            if (apexShot) { bullet.piercing = true; bullet.apex = true; }
            bullets.push(bullet);
        }
    }
    // PHANTOM: remember recent shot angles for decoy replay
    if (player.phantom) {
        player.shotHistory.push(angle);
        if (player.shotHistory.length > 40) player.shotHistory.shift();
    }
    // WARHEAD: every 8th shot carries a cluster bomb
    if (player.warhead && ++player.shotCounter >= 8) {
        player.shotCounter = 0;
        const cb = makeBullet(player.x, player.y, angle, shotDamage * 1.2, w);
        cb.grenade = true;
        cb.cluster = true;
        cb.vy -= 0.5;
        bullets.push(cb);
    }
    sfx('shoot_' + (w.baseId || w.id));
}

function makeBullet(x, y, angle, damage, w) {
    w = w || activeWeapon;
    const speed = player.bulletSpeed * w.bulletSpeedMult;
    const sizeBonus = w.bulletSizeBonus || 0;
    const size = Math.min(player.bulletSize + sizeBonus, MAX_BULLET_SIZE);
    // DEADEYE (SNIPER branch): shots pierce everything during Focus
    const focusPierce = player.focusTimer > 0 && player.chosenBranches.DEFIANCE === 'A';
    const isPiercing = player.piercing || w.alwaysPiercing || focusPierce;
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
        dead: false,
        bounces: player.ricochet ? 1 : 0,
        flamethrower: w.flamethrower || false,
        grenade: w.grenade || false,
        // Evolution behaviors
        sticky: (w.stickyGrenades && w.grenade) || false,
        cluster: (w.clusterGrenades && w.grenade) || false,
        homingShot: w.homingShots || false,
        knockback: w.knockbackShots || false,
        stunShot: w.stunShots || false,
        armorShred: w.armorShred || false,
        tarShot: w.tarShots || false,
        chain: w.chainLightning || false,
        voidPull: w.voidPull || false,
        deadshot: w.deadshot || false,
        // Mythic-tier behaviors
        riftShot: w.riftShots || false,
        annihilator: w.annihilator || false
    };
}

function fireBarrage() {
    if (!player.hasBarrage) return;
    player.barrageTimer--;
    const rate = Math.max(20, 70 - (player.barrageRateBonus || 0));
    if (player.barrageTimer > 0) return;
    player.barrageTimer = rate;
    for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 / 12) * i + game.tick / 30;
        bullets.push(makeBullet(player.x, player.y, angle, player.barrageDamage || effectiveDamage() * 0.5));
    }
}

function dash() {
    if (!player.hasDash || player.dashCooldown > 0) return;
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const dashDist = player.dashDistance || 80;
    // PHANTOM: leave a taunting decoy at the launch point
    if (player.phantom) {
        decoys.push({ x: player.x, y: player.y, life: 120, replayIdx: 0 });
    }
    player.x += Math.cos(angle) * dashDist;
    player.y += Math.sin(angle) * dashDist;
    if (player.dashDamageBoost) player.dashBoostTimer = 90;
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    player.iframes = 35;
    player.dashCooldown = player.dashMaxCooldown || 70;
    collideWithObstacles(player);
    createParticles(player.x, player.y, '#9bf6ff', 25);
    sfx('dash');
    if (player.dashBlast) {
        enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < 90) e.health -= effectiveDamage() * 1.2;
        });
    }
}

// --- Bullets ----------------------------------------------------------------

function updateBullets() {
    bullets.forEach(b => {
        // STICKY MINES: freeze in place shortly after launch
        if (b.sticky && b.age > 22) { b.vx = 0; b.vy = 0; }
        // SMART SMGs: mild homing toward the nearest enemy
        if (b.homingShot && enemies.length > 0) {
            let target = null, best = 240;
            for (const e of enemies) {
                const d = Math.hypot(e.x - b.x, e.y - b.y);
                if (d < best) { best = d; target = e; }
            }
            if (target) {
                const want = Math.atan2(target.y - b.y, target.x - b.x);
                const cur = Math.atan2(b.vy, b.vx);
                let diff = want - cur;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                const turn = Math.max(-0.05, Math.min(0.05, diff));
                const spd = Math.hypot(b.vx, b.vy);
                b.vx = Math.cos(cur + turn) * spd;
                b.vy = Math.sin(cur + turn) * spd;
            }
        }
        b.x += b.vx;
        b.y += b.vy;
        b.age++;
        // Grenade arc: slight gravity pull
        if (b.grenade && !(b.sticky && b.age > 22)) b.vy += 0.12;
        const maxAge = b.flamethrower ? 30 : (b.sticky ? 300 : 120);
        if (b.bounces > 0 && (b.x < 0 || b.x > canvas.width)) { b.vx *= -1; b.bounces--; }
        if (b.bounces > 0 && (b.y < 0 || b.y > canvas.height)) { b.vy *= -1; b.bounces--; }
        const alive = b.x > -30 && b.x < canvas.width + 30 && b.y > -30 && b.y < canvas.height + 30 && b.age < maxAge;
        if (!alive) {
            b.dead = true;
            // Grenade explodes when it expires (hits the ground / goes off-screen)
            if (b.grenade) {
                createExplosion(b.x, b.y, player.chainExplosions);
                if (b.cluster) spawnBomblets(b.x, b.y);
            }
        }
        // Solid obstacles stop bullets; crates take the hit
        if (!b.dead) {
            for (const o of obstacles) {
                if (o.kind === 'acid') continue;
                if (Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.radius) {
                    if (o.health !== undefined) o.health -= b.damage;
                    b.dead = true;
                    if (b.grenade) {
                        createExplosion(b.x, b.y, player.chainExplosions);
                        if (b.cluster) spawnBomblets(b.x, b.y);
                    }
                    createParticles(b.x, b.y, '#9ca3af', 3);
                    break;
                }
            }
        }
    });
    resolveBrokenObstacles();

    for (const b of bullets) {
        if (b.dead) continue;
        // Staff orbs re-arm against enemies that left their radius
        if (b.isStaffOrb && b.hitEnemies.size > 0) {
            b.hitEnemies.forEach(e => {
                if (e.health <= 0 || Math.hypot(b.x - e.x, b.y - e.y) >= b.hitRadius + e.radius) b.hitEnemies.delete(e);
            });
        }
        for (const e of enemies) {
            if (e.health <= 0) continue;
            if (e.phased) continue; // WRAITH: intangible, bullets pass through
            const dist = Math.hypot(b.x - e.x, b.y - e.y);
            if (dist >= b.hitRadius + e.radius) continue;
            if (b.isStaffOrb) {
                // Orbs plow through, hitting each enemy once per overlap
                if (b.hitEnemies.has(e)) continue;
                b.hitEnemies.add(e);
                let dmg = b.damage;
                if (e.bossRank) dmg *= (player.bossDamageBonus || 1);
                dmg *= (1 - bulwarkShieldReduction(e));
                dmg *= bossStanceMult(e);
                e.health -= dmg * (1 - (e.armor || 0));
                e._flashTimer = 4;
                spawnDamageNumber(e.x, e.y - e.radius, dmg * (1 - (e.armor || 0)), '#c4b5fd', b.isCharged);
                createParticles(e.x, e.y, '#a78bfa', 8);
                sfx('hit');
                continue;
            }
            hitEnemyWithBullet(b, e);
            // OBLIVION ROUNDS (sniper mythic): every impact detonates a shockwave
            if (b.riftShot) createExplosion(e.x, e.y, false);
            // ANNIHILATOR (railgun mythic): each pierced enemy makes the next hit harder
            if (b.annihilator) b.damage *= 1.15;
            // DEADSHOT: killing shots ricochet toward the nearest living enemy
            if (b.deadshot && e.health <= 0) {
                let next = null, best = 99999;
                for (const o of enemies) {
                    if (o === e || o.health <= 0) continue;
                    const d = Math.hypot(o.x - b.x, o.y - b.y);
                    if (d < best) { best = d; next = o; }
                }
                if (next) {
                    const a = Math.atan2(next.y - b.y, next.x - b.x);
                    const spd = Math.hypot(b.vx, b.vy);
                    b.vx = Math.cos(a) * spd;
                    b.vy = Math.sin(a) * spd;
                    b.age = Math.min(b.age, 60);
                    createParticles(b.x, b.y, '#f43f5e', 4);
                    continue;
                }
            }
            // Aegis drones soak bullets — even piercing ones stop on the shield
            if (e.blocksBullets || !b.piercing || ++b.hits > 3) { b.dead = true; break; }
        }
    }
    bullets = bullets.filter(b => !b.dead);
}

function hitEnemyWithBullet(b, e) {
    const armor = e.armor || 0;
    let dmg = b.damage;
    const crit = !b.fromMinion && Math.random() < (player.critChance || 0);
    if (crit) {
        dmg *= 2;
        if (player.critReload) player.lastShotTick -= msToTicks(player.fireRate * 0.35);
        if (player.deadeyeAwakened) player.focusMeter = Math.min(100, player.focusMeter + (player.focusTimer > 0 ? 4 : 3));
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
    if (e.bulletResist) dmg *= (1 - e.bulletResist);   // SHIELDED elite
    if (e.blocksBullets) dmg *= 0.35;                  // aegis shield soak
    dmg *= (1 - bulwarkShieldReduction(e));            // BULWARK COMMANDER aura
    dmg *= bossStanceMult(e);                          // boss weak-point / guard stance
    e.health -= dmg * (1 - armor);
    e._flashTimer = 4;
    spawnDamageNumber(e.x, e.y - e.radius, dmg * (1 - armor), crit ? '#facc15' : '#fff', crit);
    if (crit) game.hitStop = Math.max(game.hitStop, 2);
    if (crit && player.executeThreshold > 0 && !e.bossRank && e.maxHealth && e.health < e.maxHealth * player.executeThreshold) {
        e.health = 0;
        game.hitStop = Math.max(game.hitStop, 4);
        spawnDamageNumber(e.x, e.y - e.radius - 10, 0, '#ff0041', true);
    }
    // Status effects (minion bullets don't stack player buffs unfairly)
    if (!b.fromMinion) {
        if (player.slowOnHit > 0) {
            e._slowAmount = Math.max(e._slowAmount || 0, player.slowOnHit);
            e._slowTimer = Math.max(e._slowTimer || 0, player.slowDuration);
        }
        // Flamethrower always burns even without Sabotage upgrades
        if (b.flamethrower) {
            const hellstormMult = activeWeapon.poisonBoost ? 1.8 : 1;
            e._poisonDps = Math.max(e._poisonDps || 0, (player.poisonDamage > 0 ? player.poisonDamage : 0.3) * hellstormMult);
            e._poisonTimer = Math.max(e._poisonTimer || 0, player.poisonDuration > 0 ? player.poisonDuration : 80);
        } else if (player.poisonDamage > 0) {
            e._poisonDps = Math.max(e._poisonDps || 0, player.poisonDamage);
            e._poisonTimer = Math.max(e._poisonTimer || 0, player.poisonDuration);
        }
        if (player.weakenStrength > 0) e._weakTimer = 60;
        if (player.stunChance > 0 && !e.stunImmune && Math.random() < player.stunChance) e._stunTimer = 30 + (player.stunBonus || 0);
        if (player.saboteurMark && (e._poisonTimer > 0 || Math.random() < 0.2)) e._marked = true;
        if (player.confuseEnemies && Math.random() < 0.10) e._confused = 90;
    }
    // Evolution on-hit behaviors
    if (b.knockback && !e.stunImmune) {
        const ka = Math.atan2(e.y - player.y, e.x - player.x);
        e.x += Math.cos(ka) * 9;
        e.y += Math.sin(ka) * 9;
    }
    if (player.turretStance && !e.stunImmune) {
        const ka = Math.atan2(e.y - player.y, e.x - player.x);
        e.x += Math.cos(ka) * 6;
        e.y += Math.sin(ka) * 6;
    }
    if (b.stunShot && !e.stunImmune && Math.random() < 0.5) e._stunTimer = Math.max(e._stunTimer || 0, 25);
    if (b.armorShred && e.armor > 0) e.armor = Math.max(0, e.armor - 0.03);
    if (b.tarShot && Math.random() < 0.3) tarPools.push({ x: e.x, y: e.y, life: 240, radius: 26 });
    if (b.chain) {
        let arcs = 0;
        for (const o of enemies) {
            if (o === e || o.health <= 0 || arcs >= 3) continue;
            if (Math.hypot(o.x - e.x, o.y - e.y) < 130) {
                o.health -= dmg * 0.4;
                o._flashTimer = 3;
                createParticles(o.x, o.y, '#a5f3fc', 5);
                spawnDamageNumber(o.x, o.y - o.radius, dmg * 0.4, '#a5f3fc', false);
                arcs++;
            }
        }
    }
    if (b.voidPull) {
        enemies.forEach(o => {
            if (o === e || o.stunImmune) return;
            const d = Math.hypot(o.x - e.x, o.y - e.y);
            if (d > 4 && d < 110) {
                const a = Math.atan2(e.y - o.y, e.x - o.x);
                o.x += Math.cos(a) * 12;
                o.y += Math.sin(a) * 12;
            }
        });
    }
    if (player.explosiveRounds || b.grenade) {
        createExplosion(e.x, e.y, player.chainExplosions);
        if (b.cluster) spawnBomblets(e.x, e.y);
    }
    if (player.recoil > 0 && !e.stunImmune) {
        const knockbackAngle = Math.atan2(e.y - player.y, e.x - player.x);
        e.x += Math.cos(knockbackAngle) * player.recoil * 6;
        e.y += Math.sin(knockbackAngle) * player.recoil * 6;
    }
    // BLINKER elite: chance to teleport away when struck
    if (e.blinker && e.health > 0 && (!e._blinkCd || e._blinkCd <= 0) && Math.random() < 0.3) {
        createParticles(e.x, e.y, '#c084fc', 12);
        const a = Math.random() * Math.PI * 2;
        const d = 80 + Math.random() * 70;
        e.x = Math.max(20, Math.min(canvas.width - 20, e.x + Math.cos(a) * d));
        e.y = Math.max(20, Math.min(canvas.height - 20, e.y + Math.sin(a) * d));
        e._blinkCd = 60;
        createParticles(e.x, e.y, '#c084fc', 12);
    }
    createParticles(e.x, e.y, crit ? '#ffffff' : e.color, crit ? 10 : 5);
    sfx(crit ? 'crit' : 'hit');
}

// --- Enemies ----------------------------------------------------------------

function chooseEnemyType() {
    const pool = ENEMY_TYPES.filter(t => game.wave >= t.minWave);
    const weights = pool.map(t => t.weight(game.wave));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
        r -= weights[i];
        if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
}

function edgeSpawnPoint(margin) {
    const side = Math.floor(Math.random() * 4);
    if (side === 0) return { x: Math.random() * canvas.width, y: -margin };
    if (side === 1) return { x: canvas.width + margin, y: Math.random() * canvas.height };
    if (side === 2) return { x: Math.random() * canvas.width, y: canvas.height + margin };
    return { x: -margin, y: Math.random() * canvas.height };
}

function spawnEnemyOfType(type, opts = {}) {
    const stats = type.make(game.wave);
    const scale = enemyScale(game.wave);
    stats.health *= scale * modVal('enemyHealthMult', 1);
    stats.contact *= Math.sqrt(scale); // contact damage scales gentler than HP
    const { x, y } = (opts.x !== undefined) ? opts : edgeSpawnPoint(25);
    const e = { x, y, vx: 0, vy: 0, ...stats, maxHealth: stats.health };
    // Elite roll (bosses can bias summons toward elites)
    if (Math.random() < Math.max(eliteChance(game.wave), opts.eliteBias || 0)) {
        e.elite = true;
        e.health *= 3;
        e.maxHealth = e.health;
        e.points *= 4;
        e.radius += 2;
        const modKeys = Object.keys(ELITE_MODS);
        const modCount = eliteModCount(game.wave);
        e.eliteMods = [];
        while (e.eliteMods.length < modCount) {
            const k = modKeys[Math.floor(Math.random() * modKeys.length)];
            if (!e.eliteMods.includes(k)) {
                e.eliteMods.push(k);
                ELITE_MODS[k].apply(e);
            }
        }
    }
    enemies.push(e);
    return e;
}

function spawnScheduledBosses() {
    if (game.wave > 0 && game.wave % 10 === 0) spawnBoss('full');
    else if (game.wave > 0 && game.wave % 5 === 0) spawnBoss('mini');
}

function spawnBoss(rank) {
    if (rank === 'full') {
        spawnNikita();
    } else {
        const roster = [spawnVlad, spawnTwins, spawnHandlerPrime];
        const before = enemies.length;
        roster[Math.floor((game.wave - 5) / 10) % roster.length]();
        // HYBRID PROTOCOL (wave 35+): a chance the miniboss also carries an
        // elite mod, stacking a fresh mechanic on top of its own moveset.
        if (game.wave >= 35 && Math.random() < 0.35) {
            const hybridKeys = ['volatile', 'vampiric', 'commander', 'cursed'];
            const key = hybridKeys[Math.floor(Math.random() * hybridKeys.length)];
            let hit = false;
            for (let i = before; i < enemies.length; i++) {
                const e = enemies[i];
                if (e.bossRank !== 'mini') continue;
                e.elite = true;
                e.eliteMods = [key];
                ELITE_MODS[key].apply(e);
                e.health *= 1.2;
                e.maxHealth = e.health;
                hit = true;
            }
            if (hit) schedule(50, () => showBanner('⚠ HYBRID PROTOCOL: ' + ELITE_MODS[key].name));
        }
    }
}

function miniBossScale() {
    return (1 + game.wave * 0.14) * enemyScale(game.wave);
}

function bossEntrance(x, y, color, name) {
    createParticles(x, y, color, 50);
    addShake(9);
    sfx('bossAlarm');
    showBanner('☠ ' + name + ' ☠');
}

function bossPhaseShift(e, label) {
    showBanner(label);
    game.hitStop = Math.max(game.hitStop, 8);
    addShake(8);
    sfx('bossAlarm');
    createParticles(e.x, e.y, e.color, 40);
}

// VLAD THE WALL — armored tank: Advance → Entrench (turrets + shield stance)
// → Crush (charges, exposed on landing) → Berserk (below 12%: everything faster).
// The shield stance and post-charge stagger are Vlad's real puzzle: burn your
// damage in the windows he gives you, not into the wall he puts up.
function spawnVlad() {
    const s = miniBossScale();
    const { x, y } = edgeSpawnPoint(50);
    enemies.push({
        x, y, vx: 0, vy: 0, kind: 'miniBoss', bossRank: 'mini', bossId: 'vlad', bossName: 'VLAD THE WALL',
        phase: 1, radius: 28, speed: 1.0 + game.wave * 0.02,
        health: 380 * s, maxHealth: 380 * s, contact: 5 + game.wave * 0.12, armor: 0.25,
        patternTimer: 100, shielded: false, _shieldTimer: 170, color: '#f97316', points: 700 + game.wave * 45
    });
    bossEntrance(x, y, '#f97316', 'VLAD THE WALL');
}

function updateVlad(e) {
    const frac = e.health / e.maxHealth;
    if (e.phase === 1 && frac <= 0.6) {
        e.phase = 2;
        e.speed *= 0.55;
        bossPhaseShift(e, 'VLAD: ENTRENCHED');
        for (let i = 0; i < 2; i++) {
            const hp = 110 * enemyScale(game.wave);
            enemies.push({ x: e.x + (i ? 60 : -60), y: e.y, vx: 0, vy: 0, kind: 'turret', radius: 9, speed: 0, health: hp, maxHealth: hp, contact: 0.5, shootRate: 70, shootTimer: 40, color: '#f97316', points: 80 });
        }
    }
    if (e.phase === 2 && frac <= 0.3) {
        e.phase = 3;
        e.speed *= 1.3;
        e._crushTimer = 60;
        bossPhaseShift(e, 'VLAD: CRUSH PROTOCOL');
    }
    if (e.phase === 3 && frac <= 0.12 && !e._berserk) {
        e._berserk = true;
        e.speed *= 1.35;
        bossPhaseShift(e, 'VLAD: BERSERK');
        const hp = 90 * enemyScale(game.wave);
        enemies.push({ x: e.x, y: e.y - 40, vx: 0, vy: 0, kind: 'turret', radius: 9, speed: 0, health: hp, maxHealth: hp, contact: 0.5, shootRate: 65, shootTimer: 30, color: '#f97316', points: 80 });
    }

    // SHIELD STANCE (phase 2+): Vlad periodically hunkers down, cutting incoming
    // damage to a fifth. Telegraphed by color — save your damage for the drop.
    if (e.phase >= 2) {
        e._shieldTimer--;
        if (e._shieldTimer <= 0) {
            e.shielded = !e.shielded;
            e._shieldTimer = e.shielded ? (e._berserk ? 60 : 85) : (e._berserk ? 110 : 160);
            createParticles(e.x, e.y, e.shielded ? '#facc15' : '#f97316', 18);
            if (e.shielded) showBanner('🛡 VLAD BRACES');
        }
    }

    e.patternTimer--;
    if (e.patternTimer <= 0) {
        e.patternTimer = (e.phase >= 2 ? 70 : 100) * (e._berserk ? 0.7 : 1);
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        const n = (e.phase >= 2 ? 7 : 5) + (e._berserk ? 2 : 0);
        const spd = 3.4 * modVal('enemyBulletSpeedMult', 1);
        for (let i = 0; i < n; i++) {
            const ang = a + (i - (n - 1) / 2) * 0.16;
            enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, radius: 5, damage: 7 + game.wave * 0.1, age: 0, color: '#f97316' });
        }
    }
    if (e.phase === 3) {
        if (e._crushTimer > 0) e._crushTimer--;
        if (e._crushTimer <= 0 && !e._chargeTimer && !e._chargeTelegraph) {
            e._pendingChargeAngle = Math.atan2(player.y - e.y, player.x - e.x);
            e._chargeTelegraph = e._berserk ? 26 : 40;
        }
        if (e._chargeTelegraph > 0) {
            e._chargeTelegraph--;
            if (e._chargeTelegraph === 0) {
                e._chargeTimer = 32;
                const chargeSpeed = e._berserk ? 11.5 : 9;
                e._chargeVx = Math.cos(e._pendingChargeAngle) * chargeSpeed;
                e._chargeVy = Math.sin(e._pendingChargeAngle) * chargeSpeed;
                e._crushTimer = e._berserk ? 120 : 170;
                addShake(6);
                sfx('dash');
            }
        }
    }
}

// THE TWINS — Katya & Kira: mirrored orbits and crossfire; the survivor enrages
function spawnTwins() {
    const s = miniBossScale();
    const pts = Math.floor((800 + game.wave * 45) / 2);
    const pair = 'twins' + game.tick;
    for (let i = 0; i < 2; i++) {
        const { x, y } = edgeSpawnPoint(50);
        enemies.push({
            x, y, vx: 0, vy: 0, kind: 'miniBoss', bossRank: 'mini', bossId: 'twins', bossName: i ? 'KIRA' : 'KATYA',
            twinPair: pair, phase: 1, radius: 20, speed: 1.7 + game.wave * 0.02, customMove: true,
            _orbitA: i * Math.PI,
            health: 210 * s, maxHealth: 210 * s, contact: 4 + game.wave * 0.1, armor: 0.10,
            patternTimer: 80 + i * 40, color: i ? '#f472b6' : '#fb7185', points: pts
        });
    }
    bossEntrance(canvas.width / 2, 40, '#fb7185', 'THE TWINS: KATYA & KIRA');
}

function updateTwin(e) {
    if (!e._enraged && !enemies.some(o => o !== e && o.twinPair === e.twinPair)) {
        e._enraged = true;
        e.twinLinked = false;
        e.speed *= 1.6;
        e.color = '#e11d48';
        bossPhaseShift(e, e.bossName + ': ENRAGED');
    }

    // SYNC BEAM: while both twins live, KATYA periodically links them. Linked,
    // they heal and are heavily armored — separate them (lure one away) to
    // deny the sync, or eat the beam's damage if you stand between them.
    if (!e._enraged && e.bossName === 'KATYA') {
        const partner = enemies.find(o => o !== e && o.twinPair === e.twinPair && o.health > 0);
        e._syncTimer = (e._syncTimer === undefined) ? 260 : e._syncTimer - 1;
        if (!e._syncActive && e._syncTimer <= 0 && partner && Math.hypot(partner.x - e.x, partner.y - e.y) < 240) {
            e._syncActive = 100;
            e._syncTimer = 340;
            showBanner('⚡ TWINS SYNCHRONIZING');
            sfx('bossAlarm');
        }
        if (e._syncActive > 0) {
            if (partner) {
                e._syncActive--;
                e.twinLinked = true;
                partner.twinLinked = true;
                e.health = Math.min(e.maxHealth, e.health + e.maxHealth * 0.006);
                partner.health = Math.min(partner.maxHealth, partner.health + partner.maxHealth * 0.006);
                const dx = partner.x - e.x, dy = partner.y - e.y;
                const len2 = Math.max(1, dx * dx + dy * dy);
                const t = ((player.x - e.x) * dx + (player.y - e.y) * dy) / len2;
                if (t > 0 && t < 1) {
                    const projX = e.x + dx * t, projY = e.y + dy * t;
                    if (Math.hypot(player.x - projX, player.y - projY) < 16) damagePlayer(4 + game.wave * 0.05);
                }
                if (game.tick % 6 === 0) createParticles((e.x + partner.x) / 2, (e.y + partner.y) / 2, '#fef08a', 3);
            } else {
                e._syncActive = 0;
                e.twinLinked = false;
            }
            if (e._syncActive <= 0 && partner) { partner.twinLinked = false; e.twinLinked = false; }
        }
    }

    // Orbit the player; twins start on opposite sides
    e._orbitA += 0.015;
    const tx = player.x + Math.cos(e._orbitA) * 160;
    const ty = player.y + Math.sin(e._orbitA) * 160;
    const d = Math.max(1, Math.hypot(tx - e.x, ty - e.y));
    const step = Math.min(e.speed * 1.4, d);
    e.x += ((tx - e.x) / d) * step;
    e.y += ((ty - e.y) / d) * step;
    e.patternTimer--;
    if (e.patternTimer <= 0) {
        e.patternTimer = e._enraged ? 55 : 90;
        const twinSpd = modVal('enemyBulletSpeedMult', 1);
        if (e._enraged) {
            for (let i = 0; i < 12; i++) {
                const a = (Math.PI * 2 / 12) * i + game.tick / 25;
                enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3.2 * twinSpd, vy: Math.sin(a) * 3.2 * twinSpd, radius: 4, damage: 6 + game.wave * 0.08, age: 0, color: e.color });
            }
        } else {
            for (let shot = 0; shot < 3; shot++) {
                schedule(shot * 6, () => {
                    if (e.health <= 0) return;
                    const a = Math.atan2(player.y - e.y, player.x - e.x);
                    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 4.2 * twinSpd, vy: Math.sin(a) * 4.2 * twinSpd, radius: 4, damage: 6 + game.wave * 0.08, age: 0, color: e.color });
                });
            }
        }
    }
}

// HANDLER PRIME — summoner: Deploy → Overwatch (drone ring) → Feedback (missiles)
function spawnHandlerPrime() {
    const s = miniBossScale();
    const { x, y } = edgeSpawnPoint(50);
    enemies.push({
        x, y, vx: 0, vy: 0, kind: 'miniBoss', bossRank: 'mini', bossId: 'handlerPrime', bossName: 'HANDLER PRIME',
        phase: 1, radius: 26, speed: 0.9 + game.wave * 0.015,
        health: 420 * s, maxHealth: 420 * s, contact: 4 + game.wave * 0.1, armor: 0.15,
        patternTimer: 130, summonTimer: 120, color: '#38bdf8', points: 900 + game.wave * 45
    });
    bossEntrance(x, y, '#38bdf8', 'HANDLER PRIME');
}

function updateHandlerPrime(e) {
    const frac = e.health / e.maxHealth;
    if (e.phase === 1 && frac <= 0.55) {
        e.phase = 2;
        bossPhaseShift(e, 'HANDLER PRIME: OVERWATCH');
        e._drones = [];
        for (let i = 0; i < 6; i++) {
            const hp = 70 * enemyScale(game.wave);
            const d = { x: e.x, y: e.y, vx: 0, vy: 0, kind: 'aegisDrone', radius: 10, speed: 3, health: hp, maxHealth: hp, contact: 0.8, blocksBullets: true, orbiter: true, bossHost: e, _orbitAngle: i * Math.PI / 3, color: '#38bdf8', points: 40 };
            enemies.push(d);
            e._drones.push(d);
        }
    }
    // DRONE SCREEN: while any drone survives, Handler shrugs off 85% of your
    // damage — the drones are the real target. Wipe the screen and he's wide
    // open for a couple of seconds (OVERLOAD) before he can rebuild it.
    if (e.phase === 2) {
        const wasShielded = e.handlerShielded;
        e.handlerShielded = (e._drones || []).some(d => d.health > 0);
        if (wasShielded && !e.handlerShielded) {
            e._overloadTimer = 130;
            e._droneRebuildTimer = 320;
            showBanner('⚡ HANDLER PRIME: OVERLOAD');
            createParticles(e.x, e.y, '#fff', 30);
        }
        if (!e.handlerShielded && e._droneRebuildTimer !== undefined) {
            e._droneRebuildTimer--;
            if (e._droneRebuildTimer <= 0) {
                e._droneRebuildTimer = undefined;
                for (let i = 0; i < 3; i++) {
                    const hp = 55 * enemyScale(game.wave);
                    const d = { x: e.x, y: e.y, vx: 0, vy: 0, kind: 'aegisDrone', radius: 10, speed: 3, health: hp, maxHealth: hp, contact: 0.8, blocksBullets: true, orbiter: true, bossHost: e, _orbitAngle: i * Math.PI * 2 / 3, color: '#38bdf8', points: 35 };
                    enemies.push(d);
                    e._drones.push(d);
                }
                showBanner('⚡ HANDLER PRIME: DRONES REDEPLOYED');
                createParticles(e.x, e.y, '#38bdf8', 24);
            }
        }
    }
    if (e._overloadTimer > 0) e._overloadTimer--;
    if (e.phase === 2 && frac <= 0.25) {
        e.phase = 3;
        e.handlerShielded = false;
        bossPhaseShift(e, 'HANDLER PRIME: FEEDBACK');
        (e._drones || []).forEach(d => {
            if (d.health > 0) {
                d.health = -9999;
                d._silentDeath = true;
                enemyBullets.push({ x: d.x, y: d.y, vx: 2, vy: 0, radius: 5, damage: 10 + game.wave * 0.1, age: 0, color: '#38bdf8', homing: true });
            }
        });
    }
    e.summonTimer--;
    if (e.summonTimer <= 0) {
        e.summonTimer = Math.max(200, 320 - game.wave * 3);
        for (let i = 0; i < 2 + (e.phase >= 2 ? 1 : 0); i++) {
            const a = Math.random() * Math.PI * 2;
            spawnEnemyOfType(chooseEnemyType(), { x: e.x + Math.cos(a) * 50, y: e.y + Math.sin(a) * 50, eliteBias: 0.35 });
        }
        createParticles(e.x, e.y, '#38bdf8', 20);
    }
    e.patternTimer--;
    if (e.patternTimer <= 0) {
        e.patternTimer = 130;
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        for (let i = 0; i < 3; i++) {
            const ang = a + (i - 1) * 0.3;
            enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * 3.5, vy: Math.sin(ang) * 3.5, radius: 4, damage: 7 + game.wave * 0.1, age: 0, color: '#38bdf8' });
        }
    }
}

// NIKITA — Opening Argument → Dirty Tricks (teleports + mines) → Desperation
// (bullet-hell flowers + rotating laser). Each 10-wave cycle adds a mutator.
function spawnNikita() {
    const cycle = Math.floor(game.wave / 10);
    const s = (1 + game.wave * 0.22) * enemyScale(game.wave);
    const { x, y } = edgeSpawnPoint(50);
    enemies.push({
        x, y, vx: 0, vy: 0, kind: 'nikitaBoss', bossRank: 'full', bossId: 'nikita',
        bossName: 'NIKITA' + (cycle > 1 ? ' MK.' + cycle : ''), cycle,
        phase: 1, radius: 34, speed: 1.05 + game.wave * 0.018,
        health: 650 * s, maxHealth: 650 * s, contact: 7 + game.wave * 0.18, armor: 0.18,
        shootRate: 55, shootTimer: 35, patternTimer: 120, summonTimer: 260,
        _mineTrailTimer: 90, _laserTimer: 80,
        color: '#dc2626', points: 1600 + game.wave * 90
    });
    // Mutator (cycle 3+): elite bodyguards accompany him. Cycle 5+ brings a third.
    if (cycle >= 3) {
        const guardCount = cycle >= 5 ? 3 : 2;
        for (let i = 0; i < guardCount; i++) {
            const g = ENEMY_TYPES.find(t => t.id === 'nikitaGuard');
            const ga = (i - (guardCount - 1) / 2) * 55;
            spawnEnemyOfType(g, { x: x + ga, y, eliteBias: 1 });
        }
    }
    bossEntrance(x, y, '#dc2626', 'NIKITA' + (cycle > 1 ? ' MK.' + cycle : ''));
}

function updateNikita(e) {
    const frac = e.health / e.maxHealth;
    if (e.phase === 1 && frac <= 0.6) {
        e.phase = 2;
        e._teleTimer = 60;
        bossPhaseShift(e, 'NIKITA: DIRTY TRICKS');
    }
    if (e.phase === 2 && frac <= 0.25) {
        e.phase = 3;
        e.speed *= 1.4;
        bossPhaseShift(e, 'NIKITA: DESPERATION');
    }
    // Phase 4: LAST STAND (below 10% HP, any cycle). Nikita guards 85% of all
    // damage permanently, teleporting in a tight loop — but the instant after
    // each teleport she's disoriented and takes a huge punish window. Chase
    // the teleport, don't chase the boss.
    if (e.phase === 3 && frac <= 0.10 && !e._lastStand) {
        e._lastStand = true;
        e.lastStandGuard = true;
        e.speed *= 1.3;
        bossPhaseShift(e, 'NIKITA: LAST STAND');
    }
    if (e._lastStand) {
        e._lsTeleTimer = (e._lsTeleTimer === undefined) ? 100 : e._lsTeleTimer - 1;
        if (e._lsTeleTimer <= 0) {
            e._lsTeleTimer = 140;
            const a = Math.random() * Math.PI * 2;
            const d = 170 + Math.random() * 90;
            e.x = Math.max(40, Math.min(canvas.width - 40, player.x + Math.cos(a) * d));
            e.y = Math.max(40, Math.min(canvas.height - 40, player.y + Math.sin(a) * d));
            e._punishWindow = 55;
            createParticles(e.x, e.y, '#fff', 30);
            addShake(3);
        }
        if (e._punishWindow > 0) e._punishWindow--;
    }
    // Mutator (cycle 2+): permanent mine trail
    if (e.cycle >= 2) {
        e._mineTrailTimer--;
        if (e._mineTrailTimer <= 0) {
            e._mineTrailTimer = 90;
            mines.push({ x: e.x, y: e.y, armTimer: 40, life: 1200 });
        }
    }
    e.summonTimer--;
    if (e.summonTimer <= 0) {
        e.summonTimer = Math.max(190, 330 - game.wave * 3);
        for (let i = 0; i < 3; i++) {
            const a = Math.random() * Math.PI * 2;
            const stats = chooseEnemyType().make(game.wave);
            enemies.push({ x: e.x + Math.cos(a) * 45, y: e.y + Math.sin(a) * 45, vx: 0, vy: 0, ...stats, health: stats.health * 0.65, maxHealth: stats.health * 0.65, points: Math.floor(stats.points * 0.5) });
        }
    }
    if (e.phase === 1) {
        e.patternTimer--;
        if (e.patternTimer <= 0) {
            e.patternTimer = Math.max(75, 145 - game.wave * 2);
            const speed = 3.3 + game.wave * 0.035;
            for (let i = 0; i < 16; i++) {
                const a = (Math.PI * 2 / 16) * i + game.tick / 39;
                enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, radius: 5, damage: 8 + game.wave * 0.10, age: 0, color: '#dc2626' });
            }
            createParticles(e.x, e.y, '#dc2626', 20);
        }
    } else if (e.phase === 2) {
        e._teleTimer--;
        if (e._teleTimer <= 0) {
            e._teleTimer = 240;
            createParticles(e.x, e.y, '#dc2626', 25);
            for (let i = 0; i < 3; i++) {
                mines.push({ x: e.x + (Math.random() - 0.5) * 60, y: e.y + (Math.random() - 0.5) * 60, armTimer: 40, life: 1200 });
            }
            const a = Math.random() * Math.PI * 2;
            const d = 200 + Math.random() * 80;
            e.x = Math.max(40, Math.min(canvas.width - 40, player.x + Math.cos(a) * d));
            e.y = Math.max(40, Math.min(canvas.height - 40, player.y + Math.sin(a) * d));
            createParticles(e.x, e.y, '#dc2626', 25);
            addShake(4);
        }
        e.patternTimer--;
        if (e.patternTimer <= 0) {
            e.patternTimer = 80;
            for (let shot = 0; shot < 3; shot++) {
                schedule(shot * 5, () => {
                    if (e.health <= 0) return;
                    const a = Math.atan2(player.y - e.y, player.x - e.x);
                    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 4.6, vy: Math.sin(a) * 4.6, radius: 5, damage: 9 + game.wave * 0.1, age: 0, color: '#dc2626' });
                });
            }
        }
    } else {
        // Phase 3: bullet-hell flowers
        e.patternTimer--;
        if (e.patternTimer <= 0) {
            e.patternTimer = Math.max(55, 110 - game.wave);
            const speed = 3.0 + game.wave * 0.03;
            for (let i = 0; i < 10; i++) {
                const base = (Math.PI * 2 / 10) * i;
                enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(base + game.tick / 30) * speed, vy: Math.sin(base + game.tick / 30) * speed, radius: 5, damage: 8 + game.wave * 0.1, age: 0, color: '#dc2626' });
                enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(base - game.tick / 30) * speed * 0.8, vy: Math.sin(base - game.tick / 30) * speed * 0.8, radius: 4, damage: 7 + game.wave * 0.1, age: 0, color: '#f87171' });
            }
        }
        // Rotating laser sweep
        e._laserTimer--;
        if (e._laserTimer <= 0 && !e._laser) {
            e._laser = { angle: Math.random() * Math.PI * 2, telegraph: 60, duration: 180, spin: (Math.random() < 0.5 ? 1 : -1) * 0.008 };
        }
        if (e._laser) {
            const L = e._laser;
            if (L.telegraph > 0) {
                L.telegraph--;
            } else {
                L.angle += L.spin;
                L.duration--;
                laserHitCheck(e, L.angle);
                if (e.cycle >= 4) laserHitCheck(e, L.angle + Math.PI); // mutator: twin beam
                if (L.duration <= 0) { e._laser = null; e._laserTimer = 260; }
            }
        }
    }
}

function laserHitCheck(e, angle) {
    const dx = player.x - e.x, dy = player.y - e.y;
    const proj = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (proj < 0) return;
    const perp = Math.abs(-Math.sin(angle) * dx + Math.cos(angle) * dy);
    if (perp < 12) damagePlayer(9 + game.wave * 0.1);
}

function updateEnemies() {
    enemies.forEach(e => {
        // Status effect timers
        if (e._flashTimer > 0) e._flashTimer--;
        if (e._slowTimer > 0) e._slowTimer--; else e._slowAmount = 0;
        if (e._stunTimer > 0) e._stunTimer--;
        if (e._weakTimer > 0) e._weakTimer--;
        if (e._confused > 0) e._confused--;
        if (e._minionSlow > 0) e._minionSlow--;
        if (e._poisonTimer > 0) {
            e._poisonTimer--;
            const poisonInterval = player.poisonTickFast ? 8 : 16;
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

        // WRAITH / PHASING elite: cycles between solid and intangible
        if (e.wraith) {
            e._phaseTimer--;
            if (e._phaseTimer <= 0) {
                e.phased = !e.phased;
                e._phaseTimer = e.phased ? 55 : (110 + Math.floor(Math.random() * 40));
                createParticles(e.x, e.y, '#a3e635', e.phased ? 10 : 4);
            }
        }
        // SWARMING elite: periodically calls in reinforcements (capped)
        if (e.swarmingMod) {
            e._swarmTimer--;
            if (e._swarmTimer <= 0 && (e._swarmSpawns || 0) < 3) {
                e._swarmTimer = 220;
                e._swarmSpawns = (e._swarmSpawns || 0) + 1;
                for (let i = 0; i < 2; i++) {
                    const a = Math.random() * Math.PI * 2;
                    spawnEnemyOfType(ENEMY_TYPES[0], { x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20 });
                }
                createParticles(e.x, e.y, '#fb923c', 14);
            }
        }

        // Stunned enemies don't move or shoot
        if (e._stunTimer > 0) return;

        if (e._blinkCd > 0) e._blinkCd--;
        if (e._hasteTimer > 0) e._hasteTimer--;

        // COMMANDER elite: haste aura for nearby allies
        if (e.commander && game.tick % 10 === 0) {
            enemies.forEach(o => {
                if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 130) o._hasteTimer = 15;
            });
        }

        // Charge attacks (Vlad's Crush) override everything
        if (e._chargeTimer > 0) {
            e._chargeTimer--;
            e.x += e._chargeVx;
            e.y += e._chargeVy;
            e.x = Math.max(e.radius, Math.min(canvas.width - e.radius, e.x));
            e.y = Math.max(e.radius, Math.min(canvas.height - e.radius, e.y));
            if (game.tick % 3 === 0) createParticles(e.x, e.y, e.color, 2);
            // VLAD's weak point: he's staggered and exposed the instant the charge ends
            if (e._chargeTimer <= 0 && e.bossId === 'vlad') {
                e._exposedTimer = 55;
                createParticles(e.x, e.y, '#fff', 16);
            }
            return;
        }
        if (e._exposedTimer > 0) e._exposedTimer--;

        // Specialized behaviors that fully own their movement
        if (e.mender) { updateMender(e); return; }
        if (e.deadeye) { updateDeadeye(e); return; }
        if (e.railTrooper) { updateRailTrooper(e); return; }
        if (e.orbiter) { updateAegis(e); return; }
        if (e.bomber) { if (updateBomber(e)) return; }
        if (e.warper) updateWarper(e);

        // Determine target. Confused enemies target each other
        let targetX = player.x;
        let targetY = player.y;
        // Taunts: necromancer thralls and phantom decoys draw enemy aggro
        if (!(e._confused > 0)) {
            let closestTaunt = null, closestDist = 999999;
            if (player.minionTaunt) {
                minions.forEach(m => {
                    const d = Math.hypot(m.x - e.x, m.y - e.y);
                    if (d < closestDist) { closestDist = d; closestTaunt = m; }
                });
            }
            decoys.forEach(m => {
                const d = Math.hypot(m.x - e.x, m.y - e.y);
                if (d < closestDist) { closestDist = d; closestTaunt = m; }
            });
            if (closestTaunt && closestDist < 180) {
                targetX = closestTaunt.x;
                targetY = closestTaunt.y;
            }
        }
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
        if (e._hasteTimer > 0) speed *= 1.3;
        // BERSERK elite: the closer to death, the faster and more reckless
        if (e.berserkMod && e.maxHealth) speed *= 1 + (1 - Math.max(0, e.health) / e.maxHealth) * 0.7;
        // Slows from sabotage / minion aura / dead zone
        const slowFromBullets = e._slowAmount || 0;
        const slowFromMinions = e._minionSlow > 0 ? 0.35 : 0;
        const slowFromField = player.slowField && Math.hypot(e.x - player.x, e.y - player.y) < 155 ? (player.slowFieldPower || 0.28) : 0;
        const totalSlow = Math.min(0.85, slowFromBullets + slowFromMinions + slowFromField);
        speed *= (1 - totalSlow);
        if (!e.customMove) {
            e.vx = (dx / dist) * speed;
            e.vy = (dy / dist) * speed;
            // Weavers strafe in a sine wave perpendicular to their approach
            if (e.weaves) {
                e._weavePhase += 0.09;
                const strafe = Math.sin(e._weavePhase) * speed * 1.1;
                e.vx += (-dy / dist) * strafe;
                e.vy += (dx / dist) * strafe;
            }
            e.x += e.vx;
            e.y += e.vy;
        }

        if (e.shootRate) {
            e.shootTimer--;
            if (e.shootTimer <= 0) {
                e.shootTimer = Math.max(35, e.shootRate - game.wave * 2) * modVal('enemyFireRateMult', 1) * (e.berserkMod ? 0.6 : 1);
                const a = Math.atan2(player.y - e.y, player.x - e.x);
                const bulletSpeed = (e.bossRank ? (e.bossRank === 'full' ? 4.1 : 3.7) : 3.2) * modVal('enemyBulletSpeedMult', 1);
                const bulletDamage = e.bossRank === 'full' ? 11 + game.wave * 0.12 : e.bossRank === 'mini' ? 8 + game.wave * 0.08 : (e.kind === 'nikitaGuard' ? 8 : 5);
                const color = e.bossRank ? '#ff0041' : (e.kind === 'nikitaGuard' ? '#ef4444' : '#facc15');
                const fan = e.fan || 1;
                for (let i = 0; i < fan; i++) {
                    const ang = a + (i - (fan - 1) / 2) * 0.22;
                    enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(ang) * bulletSpeed, vy: Math.sin(ang) * bulletSpeed, radius: e.bossRank ? 5 : 4, damage: bulletDamage, age: 0, color });
                }
            }
        }
        if (e.bossRank) updateBossPattern(e);
        if (e.aura && Math.random() < 0.03) createParticles(e.x, e.y, '#38bdf8', 1);
    });

    // Solid obstacles push enemies out (charging bosses smash straight through)
    enemies.forEach(e => {
        if (!(e._chargeTimer > 0)) collideWithObstacles(e);
    });

    enemies = enemies.filter(e => {
        if (e.health <= 0) {
            if (!e._silentDeath) onEnemyKilled(e);
            return false;
        }
        return true;
    });

    enemies.forEach(e => {
        if (e.phased) return; // WRAITH: intangible, no contact damage either way
        const dist = Math.hypot(e.x - player.x, e.y - player.y);
        if (dist < e.radius + player.radius) {
            if (player.iframes <= 0 && game.tick - player.lastHitTick > 5 && !player.godMode) {
                const reduction = Math.max(0, Math.min(0.75, (player.armor + (player.lastStand && player.health < player.maxHealth * 0.35 ? 0.20 : 0)) * modVal('armorMult', 1)));
                const dmgToTake = e.contact * ENEMY_DAMAGE_MULT * (1 - reduction);
                // Undying Loyalty: a thrall intercepts a hit that would leave Larry critical (once per wave)
                if (player.undyingLoyalty && !player.loyaltyUsed && minions.length > 0 && player.health - dmgToTake < player.maxHealth * 0.25) {
                    let nearest = null, nearestD = 99999;
                    minions.forEach(m => { const d = Math.hypot(m.x - player.x, m.y - player.y); if (d < nearestD) { nearestD = d; nearest = m; } });
                    nearest.health = -1;
                    player.iframes = 80;
                    player.loyaltyUsed = true;
                    createParticles(player.x, player.y, '#a78bfa', 30);
                    showAwakening('☠ THRALL INTERCEPTED THE HIT');
                } else {
                    const finalDmg = player.turretStance ? dmgToTake * 0.6 : dmgToTake;
                    player.health -= finalDmg;
                    game.waveDamageTaken += finalDmg;
                    if (player.theWall) player.bastionMeter = Math.min(100, player.bastionMeter + finalDmg * 1.5);
                    player.lastHitTick = game.tick;
                    player.iframes = (player.invulnDuration || 30) + (player.iframeBonus || 0);
                    if (player.payback) player.paybackTimer = 150;
                    if (e.vampiric) e.health = Math.min(e.maxHealth, e.health + e.contact * 4);
                    addShake(4);
                    sfx('playerHurt');
                }
                if (player.thorns > 0) e.health -= effectiveDamage() * player.thorns;
            }
            const pushAngle = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(pushAngle) * 3.5;
            e.y += Math.sin(pushAngle) * 3.5;
        }
        if (player.hasKnockbackAura && dist < 75) {
            const a = Math.atan2(e.y - player.y, e.x - player.x);
            e.x += Math.cos(a) * 1.5;
            e.y += Math.sin(a) * 1.5;
        }
    });
}

function onEnemyKilled(e) {
    game.score += e.points;
    game.kills++;
    if (player.killDamageBoost) player.killBoostTimer = 120;
    if (player.lifeSteal > 0) player.health = Math.min(player.health + player.lifeSteal, player.maxHealth);
    // DEADEYE: kills build Focus
    if (player.deadeyeAwakened) player.focusMeter = Math.min(100, player.focusMeter + 8);
    // PUPPETMASTER: poisoned/marked kills may rise as permanent thralls
    if (player.puppetmaster && !e.bossRank && (e._poisonTimer > 0 || e._marked) && player.permanentThralls < 6 && Math.random() < 0.25) {
        spawnMinionsAt(e.x, e.y, 1);
        const thrall = minions[minions.length - 1];
        thrall.life = 999999;
        thrall.permanent = true;
        player.permanentThralls++;
        spawnDamageNumber(e.x, e.y - 14, 0, '#84cc16', true);
    }
    // Nikita drops a weapon cache for gun users
    if (e.bossRank === 'full' && !player.hasSword && !player.permanentStaff) {
        powerups.push({ x: e.x, y: e.y, type: 'cache', radius: 10 });
    }
    createParticles(e.x, e.y, e.color, 15);
    if (e.bossRank) { addShake(e.bossRank === 'full' ? 12 : 8); game.hitStop = e.bossRank === 'full' ? 14 : 8; }
    // Health/damage drops decay slowly with wave; elites always drop
    const dropChance = Math.max(0.06, 0.10 - game.wave * 0.0015);
    if (e.elite || Math.random() < dropChance) {
        powerups.push({ x: e.x, y: e.y, type: Math.random() < 0.65 ? 'health' : 'damage', radius: 7 });
    }
    // SPLITTER / CURSED elite: death spawns scouts. Deferred one tick because
    // this runs inside the enemies.filter pass, which won't keep new pushes.
    const spawnlings = (e.splitsOnDeath || 0) + (e.cursed ? 2 : 0);
    if (spawnlings > 0) {
        const sx = e.x, sy = e.y;
        schedule(1, () => {
            for (let i = 0; i < spawnlings; i++) {
                const s = ENEMY_TYPES[0].make(game.wave);
                s.health *= 0.6 * enemyScale(game.wave);
                const a = Math.random() * Math.PI * 2;
                enemies.push({ x: sx + Math.cos(a) * 14, y: sy + Math.sin(a) * 14, vx: 0, vy: 0, ...s, maxHealth: s.health, points: Math.floor(s.points * 0.5) });
            }
        });
    }
    // VOLATILE elite: telegraphed death blast
    if (e.volatile) {
        const bx = e.x, by = e.y;
        telegraphs.push({
            x: bx, y: by, radius: 75, timer: 30, color: '#f97316',
            onDone: () => {
                createParticles(bx, by, '#f97316', 40);
                addShake(5);
                sfx('explosion');
                if (Math.hypot(player.x - bx, player.y - by) < 75 + player.radius) damagePlayer(10 + game.wave * 0.2);
                enemies.forEach(o => { if (Math.hypot(o.x - bx, o.y - by) < 75) o.health -= 40; });
            }
        });
    }
    // NECROMANCER: kills shed soul shards that drift to Larry
    if (player.permanentStaff && Math.random() < 0.35) {
        soulShards.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, life: 300, radius: 4 });
    }
    // REANIMATION: Restless Dead — chance to raise enemy as thrall
    if (player.minionSpawnsOnKill > 0 && Math.random() < player.minionSpawnsOnKill) {
        spawnMinionsAt(e.x, e.y, 1);
    }
    if (player.fragmentKills && Math.random() < 0.45) {
        for (let i = 0; i < 6; i++) bullets.push(makeBullet(e.x, e.y, (Math.PI * 2 / 6) * i, effectiveDamage() * 0.35));
    }
}

function updateBossPattern(e) {
    if (e.bossId === 'vlad') updateVlad(e);
    else if (e.bossId === 'twins') updateTwin(e);
    else if (e.bossId === 'handlerPrime') updateHandlerPrime(e);
    else if (e.bossId === 'nikita') updateNikita(e);
}

// --- Enemy bullets ----------------------------------------------------------

function updateEnemyBullets() {
    enemyBullets = enemyBullets.filter(b => {
        // Homing missiles curve toward Larry
        if (b.homing) {
            const want = Math.atan2(player.y - b.y, player.x - b.x);
            const cur = Math.atan2(b.vy, b.vx);
            let diff = want - cur;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            const turn = Math.max(-0.06, Math.min(0.06, diff));
            const spd = Math.max(2.6, Math.hypot(b.vx, b.vy));
            b.vx = Math.cos(cur + turn) * spd;
            b.vy = Math.sin(cur + turn) * spd;
            if (game.tick % 4 === 0) createParticles(b.x, b.y, b.color || '#38bdf8', 1);
        }
        b.x += b.vx;
        b.y += b.vy;
        b.age++;
        // Cover blocks enemy fire too
        for (const o of obstacles) {
            if (o.kind === 'acid') continue;
            if (Math.hypot(b.x - o.x, b.y - o.y) < o.r + b.radius) return false;
        }
        const dist = Math.hypot(b.x - player.x, b.y - player.y);
        if (dist < b.radius + player.radius && !b._hitPlayer) {
            if (player.autoDodge && player.autoDodgeCooldown <= 0) {
                player.iframes = 35;
                player.autoDodgeCooldown = player.autoDodgeBase || 240;
                createParticles(player.x, player.y, '#ffffff', 15);
                if (b.piercesPlayer) { b._hitPlayer = true; } else { return false; }
            } else {
                if (player.iframes <= 0 && !player.godMode) {
                    const reduction = Math.max(0, Math.min(0.75, ((player.bulletArmor || 0) + player.armor * 0.5) * modVal('armorMult', 1)));
                    let dealt = b.damage * ENEMY_DAMAGE_MULT * (1 - reduction);
                    if (player.turretStance) dealt *= 0.6;
                    player.health -= dealt;
                    game.waveDamageTaken += dealt;
                    if (player.theWall) player.bastionMeter = Math.min(100, player.bastionMeter + dealt * 1.5);
                    player.iframes = 20 + (player.iframeBonus || 0);
                    addShake(3);
                    sfx('playerHurt');
                }
                if (b.piercesPlayer) { b._hitPlayer = true; } else { return false; }
            }
        }
        const margin = b.homing ? 90 : 20; // homing missiles may launch from off-screen hosts
        return b.x > -margin && b.x < canvas.width + margin && b.y > -margin && b.y < canvas.height + margin && b.age < (b.homing ? 320 : 240);
    });
}

// --- Minions ----------------------------------------------------------------

function updateMinions() {
    minions = minions.filter(m => {
        m.life--;
        if (m.life <= 0 || m.health <= 0) {
            if (m.permanent) player.permanentThralls = Math.max(0, player.permanentThralls - 1);
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
                target.health -= m.damage * 0.08; // per-tick damage
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
                        dead: false,
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

// --- Pickups, particles, explosions -----------------------------------------

function getHealthPackHealAmount() {
    const startPct = 0.20;
    const endPct = 0.05;
    const t = Math.min(1, Math.max(0, (game.wave - 1) / 24));
    return Math.max(1, player.maxHealth * (startPct + (endPct - startPct) * t));
}

function updatePowerupsAndParticles() {
    powerups = powerups.filter(p => {
        const dist = Math.hypot(p.x - player.x, p.y - player.y);
        if (dist < p.radius + player.radius) {
            if (p.type === 'cache') {
                openWeaponCache();
                return false;
            }
            if (p.type === 'health') player.health = Math.min(player.health + getHealthPackHealAmount(), player.maxHealth);
            else player.damage *= 1.04;
            createParticles(p.x, p.y, '#ffff00', 10);
            sfx('pickup');
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
            e.health -= effectiveDamage() * 0.45 * (player.explosionScale || 1);
            if (chain && dist > 8 && Math.random() < 0.25) createParticles(e.x, e.y, '#ff6b00', 12);
        }
    });
    createParticles(x, y, '#ff6b00', 35);
    addShake(2.5);
    sfx('explosion');
    // ARMAGEDDON (grenade launcher mythic): blast sites keep burning
    if (activeWeapon.armageddon) {
        tarPools.push({ x, y, life: 240, radius: 50, burn: true });
    }
}

// --- BERSERKER: sword combat ------------------------------------------------

function swordDamage() {
    return player.damage * player.swordMult * modVal('playerDamageMult', 1);
}

function isRaging() {
    return player.berserkerRage && player.health < player.maxHealth * player.rageThreshold;
}

function swingSword() {
    if (!player.hasSword) return;
    let cooldownMs = player.swordSwingRate;
    const raging = isRaging();
    if (raging) cooldownMs *= 0.5;
    if (game.tick - player.swordLastSwingTick < msToTicks(cooldownMs)) return;
    player.swordLastSwingTick = game.tick;
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    player.swordAngle = angle;
    player.swordSwingTimer = 12; // ticks the swing arc renders
    player.swordSwingDir *= -1; // alternate slash direction each swing
    // Blades lunge toward the swing when Larry lacks a dash
    if (player.hasSword && !player.hasDash) {
        player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x + Math.cos(angle) * 14));
        player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y + Math.sin(angle) * 14));
    }
    applySwordHit(angle, player.swordRange, raging);
    sfx('swordSwing');
    if (player.swordEchoBlade) {
        // spectral echo: half damage, slightly wider, offset timing
        schedule(5, () => applySwordHit(angle, player.swordRange + 12, raging, true));
    }
    // Shockwave: every third swing releases a knockback blast
    player.shockwaveCharge++;
    if (player.swordShockwave && player.shockwaveCharge >= 3) {
        player.shockwaveCharge = 0;
        enemies.forEach(e => {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < 120) {
                const ka = Math.atan2(e.y - player.y, e.x - player.x);
                e.x += Math.cos(ka) * 28;
                e.y += Math.sin(ka) * 28;
                e.health -= swordDamage() * 0.3;
            }
        });
        createParticles(player.x, player.y, '#fff', 30);
        addShake(3);
    }
}

function applySwordHit(angle, range, raging, echo = false) {
    const arcHalf = player.swordArcWidth;
    let dmgMult = echo ? 0.5 : 1.0;
    if (raging) dmgMult *= 1.5;
    enemies.forEach(e => {
        if (e.phased) return; // WRAITH: intangible, blades pass through
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d > range + e.radius) return;
        const eAngle = Math.atan2(e.y - player.y, e.x - player.x);
        let diff = eAngle - angle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) > arcHalf) return;
        let dmg = swordDamage() * dmgMult;
        if (e.bossRank) dmg *= (player.bossDamageBonus || 1);
        dmg *= (1 - bulwarkShieldReduction(e));
        dmg *= bossStanceMult(e);
        e.health -= dmg * (1 - (e.armor || 0) * 0.5); // blades shear through half of armor
        e._flashTimer = 4;
        spawnDamageNumber(e.x, e.y - e.radius, dmg * (1 - (e.armor || 0) * 0.5), raging ? '#f87171' : '#fff', raging);
        if (player.swordLifesteal > 0) {
            player.health = Math.min(player.maxHealth, player.health + dmg * player.swordLifesteal);
        }
        if (player.swordOnFire && !echo) {
            e._burnDps = Math.max(e._burnDps || 0, player.swordFireDamage);
            e._burnTimer = Math.max(e._burnTimer || 0, 120);
            createParticles(e.x, e.y, '#ff6b00', 6);
            createParticles(e.x, e.y, '#fde68a', 3);
            player.fireTrails.push({ x: e.x, y: e.y, life: player.firePoolLife, radius: player.firePoolRadius });
            // Inferno spread: strong burns jump to neighbors
            if (player.swordFireDamage >= 12) {
                enemies.forEach(other => {
                    if (other !== e && Math.hypot(other.x - e.x, other.y - e.y) < 55 && !(other._burnTimer > 0)) {
                        other._burnDps = player.swordFireDamage * 0.5;
                        other._burnTimer = 80;
                    }
                });
            }
        }
        const ka = Math.atan2(e.y - player.y, e.x - player.x);
        e.x += Math.cos(ka) * (echo ? 4 : 9);
        e.y += Math.sin(ka) * (echo ? 4 : 9);
        createParticles(e.x, e.y, echo ? '#c4b5fd' : '#fff', echo ? 4 : 8);
    });
}

function burnTickEnemy(e) {
    e.health -= e._burnDps;
    // PYRE LORD: burning enemies at death's door combust
    if (player.pyreLord && !e.bossRank && e.maxHealth && e.health > 0 && e.health < e.maxHealth * 0.15) {
        e.health = 0;
        createParticles(e.x, e.y, '#fde68a', 14);
    }
    createParticles(e.x, e.y, '#ff6b00', 2);
}

function updateSwordAndFire() {
    // Burn ticks apply even without the sword (future sources may burn too)
    enemies.forEach(e => {
        if (e._burnTimer > 0) {
            e._burnTimer--;
            if (e._burnTimer % 15 === 0) burnTickEnemy(e);
        } else {
            e._burnDps = 0;
        }
    });

    if (!player.hasSword) return;
    if (player.swordSwingTimer > 0) player.swordSwingTimer--;
    if (player.swordWhirlwindVisualTimer > 0) player.swordWhirlwindVisualTimer--;

    // Whirlwind
    if (player.swordWhirlwind) {
        if (player.whirlwindTimer > 0) {
            player.whirlwindTimer--;
        } else {
            const wwAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
            const savedArc = player.swordArcWidth;
            player.swordArcWidth = Math.PI; // full circle via two opposite swings
            applySwordHit(wwAngle, player.swordRange + 10, false);
            applySwordHit(wwAngle + Math.PI, player.swordRange + 10, false);
            player.swordArcWidth = savedArc;
            createParticles(player.x, player.y, player.swordOnFire ? '#ff6b00' : '#00ff41', 40);
            if (player.swordOnFire) createParticles(player.x, player.y, '#fde68a', 20);
            player.whirlwindTimer = player.whirlwindCooldownMax;
            player.swordWhirlwindVisualTimer = 20;
            addShake(3);
            sfx('swordSwing');
        }
    }

    // PYRE LORD: searing aura around Larry
    if (player.pyreLord && game.tick % 12 === 0) {
        enemies.forEach(e => {
            if (Math.hypot(e.x - player.x, e.y - player.y) < 70) {
                e._burnDps = Math.max(e._burnDps || 0, player.swordFireDamage * 0.4);
                e._burnTimer = Math.max(e._burnTimer || 0, 30);
            }
        });
    }

    // Fire pools linger and ignite enemies inside them
    player.fireTrails = player.fireTrails.filter(ft => {
        ft.life--;
        enemies.forEach(e => {
            if (Math.hypot(e.x - ft.x, e.y - ft.y) < ft.radius + e.radius) {
                e._burnDps = Math.max(e._burnDps || 0, player.swordFireDamage * 0.6);
                e._burnTimer = Math.max(e._burnTimer || 0, 40);
            }
        });
        if (Math.random() < 0.15) createParticles(ft.x + (Math.random() - 0.5) * ft.radius, ft.y + (Math.random() - 0.5) * ft.radius, '#ff6b00', 1);
        return ft.life > 0;
    });
}

// --- NECROMANCER: staff -----------------------------------------------------

function updateStaffInput() {
    if (mouse.down) {
        player.staffCharge = Math.min(1, player.staffCharge + 0.008);
        // Quick orbs while tapping (before a real charge builds)
        if (player.staffCharge < 0.05 && game.tick - player.lastShotTick >= msToTicks(player.fireRate * 0.6)) {
            player.lastShotTick = game.tick;
            fireStaffPulse(false);
        }
    } else if (player.staffCharge > 0.15) {
        fireStaffPulse(true, player.staffCharge);
        player.staffCharge = 0;
        player.lastShotTick = game.tick;
    } else {
        player.staffCharge = 0;
    }
}

function fireStaffPulse(charged, chargeLevel) {
    const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    const baseDmg = Math.max(12, player.damage * 0.55) * (player.staffPowerBonus ? 1.6 : 1) * modVal('playerDamageMult', 1);
    const baseRadius = player.staffPowerBonus ? 22 : 14;
    let dmg, radius, speed;
    if (charged && chargeLevel > 0.15) {
        const c = Math.min(1, chargeLevel);
        dmg = baseDmg * (1.5 + c * 3.5);   // up to 5x damage at full charge
        radius = baseRadius + c * 28;
        speed = 2.5;
        createParticles(player.x, player.y, '#7c3aed', 30);
        createParticles(player.x, player.y, '#c4b5fd', 15);
        addShake(4);
    } else {
        dmg = baseDmg;
        radius = baseRadius;
        speed = 3.2;
    }
    bullets.push({
        x: player.x, y: player.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius, hitRadius: radius,
        damage: dmg,
        piercing: true,
        hits: 0,
        age: 0,
        dead: false,
        bounces: 0,
        isStaffOrb: true,
        isCharged: charged,
        hitEnemies: new Set()
    });
    if (!charged) createParticles(player.x, player.y, '#a78bfa', 12);
    sfx(charged ? 'staffBlast' : 'staffShot');
}

function updateSoulShards() {
    soulShards = soulShards.filter(s => {
        s.life--;
        // Drift toward Larry
        const dx = player.x - s.x, dy = player.y - s.y;
        const dist = Math.max(1, Math.hypot(dx, dy));
        const pull = dist < 120 ? 0.18 : 0.04;
        s.vx += (dx / dist) * pull;
        s.vy += (dy / dist) * pull;
        const spd = Math.hypot(s.vx, s.vy);
        if (spd > 3.5) { s.vx = (s.vx / spd) * 3.5; s.vy = (s.vy / spd) * 3.5; }
        s.x += s.vx; s.y += s.vy;
        if (dist < s.radius + player.radius + 4) {
            player.health = Math.min(player.maxHealth, player.health + 4);
            if (player.permanentStaff) player.staffCharge = Math.min(1, player.staffCharge + 0.06);
            createParticles(s.x, s.y, '#a78bfa', 5);
            sfx('shard');
            return false;
        }
        return s.life > 0;
    });
}

// --- Specialized enemy behaviors --------------------------------------------

// Direct damage from blasts, lasers, and hazards (respects armor + iframes)
function damagePlayer(amount) {
    if (player.godMode || player.iframes > 0) return;
    const reduction = Math.max(0, Math.min(0.75, player.armor * modVal('armorMult', 1)));
    let dealt = amount * ENEMY_DAMAGE_MULT * (1 - reduction);
    if (player.turretStance) dealt *= 0.6;
    player.health -= dealt;
    game.waveDamageTaken += dealt;
    if (player.theWall) player.bastionMeter = Math.min(100, player.bastionMeter + dealt * 1.5);
    player.iframes = 25 + (player.iframeBonus || 0);
    addShake(5);
    sfx('playerHurt');
}

// Mender: hangs back and heal-beams the most wounded nearby ally
function updateMender(e) {
    const distP = Math.hypot(player.x - e.x, player.y - e.y);
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    if (distP < e.keepAway) {
        e.x -= Math.cos(a) * e.speed;
        e.y -= Math.sin(a) * e.speed;
    } else if (distP > e.keepAway + 120) {
        e.x += Math.cos(a) * e.speed * 0.7;
        e.y += Math.sin(a) * e.speed * 0.7;
    }
    e.x = Math.max(e.radius, Math.min(canvas.width - e.radius, e.x));
    e.y = Math.max(e.radius, Math.min(canvas.height - e.radius, e.y));
    // Heal beam
    let target = null, worst = 1;
    enemies.forEach(o => {
        if (o === e || o.mender || !o.maxHealth || o.health >= o.maxHealth) return;
        const d = Math.hypot(o.x - e.x, o.y - e.y);
        if (d > 260) return;
        const frac = o.health / o.maxHealth;
        if (frac < worst) { worst = frac; target = o; }
    });
    if (target) {
        target.health = Math.min(target.maxHealth, target.health + 0.5 + game.wave * 0.015);
        e._healTarget = target;
        if (game.tick % 8 === 0) createParticles(target.x, target.y, '#fbbf24', 1);
    } else {
        e._healTarget = null;
    }
}

// Deadeye: stops, draws a laser sight, then snaps a near-hitscan bolt
function updateDeadeye(e) {
    if (e._deadeyeCd > 0) e._deadeyeCd--;
    if (e._aiming) {
        e._aimTimer--;
        // Track the player until the final moments — then the shot is locked
        if (e._aimTimer > 15) e._aimAngle = Math.atan2(player.y - e.y, player.x - e.x);
        if (e._aimTimer <= 0) {
            e._aiming = false;
            e._deadeyeCd = 130;
            const a = e._aimAngle;
            enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 9.5, vy: Math.sin(a) * 9.5, radius: 4, damage: 9 + game.wave * 0.12, age: 0, color: '#f43f5e' });
            createParticles(e.x, e.y, '#f43f5e', 6);
            sfx('shoot_sniper');
        }
        return;
    }
    const distP = Math.hypot(player.x - e.x, player.y - e.y);
    if (distP > 380) {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(a) * e.speed;
        e.y += Math.sin(a) * e.speed;
    } else if ((e._deadeyeCd || 0) <= 0) {
        e._aiming = true;
        e._aimTimer = 50;
        e._aimAngle = Math.atan2(player.y - e.y, player.x - e.x);
    }
}

// Rail Trooper: plants its feet, charges a long telegraph, then fires a
// piercing rail shot clean through Larry (and anything behind him).
function updateRailTrooper(e) {
    if (e._railCd > 0) e._railCd--;
    if (e._aiming) {
        e._aimTimer--;
        if (e._aimTimer > 20) e._aimAngle = Math.atan2(player.y - e.y, player.x - e.x);
        if (e._aimTimer <= 0) {
            e._aiming = false;
            e._railCd = 165;
            const a = e._aimAngle;
            const spd = 8.5 * modVal('enemyBulletSpeedMult', 1);
            enemyBullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, radius: 5, damage: 13 + game.wave * 0.15, age: 0, color: '#fde047', piercesPlayer: true });
            createParticles(e.x, e.y, '#fde047', 10);
            addShake(2);
            sfx('shoot_sniper');
        }
        return;
    }
    const distP = Math.hypot(player.x - e.x, player.y - e.y);
    if (distP > 420) {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(a) * e.speed;
        e.y += Math.sin(a) * e.speed;
    } else if ((e._railCd || 0) <= 0) {
        e._aiming = true;
        e._aimTimer = 75;
        e._aimAngle = Math.atan2(player.y - e.y, player.x - e.x);
    }
}

// Bulwark Commander: doesn't fight itself so much as shelter its squad —
// any regular enemy near it takes much less damage, so it becomes the
// priority target rather than whatever is currently swinging at Larry.
function bulwarkShieldReduction(e) {
    if (e.bossRank || e.bulwark) return 0;
    for (const o of enemies) {
        if (o === e || !o.bulwark || o.health <= 0) continue;
        if (Math.hypot(o.x - e.x, o.y - e.y) < o.shieldRadius) return 0.4;
    }
    return 0;
}

// Boss "stance" multiplier: every mini/full boss now has at least one real
// weak-point mechanic — a guarded stance that shrugs off damage and a punish
// window that rewards saving your burst for the right moment. Read by every
// damage-application site (bullets, staff orbs, sword) so it's universal.
function bossStanceMult(e) {
    if (!e.bossRank) return 1;
    if (e.lastStandGuard) return (e._punishWindow > 0) ? 1.5 : 0.15;
    let m = 1;
    if (e.shielded) m *= 0.2;              // VLAD: shield stance
    if (e._exposedTimer > 0) m *= 1.6;     // VLAD: post-charge stagger
    if (e.handlerShielded) m *= 0.15;      // HANDLER PRIME: drone screen up
    if (e._overloadTimer > 0) m *= 2;      // HANDLER PRIME: drones just wiped
    if (e.twinLinked) m *= 0.3;            // THE TWINS: mid sync-beam
    return m;
}

// Aegis drone: orbits a host (or its boss) and soaks bullets
function updateAegis(e) {
    let host = e.bossHost && e.bossHost.health > 0 ? e.bossHost : null;
    if (!host) {
        let best = 99999;
        enemies.forEach(o => {
            if (o === e || o.orbiter) return;
            const d = Math.hypot(o.x - e.x, o.y - e.y);
            if (d < best) { best = d; host = o; }
        });
        if (best > 320) host = null;
    }
    if (host) {
        e._orbitAngle += 0.04;
        const orbitR = e.bossHost ? 70 : 40;
        const tx = host.x + Math.cos(e._orbitAngle) * orbitR;
        const ty = host.y + Math.sin(e._orbitAngle) * orbitR;
        const d = Math.max(1, Math.hypot(tx - e.x, ty - e.y));
        const step = Math.min(e.speed * 1.6, d);
        e.x += ((tx - e.x) / d) * step;
        e.y += ((ty - e.y) / d) * step;
    } else {
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        e.x += Math.cos(a) * e.speed * 0.8;
        e.y += Math.sin(a) * e.speed * 0.8;
    }
}

// Bomber: sprints in, arms a fuse, detonates. Returns true when it owned the tick.
function updateBomber(e) {
    if (e._fuse !== undefined) {
        e._fuse--;
        if (game.tick % 4 < 2) createParticles(e.x, e.y, '#fde68a', 1);
        if (e._fuse <= 0) {
            e.health = -9999;
            e._silentDeath = true;
            createParticles(e.x, e.y, '#f97316', 35);
            addShake(5);
            sfx('explosion');
            if (Math.hypot(player.x - e.x, player.y - e.y) < 85 + player.radius) damagePlayer(11 + game.wave * 0.25);
            enemies.forEach(o => { if (o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 85) o.health -= 35; });
        }
        return true; // stands its ground while the fuse burns
    }
    const distP = Math.hypot(player.x - e.x, player.y - e.y);
    if (distP < e.fuseRange) {
        e._fuse = 40;
        return true;
    }
    return false; // chase via the generic movement path
}

// Warper: periodically teleports to a ring around the player
function updateWarper(e) {
    e._warpTimer--;
    if (e._warpTimer <= 0) {
        createParticles(e.x, e.y, '#22d3ee', 15);
        const a = Math.random() * Math.PI * 2;
        const d = 150 + Math.random() * 80;
        e.x = Math.max(e.radius, Math.min(canvas.width - e.radius, player.x + Math.cos(a) * d));
        e.y = Math.max(e.radius, Math.min(canvas.height - e.radius, player.y + Math.sin(a) * d));
        e._warpTimer = 170;
        e.shootTimer = Math.min(e.shootTimer, 20);
        createParticles(e.x, e.y, '#22d3ee', 15);
    }
}

// --- Mines and telegraphed blasts -------------------------------------------

function updateMinesAndTelegraphs() {
    mines = mines.filter(m => {
        if (m.armTimer > 0) { m.armTimer--; return true; }
        m.life--;
        if (Math.hypot(player.x - m.x, player.y - m.y) < 26 + player.radius) {
            createParticles(m.x, m.y, '#ef4444', 25);
            addShake(5);
            sfx('explosion');
            damagePlayer(12 + game.wave * 0.2);
            return false;
        }
        return m.life > 0;
    });
    telegraphs = telegraphs.filter(t => {
        t.timer--;
        if (t.timer <= 0) {
            if (t.onDone) t.onDone();
            return false;
        }
        return true;
    });
}

// --- Awakening actives ------------------------------------------------------

// Space priority: dash (incl. PHANTOM) > DEADEYE focus > PUPPETMASTER virus zone
function onSpace() {
    if (player.hasDash) { dash(); return; }
    if (player.deadeyeAwakened) { activateFocus(); return; }
    if (player.puppetmaster) deployVirusZone();
}

function activateFocus() {
    if (player.focusMeter < 100 || player.focusTimer > 0) return;
    player.focusMeter = 0;
    player.focusTimer = 180; // 3 seconds of bullet-time
    showBanner('◎ FOCUS');
    addShake(3);
    sfx('awaken');
}

function deployVirusZone() {
    if (player.virusCooldown > 0) return;
    player.virusCooldown = 1200; // 20s
    virusZones.push({ x: mouse.x, y: mouse.y, radius: 110, life: 300 });
    createParticles(mouse.x, mouse.y, '#84cc16', 25);
    sfx('staffShot');
}

function updateAwakenings() {
    // THE WALL: bastion eruption
    if (player.theWall && player.bastionMeter >= 100) {
        player.bastionMeter = 0;
        const dmg = effectiveDamage() * 2 + 30;
        enemies.forEach(e => {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < 160) {
                e.health -= dmg;
                e._flashTimer = 4;
                if (!e.stunImmune) e._stunTimer = Math.max(e._stunTimer || 0, 40);
                const a = Math.atan2(e.y - player.y, e.x - player.x);
                e.x += Math.cos(a) * 30;
                e.y += Math.sin(a) * 30;
                spawnDamageNumber(e.x, e.y - e.radius, dmg, '#94a3b8', true);
            }
        });
        createParticles(player.x, player.y, '#94a3b8', 45);
        addShake(7);
        game.hitStop = Math.max(game.hitStop, 5);
        sfx('explosion');
        showBanner('🛡 BASTION ERUPTION');
    }

    // DEADEYE focus: timer + GUNSLINGER auto-fans
    if (player.focusTimer > 0) {
        player.focusTimer--;
        if (player.chosenBranches.DEFIANCE === 'B' && game.tick % 20 === 0) {
            const targets = [...enemies].filter(e => e.health > 0)
                .sort((a, b2) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b2.x - player.x, b2.y - player.y))
                .slice(0, 3);
            targets.forEach(t => {
                const a = Math.atan2(t.y - player.y, t.x - player.x);
                bullets.push(makeBullet(player.x, player.y, a, effectiveDamage() * 0.8));
            });
            if (targets.length) sfx('shoot_pistol');
        }
    }

    // WARHEAD: periodic airstrike on the cursor
    if (player.warhead) {
        player.airstrikeTimer--;
        if (player.airstrikeTimer <= 0) {
            player.airstrikeTimer = 720; // 12s
            const ax = mouse.x, ay = mouse.y;
            telegraphs.push({
                x: ax, y: ay, radius: 85, timer: 45, color: '#facc15',
                onDone: () => {
                    createParticles(ax, ay, '#facc15', 45);
                    createParticles(ax, ay, '#ff6b00', 30);
                    addShake(7);
                    sfx('explosion');
                    enemies.forEach(e => {
                        if (Math.hypot(e.x - ax, e.y - ay) < 85 + e.radius) {
                            const d = effectiveDamage() * 2.5;
                            e.health -= d;
                            e._flashTimer = 4;
                            spawnDamageNumber(e.x, e.y - e.radius, d, '#facc15', true);
                        }
                    });
                }
            });
            showBanner('✈ AIRSTRIKE INBOUND');
        }
    }

    if (player.virusCooldown > 0) player.virusCooldown--;
}

// WARHEAD / CLUSTER BOMBER: bomblets from a blast
function spawnBomblets(x, y) {
    for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.55 + (Math.random() - 0.5) * 0.3;
        const b = makeBullet(x, y, a, effectiveDamage() * 0.6);
        b.grenade = true;
        b.cluster = false;
        b.sticky = false;
        b.age = 70; // short fuse
        b.vx = Math.cos(a) * 2.5;
        b.vy = Math.sin(a) * 2.5 - 1;
        bullets.push(b);
    }
}

function updateDecoysAndZones() {
    // PHANTOM decoys: taunt, replay shots, detonate
    decoys = decoys.filter(d => {
        d.life--;
        if (player.shotHistory.length > 0 && d.life % 10 === 0) {
            const a = player.shotHistory[Math.floor(Math.random() * player.shotHistory.length)];
            bullets.push(makeBullet(d.x, d.y, a + (Math.random() - 0.5) * 0.1, effectiveDamage() * 0.6));
        }
        if (d.life <= 0) {
            const dmg = effectiveDamage() * 1.8;
            enemies.forEach(e => {
                if (Math.hypot(e.x - d.x, e.y - d.y) < 95) {
                    e.health -= dmg;
                    e._flashTimer = 4;
                    spawnDamageNumber(e.x, e.y - e.radius, dmg, '#9bf6ff', true);
                }
            });
            createParticles(d.x, d.y, '#9bf6ff', 30);
            addShake(4);
            sfx('explosion');
            return false;
        }
        return true;
    });

    // PUPPETMASTER virus zones: slow + weaken + poison inside
    virusZones = virusZones.filter(z => {
        z.life--;
        enemies.forEach(e => {
            if (Math.hypot(e.x - z.x, e.y - z.y) < z.radius + e.radius) {
                e._slowAmount = Math.max(e._slowAmount || 0, 0.45);
                e._slowTimer = Math.max(e._slowTimer || 0, 10);
                e._weakTimer = Math.max(e._weakTimer || 0, 30);
                e._poisonDps = Math.max(e._poisonDps || 0, 0.5 + game.wave * 0.02);
                e._poisonTimer = Math.max(e._poisonTimer || 0, 20);
            }
        });
        if (Math.random() < 0.2) createParticles(z.x + (Math.random() - 0.5) * z.radius * 1.6, z.y + (Math.random() - 0.5) * z.radius * 1.6, '#84cc16', 1);
        return z.life > 0;
    });

    // TAR pools: heavy slow. ARMAGEDDON pools (burn:true) also poison anyone standing in them.
    tarPools = tarPools.filter(t => {
        t.life--;
        enemies.forEach(e => {
            if (Math.hypot(e.x - t.x, e.y - t.y) < t.radius + e.radius) {
                if (t.burn) {
                    e._poisonDps = Math.max(e._poisonDps || 0, 4 + game.wave * 0.08);
                    e._poisonTimer = Math.max(e._poisonTimer || 0, 20);
                } else {
                    e._slowAmount = Math.max(e._slowAmount || 0, 0.5);
                    e._slowTimer = Math.max(e._slowTimer || 0, 8);
                }
            }
        });
        if (t.burn && Math.random() < 0.2) createParticles(t.x + (Math.random() - 0.5) * t.radius, t.y + (Math.random() - 0.5) * t.radius, '#dc2626', 1);
        return t.life > 0;
    });
}

// Weapon cache: mid-run weapon swap that keeps your evolution tier
function openWeaponCache() {
    cacheMode = true;
    game.state = 'upgrade';
    showBanner('📦 WEAPON CACHE');
    sfx('pickup');
    showWeaponMenu();
}

// --- Stages, obstacles, hazards, events -------------------------------------

function randObstaclePos(minCenterDist) {
    for (let tries = 0; tries < 40; tries++) {
        const x = 80 + Math.random() * (canvas.width - 160);
        const y = 80 + Math.random() * (canvas.height - 160);
        if (Math.hypot(x - canvas.width / 2, y - canvas.height / 2) < minCenterDist) continue;
        if (obstacles.some(o => Math.hypot(o.x - x, o.y - y) < o.r + 70)) continue;
        return { x, y };
    }
    return null;
}

function setupStage(stage) {
    obstacles = [];
    stageState = {};
    if (stage.layout === 'crates') {
        for (let i = 0; i < 5; i++) {
            const p = randObstaclePos(150);
            if (p) obstacles.push({ x: p.x, y: p.y, r: 18, kind: 'crate', health: 60, maxHealth: 60 });
        }
    } else if (stage.layout === 'pillars') {
        [0.3, 0.7].forEach(fx => {
            for (let i = 0; i < 3; i++) {
                obstacles.push({ x: canvas.width * fx, y: canvas.height * (0.25 + i * 0.25), r: 16, kind: 'pillar' });
            }
        });
    } else if (stage.layout === 'lab') {
        for (let i = 0; i < 3; i++) {
            const p = randObstaclePos(150);
            if (p) obstacles.push({ x: p.x, y: p.y, r: 16, kind: 'pillar' });
        }
        for (let i = 0; i < 3; i++) {
            const p = randObstaclePos(120);
            if (p) obstacles.push({ x: p.x, y: p.y, r: 45, kind: 'acid' });
        }
    } else if (stage.layout === 'roof') {
        for (let i = 0; i < 2; i++) {
            const p = randObstaclePos(150);
            if (p) obstacles.push({ x: p.x, y: p.y, r: 18, kind: 'crate', health: 60, maxHealth: 60 });
        }
        stageState.searchlights = [
            { x: 0, y: 0, angle: Math.PI / 4, spin: 0.004 },
            { x: canvas.width, y: 0, angle: Math.PI * 0.75, spin: -0.004 },
        ];
        stageState.caughtTicks = 0;
    } else if (stage.layout === 'bunker') {
        [0.22, 0.78].forEach(fx => {
            for (let i = 0; i < 2; i++) {
                obstacles.push({ x: canvas.width * fx, y: canvas.height * (0.35 + i * 0.3), r: 17, kind: 'crate', health: 70, maxHealth: 70 });
            }
        });
        obstacles.push({ x: canvas.width / 2, y: canvas.height / 2, r: 20, kind: 'pillar' });
    } else if (stage.layout === 'blacksite') {
        for (let i = 0; i < 3; i++) {
            const p = randObstaclePos(190);
            if (p) obstacles.push({ x: p.x, y: p.y, r: 14, kind: 'pillar' });
        }
    }
    if (stage.hazard === 'freight') stageState.freight = { timer: 900, active: null };
    if (stage.hazard === 'vents') {
        stageState.vents = [];
        for (let i = 0; i < 3; i++) {
            const p = randObstaclePos(140);
            if (p) stageState.vents.push({ x: p.x, y: p.y, phase: 'idle', t: 240 + Math.floor(Math.random() * 360) });
        }
    }
    if (stage.hazard === 'wind') stageState.wind = { timer: 1100, active: null };
    if (stage.hazard === 'sentries') stageState.sentries = { timer: 400 };
    if (stage.hazard === 'pulse') stageState.pulse = { timer: 700, active: null };
}

function refreshStageWaveState(stage) {
    // Regenerate the arena each wave so cover comes back and layouts fit growth
    setupStage(stage);
}

// Push a circular entity out of solid obstacles
function collideWithObstacles(ent) {
    for (const o of obstacles) {
        if (o.kind === 'acid') continue;
        const d = Math.hypot(ent.x - o.x, ent.y - o.y);
        const minD = o.r + ent.radius;
        if (d < minD && d > 0.01) {
            ent.x = o.x + ((ent.x - o.x) / d) * minD;
            ent.y = o.y + ((ent.y - o.y) / d) * minD;
        }
    }
}

function updateStageHazards() {
    const s = stageState;

    // Acid pools: burn Larry, slow enemies
    obstacles.forEach(o => {
        if (o.kind !== 'acid') return;
        if (!player.godMode && Math.hypot(player.x - o.x, player.y - o.y) < o.r + player.radius * 0.5) {
            const acidDmg = 0.12 * ENEMY_DAMAGE_MULT;
            player.health -= acidDmg;
            game.waveDamageTaken += acidDmg;
            if (game.tick % 20 === 0) createParticles(player.x, player.y, '#84cc16', 2);
        }
        enemies.forEach(e => {
            if (Math.hypot(e.x - o.x, e.y - o.y) < o.r + e.radius) {
                e._slowAmount = Math.max(e._slowAmount || 0, 0.3);
                e._slowTimer = Math.max(e._slowTimer || 0, 6);
            }
        });
    });

    // TRAINYARD: freight sweep — a warned horizontal band, then a lethal pass
    if (s.freight) {
        const f = s.freight;
        if (!f.active) {
            f.timer--;
            if (f.timer <= 0) {
                f.active = { phase: 'warn', t: 70, y: 60 + Math.random() * (canvas.height - 190), h: 80 };
                showBanner('🚆 FREIGHT INCOMING');
                sfx('bossAlarm');
            }
        } else {
            f.active.t--;
            if (f.active.phase === 'warn' && f.active.t <= 0) {
                f.active.phase = 'sweep';
                f.active.t = 40;
                addShake(6);
                sfx('explosion');
            } else if (f.active.phase === 'sweep') {
                const band = f.active;
                if (player.y > band.y && player.y < band.y + band.h) damagePlayer(8000 + game.wave * 0.15);
                enemies.forEach(e => {
                    if (e.y > band.y && e.y < band.y + band.h && !e._freightHit) {
                        e.health -= 90;
                        e._flashTimer = 4;
                        e._freightHit = true;
                        e.x += 18;
                    }
                });
                if (f.active.t <= 0) {
                    enemies.forEach(e => delete e._freightHit);
                    f.active = null;
                    f.timer = 1300 + Math.floor(Math.random() * 400);
                }
            }
        }
    }

    // LAB: gas vents cycle idle → warn → burst
    if (s.vents) {
        s.vents.forEach(v => {
            v.t--;
            if (v.t > 0) return;
            if (v.phase === 'idle') { v.phase = 'warn'; v.t = 60; }
            else if (v.phase === 'warn') { v.phase = 'burst'; v.t = 45; sfx('shoot_flamethrower'); }
            else {
                v.phase = 'idle';
                v.t = 300 + Math.floor(Math.random() * 400);
            }
        });
        s.vents.forEach(v => {
            if (v.phase !== 'burst') return;
            if (game.tick % 4 === 0) createParticles(v.x + (Math.random() - 0.5) * 60, v.y + (Math.random() - 0.5) * 60, '#84cc16', 2);
            if (Math.hypot(player.x - v.x, player.y - v.y) < 70 + player.radius) damagePlayer(8 + game.wave * 0.1);
            enemies.forEach(e => {
                if (Math.hypot(e.x - v.x, e.y - v.y) < 70) e.health -= 1.2;
            });
        });
    }

    // ROOF: searchlights summon backup; wind gusts shove the arena
    if (s.searchlights) {
        let caught = false;
        s.searchlights.forEach(sl => {
            sl.angle += sl.spin;
            const dx = player.x - sl.x, dy = player.y - sl.y;
            const dist = Math.hypot(dx, dy);
            let diff = Math.atan2(dy, dx) - sl.angle;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            if (dist < 520 && Math.abs(diff) < 0.22) caught = true;
        });
        if (caught) {
            s.caughtTicks++;
            if (s.caughtTicks >= 60) {
                s.caughtTicks = -180; // grace period
                showBanner('🚨 SPOTTED — BACKUP INBOUND');
                sfx('bossAlarm');
                for (let i = 0; i < 3; i++) spawnEnemyOfType(chooseEnemyType());
            }
        } else if (s.caughtTicks > 0) {
            s.caughtTicks = Math.max(0, s.caughtTicks - 2);
        } else if (s.caughtTicks < 0) {
            s.caughtTicks++;
        }
    }
    if (s.wind) {
        const w = s.wind;
        if (!w.active) {
            w.timer--;
            if (w.timer <= 0) {
                w.active = { t: 150, ang: Math.random() * Math.PI * 2 };
                showBanner('💨 WIND GUST');
            }
        } else {
            w.active.t--;
            if (w.active.t < 105) { // push starts after the warning beat
                player.x += Math.cos(w.active.ang) * 1.1;
                player.y += Math.sin(w.active.ang) * 1.1;
                player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
                player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
            }
            if (w.active.t <= 0) {
                w.active = null;
                w.timer = 1000 + Math.floor(Math.random() * 500);
            }
        }
    }

    // BUNKER: wall-mounted sentry turrets come online periodically (capped count)
    if (s.sentries) {
        s.sentries.timer--;
        const turretCount = enemies.filter(e => e._sentry).length;
        if (s.sentries.timer <= 0 && turretCount < 3) {
            s.sentries.timer = 480;
            const p = edgeSpawnPoint(40);
            const hp = 90 * enemyScale(game.wave);
            enemies.push({ x: p.x, y: p.y, vx: 0, vy: 0, kind: 'turret', radius: 10, speed: 0, health: hp, maxHealth: hp, contact: 0.4, armor: 0.15, shootRate: 90, shootTimer: 50, color: '#fb923c', points: 60, _sentry: true });
            showBanner('🔧 SENTRY ONLINE');
            sfx('bossAlarm');
        }
    }

    // BLACK SITE: a shockwave pulses out from the arena center — outrun the ring
    if (s.pulse) {
        const p = s.pulse;
        if (!p.active) {
            p.timer--;
            if (p.timer <= 0) {
                p.active = { radius: 0, max: Math.max(canvas.width, canvas.height) * 0.8, speed: 3.0 + game.wave * 0.015 };
                showBanner('◎ PULSE CHARGING');
                sfx('bossAlarm');
            }
        } else {
            p.active.radius += p.active.speed;
            const cx = canvas.width / 2, cy = canvas.height / 2;
            const dPlayer = Math.hypot(player.x - cx, player.y - cy);
            if (Math.abs(dPlayer - p.active.radius) < 22) damagePlayer(14 + game.wave * 0.2);
            if (p.active.radius > p.active.max) {
                p.active = null;
                p.timer = 620 + Math.floor(Math.random() * 300);
            }
        }
    }
}

// --- Mid-wave events ---------------------------------------------------------

function updateEvents() {
    const ev = game.pendingEvent;
    if (ev && game.tick >= ev.at && game.state === 'playing') {
        game.pendingEvent = null;
        triggerEvent(ev.type);
    }
    if (game.blackoutTimer > 0) game.blackoutTimer--;
}

function triggerEvent(type) {
    if (type === 'blackout') {
        game.blackoutTimer = 300;
        showBanner('⚡ BLACKOUT ⚡');
        sfx('bossAlarm');
    } else if (type === 'assassin') {
        const t = ENEMY_TYPES.find(x => x.id === 'deadeye');
        const p = edgeSpawnPoint(25);
        spawnEnemyOfType(t, { x: p.x, y: p.y, eliteBias: 1 });
        showBanner('🗡 ASSASSIN CONTRACT');
        sfx('bossAlarm');
    } else if (type === 'supplyDrop') {
        const pos = randObstaclePos(120) || { x: canvas.width / 2 + 150, y: canvas.height / 2 };
        obstacles.push({ x: pos.x, y: pos.y, r: 16, kind: 'supply', health: 90, maxHealth: 90 });
        for (let i = 0; i < 3; i++) {
            spawnEnemyOfType(chooseEnemyType(), { x: pos.x + Math.cos(i * 2.1) * 60, y: pos.y + Math.sin(i * 2.1) * 60, eliteBias: 0.6 });
        }
        showBanner('📦 SUPPLY DROP — CONTESTED');
        sfx('bossAlarm');
    }
}

// Resolve crates broken this tick (called from updateBullets)
function resolveBrokenObstacles() {
    obstacles = obstacles.filter(o => {
        if (o.kind === 'acid' || o.kind === 'pillar' || o.health > 0) return true;
        createParticles(o.x, o.y, o.kind === 'supply' ? '#facc15' : '#a16207', 22);
        sfx('hit');
        if (o.kind === 'supply') {
            game.score += 400;
            powerups.push({ x: o.x - 10, y: o.y, type: 'health', radius: 7 });
            powerups.push({ x: o.x + 10, y: o.y, type: 'damage', radius: 7 });
            showBanner('📦 SUPPLIES SECURED +400');
        } else if (Math.random() < 0.4) {
            powerups.push({ x: o.x, y: o.y, type: Math.random() < 0.65 ? 'health' : 'damage', radius: 7 });
        }
        return false;
    });
}
