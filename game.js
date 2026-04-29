import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';

const TILE = 2;
const MAP_W = 36;
const MAP_H = 30;
const WALL = 0;
const FLOOR = 1;
const GATE = 2;
const WALL_HEIGHT = 2.8;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090c12);
scene.fog = new THREE.Fog(0x090c12, 26, 58);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 140);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const ui = {
  root: document.getElementById('ui'),
  hpBar: document.getElementById('playerHpBar'),
  staminaBar: document.getElementById('playerStaminaBar'),
  xpBar: document.getElementById('playerXpBar'),
  hpText: document.getElementById('playerHpText'),
  staminaText: document.getElementById('playerStaminaText'),
  xpText: document.getElementById('playerXpText'),
  stats: document.getElementById('stats'),
  weaponName: document.getElementById('weaponName'),
  weaponMeta: document.getElementById('weaponMeta'),
  objective: document.getElementById('objectiveText'),
  room: document.getElementById('roomText'),
  message: document.getElementById('message'),
  bossPanel: document.getElementById('bossPanel'),
  bossName: document.getElementById('bossName'),
  bossHpBar: document.getElementById('bossHpBar'),
  reticle: document.getElementById('reticle'),
  minimap: document.getElementById('minimap'),
  overlay: document.getElementById('screenOverlay'),
  overlayTitle: document.getElementById('overlayTitle'),
  overlaySubtitle: document.getElementById('overlaySubtitle'),
  restartButton: document.getElementById('restartButton'),
};

const minimapCtx = ui.minimap.getContext('2d');
const keys = {};
const pointer = new THREE.Vector2();
const aimPoint = new THREE.Vector3();
const aimDir = new THREE.Vector3(0, 0, -1);
const cameraState = {
  yaw: 0,
  distance: 10.5,
  height: 8.2,
};

let mouseDown = false;
let orbitDrag = false;
let dodgeQueued = false;
let gateOpen = false;
let gameEnded = false;
let messageTimer = 0;
let pathRefreshAt = 0;
let pathField = new Map();
let gateGroup;
let bossEnemy;

const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(WALL));
const roomForTile = new Map();
const enemies = [];
const pickups = [];
const chests = [];
const projectiles = [];
const enemyProjectiles = [];
const transientEffects = [];

const dungeonGroup = new THREE.Group();
const actorGroup = new THREE.Group();
const effectGroup = new THREE.Group();
scene.add(dungeonGroup, actorGroup, effectGroup);

const materials = {
  floorA: new THREE.MeshStandardMaterial({ color: 0x363946, roughness: 0.92 }),
  floorB: new THREE.MeshStandardMaterial({ color: 0x2f3440, roughness: 0.95 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x51483f, roughness: 0.85 }),
  wallTop: new THREE.MeshStandardMaterial({ color: 0x6a5b4a, roughness: 0.8 }),
  gate: new THREE.MeshStandardMaterial({ color: 0xd0a642, metalness: 0.55, roughness: 0.32, emissive: 0x251600 }),
  player: new THREE.MeshStandardMaterial({ color: 0x6aa9ff, roughness: 0.45, emissive: 0x061225 }),
  playerTrim: new THREE.MeshStandardMaterial({ color: 0xf7e3a2, roughness: 0.35 }),
  sword: new THREE.MeshStandardMaterial({ color: 0xdfe8f5, metalness: 0.65, roughness: 0.22 }),
  hilt: new THREE.MeshStandardMaterial({ color: 0x7a4b2b, roughness: 0.48 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x2b3038, metalness: 0.45, roughness: 0.32 }),
  gunGrip: new THREE.MeshStandardMaterial({ color: 0x70462e, roughness: 0.5 }),
  coin: new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.55, roughness: 0.3, emissive: 0x221600 }),
  potion: new THREE.MeshStandardMaterial({ color: 0xff5c8a, roughness: 0.35, emissive: 0x330617 }),
  ammo: new THREE.MeshStandardMaterial({ color: 0x71f5d6, roughness: 0.35, emissive: 0x06342e }),
  key: new THREE.MeshStandardMaterial({ color: 0xf7c948, metalness: 0.8, roughness: 0.24, emissive: 0x322100 }),
  chest: new THREE.MeshStandardMaterial({ color: 0x7b5134, roughness: 0.58 }),
  chestTrim: new THREE.MeshStandardMaterial({ color: 0xd8b15f, metalness: 0.45, roughness: 0.28 }),
};

const enemyTypes = {
  scout: {
    name: 'Scout',
    color: 0xe35f4f,
    hp: 52,
    speed: 3.05,
    damage: 8,
    xp: 20,
    gold: 8,
    radius: 0.42,
    attackRange: 1.15,
    attackCooldown: 0.95,
    aggro: 11,
  },
  brute: {
    name: 'Brute',
    color: 0xc78b44,
    hp: 95,
    speed: 2.25,
    damage: 14,
    xp: 38,
    gold: 14,
    radius: 0.55,
    attackRange: 1.35,
    attackCooldown: 1.25,
    aggro: 12,
    scale: 1.2,
  },
  arcanist: {
    name: 'Arcanist',
    color: 0x9b6dff,
    hp: 48,
    speed: 2.55,
    damage: 9,
    xp: 28,
    gold: 11,
    radius: 0.42,
    attackRange: 7.2,
    attackCooldown: 1.45,
    aggro: 13,
    ranged: true,
  },
  boss: {
    name: 'The Gate Warden',
    color: 0x3ed1b5,
    hp: 330,
    speed: 2.35,
    damage: 18,
    xp: 150,
    gold: 60,
    radius: 0.8,
    attackRange: 1.7,
    attackCooldown: 0.9,
    aggro: 20,
    boss: true,
    scale: 1.6,
  },
};

const rooms = {
  spawn: { x: 2, y: 2, w: 8, h: 6, name: 'Ember Entry' },
  archive: { x: 14, y: 2, w: 8, h: 6, name: 'Dust Archive' },
  forge: { x: 26, y: 3, w: 7, h: 7, name: 'Iron Shrine' },
  vault: { x: 3, y: 13, w: 10, h: 6, name: 'Sunken Vault' },
  well: { x: 16, y: 12, w: 8, h: 7, name: 'Echo Well' },
  key: { x: 27, y: 14, w: 6, h: 6, name: 'Key Chamber' },
  ante: { x: 13, y: 22, w: 9, h: 5, name: 'Gate Hall' },
  boss: { x: 25, y: 22, w: 8, h: 6, name: 'Warden Court' },
};

