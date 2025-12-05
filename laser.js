
// ====== Canvas & dimension responsive (DPR-aware) ======
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

let DPR = 1;
let W = 0, H = 0;

// Base / joueur (variables car recalculées au resize)
const BASE_RADIUS = 46;
const MARGIN = 60; // marge visuelle depuis les bords
let BASE_POS = { x: 0, y: 0 };
let PLAYER_POS = { x: 0, y: 0 };

function resize() {
  
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.margin = '0';
  document.body.style.padding = '0';

  const cssWidth = window.innerWidth;
  const cssHeight = window.innerHeight;
  DPR = window.devicePixelRatio || 1;

  canvas.width = Math.floor(cssWidth * DPR);
  canvas.height = Math.floor(cssHeight * DPR);
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  W = cssWidth;
  H = cssHeight;

  BASE_POS = { x: W - MARGIN - BASE_RADIUS, y: H - MARGIN - BASE_RADIUS };
  PLAYER_POS = { x: BASE_POS.x, y: BASE_POS.y };
}
window.addEventListener('resize', resize);
resize();

// ====== Tir (laser segment) ======
const PLAYER_FIRERATE = 7.5;   // tirs par seconde
const HITSCAN_DAMAGE = 24;     // dégâts par tir
const BEAM_DURATION = 90;      // ms
const RECOIL = 0.015;          // effet visuel
// false = s’arrête au premier ennemi touché ; true = transperce tous
const LASER_PIERCING = false;

// ====== Ennemis / vagues (stats FIXES) ======
const BASE_MAX_HP = 1;
const WAVE_INTERVAL = 2200; // ms
let paused = false;
const rng = (min, max) => min + Math.random() * (max - min);
const now = () => performance.now();

// ---------- Types d'ennemis ----------
const ENEMY_TYPES = {
  GRUNT: 0,    // standard
  RUNNER: 1,   // rapide / fragile
  SPAWNER: 2,  // lent / spawn des minions
  MINION: 3,   // petit ennemi spawné
  BATTERY_CARRIER: 4,
  ZIGZAG: 5,
};

const ENEMY_STATS = {
  [ENEMY_TYPES.GRUNT]:   { speed: 70,  hp: 30, radius: 16, dmg: 4,  color: '#ff5a6a', body: '#2a0f14' },
  [ENEMY_TYPES.RUNNER]:  { speed: 110, hp: 18, radius: 14, dmg: 3,  color: '#ffd54f', body: '#2a1f0a' },
  [ENEMY_TYPES.SPAWNER]: { speed: 50,  hp: 60, radius: 18, dmg: 6,  color: '#b084ff', body: '#1f1930',
                           spawnIntervalMin: 1300, spawnIntervalMax: 1900, maxChildren: 4 },
  [ENEMY_TYPES.MINION]:  { speed: 95,  hp: 12, radius: 12, dmg: 2,  color: '#76e3c6', body: '#0e2a27' },
  
  [ENEMY_TYPES.BATTERY_CARRIER]: {
    speed: 80, hp: 28, radius: 16, dmg: 4,
    color: '#7ec8ff', body: '#0f1524',
    activeTime: 5000,   // ms visible/actif
    hiddenTime: 3000    // ms caché
  },
  
  [ENEMY_TYPES.ZIGZAG]: {
    speed: 85, hp: 26, radius: 15, dmg: 4,
    color: '#7ec8ff', body: '#0f1524',
    zigAmp: 140,     // amplitude latérale (px/s) ajoutée à la vitesse
    zigFreqHz: 1.2,  // fréquence du zigzag (oscillations par seconde)
  },

};

let nextId = 1;

// ====== État du jeu ======
const state = {
  baseHP: BASE_MAX_HP,
  score: 0,
  wave: 1,
  nextGroupAt: now() + 1000,
  groupLeft: 0,
  lastShotAt: -1e9,
  enemies: [],     // {id,type,x,y,hp,maxHp,speed,dmg,radius,blinkUntil,...}
  particles: [],
  beams: [],       // {x1,y1,x2,y2, color, until}
  gameOver: false,
  deathMessage: '', 
};

// ====== Input souris (clic gauche = tir) ======
const mouse = { x: 0, y: 0, down: false };

function updateMouseFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const sx = (e.clientX - r.left) * (canvas.width / r.width) / DPR;
  const sy = (e.clientY - r.top) * (canvas.height / r.height) / DPR;
  mouse.x = sx; mouse.y = sy;
}

// (Plus de clic droit / parade)
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  updateMouseFromEvent(e);
  if (e.button === 0) mouse.down = true;
});
canvas.addEventListener('mouseup', (e) => {
  updateMouseFromEvent(e);
  if (e.button === 0) mouse.down = false;
});
canvas.addEventListener('mousemove', updateMouseFromEvent);

window.addEventListener('keydown', e => {
  if (e.code === 'KeyP') paused = !paused;
  if (e.code === 'KeyR') resetGame();
});

