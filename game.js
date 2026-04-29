import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0d1018, 12, 60);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const keys = {};
const hitEffects = [];
let yaw = 0;
let pitch = -0.25;
const playerRadius = 0.45;

addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));
addEventListener('click', () => renderer.domElement.requestPointerLock());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * 0.0025;
  pitch -= e.movementY * 0.0025;
  pitch = Math.max(-1.2, Math.min(0.7, pitch));
});

const player = {
  obj: new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.1, 4, 8), new THREE.MeshStandardMaterial({ color: 0x6aa9ff })),
  vel: new THREE.Vector3(), hp: 120, maxHp: 120, stamina: 100, maxStamina: 100,
  ammo: 16, maxAmmo: 16, weapon: 0, damage: { sword: 25, gun: 18 }, xp: 0, level: 1, xpNext: 100, gold: 0,
};
player.obj.position.set(0, 1, 0);
scene.add(player.obj);

let gameWon = false;
let checkpoint = new THREE.Vector3(0, 1, 0);
let canShootAt = 0, canSwingAt = 0, reloadAt = 0, dodgeAt = 0;

scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x1d2738, 0.95));
const dir = new THREE.DirectionalLight(0xffffff, 1); dir.position.set(10, 14, 8); scene.add(dir);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x2f333f }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

function wall(x, z, w, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), new THREE.MeshStandardMaterial({ color: 0x4a3d35 }));
  mesh.position.set(x, 1.5, z); scene.add(mesh);
  return { mesh, minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
}
const walls = [
  wall(0, -35, 60, 1), wall(0, 5, 60, 1), wall(-30, -15, 1, 40), wall(30, -15, 1, 40),
  wall(-10, -10, 1, 20), wall(10, -18, 1, 20), wall(0, -24, 16, 1), wall(-18, -22, 10, 1), wall(18, -12, 10, 1)
];
const wallMeshes = walls.map((w) => w.mesh);

const enemies = [], hpOverlays = [];
function spawnGoblin(x, z, boss = false) {
  const hp = boss ? 220 : 70;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.9), new THREE.MeshStandardMaterial({ color: boss ? 0x8e44ad : 0x4caf50 }));
  mesh.position.set(x, 0.8, z); scene.add(mesh);
  const hud = document.createElement('div'); hud.className = 'enemy-hp'; hud.innerHTML = '<div></div>';
  ui.appendChild(hud);
  enemies.push({ mesh, hp, maxHp: hp, speed: boss ? 2.7 : 2.1, range: boss ? 20 : 14, attackAt: 0, boss, dead: false });
  hpOverlays.push(hud);
}
[[-8,-8],[8,-8],[-18,-18],[18,-20],[-6,-28],[6,-26]].forEach((p) => spawnGoblin(p[0], p[1]));
spawnGoblin(0, -31, true);

const sword = new THREE.Group();
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: 0xdfe6f5, metalness: 0.7, roughness: 0.3 }));
blade.position.y = 0.55;
const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x8d6e63 }));
hilt.position.y = 0.1; sword.add(blade, hilt);
const gun = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.16), new THREE.MeshStandardMaterial({ color: 0x212121, metalness: 0.6 }));
const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), new THREE.MeshStandardMaterial({ color: 0x424242 }));
grip.position.set(-0.12, -0.2, 0); gun.add(body, grip);
scene.add(sword, gun);

const drops = [];
function dropLoot(pos) {
  const roll = Math.random(); let type = 'gold'; if (roll > 0.66) type = 'ammo'; else if (roll > 0.33) type = 'upgrade';
  const color = type === 'gold' ? 0xffd54f : type === 'ammo' ? 0x80cbc4 : 0xce93d8;
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.4 }));
  mesh.position.copy(pos).add(new THREE.Vector3(0, 0.5, 0)); scene.add(mesh); drops.push({ mesh, type });
}
function spawnHitEffect(pos, color = 0xff6666) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshBasicMaterial({ color }));
  m.position.copy(pos); scene.add(m); hitEffects.push({ m, t: 0.2 });
}