const player = {
  mesh: new THREE.Group(),
  radius: 0.45,
  hp: 110,
  maxHp: 110,
  stamina: 100,
  maxStamina: 100,
  level: 1,
  xp: 0,
  xpNext: 80,
  gold: 0,
  weapon: 'sword',
  swordDamage: 30,
  gunDamage: 36,
  clip: 6,
  maxClip: 6,
  reserve: 20,
  maxReserve: 36,
  potions: 1,
  maxPotions: 3,
  hasKey: false,
  attackReadyAt: 0,
  reloadDoneAt: 0,
  dodgeReadyAt: 0,
  invulnerableUntil: 0,
  dodgeVelocity: new THREE.Vector3(),
  swingTimer: 0,
  shotTimer: 0,
  weaponBob: 0,
  weaponRoot: null,
  swordGroup: null,
  gunGroup: null,
  muzzle: null,
};

function keyOf(gx, gy) {
  return `${gx},${gy}`;
}

function roomCenter(room) {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  };
}

function inBounds(gx, gy) {
  return gx >= 0 && gy >= 0 && gx < MAP_W && gy < MAP_H;
}

function worldFromGrid(gx, gy, y = 0) {
  return new THREE.Vector3((gx - MAP_W / 2 + 0.5) * TILE, y, (gy - MAP_H / 2 + 0.5) * TILE);
}

function gridFromWorld(position) {
  return {
    x: Math.floor(position.x / TILE + MAP_W / 2),
    y: Math.floor(position.z / TILE + MAP_H / 2),
  };
}

function isBlocked(gx, gy) {
  if (!inBounds(gx, gy)) return true;
  if (map[gy][gx] === WALL) return true;
  return map[gy][gx] === GATE && !gateOpen;
}

function carveTile(gx, gy, roomName = 'Passage') {
  if (!inBounds(gx, gy)) return;
  map[gy][gx] = FLOOR;
  roomForTile.set(keyOf(gx, gy), roomName);
}

function carveRoom(room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      carveTile(x, y, room.name);
    }
  }
}

function carveCorridor(from, to) {
  const sx = Math.min(from.x, to.x);
  const ex = Math.max(from.x, to.x);
  const sy = Math.min(from.y, to.y);
  const ey = Math.max(from.y, to.y);

  for (let x = sx; x <= ex; x++) carveTile(x, from.y);
  for (let y = sy; y <= ey; y++) carveTile(to.x, y);
}

function buildMap() {
  Object.values(rooms).forEach(carveRoom);

  carveCorridor(roomCenter(rooms.spawn), roomCenter(rooms.archive));
  carveCorridor(roomCenter(rooms.archive), roomCenter(rooms.forge));
  carveCorridor(roomCenter(rooms.spawn), roomCenter(rooms.vault));
  carveCorridor(roomCenter(rooms.vault), roomCenter(rooms.well));
  carveCorridor(roomCenter(rooms.well), roomCenter(rooms.key));
  carveCorridor(roomCenter(rooms.well), roomCenter(rooms.ante));
  carveCorridor(roomCenter(rooms.ante), roomCenter(rooms.boss));

  map[24][23] = GATE;
  roomForTile.set(keyOf(23, 24), 'Gate Hall');
}

function createDungeonMesh() {
  const floorGeometry = new THREE.BoxGeometry(TILE, 0.12, TILE);
  const wallGeometry = new THREE.BoxGeometry(TILE, WALL_HEIGHT, TILE);
  const capGeometry = new THREE.BoxGeometry(TILE * 0.98, 0.16, TILE * 0.98);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = map[y][x];
      const pos = worldFromGrid(x, y);

      if (tile !== WALL) {
        const floor = new THREE.Mesh(floorGeometry, (x + y) % 3 === 0 ? materials.floorB : materials.floorA);
        floor.position.set(pos.x, -0.06, pos.z);
        floor.receiveShadow = true;
        dungeonGroup.add(floor);
      }

      if (tile === WALL) {
        const wall = new THREE.Mesh(wallGeometry, materials.wall);
        wall.position.set(pos.x, WALL_HEIGHT / 2 - 0.02, pos.z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        dungeonGroup.add(wall);

        const cap = new THREE.Mesh(capGeometry, materials.wallTop);
        cap.position.set(pos.x, WALL_HEIGHT + 0.05, pos.z);
        cap.receiveShadow = true;
        dungeonGroup.add(cap);
      }
    }
  }

  createGate();
  addTorch(6, 3, 0xffad5a);
  addTorch(19, 4, 0xffad5a);
  addTorch(29, 5, 0xffad5a);
  addTorch(8, 15, 0x7af5d6);
  addTorch(20, 15, 0x7af5d6);
  addTorch(29, 16, 0xffad5a);
  addTorch(17, 24, 0xf7cf6a);
  addTorch(28, 24, 0x3ed1b5);
}

function createGate() {
  gateGroup = new THREE.Group();
  const gatePos = worldFromGrid(23, 24);
  gateGroup.position.copy(gatePos);

  for (let i = -2; i <= 2; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.16), materials.gate);
    bar.position.set(0, 1.35, i * 0.36);
    bar.castShadow = true;
    gateGroup.add(bar);
  }

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, TILE * 1.12), materials.gate);
  top.position.set(0, 2.58, 0);
  gateGroup.add(top);

  dungeonGroup.add(gateGroup);
}

function addTorch(gx, gy, color) {
  const pos = worldFromGrid(gx, gy, 1.35);
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 8),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 })
  );
  flame.position.copy(pos);
  dungeonGroup.add(flame);

  const light = new THREE.PointLight(color, 1.3, 8, 2);
  light.position.copy(pos);
  dungeonGroup.add(light);
}

