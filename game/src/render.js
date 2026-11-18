// Coral Bay Heat — everything drawn, nothing simulated.
//
// The renderer is a pure reader: it walks the world state each frame and
// paints terrain, buildings, vehicles, people, effects, the HUD with its
// live minimap, and whichever full screen the shell is showing (title,
// how-to, pause, busted, wasted, ending). It never writes back into the
// world, which is what lets screenshot mode reuse it verbatim.

import { CAR_CLASSES, CITY, FONT, PALETTE, VIEW, blockRect, hRoadY, vRoadX } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOW = 'how';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_ENDING = 'ending';

// ------------------------------------------------------------ primitives

/** Path of a rectangle with rounded corners (not filled — caller fills). */
function roundedBox(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Path of a five-pointed star centred on (x, y). */
function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Greedy word wrap: split text into lines no wider than maxWidth. */
function splitLines(ctx, text, maxWidth) {
  const lines = [];
  let current = '';
  for (const word of String(text).split(' ')) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = trial;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** The translucent dark backing used behind every HUD cluster. */
function backingPanel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  roundedBox(ctx, x, y, w, h, 10);
  ctx.fill();
}

// ------------------------------------------------------------ terrain

function paintSeaAndSand(ctx, world) {
  const { time } = world;
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(CITY.beachX, 0, CITY.waterX - CITY.beachX, CITY.height);
  ctx.fillStyle = PALETTE.sandWet;
  ctx.fillRect(CITY.waterX - 26, 0, 26, CITY.height);
  const gradient = ctx.createLinearGradient(CITY.waterX, 0, CITY.width, 0);
  gradient.addColorStop(0, PALETTE.water);
  gradient.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = gradient;
  ctx.fillRect(CITY.waterX, 0, CITY.width - CITY.waterX, CITY.height);
  // Two foam lines crawling along the shoreline.
  ctx.strokeStyle = PALETTE.waterFoam;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.65;
  for (let k = 0; k < 2; k += 1) {
    ctx.beginPath();
    const baseX = CITY.waterX + 6 + k * 15;
    for (let y = 0; y <= CITY.height; y += 40) {
      const x = baseX + Math.sin(y * 0.02 + time * 1.4 + k * 2.1) * 5;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function paintStreets(ctx) {
  ctx.fillStyle = PALETTE.asphalt;
  for (let i = 0; i < CITY.vRoads; i += 1) {
    ctx.fillRect(i * CITY.pitch, 0, CITY.roadW, CITY.height);
  }
  for (let j = 0; j < CITY.hRoads; j += 1) {
    ctx.fillRect(0, j * CITY.pitch, CITY.beachX + 60, CITY.roadW);
  }
  // The promenade strip between the last street and the sand.
  ctx.fillStyle = PALETTE.sidewalk;
  ctx.fillRect(CITY.beachX - 48, 0, 48, CITY.height);

  // Centre dashes, skipping the crossings themselves.
  ctx.fillStyle = PALETTE.laneMark;
  for (let i = 0; i < CITY.vRoads; i += 1) {
    for (let y = 8; y < CITY.height; y += 44) {
      if (y % CITY.pitch < CITY.roadW - 6 && (y + 22) % CITY.pitch > 6) continue;
      ctx.fillRect(vRoadX(i) - 2, y, 4, 22);
    }
  }
  for (let j = 0; j < CITY.hRoads; j += 1) {
    for (let x = 8; x < CITY.beachX; x += 44) {
      if (x % CITY.pitch < CITY.roadW - 6 && (x + 22) % CITY.pitch > 6) continue;
      ctx.fillRect(x, hRoadY(j) - 2, 22, 4);
    }
  }

  // Zebra stripes on all four arms of every crossing.
  ctx.fillStyle = PALETTE.crosswalk;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < CITY.vRoads; i += 1) {
    for (let j = 0; j < CITY.hRoads; j += 1) {
      const cx = vRoadX(i);
      const cy = hRoadY(j);
      for (let s = 0; s < 3; s += 1) {
        ctx.fillRect(cx - 40 + s * 30, cy - CITY.roadW / 2 + 4, 18, 9);
        ctx.fillRect(cx - 40 + s * 30, cy + CITY.roadW / 2 - 13, 18, 9);
        ctx.fillRect(cx - CITY.roadW / 2 + 4, cy - 40 + s * 30, 9, 18);
        ctx.fillRect(cx + CITY.roadW / 2 - 13, cy - 40 + s * 30, 9, 18);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function paintBlocks(ctx) {
  for (let i = 0; i < CITY.vRoads - 1; i += 1) {
    for (let j = 0; j < CITY.hRoads - 1; j += 1) {
      const cell = blockRect(i, j);
      if (i === 2 && j === 1) {
        // The park: open lawn with an ornamental pond.
        ctx.fillStyle = PALETTE.park;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        ctx.fillStyle = PALETTE.pond;
        ctx.beginPath();
        ctx.ellipse(cell.x + cell.w / 2, cell.y + cell.h / 2, 52, 34, 0.4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
        ctx.fillStyle = PALETTE.grassDark;
        ctx.fillRect(cell.x + 4, cell.y + 4, cell.w - 8, 3);
      }
    }
  }
}

function paintBuildings(ctx, world) {
  for (const b of world.city.buildings) {
    // A soft drop shadow offset by the building's height.
    ctx.fillStyle = 'rgba(40, 30, 10, 0.20)';
    ctx.fillRect(b.x + b.height * 0.5, b.y + b.height * 0.34, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(60, 50, 30, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    // Rooftop clutter, placed by a position hash so it never flickers.
    ctx.fillStyle = 'rgba(90, 85, 70, 0.5)';
    const clutter = b.roofProps || 0;
    for (let k = 0; k < clutter; k += 1) {
      const hx = b.x + 18 + ((b.x * 7 + b.y * 13 + k * 61) % Math.max(20, b.w - 60));
      const hy = b.y + 16 + ((b.x * 3 + b.y * 11 + k * 47) % Math.max(20, b.h - 52));
      ctx.fillRect(hx, hy, 20, 14);
    }
    if (b.kind === 'hospital') {
      ctx.fillStyle = '#e23b3b';
      const cx = b.x + b.w / 2;
      const cy = b.y + 30;
      ctx.fillRect(cx - 5, cy - 16, 10, 32);
      ctx.fillRect(cx - 16, cy - 5, 32, 10);
    }
    if (b.kind === 'police') {
      ctx.fillStyle = PALETTE.copBlue;
      ctx.fillRect(b.x, b.y, b.w, 16);
    }
    if (b.name) {
      ctx.font = `700 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(38, 42, 50, 0.88)';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h - 12);
    }
  }
}

function paintPalms(ctx, world) {
  for (const tree of world.city.trees) {
    const s = tree.s || 1;
    ctx.fillStyle = 'rgba(40, 30, 10, 0.18)';
    ctx.beginPath();
    ctx.ellipse(tree.x + 7 * s, tree.y + 6 * s, 15 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(tree.x - 2, tree.y - 2, 4, 4);
    ctx.fillStyle = '#3f9e4d';
    ctx.beginPath();
    ctx.arc(tree.x, tree.y, 14 * s, 0, Math.PI * 2);
    ctx.arc(tree.x - 9 * s, tree.y + 4 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(tree.x + 9 * s, tree.y + 3 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57bb63';
    ctx.beginPath();
    ctx.arc(tree.x - 3 * s, tree.y - 4 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function paintTerrain(ctx, world) {
  const { camera, city } = world;
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);
  paintSeaAndSand(ctx, world);
  paintStreets(ctx);
  paintBlocks(ctx);
  // The marina pier: planks running out over the water.
  const pier = city.pier;
  ctx.fillStyle = PALETTE.pier;
  ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = pier.x + 12; x < pier.x + pier.w; x += 24) {
    ctx.fillRect(x, pier.y, 3, pier.h);
  }
  paintBuildings(ctx, world);
  paintPalms(ctx, world);
  ctx.restore();
}

// ------------------------------------------------------------ actors

function paintVehicle(ctx, world, car) {
  const spec = CAR_CLASSES[car.cls];
  const L = spec.length;
  const W = spec.width;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = 'rgba(20, 16, 8, 0.25)';
  roundedBox(ctx, -L / 2 + 4, -W / 2 + 5, L, W, 6);
  ctx.fill();
  ctx.rotate(car.angle);

  // Tyres at the corners.
  ctx.fillStyle = '#15161a';
  const axleX = L / 2 - 11;
  const trackY = W / 2 - 2;
  ctx.fillRect(-axleX - 4, -trackY - 2, 9, 4);
  ctx.fillRect(axleX - 5, -trackY - 2, 9, 4);
  ctx.fillRect(-axleX - 4, trackY - 2, 9, 4);
  ctx.fillRect(axleX - 5, trackY - 2, 9, 4);

  // Paintwork, with a lighter sheen along the top edge.
  ctx.fillStyle = car.wrecked ? '#3c4046' : car.color;
  roundedBox(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundedBox(ctx, -L / 2 + 3, -W / 2 + 2, L - 6, W / 2 - 2, 4);
  ctx.fill();

  // Glasshouse.
  ctx.fillStyle = car.wrecked ? '#24272c' : '#22303c';
  roundedBox(ctx, -L * 0.18, -W / 2 + 3.5, L * 0.4, W - 7, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(170, 220, 240, 0.75)';
  ctx.fillRect(L * 0.16, -W / 2 + 4, 3.5, W - 8);
  ctx.fillRect(-L * 0.24, -W / 2 + 4, 3, W - 8);

  paintVehicleDetails(ctx, world, car, L, W);

  // Headlamp dots at the nose.
  ctx.fillStyle = 'rgba(255, 244, 190, 0.9)';
  ctx.fillRect(L / 2 - 2, -W / 2 + 3, 2.5, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 2.5, 4);

  // The story Comet glows gold while Vera's first job is live.
  if (car === world.comet && world.mission && world.mission.def.id === 'wheels') {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(world.time * 5);
    roundedBox(ctx, -L / 2 - 4, -W / 2 - 4, L + 8, W + 8, 8);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (car.wrecked) {
    ctx.fillStyle = 'rgba(30,30,30,0.35)';
    ctx.beginPath();
    ctx.arc(car.x, car.y, 16 + Math.sin(world.time * 3 + car.id) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Per-class dressing: cab sign, cargo slats, stripes, spoiler, light bar. */
function paintVehicleDetails(ctx, world, car, L, W) {
  if (car.cls === 'taxi') {
    ctx.fillStyle = '#fdfdf8';
    ctx.fillRect(-5, -4, 10, 8);
    ctx.fillStyle = '#22242a';
    ctx.font = `700 7px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2.5);
  }
  if (car.cls === 'truck') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-L / 2 + 2, -W / 2 + 3, L * 0.42, W - 6);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let s = 0; s < 3; s += 1) ctx.fillRect(-L / 2 + 6 + s * 9, -W / 2 + 4, 2, W - 8);
  }
  if (car.cls === 'muscle') {
    ctx.fillStyle = 'rgba(20, 20, 24, 0.55)';
    ctx.fillRect(-L / 2 + 2, -3, L - 4, 6);
    ctx.fillStyle = 'rgba(20, 20, 24, 0.7)';
    roundedBox(ctx, L * 0.18, -5, 10, 10, 2);
    ctx.fill();
  }
  if (car.cls === 'super') {
    ctx.fillStyle = '#15161a';
    ctx.fillRect(-L / 2 - 1, -W / 2 - 1, 4, W + 2);
  }
  if (car.cls === 'police') {
    ctx.fillStyle = PALETTE.copBlue;
    ctx.fillRect(-L * 0.05, -W / 2, L * 0.16, W);
    const phase = Math.floor(world.time * 2.6) % 2 === 0;
    ctx.fillStyle = phase ? PALETTE.copRed : '#ff8a8a';
    ctx.fillRect(-7, -W / 2 + 3, 6, 5);
    ctx.fillStyle = phase ? '#8ab6ff' : PALETTE.copBlue;
    ctx.fillRect(1, -W / 2 + 3, 6, 5);
    ctx.fillStyle = phase ? PALETTE.copBlue : PALETTE.copRed;
    ctx.fillRect(-7, W / 2 - 8, 6, 5);
    ctx.fillStyle = phase ? PALETTE.copRed : '#8ab6ff';
    ctx.fillRect(1, W / 2 - 8, 6, 5);
  }
}

function paintWalker(ctx, world, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(20,16,8,0.22)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    // Sprawled: body ellipse with the head at the leading end.
    ctx.rotate(ped.angle);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c29b';
    ctx.beginPath();
    ctx.arc(12, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  ctx.fillStyle = ped.color;
  ctx.beginPath();
  ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c29b';
  ctx.beginPath();
  ctx.arc(2.5, 0, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (ped === world.vera) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 12 + Math.sin(world.time * 4) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (ped.state === 'hail') {
    // Raised waving arm plus a pulsing taxi-yellow ring.
    ctx.strokeStyle = ped.color;
    ctx.lineWidth = 2.5;
    const wave = Math.sin(world.time * 7) * 0.35;
    ctx.beginPath();
    ctx.moveTo(ped.x, ped.y - 4);
    ctx.lineTo(ped.x + 7, ped.y - 13 + wave * 6);
    ctx.stroke();
    ctx.strokeStyle = PALETTE.taxiYellow;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, 13 + Math.sin(world.time * 4) * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function paintObjectiveBeacon(ctx, world) {
  const target = world.objective;
  const pulse = 0.6 + 0.4 * Math.sin(world.time * 4);
  const beam = ctx.createLinearGradient(0, target.y - 190, 0, target.y);
  beam.addColorStop(0, 'rgba(255, 217, 77, 0)');
  beam.addColorStop(1, `rgba(255, 217, 77, ${0.35 * pulse})`);
  ctx.fillStyle = beam;
  ctx.fillRect(target.x - 13, target.y - 190, 26, 190);
  ctx.strokeStyle = PALETTE.marker;
  ctx.lineWidth = 3;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(target.x, target.y, 24 + Math.sin(world.time * 4) * 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function paintPickup(ctx, world, pickup) {
  const bob = Math.sin(world.time * 3 + pickup.id) * 2.5;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  if (pickup.kind === 'cash') {
    ctx.rotate(Math.sin(world.time * 2 + pickup.id) * 0.4);
    ctx.fillStyle = '#3f9e4d';
    ctx.fillRect(-8, -5, 16, 10);
    ctx.fillStyle = '#7be382';
    ctx.fillRect(-5, -2.5, 10, 5);
  } else if (pickup.kind === 'health') {
    ctx.fillStyle = '#fdfdf8';
    roundedBox(ctx, -9, -9, 18, 18, 3);
    ctx.fill();
    ctx.fillStyle = '#e23b3b';
    ctx.fillRect(-2.5, -6, 5, 12);
    ctx.fillRect(-6, -2.5, 12, 5);
  } else {
    // A pistol, drawn as a chunky L of dark metal.
    ctx.fillStyle = '#22242a';
    ctx.fillRect(-10, -3, 16, 6);
    ctx.fillRect(4, -2, 6, 4);
    ctx.fillRect(-6, 3, 4, 6);
  }
  ctx.restore();
}

function paintPlayerFigure(ctx, world) {
  const p = world.player;
  if (p.car) {
    // A bouncing chevron keeps the player's car findable in traffic.
    const bob = Math.sin(world.time * 5) * 3;
    ctx.fillStyle = '#fdfdf8';
    ctx.beginPath();
    ctx.moveTo(p.car.x, p.car.y - 34 + bob);
    ctx.lineTo(p.car.x - 8, p.car.y - 44 + bob);
    ctx.lineTo(p.car.x + 8, p.car.y - 44 + bob);
    ctx.closePath();
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(20,16,8,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 9, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.angle);
  ctx.fillStyle = '#0e7d86';
  ctx.beginPath();
  ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f2c29b';
  ctx.beginPath();
  ctx.arc(3, 0, 4.6, 0, Math.PI * 2);
  ctx.fill();
  if (p.weapon === 'pistol') {
    ctx.fillStyle = '#22242a';
    ctx.fillRect(6, -2, 11, 4);
  }
  ctx.restore();
}

function paintActors(ctx, world) {
  const { camera } = world;
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  if (world.objective) paintObjectiveBeacon(ctx, world);
  for (const pickup of world.pickups) {
    if (pickup.cd && pickup.cd > 0) continue;
    paintPickup(ctx, world, pickup);
  }
  for (const ped of world.peds) {
    if (ped.follow === 'car') continue; // riders are inside, not drawn
    paintWalker(ctx, world, ped);
  }
  for (const car of world.cars) paintVehicle(ctx, world, car);
  paintPlayerFigure(ctx, world);

  // Aim reticle while the pistol is out.
  const p = world.player;
  if (p.weapon === 'pistol') {
    const originX = p.car ? p.car.x : p.x;
    const originY = p.car ? p.car.y : p.y;
    const cx = originX + Math.cos(p.angle) * 52;
    const cy = originY + Math.sin(p.angle) * 52;
    ctx.strokeStyle = 'rgba(253, 253, 248, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();
  }

  // Tracer streaks.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2.4;
  for (const bullet of world.bullets) {
    ctx.beginPath();
    ctx.moveTo(bullet.x - bullet.vx * 0.014, bullet.y - bullet.vy * 0.014);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
  }
  // Particles fade with their remaining life.
  for (const particle of world.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ------------------------------------------------------------ minimap

function paintMinimap(ctx, world) {
  const MW = 218;
  const MH = 138;
  const originX = VIEW.width - MW - 16;
  const originY = VIEW.height - MH - 16;
  const scaleX = MW / CITY.width;
  const scaleY = MH / CITY.height;
  const toMapX = (wx) => originX + wx * scaleX;
  const toMapY = (wy) => originY + wy * scaleY;

  backingPanel(ctx, originX - 6, originY - 6, MW + 12, MH + 12);
  ctx.save();
  ctx.beginPath();
  roundedBox(ctx, originX, originY, MW, MH, 6);
  ctx.clip();
  ctx.fillStyle = '#5d9c48';
  ctx.fillRect(originX, originY, MW, MH);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(toMapX(CITY.beachX), originY, (CITY.waterX - CITY.beachX) * scaleX, MH);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(toMapX(CITY.waterX), originY, MW - CITY.waterX * scaleX, MH);

  ctx.strokeStyle = 'rgba(30, 32, 38, 0.85)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < CITY.vRoads; i += 1) {
    ctx.beginPath();
    ctx.moveTo(toMapX(vRoadX(i)), originY);
    ctx.lineTo(toMapX(vRoadX(i)), originY + MH);
    ctx.stroke();
  }
  for (let j = 0; j < CITY.hRoads; j += 1) {
    ctx.beginPath();
    ctx.moveTo(originX, toMapY(hRoadY(j)));
    ctx.lineTo(originX + (CITY.beachX + 40) * scaleX, toMapY(hRoadY(j)));
    ctx.stroke();
  }

  // Blinking police blips.
  const blinkOn = Math.floor(world.time * 2.6) % 2 === 0;
  for (const car of world.cars) {
    if (car.kind !== 'police') continue;
    ctx.fillStyle = blinkOn ? PALETTE.copRed : '#7db4ff';
    ctx.beginPath();
    ctx.arc(toMapX(car.x), toMapY(car.y), 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The hotel taxi stand.
  ctx.fillStyle = PALETTE.taxiYellow;
  ctx.fillRect(toMapX(world.city.taxiStand.x) - 2, toMapY(world.city.taxiStand.y) - 2, 4, 4);
  // Objective diamond.
  if (world.objective) {
    const target = world.objective;
    ctx.fillStyle = PALETTE.marker;
    ctx.save();
    ctx.translate(toMapX(target.x), toMapY(target.y));
    ctx.rotate(Math.PI / 4);
    const size = 4.6 + Math.sin(world.time * 4) * 0.8;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
  // Player arrow, rotated to facing.
  const p = world.player;
  ctx.save();
  ctx.translate(toMapX(p.x), toMapY(p.y));
  ctx.rotate(p.car ? p.car.angle : p.angle);
  ctx.fillStyle = '#fdfdf8';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.5, -4);
  ctx.lineTo(-4.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();

  ctx.font = `600 10px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(253,253,248,0.75)';
  ctx.fillText('CORAL BAY', originX + 2, originY - 10);
}

// ------------------------------------------------------------ HUD

function neighbourhoodName(x) {
  if (x > 1750) return 'Ocean Drive';
  if (x > 950) return 'Downtown';
  if (x > 480) return 'Midtown';
  return 'Westside';
}

function formatClock(minutesOfDay) {
  const hh = String(Math.floor(minutesOfDay / 60)).padStart(2, '0');
  const mm = String(Math.floor(minutesOfDay % 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatCountdown(totalSeconds) {
  const t = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function paintHudWallet(ctx, world) {
  const p = world.player;
  backingPanel(ctx, 16, 14, 208, 62);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.money;
  ctx.font = `800 27px ${FONT}`;
  ctx.fillText(`$${p.money.toLocaleString('en-US')}`, 30, 48);
  ctx.fillStyle = 'rgba(253,253,248,0.8)';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(`${formatClock(world.clock)} · ${neighbourhoodName(p.x)}`, 30, 68);
}

function paintHudStars(ctx, world) {
  backingPanel(ctx, VIEW.width - 196, 14, 180, 46);
  for (let s = 0; s < 5; s += 1) {
    starPath(ctx, VIEW.width - 168 + s * 34, 37, 13);
    ctx.fillStyle = s < world.wanted ? PALETTE.gold : 'rgba(253,253,248,0.22)';
    ctx.fill();
  }
  if (world.bust > 0.05) {
    ctx.fillStyle = 'rgba(239, 64, 64, 0.85)';
    roundedBox(ctx, VIEW.width - 182, 66, 152 * Math.min(1, world.bust / 1.6), 7, 3);
    ctx.fill();
  }
}

function paintHudVitals(ctx, world) {
  const p = world.player;
  backingPanel(ctx, 16, VIEW.height - 86, 252, 70);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(253,253,248,0.85)';
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText('HEALTH', 28, VIEW.height - 62);
  ctx.fillStyle = PALETTE.healthBack;
  roundedBox(ctx, 28, VIEW.height - 56, 150, 11, 5);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#7be382' : PALETTE.health;
  roundedBox(ctx, 28, VIEW.height - 56, 150 * Math.max(0, p.health / 100), 11, 5);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(p.weapon === 'pistol' ? `PISTOL · ${p.ammo}` : 'FISTS', 190, VIEW.height - 45);
  if (p.car) {
    const spec = CAR_CLASSES[p.car.cls];
    ctx.fillStyle = 'rgba(253,253,248,0.85)';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(spec.label.toUpperCase(), 28, VIEW.height - 26);
    ctx.fillStyle = PALETTE.healthBack;
    roundedBox(ctx, 96, VIEW.height - 34, 110, 9, 4);
    ctx.fill();
    ctx.fillStyle = p.car.health / spec.health > 0.3 ? '#7db4ff' : PALETTE.health;
    roundedBox(ctx, 96, VIEW.height - 34, 110 * Math.max(0, p.car.health / spec.health), 9, 4);
    ctx.fill();
  }
}

function paintHudBanner(ctx, world) {
  if (!world.banner) return;
  const banner = world.banner;
  ctx.font = `600 14.5px ${FONT}`;
  const lines = splitLines(ctx, banner.sub, 560);
  const height = 34 + lines.length * 19 + 8;
  backingPanel(ctx, VIEW.width / 2 - 320, 16, 640, height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `800 16px ${FONT}`;
  ctx.fillText(banner.title.toUpperCase(), VIEW.width / 2, 40);
  ctx.fillStyle = PALETTE.text;
  ctx.font = `600 14.5px ${FONT}`;
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 62 + i * 19));
}

function paintHudObjective(ctx, world) {
  if (!world.objective || world.phase !== 'play') return;
  const p = world.player;
  const target = world.objective;
  const distance = Math.hypot(target.x - p.x, target.y - p.y);
  let label = `▸ ${target.label} · ${Math.round(distance / 10)}m`;
  if (world.mission && world.mission.timer !== null && world.mission.timer !== undefined) {
    label += ` · ${formatCountdown(world.mission.timer)}`;
  }
  if (!world.mission && world.taxi && world.taxi.timer !== null && world.taxi.timer !== undefined) {
    label += ` · ${formatCountdown(world.taxi.timer)}`;
  }
  ctx.font = `700 15px ${FONT}`;
  const width = ctx.measureText(label).width + 30;
  backingPanel(ctx, VIEW.width / 2 - width / 2, VIEW.height - 52, width, 34);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.fillText(label, VIEW.width / 2, VIEW.height - 29);
}

function paintHudPrompt(ctx, world) {
  if (!world.nearAction || world.phase !== 'play') return;
  ctx.font = `700 14px ${FONT}`;
  const width = ctx.measureText(world.nearAction).width + 28;
  ctx.fillStyle = 'rgba(16, 22, 28, 0.82)';
  roundedBox(ctx, VIEW.width / 2 - width / 2, VIEW.height - 96, width, 30, 15);
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.fillText(world.nearAction, VIEW.width / 2, VIEW.height - 76);
}

function paintHud(ctx, world, ui) {
  paintHudWallet(ctx, world);
  paintHudStars(ctx, world);
  paintHudVitals(ctx, world);
  paintMinimap(ctx, world);
  paintHudBanner(ctx, world);
  paintHudObjective(ctx, world);
  paintHudPrompt(ctx, world);
  if (ui && ui.muted) {
    ctx.textAlign = 'right';
    ctx.font = `600 12px ${FONT}`;
    ctx.fillStyle = 'rgba(253,253,248,0.6)';
    ctx.fillText('MUTED', VIEW.width - 20, VIEW.height - 168);
  }
}

// ------------------------------------------------------------ screens

function paintTitle(ctx, world, ui) {
  // A dusk gradient laid over the drifting city view.
  const shade = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  shade.addColorStop(0, 'rgba(10, 18, 30, 0.30)');
  shade.addColorStop(0.55, 'rgba(10, 18, 30, 0.08)');
  shade.addColorStop(1, 'rgba(10, 18, 30, 0.55)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  ctx.textAlign = 'left';
  const titleGradient = ctx.createLinearGradient(0, 120, 0, 260);
  titleGradient.addColorStop(0, '#ffd94d');
  titleGradient.addColorStop(0.55, '#ff8a5c');
  titleGradient.addColorStop(1, '#ef4f7d');
  ctx.fillStyle = titleGradient;
  ctx.font = `900 92px ${FONT}`;
  ctx.fillText('CORAL BAY', 64, 208);
  ctx.font = `900 118px ${FONT}`;
  ctx.fillText('HEAT', 64, 322);
  ctx.fillStyle = '#fdfdf8';
  ctx.font = `600 19px ${FONT}`;
  ctx.fillText('An open-world crime story. Steal the car. Run the job. Outrun the bay.', 68, 362);

  const items = (ui && ui.menu) || [];
  ctx.font = `800 25px ${FONT}`;
  items.forEach((item, i) => {
    const y = 448 + i * 46;
    if (i === ui.menuSel) {
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText('▸', 68, y);
      ctx.fillStyle = '#fdfdf8';
    } else {
      ctx.fillStyle = 'rgba(253,253,248,0.62)';
    }
    ctx.fillText(item, 100, y);
  });
  ctx.font = `500 14.5px ${FONT}`;
  ctx.fillStyle = 'rgba(253,253,248,0.75)';
  ctx.fillText('WASD drive & walk · E get in / talk · mouse aim, click to fight · Shift run / handbrake · P pause · drive a taxi for fares', 68, VIEW.height - 30);
}

const HOW_LINES = [
  'You are new in Coral Bay, and Vera at the customs garage has work.',
  'Follow the gold marker. Finish her three jobs to own the bay.',
  '',
  'WASD / arrows — walk and drive        Shift — run / handbrake',
  'E — get in a car, talk, use a place   Mouse — aim · Click / J — fight',
  'H — horn · P — pause · M — mute',
  '',
  'Driving a taxi? Passengers hail from the kerb — pull up, beat the',
  'clock to their stop, and the fare is yours. The stand is at The',
  'Palms Hotel; the streets run Stallions, Haulers and Vapors too.',
  '',
  'Crime raises your wanted stars. Police answer every star: they',
  'chase, ram, and bust you if they corner you on foot. Lose them',
  'by breaking away until the stars fade.',
  '',
  'Cash buys health at St. Marina Hospital, repairs at Shine Auto',
  'Body, and ammo at Bay Armory. A pistol waits behind the Armory.',
  'Your progress saves itself after every job.',
];

function paintHowTo(ctx) {
  backingPanel(ctx, VIEW.width / 2 - 350, 70, 700, 560);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText('HOW TO PLAY', VIEW.width / 2, 118);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.font = `600 16.5px ${FONT}`;
  HOW_LINES.forEach((line, i) => ctx.fillText(line, VIEW.width / 2 - 310, 160 + i * 26));
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(253,253,248,0.7)';
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText('Enter — back', VIEW.width / 2, 612);
}

/** Full-screen verdict word (PAUSED / BUSTED / WASTED) over a dim wash. */
function paintVerdict(ctx, word, color, sub) {
  ctx.fillStyle = 'rgba(8, 10, 14, 0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = `900 96px ${FONT}`;
  ctx.fillText(word, VIEW.width / 2, VIEW.height / 2 + 10);
  if (sub) {
    ctx.fillStyle = '#fdfdf8';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText(sub, VIEW.width / 2, VIEW.height / 2 + 52);
  }
}

function paintEnding(ctx, world) {
  ctx.fillStyle = 'rgba(24, 16, 4, 0.52)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = `900 74px ${FONT}`;
  ctx.fillText('THE BAY IS YOURS', VIEW.width / 2, 268);
  ctx.fillStyle = '#fdfdf8';
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText(`Vera made the boat. You made $${world.stats.earned.toLocaleString('en-US')} across the bay,`, VIEW.width / 2, 330);
  ctx.fillText(`borrowed ${world.stats.stolen} cars, ran ${world.stats.fares} taxi fares, and the city knows your name now.`, VIEW.width / 2, 360);
  ctx.font = `600 16px ${FONT}`;
  ctx.fillStyle = 'rgba(253,253,248,0.8)';
  ctx.fillText('Enter — keep roaming Coral Bay. Courier work waits at Vera’s garage.', VIEW.width / 2, 428);
}

// ------------------------------------------------------------ entry point

/** Paint one complete frame for the given screen. */
export function render(ctx, world, screen, ui = {}) {
  paintTerrain(ctx, world);
  paintActors(ctx, world);

  // Late-afternoon warmth washed diagonally over the whole frame.
  const sunWash = ctx.createLinearGradient(0, 0, VIEW.width, VIEW.height);
  sunWash.addColorStop(0, 'rgba(255, 176, 66, 0.07)');
  sunWash.addColorStop(1, 'rgba(239, 79, 125, 0.05)');
  ctx.fillStyle = sunWash;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  if (screen === SCREEN_TITLE) {
    paintTitle(ctx, world, ui);
    return;
  }
  if (screen === SCREEN_HOW) {
    paintTitle(ctx, world, { ...ui, menu: [] });
    paintHowTo(ctx);
    return;
  }

  paintHud(ctx, world, ui);
  if (screen === SCREEN_PAUSE) {
    paintVerdict(ctx, 'PAUSED', '#fdfdf8', 'P or Enter — back to the bay');
  }
  if (screen === SCREEN_BUSTED) {
    const flashOn = Math.floor(world.time * 3) % 2 === 0;
    ctx.fillStyle = flashOn ? 'rgba(47, 111, 208, 0.20)' : 'rgba(239, 64, 64, 0.20)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    paintVerdict(ctx, 'BUSTED', '#7db4ff', 'The Coral Bay PD takes its cut.');
  }
  if (screen === SCREEN_WASTED) {
    paintVerdict(ctx, 'WASTED', '#ef5350', 'St. Marina picks up the pieces — for $100.');
  }
  if (screen === SCREEN_ENDING) {
    paintEnding(ctx, world);
  }
}