function lineOfSight(a, b) {
  const ray = new THREE.Raycaster(a.clone().add(new THREE.Vector3(0, 0.5, 0)), b.clone().sub(a).normalize(), 0, a.distanceTo(b));
  return ray.intersectObjects(wallMeshes).length === 0;
}
function pickWeapon(w) { player.weapon = (w + 2) % 2; }
addEventListener('wheel', (e) => pickWeapon(player.weapon + (e.deltaY > 0 ? 1 : -1)));
addEventListener('keydown', (e) => { if (e.key === '1') pickWeapon(0); if (e.key === '2') pickWeapon(1); });
addEventListener('mousedown', () => attack());

function attack() {
  const t = performance.now(); if (reloadAt > t || gameWon) return;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw) * -1).normalize();
  if (player.weapon === 1) {
    if (t < canShootAt || player.ammo <= 0) return; canShootAt = t + 180; player.ammo--;
    let hit = false;
    for (const e of enemies) {
      if (e.dead) continue;
      const toEnemy = e.mesh.position.clone().sub(player.obj.position);
      if (toEnemy.length() < 20 && forward.dot(toEnemy.normalize()) > 0.92 && lineOfSight(player.obj.position, e.mesh.position)) {
        e.hp -= player.damage.gun; spawnHitEffect(e.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xffaa55); hit = true; break;
      }
    }
    if (!hit) spawnHitEffect(player.obj.position.clone().add(forward.multiplyScalar(2)), 0xffffff);
  } else {
    if (t < canSwingAt) return; canSwingAt = t + 400;
    for (const e of enemies) {
      if (e.dead) continue;
      const toEnemy = e.mesh.position.clone().sub(player.obj.position);
      if (toEnemy.length() < 2.4 && forward.dot(toEnemy.normalize()) > 0.2) {
        e.hp -= player.damage.sword;
        spawnHitEffect(e.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 0xff4444);
      }
    }
  }
}