function createPlayer() {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.85, 5, 10), materials.player);
  body.position.y = 0.88;
  body.castShadow = true;

  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 10), materials.playerTrim);
  helm.position.set(0, 1.54, 0.08);
  helm.castShadow = true;

  const face = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.1, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.4 })
  );
  face.position.set(0, 1.55, 0.29);
  face.castShadow = true;

  const weaponRoot = new THREE.Group();
  weaponRoot.position.set(0.38, 1.05, 0.36);

  const swordGroup = new THREE.Group();
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.12), materials.hilt);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), materials.hilt);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 1.55), materials.sword);
  guard.position.set(0, 0, 0.12);
  grip.position.set(0, -0.14, -0.1);
  blade.position.set(0, 0.04, 0.9);
  swordGroup.add(guard, grip, blade);
  swordGroup.rotation.set(-0.18, -0.22, 0.36);

  const gunGroup = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.76), materials.gun);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.72), materials.gun);
  const gripGun = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.2), materials.gunGrip);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.28), materials.playerTrim);
  receiver.position.set(0, 0.02, 0.32);
  barrel.position.set(0, 0.04, 0.9);
  gripGun.position.set(0, -0.26, 0.12);
  gripGun.rotation.x = -0.38;
  sight.position.set(0, 0.19, 0.38);
  gunGroup.add(receiver, barrel, gripGun, sight);
  gunGroup.rotation.set(-0.06, 0, 0.08);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.05, 1.34);
  gunGroup.add(muzzle);

  weaponRoot.add(swordGroup, gunGroup);
  weaponRoot.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  player.weaponRoot = weaponRoot;
  player.swordGroup = swordGroup;
  player.gunGroup = gunGroup;
  player.muzzle = muzzle;

  player.mesh.add(body, helm, face, weaponRoot);
  player.mesh.position.copy(worldFromGrid(roomCenter(rooms.spawn).x, roomCenter(rooms.spawn).y));
  actorGroup.add(player.mesh);
  updateWeaponVisibility();
}

function createChest(gx, gy, loot = []) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.68), materials.chest);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.12, 0.72), materials.chestTrim);
  base.position.y = 0.28;
  band.position.y = 0.58;
  base.castShadow = true;
  band.castShadow = true;
  group.add(base, band);
  group.position.copy(worldFromGrid(gx, gy));
  actorGroup.add(group);
  chests.push({ mesh: group, opened: false, loot });
}

function createEnemy(gx, gy, typeName) {
  const type = enemyTypes[typeName];
  const material = new THREE.MeshStandardMaterial({
    color: type.color,
    roughness: 0.55,
    emissive: 0x050505,
  });

  const group = new THREE.Group();
  const scale = type.scale || 1;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(type.radius, 0.9 * scale, 5, 9), material);
  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(0.42 * scale, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xf7f7ff, emissive: 0x7b1b1b, emissiveIntensity: 0.3 })
  );
  body.position.y = 0.8 * scale;
  eye.position.set(0, 1.18 * scale, 0.36 * scale);
  body.castShadow = true;
  group.add(body, eye);
  group.position.copy(worldFromGrid(gx, gy));
  actorGroup.add(group);

  const hpBar = document.createElement('div');
  hpBar.className = type.boss ? 'enemy-hp boss-mark' : 'enemy-hp';
  hpBar.innerHTML = '<div></div>';
  ui.root.appendChild(hpBar);

  const enemy = {
    type,
    mesh: group,
    material,
    hpBar,
    hp: type.hp,
    maxHp: type.hp,
    radius: type.radius,
    attackAt: 0,
    shootAt: 0,
    alerted: false,
    dead: false,
    hurtTimer: 0,
    knockback: new THREE.Vector3(),
  };
  enemies.push(enemy);
  if (type.boss) bossEnemy = enemy;
}

function spawnPickup(type, position, amount = 1) {
  let mesh;

  if (type === 'coin') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16), materials.coin);
    mesh.rotation.x = Math.PI / 2;
  } else if (type === 'potion') {
    mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.25, 4, 8), materials.potion);
  } else if (type === 'ammo') {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.18), materials.ammo);
  } else {
    mesh = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.6), materials.key);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 18), materials.key);
    shaft.position.z = 0.18;
    ring.position.z = -0.18;
    ring.rotation.x = Math.PI / 2;
    mesh.add(shaft, ring);
  }

  mesh.position.copy(position);
  mesh.position.y = 0.55;
  mesh.castShadow = true;
  actorGroup.add(mesh);
  pickups.push({ type, mesh, amount, bob: Math.random() * Math.PI * 2 });
}

function spawnLootBurst(position, gold, extraChance = 0.22) {
  const coinCount = Math.max(1, Math.round(gold / 6));
  for (let i = 0; i < coinCount; i++) {
    const offset = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
    spawnPickup('coin', position.clone().add(offset), Math.ceil(gold / coinCount));
  }
  if (Math.random() < extraChance) spawnPickup('ammo', position.clone().add(new THREE.Vector3(0.55, 0, 0.15)), 6);
  if (Math.random() < extraChance * 0.75) spawnPickup('potion', position.clone().add(new THREE.Vector3(-0.45, 0, -0.2)));
}

function populateDungeon() {
  createChest(18, 4, ['coin', 'ammo']);
  createChest(29, 7, ['coin', 'potion']);
  createChest(7, 16, ['coin', 'coin', 'ammo']);
  createChest(20, 15, ['potion', 'coin']);

  const keyPos = worldFromGrid(30, 17);
  spawnPickup('key', keyPos);

  createEnemy(17, 4, 'scout');
  createEnemy(20, 5, 'arcanist');
  createEnemy(28, 6, 'scout');
  createEnemy(30, 7, 'brute');
  createEnemy(7, 15, 'scout');
  createEnemy(9, 17, 'brute');
  createEnemy(19, 14, 'scout');
  createEnemy(21, 16, 'arcanist');
  createEnemy(29, 16, 'scout');
  createEnemy(31, 18, 'brute');
  createEnemy(16, 24, 'scout');
  createEnemy(19, 24, 'arcanist');
  createEnemy(29, 25, 'boss');
}

function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function planarDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function showMessage(text, duration = 1.45) {
  ui.message.textContent = text;
  ui.message.classList.add('show');
  messageTimer = duration;
}

function updateWeaponVisibility() {
  if (!player.swordGroup || !player.gunGroup) return;
  player.swordGroup.visible = player.weapon === 'sword';
  player.gunGroup.visible = player.weapon === 'gun';
}

function setWeapon(weapon) {
  player.weapon = weapon;
  updateWeaponVisibility();
  showMessage(weapon === 'sword' ? 'Sword ready' : 'Gun ready', 0.75);
}