// ====== Reset ======
function resetGame() {
  state.baseHP = BASE_MAX_HP;
  state.score = 0;
  state.wave = 1;
  state.enemies.length = 0;
  state.particles.length = 0;
  state.beams.length = 0;
  state.nextGroupAt = now() + 1000;
  state.groupLeft = 0;
  state.lastShotAt = -1e9;
  state.gameOver = false;
  state.deathMessage = '';
}

// ====== Utilitaire : segment vs cercle ======

// Retourne le point où le rayon A->B touche le bord de l'écran [0..W]x[0..H].
// A = (ax,ay) (base), B = (bx,by) (pointeur). Le rayon se prolonge au-delà de B.
function rayToScreenEdge(ax, ay, bx, by, W, H) {
  const vx = bx - ax, vy = by - ay;
  // Rayon nul ? on renvoie la base
  if (Math.abs(vx) < 1e-6 && Math.abs(vy) < 1e-6) return { x: ax, y: ay };

  const cand = [];

  // Intersection avec x = 0 et x = W
  if (Math.abs(vx) > 1e-6) {
    const t0 = (0 - ax) / vx;
    const y0 = ay + t0 * vy;
    if (t0 > 0 && y0 >= 0 && y0 <= H) cand.push({ t: t0, x: 0, y: y0 });

    const tW = (W - ax) / vx;
    const yW = ay + tW * vy;
    if (tW > 0 && yW >= 0 && yW <= H) cand.push({ t: tW, x: W, y: yW });
  }

  // Intersection avec y = 0 et y = H
  if (Math.abs(vy) > 1e-6) {
    const tT = (0 - ay) / vy;
    const xT = ax + tT * vx;
    if (tT > 0 && xT >= 0 && xT <= W) cand.push({ t: tT, x: xT, y: 0 });

    const tB = (H - ay) / vy;
    const xB = ax + tB * vx;
    if (tB > 0 && xB >= 0 && xB <= W) cand.push({ t: tB, x: xB, y: H });
  }

  if (cand.length === 0) {
    // Rayon qui ne rencontre pas (très improbable), on retourne B
    return { x: bx, y: by };
  }

  // On prend l'intersection valide la plus proche (t minimal > 0)
  cand.sort((a, b) => a.t - b.t);
  return { x: cand[0].x, y: cand[0].y };
}


function segmentCircleIntersect(ax, ay, bx, by, cx, cy, r) {
  const vx = bx - ax, vy = by - ay;
  const wx = cx - ax, wy = cy - ay;
  const L2 = vx*vx + vy*vy || 1;
  const t = Math.max(0, Math.min(1, (wx*vx + wy*vy) / L2));
  const px = ax + t * vx, py = ay + t * vy;
  const dist2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
  if (dist2 <= r * r) {
    return { hit: true, t, x: px, y: py };
  }
  return { hit: false };
}

// ====== Spawns & vagues ======

function makeEnemy(type, x, y, extra = {}) {
  const s = ENEMY_STATS[type];
  const base = {
    id: nextId++,
    type, x, y,
    hp: s.hp, maxHp: s.hp,
    speed: s.speed,
    dmg: s.dmg,
    radius: s.radius,
    blinkUntil: 0,
    
    bornT: now(),           // pour l'oscillation
    // valeurs par défaut, utilisables aussi pour d'autres types si besoin
    zigAmp: s.zigAmp || 0,
    zigFreqHz: s.zigFreqHz || 0,
    zigSign: Math.random() < 0.5 ? -1 : 1, // sens initial du zigzag (gauche/droite)

  };

  // Cycle pour le porteur de batterie
  if (type === ENEMY_TYPES.BATTERY_CARRIER) {
    base.phase = 'ACTIVE';                 // 'ACTIVE' | 'HIDDEN'
    base.nextPhaseAt = now() + s.activeTime;
    base.batteryTotal = s.activeTime;
    base.batteryLeft  = s.activeTime;
  }

  return base;
}