function resolveWallCollision(pos) {
  for (const w of walls) {
    const closestX = Math.max(w.minX, Math.min(pos.x, w.maxX));
    const closestZ = Math.max(w.minZ, Math.min(pos.z, w.maxZ));
    const dx = pos.x - closestX, dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < playerRadius * playerRadius) {
      const dist = Math.sqrt(distSq) || 0.0001;
      const push = playerRadius - dist;
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }
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

function updateUI() {
  const pct = (v, m) => `${Math.max(0, (v / m) * 100)}%`;
  playerHpBar.style.width = pct(player.hp, player.maxHp); playerStaminaBar.style.width = pct(player.stamina, player.maxStamina); playerXpBar.style.width = pct(player.xp, player.xpNext);
  playerHpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`; playerStaminaText.textContent = `${Math.ceil(player.stamina)}/${player.maxStamina}`;
  playerXpText.textContent = `${player.xp}/${player.xpNext}`;
  weaponPanel.textContent = `Weapon: ${player.weapon ? 'Gun' : 'Sword'} | Ammo: ${player.ammo}/${player.maxAmmo}`;
  stats.textContent = `Lvl ${player.level} | Gold ${player.gold} | DMG S:${player.damage.sword} G:${player.damage.gun}`;
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033), t = performance.now();
  const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw)).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
  const wish = new THREE.Vector3(); if (keys['w']) wish.add(forward); if (keys['s']) wish.sub(forward); if (keys['d']) wish.add(right); if (keys['a']) wish.sub(right); wish.normalize();
  const sprint = keys['shift'] && player.stamina > 0;
  if (sprint) player.stamina -= 25 * dt; else player.stamina = Math.min(player.maxStamina, player.stamina + 16 * dt);
  if ((keys['c'] || keys['control']) && t > dodgeAt && player.stamina > 18) { dodgeAt = t + 800; player.stamina -= 18; player.vel.add(wish.length() ? wish.clone().multiplyScalar(9) : forward.clone().multiplyScalar(6)); }
  player.vel.x = wish.x * (sprint ? 7 : 4.2); player.vel.z = wish.z * (sprint ? 7 : 4.2);
  if (keys[' '] && player.obj.position.y <= 1.01) player.vel.y = 6; player.vel.y -= 12 * dt;
  player.obj.position.addScaledVector(player.vel, dt); if (player.obj.position.y < 1) { player.obj.position.y = 1; player.vel.y = 0; }
  resolveWallCollision(player.obj.position);

  for (let i=0;i<enemies.length;i++) {
    const e = enemies[i], hud = hpOverlays[i]; if (e.dead) { hud.style.display = 'none'; continue; }
    if (e.hp <= 0) { e.dead = true; scene.remove(e.mesh); dropLoot(e.mesh.position); player.xp += e.boss ? 120 : 40; if (e.boss) { gameWon = true; message.textContent = 'Boss defeated! Dungeon cleared!'; } continue; }
    const d = e.mesh.position.distanceTo(player.obj.position);
    if (d < e.range && lineOfSight(e.mesh.position, player.obj.position)) {
      e.mesh.position.addScaledVector(player.obj.position.clone().sub(e.mesh.position).normalize(), e.speed * dt);
      if (d < 1.9 && t > e.attackAt) { e.attackAt = t + 850; player.hp -= e.boss ? 16 : 8; }
    }
    const p = e.mesh.position.clone().add(new THREE.Vector3(0,1.4,0)).project(camera);
    hud.style.left = `${(p.x * .5 + .5) * innerWidth - 25}px`; hud.style.top = `${(-p.y * .5 + .5) * innerHeight - 45}px`;
    hud.firstElementChild.style.width = `${(e.hp / e.maxHp) * 100}%`;
  }

  for (let i=drops.length-1;i>=0;i--) {
    const d = drops[i]; d.mesh.rotation.y += dt * 2;
    if (d.mesh.position.distanceTo(player.obj.position) < 1.2) { if (d.type === 'gold') player.gold += 15; if (d.type === 'ammo') player.ammo = Math.min(player.maxAmmo, player.ammo + 8); if (d.type === 'upgrade') { player.damage.sword += 1; player.damage.gun += 1; } scene.remove(d.mesh); drops.splice(i,1); }
  }
  for (let i=hitEffects.length-1;i>=0;i--) {
    hitEffects[i].t -= dt; hitEffects[i].m.scale.multiplyScalar(1 + dt * 8);
    if (hitEffects[i].t <= 0) { scene.remove(hitEffects[i].m); hitEffects.splice(i, 1); }
  }

  if (keys['r'] && t > reloadAt && player.ammo < player.maxAmmo && player.weapon === 1) { reloadAt = t + 1000; player.ammo = player.maxAmmo; }
  if (player.obj.position.z < -14) checkpoint = new THREE.Vector3(0,1,-16);
  if (player.hp <= 0) { player.hp = player.maxHp; player.obj.position.copy(checkpoint); message.textContent = 'You died. Respawned at checkpoint.'; setTimeout(() => (message.textContent = ''), 1200); }

  const pivot = player.obj.position.clone().add(new THREE.Vector3(0, 2.1, 0));
  const offset = new THREE.Vector3(0, 1.7, 6.5).applyAxisAngle(new THREE.Vector3(1,0,0), pitch).applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
  camera.position.lerp(pivot.clone().add(offset), 0.14);
  camera.lookAt(pivot);

  const handOffset = new THREE.Vector3(0.45, -0.4, -0.9).applyQuaternion(camera.quaternion);
  const handPos = camera.position.clone().add(handOffset);
  sword.visible = player.weapon === 0; gun.visible = player.weapon === 1;
  sword.position.copy(handPos); gun.position.copy(handPos);
  sword.quaternion.copy(camera.quaternion); gun.quaternion.copy(camera.quaternion);
  sword.rotateX(-0.7); sword.rotateZ(0.2);
  gun.rotateY(Math.PI);

  levelUpIfNeeded();
  updateUI(); renderer.render(scene, camera); requestAnimationFrame(animate);
}
animate();
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