function tryUsePotion() {
  if (player.potions <= 0 || player.hp >= player.maxHp || gameEnded) return;
  player.potions--;
  player.hp = Math.min(player.maxHp, player.hp + 48);
  showMessage('Potion used', 1);
}

function startReload(now) {
  if (player.weapon !== 'gun' || player.reloadDoneAt || player.clip >= player.maxClip || player.reserve <= 0) return;
  player.reloadDoneAt = now + 0.9;
  showMessage('Reloading', 0.65);
}

function finishReloadIfReady(now) {
  if (!player.reloadDoneAt || now < player.reloadDoneAt) return;
  const need = player.maxClip - player.clip;
  const loaded = Math.min(need, player.reserve);
  player.clip += loaded;
  player.reserve -= loaded;
  player.reloadDoneAt = 0;
}

function updateAim() {
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(floorPlane, aimPoint);
  aimDir.copy(aimPoint).sub(player.mesh.position);
  aimDir.y = 0;
  if (aimDir.lengthSq() < 0.01) aimDir.set(0, 0, -1);
  aimDir.normalize();
  player.mesh.rotation.y = Math.atan2(aimDir.x, aimDir.z);

  const screen = aimPoint.clone().project(camera);
  ui.reticle.style.left = `${(screen.x * 0.5 + 0.5) * innerWidth}px`;
  ui.reticle.style.top = `${(-screen.y * 0.5 + 0.5) * innerHeight}px`;
}

function hasLineOfSight(a, b) {
  const distance = a.distanceTo(b);
  const steps = Math.ceil(distance / (TILE * 0.28));
  const probe = new THREE.Vector3();

  for (let i = 1; i < steps; i++) {
    probe.lerpVectors(a, b, i / steps);
    const grid = gridFromWorld(probe);
    if (isBlocked(grid.x, grid.y)) return false;
  }

  return true;
}

function resolveCollisions(position, radius) {
  const center = gridFromWorld(position);

  for (let y = center.y - 1; y <= center.y + 1; y++) {
    for (let x = center.x - 1; x <= center.x + 1; x++) {
      if (!isBlocked(x, y)) continue;

      const tileCenter = worldFromGrid(x, y);
      const minX = tileCenter.x - TILE / 2;
      const maxX = tileCenter.x + TILE / 2;
      const minZ = tileCenter.z - TILE / 2;
      const maxZ = tileCenter.z + TILE / 2;
      const closestX = Math.max(minX, Math.min(position.x, maxX));
      const closestZ = Math.max(minZ, Math.min(position.z, maxZ));
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq > 0 && distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        position.x += (dx / dist) * push;
        position.z += (dz / dist) * push;
      }
    }
  }
}

function moveWithCollision(position, delta, radius) {
  position.x += delta.x;
  resolveCollisions(position, radius);
  position.z += delta.z;
  resolveCollisions(position, radius);
}

function cameraForwardVector() {
  return new THREE.Vector3(-Math.sin(cameraState.yaw), 0, -Math.cos(cameraState.yaw)).normalize();
}

function cameraRightVector() {
  return new THREE.Vector3(Math.cos(cameraState.yaw), 0, -Math.sin(cameraState.yaw)).normalize();
}

function updatePlayer(dt, now) {
  if (gameEnded) return;

  const wish = new THREE.Vector3();
  const forward = cameraForwardVector();
  const right = cameraRightVector();
  if (keys.w) wish.add(forward);
  if (keys.s) wish.sub(forward);
  if (keys.d) wish.add(right);
  if (keys.a) wish.sub(right);

  if (wish.lengthSq() > 0) wish.normalize();

  const sprinting = keys.shift && player.stamina > 1 && wish.lengthSq() > 0;
  const speed = sprinting ? 6.9 : 4.7;

  if (sprinting) {
    player.stamina = Math.max(0, player.stamina - 24 * dt);
  } else {
    player.stamina = Math.min(player.maxStamina, player.stamina + 19 * dt);
  }

  if (dodgeQueued && now > player.dodgeReadyAt && player.stamina >= 24) {
    const direction = wish.lengthSq() > 0 ? wish : aimDir.clone();
    player.stamina -= 24;
    player.dodgeReadyAt = now + 0.72;
    player.invulnerableUntil = now + 0.23;
    player.dodgeVelocity.copy(direction).multiplyScalar(13.5);
  }
  dodgeQueued = false;

  const movement = wish.multiplyScalar(speed * dt);
  movement.add(player.dodgeVelocity.clone().multiplyScalar(dt));
  moveWithCollision(player.mesh.position, movement, player.radius);
  player.dodgeVelocity.multiplyScalar(Math.pow(0.03, dt));

  if (player.hp <= player.maxHp * 0.28 && player.potions > 0) {
    ui.stats.classList.add('danger');
  } else {
    ui.stats.classList.remove('danger');
  }

  maybeOpenGate();
  openNearbyChests();
}

function maybeOpenGate() {
  if (gateOpen || !player.hasKey) return;

  const gatePos = worldFromGrid(23, 24);
  if (player.mesh.position.distanceTo(gatePos) < 3.1) {
    gateOpen = true;
    showMessage('The gate unlocks', 1.4);
    rebuildPathField();
  }
}

function openNearbyChests() {
  for (const chest of chests) {
    if (chest.opened || chest.mesh.position.distanceTo(player.mesh.position) > 1.45) continue;
    chest.opened = true;
    chest.mesh.rotation.x = -0.16;
    showMessage('Chest opened', 0.8);

    chest.loot.forEach((type, index) => {
      const angle = (index / Math.max(1, chest.loot.length)) * Math.PI * 2;
      const offset = new THREE.Vector3(Math.cos(angle) * 0.75, 0, Math.sin(angle) * 0.75);
      spawnPickup(type, chest.mesh.position.clone().add(offset), type === 'coin' ? 12 : 1);
    });
  }
}

