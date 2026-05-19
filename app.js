(function () {
  'use strict';

  // =====================================================================
  // CONSTANTS
  // =====================================================================
  var STORAGE_KEY = 'mdg_microciv_v1';
  var MAP_W = 14, MAP_H = 14;
  var ZOOM_LEVELS = [22, 28, 36];       // hex radius in px
  var ZOOM_NAMES  = ['FAR', 'NORMAL', 'CLOSE'];
  var DEFAULT_ZOOM = 1;
  var SQRT3 = Math.sqrt(3);
  var VIEW_W = 600, VIEW_H = 540;

  var TERRAIN = {
    grass:    { name: 'Grass',    food: 2, prod: 0, gold: 0, color: '#0a1a10', edge: '#13361f', glyph: '',  fg: '#3c8a52' },
    plains:   { name: 'Plains',   food: 1, prod: 1, gold: 0, color: '#1a1808', edge: '#3a3414', glyph: '',  fg: '#a08648' },
    forest:   { name: 'Forest',   food: 1, prod: 2, gold: 0, color: '#06150c', edge: '#0e3018', glyph: '♣', fg: '#2f7a3f' },
    hills:    { name: 'Hills',    food: 1, prod: 2, gold: 0, defBonus: 0.5, color: '#15120a', edge: '#3a2e16', glyph: '▴', fg: '#c0a060' },
    mountain: { name: 'Mountain', food: 0, prod: 0, gold: 0, impassable: true, color: '#100c12', edge: '#3a2e3e', glyph: '▲', fg: '#c2a8d0' },
    desert:   { name: 'Desert',   food: 0, prod: 1, gold: 1, color: '#241c08', edge: '#5c451a', glyph: '·', fg: '#d4a04e' },
    water:    { name: 'Sea',      food: 1, prod: 0, gold: 1, impassable: true, color: '#03101a', edge: '#0e2e4a', glyph: '~', fg: '#3a92d0' }
  };

  var UNITS = {
    settler:  { name: 'Settler',  cost: 30, hp: 8,  atk: 0, def: 1, move: 2, glyph: '☗', tech: null,        civilian: true, canFound: true },
    worker:   { name: 'Worker',   cost: 20, hp: 8,  atk: 0, def: 1, move: 2, glyph: '⚒', tech: null,        civilian: true, canImprove: true },
    warrior:  { name: 'Warrior',  cost: 15, hp: 14, atk: 4, def: 3, move: 2, glyph: '⚔', tech: null },
    archer:   { name: 'Archer',   cost: 25, hp: 10, atk: 5, def: 2, move: 2, glyph: '➹', tech: 'archery',   ranged: 2 },
    horseman: { name: 'Horseman', cost: 35, hp: 14, atk: 6, def: 3, move: 4, glyph: '♞', tech: 'husbandry' }
  };

  var BUILDINGS = {
    granary: { name: 'Granary', cost: 30, food: 2, tech: 'pottery'  },
    walls:   { name: 'Walls',   cost: 40, def: 4,  tech: 'masonry'  },
    market:  { name: 'Market',  cost: 50, gold: 3, tech: 'currency' }
  };

  var TECHS = {
    pottery:   { name: 'Pottery',     cost:  20, req: [],                       unlocks: 'Granary' },
    archery:   { name: 'Archery',     cost:  30, req: [],                       unlocks: 'Archer' },
    masonry:   { name: 'Masonry',     cost:  35, req: ['pottery'],              unlocks: 'Walls' },
    husbandry: { name: 'Husbandry',   cost:  40, req: ['archery'],              unlocks: 'Horseman' },
    currency:  { name: 'Currency',    cost:  55, req: ['masonry'],              unlocks: 'Market' },
    iron:      { name: 'Metalworking',cost:  70, req: ['husbandry','currency'], unlocks: '+2 atk to Warriors' }
  };
  var TECH_ORDER = ['pottery','archery','masonry','husbandry','currency','iron'];

  var CIVS = {
    player: { name: 'Solaris', color: '#00d4ff', edge: '#7ce5ff' },
    ai:     { name: 'Umbra',   color: '#ff7a59', edge: '#ffb59a' }
  };

  // =====================================================================
  // STATE
  // =====================================================================
  var state = null;
  var canvas, ctx;
  var rngSeed = 1;

  // =====================================================================
  // RNG (seeded)
  // =====================================================================
  function srand(seed) { rngSeed = seed >>> 0; if (rngSeed === 0) rngSeed = 1; }
  function rnd() {
    rngSeed ^= rngSeed << 13;
    rngSeed ^= rngSeed >>> 17;
    rngSeed ^= rngSeed << 5;
    return ((rngSeed >>> 0) % 1000000) / 1000000;
  }
  function rndInt(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function rndOf(arr) { return arr[Math.floor(rnd() * arr.length)]; }

  // =====================================================================
  // HEX MATH (odd-r offset, pointy-top)
  // =====================================================================
  function inBounds(c, r) { return c >= 0 && c < MAP_W && r >= 0 && r < MAP_H; }

  function tileAt(c, r) {
    if (!inBounds(c, r)) return null;
    return state.map[r][c];
  }

  function neighbors(c, r) {
    var even = (r & 1) === 0;
    var deltas = even
      ? [[+1,0],[-1,0],[0,-1],[-1,-1],[0,+1],[-1,+1]]
      : [[+1,0],[-1,0],[+1,-1],[0,-1],[+1,+1],[0,+1]];
    var out = [];
    for (var i = 0; i < 6; i++) {
      var nc = c + deltas[i][0], nr = r + deltas[i][1];
      if (inBounds(nc, nr)) out.push([nc, nr]);
    }
    return out;
  }

  function offsetToAxial(c, r) {
    var q = c - (r - (r & 1)) / 2;
    return { q: q, r: r };
  }
  function hexDist(a, b) {
    var aa = offsetToAxial(a[0], a[1]);
    var bb = offsetToAxial(b[0], b[1]);
    return (Math.abs(aa.q - bb.q) + Math.abs(aa.q + aa.r - bb.q - bb.r) + Math.abs(aa.r - bb.r)) / 2;
  }

  function pixelOf(c, r, size) {
    var x = size * SQRT3 * (c + 0.5 * (r & 1));
    var y = size * 1.5 * r;
    return { x: x, y: y };
  }

  // =====================================================================
  // MAP GENERATION
  // =====================================================================
  function makeTile() {
    return {
      terrain: 'grass',
      resource: null,
      city: null,
      unit: null,
      improvement: null, // 'farm' | 'mine'
      visible: { player: false, ai: false },
      explored: { player: false, ai: false }
    };
  }

  function generateMap(seed) {
    srand(seed);
    var map = [];
    for (var r = 0; r < MAP_H; r++) {
      var row = [];
      for (var c = 0; c < MAP_W; c++) row.push(makeTile());
      map.push(row);
    }

    // Base terrain noise
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var t = map[r][c];
        var roll = rnd();
        if (roll < 0.40) t.terrain = 'grass';
        else if (roll < 0.65) t.terrain = 'plains';
        else if (roll < 0.78) t.terrain = 'forest';
        else if (roll < 0.86) t.terrain = 'hills';
        else if (roll < 0.92) t.terrain = 'desert';
        else if (roll < 0.97) t.terrain = 'mountain';
        else t.terrain = 'water';
      }
    }

    // Smooth a pass — group like terrain
    for (var pass = 0; pass < 2; pass++) {
      var copy = JSON.parse(JSON.stringify(map));
      for (var r = 0; r < MAP_H; r++) {
        for (var c = 0; c < MAP_W; c++) {
          var counts = {};
          var ns = neighbors(c, r);
          counts[copy[r][c].terrain] = 1;
          for (var i = 0; i < ns.length; i++) {
            var tt = copy[ns[i][1]][ns[i][0]].terrain;
            counts[tt] = (counts[tt] || 0) + 1;
          }
          var best = copy[r][c].terrain, bestN = 0;
          for (var k in counts) if (counts[k] > bestN) { best = k; bestN = counts[k]; }
          map[r][c].terrain = best;
        }
      }
    }

    // Edge water frame (small)
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        if (c === 0 || r === 0 || c === MAP_W - 1 || r === MAP_H - 1) {
          if (rnd() < 0.35) map[r][c].terrain = 'water';
        }
      }
    }

    // Sprinkle resources on grass/plains/hills
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var t = map[r][c];
        if (t.terrain === 'grass' && rnd() < 0.08) t.resource = 'wheat';
        else if (t.terrain === 'plains' && rnd() < 0.06) t.resource = 'horses';
        else if (t.terrain === 'hills' && rnd() < 0.18) t.resource = 'iron';
      }
    }

    return map;
  }

  function pickStart(map, awayFrom) {
    var minDist = 10;
    for (var tries = 0; tries < 600; tries++) {
      var c = rndInt(2, MAP_W - 3);
      var r = rndInt(2, MAP_H - 3);
      var t = map[r][c];
      if (TERRAIN[t.terrain].impassable) continue;
      if (awayFrom) {
        var d = hexDist([c, r], awayFrom);
        if (d < minDist) continue;
      }
      // ensure a few traversable neighbors
      var ok = 0;
      var ns = (function () { var prev = state; state = { map: map }; var n = neighbors(c, r); state = prev; return n; })();
      for (var i = 0; i < ns.length; i++) {
        if (!TERRAIN[map[ns[i][1]][ns[i][0]].terrain].impassable) ok++;
      }
      if (ok >= 4) return [c, r];
      // relax min distance as tries grow
      if (tries > 300) minDist = 8;
    }
    return [Math.floor(MAP_W / 2), Math.floor(MAP_H / 2)];
  }

  // =====================================================================
  // NEW GAME / SAVE / LOAD
  // =====================================================================
  function newGame(seed) {
    seed = seed || (Date.now() & 0x7fffffff);
    var map = generateMap(seed);

    state = {
      seed: seed,
      turn: 1,
      currentCiv: 'player',
      map: map,
      civs: {
        player: makeCiv('player'),
        ai:     makeCiv('ai')
      },
      cursor: { c: 0, r: 0 },
      camera: { x: 0, y: 0 },           // world pixel offset of top-left of view
      zoom: DEFAULT_ZOOM,
      mode: 'cursor',                    // 'cursor' | 'scroll'
      selected: null,                    // { c, r } of selected friendly unit
      victory: null,                     // 'player' | 'ai' | null
      log: []
    };

    var p = pickStart(map);
    var a = pickStart(map, p);

    state.cursor.c = p[0]; state.cursor.r = p[1];

    spawnStarter('player', p);
    spawnStarter('ai', a);

    state.civs.player.currentTech = 'pottery';
    state.civs.ai.currentTech = 'archery';

    recomputeVisibility('player');
    recomputeVisibility('ai');
    centerCameraOn(state.cursor.c, state.cursor.r);
    save();
  }

  function makeCiv(id) {
    return {
      id: id,
      name: CIVS[id].name,
      color: CIVS[id].color,
      gold: 10,
      science: 0,
      goldPerTurn: 0,
      sciPerTurn: 0,
      cities: [],
      units: [],
      techs: {},
      currentTech: null,
      techProgress: 0
    };
  }

  function spawnStarter(civId, pos) {
    spawnUnit(civId, 'settler', pos[0], pos[1]);
    // Find up to 2 valid neighboring spots for starter warriors
    var ns = neighbors(pos[0], pos[1]).filter(function (n) {
      var t = state.map[n[1]][n[0]];
      return !TERRAIN[t.terrain].impassable && !t.unit;
    });
    if (ns.length > 0) spawnUnit(civId, 'warrior', ns[0][0], ns[0][1]);
    if (ns.length > 1) spawnUnit(civId, 'worker',  ns[1][0], ns[1][1]);
  }

  function spawnUnit(civId, type, c, r) {
    var def = UNITS[type];
    var u = {
      id: Math.random().toString(36).slice(2, 9),
      civ: civId,
      type: type,
      c: c, r: r,
      hp: def.hp,
      maxHp: def.hp,
      moves: def.move,
      maxMoves: def.move,
      fortified: false,
      hasActed: false
    };
    var t = tileAt(c, r);
    if (t) t.unit = u;
    state.civs[civId].units.push(u);
    return u;
  }

  function save() {
    try {
      if (!state) return;
      // strip canvas-only fields
      var copy = {
        seed: state.seed,
        turn: state.turn,
        currentCiv: state.currentCiv,
        map: state.map,
        civs: state.civs,
        cursor: state.cursor,
        camera: state.camera,
        zoom: state.zoom,
        mode: state.mode,
        selected: state.selected,
        victory: state.victory
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
    } catch (e) { /* ignore quota */ }
  }
  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      if (!s.map || !s.civs) return false;
      state = s;
      state.log = state.log || [];
      // restore unit refs on tiles
      for (var r = 0; r < MAP_H; r++)
        for (var c = 0; c < MAP_W; c++) state.map[r][c].unit = null;
      ['player','ai'].forEach(function (id) {
        state.civs[id].units.forEach(function (u) {
          var t = tileAt(u.c, u.r); if (t) t.unit = u;
        });
        state.civs[id].cities.forEach(function (ct) {
          var t = tileAt(ct.c, ct.r); if (t) t.city = ct;
        });
      });
      return true;
    } catch (e) { return false; }
  }
  function hasSave() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }
  function clearSave() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // =====================================================================
  // VISIBILITY (fog of war)
  // =====================================================================
  function recomputeVisibility(civId) {
    for (var r = 0; r < MAP_H; r++)
      for (var c = 0; c < MAP_W; c++) state.map[r][c].visible[civId] = false;
    var civ = state.civs[civId];
    function reveal(c, r, range) {
      for (var rr = 0; rr < MAP_H; rr++)
        for (var cc = 0; cc < MAP_W; cc++) {
          if (hexDist([cc, rr], [c, r]) <= range) {
            state.map[rr][cc].visible[civId] = true;
            state.map[rr][cc].explored[civId] = true;
          }
        }
    }
    civ.units.forEach(function (u) { reveal(u.c, u.r, 2); });
    civ.cities.forEach(function (ct) { reveal(ct.c, ct.r, 2); });
  }

  // =====================================================================
  // CAMERA
  // =====================================================================
  function worldSize() {
    var s = ZOOM_LEVELS[state.zoom];
    return {
      w: s * SQRT3 * (MAP_W + 0.5),
      h: s * 1.5 * MAP_H + s * 0.5
    };
  }
  function clampCamera() {
    var ws = worldSize();
    if (ws.w < VIEW_W) state.camera.x = (ws.w - VIEW_W) / 2;
    else state.camera.x = Math.max(0, Math.min(state.camera.x, ws.w - VIEW_W));
    if (ws.h < VIEW_H) state.camera.y = (ws.h - VIEW_H) / 2;
    else state.camera.y = Math.max(0, Math.min(state.camera.y, ws.h - VIEW_H));
  }
  function centerCameraOn(c, r) {
    var size = ZOOM_LEVELS[state.zoom];
    var p = pixelOf(c, r, size);
    state.camera.x = p.x - VIEW_W / 2 + size * SQRT3 / 2;
    state.camera.y = p.y - VIEW_H / 2 + size;
    clampCamera();
  }
  function ensureCursorVisible() {
    var size = ZOOM_LEVELS[state.zoom];
    var p = pixelOf(state.cursor.c, state.cursor.r, size);
    var sx = p.x - state.camera.x;
    var sy = p.y - state.camera.y;
    var pad = size * 1.2;
    if (sx < pad) state.camera.x -= (pad - sx);
    if (sx > VIEW_W - pad) state.camera.x += (sx - (VIEW_W - pad));
    if (sy < pad + 30) state.camera.y -= (pad + 30 - sy);
    if (sy > VIEW_H - pad) state.camera.y += (sy - (VIEW_H - pad));
    clampCamera();
  }
  function panCamera(dx, dy) {
    state.camera.x += dx;
    state.camera.y += dy;
    clampCamera();
  }

  // =====================================================================
  // RENDER
  // =====================================================================
  function clearCanvas() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  function hexPath(cx, cy, size) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var ang = Math.PI / 180 * (60 * i - 30);
      var x = cx + size * Math.cos(ang);
      var y = cy + size * Math.sin(ang);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawMap() {
    clearCanvas();
    var size = ZOOM_LEVELS[state.zoom];
    var inset = size * 0.92;

    // Determine visible bounds for culling
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var p = pixelOf(c, r, size);
        var cx = p.x - state.camera.x + size * SQRT3 / 2;
        var cy = p.y - state.camera.y + size;
        if (cx < -size || cy < -size || cx > VIEW_W + size || cy > VIEW_H + size) continue;

        var t = state.map[r][c];
        var terrain = TERRAIN[t.terrain];
        var explored = t.explored.player;
        var visible = t.visible.player;

        // Tile fill
        if (!explored) {
          // Unexplored — leave black (transparent on additive)
          continue;
        }

        hexPath(cx, cy, inset);
        ctx.fillStyle = terrain.color;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = terrain.edge;
        ctx.stroke();

        // Dim if not currently visible (fogged)
        if (!visible) {
          hexPath(cx, cy, inset);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill();
        }

        // Terrain glyph
        if (terrain.glyph) {
          ctx.fillStyle = visible ? terrain.fg : 'rgba(120,120,140,0.5)';
          ctx.font = (size * 0.7) + 'px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(terrain.glyph, cx, cy + size * 0.05);
        }

        // Resource marker
        if (t.resource && visible) {
          ctx.fillStyle = '#ffd34d';
          ctx.beginPath();
          ctx.arc(cx + size * 0.5, cy - size * 0.5, size * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }

        // Improvement
        if (t.improvement && visible) {
          ctx.fillStyle = '#b388ff';
          ctx.font = (size * 0.35) + 'px sans-serif';
          ctx.fillText(t.improvement === 'farm' ? '✿' : '⛏', cx - size * 0.5, cy + size * 0.55);
        }

        // City
        if (t.city) {
          drawCity(cx, cy, size, t.city);
        }

        // Unit
        if (t.unit && visible) {
          drawUnit(cx, cy, size, t.unit);
        }
      }
    }

    // Movement range indicator for selected unit
    if (state.selected) {
      var su = tileAt(state.selected.c, state.selected.r);
      if (su && su.unit && su.unit.civ === 'player' && su.unit.moves > 0) {
        drawMoveRange(su.unit, size, inset);
      }
    }

    // Cursor
    if (state.mode === 'cursor' || state.selected) {
      var p2 = pixelOf(state.cursor.c, state.cursor.r, size);
      var ccx = p2.x - state.camera.x + size * SQRT3 / 2;
      var ccy = p2.y - state.camera.y + size;
      hexPath(ccx, ccy, inset);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Scroll mode crosshair (camera center marker)
    if (state.mode === 'scroll') {
      ctx.strokeStyle = '#ffb454';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#ffb454';
      ctx.shadowBlur = 8;
      var x = VIEW_W / 2, y = VIEW_H / 2;
      ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
      ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10); ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawCity(cx, cy, size, city) {
    var civ = CIVS[city.civ];
    var s = size * 0.62;
    ctx.fillStyle = civ.color;
    ctx.fillRect(cx - s / 2, cy - s / 2, s, s);
    ctx.lineWidth = 2;
    ctx.strokeStyle = civ.edge;
    ctx.strokeRect(cx - s / 2, cy - s / 2, s, s);

    ctx.fillStyle = '#001018';
    ctx.font = 'bold ' + (size * 0.32) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', cx, cy + size * 0.03);

    // Name tag
    ctx.fillStyle = '#000';
    var tw = ctx.measureText(city.name).width;
    ctx.fillRect(cx - tw / 2 - 4, cy + size * 0.55, tw + 8, 14);
    ctx.fillStyle = civ.edge;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(city.name + ' ' + city.pop, cx, cy + size * 0.55 + 7);
  }

  function drawUnit(cx, cy, size, unit) {
    var civ = CIVS[unit.civ];
    var rad = size * 0.40;
    ctx.beginPath();
    ctx.arc(cx, cy + size * 0.05, rad, 0, Math.PI * 2);
    ctx.fillStyle = civ.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = unit.civ === 'player' ? '#001018' : '#3a0d04';
    ctx.stroke();

    // Glyph
    ctx.fillStyle = '#001018';
    ctx.font = 'bold ' + (size * 0.5) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(UNITS[unit.type].glyph, cx, cy + size * 0.08);

    // HP bar if damaged
    if (unit.hp < unit.maxHp) {
      var bw = size * 0.7;
      var bh = 3;
      var bx = cx - bw / 2, by = cy - size * 0.55;
      ctx.fillStyle = '#3a0d04';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(bx, by, bw * (unit.hp / unit.maxHp), bh);
    }

    // Selected ring
    if (state.selected && state.selected.c === unit.c && state.selected.r === unit.r) {
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.05, rad + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Exhausted dot
    if (unit.civ === 'player' && unit.moves === 0 && !unit.fortified) {
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.arc(cx + size * 0.42, cy + size * 0.42, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (unit.fortified) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - size * 0.18, cy + size * 0.28, size * 0.36, size * 0.12);
    }
  }

  function drawMoveRange(unit, size, inset) {
    var visited = {};
    visited[unit.c + ',' + unit.r] = 0;
    var frontier = [[unit.c, unit.r, 0]];
    while (frontier.length) {
      var cur = frontier.shift();
      var cc = cur[0], cr = cur[1], used = cur[2];
      if (used >= unit.moves) continue;
      var ns = neighbors(cc, cr);
      for (var i = 0; i < ns.length; i++) {
        var nc = ns[i][0], nr = ns[i][1];
        var t = tileAt(nc, nr);
        if (!t || TERRAIN[t.terrain].impassable) continue;
        if (t.unit && t.unit.civ === unit.civ) continue;
        var key = nc + ',' + nr;
        var cost = used + 1;
        if (visited[key] === undefined || visited[key] > cost) {
          visited[key] = cost;
          if (!t.unit || t.unit.civ !== unit.civ) frontier.push([nc, nr, cost]);
        }
      }
    }
    var size2 = ZOOM_LEVELS[state.zoom];
    for (var key in visited) {
      var parts = key.split(',');
      var c = +parts[0], r = +parts[1];
      if (c === unit.c && r === unit.r) continue;
      var p = pixelOf(c, r, size2);
      var x = p.x - state.camera.x + size2 * SQRT3 / 2;
      var y = p.y - state.camera.y + size2;
      hexPath(x, y, inset);
      var t = tileAt(c, r);
      var enemy = t && t.unit && t.unit.civ !== unit.civ;
      ctx.fillStyle = enemy ? 'rgba(255, 68, 102, 0.28)' : 'rgba(0, 255, 136, 0.18)';
      ctx.fill();
    }
  }

  // =====================================================================
  // HUD
  // =====================================================================
  function updateHud() {
    var civ = state.civs.player;
    document.getElementById('hud-turn').textContent = state.turn;
    document.getElementById('hud-gold').textContent = civ.gold + ' (' + (civ.goldPerTurn >= 0 ? '+' : '') + civ.goldPerTurn + ')';
    document.getElementById('hud-sci').textContent = civ.currentTech
      ? civ.techProgress + '/' + TECHS[civ.currentTech].cost
      : '—';
    document.getElementById('hud-tech-name').textContent = civ.currentTech
      ? TECHS[civ.currentTech].name
      : 'No research';

    var pill = document.getElementById('mode-pill');
    pill.textContent = state.mode === 'cursor' ? 'CURSOR' : 'SCROLL';
    pill.classList.toggle('scroll', state.mode === 'scroll');

    var hint = document.getElementById('hud-hint');
    var selUnit = state.selected && tileAt(state.selected.c, state.selected.r);
    selUnit = selUnit && selUnit.unit;
    if (state.selected && !selUnit) state.selected = null;
    if (selUnit) {
      hint.textContent = UNITS[selUnit.type].name + ' ' + selUnit.moves + '/' + selUnit.maxMoves + ' moves · ⏎ act · Esc cancel';
    } else if (state.mode === 'scroll') {
      hint.textContent = 'Arrows pan · ↑↓↑↓ cursor · ←→←→ zoom';
    } else {
      hint.textContent = '↑↓↑↓ scroll · ←→←→ zoom · ⏎ act';
    }

    var ti = state.map[state.cursor.r][state.cursor.c];
    var label = TERRAIN[ti.terrain].name;
    if (ti.resource) label += ' · ' + ti.resource;
    if (ti.unit && ti.visible.player) label += ' · ' + UNITS[ti.unit.type].name + ' (' + CIVS[ti.unit.civ].name + ')';
    if (ti.city) label += ' · ' + ti.city.name;
    document.getElementById('hud-tile').textContent = label;
  }

  // =====================================================================
  // GAME LOGIC
  // =====================================================================
  function workableYields(city) {
    var food = 2, prod = 1, gold = 2;  // base city tile
    var ns = neighbors(city.c, city.r);
    ns.unshift([city.c, city.r]);
    // simulate "citizens" working pop best tiles
    var yields = [];
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (!t || TERRAIN[t.terrain].impassable) continue;
      // tile claimed by another civ? skip
      if (t.city && (t.city.c !== city.c || t.city.r !== city.r)) continue;
      var ter = TERRAIN[t.terrain];
      var f = ter.food, p = ter.prod, g = ter.gold;
      if (t.resource === 'wheat') f += 2;
      if (t.resource === 'iron') p += 2;
      if (t.resource === 'horses') p += 1;
      if (t.improvement === 'farm') f += 1;
      if (t.improvement === 'mine') p += 2;
      yields.push({ tile: t, score: f * 3 + p * 2 + g, f: f, p: p, g: g });
    }
    yields.sort(function (a, b) { return b.score - a.score; });
    var n = Math.min(city.pop, yields.length);
    for (var i = 0; i < n; i++) { food += yields[i].f; prod += yields[i].p; gold += yields[i].g; }

    // building bonuses
    if (city.buildings.granary) food += BUILDINGS.granary.food;
    if (city.buildings.market) gold += BUILDINGS.market.gold;

    return { food: food, prod: prod, gold: gold };
  }

  function cityScience(city) {
    return 1 + Math.floor(city.pop / 2);
  }

  function recomputeIncome(civId) {
    var civ = state.civs[civId];
    var gpt = 0, spt = 0;
    civ.cities.forEach(function (ct) {
      var y = workableYields(ct);
      gpt += y.gold;
      spt += cityScience(ct);
    });
    // Upkeep: military units cost 1/turn, civilians free
    var upkeep = civ.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;
    gpt -= upkeep;
    civ.goldPerTurn = gpt;
    civ.sciPerTurn = spt;
  }

  function moveUnit(unit, c, r) {
    var t = tileAt(c, r);
    if (!t) return false;
    if (TERRAIN[t.terrain].impassable) { showToast('Impassable terrain'); return false; }
    if (t.unit && t.unit.civ === unit.civ) { showToast('Friendly unit there'); return false; }
    if (unit.moves <= 0) { showToast('No moves left'); return false; }

    // Combat if enemy
    if (t.unit && t.unit.civ !== unit.civ) {
      return attack(unit, t.unit);
    }
    // Capture enemy city if no defender
    if (t.city && t.city.civ !== unit.civ) {
      var capture = !t.unit;
      if (!capture) return attack(unit, t.unit);
      captureCity(t.city, unit.civ);
    }
    // Move
    var oldT = tileAt(unit.c, unit.r);
    if (oldT) oldT.unit = null;
    unit.c = c; unit.r = r;
    unit.moves = Math.max(0, unit.moves - 1);
    unit.fortified = false;
    t.unit = unit;
    return true;
  }

  function attack(attacker, defender) {
    var aDef = UNITS[attacker.type], dDef = UNITS[defender.type];
    if (aDef.atk === 0) { showToast('Cannot attack'); return false; }
    var dTile = tileAt(defender.c, defender.r);
    var terr = TERRAIN[dTile.terrain];
    var dBonus = (terr.defBonus || 0);
    if (defender.fortified) dBonus += 0.25;
    if (dTile.city && state.civs[dTile.city.civ].id === defender.civ) {
      dBonus += dTile.city.buildings.walls ? 0.75 : 0.25;
    }

    var aPower = aDef.atk + atkTechBonus(attacker);
    var dPower = dDef.def * (1 + dBonus);
    var ratio = aPower / (aPower + dPower);

    var dmgToDef = Math.round(12 * ratio + rndInt(0, 3));
    var dmgToAtk = Math.round(12 * (1 - ratio) + rndInt(0, 3));

    defender.hp -= dmgToDef;
    attacker.hp -= dmgToAtk;
    attacker.moves = 0;

    var msg = aDef.name + ' ' + dmgToDef + ' / took ' + dmgToAtk;
    showToast(msg, attacker.civ === 'player' ? 'success' : 'error');

    if (defender.hp <= 0) {
      killUnit(defender);
      // Move into vacated tile
      var oldT = tileAt(attacker.c, attacker.r);
      if (oldT) oldT.unit = null;
      attacker.c = defender.c; attacker.r = defender.r;
      var newT = tileAt(attacker.c, attacker.r);
      if (newT.city && newT.city.civ !== attacker.civ) captureCity(newT.city, attacker.civ);
      newT.unit = attacker;
    }
    if (attacker.hp <= 0) killUnit(attacker);
    return true;
  }

  function atkTechBonus(unit) {
    if (state.civs[unit.civ].techs.iron && unit.type === 'warrior') return 2;
    return 0;
  }

  function killUnit(unit) {
    var t = tileAt(unit.c, unit.r);
    if (t && t.unit === unit) t.unit = null;
    var arr = state.civs[unit.civ].units;
    var idx = arr.indexOf(unit);
    if (idx >= 0) arr.splice(idx, 1);
    if (state.selected && state.selected.c === unit.c && state.selected.r === unit.r) {
      state.selected = null;
    }
  }

  function foundCity(unit) {
    var t = tileAt(unit.c, unit.r);
    if (!t) return;
    if (t.city) { showToast('City already here'); return; }
    if (TERRAIN[t.terrain].impassable) { showToast('Cannot found here'); return; }
    var civ = state.civs[unit.civ];
    var nameList = unit.civ === 'player'
      ? ['Helios','Aurora','Vega','Lyra','Sirius','Polaris','Orion','Caelum']
      : ['Nox','Erebus','Thanos','Vesper','Nyx','Tartarus','Mortis','Pyre'];
    var name = nameList[civ.cities.length % nameList.length];
    var isCapital = civ.cities.length === 0;
    var city = {
      civ: unit.civ,
      name: name,
      c: unit.c, r: unit.r,
      pop: 1,
      food: 0,
      foodCap: 10,
      prod: 0,
      buildings: {},
      producing: 'warrior', // default
      capital: isCapital
    };
    civ.cities.push(city);
    t.city = city;
    // Settler is consumed
    killUnit(unit);
    showToast('Founded ' + name, 'success');
  }

  function captureCity(city, newOwnerId) {
    var oldOwner = state.civs[city.civ];
    var idx = oldOwner.cities.indexOf(city);
    if (idx >= 0) oldOwner.cities.splice(idx, 1);
    city.civ = newOwnerId;
    city.pop = Math.max(1, city.pop - 1);
    city.producing = 'warrior';
    state.civs[newOwnerId].cities.push(city);
    showToast('Captured ' + city.name + '!', newOwnerId === 'player' ? 'success' : 'error');

    // Check victory: was it a capital?
    if (city.capital) {
      var loser = oldOwner.cities.length === 0 ? oldOwner.id : null;
      if (loser) declareVictory(newOwnerId, 'domination');
    }
  }

  function processCity(city) {
    var y = workableYields(city);

    // Growth
    city.food += (y.food - city.pop * 2);
    if (city.food < 0) {
      city.pop = Math.max(1, city.pop - 1);
      city.food = 0;
      showToast(city.name + ' starved', 'error');
    }
    if (city.food >= city.foodCap) {
      city.pop += 1;
      city.food = 0;
      city.foodCap = 8 + city.pop * 5;
      if (city.civ === 'player') showToast(city.name + ' grew to ' + city.pop, 'success');
    }

    // Production
    city.prod += y.prod;
    var p = city.producing;
    var cost = 0, isBuilding = false;
    if (UNITS[p]) cost = UNITS[p].cost;
    else if (BUILDINGS[p]) { cost = BUILDINGS[p].cost; isBuilding = true; }

    if (cost > 0 && city.prod >= cost) {
      city.prod -= cost;
      if (isBuilding) {
        city.buildings[p] = true;
        if (city.civ === 'player') showToast(city.name + ' built ' + BUILDINGS[p].name, 'success');
      } else {
        var spawnTile = findSpawnTile(city);
        if (spawnTile) {
          spawnUnit(city.civ, p, spawnTile[0], spawnTile[1]);
          if (city.civ === 'player') showToast(city.name + ' trained ' + UNITS[p].name, 'success');
        }
      }
      // Pick next production sensibly
      city.producing = pickNextProduction(city);
    }

  }

  function findSpawnTile(city) {
    var ct = tileAt(city.c, city.r);
    if (ct && !ct.unit) return [city.c, city.r];
    var ns = neighbors(city.c, city.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && !TERRAIN[t.terrain].impassable && !t.unit) return ns[i];
    }
    return null;
  }

  function pickNextProduction(city) {
    var civ = state.civs[city.civ];
    if (civ.cities.length < 2 && hasTech(civ, null)) return 'settler';
    // alternate warriors & helpers
    var available = availableProducibles(civ);
    if (city.civ === 'ai') {
      // AI prefers military
      if (available.indexOf('horseman') >= 0) return 'horseman';
      if (available.indexOf('archer') >= 0) return 'archer';
      return 'warrior';
    }
    return city.producing;
  }

  function availableProducibles(civ) {
    var out = [];
    for (var k in UNITS) {
      var u = UNITS[k];
      if (u.tech && !civ.techs[u.tech]) continue;
      out.push(k);
    }
    for (var k in BUILDINGS) {
      var b = BUILDINGS[k];
      if (b.tech && !civ.techs[b.tech]) continue;
      out.push(k);
    }
    return out;
  }

  function hasTech(civ, t) { return !t || civ.techs[t]; }

  function progressTech(civ) {
    if (!civ.currentTech) return;
    civ.techProgress += civ.sciPerTurn;
    var def = TECHS[civ.currentTech];
    if (civ.techProgress >= def.cost) {
      civ.techs[civ.currentTech] = true;
      civ.techProgress = 0;
      if (civ.id === 'player') showToast('Researched ' + def.name + '!', 'success');
      var done = civ.currentTech;
      civ.currentTech = null;
      // Auto-pick next if AI
      if (civ.id === 'ai') civ.currentTech = pickAiTech(civ);
      // Check science victory
      var allDone = true;
      for (var i = 0; i < TECH_ORDER.length; i++) if (!civ.techs[TECH_ORDER[i]]) { allDone = false; break; }
      if (allDone) declareVictory(civ.id, 'science');
    }
  }

  function pickAiTech(civ) {
    for (var i = 0; i < TECH_ORDER.length; i++) {
      var t = TECH_ORDER[i];
      if (civ.techs[t]) continue;
      var def = TECHS[t];
      var ok = true;
      for (var j = 0; j < def.req.length; j++) if (!civ.techs[def.req[j]]) { ok = false; break; }
      if (ok) return t;
    }
    return null;
  }

  function declareVictory(civId, kind) {
    state.victory = civId;
    showEndScreen(civId, kind);
  }

  // =====================================================================
  // TURN
  // =====================================================================
  function endTurn() {
    if (state.victory) return;
    // Player end-of-turn
    var pl = state.civs.player;
    recomputeIncome('player');
    pl.cities.forEach(processCity);
    pl.gold += pl.goldPerTurn;
    progressTech(pl);

    // AI turn
    state.currentCiv = 'ai';
    flashEndTurn();
    setTimeout(function () {
      aiTurn();

      // AI end-of-turn
      var ai = state.civs.ai;
      recomputeIncome('ai');
      ai.cities.forEach(processCity);
      ai.gold += ai.goldPerTurn;
      progressTech(ai);

      // Next turn for player
      state.turn += 1;
      state.currentCiv = 'player';
      pl.units.forEach(function (u) { u.moves = u.maxMoves; u.hasActed = false; });
      ai.units.forEach(function (u) { u.moves = u.maxMoves; u.hasActed = false; });
      recomputeVisibility('player');
      recomputeVisibility('ai');
      recomputeIncome('player');
      recomputeIncome('ai');
      // heal idle units
      [pl, ai].forEach(function (civ) {
        civ.units.forEach(function (u) {
          if (u.moves === u.maxMoves && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 2);
        });
      });
      // Auto-select next player unit with moves
      autoSelectNextUnit();
      save();
      draw();
    }, 300);
  }

  function flashEndTurn() {
    var el = document.getElementById('end-turn-flash');
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 600);
  }

  function autoSelectNextUnit() {
    var pl = state.civs.player;
    var u = pl.units.find(function (x) { return x.moves > 0 && !x.fortified; });
    if (u) {
      state.cursor.c = u.c;
      state.cursor.r = u.r;
      state.selected = { c: u.c, r: u.r };
      ensureCursorVisible();
    } else {
      state.selected = null;
    }
  }

  // =====================================================================
  // AI
  // =====================================================================
  function aiTurn() {
    var ai = state.civs.ai;
    // Move units
    ai.units.slice().forEach(function (u) {
      if (u.hp <= 0) return;
      aiMoveUnit(u);
    });
    // Cities pick production (handled in processCity)
  }

  function aiMoveUnit(u) {
    if (u.type === 'settler') {
      // Found city if good spot
      var t = tileAt(u.c, u.r);
      if (t && !t.city && !TERRAIN[t.terrain].impassable) {
        // need distance from existing cities
        var ok = true;
        state.civs.ai.cities.forEach(function (ct) {
          if (hexDist([u.c, u.r], [ct.c, ct.r]) < 4) ok = false;
        });
        if (ok && state.civs.ai.cities.length > 0) {
          foundCity(u);
          return;
        }
        if (state.civs.ai.cities.length === 0) {
          foundCity(u);
          return;
        }
      }
      // wander away
      aiWander(u);
      return;
    }
    if (u.type === 'worker') { aiWander(u); return; }

    // Military behavior: build up for ~12 turns then become aggressive
    var aggressive = state.turn >= 12;
    var homeCt = nearestFriendlyCity(u);
    if (!aggressive) {
      // Defend: stay within 2 tiles of home, attack adjacent only
      if (homeCt && hexDist([u.c, u.r], [homeCt.c, homeCt.r]) > 2) {
        aiStepToward(u, [homeCt.c, homeCt.r]);
      } else {
        var adj = adjacentEnemy(u);
        if (adj) attack(u, adj.unit);
        else aiFortifyOrWait(u);
      }
      return;
    }
    // Past aggressive threshold: also require parity — don't suicide attack
    var enemyForce = state.civs.player.units.length;
    var myForce = state.civs.ai.units.length;
    if (myForce < enemyForce) {
      // hold position
      if (homeCt && hexDist([u.c, u.r], [homeCt.c, homeCt.r]) > 3) {
        aiStepToward(u, [homeCt.c, homeCt.r]);
      } else {
        var adj2 = adjacentEnemy(u);
        if (adj2) attack(u, adj2.unit);
        else aiFortifyOrWait(u);
      }
      return;
    }
    var target = findNearestEnemy(u);
    if (target) {
      aiStepToward(u, target);
    } else {
      aiWander(u);
    }
  }

  function nearestFriendlyCity(u) {
    var best = null, bd = Infinity;
    state.civs[u.civ].cities.forEach(function (ct) {
      var d = hexDist([u.c, u.r], [ct.c, ct.r]);
      if (d < bd) { bd = d; best = ct; }
    });
    return best;
  }
  function aiFortifyOrWait(u) {
    u.fortified = true;
    u.moves = 0;
  }

  function findNearestEnemy(u) {
    var best = null, bestD = Infinity;
    var pl = state.civs.player;
    pl.units.forEach(function (e) {
      var d = hexDist([u.c, u.r], [e.c, e.r]);
      if (d < bestD) { bestD = d; best = [e.c, e.r]; }
    });
    pl.cities.forEach(function (ct) {
      var d = hexDist([u.c, u.r], [ct.c, ct.r]);
      if (d < bestD) { bestD = d; best = [ct.c, ct.r]; }
    });
    return best;
  }

  function aiStepToward(u, target) {
    while (u.moves > 0) {
      var ns = neighbors(u.c, u.r).filter(function (n) {
        var t = tileAt(n[0], n[1]);
        if (!t) return false;
        if (TERRAIN[t.terrain].impassable) return false;
        if (t.unit && t.unit.civ === u.civ) return false;
        return true;
      });
      if (ns.length === 0) break;
      ns.sort(function (a, b) {
        return hexDist(a, target) - hexDist(b, target);
      });
      var step = ns[0];
      var moved = moveUnit(u, step[0], step[1]);
      if (!moved) break;
      // If we just attacked or arrived, may be at 0 moves
    }
  }

  function aiWander(u) {
    while (u.moves > 0) {
      var ns = neighbors(u.c, u.r).filter(function (n) {
        var t = tileAt(n[0], n[1]);
        if (!t || TERRAIN[t.terrain].impassable) return false;
        if (t.unit && t.unit.civ === u.civ) return false;
        return true;
      });
      if (ns.length === 0) break;
      var step = ns[Math.floor(rnd() * ns.length)];
      if (!moveUnit(u, step[0], step[1])) break;
    }
  }

  // =====================================================================
  // INPUT
  // =====================================================================
  var keyHistory = []; // for combo detection (last 4 directional keys)
  var ACTION_KEYS = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];

  function pushKey(k) {
    var simple = k.replace('Arrow', '').toLowerCase();
    keyHistory.push({ k: simple, t: Date.now() });
    while (keyHistory.length > 4) keyHistory.shift();
    // expire entries older than 1.4s
    var cutoff = Date.now() - 1400;
    keyHistory = keyHistory.filter(function (e) { return e.t >= cutoff; });
  }
  function matchCombo(seq) {
    if (keyHistory.length < seq.length) return false;
    var tail = keyHistory.slice(-seq.length);
    for (var i = 0; i < seq.length; i++) if (tail[i].k !== seq[i]) return false;
    return true;
  }
  function consumeCombo() { keyHistory.length = 0; }

  function moveCursor(dc, dr) {
    var nc = state.cursor.c + dc;
    var nr = state.cursor.r + dr;
    if (!inBounds(nc, nr)) return;
    state.cursor.c = nc;
    state.cursor.r = nr;
    ensureCursorVisible();
  }

  function panInDirection(dc, dr) {
    var size = ZOOM_LEVELS[state.zoom];
    state.camera.x += dc * size * SQRT3;
    state.camera.y += dr * size * 1.5;
    clampCamera();
  }

  function cycleZoom() {
    state.zoom = (state.zoom + 1) % ZOOM_LEVELS.length;
    showToast('Zoom: ' + ZOOM_NAMES[state.zoom]);
    if (state.mode === 'cursor') ensureCursorVisible();
    else clampCamera();
  }

  function toggleMode() {
    state.mode = state.mode === 'cursor' ? 'scroll' : 'cursor';
    showToast(state.mode === 'cursor' ? 'Cursor mode' : 'Scroll mode');
  }

  function activate() {
    var t = state.map[state.cursor.r][state.cursor.c];

    // If selected unit and cursor moved to a destination — try to move there
    if (state.selected) {
      var sel = tileAt(state.selected.c, state.selected.r);
      var su = sel && sel.unit;
      if (su && su.civ === 'player') {
        if (state.selected.c === state.cursor.c && state.selected.r === state.cursor.r) {
          // same tile — open action menu
          openActionMenu();
        } else if (hexDist([su.c, su.r], [state.cursor.c, state.cursor.r]) === 1) {
          moveUnit(su, state.cursor.c, state.cursor.r);
          if (!su.hp || su.hp <= 0) state.selected = null;
          else state.selected = { c: su.c, r: su.r };
        } else {
          // open menu anyway
          openActionMenu();
        }
        return;
      }
    }

    // No selection — open the contextual action menu
    openActionMenu();
  }

  // =====================================================================
  // ACTION MENU
  // =====================================================================
  var openModal = null;

  function openActionMenu() {
    var t = state.map[state.cursor.r][state.cursor.c];
    var actions = [];

    if (t.unit && t.unit.civ === 'player') {
      var u = t.unit;
      state.selected = { c: u.c, r: u.r };
      var def = UNITS[u.type];

      actions.push({ icon: '⊕', title: 'Select / Move', sub: u.moves + '/' + u.maxMoves + ' moves left · arrows to step', do: function () { closeModal(); } });
      if (def.canFound) {
        actions.push({ icon: '★', title: 'Found City', sub: '30 prod start', do: function () { foundCity(u); closeModal(); draw(); } });
      }
      if (def.canImprove) {
        var canImp = ['grass','plains','hills'].indexOf(t.terrain) >= 0 && !t.improvement;
        actions.push({ icon: '⛏', title: 'Build Improvement', sub: canImp ? (t.terrain === 'hills' ? 'Mine (+2 prod)' : 'Farm (+1 food)') : 'Not buildable here', disabled: !canImp, do: function () {
          t.improvement = t.terrain === 'hills' ? 'mine' : 'farm';
          u.moves = 0;
          showToast('Improvement built', 'success');
          closeModal();
        } });
      }
      if (def.atk > 0) {
        // Attack adjacent?
        var enemyN = adjacentEnemy(u);
        actions.push({ icon: '⚔', title: 'Attack Adjacent', sub: enemyN ? UNITS[enemyN.unit.type].name + ' to ' + dirLabel(u, enemyN) : 'No adjacent enemy', disabled: !enemyN, do: function () { attack(u, enemyN.unit); closeModal(); draw(); } });
      }
      actions.push({ icon: '▣', title: u.fortified ? 'Unfortify' : 'Fortify', sub: 'Heal +2/turn, +25% defense', do: function () { u.fortified = !u.fortified; u.moves = 0; closeModal(); draw(); } });
      actions.push({ icon: '✕', title: 'Skip Unit', sub: 'End its turn', do: function () { u.moves = 0; closeModal(); autoSelectNextUnit(); draw(); } });
    }

    if (t.city && t.city.civ === 'player') {
      actions.push({ icon: '🏛', title: 'Manage ' + t.city.name, sub: 'Production · stats', do: function () { closeModal(); openCity(t.city); } });
    }

    actions.push({ icon: '◉', title: 'Research', sub: state.civs.player.currentTech ? TECHS[state.civs.player.currentTech].name + ' ' + state.civs.player.techProgress + '/' + TECHS[state.civs.player.currentTech].cost : 'Choose research', do: function () { closeModal(); openTech(); } });

    actions.push({ icon: '⏵', title: 'End Turn', sub: 'Advance one round', do: function () { closeModal(); endTurn(); } });

    var list = document.getElementById('action-list');
    list.innerHTML = '';
    actions.forEach(function (a, i) {
      var row = document.createElement('button');
      row.className = 'action-row focusable' + (a.disabled ? ' disabled' : '');
      if (a.disabled) row.setAttribute('disabled','');
      row.tabIndex = 0;
      row.innerHTML = '<div class="action-icon">' + a.icon + '</div>' +
        '<div class="action-body"><div class="action-title">' + a.title + '</div>' +
        (a.sub ? '<div class="action-sub">' + a.sub + '</div>' : '') + '</div>';
      row.addEventListener('click', function () { if (!a.disabled) a.do(); });
      list.appendChild(row);
    });

    var title = 'Tile';
    if (t.unit && t.unit.civ === 'player') title = UNITS[t.unit.type].name;
    else if (t.city) title = t.city.name;
    document.getElementById('action-title').textContent = title;
    showModal('action-menu');
  }

  function adjacentEnemy(u) {
    var ns = neighbors(u.c, u.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && t.unit && t.unit.civ !== u.civ) return { c: ns[i][0], r: ns[i][1], unit: t.unit };
    }
    return null;
  }
  function dirLabel(u, n) {
    var dc = n.c - u.c, dr = n.r - u.r;
    if (dr === -1) return 'N';
    if (dr === +1) return 'S';
    if (dc === -1) return 'W';
    if (dc === +1) return 'E';
    return '';
  }

  // =====================================================================
  // CITY SCREEN
  // =====================================================================
  function openCity(city) {
    document.getElementById('city-name').textContent = city.name + (city.capital ? ' ★' : '');
    var y = workableYields(city);
    document.getElementById('c-pop').textContent = city.pop;
    document.getElementById('c-food').textContent = (city.food | 0) + '/' + city.foodCap + ' (+' + (y.food - city.pop * 2) + ')';
    document.getElementById('c-prod').textContent = '+' + y.prod;
    var def = (city.buildings.walls ? 4 : 0) + (city.pop);
    document.getElementById('c-def').textContent = def;

    // Current production
    var p = city.producing;
    var pCost = UNITS[p] ? UNITS[p].cost : (BUILDINGS[p] ? BUILDINGS[p].cost : 0);
    var pName = UNITS[p] ? UNITS[p].name : (BUILDINGS[p] ? BUILDINGS[p].name : '—');
    var turns = pCost > 0 && y.prod > 0 ? Math.max(1, Math.ceil((pCost - city.prod) / y.prod)) : '∞';
    var pct = pCost > 0 ? Math.min(100, (city.prod / pCost) * 100) : 0;
    document.getElementById('c-current').innerHTML =
      '<div>' + pName + ' <span style="color:#888">(' + (city.prod | 0) + '/' + pCost + ', ~' + turns + 't)</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>';

    // Options
    var civ = state.civs.player;
    var avail = availableProducibles(civ);
    var list = document.getElementById('c-options');
    list.innerHTML = '';
    avail.forEach(function (k) {
      var u = UNITS[k] || BUILDINGS[k];
      if (BUILDINGS[k] && city.buildings[k]) return; // already built
      if (k === city.producing) return;
      var isB = !!BUILDINGS[k];
      var iconChar = isB ? '▢' : UNITS[k].glyph;
      var sub = (isB ? 'Building' : 'Unit') + ' · ' + u.cost + ' prod';
      var row = document.createElement('button');
      row.className = 'action-row focusable';
      row.innerHTML = '<div class="action-icon">' + iconChar + '</div>' +
        '<div class="action-body"><div class="action-title">' + u.name + '</div>' +
        '<div class="action-sub">' + sub + '</div></div>';
      row.addEventListener('click', function () {
        city.producing = k;
        showToast('Producing ' + u.name);
        openCity(city); // refresh
      });
      list.appendChild(row);
    });

    showModal('city-screen');
  }

  // =====================================================================
  // TECH SCREEN
  // =====================================================================
  function openTech() {
    var civ = state.civs.player;
    var cur = document.getElementById('tech-current');
    if (civ.currentTech) {
      var def = TECHS[civ.currentTech];
      var pct = (civ.techProgress / def.cost) * 100;
      cur.innerHTML = '<b>' + def.name + '</b> — ' + civ.techProgress + '/' + def.cost + ' (+' + civ.sciPerTurn + '/turn)<br>' +
        '<span style="color:#888;font-size:11px">Unlocks: ' + def.unlocks + '</span>' +
        '<div class="bar s" style="margin-top:6px"><i style="width:' + pct + '%"></i></div>';
    } else {
      cur.textContent = 'No research. Pick one:';
    }

    var list = document.getElementById('tech-list');
    list.innerHTML = '';
    TECH_ORDER.forEach(function (k) {
      var def = TECHS[k];
      var done = !!civ.techs[k];
      var canResearch = def.req.every(function (r) { return civ.techs[r]; }) && !done;
      var row = document.createElement('button');
      row.className = 'action-row focusable' + ((!canResearch || k === civ.currentTech) ? ' disabled' : '');
      if (!canResearch || k === civ.currentTech) row.setAttribute('disabled','');
      var status = done ? 'Researched' :
                   k === civ.currentTech ? 'In progress' :
                   canResearch ? (def.cost + ' science') :
                   'Requires: ' + def.req.map(function (r) { return TECHS[r].name; }).join(', ');
      row.innerHTML = '<div class="action-icon">' + (done ? '✓' : '◆') + '</div>' +
        '<div class="action-body"><div class="action-title">' + def.name + '</div>' +
        '<div class="action-sub">' + status + ' · ' + def.unlocks + '</div></div>';
      row.addEventListener('click', function () {
        if (!canResearch || k === civ.currentTech) return;
        civ.currentTech = k;
        civ.techProgress = 0;
        showToast('Researching ' + def.name);
        openTech();
        updateHud();
      });
      list.appendChild(row);
    });
    showModal('tech-screen');
  }

  // =====================================================================
  // END SCREEN
  // =====================================================================
  function showEndScreen(winner, kind) {
    var title = document.getElementById('end-title');
    var detail = document.getElementById('end-detail');
    if (winner === 'player') {
      title.textContent = 'Victory';
      title.style.color = '#00ff88';
      detail.textContent = (kind === 'domination' ? 'You captured every rival capital.' : 'You researched every technology.');
    } else {
      title.textContent = 'Defeat';
      title.style.color = '#ff4466';
      detail.textContent = (kind === 'domination' ? CIVS.ai.name + ' took your capital.' : CIVS.ai.name + ' completed all research first.');
    }
    showModal('end-screen');
  }

  // =====================================================================
  // MODAL CONTROL
  // =====================================================================
  function showModal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (openModal && openModal !== id) {
      document.getElementById(openModal).classList.add('hidden');
    }
    el.classList.remove('hidden');
    openModal = id;
    setTimeout(function () {
      var f = el.querySelector('.focusable:not([disabled])');
      if (f) f.focus();
    }, 10);
  }
  function closeModal() {
    if (!openModal) return;
    document.getElementById(openModal).classList.add('hidden');
    openModal = null;
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }

  // =====================================================================
  // TOAST
  // =====================================================================
  var toastTimer = null;
  function showToast(msg, type) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast visible' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('visible'); }, 2200);
  }

  // =====================================================================
  // KEY HANDLER
  // =====================================================================
  function isModalOpen() { return !!openModal; }

  function onKeyDown(e) {
    var k = e.key;
    // If a modal is open, route keys to focus manager
    if (isModalOpen()) {
      if (k === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (ACTION_KEYS.indexOf(k) >= 0) { e.preventDefault(); moveModalFocus(k); return; }
      if (k === 'Enter') {
        e.preventDefault();
        var a = document.activeElement;
        if (a && a.classList.contains('focusable')) a.click();
        return;
      }
      return;
    }

    // Title screen
    if (!isGameVisible()) {
      if (ACTION_KEYS.indexOf(k) >= 0) { e.preventDefault(); moveModalFocus(k); return; }
      if (k === 'Enter') {
        e.preventDefault();
        var a = document.activeElement;
        if (a && a.classList.contains('focusable')) a.click();
      }
      return;
    }

    // Game keys
    if (ACTION_KEYS.indexOf(k) >= 0) {
      e.preventDefault();
      pushKey(k);

      // Combo: ↑↓↑↓ toggles mode
      if (matchCombo(['up','down','up','down']) || matchCombo(['down','up','down','up'])) {
        toggleMode();
        consumeCombo();
        draw();
        return;
      }
      // Combo: ←→←→ cycles zoom
      if (matchCombo(['left','right','left','right']) || matchCombo(['right','left','right','left'])) {
        cycleZoom();
        consumeCombo();
        draw();
        return;
      }

      // Otherwise, move cursor or pan
      var dc = 0, dr = 0;
      if (k === 'ArrowUp') dr = -1;
      else if (k === 'ArrowDown') dr = +1;
      else if (k === 'ArrowLeft') dc = -1;
      else if (k === 'ArrowRight') dc = +1;

      if (state.mode === 'cursor') {
        moveCursor(dc, dr);
        // Auto-follow if a friendly unit moved
        if (state.selected) {
          var su = tileAt(state.selected.c, state.selected.r);
          if (su && su.unit && hexDist([su.unit.c, su.unit.r], [state.cursor.c, state.cursor.r]) === 1) {
            // Don't auto-move; let user press Enter to confirm.
          }
        }
      } else {
        panInDirection(dc, dr);
      }
      draw();
      return;
    }

    if (k === 'Enter') {
      e.preventDefault();
      activate();
      draw();
    } else if (k === 'Escape') {
      e.preventDefault();
      if (state.selected) { state.selected = null; draw(); }
    } else if (k === 'm' || k === 'M') {
      e.preventDefault();
      toggleMode(); draw();
    } else if (k === 'z' || k === 'Z') {
      e.preventDefault();
      cycleZoom(); draw();
    } else if (k === 'e' || k === 'E') {
      e.preventDefault();
      endTurn();
    } else if (k === 't' || k === 'T') {
      e.preventDefault();
      openTech();
    }
  }

  function moveModalFocus(k) {
    var modal = document.getElementById(openModal) || document.getElementById('title');
    if (!modal) return;
    var foc = Array.from(modal.querySelectorAll('.focusable:not([disabled])'));
    if (foc.length === 0) return;
    var cur = document.activeElement;
    var i = foc.indexOf(cur);
    if (i === -1) { foc[0].focus(); return; }
    var next = i;
    if (k === 'ArrowUp' || k === 'ArrowLeft') next = i === 0 ? foc.length - 1 : i - 1;
    else next = i === foc.length - 1 ? 0 : i + 1;
    foc[next].focus();
    foc[next].scrollIntoView({ block: 'nearest' });
  }

  function isGameVisible() {
    return !document.getElementById('game').classList.contains('hidden');
  }

  // =====================================================================
  // SCREEN NAVIGATION
  // =====================================================================
  function showScreen(id) {
    ['title','game','action-menu','city-screen','tech-screen','help-screen','end-screen'].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.classList.add('hidden');
    });
    var t = document.getElementById(id);
    if (t) t.classList.remove('hidden');
    if (id === 'game') {
      openModal = null;
      draw();
    } else {
      openModal = (id === 'title') ? null : id;
      setTimeout(function () {
        var f = t.querySelector('.focusable:not([disabled])');
        if (f) f.focus();
      }, 10);
    }
  }

  function backToTitle() {
    showScreen('title');
    setupTitleButtons();
  }

  function setupTitleButtons() {
    var contBtn = document.getElementById('continue-btn');
    if (hasSave()) {
      contBtn.classList.remove('disabled');
      contBtn.removeAttribute('disabled');
    } else {
      contBtn.classList.add('disabled');
      contBtn.setAttribute('disabled', '');
    }
  }

  // =====================================================================
  // DRAW
  // =====================================================================
  function draw() {
    if (!state) return;
    drawMap();
    updateHud();
  }

  // =====================================================================
  // CLICK ROUTING (for buttons via Enter)
  // =====================================================================
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;
    switch (action) {
      case 'new-game':
        clearSave();
        newGame();
        showScreen('game');
        break;
      case 'continue-game':
        if (!hasSave()) return;
        if (load()) showScreen('game');
        break;
      case 'show-help':
        showScreen('help-screen');
        break;
      case 'back':
        if (openModal === 'help-screen') { showScreen('title'); setupTitleButtons(); break; }
        closeModal();
        break;
      case 'restart':
        clearSave();
        newGame();
        showScreen('game');
        break;
      case 'back-to-title':
        backToTitle();
        break;
    }
  });

  // =====================================================================
  // INIT
  // =====================================================================
  function init() {
    canvas = document.getElementById('map');
    ctx = canvas.getContext('2d');
    document.addEventListener('keydown', onKeyDown);
    setupTitleButtons();
    showScreen('title');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
