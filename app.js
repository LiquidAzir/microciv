(function () {
  'use strict';

  // =====================================================================
  // CONSTANTS
  // =====================================================================
  var STORAGE_KEY = 'mdg_microciv_v1';
  var MAP_W = 14, MAP_H = 14;
  var ZOOM_LEVELS = [26, 44, 64];       // hex radius in px — far / normal / close
  var ZOOM_NAMES  = ['FAR', 'NORMAL', 'CLOSE'];
  var DEFAULT_ZOOM = 1;
  var SQRT3 = Math.sqrt(3);
  var VIEW_W = 600, VIEW_H = 540;

  var TERRAIN = {
    grass:    { name: 'Grass',    food: 2, prod: 0, gold: 0, color: '#1f4a2a', edge: '#3c8a52', glyph: '',  fg: '#5cb070' },
    plains:   { name: 'Plains',   food: 1, prod: 1, gold: 0, color: '#4a3e1a', edge: '#a08648', glyph: '',  fg: '#d4b878' },
    forest:   { name: 'Forest',   food: 1, prod: 2, gold: 0, color: '#143a1c', edge: '#2a6638', glyph: '♣', fg: '#4ca860' },
    hills:    { name: 'Hills',    food: 1, prod: 2, gold: 0, defBonus: 0.5, color: '#4a3618', edge: '#a07840', glyph: '▴', fg: '#d4a060' },
    mountain: { name: 'Mountain', food: 0, prod: 0, gold: 0, impassable: true, color: '#2c2832', edge: '#6c5878', glyph: '▲', fg: '#c2a8d0' },
    desert:   { name: 'Desert',   food: 0, prod: 1, gold: 1, color: '#6a5418', edge: '#c89858', glyph: '·', fg: '#e8c878' },
    tundra:   { name: 'Tundra',   food: 0, prod: 1, gold: 0, color: '#2e3c44', edge: '#7088a0', glyph: '',  fg: '#b8d4dc' },
    water:    { name: 'Sea',      food: 1, prod: 0, gold: 1, impassable: true, color: '#0a2848', edge: '#3060a0', glyph: '~', fg: '#5a92d0' },
    volcano:  { name: 'Volcano',  food: 0, prod: 1, gold: 0, impassable: true, wonder: true, color: '#1a0a08', edge: '#5a1810', glyph: '',  fg: '#ff6a3a' },
    geyser:   { name: 'Geyser',   food: 2, prod: 0, gold: 1, wonder: true, color: '#0a2c3c', edge: '#3080a0', glyph: '',  fg: '#7ce5ff' }
  };

  var RESOURCES = {
    wheat:  { label: 'Wheat',  terrains: ['grass'],            yield: { food: 2 }, accent: '#ffd34d', dark: '#7a4f10' },
    cattle: { label: 'Cattle', terrains: ['plains','grass'],   yield: { food: 1, prod: 1 }, accent: '#c08a55', dark: '#3a2410' },
    fish:   { label: 'Fish',   terrains: ['water'],            yield: { food: 2, gold: 1 }, accent: '#5ad4e6', dark: '#1a4a5a' },
    iron:   { label: 'Iron',   terrains: ['hills'],            yield: { prod: 2 }, accent: '#c8c8d4', dark: '#3a3a48' },
    copper: { label: 'Copper', terrains: ['hills'],            yield: { prod: 1, gold: 1 }, accent: '#e08c4a', dark: '#5a2810' },
    gold:   { label: 'Gold',   terrains: ['hills','desert'],   yield: { gold: 3 }, accent: '#ffd700', dark: '#7a5a00' },
    gems:   { label: 'Gems',   terrains: ['hills'],            yield: { gold: 3 }, accent: '#b388ff', dark: '#3a1a5a' },
    horses: { label: 'Horses', terrains: ['plains'],           yield: { food: 1, prod: 1 }, accent: '#d8a87a', dark: '#3a2010' }
  };

  var UNITS = {
    settler:  { name: 'Settler',  cost: 30, hp: 8,  atk: 0, def: 1, move: 2, glyph: '☗', tech: null,        civilian: true, canFound: true },
    worker:   { name: 'Worker',   cost: 20, hp: 8,  atk: 0, def: 1, move: 2, glyph: '⚒', tech: null,        civilian: true, canImprove: true },
    warrior:  { name: 'Warrior',  cost: 15, hp: 14, atk: 4, def: 3, move: 2, glyph: '⚔', tech: null },
    archer:   { name: 'Archer',   cost: 25, hp: 10, atk: 5, def: 2, move: 2, glyph: '➹', tech: 'archery',   ranged: 2 },
    horseman: { name: 'Horseman', cost: 35, hp: 14, atk: 6, def: 3, move: 4, glyph: '♞', tech: 'husbandry' },
    raider:   { name: 'Raider',   cost: 0,  hp: 10, atk: 3, def: 2, move: 2, glyph: '⚔', tech: null,        barb: true }
  };

  var BUILDINGS = {
    granary: { name: 'Granary', cost: 30, food: 2, tech: 'pottery'  },
    walls:   { name: 'Walls',   cost: 40, def: 4,  tech: 'masonry'  },
    market:  { name: 'Market',  cost: 50, gold: 3, tech: 'currency' },
    // World Wonders — each unique per game, first civ to finish locks it out
    hanging_gardens:  { name: 'Hanging Gardens',  cost:  90, tech: 'pottery',   wonder: true, perCityFood: 2,
                        lore: '+2 food in every city you own' },
    oracle:           { name: 'Oracle',           cost:  80, tech: 'pottery',   wonder: true, oneShotScience: 50,
                        lore: 'Instantly gain 50 research' },
    great_wall:       { name: 'Great Wall',       cost: 110, tech: 'masonry',   wonder: true, cityDefMult: 0.5,
                        lore: '+50% defense in every city you own' },
    great_lighthouse: { name: 'Great Lighthouse', cost: 100, tech: 'currency',  wonder: true, perWaterGold: 1,
                        lore: '+1 gold per water tile worked' },
    forge:            { name: 'Forge',            cost: 110, tech: 'iron',      wonder: true, perHillProd: 1,
                        lore: '+1 prod per hills tile worked' }
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

  // Selectable factions. Each gives ONE small bonus.
  var FACTIONS = {
    solaris: {
      name: 'Solaris',
      title: 'Children of the Sun',
      color: '#00d4ff', edge: '#7ce5ff',
      bonus: { food: 1 },
      lore: '+1 food in every city. Abundant harvests power faster growth.'
    },
    umbra: {
      name: 'Umbra',
      title: 'Shadowborn',
      color: '#ff7a59', edge: '#ffb59a',
      bonus: { atk: 1 },
      lore: '+1 attack on military units. Every soldier hits harder.'
    },
    tellus: {
      name: 'Tellus',
      title: 'Earthen Founders',
      color: '#b388ff', edge: '#d4b8ff',
      bonus: { gold: 1 },
      lore: '+1 gold in every city. Coffers fill faster for upkeep and trade.'
    }
  };
  var FACTION_ORDER = ['solaris', 'umbra', 'tellus'];

  // City name pools per faction
  var CITY_NAMES = {
    solaris: ['Helios','Aurora','Vega','Lyra','Sirius','Polaris','Orion','Caelum'],
    umbra:   ['Nox','Erebus','Thanos','Vesper','Nyx','Tartarus','Mortis','Pyre'],
    tellus:  ['Terra','Gaia','Atlas','Cybele','Demeter','Pomona','Faunus','Vertumnus']
  };

  // CIVS is the runtime per-side mapping; filled at newGame() from FACTIONS
  var CIVS = {
    player: { name: 'Solaris', color: '#00d4ff', edge: '#7ce5ff' },
    ai:     { name: 'Umbra',   color: '#ff7a59', edge: '#ffb59a' },
    barb:   { name: 'Raiders', color: '#7a7888', edge: '#b8b6c4' }
  };

  function applyFaction(sideId, factionId) {
    var f = FACTIONS[factionId];
    CIVS[sideId].name = f.name;
    CIVS[sideId].color = f.color;
    CIVS[sideId].edge = f.edge;
  }
  function factionOf(sideId) {
    return FACTIONS[state.civs[sideId].faction] || FACTIONS.solaris;
  }

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

  function neighborDeltas(r) {
    var even = (r & 1) === 0;
    // Order: E, W, NE, NW, SE, SW
    return even
      ? [[+1,0],[-1,0],[0,-1],[-1,-1],[0,+1],[-1,+1]]
      : [[+1,0],[-1,0],[+1,-1],[0,-1],[+1,+1],[0,+1]];
  }

  function neighbors(c, r) {
    var deltas = neighborDeltas(r);
    var out = [];
    for (var i = 0; i < 6; i++) {
      var nc = c + deltas[i][0], nr = r + deltas[i][1];
      if (inBounds(nc, nr)) out.push([nc, nr]);
    }
    return out;
  }

  // Returns array of 6 entries; null for out-of-bounds. Order matches edges below.
  function neighborsAll(c, r) {
    var deltas = neighborDeltas(r);
    var out = [];
    for (var i = 0; i < 6; i++) {
      var nc = c + deltas[i][0], nr = r + deltas[i][1];
      out.push(inBounds(nc, nr) ? [nc, nr] : null);
    }
    return out;
  }

  // Tiles within `range` of (c,r) by hex distance
  function tilesInRange(c, r, range) {
    var out = [];
    for (var rr = Math.max(0, r - range); rr <= Math.min(MAP_H - 1, r + range); rr++) {
      for (var cc = Math.max(0, c - range); cc <= Math.min(MAP_W - 1, c + range); cc++) {
        if (hexDist([c, r], [cc, rr]) <= range) out.push([cc, rr]);
      }
    }
    return out;
  }

  function cultureRange(city) {
    if (city.pop >= 6) return 3;
    if (city.pop >= 3) return 2;
    return 1;
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
      village: null,     // null or { reward: 'gold' | 'worker' | 'science' | 'pop' }
      owner: null,       // 'player' | 'ai' | null — territorial control
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

    // Base terrain noise with climate bands.
    // Latitude is r normalized to 0..1 where 0=north (cold), 1=south (hot).
    for (var r = 0; r < MAP_H; r++) {
      var lat = r / (MAP_H - 1);
      var cold = Math.max(0, 1 - lat * 2.2);        // strong near top
      var hot  = Math.max(0, (lat - 0.55) * 2.2);   // strong near bottom
      for (var c = 0; c < MAP_W; c++) {
        var t = map[r][c];
        var roll = rnd();
        // Cold band: tundra dominant near top
        if (cold > 0.5 && roll < 0.55) { t.terrain = 'tundra'; continue; }
        if (cold > 0.2 && roll < 0.25) { t.terrain = 'tundra'; continue; }
        // Hot band: desert dominant near bottom
        if (hot > 0.5 && roll < 0.55) { t.terrain = 'desert'; continue; }
        if (hot > 0.2 && roll < 0.30) { t.terrain = 'desert'; continue; }
        // Temperate
        if (roll < 0.34) t.terrain = 'grass';
        else if (roll < 0.58) t.terrain = 'plains';
        else if (roll < 0.74) t.terrain = 'forest';
        else if (roll < 0.85) t.terrain = 'hills';
        else if (roll < 0.91) t.terrain = 'desert';
        else if (roll < 0.96) t.terrain = 'mountain';
        else t.terrain = 'water';
      }
    }

    // Light smoothing — one pass only, and keep the original terrain unless
    // a neighbor type clearly outnumbers it (>=3) so variety survives.
    var copy = JSON.parse(JSON.stringify(map));
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var counts = {};
        var ns = neighbors(c, r);
        for (var i = 0; i < ns.length; i++) {
          var tt = copy[ns[i][1]][ns[i][0]].terrain;
          counts[tt] = (counts[tt] || 0) + 1;
        }
        var here = copy[r][c].terrain;
        var best = here, bestN = (counts[here] || 0) + 1;
        for (var k in counts) {
          if (counts[k] > bestN && k !== here) { best = k; bestN = counts[k]; }
        }
        if (bestN >= 4) map[r][c].terrain = best;
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

    // Sprinkle resources across the map based on terrain compatibility
    var resourceList = Object.keys(RESOURCES);
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var t = map[r][c];
        if (t.resource) continue;
        var candidates = resourceList.filter(function (k) {
          return RESOURCES[k].terrains.indexOf(t.terrain) >= 0;
        });
        if (!candidates.length) continue;
        // Per-terrain density: bias for richer biomes
        var density = {
          grass:   0.13, plains:  0.13, forest:  0.05,
          hills:   0.30, mountain:0.00, desert:  0.10,
          water:   0.10
        }[t.terrain] || 0;
        if (rnd() < density) {
          t.resource = candidates[Math.floor(rnd() * candidates.length)];
        }
      }
    }

    // Place one Volcano and one Geyser in random valid interior spots
    placeWonder(map, 'volcano', ['mountain','hills','plains']);
    placeWonder(map, 'geyser',  ['grass','plains','forest']);

    // Scatter ~8 tribal villages
    placeVillages(map, 8);

    return map;
  }

  function placeVillages(map, n) {
    var rewards = ['gold', 'worker', 'science', 'pop'];
    for (var k = 0; k < n; k++) {
      for (var tries = 0; tries < 100; tries++) {
        var c = rndInt(1, MAP_W - 2);
        var r = rndInt(1, MAP_H - 2);
        var t = map[r][c];
        var ter = TERRAIN[t.terrain];
        if (ter.impassable || ter.wonder) continue;
        if (t.village || t.resource) continue;
        // Spread out — no two villages within 2 hexes
        var tooClose = false;
        for (var rr = Math.max(0, r-2); rr <= Math.min(MAP_H-1, r+2) && !tooClose; rr++) {
          for (var cc = Math.max(0, c-2); cc <= Math.min(MAP_W-1, c+2) && !tooClose; cc++) {
            if (map[rr][cc].village) tooClose = true;
          }
        }
        if (tooClose) continue;
        t.village = { reward: rewards[Math.floor(rnd() * rewards.length)] };
        break;
      }
    }
  }

  function placeWonder(map, kind, prefer) {
    for (var tries = 0; tries < 200; tries++) {
      var c = rndInt(2, MAP_W - 3);
      var r = rndInt(2, MAP_H - 3);
      var t = map[r][c];
      if (prefer.indexOf(t.terrain) < 0) continue;
      // ensure no other wonder nearby
      var ok = true;
      for (var rr = Math.max(0, r-2); rr <= Math.min(MAP_H-1, r+2) && ok; rr++) {
        for (var cc = Math.max(0, c-2); cc <= Math.min(MAP_W-1, c+2) && ok; cc++) {
          if (TERRAIN[map[rr][cc].terrain].wonder) ok = false;
        }
      }
      if (!ok) continue;
      t.terrain = kind;
      t.resource = null;
      return;
    }
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
  function newGame(seed, playerFaction) {
    seed = seed || (Date.now() & 0x7fffffff);
    playerFaction = playerFaction || 'solaris';
    if (!FACTIONS[playerFaction]) playerFaction = 'solaris';
    var others = FACTION_ORDER.filter(function (f) { return f !== playerFaction; });
    var aiFaction = others[Math.floor(Math.random() * others.length)];

    applyFaction('player', playerFaction);
    applyFaction('ai', aiFaction);

    var map = generateMap(seed);

    state = {
      seed: seed,
      turn: 1,
      currentCiv: 'player',
      map: map,
      civs: {
        player: makeCiv('player', playerFaction),
        ai:     makeCiv('ai', aiFaction),
        barb:   makeBarbCiv()
      },
      cursor: { c: 0, r: 0 },
      camera: { x: 0, y: 0 },           // world pixel offset of top-left of view
      zoom: DEFAULT_ZOOM,
      mode: 'cursor',                    // 'cursor' | 'scroll'
      selected: null,                    // { c, r } of selected friendly unit
      victory: null,                     // 'player' | 'ai' | null
      log: [],
      turnLog: [],
      wondersBuilt: {}                   // wonder id -> civ id who built it
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
    recomputeBorders();
    centerCameraOn(state.cursor.c, state.cursor.r);
    save();
  }

  function makeCiv(id, factionId) {
    return {
      id: id,
      faction: factionId || 'solaris',
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

  function makeBarbCiv() {
    return {
      id: 'barb',
      name: 'Raiders',
      color: CIVS.barb.color,
      gold: 0,
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
        victory: state.victory,
        wondersBuilt: state.wondersBuilt
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
      state.turnLog = state.turnLog || [];
      state.wondersBuilt = state.wondersBuilt || {};
      if (!state.civs.barb) state.civs.barb = makeBarbCiv();
      // Backfill missing tile fields from older saves
      for (var rr = 0; rr < MAP_H; rr++) {
        for (var cc = 0; cc < MAP_W; cc++) {
          var tl = state.map[rr][cc];
          if (tl.village === undefined) tl.village = null;
          if (tl.owner === undefined) tl.owner = null;
        }
      }
      // Re-apply faction so CIVS colors/names match the saved game
      ['player','ai'].forEach(function (id) {
        var fid = state.civs[id].faction || (id === 'player' ? 'solaris' : 'umbra');
        state.civs[id].faction = fid;
        applyFaction(id, fid);
        state.civs[id].name = CIVS[id].name;
        state.civs[id].color = CIVS[id].color;
      });
      // restore unit refs on tiles
      for (var r = 0; r < MAP_H; r++)
        for (var c = 0; c < MAP_W; c++) state.map[r][c].unit = null;
      ['player','ai','barb'].forEach(function (id) {
        state.civs[id].units.forEach(function (u) {
          var t = tileAt(u.c, u.r); if (t) t.unit = u;
        });
        (state.civs[id].cities || []).forEach(function (ct) {
          var t = tileAt(ct.c, ct.r); if (t) t.city = ct;
        });
      });
      recomputeBorders();
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
  // TERRITORY / CULTURE
  // =====================================================================
  function recomputeBorders() {
    if (!state) return;
    for (var r = 0; r < MAP_H; r++)
      for (var c = 0; c < MAP_W; c++) state.map[r][c].owner = null;

    var all = [];
    state.civs.player.cities.forEach(function (ct) { all.push(ct); });
    state.civs.ai.cities.forEach(function (ct) { all.push(ct); });

    // Each tile is claimed by the closest city within that city's culture range.
    // Ties broken by city age (older city wins — found order = array order).
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var best = null, bestD = Infinity, bestAge = Infinity;
        for (var i = 0; i < all.length; i++) {
          var ct = all[i];
          var range = cultureRange(ct);
          var d = hexDist([c, r], [ct.c, ct.r]);
          if (d > range) continue;
          var age = ct.foundedTurn || 0;
          if (d < bestD || (d === bestD && age < bestAge)) {
            bestD = d; bestAge = age; best = ct;
          }
        }
        if (best) state.map[r][c].owner = best.civ;
      }
    }
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
    // In scroll mode, allow the camera to drift a bit past the world edges so
    // the player can always pan freely even when the map fits on screen at low zoom.
    var pad = (state && state.mode === 'scroll') ? Math.max(180, VIEW_W * 0.5) : 0;
    var minX = -pad, maxX = (ws.w - VIEW_W) + pad;
    var minY = -pad, maxY = (ws.h - VIEW_H) + pad;
    if (maxX < minX) { state.camera.x = (ws.w - VIEW_W) / 2; }
    else state.camera.x = Math.max(minX, Math.min(state.camera.x, maxX));
    if (maxY < minY) { state.camera.y = (ws.h - VIEW_H) / 2; }
    else state.camera.y = Math.max(minY, Math.min(state.camera.y, maxY));
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

  // Tile detail rendering — pixel decals per terrain type.
  // Uses seeded variation so each tile looks distinct but stable across redraws.
  function tileHash(c, r) {
    var h = ((c * 73856093) ^ (r * 19349663) ^ (state.seed * 83492791)) >>> 0;
    return h;
  }
  function tileRng(c, r) {
    var h = tileHash(c, r);
    return function () {
      h ^= h << 13; h >>>= 0;
      h ^= h >>> 17; h >>>= 0;
      h ^= h << 5; h >>>= 0;
      return (h % 100000) / 100000;
    };
  }

  function drawTerrainDetail(cx, cy, size, t, c, r) {
    var rng = tileRng(c, r);
    var px = Math.max(1, Math.round(size / 12));
    function dot(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(cx + x - w/2, cy + y - h/2, w, h);
    }
    function tree(x, y, dark, mid, light) {
      var s = px;
      // trunk
      ctx.fillStyle = '#3a2410';
      ctx.fillRect(cx + x - s/2, cy + y + s, s, s);
      // canopy as small pyramid
      ctx.fillStyle = dark;
      ctx.fillRect(cx + x - 2*s, cy + y - s, 4*s, s);
      ctx.fillStyle = mid;
      ctx.fillRect(cx + x - 1.5*s, cy + y - 2*s, 3*s, s);
      ctx.fillRect(cx + x - 2*s, cy + y, 4*s, s);
      ctx.fillStyle = light;
      ctx.fillRect(cx + x - s/2, cy + y - 2*s, s, s);
      ctx.fillRect(cx + x - 1.5*s, cy + y - s, s, s);
    }
    var terrain = t.terrain;

    if (terrain === 'grass') {
      // Subtle tufts
      for (var i = 0; i < 3; i++) {
        var x = (rng() - 0.5) * size * 1.1;
        var y = (rng() - 0.5) * size * 0.9;
        dot(x, y, px, px, '#1c5530');
        dot(x + px, y, px*0.6, px*0.6, '#2a7044');
      }
    } else if (terrain === 'plains') {
      for (var i = 0; i < 4; i++) {
        var x = (rng() - 0.5) * size * 1.1;
        var y = (rng() - 0.5) * size * 0.9;
        dot(x, y, px*0.8, px*0.4, '#a08648');
      }
    } else if (terrain === 'forest') {
      var nTrees = 3 + Math.floor(rng() * 2);
      var positions = [];
      for (var i = 0; i < nTrees; i++) {
        positions.push([(rng() - 0.5) * size * 0.9, (rng() - 0.4) * size * 0.7]);
      }
      positions.sort(function (a, b) { return a[1] - b[1]; });
      for (var i = 0; i < positions.length; i++) {
        tree(positions[i][0], positions[i][1], '#0e3018', '#1f5a2a', '#2f8a3a');
      }
    } else if (terrain === 'hills') {
      // rounded bumps
      var bumps = [
        [-size*0.35, size*0.05],
        [size*0.1, -size*0.1],
        [size*0.3, size*0.15]
      ];
      for (var i = 0; i < bumps.length; i++) {
        var bx = bumps[i][0], by = bumps[i][1];
        var bw = size * 0.36, bh = size * 0.22;
        ctx.fillStyle = '#4a3a18';
        ctx.beginPath();
        ctx.ellipse(cx + bx, cy + by, bw, bh, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = '#5a4a22';
        ctx.beginPath();
        ctx.ellipse(cx + bx - bw*0.15, cy + by, bw*0.7, bh*0.9, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
    } else if (terrain === 'mountain') {
      // overlapping triangular peaks
      function peak(px0, py0, w, h, dark, mid, light) {
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.moveTo(cx + px0, cy + py0 - h);
        ctx.lineTo(cx + px0 - w, cy + py0);
        ctx.lineTo(cx + px0 + w, cy + py0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = mid;
        ctx.beginPath();
        ctx.moveTo(cx + px0, cy + py0 - h);
        ctx.lineTo(cx + px0 - w*0.2, cy + py0 - h*0.4);
        ctx.lineTo(cx + px0 + w, cy + py0);
        ctx.lineTo(cx + px0, cy + py0);
        ctx.closePath();
        ctx.fill();
        // snow cap
        ctx.fillStyle = light;
        ctx.beginPath();
        ctx.moveTo(cx + px0, cy + py0 - h);
        ctx.lineTo(cx + px0 - w*0.3, cy + py0 - h*0.55);
        ctx.lineTo(cx + px0 + w*0.3, cy + py0 - h*0.55);
        ctx.closePath();
        ctx.fill();
      }
      peak(-size*0.25, size*0.30, size*0.30, size*0.55, '#251820', '#4a2e3e', '#e0d0e0');
      peak(size*0.18, size*0.35, size*0.35, size*0.42, '#1a1014', '#3a242e', '#c0b0c0');
    } else if (terrain === 'tundra') {
      // Sparse snow patches and tiny stunted pines
      var rng2 = tileRng(c, r);
      // base ice sheen — a few pale patches
      for (var i = 0; i < 4; i++) {
        var sx = (rng2() - 0.5) * size * 1.1;
        var sy = (rng2() - 0.5) * size * 0.9;
        var ss = size * (0.12 + rng2() * 0.10);
        ctx.fillStyle = 'rgba(220, 232, 240, 0.55)';
        ctx.beginPath();
        ctx.ellipse(cx + sx, cy + sy, ss, ss * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.ellipse(cx + sx - 1, cy + sy - 1, ss * 0.5, ss * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // a couple of stunted dark conifers
      var trees = 1 + Math.floor(rng2() * 2);
      for (var i = 0; i < trees; i++) {
        var tx = (rng2() - 0.5) * size * 0.8;
        var ty = (rng2() - 0.5) * size * 0.7;
        var th = size * 0.18;
        ctx.fillStyle = '#0a1a14';
        ctx.beginPath();
        ctx.moveTo(cx + tx - 2, cy + ty + th);
        ctx.lineTo(cx + tx, cy + ty - th);
        ctx.lineTo(cx + tx + 2, cy + ty + th);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#1c3a2a';
        ctx.fillRect(cx + tx - 1, cy + ty - 1, 2, th + 1);
        // snow cap
        ctx.fillStyle = '#fff';
        ctx.fillRect(cx + tx - 1, cy + ty - th + 1, 2, 1);
      }
    } else if (terrain === 'desert') {
      // dunes
      ctx.fillStyle = '#5c451a';
      for (var i = 0; i < 4; i++) {
        var dx = -size * 0.5 + i * size * 0.3;
        var dy = (i % 2 ? 0.15 : -0.05) * size;
        ctx.beginPath();
        ctx.ellipse(cx + dx, cy + dy, size * 0.22, size * 0.08, 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
      // sparse dots
      for (var i = 0; i < 5; i++) {
        var x = (rng() - 0.5) * size * 1.1;
        var y = (rng() - 0.5) * size * 0.9;
        dot(x, y, px*0.6, px*0.6, '#7a5d1c');
      }
    } else if (terrain === 'volcano') {
      // Large dark cone with glowing crater and smoke wisp
      var cw = size * 0.85, ch = size * 0.95;
      ctx.fillStyle = '#0a0608';
      ctx.beginPath();
      ctx.moveTo(cx - cw/2, cy + ch/2);
      ctx.lineTo(cx, cy - ch/2 + size*0.05);
      ctx.lineTo(cx + cw/2, cy + ch/2);
      ctx.closePath();
      ctx.fill();
      // mid slope
      ctx.fillStyle = '#3a1c1a';
      ctx.beginPath();
      ctx.moveTo(cx - cw/2 + px, cy + ch/2 - px);
      ctx.lineTo(cx, cy - ch/2 + size*0.10);
      ctx.lineTo(cx + cw/2 - px, cy + ch/2 - px);
      ctx.closePath();
      ctx.fill();
      // lava streams
      ctx.fillStyle = '#ff6a3a';
      ctx.fillRect(cx - px*0.5, cy - size*0.32, px, size*0.35);
      ctx.fillStyle = '#ffb04a';
      ctx.fillRect(cx - px*0.3, cy - size*0.30, px*0.6, size*0.30);
      // crater
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, cy - size*0.35, size*0.18, size*0.06, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#ff4a1a';
      ctx.beginPath();
      ctx.ellipse(cx, cy - size*0.36, size*0.12, size*0.04, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#fff8a0';
      ctx.beginPath();
      ctx.ellipse(cx - size*0.02, cy - size*0.37, size*0.04, size*0.02, 0, 0, Math.PI*2);
      ctx.fill();
      // smoke
      ctx.fillStyle = 'rgba(180,180,180,0.5)';
      ctx.beginPath();
      ctx.arc(cx - size*0.05, cy - size*0.50, size*0.07, 0, Math.PI*2);
      ctx.arc(cx + size*0.06, cy - size*0.56, size*0.06, 0, Math.PI*2);
      ctx.arc(cx - size*0.02, cy - size*0.62, size*0.05, 0, Math.PI*2);
      ctx.fill();
    } else if (terrain === 'geyser') {
      // Grass base with vertical water/steam plume
      ctx.fillStyle = '#0a1f12';
      ctx.beginPath();
      ctx.ellipse(cx, cy + size*0.30, size*0.45, size*0.12, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#1c5530';
      ctx.beginPath();
      ctx.ellipse(cx, cy + size*0.32, size*0.40, size*0.09, 0, 0, Math.PI*2);
      ctx.fill();
      // dark pool around base
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(cx, cy + size*0.15, size*0.20, size*0.07, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#1a5c7a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + size*0.14, size*0.17, size*0.05, 0, 0, Math.PI*2);
      ctx.fill();
      // vertical jet (tapered cyan column)
      ctx.fillStyle = '#7ce5ff';
      ctx.fillRect(cx - size*0.06, cy - size*0.45, size*0.12, size*0.55);
      ctx.fillStyle = '#fff';
      ctx.fillRect(cx - size*0.03, cy - size*0.42, size*0.06, size*0.55);
      // top spray (clouds)
      ctx.fillStyle = 'rgba(180,224,255,0.65)';
      ctx.beginPath();
      ctx.arc(cx, cy - size*0.55, size*0.10, 0, Math.PI*2);
      ctx.arc(cx - size*0.10, cy - size*0.50, size*0.07, 0, Math.PI*2);
      ctx.arc(cx + size*0.11, cy - size*0.50, size*0.07, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, cy - size*0.56, size*0.05, 0, Math.PI*2);
      ctx.fill();
      // droplets
      ctx.fillStyle = '#7ce5ff';
      ctx.fillRect(cx - size*0.20, cy - size*0.25, px*0.6, px*0.6);
      ctx.fillRect(cx + size*0.18, cy - size*0.20, px*0.6, px*0.6);
    } else if (terrain === 'water') {
      // wave lines
      ctx.strokeStyle = '#1c4a7a';
      ctx.lineWidth = Math.max(1, px * 0.5);
      for (var i = 0; i < 3; i++) {
        var y = -size*0.3 + i * size * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - size*0.4, cy + y);
        ctx.quadraticCurveTo(cx - size*0.1, cy + y - 3, cx, cy + y);
        ctx.quadraticCurveTo(cx + size*0.2, cy + y + 3, cx + size*0.4, cy + y);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
  }

  function drawResourceMarker(cx, cy, size, kind) {
    var res = RESOURCES[kind];
    if (!res) return;
    // Big icon centered slightly toward top of tile
    var x = cx;
    var y = cy - size * 0.28;
    var u = Math.max(1.2, size / 22);   // pixel scale
    function px(rx, ry, w, h, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x + rx * u, y + ry * u, w * u, h * u);
    }
    // Drop shadow under icon
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.18, size * 0.22, size * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    switch (kind) {
      case 'wheat': drawWheatIcon(px, res); break;
      case 'cattle': drawCattleIcon(px, res); break;
      case 'fish': drawFishIcon(px, res); break;
      case 'iron': drawIronIcon(px, res); break;
      case 'copper': drawCopperIcon(px, res); break;
      case 'gold': drawGoldIcon(px, res); break;
      case 'gems': drawGemsIcon(px, res); break;
      case 'horses': drawHorsesIcon(px, res); break;
    }
  }

  function drawWheatIcon(px, res) {
    // Bundle of wheat stalks
    px(-1, -4, 1, 1, '#000');  px(0, -4, 1, 1, '#000');  px(1, -4, 1, 1, '#000');
    px(-2, -3, 1, 1, '#000');  px(2, -3, 1, 1, '#000');
    px(-1, -3, 1, 1, res.accent);  px(0, -3, 1, 1, '#fff8a0');  px(1, -3, 1, 1, res.accent);
    px(-2, -2, 1, 1, '#000');  px(2, -2, 1, 1, '#000');
    px(-1, -2, 1, 1, '#fff8a0');  px(0, -2, 1, 1, res.accent);  px(1, -2, 1, 1, '#fff8a0');
    px(-1, -1, 1, 1, res.accent);  px(0, -1, 1, 1, res.accent);  px(1, -1, 1, 1, res.accent);
    // stalks
    px(-1, 0, 1, 3, res.dark);
    px(0, 0, 1, 3, res.dark);
    px(1, 0, 1, 3, res.dark);
    // ground tie
    px(-2, 2, 5, 1, '#000');
    px(-1, 3, 3, 1, '#3a2410');
  }

  function drawCattleIcon(px, res) {
    // Cow silhouette: body + head + horns + spots
    px(-3, -1, 6, 1, '#000');             // top of body
    px(-3, 0, 6, 3, res.dark);            // body
    px(-2, 0, 5, 2, res.accent);          // belly highlight
    px(-2, 1, 1, 1, '#fff');              // spot
    px(1, 1, 1, 1, '#fff');               // spot
    px(-3, 3, 6, 1, '#000');              // belly outline
    // legs
    px(-2, 3, 1, 2, '#000');  px(2, 3, 1, 2, '#000');
    px(-2, 3, 1, 2, res.dark); px(2, 3, 1, 2, res.dark);
    // head (right side)
    px(3, -1, 2, 1, '#000');
    px(3, 0, 2, 2, res.dark);
    px(4, 0, 1, 1, '#fff');               // eye
    // horns
    px(3, -2, 1, 1, '#fff8a0'); px(4, -2, 1, 1, '#fff8a0');
  }

  function drawFishIcon(px, res) {
    // Fish silhouette, facing right
    px(-3, -1, 1, 1, '#000');             // tail tip top
    px(-4, 0, 1, 2, '#000');              // tail
    px(-3, 0, 1, 2, res.dark);
    px(-3, 2, 1, 1, '#000');
    px(-2, -1, 6, 1, '#000');             // body top
    px(-2, 0, 6, 2, res.accent);
    px(-2, 2, 6, 1, '#000');
    px(0, 0, 2, 1, res.dark);             // back shadow
    // eye
    px(3, 0, 1, 1, '#fff');
    px(3, 1, 1, 1, '#000');
    // gill
    px(1, 1, 1, 1, res.dark);
  }

  function drawIronIcon(px, res) {
    // Cluster of metal chunks
    px(-2, 0, 1, 1, '#000');
    px(-1, -1, 3, 1, '#000');
    px(-1, 0, 3, 2, res.accent);
    px(0, 0, 1, 1, '#fff');                 // highlight
    px(2, -1, 1, 1, '#000');
    px(-2, 2, 1, 1, '#000');
    px(-1, 2, 4, 1, '#000');
    px(-1, 1, 4, 1, res.accent);
    px(0, 2, 2, 1, res.dark);
    px(1, 1, 1, 1, '#fff');
  }

  function drawCopperIcon(px, res) {
    // Copper chunk — orange-metallic with sheen
    px(-2, -1, 1, 1, '#000');
    px(-1, -2, 3, 1, '#000');
    px(2, -1, 1, 1, '#000');
    px(-1, -1, 3, 1, res.accent);
    px(-2, 0, 5, 2, res.accent);
    px(-2, 0, 1, 1, '#000'); px(2, 0, 1, 1, '#000');
    px(-1, 0, 1, 1, '#ffd0a0');             // sheen
    px(0, 1, 1, 1, '#ffd0a0');              // sheen
    px(-2, 2, 5, 1, '#000');
    px(-1, 2, 3, 1, res.dark);
    // tiny ore flecks
    px(-3, 2, 1, 1, res.accent);
    px(3, 2, 1, 1, res.accent);
  }

  function drawGoldIcon(px, res) {
    // Glittering gold pile
    px(-1, -2, 3, 1, '#000');
    px(-1, -1, 3, 1, res.accent);
    px(-2, 0, 5, 1, '#000');
    px(-2, 1, 5, 1, res.accent);
    px(-1, 1, 3, 1, '#fff8a0');
    px(-3, 2, 7, 1, '#000');
    px(-2, 2, 5, 1, res.accent);
    px(-1, 2, 3, 1, '#fff8a0');
    px(-3, 3, 7, 1, res.dark);
    // sparkle
    px(2, -3, 1, 1, '#fff');
    px(-3, -1, 1, 1, '#fff');
  }

  function drawGemsIcon(px, res) {
    // Faceted purple gem
    px(0, -3, 1, 1, '#000');
    px(-1, -2, 3, 1, '#000');
    px(-2, -1, 5, 1, '#000');
    px(-1, -1, 3, 1, '#fff');               // top facet bright
    px(-2, 0, 5, 1, res.accent);
    px(-1, 0, 1, 1, '#fff');
    px(1, 0, 1, 1, res.dark);
    px(-2, 1, 5, 1, res.accent);
    px(-1, 1, 1, 1, res.dark);
    px(-1, 2, 3, 1, '#000');
    px(0, 2, 1, 1, res.dark);
    px(0, 3, 1, 1, '#000');
  }

  function drawHorsesIcon(px, res) {
    // Galloping horse silhouette
    px(0, -2, 1, 1, '#000');                // ear
    px(-1, -1, 3, 1, '#000');               // head top
    px(-1, 0, 3, 1, res.accent);            // head
    px(-2, 0, 1, 1, '#000');                // mane
    px(0, 0, 1, 1, '#fff');                 // eye
    px(-3, 1, 6, 1, '#000');                // back top
    px(-3, 2, 6, 1, res.accent);            // body
    px(-3, 2, 1, 1, '#000');                // tail end
    px(-3, 3, 6, 1, '#000');                // body bottom
    // legs
    px(-2, 3, 1, 2, '#000');
    px(2, 3, 1, 2, '#000');
    px(-2, 3, 1, 2, res.dark);
    px(2, 3, 1, 2, res.dark);
  }

  function drawImprovement(cx, cy, size, kind) {
    if (kind === 'farm') drawFarmImprovement(cx, cy, size);
    else if (kind === 'mine') drawMineImprovement(cx, cy, size);
  }

  function drawFarmImprovement(cx, cy, size) {
    // Sized to fill ~60% of the hex, positioned just below center
    var w = size * 1.0;
    var h = size * 0.55;
    var x0 = cx - w / 2;
    var y0 = cy + size * 0.05;
    var px = Math.max(1, size / 16);

    // Dark soil base / outline
    ctx.fillStyle = '#0e0e0a';
    ctx.fillRect(x0 - px, y0 - px, w + 2*px, h + 2*px);
    ctx.fillStyle = '#3d2a14';
    ctx.fillRect(x0, y0, w, h);

    // Crop rows — alternating wheat-gold and tilled dirt
    var nRows = 4;
    var rowH = h / nRows;
    for (var i = 0; i < nRows; i++) {
      var ry = y0 + i * rowH;
      // dirt furrow
      ctx.fillStyle = '#2a1a0a';
      ctx.fillRect(x0 + px, ry, w - 2*px, rowH * 0.30);
      // wheat strip
      ctx.fillStyle = '#d4a04a';
      ctx.fillRect(x0 + px, ry + rowH * 0.30, w - 2*px, rowH * 0.55);
      // highlight
      ctx.fillStyle = '#f0c468';
      ctx.fillRect(x0 + px, ry + rowH * 0.30, w - 2*px, rowH * 0.18);
      // base shadow
      ctx.fillStyle = '#7a5a20';
      ctx.fillRect(x0 + px, ry + rowH * 0.78, w - 2*px, rowH * 0.10);
    }

    // Small barn at the right edge
    var bx = x0 + w - size * 0.30;
    var by = y0 - size * 0.18;
    var bw = size * 0.26;
    var bh = size * 0.26;
    // Walls
    ctx.fillStyle = '#5a1a14';
    ctx.fillRect(bx, by + bh * 0.4, bw, bh * 0.6);
    ctx.fillStyle = '#7a2820';
    ctx.fillRect(bx + 1, by + bh * 0.4 + 1, bw - 2, bh * 0.55);
    // Roof (triangle)
    ctx.fillStyle = '#1a0a08';
    ctx.beginPath();
    ctx.moveTo(bx - 2, by + bh * 0.4);
    ctx.lineTo(bx + bw / 2, by);
    ctx.lineTo(bx + bw + 2, by + bh * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a1410';
    ctx.beginPath();
    ctx.moveTo(bx + 1, by + bh * 0.42);
    ctx.lineTo(bx + bw / 2, by + 2);
    ctx.lineTo(bx + bw - 1, by + bh * 0.42);
    ctx.closePath();
    ctx.fill();
    // Door
    ctx.fillStyle = '#1a0a08';
    ctx.fillRect(bx + bw * 0.40, by + bh * 0.65, bw * 0.22, bh * 0.35);
    // Crossbeam on door
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(bx + bw * 0.10, by + bh * 0.55, bw * 0.80, 1);

    // Subtle outline at the bottom of the field
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(x0, y0 + h, w, px);
  }

  function drawMineImprovement(cx, cy, size) {
    // Mine entrance into a rocky outcrop, below center
    var w = size * 0.85;
    var h = size * 0.55;
    var x0 = cx - w / 2;
    var y0 = cy + size * 0.05;
    var px = Math.max(1, size / 16);

    // Rocky base outline
    ctx.fillStyle = '#0a0608';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + h);
    ctx.lineTo(x0 + w * 0.05, y0 + h * 0.20);
    ctx.lineTo(x0 + w * 0.35, y0 - h * 0.05);
    ctx.lineTo(x0 + w * 0.55, y0 + h * 0.10);
    ctx.lineTo(x0 + w * 0.80, y0 - h * 0.05);
    ctx.lineTo(x0 + w, y0 + h * 0.25);
    ctx.lineTo(x0 + w, y0 + h);
    ctx.closePath();
    ctx.fill();
    // Rock face
    ctx.fillStyle = '#3a2e34';
    ctx.beginPath();
    ctx.moveTo(x0 + px, y0 + h - px);
    ctx.lineTo(x0 + w * 0.08, y0 + h * 0.22);
    ctx.lineTo(x0 + w * 0.36, y0 + px);
    ctx.lineTo(x0 + w * 0.55, y0 + h * 0.13);
    ctx.lineTo(x0 + w * 0.80, y0 + px);
    ctx.lineTo(x0 + w - px, y0 + h * 0.28);
    ctx.lineTo(x0 + w - px, y0 + h - px);
    ctx.closePath();
    ctx.fill();
    // Highlights on rock
    ctx.fillStyle = '#5a4a52';
    ctx.fillRect(x0 + w * 0.10, y0 + h * 0.30, w * 0.10, 2);
    ctx.fillRect(x0 + w * 0.70, y0 + h * 0.35, w * 0.12, 2);
    ctx.fillRect(x0 + w * 0.40, y0 + h * 0.12, w * 0.08, 2);

    // Mine entrance — dark arch
    var ex = cx;
    var ey = y0 + h * 0.62;
    var ew = w * 0.32;
    var eh = h * 0.55;
    // Frame
    ctx.fillStyle = '#1a0e0c';
    ctx.fillRect(ex - ew/2 - 1, ey - eh/2, ew + 2, eh + 1);
    // Wood support beams (left + right + top)
    ctx.fillStyle = '#7a4a1c';
    ctx.fillRect(ex - ew/2 - 1, ey - eh/2, 3, eh);
    ctx.fillRect(ex + ew/2 - 2, ey - eh/2, 3, eh);
    ctx.fillRect(ex - ew/2 - 1, ey - eh/2, ew + 2, 3);
    ctx.fillStyle = '#5a3414';
    ctx.fillRect(ex - ew/2 - 1, ey - eh/2 + 2, ew + 2, 1);
    // Pure black interior
    ctx.fillStyle = '#000000';
    ctx.fillRect(ex - ew/2 + 2, ey - eh/2 + 3, ew - 4, eh - 4);

    // Minecart tracks leading away
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex - 4, ey + eh/2);
    ctx.lineTo(ex - 4 - size * 0.12, ey + eh/2 + size * 0.10);
    ctx.moveTo(ex + 4, ey + eh/2);
    ctx.lineTo(ex + 4 + size * 0.12, ey + eh/2 + size * 0.10);
    ctx.stroke();
    // Track ties
    ctx.lineWidth = 1;
    for (var i = 0; i < 3; i++) {
      var tx = ex - size * 0.04 + (i - 1) * size * 0.06;
      var ty = ey + eh/2 + size * 0.05 + i * 1.5;
      ctx.beginPath();
      ctx.moveTo(tx - 4, ty);
      ctx.lineTo(tx + 4, ty);
      ctx.stroke();
    }

    // Pile of ore beside entrance
    ctx.fillStyle = '#888896';
    ctx.beginPath();
    ctx.arc(ex - ew/2 - 4, y0 + h - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#aaaab8';
    ctx.fillRect(ex - ew/2 - 6, y0 + h - 5, 2, 1);

    // Pickaxe leaning against entrance
    ctx.strokeStyle = '#7a4a1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex + ew/2 + 3, y0 + h - 1);
    ctx.lineTo(ex + ew/2 + 6, y0 + h - size * 0.20);
    ctx.stroke();
    ctx.fillStyle = '#a0a0a8';
    ctx.fillRect(ex + ew/2 + 4, y0 + h - size * 0.22, 5, 2);
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
          // Unexplored — paint a faint hex outline so the map shape is
          // navigable even before you've scouted there. Cursor sits on
          // top with its own glow.
          hexPath(cx, cy, inset);
          ctx.strokeStyle = 'rgba(80, 80, 110, 0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();
          continue;
        }

        hexPath(cx, cy, inset);
        ctx.fillStyle = terrain.color;
        ctx.fill();
        ctx.save();
        ctx.clip();                      // clip decals to hex
        drawTerrainDetail(cx, cy, size, t, c, r);
        ctx.restore();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = terrain.edge;
        ctx.stroke();

        // Resource marker
        if (t.resource && visible) {
          drawResourceMarker(cx, cy, size, t.resource);
        }

        // Improvement
        if (t.improvement && visible) {
          drawImprovement(cx, cy, size, t.improvement);
        }

        // Faint territory tint (drawn under fog)
        if (t.owner) {
          hexPath(cx, cy, inset);
          ctx.fillStyle = withAlpha(CIVS[t.owner].color, visible ? 0.10 : 0.05);
          ctx.fill();
        }

        // Dim if not currently visible (fogged)
        if (!visible) {
          hexPath(cx, cy, inset);
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fill();
        }

        // Tribal village
        if (t.village && t.explored.player) {
          drawVillage(cx, cy, size);
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

    // Territorial borders (between owners)
    drawBorders(size, inset);

    // Movement range — selected unit (full) or hover preview (faint)
    if (state.selected) {
      var su = tileAt(state.selected.c, state.selected.r);
      if (su && su.unit && su.unit.civ === 'player' && su.unit.moves > 0) {
        drawMoveRange(su.unit, size, inset, 1.0);
      }
    } else {
      var ht = tileAt(state.cursor.c, state.cursor.r);
      if (ht && ht.unit && ht.unit.civ === 'player' && ht.unit.moves > 0 && state.mode === 'cursor') {
        drawMoveRange(ht.unit, size, inset, 0.45);
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

  // ----------- Sprite drawing primitives -----------
  function hexToRgb(h) {
    var m = h.replace('#', '');
    if (m.length === 3) m = m[0]+m[0]+m[1]+m[1]+m[2]+m[2];
    return [parseInt(m.slice(0,2),16), parseInt(m.slice(2,4),16), parseInt(m.slice(4,6),16)];
  }
  function rgbStr(r, g, b) { return 'rgb(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ')'; }
  function shade(hex, f) {
    var rgb = hexToRgb(hex);
    if (f < 1) return rgbStr(rgb[0]*f, rgb[1]*f, rgb[2]*f);
    return rgbStr(Math.min(255, rgb[0]+(255-rgb[0])*(f-1)),
                  Math.min(255, rgb[1]+(255-rgb[1])*(f-1)),
                  Math.min(255, rgb[2]+(255-rgb[2])*(f-1)));
  }
  function makeSpriteCtx(cx, cy, size, w, h) {
    var pxSize = Math.max(1.6, size * 1.4 / Math.max(w, h));
    var x0 = cx - (w / 2) * pxSize;
    var y0 = cy - (h / 2) * pxSize + size * 0.05;
    return function (x, y, dx, dy, c) {
      ctx.fillStyle = c;
      ctx.fillRect(x0 + x * pxSize, y0 + y * pxSize, dx * pxSize, dy * pxSize);
    };
  }
  function shadowBlob(cx, cy, size) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.42, size * 0.40, size * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function spriteColors(civ) {
    return {
      K: '#000',
      D: shade(civ.color, 0.55),
      C: civ.color,
      L: shade(civ.color, 1.35),
      W: '#ffffff',
      S: '#d4a07a',
      B: '#3a2410',
      O: '#7a4a1c',
      M: '#b8b8c2',
      m: '#5a5a66',
      Y: '#ffd34d',
      R: '#ff4a4a',
      H: '#aaffaa'
    };
  }

  // ----------- Pixel sprites (14×14 grid) -----------
  function drawWarrior(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Helmet
    p(5,1,4,1, c.K);
    p(4,2,1,3, c.K); p(9,2,1,3, c.K);
    p(5,2,4,1, c.C); p(5,3,4,1, c.D);
    p(5,2,1,1, c.L); p(8,2,1,1, c.L);
    // Crest stripe (top)
    p(6,0,2,1, c.K); p(6,1,2,1, c.L);
    // Face
    p(5,4,4,2, c.S);
    p(5,4,4,1, c.D);                  // brow shadow
    p(6,5,1,1, c.K); p(8,5,1,1, c.K); // eyes
    // Neck/jaw
    p(5,6,4,1, c.K);
    // Shoulders + arms
    p(3,6,1,1, c.K); p(10,6,1,1, c.K);
    p(3,7,1,3, c.D); p(10,7,1,3, c.D);
    p(2,6,1,1, c.K);                  // shield outline top
    // Shield (left)
    p(1,7,1,4, c.K);
    p(2,7,2,4, c.L);
    p(3,7,1,4, c.M);
    p(2,7,2,1, c.D); p(2,10,2,1, c.D);
    p(2,9,1,1, c.Y);                  // boss
    // Body armor
    p(4,6,6,1, c.K);
    p(4,7,6,3, c.C);
    p(4,7,6,1, c.D);
    p(5,8,4,1, c.L);
    p(4,10,6,1, c.K);
    // Sword (right hand)
    p(11,3,1,1, c.K);
    p(11,4,1,5, c.M);
    p(11,4,1,1, c.W);
    p(10,8,3,1, c.O);                 // hilt guard
    p(11,9,1,1, c.B);                 // grip
    // Belt
    p(4,10,6,1, c.K);
    p(4,11,6,1, c.B);
    // Legs
    p(5,12,1,2, c.K); p(8,12,1,2, c.K);
    p(6,12,2,2, c.D);
    p(5,13,1,1, c.K); p(8,13,1,1, c.K);
  }

  function drawArcher(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Hooded head
    p(5,1,4,1, c.K);
    p(4,2,6,1, c.K);
    p(4,3,1,2, c.K); p(9,3,1,2, c.K);
    p(5,2,4,1, c.D);
    p(5,3,4,2, c.C);
    p(6,3,1,1, c.L);
    // Face
    p(5,5,4,2, c.S);
    p(5,5,4,1, c.D);
    p(6,6,1,1, c.K); p(8,6,1,1, c.K);
    // Body / cloak
    p(4,7,6,1, c.K);
    p(4,8,6,3, c.C);
    p(4,8,6,1, c.D);
    p(5,9,1,2, c.L); p(8,9,1,2, c.D);
    p(4,11,6,1, c.K);
    // Bow (left, drawn)
    p(0,4,1,7, c.O);
    p(1,3,1,1, c.O); p(1,11,1,1, c.O);
    p(2,4,1,1, c.B); p(2,10,1,1, c.B);
    // Bowstring
    p(2,5,1,5, c.W);
    // Arrow
    p(3,7,5,1, c.B);
    p(2,7,1,1, c.W);                  // arrow nock
    p(8,6,1,1, c.M); p(8,8,1,1, c.M); // arrowhead
    // Quiver strap
    p(9,7,1,3, c.B);
    p(10,5,1,4, c.B);                 // quiver back
    p(10,5,1,1, c.O); p(10,8,1,1, c.O);
    // Legs
    p(5,12,1,2, c.K); p(8,12,1,2, c.K);
    p(6,12,2,2, c.B);
    p(5,13,1,1, c.K); p(8,13,1,1, c.K);
  }

  function drawSettler(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Wide hat
    p(3,2,8,1, c.K);
    p(4,3,6,1, c.D);
    p(5,2,4,1, c.C);
    // Head
    p(5,4,4,2, c.S);
    p(5,4,4,1, c.D);
    p(6,5,1,1, c.K); p(8,5,1,1, c.K);
    // Neck + shoulders
    p(5,6,4,1, c.K);
    // Cloak
    p(3,6,1,1, c.K); p(10,6,1,1, c.K);
    p(3,7,8,4, c.C);
    p(3,7,1,4, c.D); p(10,7,1,4, c.D);
    p(3,7,8,1, c.K);
    // Large bundle/pack on back
    p(4,8,6,3, c.O);
    p(4,8,6,1, c.K);
    p(4,10,6,1, c.K);
    p(5,9,4,1, c.B);
    p(7,9,1,1, c.Y);                  // a torch / lantern dot
    p(3,11,8,1, c.K);
    // Walking stick
    p(11,5,1,8, c.B);
    p(11,5,1,1, c.O);
    // Legs
    p(5,12,1,2, c.K); p(8,12,1,2, c.K);
    p(6,12,2,2, c.B);
    p(5,13,1,1, c.K); p(8,13,1,1, c.K);
  }

  function drawWorker(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Cap
    p(5,2,4,1, c.K);
    p(4,3,6,1, c.K);
    p(5,3,4,1, c.C);
    p(4,4,6,1, c.D);                  // cap brim
    // Face
    p(5,5,4,2, c.S);
    p(5,5,4,1, c.D);
    p(6,6,1,1, c.K); p(8,6,1,1, c.K);
    // Body / tunic
    p(4,7,6,1, c.K);
    p(4,8,6,3, c.C);
    p(5,9,1,1, c.L); p(8,9,1,1, c.D);
    p(4,11,6,1, c.K);
    // Right arm holding pickaxe haft
    p(10,7,1,4, c.S);
    p(10,7,1,1, c.K);
    // Pickaxe haft (diagonal-ish via steps)
    p(11,4,1,1, c.K); p(11,5,1,1, c.O);
    p(11,6,1,1, c.O); p(11,7,1,1, c.O);
    p(11,8,1,1, c.O); p(11,9,1,1, c.O);
    // Pickaxe head
    p(8,3,4,1, c.K);
    p(8,4,4,1, c.m);
    p(9,4,2,1, c.M);
    p(8,3,1,1, c.M); p(11,3,1,1, c.M);
    // Left arm holding belt
    p(3,8,1,2, c.S);
    p(3,8,1,1, c.K);
    // Belt
    p(4,11,6,1, c.B);
    // Legs
    p(5,12,1,2, c.K); p(8,12,1,2, c.K);
    p(6,12,2,2, c.B);
    p(5,13,1,1, c.K); p(8,13,1,1, c.K);
  }

  function drawHorseman(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Horse body (low rectangle, mid-screen)
    p(2,8,10,1, c.K);
    p(2,9,10,3, c.B);
    p(3,9,8,1, c.O);
    p(2,12,10,1, c.K);
    // Horse head (right)
    p(11,7,1,1, c.K);
    p(11,8,2,1, c.K);
    p(12,9,1,2, c.K);
    p(11,9,1,2, c.B);
    p(12,8,1,1, c.B);
    p(12,7,1,1, c.K);
    // Mane
    p(10,7,1,2, c.K);
    p(10,6,1,1, c.K);
    // Tail
    p(1,8,1,3, c.K);
    p(1,8,1,1, c.B);
    // Legs
    p(3,13,1,1, c.K); p(5,13,1,1, c.K);
    p(8,13,1,1, c.K); p(10,13,1,1, c.K);
    // Rider torso
    p(5,3,4,1, c.K);
    p(4,4,6,1, c.K);
    p(5,4,4,1, c.C);                  // helm
    p(5,5,4,1, c.S);                  // face
    p(6,5,1,1, c.K); p(8,5,1,1, c.K); // eyes
    p(4,6,6,1, c.K);                  // shoulders
    p(4,7,6,2, c.C);
    p(4,7,6,1, c.D);
    p(5,7,1,1, c.L);
    p(4,9,6,1, c.K);
    // Lance forward
    p(13,4,1,1, c.W);
    p(11,5,3,1, c.K);
    p(10,6,4,1, c.M);
    p(12,7,1,1, c.K);
  }

  function drawCitySprite(cx, cy, size, city) {
    var civ = CIVS[city.civ];
    shadowBlob(cx, cy, size * 1.1);
    var p = makeSpriteCtx(cx, cy, size * 1.05, 16, 14);
    var c = spriteColors(civ);
    // Ground/base
    p(2,12,12,2, '#2a2418');
    p(2,12,12,1, '#000');
    // Outer walls
    p(1,8,14,5, c.K);
    p(2,9,12,3, shade(civ.color, 0.45));
    p(2,9,12,1, c.D);
    p(2,11,12,1, c.D);
    p(3,10,2,1, c.L);
    p(11,10,2,1, c.L);
    // Crenellations
    p(2,7,2,1, c.K); p(5,7,2,1, c.K); p(8,7,2,1, c.K); p(11,7,2,1, c.K);
    p(2,8,2,1, shade(civ.color, 0.45));
    p(5,8,2,1, shade(civ.color, 0.45));
    p(8,8,2,1, shade(civ.color, 0.45));
    p(11,8,2,1, shade(civ.color, 0.45));
    // Gate
    p(7,10,2,3, c.K);
    p(7,11,2,2, c.B);
    p(7,10,2,1, c.K);
    // Central tower
    p(6,3,4,5, c.K);
    p(7,4,2,4, shade(civ.color, 0.55));
    p(7,4,2,1, c.D);
    p(7,7,2,1, c.D);
    p(7,5,1,1, c.K);                  // window
    // Tower crenellations
    p(6,2,1,1, c.K); p(7,2,1,1, c.K); p(8,2,1,1, c.K); p(9,2,1,1, c.K);
    p(7,2,1,1, c.K); p(9,2,1,1, c.K); // dark gaps
    p(6,3,1,1, c.D);
    p(8,3,1,1, c.D);
    // Flagpole + flag
    p(7,0,1,3, c.K);
    p(8,1,3,2, c.C);
    p(8,1,3,1, c.L);
    p(10,1,1,1, c.K);
    // Capital marker
    if (city.capital) {
      p(7,4,1,1, c.Y);
      p(8,4,1,1, c.Y);
    }

    // Name banner
    var fontSize = Math.max(9, Math.round(size * 0.32));
    var label = city.name + (city.capital ? ' ★' : '') + ' ' + city.pop;
    ctx.font = 'bold ' + fontSize + 'px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var tw = ctx.measureText(label).width;
    var by = cy + size * 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(cx - tw/2 - 5, by, tw + 10, fontSize + 4);
    ctx.fillStyle = civ.color;
    ctx.fillRect(cx - tw/2 - 5, by, tw + 10, 1);
    ctx.fillRect(cx - tw/2 - 5, by + fontSize + 3, tw + 10, 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, by + 2);
  }

  var UNIT_DRAW = {
    settler:  drawSettler,
    worker:   drawWorker,
    warrior:  drawWarrior,
    archer:   drawArcher,
    horseman: drawHorseman,
    raider:   drawWarrior   // reuses warrior sprite; civ color makes it grey
  };

  function drawCity(cx, cy, size, city) {
    drawCitySprite(cx, cy, size, city);
  }

  function drawVillage(cx, cy, size) {
    // Three small tents/huts around a campfire spot
    var px = Math.max(1, size / 16);
    var bx = cx, by = cy + size * 0.10;
    // ground patch
    ctx.fillStyle = 'rgba(60, 40, 20, 0.5)';
    ctx.beginPath();
    ctx.ellipse(bx, by + size * 0.10, size * 0.36, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    function tent(tx, ty, w, h, color, dark) {
      // tent body
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(tx - w/2 - 1, ty + h/2);
      ctx.lineTo(tx, ty - h/2 - 1);
      ctx.lineTo(tx + w/2 + 1, ty + h/2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tx - w/2, ty + h/2);
      ctx.lineTo(tx, ty - h/2);
      ctx.lineTo(tx + w/2, ty + h/2);
      ctx.closePath();
      ctx.fill();
      // shadow side
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(tx, ty - h/2);
      ctx.lineTo(tx + w/2, ty + h/2);
      ctx.lineTo(tx, ty + h/2);
      ctx.closePath();
      ctx.fill();
      // entrance flap
      ctx.fillStyle = '#000';
      ctx.fillRect(tx - 1, ty + h/4, 2, h/4);
    }
    // left tent
    tent(bx - size * 0.18, by - size * 0.02, size * 0.18, size * 0.22, '#a06030', '#5a3818');
    // right tent
    tent(bx + size * 0.18, by + size * 0.04, size * 0.16, size * 0.20, '#8a4828', '#4a2410');
    // center back tent (smaller)
    tent(bx,                by - size * 0.12, size * 0.14, size * 0.18, '#b87340', '#5a3818');

    // campfire — small orange flame with smoke
    ctx.fillStyle = '#3a1a08';
    ctx.fillRect(bx - 2, by + size * 0.08, 4, 2);
    ctx.fillStyle = '#ffb050';
    ctx.fillRect(bx - 1, by + size * 0.04, 2, 4);
    ctx.fillStyle = '#fff8a0';
    ctx.fillRect(bx - 0.5, by + size * 0.06, 1, 2);
    ctx.fillStyle = 'rgba(220, 220, 220, 0.45)';
    ctx.beginPath();
    ctx.arc(bx - 1, by - size * 0.08, 2, 0, Math.PI * 2);
    ctx.arc(bx + 1, by - size * 0.14, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // sparkle indicator (gift) — small star above
    var sx = cx + size * 0.34, sy = cy - size * 0.45;
    ctx.fillStyle = '#ffd34d';
    ctx.fillRect(sx - 1, sy, 3, 1);
    ctx.fillRect(sx, sy - 1, 1, 3);
    ctx.fillStyle = '#fff8a0';
    ctx.fillRect(sx, sy, 1, 1);
  }

  function drawUnit(cx, cy, size, unit) {
    var civ = CIVS[unit.civ];
    var fn = UNIT_DRAW[unit.type] || drawWarrior;
    fn(cx, cy, size, civ);

    // HP bar if damaged
    if (unit.hp < unit.maxHp) {
      var bw = size * 0.7;
      var bh = 3;
      var bx = cx - bw / 2, by = cy - size * 0.62;
      ctx.fillStyle = '#1a0509';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#ff4466';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#00ff88';
      ctx.fillRect(bx, by, bw * (unit.hp / unit.maxHp), bh);
    }

    // Selected ring
    if (state.selected && state.selected.c === unit.c && state.selected.r === unit.r) {
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.42, size * 0.42, 0, Math.PI * 2);
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Exhausted dot
    if (unit.civ === 'player' && unit.moves === 0 && !unit.fortified) {
      ctx.fillStyle = 'rgba(140,140,160,0.85)';
      ctx.beginPath();
      ctx.arc(cx + size * 0.45, cy + size * 0.45, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    if (unit.fortified) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.18, cy + size * 0.43);
      ctx.lineTo(cx - size * 0.18, cy + size * 0.55);
      ctx.lineTo(cx + size * 0.18, cy + size * 0.55);
      ctx.lineTo(cx + size * 0.18, cy + size * 0.43);
      ctx.stroke();
    }
  }

  // Returns map of "c,r" -> { cost, parent } for every tile reachable
  // within `unit.moves`. Enemies are reachable (to attack) but don't expand.
  function computeReachable(unit) {
    var maxMoves = unit.moves;
    var visited = {};
    var startKey = unit.c + ',' + unit.r;
    visited[startKey] = { cost: 0, parent: null };
    if (maxMoves <= 0) return visited;
    var frontier = [[unit.c, unit.r, 0]];
    while (frontier.length) {
      var cur = frontier.shift();
      var cc = cur[0], cr = cur[1], used = cur[2];
      if (used >= maxMoves) continue;
      var ns = neighbors(cc, cr);
      for (var i = 0; i < ns.length; i++) {
        var nc = ns[i][0], nr = ns[i][1];
        var t = tileAt(nc, nr);
        if (!t || TERRAIN[t.terrain].impassable) continue;
        // Friendly unit blocks the path (can't pass through allies)
        if (t.unit && t.unit.civ === unit.civ && !(nc === unit.c && nr === unit.r)) continue;
        var key = nc + ',' + nr;
        var cost = used + 1;
        if (!(key in visited) || visited[key].cost > cost) {
          visited[key] = { cost: cost, parent: cc + ',' + cr };
          // Stop expansion at enemy unit / enemy city (those are end-of-path attack targets)
          var enemyUnit = t.unit && t.unit.civ !== unit.civ;
          var enemyCity = t.city && t.city.civ !== unit.civ;
          if (!enemyUnit && !enemyCity) frontier.push([nc, nr, cost]);
        }
      }
    }
    return visited;
  }

  function pathTo(reachable, c, r) {
    var key = c + ',' + r;
    if (!(key in reachable)) return null;
    var path = [];
    var cur = key;
    while (cur) {
      var parts = cur.split(',');
      path.push([+parts[0], +parts[1]]);
      var rec = reachable[cur];
      cur = rec ? rec.parent : null;
    }
    path.reverse();
    return path;
  }

  // Edge i (vertices v[i] to v[i+1]) -> neighbor index in neighborsAll order
  // neighbors order: 0:E, 1:W, 2:NE, 3:NW, 4:SE, 5:SW
  // edges (vertex angle pairs): 0:E, 1:SE, 2:SW, 3:W, 4:NW, 5:NE
  var EDGE_TO_NEIGHBOR = [0, 4, 5, 1, 3, 2];

  function drawBorders(size, inset) {
    var edgeInset = inset * 0.86;
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var t = state.map[r][c];
        if (!t.owner) continue;
        if (!t.explored.player) continue;

        var p = pixelOf(c, r, size);
        var cx = p.x - state.camera.x + size * SQRT3 / 2;
        var cy = p.y - state.camera.y + size;
        // Cull off-screen tiles
        if (cx < -size || cy < -size || cx > VIEW_W + size || cy > VIEW_H + size) continue;

        var color = CIVS[t.owner].color;
        var ns = neighborsAll(c, r);

        for (var i = 0; i < 6; i++) {
          var nIdx = EDGE_TO_NEIGHBOR[i];
          var nPos = ns[nIdx];
          var nTile = nPos ? tileAt(nPos[0], nPos[1]) : null;
          var sameOwner = nTile && nTile.owner === t.owner && nTile.explored.player;
          if (sameOwner) continue;

          var ang1 = Math.PI / 180 * (60 * i - 30);
          var ang2 = Math.PI / 180 * (60 * (i + 1) - 30);
          var x1 = cx + edgeInset * Math.cos(ang1);
          var y1 = cy + edgeInset * Math.sin(ang1);
          var x2 = cx + edgeInset * Math.cos(ang2);
          var y2 = cy + edgeInset * Math.sin(ang2);

          // outer dark stroke for contrast
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 3.5;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          // inner colored stroke
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
      }
    }
  }

  function withAlpha(hex, a) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')';
  }

  function drawMoveRange(unit, size, inset, alpha) {
    if (alpha == null) alpha = 1.0;
    var visited = computeReachable(unit);
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
      var enemy = (t && t.unit && t.unit.civ !== unit.civ) || (t && t.city && t.city.civ !== unit.civ);
      var fillA = (enemy ? 0.32 : 0.16) * alpha;
      ctx.fillStyle = enemy ? 'rgba(255, 68, 102, ' + fillA + ')' : 'rgba(0, 255, 136, ' + fillA + ')';
      ctx.fill();
      if (enemy && alpha > 0.7) {
        ctx.strokeStyle = 'rgba(255, 68, 102, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
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

    // CIV chip (top HUD)
    var civName = document.getElementById('hud-civ-name');
    var civCell = document.getElementById('hud-civ');
    if (civName) civName.textContent = (CIVS.player.name || '—').toUpperCase();
    if (civCell) civCell.style.setProperty('--civ-color', CIVS.player.color || '#00d4ff');

    // MODE pill
    var pill = document.getElementById('mode-pill');
    var pillVal = pill.querySelector('.chip-val');
    pillVal.textContent = state.mode === 'cursor' ? 'CURSOR' : 'SCROLL';
    pill.classList.toggle('scroll', state.mode === 'scroll');

    // ZOOM pill — three-dot indicator (zoom 0 = far, 1 = normal, 2 = close)
    var zPill = document.getElementById('zoom-pill');
    if (zPill) {
      var disp = state.zoom === 0 ? '○○●' : state.zoom === 1 ? '○●●' : '●●●';
      zPill.querySelector('.chip-val').textContent = disp;
    }

    // UNITS pill
    var hasMovesLeft = civ.units.some(function (u) { return u.moves > 0 && !u.fortified; });
    var movesCount = civ.units.filter(function (u) { return u.moves > 0 && !u.fortified; }).length;
    var uPill = document.getElementById('units-pill');
    if (uPill) {
      uPill.querySelector('.chip-val').textContent = movesCount;
      uPill.classList.toggle('empty', movesCount === 0);
    }

    var hint = document.getElementById('hud-hint');
    var selUnit = state.selected && tileAt(state.selected.c, state.selected.r);
    selUnit = selUnit && selUnit.unit;
    if (state.selected && !selUnit) state.selected = null;

    var readyToEnd = !hasMovesLeft && !state.victory;

    if (selUnit) {
      hint.textContent = '⏎ move · esc next · ' + selUnit.moves + '/' + selUnit.maxMoves + ' mv';
    } else if (state.mode === 'scroll') {
      hint.textContent = 'arrows pan · ↑↓↑↓ cursor';
    } else if (readyToEnd) {
      hint.textContent = 'pinch any empty tile to end turn';
    } else {
      hint.textContent = 'pinch unit · esc next · ⏎ act';
    }

    var ti = state.map[state.cursor.r][state.cursor.c];
    var label;
    if (!ti.explored.player) {
      label = 'Unexplored';
    } else {
      label = TERRAIN[ti.terrain].name;
      if (ti.resource && RESOURCES[ti.resource]) label += ' · ' + RESOURCES[ti.resource].label;
      if (ti.improvement) label += ' · ' + ti.improvement;
      if (ti.unit && ti.visible.player) label += ' · ' + UNITS[ti.unit.type].name;
      if (ti.city) label += ' · ' + ti.city.name;
    }
    document.getElementById('hud-tile').textContent = label;

    var chip = document.getElementById('end-turn-chip');
    if (chip) chip.classList.toggle('ready', readyToEnd);
  }

  // =====================================================================
  // GAME LOGIC
  // =====================================================================
  function workableYields(city) {
    var food = 2, prod = 1, gold = 2;  // base city tile
    var fb = (FACTIONS[state.civs[city.civ].faction] || {}).bonus || {};
    if (fb.food) food += fb.food;
    if (fb.prod) prod += fb.prod;
    if (fb.gold) gold += fb.gold;
    // Wonder: Hanging Gardens — +2 food in every city of its owner
    var wb = state.wondersBuilt || {};
    if (wb.hanging_gardens === city.civ) food += BUILDINGS.hanging_gardens.perCityFood;
    var ns = neighbors(city.c, city.r);
    ns.unshift([city.c, city.r]);
    // simulate "citizens" working pop best tiles
    var yields = [];
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (!t) continue;
      var ter = TERRAIN[t.terrain];
      // Allow working impassable water (coastal fish); otherwise block impassable
      if (ter.impassable && t.terrain !== 'water') continue;
      // Enemy city on the tile blocks it
      if (t.city && (t.city.c !== city.c || t.city.r !== city.r)) continue;
      // Tile claimed by another civ's culture can't be worked
      if (t.owner && t.owner !== city.civ) continue;
      var f = ter.food, p = ter.prod, g = ter.gold;
      // Resource bonus
      var res = t.resource && RESOURCES[t.resource];
      if (res) {
        if (res.yield.food) f += res.yield.food;
        if (res.yield.prod) p += res.yield.prod;
        if (res.yield.gold) g += res.yield.gold;
      }
      // Improvement bonus
      if (t.improvement === 'farm') f += 1;
      if (t.improvement === 'mine') p += 2;
      // World wonder per-tile bonuses (only if this city's civ owns the wonder)
      if (wb.great_lighthouse === city.civ && t.terrain === 'water') g += BUILDINGS.great_lighthouse.perWaterGold;
      if (wb.forge === city.civ && t.terrain === 'hills')              p += BUILDINGS.forge.perHillProd;
      // Adjacent wonder bonuses
      var wns = neighborsAll(ns[i][0], ns[i][1]);
      for (var k = 0; k < wns.length; k++) {
        if (!wns[k]) continue;
        var nt = state.map[wns[k][1]][wns[k][0]];
        if (nt.terrain === 'volcano') p += 1;
        if (nt.terrain === 'geyser')  f += 1;
      }
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
    // Tribal village reward on entry
    if (t.village) claimVillage(unit, t);
    return true;
  }

  function claimVillage(unit, t) {
    if (unit.civ === 'barb') { t.village = null; return; }   // raiders just trample
    var reward = t.village.reward;
    t.village = null;
    var isPlayer = unit.civ === 'player';
    var civ = state.civs[unit.civ];

    function tryWorker() {
      // Look for an empty walkable tile for the new worker
      var ns = neighbors(unit.c, unit.r);
      for (var i = 0; i < ns.length; i++) {
        var nt = tileAt(ns[i][0], ns[i][1]);
        if (nt && !TERRAIN[nt.terrain].impassable && !nt.unit && !nt.city) {
          spawnUnit(unit.civ, 'worker', ns[i][0], ns[i][1]);
          return true;
        }
      }
      return false;
    }
    function nearestOwnCity() {
      var best = null, bd = Infinity;
      civ.cities.forEach(function (ct) {
        var d = hexDist([unit.c, unit.r], [ct.c, ct.r]);
        if (d < bd) { bd = d; best = ct; }
      });
      return best;
    }

    var label = '';
    if (reward === 'gold') {
      civ.gold += 30;
      label = '+30 gold from village';
    } else if (reward === 'science') {
      if (civ.currentTech) {
        civ.techProgress += 25;
        label = '+25 research from village';
      } else {
        civ.gold += 30;
        label = 'Village gave gold (no research set)';
      }
    } else if (reward === 'worker') {
      if (tryWorker()) {
        label = 'Tribal worker joined you';
      } else {
        civ.gold += 30;
        label = 'No room for worker — got gold';
      }
    } else if (reward === 'pop') {
      var home = nearestOwnCity();
      if (home) {
        home.pop += 1;
        label = home.name + ' grew (+1 pop)';
      } else {
        civ.gold += 30;
        label = 'No city — got gold instead';
      }
    }
    if (isPlayer && label) {
      showToast(label, 'success');
      logEvent('Tribal village · ' + label, 'success');
    }
  }

  function attack(attacker, defender) {
    var aDef = UNITS[attacker.type], dDef = UNITS[defender.type];
    if (aDef.atk === 0) { showToast('Cannot attack'); return false; }
    var dTile = tileAt(defender.c, defender.r);
    var terr = TERRAIN[dTile.terrain];
    var dBonus = (terr.defBonus || 0);
    if (defender.fortified) dBonus += 0.25;
    if (dTile.city && dTile.city.civ === defender.civ) {
      dBonus += dTile.city.buildings.walls ? 0.75 : 0.25;
      // Great Wall — +50% defense in every city the builder owns
      if (state.wondersBuilt && state.wondersBuilt.great_wall === defender.civ) dBonus += 0.5;
    }
    // Home-territory bonus: defender gets +10% on own owned tiles
    if (dTile.owner === defender.civ) dBonus += 0.10;
    // Cap so defense buffs never make a unit invincible
    if (dBonus > 1.5) dBonus = 1.5;

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
    var bonus = 0;
    if (state.civs[unit.civ].techs.iron && unit.type === 'warrior') bonus += 2;
    var f = FACTIONS[state.civs[unit.civ].faction];
    if (f && f.bonus && f.bonus.atk && !UNITS[unit.type].civilian) bonus += f.bonus.atk;
    return bonus;
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
    var nameList = CITY_NAMES[civ.faction] || CITY_NAMES.solaris;
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
      capital: isCapital,
      foundedTurn: state.turn
    };
    civ.cities.push(city);
    t.city = city;
    killUnit(unit);
    recomputeBorders();
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
    recomputeBorders();
    recomputeVisibility(newOwnerId);            // new owner gets sight around captured city
    showToast('Captured ' + city.name + '!', newOwnerId === 'player' ? 'success' : 'error');

    // Domination victory: a capital fell AND the loser has no cities left.
    if (city.capital && oldOwner.cities.length === 0) {
      declareVictory(newOwnerId, 'domination');
    }
  }

  function processCity(city) {
    var y = workableYields(city);

    // Growth
    city.food += (y.food - city.pop * 2);
    if (city.food < 0) {
      city.pop = Math.max(1, city.pop - 1);
      city.food = 0;
      if (city.civ === 'player') logEvent(city.name + ' starved (pop ' + city.pop + ')', 'error');
    }
    if (city.food >= city.foodCap) {
      city.pop += 1;
      city.food = 0;
      city.foodCap = 8 + city.pop * 5;
      if (city.civ === 'player') logEvent(city.name + ' grew to pop ' + city.pop, 'success');
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
        var bdef = BUILDINGS[p];
        // World wonders are unique globally. If someone else built it first
        // while this city was producing it, refund prod and reroll.
        if (bdef.wonder) {
          if (state.wondersBuilt[p]) {
            // Race lost — refund half cost, pick a default so we don't try this wonder again next turn
            city.prod += Math.floor(cost * 0.5);
            city.producing = 'warrior';
            if (city.civ === 'player') logEvent('Lost the race for ' + bdef.name, 'error');
          } else {
            city.buildings[p] = true;
            state.wondersBuilt[p] = city.civ;
            applyWonderOneShot(city, p);
            if (city.civ === 'player') logEvent(city.name + ' built ' + bdef.name + ' (wonder)', 'success');
            else logEvent(CIVS[city.civ].name + ' built ' + bdef.name, 'error');
          }
        } else {
          city.buildings[p] = true;
          if (city.civ === 'player') logEvent(city.name + ' built ' + bdef.name, 'success');
        }
      } else {
        var spawnTile = findSpawnTile(city);
        if (spawnTile) {
          spawnUnit(city.civ, p, spawnTile[0], spawnTile[1]);
          if (city.civ === 'player') logEvent(city.name + ' trained ' + UNITS[p].name, 'success');
        }
      }
      city.producing = pickNextProduction(city);
    }
  }

  function applyWonderOneShot(city, wid) {
    var bdef = BUILDINGS[wid];
    if (!bdef || !bdef.wonder) return;
    var civ = state.civs[city.civ];
    if (bdef.oneShotScience) {
      civ.techProgress = (civ.techProgress || 0) + bdef.oneShotScience;
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
    var available = availableProducibles(civ);
    if (city.civ === 'ai') {
      // ~25% chance to chase an available wonder, otherwise lean military
      var wonders = available.filter(function (k) { return BUILDINGS[k] && BUILDINGS[k].wonder; });
      if (wonders.length && rnd() < 0.25) return wonders[Math.floor(rnd() * wonders.length)];
      // Sometimes build a regular building if available and not yet built
      var regBldgs = available.filter(function (k) { return BUILDINGS[k] && !BUILDINGS[k].wonder && !city.buildings[k]; });
      if (regBldgs.length && rnd() < 0.20) return regBldgs[Math.floor(rnd() * regBldgs.length)];
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
      if (u.barb) continue;             // raiders aren't trainable
      out.push(k);
    }
    for (var k in BUILDINGS) {
      var b = BUILDINGS[k];
      if (b.tech && !civ.techs[b.tech]) continue;
      if (b.wonder && state.wondersBuilt && state.wondersBuilt[k]) continue;
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
      if (civ.id === 'player') logEvent('Researched ' + def.name, 'success');
      civ.currentTech = null;
      // Auto-pick next tech for AI; player picks from the menu.
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
    state.turnLog = [];                  // fresh log for events from this round
    recomputeIncome('player');
    pl.cities.forEach(processCity);
    pl.gold += pl.goldPerTurn;
    progressTech(pl);

    // AI turn — lock input while the AI thinks/moves
    state.currentCiv = 'ai';
    aiThinking = true;
    flashEndTurn();
    setTimeout(function () {
      aiTurn();
      barbTurn();

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
      state.civs.barb.units.forEach(function (u) { u.moves = u.maxMoves; });
      recomputeBorders();
      recomputeVisibility('player');
      recomputeVisibility('ai');
      recomputeIncome('player');
      // heal idle units
      [pl, ai].forEach(function (civ) {
        civ.units.forEach(function (u) {
          if (u.moves === u.maxMoves && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 2);
        });
      });
      autoSelectNextUnit();
      showTurnSummary();
      aiThinking = false;
      save();
      draw();
    }, 300);
  }

  function logEvent(msg, kind) {
    if (!state.turnLog) state.turnLog = [];
    state.turnLog.push({ msg: msg, kind: kind || 'info' });
  }

  function showTurnSummary() {
    var el = document.getElementById('turn-summary');
    if (!el) return;
    var titleEl = el.querySelector('.turn-summary-title');
    var body = el.querySelector('.turn-summary-body');
    titleEl.textContent = 'Turn ' + state.turn;
    body.innerHTML = '';
    var events = state.turnLog || [];
    if (events.length === 0) {
      body.innerHTML = '<div class="turn-summary-empty">Quiet round.</div>';
    } else {
      events.forEach(function (ev) {
        var row = document.createElement('div');
        row.className = 'ev-row' + (ev.kind === 'error' ? ' err' : ev.kind === 'success' ? ' win' : '');
        var ico = ev.kind === 'error' ? '!' : ev.kind === 'success' ? '✓' : '·';
        row.innerHTML = '<span class="ev-ico">' + ico + '</span><span>' + ev.msg + '</span>';
        body.appendChild(row);
      });
    }
    el.classList.add('visible');
    el.classList.remove('hidden');
    clearTimeout(showTurnSummary._t);
    showTurnSummary._t = setTimeout(function () {
      el.classList.remove('visible');
    }, Math.max(2400, 1600 + events.length * 350));
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

  // Esc cycles through units that still have moves. If none, deselects.
  function cycleNextUnit() {
    var pl = state.civs.player;
    var available = pl.units.filter(function (u) { return u.moves > 0 && !u.fortified; });
    if (available.length === 0) {
      state.selected = null;
      return;
    }
    // Find the unit after the currently selected (or cursor) one
    var curIdx = -1;
    var ref = state.selected || state.cursor;
    available.forEach(function (u, i) {
      if (u.c === ref.c && u.r === ref.r) curIdx = i;
    });
    var next = available[(curIdx + 1) % available.length];
    state.cursor.c = next.c;
    state.cursor.r = next.r;
    state.selected = { c: next.c, r: next.r };
    ensureCursorVisible();
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

  // -------- Barbarians ----------------------------------------------------
  function barbTurn() {
    if (!state.civs.barb) return;
    state.civs.barb.units.slice().forEach(function (u) {
      if (u.hp <= 0) return;
      barbMoveUnit(u);
    });
    // Spawn — only in the early game, only a few at a time, only on neutral land
    if (state.turn <= 28 && state.civs.barb.units.length < 3 && state.turn % 3 === 0) {
      trySpawnBarbarian();
    }
  }

  function barbMoveUnit(u) {
    // Attack adjacent if any
    var adj = adjacentEnemy(u);
    if (adj) { attack(u, adj.unit); return; }
    // Step toward the closest player unit/city within 4 tiles, else wander
    var target = findNearestEnemy(u, 4);
    if (target) aiStepToward(u, target);
    else aiWander(u);
  }

  function trySpawnBarbarian() {
    for (var tries = 0; tries < 80; tries++) {
      var edge = Math.floor(rnd() * 4);
      var c, r;
      if (edge === 0)      { c = rndInt(0, MAP_W - 1); r = rndInt(0, 1); }
      else if (edge === 1) { c = rndInt(0, MAP_W - 1); r = rndInt(MAP_H - 2, MAP_H - 1); }
      else if (edge === 2) { c = rndInt(0, 1); r = rndInt(0, MAP_H - 1); }
      else                 { c = rndInt(MAP_W - 2, MAP_W - 1); r = rndInt(0, MAP_H - 1); }
      var t = tileAt(c, r);
      if (!t) continue;
      var ter = TERRAIN[t.terrain];
      if (ter.impassable) continue;
      if (t.unit || t.city) continue;
      if (t.owner) continue;     // not on any civ's culture — keeps spawns out of safe territory
      spawnUnit('barb', 'raider', c, r);
      return;
    }
  }

  function aiMoveUnit(u) {
    if (u.type === 'settler') {
      // Found city if good spot — must be far from ALL existing cities (player + ai)
      var t = tileAt(u.c, u.r);
      if (t && !t.city && !TERRAIN[t.terrain].impassable) {
        var ok = true;
        ['player','ai'].forEach(function (id) {
          state.civs[id].cities.forEach(function (ct) {
            if (hexDist([u.c, u.r], [ct.c, ct.r]) < 4) ok = false;
          });
        });
        if (state.civs.ai.cities.length === 0) { foundCity(u); return; }
        if (ok) { foundCity(u); return; }
      }
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

  function findNearestEnemy(u, maxDist) {
    var best = null, bestD = Infinity;
    for (var key in state.civs) {
      if (key === u.civ) continue;
      state.civs[key].units.forEach(function (e) {
        var d = hexDist([u.c, u.r], [e.c, e.r]);
        if (d < bestD) { bestD = d; best = [e.c, e.r]; }
      });
      (state.civs[key].cities || []).forEach(function (ct) {
        var d = hexDist([u.c, u.r], [ct.c, ct.r]);
        if (d < bestD) { bestD = d; best = [ct.c, ct.r]; }
      });
    }
    if (maxDist != null && bestD > maxDist) return null;
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
  var pendingMoves = []; // deferred moves while we wait to see if a combo completes

  function isAlternatingPrefix() {
    if (keyHistory.length < 2) return false;
    var last = keyHistory[keyHistory.length - 1].k;
    var prev = keyHistory[keyHistory.length - 2].k;
    if (last === prev) return false;
    var vert = (last === 'up' || last === 'down') && (prev === 'up' || prev === 'down');
    var horiz = (last === 'left' || last === 'right') && (prev === 'left' || prev === 'right');
    return vert || horiz;
  }

  function flushPendingMoves() {
    if (!pendingMoves.length) return;
    pendingMoves.forEach(function (m) {
      if (state.mode === 'cursor') moveCursor(m[0], m[1]);
      else panInDirection(m[0], m[1]);
    });
    pendingMoves = [];
  }

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
    // Re-clamp so any scroll-mode buffer drift collapses back when entering cursor mode,
    // and ensure cursor stays in view after the switch.
    clampCamera();
    if (state.mode === 'cursor') ensureCursorVisible();
  }

  var walkAnimating = false;
  var aiThinking = false;
  function isBusy() { return walkAnimating || aiThinking; }

  function walkPath(unit, path, onDone) {
    if (walkAnimating) return;
    if (!path || path.length <= 1) { if (onDone) onDone(); return; }
    walkAnimating = true;
    var i = 1;
    function step() {
      if (i >= path.length || unit.hp <= 0 || unit.moves <= 0) {
        walkAnimating = false;
        if (unit.hp > 0) {
          state.selected = { c: unit.c, r: unit.r };
          state.cursor.c = unit.c;
          state.cursor.r = unit.r;
          ensureCursorVisible();
        } else {
          state.selected = null;
        }
        draw();
        save();
        if (onDone) onDone();
        return;
      }
      var nx = path[i][0], ny = path[i][1];
      moveUnit(unit, nx, ny);
      i++;
      // If we walked into / attacked something or ran out of moves, stop after this step
      draw();
      setTimeout(step, 110);
    }
    step();
  }

  function activate() {
    if (walkAnimating) return;
    var t = state.map[state.cursor.r][state.cursor.c];

    // -------- Selected unit flow --------
    if (state.selected) {
      var sel = tileAt(state.selected.c, state.selected.r);
      var su = sel && sel.unit;
      if (su && su.civ === 'player') {
        var sameTile = state.selected.c === state.cursor.c && state.selected.r === state.cursor.r;

        if (sameTile) {
          openActionMenu();
          return;
        }
        if (su.moves > 0) {
          // Try multi-tile path
          var reach = computeReachable(su);
          var key = state.cursor.c + ',' + state.cursor.r;
          if (key in reach && reach[key].cost > 0) {
            var path = pathTo(reach, state.cursor.c, state.cursor.r);
            walkPath(su, path);
            return;
          }
        }
        // Unreachable target — treat the pinch as a fresh activation
        state.selected = null;
      }
    }

    // -------- Fresh activation on the tile under cursor --------
    if (t.unit && t.unit.civ === 'player') {
      state.selected = { c: t.unit.c, r: t.unit.r };
      var u = t.unit;
      var reach2 = computeReachable(u);
      var maxC = 0;
      for (var k in reach2) if (reach2[k].cost > maxC) maxC = reach2[k].cost;
      showToast(UNITS[u.type].name + ' · ' + u.moves + ' moves');
      return;
    }
    if (t.city && t.city.civ === 'player') {
      openCity(t.city);
      return;
    }
    // Empty/enemy tile: if all units exhausted, end turn instantly
    var civ = state.civs.player;
    var hasMovesLeft = civ.units.some(function (u) { return u.moves > 0 && !u.fortified; });
    if (!hasMovesLeft && !state.victory) {
      endTurn();
      return;
    }
    openActionMenu();
  }

  // =====================================================================
  // ACTION MENU
  // =====================================================================
  var openModal = null;

  function openActionMenu() {
    var t = state.map[state.cursor.r][state.cursor.c];
    var civPl = state.civs.player;
    var actions = [];
    var hasMovesLeft = civPl.units.some(function (u) { return u.moves > 0 && !u.fortified; });

    var title = 'Actions';
    var isUnit = t.unit && t.unit.civ === 'player';
    var isCity = t.city && t.city.civ === 'player';

    if (isUnit) {
      var u = t.unit;
      state.selected = { c: u.c, r: u.r };
      var def = UNITS[u.type];
      title = UNITS[u.type].name;

      if (def.canFound) {
        actions.push({ icon: '★', primary: true, title: 'Found City', sub: 'Plant a settlement here', do: function () { foundCity(u); closeModal(); draw(); } });
      }
      if (def.canImprove) {
        // Hills / desert -> mine (+2 prod). Grass / plains -> farm (+1 food).
        var mineTerrain = (t.terrain === 'hills' || t.terrain === 'desert');
        var farmTerrain = (t.terrain === 'grass' || t.terrain === 'plains');
        var canImp = (mineTerrain || farmTerrain) && !t.improvement;
        var impKind = mineTerrain ? 'mine' : 'farm';
        var impName = impKind === 'mine' ? 'Mine · +2 prod' : 'Farm · +1 food';
        actions.push({ icon: '⛏', primary: true, title: canImp ? 'Build ' + (impKind.charAt(0).toUpperCase() + impKind.slice(1)) : 'Build Improvement', sub: canImp ? impName : (t.improvement ? 'Already improved' : 'Not buildable here'), disabled: !canImp, do: function () {
          t.improvement = impKind;
          u.moves = 0;
          showToast('Improvement built', 'success');
          closeModal();
          draw();
        } });
      }
      actions.push({ icon: '▣', title: u.fortified ? 'Unfortify' : 'Fortify', sub: 'Heal +2/turn · +25% defense', do: function () { u.fortified = !u.fortified; u.moves = 0; closeModal(); draw(); } });
      actions.push({ icon: '✕', title: 'Skip Unit', sub: 'End its turn', do: function () { u.moves = 0; closeModal(); autoSelectNextUnit(); draw(); } });
    } else if (isCity) {
      title = t.city.name;
      actions.push({ icon: '🏛', primary: true, title: 'Manage ' + t.city.name, sub: 'Production, food, science', do: function () { closeModal(); openCity(t.city); } });
    }

    // Global actions (always at bottom)
    actions.push({ icon: '◆', title: 'Research', sub: civPl.currentTech ? TECHS[civPl.currentTech].name + ' · ' + civPl.techProgress + '/' + TECHS[civPl.currentTech].cost : 'Choose research', do: function () { closeModal(); openTech(); } });

    var endIcon = '▶';
    var endSub = hasMovesLeft ? Math.max(0, civPl.units.filter(function (u) { return u.moves > 0 && !u.fortified; }).length) + ' unit(s) still have moves' : 'All units acted — ready';
    actions.push({ icon: endIcon, primary: !hasMovesLeft, danger: hasMovesLeft, title: 'End Turn', sub: endSub, do: function () { closeModal(); endTurn(); } });

    var list = document.getElementById('action-list');
    list.innerHTML = '';
    actions.forEach(function (a, i) {
      var row = document.createElement('button');
      var cls = 'action-row focusable';
      if (a.disabled) cls += ' disabled';
      if (a.primary)  cls += ' primary';
      if (a.danger)   cls += ' danger';
      row.className = cls;
      if (a.disabled) row.setAttribute('disabled','');
      row.tabIndex = 0;
      row.innerHTML = '<div class="action-icon">' + a.icon + '</div>' +
        '<div class="action-body"><div class="action-title">' + a.title + '</div>' +
        (a.sub ? '<div class="action-sub">' + a.sub + '</div>' : '') + '</div>';
      row.addEventListener('click', function () { if (!a.disabled) a.do(); });
      list.appendChild(row);
    });

    document.getElementById('action-title').textContent = title;
    showModal('action-menu');
    // If End Turn is the primary action, focus it
    if (!hasMovesLeft) {
      setTimeout(function () {
        var rows = document.querySelectorAll('#action-list .action-row.focusable:not([disabled])');
        var endRow = rows[rows.length - 1];
        if (endRow) endRow.focus();
      }, 20);
    }
  }

  function adjacentEnemy(u) {
    var ns = neighbors(u.c, u.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && t.unit && t.unit.civ !== u.civ) return { c: ns[i][0], r: ns[i][1], unit: t.unit };
    }
    return null;
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
    // Sort: units first, then buildings, then wonders last
    avail.sort(function (a, b) {
      var ba = BUILDINGS[a], bb = BUILDINGS[b];
      var wa = ba && ba.wonder ? 2 : (ba ? 1 : 0);
      var wb = bb && bb.wonder ? 2 : (bb ? 1 : 0);
      return wa - wb;
    });
    avail.forEach(function (k) {
      var u = UNITS[k] || BUILDINGS[k];
      if (BUILDINGS[k] && city.buildings[k]) return; // already built
      if (k === city.producing) return;
      var isB = !!BUILDINGS[k];
      var isWonder = isB && BUILDINGS[k].wonder;
      var iconChar = isWonder ? '✦' : (isB ? '▢' : UNITS[k].glyph);
      var sub = isWonder ? (BUILDINGS[k].lore + ' · ' + u.cost + ' prod')
                         : ((isB ? 'Building' : 'Unit') + ' · ' + u.cost + ' prod');
      var row = document.createElement('button');
      row.className = 'action-row focusable' + (isWonder ? ' primary' : '');
      row.innerHTML = '<div class="action-icon">' + iconChar + '</div>' +
        '<div class="action-body"><div class="action-title">' + u.name + (isWonder ? ' ✦' : '') + '</div>' +
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

    // Block all gameplay input while AI is thinking or a unit is walking
    if (isBusy()) {
      if (ACTION_KEYS.indexOf(k) >= 0 || k === 'Enter' || k === 'Escape') e.preventDefault();
      return;
    }

    // Game keys
    if (ACTION_KEYS.indexOf(k) >= 0) {
      e.preventDefault();
      pushKey(k);

      // Combo: ↑↓↑↓ toggles mode
      if (matchCombo(['up','down','up','down']) || matchCombo(['down','up','down','up'])) {
        pendingMoves = [];        // discard suppressed moves — they were part of the combo
        toggleMode();
        consumeCombo();
        draw();
        return;
      }
      // Combo: ←→←→ cycles zoom
      if (matchCombo(['left','right','left','right']) || matchCombo(['right','left','right','left'])) {
        pendingMoves = [];
        cycleZoom();
        consumeCombo();
        draw();
        return;
      }

      var dc = 0, dr = 0;
      if (k === 'ArrowUp') dr = -1;
      else if (k === 'ArrowDown') dr = +1;
      else if (k === 'ArrowLeft') dc = -1;
      else if (k === 'ArrowRight') dc = +1;

      // If this press extends an alternating same-axis pattern, defer the move —
      // it might be the 2nd, 3rd or 4th key of a combo.
      if (isAlternatingPrefix()) {
        pendingMoves.push([dc, dr]);
        draw();
        return;
      }

      // Different axis / fresh tap — flush any deferred moves first, then apply this one.
      flushPendingMoves();
      if (state.mode === 'cursor') moveCursor(dc, dr);
      else panInDirection(dc, dr);
      draw();
      return;
    }

    if (k === 'Enter') {
      e.preventDefault();
      flushPendingMoves();      // any deferred reversal moves commit before action
      activate();
      draw();
    } else if (k === 'Escape') {
      e.preventDefault();
      flushPendingMoves();
      cycleNextUnit();
      draw();
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
    var modal = document.getElementById(openModal);
    if (!modal) {
      // Find whichever non-game screen is currently visible
      var ids = ['civ-select', 'title', 'end-screen', 'help-screen'];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el && !el.classList.contains('hidden')) { modal = el; break; }
      }
    }
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
    ['title','civ-select','game','action-menu','city-screen','tech-screen','help-screen','end-screen'].forEach(function (s) {
      var el = document.getElementById(s);
      if (el) el.classList.add('hidden');
    });
    var t = document.getElementById(id);
    if (t) t.classList.remove('hidden');
    if (id === 'game') {
      openModal = null;
      draw();
    } else {
      // 'title' and 'civ-select' are full screens, not modals
      openModal = (id === 'title' || id === 'civ-select') ? null : id;
      if (id === 'civ-select') renderCivCards();
      setTimeout(function () {
        var f = t.querySelector('.focusable:not([disabled])');
        if (f) f.focus();
      }, 10);
    }
  }

  function renderCivCards() {
    var host = document.getElementById('civ-cards');
    if (!host) return;
    host.innerHTML = '';
    FACTION_ORDER.forEach(function (id) {
      var f = FACTIONS[id];
      var btn = document.createElement('button');
      btn.className = 'civ-card focusable';
      btn.tabIndex = 0;
      btn.style.setProperty('--civ-color', f.color);
      btn.style.setProperty('--civ-glow', f.color + '66');
      btn.dataset.action = 'pick-civ';
      btn.dataset.civ = id;
      btn.innerHTML =
        '<div class="civ-emblem">⬢</div>' +
        '<div class="civ-body">' +
          '<div class="civ-name">' + f.name + '</div>' +
          '<div class="civ-title">' + f.title + '</div>' +
          '<div class="civ-bonus">' + f.lore + '</div>' +
        '</div>';
      host.appendChild(btn);
    });
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
      case 'show-civ-select':
        showScreen('civ-select');
        break;
      case 'pick-civ':
        var fac = el.dataset.civ;
        clearSave();
        newGame(null, fac);
        showScreen('game');
        break;
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
        showScreen('civ-select');
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