function tryAttack(now) {
  if (gameEnded || player.reloadDoneAt) return;
  if (now < player.attackReadyAt) return;

  if (player.weapon === 'sword') {
    player.attackReadyAt = now + 0.36;
    meleeAttack();
    return;
  }

  if (player.clip <= 0) {
    startReload(now);
    return;
  }

  player.attackReadyAt = now + 0.42;
  player.clip--;
  player.shotTimer = 0.18;
  const origin = new THREE.Vector3();
  if (player.muzzle) {
    player.muzzle.getWorldPosition(origin);
  } else {
    origin.copy(player.mesh.position).add(new THREE.Vector3(0, 0.85, 0));
  }
  fireProjectile(origin, aimDir, false, player.gunDamage);
}

function meleeAttack() {
  player.swingTimer = 0.28;
  createMeleeArc();
  const range = 2.35;
  const arc = Math.cos(0.88);

  for (const enemy of enemies) {
    if (enemy.dead) continue;
    const toEnemy = enemy.mesh.position.clone().sub(player.mesh.position);
    toEnemy.y = 0;
    const distance = toEnemy.length();
    if (distance > range + enemy.radius) continue;
    toEnemy.normalize();
    if (toEnemy.dot(aimDir) < arc) continue;
    if (!hasLineOfSight(player.mesh.position, enemy.mesh.position)) continue;
    damageEnemy(enemy, player.swordDamage, aimDir, 5);
  }
}

function createMeleeArc() {
  const floorShape = new THREE.Shape();
  const radius = 2.35;
  const start = -0.85;
  const end = 0.85;
  floorShape.moveTo(0, 0);
  for (let i = 0; i <= 12; i++) {
    const angle = start + (end - start) * (i / 12);
    floorShape.lineTo(Math.sin(angle) * radius, Math.cos(angle) * radius);
  }
  floorShape.lineTo(0, 0);

  const floorGeometry = new THREE.ShapeGeometry(floorShape);
  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xf6e4a4, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const floorArc = new THREE.Mesh(floorGeometry, floorMaterial);
  floorArc.rotation.x = -Math.PI / 2;
  floorArc.rotation.z = -player.mesh.rotation.y;
  floorArc.position.copy(player.mesh.position);
  floorArc.position.y = 0.08;
  effectGroup.add(floorArc);
  transientEffects.push({ mesh: floorArc, material: floorMaterial, ttl: 0.16, maxTtl: 0.16, baseOpacity: 0.3 });

  const slashShape = new THREE.Shape();
  const outer = 1.15;
  const inner = 0.72;
  const slashStart = -1.05;
  const slashEnd = 1.05;
  for (let i = 0; i <= 16; i++) {
    const angle = slashStart + (slashEnd - slashStart) * (i / 16);
    const x = Math.sin(angle) * outer;
    const y = Math.cos(angle) * 0.68;
    if (i === 0) slashShape.moveTo(x, y);
    else slashShape.lineTo(x, y);
  }
  for (let i = 16; i >= 0; i--) {
    const angle = slashStart + (slashEnd - slashStart) * (i / 16);
    slashShape.lineTo(Math.sin(angle) * inner, Math.cos(angle) * 0.42);
  }
  slashShape.closePath();

  const slashGeometry = new THREE.ShapeGeometry(slashShape);
  const slashMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff0a6,
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
  });
  const slash = new THREE.Mesh(slashGeometry, slashMaterial);
  slash.position.copy(player.mesh.position).add(aimDir.clone().multiplyScalar(1.2));
  slash.position.y = 1.18;
  slash.rotation.y = player.mesh.rotation.y;
  effectGroup.add(slash);
  transientEffects.push({ mesh: slash, material: slashMaterial, ttl: 0.18, maxTtl: 0.18, baseOpacity: 0.82 });
}

function fireProjectile(origin, direction, hostile, damage) {
  const startPosition = origin.clone();
  const material = new THREE.MeshStandardMaterial({
    color: hostile ? 0xb879ff : 0x83f7d6,
    emissive: hostile ? 0x3d145d : 0x063d36,
    emissiveIntensity: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), material);
  mesh.position.copy(startPosition);
  mesh.rotation.y = Math.atan2(direction.x, direction.z);
  effectGroup.add(mesh);
  createMuzzleFlash(startPosition, direction, hostile);
  createBulletTrace(startPosition, direction, hostile);

  const store = hostile ? enemyProjectiles : projectiles;
  store.push({
    mesh,
    material,
    direction: direction.clone().normalize(),
    damage,
    ttl: hostile ? 2.4 : 1.7,
    speed: hostile ? 7.8 : 12.5,
    trailTimer: 0.04,
  });
}

function createMuzzleFlash(origin, direction, hostile) {
  const color = hostile ? 0xb879ff : 0xffd86a;
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(hostile ? 0.16 : 0.2, 12, 8), material);
  flash.position.copy(origin).add(direction.clone().multiplyScalar(0.24));
  effectGroup.add(flash);
  transientEffects.push({ mesh: flash, material, ttl: 0.08, maxTtl: 0.08, baseOpacity: 0.95 });
}

function createBulletTrace(origin, direction, hostile) {
  const length = hostile ? 2.5 : 5.2;
  const material = new THREE.MeshBasicMaterial({
    color: hostile ? 0xc99aff : 0x8ff8ff,
    transparent: true,
    opacity: hostile ? 0.58 : 0.75,
  });
  const trace = new THREE.Mesh(new THREE.BoxGeometry(hostile ? 0.055 : 0.07, hostile ? 0.055 : 0.07, length), material);
  trace.position.copy(origin).add(direction.clone().multiplyScalar(length / 2 + 0.35));
  trace.rotation.y = Math.atan2(direction.x, direction.z);
  effectGroup.add(trace);
  transientEffects.push({ mesh: trace, material, ttl: 0.14, maxTtl: 0.14, baseOpacity: hostile ? 0.58 : 0.75 });
}

function damageEnemy(enemy, amount, direction, knockback = 2.5) {
  if (enemy.dead) return;
  enemy.hp -= amount;
  enemy.hurtTimer = 0.14;
  enemy.alerted = true;
  enemy.knockback.add(direction.clone().multiplyScalar(knockback / (enemy.type.boss ? 2.5 : 1)));

  if (enemy.hp <= 0) defeatEnemy(enemy);
}

function defeatEnemy(enemy) {
  enemy.dead = true;
  enemy.hpBar.remove();
  actorGroup.remove(enemy.mesh);
  player.xp += enemy.type.xp;
  spawnLootBurst(enemy.mesh.position.clone(), enemy.type.gold, enemy.type.boss ? 0 : 0.28);

  if (enemy.type.boss) {
    endGame(true);
  } else {
    showMessage(`+${enemy.type.xp} XP`, 0.65);
  }
}

