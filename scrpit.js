
// ====== Canvas & Const ======
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

const BASE_RADIUS = 46;
const MARGIN = 60; // marge visuelle depuis les bords
// Base en bas à droite : son centre est à MARGIN des bords
const BASE_POS = { x: W - MARGIN - BASE_RADIUS, y: H - MARGIN - BASE_RADIUS };
const PLAYER_POS = { x: BASE_POS.x, y: BASE_POS.y }; // joueur fixe sur la base

const PLAYER_FIRERATE = 7.5; // tirs par seconde
const BULLET_SPEED = 900;    // px/s
const BULLET_LIFETIME = 0.9; // s
const RECOIL = 0.015;        // sec de cooldown minimum visuel
const ENEMY_BASE_SPEED = 70; // px/s
const ENEMY_BASE_HP = 30;    // PV par ennemi de base
const BASE_MAX_HP = 100;
const WAVE_INTERVAL = 2200;  // ms entre spawns d'une vague (groupes)
const DIFFICULTY_RAMP = 1.12;// multiplicateur par vague

let paused = false;
let rng = (min, max) => min + Math.random() * (max - min);
let now = () => performance.now();

// ====== État du jeu ======
const state = {
  baseHP: BASE_MAX_HP,
  score: 0,
  wave: 1,
  nextGroupAt: now() + 1000,
  groupLeft: 0,
  time: now(),
  lastShotAt: -1e9,
  bullets: [],
  enemies: [],
  particles: [],
  gameOver: false,
};

// ====== Input souris ======
const mouse = { x: W / 2, y: H / 2, down: false };
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) * (canvas.width / r.width);
  mouse.y = (e.clientY - r.top) * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', () => mouse.down = true);
canvas.addEventListener('mouseup', () => mouse.down = false);

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
  state.bullets.length = 0;
  state.particles.length = 0;
  state.nextGroupAt = now() + 1000;
  state.groupLeft = 0;
  state.lastShotAt = -1e9;
  state.gameOver = false;
}

// ====== Spawns & vagues ======
function spawnEnemy(scale = 1) {
  // Spawn sur un bord aléatoire
  const side = Math.floor(Math.random() * 4); // 0 top, 1 right, 2 bottom, 3 left
  let x, y;
  if (side === 0) { x = rng(40, W - 40); y = -20; }
  if (side === 1) { x = W + 20; y = rng(40, H - 40); }
  if (side === 2) { x = rng(40, W - 40); y = H + 20; }
  if (side === 3) { x = -20; y = rng(40, H - 40); }

  // Évite les spawns trop proches de la base (pour l’équilibre)
  const MIN_DIST = 240;
  const d2 = (x - BASE_POS.x) ** 2 + (y - BASE_POS.y) ** 2;
  if (d2 < MIN_DIST * MIN_DIST) return spawnEnemy(scale); // reshow si trop près

  const speed = ENEMY_BASE_SPEED * rng(0.85, 1.25) * scale;
  const hp = ENEMY_BASE_HP * rng(0.9, 1.2) * scale;
  const dmg = Math.round(4 * scale); // dégâts à l'impact base

  state.enemies.push({
    x, y, hp, maxHp: hp, speed, dmg,
    radius: 16,
    blinkUntil: 0,
  });
}

function scheduleWave() {
  // Nombre total d'ennemis par vague et taille des groupes
  const total = Math.round(6 + (state.wave - 1) * 2.2);
  const group = Math.min(6, 2 + Math.floor(state.wave / 2)); // (référence si tu veux en faire usage)
  state.groupLeft = total;

  // Timer pour le prochain groupe
  state.nextGroupAt = now() + 500;
}

function updateSpawns(t) {
  if (state.gameOver) return;
  if (state.groupLeft <= 0 && state.enemies.length === 0) {
    // Vague suivante
    state.wave++;
    scheduleWave();
  }
  if (t > state.nextGroupAt && state.groupLeft > 0) {
    const scale = Math.pow(DIFFICULTY_RAMP, state.wave - 1);
    const count = Math.min(4 + Math.floor(state.wave / 3), state.groupLeft);
    for (let i = 0; i < count; i++) spawnEnemy(scale);
    state.groupLeft -= count;
    state.nextGroupAt = t + WAVE_INTERVAL * rng(0.6, 1.1);
  }
}