// Spawns uniquement HAUT et GAUCHE
function spawnEnemy() {
  const side = Math.random() < 0.5 ? 0 : 1;
  let x, y;
  if (side === 0) { x = rng(40, W - 40); y = -20; }
  else            { x = -20; y = rng(40, H - 40); }

  // Évite les spawns trop proches de la base
  const MIN_DIST = 240;
  const d2 = (x - BASE_POS.x) ** 2 + (y - BASE_POS.y) ** 2;
  if (d2 < MIN_DIST * MIN_DIST) return spawnEnemy();

  // Ratios : runners ↑ avec vagues ; spawners rares
  const runnerRatio  = Math.min(0.35 + (state.wave - 1) * 0.03, 0.65);
  const spawnerRatio = Math.min(0.10 + (state.wave - 1) * 0.02, 0.20);
  const carrierRatio = Math.min(0.08 + (state.wave - 1) * 0.01, 0.15);
   const zigzagRatio  = Math.min(0.12 + (state.wave - 1) * 0.02, 0.30)

  const roll = Math.random();
  let type;
  if (roll < spawnerRatio) type = ENEMY_TYPES.SPAWNER;
  else if (roll < spawnerRatio + runnerRatio) type = ENEMY_TYPES.RUNNER;
  else if (roll < spawnerRatio + runnerRatio + carrierRatio) type = ENEMY_TYPES.BATTERY_CARRIER;
  else if (roll < spawnerRatio + runnerRatio + carrierRatio + zigzagRatio) type = ENEMY_TYPES.ZIGZAG
  else type = ENEMY_TYPES.GRUNT;

  if (type === ENEMY_TYPES.SPAWNER) {
    const s = ENEMY_STATS[ENEMY_TYPES.SPAWNER];
    state.enemies.push(makeEnemy(ENEMY_TYPES.SPAWNER, x, y, {
      nextSpawnAt: now() + rng(s.spawnIntervalMin, s.spawnIntervalMax),
    }));
  } else {
    state.enemies.push(makeEnemy(type, x, y));
  }
}

function scheduleWave() {
  const total = Math.round(6 + (state.wave - 1) * 2.4); // augmente le NOMBRE
  state.groupLeft = total;
  state.nextGroupAt = now() + 500;
}

function updateSpawns(t) {
  if (state.gameOver) return;
  if (state.groupLeft <= 0 && state.enemies.length === 0) {
    state.wave++;
    scheduleWave();
  }
  if (t > state.nextGroupAt && state.groupLeft > 0) {
    const count = Math.min(4 + Math.floor(state.wave / 3), state.groupLeft);
    for (let i = 0; i < count; i++) spawnEnemy();
    state.groupLeft -= count;
    state.nextGroupAt = t + WAVE_INTERVAL * rng(0.6, 1.1);
  }
}

// ====== Tir (laser) ======

function tryShoot(t) {
  if (state.gameOver) return;
  const cooldown = 1000 / PLAYER_FIRERATE;
  if (!mouse.down || (t - state.lastShotAt) < cooldown) return;

  state.lastShotAt = t;

  const ax = PLAYER_POS.x, ay = PLAYER_POS.y;

  // On calcule le point où le rayon (base -> souris) touche le bord écran
  const edge = rayToScreenEdge(ax, ay, mouse.x, mouse.y, W, H);
  const ex = edge.x, ey = edge.y;

  // Collision SEGMENT (A->E) avec les cercles des ennemis
  let nearestImpact = { t: 1, x: ex, y: ey };
  let anyHit = false;

  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const res = segmentCircleIntersect(ax, ay, ex, ey, e.x, e.y, e.radius);
    if (!res.hit) continue;

    anyHit = true;

    // Dégâts et feedback
    e.hp -= HITSCAN_DAMAGE;
    e.blinkUntil = t + 90;

    // Mort / score

    if (e.hp <= 0) {
    const pts =
        e.type === ENEMY_TYPES.MINION  ? 6  :
        e.type === ENEMY_TYPES.RUNNER  ? 12 :
        e.type === ENEMY_TYPES.SPAWNER ? 20 : 10;

    state.score += pts;

    // New: Matrix-style disintegration
    spawnGlyphBurst(e.x, e.y, 1.4);  // power ~1.4 for a nice burst

    // Optional: keep a small particle puff, or remove
    // hitParticles(e.x, e.y, '#00ff88'); // match green theme

    state.enemies.splice(i, 1);
    }


    // Si le laser n'est pas piercing, mémorise l'impact le plus proche
    if (!LASER_PIERCING && res.t < nearestImpact.t) {
      nearestImpact = res;
    }
  }

  // La fin VISUELLE du faisceau :
  // - Piercing: toujours jusqu'au BORD (ex,ey)
  // - Non piercing: jusqu'au PREMIER IMPACT s'il y en a un, sinon le bord.
  const endX = (!LASER_PIERCING && anyHit) ? nearestImpact.x : ex;
  const endY = (!LASER_PIERCING && anyHit) ? nearestImpact.y : ey;

  state.beams.push({
    x1: ax, y1: ay,
    x2: endX, y2: endY,
    color: '#eb0606ff',
    until: t + BEAM_DURATION,
  });

  const angle = Math.atan2(endY - ay, endX - ax);
  pushMuzzleFlash(angle);
}


// ====== Particules ======
function pushMuzzleFlash(angle) {
  for (let i = 0; i < 6; i++) {
    const a = angle + rng(-0.4, 0.4);
    const sp = rng(120, 260);
    state.particles.push({
      x: PLAYER_POS.x, y: PLAYER_POS.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: rng(1.5, 2.5),
      color: '#9be1ff',
      life: rng(120, 220),
      born: now(),
    });
  }
}