function damagePlayer(amount, sourcePosition, now) {
  if (gameEnded || now < player.invulnerableUntil) return;
  player.hp -= amount;
  player.invulnerableUntil = now + 0.42;
  player.dodgeVelocity.add(player.mesh.position.clone().sub(sourcePosition).setY(0).normalize().multiplyScalar(4));
  showMessage('Hit', 0.45);

  if (player.hp <= 0) {
    player.hp = 0;
    endGame(false);
  }
}

function rebuildPathField() {
  pathField = new Map();
  const start = gridFromWorld(player.mesh.position);
  if (isBlocked(start.x, start.y)) return;

  const queue = [start];
  pathField.set(keyOf(start.x, start.y), 0);

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const distance = pathField.get(keyOf(current.x, current.y));
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const next of neighbors) {
      const id = keyOf(next.x, next.y);
      if (pathField.has(id) || isBlocked(next.x, next.y)) continue;
      pathField.set(id, distance + 1);
      queue.push(next);
    }
  }
}

function bestPathDirection(enemy) {
  const grid = gridFromWorld(enemy.mesh.position);
  const currentDistance = pathField.get(keyOf(grid.x, grid.y));
  if (currentDistance === undefined) return null;

  let best = null;
  let bestDistance = currentDistance;
  const neighbors = [
    { x: grid.x + 1, y: grid.y },
    { x: grid.x - 1, y: grid.y },
    { x: grid.x, y: grid.y + 1 },
    { x: grid.x, y: grid.y - 1 },
  ];

  for (const next of neighbors) {
    const distance = pathField.get(keyOf(next.x, next.y));
    if (distance === undefined || distance >= bestDistance) continue;
    bestDistance = distance;
    best = next;
  }

  if (!best) return null;
  return worldFromGrid(best.x, best.y).sub(enemy.mesh.position).setY(0).normalize();
}

function updateEnemies(dt, now) {
  if (now > pathRefreshAt) {
    rebuildPathField();
    pathRefreshAt = now + 0.22;
  }

  for (const enemy of enemies) {
    if (enemy.dead) continue;

    if (enemy.hurtTimer > 0) {
      enemy.hurtTimer -= dt;
      enemy.material.emissive.setHex(0x451212);
    } else {
      enemy.material.emissive.setHex(0x050505);
    }

    const knock = enemy.knockback.clone().multiplyScalar(dt);
    moveWithCollision(enemy.mesh.position, knock, enemy.radius);
    enemy.knockback.multiplyScalar(Math.pow(0.02, dt));

    const toPlayer = player.mesh.position.clone().sub(enemy.mesh.position);
    toPlayer.y = 0;
    const distance = toPlayer.length();
    const seesPlayer = distance < enemy.type.aggro && hasLineOfSight(enemy.mesh.position, player.mesh.position);
    if (seesPlayer) enemy.alerted = true;

    if (!enemy.alerted) {
      enemy.mesh.rotation.y += Math.sin(now * 1.5 + enemy.mesh.position.x) * dt * 0.15;
      continue;
    }

    const directionToPlayer = toPlayer.lengthSq() > 0 ? toPlayer.normalize() : new THREE.Vector3(0, 0, 1);
    enemy.mesh.rotation.y = Math.atan2(directionToPlayer.x, directionToPlayer.z);

    if (enemy.type.ranged && distance < enemy.type.attackRange && hasLineOfSight(enemy.mesh.position, player.mesh.position)) {
      if (distance < 4.1) {
        const retreat = directionToPlayer.clone().multiplyScalar(-enemy.type.speed * 0.45 * dt);
        moveWithCollision(enemy.mesh.position, retreat, enemy.radius);
      }
      if (now > enemy.shootAt) {
        enemy.shootAt = now + enemy.type.attackCooldown;
        fireProjectile(enemy.mesh.position.clone().add(new THREE.Vector3(0, 0.9, 0)), directionToPlayer, true, enemy.type.damage);
      }
      continue;
    }

    if (distance > enemy.type.attackRange * 0.82) {
      const chaseDir = seesPlayer ? directionToPlayer : bestPathDirection(enemy);
      if (chaseDir) {
        moveWithCollision(enemy.mesh.position, chaseDir.multiplyScalar(enemy.type.speed * dt), enemy.radius);
      }
    } else if (now > enemy.attackAt) {
      enemy.attackAt = now + enemy.type.attackCooldown;
      damagePlayer(enemy.type.damage, enemy.mesh.position, now);
    }
  }

  separateEnemies();
}

function separateEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.dead) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.dead) continue;
      const delta = a.mesh.position.clone().sub(b.mesh.position).setY(0);
      const minDistance = a.radius + b.radius + 0.12;
      const distance = delta.length();
      if (distance <= 0 || distance >= minDistance) continue;
      const push = delta.normalize().multiplyScalar((minDistance - distance) * 0.5);
      moveWithCollision(a.mesh.position, push, a.radius);
      moveWithCollision(b.mesh.position, push.multiplyScalar(-1), b.radius);
    }
  }
}

function updateProjectiles(dt, now) {
  updateProjectileSet(projectiles, dt, (projectile) => {
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (planarDistance(enemy.mesh.position, projectile.mesh.position) > enemy.radius + 0.32) continue;
      damageEnemy(enemy, projectile.damage, projectile.direction, 4.2);
      return true;
    }
    return false;
  }, false);

  updateProjectileSet(enemyProjectiles, dt, (projectile) => {
    if (planarDistance(player.mesh.position, projectile.mesh.position) <= player.radius + 0.32) {
      damagePlayer(projectile.damage, projectile.mesh.position, now);
      return true;
    }
    return false;
  }, true);
}