// ====== Tir ======
function tryShoot(t) {
  if (state.gameOver) return;
  const cooldown = 1000 / PLAYER_FIRERATE; // ms
  if (!mouse.down || (t - state.lastShotAt) < cooldown) return;

  state.lastShotAt = t;

  const angle = Math.atan2(mouse.y - PLAYER_POS.y, mouse.x - PLAYER_POS.x);
  const vx = Math.cos(angle) * BULLET_SPEED;
  const vy = Math.sin(angle) * BULLET_SPEED;

  state.bullets.push({
    x: PLAYER_POS.x, y: PLAYER_POS.y,
    vx, vy,
    born: t,
    life: BULLET_LIFETIME * 1000,
    radius: 4
  });

  // Flash / particules
  pushMuzzleFlash(angle);
  // (Option son : décommente si tu ajoutes un son)
  // playSound('shoot');
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

// ====== Update ======
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
    updateBullets(t, dt);
    updateEnemies(dt);
    resolveCollisions(t);
    updateSpawns(t);

    if (state.baseHP <= 0 && !state.gameOver) {
      state.gameOver = true;
    }
  }
  // UI
  document.getElementById('wave').textContent = `Vague: ${state.wave}`;
  document.getElementById('score').textContent = `Score: ${state.score}`;
  document.getElementById('basehp').textContent = `Base: ${Math.max(0, Math.round(state.baseHP))}%`;
  document.getElementById('status').textContent = paused ? '⏸ Pause' : (state.gameOver ? '💥 Game Over – R pour rejouer' : '');
}

function updateBullets(t, dt) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (t - b.born > b.life || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
      state.bullets.splice(i, 1);
    }
  }
}

function updateEnemies(dt) {
  for (const e of state.enemies) {
    const dx = BASE_POS.x - e.x;
    const dy = BASE_POS.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    e.x += ux * e.speed * dt;
    e.y += uy * e.speed * dt;
  }
}

function resolveCollisions(t) {
  // Bullets vs Enemies
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    let hitIndex = -1;
    for (let j = 0; j < state.enemies.length; j++) {
      const e = state.enemies[j];
      const d2 = (b.x - e.x) ** 2 + (b.y - e.y) ** 2;
      if (d2 <= (e.radius + b.radius) ** 2) {
        hitIndex = j; break;
      }
    }
    if (hitIndex >= 0) {
      const e = state.enemies[hitIndex];
      e.hp -= 20; // dégâts par balle
      e.blinkUntil = t + 90;
      hitParticles(b.x, b.y);
      state.bullets.splice(i, 1);
      if (e.hp <= 0) {
        state.score += 10;
        // petite explosion
        hitParticles(e.x, e.y, '#ffd166');
        state.enemies.splice(hitIndex, 1);
      }
    }
  }

  // Enemies vs Base
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    const d2 = (e.x - BASE_POS.x) ** 2 + (e.y - BASE_POS.y) ** 2;
    if (d2 <= (BASE_RADIUS + e.radius) ** 2) {
      // impact
      state.baseHP -= e.dmg;
      hitParticles(e.x, e.y, '#ffadb5');
      state.enemies.splice(i, 1);
      if (state.baseHP <= 0) {
        state.baseHP = 0;
      }
    }
  }

  // Particules
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * 0.016;
    p.y += p.vy * 0.016;
    if (t - p.born > p.life) state.particles.splice(i, 1);
  }
}