function hitParticles(x, y, color = '#ff8da0') {
  for (let i = 0; i < 10; i++) {
    const a = rng(0, Math.PI * 2);
    const sp = rng(60, 180);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      r: rng(1.5, 3),
      color,
      life: rng(150, 300),
      born: now(),
    });
  }
}

// ====== Update & Loop ======
let last = now();
requestAnimationFrame(loop);

function loop() {
  const t = now();
  const dt = (t - last) / 1000;
  last = t;

  if (!paused) update(t, dt);
  draw(t);
  requestAnimationFrame(loop);
}

function update(t, dt) {
  if (!state.gameOver) {
    tryShoot(t);
    updateEnemies(t, dt);
    resolveCollisions(t);
    updateSpawns(t);
    updateGlyphs(t, dt);

    // Nettoyer faisceaux expirés
    for (let i = state.beams.length - 1; i >= 0; i--) {
      if (t > state.beams[i].until) state.beams.splice(i, 1);
    }

    if (state.baseHP <= 0 && !state.gameOver) {
      state.gameOver = true;
      state.deathMessage = getDeathMessage(state.score);
    }
  }

  // UI
//   document.getElementById('wave').textContent = `Vague: ${state.wave}`;
//   document.getElementById('score').textContent = `Score: ${state.score}`;
//   document.getElementById('basehp').textContent = `Base: ${Math.max(0, Math.round(state.baseHP))}%`;
  
// document.getElementById('status').textContent =
//   paused
//     ? '⏸ Pause'
//     : (state.gameOver
//         ? `${state.deathMessage}  –  Appuie sur R pour rejouer`
//         : '');

}

// ----- IA / mouvement + spawn des minions -----
function updateEnemies(t, dt) {
  for (const e of state.enemies) {
    const dx = BASE_POS.x - e.x;
    const dy = BASE_POS.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;

    
    if (e.type === ENEMY_TYPES.BATTERY_CARRIER) {
      const s = ENEMY_STATS[ENEMY_TYPES.BATTERY_CARRIER];

      if (e.phase === 'ACTIVE') {
        e.batteryLeft = Math.max(0, e.nextPhaseAt - t);
        if (t >= e.nextPhaseAt) {
          e.phase = 'HIDDEN';
          e.nextPhaseAt = t + s.hiddenTime;
        }
      } else if (e.phase === 'HIDDEN') {
        if (t >= e.nextPhaseAt) {
          e.phase = 'ACTIVE';
          e.nextPhaseAt = t + s.activeTime;
          e.batteryLeft = s.activeTime;
        }
      }
    }

    if (e.type !== ENEMY_TYPES.BATTERY_CARRIER || e.phase !== 'HIDDEN') {
      const dx = BASE_POS.x - e.x;
      const dy = BASE_POS.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
    }


    if (e.type === ENEMY_TYPES.SPAWNER) {
      const s = ENEMY_STATS[ENEMY_TYPES.SPAWNER];
      if (t >= e.nextSpawnAt) {
        let children = 0;
        for (const other of state.enemies) {
          if (other.type === ENEMY_TYPES.MINION && other.parentId === e.id) children++;
        }
        if (children < s.maxChildren) {
          const toSpawn = Math.min(2, s.maxChildren - children);
          for (let k = 0; k < toSpawn; k++) {
            const offsetA = rng(0, Math.PI * 2);
            const offsetR = rng(8, 16);
            const mx = e.x + Math.cos(offsetA) * offsetR;
            const my = e.y + Math.sin(offsetA) * offsetR;
            state.enemies.push(makeEnemy(ENEMY_TYPES.MINION, mx, my, { parentId: e.id }));
            hitParticles(mx, my, '#76e3c6');
          }
        }
        e.nextSpawnAt = t + rng(s.spawnIntervalMin, s.spawnIntervalMax);
      }
    }
    
    if (e.type === ENEMY_TYPES.ZIGZAG) {
      // vecteur perpendiculaire à (ux,uy)
      const px = -uy;
      const py =  ux;

      // oscillation sinusoïdale en fonction du temps depuis spawn
      const w = 2 * Math.PI * (e.zigFreqHz || 1);      // pulsation rad/s
      const sin = Math.sin((t - e.bornT) / 1000 * w);  // t en ms -> s
      const lateral = e.zigAmp * sin * e.zigSign;      // vitesse latérale px/s

      // vitesse finale = avant + latéral perpendiculaire
      const vx = ux * e.speed + px * lateral;
      const vy = uy * e.speed + py * lateral;

      e.x += vx * dt;
      e.y += vy * dt;
    } else {
      // mouvement standard pour les autres types
      e.x += ux * e.speed * dt;
      e.y += uy * e.speed * dt;
    }
  }
}

