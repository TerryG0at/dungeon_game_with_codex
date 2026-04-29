import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0d1018, 12, 60);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const keys = {};
addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

const player = {
  obj: new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6aa9ff })),
  vel: new THREE.Vector3(),
  hp: 120,
  maxHp: 120,
  stamina: 100,
  maxStamina: 100,
  ammo: 16,
  maxAmmo: 16,
  weapon: 0,
  damage: { sword: 25, gun: 18 },
  xp: 0,
  level: 1,
  xpNext: 100,
  gold: 0,
};
player.obj.position.set(0, 1, 0);
scene.add(player.obj);

const bossGate = new THREE.Vector3(0, 1, -28);
let gameWon = false;
let checkpoint = new THREE.Vector3(0, 1, 0);
let canShootAt = 0;
let canSwingAt = 0;
let reloadAt = 0;
let dodgeAt = 0;

camera.position.set(0, 5, 7);

scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x1d2738, 0.95));
const dir = new THREE.DirectionalLight(0xffffff, 1);
dir.position.set(10, 14, 8);
scene.add(dir);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x2f333f }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function wall(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), new THREE.MeshStandardMaterial({ color: 0x4a3d35 }));
  m.position.set(x, 1.5, z);
  scene.add(m);
  return m;
}
const walls = [
  wall(0, -35, 60, 1), wall(0, 5, 60, 1), wall(-30, -15, 1, 40), wall(30, -15, 1, 40),
  wall(-10, -10, 1, 20), wall(10, -18, 1, 20), wall(0, -24, 16, 1), wall(-18, -22, 10, 1), wall(18, -12, 10, 1)
];

const enemies = [];
const hpOverlays = [];
function spawnGoblin(x, z, boss = false) {
  const hp = boss ? 220 : 70;
  const speed = boss ? 2.7 : 2.1;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), new THREE.MeshStandardMaterial({ color: boss ? 0x8e44ad : 0x4caf50 }));
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  const hud = document.createElement('div');
  hud.className = 'enemy-hp';
  hud.innerHTML = '<div></div>';
  document.getElementById('ui').appendChild(hud);
  enemies.push({ mesh, hp, maxHp: hp, speed, range: boss ? 20 : 14, attackAt: 0, boss, dead: false });
  hpOverlays.push(hud);
}

[[-8,-8],[8,-8],[-18,-18],[18,-20],[-6,-28],[6,-26]].forEach((p) => spawnGoblin(p[0], p[1]));
spawnGoblin(0, -31, true);

const drops = [];
function dropLoot(pos) {
  const roll = Math.random();
  let type = 'gold';
  if (roll > 0.66) type = 'ammo';
  else if (roll > 0.33) type = 'upgrade';
  const color = type === 'gold' ? 0xffd54f : type === 'ammo' ? 0x80cbc4 : 0xce93d8;
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
  mesh.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0));
  scene.add(mesh);
  drops.push({ mesh, type });
}

function lineOfSight(a, b) {
  const ray = new THREE.Raycaster(a.clone().add(new THREE.Vector3(0, 0.5, 0)), b.clone().sub(a).normalize(), 0, a.distanceTo(b));
  return ray.intersectObjects(walls).length === 0;
}

function pickWeapon(w) { player.weapon = (w + 2) % 2; }
addEventListener('wheel', (e) => pickWeapon(player.weapon + (e.deltaY > 0 ? 1 : -1)));
addEventListener('keydown', (e) => { if (e.key === '1') pickWeapon(0); if (e.key === '2') pickWeapon(1); });
addEventListener('mousedown', () => attack());

function attack() {
  const t = performance.now();
  if (reloadAt > t || gameWon) return;
  if (player.weapon === 1) {
    if (t < canShootAt || player.ammo <= 0) return;
    canShootAt = t + 180;
    player.ammo--;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = e.mesh.position.distanceTo(player.obj.position);
      if (d < 18 && lineOfSight(player.obj.position, e.mesh.position)) { e.hp -= player.damage.gun; break; }
    }
  } else {
    if (t < canSwingAt) return;
    canSwingAt = t + 400;
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.mesh.position.distanceTo(player.obj.position) < 2.2) e.hp -= player.damage.sword;
    }
  }
}

function updateUI() {
  const pct = (v, m) => `${Math.max(0, (v / m) * 100)}%`;
  playerHpBar.style.width = pct(player.hp, player.maxHp);
  playerStaminaBar.style.width = pct(player.stamina, player.maxStamina);
  playerXpBar.style.width = pct(player.xp, player.xpNext);
  playerHpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  playerStaminaText.textContent = `${Math.ceil(player.stamina)}/${player.maxStamina}`;
  playerXpText.textContent = `${player.xp}/${player.xpNext}`;
  weaponPanel.textContent = `Weapon: ${player.weapon ? 'Gun' : 'Sword'} | Ammo: ${player.ammo}/${player.maxAmmo}`;
  stats.textContent = `Lvl ${player.level} | Gold ${player.gold} | DMG S:${player.damage.sword} G:${player.damage.gun}`;
}