function updateProjectileSet(store, dt, hitTest, hostile) {
  for (let i = store.length - 1; i >= 0; i--) {
    const projectile = store[i];
    projectile.ttl -= dt;
    projectile.mesh.position.addScaledVector(projectile.direction, projectile.speed * dt);
    projectile.mesh.rotation.y = Math.atan2(projectile.direction.x, projectile.direction.z);
    projectile.trailTimer -= dt;
    if (projectile.trailTimer <= 0) {
      projectile.trailTimer = 0.045;
      createBulletTrace(projectile.mesh.position, projectile.direction, hostile);
    }

    const grid = gridFromWorld(projectile.mesh.position);
    const hitWall = isBlocked(grid.x, grid.y);
    const hitActor = !hitWall && hitTest(projectile);

    if (projectile.ttl <= 0 || hitWall || hitActor) {
      effectGroup.remove(projectile.mesh);
      projectile.material.dispose();
      store.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.bob += dt * 3.2;
    pickup.mesh.position.y = 0.48 + Math.sin(pickup.bob) * 0.1;
    pickup.mesh.rotation.y += dt * 2.2;

    if (pickup.mesh.position.distanceTo(player.mesh.position) > 1.1) continue;

    if (pickup.type === 'coin') {
      player.gold += pickup.amount;
    } else if (pickup.type === 'ammo') {
      player.reserve = Math.min(player.maxReserve, player.reserve + 8);
      showMessage('Ammo stocked', 0.75);
    } else if (pickup.type === 'potion') {
      if (player.potions < player.maxPotions) {
        player.potions++;
        showMessage('Potion found', 0.75);
      } else {
        player.hp = Math.min(player.maxHp, player.hp + 24);
      }
    } else if (pickup.type === 'key') {
      player.hasKey = true;
      showMessage('Gate key acquired', 1.25);
    }

    actorGroup.remove(pickup.mesh);
    pickups.splice(i, 1);
  }
}

function levelUpIfNeeded() {
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.level++;
    player.xpNext = Math.floor(player.xpNext * 1.28);
    player.maxHp += 14;
    player.hp = player.maxHp;
    player.maxStamina += 8;
    player.stamina = player.maxStamina;
    player.swordDamage += 4;
    player.gunDamage += 3;
    player.maxReserve += 4;
    showMessage(`Level ${player.level}`, 1);
  }
}

function updateWeaponAnimation(dt) {
  if (!player.weaponRoot) return;

  const moving = keys.w || keys.a || keys.s || keys.d;
  player.weaponBob += dt * (moving ? 11 : 4);
  const bob = Math.sin(player.weaponBob) * (moving ? 0.045 : 0.018);
  player.weaponRoot.position.set(0.38, 1.05 + bob, 0.36);
  player.weaponRoot.rotation.set(0, 0, Math.sin(player.weaponBob * 0.5) * 0.025);

  player.swingTimer = Math.max(0, player.swingTimer - dt);
  player.shotTimer = Math.max(0, player.shotTimer - dt);

  const swingProgress = player.swingTimer > 0 ? 1 - player.swingTimer / 0.28 : 0;
  const swing = Math.sin(swingProgress * Math.PI);
  if (player.swordGroup) {
    player.swordGroup.rotation.x = -0.18 - swing * 0.48;
    player.swordGroup.rotation.y = -0.62 + swingProgress * 1.42;
    player.swordGroup.rotation.z = 0.42 - swing * 0.24;
    player.swordGroup.position.set(0.08 * swing, 0, -0.08 * swing);
  }

  const recoilProgress = player.shotTimer > 0 ? player.shotTimer / 0.18 : 0;
  const recoil = Math.sin(recoilProgress * Math.PI);
  if (player.gunGroup) {
    player.gunGroup.position.set(0, 0, -0.22 * recoil);
    player.gunGroup.rotation.x = -0.06 - 0.28 * recoil;
    player.gunGroup.rotation.y = 0;
    player.gunGroup.rotation.z = 0.08;
  }
}

function updateGate(dt) {
  if (!gateOpen || !gateGroup) return;
  gateGroup.position.y = THREE.MathUtils.damp(gateGroup.position.y, -2.9, 6, dt);
}

function updateEffects(dt) {
  for (let i = transientEffects.length - 1; i >= 0; i--) {
    const effect = transientEffects[i];
    effect.ttl -= dt;
    effect.material.opacity = Math.max(0, effect.ttl / effect.maxTtl) * (effect.baseOpacity ?? 0.34);
    if (effect.ttl > 0) continue;
    effectGroup.remove(effect.mesh);
    effect.mesh.geometry?.dispose?.();
    effect.material.dispose();
    transientEffects.splice(i, 1);
  }
}

function updateCamera(dt) {
  if (keys.z || keys.arrowleft) cameraState.yaw += dt * 2.1;
  if (keys.x || keys.arrowright) cameraState.yaw -= dt * 2.1;

  const desired = player.mesh.position.clone().add(new THREE.Vector3(
    Math.sin(cameraState.yaw) * cameraState.distance,
    cameraState.height,
    Math.cos(cameraState.yaw) * cameraState.distance
  ));
  const target = player.mesh.position.clone().add(new THREE.Vector3(0, 1.05, 0));
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  camera.lookAt(target);
}

function updateEnemyHealthBars() {
  for (const enemy of enemies) {
    if (enemy.dead) continue;

    const pos = enemy.mesh.position.clone().add(new THREE.Vector3(0, enemy.type.boss ? 2.8 : 2.1, 0));
    const screen = pos.project(camera);
    const visible = screen.z > -1 && screen.z < 1;
    enemy.hpBar.style.display = visible ? 'block' : 'none';
    if (!visible) continue;
    enemy.hpBar.style.left = `${(screen.x * 0.5 + 0.5) * innerWidth - 28}px`;
    enemy.hpBar.style.top = `${(-screen.y * 0.5 + 0.5) * innerHeight - 12}px`;
    enemy.hpBar.firstElementChild.style.width = `${clamp01(enemy.hp / enemy.maxHp) * 100}%`;
  }
}

function currentRoomName() {
  const grid = gridFromWorld(player.mesh.position);
  return roomForTile.get(keyOf(grid.x, grid.y)) || 'Dungeon';
}