function resolveCollisions(t) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const d2 = (e.x - BASE_POS.x) ** 2 + (e.y - BASE_POS.y) ** 2;

    if (d2 <= (BASE_RADIUS + e.radius) ** 2) {
    state.baseHP -= e.dmg;

    // New: shorter glyph burst on impact with base
    spawnGlyphBurst(e.x, e.y, 0.9);

    // Optional: remove old impact color
    // hitParticles(e.x, e.y, '#ffadb5');

    state.enemies.splice(i, 1);
    if (state.baseHP <= 0) state.baseHP = 0;

  }

  // Particules
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * 0.016;
    p.y += p.vy * 0.016;
    if (t - p.born > p.life) state.particles.splice(i, 1);
  }
}
}



// ====== Préchargement des sprites ======

// Associe chaque type d'ennemi à un sprite chargé
const SPRITE_PATHS = {
  GRUNT:   'assets/google.png',
  RUNNER:  'assets/microsoft.png',
  SPAWNER: 'assets/amazon.png',
  MINION:  'assets/colis.png',
  BATTERY_CARRIER: 'assets/apple.png',
  ZIGZAG: 'assets/facebook.png',
  BASE: 'assets/base.png'
};

// Stockage des images et leur état de readiness
const sprites = { GRUNT: null, RUNNER: null, SPAWNER: null, MINION: null , BATTERY_CARRIER: null, ZIGZAG: null, BASE: null};
const spriteReady = { GRUNT: false, RUNNER: false, SPAWNER: false, MINION: false , BATTERY_CARRIER: false , ZIGZAG: false, BASE: false};

