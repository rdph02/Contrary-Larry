// ============================================================================
// render.js — sprite registry with preloading, procedural fallbacks, draw().
// ============================================================================

const SPRITES = {};
function loadSprite(id, src) {
    const img = new Image();
    const entry = { img, ready: false };
    img.onload = () => { entry.ready = img.naturalWidth > 0; };
    img.onerror = () => { entry.ready = false; };
    img.src = src;
    SPRITES[id] = entry;
}
function spriteReady(id) {
    const s = SPRITES[id];
    return s && s.ready && s.img.complete;
}

loadSprite('larry', 'spritesheets/characters/larry.png');
loadSprite('pistol', 'spritesheets/weapons/pistol.png');
loadSprite('flamethrower', 'spritesheets/weapons/flamethrower.png');

// --- Pixel helpers ----------------------------------------------------------

function px(x, y, w, h, color, scale = 2) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w * scale, h * scale);
}

function shadow(x, y, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - w / 2, y + h / 2, w, 5);
}

// --- Larry ------------------------------------------------------------------

function drawLarryBodyFallback(x, y) {
    // Procedural pixel Larry: brown coat, cap, stubborn scowl.
    const s = 2;
    px(x - 7, y - 9, 7, 9, '#7c4a12', s);
    px(x - 5, y - 15, 5, 5, '#f1c27d', s);
    px(x - 6, y - 17, 6, 2, '#40260a', s);
    px(x - 3, y - 13, 1, 1, '#000', s);
    px(x + 2, y - 13, 1, 1, '#000', s);
    px(x - 5, y + 8, 2, 5, '#111', s);
    px(x + 3, y + 8, 2, 5, '#111', s);
}

function drawWeaponFallback(w) {
    // Drawn in rotated space: simple barrel + grip tinted per weapon.
    ctx.fillStyle = w.color || '#9ca3af';
    ctx.fillRect(2, -3, 18, 6);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(2, 3, 5, 6);
}

