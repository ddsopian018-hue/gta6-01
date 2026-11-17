// Everything the player sees: the sun-soaked city from above, its traffic and crowds, the
// police lights, and the HUD with its minimap. The renderer only reads the world; the
// simulation never knows it exists. Screens are values the game's main loop passes in.

import { CAR_CLASSES, CITY, PALETTE, VIEW, blockRect, hRoadY, vRoadX } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_HOW = 'how';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSE = 'pause';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_ENDING = 'ending';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawGround(ctx, world) {
  const { camera, city, time } = world;
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Sand and sea.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(CITY.beachX, 0, CITY.waterX - CITY.beachX, CITY.height);
  ctx.fillStyle = PALETTE.sandWet;
  ctx.fillRect(CITY.waterX - 26, 0, 26, CITY.height);
  const seaGrad = ctx.createLinearGradient(CITY.waterX, 0, CITY.width, 0);
  seaGrad.addColorStop(0, PALETTE.water);
  seaGrad.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = seaGrad;
  ctx.fillRect(CITY.waterX, 0, CITY.width - CITY.waterX, CITY.height);
  ctx.strokeStyle = PALETTE.waterFoam;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.65;
  for (let k = 0; k < 2; k += 1) {
    ctx.beginPath();
    const fx = CITY.waterX + 6 + k * 15;
    for (let y = 0; y <= CITY.height; y += 40) {
      const x = fx + Math.sin(y * 0.02 + time * 1.4 + k * 2.1) * 5;
      if (y === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Roads, then the promenade between the last road and the sand.
  ctx.fillStyle = PALETTE.asphalt;
  for (let i = 0; i < CITY.vRoads; i += 1) ctx.fillRect(i * CITY.pitch, 0, CITY.roadW, CITY.height);
  for (let j = 0; j < CITY.hRoads; j += 1) ctx.fillRect(0, j * CITY.pitch, CITY.beachX + 60, CITY.roadW);
  ctx.fillStyle = PALETTE.sidewalk;
  ctx.fillRect(CITY.beachX - 48, 0, 48, CITY.height);

  // Blocks: sidewalks first, the park as open green.
  for (let i = 0; i < CITY.vRoads - 1; i += 1) {
    for (let j = 0; j < CITY.hRoads - 1; j += 1) {
      const cell = blockRect(i, j);
      if (i === 2 && j === 1) {
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

  // Lane dashes and crosswalks.
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

  // The marina pier.
  const pier = city.pier;
  ctx.fillStyle = PALETTE.pier;
  ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = pier.x + 12; x < pier.x + pier.w; x += 24) ctx.fillRect(x, pier.y, 3, pier.h);

  drawBuildings(ctx, world);
  drawTrees(ctx, world);
  ctx.restore();
}

function drawBuildings(ctx, world) {
  const { city } = world;
  for (const b of city.buildings) {
    const shade = b.height;
    ctx.fillStyle = 'rgba(40, 30, 10, 0.20)';
    ctx.fillRect(b.x + shade * 0.5, b.y + shade * 0.34, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(60, 50, 30, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(b.x + 10, b.y + 10, b.w - 20, b.h - 20);
    // Rooftop clutter, placed by a hash of the position so it never flickers.
    ctx.fillStyle = 'rgba(90, 85, 70, 0.5)';
    const n = b.roofProps || 0;
    for (let k = 0; k < n; k += 1) {
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
      ctx.font = '700 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(38, 42, 50, 0.88)';
      ctx.fillText(b.name, b.x + b.w / 2, b.y + b.h - 12);
    }
  }
}

function drawTrees(ctx, world) {
  for (const t of world.city.trees) {
    const s = t.s || 1;
    ctx.fillStyle = 'rgba(40, 30, 10, 0.18)';
    ctx.beginPath();
    ctx.ellipse(t.x + 7 * s, t.y + 6 * s, 15 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 4);
    ctx.fillStyle = '#3f9e4d';
    ctx.beginPath();
    ctx.arc(t.x, t.y, 14 * s, 0, Math.PI * 2);
    ctx.arc(t.x - 9 * s, t.y + 4 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(t.x + 9 * s, t.y + 3 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#57bb63';
    ctx.beginPath();
    ctx.arc(t.x - 3 * s, t.y - 4 * s, 7 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCar(ctx, world, car) {
  const spec = CAR_CLASSES[car.cls];
  const L = spec.length;
  const W = spec.width;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.fillStyle = 'rgba(20, 16, 8, 0.25)';
  rr(ctx, -L / 2 + 4, -W / 2 + 5, L, W, 6);
  ctx.fill();
  ctx.rotate(car.angle);
  // Wheels.
  ctx.fillStyle = '#15161a';
  const wx = L / 2 - 11;
  const wy = W / 2 - 2;
  ctx.fillRect(-wx - 4, -wy - 2, 9, 4);
  ctx.fillRect(wx - 5, -wy - 2, 9, 4);
  ctx.fillRect(-wx - 4, wy - 2, 9, 4);
  ctx.fillRect(wx - 5, wy - 2, 9, 4);
  // Body.
  ctx.fillStyle = car.wrecked ? '#3c4046' : car.color;
  rr(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  rr(ctx, -L / 2 + 3, -W / 2 + 2, L - 6, W / 2 - 2, 4);
  ctx.fill();
  // Cabin and glass.
  ctx.fillStyle = car.wrecked ? '#24272c' : '#22303c';
  rr(ctx, -L * 0.18, -W / 2 + 3.5, L * 0.4, W - 7, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(170, 220, 240, 0.75)';
  ctx.fillRect(L * 0.16, -W / 2 + 4, 3.5, W - 8);
  ctx.fillRect(-L * 0.24, -W / 2 + 4, 3, W - 8);
  if (car.cls === 'taxi') {
    ctx.fillStyle = '#fdfdf8';
    ctx.fillRect(-5, -4, 10, 8);
    ctx.fillStyle = '#22242a';
    ctx.font = '700 7px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 2.5);
  }
  if (car.cls === 'police') {
    ctx.fillStyle = PALETTE.copBlue;
    ctx.fillRect(-L * 0.05, -W / 2, L * 0.16, W);
    const flash = Math.floor(world.time * 2.6) % 2 === 0;
    ctx.fillStyle = flash ? PALETTE.copRed : '#ff8a8a';
    ctx.fillRect(-7, -W / 2 + 3, 6, 5);
    ctx.fillStyle = flash ? '#8ab6ff' : PALETTE.copBlue;
    ctx.fillRect(1, -W / 2 + 3, 6, 5);
    ctx.fillStyle = flash ? PALETTE.copBlue : PALETTE.copRed;
    ctx.fillRect(-7, W / 2 - 8, 6, 5);
    ctx.fillStyle = flash ? PALETTE.copRed : '#8ab6ff';
    ctx.fillRect(1, W / 2 - 8, 6, 5);
  }
  // Headlights.
  ctx.fillStyle = 'rgba(255, 244, 190, 0.9)';
  ctx.fillRect(L / 2 - 2, -W / 2 + 3, 2.5, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 2.5, 4);
  if (car === world.comet && world.mission && world.mission.def.id === 'wheels') {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 2.5;
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(world.time * 5);
    rr(ctx, -L / 2 - 4, -W / 2 - 4, L + 8, W + 8, 8);
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

function drawPed(ctx, world, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(20,16,8,0.22)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
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
}

function drawEntities(ctx, world) {
  const { camera } = world;
  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  // Objective beacon.
  if (world.objective) {
    const o = world.objective;
    const pulse = 0.6 + 0.4 * Math.sin(world.time * 4);
    const grad = ctx.createLinearGradient(0, o.y - 190, 0, o.y);
    grad.addColorStop(0, 'rgba(255, 217, 77, 0)');
    grad.addColorStop(1, `rgba(255, 217, 77, ${0.35 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(o.x - 13, o.y - 190, 26, 190);
    ctx.strokeStyle = PALETTE.marker;
    ctx.lineWidth = 3;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(o.x, o.y, 24 + Math.sin(world.time * 4) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Pickups.
  for (const pk of world.pickups) {
    if (pk.cd && pk.cd > 0) continue;
    const bob = Math.sin(world.time * 3 + pk.id) * 2.5;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.rotate(Math.sin(world.time * 2 + pk.id) * 0.4);
      ctx.fillStyle = '#3f9e4d';
      ctx.fillRect(-8, -5, 16, 10);
      ctx.fillStyle = '#7be382';
      ctx.fillRect(-5, -2.5, 10, 5);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#fdfdf8';
      rr(ctx, -9, -9, 18, 18, 3);
      ctx.fill();
      ctx.fillStyle = '#e23b3b';
      ctx.fillRect(-2.5, -6, 5, 12);
      ctx.fillRect(-6, -2.5, 12, 5);
    } else {
      ctx.fillStyle = '#22242a';
      ctx.fillRect(-10, -3, 16, 6);
      ctx.fillRect(4, -2, 6, 4);
      ctx.fillRect(-6, 3, 4, 6);
    }
    ctx.restore();
  }

  for (const ped of world.peds) {
    if (ped.follow === 'car') continue;
    drawPed(ctx, world, ped);
  }
  for (const car of world.cars) drawCar(ctx, world, car);

  // The player.
  const p = world.player;
  if (p.car) {
    // A chevron over the player's car, so it is never lost in traffic.
    const bob = Math.sin(world.time * 5) * 3;
    ctx.fillStyle = '#fdfdf8';
    ctx.beginPath();
    ctx.moveTo(p.car.x, p.car.y - 34 + bob);
    ctx.lineTo(p.car.x - 8, p.car.y - 44 + bob);
    ctx.lineTo(p.car.x + 8, p.car.y - 44 + bob);
    ctx.closePath();
    ctx.fill();
  } else {
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
  if (p.weapon === 'pistol') {
    const ox = p.car ? p.car.x : p.x;
    const oy = p.car ? p.car.y : p.y;
    ctx.strokeStyle = 'rgba(253, 253, 248, 0.85)';
    ctx.lineWidth = 1.6;
    const cx = ox + Math.cos(p.angle) * 52;
    const cy = oy + Math.sin(p.angle) * 52;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx + 6, cy);
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy + 6);
    ctx.stroke();
  }

  // Bullets and particles.
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2.4;
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ------------------------------------------------------------- HUD and screens

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PALETTE.panel;
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
}

function drawMinimap(ctx, world) {
  const MW = 218;
  const MH = 138;
  const x0 = VIEW.width - MW - 16;
  const y0 = VIEW.height - MH - 16;
  const sx = MW / CITY.width;
  const sy = MH / CITY.height;
  panel(ctx, x0 - 6, y0 - 6, MW + 12, MH + 12);
  ctx.save();
  ctx.beginPath();
  rr(ctx, x0, y0, MW, MH, 6);
  ctx.clip();
  ctx.fillStyle = '#5d9c48';
  ctx.fillRect(x0, y0, MW, MH);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(x0 + CITY.beachX * sx, y0, (CITY.waterX - CITY.beachX) * sx, MH);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(x0 + CITY.waterX * sx, y0, MW - CITY.waterX * sx, MH);
  ctx.strokeStyle = 'rgba(30, 32, 38, 0.85)';
  ctx.lineWidth = 2.4;
  for (let i = 0; i < CITY.vRoads; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x0 + vRoadX(i) * sx, y0);
    ctx.lineTo(x0 + vRoadX(i) * sx, y0 + MH);
    ctx.stroke();
  }
  for (let j = 0; j < CITY.hRoads; j += 1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + hRoadY(j) * sy);
    ctx.lineTo(x0 + (CITY.beachX + 40) * sx, y0 + hRoadY(j) * sy);
    ctx.stroke();
  }
  // Police blips.
  const blink = Math.floor(world.time * 2.6) % 2 === 0;
  for (const car of world.cars) {
    if (car.kind !== 'police') continue;
    ctx.fillStyle = blink ? PALETTE.copRed : '#7db4ff';
    ctx.beginPath();
    ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // The objective.
  if (world.objective) {
    const o = world.objective;
    ctx.fillStyle = PALETTE.marker;
    ctx.save();
    ctx.translate(x0 + o.x * sx, y0 + o.y * sy);
    ctx.rotate(Math.PI / 4);
    const s = 4.6 + Math.sin(world.time * 4) * 0.8;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  // The player.
  const p = world.player;
  const facing = p.car ? p.car.angle : p.angle;
  ctx.save();
  ctx.translate(x0 + p.x * sx, y0 + p.y * sy);
  ctx.rotate(facing);
  ctx.fillStyle = '#fdfdf8';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.5, -4);
  ctx.lineTo(-4.5, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.font = '600 10px ' + FONT;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(253,253,248,0.75)';
  ctx.fillText('CORAL BAY', x0 + 2, y0 - 10);
}

function districtName(x) {
  if (x > 1750) return 'Ocean Drive';
  if (x > 950) return 'Downtown';
  if (x > 480) return 'Midtown';
  return 'Westside';
}

function drawHUD(ctx, world, ui) {
  const p = world.player;
  // Money and clock, top left.
  panel(ctx, 16, 14, 208, 62);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.money;
  ctx.font = '800 27px ' + FONT;
  ctx.fillText('$' + p.money.toLocaleString('en-US'), 30, 48);
  ctx.fillStyle = 'rgba(253,253,248,0.8)';
  ctx.font = '600 13px ' + FONT;
  const hh = String(Math.floor(world.clock / 60)).padStart(2, '0');
  const mm = String(Math.floor(world.clock % 60)).padStart(2, '0');
  ctx.fillText(`${hh}:${mm} · ${districtName(p.x)}`, 30, 68);

  // Wanted stars, top right.
  panel(ctx, VIEW.width - 196, 14, 180, 46);
  for (let s = 0; s < 5; s += 1) {
    star(ctx, VIEW.width - 168 + s * 34, 37, 13);
    ctx.fillStyle = s < world.wanted ? PALETTE.gold : 'rgba(253,253,248,0.22)';
    ctx.fill();
  }
  if (world.bust > 0.05) {
    ctx.fillStyle = 'rgba(239, 64, 64, 0.85)';
    rr(ctx, VIEW.width - 182, 66, 152 * Math.min(1, world.bust / 1.6), 7, 3);
    ctx.fill();
  }

  // Health, weapon and car condition, bottom left.
  panel(ctx, 16, VIEW.height - 86, 252, 70);
  ctx.fillStyle = 'rgba(253,253,248,0.85)';
  ctx.font = '700 11px ' + FONT;
  ctx.fillText('HEALTH', 28, VIEW.height - 62);
  ctx.fillStyle = PALETTE.healthBack;
  rr(ctx, 28, VIEW.height - 56, 150, 11, 5);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#7be382' : PALETTE.health;
  rr(ctx, 28, VIEW.height - 56, 150 * Math.max(0, p.health / 100), 11, 5);
  ctx.fill();
  ctx.fillStyle = PALETTE.text;
  ctx.font = '700 14px ' + FONT;
  ctx.fillText(p.weapon === 'pistol' ? `PISTOL · ${p.ammo}` : 'FISTS', 190, VIEW.height - 45);
  if (p.car) {
    const spec = CAR_CLASSES[p.car.cls];
    ctx.fillStyle = 'rgba(253,253,248,0.85)';
    ctx.font = '700 11px ' + FONT;
    ctx.fillText(spec.label.toUpperCase(), 28, VIEW.height - 26);
    ctx.fillStyle = PALETTE.healthBack;
    rr(ctx, 96, VIEW.height - 34, 110, 9, 4);
    ctx.fill();
    ctx.fillStyle = p.car.health / spec.health > 0.3 ? '#7db4ff' : PALETTE.health;
    rr(ctx, 96, VIEW.height - 34, 110 * Math.max(0, p.car.health / spec.health), 9, 4);
    ctx.fill();
  }

  drawMinimap(ctx, world);

  // The mission banner.
  if (world.banner) {
    const b = world.banner;
    ctx.font = '600 14.5px ' + FONT;
    const lines = wrapText(ctx, b.sub, 560);
    const h = 34 + lines.length * 19 + 8;
    panel(ctx, VIEW.width / 2 - 320, 16, 640, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '800 16px ' + FONT;
    ctx.fillText(b.title.toUpperCase(), VIEW.width / 2, 40);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '600 14.5px ' + FONT;
    lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2, 62 + i * 19));
  }

  // The current objective, bottom centre.
  if (world.objective && world.phase === 'play') {
    const o = world.objective;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    let label = `▸ ${o.label} · ${Math.round(d / 10)}m`;
    if (world.mission && world.mission.timer !== null && world.mission.timer !== undefined) {
      const t = Math.max(0, Math.ceil(world.mission.timer));
      label += ` · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
    ctx.font = '700 15px ' + FONT;
    const w = ctx.measureText(label).width + 30;
    panel(ctx, VIEW.width / 2 - w / 2, VIEW.height - 52, w, 34);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(label, VIEW.width / 2, VIEW.height - 29);
  }

  // The contextual prompt.
  if (world.nearAction && world.phase === 'play') {
    ctx.font = '700 14px ' + FONT;
    const w = ctx.measureText(world.nearAction).width + 28;
    ctx.fillStyle = 'rgba(16, 22, 28, 0.82)';
    rr(ctx, VIEW.width / 2 - w / 2, VIEW.height - 96, w, 30, 15);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText(world.nearAction, VIEW.width / 2, VIEW.height - 76);
  }

  if (ui && ui.muted) {
    ctx.textAlign = 'right';
    ctx.font = '600 12px ' + FONT;
    ctx.fillStyle = 'rgba(253,253,248,0.6)';
    ctx.fillText('MUTED', VIEW.width - 20, VIEW.height - 168);
  }
}

function drawTitle(ctx, world, ui) {
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  grad.addColorStop(0, 'rgba(10, 18, 30, 0.30)');
  grad.addColorStop(0.55, 'rgba(10, 18, 30, 0.08)');
  grad.addColorStop(1, 'rgba(10, 18, 30, 0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'left';
  const titleGrad = ctx.createLinearGradient(0, 120, 0, 260);
  titleGrad.addColorStop(0, '#ffd94d');
  titleGrad.addColorStop(0.55, '#ff8a5c');
  titleGrad.addColorStop(1, '#ef4f7d');
  ctx.fillStyle = titleGrad;
  ctx.font = '900 92px ' + FONT;
  ctx.fillText('CORAL BAY', 64, 208);
  ctx.font = '900 118px ' + FONT;
  ctx.fillText('HEAT', 64, 322);
  ctx.fillStyle = '#fdfdf8';
  ctx.font = '600 19px ' + FONT;
  ctx.fillText('An open-world crime story. Steal the car. Run the job. Outrun the bay.', 68, 362);

  const items = ui.menu;
  ctx.font = '800 25px ' + FONT;
  items.forEach((item, i) => {
    const y = 448 + i * 46;
    if (i === ui.menuSel) {
      ctx.fillStyle = PALETTE.gold;
      ctx.fillText('▸', 68, y);
      ctx.fillStyle = '#fdfdf8';
    } else ctx.fillStyle = 'rgba(253,253,248,0.62)';
    ctx.fillText(item, 100, y);
  });
  ctx.font = '500 14.5px ' + FONT;
  ctx.fillStyle = 'rgba(253,253,248,0.75)';
  ctx.fillText('WASD drive & walk · E get in / talk · mouse aim, click to fight · Shift run / handbrake · P pause', 68, VIEW.height - 30);
}

function drawHow(ctx) {
  panel(ctx, VIEW.width / 2 - 350, 90, 700, 520);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = '800 30px ' + FONT;
  ctx.fillText('HOW TO PLAY', VIEW.width / 2, 142);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '600 16.5px ' + FONT;
  const lines = [
    'You are new in Coral Bay, and Vera at the customs garage has work.',
    'Follow the gold marker. Finish her three jobs to own the bay.',
    '',
    'WASD / arrows — walk and drive        Shift — run / handbrake',
    'E — get in a car, talk, use a place   Mouse — aim · Click / J — fight',
    'H — horn · P — pause · M — mute',
    '',
    'Crime raises your wanted stars. Police answer every star: they',
    'chase, ram, and bust you if they corner you on foot. Lose them',
    'by breaking away until the stars fade.',
    '',
    'Cash buys health at St. Marina Hospital, repairs at Shine Auto',
    'Body, and ammo at Bay Armory. A pistol waits behind the Armory.',
    'Your progress saves itself after every job.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, VIEW.width / 2 - 310, 186 + i * 27));
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(253,253,248,0.7)';
  ctx.font = '600 15px ' + FONT;
  ctx.fillText('Enter — back', VIEW.width / 2, 578);
}

function drawCentreWord(ctx, word, color, sub) {
  ctx.fillStyle = 'rgba(8, 10, 14, 0.45)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = '900 96px ' + FONT;
  ctx.fillText(word, VIEW.width / 2, VIEW.height / 2 + 10);
  if (sub) {
    ctx.fillStyle = '#fdfdf8';
    ctx.font = '600 18px ' + FONT;
    ctx.fillText(sub, VIEW.width / 2, VIEW.height / 2 + 52);
  }
}

/** Draw one frame: the world, then the HUD or the screen the game is on. */
export function render(ctx, world, screen, ui = {}) {
  drawGround(ctx, world);
  drawEntities(ctx, world);
  // A warm wash over everything: late-afternoon sun.
  const sun = ctx.createLinearGradient(0, 0, VIEW.width, VIEW.height);
  sun.addColorStop(0, 'rgba(255, 176, 66, 0.07)');
  sun.addColorStop(1, 'rgba(239, 79, 125, 0.05)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);

  if (screen === SCREEN_TITLE) { drawTitle(ctx, world, ui); return; }
  if (screen === SCREEN_HOW) { drawTitle(ctx, world, { ...ui, menu: [] }); drawHow(ctx); return; }
  drawHUD(ctx, world, ui);
  if (screen === SCREEN_PAUSE) drawCentreWord(ctx, 'PAUSED', '#fdfdf8', 'P or Enter — back to the bay');
  if (screen === SCREEN_BUSTED) {
    const flash = Math.floor(world.time * 3) % 2 === 0;
    ctx.fillStyle = flash ? 'rgba(47, 111, 208, 0.20)' : 'rgba(239, 64, 64, 0.20)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    drawCentreWord(ctx, 'BUSTED', '#7db4ff', 'The Coral Bay PD takes its cut.');
  }
  if (screen === SCREEN_WASTED) drawCentreWord(ctx, 'WASTED', '#ef5350', 'St. Marina picks up the pieces — for $100.');
  if (screen === SCREEN_ENDING) {
    ctx.fillStyle = 'rgba(24, 16, 4, 0.52)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '900 74px ' + FONT;
    ctx.fillText('THE BAY IS YOURS', VIEW.width / 2, 268);
    ctx.fillStyle = '#fdfdf8';
    ctx.font = '600 20px ' + FONT;
    ctx.fillText(`Vera made the boat. You made $${world.stats.earned.toLocaleString('en-US')} across the bay,`, VIEW.width / 2, 330);
    ctx.fillText(`borrowed ${world.stats.stolen} cars, and the city knows your name now.`, VIEW.width / 2, 360);
    ctx.font = '600 16px ' + FONT;
    ctx.fillStyle = 'rgba(253,253,248,0.8)';
    ctx.fillText('Enter — keep roaming Coral Bay. Courier work waits at Vera\u2019s garage.', VIEW.width / 2, 428);
  }
}