// (Tu as déjà le preload — on l’adapte pour remplir sprites/spriteReady)
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Échec chargement: ${src}`));
    img.src = src;
  });
}

async function preloadSprites() {
  const pairs = Object.entries(SPRITE_PATHS);
  const results = await Promise.allSettled(
    pairs.map(([key, path]) => loadImage(path).then(img => ({ key, img, path })))
  );
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { key, img } = r.value;
      sprites[key] = img;
      spriteReady[key] = true;
      console.log(`[IMG] OK: ${SPRITE_PATHS[key]} (${img.naturalWidth}x${img.naturalHeight})`);
    } else {
      console.warn('[IMG] KO:', r.reason.message);
    }
  }
  console.log('[Sprites] Chargement terminé.');
}


// IMPORTANT: démarre le jeu après preload (tu m’as dit que c’est déjà fait)
(async function start() {
  resize();
  await preloadSprites();
  requestAnimationFrame(loop);
})();


// ====== Draw ======
function draw(t) {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = '#0a0b0f';
  ctx.fillRect(0, 0, W, H);

  drawArenaGrid();
  drawBase(t);

  for (const beam of state.beams) drawBeam(beam);

  drawEnemies(t);
  drawGlyphs(t);
  drawPlayerAim(t);
  drawParticles();
  drawGameOverPanel(t);
  drawHUD(t);
  drawTopStatus(t);

}


function drawHUD(t) {
  // Boîte en haut gauche
  const pad = 12;            // marge intérieure
  const gap = 6;             // espacement vertical
  const lineH = 18;          // hauteur de ligne
  const boxX = 16, boxY = 16;
  const boxW = 210, boxH = pad*2 + lineH*3 + gap*2; // 3 lignes

  // Fond semi-transparent + bord
  ctx.save();
  ctx.beginPath();
  const r = 10;
  const x = boxX, y = boxY, w = boxW, h = boxH;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();

  // Dégradé léger
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(10, 12, 18, 0.85)');
  grad.addColorStop(1, 'rgba(8, 10, 16, 0.85)');
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = '#2b3a55';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Texte
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 15px Consolas, Menlo, monospace';
  ctx.fillStyle = '#c9d1d9';

  let ty = y + pad + lineH/2;
  ctx.fillText(`Vague : ${state.wave}`, x + pad, ty);
  ty += lineH + gap;
  ctx.fillText(`Score : ${state.score}`, x + pad, ty);
  ty += lineH + gap;

  // Base HP + petite barre
  const hpPct = Math.max(0, Math.round(state.baseHP));
  ctx.fillText(`Base : ${hpPct}%`, x + pad, ty);

  // Mini barre HP à droite
  const barW = 90, barH = 8;
  const barX = x + w - pad - barW;
  const barY = ty - barH/2;
  ctx.fillStyle = '#111722';
  ctx.fillRect(barX, barY, barW, barH);

  const hpRatio = Math.max(0, Math.min(1, state.baseHP / 100));
  ctx.fillStyle = hpRatio > 0.5 ? '#7ee787' : (hpRatio > 0.25 ? '#ffd166' : '#ff6b6b');
  ctx.fillRect(barX, barY, Math.floor(barW * hpRatio), barH);

  ctx.restore();
}

function drawTopStatus(t) {
  // Affiche l’état (Pause / Game Over) sous forme de bandeau centré haut
  let text = '';
  if (paused && !state.gameOver) text = '⏸ Pause — P pour reprendre';
  else if (state.gameOver) text = '💥 Game Over — R pour rejouer';

  if (!text) return;

  const bandH = 36;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, W, bandH);

  ctx.font = 'bold 16px Consolas, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = state.gameOver ? '#ff6b6b' : '#ffd166';
  ctx.fillText(text, W / 2, Math.floor(bandH / 2));
  ctx.restore();
}


function drawArenaGrid() {
  ctx.save();
  ctx.strokeStyle = '#121625';
  ctx.lineWidth = 1;
  for (let x = 20; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 20; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
}

function drawBase(t) {
    
  const cx = BASE_POS.x, cy = BASE_POS.y;
  const R = BASE_RADIUS;

  // --- Glow de fond (optionnel, tu peux le supprimer si tu veux un rendu 100% image)
  const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, R + 30);
  g.addColorStop(0, 'rgba(126,231,135,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R + 30, 0, Math.PI * 2); ctx.fill();


const img = sprites.BASE;
  const ready = spriteReady.BASE && img && img.naturalWidth > 0;

  if (ready) {
    // On scale pour que l’image tienne dans un disque de rayon R
    const iw = img.naturalWidth, ih = img.naturalHeight;
    // on prend le diamètre comme cible (2R), en respectant le ratio
    const scale = Math.min((2 * R) / iw, (2 * R) / ih);
    const w = Math.round(iw * scale);
    const h = Math.round(ih * scale);
    const x = Math.round(cx - w / 2);
    const y = Math.round(cy - h / 2);

    const prevSmooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false; // style pixel/retro ; mets true si tu veux du lissé
    ctx.drawImage(img, x, y, w, h);
    ctx.imageSmoothingEnabled = prevSmooth;

  } else {
    // --- Fallback vectoriel (ton dessin actuel)
    ctx.fillStyle = '#0f1b12';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = '#17331f';
    ctx.beginPath(); ctx.arc(cx, cy, R - 6, 0, Math.PI * 2); ctx.stroke();
  }

  // --- Anneau d’HP (conservé)
  const hpRatio = Math.max(0, state.baseHP / BASE_MAX_HP);
  ctx.strokeStyle = hpRatio > 0.5 ? '#7ee787' : (hpRatio > 0.25 ? '#ffd166' : '#ff6b6b');
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
  ctx.stroke();
}




function drawEnemies(t) {
  ctx.save();
  const prevSmooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  for (const e of state.enemies) {
    const blink = t < e.blinkUntil;

    // Choix de la clé en fonction du type
    let key = null;
    if (e.type === ENEMY_TYPES.GRUNT)   key = 'GRUNT';
    if (e.type === ENEMY_TYPES.RUNNER)  key = 'RUNNER';
    if (e.type === ENEMY_TYPES.SPAWNER) key = 'SPAWNER';
    if (e.type === ENEMY_TYPES.MINION)  key = 'MINION';
    if (e.type === ENEMY_TYPES.BATTERY_CARRIER) key = 'BATTERY_CARRIER';
    if (e.type === ENEMY_TYPES.ZIGZAG) key = 'ZIGZAG';
    if (e.type === ENEMY_TYPES.BATTERY_CARRIER && e.phase === 'HIDDEN') {
    continue;
    }

    
    if (e.type === ENEMY_TYPES.BATTERY_CARRIER && e.phase === 'ACTIVE') {
    const s = ENEMY_STATS[ENEMY_TYPES.BATTERY_CARRIER];
    const ratio = Math.max(0, Math.min(1, e.batteryLeft / s.activeTime));

    // Dimensions (en pixels CSS)
    const bw = 26;      // largeur du corps de batterie (hors borne)
    const bh = 8;       // hauteur de la batterie
    const tipW = 3;     // largeur de la borne "+"
    const gap = 6;      // espace au-dessus de l'ennemi

    const x0 = Math.round(e.x - bw / 2);
    const y0 = Math.round(e.y - e.radius - gap - bh);

    // Cadre de la batterie
    ctx.fillStyle = '#0a0f1a';
    ctx.fillRect(x0 - 1, y0 - 1, bw + 2 + tipW, bh + 2); // fond sombre derrière le cadre

    ctx.strokeStyle = '#bcd7ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, bw, bh);                      // cadre principal

    // Borne "+"
    ctx.fillStyle = '#bcd7ff';
    ctx.fillRect(x0 + bw, y0 + Math.floor(bh / 3), tipW, Math.ceil(bh / 3));

    // Remplissage selon ratio
    const fillW = Math.round(bw * ratio);
    const col = ratio > 0.5 ? '#7ec8ff' : (ratio > 0.25 ? '#ffd166' : '#ff6b6b');

    // Fond intérieur
    ctx.fillStyle = '#001f3f80';
    ctx.fillRect(x0 + 1, y0 + 1, bw - 2, bh - 2);

    // Charge restante
    ctx.fillStyle = col;
    ctx.fillRect(x0 + 1, y0 + 1, Math.max(0, fillW - 2), bh - 2);
    }



    const img = key ? sprites[key] : null;
    const canDrawSprite = key && spriteReady[key] && img && img.naturalWidth > 0;

    const w = Math.max(2, e.radius * 2);
    const h = Math.max(2, e.radius * 2);
    const x = Math.round(e.x - w / 2);
    const y = Math.round(e.y - h / 2);

    if (canDrawSprite) {
      ctx.drawImage(img, x, y, w, h);
      if (blink) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x, y, w, h);
      }
    } else {
      // Fallback vectoriel pour CE type (si son sprite est KO)
      const style = ENEMY_STATS[e.type];
      ctx.fillStyle = blink ? '#ffffff' : style.body;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = style.color; ctx.stroke();
    }

    // Barre de PV
    const bw = 24, bh = 4, ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = '#00000099';
    ctx.fillRect(e.x - bw/2, y - 10, bw, bh);
    ctx.fillStyle = ENEMY_STATS[e.type].color;
    ctx.fillRect(e.x - bw/2, y - 10, bw * ratio, bh);
  }

  ctx.imageSmoothingEnabled = prevSmooth;
  ctx.restore();
}



function drawPlayerAim(t) {
  const angle = Math.atan2(mouse.y - PLAYER_POS.y, mouse.x - PLAYER_POS.x);
  const recoil = Math.max(0, 1 - (t - state.lastShotAt) / (RECOIL * 1000));
  const len = 80 + recoil * 30;

  const rx = PLAYER_POS.x + Math.cos(angle) * len;
  const ry = PLAYER_POS.y + Math.sin(angle) * len;

  ctx.save();
//   ctx.fillStyle = '#51d0ff';
//   ctx.beginPath(); ctx.arc(PLAYER_POS.x, PLAYER_POS.y, 10, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#ffffff55';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PLAYER_POS.x, PLAYER_POS.y); ctx.lineTo(rx, ry); ctx.stroke();
  ctx.restore();
}

function drawBeam(beam) {
  ctx.save();
  ctx.strokeStyle = '#ff000032';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();

  ctx.strokeStyle = beam.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();

  ctx.fillStyle = beam.color;
  ctx.beginPath();
  ctx.arc(beam.x2, beam.y2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}


// ====== Glyph particles (Matrix-style disintegration) ======
const GLYPH_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GLYPH_COLOR_MAIN = '#00ff88';   // neon green
const GLYPH_COLOR_GLOW = '#00ff8855'; // soft glow overlay
const GLYPH_MIN = 10;                 // minimum glyphs per burst
const GLYPH_MAX = 20;                 // maximum glyphs per burst
const GLYPH_BASE_LIFE = 500;          // ms base lifetime
const GLYPH_LIFE_JITTER = 600;        // ms +/- jitter
const GLYPH_SPEED = { min: 60, max: 180 }; // px/s speed range
const GLYPH_SPREAD = { min: 0, max: Math.PI * 2 }; // emission angles
const GLYPH_SIZE = { min: 10, max: 18 };  // font size in px (CSS pixels)

// Store glyph particles in state
// { x, y, vx, vy, born, life, char, size, rot, rotSpeed }
state.glyphs = [];

/**
 * Spawn a burst of glyphs at (x, y).
 * @param {number} x
 * @param {number} y
 * @param {number} power - scale ~ number and speed (1 = small, 2 = big)
 */
function spawnGlyphBurst(x, y, power = 1) {
  const count = Math.round(
    GLYPH_MIN + (GLYPH_MAX - GLYPH_MIN) * Math.min(1, Math.max(0, power))
  );

  for (let i = 0; i < count; i++) {
    const a = GLYPH_SPREAD.min + Math.random() * (GLYPH_SPREAD.max - GLYPH_SPREAD.min);
    const sp = GLYPH_SPEED.min + Math.random() * (GLYPH_SPEED.max - GLYPH_SPEED.min);
    const vx = Math.cos(a) * sp;
    const vy = Math.sin(a) * sp;

    const life = GLYPH_BASE_LIFE + (Math.random() * 2 - 1) * GLYPH_LIFE_JITTER;
    const char = GLYPH_CHARSET[Math.floor(Math.random() * GLYPH_CHARSET.length)];
    const size = GLYPH_SIZE.min + Math.random() * (GLYPH_SIZE.max - GLYPH_SIZE.min);
    const rot = Math.random() * Math.PI * 2;
    const rotSpeed = (Math.random() * 2 - 1) * 1.2; // rad/s, small spin

    state.glyphs.push({
      x, y, vx, vy, born: now(), life, char, size, rot, rotSpeed,
    });
  }
}


function updateGlyphs(t, dt) {
  // léger damping (frein) pour un arrêt plus doux
  const DAMPING = 0.94; // par seconde
  const damp = Math.pow(DAMPING, Math.max(0, dt * 60)); // stable selon FPS

  for (let i = state.glyphs.length - 1; i >= 0; i--) {
    const g = state.glyphs[i];
    g.x += g.vx * dt;
    g.y += g.vy * dt;
    g.vx *= damp;
    g.vy *= damp;

    g.rot += g.rotSpeed * dt;

    if (t - g.born > g.life) {
      state.glyphs.splice(i, 1);
    }
  }
}



function drawGlyphs(t) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const g of state.glyphs) {
    const age = t - g.born;
    const lifeRatio = Math.max(0, Math.min(1, age / g.life)); // 0->1
    // Easing cubic-in pour un fondu plus doux en fin de vie
    const fade = lifeRatio * lifeRatio * lifeRatio; // t^3
    const alpha = 1 - fade;                         // 1 -> 0
    const alphaHex = Math.floor(alpha * 255).toString(16).padStart(2, '0');

    // Réduction progressive de la taille (jusqu'à 70%)
    const scale = 1 - 0.30 * lifeRatio; // 1 -> 0.7
    const fontSize = Math.round(g.size * scale);

    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.rot);
    ctx.font = `${fontSize}px Consolas, Menlo, monospace`;

    // Halo (glow) légèrement plus grand
    ctx.fillStyle = `#00ff88${Math.floor(alpha * 0.35 * 255).toString(16).padStart(2, '0')}`;
    ctx.fillText(g.char, 0, 1); // petit offset pour donner du volume

    // Caractère principal
    ctx.fillStyle = `#00ff88${alphaHex}`;
    ctx.fillText(g.char, 0, 0);

    ctx.restore();
  }

  ctx.restore();
}