// ====== Draw ======
function draw(t) {
  ctx.clearRect(0, 0, W, H);
  // fond
  ctx.fillStyle = '#0a0b0f';
  ctx.fillRect(0, 0, W, H);

  drawArenaGrid();
  drawBase(t);
  drawBullets();
  drawEnemies(t);
  drawPlayerAim(t);
  drawParticles();
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

  // halo
  const g = ctx.createRadialGradient(cx, cy, 8, cx, cy, BASE_RADIUS + 30);
  g.addColorStop(0, 'rgba(126,231,135,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, BASE_RADIUS + 30, 0, Math.PI * 2); ctx.fill();

  // base
  ctx.fillStyle = '#0f1b12';
  ctx.beginPath(); ctx.arc(cx, cy, BASE_RADIUS, 0, Math.PI * 2); ctx.fill();

  // anneau
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#17331f';
  ctx.beginPath(); ctx.arc(cx, cy, BASE_RADIUS - 6, 0, Math.PI * 2); ctx.stroke();

  // barre de vie circulaire
  const hpRatio = Math.max(0, state.baseHP / BASE_MAX_HP);
  ctx.strokeStyle = hpRatio > 0.5 ? '#7ee787' : (hpRatio > 0.25 ? '#ffd166' : '#ff6b6b');
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, BASE_RADIUS - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * hpRatio);
  ctx.stroke();
}

function drawBullets() {
  ctx.save();
  for (const b of state.bullets) {
    // lueur
    ctx.strokeStyle = '#51d0ff55';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.01, b.y - b.vy * 0.01);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // cœur
    ctx.fillStyle = '#51d0ff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawEnemies(t) {
  ctx.save();
  for (const e of state.enemies) {
    const blink = t < e.blinkUntil;
    // corps
    ctx.fillStyle = blink ? '#ffffff' : '#2a0f14';
    ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
    // bord
    ctx.lineWidth = 3;
    ctx.strokeStyle = blink ? '#ff8da0' : '#ff5a6a';
    ctx.stroke();
    // barre de vie
    const w = 24, h = 4, ratio = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = '#00000099';
    ctx.fillRect(e.x - w/2, e.y - e.radius - 10, w, h);
    ctx.fillStyle = '#ff8da0';
    ctx.fillRect(e.x - w/2, e.y - e.radius - 10, w * ratio, h);
  }
  ctx.restore();
}

function drawPlayerAim(t) {
  const angle = Math.atan2(mouse.y - PLAYER_POS.y, mouse.x - PLAYER_POS.x);
  const recoil = Math.max(0, 1 - (t - state.lastShotAt) / (RECOIL * 1000));
  const len = 80 + recoil * 30;

  // réticule
  const rx = PLAYER_POS.x + Math.cos(angle) * len;
  const ry = PLAYER_POS.y + Math.sin(angle) * len;

  ctx.save();
  // base du joueur (petit noyau)
  ctx.fillStyle = '#51d0ff';
  ctx.beginPath(); ctx.arc(PLAYER_POS.x, PLAYER_POS.y, 10, 0, Math.PI * 2); ctx.fill();

  // ligne de visée
  ctx.strokeStyle = '#ffffff55';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PLAYER_POS.x, PLAYER_POS.y); ctx.lineTo(rx, ry); ctx.stroke();

  // cercle réticule
  ctx.strokeStyle = '#ffffffaa';
  ctx.beginPath(); ctx.arc(rx, ry, 9 + recoil * 3, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  for (const p of state.particles) {
    const lifeRatio = Math.max(0, 1 - (now() - p.born) / p.life);
    ctx.fillStyle = p.color + Math.floor(lifeRatio * 255).toString(16).padStart(2, '0');
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * lifeRatio, 0, Math.PI * 2); ctx.fill();
  }
}

// ====== (Option) Sons ======
// Place un dossier /sounds avec shoot.wav, hit.wav, etc., puis décommente.
// const sounds = {};
// function loadSounds() {
//   for (const [k, file] of Object.entries({ shoot: 'shoot.wav', hit: 'hit.wav' })) {
//     const a = new Audio('sounds/' + file); a.volume = 0.35; sounds[k] = a;
//   }
// }
// function playSound(k) { sounds[k]?.currentTime = 0; sounds[k]?.play(); }
// loadSounds();

// Lance une première vague
scheduleWave();