function updateUI() {
  ui.hpBar.style.width = `${clamp01(player.hp / player.maxHp) * 100}%`;
  ui.staminaBar.style.width = `${clamp01(player.stamina / player.maxStamina) * 100}%`;
  ui.xpBar.style.width = `${clamp01(player.xp / player.xpNext) * 100}%`;
  ui.hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  ui.staminaText.textContent = `${Math.ceil(player.stamina)}/${player.maxStamina}`;
  ui.xpText.textContent = `${player.xp}/${player.xpNext}`;
  ui.stats.textContent = `Lv ${player.level}  Gold ${player.gold}  Potions ${player.potions}/${player.maxPotions}  Key ${player.hasKey ? 'held' : 'missing'}`;
  ui.weaponName.textContent = player.weapon === 'sword' ? 'Sword' : 'Gun';
  ui.weaponMeta.textContent =
    player.weapon === 'sword'
      ? `Damage ${player.swordDamage}`
      : `${player.clip}/${player.maxClip} loaded  ${player.reserve} reserve`;
  ui.objective.textContent = objectiveText();
  ui.room.textContent = currentRoomName();

  const bossVisible = bossEnemy && !bossEnemy.dead && (gateOpen || bossEnemy.alerted);
  ui.bossPanel.classList.toggle('hidden', !bossVisible);
  if (bossVisible) {
    ui.bossName.textContent = bossEnemy.type.name;
    ui.bossHpBar.style.width = `${clamp01(bossEnemy.hp / bossEnemy.maxHp) * 100}%`;
  }
}

function objectiveText() {
  if (gameEnded) return 'Run complete';
  if (bossEnemy?.dead) return 'Dungeon cleared';
  if (gateOpen) return 'Break the final guard';
  if (player.hasKey) return 'Reach the sealed gate';
  return 'Find the gate key';
}

function drawMinimap() {
  const ctx = minimapCtx;
  const { width, height } = ui.minimap;
  const scale = Math.min(width / MAP_W, height / MAP_H);
  const ox = (width - MAP_W * scale) / 2;
  const oy = (height - MAP_H * scale) / 2;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#10151f';
  ctx.fillRect(0, 0, width, height);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (map[y][x] === WALL) continue;
      ctx.fillStyle = map[y][x] === GATE && !gateOpen ? '#caa047' : '#38404b';
      ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(1, scale - 0.35), Math.max(1, scale - 0.35));
    }
  }

  for (const pickup of pickups) {
    if (pickup.type !== 'key') continue;
    const g = gridFromWorld(pickup.mesh.position);
    ctx.fillStyle = '#f7c948';
    ctx.fillRect(ox + g.x * scale - 1, oy + g.y * scale - 1, scale + 2, scale + 2);
  }

  ctx.fillStyle = '#e65d5d';
  for (const enemy of enemies) {
    if (enemy.dead || !enemy.alerted) continue;
    const g = gridFromWorld(enemy.mesh.position);
    ctx.fillRect(ox + g.x * scale, oy + g.y * scale, Math.max(2, scale), Math.max(2, scale));
  }

  const playerGrid = gridFromWorld(player.mesh.position);
  ctx.fillStyle = '#78b7ff';
  ctx.beginPath();
  ctx.arc(ox + (playerGrid.x + 0.5) * scale, oy + (playerGrid.y + 0.5) * scale, Math.max(2.2, scale * 0.75), 0, Math.PI * 2);
  ctx.fill();
}

function updateMessage(dt) {
  if (messageTimer <= 0) return;
  messageTimer -= dt;
  if (messageTimer <= 0) {
    ui.message.classList.remove('show');
    ui.message.textContent = '';
  }
}

function endGame(won) {
  gameEnded = true;
  ui.overlay.classList.remove('hidden');
  ui.overlayTitle.textContent = won ? 'Dungeon Cleared' : 'Run Lost';
  ui.overlaySubtitle.textContent = won
    ? `Level ${player.level} with ${player.gold} gold recovered.`
    : `Level ${player.level} with ${player.gold} gold recovered.`;
  ui.restartButton.textContent = won ? 'Run Again' : 'Retry';
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const now = performance.now() / 1000;

  updateAim();
  finishReloadIfReady(now);
  if (mouseDown) tryAttack(now);
  updatePlayer(dt, now);
  updateEnemies(dt, now);
  updateProjectiles(dt, now);
  updatePickups(dt);
  levelUpIfNeeded();
  updateWeaponAnimation(dt);
  updateGate(dt);
  updateEffects(dt);
  updateCamera(dt);
  updateEnemyHealthBars();
  updateUI();
  drawMinimap();
  updateMessage(dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

addEventListener('keydown', (event) => {
  keys[event.key.toLowerCase()] = true;

  if (event.code === 'Space') {
    event.preventDefault();
    dodgeQueued = true;
  }

  if (event.key === '1') setWeapon('sword');
  if (event.key === '2') setWeapon('gun');
  if (event.key.toLowerCase() === 'q') tryUsePotion();
  if (event.key.toLowerCase() === 'r') startReload(performance.now() / 1000);
});

addEventListener('keyup', (event) => {
  keys[event.key.toLowerCase()] = false;
});

addEventListener('pointermove', (event) => {
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  if (orbitDrag) {
    cameraState.yaw -= event.movementX * 0.007;
  }
});

addEventListener('pointerdown', (event) => {
  if (event.button === 2) {
    orbitDrag = true;
    return;
  }
  if (event.button === 0) mouseDown = true;
});

addEventListener('pointerup', (event) => {
  if (event.button === 0) mouseDown = false;
  if (event.button === 2) orbitDrag = false;
});

addEventListener('wheel', (event) => {
  setWeapon(player.weapon === 'sword' ? 'gun' : 'sword');
  event.preventDefault();
}, { passive: false });

addEventListener('contextmenu', (event) => event.preventDefault());
addEventListener('resize', resize);
ui.restartButton.addEventListener('click', () => location.reload());

scene.add(new THREE.HemisphereLight(0x9fb6d8, 0x15171f, 1.05));
const keyLight = new THREE.DirectionalLight(0xfff3d3, 1.1);
keyLight.position.set(-8, 18, 12);
keyLight.castShadow = true;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 45;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

buildMap();
createDungeonMesh();
createPlayer();
populateDungeon();
resize();
rebuildPathField();
camera.position.copy(player.mesh.position.clone().add(new THREE.Vector3(
  Math.sin(cameraState.yaw) * cameraState.distance,
  cameraState.height,
  Math.cos(cameraState.yaw) * cameraState.distance
)));
camera.lookAt(player.mesh.position.x, 1.05, player.mesh.position.z);
showMessage('Find the gate key', 1.4);
animate();