function drawParticles() {
  for (const p of state.particles) {
    const lifeRatio = Math.max(0, 1 - (now() - p.born) / p.life);
    ctx.fillStyle = p.color + Math.floor(lifeRatio * 255).toString(16).padStart(2, '0');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * lifeRatio, 0, Math.PI * 2); ctx.fill();
  }
}


function drawGameOverPanel(t) {
  if (!state.gameOver) return;

  // Overlay sombre plein écran
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, W, H);

  // Carte centrée
  const cardW = Math.min(560, Math.floor(W * 0.9));
  const cardH = 190;
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const x = cx - Math.floor(cardW / 2);
  const y = cy - Math.floor(cardH / 2);

  // Fond de la carte (arrondi)
  const r = 16;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + cardW, y, x + cardW, y + cardH, r);
  ctx.arcTo(x + cardW, y + cardH, x, y + cardH, r);
  ctx.arcTo(x, y + cardH, x, y, r);
  ctx.arcTo(x, y, x + cardW, y, r);
  ctx.closePath();

  // Dégradé léger
  const grad = ctx.createLinearGradient(x, y, x, y + cardH);
  grad.addColorStop(0, 'rgba(15, 18, 28, 0.95)');
  grad.addColorStop(1, 'rgba(12, 15, 22, 0.95)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Bordure + lueur
  ctx.strokeStyle = '#7ee787';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.shadowColor = 'rgba(126, 231, 135, 0.35)';
  ctx.shadowBlur = 12;

  // Texte
  ctx.shadowColor = 'transparent';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Titre
  ctx.font = 'bold 26px Consolas, Menlo, monospace';
  ctx.fillStyle = '#ff6b6b';
  ctx.fillText('GAME OVER', cx, y + 32);

  // Message custom (multi-lignes si besoin)
  ctx.font = '18px Consolas, Menlo, monospace';
  ctx.fillStyle = '#c9d1d9';
  const lines = (state.deathMessage || 'Défaite.').split(/\n/);

  let ty = y + 78;
  for (const line of lines) {
    ctx.fillText(line, cx, ty);
    ty += 22;
  }

  // Sous-texte : score + invite rejouer
  ctx.font = '16px Consolas, Menlo, monospace';
  ctx.fillStyle = '#9fb7ff';
  ctx.fillText(`Score: ${state.score}  •  Appuie sur R pour rejouer`, cx, y + cardH - 28);

  ctx.restore();
}



function getDeathMessage(score) {
  if (score < 20) {
    return "💀 Tu as cliqué trop tard… La base est tombée.";
  } else if (score < 50) {
    return "⚠️ Pas mal ! Mais les vagues t’ont submergé.";
  } else if (score < 100) {
    return "🔥 Beau combat ! Encore un peu et tu tenais la ligne.";
  } else if (score < 200) {
    return "🏆 Héros déchu… Ta légende survivra.";
  } else if (score < 350) {
    return "🌪️ Tu as tenu contre l’orage, mais la tempête a gagné.";
  } else if (score < 500) {
    return "🛡️ Rempart d’acier ! Une défaite honorable.";
  } else {
    return "✨ Mythique. Même les algos s’inclinent devant toi.";
  }
}


// Démarre la première vague
scheduleWave();