function drawLarry() {
    const x = player.x;
    const y = player.y;
    const angle = Math.atan2(mouse.y - y, mouse.x - x);

    const width = 32;
    const height = 32;
    const weaponW = 24;
    const weaponH = 12;
    const offsetX = 10;

    if (player.iframes > 0 && Math.floor(game.tick / 6) % 2 === 0) {
        ctx.globalAlpha = 0.5;
    }

    shadow(x, y, width, height - 2);

    ctx.save();
    ctx.translate(x, y);
    if (spriteReady('larry')) {
        ctx.drawImage(SPRITES.larry.img, -width / 2, -height / 2, width, height);
    } else {
        ctx.translate(-x, -y);
        drawLarryBodyFallback(x, y);
    }
    ctx.restore();

    if (player.permanentStaff) {
        drawStaff(x, y, angle);
    } else if (player.hasSword) {
        drawSword(x, y, angle);
    } else {
        // Weapon on top, rotated toward aim
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        if (activeWeapon.spriteId && spriteReady(activeWeapon.spriteId)) {
            ctx.drawImage(SPRITES[activeWeapon.spriteId].img, -weaponW / 2 + offsetX, -weaponH / 2, weaponW, weaponH);
        } else {
            drawWeaponFallback(activeWeapon);
        }
        ctx.restore();

        // Bullet preview dot
        const bulletOffset = 16;
        px(x + Math.cos(angle) * bulletOffset - 2, y + Math.sin(angle) * bulletOffset - 2, 3, 3, '#00ff41', 1);

        // Muzzle flash right after a shot
        if (game.tick - player.lastShotTick < 3) {
            const mx = x + Math.cos(angle) * 22;
            const my = y + Math.sin(angle) * 22;
            ctx.fillStyle = '#fff7cc';
            ctx.beginPath();
            ctx.arc(mx, my, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.arc(mx, my, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.globalAlpha = 1;
}

function drawStaff(x, y, angle) {
    const staffEnd = { x: x + Math.cos(angle) * 24, y: y - 4 + Math.sin(angle) * 24 };
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(staffEnd.x, staffEnd.y);
    ctx.stroke();
    // Glowing orb at tip
    const pulse = 0.6 + 0.4 * Math.sin(game.tick / 7);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.arc(staffEnd.x, staffEnd.y, 5 + player.staffCharge * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Charge bar above Larry
    if (player.staffCharge > 0.01) {
        const bw = 36, bh = 5;
        const bx = x - bw / 2, by = y - 30;
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(bx, by, bw, bh);
        const grad = ctx.createLinearGradient(bx, by, bx + bw, by);
        grad.addColorStop(0, '#6d28d9');
        grad.addColorStop(1, '#c4b5fd');
        ctx.fillStyle = grad;
        ctx.fillRect(bx, by, bw * player.staffCharge, bh);
        if (player.staffCharge >= 1) {
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.5 + 0.5 * Math.sin(game.tick / 5);
            ctx.fillRect(bx, by, bw, bh);
            ctx.globalAlpha = 1;
        }
    }
}

const SWORD_SWING_TICKS = 12;

// Filled tapered blade silhouette: narrow at the hilt, widest partway up, pointed tip.
function drawBladePolygon(bx, by, ang, len, width, fillColor, edgeColor) {
    const perp = ang + Math.PI / 2;
    const px = Math.cos(perp), py = Math.sin(perp);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const tipX = bx + dx * len, tipY = by + dy * len;
    const midX = bx + dx * len * 0.18, midY = by + dy * len * 0.18;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(midX + px * width / 2, midY + py * width / 2);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(midX - px * width / 2, midY - py * width / 2);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
    if (edgeColor) {
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

function drawSword(x, y, angle) {
    const swinging = player.swordSwingTimer > 0;
    const isWar = player.swordRange >= 90;
    const swordLen = isWar ? 38 : 28;
    const arcHalf = player.swordArcWidth;
    const dir = player.swordSwingDir || 1;
    const hiltX = x, hiltY = y - 4;

    // Ease-out sweep: fast at the start of the swing, settling into the follow-through.
    const rawT = swinging ? 1 - player.swordSwingTimer / SWORD_SWING_TICKS : 1;
    const clampedT = Math.max(0, Math.min(1, rawT));
    const eased = 1 - Math.pow(1 - clampedT, 2);
    const sweepAngle = tt => player.swordAngle + dir * (-arcHalf + tt * (2 * arcHalf));
    const displayAngle = swinging ? sweepAngle(eased) : angle;

    const bladeColor = isWar ? '#c4b5fd' : '#e2e8f0';
    const glowColor = player.swordOnFire ? '#fde68a' : (isWar ? '#c4b5fd' : '#00ff41');

    // Fire glow behind blade
    if (player.swordOnFire) {
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(game.tick / 4);
        ctx.strokeStyle = '#ff6b00';
        ctx.lineWidth = swinging ? 14 : 8;
        ctx.beginPath();
        ctx.moveTo(hiltX, hiltY);
        ctx.lineTo(hiltX + Math.cos(displayAngle) * swordLen, hiltY + Math.sin(displayAngle) * swordLen);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Whirlwind: a full spinning slash ring in place of a directional swing
    if (player.swordWhirlwindVisualTimer > 0) {
        const wt = player.swordWhirlwindVisualTimer / 20;
        ctx.globalAlpha = 0.6 * wt;
        ctx.strokeStyle = player.swordOnFire ? '#ff6b00' : glowColor;
        ctx.lineWidth = 3 + 6 * wt;
        ctx.beginPath();
        ctx.arc(x, y, player.swordRange, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    } else if (swinging) {
        // Motion trail: faded afterimages of the blade a few ticks behind the current sweep
        for (let i = 1; i <= 3; i++) {
            const trailT = Math.max(0, eased - i * 0.16);
            const trailAngle = sweepAngle(trailT);
            ctx.globalAlpha = 0.16 * (1 - i / 4);
            drawBladePolygon(hiltX, hiltY, trailAngle, swordLen, 5, glowColor, null);
        }
        ctx.globalAlpha = 1;

        // Swing arc, painted in progressively as the blade sweeps through it
        const startAngle = sweepAngle(0);
        const fadeOut = player.swordSwingTimer <= 3 ? player.swordSwingTimer / 3 : 1;
        ctx.globalAlpha = 0.28 * fadeOut;
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, player.swordRange, startAngle, displayAngle, dir < 0);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Whirlwind almost-ready ring (telegraph before it fires)
    if (player.swordWhirlwind && player.whirlwindTimer <= 30) {
        ctx.globalAlpha = 0.4 + 0.4 * Math.sin(game.tick / 4);
        ctx.strokeStyle = player.swordOnFire ? '#fde68a' : '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, player.swordRange + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Blade
    drawBladePolygon(hiltX, hiltY, displayAngle, swordLen, swinging ? 7 : 4, bladeColor, '#475569');
    // Bright edge gleam along the swing
    if (swinging) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hiltX, hiltY);
        ctx.lineTo(hiltX + Math.cos(displayAngle) * swordLen, hiltY + Math.sin(displayAngle) * swordLen);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    // Cross-guard
    const guardX = hiltX + Math.cos(displayAngle) * 8;
    const guardY = hiltY + Math.sin(displayAngle) * 8;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(guardX + Math.cos(displayAngle + Math.PI / 2) * 7, guardY + Math.sin(displayAngle + Math.PI / 2) * 7);
    ctx.lineTo(guardX + Math.cos(displayAngle - Math.PI / 2) * 7, guardY + Math.sin(displayAngle - Math.PI / 2) * 7);
    ctx.stroke();
    // Tip gleam
    ctx.fillStyle = swinging ? '#fff' : bladeColor;
    ctx.beginPath();
    ctx.arc(hiltX + Math.cos(displayAngle) * swordLen, hiltY + Math.sin(displayAngle) * swordLen, swinging ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();
}

// --- Enemies ----------------------------------------------------------------

function drawAgent(e) {
    const x = e.x, y = e.y, s = 2;

    // Turrets and aegis drones are hardware, not agents
    if (e.kind === 'turret') {
        shadow(x, y, e.radius * 2, e.radius);
        px(x - 6, y - 2, 6, 4, '#7c2d12', s);
        px(x - 3, y - 6, 3, 3, '#f97316', s);
        const a = Math.atan2(player.y - y, player.x - x);
        ctx.strokeStyle = '#fdba74';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + Math.cos(a) * 14, y - 4 + Math.sin(a) * 14);
        ctx.stroke();
        drawEnemyExtras(e);
        return;
    }
    if (e.kind === 'aegisDrone') {
        shadow(x, y, e.radius * 2, e.radius);
        if (e._flashTimer > 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.75)';
            ctx.fillRect(x - e.radius, y - e.radius, e.radius * 2, e.radius * 2);
        }
        px(x - 4, y - 4, 4, 4, '#818cf8', s);
        px(x - 2, y - 2, 2, 2, '#e0e7ff', s);
        // Shield bubble
        ctx.strokeStyle = 'rgba(129, 140, 248, ' + (0.5 + 0.3 * Math.sin(game.tick / 6)) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, e.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
        drawEnemyExtras(e);
        return;
    }

    // WRAITH: fades to near-invisible while phased/intangible
    if (e.phased) ctx.globalAlpha = 0.25;

    shadow(x, y, e.radius * 2.3, e.radius * 1.4);
    // White flash on hit
    if (e._flashTimer > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(x - e.radius - 2, y - e.radius - 4, e.radius * 2 + 4, e.radius * 2 + 6);
    }
    const coatColors = {
        scout: '#064e3b', agent: '#2b2d42', bruiser: '#7f1d1d', shield: '#3b0764',
        marksman: '#713f12', saboteur: '#881337', handler: '#075985', nikitaGuard: '#450a0a',
        splitter: '#14532d', weaver: '#701a75', mender: '#78350f', bomber: '#7c2d12',
        deadeye: '#881337', warper: '#164e63', wraith: '#365314', railTrooper: '#713f12',
        bulwarkCommander: '#075985'
    };
    const coat = coatColors[e.kind] || '#2b2d42';
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
    // Kind-specific accents
    if (e.kind === 'bomber') {
        const flash = e._fuse !== undefined && Math.floor(game.tick / 3) % 2 === 0;
        px(x - 2, y - 3, 4, 4, flash ? '#fff' : '#f97316', s);
    }
    if (e.kind === 'splitter') {
        px(x - 9, y - 6, 2, 2, '#4ade80', s);
        px(x + 7, y - 6, 2, 2, '#4ade80', s);
    }
    if (e.kind === 'mender') {
        px(x - 2, y - 5, 4, 1, '#fbbf24', s);
        px(x - 1, y - 7, 2, 4, '#fbbf24', s);
    }
    if (e.kind === 'warper' && e._warpTimer < 25) {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, e.radius + 5 + (25 - e._warpTimer) * 0.4, 0, Math.PI * 2);
        ctx.stroke();
    }
    if (e.kind === 'bulwarkCommander') {
        ctx.strokeStyle = 'rgba(56, 189, 248, ' + (0.35 + 0.15 * Math.sin(game.tick / 10)) + ')';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(x, y, e.shieldRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    if (e.kind === 'railTrooper') {
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 12, y - 14, 24, 28);
    }
    drawEnemyExtras(e);
    ctx.globalAlpha = 1;

    if (e.bossRank) {
        // Weak-point stance tints, drawn under the health bar so they read at a glance
        if (e.shielded || e.handlerShielded || e.lastStandGuard) {
            ctx.strokeStyle = 'rgba(250, 204, 21, ' + (0.45 + 0.3 * Math.sin(game.tick / 5)) + ')';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(x, y, e.radius + 8, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (e._exposedTimer > 0 || e._overloadTimer > 0 || e._punishWindow > 0) {
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.5 + 0.4 * Math.sin(game.tick / 3)) + ')';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(x, y, e.radius + 12, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (e.twinLinked) {
            const partner = enemies.find(o => o !== e && o.twinPair === e.twinPair && o.health > 0);
            if (partner) {
                ctx.strokeStyle = 'rgba(254, 240, 138, ' + (0.5 + 0.3 * Math.sin(game.tick / 4)) + ')';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(partner.x, partner.y);
                ctx.stroke();
            }
        }
        const bossColor = e.color;
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
        if (e.bossName) {
            ctx.font = '7px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = bossColor;
            const stance = e.shielded ? ' 🛡' : (e._exposedTimer > 0 || e._overloadTimer > 0 || e._punishWindow > 0) ? ' ⚡OPEN' : '';
            ctx.fillText(e.bossName + (e.phase ? ' · P' + e.phase : '') + stance, x, y - e.radius - 18);
            ctx.textAlign = 'left';
        }
    }
}

// Elite rings, heal beams, aim lasers, charge telegraphs, boss lasers
function drawEnemyExtras(e) {
    const x = e.x, y = e.y;
    if (e.elite) {
        ctx.strokeStyle = 'rgba(250, 204, 21, ' + (0.5 + 0.3 * Math.sin(game.tick / 8)) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, e.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
        px(x - 4, y - e.radius - 14, 4, 2, '#facc15', 2); // crown
        (e.eliteMods || []).forEach((m, i) => {
            ctx.fillStyle = ELITE_MODS[m].color;
            ctx.fillRect(x - 6 + i * 8, y + e.radius + 6, 5, 5);
        });
    }
    if (e._healTarget && e._healTarget.health > 0) {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(e._healTarget.x, e._healTarget.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    if (e._aiming) {
        const late = e._aimTimer <= 15;
        ctx.strokeStyle = late ? 'rgba(244, 63, 94, 0.9)' : 'rgba(244, 63, 94, 0.35)';
        ctx.lineWidth = late ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(e._aimAngle) * 2000, y + Math.sin(e._aimAngle) * 2000);
        ctx.stroke();
    }
    if (e._chargeTelegraph > 0) {
        ctx.strokeStyle = 'rgba(249, 115, 22, ' + (0.3 + 0.4 * Math.sin(game.tick / 3)) + ')';
        ctx.lineWidth = e.radius * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(e._pendingChargeAngle) * 500, y + Math.sin(e._pendingChargeAngle) * 500);
        ctx.stroke();
    }
    if (e._laser) {
        const L = e._laser;
        const beams = e.cycle >= 4 ? [L.angle, L.angle + Math.PI] : [L.angle];
        beams.forEach(a => {
            if (L.telegraph > 0) {
                ctx.strokeStyle = 'rgba(220, 38, 38, ' + (0.25 + 0.35 * Math.sin(game.tick / 3)) + ')';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
                ctx.lineWidth = 14;
            }
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(a) * 2000, y + Math.sin(a) * 2000);
            ctx.stroke();
            if (L.telegraph <= 0) {
                ctx.strokeStyle = 'rgba(254, 226, 226, 0.9)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + Math.cos(a) * 2000, y + Math.sin(a) * 2000);
                ctx.stroke();
            }
        });
    }
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
    ctx.fillRect(x - w / 2, y - 18, w, 3);
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(x - w / 2, y - 18, w * pct, 3);
}

// --- Scene ------------------------------------------------------------------

function draw() {
    ctx.save();
    if (game.shake > 0.1) {
        const s = game.shake;
        ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    const stage = game.stage || STAGES[0];
    ctx.fillStyle = stage.bg;
    ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
    ctx.strokeStyle = stage.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke(); }
    for (let i = 0; i < canvas.height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke(); }

    drawStageFloor();

    // Proximity mines
    mines.forEach(m => {
        const armed = m.armTimer <= 0;
        const blink = armed && Math.floor(game.tick / 12) % 2 === 0;
        ctx.fillStyle = armed ? (blink ? '#ef4444' : '#7f1d1d') : '#525252';
        ctx.beginPath();
        ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = blink ? '#fff' : '#a3a3a3';
        ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
    });

    // Telegraphed blasts (warning circles)
    telegraphs.forEach(t => {
        ctx.strokeStyle = t.color || '#f97316';
        ctx.globalAlpha = 0.3 + 0.4 * Math.sin(game.tick / 2);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = t.color || '#f97316';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // Tar pools and virus zones (ground layer)
    tarPools.forEach(t => {
        ctx.globalAlpha = Math.min(0.5, t.life / 240 * 0.5);
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });
    virusZones.forEach(z => {
        ctx.globalAlpha = 0.14 + 0.05 * Math.sin(game.tick / 8);
        ctx.fillStyle = '#84cc16';
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#84cc16';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
    });

    // Soul shards (NECROMANCER)
    soulShards.forEach(s => {
        ctx.globalAlpha = Math.min(1, s.life / 60);
        ctx.fillStyle = '#a78bfa';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ede9fe';
        ctx.beginPath();
        ctx.arc(s.x - 1, s.y - 1, s.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // Fire pools (BERSERKER)
    player.fireTrails.forEach(ft => {
        ctx.globalAlpha = Math.min(0.45, ft.life / 90 * 0.45);
        const grad = ctx.createRadialGradient(ft.x, ft.y, 0, ft.x, ft.y, ft.radius);
        grad.addColorStop(0, '#fde68a');
        grad.addColorStop(0.5, '#ff6b00');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ft.x, ft.y, ft.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life / 40; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); });
    ctx.globalAlpha = 1;
    powerups.forEach(p => {
        if (p.type === 'cache') {
            const bob = Math.sin(game.tick / 10) * 2;
            ctx.fillStyle = '#facc15';
            ctx.fillRect(p.x - p.radius, p.y - p.radius + bob, p.radius * 2, p.radius * 2);
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2;
            ctx.strokeRect(p.x - p.radius, p.y - p.radius + bob, p.radius * 2, p.radius * 2);
            ctx.fillStyle = '#78350f';
            ctx.fillRect(p.x - p.radius, p.y - 2 + bob, p.radius * 2, 4);
            return;
        }
        ctx.fillStyle = p.type === 'health' ? '#ff0080' : '#ffff00';
        ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);
    });

    // PHANTOM decoys: translucent Larry afterimages
    decoys.forEach(d => {
        ctx.globalAlpha = 0.45 + 0.2 * Math.sin(game.tick / 5);
        drawLarryBodyFallback(d.x, d.y);
        ctx.globalAlpha = 1;
        // fuse ring
        ctx.strokeStyle = 'rgba(155, 246, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 16, 0, Math.PI * 2 * (d.life / 120));
        ctx.stroke();
    });
    bullets.forEach(b => {
        if (b.isStaffOrb) {
            const pulse = 0.7 + 0.3 * Math.sin(game.tick / 5);
            ctx.globalAlpha = 0.9 * pulse;
            ctx.fillStyle = b.isCharged ? '#4c1d95' : '#6d28d9';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = b.isCharged ? '#7c3aed' : '#c4b5fd';
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius * 0.55, 0, Math.PI * 2);
            ctx.fill();
            if (b.isCharged) {
                ctx.globalAlpha = 0.4 * pulse;
                ctx.fillStyle = '#ede9fe';
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius * 0.25, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        } else if (b.grenade) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius + 2, 0, Math.PI * 2);
            ctx.fillStyle = '#4ade80';
            ctx.fill();
            ctx.strokeStyle = '#166534';
            ctx.lineWidth = 2;
            ctx.stroke();
        } else {
            if (b.fromMinion) ctx.fillStyle = '#a78bfa';
            else if (b.flamethrower) ctx.fillStyle = '#ff4500';
            else ctx.fillStyle = player.explosiveRounds ? '#ff6b00' : '#00ff41';
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
        if (e._burnTimer > 0) {
            ctx.fillStyle = 'rgba(255, 107, 0, 0.35)';
            ctx.fillRect(e.x - e.radius - 2, e.y - e.radius - 2, e.radius * 2 + 4, e.radius * 2 + 4);
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
    if (game.state !== 'menu') drawLarry();

    drawStageOverlays();

    // Floating damage numbers
    damageNumbers.forEach(d => {
        ctx.globalAlpha = Math.min(1, d.life / 20);
        ctx.font = (d.big ? '11px' : '8px') + ' "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        const label = d.value <= 0 ? 'EXECUTED' : String(d.value);
        ctx.fillText(label, d.x + 1, d.y + 1);
        ctx.fillStyle = d.color;
        ctx.fillText(label, d.x, d.y);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    });

    // Wave / event banner
    if (banner.timer > 0) {
        ctx.globalAlpha = Math.min(1, banner.timer / 25);
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(banner.text, canvas.width / 2 + 2, 62);
        ctx.fillStyle = '#00ff41';
        ctx.fillText(banner.text, canvas.width / 2, 60);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    // DEADEYE focus tint
    if (player.focusTimer > 0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Low-HP vignette
    if (game.state === 'playing' && player.health < player.maxHealth * 0.3) {
        const pulse = 0.18 + 0.10 * Math.sin(game.tick / 8);
        const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7);
        grad.addColorStop(0, 'rgba(255,0,65,0)');
        grad.addColorStop(1, 'rgba(255,0,65,' + pulse.toFixed(3) + ')');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Awakening / event announcement overlay
    if (awakeningTimer > 0) {
        ctx.globalAlpha = Math.min(1, awakeningTimer / 40);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(canvas.width / 2 - 220, canvas.height / 2 - 36, 440, 72);
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width / 2 - 220, canvas.height / 2 - 36, 440, 72);
        ctx.fillStyle = '#c4b5fd';
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        awakeningText.split('\n').forEach((line, i) => ctx.fillText(line, canvas.width / 2, canvas.height / 2 - 12 + i * 20));
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    if (game.state === 'paused') {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (DEBUG && player.godMode) {
        ctx.fillStyle = '#facc15';
        ctx.font = '10px monospace';
        ctx.fillText('GOD MODE', 8, canvas.height - 8);
    }
    ctx.restore();
}

// --- Stage scenery ----------------------------------------------------------

// Ground-level stage elements, drawn beneath entities
function drawStageFloor() {
    // Acid pools first (lowest)
    obstacles.forEach(o => {
        if (o.kind !== 'acid') return;
        ctx.fillStyle = 'rgba(132, 204, 22, 0.22)';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(132, 204, 22, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (Math.random() < 0.05) createParticles(o.x + (Math.random() - 0.5) * o.r * 1.5, o.y + (Math.random() - 0.5) * o.r * 1.5, '#84cc16', 1);
    });

    // Gas vents
    (stageState.vents || []).forEach(v => {
        ctx.fillStyle = '#1c3a2e';
        ctx.fillRect(v.x - 12, v.y - 12, 24, 24);
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 2;
        ctx.strokeRect(v.x - 12, v.y - 12, 24, 24);
        for (let i = -6; i <= 6; i += 6) {
            ctx.beginPath();
            ctx.moveTo(v.x - 8, v.y + i);
            ctx.lineTo(v.x + 8, v.y + i);
            ctx.stroke();
        }
        if (v.phase === 'warn') {
            ctx.strokeStyle = 'rgba(132, 204, 22, ' + (0.3 + 0.4 * Math.sin(game.tick / 3)) + ')';
            ctx.beginPath();
            ctx.arc(v.x, v.y, 70, 0, Math.PI * 2);
            ctx.stroke();
        } else if (v.phase === 'burst') {
            ctx.fillStyle = 'rgba(132, 204, 22, 0.3)';
            ctx.beginPath();
            ctx.arc(v.x, v.y, 70, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Freight band
    const f = stageState.freight && stageState.freight.active;
    if (f) {
        if (f.phase === 'warn') {
            ctx.fillStyle = 'rgba(250, 204, 21, ' + (0.10 + 0.08 * Math.sin(game.tick / 3)) + ')';
            ctx.fillRect(0, f.y, canvas.width, f.h);
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.6)';
            ctx.setLineDash([12, 8]);
            ctx.lineWidth = 2;
            ctx.strokeRect(-4, f.y, canvas.width + 8, f.h);
            ctx.setLineDash([]);
        } else {
            ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
            ctx.fillRect(0, f.y, canvas.width, f.h);
            // rushing freight cars
            ctx.fillStyle = '#57534e';
            const off = (game.tick * 22) % 260;
            for (let x = -260 + off; x < canvas.width + 40; x += 260) {
                ctx.fillRect(x, f.y + 8, 200, f.h - 16);
                ctx.fillStyle = '#78716c';
                ctx.fillRect(x + 10, f.y + 16, 180, f.h - 32);
                ctx.fillStyle = '#57534e';
            }
        }
    }

    // Solid obstacles
    obstacles.forEach(o => {
        if (o.kind === 'acid') return;
        shadow(o.x, o.y, o.r * 2, o.r);
        if (o.kind === 'pillar') {
            ctx.fillStyle = '#334155';
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#475569';
            ctx.beginPath();
            ctx.arc(o.x - 3, o.y - 3, o.r * 0.55, 0, Math.PI * 2);
            ctx.fill();
        } else {
            // crate / supply
            const c1 = o.kind === 'supply' ? '#b45309' : '#7c4a12';
            const c2 = o.kind === 'supply' ? '#facc15' : '#a16207';
            ctx.fillStyle = c1;
            ctx.fillRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
            ctx.strokeStyle = c2;
            ctx.lineWidth = 2;
            ctx.strokeRect(o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
            ctx.beginPath();
            ctx.moveTo(o.x - o.r, o.y - o.r);
            ctx.lineTo(o.x + o.r, o.y + o.r);
            ctx.moveTo(o.x + o.r, o.y - o.r);
            ctx.lineTo(o.x - o.r, o.y + o.r);
            ctx.stroke();
            if (o.maxHealth && o.health < o.maxHealth) {
                ctx.fillStyle = '#000';
                ctx.fillRect(o.x - o.r, o.y - o.r - 8, o.r * 2, 4);
                ctx.fillStyle = c2;
                ctx.fillRect(o.x - o.r, o.y - o.r - 8, o.r * 2 * Math.max(0, o.health / o.maxHealth), 4);
            }
        }
    });
}

// Above-entity stage effects: searchlights, wind, blackout
function drawStageOverlays() {
    (stageState.searchlights || []).forEach(sl => {
        const len = 560;
        ctx.globalAlpha = 0.14 + (stageState.caughtTicks > 0 ? 0.10 : 0);
        ctx.fillStyle = stageState.caughtTicks > 30 ? '#ef4444' : '#fef9c3';
        ctx.beginPath();
        ctx.moveTo(sl.x, sl.y);
        ctx.arc(sl.x, sl.y, len, sl.angle - 0.22, sl.angle + 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    // BLACK SITE: the expanding pulse ring
    const pulse = stageState.pulse && stageState.pulse.active;
    if (pulse) {
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.75)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, pulse.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(224, 242, 254, 0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(canvas.width / 2, canvas.height / 2, pulse.radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    const w = stageState.wind && stageState.wind.active;
    if (w) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = '#c4b5fd';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            const px0 = (game.tick * 6 + i * 173) % (canvas.width + 100) - 50;
            const py0 = (i * 131) % canvas.height;
            ctx.beginPath();
            ctx.moveTo(px0, py0);
            ctx.lineTo(px0 + Math.cos(w.ang) * 26, py0 + Math.sin(w.ang) * 26);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    if (game.blackoutTimer > 0) {
        const fade = Math.min(1, game.blackoutTimer / 30);
        const g = ctx.createRadialGradient(player.x, player.y, 80, player.x, player.y, 230);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,' + (0.92 * fade).toFixed(3) + ')');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // COMMS BLACKOUT curse: persistent limited-visibility fog for the whole wave
    if (game.modifiers && game.modifiers.fogOfWar) {
        const g = ctx.createRadialGradient(player.x, player.y, 110, player.x, player.y, 320);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.88)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}