function levelUpIfNeeded() {
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level++;
    player.xpNext = Math.floor(player.xpNext * 1.25);
    player.maxHp += 15; player.hp = player.maxHp;
    player.damage.sword += 3; player.damage.gun += 2;
    player.maxStamina += 8;
    message.textContent = `Level Up! Now level ${player.level}`;
    setTimeout(() => (message.textContent = ''), 1300);
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = performance.now();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
  const wish = new THREE.Vector3();
  if (keys['w']) wish.add(forward);
  if (keys['s']) wish.sub(forward);
  if (keys['d']) wish.add(right);
  if (keys['a']) wish.sub(right);
  wish.normalize();

  const sprint = keys['shift'] && player.stamina > 0;
  const speed = sprint ? 7 : 4.2;
  if (sprint) player.stamina -= 25 * dt; else player.stamina = Math.min(player.maxStamina, player.stamina + 16 * dt);
  if ((keys['c'] || keys['control']) && t > dodgeAt && player.stamina > 18) {
    dodgeAt = t + 800; player.stamina -= 18;
    player.vel.add(wish.length() ? wish.multiplyScalar(9) : forward.multiplyScalar(6));
  }

  player.vel.x = wish.x * speed;
  player.vel.z = wish.z * speed;
  if (keys[' '] && player.obj.position.y <= 1.01) player.vel.y = 6;
  player.vel.y -= 12 * dt;
  player.obj.position.addScaledVector(player.vel, dt);
  if (player.obj.position.y < 1) { player.obj.position.y = 1; player.vel.y = 0; }

  for (const w of walls) {
    const dx = Math.abs(player.obj.position.x - w.position.x), dz = Math.abs(player.obj.position.z - w.position.z);
    if (dx < (w.scale.x + 1) && dz < (w.scale.z + 1)) {
      if (dx > dz) player.obj.position.x += player.obj.position.x > w.position.x ? 0.15 : -0.15;
      else player.obj.position.z += player.obj.position.z > w.position.z ? 0.15 : -0.15;
    }
  }

  for (let i=0;i<enemies.length;i++) {
    const e = enemies[i];
    const hud = hpOverlays[i];
    if (e.dead) { hud.style.display = 'none'; continue; }
    if (e.hp <= 0) {
      e.dead = true; scene.remove(e.mesh); dropLoot(e.mesh.position);
      player.xp += e.boss ? 120 : 40;
      if (e.boss) { gameWon = true; message.textContent = 'Boss defeated! Dungeon cleared!'; }
      continue;
    }
    const d = e.mesh.position.distanceTo(player.obj.position);
    const sees = d < e.range && lineOfSight(e.mesh.position, player.obj.position);
    if (sees) {
      const dir = player.obj.position.clone().sub(e.mesh.position).normalize();
      e.mesh.position.addScaledVector(dir, e.speed * dt);
      if (d < 1.9 && t > e.attackAt) { e.attackAt = t + 850; player.hp -= e.boss ? 16 : 8; }
    }
    const p = e.mesh.position.clone().add(new THREE.Vector3(0,1.4,0)).project(camera);
    hud.style.left = `${(p.x * .5 + .5) * innerWidth - 25}px`;
    hud.style.top = `${(-p.y * .5 + .5) * innerHeight - 45}px`;
    hud.firstElementChild.style.width = `${(e.hp / e.maxHp) * 100}%`;
  }

  for (let i=drops.length-1;i>=0;i--) {
    const d = drops[i];
    d.mesh.rotation.y += dt * 2;
    if (d.mesh.position.distanceTo(player.obj.position) < 1.2) {
      if (d.type === 'gold') player.gold += 15;
      if (d.type === 'ammo') player.ammo = Math.min(player.maxAmmo, player.ammo + 8);
      if (d.type === 'upgrade') { player.damage.sword += 1; player.damage.gun += 1; }
      scene.remove(d.mesh); drops.splice(i,1);
    }
  }

  if (keys['r'] && t > reloadAt && player.ammo < player.maxAmmo && player.weapon === 1) { reloadAt = t + 1000; player.ammo = player.maxAmmo; }
  if (player.obj.position.z < -14) checkpoint = new THREE.Vector3(0,1,-16);
  if (player.hp <= 0) {
    player.hp = player.maxHp;
    player.obj.position.copy(checkpoint);
    message.textContent = 'You died. Respawned at checkpoint.';
    setTimeout(() => (message.textContent = ''), 1200);
  }

  const camTarget = player.obj.position.clone().add(new THREE.Vector3(0,2.4,0));
  const camPos = player.obj.position.clone().add(new THREE.Vector3(0,4.5,7));
  camera.position.lerp(camPos, 0.1);
  camera.lookAt(camTarget);

  levelUpIfNeeded();
  updateUI();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
