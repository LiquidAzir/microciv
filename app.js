(function () {
  'use strict';

  // =====================================================================
  // CONSTANTS
  // =====================================================================
  var STORAGE_KEY = 'mdg_microciv_v1';
  var MAP_W = 16, MAP_H = 16;
  var MAP_SIZES = {
    small:   { w: 12, h: 12, label: 'Small',   desc: '12×12' },
    normal:  { w: 16, h: 16, label: 'Normal',  desc: '16×16' },
    large:   { w: 20, h: 20, label: 'Large',   desc: '20×20' },
    huge:    { w: 24, h: 24, label: 'Huge',    desc: '24×24' },
    massive: { w: 28, h: 28, label: 'Massive', desc: '28×28' }
  };
  var MAP_SIZE_ORDER = ['small', 'normal', 'large', 'huge', 'massive'];
  // Each tier scales FOUR things across a smooth ladder: how hard the AI hits
  // (aiAtkBonus), when it turns aggressive (aiAggroTurn), and — the big one —
  // its ECONOMY: a yield handicap on AI production/science/gold (aiYield) and a
  // growth handicap on AI food surplus (aiGrowth), plus a small starting-gold
  // jump on the top tiers. The human is never handicapped; only AI rivals scale
  // (city-states / barbarians are exempt). Normal = no handicaps (1.0).
  var DIFFICULTIES = {
    chieftain: { label: 'Chieftain', desc: 'Passive AI · weak economy',        aiAtkBonus: -2, aiAggroTurn: 30, aiExtraWarrior: false, aiYield: 0.75, aiGrowth: 0.80, aiStartGold: 0 },
    easy:      { label: 'Easy',      desc: 'Relaxed AI · slower to develop',    aiAtkBonus: -1, aiAggroTurn: 20, aiExtraWarrior: false, aiYield: 0.90, aiGrowth: 0.90, aiStartGold: 0 },
    normal:    { label: 'Normal',    desc: 'Balanced · no handicaps',           aiAtkBonus: 0,  aiAggroTurn: 10, aiExtraWarrior: false, aiYield: 1.00, aiGrowth: 1.00, aiStartGold: 0 },
    hard:      { label: 'Hard',      desc: 'Aggressive AI · stronger economy',  aiAtkBonus: 1,  aiAggroTurn: 8,  aiExtraWarrior: true,  aiYield: 1.20, aiGrowth: 1.15, aiStartGold: 20 },
    brutal:    { label: 'Brutal',    desc: 'Relentless · fast, rich, early rush', aiAtkBonus: 2,  aiAggroTurn: 5,  aiExtraWarrior: true,  aiYield: 1.40, aiGrowth: 1.30, aiStartGold: 40 }
  };
  // Active difficulty definition + the economic handicap for a given civ. The
  // human (and city-states / barbarians) always run at 1.0; only AI rivals scale.
  function diffOf() { return DIFFICULTIES[(state && state.difficulty) || selectedDifficulty || 'normal'] || DIFFICULTIES.normal; }
  function aiEcoMult(civId, key) {
    if (civId === 'player' || AI_SIDES.indexOf(civId) < 0) return 1;
    var d = diffOf();
    return (key === 'growth' ? d.aiGrowth : d.aiYield) || 1;
  }
  // Slider order, easiest → hardest
  var DIFFICULTY_ORDER = ['chieftain', 'easy', 'normal', 'hard', 'brutal'];
  var selectedMapSize = 'normal';
  var selectedDifficulty = 'normal';
  var ZOOM_LEVELS = [26, 44, 64];       // hex radius in px — far / normal / close
  var ZOOM_NAMES  = ['FAR', 'NORMAL', 'CLOSE'];
  var DEFAULT_ZOOM = 1;
  var SQRT3 = Math.sqrt(3);
  var VIEW_W = 600, VIEW_H = 540;

  var TERRAIN = {
    grass:    { name: 'Grass',    food: 2, prod: 0, gold: 0, color: '#3f7d3a', edge: '#6fb255', glyph: '',  fg: '#82c264' },
    plains:   { name: 'Plains',   food: 1, prod: 1, gold: 0, color: '#b89844', edge: '#e3c46a', glyph: '',  fg: '#e8cf7a' },
    forest:   { name: 'Forest',   food: 1, prod: 2, gold: 0, color: '#1f4d2b', edge: '#356b3c', glyph: '♣', fg: '#4f8a4a' },
    hills:    { name: 'Hills',    food: 1, prod: 2, gold: 0, defBonus: 0.5, color: '#7a5e32', edge: '#a8854a', glyph: '▴', fg: '#c49a55' },
    mountain: { name: 'Mountain', food: 0, prod: 0, gold: 0, impassable: true, color: '#5a5560', edge: '#8c8694', glyph: '▲', fg: '#aaa4b0' },
    desert:   { name: 'Desert',   food: 0, prod: 1, gold: 1, color: '#d8b35e', edge: '#efd791', glyph: '·', fg: '#f2dd9c' },
    tundra:   { name: 'Tundra',   food: 0, prod: 1, gold: 0, color: '#b9c6cf', edge: '#e6eef2', glyph: '',  fg: '#8fa3b2' },
    water:    { name: 'Sea',      food: 1, prod: 0, gold: 1, impassable: true, color: '#16487a', edge: '#3f86c4', glyph: '~', fg: '#4fa3cf' },
    volcano:  { name: 'Volcano',  food: 0, prod: 1, gold: 0, impassable: true, wonder: true, color: '#2e1c18', edge: '#7a2a18', glyph: '',  fg: '#ff7b2e' },
    geyser:   { name: 'Geyser',   food: 2, prod: 0, gold: 1, wonder: true, color: '#1d6473', edge: '#5fc3cf', glyph: '',  fg: '#5fc3cf' }
  };

  // `weight` biases the per-tile random pick so distribution stays balanced
  // regardless of how common each terrain is (gold was flooding via the large
  // desert biome). Higher weight = more likely when its terrain rolls a resource.
  // `luxury: true` resources also grant empire-wide CONTENTMENT — one per DISTINCT
  // luxury a civ controls (see distinctLuxuries / cityUnrestDelta). They're the
  // "nice things" a populace enjoys, and a spare copy is tradeable with rivals.
  var RESOURCES = {
    wheat:  { label: 'Wheat',  terrains: ['grass'],            yield: { food: 2 }, weight: 3, accent: '#ffd34d', dark: '#7a4f10' },
    cattle: { label: 'Cattle', terrains: ['plains','grass'],   yield: { food: 1, prod: 1 }, weight: 2, luxury: true, accent: '#c08a55', dark: '#3a2410' },
    fish:   { label: 'Fish',   terrains: ['water'],            yield: { food: 2, gold: 1 }, weight: 2, luxury: true, accent: '#5ad4e6', dark: '#1a4a5a' },
    iron:   { label: 'Iron',   terrains: ['hills'],            yield: { prod: 2 }, weight: 4, accent: '#c8c8d4', dark: '#3a3a48' },
    copper: { label: 'Copper', terrains: ['hills'],            yield: { prod: 1, gold: 1 }, weight: 2, accent: '#e08c4a', dark: '#5a2810' },
    gold:   { label: 'Gold',   terrains: ['hills','desert'],   yield: { gold: 3 }, weight: 1, luxury: true, accent: '#ffd700', dark: '#7a5a00' },
    gems:   { label: 'Gems',   terrains: ['hills'],            yield: { gold: 3 }, weight: 3, luxury: true, accent: '#b388ff', dark: '#3a1a5a' },
    horses: { label: 'Horses', terrains: ['plains'],           yield: { food: 1, prod: 1 }, weight: 3, luxury: true, accent: '#d8a87a', dark: '#3a2010' },
    // Strategic resources — soft-gate the top modern units (see UNITS.requires)
    oil:    { label: 'Oil',    terrains: ['desert','water','tundra'], yield: { prod: 1, gold: 1 }, weight: 1, accent: '#7a6f55', dark: '#14120c' },
    coal:   { label: 'Coal',   terrains: ['hills','mountain'], yield: { prod: 2 }, weight: 2, accent: '#5a6068', dark: '#101216' }
  };

  var UNITS = {
    settler:   { name: 'Settler',   cost: 30, hp: 8,  atk: 0, def: 1, move: 2, glyph: '☗', tech: null,          civilian: true, canFound: true },
    worker:    { name: 'Worker',    cost: 20, hp: 8,  atk: 0, def: 1, move: 2, glyph: '⚒', tech: null,          civilian: true, canImprove: true },
    scout:     { name: 'Scout',     cost: 12, hp: 8,  atk: 0, def: 2, move: 3, glyph: '⚐', tech: null,          civilian: true, canExplore: true },
    caravan:   { name: 'Caravan',   cost: 30, hp: 8,  atk: 0, def: 1, move: 2, glyph: '⇄', tech: 'currency',     civilian: true, trade: true },
    warrior:   { name: 'Warrior',   cost: 15, hp: 14, atk: 4, def: 3, move: 2, glyph: '⚔', tech: null },
    spearman:  { name: 'Spearman',  cost: 18, hp: 14, atk: 4, def: 6, move: 2, glyph: '†', tech: null, vs: { mounted: 0.5 } },
    archer:    { name: 'Archer',    cost: 25, hp: 10, atk: 5, def: 2, move: 2, glyph: '➹', tech: 'archery',     ranged: 2 },
    horseman:  { name: 'Horseman',  cost: 35, hp: 14, atk: 6, def: 3, move: 4, glyph: '♞', tech: 'husbandry', class: 'mounted' },
    swordsman: { name: 'Swordsman', cost: 45, hp: 18, atk: 8, def: 5, move: 2, glyph: '⚔', tech: 'steel' },
    pikeman:   { name: 'Pikeman',   cost: 38, hp: 20, atk: 6, def: 9, move: 2, glyph: '⛏', tech: 'feudalism', vs: { mounted: 0.5 } },
    knight:    { name: 'Knight',    cost: 60, hp: 22, atk: 11, def: 6, move: 4, glyph: '♘', tech: 'chivalry', class: 'mounted' },
    catapult:  { name: 'Catapult',  cost: 40, hp: 8,  atk: 7, def: 1, move: 2, glyph: '⊕', tech: 'engineering', ranged: 2, siege: true },
    trebuchet: { name: 'Trebuchet', cost: 55, hp: 10, atk: 10, def: 2, move: 2, glyph: '⊗', tech: 'mathematics', ranged: 2, siege: true },
    cannon:    { name: 'Cannon',    cost: 70, hp: 14, atk: 14, def: 3, move: 2, glyph: '◎', tech: 'metallurgy',  ranged: 2, siege: true },
    musketman: { name: 'Musketman', cost: 50, hp: 20, atk: 9, def: 4, move: 2, glyph: '⚡', tech: 'gunpowder',  ranged: 2 },
    rifleman:  { name: 'Rifleman',  cost: 65, hp: 26, atk: 12, def: 8, move: 2, glyph: '☄', tech: 'rifling',    ranged: 2 },
    galley:    { name: 'Galley',    cost: 30, hp: 14, atk: 5, def: 3, move: 3, glyph: '⛵', tech: 'sailing',     naval: true },
    caravel:   { name: 'Caravel',   cost: 42, hp: 18, atk: 7, def: 4, move: 4, glyph: '⛴', tech: 'navigation',  naval: true },
    // Modern military — the top of each line is soft-gated on oil (always an
    // ungated option: Infantry needs only common iron).
    infantry:  { name: 'Infantry',  cost: 75, hp: 30, atk: 16, def: 13, move: 2, glyph: '⛒', tech: 'conscription', ranged: 2, requires: 'iron' },
    artillery: { name: 'Artillery', cost: 85, hp: 16, atk: 20, def: 3, move: 2, glyph: '☷', tech: 'ballistics',  ranged: 2, siege: true, requires: 'iron' },
    tank:      { name: 'Tank',      cost: 100, hp: 32, atk: 24, def: 16, move: 4, glyph: '▦', tech: 'combustion', requires: 'oil' },
    battleship:{ name: 'Battleship',cost: 110, hp: 36, atk: 26, def: 14, move: 4, glyph: '⛟', tech: 'combustion', naval: true, ranged: 2, siege: true, requires: 'oil' },
    fighter:   { name: 'Fighter',   cost: 90, hp: 20, atk: 18, def: 6, move: 6, glyph: '✈', tech: 'mass_production', ranged: 2, air: true, requires: 'oil' },
    // Information-age apex units
    submarine: { name: 'Submarine', cost: 80, hp: 20, atk: 18, def: 10, move: 4, glyph: '◗', tech: 'electronics', naval: true, vs: { naval: 1.0 } },
    carrier:   { name: 'Carrier',   cost: 95, hp: 40, atk: 6,  def: 8,  move: 4, glyph: '▭', tech: 'electronics', naval: true, carrier: true },
    bomber:    { name: 'Bomber',    cost: 95, hp: 22, atk: 22, def: 6, move: 6, glyph: '➶', tech: 'rocketry',  ranged: 3, siege: true, air: true },
    modern_armor: { name: 'Modern Armor', cost: 120, hp: 38, atk: 30, def: 22, move: 4, glyph: '▰', tech: 'robotics', requires: 'oil' },
    nuke:      { name: 'Nuke',      cost: 150, hp: 6,  atk: 1, def: 0, move: 6, glyph: '☢', tech: 'nuclear_fission', ranged: 5, nuke: true, requiresWonder: 'manhattan_project' },
    // Faction unique units (sidegrades that REPLACE a base unit for one faction)
    legionary: { name: 'Legionary', cost: 16, hp: 16, atk: 6, def: 5, move: 2, glyph: '⚔', tech: null,        faction: 'ferrum', replaces: 'warrior' },
    nightblade:{ name: 'Nightblade', cost: 42, hp: 18, atk: 10, def: 4, move: 3, glyph: '⚔', tech: 'steel',     faction: 'umbra',  replaces: 'swordsman' },
    bloodrider:{ name: 'Bloodrider', cost: 32, hp: 14, atk: 8, def: 3, move: 5, glyph: '♞', tech: 'husbandry',  faction: 'vorne',  replaces: 'horseman', class: 'mounted' },
    dromon:    { name: 'Dromon',    cost: 30, hp: 16, atk: 7, def: 4, move: 4, glyph: '⛵', tech: 'sailing',     faction: 'myrr',   naval: true, replaces: 'galley' },
    raider:    { name: 'Raider',    cost: 0,  hp: 10, atk: 3, def: 2, move: 2, glyph: '⚔', tech: null,          barb: true },
    great_general:   { name: 'Great General',   cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '⚑', tech: null, civilian: true, great: true },
    great_scientist: { name: 'Great Scientist', cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '⚗', tech: null, civilian: true, great: true },
    great_engineer:  { name: 'Great Engineer',  cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '⚙', tech: null, civilian: true, great: true },
    great_merchant:  { name: 'Great Merchant',  cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '⚖', tech: null, civilian: true, great: true },
    great_artist:    { name: 'Great Artist',    cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '✦', tech: null, civilian: true, great: true },
    great_prophet:   { name: 'Great Prophet',   cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '☧', tech: null, civilian: true, great: true, prophet: true },
    // Religious units — bought with Faith (not production), spread / defend a faith.
    missionary:      { name: 'Missionary',      cost: 0, hp: 6, atk: 0, def: 1, move: 3, glyph: '☩', tech: null, civilian: true, faithUnit: true },
    inquisitor:      { name: 'Inquisitor',      cost: 0, hp: 6, atk: 0, def: 2, move: 2, glyph: '☨', tech: null, civilian: true, faithUnit: true, purge: true },
    // Living history — excavates dig sites for culture + era points
    archaeologist:   { name: 'Archaeologist',   cost: 45, hp: 8, atk: 0, def: 1, move: 2, glyph: '⚱', tech: 'astronomy', civilian: true, dig: true }
  };

  // Unit upgrade paths: type -> { to, tech, cost }
  var UPGRADES = {
    warrior:   { to: 'swordsman',  tech: 'steel',       cost: 30 },
    archer:    { to: 'musketman',  tech: 'gunpowder',   cost: 35 },
    horseman:  { to: 'knight',     tech: 'chivalry',    cost: 30 },
    catapult:  { to: 'trebuchet',  tech: 'mathematics', cost: 25 },
    trebuchet: { to: 'cannon',     tech: 'metallurgy',  cost: 30 },
    musketman: { to: 'rifleman',   tech: 'rifling',     cost: 35 },
    galley:    { to: 'caravel',    tech: 'navigation',  cost: 20 },
    rifleman:  { to: 'infantry',   tech: 'conscription', cost: 40 },
    cannon:    { to: 'artillery',  tech: 'ballistics',  cost: 40 },
    knight:    { to: 'tank',       tech: 'combustion',  cost: 45 },
    caravel:   { to: 'battleship', tech: 'combustion',  cost: 45 },
    tank:      { to: 'modern_armor', tech: 'robotics',  cost: 50 },
    spearman:  { to: 'pikeman',     tech: 'feudalism',  cost: 18 },
    // Faction uniques upgrade into the standard next-tier so they don't obsolete
    legionary: { to: 'swordsman',  tech: 'steel',       cost: 25 },
    bloodrider:{ to: 'knight',     tech: 'chivalry',    cost: 28 },
    dromon:    { to: 'caravel',    tech: 'navigation',  cost: 18 }
  };

  var GP_THRESHOLD = 50;  // base great person points needed

  // Worker-built tile improvements. Each one has a context check and a yield.
  // Priority order in pickImprovement matters — specific improvements pick first.
  var IMPROVEMENTS = {
    fishing_boats: {
      name: 'Fishing Boats',
      yield: { food: 2, gold: 1 },
      suitable: function (t) { return t.terrain === 'water' && t.resource === 'fish'; }
    },
    pasture: {
      name: 'Pasture',
      yield: { food: 1, prod: 1 },
      suitable: function (t) {
        return (t.terrain === 'plains' || t.terrain === 'grass')
          && (t.resource === 'cattle' || t.resource === 'horses');
      }
    },
    lumber: {
      name: 'Lumber Mill',
      yield: { prod: 1, gold: 1 },
      suitable: function (t) { return t.terrain === 'forest'; }
    },
    mine: {
      name: 'Mine',
      yield: { prod: 2 },
      suitable: function (t) {
        if (t.terrain === 'hills') return true;
        if (t.terrain === 'desert' &&
            (t.resource === 'iron' || t.resource === 'copper' ||
             t.resource === 'gold' || t.resource === 'gems')) return true;
        return false;
      }
    },
    quarry: {
      name: 'Quarry',
      yield: { prod: 1, gold: 1 },
      suitable: function (t) { return t.terrain === 'desert' && !t.resource; }
    },
    farm: {
      name: 'Farm',
      yield: { food: 1 },
      suitable: function (t) {
        return (t.terrain === 'grass' || t.terrain === 'plains') && !t.improvement
          && !(t.resource === 'cattle' || t.resource === 'horses');
      }
    },
    oil_well: {
      name: 'Oil Well',
      yield: { prod: 2 },
      suitable: function (t) { return t.resource === 'oil'; }
    }
  };
  // Order = priority. First matching wins.
  var IMPROVEMENT_ORDER = ['oil_well', 'fishing_boats', 'pasture', 'lumber', 'mine', 'quarry', 'farm'];

  function pickImprovement(t) {
    if (!t || t.improvement || t.city) return null;
    for (var i = 0; i < IMPROVEMENT_ORDER.length; i++) {
      var id = IMPROVEMENT_ORDER[i];
      if (IMPROVEMENTS[id].suitable(t)) return id;
    }
    return null;
  }

  // Pillaging — a military unit on an enemy-owned improved tile can raze it.
  var PILLAGE_GOLD = 16;
  function pillageInfo(u, t) {
    if (!u || !t || u.moves <= 0) return false;
    if (UNITS[u.type].civilian) return false;             // soldiers only
    if (!t.improvement || !IMPROVEMENTS[t.improvement]) return false;
    if (!t.owner || t.owner === u.civ) return false;       // must be someone else's land
    if (!atWar(u.civ, t.owner)) return false;              // and you must be at war
    return true;
  }
  function pillageTile(u, t) {
    if (!pillageInfo(u, t)) return;
    var owner = t.owner;
    var impName = IMPROVEMENTS[t.improvement].name;
    t.improvement = null;
    u.moves = 0;
    state.civs[u.civ].gold += PILLAGE_GOLD;
    // The victim resents it (already at war, but stokes the grudge).
    if (typeof addTension === 'function' && AI_SIDES.indexOf(owner) >= 0) {
      addTension(owner, u.civ, 8, 'war');
    }
    recomputeIncome(owner);
    if (u.civ === 'player') {
      sfxAttack();
      showToast('Pillaged the ' + impName + '! +' + PILLAGE_GOLD + ' gold', 'success');
      logEvent('Pillaged a ' + impName + ' (+' + PILLAGE_GOLD + ' gold)', 'success');
    }
  }

  var BUILDINGS = {
    granary:  { name: 'Granary',    cost: 24, food: 2, tech: 'pottery'  },
    library:  { name: 'Library',    cost: 24, sci:  2, tech: 'writing'  },
    walls:    { name: 'Walls',      cost: 40, def:  4, tech: 'masonry'  },
    bastion:  { name: 'Bastion',    cost: 45, def:  6, tech: 'masonry', faction: 'tellus', replaces: 'walls' },
    market:   { name: 'Market',     cost: 50, gold: 3, tech: 'currency' },
    aqueduct: { name: 'Aqueduct',   cost: 45, food: 3, tech: 'engineering' },
    temple:   { name: 'Temple',     cost: 40, sci:  3, content: 2, culture: 3, faith: 2, tech: 'theology' },
    shrine:   { name: 'Shrine',     cost: 30, faith: 3, culture: 1, tech: 'theology' },
    monument: { name: 'Monument',   cost: 20, culture: 2 },
    sun_spire: { name: 'Sun Spire',  cost: 30, culture: 4, content: 1, faction: 'solaris', replaces: 'monument' },
    university:{name: 'University', cost: 70, sci:  4, tech: 'education' },
    bank:     { name: 'Bank',       cost: 55, gold: 4, tech: 'banking' },
    // Expansion buildings — production, economy, culture, science, defense lanes
    workshop:     { name: 'Workshop',      cost: 50, prod: 3, tech: 'construction' },
    factory:      { name: 'Factory',       cost: 90, prod: 4, tech: 'industrialization' },
    harbor:       { name: 'Harbor',        cost: 45, food: 2, gold: 2, tech: 'trade', coastal: true },
    observatory:  { name: 'Observatory',   cost: 65, sci:  5, tech: 'astronomy' },
    amphitheater: { name: 'Amphitheater',  cost: 35, culture: 1, content: 2, tech: 'drama' },
    cathedral:    { name: 'Cathedral',     cost: 60, culture: 2, content: 3, faith: 2, tech: 'acoustics' },
    museum:       { name: 'Museum',        cost: 70, culture: 4, tech: 'acoustics' },
    broadcast_tower:{ name: 'Broadcast Tower', cost: 95, culture: 6, tech: 'computers' },
    castle:       { name: 'Castle',        cost: 60, def:  6, tech: 'feudalism' },
    barracks:     { name: 'Barracks',      cost: 40, tech: 'iron', trainPromo: true },
    stock_exchange:{name: 'Stock Exchange',cost: 70, gold: 6, tech: 'economics' },
    // Modern buildings — late ceilings in each lane
    hospital:        { name: 'Hospital',         cost: 75, food: 3, tech: 'sanitation' },
    power_plant:     { name: 'Power Plant',      cost: 90, prodMultiplier: 0.25, tech: 'electricity' },
    military_academy:{ name: 'Military Academy', cost: 75, def: 4, tech: 'conscription' },
    corporation:     { name: 'Corporation',      cost: 85, gold: 8, tech: 'mass_production' },
    research_lab:    { name: 'Research Lab',      cost: 90, sci: 7, tech: 'computers' },
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
                        lore: '+1 prod per hills tile worked' },
    // Classical / Medieval / Modern wonders — late-game payoffs for an
    // empire that survived the opening
    pyramids:         { name: 'Pyramids',         cost: 130, tech: 'masonry',   wonder: true, perCityProd: 1,
                        lore: '+1 production in every city' },
    library_of_alex:  { name: 'Library of Alexandria', cost: 140, tech: 'writing', wonder: true, perCitySci: 2,
                        lore: '+2 science in every city' },
    notre_dame:       { name: 'Notre Dame',       cost: 170, tech: 'theology',  wonder: true, perCityCulture: 2,
                        lore: '+2 culture (great-people) per city, per turn' },
    big_ben:          { name: 'Big Ben',          cost: 200, tech: 'banking',   wonder: true, goldMultiplier: 0.3,
                        lore: '+30% gold income' },
    statue_liberty:   { name: 'Statue of Liberty', cost: 220, tech: 'gunpowder', wonder: true, militaryAtk: 1,
                        lore: '+1 attack on all your military units' },
    university_of_sankore: { name: 'University of Sankore', cost: 170, tech: 'astronomy', wonder: true, perCitySci: 2,
                        lore: '+2 science in every city you own' },
    sistine_chapel:   { name: 'Sistine Chapel',   cost: 180, tech: 'acoustics', wonder: true, perCityCulture: 3,
                        lore: '+3 culture (great-people) per city, per turn' },
    // Modern wonders — the late prizes
    hoover_dam:       { name: 'Hoover Dam',       cost: 220, tech: 'electricity', wonder: true, perCityProd: 1,
                        lore: '+1 production in every city you own' },
    west_point:       { name: 'West Point',       cost: 200, tech: 'ballistics',  wonder: true, militaryAtk: 1,
                        lore: '+1 attack on all your military units' },
    eiffel_tower:     { name: 'Eiffel Tower',     cost: 210, tech: 'mass_production', wonder: true, perCityCulture: 2,
                        lore: '+2 culture (great-people) per city, per turn' },
    internet:         { name: 'The Internet',     cost: 260, tech: 'computers',   wonder: true, perCitySci: 3, oneShotScience: 100,
                        lore: '+3 science in every city, and instantly gain 100 research' },
    // More classic World Wonders (each unique per game)
    colossus:         { name: 'Colossus',         cost:  90, tech: 'currency',   wonder: true, perCityGold: 1,
                        lore: '+1 gold in every city — a bronze beacon of trade' },
    petra:            { name: 'Petra',            cost: 120, tech: 'trade',      wonder: true, perCityFood: 1, perCityProd: 1,
                        lore: '+1 food & +1 production in every city — a desert crossroads' },
    hagia_sophia:     { name: 'Hagia Sophia',     cost: 160, tech: 'theology',   wonder: true, perCityCulture: 2,
                        lore: '+2 culture in every city — a great basilica of the age' },
    machu_picchu:     { name: 'Machu Picchu',     cost: 170, tech: 'engineering', wonder: true, perCityGold: 2,
                        lore: '+2 gold in every city — a mountain citadel of trade roads' },
    hubble:           { name: 'Hubble Telescope', cost: 300, tech: 'satellites', wonder: true, oneShotScience: 150, spaceParts: 1,
                        lore: 'Instantly gain 150 research and +1 Spaceship Part' },
    singularity:      { name: 'The Singularity',  cost: 360, tech: 'artificial_intelligence', wonder: true, perCitySci: 4,
                        lore: '+4 science in every city — runaway machine intelligence' },
    // Information-age Project wonders
    manhattan_project: { name: 'Manhattan Project', cost: 240, tech: 'nuclear_fission', wonder: true, militaryAtk: 1,
                        lore: 'Unlocks the Nuke · +1 attack on all your military units' },
    apollo_program:   { name: 'Apollo Program',   cost: 280, tech: 'space_flight', wonder: true, spaceParts: 2,
                        lore: 'A head start in the Space Race: +2 Spaceship Parts toward launch' },
    // National Wonders — empire-unique (one per civ, NOT per world), each gated by
    // having the prerequisite building in EVERY city (requiresAll). Local effects.
    oxford:           { name: 'Oxford University', cost: 140, tech: 'education', national: true, requiresAll: 'library', sci: 6, oneShotScience: 80,
                        lore: '+6 science here & 80 instant research — needs a Library in every city' },
    ironworks:        { name: 'Ironworks',        cost: 150, tech: 'industrialization', national: true, requiresAll: 'workshop', prod: 6,
                        lore: '+6 production here — needs a Workshop in every city' },
    heroic_epic:      { name: 'Heroic Epic',      cost: 120, tech: 'feudalism', national: true, requiresAll: 'barracks', culture: 3,
                        lore: 'Units built here muster with 2 free promotions — needs a Barracks in every city' },
    // Spaceship Part — a repeatable build (NOT a regular building). Completing
    // SPACE_PARTS_NEEDED of them launches your ship → Space Race victory.
    spaceship_part:   { name: 'Spaceship Part',   cost: 200, tech: 'space_flight', spacePart: true,
                        lore: 'Assemble the launch vehicle — race rivals to space' }
  };
  var SPACE_PARTS_NEEDED = 6;   // build this many parts → Space Race victory

  var TECHS = {
    pottery:     { name: 'Pottery',      cost:  10, req: [],                          unlocks: 'Granary' },
    writing:     { name: 'Writing',      cost:  16, req: ['pottery'],                 unlocks: 'Library' },
    sailing:     { name: 'Sailing',      cost:  18, req: ['pottery'],                 unlocks: 'Galley, Fishing Boats' },
    archery:     { name: 'Archery',      cost:  18, req: [],                          unlocks: 'Archer' },
    masonry:     { name: 'Masonry',      cost:  22, req: ['pottery'],                 unlocks: 'Walls' },
    husbandry:   { name: 'Husbandry',    cost:  35, req: ['archery'],                 unlocks: 'Horseman' },
    currency:    { name: 'Currency',     cost:  45, req: ['masonry'],                 unlocks: 'Market' },
    iron:        { name: 'Metalworking', cost:  60, req: ['husbandry','currency'],    unlocks: '+2 atk Warriors' },
    engineering: { name: 'Engineering',  cost:  50, req: ['masonry','archery'],       unlocks: 'Catapult, Aqueduct' },
    theology:    { name: 'Theology',     cost:  60, req: ['currency','pottery'],      unlocks: 'Temple' },
    philosophy:  { name: 'Philosophy',   cost:  55, req: ['theology','writing'],      unlocks: '+1 sci per Temple' },
    education:   { name: 'Education',    cost:  80, req: ['theology','writing'],      unlocks: 'University, Oxford' },
    steel:       { name: 'Steel',        cost:  80, req: ['iron'],                    unlocks: 'Swordsman' },
    gunpowder:   { name: 'Gunpowder',    cost: 100, req: ['steel','engineering'],     unlocks: 'Musketman' },
    banking:     { name: 'Banking',      cost:  90, req: ['theology','currency'],     unlocks: 'Bank' },
    // Expansion — parallel "lanes" (production, economy, culture, naval, deeper
    // military + science) so each era offers a meaningful "which next" choice.
    mining:        { name: 'Mining',         cost:  12, req: [],                         unlocks: '+1 prod from Mines' },
    agriculture:   { name: 'Agriculture',    cost:  14, req: ['pottery'],                unlocks: '+1 food from Farms' },
    trade:         { name: 'Trade',          cost:  34, req: ['currency'],               unlocks: 'Harbor' },
    construction:  { name: 'Construction',   cost:  42, req: ['masonry'],                unlocks: 'Workshop' },
    mathematics:   { name: 'Mathematics',    cost:  50, req: ['masonry','currency'],     unlocks: 'Trebuchet' },
    drama:         { name: 'Drama',          cost:  46, req: ['writing'],                unlocks: 'Amphitheater' },
    feudalism:     { name: 'Feudalism',      cost:  58, req: ['husbandry','masonry'],    unlocks: 'Pikeman, Castle, Heroic Epic' },
    chivalry:      { name: 'Chivalry',       cost:  66, req: ['husbandry','iron'],       unlocks: 'Knight' },
    navigation:    { name: 'Navigation',     cost:  62, req: ['sailing','currency'],     unlocks: 'Caravel' },
    economics:     { name: 'Economics',      cost:  74, req: ['banking','trade'],        unlocks: 'Stock Exchange' },
    astronomy:     { name: 'Astronomy',      cost:  88, req: ['education','navigation'], unlocks: 'Observatory, U. of Sankore' },
    acoustics:     { name: 'Acoustics',      cost:  92, req: ['drama','education'],      unlocks: 'Cathedral, Sistine Chapel' },
    metallurgy:    { name: 'Metallurgy',     cost: 100, req: ['steel','mathematics'],    unlocks: 'Cannon' },
    industrialization: { name: 'Industrialization', cost: 150, req: ['construction','economics'], unlocks: 'Factory, Ironworks' },
    rifling:       { name: 'Rifling',        cost: 135, req: ['gunpowder','metallurgy'], unlocks: 'Rifleman; +1 atk muskets' },
    // Modern age (6th) — industry, modern war, late science. Each gates one
    // concrete engine-piece; governments hang off conscription / mass production.
    sanitation:    { name: 'Sanitation',     cost: 150, req: ['industrialization'],      unlocks: 'Hospital' },
    electricity:   { name: 'Electricity',    cost: 160, req: ['industrialization'],      unlocks: 'Power Plant, Hoover Dam' },
    conscription:  { name: 'Conscription',   cost: 165, req: ['rifling'],                unlocks: 'Infantry, Military Academy' },
    ballistics:    { name: 'Ballistics',     cost: 175, req: ['rifling','metallurgy'],   unlocks: 'Artillery, West Point' },
    combustion:    { name: 'Combustion',     cost: 195, req: ['electricity','ballistics'], unlocks: 'Tank, Battleship (oil)' },
    mass_production: { name: 'Mass Production', cost: 205, req: ['electricity','conscription'], unlocks: 'Corporation, Fighter' },
    computers:     { name: 'Computers',      cost: 240, req: ['mass_production','combustion'], unlocks: 'Research Lab, The Internet' },
    // Information age (7th) — the modern frontier: nuclear arms, rocketry, AI,
    // robotics, and the Space Race. Gates the apex units, two Project wonders,
    // and the Spaceship Parts that win a Space Race victory.
    electronics:   { name: 'Electronics',    cost: 260, req: ['computers'],                   unlocks: 'Submarine, Carrier' },
    rocketry:      { name: 'Rocketry',       cost: 280, req: ['computers','ballistics'],      unlocks: 'Bomber' },
    computing:     { name: 'Computing',      cost: 290, req: ['computers'],                   unlocks: 'Research Lab · AI path' },
    nuclear_fission: { name: 'Nuclear Fission', cost: 320, req: ['electronics'],              unlocks: 'Nuke, Manhattan Project' },
    robotics:      { name: 'Robotics',       cost: 320, req: ['electronics'],                 unlocks: 'Modern Armor (oil)' },
    satellites:    { name: 'Satellites',     cost: 340, req: ['rocketry'],                    unlocks: 'Hubble · Space prereq' },
    artificial_intelligence: { name: 'Artificial Intelligence', cost: 360, req: ['computing','robotics'], unlocks: 'The Singularity' },
    space_flight:  { name: 'Space Flight',   cost: 400, req: ['satellites','computing'],      unlocks: 'Apollo Program, Spaceship' }
  };
  var TECH_ORDER = ['pottery','mining','agriculture','writing','sailing','archery','masonry','husbandry','currency','trade','construction','mathematics','drama','iron','engineering','theology','feudalism','philosophy','navigation','education','steel','chivalry','economics','astronomy','acoustics','gunpowder','banking','metallurgy','industrialization','rifling','sanitation','electricity','conscription','ballistics','combustion','mass_production','computers','electronics','rocketry','computing','nuclear_fission','robotics','satellites','artificial_intelligence','space_flight'];
  // Tier = longest prerequisite chain depth (0 = no prereqs). Drives the tech-tree
  // graph layout: each tier is one row, dependents sit below their requirements.
  var TECH_DEPTH = (function () {
    var d = {};
    function dep(k) {
      if (d[k] != null) return d[k];
      var r = TECHS[k].req;
      if (!r.length) { d[k] = 0; return 0; }
      var m = 0;
      r.forEach(function (x) { m = Math.max(m, dep(x)); });
      d[k] = m + 1;
      return d[k];
    }
    TECH_ORDER.forEach(dep);
    return d;
  })();

  // Victory thresholds
  // Culture victory = adopt all 14 civics (Cultural Ascendancy) — see civicsComplete()
  var ECONOMIC_VICTORY_GOLD   = 1500;  // hold this much gold...
  var ECONOMIC_VICTORY_TURNS  = 5;     // ...for this many consecutive turns → economic victory

  // Age thresholds — purely cosmetic + small gold bonus on advancement.
  // Re-spaced over the 30-tech tree so each era gates roughly one fifth.
  var AGES = [
    { name: 'Ancient',     minTechs: 0 },
    { name: 'Classical',   minTechs: 6 },
    { name: 'Medieval',    minTechs: 12 },
    { name: 'Renaissance', minTechs: 18 },
    { name: 'Industrial',  minTechs: 24 },
    { name: 'Modern',      minTechs: 31 },
    { name: 'Information', minTechs: 39 }
  ];
  function getAge(civ) {
    var count = 0;
    for (var i = 0; i < TECH_ORDER.length; i++) if (civ.techs[TECH_ORDER[i]]) count++;
    for (var a = AGES.length - 1; a >= 0; a--) {
      if (count >= AGES[a].minTechs) return AGES[a];
    }
    return AGES[0];
  }
  // Gold bonus on age advancement — scales with the age tier so all five pay
  // distinctly (Ancient 20 → Industrial 80).
  function ageAdvanceGold(age) {
    var idx = AGES.indexOf(age);
    if (idx < 0) idx = 0;
    return 20 + idx * 15;
  }

  // GOVERNMENTS — a switchable, empire-wide stance unlocked by tech. Exactly one
  // is active per civ. Switching costs 2 turns of "anarchy" (positive gold/sci
  // halved) before the new bonuses apply. Bonuses are small (+1/+2 per city),
  // mutually exclusive, so no government snowballs.
  var GOVERNMENTS = {
    despotism: { name: 'Despotism', tech: null },
    monarchy:  { name: 'Monarchy',  tech: 'currency',        perCityGold: 2, contentment: 1 },
    republic:  { name: 'Republic',  tech: 'philosophy',      perCitySci: 1 },
    theocracy: { name: 'Theocracy', tech: 'theology',        perCityCulture: 1, eraPointMult: 1.25, contentment: 2 },
    autocracy: { name: 'Autocracy', tech: 'conscription',    unitAtk: 1, perCityProd: 1 },
    democracy: { name: 'Democracy', tech: 'mass_production', perCityGold: 1, perCitySci: 1 }
  };
  var GOVERNMENT_ORDER = ['despotism', 'monarchy', 'republic', 'theocracy', 'autocracy', 'democracy'];
  var ANARCHY_TURNS = 2;          // commitment cost when switching government

  // IDEOLOGIES — a late-game, culture-side identity (mirror of governments). One
  // is adopted once a civ reaches the Information age; big empire-wide bonuses
  // folded by ideologyEff into the SAME sites as governments/civics/factions.
  var IDEOLOGIES = {
    freedom:   { name: 'Freedom',   desc: 'Science & culture — a free, inventive people.', eff: { perCitySci: 1, perCityCulture: 1, gpMult: 0.25 } },
    order:     { name: 'Order',     desc: 'Production & stability — a disciplined society.', eff: { perCityProd: 1, perCityStability: 2 } },
    autocracy: { name: 'Autocracy', desc: 'Military & expansion — strength above all.', eff: { unitAtk: 1, perCityProd: 1, eraPointMult: 0.25 } }
  };
  var IDEOLOGY_ORDER = ['freedom', 'order', 'autocracy'];
  var IDEOLOGY_AGE = 5;   // unlocked once a civ reaches the Modern age (AGES idx 5)
  function ideologyEff(civ, key) {
    if (!civ || !civ.ideology) return 0;
    var i = IDEOLOGIES[civ.ideology];
    return (i && i.eff && i.eff[key]) || 0;
  }
  function ideologyUnlocked(civ) { return AGES.indexOf(getAge(civ)) >= IDEOLOGY_AGE; }

  // RELIGION — accumulate Faith (Shrine/Temple/Cathedral), found ONE faith with a
  // chosen Belief, and it spreads city-to-city by pressure each turn. Convert a
  // majority of the world's cities → a Religious victory.
  var RELIGION_POOL = [
    { id: 'solhar',  name: 'Solhar',           icon: '☀' },
    { id: 'deepway', name: 'The Deep Way',     icon: '🌊' },
    { id: 'starlit', name: 'Starlit Communion', icon: '✦' },
    { id: 'emberite',name: 'The Ember Creed',  icon: '🔥' },
    { id: 'verdant', name: 'Verdant Path',     icon: '🍃' },
    { id: 'ironvow', name: 'The Iron Vow',     icon: '⚔' }
  ];
  // Beliefs — founder-side ones (founderGold / founderFaith) pay the FOUNDER per
  // following city anywhere; cityEff ones boost every city that FOLLOWS the faith
  // (folded by religionCityEff); `spread` sharpens conversion pressure/range. A
  // religion picks one belief at founding and may add a 2nd via Reformation.
  var BELIEFS = {
    tithe:       { name: 'Tithe',          desc: '+1 gold to you per city that follows your faith',     founderGold: 1 },
    pilgrimage:  { name: 'Pilgrimage',     desc: '+1 faith to you per city that follows your faith',    founderFaith: 1 },
    piety:       { name: 'Piety',          desc: '+1 culture in every city that follows your faith',    cityEff: { culture: 1 } },
    scholarship: { name: 'Scholarship',    desc: '+1 science in every city that follows your faith',    cityEff: { sci: 1 } },
    fertility:   { name: 'Fertility',      desc: '+1 food in every city that follows your faith',       cityEff: { food: 1 } },
    stewardship: { name: 'Stewardship',    desc: '+1 production in every city that follows your faith', cityEff: { prod: 1 } },
    prosperity:  { name: 'Prosperity',     desc: '+1 gold in every city that follows your faith',       cityEff: { gold: 1 } },
    zeal:        { name: 'Missionary Zeal', desc: 'Your faith spreads faster and 1 hex farther',        spread: { pressure: 0.6, range: 1 } }
  };
  var BELIEF_ORDER = ['tithe', 'pilgrimage', 'piety', 'scholarship', 'fertility', 'stewardship', 'prosperity', 'zeal'];

  // PANTHEONS — a cheap, EARLY faith pick (before a full religion) that buffs ALL
  // of the civ's own cities regardless of which faith they follow. Kept after a
  // religion is founded. One per civ.
  var PANTHEONS = {
    fertility_rites: { name: 'Fertility Rites',   desc: '+1 food in all your cities',       cityEff: { food: 1 } },
    god_of_forge:    { name: 'God of the Forge',  desc: '+1 production in all your cities',  cityEff: { prod: 1 } },
    god_of_commerce: { name: 'God of Commerce',   desc: '+1 gold in all your cities',        cityEff: { gold: 1 } },
    goddess_wisdom:  { name: 'Goddess of Wisdom', desc: '+1 science in all your cities',      cityEff: { sci: 1 } },
    stone_circles:   { name: 'Stone Circles',     desc: '+1 faith per turn per city',        faith: 1 }
  };
  var PANTHEON_ORDER = ['fertility_rites', 'god_of_forge', 'god_of_commerce', 'goddess_wisdom', 'stone_circles'];
  var PANTHEON_COST = 20;         // faith spent to adopt a pantheon (cheap, early)
  var RELIGION_FOUND_COST = 60;   // faith banked before a faith can be founded
  var REFORMATION_FOLLOWERS = 4;  // following cities before a faith may add a 2nd belief
  var RELIGION_RANGE = 5;         // hexes a holy/religious city radiates pressure
  var RELIGION_VICTORY_FRAC = 0.6; // share of all cities needed for a Religious win

  // The belief object(s) a religion carries (founding belief + optional Reformation belief).
  function beliefsOf(rd) {
    if (!rd) return [];
    var out = [];
    if (rd.belief && BELIEFS[rd.belief]) out.push(BELIEFS[rd.belief]);
    if (rd.belief2 && BELIEFS[rd.belief2]) out.push(BELIEFS[rd.belief2]);
    return out;
  }
  // Founder-side yield (founderGold / founderFaith) = per-belief rate × follower cities.
  function founderYield(civ, key) {
    if (!civ || !civ.religionId) return 0;
    var per = 0;
    beliefsOf(religionDef(civ.religionId)).forEach(function (b) { if (b[key]) per += b[key]; });
    return per * religionFollowerCount(civ.religionId);
  }
  // Extra spread pressure / range a religion's beliefs grant (Missionary Zeal).
  function religionSpread(rid) {
    var extraP = 0, extraR = 0;
    beliefsOf(religionDef(rid)).forEach(function (b) { if (b.spread) { extraP += b.spread.pressure || 0; extraR += b.spread.range || 0; } });
    return { pressure: extraP, range: extraR };
  }
  // Pantheon helpers — a civ-wide buff on the owner's own cities.
  function pantheonDef(civ) { return civ && civ.pantheon ? PANTHEONS[civ.pantheon] : null; }
  function pantheonEff(civ, key) { var p = pantheonDef(civ); return (p && p.cityEff && p.cityEff[key]) || 0; }
  function canFoundPantheon(civ) { return civ && !civ.pantheon && (civ.faith || 0) >= PANTHEON_COST; }
  function foundPantheon(civ, id) {
    if (!canFoundPantheon(civ) || !PANTHEONS[id]) return false;
    civ.pantheon = id;
    civ.faith = Math.max(0, (civ.faith || 0) - PANTHEON_COST);
    recomputeIncome(civ.id);
    return true;
  }
  // Reformation — a founded faith with enough reach may add a second belief.
  function canReform(civ) {
    if (!civ || !civ.religionId) return false;
    var rd = religionDef(civ.religionId);
    return rd && !rd.belief2 && religionFollowerCount(civ.religionId) >= REFORMATION_FOLLOWERS;
  }
  function reformReligion(civ, belief2) {
    if (!canReform(civ) || !BELIEFS[belief2]) return false;
    var rd = religionDef(civ.religionId);
    if (rd.belief === belief2) return false;    // can't double up the same belief
    rd.belief2 = belief2;
    recomputeIncome(civ.id);
    return true;
  }
  // The faith a civ identifies with: the one it founded, else its cities' majority.
  function civMajorityReligion(civ) {
    if (!civ) return null;
    if (civ.religionId) return civ.religionId;
    var counts = {}, best = null, bestN = 0;
    (civ.cities || []).forEach(function (ct) {
      if (!ct.religion) return;
      counts[ct.religion] = (counts[ct.religion] || 0) + 1;
      if (counts[ct.religion] > bestN) { bestN = counts[ct.religion]; best = ct.religion; }
    });
    return best;
  }

  // --- Religious units & faith economy ------------------------------------
  var MISSIONARY_FAITH_COST = 40;   // faith to buy a Missionary
  var INQUISITOR_FAITH_COST = 30;   // faith to buy an Inquisitor
  var MISSIONARY_CHARGES    = 2;    // conversions a Missionary can perform
  var CONVERSION_LOCK_TURNS = 8;    // turns a purged city resists reconversion

  function faithUnitCost(type) { return type === 'missionary' ? MISSIONARY_FAITH_COST : type === 'inquisitor' ? INQUISITOR_FAITH_COST : 0; }
  function canBuyFaithUnit(civ, type) {
    if (!civ || !civ.cities.length || !civMajorityReligion(civ)) return false;   // need a faith to carry
    return (civ.faith || 0) >= faithUnitCost(type);
  }
  // Buy a religious unit with faith; spawns it near the given city.
  function buyFaithUnit(civ, city, type) {
    if (!canBuyFaithUnit(civ, type) || !city) return null;
    var spot = findSpawnTile(city, type);
    if (!spot) return null;
    civ.faith = Math.max(0, (civ.faith || 0) - faithUnitCost(type));
    var u = spawnUnit(civ.id, type, spot[0], spot[1]);
    if (u && type === 'missionary') u.spreadCharges = MISSIONARY_CHARGES;
    return u;
  }
  // The city on a unit's tile, else an adjacent one, matching an optional filter.
  function cityOnOrAdjacent(unit, filter) {
    var here = tileAt(unit.c, unit.r);
    if (here && here.city && (!filter || filter(here.city))) return here.city;
    var ns = neighbors(unit.c, unit.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && t.city && (!filter || filter(t.city))) return t.city;
    }
    return null;
  }
  // Missionary: convert a nearby city to the unit's faith, spending one charge.
  function missionarySpread(unit) {
    var civ = state.civs[unit.civ];
    var rel = civMajorityReligion(civ);
    if (!rel) return false;
    var target = cityOnOrAdjacent(unit, function (ct) { return ct.religion !== rel && !ct.holyCity && !(ct.religionLockTurns > 0); });
    if (!target) return false;
    target.religion = rel;
    unit.spreadCharges = (unit.spreadCharges || 1) - 1;
    if (unit.civ === 'player') { sfxBuild(); logEvent(UNITS[unit.type].name + ' spread the faith to ' + target.name, 'success'); }
    if (unit.spreadCharges <= 0) killUnit(unit); else unit.moves = 0;
    return true;
  }
  // Inquisitor: reconvert one of your cities to your faith and lock it for a while.
  function inquisitorPurge(unit) {
    var civ = state.civs[unit.civ];
    var rel = civMajorityReligion(civ);
    if (!rel) return false;
    var target = cityOnOrAdjacent(unit, function (ct) { return ct.civ === unit.civ; });
    if (!target) return false;
    target.religion = rel;
    target.religionLockTurns = CONVERSION_LOCK_TURNS;
    if (unit.civ === 'player') { sfxBuild(); logEvent('Inquisitor sanctified ' + target.name, 'success'); }
    killUnit(unit);
    return true;
  }
  // Great Prophet helpers — found for free, or imprint the faith on nearby cities.
  function prophetCanFound(civ) { return civ && !civ.religionId && foundedReligionCount() < RELIGION_POOL.length; }
  function prophetSpread(unit) {
    var civ = state.civs[unit.civ];
    var rel = civMajorityReligion(civ);
    if (!rel) return false;
    var tiles = [[unit.c, unit.r]].concat(neighbors(unit.c, unit.r));
    var any = false;
    tiles.forEach(function (xy) {
      var t = tileAt(xy[0], xy[1]);
      if (t && t.city && !t.city.holyCity && t.city.religion !== rel) { t.city.religion = rel; any = true; }
    });
    return any;
  }
  // AI faith play: purge a heretical home city, then send "a missionary" (abstract
  // — spends the faith cost) to convert a rival/unconverted city near its borders.
  function aiReligiousSpread(civ) {
    var rel = civ.religionId;
    if (!rel) return;
    if ((civ.faith || 0) >= INQUISITOR_FAITH_COST) {
      for (var i = 0; i < civ.cities.length; i++) {
        var cc = civ.cities[i];
        if (!cc.holyCity && cc.religion && cc.religion !== rel) { cc.religion = rel; cc.religionLockTurns = CONVERSION_LOCK_TURNS; civ.faith -= INQUISITOR_FAITH_COST; break; }
      }
    }
    if ((civ.faith || 0) >= MISSIONARY_FAITH_COST) {
      var best = null, bestD = Infinity;
      CIV_SIDES.concat(['cs']).forEach(function (cid) {
        var c = state.civs[cid];
        if (!c || !c.cities) return;
        c.cities.forEach(function (ct) {
          if (ct.religion === rel || ct.holyCity || ct.religionLockTurns > 0) return;
          var d = Infinity;
          civ.cities.forEach(function (mc) { d = Math.min(d, hexDist([ct.c, ct.r], [mc.c, mc.r])); });
          if (d <= RELIGION_RANGE + 2 && d < bestD) { bestD = d; best = ct; }
        });
      });
      if (best) { best.religion = rel; civ.faith -= MISSIONARY_FAITH_COST; }
    }
  }

  // Faith generated per turn: holy buildings + Stone Circles pantheon + the
  // Pilgrimage belief (founder faith per following city).
  function faithPerTurn(civ) {
    var f = 0;
    civ.cities.forEach(function (ct) {
      var b = ct.buildings || {};
      if (b.shrine) f += BUILDINGS.shrine.faith;
      if (b.temple) f += BUILDINGS.temple.faith;
      if (b.cathedral) f += BUILDINGS.cathedral.faith;
    });
    var pd = pantheonDef(civ);
    if (pd && pd.faith) f += pd.faith * civ.cities.length;
    f += founderYield(civ, 'founderFaith');
    return f;
  }
  function canFoundReligion(civ) {
    return !civ.religionId && (civ.faith || 0) >= RELIGION_FOUND_COST && foundedReligionCount() < RELIGION_POOL.length;
  }
  function foundedReligionCount() { return Object.keys(state.religions || {}).length; }
  function religionDef(id) { return id && state.religions ? state.religions[id] : null; }
  // The belief-yield a FOLLOWING city earns, summed across the faith's belief(s).
  function religionCityEff(city, key) {
    var rd = city && city.religion ? religionDef(city.religion) : null;
    var s = 0;
    beliefsOf(rd).forEach(function (b) { if (b.cityEff && b.cityEff[key]) s += b.cityEff[key]; });
    return s;
  }
  // Cities anywhere that follow a given religion.
  function religionFollowerCount(id) {
    if (!id) return 0;
    var n = 0;
    CIV_SIDES.concat(['cs']).forEach(function (cid) {
      var c = state.civs[cid];
      if (c && c.cities) c.cities.forEach(function (ct) { if (ct.religion === id) n++; });
    });
    return n;
  }
  function totalCityCount() {
    var n = 0;
    CIV_SIDES.concat(['cs']).forEach(function (cid) {
      var c = state.civs[cid];
      if (c && c.cities) n += c.cities.length;
    });
    return n;
  }

  // EDICTS — a fast, reactive lever (vs. governments, which are a slow identity
  // pick). Exactly one active at a time; it runs for a fixed duration then
  // lapses. Each is a single sharp +x/-y tradeoff on the SAME effect fields the
  // government bonuses use, so it folds into the same income/yield/atk sites.
  var EDICTS = {
    war_footing: { name: 'War Footing', tech: null,        turns: 6, eff: { unitAtk: 1, perCityGold: -1 }, desc: '+1 unit attack · -1 gold/city' },
    mobilization:{ name: 'Mobilization', tech: 'iron',      turns: 6, eff: { perCityProd: 1, perCitySci: -1 }, desc: '+1 prod/city · -1 sci/city' },
    free_market: { name: 'Free Market', tech: 'currency',   turns: 6, eff: { perCityGold: 2, perCityProd: -1 }, desc: '+2 gold/city · -1 prod/city' },
    scholarship: { name: 'Scholarship', tech: 'writing',    turns: 6, eff: { perCitySci: 2, perCityGold: -1 }, desc: '+2 science/city · -1 gold/city' },
    festivals:   { name: 'Festivals',   tech: 'drama',      turns: 6, eff: { contentment: 2, perCityGold: -1 }, desc: '+2 stability/city · -1 gold/city' },
    levy:        { name: 'Mass Levy',   tech: 'feudalism',  turns: 6, eff: { perCityProd: 1, contentment: -1 }, desc: '+1 prod/city · -1 stability/city' }
  };
  var EDICT_ORDER = ['war_footing', 'mobilization', 'free_market', 'scholarship', 'festivals', 'levy'];
  // The active edict's def, or null when none is running.
  function activeEdict(civ) {
    if (!civ || !(civ.edictTurns > 0) || !civ.edict) return null;
    return EDICTS[civ.edict] || null;
  }
  // Signed value an active edict contributes for a given effect key (0 if none).
  function edictEff(civ, key) {
    var e = activeEdict(civ);
    return (e && e.eff && e.eff[key]) ? e.eff[key] : 0;
  }
  // Proclaim an edict for its full duration (replaces any current one).
  function setEdict(civ, id) {
    var e = EDICTS[id];
    if (!civ || !e) return false;
    if (e.tech && !civ.techs[e.tech]) return false;
    civ.edict = id;
    civ.edictTurns = e.turns;
    if (civ.id === 'player') { showToast('Edict: ' + e.name + ' (' + e.turns + ' turns)', 'success'); logEvent('Proclaimed ' + e.name + ' — ' + e.desc, 'success'); }
    return true;
  }
  // AI proclaims a fitting edict when none is active, by personality.
  function aiPickEdict(civ) {
    if (!civ || civ.edictTurns > 0) return;
    var pref;
    switch (civ.personality) {
      case 'aggressive': case 'warmonger': pref = ['war_footing', 'mobilization', 'levy']; break;
      case 'economic': pref = ['free_market', 'mobilization']; break;
      case 'scientific': pref = ['scholarship', 'free_market']; break;
      case 'peaceful': pref = ['festivals', 'scholarship']; break;
      default: pref = ['mobilization'];
    }
    for (var i = 0; i < pref.length; i++) { var e = EDICTS[pref[i]]; if (e && (!e.tech || civ.techs[e.tech])) { setEdict(civ, pref[i]); return; } }
  }

  // CIVICS — a SEPARATE culture tree (its own dependency graph, fuelled by
  // culture/turn, distinct from the tech tree). Each adopted civic grants a
  // permanent bonus on a cultural axis that COMPOSES with governments/edicts.
  // Completing the whole tree wins a Cultural Ascendancy victory.
  var CIVICS = {
    // Tier 0
    oral_tradition:  { name: 'Oral Tradition',  cost: 30,  req: [], eff: { perCityCulture: 1 }, lore: '+1 culture in every city' },
    code_of_laws:    { name: 'Code of Laws',    cost: 30,  req: [], eff: { perCityStability: 1 }, lore: '+1 stability in every city' },
    agrarianism:     { name: 'Agrarianism',     cost: 30,  req: [], eff: { perCityFood: 1 }, lore: '+1 food in every city' },
    // Tier 1
    drama_poetry:    { name: 'Drama & Poetry',  cost: 60,  req: ['oral_tradition'], eff: { perCityCulture: 1 }, lore: '+1 culture in every city' },
    monastic_orders: { name: 'Monastic Orders', cost: 60,  req: ['oral_tradition'], eff: { gpMult: 0.2 }, lore: '+20% Great People' },
    guilds:          { name: 'Guilds',          cost: 60,  req: ['code_of_laws'], eff: { perCityGold: 1 }, lore: '+1 gold in every city' },
    // Tier 2
    aesthetics:      { name: 'Aesthetics',      cost: 100, req: ['drama_poetry'], eff: { perCityCulture: 2 }, lore: '+2 culture in every city' },
    patronage:       { name: 'Patronage',       cost: 100, req: ['drama_poetry', 'monastic_orders'], eff: { goldenAgeBonus: 3 }, lore: 'Golden Ages last +3 turns' },
    civil_service:   { name: 'Civil Service',   cost: 100, req: ['guilds', 'code_of_laws'], eff: { anarchyReduce: 1 }, lore: '-1 anarchy turn switching government' },
    // Tier 3
    enlightenment:   { name: 'Enlightenment',   cost: 150, req: ['aesthetics', 'civil_service'], eff: { perCitySci: 1, perCityCulture: 1 }, lore: '+1 science & +1 culture in every city' },
    nationalism:     { name: 'Nationalism',     cost: 150, req: ['patronage'], eff: { unitAtk: 1 }, lore: '+1 attack on all military units' },
    urbanization:    { name: 'Urbanization',    cost: 150, req: ['civil_service'], eff: { perCityStability: 1, perCityGold: 1 }, lore: '+1 stability & +1 gold in every city' },
    // Tier 4
    cultural_hegemony: { name: 'Cultural Hegemony', cost: 220, req: ['enlightenment', 'nationalism'], eff: { perCityCulture: 3 }, lore: '+3 culture in every city' },
    mass_media:      { name: 'Mass Media',      cost: 220, req: ['urbanization', 'enlightenment'], eff: { eraPointMult: 0.3, perCityCulture: 2 }, lore: '+30% Era Points & +2 culture in every city' },
    // Tier 5 — the modern social order (all fold via the existing civicSum sites)
    meritocracy:     { name: 'Meritocracy',     cost: 300, req: ['mass_media'], eff: { perCitySci: 2 }, lore: '+2 science in every city' },
    mercantilism:    { name: 'Mercantilism',    cost: 300, req: ['cultural_hegemony'], eff: { perCityGold: 2 }, lore: '+2 gold in every city' },
    environmentalism:{ name: 'Environmentalism',cost: 300, req: ['mass_media'], eff: { perCityFood: 2 }, lore: '+2 food in every city' },
    total_war:       { name: 'Total War',       cost: 320, req: ['cultural_hegemony'], eff: { unitAtk: 1, perCityProd: 1 }, lore: '+1 attack & +1 production in every city' },
    welfare:         { name: 'Welfare State',   cost: 340, req: ['mass_media', 'cultural_hegemony'], eff: { perCityStability: 2 }, lore: '+2 stability in every city' }
  };
  var CIVIC_ORDER = ['oral_tradition', 'code_of_laws', 'agrarianism', 'drama_poetry', 'monastic_orders', 'guilds', 'aesthetics', 'patronage', 'civil_service', 'enlightenment', 'nationalism', 'urbanization', 'cultural_hegemony', 'mass_media', 'meritocracy', 'mercantilism', 'environmentalism', 'total_war', 'welfare'];
  // Tier = longest prereq-chain depth (drives the civics-graph row layout).
  var CIVIC_DEPTH = (function () {
    var d = {};
    function dep(k) {
      if (d[k] != null) return d[k];
      var r = CIVICS[k].req;
      if (!r.length) { d[k] = 0; return 0; }
      var m = 0; r.forEach(function (x) { m = Math.max(m, dep(x)); });
      d[k] = m + 1; return d[k];
    }
    CIVIC_ORDER.forEach(dep);
    return d;
  })();
  // Sum an effect key across all of a civ's ADOPTED civics (0 if none).
  function civicSum(civ, key) {
    if (!civ || !civ.civics) return 0;
    var s = 0;
    for (var id in civ.civics) { if (civ.civics[id] && CIVICS[id] && CIVICS[id].eff && CIVICS[id].eff[key]) s += CIVICS[id].eff[key]; }
    return s;
  }
  function civicsAdopted(civ) { var n = 0; for (var i = 0; i < CIVIC_ORDER.length; i++) if (civ.civics && civ.civics[CIVIC_ORDER[i]]) n++; return n; }
  function civicsComplete(civ) { return civicsAdopted(civ) >= CIVIC_ORDER.length; }
  function canAdoptCivic(civ, id) {
    if (!CIVICS[id] || (civ.civics && civ.civics[id])) return false;
    return CIVICS[id].req.every(function (r) { return civ.civics && civ.civics[r]; });
  }
  // Pull the next still-valid civic off the player's plan into currentCivic.
  function popQueuedCivic(civ) {
    if (!Array.isArray(civ.civicQueue)) { civ.civicQueue = []; return null; }
    while (civ.civicQueue.length) {
      var k = civ.civicQueue.shift();
      if (!CIVICS[k] || (civ.civics && civ.civics[k]) || k === civ.currentCivic) continue;
      if (!canAdoptCivic(civ, k)) continue;
      civ.currentCivic = k; civ.civicProgress = 0; return k;
    }
    return null;
  }
  // Queue a civic + its unmet prereqs, prereq-first (player planning).
  function enqueueCivicWithPrereqs(civ, target) {
    if (!Array.isArray(civ.civicQueue)) civ.civicQueue = [];
    var chain = [];
    (function add(k) {
      if ((civ.civics && civ.civics[k]) || k === civ.currentCivic || chain.indexOf(k) >= 0) return;
      CIVICS[k].req.forEach(add);
      chain.push(k);
    })(target);
    chain.forEach(function (k) {
      if (civ.civicQueue.indexOf(k) >= 0 || civ.civicQueue.length >= 12) return;
      civ.civicQueue.push(k);
    });
    if (!civ.currentCivic) popQueuedCivic(civ);
  }
  // Advance the adopted civic by this turn's culture; completing it grants the
  // civic and can win a Cultural Ascendancy victory. Mirrors progressTech.
  function progressCivic(civ) {
    if (!civ.currentCivic) popQueuedCivic(civ);
    if (!civ.currentCivic) return;
    var def = CIVICS[civ.currentCivic];
    if (!def) { civ.currentCivic = null; return; }
    civ.civicProgress = (civ.civicProgress || 0) + (civ.culPerTurn || 0);
    if (civ.civicProgress >= def.cost) {
      if (!civ.civics) civ.civics = {};
      civ.civics[civ.currentCivic] = true;
      civ.civicProgress = 0;
      var nm = def.name;
      civ.currentCivic = null;
      if (civ.id === 'player') { logEvent('Adopted ' + nm + ' (civic)', 'success'); chronicle('Adopted the civic of ' + nm + '.'); }
      if (civicsComplete(civ)) { declareVictory(civ.id, 'culture'); return; }
      popQueuedCivic(civ);
    }
  }
  // AI picks its next civic by personality, falling back to the earliest one
  // whose prereqs are met (so it always advances toward the full tree).
  function pickAiCivic(civ) {
    var avail = CIVIC_ORDER.filter(function (id) { return canAdoptCivic(civ, id); });
    if (!avail.length) return null;
    var wants = {
      scientific: ['enlightenment', 'mass_media', 'meritocracy', 'aesthetics', 'guilds'],
      economic:   ['guilds', 'urbanization', 'mercantilism', 'civil_service', 'aesthetics'],
      aggressive: ['nationalism', 'total_war', 'code_of_laws', 'patronage'],
      warmonger:  ['nationalism', 'total_war', 'code_of_laws', 'patronage'],
      peaceful:   ['oral_tradition', 'drama_poetry', 'welfare', 'patronage', 'aesthetics']
    }[civ.personality] || [];
    for (var i = 0; i < wants.length; i++) if (avail.indexOf(wants[i]) >= 0) return wants[i];
    return avail[0];
  }

  // GOLDEN AGES — banked "Era Points" (culture + a slice of gold/sci surplus)
  // cross a rising threshold to fire a timed empire-wide yield surge. Also
  // triggerable by a Great Artist or by capturing a city (Conquest Surge).
  var GOLDEN_AGE_BASE = 60;       // first golden-age threshold
  var GOLDEN_AGE_STEP = 40;       // threshold rises this much each time
  var GOLDEN_AGE_LENGTH = 8;      // turns a triggered golden age lasts
  var GOLDEN_AGE_YIELD = 1;       // +1 to each worked-tile yield bucket while active
  var CONQUEST_SURGE_LENGTH = 5;  // shorter surge granted by capturing a city
  function goldenAgeThreshold(civ) { return GOLDEN_AGE_BASE + (civ.goldenAgesHad || 0) * GOLDEN_AGE_STEP; }

  // STABILITY / UNREST — a soft ceiling on the grow-and-conquer loop. Cities bank
  // unrest from size + war + fresh conquest, offset by content buildings, the
  // Theocracy/Monarchy stance, and Golden Ages. A city that stays over the
  // revolt line halts production and spits out a rebel on your soil.
  var UNREST_REVOLT_MULT = 3;    // revolt threshold = pop * this + UNREST_BASE
  var UNREST_BASE = 6;           // flat tolerance — small cities don't revolt at all
  var UNREST_CAPTURE_SPIKE = 6;  // one-time discontent when a city is taken
  var UNREST_CAP_MULT = 6;       // unrest never banks past pop * this
  var UNREST_STRAIN_FREE = 5;    // cities pop <= this carry no size strain
  var UNREST_WAR_GRACE = 15;     // no wartime unrest before this turn (the opening
                                 // "everyone-at-war" default shouldn't stir revolts)
  function civAtWarAny(civId) {
    for (var i = 0; i < CIV_SIDES.length; i++) { var o = CIV_SIDES[i]; if (o !== civId && relation(civId, o) === 'war') return true; }
    return false;  // barb war is constant and doesn't count
  }
  // Net per-turn unrest change for a city (positive = rising discontent). Tuned
  // so unrest is a LATE / large-empire / active-war concern, never an early-game
  // surprise: only big cities strain, and war only stings past the opening.
  function cityUnrestDelta(city) {
    var civ = state.civs[city.civ];
    var d = Math.max(0, city.pop - UNREST_STRAIN_FREE);          // size strain (pop 6+)
    if (state.turn >= UNREST_WAR_GRACE && civAtWarAny(city.civ)) d += 2;  // real wartime discontent
    var b = city.buildings || {};
    var content = 0;
    for (var bk in b) { if (b[bk] && BUILDINGS[bk] && BUILDINGS[bk].content) content += BUILDINGS[bk].content; }
    var gov = activeGovernment(civ);
    if (gov && gov.contentment) content += gov.contentment;
    content += edictEff(civ, 'contentment');   // Festivals +2 / Mass Levy -1
    content += civicSum(civ, 'perCityStability') + ideologyEff(civ, 'perCityStability');   // civics / Order ideology
    content += distinctLuxuries(civ);          // +1 per distinct luxury enjoyed
    if (civ && civ.goldenAgeTurns > 0) content += 2;
    // Religious harmony vs. heresy: a city sharing your empire's faith is content;
    // one converted to a rival faith breeds unrest. Only matters once your empire
    // actually has a faith of its own (founded or majority-adopted).
    var stateRel = civMajorityReligion(civ);
    if (stateRel && city.religion) {
      if (city.religion === stateRel) content += 1;       // devout, on-message
      else d += 2;                                        // heresy at home
    }
    return d - content;
  }
  // The unrest a city must bank before it revolts (flat tolerance + size).
  function revoltThreshold(city) { return city.pop * UNREST_REVOLT_MULT + UNREST_BASE; }
  function cityRevolting(city) { return (city.unrest || 0) >= revoltThreshold(city); }

  // The government whose bonuses currently apply — none during anarchy.
  function activeGovernment(civ) {
    if (!civ || civ.governmentTurns > 0) return null;
    return GOVERNMENTS[civ.government] || GOVERNMENTS.despotism;
  }
  // Switch a civ's government, paying the anarchy commitment cost. No-op if the
  // target isn't unlocked or is already the settled government.
  function setGovernment(civ, id) {
    var g = GOVERNMENTS[id];
    if (!civ || !g) return false;
    if (g.tech && !civ.techs[g.tech]) return false;
    if (civ.government === id && civ.governmentTurns <= 0) return false;
    civ.government = id;
    var actualAnarchy = Math.max(0, ANARCHY_TURNS - civicSum(civ, 'anarchyReduce'));   // Civil Service eases switches
    civ.governmentTurns = actualAnarchy;
    if (civ.id === 'player') {
      showToast('Anarchy: ' + actualAnarchy + ' turn' + (actualAnarchy !== 1 ? 's' : '') + ' → ' + g.name, actualAnarchy > 0 ? 'error' : 'success');
      logEvent('Adopting ' + g.name + ' (anarchy ' + actualAnarchy + ' turn' + (actualAnarchy !== 1 ? 's' : '') + ')');
    }
    return true;
  }
  // Extra empire-wide culture/turn from the active government (Theocracy).
  function govCulturePerTurn(civ) {
    var g = activeGovernment(civ);
    return (g && g.perCityCulture ? g.perCityCulture : 0) * civ.cities.length;
  }
  // Total culture/turn for a civ = every city's culture + the government bonus.
  // This single figure feeds BOTH the Great People pool (unchanged) and the new
  // Civics track + culture stockpile (no double counting — one source).
  function civCulturePerTurn(civ) {
    var c = 0;
    (civ.cities || []).forEach(function (ct) { c += cityCulturePerTurn(ct, civ.id); });
    return c + govCulturePerTurn(civ);
  }
  // AI adopts the best government its tech allows, by personality. Idempotent
  // once settled on its top pick; switches (paying anarchy) when a better one
  // unlocks. No-op while already in anarchy.
  function aiPickGovernment(civ) {
    if (!civ || civ.governmentTurns > 0) return;
    var pref;
    switch (civ.personality) {
      case 'aggressive': case 'warmonger': pref = ['autocracy', 'monarchy']; break;
      case 'economic': pref = ['democracy', 'monarchy']; break;
      case 'scientific': pref = ['democracy', 'republic']; break;
      case 'peaceful': pref = ['theocracy', 'republic', 'monarchy']; break;
      default: pref = ['monarchy'];
    }
    var best = null;
    for (var i = 0; i < pref.length; i++) {
      var g = GOVERNMENTS[pref[i]];
      if (g && (!g.tech || civ.techs[g.tech])) { best = pref[i]; break; }
    }
    if (best && civ.government !== best) setGovernment(civ, best);
  }

  // Bank Era Points (culture output + a slice of gold/sci surplus, scaled by the
  // government's era-point multiplier). Crossing the rising threshold fires a
  // timed Golden Age. Call once per civ per turn after income is recomputed.
  function accrueEraPoints(civ, isPlayer) {
    if (!civ || !civ.cities || !civ.cities.length) return;
    var culture = 0;
    civ.cities.forEach(function (ct) { culture += cityCulturePerTurn(ct, civ.id); });
    culture += govCulturePerTurn(civ);
    var gain = culture + Math.max(0, Math.floor(civ.goldPerTurn / 4)) + Math.max(0, Math.floor(civ.sciPerTurn / 4));
    var g = activeGovernment(civ);
    var eraMult = (g && g.eraPointMult ? g.eraPointMult : 1) * (1 + civicSum(civ, 'eraPointMult') + ideologyEff(civ, 'eraPointMult'));  // Theocracy x Mass Media x Autocracy
    if (eraMult !== 1) gain = Math.round(gain * eraMult);
    civ.eraPoints += gain;
    if (civ.goldenAgeTurns <= 0 && civ.eraPoints >= goldenAgeThreshold(civ)) {
      var gaLen = GOLDEN_AGE_LENGTH + civicSum(civ, 'goldenAgeBonus');   // Patronage extends
      civ.goldenAgeTurns = gaLen;
      civ.eraPoints = 0;
      civ.goldenAgesHad++;
      if (isPlayer) {
        showToast('☀ Golden Age! +1 to every yield for ' + gaLen + ' turns', 'success');
        logEvent('A Golden Age dawns — every city gains +1 food/prod/gold/sci for ' + gaLen + ' turns', 'success');
        chronicle('A Golden Age dawned across the realm.');
        goldenAgeFlash();
      } else {
        logEvent((CIVS[civ.id] ? CIVS[civ.id].name : civ.id) + ' entered a Golden Age');
      }
    }
  }
  // Start (or extend) a Golden Age immediately — used by the Great Artist and the
  // Conquest Surge. `length` lets the surge run a shorter timer than a full age.
  function triggerGoldenAge(civ, length, isPlayer, reason) {
    if (!civ) return;
    civ.goldenAgeTurns = Math.max(civ.goldenAgeTurns || 0, length + civicSum(civ, 'goldenAgeBonus'));
    if (isPlayer) {
      showToast('☀ ' + (reason || 'Golden Age') + '! +1 to every yield', 'success');
      logEvent((reason || 'A Golden Age') + ' — +1 to every yield for ' + length + ' turns', 'success');
      chronicle((reason || 'A Golden Age') + ' began.');
      goldenAgeFlash();
    }
  }
  // A one-shot gold screen flash + shake when the player's Golden Age fires —
  // the detonation that makes banked Era Points feel like a payoff.
  function goldenAgeFlash() {
    var g = (typeof document !== 'undefined') && document.getElementById('game');
    if (g) {
      g.classList.add('golden-flash');
      setTimeout(function () { g.classList.remove('golden-flash'); }, 850);
    }
    addFx('shake', 0, 0, { intensity: 4 }, 420);
    if (state) draw();
  }

  // Selectable factions. Each gives ONE small bonus.
  var FACTIONS = {
    // Each faction = a baseline `bonus` (folded by the original workableYields/
    // atkTechBonus) + a DISTINCT `passive` (folded by factionEff) + one unique
    // unit or building (UNITS/BUILDINGS entry tagged `faction` + `replaces`), so
    // the six play differently from turn 1.
    solaris: {
      name: 'Solaris',
      title: 'Children of the Sun',
      color: '#00d4ff', edge: '#7ce5ff',
      bonus: { food: 1 },
      passive: { gpMult: 0.25 },
      unique: 'Sun Spire',
      lore: '+1 food/city · +25% Great People · unique Sun Spire (culture).'
    },
    umbra: {
      name: 'Umbra',
      title: 'Shadowborn',
      color: '#ff7a59', edge: '#ffb59a',
      bonus: { atk: 1 },
      passive: { vision: 1 },
      unique: 'Nightblade',
      lore: '+1 attack · +1 sight range · unique Nightblade (fast, deadly swordsman).'
    },
    tellus: {
      name: 'Tellus',
      title: 'Earthen Founders',
      color: '#b388ff', edge: '#d4b8ff',
      bonus: { gold: 1 },
      passive: { cityDefMult: 0.25 },
      unique: 'Bastion',
      lore: '+1 gold/city · +25% city defense · unique Bastion (stronger Walls).'
    },
    // --- New factions ---
    ferrum: {
      name: 'Ferrum',
      title: 'The Iron Legion',
      color: '#d9892b', edge: '#ffc06a',
      bonus: { prod: 1 },
      passive: { upkeepFree: 2 },
      unique: 'Legionary',
      lean: 'warmonger',
      lore: '+1 prod/city · 2 free military upkeep · unique Legionary (tough early footman).'
    },
    vorne: {
      name: 'Vorne',
      title: 'The Bloodbound',
      color: '#d83a4a', edge: '#ff7a86',
      bonus: { atk: 1 },
      passive: { healOnKill: 5 },
      unique: 'Bloodrider',
      lean: 'aggressive',
      lore: '+1 attack · units heal +5 HP on a kill · unique Bloodrider (fast cavalry).'
    },
    myrr: {
      name: 'Myrr',
      title: 'The Tidewardens',
      color: '#2ad0c0', edge: '#7af0e4',
      bonus: { gold: 1 },
      passive: { coastalGold: 2 },
      unique: 'Dromon',
      lore: '+1 gold/city · +2 gold in coastal cities · unique Dromon (superior galley).'
    }
  };
  // Signed value a faction's distinct passive contributes for an effect key.
  function factionEff(civ, key) {
    if (!civ) return 0;
    var f = FACTIONS[civ.faction];
    return (f && f.passive && f.passive[key]) || 0;
  }
  var FACTION_ORDER = ['solaris', 'umbra', 'tellus', 'ferrum', 'vorne', 'myrr'];

  // AI personalities — rolled per AI civ at newGame. Each tunes a few existing
  // dials (build picks, diplomacy probabilities, tech preference) so each game
  // feels different without new mechanics.
  var AI_PERSONALITIES = {
    aggressive: {
      label: 'Aggressive', icon: '⚔', warMul: 1.6, peaceMul: 0.5,
      buildingChance: 0.10, wonderChance: 0.15,
      acceptAlliance: 0.20, acceptPeace: 0.30, acceptTrade: 0.45,
      offerAlliance: 0.02, techPreference: 'military'
    },
    peaceful: {
      label: 'Peaceful', icon: '☮', warMul: 0.4, peaceMul: 1.8,
      buildingChance: 0.40, wonderChance: 0.30,
      acceptAlliance: 0.75, acceptPeace: 0.85, acceptTrade: 0.75,
      offerAlliance: 0.20, techPreference: 'balanced'
    },
    scientific: {
      label: 'Scientific', icon: '⚗', warMul: 0.7, peaceMul: 1.3,
      buildingChance: 0.50, wonderChance: 0.35,
      acceptAlliance: 0.50, acceptPeace: 0.65, acceptTrade: 0.35,
      offerAlliance: 0.10, techPreference: 'science'
    },
    economic: {
      label: 'Economic', icon: '●', warMul: 0.5, peaceMul: 1.4,
      buildingChance: 0.50, wonderChance: 0.35,
      acceptAlliance: 0.55, acceptPeace: 0.70, acceptTrade: 0.85,
      offerAlliance: 0.15, techPreference: 'gold'
    },
    // Warmonger — scarier than Aggressive. Declares war early and often,
    // almost never makes peace, ignores wonders, pumps military.
    warmonger: {
      label: 'Warmonger', icon: '☠', warMul: 2.3, peaceMul: 0.25,
      buildingChance: 0.06, wonderChance: 0.05,
      acceptAlliance: 0.05, acceptPeace: 0.15, acceptTrade: 0.30,
      offerAlliance: 0.0, techPreference: 'military'
    }
  };
  // Warmonger is intentionally left OUT of the random roll pool — it only
  // arrives via a faction `lean`, so a normal random AI is never a warmonger
  // unless its faction is themed that way.
  var PERSONALITY_ORDER = ['aggressive', 'peaceful', 'scientific', 'economic'];

  // Named leaders — one per faction, looked up by civ.faction. Pure flavor +
  // a face for the diplomacy screen, log lines, and the Chronicle.
  var LEADERS = {
    solaris: { name: 'Aurelia',        title: 'the Radiant',  motto: 'The sun favors the bold.' },
    umbra:   { name: 'Kael',           title: 'the Veiled',   motto: 'What you cannot see still cuts.' },
    tellus:  { name: 'Borin',          title: 'Stonehand',    motto: 'Deep roots weather any storm.' },
    ferrum:  { name: 'General Crassus', title: 'the Unyielding', motto: 'Peace is merely forged between wars.' },
    vorne:   { name: 'Khanum Vora',    title: 'the Red',      motto: 'The horde does not wait.' },
    myrr:    { name: 'Nerith',         title: 'of the Tides', motto: 'Every current leads to coin.' }
  };
  function leaderOf(civId) {
    var civ = state.civs[civId];
    return (civ && LEADERS[civ.faction]) || { name: (CIVS[civId] ? CIVS[civId].name : civId), title: '', motto: '' };
  }

  // AGENDAS — a hidden-then-revealed disposition rolled per AI. Each turn it adds
  // a small extra tension delta toward civs that offend it, feeding the SAME
  // tension model that drives peace/alliance acceptance (no new AI decision code).
  // eval(ai, other) returns a per-turn tension delta (positive = more annoyed,
  // negative = calmed). Keep magnitudes small so it nudges, never dominates.
  var AGENDAS = {
    expansionist: { name: 'Expansionist', desc: 'Covets land; resents larger empires.',
      eval: function (ai, other) { var d = other.cities.length - ai.cities.length; return d > 0 ? Math.min(1.6, d * 0.4) : 0; } },
    cultured: { name: 'Cultured', desc: 'Bristles at rivals who hoard wonders.',
      eval: function (ai, other) { var d = wondersOwnedBy(other.id) - wondersOwnedBy(ai.id); return d > 0 ? Math.min(1.8, d * 0.6) : 0; } },
    supremacist: { name: 'Supremacist', desc: 'Rivals only the strongest.',
      eval: function (ai, other) { return strongestCivId() === other.id && other.id !== ai.id ? 1.0 : 0; } },
    technophile: { name: 'Technophile', desc: 'Envies those ahead in science.',
      eval: function (ai, other) { var d = techCountOf(other) - techCountOf(ai); return d > 0 ? Math.min(1.5, d * 0.25) : 0; } },
    mercantilist: { name: 'Mercantilist', desc: 'Distrusts the conspicuously wealthy.',
      eval: function (ai, other) { return other.gold > ai.gold * 1.5 + 40 ? 0.8 : 0; } },
    isolationist: { name: 'Isolationist', desc: 'Wants its neighbors at arm’s length.',
      eval: function (ai, other) {
        for (var i = 0; i < ai.cities.length; i++) for (var j = 0; j < other.cities.length; j++)
          if (hexDist([ai.cities[i].c, ai.cities[i].r], [other.cities[j].c, other.cities[j].r]) <= TENSION_PROX_RANGE) return 0.7;
        return 0; } },
    ideologue: { name: 'Ideologue', desc: 'Disdains foreign forms of government.',
      eval: function (ai, other) { return other.government && other.government !== 'despotism' && other.government !== ai.government ? 0.7 : 0; } },
    peacekeeper: { name: 'Peacekeeper', desc: 'Abhors warmongers; warms to the peaceful.',
      eval: function (ai, other) {
        var wars = 0; CIV_SIDES.forEach(function (z) { if (z !== other.id && relation(other.id, z) === 'war') wars++; });
        return wars > 0 ? Math.min(1.6, wars * 0.5) : -0.3; } }
  };
  var AGENDA_ORDER = ['expansionist', 'cultured', 'supremacist', 'technophile', 'mercantilist', 'isolationist', 'ideologue', 'peacekeeper'];
  var MEMORY_MAX = 8;   // capped per-civ ledger of notable dealings with the player

  function techCountOf(civ) { var n = 0; for (var i = 0; i < TECH_ORDER.length; i++) if (civ.techs[TECH_ORDER[i]]) n++; return n; }
  function strongestCivId() {
    var best = null, bestP = -1;
    CIV_SIDES.forEach(function (id) { var c = state.civs[id]; if (!c || !c.cities.length) return; var pw = civPower(c); if (pw > bestP) { bestP = pw; best = id; } });
    return best;
  }
  // Record a notable dealing in an AI's memory of the player, and apply its
  // (optional) lasting tension nudge — friendly acts calm, betrayals anger.
  function remember(aiId, text, tensionDelta) {
    var c = state.civs[aiId];
    if (!c || AI_SIDES.indexOf(aiId) < 0) return;
    if (!Array.isArray(c.memory)) c.memory = [];
    c.memory.push({ turn: state.turn, text: text });
    if (c.memory.length > MEMORY_MAX) c.memory.shift();
    if (tensionDelta) addTension(aiId, 'player', tensionDelta, 'memory');
  }

  // City name pools per faction
  var CITY_NAMES = {
    solaris: ['Helios','Aurora','Vega','Lyra','Sirius','Polaris','Orion','Caelum'],
    umbra:   ['Nox','Erebus','Thanos','Vesper','Nyx','Tartarus','Mortis','Pyre'],
    tellus:  ['Terra','Gaia','Atlas','Cybele','Demeter','Pomona','Faunus','Vertumnus'],
    ferrum:  ['Ferrum','Castra','Vallum','Aquila','Legio','Fornax','Incus','Malleus'],
    vorne:   ['Vorne','Krael','Gorthad','Brakka','Skorn','Hagal','Vroth','Drûl'],
    myrr:    ['Myrr','Tidehold','Coralis','Saltspire','Marisca','Nerida','Pelagos','Thalassa']
  };
  // City-state name pool — neutral cosmopolitan flavour
  var CITY_STATE_NAMES = ['Carthage','Samarkand','Geneva','Lhasa','Petra','Almaty','Antium','Byblos','Kabul','Ragusa'];

  // CIVS is the runtime per-side mapping; filled at newGame() from FACTIONS
  var CIVS = {
    player: { name: 'Solaris',    color: '#00d4ff', edge: '#7ce5ff' },
    ai:     { name: 'Umbra',      color: '#ff7a59', edge: '#ffb59a' },
    ai2:    { name: 'Tellus',     color: '#b388ff', edge: '#d4b8ff' },
    ai3:    { name: 'Vorne',      color: '#3fd17a', edge: '#9af0c0' },
    barb:   { name: 'Raiders',    color: '#7a7888', edge: '#b8b6c4' },
    cs:     { name: 'City-State', color: '#ffd34d', edge: '#fff0a8' }
  };
  // Non-barbarian civilization side IDs. Loops over real civs iterate these.
  // They are REBUILT per-game by setCivSides() based on how many AIs the map
  // size warrants (2 normally, 3 on Huge/Massive), so almost all game logic
  // adapts to the civ count automatically.
  var CIV_SIDES = ['player', 'ai', 'ai2'];
  var AI_SIDES  = ['ai', 'ai2'];
  var ALL_AI_IDS = ['ai', 'ai2', 'ai3'];   // every possible AI side, in order
  function setCivSides(aiIds) {
    AI_SIDES = aiIds.slice();
    CIV_SIDES = ['player'].concat(AI_SIDES);
  }
  // Number of AI rivals for a given map width. Small/Normal/Large keep 2;
  // Huge (24) and Massive (28) get a 3rd to fill the extra space.
  function aiCountForMap(w) { return w >= 24 ? 3 : 2; }
  // Build the default diplomacy table for the current CIV_SIDES: every pair of
  // real civs starts at war; everyone is at peace with city-states.
  function defaultDiplomacy() {
    var dip = {};
    var sides = CIV_SIDES.concat(['cs']);
    for (var i = 0; i < sides.length; i++) {
      for (var j = i + 1; j < sides.length; j++) {
        var a = sides[i], b = sides[j];
        dip[dipKey(a, b)] = (a === 'cs' || b === 'cs') ? 'peace' : 'war';
      }
    }
    return dip;
  }

  // City-state perk kinds — see processCityStatePerks
  var CS_KINDS = {
    mercantile:   { name: 'Mercantile',   icon: '●', goldPerTurn: 2,  desc: '+2 gold per turn while allied.' },
    scientific:   { name: 'Scientific',   icon: '◆', sciPerTurn: 2,   desc: '+2 science per turn while allied.' },
    militaristic: { name: 'Militaristic', icon: '⚔', militaryAtk: 1,  desc: '+1 attack on your military units while allied.' }
  };
  var CS_KIND_ORDER = ['mercantile','scientific','militaristic'];
  var CS_BEFRIEND_COST = 50;
  var CS_BRIBE_COST    = 75;   // when bribing away from current ally
  var CS_LOOT_GOLD     = 100;  // one-time loot when conquering

  // City-state quests — an alternative, free path to alliance. Each unallied
  // city-state offers one task; completing it grants alliance without gold.
  function makeCsQuest() {
    var civPl = state.civs && state.civs.player;
    var techs = (civPl && civPl.techs) || {};
    var techPool = ['writing', 'archery', 'masonry', 'husbandry'].filter(function (t) { return TECHS[t] && !techs[t]; });
    var pool = [];
    if (techPool.length) pool.push('tech');
    pool.push('cities'); pool.push('barbarians');
    var type = pool[Math.floor(rnd() * pool.length)];
    if (type === 'tech') {
      var tech = techPool[Math.floor(rnd() * techPool.length)];
      return { type: 'tech', techId: tech, label: 'Research ' + TECHS[tech].name, done: false };
    }
    if (type === 'cities') {
      var target = ((civPl && civPl.cities.length) || 1) + 2;
      return { type: 'cities', target: target, label: 'Control ' + target + ' cities', done: false };
    }
    var base = (state.stats && state.stats.barbsDefeated) || 0;
    return { type: 'barbarians', target: base + 1, label: 'Defeat a barbarian', done: false };
  }

  // Human-readable progress for a city-state's quest.
  function csQuestText(csc) {
    var q = csc.quest;
    if (!q) return '';
    var civPl = state.civs.player;
    if (q.type === 'tech') return q.label;
    if (q.type === 'cities') return 'Control ' + q.target + ' cities (' + civPl.cities.length + '/' + q.target + ')';
    if (q.type === 'barbarians') return 'Defeat a barbarian (' + (((state.stats && state.stats.barbsDefeated) || 0) >= q.target ? 1 : 0) + '/1)';
    return q.label;
  }

  // Award alliance for any player quest now satisfied. Quests only resolve for
  // unclaimed city-states (an AI-held one must be bribed); at war, nothing.
  function checkCsQuests() {
    if (!state.civs.cs || atWar('player', 'cs')) return;
    var civPl = state.civs.player;
    state.civs.cs.cities.forEach(function (csc) {
      var q = csc.quest;
      if (!q || q.done) return;
      if (csc.ally) { if (csc.ally === 'player') q.done = true; return; }
      var met = false;
      if (q.type === 'tech') met = !!civPl.techs[q.techId];
      else if (q.type === 'cities') met = civPl.cities.length >= q.target;
      else if (q.type === 'barbarians') met = ((state.stats && state.stats.barbsDefeated) || 0) >= q.target;
      if (met) {
        q.done = true;
        csc.ally = 'player';
        recomputeIncome('player');
        sfxAlly();
        var kd = CS_KINDS[csc.kind] || CS_KINDS.mercantile;
        showToast('Quest done — ' + csc.name + ' allied!', 'success');
        logEvent(csc.name + ' quest complete (' + q.label + ') — now allied · ' + kd.name, 'success');
      }
    });
  }

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
  // AUDIO — sound effects + procedural ambient music
  // =====================================================================
  var AUDIO_KEY = 'mdg_microciv_audio';
  // Defaults: SFX on (preserves prior behaviour), music off (user opts in)
  var audioPrefs = { sfx: true, music: false };
  (function loadAudioPrefs() {
    try {
      var raw = localStorage.getItem(AUDIO_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (typeof p.sfx === 'boolean')   audioPrefs.sfx = p.sfx;
        if (typeof p.music === 'boolean') audioPrefs.music = p.music;
      }
    } catch (e) {}
  })();
  function saveAudioPrefs() {
    try { localStorage.setItem(AUDIO_KEY, JSON.stringify(audioPrefs)); } catch (e) {}
  }

  var audioCtx = null;
  var sfxMaster = null;     // gain node for SFX (mutable for mute)
  var musicMaster = null;   // gain node for music
  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume(); } catch (e) {}
    }
    if (audioCtx && !sfxMaster) {
      sfxMaster = audioCtx.createGain();
      sfxMaster.gain.value = audioPrefs.sfx ? 1.0 : 0.0;
      sfxMaster.connect(audioCtx.destination);
    }
    return audioCtx;
  }
  function playTone(freq, dur, type, vol) {
    if (!audioPrefs.sfx) return;
    var ac = getAudioCtx();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'square';
      osc.frequency.value = freq;
      gain.gain.value = vol || 0.08;
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
      osc.connect(gain);
      gain.connect(sfxMaster || ac.destination);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + dur);
    } catch (e) {}
  }
  // Schedule a tone at an offset (seconds) from "now" so chord/arpeggio
  // notes line up without setTimeout drift.
  function scheduleTone(offset, freq, dur, type, vol) {
    if (!audioPrefs.sfx) return;
    var ac = getAudioCtx();
    if (!ac) return;
    try {
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      var start = ac.currentTime + offset;
      gain.gain.setValueAtTime(vol || 0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(sfxMaster || ac.destination);
      osc.start(start);
      osc.stop(start + dur);
    } catch (e) {}
  }

  // ---------- SFX library --------------------------------------------------
  function sfxMove()      { playTone(440, 0.06, 'square',   0.05); }
  function sfxAttack()    { playTone(180, 0.12, 'sawtooth', 0.10); scheduleTone(0.04, 120, 0.15, 'square', 0.06); }
  function sfxBuild()     { playTone(660, 0.08, 'sine',     0.06); scheduleTone(0.08, 880, 0.10, 'sine',   0.06); }
  function sfxTurnStart() { playTone(523, 0.08, 'sine',     0.05); scheduleTone(0.10, 659, 0.10, 'sine',   0.05); }
  function sfxSelect()    { playTone(520, 0.04, 'square',   0.04); }
  // New SFX
  function sfxFound()     { // Rising arpeggio — founding a city
    scheduleTone(0.00, 523, 0.12, 'sine', 0.06);
    scheduleTone(0.10, 659, 0.12, 'sine', 0.06);
    scheduleTone(0.20, 784, 0.16, 'sine', 0.06);
    scheduleTone(0.30, 1047, 0.22, 'sine', 0.07);
  }
  function sfxResearch()  { // Tech complete — 3-note bright chime
    scheduleTone(0.00, 880,  0.10, 'triangle', 0.06);
    scheduleTone(0.10, 1109, 0.10, 'triangle', 0.06);
    scheduleTone(0.20, 1319, 0.18, 'triangle', 0.07);
  }
  function sfxAgeUp()     { // Age advancement — fuller chord (root, fifth, octave)
    scheduleTone(0.00, 392, 0.40, 'sine',     0.08);
    scheduleTone(0.05, 587, 0.40, 'sine',     0.06);
    scheduleTone(0.10, 784, 0.40, 'sine',     0.05);
    scheduleTone(0.40, 988, 0.30, 'triangle', 0.06);
  }
  function sfxPromote()   { // Unit promotion — short double-chime
    scheduleTone(0.00, 698, 0.07, 'triangle', 0.06);
    scheduleTone(0.07, 1047, 0.10, 'triangle', 0.06);
  }
  function sfxAlly()      { // City-state befriend — coin clink + chime
    scheduleTone(0.00, 1568, 0.06, 'square',   0.04);
    scheduleTone(0.06, 1175, 0.08, 'triangle', 0.05);
    scheduleTone(0.16, 1568, 0.12, 'sine',     0.06);
  }
  function sfxWonder()    { // Wonder complete — bold rising chord
    scheduleTone(0.00, 261, 0.30, 'sine',     0.07);
    scheduleTone(0.10, 392, 0.30, 'sine',     0.06);
    scheduleTone(0.20, 523, 0.40, 'sine',     0.06);
    scheduleTone(0.30, 784, 0.50, 'triangle', 0.07);
    scheduleTone(0.55, 1047, 0.40, 'triangle', 0.06);
  }
  function sfxVictory()   { // Game won — sparkle arpeggio
    var notes = [523, 659, 784, 1047, 1319, 1568];
    for (var i = 0; i < notes.length; i++) scheduleTone(i * 0.08, notes[i], 0.18, 'triangle', 0.07);
    scheduleTone(0.60, 1568, 0.6, 'sine', 0.05);
  }
  function sfxDefeat()    { // Game lost — descending minor
    scheduleTone(0.00, 392, 0.20, 'sawtooth', 0.06);
    scheduleTone(0.18, 329, 0.20, 'sawtooth', 0.06);
    scheduleTone(0.36, 277, 0.30, 'sawtooth', 0.06);
    scheduleTone(0.66, 220, 0.50, 'sawtooth', 0.05);
  }
  function sfxError()     { // Invalid action — soft low buzz (less harsh than attack)
    playTone(180, 0.08, 'square', 0.04);
  }

  // ---------- Procedural ambient music ------------------------------------
  // A soft drone + slow pad with sparse pentatonic bell notes on top. Designed
  // to be tolerable in long sessions: low gain, slow LFO breathing, no rhythm.
  var music = { running: false, voices: [], lfos: [], master: null, melodyTimer: null };
  function startMusic() {
    if (music.running) return;
    var ac = getAudioCtx();
    if (!ac) return;
    music.running = true;
    music.master = ac.createGain();
    music.master.gain.value = 0.0;
    // Fade in
    music.master.gain.setValueAtTime(0.0, ac.currentTime);
    music.master.gain.linearRampToValueAtTime(0.07, ac.currentTime + 2.5);
    music.master.connect(ac.destination);

    // Low drone (A2)
    var drone = ac.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 110;
    var droneG = ac.createGain();
    droneG.gain.value = 0.45;
    drone.connect(droneG); droneG.connect(music.master);
    drone.start(); music.voices.push(drone);

    // Slow LFO on drone gain — gentle breathing
    var lfo1 = ac.createOscillator();
    lfo1.type = 'sine'; lfo1.frequency.value = 0.08;
    var lfo1G = ac.createGain(); lfo1G.gain.value = 0.18;
    lfo1.connect(lfo1G); lfo1G.connect(droneG.gain);
    lfo1.start(); music.lfos.push(lfo1);

    // Pad voice (perfect fifth above)
    var pad = ac.createOscillator();
    pad.type = 'triangle';
    pad.frequency.value = 165;       // E3 — fifth above A2
    var padG = ac.createGain();
    padG.gain.value = 0.18;
    pad.connect(padG); padG.connect(music.master);
    pad.start(); music.voices.push(pad);

    // Slower LFO on pad gain
    var lfo2 = ac.createOscillator();
    lfo2.type = 'sine'; lfo2.frequency.value = 0.045;
    var lfo2G = ac.createGain(); lfo2G.gain.value = 0.12;
    lfo2.connect(lfo2G); lfo2G.connect(padG.gain);
    lfo2.start(); music.lfos.push(lfo2);

    // Sparse pentatonic bell melody, looped at ~3-6s intervals with rests
    scheduleAmbientMelody();
  }
  function scheduleAmbientMelody() {
    if (!music.running) return;
    var ac = audioCtx;
    if (!ac) return;
    var pent = [440, 523.25, 659.25, 783.99, 987.77];  // A, C, E, G, B (A minor pent.)
    // 60% chance to play a note this tick; 40% chance to rest
    if (Math.random() < 0.6) {
      var f = pent[Math.floor(Math.random() * pent.length)];
      try {
        var osc = ac.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        var g = ac.createGain();
        var now = ac.currentTime;
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.05, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
        osc.connect(g); g.connect(music.master);
        osc.start(now);
        osc.stop(now + 2.7);
      } catch (e) {}
    }
    music.melodyTimer = setTimeout(scheduleAmbientMelody, 3500 + Math.random() * 3500);
  }
  function stopMusic() {
    if (!music.running) return;
    music.running = false;
    if (music.melodyTimer) { clearTimeout(music.melodyTimer); music.melodyTimer = null; }
    var ac = audioCtx;
    if (music.master && ac) {
      // Fade out then stop oscillators
      try {
        music.master.gain.cancelScheduledValues(ac.currentTime);
        music.master.gain.setValueAtTime(music.master.gain.value, ac.currentTime);
        music.master.gain.linearRampToValueAtTime(0.0, ac.currentTime + 0.6);
      } catch (e) {}
    }
    var voicesCopy = music.voices.concat(music.lfos);
    music.voices = []; music.lfos = [];
    setTimeout(function () {
      voicesCopy.forEach(function (v) { try { v.stop(); } catch (e) {} });
      if (music.master) { try { music.master.disconnect(); } catch (e) {} music.master = null; }
    }, 700);
  }
  function setMusicEnabled(on) {
    audioPrefs.music = !!on;
    saveAudioPrefs();
    if (on) startMusic(); else stopMusic();
  }
  function setSfxEnabled(on) {
    audioPrefs.sfx = !!on;
    saveAudioPrefs();
    if (sfxMaster) sfxMaster.gain.value = on ? 1.0 : 0.0;
  }

  // =====================================================================
  // TILE YIELD OVERLAY
  // =====================================================================
  var showYieldOverlay = false;

  // =====================================================================
  // DIPLOMACY HELPERS
  // =====================================================================
  function dipKey(a, b) {
    return a < b ? a + '_' + b : b + '_' + a;
  }
  function atWar(a, b) {
    if (a === b) return false;
    if (a === 'barb' || b === 'barb') return true;  // barbarians always hostile
    if (!state || !state.diplomacy) return true;
    var rel = state.diplomacy[dipKey(a, b)];
    return rel !== 'peace' && rel !== 'allied';
  }
  function relation(a, b) {
    if (a === b) return 'self';
    if (a === 'barb' || b === 'barb') return 'war';
    if (!state || !state.diplomacy) return 'war';
    return state.diplomacy[dipKey(a, b)] || 'war';
  }
  function setRelation(a, b, rel) {
    if (!state.diplomacy) return;
    state.diplomacy[dipKey(a, b)] = rel;
    // Forging an alliance wipes the slate clean on both sides.
    if (rel === 'allied') {
      [[a, b], [b, a]].forEach(function (pair) {
        var civ = state.civs[pair[0]];
        if (AI_SIDES.indexOf(pair[0]) >= 0 && civ && civ.tension) {
          civ.tension[pair[1]] = 0;
          if (civ.tensionBand) civ.tensionBand[pair[1]] = 0;
        }
      });
    }
  }
  function makePeace(a, b) {
    if (!state.diplomacy) return;
    state.diplomacy[dipKey(a, b)] = 'peace';
    // Peace cools grudges on both sides.
    if (typeof addTension === 'function') {
      if (AI_SIDES.indexOf(a) >= 0) addTension(a, b, -18);
      if (AI_SIDES.indexOf(b) >= 0) addTension(b, a, -18);
    }
    var aName = CIVS[a] ? CIVS[a].name : a;
    var bName = CIVS[b] ? CIVS[b].name : b;
    if (a === 'player' || b === 'player') {
      var peaceId = a === 'player' ? b : a;
      showToast('Peace with ' + (a === 'player' ? bName : aName) + '!', 'success');
      logEvent('Peace treaty with ' + (a === 'player' ? bName : aName), 'success');
      chronicle('Made peace with ' + leaderOf(peaceId).name + ' of ' + (a === 'player' ? bName : aName) + '.');
    }
  }
  function declareWarOn(a, b) {
    if (!state.diplomacy) return;
    state.diplomacy[dipKey(a, b)] = 'war';
    // War severs any luxury swap between the two — no keeping a rival's gift
    // through betrayal. tradedLux maps resource -> the civ that provided it.
    [[a, b], [b, a]].forEach(function (pair) {
      var civ = state.civs[pair[0]];
      if (civ && civ.tradedLux) { for (var k in civ.tradedLux) { if (civ.tradedLux[k] === pair[1]) delete civ.tradedLux[k]; } }
    });
    // War ends any Defensive Pact between the two; the victim's pact-partners
    // honor it and bank a grudge against the aggressor (a, the declarer).
    if (typeof setPact === 'function') {
      setPact(a, b, false);
      CIV_SIDES.forEach(function (ally) {
        if (ally === a || ally === b) return;
        if (hasPact(ally, b) && AI_SIDES.indexOf(ally) >= 0) {
          addTension(ally, a, 30, 'pact');
          if (a === 'player') remember(ally, 'You attacked our pact-partner ' + (CIVS[b] ? CIVS[b].name : b));
        }
      });
    }
    // The target of a war declaration resents the declarer.
    if (typeof addTension === 'function' && AI_SIDES.indexOf(b) >= 0) {
      addTension(b, a, TENSION_WAR_SPIKE, 'war');
      if (a === 'player') remember(b, 'You declared war on us');
    }
    var aName = CIVS[a] ? CIVS[a].name : a;
    var bName = CIVS[b] ? CIVS[b].name : b;
    if (a === 'player' || b === 'player') {
      var enemy = a === 'player' ? bName : aName;
      var enemyId = a === 'player' ? b : a;
      showToast('War declared on ' + enemy + '!', 'error');
      logEvent('War with ' + enemy + '!', 'error');
      chronicle((a === 'player' ? 'Declared war on ' : 'War declared by ') + leaderOf(enemyId).name + ' of ' + enemy + '.');
    }
    // Vassals follow their overlord to war — and an attack on a vassal brings
    // in its overlord (plus the overlord's other vassals, transitively-ish).
    if (state.vassals) {
      for (var vk in state.vassals) {
        var lord = state.vassals[vk];
        if (lord === a && vk !== b && !atWar(vk, b)) state.diplomacy[dipKey(vk, b)] = 'war';
        if (vk === b && lord !== a && !atWar(lord, a)) state.diplomacy[dipKey(lord, a)] = 'war';
      }
    }
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
  // Seeded in-place Fisher-Yates — deterministic given the rng stream, so a world
  // seed reproduces the exact same game (Daily Challenge / shareable seed codes).
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  // Compact base36 code <-> 31-bit seed, for sharing/replaying a world.
  function seedToCode(seed) { return (seed >>> 0).toString(36); }
  function codeToSeed(code) {
    if (typeof code === 'number') return code & 0x7fffffff;
    var s = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!s) return 0;
    var n = parseInt(s, 36);
    return (isNaN(n) ? 0 : n) & 0x7fffffff;
  }
  // FNV-1a hash → 31-bit seed; used to turn a date string into the day's seed.
  function seedFromString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) & 0x7fffffff;
  }

  // =====================================================================
  // HEX MATH (odd-r offset, pointy-top)
  // =====================================================================
  function inBounds(c, r) { return c >= 0 && c < MAP_W && r >= 0 && r < MAP_H; }

  function tileAt(c, r) {
    if (!inBounds(c, r)) return null;
    return state.map[r][c];
  }

  // Can this unit type enter this tile? Handles land/water domain rules.
  function canEnterTile(unit, tile) {
    if (!tile) return false;
    var ter = TERRAIN[tile.terrain];
    var udef = UNITS[unit.type];
    // Naval units: water only
    if (udef.naval) return tile.terrain === 'water';
    // Water tiles: workers with Sailing (to build fishing boats), or — once a civ
    // has Navigation — ANY land unit may embark and cross the sea.
    if (tile.terrain === 'water') {
      var wtech = (state.civs[unit.civ] && state.civs[unit.civ].techs) || {};
      if (udef.canImprove && wtech.sailing) return true;
      return !!wtech.navigation;   // embarkation
    }
    // Standard impassable check for land tiles
    if (ter.impassable) return false;
    return true;
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

  // Dashed lines linking the endpoints of every trade route the player can see.
  // Gold = your active route, blue = a rival's, red = disrupted.
  function drawTradeRoutes(size) {
    var routes = state.tradeRoutes;
    if (!routes || !routes.length) return;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    for (var i = 0; i < routes.length; i++) {
      var rt = routes[i];
      var fT = state.map[rt.fromR] && state.map[rt.fromR][rt.fromC];
      var tT = state.map[rt.toR] && state.map[rt.toR][rt.toC];
      if (!fT || !tT) continue;
      if (!fT.explored.player && !tT.explored.player) continue;   // unseen by the player
      var pa = pixelOf(rt.fromC, rt.fromR, size), pb = pixelOf(rt.toC, rt.toR, size);
      var ax = pa.x - state.camera.x + size * SQRT3 / 2, ay = pa.y - state.camera.y + size;
      var bx = pb.x - state.camera.x + size * SQRT3 / 2, by = pb.y - state.camera.y + size;
      ctx.strokeStyle = rt.disrupted ? 'rgba(255,80,80,0.75)' : (rt.owner === 'player' ? 'rgba(255,211,77,0.65)' : 'rgba(120,180,255,0.45)');
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Inverse of pixelOf — converts a world-pixel coordinate to the nearest hex
  // (offset coords). Used by the canvas click/tap handler so a player on phone
  // or PC can interact by tapping a tile directly.
  function pixelToHex(px, py, size) {
    // Pixel → fractional axial (pointy-top layout, matching pixelOf)
    var q = (SQRT3 / 3 * px - (1 / 3) * py) / size;
    var ra = ((2 / 3) * py) / size;
    // Cube rounding (preserves x + y + z = 0 after rounding each component)
    var x = q, z = ra, y = -x - z;
    var rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    var dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
    if (dx > dy && dx > dz)      rx = -ry - rz;
    else if (dy > dz)             ry = -rx - rz;
    else                          rz = -rx - ry;
    // Axial → odd-row offset (inverse of offsetToAxial)
    var oRow = rz;
    var oCol = rx + (rz - (rz & 1)) / 2;
    return [oCol, oRow];
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
      improvement: null, // 'farm' | 'mine' | 'pasture' | 'lumber' | 'quarry'
      village: null,     // null or { reward: 'gold' | 'worker' | 'science' | 'pop' }
      river: false,      // tile sits on a river — +1 food worked, fresh water for cities
      owner: null,       // 'player' | 'ai' | 'ai2' | null
      visible: { player: false, ai: false, ai2: false, ai3: false },
      explored: { player: false, ai: false, ai2: false, ai3: false }
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

    // Base terrain noise with climate bands. Latitude is r normalized to 0..1
    // (0 = north/cold, 1 = south/hot). The extremes are kept NARROW and gentle so
    // only the true poles are tundra and only the deep south is desert — the broad
    // temperate middle stays lush and workable. Bands are fractions of the height,
    // so the terrain mix is consistent at every map size.
    for (var r = 0; r < MAP_H; r++) {
      var lat = r / (MAP_H - 1);
      var cold = Math.max(0, 1 - lat * 3.0);        // strong only in the top ~17%
      var hot  = Math.max(0, (lat - 0.68) * 3.1);   // strong only in the bottom ~15%
      for (var c = 0; c < MAP_W; c++) {
        var t = map[r][c];
        var roll = rnd();
        // Polar tundra / equatorial desert — thinner and less dense than before.
        if (cold > 0.5 && roll < 0.45) { t.terrain = 'tundra'; continue; }
        if (cold > 0.2 && roll < 0.18) { t.terrain = 'tundra'; continue; }
        if (hot > 0.5 && roll < 0.45) { t.terrain = 'desert'; continue; }
        if (hot > 0.2 && roll < 0.18) { t.terrain = 'desert'; continue; }
        // Temperate core — grass/plains/forest dominate; desert no longer intrudes
        // here, so fertile land is the rule and badlands are a regional accent.
        if (roll < 0.32) t.terrain = 'grass';
        else if (roll < 0.55) t.terrain = 'plains';
        else if (roll < 0.71) t.terrain = 'forest';
        else if (roll < 0.83) t.terrain = 'hills';
        else if (roll < 0.90) t.terrain = 'mountain';
        else t.terrain = 'water';
      }
    }

    // Two smoothing passes for cleaner clusters (mountain ranges, forest blocks,
    // contiguous deserts). Each pass replaces a tile with the dominant neighbour
    // type only when that type clearly outnumbers it (>=4 of 6 + self).
    for (var pass = 0; pass < 2; pass++) {
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
    }

    // Edge water frame (small)
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        if (c === 0 || r === 0 || c === MAP_W - 1 || r === MAP_H - 1) {
          if (rnd() < 0.12) map[r][c].terrain = 'water';
        }
      }
    }

    // Interior lakes / small seas — scaled by AREA so water coverage stays
    // roughly constant at every map size (the perimeter frame alone thins out on
    // big maps) and naval units have water to sail inland. Kept as small organic
    // blobs so they never wall the continent into disconnected pieces.
    carveLakes(map, Math.round(MAP_W * MAP_H / 70));

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
        // Per-terrain density. Desert is the largest biome and the only source
        // of gold, so its density is kept low to stop gold from flooding.
        var density = {
          grass:   0.15, plains:  0.16, forest:  0.07,
          hills:   0.30, mountain:0.00, desert:  0.05,
          water:   0.12
        }[t.terrain] || 0;
        if (rnd() < density) {
          // Weighted pick so strategic resources (iron, horses, gems) aren't
          // drowned out by whatever terrain happens to be common this map.
          var totW = 0;
          for (var ci = 0; ci < candidates.length; ci++) totW += (RESOURCES[candidates[ci]].weight || 1);
          var roll = rnd() * totW;
          var chosen = candidates[candidates.length - 1];
          for (var ci = 0; ci < candidates.length; ci++) {
            roll -= (RESOURCES[candidates[ci]].weight || 1);
            if (roll <= 0) { chosen = candidates[ci]; break; }
          }
          t.resource = chosen;
        }
      }
    }

    // Guarantee a minimum of the late-game strategic resources so Modern-age
    // units are always reachable, even on small maps where the weighted scatter
    // (oil/coal are rare) might skip them entirely.
    function ensureResource(kind, minCount) {
      var have = 0, spots = [];
      for (var er = 0; er < MAP_H; er++) for (var ec = 0; ec < MAP_W; ec++) {
        var et = map[er][ec];
        if (et.resource === kind) have++;
        else if (!et.resource && RESOURCES[kind].terrains.indexOf(et.terrain) >= 0) spots.push(et);
      }
      for (var i = spots.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = spots[i]; spots[i] = spots[j]; spots[j] = tmp; }
      while (have < minCount && spots.length) { spots.pop().resource = kind; have++; }
    }
    ensureResource('oil', Math.max(3, Math.round(MAP_W / 6)));
    ensureResource('coal', Math.max(2, Math.round(MAP_W / 8)));
    // Floors for the early-game staples too, so no map (or start) is starved of
    // the strategic + food resources that drive the opening.
    ensureResource('iron',   Math.max(2, Math.round(MAP_W / 8)));
    ensureResource('horses', Math.max(2, Math.round(MAP_W / 8)));
    ensureResource('wheat',  Math.max(2, Math.round(MAP_W / 9)));

    // Natural wonders — scale with map size so big maps aren't covered by just
    // one volcano. Small 1 · Normal 2 · Large 3 · Huge 4 · Massive 5 of each.
    var wonderCount = MAP_W >= 28 ? 5 : MAP_W >= 24 ? 4 : MAP_W >= 20 ? 3 : MAP_W <= 12 ? 1 : 2;
    for (var w = 0; w < wonderCount; w++) {
      placeWonder(map, 'volcano', ['mountain','hills','plains']);
    }
    for (var w2 = 0; w2 < wonderCount; w2++) {
      placeWonder(map, 'geyser',  ['grass','plains','forest']);
    }

    // Carve rivers — scale with map size (Small 2 · Normal 3 · Large 4 · Huge 5 · Massive 6)
    var riverCount = MAP_W >= 28 ? 6 : MAP_W >= 24 ? 5 : MAP_W >= 20 ? 4 : MAP_W <= 12 ? 2 : 3;
    placeRivers(map, riverCount);

    // Scatter tribal villages — denser per area so exploration stays rewarding
    var villageCount = Math.max(4, Math.round(MAP_W * MAP_H / 20));
    placeVillages(map, villageCount);

    return map;
  }

  function neighborsRaw(c, r) {
    var deltas = neighborDeltas(r);
    var out = [];
    for (var i = 0; i < 6; i++) {
      var nc = c + deltas[i][0], nr = r + deltas[i][1];
      if (nc >= 0 && nc < MAP_W && nr >= 0 && nr < MAP_H) out.push([nc, nr]);
    }
    return out;
  }

  // Carve `seeds` organic interior water bodies by flood-growing small blobs of
  // random size from random inland tiles. Small blobs keep the continent
  // connected while giving inland coasts, lakes, and the odd small sea.
  function carveLakes(map, seeds) {
    for (var k = 0; k < seeds; k++) {
      var c = rndInt(2, MAP_W - 3), r = rndInt(2, MAP_H - 3);
      var t0 = map[r][c];
      if (t0.terrain === 'water' || TERRAIN[t0.terrain].wonder) continue;
      var target = rndInt(2, 6);
      var seen = {}; seen[c + ',' + r] = 1;
      map[r][c].terrain = 'water';
      var made = 1, frontier = neighborsRaw(c, r);
      while (made < target && frontier.length) {
        var idx = Math.floor(rnd() * frontier.length);
        var pick = frontier.splice(idx, 1)[0];
        var key = pick[0] + ',' + pick[1];
        if (seen[key]) continue;
        seen[key] = 1;
        var pt = map[pick[1]][pick[0]];
        if (TERRAIN[pt.terrain].wonder) continue;   // don't drown natural wonders
        pt.terrain = 'water';
        made++;
        var more = neighborsRaw(pick[0], pick[1]);
        for (var m = 0; m < more.length; m++) if (!seen[more[m][0] + ',' + more[m][1]]) frontier.push(more[m]);
      }
    }
  }

  function placeRivers(map, count) {
    for (var k = 0; k < count; k++) {
      var start = null;
      for (var tries = 0; tries < 200; tries++) {
        var c = rndInt(2, MAP_W - 3);
        var r = rndInt(2, MAP_H - 3);
        var t = map[r][c];
        if (t.terrain === 'hills' || t.terrain === 'mountain') { start = [c, r]; break; }
      }
      if (!start) continue;
      var cur = start;
      var visited = {};
      visited[cur[0] + ',' + cur[1]] = true;
      var path = [cur];
      for (var steps = 0; steps < 18; steps++) {
        var ns = neighborsRaw(cur[0], cur[1]);
        var best = null, bestScore = Infinity;
        for (var i = 0; i < ns.length; i++) {
          var nc = ns[i][0], nr = ns[i][1];
          if (visited[nc + ',' + nr]) continue;
          var nt = map[nr][nc];
          if (nt.river) continue;
          var score = 0;
          if (nt.terrain === 'water') score -= 100;
          var edgeDist = Math.min(nc, nr, MAP_W - 1 - nc, MAP_H - 1 - nr);
          score += edgeDist * 0.6;
          if (nt.terrain === 'mountain') score += 8;
          if (nt.terrain === 'volcano') score += 50;
          if (nt.terrain === 'hills')    score += 3;
          if (nt.terrain === 'grass' || nt.terrain === 'plains' || nt.terrain === 'forest') score -= 2;
          score += rnd() * 2.5;
          if (score < bestScore) { best = ns[i]; bestScore = score; }
        }
        if (!best) break;
        visited[best[0] + ',' + best[1]] = true;
        path.push(best);
        if (map[best[1]][best[0]].terrain === 'water') break;
        cur = best;
      }
      // Only valid land terrains carry rivers; everything else is skipped so a
      // walk that ends in tundra or desert doesn't paint the wrong biome blue.
      var RIVER_LAND = { grass: 1, plains: 1, forest: 1, hills: 1 };
      path.forEach(function (p) {
        var t = map[p[1]][p[0]];
        if (!RIVER_LAND[t.terrain]) return;
        t.river = true;
      });
    }
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

  // Rough per-tile food value used only to rate candidate city sites.
  function tileFoodScore(terr) {
    return { grass: 2, plains: 1, forest: 1, hills: 1, geyser: 2, water: 1, desert: 0, tundra: 0, mountain: 0, volcano: 0 }[terr] || 0;
  }
  // Quality of a would-be capital: the food, resources, workable land, and fresh
  // water within two rings. Drives balanced starts — every civ gets a site near
  // the top of the distribution, so no one spawns in a wasteland while a rival
  // lands in a breadbasket.
  function startQuality(map, c, r) {
    var seen = {}; seen[c + ',' + r] = 1;
    var q = [[c, r, 0]], hd = 0, food = 0, res = 0, workable = 0, fresh = 0;
    while (hd < q.length) {
      var cur = q[hd++], t = map[cur[1]][cur[0]];
      food += tileFoodScore(t.terrain) + (t.river ? 1 : 0);
      if (!TERRAIN[t.terrain].impassable) workable++;
      if (t.resource) res++;
      if (t.river) fresh = 1;
      if (cur[2] < 2) {
        var ns = neighborsRaw(cur[0], cur[1]);
        for (var i = 0; i < ns.length; i++) {
          var k = ns[i][0] + ',' + ns[i][1];
          if (!seen[k]) { seen[k] = 1; q.push([ns[i][0], ns[i][1], cur[2] + 1]); }
        }
      }
    }
    return food + res * 2 + workable * 0.5 + fresh * 2;
  }

  function pickStart(map, awayFrom) {
    // awayFrom can be a single [c,r] or an array of them
    var existing = [];
    if (awayFrom && awayFrom.length) {
      existing = (typeof awayFrom[0] === 'number') ? [awayFrom] : awayFrom;
    }
    // Scale minimum distance with map size
    var minDist = Math.max(4, Math.floor(Math.min(MAP_W, MAP_H) * 0.55));
    var fallbackDist = Math.max(3, minDist - 2);
    // Scan many valid sites and keep the HIGHEST-quality one. Every civ maximises
    // the same score, so starts cluster near the top → high floor, low spread.
    var best = null, bestScore = -Infinity;
    for (var tries = 0; tries < 900; tries++) {
      if (tries === 600 && !best) minDist = fallbackDist;   // relax spacing only if crowded
      var c = rndInt(2, MAP_W - 3);
      var r = rndInt(2, MAP_H - 3);
      var t = map[r][c];
      if (TERRAIN[t.terrain].impassable) continue;
      var tooClose = false;
      for (var i = 0; i < existing.length; i++) {
        if (hexDist([c, r], existing[i]) < minDist) { tooClose = true; break; }
      }
      if (tooClose) continue;
      var ok = 0;
      var ns = neighborsRaw(c, r);
      for (var j = 0; j < ns.length; j++) {
        if (!TERRAIN[map[ns[j][1]][ns[j][0]].terrain].impassable) ok++;
      }
      if (ok < 4) continue;
      var score = startQuality(map, c, r);
      if (score > bestScore) { bestScore = score; best = [c, r]; }
    }
    return best || [Math.floor(MAP_W / 2), Math.floor(MAP_H / 2)];
  }

  // =====================================================================
  // NEW GAME / SAVE / LOAD
  // =====================================================================
  function newGame(seed, playerFaction, opts) {
    opts = opts || {};
    seed = (seed != null ? (seed & 0x7fffffff) : 0) || (Date.now() & 0x7fffffff);
    // Seed the RNG up front so the ENTIRE setup (faction/personality/agenda
    // shuffles, map gen, starts, city-states) is deterministic from this one
    // seed — the basis for shareable seed codes and the Daily Challenge.
    srand(seed);
    playerFaction = playerFaction || 'solaris';
    if (!FACTIONS[playerFaction]) playerFaction = 'solaris';
    var others = FACTION_ORDER.filter(function (f) { return f !== playerFaction; });
    // Shuffle so AI faction assignment is randomized (seeded — reproducible)
    shuffle(others);

    // Apply map size
    var mSize = MAP_SIZES[selectedMapSize] || MAP_SIZES.normal;
    MAP_W = mSize.w;
    MAP_H = mSize.h;

    // Scale the number of AI rivals with map size, then lock in CIV_SIDES /
    // AI_SIDES for this game so every generic loop knows the roster.
    var aiCount = aiCountForMap(MAP_W);
    var aiIds = ALL_AI_IDS.slice(0, aiCount);
    setCivSides(aiIds);
    var aiFactions = others.slice(0, aiCount);

    applyFaction('player', playerFaction);
    aiIds.forEach(function (id, i) { applyFaction(id, aiFactions[i]); });

    var map = generateMap(seed);

    var civs = { player: makeCiv('player', playerFaction), barb: makeBarbCiv(), cs: makeCsCiv() };
    aiIds.forEach(function (id, i) { civs[id] = makeCiv(id, aiFactions[i]); });

    state = {
      seed: seed,
      seedCode: seedToCode(seed),
      isDaily: !!opts.daily,
      dailyDate: opts.daily ? (opts.dailyDate || null) : null,
      turn: 1,
      currentCiv: 'player',
      map: map,
      mapW: MAP_W,
      mapH: MAP_H,
      difficulty: selectedDifficulty,
      civs: civs,
      cursor: { c: 0, r: 0 },
      camera: { x: 0, y: 0 },           // world pixel offset of top-left of view
      zoom: DEFAULT_ZOOM,
      mode: 'cursor',                    // 'cursor' | 'scroll'
      selected: null,                    // { c, r } of selected friendly unit
      victory: null,                     // 'player' | 'ai' | null
      log: [],
      turnLog: [],
      wondersBuilt: {},                  // wonder id -> civ id who built it
      tradeRoutes: [],                   // {fromC,fromR,toC,toR,owner,intl,gold,disrupted}
      religions: {},                     // religion id -> {name,icon,belief,founder,holyC,holyR}
      stats: { unitsKilled: 0, unitsLost: 0, barbsDefeated: 0 },
      diplomacy: defaultDiplomacy(),     // every civ pair at war; city-states at peace
      pacts: {},                         // dipKey -> true for active Defensive Pacts
      vassals: {},                       // vassal civ id -> overlord civ id
      digSites: [],                      // living history: {c,r,label,turn} ruins
      eraQuestsDone: {},                 // era quest id -> true once paid out
      barbBribe: null,                   // { target, turns } — clans hunt this civ
      pendingPeace: null,                // { from: civId } when AI offers peace
      freetech: false                     // great scientist free tech pick
    };

    // Starting positions: player first, then one per AI, each kept apart.
    var starts = [pickStart(map)];
    aiIds.forEach(function () { starts.push(pickStart(map, starts.slice())); });
    var p = starts[0];
    state.cursor.c = p[0]; state.cursor.r = p[1];

    spawnStarter('player', p);
    aiIds.forEach(function (id, i) { spawnStarter(id, starts[i + 1]); });

    state.civs.player.currentTech = 'pottery';
    // Assign a personality per AI. A faction with a `lean` forces that
    // personality (e.g. Ferrum is always a warmonger); factions without one
    // draw distinct random personalities so the AIs still feel different.
    var bag = shuffle(PERSONALITY_ORDER.slice());
    function assignPersonality(sideId) {
      var fac = FACTIONS[state.civs[sideId].faction];
      if (fac && fac.lean && AI_PERSONALITIES[fac.lean]) return fac.lean;
      return bag.shift() || 'aggressive';
    }
    var agendaBag = shuffle(AGENDA_ORDER.slice());
    aiIds.forEach(function (id, i) {
      state.civs[id].currentTech = i === 0 ? 'archery' : 'pottery';
      state.civs[id].personality = assignPersonality(id);
      state.civs[id].agenda = agendaBag.shift() || 'expansionist';
    });

    // City-states scale with map size — denser worlds have more neutrals to court
    var csCount = MAP_W >= 28 ? 6 : MAP_W >= 24 ? 5 : MAP_W >= 20 ? 4 : MAP_W >= 16 ? 3 : 2;
    spawnCityStates(csCount, starts);

    CIV_SIDES.forEach(function (id) { recomputeVisibility(id); });
    recomputeBorders();
    centerCameraOn(state.cursor.c, state.cursor.r);
    save();
  }

  // =====================================================================
  // DAILY CHALLENGE / WORLD SEEDS
  // A custom seed entered on the new-game screen, or null for a random world.
  // =====================================================================
  var selectedSeed = null;
  var DAILY_KEY = 'mdg_microciv_daily';
  // Local date as YYYY-MM-DD (the day's challenge id). new Date() is fine in the
  // browser; everyone playing on the same calendar day gets the same world.
  function dailyKeyForDate(d) {
    d = d || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function dailyKeyForToday() { return dailyKeyForDate(); }
  function dailyKeyYesterday() { return dailyKeyForDate(new Date(Date.now() - 86400000)); }
  function loadDailyRec() { try { return JSON.parse(localStorage.getItem(DAILY_KEY)) || {}; } catch (e) { return {}; } }
  function saveDailyRec(d) { try { localStorage.setItem(DAILY_KEY, JSON.stringify(d)); } catch (e) {} }

  // Start today's Daily Challenge — a fixed, fair world (seed + faction + map +
  // difficulty all derived from the date) so every run is comparable. One tap.
  function startDaily() {
    var key = dailyKeyForToday();
    var seed = seedFromString('mc-daily-' + key);
    var fac = FACTION_ORDER[seed % FACTION_ORDER.length];
    selectedMapSize = 'normal';
    selectedDifficulty = 'normal';
    selectedSeed = null;
    clearSave();
    newGame(seed, fac, { daily: true, dailyDate: key });
    showScreen('game');
    if (audioPrefs.music) startMusic();
    showToast('Daily Challenge — ' + key, 'success');
  }

  // Record a player win on the daily: track best (fewest turns) per date and a
  // consecutive-day win streak. Called once when the player wins a daily game.
  function recordDailyWin() {
    if (!state || !state.isDaily || !state.dailyDate) return;
    var rec = loadDailyRec();
    rec.best = rec.best || {};
    var prev = rec.best[state.dailyDate];
    if (prev == null || state.turn < prev) rec.best[state.dailyDate] = state.turn;
    // Streak: if we already logged today, leave it; if last win was yesterday,
    // extend; otherwise reset to 1.
    if (rec.lastWonDate !== state.dailyDate) {
      rec.streak = (rec.lastWonDate === dailyKeyYesterday()) ? (rec.streak || 0) + 1 : 1;
      rec.lastWonDate = state.dailyDate;
    }
    saveDailyRec(rec);
  }

  // Place city-states on the map. Picks land tiles at least 5 hexes from any
  // capital and 4 from any other city-state. Each gets a random kind and a
  // single Warrior defender on its tile.
  function spawnCityStates(count, civStarts) {
    var placed = [];
    var nameBag = CITY_STATE_NAMES.slice();
    // shuffle name bag
    for (var i = nameBag.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = nameBag[i]; nameBag[i] = nameBag[j]; nameBag[j] = tmp;
    }
    // candidate tiles: passable, no unit/city, away from civ capitals + each other
    var candidates = [];
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var t = tileAt(c, r);
        if (!t || t.unit || t.city) continue;
        if (TERRAIN[t.terrain].impassable) continue;
        var ok = true;
        for (var k = 0; k < civStarts.length; k++) {
          if (hexDist([c, r], civStarts[k]) < 5) { ok = false; break; }
        }
        if (!ok) continue;
        candidates.push([c, r]);
      }
    }
    // shuffle candidates
    for (var i2 = candidates.length - 1; i2 > 0; i2--) {
      var jj = Math.floor(rnd() * (i2 + 1));
      var tmp2 = candidates[i2]; candidates[i2] = candidates[jj]; candidates[jj] = tmp2;
    }
    while (placed.length < count && candidates.length) {
      var pick = candidates.shift();
      var farEnough = placed.every(function (q) { return hexDist(pick, q) >= 4; });
      if (!farEnough) continue;
      var t2 = tileAt(pick[0], pick[1]);
      var kind = CS_KIND_ORDER[Math.floor(rnd() * CS_KIND_ORDER.length)];
      var name = nameBag.length ? nameBag.shift() : 'Citadel';
      var city = {
        civ: 'cs',
        name: name,
        c: pick[0], r: pick[1],
        pop: 1,
        food: 0,
        foodCap: 999,            // city-states don't grow
        prod: 0,
        buildings: {},
        producing: null,
        queue: [],
        capital: false,
        originalCiv: null,
        onRiver: !!t2.river,
        foundedTurn: 0,
        kind: kind,              // 'mercantile' | 'scientific' | 'militaristic'
        ally: null,              // civId or null
        quest: makeCsQuest(),    // free-alliance task offered to the player
        isCityState: true
      };
      state.civs.cs.cities.push(city);
      t2.city = city;
      // Defender warrior at the city tile
      spawnUnit('cs', 'warrior', pick[0], pick[1]);
      placed.push(pick);
    }
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
      techProgress: 0,
      researchQueue: [],            // player-set research plan (prereq chain)
      greatPoints: { culture: 0, military: 0, faith: 0 },
      greatPeopleSpawned: 0,
      spyOps: [],          // espionage missions in flight (see SPY_MISSIONS)
      generalBonus: null,
      economicCountdown: 0,
      // Government / Civics + Golden Ages (Modern-era strategic systems)
      government: 'despotism',
      governmentTurns: 0,         // anarchy countdown (>0 = switching)
      eraPoints: 0,
      goldenAgeTurns: 0,          // >0 = golden age active
      goldenAgesHad: 0,           // drives the rising era-point threshold
      // Rival character: a rolled agenda (AIs only) + a capped memory ledger of
      // dealings with the player. Leader is derived from faction via leaderOf().
      agenda: null,
      memory: [],
      // Active edict (reactive timed stance)
      edict: null,
      edictTurns: 0,
      // Civics — the culture tree (research-style, fuelled by culPerTurn)
      civics: {},
      currentCivic: null,
      civicProgress: 0,
      civicQueue: [],
      culPerTurn: 0,
      tradedLux: {},              // luxuries imported via a swap (resource -> provider)
      spaceParts: 0,              // Space Race progress (parts assembled)
      nationals: {},              // national wonders built (one per empire)
      ideology: null,             // late-game Ideology pick (Freedom/Order/Autocracy)
      faith: 0,                   // banked faith toward founding a religion
      religionId: null,           // the religion this civ founded (or null)
      // Dynamic grievance toward each other civ id (0 = cordial, higher = angrier).
      // Only AIs act on it; the player's map is unused.
      tension: {},
      tensionBand: {}
    };
  }

  function makeCsCiv() {
    // Non-aggressive 'side' that owns city-states. Defenders fight back if attacked,
    // but cs never expands, researches, or takes a planning turn.
    return {
      id: 'cs',
      name: CIVS.cs.name,
      color: CIVS.cs.color,
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
    // Find valid neighboring spots for starter units
    var ns = neighbors(pos[0], pos[1]).filter(function (n) {
      var t = state.map[n[1]][n[0]];
      return !TERRAIN[t.terrain].impassable && !t.unit;
    });
    var starterWar = factionUnitFor(state.civs[civId], 'warrior');   // Ferrum starts with a Legionary
    if (ns.length > 0) spawnUnit(civId, starterWar, ns[0][0], ns[0][1]);
    // Higher difficulty: AI gets an extra warrior + a small starting-gold jump.
    var diff = DIFFICULTIES[state.difficulty || 'normal'] || DIFFICULTIES.normal;
    if (civId !== 'player') {
      if (diff.aiExtraWarrior && ns.length > 1) spawnUnit(civId, starterWar, ns[1][0], ns[1][1]);
      if (diff.aiStartGold) state.civs[civId].gold += diff.aiStartGold;
    }
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
      hasActed: false,
      kills: 0,
      promoAtk: 0,
      promoDef: 0,
      promoHp: 0,
      promos: 0,           // total promotions applied (chosen)
      pendingPromo: 0,     // earned-but-unchosen promotions (player picks 1 of 2)
      goto: null           // multi-turn move destination { c, r }
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
        t: Date.now(),               // last-write-wins timestamp for cloud sync
        seed: state.seed,
        isDaily: state.isDaily || false,
        dailyDate: state.dailyDate || null,
        turn: state.turn,
        currentCiv: state.currentCiv,
        map: state.map,
        mapW: MAP_W,
        mapH: MAP_H,
        difficulty: state.difficulty || 'normal',
        civs: state.civs,
        cursor: state.cursor,
        camera: state.camera,
        zoom: state.zoom,
        mode: state.mode,
        selected: state.selected,
        victory: state.victory,
        wondersBuilt: state.wondersBuilt,
        tradeRoutes: state.tradeRoutes || [],
        religions: state.religions || {},
        stats: state.stats || { unitsKilled: 0, unitsLost: 0 },
        diplomacy: state.diplomacy,
        pacts: state.pacts || {},
        vassals: state.vassals || {},
        digSites: state.digSites || [],
        eraQuestsDone: state.eraQuestsDone || {},
        barbBribe: state.barbBribe || null,
        pendingPeace: state.pendingPeace || null,
        pendingDilemma: state.pendingDilemma || null,
        pendingCrisis: state.pendingCrisis || null,
        victoryAlerts: state.victoryAlerts || {},
        eraReached: state.eraReached || 0,
        chronicle: state.chronicle || [],
        freetech: state.freetech || false,
        log: state.log || [],
        lastEventTurn: state.lastEventTurn || 0
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
      // NOTE: no cloud push here — local saves are free (no KV cap); cloud writes
      // are driven by the debounced safety net + hide/close flush + manual Upload
      // (see scheduleCloudPush / cloudPush / init).
    } catch (e) { /* ignore quota */ }
  }

  // ---- Cloud save sync (optional; see config.js / cloud.js) --------------
  /* cloud-write-reduce-v1 — dedup + throttle + backoff so we don't blow the
     Cloudflare KV free-tier 1,000-writes/day cap. Local saves are free/uncapped;
     cloud writes happen only on: a debounced push after a real change (≥60s
     apart), a hide/pagehide flush, a 5-min safety net, or an explicit Upload. */
  var cloudPushTimer = 0, cloudPullPromise = null;
  var _cloudSig = null, _lastPushAt = 0, _pushBackoff = 0;

  // Signature of a save with volatile fields neutralised, so only a MEANINGFUL
  // game-state change counts as a "change" worth a (capped) KV write. We strip:
  //   • t         — the sync timestamp, bumped on every save
  //   • cursor/camera/zoom/mode/selected — per-device VIEW + selection state,
  //     which is never worth syncing cross-device and would otherwise make
  //     panning / zooming / picking a unit look like a change to push.
  // Nested per-entry timestamps (log, etc.) are real state and left intact.
  function sigOf(raw) {
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      o.t = 0; o.cursor = 0; o.camera = 0; o.zoom = 0; o.mode = 0; o.selected = 0;
      return JSON.stringify(o);
    } catch (e) {
      return raw.replace(/"t"\s*:\s*\d+/, '"t":0');   // fallback: strip top-level t only
    }
  }

  // Debounced upload — coalesces rapid saves into one push. The cloud doesn't
  // need second-freshness; the throttle + dedup inside cloudPush do the real work.
  function scheduleCloudPush() {
    if (!window.__CLOUD || !window.__CLOUD.enabled) return;
    clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(function () { cloudPush(false, false); }, 4000);
  }

  // Push the local save to the cloud. Returns Promise<bool> (true = accepted or
  // already synced). Rules: skip if content unchanged since the last *successful*
  // push (even on flush — covers mobile screen-lock storms); throttle non-flush
  // pushes to >=60s; back off ~60s after a failed write (explicit punches through);
  // mark synced only after the worker accepts the write so failures retry.
  function cloudPush(flush, explicit) {
    if (!window.__CLOUD || !window.__CLOUD.enabled) return Promise.resolve(false);
    clearTimeout(cloudPushTimer);
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return Promise.resolve(false);
    var sig = sigOf(raw);
    if (sig === _cloudSig) return Promise.resolve(true); // unchanged — no write, even on flush
    var now = Date.now();
    if (!explicit && _pushBackoff && now < _pushBackoff) {            // cool down after a failed write
      if (!flush) cloudPushTimer = setTimeout(function () { cloudPush(false, false); }, _pushBackoff - now + 500);
      return Promise.resolve(false);
    }
    // Throttle: a background push waits >=60s; a leave-flush may go sooner but
    // still keeps a >=15s gap (respects the KV "1 write/sec per key" limit and
    // stops repeated tab-hide / screen-lock cycles from writing each time). An
    // explicit "Upload now" bypasses the gap entirely.
    var minGap = flush ? 15000 : 60000;
    if (!explicit && _lastPushAt && now - _lastPushAt < minGap) {
      // Non-flush pushes reschedule so the change still lands; a flush is fire-
      // and-forget on the way out, so we just drop it (it was written <15s ago).
      if (!flush) cloudPushTimer = setTimeout(function () { cloudPush(false, false); }, minGap - (now - _lastPushAt) + 500);
      return Promise.resolve(false);
    }
    var t = now; try { t = JSON.parse(raw).t || t; } catch (e) {}
    _lastPushAt = now;
    return encodeSavePayload(raw).then(function (z) {
      // keepalive on a leave-flush so the write survives the tab being torn down.
      return window.__CLOUD.put({ t: t, z: z }, { keepalive: !!flush }).then(function (ok) {
        if (ok) { _cloudSig = sig; _pushBackoff = 0; }   // synced only on success
        else _pushBackoff = Date.now() + 60000;           // backoff on failure
        return ok;
      });
    }).catch(function () { _pushBackoff = Date.now() + 60000; return false; });
  }

  // Adopt the remote save iff it's newer-or-equal to the local one (last-write-wins).
  function mergeRemoteSave(remote) {
    if (!remote || !remote.z) return Promise.resolve(false);
    return decodeSavePayload(remote.z).then(function (rawRemote) {
      var parsed = JSON.parse(rawRemote);
      if (!parsed || !parsed.civs || !parsed.map) return false;
      var localRaw = localStorage.getItem(STORAGE_KEY);
      var localT = 0;
      if (localRaw) { try { localT = JSON.parse(localRaw).t || 0; } catch (e) {} }
      var remoteT = remote.t || parsed.t || 0;
      if (!localRaw || remoteT >= localT) {
        localStorage.setItem(STORAGE_KEY, rawRemote);
        return true;
      }
      return false;
    }).catch(function () { return false; });
  }

  // Explicit "Upload this device's game now" — force-push the local save under
  // the current sync code (ignores the debounce). Returns Promise<bool>.
  function cloudPushNow() {
    // Explicit "Upload now" — flush + explicit punch through throttle/backoff.
    return cloudPush(true, true);
  }
  // Explicit "Download the cloud game now" — force-overwrite the local save with
  // the remote one regardless of timestamps (the player asked for it).
  function cloudPullNow() {
    if (!window.__CLOUD || !window.__CLOUD.enabled) return Promise.resolve(false);
    return window.__CLOUD.pull().then(function (remote) {
      if (!remote || !remote.z) return false;
      return decodeSavePayload(remote.z).then(function (rawRemote) {
        var parsed = JSON.parse(rawRemote);
        if (!parsed || !parsed.civs || !parsed.map) return false;
        localStorage.setItem(STORAGE_KEY, rawRemote);
        return true;
      });
    }).catch(function () { return false; });
  }

  // On launch, pull the latest cloud save before the player hits Continue.
  function cloudInit() {
    if (!window.__CLOUD || !window.__CLOUD.enabled) return;
    cloudPullPromise = window.__CLOUD.pull().then(function (remote) {
      if (!remote) return;
      return mergeRemoteSave(remote).then(function (adopted) {
        if (adopted) {
          var raw = localStorage.getItem(STORAGE_KEY);
          if (raw) _cloudSig = sigOf(raw); // baseline so we don't echo the adopted save back
          setupTitleButtons(); showToast('Cloud save synced', 'success');
        }
      });
    }).catch(function () {});
  }

  // Continue: wait for the (usually-fast) cloud pull so we load the merged save.
  function continueGame() {
    function go() {
      if (!hasSave()) return;
      if (load()) { showScreen('game'); if (audioPrefs.music) startMusic(); }
    }
    if (cloudPullPromise) cloudPullPromise.then(go, go); else go();
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var s = JSON.parse(raw);
      if (!s.map || !s.civs) return false;
      state = s;
      state.seedCode = seedToCode(state.seed || 0);   // derived, not persisted
      if (state.isDaily === undefined) state.isDaily = false;
      if (state.dailyDate === undefined) state.dailyDate = null;
      state.log = state.log || [];
      state.turnLog = state.turnLog || [];
      state.wondersBuilt = state.wondersBuilt || {};
      if (!Array.isArray(state.tradeRoutes)) state.tradeRoutes = [];
      if (!state.religions || typeof state.religions !== 'object') state.religions = {};
      state.stats = state.stats || { unitsKilled: 0, unitsLost: 0 };
      if (state.stats.barbsDefeated === undefined) state.stats.barbsDefeated = 0;
      // Backfill quests onto city-states from older saves
      if (state.civs.cs) state.civs.cs.cities.forEach(function (csc) { if (!csc.quest) csc.quest = makeCsQuest(); });
      state.difficulty = state.difficulty || 'normal';
      if (state.pendingPeace === undefined) state.pendingPeace = null;
      if (state.pendingCrisis === undefined) state.pendingCrisis = null;
      if (!state.victoryAlerts || typeof state.victoryAlerts !== 'object') state.victoryAlerts = {};
      if (state.freetech === undefined) state.freetech = false;
      // Restore map dimensions from save (or default to 14x14 for old saves)
      MAP_W = state.mapW || 14;
      MAP_H = state.mapH || 14;
      if (!state.civs.barb) state.civs.barb = makeBarbCiv();
      if (!state.civs.cs)   state.civs.cs   = makeCsCiv();
      // Backfill missing tile fields from older saves
      for (var rr = 0; rr < MAP_H; rr++) {
        for (var cc = 0; cc < MAP_W; cc++) {
          var tl = state.map[rr][cc];
          if (tl.village === undefined) tl.village = null;
          if (tl.owner === undefined) tl.owner = null;
          if (tl.river === undefined) tl.river = false;
          if (!tl.visible.ai2) tl.visible.ai2 = false;
          if (!tl.explored.ai2) tl.explored.ai2 = false;
          if (!tl.visible.ai3) tl.visible.ai3 = false;
          if (!tl.explored.ai3) tl.explored.ai3 = false;
          // Remove fishing improvement from old saves (no longer buildable)
          if (tl.improvement === 'fishing') tl.improvement = null;
        }
      }
      // Older saves may have only one AI — synth a second one from the remaining faction.
      if (!state.civs.ai2) {
        var picked = [state.civs.player.faction, state.civs.ai.faction];
        var leftover = FACTION_ORDER.filter(function (f) { return picked.indexOf(f) < 0; })[0] || 'tellus';
        state.civs.ai2 = makeCiv('ai2', leftover);
        state.civs.ai2.currentTech = 'pottery';
      }
      // Lock in the civ roster from whichever AIs this save actually has, then
      // (re)build the diplomacy table — preserving any saved relations on top
      // of sane defaults (every civ pair at war, city-states at peace).
      setCivSides(ALL_AI_IDS.filter(function (id) { return state.civs[id]; }));
      state.diplomacy = Object.assign(defaultDiplomacy(), state.diplomacy || {});
      if (!state.pacts || typeof state.pacts !== 'object') state.pacts = {};
      if (!state.vassals || typeof state.vassals !== 'object') state.vassals = {};
      if (!Array.isArray(state.digSites)) state.digSites = [];
      if (!state.eraQuestsDone || typeof state.eraQuestsDone !== 'object') state.eraQuestsDone = {};
      if (state.barbBribe === undefined) state.barbBribe = null;
      // Re-apply factions so CIVS colors/names match the saved game
      CIV_SIDES.forEach(function (id) {
        var fid = state.civs[id].faction || 'solaris';
        state.civs[id].faction = fid;
        applyFaction(id, fid);
        state.civs[id].name = CIVS[id].name;
        state.civs[id].color = CIVS[id].color;
      });
      // Backfill originalCiv + build queue for cities from older saves
      CIV_SIDES.concat(['cs']).forEach(function (id) {
        if (!state.civs[id]) return;
        (state.civs[id].cities || []).forEach(function (ct) {
          if (ct.capital && !ct.originalCiv) ct.originalCiv = ct.civ;
          if (!Array.isArray(ct.queue)) ct.queue = [];
          if (!ct.buildings) ct.buildings = {};
        });
      });
      // Backfill great people fields from older saves
      CIV_SIDES.forEach(function (id) {
        var cv = state.civs[id];
        if (!cv.greatPoints) cv.greatPoints = { culture: 0, military: 0, faith: 0 };
        if (cv.greatPoints.faith === undefined) cv.greatPoints.faith = 0;
        if (cv.greatPeopleSpawned === undefined) cv.greatPeopleSpawned = 0;
        if (cv.generalBonus === undefined) cv.generalBonus = null;
        if (cv.economicCountdown === undefined) cv.economicCountdown = 0;
        if (!Array.isArray(cv.researchQueue)) cv.researchQueue = [];
        // Government / Golden-age fields (round-2 expansion) — backfill safely.
        if (typeof cv.government !== 'string') cv.government = 'despotism';
        if (typeof cv.governmentTurns !== 'number') cv.governmentTurns = 0;
        if (typeof cv.eraPoints !== 'number') cv.eraPoints = 0;
        if (typeof cv.goldenAgeTurns !== 'number') cv.goldenAgeTurns = 0;
        if (typeof cv.goldenAgesHad !== 'number') cv.goldenAgesHad = 0;
        if (!Array.isArray(cv.memory)) cv.memory = [];
        if (typeof cv.edict !== 'string') cv.edict = null;
        if (typeof cv.edictTurns !== 'number') cv.edictTurns = 0;
        if (!cv.civics || typeof cv.civics !== 'object') cv.civics = {};
        if (typeof cv.currentCivic !== 'string') cv.currentCivic = null;
        if (typeof cv.civicProgress !== 'number') cv.civicProgress = 0;
        if (!Array.isArray(cv.civicQueue)) cv.civicQueue = [];
        if (typeof cv.culPerTurn !== 'number') cv.culPerTurn = 0;
        if (!cv.tradedLux || typeof cv.tradedLux !== 'object') cv.tradedLux = {};
        if (typeof cv.spaceParts !== 'number') cv.spaceParts = 0;
        if (!cv.nationals || typeof cv.nationals !== 'object') cv.nationals = {};
        if (typeof cv.ideology !== 'string') cv.ideology = null;
        if (typeof cv.faith !== 'number') cv.faith = 0;
        if (typeof cv.religionId !== 'string') cv.religionId = null;
        if (typeof cv.pantheon !== 'string') cv.pantheon = null;
        if (!Array.isArray(cv.spyOps)) cv.spyOps = [];
      });
      // Backfill AI agendas — old saves get a distinct random one
      (function () {
        var taken = {};
        AI_SIDES.forEach(function (id) { if (state.civs[id] && state.civs[id].agenda) taken[state.civs[id].agenda] = 1; });
        AI_SIDES.forEach(function (id) {
          var cv = state.civs[id];
          if (!cv || cv.agenda) return;
          var pool = AGENDA_ORDER.filter(function (a) { return !taken[a]; });
          var pick = (pool.length ? pool : AGENDA_ORDER)[Math.floor(rnd() * (pool.length ? pool.length : AGENDA_ORDER.length))];
          cv.agenda = pick; taken[pick] = 1;
        });
      })();
      // Backfill AI personalities — old saves get random ones
      AI_SIDES.forEach(function (id) {
        if (state.civs[id] && !state.civs[id].personality) {
          var pool = PERSONALITY_ORDER.slice();
          // Avoid duplicating the other AI's personality if it already has one
          AI_SIDES.forEach(function (oid) {
            if (oid !== id && state.civs[oid] && state.civs[oid].personality) {
              var idx = pool.indexOf(state.civs[oid].personality);
              if (idx >= 0) pool.splice(idx, 1);
            }
          });
          state.civs[id].personality = pool[Math.floor(Math.random() * pool.length)];
        }
        // Tension maps for the dynamic-grievance system
        if (state.civs[id]) {
          if (!state.civs[id].tension) state.civs[id].tension = {};
          if (!state.civs[id].tensionBand) state.civs[id].tensionBand = {};
        }
      });
      // Backfill unit promo/kills fields from older saves
      CIV_SIDES.concat(['barb','cs']).forEach(function (id) {
        (state.civs[id].units || []).forEach(function (u) {
          if (u.kills === undefined) u.kills = 0;
          if (u.promoAtk === undefined) u.promoAtk = 0;
          if (u.promoDef === undefined) u.promoDef = 0;
          if (u.promoHp === undefined) u.promoHp = 0;
          if (u.promos === undefined) u.promos = (u.promoAtk || 0) + (u.promoDef || 0) + (u.promoHp || 0);
          if (u.pendingPromo === undefined) u.pendingPromo = 0;
        });
      });
      // restore unit refs on tiles
      for (var r = 0; r < MAP_H; r++)
        for (var c = 0; c < MAP_W; c++) state.map[r][c].unit = null;
      CIV_SIDES.concat(['barb','cs']).forEach(function (id) {
        (state.civs[id].units || []).forEach(function (u) {
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
    CIV_SIDES.forEach(function (id) {
      (state.civs[id].cities || []).forEach(function (ct) { all.push(ct); });
    });
    // City-states also claim their hex (always pop 1 = range 1) so neighbours can't
    // build improvements on the city-state tile.
    if (state.civs.cs) state.civs.cs.cities.forEach(function (ct) { all.push(ct); });

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

    // Tally each civ's strategic resources — the count of owned tiles bearing
    // each resource. Production soft-gates units whose `requires` resource a
    // civ doesn't yet control (e.g. Tank needs Oil, Infantry needs Iron).
    CIV_SIDES.forEach(function (id) { state.civs[id].resources = {}; });
    for (var rr = 0; rr < MAP_H; rr++) {
      for (var cc = 0; cc < MAP_W; cc++) {
        var tt = state.map[rr][cc];
        if (!tt.owner || !tt.resource) continue;
        var res = state.civs[tt.owner] && state.civs[tt.owner].resources;
        if (res) res[tt.resource] = (res[tt.resource] || 0) + 1;
      }
    }
  }

  // Soft strategic-resource check: a civ can build a `requires` unit once it
  // controls at least one tile bearing that resource.
  function civHasResource(civ, res) {
    return !res || !!(civ.resources && civ.resources[res] > 0);
  }

  // Resolve a civ argument that may be either a civ object or a side-id string.
  function asCiv(c) { return (c && typeof c === 'object') ? c : (c ? (state.civs && state.civs[c]) : null); }
  // The set of DISTINCT luxuries a civ enjoys — owned (civ.resources, tallied in
  // recomputeBorders) plus any imported via a luxury swap (civ.tradedLux).
  function luxurySet(civ) {
    civ = asCiv(civ);
    var seen = {};
    if (!civ) return seen;
    var res = civ.resources || {};
    for (var k in res) { if (res[k] > 0 && RESOURCES[k] && RESOURCES[k].luxury) seen[k] = 1; }
    var tr = civ.tradedLux || {};
    for (var t in tr) { if (tr[t] && RESOURCES[t] && RESOURCES[t].luxury) seen[t] = 1; }
    return seen;
  }
  // Count of distinct luxuries — folds into empire-wide contentment (cityUnrestDelta).
  function distinctLuxuries(civ) { return Object.keys(luxurySet(civ)).length; }
  // Luxuries `civ` owns on the map that `partner` does NOT yet enjoy — the pool
  // it could hand over in a swap (importing one never reduces the giver's own).
  function giftableLuxuries(civ, partner) {
    civ = asCiv(civ);
    var out = [], res = (civ && civ.resources) || {}, has = luxurySet(partner);
    for (var k in res) {
      if (res[k] > 0 && RESOURCES[k] && RESOURCES[k].luxury && !has[k]) out.push(k);
    }
    return out;
  }
  // A mutually-beneficial luxury pair for two civs, or null. { give, get }
  // from the perspective of `civ` (give→partner, get←partner).
  function luxurySwapDeal(civ, partner) {
    var mine = giftableLuxuries(civ, partner);
    var theirs = giftableLuxuries(partner, civ);
    if (!mine.length || !theirs.length) return null;
    return { give: mine[0], get: theirs[0] };
  }

  // =====================================================================
  // VISIBILITY (fog of war)
  // =====================================================================
  function recomputeVisibility(civId) {
    for (var r = 0; r < MAP_H; r++)
      for (var c = 0; c < MAP_W; c++) state.map[r][c].visible[civId] = false;
    var civ = state.civs[civId];
    // Only scan a small bounding box around the source rather than the whole
    // map — matters on the bigger map sizes where the full-map scan per unit
    // got expensive. Rows can't be farther than `range`; columns are padded by
    // an extra `range` to cover the offset-hex skew, and the hexDist check
    // below still filters precisely so the result is identical.
    function reveal(c, r, range) {
      var r0 = Math.max(0, r - range), r1 = Math.min(MAP_H - 1, r + range);
      var c0 = Math.max(0, c - range * 2), c1 = Math.min(MAP_W - 1, c + range * 2);
      for (var rr = r0; rr <= r1; rr++)
        for (var cc = c0; cc <= c1; cc++) {
          if (hexDist([cc, rr], [c, r]) <= range) {
            state.map[rr][cc].visible[civId] = true;
            state.map[rr][cc].explored[civId] = true;
          }
        }
    }
    var sight = 2 + factionEff(civ, 'vision');   // Umbra sees one hex further
    civ.units.forEach(function (u) { reveal(u.c, u.r, sight); });
    civ.cities.forEach(function (ct) { reveal(ct.c, ct.r, sight); });
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
    // Always allow some overscroll past the map edges so the world doesn't
    // feel walled-in. Scroll mode gets a bigger buffer so panning never
    // jams hard against the edge; cursor mode gets enough padding that the
    // unit at a corner isn't pinned against the screen border.
    var pad = (state && state.mode === 'scroll')
      ? Math.max(280, VIEW_W * 0.6)
      : Math.max(120, VIEW_W * 0.25);
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
  // COMBAT ANIMATIONS
  // =====================================================================
  // Lightweight overlay queue — each entry draws for a few frames then dies.
  var combatFx = [];    // [{ type, c, r, data, startMs, durationMs }]

  function addFx(type, c, r, data, durationMs, delayMs) {
    combatFx.push({ type: type, c: c, r: r, data: data || {}, start: Date.now() + (delayMs || 0), dur: durationMs || 600 });
  }

  // ---- Civic "yield pop" feedback ----------------------------------------
  // Pop growth / buildings / wonders give the weakest feedback (log text). We
  // collect them per turn and flush a STAGGERED floating-number cascade so the
  // turn rollover feels alive. Only the player's own cities pop (no fog spoilers).
  var yieldFxQueue = [];
  function queueYieldFx(c, r, text, color, flashColor) {
    yieldFxQueue.push({ c: c, r: r, text: text, color: color, flash: flashColor || null });
  }
  function flushYieldFx() {
    if (!yieldFxQueue.length) return;
    var base = 140;            // let the turn settle before the cascade starts
    yieldFxQueue.forEach(function (e, i) {
      var d = base + i * 200;  // staggered so multiple cities read one-by-one
      if (e.flash) addFx('hexFlash', e.c, e.r, { color: e.flash }, 520, d);
      addFx('floatNum', e.c, e.r, { text: e.text, color: e.color }, 1050, d);
    });
    yieldFxQueue = [];
  }
  function addCombatFx(defC, defR, dmgToDef, dmgToAtk, atkC, atkR) {
    // Hex flash on defender
    addFx('hexFlash', defC, defR, { color: 'rgba(255,80,80,0.45)' }, 350);
    // Floating damage on defender
    addFx('floatNum', defC, defR, { text: '-' + dmgToDef, color: '#ff4466' }, 900);
    // Counter-damage on attacker (if any)
    if (dmgToAtk > 0 && atkC != null) {
      addFx('floatNum', atkC, atkR, { text: '-' + dmgToAtk, color: '#ffaa44' }, 900);
    }
    // Screen shake
    addFx('shake', 0, 0, { intensity: Math.min(6, 2 + dmgToDef * 0.3) }, 300);
  }
  function addRangedFx(defC, defR, dmg) {
    addFx('hexFlash', defC, defR, { color: 'rgba(255,180,60,0.45)' }, 350);
    addFx('floatNum', defC, defR, { text: '-' + dmg, color: '#ffcc44' }, 900);
    addFx('shake', 0, 0, { intensity: 2 }, 200);
  }
  function addCityBombardFx(defC, defR, dmg) {
    addFx('hexFlash', defC, defR, { color: 'rgba(255,120,40,0.40)' }, 300);
    addFx('floatNum', defC, defR, { text: '-' + dmg, color: '#ff8844' }, 800);
  }

  // Returns current shake offset { x, y } for the frame
  function getShakeOffset() {
    var ox = 0, oy = 0;
    for (var i = 0; i < combatFx.length; i++) {
      var fx = combatFx[i];
      if (fx.type !== 'shake') continue;
      var t = (Date.now() - fx.start) / fx.dur;
      if (t >= 1) continue;
      var decay = 1 - t;
      if (t < 0) continue;   // delayed FX not started yet
      var inten = fx.data.intensity * decay;
      ox += (Math.random() * 2 - 1) * inten;
      oy += (Math.random() * 2 - 1) * inten;
    }
    return { x: ox, y: oy };
  }

  // Draw all active FX overlays on top of the map
  function drawCombatFx(size) {
    var now = Date.now();
    for (var i = combatFx.length - 1; i >= 0; i--) {
      var fx = combatFx[i];
      var t = (now - fx.start) / fx.dur;
      if (t >= 1) { combatFx.splice(i, 1); continue; }
      if (t < 0) continue;   // delayed FX (staggered cascade) — not started yet

      if (fx.type === 'hexFlash') {
        var p = pixelOf(fx.c, fx.r, size);
        var cx = p.x - state.camera.x + size * SQRT3 / 2;
        var cy = p.y - state.camera.y + size;
        var inset = size * 0.92;
        var alpha = (1 - t) * 0.8;
        hexPath(cx, cy, inset);
        var rgb = fx.data.color.replace(/[\d.]+\)$/, alpha + ')');
        ctx.fillStyle = rgb;
        ctx.fill();
      } else if (fx.type === 'floatNum') {
        var p = pixelOf(fx.c, fx.r, size);
        var cx = p.x - state.camera.x + size * SQRT3 / 2;
        var cy = p.y - state.camera.y + size;
        var yOff = -t * size * 0.8;  // float upward
        var alpha = Math.max(0, 1 - t * 1.2);
        ctx.font = 'bold ' + Math.max(12, Math.round(size * 0.4)) + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Dark outline for readability
        ctx.fillStyle = 'rgba(0,0,0,' + (alpha * 0.8) + ')';
        ctx.fillText(fx.data.text, cx + 1, cy + yOff + 1);
        ctx.fillStyle = fx.data.color;
        ctx.globalAlpha = alpha;
        ctx.fillText(fx.data.text, cx, cy + yOff);
        ctx.globalAlpha = 1;
      }
      // 'shake' handled in getShakeOffset, not drawn here
    }
    // Schedule redraw if any FX still active
    if (combatFx.length > 0) {
      requestAnimationFrame(function () { draw(); });
    }
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

  // Subtle inner bevel — light from the top-left, shadow on the lower-right —
  // to give each tile a touch of depth without a harsh outline. Clipped to hex.
  function drawHexBevel(cx, cy, size, terrain) {
    var darkA = 0.26, lightA = 0.10;
    if (terrain === 'forest' || terrain === 'volcano') { darkA = 0.20; lightA = 0.13; }
    function corner(k) { var a = Math.PI / 180 * (60 * k - 30); return [cx + size * Math.cos(a), cy + size * Math.sin(a)]; }
    ctx.lineWidth = 1;
    function edge(k, col) {
      var p = corner(k), q = corner((k + 1) % 6);
      ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    }
    edge(3, 'rgba(255,255,255,' + lightA + ')');     // upper-left + top edges: lit
    edge(4, 'rgba(255,255,255,' + lightA + ')');
    edge(5, 'rgba(255,255,255,' + lightA + ')');
    edge(0, 'rgba(0,0,0,' + darkA + ')');            // right + lower edges: shadow
    edge(1, 'rgba(0,0,0,' + darkA + ')');
    edge(2, 'rgba(0,0,0,' + darkA + ')');
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
      // Lush field — upright grass blades (dark base + lit tip) + occasional bloom
      for (var i = 0; i < 4; i++) {
        var x = (rng() - 0.5) * size * 1.0;
        var y = (rng() - 0.5) * size * 0.8;
        ctx.fillStyle = '#2c5a2a'; ctx.fillRect(cx + x, cy + y, px, px * 2);
        ctx.fillStyle = '#82c264'; ctx.fillRect(cx + x, cy + y - px, px, px);
      }
      if (size >= 34 && rng() < 0.34) {
        ctx.fillStyle = '#d9e36b';
        ctx.fillRect(cx + (rng() - 0.5) * size * 0.7, cy + (rng() - 0.5) * size * 0.6, px, px);
      }
    } else if (terrain === 'plains') {
      // Wind-combed dry grassland — horizontal golden rows + a low furrow
      for (var i = 0; i < 3; i++) {
        var ry = -size * 0.26 + i * size * 0.26;
        var rx = (rng() - 0.5) * size * 0.3;
        var rw = size * (0.34 + rng() * 0.18);
        ctx.fillStyle = '#e8cf7a';
        ctx.fillRect(cx + rx - rw / 2, cy + ry, rw, Math.max(1, px * 0.8));
        ctx.fillStyle = '#8a6f2c';                     // a darker break in the row
        ctx.fillRect(cx + rx - rw / 2 + rw * 0.55, cy + ry, rw * 0.18, Math.max(1, px * 0.8));
      }
      ctx.fillStyle = '#6b541f';
      ctx.fillRect(cx - size * 0.30, cy + size * 0.30, size * 0.6, Math.max(1, px * 0.7));
    } else if (terrain === 'forest') {
      // Clustered conifer crowns over a deep-green floor
      var nTrees = 3 + Math.floor(rng() * 2);
      var positions = [];
      for (var i = 0; i < nTrees; i++) {
        positions.push([(rng() - 0.5) * size * 0.95, (rng() - 0.4) * size * 0.7]);
      }
      positions.sort(function (a, b) { return a[1] - b[1]; });
      for (var i = 0; i < positions.length; i++) {
        tree(positions[i][0], positions[i][1], '#173d22', '#2c6234', '#4f8a4a');
      }
    } else if (terrain === 'hills') {
      // Rolling grassy hills — overlapping rounded mounds, each an earthy dome
      // with a sunlit left slope and a green grassy crown.
      var mounds = [[-size * 0.30, size * 0.20, 1.0], [size * 0.22, size * 0.05, 1.2], [size * 0.42, size * 0.24, 0.78]];
      mounds.sort(function (a, b) { return a[1] - b[1]; });   // far (higher) drawn first
      for (var i = 0; i < mounds.length; i++) {
        var mx = cx + mounds[i][0], my = cy + mounds[i][1], sc = mounds[i][2];
        var mw = size * 0.36 * sc, mh = size * 0.30 * sc;
        ctx.fillStyle = 'rgba(0,0,0,0.16)';                    // cast shadow
        ctx.beginPath(); ctx.ellipse(mx + mw * 0.12, my + 1, mw, mh * 0.20, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6f5328';                             // shaded earthy dome
        ctx.beginPath(); ctx.ellipse(mx, my, mw, mh, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a9823f';                             // sunlit slope (upper-left)
        ctx.beginPath(); ctx.ellipse(mx - mw * 0.18, my, mw * 0.74, mh * 0.92, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4d8838';                             // green grassy crown
        ctx.beginPath(); ctx.ellipse(mx, my - mh * 0.12, mw * 0.82, mh * 0.64, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#79c054';                             // lit grass highlight
        ctx.beginPath(); ctx.ellipse(mx - mw * 0.22, my - mh * 0.18, mw * 0.40, mh * 0.32, 0, Math.PI, Math.PI * 2); ctx.fill();
        if (size >= 30) {                                      // grass flecks so crowns aren't smooth bubbles
          ctx.fillStyle = '#356627';
          ctx.fillRect(mx - mw * 0.04, my - mh * 0.44, px, px);
          ctx.fillRect(mx + mw * 0.30, my - mh * 0.22, px, px);
        }
      }
    } else if (terrain === 'mountain') {
      // A craggy massif: a receding back peak, a tall main peak split into a
      // sunlit and a shadowed face along the ridgeline, topped with a jagged
      // snow cap and snow gullies — reads as a real mountain, not a grey blob.
      var footY = cy + size * 0.46;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';                       // base shadow
      ctx.beginPath(); ctx.ellipse(cx, footY, size * 0.52, size * 0.11, 0, 0, Math.PI * 2); ctx.fill();

      function peak(apexX, apexY, halfW, lit, shadow, snowFrac, snow, snowShade) {
        var ax = cx + apexX, ay = cy + apexY;
        var Lx = cx + apexX - halfW, Rx = cx + apexX + halfW;
        var Fx = cx + apexX + halfW * 0.10;                     // ridge foot, near centre
        ctx.fillStyle = shadow;                                 // right (shadow) face
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(Fx, footY); ctx.lineTo(Rx, footY); ctx.closePath(); ctx.fill();
        ctx.fillStyle = lit;                                    // left (sunlit) face
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(Lx, footY); ctx.lineTo(Fx, footY); ctx.closePath(); ctx.fill();
        if (snowFrac > 0) {
          var sy = ay + (footY - ay) * snowFrac;                // snowline
          var hw = halfW * snowFrac;                            // half-width at snowline
          ctx.fillStyle = snow;                                 // jagged snow cap
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - hw, sy);
          ctx.lineTo(ax - hw * 0.45, sy - hw * 0.32);
          ctx.lineTo(ax - hw * 0.12, sy + hw * 0.20);
          ctx.lineTo(ax + hw * 0.22, sy - hw * 0.30);
          ctx.lineTo(ax + hw * 0.55, sy + hw * 0.16);
          ctx.lineTo(ax + hw, sy);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = snowShade;                            // shadowed side of the cap
          ctx.beginPath();
          ctx.moveTo(ax, ay); ctx.lineTo(ax + hw, sy); ctx.lineTo(ax + hw * 0.2, sy); ctx.closePath(); ctx.fill();
        }
      }
      // back peaks (recede — darker, smaller) give the massif a range silhouette
      peak(-size * 0.36, -size * 0.06, size * 0.26, '#56525f', '#37343f', 0.30, '#d6dbe6', '#aab3c6');
      peak(size * 0.30, -size * 0.14, size * 0.30, '#625e6b', '#3d3a45', 0.32, '#dfe4ee', '#b3bccd');
      // main peak (front, tallest) with a generous snow cap
      peak(-size * 0.08, -size * 0.50, size * 0.46, '#9b98a7', '#4c4854', 0.48, '#f3f6fb', '#c0c8d9');
      // rock striations on the lit face + snow gullies on the shadow face
      if (size >= 24) {
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(38,34,46,0.45)'; ctx.lineWidth = Math.max(1, px * 0.5);
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.20, cy + size * 0.06); ctx.lineTo(cx - size * 0.12, cy - size * 0.16);
        ctx.moveTo(cx - size * 0.10, cy + size * 0.16); ctx.lineTo(cx - size * 0.04, cy - size * 0.06);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(228,234,245,0.75)'; ctx.lineWidth = Math.max(1, px * 0.5);
        ctx.beginPath();
        ctx.moveTo(cx + size * 0.00, cy - size * 0.18); ctx.lineTo(cx + size * 0.03, cy + size * 0.12);
        ctx.moveTo(cx + size * 0.12, cy - size * 0.12); ctx.lineTo(cx + size * 0.09, cy + size * 0.14);
        ctx.stroke();
      }
    } else if (terrain === 'tundra') {
      // Pale snowfield: soft shadowed drifts, cold grey rocks, frost cracks
      var rng2 = tileRng(c, r);
      for (var i = 0; i < 3; i++) {
        var sx = (rng2() - 0.5) * size * 1.0;
        var sy = (rng2() - 0.5) * size * 0.8;
        var ss = size * (0.16 + rng2() * 0.12);
        ctx.fillStyle = 'rgba(143,163,178,0.45)';
        ctx.beginPath(); ctx.ellipse(cx + sx, cy + sy, ss, ss * 0.42, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(244,248,251,0.75)';
        ctx.beginPath(); ctx.ellipse(cx + sx - 1, cy + sy - ss * 0.3, ss * 0.55, ss * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (var i = 0; i < 3; i++) {
        ctx.fillStyle = '#6f7d86';
        ctx.fillRect(cx + (rng2() - 0.5) * size * 0.9, cy + (rng2() - 0.5) * size * 0.7, px, px);
      }
      if (size >= 34) {
        ctx.strokeStyle = 'rgba(244,248,251,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.2, cy + size * 0.1);
        ctx.lineTo(cx + size * 0.04, cy - size * 0.05);
        ctx.lineTo(cx + size * 0.24, cy + size * 0.12);
        ctx.stroke();
      }
    } else if (terrain === 'desert') {
      // Sunlit dunes: shaded underside + bright crest, a couple of pebbles
      for (var i = 0; i < 3; i++) {
        var dx = -size * 0.36 + i * size * 0.34;
        var dy = (i % 2 ? 0.14 : -0.08) * size;
        ctx.fillStyle = '#a8813a';
        ctx.beginPath(); ctx.ellipse(cx + dx, cy + dy + 1, size * 0.26, size * 0.09, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#f2dd9c';
        ctx.beginPath(); ctx.ellipse(cx + dx, cy + dy, size * 0.26, size * 0.07, 0, Math.PI, Math.PI * 2); ctx.fill();
      }
      if (size >= 34) {
        for (var i = 0; i < 2; i++) {
          ctx.fillStyle = '#8a6a30';
          ctx.fillRect(cx + (rng() - 0.5) * size * 0.9, cy + (rng() - 0.3) * size * 0.7, px, px);
        }
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
      // Depth: dark centre fading to a lighter shallow edge
      var wg = ctx.createRadialGradient(cx, cy, size * 0.15, cx, cy, size * 1.05);
      wg.addColorStop(0, '#06182f');
      wg.addColorStop(0.6, '#0c2f5c');
      wg.addColorStop(1, '#16487a');
      ctx.fillStyle = wg;
      ctx.fillRect(cx - size, cy - size, size * 2, size * 2);

      // Coastline foam on edges shared with land
      var nsW = neighborsAll(c, r);
      var coast = false;
      ctx.lineCap = 'round';
      for (var ei = 0; ei < 6; ei++) {
        if (!nsW[ei]) continue;
        var ntW = state.map[nsW[ei][1]][nsW[ei][0]];
        if (ntW.terrain === 'water') continue;
        coast = true;
        var edgeIdx = [0, 3, 5, 4, 1, 2][ei];           // neighbor dir -> hex edge
        var a1 = Math.PI / 180 * (60 * edgeIdx - 30);
        var a2 = Math.PI / 180 * (60 * (edgeIdx + 1) - 30);
        var rad = size * 0.9;
        var x1 = cx + rad * Math.cos(a1), y1 = cy + rad * Math.sin(a1);
        var x2 = cx + rad * Math.cos(a2), y2 = cy + rad * Math.sin(a2);
        ctx.strokeStyle = 'rgba(207,234,245,' + (0.45 + rng() * 0.15).toFixed(2) + ')';
        ctx.lineWidth = Math.max(1.2, size * 0.07);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        var ix1 = x1 + (cx - x1) * 0.10, iy1 = y1 + (cy - y1) * 0.10;
        var ix2 = x2 + (cx - x2) * 0.10, iy2 = y2 + (cy - y2) * 0.10;
        ctx.strokeStyle = 'rgba(150,195,225,0.26)';
        ctx.lineWidth = Math.max(1, size * 0.10);
        ctx.beginPath(); ctx.moveTo(ix1, iy1); ctx.lineTo(ix2, iy2); ctx.stroke();
      }

      // Gentle wave dashes
      ctx.strokeStyle = coast ? 'rgba(120,170,220,0.22)' : 'rgba(120,170,220,0.18)';
      ctx.lineWidth = Math.max(1, size * 0.04);
      for (var i = 0; i < 3; i++) {
        var wy = -size * 0.28 + i * size * 0.26 + (rng() - 0.5) * size * 0.06;
        var wx = (rng() - 0.5) * size * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx - size * 0.34 + wx, cy + wy);
        ctx.quadraticCurveTo(cx + wx, cy + wy - size * 0.06, cx + size * 0.34 + wx, cy + wy);
        ctx.stroke();
      }
      ctx.lineCap = 'butt'; ctx.lineWidth = 1;
    }
  }

  // Draw a meandering cyan stream across a river tile. We choose 2 of the 6
  // edges as the entry/exit based on which neighbors are also river/water tiles,
  // so connected rivers actually look continuous.
  function drawRiverOnTile(cx, cy, size, c, r) {
    var ns = neighborsAll(c, r);
    var anchors = [];
    for (var i = 0; i < 6; i++) {
      if (!ns[i]) continue;
      var nt = state.map[ns[i][1]][ns[i][0]];
      if (!nt.river && nt.terrain !== 'water') continue;
      // Use the midpoint of edge between vertex i and vertex (i+1) in our hex
      // pointy-top hex vertices are at angles -30 + 60*i degrees
      // neighbors[] order maps to edges by EDGE_TO_NEIGHBOR — invert:
      // edge 0 -> neighbor 0 (E); edge 1 -> 4 (SE); edge 2 -> 5 (SW); edge 3 -> 1 (W); edge 4 -> 3 (NW); edge 5 -> 2 (NE)
      var edgeIdx = [0, 3, 5, 4, 1, 2][i]; // inverse of EDGE_TO_NEIGHBOR
      var ang1 = Math.PI / 180 * (60 * edgeIdx - 30);
      var ang2 = Math.PI / 180 * (60 * (edgeIdx + 1) - 30);
      var rad = size * 0.82;
      var mx = cx + rad * (Math.cos(ang1) + Math.cos(ang2)) / 2;
      var my = cy + rad * (Math.sin(ang1) + Math.sin(ang2)) / 2;
      anchors.push([mx, my]);
    }
    if (anchors.length < 2) {
      // headwater spring — small pond
      ctx.fillStyle = '#1a5c7a';
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.05, size * 0.10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7ce5ff';
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.04, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    // Pick first two anchors (rivers can fork, but two is fine visually)
    var a = anchors[0], b = anchors[1 % anchors.length];
    if (anchors.length > 2) b = anchors[Math.floor(anchors.length / 2)];
    // Deterministic wiggle so rivers don't shimmer across frames and don't
    // perturb the global RNG (which seeds tile decals etc.)
    var wiggle = (((c * 73856093) ^ (r * 19349663)) >>> 0) % 1000 / 1000 - 0.5;
    // Dark blue casing
    ctx.strokeStyle = '#0a2a52';
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(cx + wiggle * size * 0.2, cy + size * 0.05, b[0], b[1]);
    ctx.stroke();
    // Bright water body
    ctx.strokeStyle = '#2a6cb0';
    ctx.lineWidth = Math.max(2, size * 0.11);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(cx, cy + size * 0.05, b[0], b[1]);
    ctx.stroke();
    // Sparkle highlight
    ctx.strokeStyle = '#7fc2e8';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.beginPath();
    ctx.moveTo(a[0] + 1, a[1] - 1);
    ctx.quadraticCurveTo(cx + 1, cy + size * 0.04, b[0] + 1, b[1] - 1);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  var RES_RIM = {
    wheat: '#e8b830', cattle: '#e0d8cc', horses: '#caa46a', fish: '#5fc8d8',
    iron: '#9aa6b2', copper: '#d07a3a', gold: '#ffd84a', gems: '#b06cff',
    oil: '#caa86a', coal: '#8a929c'
  };
  function drawResourceMarker(cx, cy, size, kind) {
    var res = RESOURCES[kind];
    if (!res) return;
    var x = cx, y = cy - size * 0.26;
    var r = size * 0.30;
    var rim = RES_RIM[kind] || res.accent;
    var lod = size >= 34;
    // Badge: drop shadow, dark disc, accent rim — so any icon reads on any biome
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.16, r, r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0c0f14';
    ctx.beginPath(); ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2); ctx.fill();
    var rw = Math.max(1.2, size * 0.05);
    ctx.lineWidth = rw; ctx.strokeStyle = rim;
    ctx.beginPath(); ctx.ellipse(x, y, r - rw * 0.5, r - rw * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    if (size >= 48) {                                   // top-left sheen
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = rw;
      ctx.beginPath(); ctx.arc(x, y, r - rw, Math.PI * 1.05, Math.PI * 1.62); ctx.stroke();
    }
    // Pixel helper: icon-units from badge center, u px per unit (disc r = 5 units)
    var u = r / 5;
    function P(a, b, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(x + a * u, y + b * u, w * u, h * u);
    }
    ctx.lineWidth = 1;
    switch (kind) {
      case 'wheat':  riWheat(P, lod); break;
      case 'cattle': riCattle(P, lod); break;
      case 'horses': riHorse(P, lod); break;
      case 'fish':   riFish(P, lod); break;
      case 'iron':   riIron(P, lod); break;
      case 'copper': riCopper(P, lod); break;
      case 'gold':   riGold(P, lod); break;
      case 'gems':   riGems(P, lod); break;
      case 'oil':    riOil(P, lod); break;
      case 'coal':   riCoal(P, lod); break;
    }
  }

  function riOil(P, lod) {
    // A glossy black oil drop with a bright sheen so it reads on the dark badge.
    var D = '#241f16', BLK = '#0f0d09', HI = '#d8b878';
    P(-0.5, -2.4, 1, 1, D);                 // tip
    P(-1.5, -1.4, 3, 1.6, D);
    P(-2.2, 0, 4.4, 2, D);                  // body
    P(-1.6, 1.6, 3.2, 1, D);                // base
    P(-1.4, -0.6, 2.4, 1.6, BLK);           // dark core
    P(-1.2, -0.4, 0.9, 1, HI);              // sheen
  }
  function riCoal(P, lod) {
    // A chunky coal lump cluster with lit top facets.
    var D = '#22262c', M = '#3a414a', HI = '#9aa4ae';
    P(-2.2, -0.6, 2.2, 2.4, D);
    P(0, 0, 2.2, 2, D);
    P(-1.2, -1.8, 2.2, 1.8, M);
    P(-2, -0.6, 2, 0.6, HI);                // lit top-left
    P(-0.8, -1.8, 1.6, 0.5, HI);            // lit top
  }

  function riWheat(P, lod) {
    var OUT = '#5a3c0a', stalk = '#caa030', gDk = '#d8a426', gMid = '#f2c84a', HI = '#fff2c0';
    P(-0.5, -1, 1, 4, stalk);
    P(-2.3, 0, 1, 3, stalk);
    P(1.3, 0, 1, 3, stalk);
    P(-2, 2.7, 4, 0.9, OUT);                       // tie band
    function head(hx, hy) {
      P(hx - 0.5, hy - 2, 1, 1, gDk);
      P(hx - 1.4, hy - 1, 1, 1, gDk); P(hx - 0.4, hy - 1, 0.9, 1, gMid); P(hx + 0.6, hy - 1, 1, 1, gDk);
      P(hx - 0.5, hy, 1, 1, gDk);
    }
    head(0, -1.4); head(-2, 0.3); head(2, 0.3);
    if (lod) P(-0.4, -3, 0.8, 0.8, HI);
  }

  function riCattle(P, lod) {
    var OUT = '#1a1410', body = '#efe7da', spot = '#6b4a2c', horn = '#d8c8a0', muz = '#d99a9a';
    P(-4, -1.5, 7, 1, OUT); P(-4, -0.5, 7, 3, body); P(-4, 2.5, 7, 1, OUT);
    P(-3, 2.5, 1, 2, OUT); P(2, 2.5, 1, 2, OUT);   // legs
    P(3, -1.5, 2.5, 1, OUT); P(3, -0.5, 2.5, 2.5, body); P(3, 2, 2.5, 1, OUT);   // head
    P(5, -0.2, 0.8, 1, muz);                        // muzzle
    P(4, -0.2, 0.8, 0.8, OUT);                      // eye
    P(3, -2.4, 0.8, 0.9, horn); P(4.2, -2.4, 0.8, 0.9, horn);
    P(-2.5, 0.4, 2, 1.4, spot);                     // hide spot
    if (lod) P(-3.5, -0.3, 0.8, 0.8, '#fff');
  }

  function riHorse(P, lod) {
    var body = '#8a5a30', shade = '#5e3a1c', mane = '#1f130a', HI = '#c89058', eye = '#0c0a08';
    P(-0.2, -3.6, 1, 1.1, body);                    // ear
    P(-1, -2.6, 2.6, 1.2, body);                    // forehead
    P(-1.4, -1.6, 3.4, 1.6, body);                  // head/face
    P(1.8, -1.1, 1.8, 1.3, body);                   // snout (points right)
    P(3.2, -0.5, 0.6, 0.7, shade);                  // nostril
    P(-1.6, 0.2, 2.6, 1.2, body);                   // cheek / jaw
    P(-2.8, 1.2, 2.6, 2.2, body);                   // upper neck
    P(-3.8, 2.8, 2, 1.6, shade);                    // lower neck (shaded)
    P(-1.2, -2, 1, 1.2, mane); P(-2.2, -0.4, 1, 1.4, mane); P(-3.2, 1.2, 1, 1.6, mane);  // mane
    P(0.4, -1.1, 0.9, 0.9, eye);                    // eye
    if (lod) P(2.6, -0.8, 0.7, 0.7, HI);            // muzzle glint
  }

  function riFish(P, lod) {
    var OUT = '#0a2a34', body = '#3fa9c4', belly = '#bfeaf0', fin = '#2f7e96', HI = '#eafdff';
    P(-2, -1.5, 6, 1, OUT); P(-2, -0.5, 6, 2.5, body); P(-2, 2, 6, 1, OUT);
    P(-1.5, 1.4, 5, 0.9, belly);
    P(-4, -1.5, 1, 1, OUT); P(-4, -0.5, 1, 2.5, fin); P(-4, 2, 1, 1, OUT); P(-3.2, 0.3, 1, 1.4, fin); // tail
    P(0, -2.6, 2.4, 1.1, fin);                      // dorsal fin
    P(2.2, -0.4, 1, 1, '#fff'); P(2.7, -0.1, 0.6, 0.6, OUT);   // eye
    if (lod) P(0, -0.4, 1, 1, HI);
  }

  function riIron(P, lod) {
    var OUT = '#15191e', R1 = '#4a525c', R2 = '#6b7682', R3 = '#98a4b0', HI = '#ffffff';
    P(-2.5, -1.5, 5, 1, OUT);
    P(-3.5, -0.5, 7, 1, OUT);
    P(-3.5, 0.5, 7, 2, R1);
    P(-3.5, 2.5, 7, 1, OUT);
    P(-2.5, -0.5, 5, 1, R2);
    P(0, 0.5, 3.5, 2, R2);
    P(1.2, -0.5, 2.3, 1, R3);
    if (lod) { P(2, -0.2, 0.8, 0.8, HI); P(-3.5, -1.4, 1, 1, R2); }
  }

  function riCopper(P, lod) {
    var OUT = '#1e120a', C1 = '#8a4a22', C2 = '#c06a30', C3 = '#e89048', VG = '#3aa888', HI = '#ffe2c0';
    P(-2.5, -1.5, 5, 1, OUT);
    P(-3.5, -0.5, 7, 1, OUT);
    P(-3.5, 0.5, 7, 2, C1);
    P(-3.5, 2.5, 7, 1, OUT);
    P(-2.5, -0.5, 5, 1, C2);
    P(0, 0.5, 3.5, 2, C3);
    if (lod) { P(2, -1.4, 0.8, 0.8, VG); P(-1.4, 1, 0.8, 0.8, VG); P(1.6, -0.2, 0.7, 0.7, HI); }
  }

  function riGold(P, lod) {
    var OUT = '#4a3208', G1 = '#b8860a', G2 = '#f0c020', G3 = '#ffe66a', HI = '#ffffff';
    P(-4, 2.4, 8, 1, OUT); P(-4, 1.4, 8, 1, G2); P(2, 1.9, 2, 1, G1); P(-3.4, 1.4, 1, 1, G3);   // bottom coin
    P(-3, 0.2, 6, 1, OUT); P(-3, -0.8, 6, 1, G2); P(1.4, -0.3, 2, 1, G1); P(-2.4, -0.8, 1, 1, G3); // top coin
    P(-1, -2.6, 3, 1, OUT); P(-1, -1.8, 3, 1, G2);   // nugget
    if (lod) { P(1.2, -2.4, 0.8, 0.8, HI); P(-2.4, -0.8, 0.6, 0.6, HI); }
  }

  function riGems(P, lod) {
    var OUT = '#1a0f28', X1 = '#6a32b0', X2 = '#9a5cf0', X3 = '#c89cff', TL = '#3fd8d0', HI = '#ffffff';
    P(-0.6, -3.6, 1.2, 1, X3);                      // center spire tip
    P(-1, -2.6, 1, 3, X1); P(0, -2.6, 1, 3, X2);
    P(-1.2, 0.4, 2.4, 1, OUT);
    P(-3.2, -0.8, 1, 1, TL); P(-3.2, 0.2, 2, 2, X1); P(-3.2, 2.2, 2, 1, OUT);   // left crystal (teal)
    P(2, -0.4, 1, 1, X3); P(2, 0.6, 2, 2, X2); P(2, 2.6, 2, 1, OUT);            // right crystal
    if (lod) P(1.4, -2, 0.7, 0.7, HI);
  }

  function drawImprovement(cx, cy, size, kind) {
    // At FAR zoom the detailed art is smaller than its own line weights and
    // reads as noise — swap to compact, high-contrast badges that stay legible.
    if (size <= 30) { drawImprovementCompact(cx, cy, size, kind); return; }
    if (kind === 'farm') drawFarmImprovement(cx, cy, size);
    else if (kind === 'mine') drawMineImprovement(cx, cy, size);
    else if (kind === 'pasture') drawPastureImprovement(cx, cy, size);
    else if (kind === 'lumber') drawLumberImprovement(cx, cy, size);
    else if (kind === 'quarry') drawQuarryImprovement(cx, cy, size);
    else if (kind === 'fishing_boats') drawFishingBoatsImprovement(cx, cy, size);
    else if (kind === 'oil_well') drawOilWellImprovement(cx, cy, size);
  }

  // Minimal one-glance badges for FAR zoom: a dark plate + one bold signature
  // shape per improvement, in its accent colour. No fine lines — everything is
  // at least 2px so it survives the additive display at 26px hexes.
  function drawImprovementCompact(cx, cy, size, kind) {
    var s = size * 0.46;                 // badge half-width
    var y = cy + size * 0.18;            // sit low in the hex, like the full art
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, y, s, s * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kind === 'farm') {               // three wheat stripes
      ctx.fillStyle = '#e8b858';
      ctx.fillRect(cx - s * 0.7, y - s * 0.36, s * 1.4, 2);
      ctx.fillRect(cx - s * 0.7, y - s * 0.02, s * 1.4, 2);
      ctx.fillRect(cx - s * 0.7, y + s * 0.32, s * 1.4, 2);
    } else if (kind === 'mine') {        // black arch on a grey mound
      ctx.fillStyle = '#8a8a96';
      ctx.beginPath();
      ctx.arc(cx, y + s * 0.3, s * 0.62, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(cx, y + s * 0.3, s * 0.30, Math.PI, 0);
      ctx.fill();
    } else if (kind === 'pasture') {     // fence: two posts + rail
      ctx.fillStyle = '#a06a2c';
      ctx.fillRect(cx - s * 0.5, y - s * 0.4, 2, s * 0.8);
      ctx.fillRect(cx + s * 0.5 - 2, y - s * 0.4, 2, s * 0.8);
      ctx.fillRect(cx - s * 0.6, y - s * 0.1, s * 1.2, 2);
    } else if (kind === 'lumber') {      // two stacked logs
      ctx.fillStyle = '#8a5a2c';
      ctx.fillRect(cx - s * 0.65, y - s * 0.28, s * 1.3, 3);
      ctx.fillRect(cx - s * 0.65, y + s * 0.10, s * 1.3, 3);
      ctx.fillStyle = '#5a3018';
      ctx.fillRect(cx - s * 0.65, y - s * 0.28, 3, 3);
      ctx.fillRect(cx - s * 0.65, y + s * 0.10, 3, 3);
    } else if (kind === 'quarry') {      // two pale blocks
      ctx.fillStyle = '#aeaeb6';
      ctx.fillRect(cx - s * 0.55, y - s * 0.30, s * 0.5, s * 0.5);
      ctx.fillRect(cx + s * 0.05, y - s * 0.05, s * 0.5, s * 0.5);
    } else if (kind === 'fishing_boats') { // boat hull + mast
      ctx.fillStyle = '#8a5a2c';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.6, y);
      ctx.lineTo(cx + s * 0.6, y);
      ctx.lineTo(cx + s * 0.35, y + s * 0.35);
      ctx.lineTo(cx - s * 0.35, y + s * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - 1, y - s * 0.5, 2, s * 0.5);
    } else if (kind === 'oil_well') {    // derrick triangle + crown
      ctx.strokeStyle = '#c8b088';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.45, y + s * 0.4);
      ctx.lineTo(cx, y - s * 0.5);
      ctx.lineTo(cx + s * 0.45, y + s * 0.4);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#101010';
      ctx.beginPath();
      ctx.ellipse(cx, y + s * 0.45, s * 0.4, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Oil derrick — lattice tower over a dark pool, style-matched to the other
  // hand-drawn improvements (previously oil wells had NO art and were invisible).
  function drawOilWellImprovement(cx, cy, size) {
    var h = size * 0.62, w = size * 0.55;
    var baseY = cy + size * 0.32;
    var px = Math.max(1, size / 18);
    // Oil pool at the base
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath();
    ctx.ellipse(cx, baseY, w * 0.75, size * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1c1c22';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 1, w * 0.55, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    // Derrick legs (tapered lattice tower)
    ctx.strokeStyle = '#2a1c10';
    ctx.lineWidth = px * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, baseY);
    ctx.lineTo(cx, baseY - h);
    ctx.moveTo(cx + w / 2, baseY);
    ctx.lineTo(cx, baseY - h);
    ctx.stroke();
    ctx.strokeStyle = '#7a5a2c';
    ctx.lineWidth = px * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + 1, baseY - 1);
    ctx.lineTo(cx, baseY - h + 1);
    ctx.moveTo(cx + w / 2 - 1, baseY - 1);
    ctx.lineTo(cx, baseY - h + 1);
    ctx.stroke();
    // Crossbars
    ctx.strokeStyle = '#5a3e1c';
    ctx.lineWidth = Math.max(1, px * 0.7);
    for (var i = 1; i <= 3; i++) {
      var t = i / 4;
      var lw = (w / 2) * (1 - t);
      var ly = baseY - h * t;
      ctx.beginPath();
      ctx.moveTo(cx - lw, ly);
      ctx.lineTo(cx + lw, ly);
      ctx.stroke();
    }
    // Crown block at the top
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(cx - px * 1.6, baseY - h - px * 2, px * 3.2, px * 2.4);
    // Gusher droplets
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(cx - 1, baseY - h - px * 4, 2, 2);
    ctx.fillRect(cx + 2, baseY - h - px * 3, 2, 2);
    ctx.lineWidth = 1;
  }

  function drawFishingBoatsImprovement(cx, cy, size) {
    // Small boat with a fishing net on water
    var bw = size * 0.50, bh = size * 0.14;
    var bx = cx - bw / 2, by = cy + size * 0.05;
    // hull
    ctx.fillStyle = '#1a0a08';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw - bh, by + bh);
    ctx.lineTo(bx + bh, by + bh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a4a1c';
    ctx.beginPath();
    ctx.moveTo(bx + 2, by + 2);
    ctx.lineTo(bx + bw - 2, by + 2);
    ctx.lineTo(bx + bw - bh - 1, by + bh - 1);
    ctx.lineTo(bx + bh + 1, by + bh - 1);
    ctx.closePath();
    ctx.fill();
    // mast
    ctx.fillStyle = '#3a2410';
    ctx.fillRect(bx + bw * 0.35 - 1, by - size * 0.22, 2, size * 0.24);
    // fishing net (arc with dots)
    ctx.strokeStyle = '#d4a87a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(bx + bw * 0.35, by - size * 0.08, size * 0.18, 0.3, Math.PI - 0.3);
    ctx.stroke();
    // net crosshatch
    ctx.strokeStyle = '#c0905a';
    ctx.lineWidth = 0.8;
    for (var i = 0; i < 3; i++) {
      var nx = bx + bw * 0.15 + i * size * 0.08;
      ctx.beginPath();
      ctx.moveTo(nx, by - size * 0.20);
      ctx.lineTo(nx + size * 0.02, by - size * 0.02);
      ctx.stroke();
    }
    // fish on the net
    ctx.fillStyle = '#5ad4e6';
    ctx.fillRect(bx + bw * 0.25, by - size * 0.14, 3, 2);
    ctx.fillRect(bx + bw * 0.45, by - size * 0.12, 3, 2);
    ctx.lineWidth = 1;
  }

  function drawPastureImprovement(cx, cy, size) {
    var w = size * 0.95, h = size * 0.55;
    var x0 = cx - w / 2, y0 = cy + size * 0.05;
    var px = Math.max(1, size / 18);
    // Pasture ground (lighter green than grass)
    ctx.fillStyle = '#0e0e0a';
    ctx.fillRect(x0 - px, y0 - px, w + 2*px, h + 2*px);
    ctx.fillStyle = '#3a5a28';
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#4c7038';
    ctx.fillRect(x0, y0, w, h * 0.6);
    // Wooden fence — repeated dark posts + 2 horizontal rails
    ctx.fillStyle = '#3a2410';
    for (var i = 0; i < 7; i++) {
      var fx = x0 + i * (w / 6);
      ctx.fillRect(fx - px*0.4, y0 - 2, px*0.8, h * 0.5);
    }
    ctx.fillStyle = '#5a3818';
    ctx.fillRect(x0, y0 + h * 0.10, w, px * 0.6);
    ctx.fillRect(x0, y0 + h * 0.30, w, px * 0.6);
    // Small barn on right
    var bx = x0 + w - size * 0.26;
    var by = y0 - size * 0.10;
    var bw = size * 0.22, bh = size * 0.22;
    ctx.fillStyle = '#1a0a08';
    ctx.beginPath();
    ctx.moveTo(bx - 2, by + bh * 0.4);
    ctx.lineTo(bx + bw / 2, by);
    ctx.lineTo(bx + bw + 2, by + bh * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a3018';
    ctx.fillRect(bx, by + bh * 0.4, bw, bh * 0.6);
    ctx.fillStyle = '#3a1810';
    ctx.fillRect(bx + bw * 0.4, by + bh * 0.7, bw * 0.2, bh * 0.3);
    // Hay piles (yellow dots) scattered in foreground
    ctx.fillStyle = '#d4a04a';
    for (var i = 0; i < 4; i++) {
      var hx = x0 + (i + 0.5) * (w * 0.18);
      var hy = y0 + h * 0.70;
      ctx.beginPath();
      ctx.ellipse(hx, hy, px * 1.4, px * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLumberImprovement(cx, cy, size) {
    var w = size * 0.95, h = size * 0.55;
    var x0 = cx - w / 2, y0 = cy + size * 0.05;
    var px = Math.max(1, size / 18);
    // Forest floor outline
    ctx.fillStyle = '#0a0a08';
    ctx.fillRect(x0 - px, y0 - px, w + 2*px, h + 2*px);
    ctx.fillStyle = '#1a3a1c';
    ctx.fillRect(x0, y0, w, h);
    // Sawmill shed on the left
    var sx = x0 + size * 0.04;
    var sy = y0 + size * 0.04;
    var sw = size * 0.30, sh = size * 0.34;
    // Pitched roof
    ctx.fillStyle = '#1a0a08';
    ctx.beginPath();
    ctx.moveTo(sx - 2, sy + sh * 0.35);
    ctx.lineTo(sx + sw / 2, sy);
    ctx.lineTo(sx + sw + 2, sy + sh * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6a3818';
    ctx.fillRect(sx, sy + sh * 0.35, sw, sh * 0.65);
    ctx.fillStyle = '#3a1c08';
    ctx.fillRect(sx + sw * 0.35, sy + sh * 0.6, sw * 0.30, sh * 0.40);
    // Chimney + smoke
    ctx.fillStyle = '#3a2010';
    ctx.fillRect(sx + sw * 0.7, sy - 3, 3, 5);
    ctx.fillStyle = 'rgba(220,220,220,0.5)';
    ctx.beginPath();
    ctx.arc(sx + sw * 0.7 + 1, sy - size * 0.1, 3, 0, Math.PI * 2);
    ctx.fill();
    // Stack of logs on the right
    var lx = x0 + w - size * 0.40;
    var ly = y0 + size * 0.20;
    ctx.fillStyle = '#1a0a08';
    ctx.fillRect(lx - 2, ly - 2, size * 0.36, size * 0.20);
    var logColors = ['#7a4a1c', '#8a5a2c', '#7a4a1c', '#8a5a2c'];
    for (var i = 0; i < 4; i++) {
      ctx.fillStyle = logColors[i];
      ctx.fillRect(lx, ly + i * (px * 1.2), size * 0.32, px * 1.0);
      // log end-circles
      ctx.fillStyle = '#5a3018';
      ctx.beginPath();
      ctx.arc(lx, ly + i * (px * 1.2) + px * 0.5, px * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lx + size * 0.32, ly + i * (px * 1.2) + px * 0.5, px * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawQuarryImprovement(cx, cy, size) {
    var w = size * 0.95, h = size * 0.55;
    var x0 = cx - w / 2, y0 = cy + size * 0.05;
    var px = Math.max(1, size / 18);
    // Sandy ground
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(x0 - px, y0 - px, w + 2*px, h + 2*px);
    ctx.fillStyle = '#7a5a1c';
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#9a7a2c';
    ctx.fillRect(x0, y0, w, h * 0.4);
    // Excavated pit on left (dark trapezoid)
    ctx.fillStyle = '#3a2810';
    ctx.beginPath();
    ctx.moveTo(x0 + size * 0.06, y0 + h * 0.30);
    ctx.lineTo(x0 + size * 0.32, y0 + h * 0.30);
    ctx.lineTo(x0 + size * 0.28, y0 + h * 0.85);
    ctx.lineTo(x0 + size * 0.10, y0 + h * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a0e08';
    ctx.fillRect(x0 + size * 0.13, y0 + h * 0.55, size * 0.13, size * 0.15);
    // Stacked grey stone blocks on right
    var bx = x0 + size * 0.45;
    var by = y0 + h * 0.20;
    var bs = size * 0.10;
    function block(qx, qy) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(qx - 1, qy - 1, bs + 2, bs + 2);
      ctx.fillStyle = '#8a8a92';
      ctx.fillRect(qx, qy, bs, bs);
      ctx.fillStyle = '#aeaeb6';
      ctx.fillRect(qx + 1, qy + 1, bs - 2, bs * 0.4);
    }
    block(bx,                by + bs * 1.2);
    block(bx + bs + 2,        by + bs * 1.2);
    block(bx + 2 * bs + 4,    by + bs * 1.2);
    block(bx + bs / 2 + 1,    by);
    block(bx + 1.5 * bs + 3,  by);
    // Tiny pickaxe leaning against blocks
    ctx.strokeStyle = '#7a4a1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + 2 * bs + 6, y0 + h - 1);
    ctx.lineTo(bx + 2 * bs + 10, y0 + h - size * 0.18);
    ctx.stroke();
    ctx.fillStyle = '#aeaeb6';
    ctx.fillRect(bx + 2 * bs + 8, y0 + h - size * 0.20, 5, 2);
    ctx.lineWidth = 1;
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

    // Apply screen shake offset
    var shake = getShakeOffset();
    if (shake.x || shake.y) {
      ctx.save();
      ctx.translate(shake.x, shake.y);
    }

    // --- PASS 1: Terrain, resources, improvements, fog ---
    // Draws all flat ground layers so nothing paints over cities/units later.
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
          // Unexplored — near-black with a hair of blue and a faint inner grid
          hexPath(cx, cy, inset + 0.5);
          ctx.fillStyle = '#05070d';
          ctx.fill();
          ctx.strokeStyle = 'rgba(120,140,180,0.07)';
          ctx.lineWidth = 1;
          hexPath(cx, cy, inset - 0.5);
          ctx.stroke();
          continue;
        }

        hexPath(cx, cy, inset);
        // Subtle per-tile brightness variation (seeded, stable) so broad fields
        // of one terrain read as organic ground, not flat fill. Water keeps its
        // flat base — its own radial depth gradient paints over it anyway.
        if (t.terrain === 'water') {
          ctx.fillStyle = terrain.color;
        } else {
          ctx.fillStyle = shade(terrain.color, 0.93 + (tileHash(c, r) % 5) * 0.035);
        }
        ctx.fill();
        ctx.save();
        ctx.clip();                      // clip decals to hex
        drawTerrainDetail(cx, cy, size, t, c, r);
        if (t.river) drawRiverOnTile(cx, cy, size, c, r);
        drawHexBevel(cx, cy, inset, t.terrain);   // inner depth bevel
        ctx.restore();
        ctx.lineWidth = 1;               // soft colored rim-light
        ctx.strokeStyle = terrain.edge;
        ctx.globalAlpha = (t.terrain === 'forest' || t.terrain === 'volcano') ? 0.7 : 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Resource marker — shown on any EXPLORED tile (not just currently
        // visible) so a discovered resource always keeps its symbol; the fog
        // overlay below dims it to read as "remembered".
        if (t.resource && explored) {
          drawResourceMarker(cx, cy, size, t.resource);
        }

        // Improvement (also persists on explored tiles)
        if (t.improvement && explored) {
          drawImprovement(cx, cy, size, t.improvement);
        }

        // Faint territory tint (drawn under fog)
        if (t.owner) {
          hexPath(cx, cy, inset);
          ctx.fillStyle = withAlpha(CIVS[t.owner].color, visible ? 0.10 : 0.05);
          ctx.fill();
        }

        // Dim if not currently visible (remembered, not blacked-out)
        if (!visible) {
          hexPath(cx, cy, inset);
          ctx.fillStyle = 'rgba(8,10,16,0.42)';      // darken
          ctx.fill();
          ctx.fillStyle = 'rgba(60,70,90,0.18)';     // cool desaturating veil
          ctx.fill();
        }
      }
    }

    // Territorial borders (between owners) — drawn after terrain, before entities
    drawBorders(size, inset);
    drawTradeRoutes(size);   // dashed lines linking traded cities

    // --- PASS 2: Villages, cities, units ---
    // Drawn in a separate pass so name banners and sprites are never
    // covered by a neighboring row's terrain fill.
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var t = state.map[r][c];
        if (!t.explored.player) continue;
        var visible = t.visible.player;

        // Skip tiles with nothing to draw in this pass
        var hasVillage = t.village && t.explored.player;
        var hasDig = !t.village && !t.city && t.explored.player && digSiteAt(c, r);
        var hasCity = !!t.city;
        var hasUnit = t.unit && visible;
        if (!hasVillage && !hasDig && !hasCity && !hasUnit) continue;

        var p = pixelOf(c, r, size);
        var cx = p.x - state.camera.x + size * SQRT3 / 2;
        var cy = p.y - state.camera.y + size;
        if (cx < -size * 2 || cy < -size * 2 || cx > VIEW_W + size * 2 || cy > VIEW_H + size * 2) continue;

        // Tribal village
        if (hasVillage) {
          drawVillage(cx, cy, size);
        }
        // Dig site — ruins waiting for an Archaeologist
        if (hasDig) {
          drawDigSite(cx, cy, size);
        }

        // City
        if (hasCity) {
          drawCity(cx, cy, size, t.city);
        }

        // Unit
        if (hasUnit) {
          drawUnit(cx, cy, size, t.unit);
        }
      }
    }

    // --- Tile yield overlay (toggle with Y key) ---
    if (showYieldOverlay) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var ySize = Math.max(8, Math.round(size * 0.22));
      ctx.font = 'bold ' + ySize + 'px monospace';
      for (var yr = 0; yr < MAP_H; yr++) {
        for (var yc = 0; yc < MAP_W; yc++) {
          var yt = state.map[yr][yc];
          if (!yt.explored.player) continue;
          var td = TERRAIN[yt.terrain];
          if (td.impassable) continue;
          var yp = pixelOf(yc, yr, size);
          var yx = yp.x - state.camera.x + size * SQRT3 / 2;
          var yy = yp.y - state.camera.y + size;
          if (yx < -size * 2 || yy < -size * 2 || yx > VIEW_W + size * 2 || yy > VIEW_H + size * 2) continue;
          var f = td.food, pr = td.prod, g = td.gold;
          if (yt.resource) { var ry = RESOURCES[yt.resource].yield; f += (ry.food||0); pr += (ry.prod||0); g += (ry.gold||0); }
          if (yt.improvement) { var iy = IMPROVEMENTS[yt.improvement].yield; f += (iy.food||0); pr += (iy.prod||0); g += (iy.gold||0); }
          if (yt.river) f += 1;
          var parts = [];
          if (f > 0) parts.push({ txt: f + 'f', col: '#4ade80' });
          if (pr > 0) parts.push({ txt: pr + 'p', col: '#f59e0b' });
          if (g > 0) parts.push({ txt: g + 'g', col: '#fbbf24' });
          if (parts.length === 0) continue;
          // Dark background pill
          var pillW = parts.length * ySize * 1.4 + 4;
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(yx - pillW / 2, yy - ySize * 0.7, pillW, ySize * 1.4);
          var sx = yx - (parts.length - 1) * ySize * 0.7;
          for (var pi = 0; pi < parts.length; pi++) {
            ctx.fillStyle = parts[pi].col;
            ctx.fillText(parts[pi].txt, sx + pi * ySize * 1.4, yy);
          }
        }
      }
      ctx.restore();
    }

    // Movement range — selected unit (full) or hover preview (faint)
    if (state.selected) {
      var su = tileAt(state.selected.c, state.selected.r);
      if (su && su.unit && su.unit.civ === 'player' && su.unit.moves > 0) {
        drawMoveRange(su.unit, size, inset, 1.0);
      }
      // Gold ring on the selected unit's tile, so it stays obvious which unit
      // is active even after the cursor moves away to pick a destination.
      if (su && su.unit) {
        var spx = pixelOf(state.selected.c, state.selected.r, size);
        var scx = spx.x - state.camera.x + size * SQRT3 / 2;
        var scy = spx.y - state.camera.y + size;
        hexPath(scx, scy, inset);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffd34d';
        ctx.shadowColor = '#ffd34d';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else {
      var ht = tileAt(state.cursor.c, state.cursor.r);
      if (ht && ht.unit && ht.unit.civ === 'player' && ht.unit.moves > 0 && state.mode === 'cursor') {
        drawMoveRange(ht.unit, size, inset, 0.45);
      }
    }

    // Cursor — cyan while free-browsing, amber "armed" while a unit is selected
    // (the cursor is then the move/attack target), so the two modes never look
    // the same.
    if (state.mode === 'cursor' || state.selected) {
      var armed = !!state.selected;
      var curMain = armed ? '#ffb454' : '#00d4ff';
      var curGlow = armed ? 'rgba(255,180,84,0.28)' : 'rgba(0,212,255,0.25)';
      var p2 = pixelOf(state.cursor.c, state.cursor.r, size);
      var ccx = p2.x - state.camera.x + size * SQRT3 / 2;
      var ccy = p2.y - state.camera.y + size;
      // Outer glow
      hexPath(ccx, ccy, inset);
      ctx.lineWidth = 4;
      ctx.strokeStyle = curGlow;
      ctx.stroke();
      // Inner bright line
      hexPath(ccx, ccy, inset);
      ctx.lineWidth = 2;
      ctx.strokeStyle = curMain;
      ctx.shadowColor = curMain;
      ctx.shadowBlur = 10;
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

    // Combat FX overlays (hex flashes, floating damage numbers)
    drawCombatFx(size);

    // Restore shake transform
    if (shake.x || shake.y) {
      ctx.restore();
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

  function drawSwordsman(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Heavy helm (wider than warrior)
    p(4,0,6,1, c.K);
    p(3,1,8,1, c.K);
    p(4,1,6,1, c.M);
    p(5,0,4,1, c.m);                    // crest
    // Face visor
    p(4,2,6,1, c.K);
    p(5,2,4,1, c.m);
    p(5,3,4,1, c.S);
    p(6,3,1,1, c.K); p(8,3,1,1, c.K);  // eyes
    // Gorget
    p(4,4,6,1, c.M);
    // Shoulders / armor
    p(3,5,8,1, c.K);
    p(2,5,1,1, c.K); p(11,5,1,1, c.K);
    p(3,6,8,1, c.M);
    p(3,6,1,1, c.m); p(10,6,1,1, c.m);
    // Chestplate
    p(4,7,6,3, c.C);
    p(4,7,6,1, c.D);
    p(7,8,1,2, c.L);                    // highlight
    p(3,7,1,3, c.K); p(10,7,1,3, c.K);
    // Belt
    p(4,10,6,1, c.B);
    p(6,10,2,1, c.Y);                   // buckle
    // Sword (right side — long blade)
    p(12,1,1,1, c.W);                   // pommel
    p(12,2,1,1, c.M); p(11,2,1,1, c.M); // cross-guard
    p(12,3,1,7, c.M);                   // blade
    p(12,3,1,1, c.W);                   // shine
    p(12,10,1,1, c.m);                  // tip
    // Shield (left side)
    p(1,5,1,4, c.K);
    p(0,6,1,3, c.K);
    p(1,6,1,2, c.C);
    p(1,8,1,1, c.D);
    p(0,7,1,1, c.L);
    // Legs
    p(5,11,1,3, c.K); p(8,11,1,3, c.K);
    p(6,11,2,3, c.M);                   // armored legs
    p(5,13,1,1, c.K); p(8,13,1,1, c.K);
  }

  function drawCatapult(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Base frame (wooden cart)
    p(1,10,12,2, c.B);
    p(1,10,12,1, c.K);
    p(1,12,12,1, c.K);
    p(2,11,10,1, c.O);                  // wood planks
    // Wheels
    p(2,12,2,2, c.K);
    p(3,13,1,1, c.B);
    p(10,12,2,2, c.K);
    p(11,13,1,1, c.B);
    // Arm (upright throwing position)
    p(7,3,1,7, c.O);                    // main arm
    p(6,3,3,1, c.K);                    // top crossbar
    p(7,2,1,1, c.K);                    // apex
    // Sling / bucket at top
    p(4,2,2,1, c.B);
    p(3,1,2,1, c.K);                    // payload
    p(3,1,1,1, c.m);                    // stone
    p(4,1,1,1, c.M);
    // Rope/string
    p(6,4,1,1, c.B);
    p(5,5,1,1, c.B);
    // Torsion bundle at base
    p(5,9,4,1, c.B);
    p(5,9,4,1, c.K);
    p(6,8,2,1, c.O);
    // Crew figure (small, beside it)
    p(11,6,2,1, c.S);                   // head
    p(11,7,2,2, c.C);                   // body
    p(11,9,2,1, c.K);
    p(11,6,2,1, c.D);                   // shadow
  }

  function drawMusketman(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Tricorn hat
    p(3,1,8,1, c.K);
    p(4,2,6,1, c.K);
    p(5,2,4,1, c.D);
    p(3,1,1,1, c.D); p(10,1,1,1, c.D); // hat brims
    // Face
    p(5,3,4,2, c.S);
    p(5,3,4,1, c.D);
    p(6,4,1,1, c.K); p(8,4,1,1, c.K);  // eyes
    // Collar
    p(5,5,4,1, c.W);
    // Uniform jacket
    p(4,6,6,1, c.K);
    p(4,7,6,3, c.C);
    p(4,7,6,1, c.D);
    p(6,8,2,1, c.Y);                    // brass buttons
    p(6,9,2,1, c.Y);
    p(3,7,1,3, c.K); p(10,7,1,3, c.K); // arms outline
    // Cross-belt
    p(5,7,1,3, c.W); p(8,7,1,3, c.W);
    // Belt
    p(4,10,6,1, c.B);
    p(6,10,2,1, c.M);                   // buckle
    // Musket (long barrel, right side)
    p(11,1,1,1, c.M);                   // bayonet tip
    p(11,2,1,9, c.B);                   // wooden stock
    p(11,2,1,4, c.M);                   // metal barrel
    p(11,2,1,1, c.W);                   // shine
    // Left hand on musket
    p(3,8,1,2, c.S);
    // Legs
    p(5,11,1,3, c.K); p(8,11,1,3, c.K);
    p(6,11,2,2, c.W);                   // white breeches
    p(6,13,2,1, c.K);                   // boots
    p(5,13,1,1, c.K); p(8,13,1,1, c.K);
  }

  function drawCitySprite(cx, cy, size, city) {
    var civ = CIVS[city.civ];
    // Holy city — a soft golden aura behind the whole settlement
    if (city.holyCity) {
      ctx.save();
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = size * 0.55;
      ctx.fillStyle = 'rgba(255,215,0,0.14)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, size * 0.62, size * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    shadowBlob(cx, cy, size * 1.1);
    var p = makeSpriteCtx(cx, cy, size * 1.05, 16, 14);
    var c = spriteColors(civ);
    // Ground/base
    p(2,12,12,2, '#2a2418');
    p(2,12,12,1, '#000');
    // Sprawl — flanking houses appear as the city grows (pop 4+, more at 7+)
    if (city.pop >= 4) {
      p(0,10,3,1, c.K); p(0,11,3,2, c.O); p(1,12,1,1, c.K);       // left cottage
      p(13,10,3,1, c.K); p(13,11,3,2, c.O); p(14,12,1,1, c.K);    // right cottage
    }
    if (city.pop >= 7) {
      p(0,8,2,1, c.K); p(0,9,2,2, c.B); p(0,9,2,1, c.O);          // upper-left hut
      p(14,8,2,1, c.K); p(14,9,2,2, c.B); p(14,9,2,1, c.O);       // upper-right hut
    }
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
    // Walls building — stone corner towers bracketing the ramparts
    if (city.buildings && city.buildings.walls) {
      p(0,6,2,1, c.K); p(0,7,2,6, c.m); p(0,7,2,1, c.M);          // left tower
      p(14,6,2,1, c.K); p(14,7,2,6, c.m); p(14,7,2,1, c.M);       // right tower
      p(0,6,1,1, c.m); p(15,6,1,1, c.m);                          // merlons
    }
    // Open revolt — flames on the walls and a smoke pall overhead
    if (typeof cityRevolting === 'function' && cityRevolting(city)) {
      p(3,8,1,1, c.R); p(4,7,1,1, c.Y);
      p(11,8,1,1, c.R); p(12,7,1,1, c.Y);
      ctx.fillStyle = 'rgba(80,80,88,0.6)';
      ctx.beginPath();
      ctx.arc(cx - size * 0.10, cy - size * 0.62, size * 0.10, 0, Math.PI * 2);
      ctx.arc(cx + size * 0.06, cy - size * 0.72, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    // Name banner
    var fontSize = Math.max(9, Math.round(size * 0.32));
    var label = city.name + (city.capital ? ' ★' : '') + ' ' + city.pop;
    ctx.font = 'bold ' + fontSize + 'px -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var tw = ctx.measureText(label).width;
    var by = cy + size * 0.55;
    var bpad = 5;
    var bx0 = cx - tw/2 - bpad, bw = tw + bpad * 2, bh = fontSize + 5;
    // Banner background
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(bx0, by, bw, bh);
    // Top and bottom accent lines in civ color
    var cRgb = hexToRgb(civ.color);
    ctx.fillStyle = 'rgba(' + cRgb[0] + ',' + cRgb[1] + ',' + cRgb[2] + ',0.8)';
    ctx.fillRect(bx0, by, bw, 1.5);
    ctx.fillStyle = 'rgba(' + cRgb[0] + ',' + cRgb[1] + ',' + cRgb[2] + ',0.4)';
    ctx.fillRect(bx0, by + bh - 1, bw, 1);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, cx, by + 2);
  }

  function drawGalley(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Hull
    p(1,8,12,1, c.K);                     // gunwale outline
    p(2,8,10,1, c.D);                     // gunwale civ stripe
    p(2,9,10,2, c.K);                     // hull outline
    p(3,9,8,2, c.O);                      // hull wood
    p(3,9,8,1, c.B);                      // hull shadow
    // Pointed bow and stern
    p(0,8,1,1, c.K);  p(13,8,1,1, c.K);
    p(1,9,1,1, c.O);  p(12,9,1,1, c.O);
    // Mast
    p(7,1,1,7, c.B);
    p(7,0,1,1, c.K);                      // masthead
    // Sail
    p(8,1,3,1, c.C);
    p(8,2,4,1, c.C);
    p(8,3,4,1, c.L);
    p(8,4,3,1, c.D);
    p(8,5,2,1, c.D);
    // Oar hints
    p(3,11,1,1, c.B); p(5,11,1,1, c.B);
    p(8,11,1,1, c.B); p(10,11,1,1, c.B);
    // Water waves below hull
    p(1,12,12,1, '#164070');
    p(2,13,10,1, '#081e3c');
  }

  function drawScout(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Broad explorer's hat
    p(3,3,8,1, c.K);
    p(4,2,6,1, c.K);
    p(5,2,4,1, c.D);
    p(2,4,10,1, c.K);                  // brim
    p(3,4,8,1, c.D);
    // Face
    p(5,5,4,2, c.S);
    p(5,5,4,1, c.D);
    p(6,6,1,1, c.K); p(8,6,1,1, c.K);  // eyes
    // Lean traveler's body
    p(5,7,4,1, c.K);
    p(5,8,4,3, c.C);
    p(6,9,2,1, c.L);
    p(5,11,4,1, c.K);
    // Right arm holding banner pole
    p(9,7,1,4, c.S);
    p(9,7,1,1, c.K);
    // Banner pole
    p(10,3,1,8, c.K);
    // Banner pennant (civ-colored)
    p(11,3,3,1, c.K);
    p(11,3,3,3, c.C);
    p(11,4,2,1, c.L);
    p(13,4,1,2, c.K);
    // Left arm relaxed
    p(4,8,1,2, c.S);
    p(4,8,1,1, c.K);
    // Belt + legs
    p(5,11,4,1, c.B);
    p(5,12,1,2, c.K); p(8,12,1,2, c.K);
    p(6,12,2,2, c.B);
  }

  // ---- Era & specialist sprites (same 14×14 pixel idiom) ----
  function drawSpearman(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Spear (right) — tall shaft with bright leaf head
    p(11,0,1,1, c.M); p(11,1,1,1, c.W);
    p(11,2,1,9, c.O); p(11,4,1,1, c.B);
    // Helmet
    p(5,1,4,1, c.K); p(4,2,1,2, c.K); p(9,2,1,2, c.K);
    p(5,2,4,1, c.C); p(5,3,4,1, c.D); p(5,2,1,1, c.L);
    // Face
    p(5,4,4,2, c.S); p(5,4,4,1, c.D);
    p(6,5,1,1, c.K); p(8,5,1,1, c.K);
    // Body
    p(4,6,6,1, c.K);
    p(4,7,6,3, c.C); p(4,7,6,1, c.D); p(5,8,4,1, c.L);
    p(4,10,6,1, c.K); p(4,11,6,1, c.B);
    // Tall kite shield (left)
    p(1,6,1,6, c.K); p(3,6,1,6, c.K); p(2,6,1,1, c.K); p(2,12,1,1, c.K);
    p(2,7,1,5, c.L); p(2,9,1,1, c.Y);
    // Spear arm
    p(10,6,1,3, c.D);
    // Legs
    p(5,12,1,2, c.K); p(8,12,1,2, c.K); p(6,12,2,2, c.D);
  }

  function drawKnight(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Lance (right) — upright with pennant
    p(12,0,1,1, c.M); p(12,1,1,7, c.O); p(13,1,1,2, c.C);
    // Barded (armored) warhorse
    p(2,8,10,1, c.K);                       // back outline
    p(2,9,9,2, c.D);                        // civ barding
    p(3,9,7,1, c.C);                        // barding highlight
    p(10,7,2,1, c.K); p(11,6,2,1, c.K);     // neck + head outline
    p(11,7,2,2, c.B); p(12,6,1,1, c.B);     // head
    p(12,5,1,1, c.K);                       // ear
    p(12,7,1,1, c.K);                       // eye
    p(1,9,1,2, c.K);                        // tail
    // Horse legs
    p(3,11,1,3, c.K); p(6,11,1,3, c.K); p(9,11,1,3, c.K);
    // Armored rider
    p(5,2,3,1, c.K);                        // helm top
    p(5,3,3,1, c.M);                        // steel helm
    p(6,4,1,1, c.K);                        // visor slit
    p(5,0,1,2, c.Y);                        // plume
    p(4,5,4,1, c.K);                        // shoulders
    p(4,6,4,2, c.M); p(4,6,4,1, c.C);       // steel torso, civ tabard stripe
    p(9,6,1,2, c.M);                        // lance arm
  }

  function drawCannonSprite(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Barrel — angled up-right in steps
    p(4,8,4,2, c.m); p(6,7,4,2, c.m); p(9,6,3,2, c.m);
    p(5,8,3,1, c.M); p(7,7,2,1, c.M); p(9,6,2,1, c.M);   // top highlight
    p(11,5,2,1, c.K); p(12,6,1,2, c.K);                  // muzzle rim
    // Wheel
    p(4,8,3,1, c.K); p(3,9,1,3, c.K); p(7,9,1,3, c.K); p(4,12,3,1, c.K);
    p(4,9,3,3, c.O); p(5,10,1,1, c.B);                   // spoked hub
    // Carriage trail
    p(7,11,4,1, c.B); p(10,12,2,1, c.B);
    // Cannonball stack + civ crest
    p(1,11,1,1, c.m); p(2,12,1,1, c.m); p(1,12,1,1, c.K);
    p(5,9,1,1, c.C);
  }

  function drawTank(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Treads
    p(1,9,12,3, c.K);
    p(2,10,10,1, c.m);
    p(3,10,1,1, c.K); p(5,10,1,1, c.K); p(7,10,1,1, c.K); p(9,10,1,1, c.K);  // bogeys
    // Hull
    p(2,6,10,1, c.K);
    p(2,7,10,2, c.C); p(3,7,8,1, c.L); p(2,8,10,1, c.D);
    p(3,7,1,1, c.W);                       // headlamp glint
    // Turret + barrel
    p(5,3,4,1, c.K);
    p(5,4,4,2, c.C); p(6,4,2,1, c.L);
    p(7,3,1,1, c.K);                       // hatch
    p(9,4,4,1, c.m); p(13,4,1,1, c.K);     // gun + muzzle
  }

  function drawBattleship(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Hull — long grey with pointed bow (right)
    p(0,9,13,1, c.K);
    p(1,10,11,2, c.m); p(1,10,11,1, c.M);
    p(12,10,1,1, c.m); p(13,10,1,1, c.K);   // bow
    p(2,11,9,1, c.D);                       // civ waterline stripe
    // Superstructure + bridge
    p(4,5,4,1, c.K); p(4,6,4,3, c.M);
    p(5,6,2,1, c.K);                        // bridge windows
    p(6,3,1,2, c.K);                        // mast
    // Gun turrets (fore points right, aft points left)
    p(9,7,2,2, c.m); p(11,7,2,1, c.K);
    p(2,7,2,2, c.m); p(0,8,2,1, c.K);
    // Waves
    p(0,12,13,1, '#164070'); p(1,13,11,1, '#081e3c');
  }

  function drawSubmarine(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Low hull at the waterline
    p(1,9,12,1, c.K);
    p(2,10,10,2, c.m); p(2,10,10,1, c.M);
    p(1,10,1,1, c.K); p(12,10,1,1, c.K);    // tapered ends
    p(3,11,8,1, c.D);                       // civ stripe
    // Conning tower + periscope
    p(6,6,3,1, c.K); p(6,7,3,2, c.m); p(6,7,3,1, c.M);
    p(7,4,1,2, c.K); p(7,4,1,1, c.W);
    // Waterline foam + waves
    p(3,9,2,1, '#8ab0d0'); p(9,9,2,1, '#8ab0d0');
    p(0,12,14,1, '#164070'); p(2,13,10,1, '#081e3c');
  }

  function drawCarrier(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Flat flight deck spanning the hex
    p(0,7,14,1, c.K);
    p(0,8,13,2, c.m);
    p(1,8,12,1, c.M);                       // deck edge highlight
    p(2,11,10,1, c.D);                      // civ waterline stripe
    // Runway centre dashes
    p(2,8,1,1, c.W); p(5,8,1,1, c.W); p(8,8,1,1, c.W);
    // Island (right) + radar mast
    p(10,4,3,1, c.K); p(10,5,3,2, c.m); p(10,5,3,1, c.M);
    p(11,2,1,2, c.K);
    // Parked aircraft silhouette (left)
    p(3,6,3,1, c.C); p(4,5,1,1, c.C);
    // Waves
    p(0,12,14,1, '#164070'); p(1,13,12,1, '#081e3c');
  }

  function drawFighter(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Top-down jet, nose up
    p(6,0,2,1, c.K);                        // nose tip
    p(6,1,2,2, c.m);                        // nose cone
    p(6,3,2,2, c.K); p(6,3,1,1, c.W);       // canopy + glint
    p(6,5,2,6, c.M);                        // fuselage
    // Swept wings
    p(4,5,6,1, c.C);
    p(2,6,10,1, c.C);
    p(1,7,12,1, c.D);
    // Tailplane + fin
    p(5,10,4,1, c.C); p(6,11,2,1, c.D);
    // Afterburner
    p(6,12,2,1, c.Y); p(6,13,2,1, c.R);
  }

  function drawBomber(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Long fuselage, nose up
    p(6,0,2,1, c.K);
    p(6,1,2,11, c.M); p(6,2,1,10, c.W);     // fuselage + spine highlight
    // Broad straight wings
    p(0,5,14,1, c.C);
    p(0,6,14,2, c.C); p(0,7,14,1, c.D);
    // Engine nacelles
    p(2,6,1,2, c.K); p(4,6,1,2, c.K); p(9,6,1,2, c.K); p(11,6,1,2, c.K);
    // Twin tail
    p(4,11,2,1, c.C); p(8,11,2,1, c.C); p(5,12,4,1, c.D);
  }

  function drawMissile(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Launch gantry (right)
    p(10,1,1,11, c.m);
    p(9,3,1,1, c.m); p(9,6,1,1, c.m); p(9,9,1,1, c.m);
    // Rocket — nose, body, hazard band, fins
    p(6,0,2,1, c.K);
    p(6,1,2,2, c.R);
    p(6,3,2,6, c.M); p(6,3,1,6, c.W);
    p(6,5,2,1, c.C);                        // civ band
    p(6,8,2,1, c.Y);                        // hazard band
    p(4,9,2,2, c.D); p(8,9,2,2, c.D);       // fins
    p(4,9,1,1, c.K); p(9,9,1,1, c.K);
    p(6,9,2,2, c.m);                        // engine skirt
    // Launch pad
    p(3,11,9,1, c.K); p(2,12,11,1, c.m);
  }

  function drawMissionary(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Staff with golden cross (right)
    p(11,4,1,8, c.O);
    p(11,1,1,3, c.Y); p(10,2,3,1, c.Y);
    // Hooded head
    p(5,0,4,1, c.K);
    p(5,1,4,2, c.C); p(5,1,1,1, c.L);
    // Face
    p(5,3,4,2, c.S); p(5,3,4,1, c.D);
    p(6,4,1,1, c.K); p(8,4,1,1, c.K);
    // White robe with civ trim
    p(4,5,6,1, c.K);
    p(4,6,6,6, c.W);
    p(4,6,1,6, c.C); p(9,6,1,6, c.C);       // trim
    p(5,7,4,1, '#d8d8e0');                  // fold shading
    p(4,9,6,1, c.O);                        // rope belt
    p(4,12,6,1, c.K);                       // hem
    // Staff arm
    p(10,6,1,2, c.S);
  }

  function drawInquisitor(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Torch (left) — flame over shaft
    p(2,3,1,1, c.Y); p(1,4,3,1, c.R); p(2,5,1,1, c.Y);
    p(2,6,1,5, c.B);
    // Deep hood — face in shadow, pale eyes
    p(4,0,6,1, c.K);
    p(4,1,6,3, c.D); p(5,1,1,1, c.C);
    p(5,3,4,2, c.K);
    p(6,4,1,1, c.W); p(8,4,1,1, c.W);
    // Dark robe with civ sash
    p(4,5,6,1, c.K);
    p(4,6,6,6, c.D);
    p(4,8,6,1, c.C);                        // sash
    p(6,6,1,6, c.K);                        // robe fold
    p(4,12,6,1, c.K);                       // hem
    // Torch arm
    p(3,6,1,2, c.D);
  }

  function drawCaravan(cx, cy, size, civ) {
    shadowBlob(cx, cy, size);
    var p = makeSpriteCtx(cx, cy, size, 14, 14);
    var c = spriteColors(civ);
    // Canopy — civ-colored covered wagon
    p(4,3,7,1, c.K);
    p(3,4,9,1, c.K);
    p(4,4,7,1, c.L);
    p(3,5,9,4, c.C);
    p(3,5,1,4, c.D); p(11,5,1,4, c.D);
    p(4,6,7,1, c.L);
    // Bed + tow pole
    p(2,9,11,1, c.B);
    p(0,9,2,1, c.O);
    // Wheels
    p(3,10,3,3, c.K); p(4,11,1,1, c.O);
    p(9,10,3,3, c.K); p(10,11,1,1, c.O);
    // Goods sacks peeking out front
    p(1,7,2,2, c.O); p(1,7,2,1, c.Y);
  }

  var UNIT_DRAW = {
    settler:   drawSettler,
    worker:    drawWorker,
    scout:     drawScout,
    caravan:   drawCaravan,
    warrior:   drawWarrior,
    archer:    drawArcher,
    horseman:  drawHorseman,
    swordsman: drawSwordsman,
    catapult:  drawCatapult,
    musketman: drawMusketman,
    galley:    drawGalley,
    // Era sprites — every line has its own silhouette now
    spearman:  drawSpearman,    // spear + tall shield
    pikeman:   drawSpearman,    // pike wall (heavier era, same silhouette)
    knight:    drawKnight,      // barded warhorse + lance
    trebuchet: drawCatapult,    // wooden siege
    cannon:    drawCannonSprite,// wheeled field gun
    rifleman:  drawMusketman,   // gunpowder infantry
    caravel:   drawGalley,      // sail era
    // Modern units
    infantry:  drawMusketman,   // rifle line
    artillery: drawCannonSprite,// big gun
    tank:      drawTank,        // treads + turret
    battleship:drawBattleship,  // grey steel, gun turrets
    fighter:   drawFighter,     // swept-wing jet
    bomber:    drawBomber,      // broad-wing heavy
    modern_armor: drawTank,     // armored apex
    nuke:      drawMissile,     // rocket on its gantry
    submarine: drawSubmarine,   // conning tower at the waterline
    carrier:   drawCarrier,     // flat-top
    // Faction uniques reuse their base line's sprite (civ color distinguishes)
    legionary: drawWarrior,
    nightblade:drawSwordsman,
    bloodrider:drawHorseman,
    dromon:    drawGalley,
    raider:    drawWarrior,  // reuses warrior sprite; civ color makes it grey
    // Civilians & specialists
    missionary:    drawMissionary,
    inquisitor:    drawInquisitor,
    archaeologist: drawWorker,   // a digger by trade
    great_general:   drawGreatPerson,
    great_scientist: drawGreatPerson,
    great_engineer:  drawGreatPerson,
    great_merchant:  drawGreatPerson,
    great_artist:    drawGreatPerson,
    great_prophet:   drawGreatPerson
  };

  function drawGreatPerson(cx, cy, size, civ) {
    // Robed figure with civ-colored vestments
    var px = Math.max(1, size / 16);
    // Robe body
    ctx.fillStyle = civ.color;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.14, cy - size * 0.08);
    ctx.lineTo(cx + size * 0.14, cy - size * 0.08);
    ctx.lineTo(cx + size * 0.20, cy + size * 0.28);
    ctx.lineTo(cx - size * 0.20, cy + size * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = px;
    ctx.stroke();
    // Head
    ctx.fillStyle = '#e8c090';
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.18, size * 0.10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = px;
    ctx.stroke();
    // Halo
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = px * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy - size * 0.18, size * 0.15, 0, Math.PI * 2);
    ctx.stroke();
  }

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

    // Civ-colored glow beneath the unit for visibility against any terrain
    var rgb = hexToRgb(civ.color);
    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.30)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.08, size * 0.44, size * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    // Dark outline ring for contrast
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + size * 0.08, size * 0.46, size * 0.40, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Golden glow for great people
    if (UNITS[unit.type] && UNITS[unit.type].great) {
      ctx.save();
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = size * 0.5;
      ctx.fillStyle = 'rgba(255,215,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, size * 0.5, size * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

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

    // Promotion stars
    var totalPromos = unit.promos != null ? unit.promos : ((unit.promoAtk || 0) + (unit.promoDef || 0) + (unit.promoHp || 0));
    if (totalPromos > 0) {
      var starSize = Math.max(4, size * 0.12);
      for (var si = 0; si < Math.min(totalPromos, 5); si++) {
        var sx = cx - (totalPromos * starSize * 0.6) / 2 + si * starSize * 0.6 + starSize * 0.3;
        var sy = cy + size * 0.52;
        ctx.fillStyle = '#ffd700';
        ctx.font = Math.round(starSize) + 'px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', sx, sy);
      }
    }

    // Exhausted dot
    if (unit.civ === 'player' && unit.moves === 0 && !unit.fortified) {
      ctx.fillStyle = 'rgba(140,140,160,0.85)';
      ctx.beginPath();
      ctx.arc(cx + size * 0.45, cy + size * 0.45, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Queued move indicator
    if (unit.goto && unit.civ === 'player') {
      ctx.fillStyle = '#00d4ff';
      ctx.font = Math.max(6, Math.round(size * 0.18)) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('▸', cx + size * 0.45, cy - size * 0.45);
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
        if (!canEnterTile(unit, t)) continue;
        // Friendly unit blocks the path (can't pass through allies)
        if (t.unit && t.unit.civ === unit.civ && !(nc === unit.c && nr === unit.r)) continue;
        var key = nc + ',' + nr;
        var cost = used + 1;
        if (!(key in visited) || visited[key].cost > cost) {
          visited[key] = { cost: cost, parent: cc + ',' + cr };
          // Stop expansion at enemy unit / enemy city (those are end-of-path attack targets)
          var enemyUnit = t.unit && t.unit.civ !== unit.civ && atWar(unit.civ, t.unit.civ);
          var enemyCity = t.city && t.city.civ !== unit.civ && atWar(unit.civ, t.city.civ);
          // Block on units at peace (can't walk through them)
          var peaceUnit = t.unit && t.unit.civ !== unit.civ && !atWar(unit.civ, t.unit.civ);
          if (peaceUnit) continue;
          if (!enemyUnit && !enemyCity) frontier.push([nc, nr, cost]);
        }
      }
    }
    return visited;
  }

  // Ranged attack: find all enemy units within `ranged` hex distance
  function computeRangedTargets(unit) {
    var def = UNITS[unit.type];
    if (!def.ranged || unit.moves <= 0) return [];
    var range = def.ranged;
    var targets = [];
    for (var rr = Math.max(0, unit.r - range); rr <= Math.min(MAP_H - 1, unit.r + range); rr++) {
      for (var cc = Math.max(0, unit.c - range); cc <= Math.min(MAP_W - 1, unit.c + range); cc++) {
        if (cc === unit.c && rr === unit.r) continue;
        if (hexDist([unit.c, unit.r], [cc, rr]) > range) continue;
        var t = tileAt(cc, rr);
        if (!t || !t.unit) continue;
        if (t.unit.civ === unit.civ) continue;
        if (!atWar(unit.civ, t.unit.civ)) continue;
        targets.push({ c: cc, r: rr, unit: t.unit });
      }
    }
    return targets;
  }

  // Shared combat math: the attacker's win-ratio vs a defender, factoring
  // terrain, fortify, walls, Great Wall, home territory, siege, promotions and
  // tech. Used by attack(), rangedAttack(), and the combat-odds forecast so
  // the preview always matches the real roll.
  function combatRatio(attacker, defender, isRanged) {
    var aDef = UNITS[attacker.type], dDef = UNITS[defender.type];
    var dTile = tileAt(defender.c, defender.r);
    var terr = TERRAIN[dTile.terrain];
    var dBonus = (terr.defBonus || 0);
    if (defender.fortified) dBonus += 0.25;
    if (dTile.city && dTile.city.civ === defender.civ) {
      dBonus += dTile.city.buildings.bastion ? 0.95 : dTile.city.buildings.walls ? 0.75 : 0.25;
      if (dTile.city.buildings.castle) dBonus += 0.5;   // Castle stacks atop Walls
      if (dTile.city.buildings.military_academy) dBonus += 0.35;
      if (state.wondersBuilt && state.wondersBuilt.great_wall === defender.civ) dBonus += 0.5;
      dBonus += factionEff(state.civs[defender.civ], 'cityDefMult');   // Tellus: fortress empire
    }
    if (dTile.owner === defender.civ) dBonus += 0.10;
    if (isRanged && defender.promoCover) dBonus += 0.5;   // Cover promotion: harder to hit at range
    if (dBonus > 1.75) dBonus = 1.75;
    var aPower = aDef.atk + atkTechBonus(attacker);
    // Siege (unit flag or promotion) halves a city's defensive bonus.
    if ((aDef.siege || attacker.promoSiege) && dTile.city) dBonus = dBonus * 0.5;
    // Class counters — Spearman/Pikeman vs mounted, Submarine vs naval, etc.
    var aClass = unitClassOf(aDef), dClass = unitClassOf(dDef);
    if (aDef.vs && dClass && aDef.vs[dClass]) aPower *= (1 + aDef.vs[dClass]);
    // Flanking — friendly military units already adjacent to the defender press
    // the attack home (melee only). +10% per flanker, capped at +30%. Surrounding
    // a target with the hex grid now pays off positionally.
    if (!isRanged) {
      var fl = flankersAgainst(attacker, defender);
      if (fl > 0) aPower *= (1 + Math.min(fl, 3) * 0.10);
    }
    var dPower = (dDef.def + (defender.promoDef || 0)) * (1 + dBonus);
    if (dDef.vs && aClass && dDef.vs[aClass]) dPower *= (1 + dDef.vs[aClass]);
    if (defender.embarked) dPower *= 0.4;   // land units caught at sea are nearly helpless
    return aPower / (aPower + dPower);
  }
  function unitClassOf(def) { return def.class || (def.naval ? 'naval' : def.air ? 'air' : null); }
  // Count the attacker's friendly military units adjacent to the defender (besides
  // the attacker itself) — the flanking force.
  function flankersAgainst(attacker, defender) {
    var n = 0, ns = neighbors(defender.c, defender.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (!t || !t.unit || t.unit === attacker) continue;
      if (t.unit.civ === attacker.civ && UNITS[t.unit.type] && !UNITS[t.unit.type].civilian) n++;
    }
    return n;
  }
  // Is this unit standing next to an enemy (at-war) military unit? Used by Zone of
  // Control to halt an advance that brushes past a defender.
  function inEnemyZoC(unit) {
    var ns = neighbors(unit.c, unit.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (!t || !t.unit) continue;
      if (t.unit.civ === unit.civ) continue;
      if (UNITS[t.unit.type] && UNITS[t.unit.type].civilian) continue;   // civilians don't exert ZoC
      if (atWar(unit.civ, t.unit.civ)) return true;
    }
    return false;
  }
  // Expected-damage forecast; the +0..3 random jitter is shown as a range.
  function combatForecast(attacker, defender, ranged) {
    var ratio = combatRatio(attacker, defender, ranged);
    var dMin = Math.round(12 * ratio);
    var fc = { toDefMin: dMin, toDefMax: dMin + 3, ranged: !!ranged };
    if (!ranged) { var aMin = Math.round(12 * (1 - ratio)); fc.toAtkMin = aMin; fc.toAtkMax = aMin + 3; }
    return fc;
  }

  function rangedAttack(attacker, defender) {
    var aDef = UNITS[attacker.type], dDef = UNITS[defender.type];
    if (aDef.atk === 0) { showToast('Cannot attack'); return false; }
    if (!atWar(attacker.civ, defender.civ)) { showToast('At peace'); return false; }
    var ratio = combatRatio(attacker, defender, true);

    // Ranged: full damage to defender, NO counter-damage to attacker
    var dmgToDef = Math.round(12 * ratio + rndInt(0, 3));

    defender.hp -= dmgToDef;
    attacker.moves = 0;

    // Ranged combat animation + sound
    addRangedFx(defender.c, defender.r, dmgToDef);
    if (attacker.civ === 'player' || defender.civ === 'player') sfxAttack();

    var msg = aDef.name + ' → ' + dmgToDef + ' dmg (ranged)';
    showToast(msg, attacker.civ === 'player' ? 'success' : 'error');

    if (defender.hp <= 0) {
      attacker.kills = (attacker.kills || 0) + 1;
      if (attacker.civ === 'player') {
        state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1;
        if (defender.civ === 'barb') { state.stats.barbsDefeated = (state.stats.barbsDefeated || 0) + 1; checkCsQuests(); }
        // Every 4th kill marks the field — future archaeology (living history)
        if (state.stats.unitsKilled % 4 === 0) addDigSite(defender.c, defender.r, 'a great battlefield');
      }
      if (defender.civ === 'player') state.stats.unitsLost = (state.stats.unitsLost || 0) + 1;
      killUnit(defender);
      checkPromotion(attacker);
      var hk = factionEff(state.civs[attacker.civ], 'healOnKill'); if (hk) attacker.hp = Math.min(attacker.maxHp, attacker.hp + hk);  // Vorne
      // Ranged attacker does NOT move into the vacated tile
    }
    return true;
  }

  // Nuke — an area strike around a target tile: heavy damage to every enemy unit
  // in the blast, pop loss + unrest to an enemy city, razed improvements. The
  // nuke is consumed. Targets an enemy unit in range (reuses ranged targeting).
  function nukeStrike(attacker, target) {
    if (!target || !atWar(attacker.civ, target.civ)) { if (attacker.civ === 'player') showToast('At peace'); return false; }
    var ec = target.c, er = target.r;
    attacker.moves = 0;
    addFx('hexFlash', ec, er, { color: 'rgba(255,190,60,0.75)' }, 700);
    addFx('shake', 0, 0, { intensity: 6 }, 600);
    if (attacker.civ === 'player' || target.civ === 'player') sfxAttack();
    var tiles = [[ec, er]].concat(neighbors(ec, er));
    tiles.forEach(function (pos) {
      var t = tileAt(pos[0], pos[1]); if (!t) return;
      if (t.unit && t.unit.civ !== attacker.civ) {
        var d = t.unit;
        d.hp -= 30;
        addFx('floatNum', pos[0], pos[1], { text: '-30', color: '#ffcc44' }, 900);
        if (d.hp <= 0) {
          if (attacker.civ === 'player') { state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1; if (d.civ === 'barb') { state.stats.barbsDefeated = (state.stats.barbsDefeated || 0) + 1; checkCsQuests(); } }
          if (d.civ === 'player') state.stats.unitsLost = (state.stats.unitsLost || 0) + 1;
          killUnit(d);
        }
      }
      if (t.city && t.city.civ !== attacker.civ) {
        t.city.pop = Math.max(1, t.city.pop - 2);
        t.city.unrest = (t.city.unrest || 0) + 6;
      }
      if (t.improvement && t.owner && t.owner !== attacker.civ) t.improvement = null;   // fallout
    });
    killUnit(attacker);   // single-use
    recomputeBorders();
    recomputeVisibility('player');
    if (attacker.civ === 'player') { logEvent('☢ Nuclear strike unleashed!', 'error'); showToast('☢ Nuclear strike!', 'error'); chronicle('Unleashed a nuclear strike.'); }
    else logEvent('☢ ' + (CIVS[attacker.civ] ? CIVS[attacker.civ].name : attacker.civ) + ' launched a nuclear strike!', 'error');
    return true;
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
      var enemy = (t && t.unit && t.unit.civ !== unit.civ && atWar(unit.civ, t.unit.civ)) || (t && t.city && t.city.civ !== unit.civ && atWar(unit.civ, t.city.civ));
      var fillA = (enemy ? 0.32 : 0.16) * alpha;
      ctx.fillStyle = enemy ? 'rgba(255, 68, 102, ' + fillA + ')' : 'rgba(0, 255, 136, ' + fillA + ')';
      ctx.fill();
      if (enemy && alpha > 0.7) {
        ctx.strokeStyle = 'rgba(255, 68, 102, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Ranged targets — highlight enemies within firing range but outside move range
    var uDef = UNITS[unit.type];
    if (uDef.ranged && unit.moves > 0 && alpha > 0.7) {
      var targets = computeRangedTargets(unit);
      for (var i = 0; i < targets.length; i++) {
        var tk = targets[i].c + ',' + targets[i].r;
        if (tk in visited) continue;  // already shown as melee target
        var tp = pixelOf(targets[i].c, targets[i].r, size2);
        var tx = tp.x - state.camera.x + size2 * SQRT3 / 2;
        var ty = tp.y - state.camera.y + size2;
        hexPath(tx, ty, inset);
        ctx.fillStyle = 'rgba(255, 180, 60, 0.28)';
        ctx.fill();
        // Pulsing orange border for ranged targets
        ctx.strokeStyle = 'rgba(255, 180, 60, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
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
    var culEl = document.getElementById('hud-cul');
    if (culEl) culEl.textContent = civ.currentCivic
      ? civ.civicProgress + '/' + CIVICS[civ.currentCivic].cost
      : '+' + (civ.culPerTurn || 0);
    document.getElementById('hud-tech-name').textContent = civ.currentTech
      ? TECHS[civ.currentTech].name
      : 'No research';

    // Age indicator
    var age = getAge(civ);
    var ageEl = document.getElementById('hud-age');
    if (ageEl) {
      ageEl.textContent = age.name.toUpperCase();
      var cell = ageEl.parentElement;
      cell.classList.remove('classical', 'medieval', 'renaissance', 'modern', 'industrial', 'information');
      if (age.name === 'Classical') cell.classList.add('classical');
      if (age.name === 'Medieval') cell.classList.add('medieval');
      if (age.name === 'Renaissance') cell.classList.add('renaissance');
      if (age.name === 'Industrial') cell.classList.add('industrial');
      if (age.name === 'Modern') cell.classList.add('modern');
      if (age.name === 'Information') cell.classList.add('information');
    }

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

    // ERA chip — Golden-age countdown when active, else Era-Point progress.
    var eraPill = document.getElementById('era-pill');
    if (eraPill) {
      var pc = state.civs.player;
      var inGolden = pc.goldenAgeTurns > 0;
      eraPill.querySelector('.chip-lbl').textContent = inGolden ? 'GOLD' : 'ERA';
      eraPill.querySelector('.chip-val').textContent = inGolden
        ? '☀' + pc.goldenAgeTurns
        : (pc.eraPoints || 0) + '/' + goldenAgeThreshold(pc);
      eraPill.classList.toggle('golden', inGolden);
      // Glint when the Era-Point bar is nearly full (a Golden Age is imminent).
      eraPill.classList.toggle('near', !inGolden && (pc.eraPoints || 0) >= goldenAgeThreshold(pc) * 0.8);
    }

    var hint = document.getElementById('hud-hint');
    var selUnit = state.selected && tileAt(state.selected.c, state.selected.r);
    selUnit = selUnit && selUnit.unit;
    if (state.selected && !selUnit) state.selected = null;

    var readyToEnd = !hasMovesLeft && !state.victory;

    // Flip the whole bottom HUD into a clearly-different "a unit is selected"
    // look (amber) so the two states never read the same at a glance.
    var hudBottom = document.getElementById('hud-bottom');
    if (hudBottom) hudBottom.classList.toggle('unit-selected', !!selUnit);

    if (selUnit) {
      // Combat forecast: if the cursor is on an enemy this unit could strike
      // right now (ranged in range, or melee adjacent), show expected damage.
      var forecast = null;
      var sd = UNITS[selUnit.type];
      var curT = state.map[state.cursor.r][state.cursor.c];
      if (sd.atk > 0 && selUnit.moves > 0 && curT.unit && curT.visible.player &&
          curT.unit.civ !== 'player' && atWar('player', curT.unit.civ)) {
        var dist = hexDist([selUnit.c, selUnit.r], [state.cursor.c, state.cursor.r]);
        var useRanged = !!sd.ranged && dist <= sd.ranged;
        var canMelee = dist === 1;
        if (useRanged || canMelee) {
          var f = combatForecast(selUnit, curT.unit, useRanged);
          forecast = useRanged
            ? '⚔ deal ~' + f.toDefMin + '–' + f.toDefMax + ' · ranged, no counter'
            : '⚔ deal ~' + f.toDefMin + '–' + f.toDefMax + ' · take ~' + f.toAtkMin + '–' + f.toAtkMax;
        }
      }
      // Always lead with WHAT is selected so the state is unmistakable.
      var selLabel = '▶ ' + sd.name + ' ' + selUnit.moves + '/' + selUnit.maxMoves + ' mv';
      hint.textContent = forecast
        ? selLabel + ' · ' + forecast
        : selLabel + ' · ⏎ move · esc next unit';
    } else if (state.mode === 'scroll') {
      hint.textContent = 'arrows pan · ↑↓↑↓ for cursor';
    } else if (readyToEnd) {
      hint.textContent = 'no units left · ⏎ on open land = end turn · or ☰ Menu';
    } else {
      hint.textContent = 'pinch a unit to command it · ⏎ on open land = ☰ Menu';
    }

    var ti = state.map[state.cursor.r][state.cursor.c];
    var label;
    if (!ti.explored.player) {
      label = 'Unexplored';
    } else {
      label = TERRAIN[ti.terrain].name;
      if (ti.river) label += ' · River';
      if (ti.resource && RESOURCES[ti.resource]) label += ' · ' + RESOURCES[ti.resource].label;
      if (ti.improvement) label += ' · ' + (IMPROVEMENTS[ti.improvement] ? IMPROVEMENTS[ti.improvement].name : ti.improvement);
      if (ti.village) label += ' · Village';
      if (ti.unit && ti.visible.player) label += ' · ' + UNITS[ti.unit.type].name;
      if (ti.city) label += ' · ' + ti.city.name;
    }
    document.getElementById('hud-tile').textContent = label;

    var chip = document.getElementById('end-turn-chip');
    if (chip) chip.classList.toggle('ready', readyToEnd);

    // Victory finish-line banner — appears once the race heats up (someone ≥60%
    // to a win), so the endgame reads as a clock. Green when you lead it, red
    // when a rival does. Tap to open the World Report.
    var vr = document.getElementById('victory-race');
    if (vr) {
      var lead = closestVictoryAll();
      if (lead && lead.frac >= 0.6 && !state.victory) {
        var mine = lead.civId === 'player';
        var who = mine ? 'You' : (CIVS[lead.civId] ? CIVS[lead.civId].name : lead.civId);
        vr.innerHTML = '🏁 ' + who + ' · ' + lead.kind + ' ' + Math.round(lead.frac * 100) + '%' +
          '<span class="vr-bar"><i style="width:' + Math.round(lead.frac * 100) + '%"></i></span>';
        vr.classList.toggle('mine', mine);
        vr.classList.toggle('rival', !mine);
        vr.classList.remove('hidden');
      } else {
        vr.classList.add('hidden');
      }
    }
  }

  // =====================================================================
  // GAME LOGIC
  // =====================================================================
  function workableYields(city) {
    var food = 2, prod = 2, gold = 2;  // base city tile (prod floor keeps early builds moving)
    var fb = (FACTIONS[state.civs[city.civ].faction] || {}).bonus || {};
    if (fb.food) food += fb.food;
    if (fb.prod) prod += fb.prod;
    if (fb.gold) gold += fb.gold;
    // Myrr — extra gold in coastal cities (their sea-trade identity)
    var coastalG = factionEff(state.civs[city.civ], 'coastalGold');
    if (coastalG && isCoastalCity(city)) gold += coastalG;
    // Wonder: Hanging Gardens — +2 food in every city of its owner
    var wb = state.wondersBuilt || {};
    if (wb.hanging_gardens === city.civ) food += BUILDINGS.hanging_gardens.perCityFood;
    if (wb.petra === city.civ) food += BUILDINGS.petra.perCityFood;          // +1 food/city
    if (wb.colossus === city.civ) gold += BUILDINGS.colossus.perCityGold;    // +1 gold/city
    if (wb.machu_picchu === city.civ) gold += BUILDINGS.machu_picchu.perCityGold; // +2 gold/city
    // Fresh-water bonus when the city itself sits on a river
    if (city.onRiver) { food += 1; gold += 1; }
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
      // River tile gives +1 food (fresh water for irrigation)
      if (t.river) f += 1;
      // Improvement bonus (data-driven from IMPROVEMENTS table)
      if (t.improvement && IMPROVEMENTS[t.improvement]) {
        var iy = IMPROVEMENTS[t.improvement].yield;
        if (iy.food) f += iy.food;
        if (iy.prod) p += iy.prod;
        if (iy.gold) g += iy.gold;
        // Tech upgrades to improvements: Mining boosts Mines, Agriculture boosts Farms
        var ctechs = state.civs[city.civ].techs;
        if (t.improvement === 'mine' && ctechs.mining) p += 1;
        if (t.improvement === 'farm' && ctechs.agriculture) f += 1;
      }
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
    if (city.buildings.aqueduct) food += BUILDINGS.aqueduct.food;
    if (city.buildings.harbor) { food += BUILDINGS.harbor.food; gold += BUILDINGS.harbor.gold; }
    if (city.buildings.market) gold += BUILDINGS.market.gold;
    if (city.buildings.bank) gold += BUILDINGS.bank.gold;
    if (city.buildings.hospital) food += BUILDINGS.hospital.food;
    if (city.buildings.stock_exchange) gold += BUILDINGS.stock_exchange.gold;
    if (city.buildings.corporation) gold += BUILDINGS.corporation.gold;
    // Production buildings (Workshop / Factory) — the first prod-yielding buildings
    if (city.buildings.workshop) prod += BUILDINGS.workshop.prod;
    if (city.buildings.factory) prod += BUILDINGS.factory.prod;
    if (city.buildings.ironworks) prod += BUILDINGS.ironworks.prod;   // National Wonder, +6 (local)
    // Mass Production: each Factory also yields +1 prod (mirrors Philosophy/Temple)
    var wcv = state.civs[city.civ];
    if (city.buildings.factory && wcv && wcv.techs && wcv.techs.mass_production) prod += 1;

    // Adjacency bonuses for gold-buildings (Market / Bank near rivers)
    gold += buildingAdjacency(city).gold;

    // Pyramids / Hoover Dam — +1 production in every city of the owner
    if (wb.pyramids === city.civ) prod += 1;
    if (wb.hoover_dam === city.civ) prod += 1;

    // Autocracy government — +1 production in every city (settled only)
    var cgov = activeGovernment(state.civs[city.civ]);
    if (cgov && cgov.perCityProd) prod += cgov.perCityProd;
    // Active edict production modifier (e.g. Mobilization +1 / Free Market -1)
    prod += edictEff(state.civs[city.civ], 'perCityProd');
    // Adopted civics (Total War) + Ideology (Order/Autocracy) — +production per city
    prod += civicSum(state.civs[city.civ], 'perCityProd') + ideologyEff(state.civs[city.civ], 'perCityProd');

    // Golden Age — flat +1 to each worked-tile yield bucket while active
    var gaCiv = state.civs[city.civ];
    if (gaCiv && gaCiv.goldenAgeTurns > 0) { food += GOLDEN_AGE_YIELD; prod += GOLDEN_AGE_YIELD; gold += GOLDEN_AGE_YIELD; }
    // Adopted civics — Agrarianism / Environmentalism +food; Ideology +food per city
    if (gaCiv) food += civicSum(gaCiv, 'perCityFood') + ideologyEff(gaCiv, 'perCityFood');
    // Religion beliefs (following city) + pantheon (all your cities): food / prod / gold.
    food += religionCityEff(city, 'food') + pantheonEff(wcv, 'food');   // Fertility / Fertility Rites
    prod += religionCityEff(city, 'prod') + pantheonEff(wcv, 'prod');   // Stewardship / God of the Forge
    gold += religionCityEff(city, 'gold') + pantheonEff(wcv, 'gold');   // Prosperity / God of Commerce

    // Power Plant — multiplies this city's accumulated production (positive only)
    if (city.buildings.power_plant && prod > 0) prod = Math.round(prod * (1 + BUILDINGS.power_plant.prodMultiplier));

    return { food: food, prod: prod, gold: gold };
  }

  function cityScience(city) {
    // Floor of 3/turn so the opening isn't a crawl — a lone pop-1 city still
    // researches early techs in a few turns. The flat floor helps the early game
    // far more (proportionally) than the late game.
    var sci = 3 + Math.floor((city.pop - 1) / 2);
    var b = city.buildings || {};
    if (b.library)    sci += BUILDINGS.library.sci;     // +2
    if (b.temple)     sci += BUILDINGS.temple.sci;      // +3
    if (b.university) sci += BUILDINGS.university.sci;  // +4
    if (b.observatory) sci += BUILDINGS.observatory.sci; // +5
    if (b.research_lab) sci += BUILDINGS.research_lab.sci; // +7
    if (b.oxford) sci += BUILDINGS.oxford.sci;           // National Wonder, +6 (local)
    // Philosophy: temples give an extra +1 science
    var civ = state.civs[city.civ];
    if (b.temple && civ && civ.techs && civ.techs.philosophy) sci += 1;
    // Astronomy: coastal cities study the stars and seas — +2 science
    if (civ && civ.techs && civ.techs.astronomy && isCoastalCity(city)) sci += 2;
    // Golden Age — +1 science per city while active
    if (civ && civ.goldenAgeTurns > 0) sci += GOLDEN_AGE_YIELD;
    // Adopted civics (Enlightenment) — +science per city
    if (civ) sci += civicSum(civ, 'perCitySci');
    sci += religionCityEff(city, 'sci') + pantheonEff(civ, 'sci');   // Scholarship / Goddess of Wisdom
    // Adjacency bonuses for science buildings
    sci += buildingAdjacency(city).sci;
    // Per-city wonder science: Library of Alexandria + University of Sankore
    var wb2 = state.wondersBuilt || {};
    if (wb2.library_of_alex === city.civ) sci += BUILDINGS.library_of_alex.perCitySci;
    if (wb2.university_of_sankore === city.civ) sci += BUILDINGS.university_of_sankore.perCitySci;
    if (wb2.internet === city.civ) sci += BUILDINGS.internet.perCitySci;
    if (wb2.singularity === city.civ) sci += BUILDINGS.singularity.perCitySci;   // +4
    return sci;
  }

  // Per-building adjacency table — checks the 6 hexes around the city tile.
  // City placement matters: a Library next to mountains, a University in a
  // forest, a Temple beside natural wonders, all earn extra yields.
  function buildingAdjacency(city) {
    var b = city.buildings || {};
    var out = { sci: 0, gold: 0 };
    // Cheap skip if no eligible building present
    if (!b.library && !b.university && !b.temple && !b.market && !b.bank) return out;
    var ns = neighborsAll(city.c, city.r);
    for (var i = 0; i < ns.length; i++) {
      if (!ns[i]) continue;
      var t = state.map[ns[i][1]][ns[i][0]];
      if (!t) continue;
      // Library — knowledge from the heights
      if (b.library    && (t.terrain === 'hills' || t.terrain === 'mountain')) out.sci += 1;
      // University — book inspiration from the canopy
      if (b.university && t.terrain === 'forest') out.sci += 1;
      // Temple — sacred sites
      if (b.temple     && (t.terrain === 'volcano' || t.terrain === 'geyser')) out.sci += 1;
      // Market — riverside trade
      if (b.market     && t.river) out.gold += 1;
      // Bank — riverside trade (stacks with market)
      if (b.bank       && t.river) out.gold += 1;
    }
    return out;
  }

  // Great-people culture generated per city per turn — Temple + the new culture
  // buildings (Amphitheater, Cathedral) + Notre Dame / Sistine Chapel wonders.
  function cityCulturePerTurn(ct, civId) {
    var c = 0;
    var b = ct.buildings || {};
    // The capital (your palace) radiates +2 culture from turn 1, so the civics
    // track actually trickles forward in the early game. Flat — it doesn't scale
    // with empire size, so it doesn't accelerate a late Cultural Ascendancy.
    if (ct.capital) c += 2;
    // Data-driven: any building with a `culture` field contributes it.
    for (var k in b) { if (b[k] && BUILDINGS[k] && BUILDINGS[k].culture) c += BUILDINGS[k].culture; }
    var wb = state.wondersBuilt || {};
    if (wb.notre_dame === civId) c += BUILDINGS.notre_dame.perCityCulture;
    if (wb.sistine_chapel === civId) c += BUILDINGS.sistine_chapel.perCityCulture;
    if (wb.eiffel_tower === civId) c += BUILDINGS.eiffel_tower.perCityCulture;
    if (wb.hagia_sophia === civId) c += BUILDINGS.hagia_sophia.perCityCulture;
    // Adopted civics that boost culture in every city
    var civ = state.civs[civId];
    if (civ) c += civicSum(civ, 'perCityCulture') + ideologyEff(civ, 'perCityCulture');
    c += religionCityEff(ct, 'culture') + pantheonEff(civ, 'culture');   // Piety belief / pantheon
    return c;
  }

  function recomputeIncome(civId) {
    var civ = state.civs[civId];
    var gpt = 0, spt = 0;
    civ.cities.forEach(function (ct) {
      var y = workableYields(ct);
      gpt += y.gold;
      spt += cityScience(ct);
    });
    // Upkeep: military units cost 1/turn, civilians free. Ferrum's Iron Legion
    // gets its first N military units upkeep-free.
    var upkeep = civ.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;
    upkeep = Math.max(0, upkeep - factionEff(civ, 'upkeepFree'));
    gpt -= upkeep;
    // City-state allies contribute mercantile / scientific perks
    if (state.civs.cs) {
      state.civs.cs.cities.forEach(function (csc) {
        if (csc.ally !== civId) return;
        var k = CS_KINDS[csc.kind];
        if (!k) return;
        if (k.goldPerTurn) gpt += k.goldPerTurn;
        if (k.sciPerTurn)  spt += k.sciPerTurn;
      });
    }
    // Big Ben wonder — +30% gold *income* (only boosts positive gpt; never
    // amplifies a deficit, since "+30% income" shouldn't make you bleed faster)
    if (state.wondersBuilt && state.wondersBuilt.big_ben === civId && gpt > 0) {
      gpt = Math.round(gpt * (1 + BUILDINGS.big_ben.goldMultiplier));
    }
    // Government — settled bonuses, or the anarchy tax while switching. Positive-
    // only halving so a deficit isn't amplified (mirrors the Big Ben guard).
    var gov = activeGovernment(civ);
    if (gov) {
      var nCities = civ.cities.length;
      if (gov.perCityGold) gpt += gov.perCityGold * nCities;
      if (gov.perCitySci)  spt += gov.perCitySci * nCities;
    } else if (civ.governmentTurns > 0) {
      if (gpt > 0) gpt = Math.round(gpt * 0.5);
      if (spt > 0) spt = Math.round(spt * 0.5);
    }
    // Active edict — applies independently of government/anarchy.
    if (activeEdict(civ)) {
      gpt += edictEff(civ, 'perCityGold') * civ.cities.length;
      spt += edictEff(civ, 'perCitySci') * civ.cities.length;
    }
    // Adopted civics (Guilds/Urbanization/Mercantilism gold, Enlightenment/Meritocracy
    // science) + Ideology (Freedom science)
    gpt += (civicSum(civ, 'perCityGold') + ideologyEff(civ, 'perCityGold')) * civ.cities.length;
    spt += (civicSum(civ, 'perCitySci') + ideologyEff(civ, 'perCitySci')) * civ.cities.length;
    gpt += tradeRouteGold(civId);   // peaceful income from active trade routes
    // Tithe belief — the founder earns gold per city worldwide following their faith.
    gpt += founderYield(civ, 'founderGold');
    // Difficulty economy handicap (AI rivals only): scale science, and scale gold
    // only when it's a surplus so a deficit is never amplified into bankruptcy.
    // Science is left unrounded (it's never shown for the AI) so the fractional
    // edge compounds through techProgress instead of collapsing adjacent tiers.
    var eco = aiEcoMult(civId, 'yield');
    if (eco !== 1) {
      spt = spt * eco;
      if (gpt > 0) gpt = Math.round(gpt * eco);
    }
    civ.goldPerTurn = gpt;
    civ.sciPerTurn = spt;
  }

  // ---- TRADE ROUTES — a peaceful income engine. A Caravan carries a route from
  // its home city to another city (yours, or a foreign/city-state at peace); the
  // route pays gold every turn, more for distance + city size, and 50% more if
  // international. An enemy military unit next to either endpoint disrupts it.
  function routeCityAt(c, r) { var t = tileAt(c, r); return t ? t.city : null; }
  function maxTradeRoutes(civ) { return Math.max(1, civ.cities.length); }
  function tradeRouteCount(civId) {
    return (state.tradeRoutes || []).reduce(function (n, rt) { return n + (rt.owner === civId ? 1 : 0); }, 0);
  }
  function routeExists(owner, home, city) {
    return (state.tradeRoutes || []).some(function (rt) {
      if (rt.owner !== owner) return false;
      var endA = (rt.fromC === home.c && rt.fromR === home.r && rt.toC === city.c && rt.toR === city.r);
      var endB = (rt.fromC === city.c && rt.fromR === city.r && rt.toC === home.c && rt.toR === home.r);
      return endA || endB;
    });
  }
  function routeBaseGold(rt) {
    var a = routeCityAt(rt.fromC, rt.fromR), b = routeCityAt(rt.toC, rt.toR);
    if (!a || !b) return 0;
    var dist = hexDist([rt.fromC, rt.fromR], [rt.toC, rt.toR]);
    var g = 2 + Math.round(dist * 0.5) + Math.floor((a.pop + b.pop) / 2);
    if (rt.intl) g = Math.round(g * 1.5);   // international routes are richer
    return g;
  }
  function cityHasAdjacentEnemy(owner, c, r) {
    var ns = neighbors(c, r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && t.unit && t.unit.civ !== owner && UNITS[t.unit.type] && !UNITS[t.unit.type].civilian && atWar(owner, t.unit.civ)) return true;
    }
    return false;
  }
  // A caravan can link to a city it's standing on (own) or adjacent to, that isn't
  // its home and isn't an enemy's. Returns that city, or null.
  function eligibleTradeCity(unit) {
    if (!unit || !unit.homeCity) return null;
    var spots = neighbors(unit.c, unit.r); spots.push([unit.c, unit.r]);
    for (var i = 0; i < spots.length; i++) {
      var t = tileAt(spots[i][0], spots[i][1]);
      if (!t || !t.city) continue;
      var city = t.city;
      if (city.c === unit.homeCity.c && city.r === unit.homeCity.r) continue;   // not the home city
      if (city.civ !== unit.civ && atWar(unit.civ, city.civ)) continue;          // can't trade with an enemy
      if (routeExists(unit.civ, unit.homeCity, city)) continue;                  // already linked
      return city;
    }
    return null;
  }
  function establishTradeRoute(unit) {
    var civ = state.civs[unit.civ];
    var home = unit.homeCity && routeCityAt(unit.homeCity.c, unit.homeCity.r);
    if (!home || home.civ !== unit.civ) { if (unit.civ === 'player') showToast('This caravan has lost its home city'); return false; }
    if (tradeRouteCount(unit.civ) >= maxTradeRoutes(civ)) { if (unit.civ === 'player') showToast('Trade route limit reached (' + maxTradeRoutes(civ) + ')'); return false; }
    var dest = eligibleTradeCity(unit);
    if (!dest) { if (unit.civ === 'player') showToast('Move the caravan next to another city first'); return false; }
    var route = { fromC: home.c, fromR: home.r, toC: dest.c, toR: dest.r, owner: unit.civ, intl: dest.civ !== unit.civ, gold: 0, disrupted: false };
    route.gold = routeBaseGold(route);
    state.tradeRoutes.push(route);
    killUnit(unit);   // the caravan is consumed establishing the route
    recomputeIncome(unit.civ);
    if (unit.civ === 'player') {
      sfxBuild();
      showToast('Trade route to ' + dest.name + '  +' + route.gold + ' gold/turn', 'success');
      logEvent('Trade route opened: ' + home.name + ' ↔ ' + dest.name + ' (+' + route.gold + ' gold/turn' + (route.intl ? ', international' : '') + ')', 'success');
      chronicle('Opened a trade route between ' + home.name + ' and ' + dest.name + '.');
      queueYieldFx(dest.c, dest.r, '⇄ +' + route.gold, '#ffd34d', 'rgba(255,211,77,0.30)');
    }
    return true;
  }
  // Gold per turn from all of a civ's active (non-disrupted) trade routes.
  function tradeRouteGold(civId) {
    return (state.tradeRoutes || []).reduce(function (g, rt) {
      return g + (rt.owner === civId && !rt.disrupted ? (rt.gold || 0) : 0);
    }, 0);
  }
  // Per-turn maintenance: prune dead routes, refresh gold (cities grow) + disruption.
  function updateTradeRoutes() {
    if (!Array.isArray(state.tradeRoutes)) { state.tradeRoutes = []; return; }
    state.tradeRoutes = state.tradeRoutes.filter(function (rt) {
      var a = routeCityAt(rt.fromC, rt.fromR), b = routeCityAt(rt.toC, rt.toR);
      if (!a || !b) return false;                                   // an endpoint city is gone
      if (a.civ !== rt.owner) return false;                         // owner lost the home city
      if (b.civ !== rt.owner && atWar(rt.owner, b.civ)) return false; // partner is now an enemy
      return true;
    });
    state.tradeRoutes.forEach(function (rt) {
      rt.gold = routeBaseGold(rt);
      rt.disrupted = cityHasAdjacentEnemy(rt.owner, rt.fromC, rt.fromR) || cityHasAdjacentEnemy(rt.owner, rt.toC, rt.toR);
    });
  }

  // Returns the militaristic CS-ally attack bonus for civId (0 if none allied).
  function csMilitaryBonus(civId) {
    if (!state.civs.cs) return 0;
    var n = 0;
    state.civs.cs.cities.forEach(function (csc) {
      if (csc.ally === civId && csc.kind === 'militaristic') n += CS_KINDS.militaristic.militaryAtk;
    });
    return n;
  }

  function moveUnit(unit, c, r) {
    var t = tileAt(c, r);
    if (!t) return false;
    if (!canEnterTile(unit, t)) { showToast('Impassable terrain'); return false; }
    if (t.unit && t.unit.civ === unit.civ) { showToast('Friendly unit there'); return false; }
    if (unit.moves <= 0) { showToast('No moves left'); return false; }

    // Combat if enemy (only if at war)
    if (t.unit && t.unit.civ !== unit.civ) {
      if (!atWar(unit.civ, t.unit.civ)) { showToast('At peace'); return false; }
      return attack(unit, t.unit);
    }
    // Capture enemy city if no defender (only military units can capture, only at war)
    if (t.city && t.city.civ !== unit.civ && atWar(unit.civ, t.city.civ)) {
      var capture = !t.unit;
      if (!capture) return attack(unit, t.unit);
      if (!UNITS[unit.type].civilian) {
        captureCity(t.city, unit.civ);
      }
    }
    // Move
    var oldT = tileAt(unit.c, unit.r);
    if (oldT) oldT.unit = null;
    unit.c = c; unit.r = r;
    unit.moves = Math.max(0, unit.moves - 1);
    unit.fortified = false;
    if (!UNITS[unit.type].naval) unit.embarked = (t.terrain === 'water');   // land units embark at sea
    // Zone of Control — advancing adjacent to an enemy military unit ends the
    // move (walkPath stops on moves<=0). Can't sprint past a defender's line.
    if (!UNITS[unit.type].civilian && unit.moves > 0 && inEnemyZoC(unit)) unit.moves = 0;
    t.unit = unit;
    if (unit.civ === 'player') {
      sfxMove();
      // Reveal fog immediately around the new position. AI visibility is recomputed
      // at the turn boundary; only the player's view drives rendering, so we skip
      // the work for AI moves.
      recomputeVisibility('player');
    }
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
    if (!atWar(attacker.civ, defender.civ)) { showToast('At peace'); return false; }
    var ratio = combatRatio(attacker, defender);

    var dmgToDef = Math.round(12 * ratio + rndInt(0, 3));
    var dmgToAtk = Math.round(12 * (1 - ratio) + rndInt(0, 3));

    defender.hp -= dmgToDef;
    attacker.hp -= dmgToAtk;
    attacker.moves = 0;

    // Combat animations + sound
    addCombatFx(defender.c, defender.r, dmgToDef, dmgToAtk, attacker.c, attacker.r);
    if (attacker.civ === 'player' || defender.civ === 'player') sfxAttack();

    var msg = aDef.name + ' ' + dmgToDef + ' / took ' + dmgToAtk;
    showToast(msg, attacker.civ === 'player' ? 'success' : 'error');

    if (defender.hp <= 0) {
      // Kill tracking & promotions
      attacker.kills = (attacker.kills || 0) + 1;
      if (attacker.civ === 'player') {
        state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1;
        if (defender.civ === 'barb') { state.stats.barbsDefeated = (state.stats.barbsDefeated || 0) + 1; checkCsQuests(); }
        // Every 4th kill marks the field — future archaeology (living history)
        if (state.stats.unitsKilled % 4 === 0) addDigSite(defender.c, defender.r, 'a great battlefield');
      }
      if (defender.civ === 'player') state.stats.unitsLost = (state.stats.unitsLost || 0) + 1;
      killUnit(defender);
      checkPromotion(attacker);
      if (attacker.hp > 0) { var hk = factionEff(state.civs[attacker.civ], 'healOnKill'); if (hk) attacker.hp = Math.min(attacker.maxHp, attacker.hp + hk); }  // Vorne
      // Only move in and capture if the attacker survived
      if (attacker.hp > 0) {
        var oldT = tileAt(attacker.c, attacker.r);
        if (oldT) oldT.unit = null;
        attacker.c = defender.c; attacker.r = defender.r;
        var newT = tileAt(attacker.c, attacker.r);
        if (newT.city && newT.city.civ !== attacker.civ) captureCity(newT.city, attacker.civ);
        newT.unit = attacker;
        // Reveal fog around the new position for the player (matches moveUnit)
        if (attacker.civ === 'player') recomputeVisibility('player');
      }
    }
    if (attacker.hp <= 0) {
      if (defender.civ !== 'player' && attacker.civ === 'player') state.stats.unitsLost = (state.stats.unitsLost || 0) + 1;
      // Defender gets kill credit if attacker dies from counter-damage
      if (defender.hp > 0) {
        defender.kills = (defender.kills || 0) + 1;
        if (defender.civ === 'player') { state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1; if (attacker.civ === 'barb') { state.stats.barbsDefeated = (state.stats.barbsDefeated || 0) + 1; checkCsQuests(); } }
        checkPromotion(defender);
      }
      killUnit(attacker);
    }
    return true;
  }

  function atkTechBonus(unit) {
    var bonus = 0;
    if (state.civs[unit.civ].techs.iron && unit.type === 'warrior') bonus += 2;
    // Rifling sharpens gunpowder infantry
    if (state.civs[unit.civ].techs.rifling && (unit.type === 'musketman' || unit.type === 'rifleman')) bonus += 1;
    var f = FACTIONS[state.civs[unit.civ].faction];
    if (f && f.bonus && f.bonus.atk && !UNITS[unit.type].civilian) bonus += f.bonus.atk;
    // Militaristic city-state ally bonus
    if (!UNITS[unit.type].civilian) bonus += csMilitaryBonus(unit.civ);
    // Statue of Liberty / West Point — +1 ATK on all military units of the owner
    if (!UNITS[unit.type].civilian && state.wondersBuilt) {
      if (state.wondersBuilt.statue_liberty === unit.civ) bonus += BUILDINGS.statue_liberty.militaryAtk;
      if (state.wondersBuilt.west_point === unit.civ) bonus += BUILDINGS.west_point.militaryAtk;
    }
    // Autocracy government + War Footing edict + Nationalism civic — +ATK on military
    if (!UNITS[unit.type].civilian) {
      var ugov = activeGovernment(state.civs[unit.civ]);
      if (ugov && ugov.unitAtk) bonus += ugov.unitAtk;
      bonus += edictEff(state.civs[unit.civ], 'unitAtk');
      bonus += civicSum(state.civs[unit.civ], 'unitAtk') + ideologyEff(state.civs[unit.civ], 'unitAtk');
    }
    // Unit promotion attack bonus
    bonus += (unit.promoAtk || 0);
    // Carrier aura — a friendly Carrier on an adjacent tile lends +1 attack.
    if (!UNITS[unit.type].civilian) {
      var cns = neighbors(unit.c, unit.r);
      for (var ci = 0; ci < cns.length; ci++) {
        var ctt = tileAt(cns[ci][0], cns[ci][1]);
        if (ctt && ctt.unit && ctt.unit.civ === unit.civ && UNITS[ctt.unit.type] && UNITS[ctt.unit.type].carrier) { bonus += 1; break; }
      }
    }
    // Great General bonus
    var gb = state.civs[unit.civ].generalBonus;
    if (gb && gb.turnsLeft > 0 && !UNITS[unit.type].civilian) bonus += gb.atk;
    // Difficulty AI attack bonus
    if (unit.civ !== 'player') {
      var diff = DIFFICULTIES[state.difficulty || 'normal'] || DIFFICULTIES.normal;
      bonus += diff.aiAtkBonus;
    }
    return bonus;
  }

  // PROMOTIONS — every 2 kills a unit earns a promotion. The PLAYER picks 1 of 2
  // (so the 30-unit roster expresses a playstyle); the AI auto-picks by
  // personality. Stat promos stack; ability promos are once-each flags folded
  // into combat (atkTechBonus/combatRatio) and movement.
  var PROMOTIONS = {
    str:   { name: 'Strength', icon: '⚔', desc: '+1 attack',           apply: function (u) { u.promoAtk = (u.promoAtk || 0) + 1; } },
    armor: { name: 'Armor',    icon: '🛡', desc: '+1 defense',          apply: function (u) { u.promoDef = (u.promoDef || 0) + 1; } },
    vigor: { name: 'Vigor',    icon: '♥', desc: '+2 max HP',           apply: function (u) { u.promoHp = (u.promoHp || 0) + 1; u.maxHp += 2; u.hp = Math.min(u.maxHp, u.hp + 2); } },
    siege: { name: 'Siege',    icon: '⚒', desc: '+50% vs cities', once: 'promoSiege', apply: function (u) { u.promoSiege = true; } },
    cover: { name: 'Cover',    icon: '◈', desc: '+50% def vs ranged', once: 'promoCover', apply: function (u) { u.promoCover = true; } },
    blitz: { name: 'Blitz',    icon: '»', desc: '+1 movement',        once: 'promoBlitz', apply: function (u) { u.promoBlitz = true; u.maxMoves = (u.maxMoves || UNITS[u.type].move) + 1; } }
  };
  var PROMO_STATS = ['str', 'armor', 'vigor'];
  var PROMO_ABILITIES = ['siege', 'cover', 'blitz'];
  function eligiblePromotions(u) {
    var pool = PROMO_STATS.slice();
    PROMO_ABILITIES.forEach(function (id) { if (!u[PROMOTIONS[id].once]) pool.push(id); });
    return pool;
  }
  // Two distinct options for a player promotion — always at least one plain stat.
  function promotionOptions(u) {
    var pool = shuffle(eligiblePromotions(u));
    var pick = pool.slice(0, 2);
    if (pick.length < 2) pick = PROMO_STATS.slice(0, 2);
    if (!pick.some(function (id) { return PROMO_STATS.indexOf(id) >= 0; })) {
      pick[1] = PROMO_STATS[Math.floor(rnd() * PROMO_STATS.length)];
    }
    if (pick[0] === pick[1]) pick[1] = PROMO_STATS.filter(function (s) { return s !== pick[0]; })[0];
    return pick;
  }
  function applyPromotion(u, id) {
    var p = PROMOTIONS[id]; if (!p) return;
    p.apply(u);
    u.promos = (u.promos || 0) + 1;
  }
  function aiPickPromotion(u) {
    var pool = eligiblePromotions(u);
    var per = (state.civs[u.civ] || {}).personality;
    var pref = (per === 'aggressive' || per === 'warmonger') ? ['siege', 'str', 'blitz', 'armor', 'vigor', 'cover']
             : (per === 'peaceful' || per === 'scientific')  ? ['armor', 'cover', 'vigor', 'str', 'siege', 'blitz']
             : ['str', 'armor', 'vigor', 'siege', 'cover', 'blitz'];
    for (var i = 0; i < pref.length; i++) if (pool.indexOf(pref[i]) >= 0) { applyPromotion(u, pref[i]); return; }
    applyPromotion(u, pool[0] || 'str');
  }
  // First living player unit awaiting a promotion choice, or null.
  function findPendingPromoUnit() {
    var pl = state.civs.player;
    if (!pl) return null;
    return pl.units.find(function (x) { return (x.pendingPromo || 0) > 0 && x.hp > 0; }) || null;
  }
  // Show the 1-of-2 promotion choice (reuses the action-list modal). Chaining:
  // after a choice, present the next pending promotion, if any.
  function presentPromotion(u) {
    if (!u) return;
    var opts = promotionOptions(u);
    var more = (u.pendingPromo || 0) - 1;
    var actions = [{ header: true, disabled: true, icon: '★', title: UNITS[u.type].name + ' promoted!',
      sub: 'Level ' + ((u.promos || 0) + 1) + ' · choose an upgrade' + (more > 0 ? ' · +' + more + ' more pending' : '') }];
    opts.forEach(function (id) {
      var p = PROMOTIONS[id];
      actions.push({ icon: p.icon, primary: true, title: p.name, sub: p.desc, do: function () {
        applyPromotion(u, id);
        u.pendingPromo = Math.max(0, (u.pendingPromo || 0) - 1);
        sfxPromote();
        logEvent(UNITS[u.type].name + ' promoted — ' + p.name, 'success');
        var nxt = findPendingPromoUnit();
        if (nxt) presentPromotion(nxt); else { closeModal(); draw(); }
      } });
    });
    renderDiplomacyActions(actions, 'Promotion');
  }
  // Present a pending promotion now if it's safe (player's view, no modal up).
  function maybePresentPromotion() {
    if (aiThinking || openModal) return;
    var u = findPendingPromoUnit();
    if (u) presentPromotion(u);
  }
  function checkPromotion(unit) {
    if (!unit || unit.hp <= 0 || UNITS[unit.type].civilian) return;
    // Military XP for great general
    var civ = state.civs[unit.civ];
    if (civ && civ.greatPoints) civ.greatPoints.military += 5;
    var earned = Math.floor((unit.kills || 0) / 2);
    var newOnes = earned - ((unit.promos || 0) + (unit.pendingPromo || 0));
    if (newOnes <= 0) return;
    if (unit.civ === 'player') {
      unit.pendingPromo = (unit.pendingPromo || 0) + newOnes;
      maybePresentPromotion();   // pops now if it's the player's turn and no modal
    } else {
      for (var i = 0; i < newOnes; i++) aiPickPromotion(unit);
    }
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
    // Fresh-water city: founded directly on a river (or on a tile adjacent to river/water? keep it strict)
    var onRiver = !!t.river;
    var city = {
      civ: unit.civ,
      name: name,
      c: unit.c, r: unit.r,
      pop: 1,
      food: 0,
      foodCap: 10,
      prod: 0,
      buildings: {},
      // Player picks production explicitly; AI defaults to a warrior (its
      // faction unique if any) so its cities never sit idle.
      producing: unit.civ === 'player' ? null : factionUnitFor(civ, 'warrior'),
      queue: [],            // up to 3 items to auto-build after current
      capital: isCapital,
      originalCiv: isCapital ? unit.civ : null,   // tracks who founded this capital for domination check
      onRiver: onRiver,
      foundedTurn: state.turn
    };
    civ.cities.push(city);
    t.city = city;
    killUnit(unit);
    recomputeBorders();
    showToast('Founded ' + name, 'success');
    if (unit.civ === 'player') chronicle(isCapital ? 'Founded your first city, ' + name + '.' : 'Founded the city of ' + name + '.');
    // Planting a city next to a rival's territory irritates them right away.
    AI_SIDES.forEach(function (aiId) {
      if (aiId === unit.civ) return;
      var aic = state.civs[aiId];
      if (!aic) return;
      var crowds = aic.cities.some(function (cc) { return hexDist([city.c, city.r], [cc.c, cc.r]) <= TENSION_PROX_RANGE; });
      if (crowds) addTension(aiId, unit.civ, TENSION_FOUND_SPIKE, 'proximity');
    });
    if (unit.civ === 'player') {
      sfxFound();
      logEvent('Choose production for ' + name, 'info');
      checkCsQuests();   // founding may satisfy a "control N cities" quest
      // Auto-open the city screen so the player picks immediately
      setTimeout(function () { openCity(city); }, 350);
    }
  }

  function captureCity(city, newOwnerId) {
    var oldOwner = state.civs[city.civ];
    var oldOwnerId = oldOwner.id;
    // Losing a city to someone is the deepest grievance there is.
    if (AI_SIDES.indexOf(oldOwnerId) >= 0 && oldOwnerId !== newOwnerId) {
      addTension(oldOwnerId, newOwnerId, TENSION_CAPTURE_SPIKE, 'capture');
      if (newOwnerId === 'player') remember(oldOwnerId, 'You stormed our city of ' + city.name);
    }
    if (newOwnerId === 'player' && oldOwnerId !== 'player') chronicle('Conquered ' + city.name + ' from ' + leaderOf(oldOwnerId).name + '.');
    else if (oldOwnerId === 'player' && newOwnerId !== 'player') chronicle('Lost ' + city.name + ' to ' + leaderOf(newOwnerId).name + '.');
    // Barbarian raiders pillage and burn — they don't keep cities.
    if (newOwnerId === 'barb') {
      var idx0 = oldOwner.cities.indexOf(city);
      if (idx0 >= 0) oldOwner.cities.splice(idx0, 1);
      var t0 = tileAt(city.c, city.r);
      if (t0) t0.city = null;
      if (oldOwnerId === 'player') logEvent(city.name + ' was razed by raiders!', 'error');
      showToast(city.name + ' razed by raiders!', 'error');
      addDigSite(city.c, city.r, 'the ruins of ' + city.name);   // the world remembers
      recomputeBorders();
      recomputeVisibility(oldOwnerId);
      recomputeIncome(oldOwnerId);
      return;
    }
    var idx = oldOwner.cities.indexOf(city);
    if (idx >= 0) oldOwner.cities.splice(idx, 1);
    var wasCityState = oldOwnerId === 'cs';
    city.civ = newOwnerId;
    city.pop = Math.max(1, city.pop - 1);
    city.producing = 'warrior';
    city.unrest = (city.unrest || 0) + UNREST_CAPTURE_SPIKE;   // fresh conquest is restless
    city.revoltTurns = 0;
    if (wasCityState) {
      // Strip city-state flavour — it's now a normal city
      city.kind = null;
      city.ally = null;
      city.isCityState = false;
      city.foodCap = 10;            // unlock growth from the static 999 cap
      city.foundedTurn = state.turn;
      // Loot + log
      state.civs[newOwnerId].gold += CS_LOOT_GOLD;
      if (newOwnerId === 'player') {
        showToast('Sacked ' + city.name + ' (+' + CS_LOOT_GOLD + 'g)', 'success');
        logEvent('Conquered city-state ' + city.name + ' (+' + CS_LOOT_GOLD + ' gold)', 'success');
      } else {
        logEvent(CIVS[newOwnerId].name + ' conquered ' + city.name, 'info');
      }
      // Any allies of this city-state lose the perk
      // (csc was sole reference; nothing else to clear besides csc.ally above)
    }
    state.civs[newOwnerId].cities.push(city);
    // Transfer any wonders the city contains — the conqueror inherits the bonus,
    // the old owner loses it on their remaining cities.
    if (city.buildings) {
      for (var bk in city.buildings) {
        if (!BUILDINGS[bk] || !BUILDINGS[bk].wonder) continue;
        if (state.wondersBuilt && state.wondersBuilt[bk] === oldOwnerId) {
          state.wondersBuilt[bk] = newOwnerId;
        }
      }
    }
    // Conquest Surge — capturing a city rewards the aggressor with a short
    // Golden Age, reusing the same timer (rewards the domination path).
    if (CIV_SIDES.indexOf(newOwnerId) >= 0) {
      triggerGoldenAge(state.civs[newOwnerId], CONQUEST_SURGE_LENGTH, newOwnerId === 'player', 'Conquest Surge');
    }
    recomputeBorders();
    recomputeVisibility(newOwnerId);
    recomputeVisibility(oldOwnerId);            // old owner loses sight around the lost city
    recomputeIncome(newOwnerId);
    recomputeIncome(oldOwnerId);
    showToast('Captured ' + city.name + '!', newOwnerId === 'player' ? 'success' : 'error');

    // Domination victory: capturing civ holds every rival's ORIGINAL capital.
    // We count how many rival original capitals this civ controls vs how many rivals exist.
    var rivalCount = CIV_SIDES.length - 1;
    var capturedRivalCapitals = 0;
    var subduedRivals = {};                                   // capital held OR vassalized
    state.civs[newOwnerId].cities.forEach(function (ct) {
      if (ct.capital && ct.originalCiv && ct.originalCiv !== newOwnerId) {
        subduedRivals[ct.originalCiv] = 1;
      }
    });
    CIV_SIDES.forEach(function (rid) {
      if (rid !== newOwnerId && state.vassals && state.vassals[rid] === newOwnerId) subduedRivals[rid] = 1;
    });
    capturedRivalCapitals = Object.keys(subduedRivals).length;
    if (capturedRivalCapitals >= rivalCount) declareVictory(newOwnerId, 'domination');
  }

  // Pull the next *still-valid* queued production. Skip items that became
  // invalid since they were queued (wonder taken, regular building already
  // owned). Returns null if the queue empties without a hit.
  function popQueuedProduction(city) {
    if (!Array.isArray(city.queue) || city.queue.length === 0) return null;
    if (!city.buildings) city.buildings = {};
    while (city.queue.length) {
      var next = city.queue.shift();
      if (BUILDINGS[next]) {
        if (BUILDINGS[next].wonder) {
          if (state.wondersBuilt && state.wondersBuilt[next]) continue;   // race lost
        } else if (city.buildings[next]) {
          continue;   // already built
        }
      }
      // Units always remain valid
      return next;
    }
    return null;
  }

  function processCity(city) {
    var y = workableYields(city);

    // Stability / unrest — bank the net change, clamp, and track open revolt.
    // A city with no net pressure slowly RECOVERS (drifts back to calm) so a
    // revolt is always a recoverable hazard, never a permanent state.
    if (typeof city.unrest !== 'number') city.unrest = 0;
    if (city.religionLockTurns > 0) city.religionLockTurns--;   // conversion immunity wears off
    var uDelta = cityUnrestDelta(city);
    if (uDelta <= 0) uDelta -= 1;   // passive recovery when content keeps pace
    city.unrest = Math.max(0, Math.min(city.pop * UNREST_CAP_MULT, city.unrest + uDelta));
    var revolting = cityRevolting(city);
    if (revolting) {
      if (!city.revoltTurns && city.civ === 'player') showToast(city.name + ' is on the brink of revolt!', 'error');
      city.revoltTurns = (city.revoltTurns || 0) + 1;
    } else {
      city.revoltTurns = 0;
    }

    // Growth — difficulty scales an AI city's food SURPLUS only (a deficit still
    // starves at full rate; we never make higher difficulty starve the AI faster).
    var net = y.food - city.pop * 2;
    if (net > 0) net *= aiEcoMult(city.civ, 'growth');
    city.food += net;
    if (city.food < 0) {
      city.pop = Math.max(1, city.pop - 1);
      city.food = 0;
      if (city.civ === 'player') logEvent(city.name + ' starved (pop ' + city.pop + ')', 'error');
    }
    if (city.food >= city.foodCap) {
      city.pop += 1;
      city.food = 0;
      city.foodCap = 8 + city.pop * 5;
      if (city.civ === 'player') { logEvent(city.name + ' grew to pop ' + city.pop, 'success'); queueYieldFx(city.c, city.r, '+1 pop', '#7bff9d', 'rgba(0,255,136,0.30)'); }
    }

    // Production — a city in open revolt produces nothing this turn. AI rivals'
    // output is scaled by the difficulty yield handicap.
    city.prod += (revolting ? 0 : y.prod) * aiEcoMult(city.civ, 'yield');
    var p = city.producing;
    var cost = 0, isBuilding = false;
    if (UNITS[p]) cost = UNITS[p].cost;
    else if (BUILDINGS[p]) { cost = BUILDINGS[p].cost; isBuilding = true; }

    if (cost > 0 && city.prod >= cost) {
      city.prod -= cost;
      if (isBuilding) {
        var bdef = BUILDINGS[p];
        // Spaceship Part — repeatable; each completion adds one part toward the
        // Space Race launch (doesn't become a city building).
        if (bdef.spacePart) {
          completeSpacePart(city);
        } else if (bdef.national) {
          // National wonder — one per empire, effect local to this city.
          city.buildings[p] = true;
          if (!state.civs[city.civ].nationals) state.civs[city.civ].nationals = {};
          state.civs[city.civ].nationals[p] = true;
          applyWonderOneShot(city, p);
          if (city.civ === 'player') { logEvent(city.name + ' completed ' + bdef.name, 'success'); chronicle('Built the national project ' + bdef.name + ' in ' + city.name + '.'); sfxWonder(); queueYieldFx(city.c, city.r, '★ ' + bdef.name, '#ffd34d', 'rgba(255,211,77,0.40)'); }
          else logEvent(CIVS[city.civ].name + ' completed ' + bdef.name, 'info');
        // World wonders are unique globally. If someone else built it first
        // while this city was producing it, refund prod and reroll.
        } else if (bdef.wonder) {
          if (state.wondersBuilt[p]) {
            // Race lost — banked production is forfeit (otherwise a lost race would
            // pop a free warrior the next turn). Pick a sensible default.
            city.prod = 0;
            city.producing = factionUnitFor(state.civs[city.civ], 'warrior');
            if (city.civ === 'player') { logEvent('Lost the race for ' + bdef.name, 'error'); chronicle('Lost the race to build ' + bdef.name + '.'); }
          } else {
            city.buildings[p] = true;
            state.wondersBuilt[p] = city.civ;
            applyWonderOneShot(city, p);
            if (city.civ === 'player') { logEvent(city.name + ' built ' + bdef.name + ' (wonder)', 'success'); chronicle('Completed the wonder of ' + bdef.name + ' in ' + city.name + '.'); sfxWonder(); queueYieldFx(city.c, city.r, '✦ ' + bdef.name, '#ffd34d', 'rgba(255,211,77,0.40)'); }
            else logEvent(CIVS[city.civ].name + ' built ' + bdef.name, 'error');
          }
        } else {
          city.buildings[p] = true;
          if (city.civ === 'player') { logEvent(city.name + ' built ' + bdef.name, 'success'); queueYieldFx(city.c, city.r, '✓ ' + bdef.name, '#7ce5ff', 'rgba(0,212,255,0.25)'); }
        }
      } else {
        var spawnTile = findSpawnTile(city, p);
        if (spawnTile) {
          spawnUnit(city.civ, p, spawnTile[0], spawnTile[1]);
          // Barracks / Heroic Epic — new military units muster pre-trained.
          var trained = tileAt(spawnTile[0], spawnTile[1]);
          if (trained && trained.unit && !UNITS[p].civilian && (city.buildings.barracks || city.buildings.heroic_epic)) {
            aiPickPromotion(trained.unit);   // auto-applies one promotion (no modal)
            if (city.buildings.heroic_epic) aiPickPromotion(trained.unit);   // Heroic Epic adds a second
          }
          // A Caravan remembers the city that built it, so it can run a route home.
          if (trained && trained.unit && UNITS[p].trade) trained.unit.homeCity = { c: city.c, r: city.r };
          if (city.civ === 'player') logEvent(city.name + ' trained ' + UNITS[p].name, 'success');
        }
      }
      // Production completion notification + sound
      if (city.civ === 'player') {
        sfxBuild();
        // Prefer the player's queued plan over the default
        var nextProd = popQueuedProduction(city) || pickNextProduction(city);
        var nextName = UNITS[nextProd] ? UNITS[nextProd].name : (BUILDINGS[nextProd] ? BUILDINGS[nextProd].name : nextProd);
        logEvent(city.name + ' now producing ' + nextName, 'info');
        city.producing = nextProd;
      } else {
        city.producing = pickNextProduction(city);
      }
    }

    // Sustained revolt (2+ turns over the line) spawns a rebel and vents the
    // pressure, so unrest is a managed hazard, not a permanent lock.
    if (city.revoltTurns >= 2 && spawnRebelNear(city)) {
      city.revoltTurns = 0;
      city.unrest = Math.floor(revoltThreshold(city) * 0.6);
      if (city.civ === 'player') { logEvent('Rebels rise up near ' + city.name + '!', 'error'); showToast('Revolt! Rebels near ' + city.name, 'error'); }
      else logEvent('Rebels rise against ' + (CIVS[city.civ] ? CIVS[city.civ].name : city.civ) + ' near ' + city.name, 'info');
    }
  }

  // Spawn a barbarian rebel on a free tile next to a revolting city.
  function spawnRebelNear(city) {
    var ns = neighbors(city.c, city.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && !t.unit && !t.city && !TERRAIN[t.terrain].impassable && t.terrain !== 'water') {
        spawnUnit('barb', 'raider', ns[i][0], ns[i][1]);
        return true;
      }
    }
    return false;
  }

  // City bombardment — each city fires at one adjacent enemy per turn
  function cityBombard(city) {
    var ns = neighbors(city.c, city.r);
    var targets = [];
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && t.unit && t.unit.civ !== city.civ && atWar(city.civ, t.unit.civ)) {
        targets.push(t.unit);
      }
    }
    if (targets.length === 0) return;
    // Fire at the weakest adjacent enemy
    targets.sort(function (a, b) { return a.hp - b.hp; });
    var target = targets[0];

    // City attack power: base 3 + pop + 2 if walls (or a Tellus Bastion)
    var atkPower = 3 + city.pop + ((city.buildings.walls || city.buildings.bastion) ? 2 : 0);
    var dDef = UNITS[target.type];
    var dBonus = 0;
    var dTile = tileAt(target.c, target.r);
    if (dTile && TERRAIN[dTile.terrain].defBonus) dBonus += TERRAIN[dTile.terrain].defBonus;
    if (target.fortified) dBonus += 0.25;
    var dPower = dDef.def * (1 + dBonus);
    var ratio = atkPower / (atkPower + dPower);

    var dmg = Math.max(1, Math.round(8 * ratio + rndInt(0, 2)));
    target.hp -= dmg;

    // Visual feedback
    addCityBombardFx(target.c, target.r, dmg);

    var isPlayerCity = city.civ === 'player';
    var isPlayerTarget = target.civ === 'player';
    if (isPlayerCity) {
      logEvent(city.name + ' bombarded ' + UNITS[target.type].name + ' for ' + dmg, 'success');
    } else if (isPlayerTarget) {
      logEvent(CIVS[city.civ].name + '\'s ' + city.name + ' bombarded your ' + UNITS[target.type].name + ' for ' + dmg, 'error');
    }

    if (target.hp <= 0) {
      if (isPlayerCity) state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1;
      if (isPlayerTarget) state.stats.unitsLost = (state.stats.unitsLost || 0) + 1;
      killUnit(target);
      if (isPlayerCity) logEvent('City bombardment killed ' + UNITS[target.type].name + '!', 'success');
    }
  }

  function applyWonderOneShot(city, wid) {
    var bdef = BUILDINGS[wid];
    if (!bdef) return;
    var civ = state.civs[city.civ];
    if (bdef.oneShotScience) {
      civ.techProgress = (civ.techProgress || 0) + bdef.oneShotScience;
    }
    if (bdef.spaceParts) {   // Apollo Program — a head start toward launch
      civ.spaceParts = (civ.spaceParts || 0) + bdef.spaceParts;
      checkSpaceVictory(civ);
    }
  }
  // Space Race: completing SPACE_PARTS_NEEDED spaceship parts launches + wins.
  function completeSpacePart(city) {
    var civ = state.civs[city.civ];
    civ.spaceParts = (civ.spaceParts || 0) + 1;
    if (city.civ === 'player') {
      sfxWonder();
      logEvent('Spaceship part assembled (' + civ.spaceParts + '/' + SPACE_PARTS_NEEDED + ')', 'success');
      chronicle('Assembled spaceship part ' + civ.spaceParts + '/' + SPACE_PARTS_NEEDED + '.');
      queueYieldFx(city.c, city.r, '🚀 ' + civ.spaceParts + '/' + SPACE_PARTS_NEEDED, '#7ce5ff', 'rgba(0,212,255,0.30)');
    } else {
      logEvent((CIVS[city.civ] ? CIVS[city.civ].name : city.civ) + ' assembled a spaceship part', 'info');
    }
    checkSpaceVictory(civ);
  }
  function checkSpaceVictory(civ) {
    if (!state.victory && (civ.spaceParts || 0) >= SPACE_PARTS_NEEDED) declareVictory(civ.id, 'space');
  }

  function isCoastalCity(city) {
    var ns = neighbors(city.c, city.r);
    for (var i = 0; i < ns.length; i++) {
      var t = tileAt(ns[i][0], ns[i][1]);
      if (t && t.terrain === 'water') return true;
    }
    return false;
  }

  function findSpawnTile(city, unitType) {
    var udef = unitType && UNITS[unitType];
    if (udef && udef.naval) {
      // Naval units spawn on adjacent water
      var ns = neighbors(city.c, city.r);
      for (var i = 0; i < ns.length; i++) {
        var t = tileAt(ns[i][0], ns[i][1]);
        if (t && t.terrain === 'water' && !t.unit) return ns[i];
      }
      return null;
    }
    var ct = tileAt(city.c, city.r);
    if (ct && !ct.unit) return [city.c, city.r];
    var ns2 = neighbors(city.c, city.r);
    for (var i = 0; i < ns2.length; i++) {
      var t = tileAt(ns2[i][0], ns2[i][1]);
      if (t && !TERRAIN[t.terrain].impassable && !t.unit) return ns2[i];
    }
    return null;
  }

  function pickNextProduction(city) {
    var civ = state.civs[city.civ];
    // AI with only one city should prioritize a settler for expansion
    if (AI_SIDES.indexOf(city.civ) >= 0 && civ.cities.length < 2) return 'settler';
    var available = availableProducibles(civ, city);
    if (AI_SIDES.indexOf(city.civ) >= 0) {
      var per = AI_PERSONALITIES[civ.personality] || AI_PERSONALITIES.aggressive;
      // Wonder chase (personality-adjusted)
      var wonders = available.filter(function (k) { return BUILDINGS[k] && BUILDINGS[k].wonder; });
      if (wonders.length && rnd() < per.wonderChance) return wonders[Math.floor(rnd() * wonders.length)];
      // Regular buildings — weighted by personality to pick the "right" ones first
      var regBldgs = available.filter(function (k) { return BUILDINGS[k] && !BUILDINGS[k].wonder && !city.buildings[k]; });
      if (regBldgs.length && rnd() < per.buildingChance) {
        // Sort by personality preference, then pick the top one
        var SCI_BLDGS = { library: 1, university: 1, temple: 1, observatory: 1 };
        var GOLD_BLDGS = { market: 1, bank: 1, harbor: 1, stock_exchange: 1 };
        var DEF_BLDGS = { walls: 1, castle: 1 };
        // If this city is restless, prioritise content buildings to quell it.
        var restless = (city.unrest || 0) >= revoltThreshold(city) * 0.5;
        regBldgs.sort(function (a, b) {
          var pri = function (k) {
            if (restless && BUILDINGS[k] && BUILDINGS[k].content) return 4;
            if (civ.personality === 'scientific' && SCI_BLDGS[k]) return 3;
            if (civ.personality === 'economic'  && GOLD_BLDGS[k]) return 3;
            if ((civ.personality === 'aggressive' || civ.personality === 'warmonger') && DEF_BLDGS[k]) return 3;
            return 1;
          };
          return pri(b) - pri(a);
        });
        return regBldgs[0];
      }
      // Best available offensive unit first; siege/naval mixed in occasionally.
      // Modern apex units lead (availableProducibles already hides any whose
      // oil/iron the civ doesn't control). av() resolves a base type to this
      // faction's unique (e.g. swordsman → Umbra's Nightblade) if available.
      var u;
      function av(type) { var t = factionUnitFor(civ, type); return available.indexOf(t) >= 0 ? t : null; }
      if (u = av('tank')) return u;
      if (av('artillery') && rnd() < 0.25) return av('artillery');
      if (av('fighter') && rnd() < 0.2) return av('fighter');
      if (u = av('infantry')) return u;
      if (av('battleship') && isCoastalCity(city) && rnd() < 0.25) return av('battleship');
      if (u = av('rifleman')) return u;
      if (u = av('musketman')) return u;
      if (u = av('knight')) return u;
      if (u = av('swordsman')) return u;
      if (av('cannon') && rnd() < 0.3) return av('cannon');
      if (u = av('horseman')) return u;
      if (av('trebuchet') && rnd() < 0.3) return av('trebuchet');
      if (av('catapult') && rnd() < 0.3) return av('catapult');
      if (u = av('archer')) return u;
      if (av('caravel') && isCoastalCity(city) && rnd() < 0.2) return av('caravel');
      if (av('galley') && isCoastalCity(city) && rnd() < 0.2) return av('galley');
      return factionUnitFor(civ, 'warrior');
    }
    // Player: if current production is a completed building, switch to a warrior
    if (BUILDINGS[city.producing] && city.buildings[city.producing]) return factionUnitFor(civ, 'warrior');
    return city.producing;
  }

  // The faction's unique that replaces a given base type (or the base itself).
  function factionUnitFor(civ, baseType) {
    var fac = civ && civ.faction;
    if (fac) for (var k in UNITS) { if (UNITS[k].faction === fac && UNITS[k].replaces === baseType) return k; }
    return baseType;
  }
  function availableProducibles(civ, city) {
    var out = [];
    // Bases this civ's faction uniques replace (so the base is hidden for them).
    var replaced = {};
    for (var rk in UNITS) { if (UNITS[rk].faction === civ.faction && UNITS[rk].replaces) replaced[UNITS[rk].replaces] = 1; }
    for (var bk in BUILDINGS) { if (BUILDINGS[bk].faction === civ.faction && BUILDINGS[bk].replaces) replaced[BUILDINGS[bk].replaces] = 1; }
    for (var k in UNITS) {
      var u = UNITS[k];
      if (u.faction && u.faction !== civ.faction) continue;   // another faction's unique
      if (replaced[k]) continue;        // base replaced by this faction's unique
      if (u.tech && !civ.techs[u.tech]) continue;
      if (u.barb) continue;             // raiders aren't trainable
      if (u.great) continue;            // great people aren't trainable
      if (u.faithUnit) continue;        // missionaries / inquisitors are FAITH-bought, not produced
      if (u.naval && city && !isCoastalCity(city)) continue; // naval only at coastal cities
      if (u.requires && !civHasResource(civ, u.requires)) continue; // strategic resource gate
      if (u.requiresWonder && !(state.wondersBuilt && state.wondersBuilt[u.requiresWonder] === civ.id)) continue; // e.g. Nuke needs Manhattan Project
      out.push(k);
    }
    for (var k in BUILDINGS) {
      var b = BUILDINGS[k];
      if (b.faction && b.faction !== civ.faction) continue;   // another faction's unique
      if (replaced[k]) continue;        // base replaced by this faction's unique
      if (b.tech && !civ.techs[b.tech]) continue;
      if (b.coastal && city && !isCoastalCity(city)) continue;   // Harbor needs the sea
      // Spaceship parts: repeatable until the ship is launched (never "already built")
      if (b.spacePart) { if ((civ.spaceParts || 0) >= SPACE_PARTS_NEEDED) continue; out.push(k); continue; }
      if (b.national) { if (!nationalAvailable(civ, city, k)) continue; out.push(k); continue; }
      if (b.wonder && state.wondersBuilt && state.wondersBuilt[k]) continue;
      // Don't suggest already-built regular buildings to this city
      if (city && city.buildings && city.buildings[k] && !b.wonder) continue;
      out.push(k);
    }
    return out;
  }
  // National wonder availability: one per civ (civ.nationals), and every owned
  // city must already have the prerequisite building. Defined here; the National
  // Wonders themselves are added in the wonders batch.
  function nationalAvailable(civ, city, k) {
    var b = BUILDINGS[k];
    if (!b || !b.national) return false;
    if (civ.nationals && civ.nationals[k]) return false;            // one per empire
    if (city && city.buildings && city.buildings[k]) return false;  // already here
    if (b.requiresAll) {
      if (!civ.cities.length) return false;
      for (var i = 0; i < civ.cities.length; i++) {
        var cc = civ.cities[i];
        if (!cc.buildings || !cc.buildings[b.requiresAll]) return false;
      }
    }
    return true;
  }

  function hasTech(civ, t) { return !t || civ.techs[t]; }

  var RESEARCH_QUEUE_MAX = 12;   // generous — a full prereq chain to a leaf fits
  // Pull the next still-valid tech off the player's research plan into currentTech.
  // Mirrors popQueuedProduction: skips already-researched / in-progress / blocked.
  function popQueuedTech(civ) {
    if (!Array.isArray(civ.researchQueue)) { civ.researchQueue = []; return null; }
    while (civ.researchQueue.length) {
      var k = civ.researchQueue.shift();
      if (civ.techs[k] || k === civ.currentTech) continue;
      if (!TECHS[k] || !TECHS[k].req.every(function (r) { return civ.techs[r]; })) continue;
      civ.currentTech = k;
      civ.techProgress = 0;
      return k;
    }
    return null;
  }
  // Queue a target tech and all of its unmet prerequisites, prereq-first, so the
  // chain researches in a valid order. If nothing is in progress, start at once.
  function enqueueWithPrereqs(civ, target) {
    if (!Array.isArray(civ.researchQueue)) civ.researchQueue = [];
    var chain = [];
    (function add(k) {
      if (civ.techs[k] || k === civ.currentTech || chain.indexOf(k) >= 0) return;
      TECHS[k].req.forEach(add);
      chain.push(k);
    })(target);
    var full = false;
    chain.forEach(function (k) {
      if (civ.researchQueue.indexOf(k) >= 0) return;
      if (civ.researchQueue.length >= RESEARCH_QUEUE_MAX) { full = true; return; }
      civ.researchQueue.push(k);
    });
    if (full) showToast('Research queue full', 'error');
    if (!civ.currentTech) popQueuedTech(civ);
  }

  function progressTech(civ) {
    if (!civ.currentTech) return;
    civ.techProgress += civ.sciPerTurn;
    var def = TECHS[civ.currentTech];
    if (civ.techProgress >= def.cost) {
      var ageBefore = getAge(civ);
      civ.techs[civ.currentTech] = true;
      civ.techProgress = 0;
      if (civ.id === 'player') {
        logEvent('Researched ' + def.name, 'success');
        sfxResearch();
      }
      civ.currentTech = null;
      // Check for age advancement
      var ageAfter = getAge(civ);
      if (ageAfter.name !== ageBefore.name) {
        var ageGold = ageAdvanceGold(ageAfter);
        civ.gold += ageGold;
        if (civ.id === 'player') {
          logEvent('Entered the ' + ageAfter.name + ' Age! +' + ageGold + ' gold', 'success');
          showToast(ageAfter.name + ' Age! +' + ageGold + ' gold', 'success');
          chronicle('Ushered in the ' + ageAfter.name + ' Age.');
          sfxAgeUp();
        }
      }
      // Every AI picks its next tech automatically; the player's queue auto-
      // advances, otherwise prompt them to pick.
      if (AI_SIDES.indexOf(civ.id) >= 0) {
        civ.currentTech = pickAiTech(civ);
      } else if (civ.id === 'player') {
        popQueuedTech(civ);                 // pull the next planned tech, if any
        if (civ.currentTech) {
          logEvent('Now researching ' + TECHS[civ.currentTech].name, 'info');
        } else if (TECH_ORDER.some(function (tk) { return !civ.techs[tk]; })) {
          logEvent('Choose your next research!', 'info');
        }
      }
      // Check science victory
      var allDone = true;
      for (var i = 0; i < TECH_ORDER.length; i++) if (!civ.techs[TECH_ORDER[i]]) { allDone = false; break; }
      if (allDone) declareVictory(civ.id, 'science');
    }
  }

  function pickAiTech(civ) {
    // Available techs whose prereqs are met
    var avail = [];
    for (var i = 0; i < TECH_ORDER.length; i++) {
      var t = TECH_ORDER[i];
      if (civ.techs[t]) continue;
      var def = TECHS[t];
      var ok = true;
      for (var j = 0; j < def.req.length; j++) if (!civ.techs[def.req[j]]) { ok = false; break; }
      if (ok) avail.push(t);
    }
    if (avail.length === 0) return null;
    // Personality-aware ordering — keep TECH_ORDER as the fallback so AI
    // never softlocks if its preferred path is empty.
    var per = AI_PERSONALITIES[civ.personality];
    if (!per) return avail[0];
    var SCI_TECHS = { writing: 1, philosophy: 1, education: 1, astronomy: 1, drama: 1, acoustics: 1, computers: 1, computing: 1, artificial_intelligence: 1, satellites: 1, space_flight: 1 };
    var GOLD_TECHS = { currency: 1, banking: 1, trade: 1, economics: 1, mass_production: 1 };
    var MIL_TECHS = { archery: 1, husbandry: 1, iron: 1, steel: 1, gunpowder: 1, engineering: 1, mathematics: 1, feudalism: 1, chivalry: 1, navigation: 1, metallurgy: 1, industrialization: 1, rifling: 1, conscription: 1, ballistics: 1, combustion: 1, electronics: 1, rocketry: 1, nuclear_fission: 1, robotics: 1 };
    var BAL_TECHS = { pottery: 1, masonry: 1, theology: 1, sailing: 1, mining: 1, agriculture: 1, construction: 1, sanitation: 1, electricity: 1 };
    avail.sort(function (a, b) {
      var pri = function (k) {
        if (per.techPreference === 'science'  && SCI_TECHS[k])  return 3;
        if (per.techPreference === 'gold'     && GOLD_TECHS[k]) return 3;
        if (per.techPreference === 'military' && MIL_TECHS[k])  return 3;
        if (per.techPreference === 'balanced' && BAL_TECHS[k])  return 2;
        return 1;
      };
      return pri(b) - pri(a);
    });
    return avail[0];
  }

  // =====================================================================
  // UNIT UPGRADES
  // =====================================================================
  function canUpgrade(unit) {
    var up = UPGRADES[unit.type];
    if (!up) return null;
    var civ = state.civs[unit.civ];
    if (!civ.techs[up.tech]) return null;
    if (civ.gold < up.cost) return null;
    return up;
  }
  function upgradeUnit(unit) {
    var up = UPGRADES[unit.type];
    if (!up) return;
    var civ = state.civs[unit.civ];
    if (!civ.techs[up.tech] || civ.gold < up.cost) return;
    civ.gold -= up.cost;
    var newDef = UNITS[up.to];
    var hpRatio = unit.hp / unit.maxHp;
    unit.type = up.to;
    unit.maxHp = newDef.hp + (unit.promoHp || 0) * 2;
    unit.hp = Math.max(1, Math.round(unit.maxHp * hpRatio));
    unit.maxMoves = newDef.move;
    unit.moves = 0;
    sfxBuild();
    showToast(newDef.name + ' upgraded!', 'success');
  }

  // =====================================================================
  // GREAT PEOPLE
  // =====================================================================
  // Weighted culture pool — the engine pair (scientist/engineer) plus the new
  // merchant (gold + city-state ally) and artist (instant Golden Age).
  var GREAT_PEOPLE_POOL = [
    { type: 'great_scientist', weight: 3 },
    { type: 'great_engineer',  weight: 3 },
    { type: 'great_merchant',  weight: 2 },
    { type: 'great_artist',    weight: 2 }
  ];
  function pickGreatPerson() {
    var total = 0;
    GREAT_PEOPLE_POOL.forEach(function (g) { total += g.weight; });
    var roll = rnd() * total;
    for (var i = 0; i < GREAT_PEOPLE_POOL.length; i++) {
      roll -= GREAT_PEOPLE_POOL[i].weight;
      if (roll <= 0) return GREAT_PEOPLE_POOL[i].type;
    }
    return 'great_scientist';
  }
  // A Great Merchant on or beside a city-state allies it to the merchant's civ.
  function merchantAllyCityState(unit) {
    if (!state.civs.cs) return false;
    var tiles = [[unit.c, unit.r]].concat(neighbors(unit.c, unit.r));
    for (var i = 0; i < tiles.length; i++) {
      var t = tileAt(tiles[i][0], tiles[i][1]);
      if (t && t.city && t.city.isCityState && t.city.ally !== unit.civ) {
        t.city.ally = unit.civ;
        return true;
      }
    }
    return false;
  }

  function checkGreatPeople(civId) {
    var civ = state.civs[civId];
    if (!civ.greatPoints) return;
    var threshold = GP_THRESHOLD + civ.greatPeopleSpawned * 25;

    // Culture → Great Scientist or Great Engineer
    if (civ.greatPoints.culture >= threshold) {
      civ.greatPoints.culture -= threshold;
      civ.greatPeopleSpawned++;
      var gpType = pickGreatPerson();
      spawnGreatPerson(civId, gpType);
    }
    // Recompute threshold after culture spawn may have incremented counter
    threshold = GP_THRESHOLD + civ.greatPeopleSpawned * 25;
    // Faith → Great Prophet
    if ((civ.greatPoints.faith || 0) >= threshold) {
      civ.greatPoints.faith -= threshold;
      civ.greatPeopleSpawned++;
      spawnGreatPerson(civId, 'great_prophet');
    }
    threshold = GP_THRESHOLD + civ.greatPeopleSpawned * 25;
    // Military → Great General
    if (civ.greatPoints.military >= threshold) {
      civ.greatPoints.military -= threshold;
      civ.greatPeopleSpawned++;
      spawnGreatPerson(civId, 'great_general');
    }
  }

  function spawnGreatPerson(civId, type) {
    var civ = state.civs[civId];
    // AI auto-activates immediately
    if (AI_SIDES.indexOf(civId) >= 0) {
      activateGreatPersonAI(civId, type);
      return;
    }
    // Player: spawn on map near capital/first city
    var home = civ.cities[0];
    if (!home) return;
    var spot = findSpawnTile(home, type);
    if (!spot) return;
    spawnUnit(civId, type, spot[0], spot[1]);
    sfxBuild();
    showToast(UNITS[type].name + ' has been born!', 'success');
    logEvent(UNITS[type].name + ' appeared near ' + home.name, 'success');
    chronicle('A ' + UNITS[type].name + ' arose among your people.');
  }

  function activateGreatPersonAI(civId, type) {
    var civ = state.civs[civId];
    if (type === 'great_general') {
      civ.generalBonus = { turnsLeft: 8, atk: 2 };
    } else if (type === 'great_scientist') {
      // Free tech
      var ageBefore = getAge(civ);
      var techPicked = pickAiTech(civ);
      if (techPicked) {
        civ.techs[techPicked] = true;
        if (civ.currentTech === techPicked) { civ.currentTech = null; civ.techProgress = 0; }
        logEvent(CIVS[civId].name + ' used a Great Scientist', 'error');
        // Age advancement
        var ageAfter = getAge(civ);
        if (ageAfter.name !== ageBefore.name) {
          var ageGold = ageAdvanceGold(ageAfter);
          civ.gold += ageGold;
        }
        // Science victory check
        var allDone = true;
        for (var ti = 0; ti < TECH_ORDER.length; ti++) { if (!civ.techs[TECH_ORDER[ti]]) { allDone = false; break; } }
        if (allDone) { declareVictory(civId, 'science'); return; }
        civ.currentTech = pickAiTech(civ);
      }
    } else if (type === 'great_engineer') {
      // Rush production in biggest city
      var best = null;
      civ.cities.forEach(function (ct) { if (!best || ct.pop > best.pop) best = ct; });
      if (best) {
        var p = best.producing;
        var cost = UNITS[p] ? UNITS[p].cost : (BUILDINGS[p] ? BUILDINGS[p].cost : 0);
        best.prod = cost;  // will complete next processCity
      }
    } else if (type === 'great_merchant') {
      civ.gold += 120;                          // a windfall (auto-activated, no CS targeting)
    } else if (type === 'great_artist') {
      triggerGoldenAge(civ, GOLDEN_AGE_LENGTH, false, 'Great Artist');
    } else if (type === 'great_prophet') {
      // Found a faith for free if it has none; otherwise imprint it on a home city.
      if (prophetCanFound(civ)) {
        var used = {}; for (var kk in state.religions) used[state.religions[kk].id] = 1;
        var pick = null;
        for (var pi = 0; pi < RELIGION_POOL.length; pi++) if (!used[RELIGION_POOL[pi].id]) { pick = RELIGION_POOL[pi].id; break; }
        var pb = { scientific: 'scholarship', economic: 'tithe', peaceful: 'piety', expansionist: 'zeal', aggressive: 'zeal' }[civ.personality] || 'fertility';
        if (pick) foundReligion(civ, pick, pb, { free: true });
      } else {
        var rel = civMajorityReligion(civ);
        if (rel) for (var ci = 0; ci < civ.cities.length; ci++) { var cc = civ.cities[ci]; if (!cc.holyCity && cc.religion !== rel) { cc.religion = rel; break; } }
      }
    }
  }

  function activateGreatPerson(unit) {
    var civ = state.civs[unit.civ];
    if (unit.type === 'great_general') {
      civ.generalBonus = { turnsLeft: 8, atk: 2 };
      showToast('Army inspired! +2 ATK for 8 turns', 'success');
      logEvent('Great General: +2 ATK for 8 turns', 'success');
    } else if (unit.type === 'great_scientist') {
      // Consume scientist, open tech screen with free pick flag
      state.freetech = true;
      killUnit(unit);
      openTech();
      return;
    } else if (unit.type === 'great_engineer') {
      // Rush production in the city on this tile
      var t = tileAt(unit.c, unit.r);
      if (t && t.city && t.city.civ === unit.civ) {
        var ct = t.city;
        var p = ct.producing;
        var cost = UNITS[p] ? UNITS[p].cost : (BUILDINGS[p] ? BUILDINGS[p].cost : 0);
        if (cost <= 0) { showToast('Nothing to rush', 'error'); return; }
        ct.prod = cost;  // will complete next processCity
        showToast('Production rushed in ' + ct.name + '!', 'success');
        logEvent('Great Engineer rushed ' + ct.name + ' production', 'success');
      } else {
        showToast('Must be in your city', 'error');
        return;
      }
    } else if (unit.type === 'great_merchant') {
      civ.gold += 120;
      var allied = merchantAllyCityState(unit);
      if (allied) recomputeIncome(unit.civ);
      showToast('Great Merchant: +120 gold' + (allied ? ' & city-state ally!' : ''), 'success');
      logEvent('Great Merchant earned +120 gold' + (allied ? ' and allied a city-state' : ''), 'success');
    } else if (unit.type === 'great_artist') {
      triggerGoldenAge(civ, GOLDEN_AGE_LENGTH, true, 'Great Artist');
    } else if (unit.type === 'great_prophet') {
      // No faith yet → let the player pick a religion + belief (founded free); the
      // belief picker consumes the prophet. Otherwise imprint the faith nearby.
      if (prophetCanFound(civ)) {
        prophetFoundingUnit = unit;
        openReligion();
        return;                       // prophet consumed inside the founding flow
      }
      if (prophetSpread(unit)) {
        showToast('The Prophet spread your faith', 'success');
        logEvent('A Great Prophet spread the faith', 'success');
      } else {
        showToast('No cities to convert nearby', 'error');
        return;                       // don't waste the prophet on a no-op
      }
    }
    killUnit(unit);
  }
  // A Great Prophet the player is currently using to found a faith (consumed when
  // a belief is chosen). Transient — never saved.
  var prophetFoundingUnit = null;

  // =====================================================================
  // BARBARIAN CLANS — the raiders are a market, not just a menace. While any
  // clan raiders roam, the player can HIRE one (it defects, joining your army)
  // or BRIBE the clans to march on a chosen rival for a few turns. Gold gets a
  // military outlet; a rushed player gets a desperation lever.
  // =====================================================================
  var CLAN_HIRE_COST = 45;
  var CLAN_BRIBE_COST = 60;
  var CLAN_BRIBE_TURNS = 8;

  function clansAvailable() {
    return !!(state && state.civs.barb && state.civs.barb.units.length);
  }
  // Nearest living raider to the hiring civ's capital.
  function nearestRaiderTo(civId) {
    var civ = state.civs[civId];
    var home = civ && civ.cities[0];
    if (!home || !clansAvailable()) return null;
    var best = null, bestD = Infinity;
    state.civs.barb.units.forEach(function (u) {
      var d = hexDist([home.c, home.r], [u.c, u.r]);
      if (d < bestD) { bestD = d; best = u; }
    });
    return best;
  }
  // Pay a raider to defect — same unit object switches sides where it stands.
  function hireRaider(civId) {
    var civ = state.civs[civId];
    if (!civ || civ.gold < CLAN_HIRE_COST) return false;
    var u = nearestRaiderTo(civId);
    if (!u) return false;
    civ.gold -= CLAN_HIRE_COST;
    var barbUnits = state.civs.barb.units;
    barbUnits.splice(barbUnits.indexOf(u), 1);
    u.civ = civId;
    u.hp = u.maxHp;
    u.moves = 0;                       // takes the rest of the turn to swear in
    civ.units.push(u);
    if (civId === 'player') {
      sfxAlly();
      showToast('Raider hired — they fight for you now', 'success');
      logEvent('Hired a clan raider into your army (−' + CLAN_HIRE_COST + 'g)', 'success');
      recomputeVisibility('player');
    }
    return true;
  }
  // Point the clans at a rival for a few turns.
  function bribeClans(targetId) {
    var pl = state.civs.player;
    if (pl.gold < CLAN_BRIBE_COST || !clansAvailable()) return false;
    if (!state.civs[targetId] || !state.civs[targetId].cities.length) return false;
    pl.gold -= CLAN_BRIBE_COST;
    state.barbBribe = { target: targetId, turns: CLAN_BRIBE_TURNS };
    var tn = CIVS[targetId] ? CIVS[targetId].name : targetId;
    showToast('The clans march on ' + tn, 'success');
    logEvent('Bribed the clans to raid ' + tn + ' for ' + CLAN_BRIBE_TURNS + ' turns (−' + CLAN_BRIBE_COST + 'g)', 'success');
    return true;
  }
  // Nearest unit/city of one specific civ, within range.
  function findNearestOf(u, civId, range) {
    var c = state.civs[civId];
    if (!c) return null;
    var best = null, bestD = Infinity;
    c.units.forEach(function (e) { var d = hexDist([u.c, u.r], [e.c, e.r]); if (d < bestD) { bestD = d; best = [e.c, e.r]; } });
    (c.cities || []).forEach(function (ct) { var d = hexDist([u.c, u.r], [ct.c, ct.r]); if (d < bestD) { bestD = d; best = [ct.c, ct.r]; } });
    return bestD <= range ? best : null;
  }

  // Clans menu — hire the nearest raider, or aim the horde at a rival.
  function openClans() {
    var pl = state.civs.player;
    var actions = [];
    var n = state.civs.barb.units.length;
    actions.push({ header: true, icon: '🏴', title: 'Barbarian Clans', sub: n + ' raider' + (n !== 1 ? 's' : '') + ' roam the wilds · gold talks' });
    if (state.barbBribe && state.barbBribe.turns > 0) {
      var bn = CIVS[state.barbBribe.target] ? CIVS[state.barbBribe.target].name : state.barbBribe.target;
      actions.push({ icon: '⚔', title: 'Clans raiding ' + bn, sub: state.barbBribe.turns + ' turn' + (state.barbBribe.turns !== 1 ? 's' : '') + ' remaining', disabled: true, do: function () {} });
    }
    actions.push({
      icon: '⚔', title: 'Hire a Raider (' + CLAN_HIRE_COST + 'g)',
      sub: 'The nearest raider defects to your army',
      disabled: pl.gold < CLAN_HIRE_COST,
      do: function () { if (hireRaider('player')) { updateHud(); save(); } closeModal(); draw(); }
    });
    AI_SIDES.forEach(function (aiId) {
      var ai = state.civs[aiId];
      if (!ai || !ai.cities.length) return;
      actions.push({
        icon: '🏴', title: 'Bribe clans vs ' + CIVS[aiId].name + ' (' + CLAN_BRIBE_COST + 'g)',
        sub: 'Raiders hunt them for ' + CLAN_BRIBE_TURNS + ' turns',
        disabled: pl.gold < CLAN_BRIBE_COST,
        do: function () { if (bribeClans(aiId)) { updateHud(); save(); } closeModal(); draw(); }
      });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Barbarian Clans');
  }

  // =====================================================================
  // LIVING HISTORY — the world remembers this game. Razed cities and great
  // battles leave DIG SITES stamped with what actually happened; a late-game
  // Archaeologist excavates them for culture + Era Points and a chronicle
  // callback. Plus ERA QUESTS: small standing objectives that pay Era Points,
  // giving the early/mid game direction without any new resource.
  // =====================================================================
  var DIG_SITE_CAP = 10;      // most sites the world keeps (oldest drop off)
  var DIG_ERA_POINTS = 12;    // era points per excavation
  var DIG_CULTURE = 15;       // great-people culture per excavation

  function digSiteAt(c, r) {
    var list = state && state.digSites;
    if (!list) return null;
    for (var i = 0; i < list.length; i++) if (list[i].c === c && list[i].r === r) return list[i];
    return null;
  }
  function addDigSite(c, r, label) {
    if (!state.digSites) state.digSites = [];
    if (digSiteAt(c, r)) return;
    var t = tileAt(c, r);
    if (!t || TERRAIN[t.terrain].impassable) return;
    state.digSites.push({ c: c, r: r, label: label, turn: state.turn });
    while (state.digSites.length > DIG_SITE_CAP) state.digSites.shift();
  }
  // Excavate the site under an Archaeologist: culture + era points + a story.
  function excavate(unit) {
    var site = digSiteAt(unit.c, unit.r);
    if (!site) return false;
    var civ = state.civs[unit.civ];
    civ.eraPoints = (civ.eraPoints || 0) + DIG_ERA_POINTS;
    if (civ.greatPoints) civ.greatPoints.culture += DIG_CULTURE;
    state.digSites.splice(state.digSites.indexOf(site), 1);
    unit.moves = 0;
    if (unit.civ === 'player') {
      sfxResearch();
      showToast('Excavated ' + site.label + '!', 'success');
      logEvent('Unearthed relics of ' + site.label + ' (turn ' + site.turn + ') — +' + DIG_ERA_POINTS + ' era pts, +' + DIG_CULTURE + ' culture', 'success');
      chronicle('Archaeologists unearthed ' + site.label + ', a story from turn ' + site.turn + '.');
    }
    return true;
  }
  // Small ruined-column marker on explored dig-site tiles.
  function drawDigSite(cx, cy, size) {
    var s = size * 0.30;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s * 0.7, s * 1.2, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cfc6a8';
    ctx.fillRect(cx - s * 0.9, cy - s * 0.3, s * 0.35, s);          // standing column
    ctx.fillRect(cx - s * 0.1, cy + s * 0.15, s * 0.9, s * 0.3);    // fallen column
    ctx.fillStyle = '#8f8668';
    ctx.fillRect(cx - s * 0.9, cy - s * 0.3, s * 0.35, s * 0.2);    // capital
    ctx.fillRect(cx + s * 0.35, cy + s * 0.1, s * 0.3, s * 0.2);    // rubble
  }

  // ERA QUESTS — standing objectives; each pays Era Points once, checked at
  // the start of every player turn against state the game already tracks.
  var ERA_QUESTS = [
    { id: 'settle3',  desc: 'Found 3 cities',            pts: 15, check: function (pl) { return pl.cities.length >= 3; } },
    { id: 'classical',desc: 'Reach the Classical age',   pts: 10, check: function (pl) { return AGES.indexOf(getAge(pl)) >= 1; } },
    { id: 'slayer5',  desc: 'Slay 5 enemy units',        pts: 12, check: function () { return (state.stats.unitsKilled || 0) >= 5; } },
    { id: 'barb3',    desc: 'Defeat 3 barbarians',       pts: 10, check: function () { return (state.stats.barbsDefeated || 0) >= 3; } },
    { id: 'faithful', desc: 'Found a religion',          pts: 12, check: function (pl) { return !!pl.religionId; } },
    { id: 'wonder1',  desc: 'Build a World Wonder',      pts: 15, check: function () { for (var k in (state.wondersBuilt || {})) if (state.wondersBuilt[k] === 'player') return true; return false; } },
    { id: 'trader2',  desc: 'Run 2 trade routes at once',pts: 12, check: function () { return (state.tradeRoutes || []).filter(function (rt) { return rt.owner === 'player'; }).length >= 2; } },
    { id: 'metropolis', desc: 'Grow a city to pop 6',    pts: 12, check: function (pl) { return pl.cities.some(function (ct) { return ct.pop >= 6; }); } }
  ];
  function checkEraQuests() {
    if (!state.eraQuestsDone) state.eraQuestsDone = {};
    var pl = state.civs.player;
    ERA_QUESTS.forEach(function (q) {
      if (state.eraQuestsDone[q.id]) return;
      if (!q.check(pl)) return;
      state.eraQuestsDone[q.id] = true;
      pl.eraPoints = (pl.eraPoints || 0) + q.pts;
      showToast('Quest: ' + q.desc + ' ✓ (+' + q.pts + ' era pts)', 'success');
      logEvent('Era quest complete — ' + q.desc + ' (+' + q.pts + ' era points)', 'success');
    });
  }

  // =====================================================================
  // ESPIONAGE — menu-driven spy missions, no units to move. Spy slots unlock
  // with the ages (Classical: 1, Renaissance: 2). Assign a slot to a mission
  // against a rival; it resolves after N turns with visible odds. Getting
  // caught fires the existing tension/memory diplomacy machinery, so spying
  // is a real relationship risk, not a free lever.
  // =====================================================================
  var SPY_MISSIONS = {
    steal_tech: { name: 'Steal Technology',    icon: '⚗', turns: 6, base: 0.50, desc: 'Learn one tech this rival knows' },
    sabotage:   { name: 'Sabotage Production', icon: '⚒', turns: 5, base: 0.55, desc: 'Wreck the banked production in their capital' },
    incite:     { name: 'Incite Unrest',       icon: '☢', turns: 4, base: 0.60, desc: 'Foment +8 unrest in their capital' },
    counter:    { name: 'Counterintelligence', icon: '⛨', turns: 0, base: 1.0,  desc: 'Guard: −25% odds for spies targeting you' }
  };
  var SPY_MISSION_ORDER = ['steal_tech', 'sabotage', 'incite', 'counter'];
  var SPY_CAUGHT_TENSION = 15;

  // Spy slots by age: none before Classical, 2 from the Renaissance on.
  function spySlots(civ) {
    var idx = AGES.indexOf(getAge(civ));
    return idx >= 3 ? 2 : idx >= 1 ? 1 : 0;
  }
  function civHasCounterintel(civ) {
    return (civ.spyOps || []).some(function (op) { return op.type === 'counter'; });
  }
  // Success odds: mission base + an age-advantage nudge − target counterintel.
  function spyOdds(civ, targetId, type) {
    var m = SPY_MISSIONS[type];
    if (!m || type === 'counter') return 1;
    var target = state.civs[targetId];
    if (!target) return 0;
    var edge = (AGES.indexOf(getAge(civ)) - AGES.indexOf(getAge(target))) * 0.06;
    var guard = civHasCounterintel(target) ? 0.25 : 0;
    return Math.max(0.15, Math.min(0.90, m.base + edge - guard));
  }
  // Assign a free slot. Counterintel is a standing posture (no timer, no target).
  function assignSpy(civ, type, targetId) {
    if (!civ.spyOps) civ.spyOps = [];
    if (civ.spyOps.length >= spySlots(civ)) return false;
    var m = SPY_MISSIONS[type];
    if (!m) return false;
    if (type === 'counter') { civ.spyOps.push({ type: 'counter' }); return true; }
    if (!state.civs[targetId] || !state.civs[targetId].cities.length) return false;
    civ.spyOps.push({ type: type, target: targetId, turnsLeft: m.turns });
    return true;
  }
  // A tech the target knows and this civ doesn't (owner prereqs satisfied first,
  // any known-by-target tech as fallback) — cheapest first.
  function stealableTech(civ, target) {
    var pool = TECH_ORDER.filter(function (k) { return target.techs[k] && !civ.techs[k]; });
    var ready = pool.filter(function (k) { return TECHS[k].req.every(function (r) { return civ.techs[r]; }); });
    var pick = (ready.length ? ready : pool);
    pick.sort(function (a, b) { return TECHS[a].cost - TECHS[b].cost; });
    return pick[0] || null;
  }
  // Tick + resolve one civ's missions at end of round.
  function processSpyOps(civId) {
    var civ = state.civs[civId];
    if (!civ || !civ.spyOps || !civ.spyOps.length) return;
    var meName = CIVS[civId] ? CIVS[civId].name : civId;
    civ.spyOps = civ.spyOps.filter(function (op) {
      if (op.type === 'counter') return true;                      // standing guard
      var target = state.civs[op.target];
      if (!target || !target.cities.length) return false;          // target gone
      op.turnsLeft--;
      if (op.turnsLeft > 0) return true;
      var themName = CIVS[op.target] ? CIVS[op.target].name : op.target;
      if (rnd() < spyOdds(civ, op.target, op.type)) {
        // --- Success ---
        if (op.type === 'steal_tech') {
          var k = stealableTech(civ, target);
          if (k) {
            civ.techs[k] = true;
            if (civ.currentTech === k) { civ.currentTech = null; civ.techProgress = 0; }
            if (civId === 'player') { logEvent('Your spies stole ' + TECHS[k].name + ' from ' + themName + '!', 'success'); chronicle('Spies stole the secret of ' + TECHS[k].name + ' from ' + themName + '.'); }
            else if (op.target === 'player') logEvent(meName + ' stole ' + TECHS[k].name + ' from you!', 'error');
          }
        } else if (op.type === 'sabotage') {
          var cap = target.cities[0];
          if (cap) {
            cap.prod = 0;
            if (civId === 'player') logEvent('Your spies sabotaged production in ' + cap.name + '!', 'success');
            else if (op.target === 'player') logEvent('Saboteurs wrecked production in ' + cap.name + '!', 'error');
          }
        } else if (op.type === 'incite') {
          var cap2 = target.cities[0];
          if (cap2) {
            cap2.unrest = (cap2.unrest || 0) + 8;
            if (civId === 'player') logEvent('Your agents incited unrest in ' + cap2.name + '!', 'success');
            else if (op.target === 'player') logEvent('Foreign agents incited unrest in ' + cap2.name + '!', 'error');
          }
        }
      } else {
        // --- Caught! The victim's grudge machinery reacts. ---
        if (AI_SIDES.indexOf(op.target) >= 0) {
          if (civId === 'player') remember(op.target, 'We caught your spies red-handed', SPY_CAUGHT_TENSION);
          else addTension(op.target, civId, SPY_CAUGHT_TENSION, 'spying');
        }
        if (civId === 'player') logEvent('Your spy was caught by ' + themName + '!', 'error');
        else if (op.target === 'player') logEvent('You caught a spy from ' + meName + '!', 'success');
      }
      return false;                                                // slot freed
    });
  }
  // Withdraw a standing counterintel posture (frees the slot).
  function cancelCounterintel(civ) {
    if (!civ.spyOps) return;
    civ.spyOps = civ.spyOps.filter(function (op) { return op.type !== 'counter'; });
  }
  // AI espionage: fill free slots by personality — scientists steal, warmongers
  // sabotage, the rest split incite / guard. Targets the strongest rival.
  function aiRunEspionage(civId) {
    var civ = state.civs[civId];
    if (!civ || !civ.cities.length) return;
    if (!civ.spyOps) civ.spyOps = [];
    while (civ.spyOps.length < spySlots(civ)) {
      var pref = { scientific: 'steal_tech', aggressive: 'sabotage', economic: 'incite' }[civ.personality] || 'counter';
      if (pref !== 'counter') {
        var best = null, bestP = -1;
        CIV_SIDES.forEach(function (oid) {
          if (oid === civId) return;
          var o = state.civs[oid];
          if (!o || !o.cities.length) return;
          var p = civPower(o);
          if (p > bestP) { bestP = p; best = oid; }
        });
        if (!best || !assignSpy(civ, pref, best)) { if (!civHasCounterintel(civ)) assignSpy(civ, 'counter'); else break; }
      } else {
        if (civHasCounterintel(civ) || !assignSpy(civ, 'counter')) break;
      }
    }
  }

  // Espionage menu — slots, standing guard, and a target→mission two-step.
  function openEspionage() {
    var civ = state.civs.player;
    if (!civ.spyOps) civ.spyOps = [];
    var actions = [];
    var slots = spySlots(civ);
    actions.push({ header: true, icon: '🕵', title: 'Espionage', sub: civ.spyOps.length + '/' + slots + ' spies deployed · next slot at ' + (slots < 2 ? 'the Renaissance' : 'max') });
    civ.spyOps.forEach(function (op) {
      if (op.type === 'counter') {
        actions.push({ icon: '⛨', title: 'Counterintelligence active', sub: 'Guarding your empire · tap to recall', do: function () { cancelCounterintel(civ); showToast('Counterintel recalled'); closeModal(); openEspionage(); } });
      } else {
        var m = SPY_MISSIONS[op.type];
        var tn = CIVS[op.target] ? CIVS[op.target].name : op.target;
        actions.push({ icon: m.icon, title: m.name + ' → ' + tn, sub: op.turnsLeft + ' turn' + (op.turnsLeft !== 1 ? 's' : '') + ' to resolution', disabled: true, do: function () {} });
      }
    });
    if (civ.spyOps.length < slots) {
      AI_SIDES.forEach(function (aiId) {
        var ai = state.civs[aiId];
        if (!ai || !ai.cities.length) return;
        actions.push({ icon: '➤', title: 'Deploy vs ' + CIVS[aiId].name, sub: 'Pick a mission', primary: true, do: function () { closeModal(); openSpyMissionPicker(aiId); } });
      });
      if (!civHasCounterintel(civ)) {
        actions.push({ icon: '⛨', title: 'Counterintelligence', sub: SPY_MISSIONS.counter.desc, do: function () { assignSpy(civ, 'counter'); showToast('Counterintel active', 'success'); save(); closeModal(); openEspionage(); } });
      }
    }
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Espionage');
  }
  function openSpyMissionPicker(targetId) {
    var civ = state.civs.player;
    var actions = [];
    actions.push({ header: true, icon: '🕵', title: 'Mission vs ' + CIVS[targetId].name, sub: 'Resolves in N turns · shown odds include their defenses' });
    SPY_MISSION_ORDER.forEach(function (k) {
      if (k === 'counter') return;
      var m = SPY_MISSIONS[k];
      var odds = Math.round(spyOdds(civ, targetId, k) * 100);
      actions.push({ icon: m.icon, title: m.name + ' (' + odds + '%)', sub: m.desc + ' · ' + m.turns + ' turns', do: function () {
        if (assignSpy(civ, k, targetId)) { showToast('Spy deployed: ' + m.name, 'success'); save(); }
        closeModal(); draw();
      } });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); openEspionage(); } });
    renderDiplomacyActions(actions, 'Mission');
  }

  // =====================================================================
  // AI DIPLOMACY — dynamic tension
  // Each AI builds grievance toward other civs over time: cities crowding its
  // borders, a rival's runaway power, and hostile acts all raise tension; it
  // decays slowly (grudges fade) and drops on peace / alliance. Tension then
  // bends the AI's war/peace/alliance/trade decisions, so relations shift in
  // response to what the player actually does.
  // =====================================================================
  var TENSION_MAX        = 100;
  var TENSION_DECAY      = 1.4;   // per turn — grudges cool off
  var TENSION_PROX_RANGE = 4;     // rival cities within this many hexes cause friction
  var TENSION_PROX_W     = 0.55;  // friction per "closeness point" per nearby city pair
  var TENSION_THREAT_R   = 1.25;  // a rival this much stronger breeds fear
  var TENSION_THREAT_W   = 3.0;
  var TENSION_FOUND_SPIKE = 9;    // instant bump when a rival founds a city next door
  var TENSION_WAR_SPIKE   = 22;   // when someone declares war on this AI
  var TENSION_CAPTURE_SPIKE = 38; // when someone takes one of this AI's cities

  function militaryCount(civ) {
    return civ.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;
  }
  function civPower(civ) {
    return civ.cities.length * 2 + militaryCount(civ);
  }
  function tensionOf(aiId, otherId) {
    var c = state.civs[aiId];
    if (!c || !c.tension) return 0;
    return c.tension[otherId] || 0;
  }
  // Band thresholds shared by the AI logic and the Diplomacy menu display.
  function tensionInfo(t) {
    if (t >= 55) return { idx: 3, label: 'Hostile', color: '#ff4466' };
    if (t >= 30) return { idx: 2, label: 'Tense',   color: '#ff9a3a' };
    if (t >= 12) return { idx: 1, label: 'Wary',    color: '#ffd34d' };
    return { idx: 0, label: 'Cordial', color: '#00ff88' };
  }
  // Add (or subtract) tension and, when an AI's feeling toward the PLAYER
  // crosses up into a worse band, tell the player why.
  function addTension(aiId, otherId, amount, reason) {
    var c = state.civs[aiId];
    if (!c || AI_SIDES.indexOf(aiId) < 0) return;   // only AIs hold grudges
    if (!c.tension) c.tension = {};
    if (!c.tensionBand) c.tensionBand = {};
    var before = c.tension[otherId] || 0;
    var after = Math.max(0, Math.min(TENSION_MAX, before + amount));
    c.tension[otherId] = after;
    if (otherId !== 'player') return;
    var prevBand = c.tensionBand[otherId] || 0;
    var newBand = tensionInfo(after).idx;
    if (newBand > prevBand && newBand >= 1) {
      var name = CIVS[aiId] ? CIVS[aiId].name : aiId;
      var msg = reason === 'threat'
        ? name + ' grows uneasy at your rising power'
        : reason === 'war'
        ? name + ' resents your aggression'
        : reason === 'capture'
        ? name + ' is enraged by your conquests'
        : name + ' resents your encroaching settlements';
      logEvent(msg, 'error');
      if (newBand >= 2) showToast(msg, 'error');
    }
    c.tensionBand[otherId] = newBand;
  }

  // Recompute each AI's tension toward every other civ once per turn.
  function updateTensions() {
    AI_SIDES.forEach(function (aiId) {
      var ai = state.civs[aiId];
      if (!ai) return;
      if (!ai.tension) ai.tension = {};
      if (!ai.tensionBand) ai.tensionBand = {};
      CIV_SIDES.forEach(function (otherId) {
        if (otherId === aiId) return;
        var other = state.civs[otherId];
        var prev = ai.tension[otherId] || 0;
        // Allies and the city-less drift back toward calm.
        if (!other || other.cities.length === 0 || relation(aiId, otherId) === 'allied') {
          ai.tension[otherId] = Math.max(0, prev - TENSION_DECAY * 2);
          ai.tensionBand[otherId] = tensionInfo(ai.tension[otherId]).idx;
          return;
        }
        var proxAdd = 0;
        ai.cities.forEach(function (ca) {
          other.cities.forEach(function (co) {
            var d = hexDist([ca.c, ca.r], [co.c, co.r]);
            if (d <= TENSION_PROX_RANGE) proxAdd += (TENSION_PROX_RANGE - d + 1) * TENSION_PROX_W;
          });
        });
        var ratio = civPower(other) / Math.max(1, civPower(ai));
        var threatAdd = ratio > TENSION_THREAT_R ? (ratio - TENSION_THREAT_R) * TENSION_THREAT_W : 0;
        // Agenda disposition — a small extra nudge based on this AI's character.
        var agendaAdd = 0;
        var ag = AGENDAS[ai.agenda];
        if (ag) { try { agendaAdd = ag.eval(ai, other) || 0; } catch (e) { agendaAdd = 0; } }
        var add = proxAdd + threatAdd + agendaAdd;
        // Apply decay first, then route the fresh friction through addTension so
        // band-crossing alerts toward the player fire as relations sour.
        ai.tension[otherId] = Math.max(0, prev - TENSION_DECAY);
        addTension(aiId, otherId, add, proxAdd >= threatAdd ? 'proximity' : 'threat');
      });
    });
  }

  // Tension-adjusted acceptance probability for a player offer (clamped sane).
  function acceptChance(base, tension, sensitivity) {
    var v = base * (1 - tension / sensitivity);
    return Math.max(0.02, Math.min(0.98, v));
  }

  function aiDiplomacyCheck() {
    if (state.victory) return;
    AI_SIDES.forEach(function (aiId) {
      var aiCiv = state.civs[aiId];
      if (!aiCiv || aiCiv.cities.length === 0) return;
      var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.aggressive;
      var aiMil = aiCiv.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;

      // Check vs player
      var plTension = tensionOf(aiId, 'player');
      if (atWar(aiId, 'player')) {
        var plMil = militaryCount(state.civs.player);
        // A broken AI sues for VASSALAGE: it lost its original capital, or is
        // down to a rump state against a far stronger player. Capitulation
        // beats annihilation — and spares the player the mop-up war.
        var lostCapital = !aiCiv.cities.some(function (ct) { return ct.capital && ct.originalCiv === aiId; });
        var rump = aiCiv.cities.length <= 2 && civPower(aiCiv) < civPower(state.civs.player) * 0.45;
        if (!isVassal(aiId) && (lostCapital || rump) && state.turn >= 10) {
          if (!state.pendingPeace && rnd() < 0.4) {
            state.pendingPeace = { from: aiId, kind: 'vassal' };
          }
        } else if (aiMil < plMil * 0.5 && aiCiv.cities.length <= state.civs.player.cities.length && state.turn >= 8) {
          // Offer peace if weaker — but a furious AI keeps fighting (tension cuts
          // its willingness to sue for peace).
          if (!state.pendingPeace && rnd() < 0.3 * per.peaceMul * (1 - plTension / 150)) {
            state.pendingPeace = { from: aiId };
          }
        }
      } else if (state.diplomacy[dipKey(aiId, 'player')] === 'allied') {
        // Alliance held — never wars from this state; occasionally proposes
        // a mutual research deal to the player (one pending offer at a time).
        if (!state.pendingPeace && state.turn >= 6 && rnd() < 0.06) {
          state.pendingPeace = { from: aiId, kind: 'deal' };
        }
      } else {
        // At peace — tension raises war odds and lets an angry AI strike even
        // without an overwhelming army.
        var plMil = militaryCount(state.civs.player);
        var warMul = per.warMul * (1 + plTension / 35);     // tension 35 ~doubles it
        var ratioGate = plTension >= 40 ? 1.0 : 1.5;        // furious AIs fight at parity
        var milGate   = plTension >= 40 ? 3 : 4;
        if (!hasPact(aiId, 'player') && aiMil >= plMil * ratioGate && aiMil >= milGate && state.turn >= 12 && rnd() < 0.15 * warMul) {
          declareWarOn(aiId, 'player');
        } else if (!state.pendingPeace && state.turn >= 10 && plTension < 20 &&
                   rnd() < per.offerAlliance * (1 - plTension / 25)) {
          // Only cordial AIs extend a hand.
          state.pendingPeace = { from: aiId, kind: 'alliance' };
        }
      }

      // AI vs AI diplomacy
      AI_SIDES.forEach(function (otherId) {
        if (otherId === aiId) return;
        var otherCiv = state.civs[otherId];
        if (!otherCiv || otherCiv.cities.length === 0) return;
        var otherMil = militaryCount(otherCiv);
        var oTension = tensionOf(aiId, otherId);
        if (atWar(aiId, otherId)) {
          // Peace if both weak — high mutual grudge keeps the war going.
          if (aiMil <= 2 && otherMil <= 2 && rnd() < 0.2 * per.peaceMul * (1 - oTension / 150)) {
            makePeace(aiId, otherId);
          }
        } else if (state.diplomacy[dipKey(aiId, otherId)] !== 'allied' && !hasPact(aiId, otherId)) {
          var warMul2 = per.warMul * (1 + oTension / 35);
          var ratioGate2 = oTension >= 40 ? 1.1 : 1.5;
          if (aiMil >= otherMil * ratioGate2 && aiMil >= 4 && state.turn >= 12 && rnd() < 0.1 * warMul2) {
            declareWarOn(aiId, otherId);
          }
        }
      });
    });
  }

  // =====================================================================
  // VASSALS — a beaten AI capitulates instead of fighting to the last city.
  // A vassal keeps its cities but pays tribute, follows its overlord into
  // wars, and counts as subdued for Domination. Player-only overlord.
  // =====================================================================
  var VASSAL_TRIBUTE = 4;          // gold/turn a vassal pays (capped by its purse)

  function isVassal(civId) { return !!(state.vassals && state.vassals[civId]); }
  function vassalsOf(overlordId) {
    var out = [];
    for (var k in (state.vassals || {})) if (state.vassals[k] === overlordId) out.push(k);
    return out;
  }
  function makeVassal(civId, overlordId) {
    if (!state.vassals) state.vassals = {};
    state.vassals[civId] = overlordId;
    makePeace(overlordId, civId);
    // The new vassal joins its overlord's current wars.
    CIV_SIDES.forEach(function (x) {
      if (x === civId || x === overlordId) return;
      if (atWar(overlordId, x) && !atWar(civId, x)) state.diplomacy[dipKey(civId, x)] = 'war';
    });
    logEvent((CIVS[civId] ? CIVS[civId].name : civId) + ' capitulated — now your vassal', 'success');
    chronicle(leaderOf(civId).name + ' bent the knee and became your vassal.');
    checkDominationByVassalage(overlordId);
  }
  function releaseVassal(civId) {
    if (!state.vassals || !state.vassals[civId]) return;
    delete state.vassals[civId];
    // Gratitude: releasing a vassal wipes most of its grudge.
    if (AI_SIDES.indexOf(civId) >= 0) addTension(civId, 'player', -25, 'released');
    logEvent((CIVS[civId] ? CIVS[civId].name : civId) + ' released from vassalage', 'info');
  }
  // Domination now counts a rival as subdued if you hold its original capital
  // OR it is your vassal — vassalizing the last rival wins without the mop-up.
  function checkDominationByVassalage(overlordId) {
    if (state.victory || overlordId !== 'player') return;
    var rivals = CIV_SIDES.filter(function (id) { return id !== overlordId; });
    var subdued = 0;
    rivals.forEach(function (rid) {
      if (isVassal(rid)) { subdued++; return; }
      var holdsCap = state.civs[overlordId].cities.some(function (ct) { return ct.capital && ct.originalCiv === rid; });
      if (holdsCap) subdued++;
    });
    if (subdued >= rivals.length) declareVictory(overlordId, 'domination');
  }

  function showPeaceOffer() {
    if (!state.pendingPeace) return;
    var offer = state.pendingPeace;
    var fromId = offer.from;
    var fromName = CIVS[fromId] ? CIVS[fromId].name : 'Enemy';
    var kind = offer.kind || 'peace';
    var actions = [];
    if (kind === 'vassal') {
      actions.push({
        icon: '⚜', primary: true, title: 'Accept Capitulation',
        sub: fromName + ' becomes your vassal · +' + VASSAL_TRIBUTE + 'g/turn tribute · joins your wars · counts for Domination',
        do: function () { makeVassal(fromId, 'player'); sfxAlly(); showToast(fromName + ' is now your vassal', 'success'); state.pendingPeace = null; closeModal(); draw(); updateHud(); }
      });
      actions.push({
        icon: '⚔', title: 'Refuse — finish them', danger: true,
        sub: 'Continue the war',
        do: function () { state.pendingPeace = null; closeModal(); draw(); }
      });
      renderDiplomacyActions(actions, fromName + ' Offers Capitulation');
    } else if (kind === 'alliance') {
      actions.push({
        icon: '★', primary: true, title: 'Accept Alliance',
        sub: 'Permanent peace pact with ' + fromName,
        do: function () { setRelation('player', fromId, 'allied'); sfxAlly(); logEvent('Allied with ' + fromName, 'success'); showToast('Allied with ' + fromName, 'success'); state.pendingPeace = null; closeModal(); draw(); }
      });
      actions.push({
        icon: '✕', title: 'Decline', danger: true,
        sub: 'Politely refuse',
        do: function () { state.pendingPeace = null; closeModal(); draw(); }
      });
      renderDiplomacyActions(actions, fromName + ' Proposes Alliance');
    } else if (kind === 'deal') {
      actions.push({
        icon: '⚗', primary: true, title: 'Accept Research Deal',
        sub: 'Both sides gain +' + MUTUAL_DEAL_SCI + ' science toward current research',
        do: function () {
          var pl = state.civs.player;
          var ai = state.civs[fromId];
          if (pl.currentTech) pl.techProgress = Math.min(TECHS[pl.currentTech].cost, pl.techProgress + MUTUAL_DEAL_SCI);
          if (ai.currentTech) ai.techProgress = Math.min(TECHS[ai.currentTech].cost, ai.techProgress + MUTUAL_DEAL_SCI);
          sfxResearch();
          logEvent('Research deal with ' + fromName + ' (+' + MUTUAL_DEAL_SCI + ' sci)', 'success');
          showToast('+' + MUTUAL_DEAL_SCI + ' science from ' + fromName, 'success');
          state.pendingPeace = null;
          closeModal();
          draw();
        }
      });
      actions.push({
        icon: '✕', title: 'Decline', danger: true,
        sub: 'Politely refuse',
        do: function () { state.pendingPeace = null; closeModal(); draw(); }
      });
      renderDiplomacyActions(actions, fromName + ' Proposes Research Deal');
    } else {
      // peace
      actions.push({
        icon: '☮', primary: true, title: 'Accept Peace',
        sub: 'End the war with ' + fromName,
        do: function () { makePeace('player', fromId); state.pendingPeace = null; closeModal(); draw(); }
      });
      actions.push({
        icon: '⚔', title: 'Reject', danger: true,
        sub: 'Continue the war',
        do: function () { state.pendingPeace = null; closeModal(); draw(); }
      });
      renderDiplomacyActions(actions, fromName + ' Offers Peace');
    }
  }

  // Shared renderer for any diplomacy-modal layout. Wipes #action-list and
  // re-uses the action-menu modal frame.
  function renderDiplomacyActions(actions, title) {
    var list = document.getElementById('action-list');
    list.innerHTML = '';
    actions.forEach(function (a) {
      var row = document.createElement('button');
      var cls = 'action-row focusable';
      if (a.disabled) cls += ' disabled';
      if (a.primary)  cls += ' primary';
      if (a.danger)   cls += ' danger';
      if (a.header)   cls += ' diplomacy-header';
      row.className = cls;
      if (a.disabled) row.setAttribute('disabled', '');
      row.tabIndex = a.disabled ? -1 : 0;
      row.innerHTML = '<div class="action-icon">' + a.icon + '</div>' +
        '<div class="action-body"><div class="action-title">' + a.title + '</div>' +
        (a.sub ? '<div class="action-sub">' + a.sub + '</div>' : '') + '</div>';
      if (a.do && !a.disabled) row.addEventListener('click', a.do);
      list.appendChild(row);
    });
    document.getElementById('action-title').textContent = title;
    showModal('action-menu');
  }

  // Trade cost / yield for player → AI "trade for tech progress"
  var TRADE_GOLD_COST = 80;     // player pays
  var TRADE_SCI_GAIN  = 35;     // player gains toward current tech
  var MUTUAL_DEAL_SCI = 30;     // free mutual research deal (offered by AI)
  // How sharply each offer's acceptance falls as the AI's tension rises.
  // Shared by the displayed odds and the actual roll so they always match.
  var ACCEPT_SENS = { alliance: 90, peace: 120, trade: 100 };

  function relationLabel(rel) {
    if (rel === 'war') return 'At War';
    if (rel === 'peace') return 'At Peace';
    if (rel === 'allied') return 'Allied ★';
    return rel || 'Unknown';
  }

  // ---- Statecraft: Defensive Pacts, Coalitions, buying tech ----------------
  var COALITION_TENSION = 55;   // grudge bribed rivals bank against the frontrunner
  function hasPact(a, b) { return !!(state.pacts && state.pacts[dipKey(a, b)]); }
  function setPact(a, b, on) { if (!state.pacts) state.pacts = {}; if (on) state.pacts[dipKey(a, b)] = true; else delete state.pacts[dipKey(a, b)]; }
  // The runaway frontrunner — a RIVAL clearly ahead of the field — or null.
  function runawayLeader() {
    var arr = [];
    CIV_SIDES.forEach(function (id) { var c = state.civs[id]; if (c && c.cities.length) arr.push({ id: id, s: leadScore(c) }); });
    if (arr.length < 2) return null;
    arr.sort(function (a, b) { return b.s - a.s; });
    if (arr[0].id === 'player') return null;                 // you're ahead — no one to gang up on
    if (arr[0].s < arr[1].s * 1.35 + 4) return null;          // not a clear runaway yet
    return arr[0].id;
  }
  function coalitionMembers(leaderId) {
    return CIV_SIDES.filter(function (id) { return id !== leaderId && id !== 'player' && state.civs[id] && state.civs[id].cities.length; });
  }
  function coalitionCost(leaderId) { return 100 + 40 * coalitionMembers(leaderId).length; }
  // Bankroll the other rivals into a grudge against the frontrunner — they grow
  // far likelier to declare war on them (player-driven anti-snowball).
  function formCoalition(leaderId) {
    var members = coalitionMembers(leaderId), cost = coalitionCost(leaderId), pl = state.civs.player;
    if (!members.length) { showToast('No rivals left to rally', 'error'); return; }
    if (pl.gold < cost) { showToast('Need ' + cost + ' gold to bankroll a coalition', 'error'); return; }
    pl.gold -= cost;
    var lname = CIVS[leaderId] ? CIVS[leaderId].name : leaderId;
    members.forEach(function (id) {
      addTension(id, leaderId, COALITION_TENSION, 'coalition');
      addTension(id, 'player', -12);                 // the bribe warms them to you
      remember(id, 'You paid us to move against ' + lname, 0);
    });
    sfxAlly();
    showToast('Coalition rallied against ' + lname + '! (-' + cost + 'g)', 'success');
    logEvent('Bankrolled a coalition against ' + lname + ' — rivals now eye them hungrily', 'success');
    chronicle('Forged a coalition against ' + leaderOf(leaderId).name + ' of ' + lname + '.');
  }
  // The cheapest tech a rival knows that the player lacks but can integrate.
  function buyableTechFrom(aiId) {
    var pl = state.civs.player, ai = state.civs[aiId]; if (!ai) return null;
    var best = null;
    for (var i = 0; i < TECH_ORDER.length; i++) {
      var t = TECH_ORDER[i];
      if (pl.techs[t] || !ai.techs[t]) continue;
      if (!TECHS[t].req.every(function (r) { return pl.techs[r]; })) continue;
      if (!best || TECHS[t].cost < TECHS[best].cost) best = t;
    }
    return best;
  }
  function buyTechCost(t) { return Math.round(TECHS[t].cost * 2.2); }
  function playerBuyTech(aiId) {
    var t = buyableTechFrom(aiId);
    if (!t) { showToast('They have no tech you can adopt', 'error'); return; }
    var pl = state.civs.player, ai = state.civs[aiId], cost = buyTechCost(t);
    if (pl.gold < cost) { showToast('Need ' + cost + ' gold', 'error'); return; }
    var per = AI_PERSONALITIES[ai.personality] || AI_PERSONALITIES.economic;
    var base = per.techPreference === 'science' ? 0.25 : per.acceptTrade;   // scientists guard their lead
    if (rnd() < acceptChance(base, tensionOf(aiId, 'player'), ACCEPT_SENS.trade)) {
      pl.gold -= cost; ai.gold += cost;
      var ageBefore = getAge(pl);
      pl.techs[t] = true;
      if (pl.currentTech === t) { pl.currentTech = null; pl.techProgress = 0; popQueuedTech(pl); }
      addTension(aiId, 'player', -5); remember(aiId, 'We sold you the secret of ' + TECHS[t].name);
      sfxResearch();
      var ageAfter = getAge(pl);
      if (ageAfter.name !== ageBefore.name) { var g = ageAdvanceGold(ageAfter); pl.gold += g; }
      showToast('Bought ' + TECHS[t].name + ' from ' + CIVS[aiId].name + ' (-' + cost + 'g)', 'success');
      logEvent('Bought ' + TECHS[t].name + ' from ' + CIVS[aiId].name + ' for ' + cost + ' gold', 'success');
      var allDone = true; for (var i = 0; i < TECH_ORDER.length; i++) if (!pl.techs[TECH_ORDER[i]]) { allDone = false; break; }
      if (allDone) { declareVictory('player', 'science'); return; }
      recomputeIncome('player');
    } else {
      showToast(CIVS[aiId].name + ' refuses to sell that knowledge', 'error');
      logEvent(CIVS[aiId].name + ' refused to sell ' + TECHS[t].name, 'info');
    }
  }
  function playerProposeDefensivePact(aiId) {
    var ai = state.civs[aiId];
    var per = AI_PERSONALITIES[ai.personality] || AI_PERSONALITIES.peaceful;
    if (rnd() < acceptChance(per.acceptAlliance + 0.1, tensionOf(aiId, 'player'), ACCEPT_SENS.alliance)) {
      setPact('player', aiId, true);
      addTension(aiId, 'player', -8);
      sfxAlly();
      showToast('Defensive Pact signed with ' + CIVS[aiId].name, 'success');
      logEvent('Signed a Defensive Pact with ' + CIVS[aiId].name + ' — they answer aggression against you', 'success');
    } else {
      showToast(CIVS[aiId].name + ' declines a pact', 'error');
    }
  }

  // Append a "Swap Luxuries" row when a mutually-beneficial luxury pair exists
  // with this rival (only meaningful while not at war).
  function pushLuxurySwap(actions, civPl, aiId, ten) {
    var deal = luxurySwapDeal(civPl, aiId);
    if (!deal) return;
    var giveL = (RESOURCES[deal.give] || {}).label || deal.give;
    var getL  = (RESOURCES[deal.get]  || {}).label || deal.get;
    var pct = Math.round(acceptChance(SWAP_ACCEPT_BASE, ten, ACCEPT_SENS.trade) * 100);
    actions.push({
      icon: '♦', title: 'Swap Luxuries',
      sub: 'Give ' + giveL + ' ⇄ get ' + getL + ' · both +1 happiness · likely: ' + pct + '%',
      do: function () { playerSwapLuxuries(aiId, deal); closeModal(); draw(); }
    });
  }

  // Append Buy-Tech (always when they have something) and, at peace, a
  // Defensive Pact row for one rival.
  function pushStatecraft(actions, civPl, aiId, ten, rel) {
    var buyT = buyableTechFrom(aiId);
    if (buyT) {
      var bc = buyTechCost(buyT);
      actions.push({
        icon: '⚛', title: 'Buy ' + TECHS[buyT].name,
        sub: 'Learn it outright · ' + bc + 'g',
        disabled: civPl.gold < bc,
        do: function () { playerBuyTech(aiId); closeModal(); draw(); }
      });
    }
    if (rel === 'peace') {
      if (hasPact('player', aiId)) {
        actions.push({ icon: '🛡', disabled: true, title: 'Defensive Pact active', sub: 'They answer aggression against you', do: function () {} });
      } else {
        var per = AI_PERSONALITIES[state.civs[aiId].personality] || AI_PERSONALITIES.peaceful;
        var pctPact = Math.round(acceptChance(per.acceptAlliance + 0.1, ten, ACCEPT_SENS.alliance) * 100);
        actions.push({
          icon: '🛡', title: 'Defensive Pact',
          sub: 'They war anyone who attacks you · likely: ' + pctPact + '%',
          do: function () { playerProposeDefensivePact(aiId); closeModal(); draw(); }
        });
      }
    }
  }

  function openDiplomacy() {
    var civPl = state.civs.player;
    var actions = [];
    // Anti-snowball: bankroll a coalition when a rival is running away with it.
    var leaderId = runawayLeader();
    if (leaderId && coalitionMembers(leaderId).length) {
      var lname = CIVS[leaderId] ? CIVS[leaderId].name : leaderId;
      var cCost = coalitionCost(leaderId);
      actions.push({ header: true, disabled: true, icon: '⚖', title: 'A frontrunner emerges', sub: lname + ' is pulling ahead of the world.' });
      actions.push({
        icon: '🤝', primary: true, title: 'Form Coalition vs ' + lname,
        sub: 'Bankroll the other rivals to turn on them · ' + cCost + 'g',
        disabled: civPl.gold < cCost,
        do: function () { formCoalition(leaderId); closeModal(); draw(); }
      });
    }
    AI_SIDES.forEach(function (aiId) {
      var aiCiv = state.civs[aiId];
      // Skip only if civ is fully eliminated (no cities, no units)
      if (!aiCiv || (aiCiv.cities.length === 0 && aiCiv.units.length === 0)) return;
      var aiName = CIVS[aiId].name;
      // A vassal shows a status card instead of the usual war/trade options.
      if (isVassal(aiId) && state.vassals[aiId] === 'player') {
        actions.push({ header: true, icon: '⚜', title: aiName + ' — your vassal', sub: 'Pays ' + VASSAL_TRIBUTE + 'g/turn tribute · fights your wars · counts for Domination' });
        actions.push({ icon: '🕊', title: 'Release ' + aiName, sub: 'Grant independence · they remember the kindness', do: function () { releaseVassal(aiId); showToast(aiName + ' released', 'success'); closeModal(); openDiplomacy(); } });
        return;
      }
      // Always fall back to a defined personality so the % displays + action
      // probabilities don't throw on a malformed save.
      var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.peaceful;
      var perLabel = per.icon + ' ' + per.label;
      var rel = relation('player', aiId);
      // Current grievance toward the player + tension-adjusted odds.
      var ten = tensionOf(aiId, 'player');
      var ti = tensionInfo(ten);
      var attitude = rel === 'allied'
        ? '<span style="color:#00ff88">Allied</span>'
        : '<span style="color:' + ti.color + '">' + ti.label + '</span>';
      var pctAlliance = Math.round(acceptChance(per.acceptAlliance, ten, ACCEPT_SENS.alliance) * 100);
      var pctPeace    = Math.round(acceptChance(per.acceptPeace,    ten, ACCEPT_SENS.peace)    * 100);
      var pctTrade    = Math.round(acceptChance(per.acceptTrade,    ten, ACCEPT_SENS.trade)    * 100);

      // Header row (informational) — leader + personality + live attitude
      var ldr = leaderOf(aiId);
      var ldrName = ldr.name + (ldr.title ? ' ' + ldr.title : '');
      actions.push({
        header: true, disabled: true,
        icon: '⬢', title: ldrName + ' of ' + aiName + ' — ' + relationLabel(rel),
        sub: perLabel + ' · ' + attitude
      });
      // Agenda + the most recent memory of how you've treated them
      var agInfo = AGENDAS[aiCiv.agenda];
      var memLine = (aiCiv.memory && aiCiv.memory.length) ? '“' + aiCiv.memory[aiCiv.memory.length - 1].text + '”' : 'No notable history yet';
      actions.push({
        header: true, disabled: true,
        icon: '◷', title: agInfo ? 'Agenda: ' + agInfo.name : 'Agenda: —',
        sub: (agInfo ? agInfo.desc + ' · ' : '') + memLine
      });

      if (rel === 'war') {
        actions.push({
          icon: '☮', primary: true, title: 'Offer Peace',
          sub: 'Likely: ' + pctPeace + '%',
          do: function () { playerOfferPeace(aiId); closeModal(); draw(); }
        });
      } else if (rel === 'allied') {
        actions.push({
          icon: '✕', danger: true, title: 'Renounce Alliance',
          sub: 'Back to peace; either side may then declare war',
          do: function () { setRelation('player', aiId, 'peace'); remember(aiId, 'You abandoned our alliance', 10); showToast('Alliance with ' + aiName + ' renounced', 'error'); logEvent('Renounced alliance with ' + aiName, 'error'); closeModal(); draw(); }
        });
        actions.push({
          icon: '⚗', title: 'Trade for Tech',
          sub: TRADE_GOLD_COST + 'g → +' + TRADE_SCI_GAIN + ' science · likely: ' + pctTrade + '%',
          disabled: civPl.gold < TRADE_GOLD_COST || !civPl.currentTech,
          do: function () { playerTradeForTech(aiId); closeModal(); draw(); }
        });
        pushLuxurySwap(actions, civPl, aiId, ten);
        pushStatecraft(actions, civPl, aiId, ten, 'allied');
      } else {
        // at peace
        actions.push({
          icon: '★', primary: true, title: 'Propose Alliance',
          sub: 'Permanent peace pact · likely: ' + pctAlliance + '%',
          do: function () { playerProposeAlliance(aiId); closeModal(); draw(); }
        });
        actions.push({
          icon: '⚗', title: 'Trade for Tech',
          sub: TRADE_GOLD_COST + 'g → +' + TRADE_SCI_GAIN + ' science · likely: ' + pctTrade + '%',
          disabled: civPl.gold < TRADE_GOLD_COST || !civPl.currentTech,
          do: function () { playerTradeForTech(aiId); closeModal(); draw(); }
        });
        pushLuxurySwap(actions, civPl, aiId, ten);
        pushStatecraft(actions, civPl, aiId, ten, 'peace');
        actions.push({
          icon: '⚔', danger: true, title: 'Declare War',
          sub: 'Break the peace treaty',
          do: function () { declareWarOn('player', aiId); closeModal(); draw(); }
        });
      }
    });
    actions.push({
      icon: '←', title: 'Back',
      do: function () { closeModal(); }
    });
    renderDiplomacyActions(actions, 'Diplomacy');
  }

  // Short one-line summary of a government's bonuses for the picker.
  function governmentBonusText(g) {
    var p = [];
    if (g.perCityGold)    p.push('+' + g.perCityGold + ' gold/city');
    if (g.perCitySci)     p.push('+' + g.perCitySci + ' sci/city');
    if (g.perCityProd)    p.push('+' + g.perCityProd + ' prod/city');
    if (g.perCityCulture) p.push('+' + g.perCityCulture + ' culture/city');
    if (g.unitAtk)        p.push('+' + g.unitAtk + ' unit atk');
    if (g.contentment)    p.push('+' + g.contentment + ' stability/city');
    if (g.eraPointMult)   p.push('+' + Math.round((g.eraPointMult - 1) * 100) + '% era pts');
    return p.join(', ');
  }

  // Government picker — reuses the diplomacy action-row renderer (D-pad + tap).
  function openGovernment() {
    var civ = state.civs.player;
    var cur = GOVERNMENTS[civ.government] || GOVERNMENTS.despotism;
    var actions = [];
    var status = civ.governmentTurns > 0
      ? 'Anarchy — ' + civ.governmentTurns + ' turn' + (civ.governmentTurns > 1 ? 's' : '') + ' until ' + cur.name
      : 'Current: ' + cur.name;
    actions.push({ header: true, icon: '⚖', title: status, sub: 'Switching costs ' + ANARCHY_TURNS + ' turns of anarchy (gold & science halved)' });
    GOVERNMENT_ORDER.forEach(function (id) {
      var g = GOVERNMENTS[id];
      var locked = g.tech && !civ.techs[g.tech];
      var isCurrent = civ.government === id && civ.governmentTurns <= 0;
      var bonus = governmentBonusText(g);
      var sub;
      if (locked) sub = 'Needs ' + (TECHS[g.tech] ? TECHS[g.tech].name : g.tech);
      else if (isCurrent) sub = bonus ? bonus + ' · active' : 'Active';
      else sub = bonus || 'No bonus';
      actions.push({
        icon: isCurrent ? '★' : '◆',
        title: g.name + (isCurrent ? ' ✓' : ''),
        sub: sub,
        disabled: locked || isCurrent,
        primary: isCurrent,
        do: (locked || isCurrent) ? null : function () {
          if (setGovernment(civ, id)) { recomputeIncome('player'); updateHud(); save(); }
          closeModal();
          draw();
        }
      });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Government');
  }

  // Adopt (or switch) an Ideology — a late-game culture identity. Free to change.
  function setIdeology(civ, id) {
    if (!civ || !IDEOLOGIES[id]) return false;
    var was = civ.ideology;
    civ.ideology = id;
    recomputeIncome(civ.id);
    if (civ.id === 'player') {
      showToast('Ideology: ' + IDEOLOGIES[id].name, 'success');
      logEvent((was ? 'Shifted ideology to ' : 'Adopted the ideology of ') + IDEOLOGIES[id].name, 'success');
    }
    return true;
  }
  // Ideology picker — Freedom / Order / Autocracy, the culture-side mirror of govs.
  function openIdeology() {
    var civ = state.civs.player;
    var actions = [];
    actions.push({ header: true, icon: '★', title: civ.ideology ? 'Current: ' + IDEOLOGIES[civ.ideology].name : 'Choose an Ideology', sub: 'A guiding late-game identity — big empire-wide bonuses' });
    IDEOLOGY_ORDER.forEach(function (id) {
      var io = IDEOLOGIES[id];
      var isCur = civ.ideology === id;
      actions.push({
        icon: isCur ? '★' : '◆',
        title: io.name + (isCur ? ' ✓' : ''),
        sub: io.desc,
        disabled: isCur,
        primary: isCur,
        do: isCur ? null : function () { if (setIdeology(civ, id)) { updateHud(); save(); } closeModal(); draw(); }
      });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Ideology');
  }
  // AI adopts an ideology by personality the first time it reaches the Modern age.
  function aiPickIdeology(civ) {
    if (!civ || civ.ideology || !ideologyUnlocked(civ)) return;
    var pick;
    switch (civ.personality) {
      case 'aggressive': case 'warmonger': pick = 'autocracy'; break;
      case 'scientific': case 'cultural': pick = 'freedom'; break;
      case 'economic': case 'expansionist': pick = 'order'; break;
      default: pick = 'order';
    }
    setIdeology(civ, pick);
  }

  // ---- RELIGION mechanics ----
  // Found a religion in a civ's best city, spending its banked faith. opts.free
  // (a Great Prophet founding) skips both the faith-cost and the faith threshold.
  function foundReligion(civ, religionId, belief, opts) {
    opts = opts || {};
    var free = !!opts.free;
    if (!civ || !religionId || state.religions[religionId] || !BELIEFS[belief]) return false;
    if (civ.religionId) return false;
    if (foundedReligionCount() >= RELIGION_POOL.length) return false;
    if (!free && (civ.faith || 0) < RELIGION_FOUND_COST) return false;
    var poolDef = null;
    for (var i = 0; i < RELIGION_POOL.length; i++) if (RELIGION_POOL[i].id === religionId) poolDef = RELIGION_POOL[i];
    if (!poolDef) return false;
    // Holy city = the civ's highest-pop city (its religious heart).
    var holy = civ.cities[0];
    civ.cities.forEach(function (ct) { if (ct.pop > (holy ? holy.pop : 0)) holy = ct; });
    if (!holy) return false;
    state.religions[religionId] = { id: religionId, name: poolDef.name, icon: poolDef.icon, belief: belief, founder: civ.id, holyC: holy.c, holyR: holy.r };
    civ.religionId = religionId;
    if (!free) civ.faith = Math.max(0, (civ.faith || 0) - RELIGION_FOUND_COST);
    holy.religion = religionId;
    holy.holyCity = true;
    recomputeIncome(civ.id);
    if (civ.id === 'player') {
      sfxWonder();
      showToast('Founded ' + poolDef.name + '!', 'success');
      logEvent('Founded ' + poolDef.name + ' in ' + holy.name + ' — belief: ' + BELIEFS[belief].name, 'success');
      chronicle('Founded the faith of ' + poolDef.name + ' in ' + holy.name + '.');
      queueYieldFx(holy.c, holy.r, poolDef.icon + ' ' + poolDef.name, '#ffd34d', 'rgba(255,211,77,0.35)');
    } else {
      logEvent((CIVS[civ.id] ? CIVS[civ.id].name : civ.id) + ' founded ' + poolDef.name, 'info');
    }
    return true;
  }
  // AI founds a faith (belief by personality) the moment it can afford one.
  function aiFoundReligion(civ) {
    if (!canFoundReligion(civ)) return;
    var used = {}; for (var k in state.religions) used[state.religions[k].id] = 1;
    var pick = null;
    for (var i = 0; i < RELIGION_POOL.length; i++) if (!used[RELIGION_POOL[i].id]) { pick = RELIGION_POOL[i].id; break; }
    if (!pick) return;
    var belief = { scientific: 'scholarship', economic: 'tithe', peaceful: 'piety' }[civ.personality] || 'fertility';
    foundReligion(civ, pick, belief);
  }
  // AI adopts a Pantheon as soon as it can afford one (personality-flavoured).
  function aiPickPantheon(civ) {
    if (!canFoundPantheon(civ)) return;
    var pick = { scientific: 'goddess_wisdom', economic: 'god_of_commerce', expansionist: 'fertility_rites', aggressive: 'god_of_forge' }[civ.personality] || 'stone_circles';
    foundPantheon(civ, pick);
  }
  // AI reforms its faith with a complementary second belief once it has reach.
  function aiReform(civ) {
    if (!canReform(civ)) return;
    var rd = religionDef(civ.religionId);
    var want = { scientific: 'scholarship', economic: 'tithe', peaceful: 'piety', expansionist: 'zeal', aggressive: 'zeal' }[civ.personality] || 'pilgrimage';
    if (want === rd.belief) want = 'zeal';       // don't duplicate the founding belief
    if (want === rd.belief) want = 'stewardship';
    reformReligion(civ, want);
  }
  // Each turn, founded religions radiate pressure to nearby cities; every city
  // adopts whichever faith presses hardest (holy cities are locked; the current
  // faith gets a small incumbency edge to damp border flip-flop).
  function spreadReligion() {
    if (!state.religions || !foundedReligionCount()) return;
    var holy = {};   // religionId -> [ {c,r} ] holy-city coords
    var sources = []; // every city that follows a religion is a pressure source
    CIV_SIDES.concat(['cs']).forEach(function (cid) {
      var c = state.civs[cid];
      if (!c || !c.cities) return;
      c.cities.forEach(function (ct) { if (ct.religion) sources.push(ct); });
    });
    if (!sources.length) return;
    CIV_SIDES.concat(['cs']).forEach(function (cid) {
      var c = state.civs[cid];
      if (!c || !c.cities) return;
      c.cities.forEach(function (ct) {
        if (ct.holyCity || ct.religionLockTurns > 0) return;   // holy / recently-purged cities hold firm
        var pressure = {};
        sources.forEach(function (src) {
          if (src === ct) return;
          var d = hexDist([ct.c, ct.r], [src.c, src.r]);
          var sp = religionSpread(src.religion);           // Missionary Zeal: +range / +pressure
          if (d > RELIGION_RANGE + sp.range) return;
          var p = ((src.holyCity ? 2 : 1) + sp.pressure) / (1 + d);
          pressure[src.religion] = (pressure[src.religion] || 0) + p;
        });
        if (ct.religion) pressure[ct.religion] = (pressure[ct.religion] || 0) * 1.25 + 0.15;  // incumbency
        var best = ct.religion || null, bestP = ct.religion ? pressure[ct.religion] : 0;
        for (var rid in pressure) { if (pressure[rid] > bestP) { bestP = pressure[rid]; best = rid; } }
        if (best && best !== ct.religion) ct.religion = best;
      });
    });
  }
  function checkReligionVictory() {
    if (state.victory) return;
    var total = totalCityCount();
    if (total < 3) return;   // not meaningful on a tiny early map
    CIV_SIDES.forEach(function (cid) {
      var c = state.civs[cid];
      if (!c || !c.religionId) return;
      if (religionFollowerCount(c.religionId) / total >= RELIGION_VICTORY_FRAC) declareVictory(cid, 'religion');
    });
  }
  // Religion picker — choose a faith name + a belief, spending banked faith.
  function openReligion() {
    var civ = state.civs.player;
    var actions = [];
    // --- Pantheon (cheap, early, civ-wide) ---
    if (civ.pantheon) {
      var pd = PANTHEONS[civ.pantheon];
      actions.push({ icon: '☘', title: 'Pantheon: ' + (pd ? pd.name : '?'), sub: pd ? pd.desc : '', disabled: true, do: function () {} });
    } else if (canFoundPantheon(civ)) {
      actions.push({ icon: '☘', title: 'Adopt a Pantheon', sub: 'Spend ' + PANTHEON_COST + ' faith on a civ-wide blessing', primary: true, do: function () { closeModal(); openPantheonPicker(); } });
    }
    // --- Religion ---
    if (civ.religionId) {
      var rd = religionDef(civ.religionId);
      var followers = religionFollowerCount(civ.religionId), total = totalCityCount();
      var bnames = beliefsOf(rd).map(function (b) { return b.name; }).join(' + ') || '?';
      actions.push({ header: true, icon: rd ? rd.icon : '☧', title: rd ? rd.name : 'Your Faith', sub: bnames + ' · ' + followers + '/' + total + ' cities follow' });
      actions.push({ icon: '✦', title: 'Faith per turn', sub: '+' + faithPerTurn(civ) + ' faith · ' + Math.round((civ.faith || 0)) + ' banked', disabled: true, do: function () {} });
      if (canReform(civ)) {
        actions.push({ icon: '✷', title: 'Reformation', sub: 'Add a second belief to your faith', primary: true, do: function () { closeModal(); openReformPicker(); } });
      } else if (rd && !rd.belief2) {
        actions.push({ icon: '✷', title: 'Reformation', sub: 'Needs ' + REFORMATION_FOLLOWERS + ' following cities (' + followers + ' now)', disabled: true, do: function () {} });
      }
    } else if (canFoundReligion(civ) || prophetFoundingUnit) {
      var byProphet = !!prophetFoundingUnit;
      actions.push({ header: true, icon: '☧', title: byProphet ? 'Great Prophet: Found a Religion' : 'Found a Religion', sub: byProphet ? 'Pick a faith, then a belief (free)' : 'Pick a faith, then a belief (' + Math.round(civ.faith || 0) + '/' + RELIGION_FOUND_COST + ' faith)' });
      var used = {}; for (var k in state.religions) used[k] = 1;
      RELIGION_POOL.forEach(function (rel) {
        if (used[rel.id]) return;
        actions.push({ icon: rel.icon, title: rel.name, sub: 'Found this faith', do: function () { closeModal(); openBeliefPicker(rel.id); } });
      });
    } else {
      actions.push({ header: true, icon: '☧', title: 'Faith', sub: foundedReligionCount() >= RELIGION_POOL.length ? 'All religions have been founded' : 'Build Shrines & Temples — ' + Math.round(civ.faith || 0) + '/' + RELIGION_FOUND_COST + ' faith (+' + faithPerTurn(civ) + '/turn)' });
    }
    // --- Faith-bought religious units (need a faith of your own to carry) ---
    if (civMajorityReligion(civ) && civ.cities.length) {
      actions.push({
        icon: '☩', title: 'Train Missionary (' + MISSIONARY_FAITH_COST + ' faith)',
        sub: 'Travels to a city and converts it (' + MISSIONARY_CHARGES + ' spreads)',
        disabled: (civ.faith || 0) < MISSIONARY_FAITH_COST,
        do: function () { if (buyFaithUnit(civ, civ.cities[0], 'missionary')) { showToast('Missionary trained', 'success'); updateHud(); save(); } else { showToast('Cannot train now', 'error'); } closeModal(); draw(); }
      });
      actions.push({
        icon: '☨', title: 'Train Inquisitor (' + INQUISITOR_FAITH_COST + ' faith)',
        sub: 'Purges a rival faith from your city',
        disabled: (civ.faith || 0) < INQUISITOR_FAITH_COST,
        do: function () { if (buyFaithUnit(civ, civ.cities[0], 'inquisitor')) { showToast('Inquisitor trained', 'success'); updateHud(); save(); } else { showToast('Cannot train now', 'error'); } closeModal(); draw(); }
      });
    }
    actions.push({ icon: '←', title: 'Back', do: function () { if (prophetFoundingUnit) prophetFoundingUnit = null; closeModal(); } });
    renderDiplomacyActions(actions, 'Religion');
  }
  // Pantheon picker — a one-time civ-wide blessing bought with a little faith.
  function openPantheonPicker() {
    var civ = state.civs.player;
    var actions = [];
    actions.push({ header: true, icon: '☘', title: 'Adopt a Pantheon', sub: 'Spend ' + PANTHEON_COST + ' faith · kept for the whole game' });
    PANTHEON_ORDER.forEach(function (id) {
      var p = PANTHEONS[id];
      actions.push({ icon: '☘', title: p.name, sub: p.desc, do: function () { if (foundPantheon(civ, id)) { showToast('Pantheon: ' + p.name, 'success'); updateHud(); save(); } closeModal(); openReligion(); } });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); openReligion(); } });
    renderDiplomacyActions(actions, 'Pantheon');
  }
  // Reformation picker — add a complementary second belief to a mature faith.
  function openReformPicker() {
    var civ = state.civs.player;
    var rd = religionDef(civ.religionId);
    var actions = [];
    actions.push({ header: true, icon: '✷', title: 'Reformation', sub: 'Add a second belief to ' + (rd ? rd.name : 'your faith') });
    BELIEF_ORDER.forEach(function (b) {
      if (rd && b === rd.belief) return;   // already carried by the founding belief
      actions.push({ icon: '✦', title: BELIEFS[b].name, sub: BELIEFS[b].desc, do: function () { if (reformReligion(civ, b)) { showToast('Reformation: ' + BELIEFS[b].name, 'success'); updateHud(); save(); } closeModal(); draw(); } });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); openReligion(); } });
    renderDiplomacyActions(actions, 'Reformation');
  }
  function openBeliefPicker(religionId) {
    var actions = [];
    var rel = null; for (var i = 0; i < RELIGION_POOL.length; i++) if (RELIGION_POOL[i].id === religionId) rel = RELIGION_POOL[i];
    var byProphet = !!prophetFoundingUnit;
    actions.push({ header: true, icon: rel ? rel.icon : '☧', title: rel ? rel.name : 'Belief', sub: 'Choose this faith’s guiding belief' + (byProphet ? ' (founded free by your Prophet)' : '') });
    BELIEF_ORDER.forEach(function (b) {
      actions.push({ icon: '✦', title: BELIEFS[b].name, sub: BELIEFS[b].desc, do: function () {
        if (foundReligion(state.civs.player, religionId, b, { free: byProphet })) {
          if (byProphet && prophetFoundingUnit) { killUnit(prophetFoundingUnit); }
          updateHud(); save();
        }
        prophetFoundingUnit = null;
        closeModal(); draw();
      } });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); openReligion(); } });
    renderDiplomacyActions(actions, 'Belief');
  }

  // Edict picker — a fast reactive stance with a single sharp tradeoff.
  function openEdicts() {
    var civ = state.civs.player;
    var cur = activeEdict(civ);
    var actions = [];
    actions.push({
      header: true, disabled: true, icon: '✶',
      title: cur ? 'Active: ' + cur.name + ' — ' + civ.edictTurns + ' turn' + (civ.edictTurns > 1 ? 's' : '') + ' left' : 'No edict in force',
      sub: 'One at a time · runs its term, then lapses'
    });
    EDICT_ORDER.forEach(function (id) {
      var e = EDICTS[id];
      var locked = e.tech && !civ.techs[e.tech];
      var isCurrent = civ.edict === id && civ.edictTurns > 0;
      var sub = locked ? 'Needs ' + (TECHS[e.tech] ? TECHS[e.tech].name : e.tech) : e.desc + (isCurrent ? ' · active' : '');
      actions.push({
        icon: isCurrent ? '★' : '◆', title: e.name + (isCurrent ? ' ✓' : ''), sub: sub,
        disabled: locked || isCurrent, primary: isCurrent,
        do: (locked || isCurrent) ? null : function () { if (setEdict(civ, id)) { recomputeIncome('player'); updateHud(); save(); } closeModal(); draw(); }
      });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Edicts');
  }

  // Era / Golden-Age info screen (opened from the ERA HUD chip).
  function openEra() {
    var civ = state.civs.player;
    var gov = GOVERNMENTS[civ.government] || GOVERNMENTS.despotism;
    var actions = [];
    if (civ.goldenAgeTurns > 0) {
      actions.push({ header: true, icon: '☀', title: 'Golden Age — ' + civ.goldenAgeTurns + ' turn' + (civ.goldenAgeTurns > 1 ? 's' : '') + ' left', sub: '+1 food / prod / gold / science in every city' });
    } else {
      actions.push({ header: true, icon: '◔', title: 'Era Points: ' + (civ.eraPoints || 0) + ' / ' + goldenAgeThreshold(civ), sub: 'Bank culture + a slice of gold/sci surplus to ignite a Golden Age' });
    }
    actions.push({
      icon: '⚖',
      title: 'Government: ' + gov.name + (civ.governmentTurns > 0 ? ' (anarchy ' + civ.governmentTurns + ')' : ''),
      sub: 'Tap to change your empire stance',
      do: function () { closeModal(); openGovernment(); }
    });
    var ed = activeEdict(civ);
    actions.push({
      icon: '✶',
      title: 'Edict: ' + (ed ? ed.name + ' (' + civ.edictTurns + 'T)' : 'none'),
      sub: ed ? ed.desc : 'Proclaim a timed stance',
      do: function () { closeModal(); openEdicts(); }
    });
    if (state.lastCrisis) {
      actions.push({ header: true, disabled: true, icon: '⚠', title: 'Last Crisis: ' + state.lastCrisis.name, sub: state.lastCrisis.age + ' world · turn ' + state.lastCrisis.turn });
    }
    // Era quests — standing objectives that pay Era Points once each.
    var qdone = state.eraQuestsDone || {};
    var openQ = ERA_QUESTS.filter(function (q) { return !qdone[q.id]; });
    actions.push({ header: true, disabled: true, icon: '🎯', title: 'Era Quests — ' + (ERA_QUESTS.length - openQ.length) + '/' + ERA_QUESTS.length + ' complete', sub: 'Each pays Era Points toward your next Golden Age' });
    openQ.slice(0, 4).forEach(function (q) {
      actions.push({ icon: '◇', title: q.desc, sub: '+' + q.pts + ' era points', disabled: true, do: function () {} });
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Era & Government');
  }

  // The Chronicle — a scrollable, age-grouped recap of the game's milestones.
  function openChronicle() {
    var ch = state.chronicle || [];
    var actions = [];
    if (!ch.length) {
      actions.push({ header: true, disabled: true, icon: '📜', title: 'The Chronicle', sub: 'Your saga has yet to begin.' });
    } else {
      var lastAge = null;
      ch.forEach(function (e) {
        if (e.age !== lastAge) { actions.push({ header: true, disabled: true, icon: '❖', title: 'The ' + e.age + ' Age' }); lastAge = e.age; }
        // Entry rows are focusable (no-op) so the D-pad can scroll the saga.
        actions.push({ icon: '•', title: e.text, sub: 'Turn ' + e.turn, do: function () {} });
      });
    }
    // After the game ends, Back returns to the end screen (which holds New Game).
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); if (state.victory) showModal('end-screen'); } });
    renderDiplomacyActions(actions, 'The Chronicle');
  }

  function playerOfferPeace(aiId) {
    var aiCiv = state.civs[aiId];
    var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.aggressive;
    var chance = acceptChance(per.acceptPeace, tensionOf(aiId, 'player'), ACCEPT_SENS.peace);
    if (rnd() < chance) {
      makePeace('player', aiId);
      remember(aiId, 'We made peace', -4);
      logEvent(CIVS[aiId].name + ' accepted peace', 'success');
    } else {
      showToast(CIVS[aiId].name + ' refuses peace', 'error');
      logEvent(CIVS[aiId].name + ' refused peace offer', 'error');
    }
  }

  function playerProposeAlliance(aiId) {
    var aiCiv = state.civs[aiId];
    var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.aggressive;
    var chance = acceptChance(per.acceptAlliance, tensionOf(aiId, 'player'), ACCEPT_SENS.alliance);
    if (rnd() < chance) {
      setRelation('player', aiId, 'allied');   // also wipes their tension toward you
      remember(aiId, 'We forged an alliance', -8);
      sfxAlly();
      showToast('Alliance with ' + CIVS[aiId].name + '!', 'success');
      logEvent('Allied with ' + CIVS[aiId].name + ' (' + (per.label || 'Rival') + ')', 'success');
    } else {
      showToast(CIVS[aiId].name + ' declines alliance', 'error');
      logEvent(CIVS[aiId].name + ' declined the alliance proposal', 'info');
    }
  }

  function playerTradeForTech(aiId) {
    var civPl = state.civs.player;
    if (civPl.gold < TRADE_GOLD_COST) { showToast('Not enough gold', 'error'); return; }
    if (!civPl.currentTech) { showToast('No active research', 'error'); return; }
    var aiCiv = state.civs[aiId];
    var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.aggressive;
    var chance = acceptChance(per.acceptTrade, tensionOf(aiId, 'player'), ACCEPT_SENS.trade);
    if (rnd() < chance) {
      civPl.gold -= TRADE_GOLD_COST;
      aiCiv.gold += TRADE_GOLD_COST;
      civPl.techProgress = Math.min((TECHS[civPl.currentTech].cost), civPl.techProgress + TRADE_SCI_GAIN);
      addTension(aiId, 'player', -6);   // a fair deal warms relations a little
      remember(aiId, 'We shared knowledge');
      sfxResearch();
      showToast('Trade with ' + CIVS[aiId].name + ': +' + TRADE_SCI_GAIN + ' science', 'success');
      logEvent('Traded ' + TRADE_GOLD_COST + 'g for ' + TRADE_SCI_GAIN + ' science via ' + CIVS[aiId].name, 'success');
    } else {
      showToast(CIVS[aiId].name + ' rejects the trade', 'error');
      logEvent(CIVS[aiId].name + ' rejected the science trade', 'info');
    }
  }

  var SWAP_ACCEPT_BASE = 0.85;   // luxury swaps benefit both sides — usually yes
  // Mutually swap a luxury with a rival: each imports the other's spare luxury,
  // gaining +1 distinct-luxury contentment. A friendly act that cools tension.
  function playerSwapLuxuries(aiId, deal) {
    var pl = state.civs.player, ai = state.civs[aiId];
    if (!ai) return;
    deal = deal || luxurySwapDeal(pl, aiId);
    if (!deal) { showToast('No luxuries to swap', 'error'); return; }
    var chance = acceptChance(SWAP_ACCEPT_BASE, tensionOf(aiId, 'player'), ACCEPT_SENS.trade);
    var giveL = (RESOURCES[deal.give] || {}).label || deal.give;
    var getL  = (RESOURCES[deal.get]  || {}).label || deal.get;
    if (rnd() < chance) {
      if (!pl.tradedLux) pl.tradedLux = {};
      if (!ai.tradedLux) ai.tradedLux = {};
      pl.tradedLux[deal.get] = aiId;        // player now enjoys the AI's luxury
      ai.tradedLux[deal.give] = 'player';   // AI now enjoys the player's luxury
      addTension(aiId, 'player', -8);       // generosity warms relations
      remember(aiId, 'We swapped luxuries in good faith');
      sfxAlly();
      showToast('Swapped ' + giveL + ' ⇄ ' + getL + ' with ' + CIVS[aiId].name, 'success');
      logEvent('Luxury swap with ' + CIVS[aiId].name + ': ' + giveL + ' ⇄ ' + getL + ' (both +1 contentment)', 'success');
    } else {
      showToast(CIVS[aiId].name + ' declines the swap', 'error');
      logEvent(CIVS[aiId].name + ' declined a luxury swap', 'info');
    }
  }

  function declareVictory(civId, kind) {
    state.victory = civId;
    var who = civId === 'player' ? 'You' : (leaderOf(civId).name + ' of ' + (CIVS[civId] ? CIVS[civId].name : civId));
    chronicle(who + ' achieved a ' + kind + ' victory.');
    showEndScreen(civId, kind);
  }

  // Returns how many World Wonders the given civ owns right now.
  function wondersOwnedBy(civId) {
    var n = 0;
    if (!state.wondersBuilt) return 0;
    for (var k in state.wondersBuilt) if (state.wondersBuilt[k] === civId) n++;
    return n;
  }

  // Per-turn check for culture + economic victories.
  // Called after each civ's end-of-turn so its updated gold/wonders count.
  function checkProgressVictories() {
    if (state.victory) return;
    for (var i = 0; i < CIV_SIDES.length; i++) {
      var id = CIV_SIDES[i];
      var civ = state.civs[id];
      // Eliminated civs (no cities, no settler) can't win — skip them
      if (civ.cities.length === 0 && !civ.units.some(function (u) { return u.type === 'settler'; })) continue;
      // Cultural Ascendancy victory: adopt the entire Civics tree.
      // (Also fires from progressCivic on adoption; this catches loaded saves.)
      if (civicsComplete(civ)) {
        return declareVictory(id, 'culture');
      }
      // Economic victory: hold the threshold for N consecutive turns
      if (civ.gold >= ECONOMIC_VICTORY_GOLD) {
        civ.economicCountdown = (civ.economicCountdown || 0) + 1;
        if (civ.economicCountdown >= ECONOMIC_VICTORY_TURNS) {
          return declareVictory(id, 'economic');
        }
      } else {
        civ.economicCountdown = 0;
      }
    }
  }

  // ---- Victory finish-line ------------------------------------------------
  // A civ's closest victory path as a 0..1 fraction, so the late game reads as
  // a race against a clock rather than a foregone conclusion.
  function victoryProgress(civ) {
    if (!civ) return { kind: 'none', frac: 0, label: '' };
    var totalTechs = TECH_ORDER.length;
    var techN = techCountOf(civ);
    var civicN = civicsAdopted(civ);
    var rivalCount = CIV_SIDES.length - 1;
    var capsHeld = 0;
    civ.cities.forEach(function (ct) { if (ct.capital && ct.originalCiv && ct.originalCiv !== civ.id) capsHeld++; });
    var econ = Math.min(1, civ.gold / ECONOMIC_VICTORY_GOLD) * 0.7 + Math.min(1, (civ.economicCountdown || 0) / ECONOMIC_VICTORY_TURNS) * 0.3;
    var paths = [
      { kind: 'science',    frac: techN / totalTechs,                 label: techN + '/' + totalTechs + ' techs' },
      { kind: 'culture',    frac: civicN / CIVIC_ORDER.length,        label: civicN + '/' + CIVIC_ORDER.length + ' civics' },
      { kind: 'domination', frac: rivalCount ? capsHeld / rivalCount : 0, label: capsHeld + '/' + rivalCount + ' capitals' },
      { kind: 'economic',   frac: econ,                               label: Math.round(civ.gold) + '/' + ECONOMIC_VICTORY_GOLD + ' gold' },
      { kind: 'space',      frac: (civ.spaceParts || 0) / SPACE_PARTS_NEEDED, label: (civ.spaceParts || 0) + '/' + SPACE_PARTS_NEEDED + ' spaceship' }
    ];
    if (civ.religionId) {
      var relTot = totalCityCount();
      var relFol = religionFollowerCount(civ.religionId);
      paths.push({ kind: 'religion', frac: relTot ? (relFol / relTot) / RELIGION_VICTORY_FRAC : 0, label: relFol + '/' + relTot + ' faithful' });
    }
    paths.sort(function (a, b) { return b.frac - a.frac; });
    return paths[0];
  }
  // Whoever is closest to ANY victory (the pace-setter), among living civs.
  function closestVictoryAll() {
    var best = null;
    CIV_SIDES.forEach(function (id) {
      var c = state.civs[id]; if (!c || !c.cities.length) return;
      var vp = victoryProgress(c);
      if (!best || vp.frac > best.frac) best = { civId: id, kind: vp.kind, frac: vp.frac, label: vp.label };
    });
    return best;
  }
  var VICTORY_ALERT_AT = 0.75;   // warn once when a civ crosses this toward a win
  function checkVictoryRaceAlerts() {
    if (state.victory) return;
    if (!state.victoryAlerts) state.victoryAlerts = {};
    CIV_SIDES.forEach(function (id) {
      var c = state.civs[id]; if (!c || !c.cities.length) return;
      var vp = victoryProgress(c);
      if (vp.frac < VICTORY_ALERT_AT) return;
      var key = id + ':' + vp.kind;
      if (state.victoryAlerts[key]) return;
      state.victoryAlerts[key] = true;
      var who = id === 'player' ? 'You are' : (CIVS[id] ? CIVS[id].name + ' is' : id + ' is');
      var msg = who + ' nearing a ' + vp.kind + ' victory! (' + vp.label + ')';
      logEvent('⚠ ' + msg, id === 'player' ? 'success' : 'error');
      showToast('🏁 ' + msg, id === 'player' ? 'success' : 'error');
      chronicle(msg);
    });
  }

  // =====================================================================
  // TURN
  // =====================================================================
  function endTurn() {
    if (state.victory) return;
    // Player end-of-turn
    var pl = state.civs.player;
    state.turnLog = [];                  // fresh log for events from this round
    updateTradeRoutes();                 // prune dead routes, refresh gold + disruption first
    pl.cities.forEach(function (ct) { cityBombard(ct); });   // cities fire at adjacent enemies
    recomputeIncome('player');
    pl.cities.forEach(processCity);
    pl.gold += pl.goldPerTurn;
    progressTech(pl);
    // Great people culture points (temples + culture buildings + wonders)
    var plCpt = civCulturePerTurn(pl);
    pl.greatPoints.culture += Math.round(plCpt * (1 + civicSum(pl, 'gpMult') + factionEff(pl, 'gpMult') + ideologyEff(pl, 'gpMult')));  // Monastic Orders + Solaris + Freedom speed GP
    pl.culPerTurn = plCpt;                              // drives the Civics track + HUD
    accrueEraPoints(pl, true);                          // bank Era Points / fire Golden Age
    progressCivic(pl);                                  // advance the adopted civic
    var plFpt = faithPerTurn(pl);
    pl.faith = (pl.faith || 0) + plFpt;                 // bank faith toward founding / spread
    pl.greatPoints.faith = (pl.greatPoints.faith || 0) + plFpt;   // and toward a Great Prophet
    checkGreatPeople('player');

    // AI turn — lock input while the AI thinks/moves
    state.currentCiv = 'ai';
    aiThinking = true;
    flashEndTurn();
    setTimeout(function () {
      updateTensions();
      aiDiplomacyCheck();
      aiTurn();
      barbTurn();

      // End-of-turn for every AI side
      AI_SIDES.forEach(function (id) {
        var c = state.civs[id];
        if (!c.cities.length && !c.units.length) return;   // skip eliminated AIs
        c.cities.forEach(function (ct) { cityBombard(ct); }); // AI cities fire too
        recomputeIncome(id);
        c.cities.forEach(processCity);
        c.gold += c.goldPerTurn;
        progressTech(c);
        // Great people culture points for AI
        var cCpt = civCulturePerTurn(c);
        c.greatPoints.culture += Math.round(cCpt * (1 + civicSum(c, 'gpMult') + factionEff(c, 'gpMult') + ideologyEff(c, 'gpMult')));  // Monastic Orders + Solaris + Freedom speed GP
        c.culPerTurn = cCpt;                              // drives the Civics track
        accrueEraPoints(c, false);                        // bank Era Points / fire Golden Age
        if (!c.currentCivic) { var nci = pickAiCivic(c); if (nci) { c.currentCivic = nci; c.civicProgress = 0; } }
        progressCivic(c);                                 // advance the adopted civic
        checkGreatPeople(id);
        // AI auto-upgrades
        c.units.slice().forEach(function (u) {
          if (canUpgrade(u)) upgradeUnit(u);
        });
        // AI adopts the best government its tech + personality allow
        aiPickGovernment(c);
        aiPickEdict(c);
        aiPickIdeology(c);   // and an Ideology once it reaches the Modern age
        var cFpt = faithPerTurn(c);
        c.faith = (c.faith || 0) + cFpt;
        c.greatPoints.faith = (c.greatPoints.faith || 0) + cFpt;   // toward a Great Prophet
        aiPickPantheon(c);   // a cheap early pantheon
        aiFoundReligion(c);  // and founds a faith once it can afford one
        aiReform(c);         // and reforms with a 2nd belief once it has reach
        aiReligiousSpread(c); // buy/send missionaries + inquisitors with spare faith
        aiRunEspionage(id);   // fill free spy slots by personality
      });

      // Decay general bonuses + tick down government anarchy for all civs
      CIV_SIDES.forEach(function (id) {
        var cv = state.civs[id];
        var gb = cv.generalBonus;
        if (gb) {
          gb.turnsLeft--;
          if (gb.turnsLeft <= 0) cv.generalBonus = null;
        }
        if (cv.governmentTurns > 0) cv.governmentTurns--;   // anarchy countdown
        if (cv.goldenAgeTurns > 0) cv.goldenAgeTurns--;     // golden-age countdown
        if (cv.edictTurns > 0) { cv.edictTurns--; if (cv.edictTurns <= 0) cv.edict = null; }  // edict lapses
        processSpyOps(id);                                  // tick + resolve spy missions
      });

      // Clan bribe wears off
      if (state.barbBribe && state.barbBribe.turns > 0) {
        state.barbBribe.turns--;
        if (state.barbBribe.turns <= 0) state.barbBribe = null;
      }

      // Vassal tribute — each vassal sends gold to its overlord (capped by purse)
      if (state.vassals) {
        for (var vId in state.vassals) {
          var vas = state.civs[vId], lord = state.civs[state.vassals[vId]];
          if (!vas || !lord || !vas.cities.length) continue;
          var pay = Math.min(VASSAL_TRIBUTE, Math.max(0, vas.gold));
          vas.gold -= pay;
          lord.gold += pay;
        }
      }

      // Lead-scaled era crisis when the world crosses into a new high age
      maybeFireEraCrisis();

      // Check player elimination — no cities and no settlers means defeat
      if (!state.victory) {
        var plCheck = state.civs.player;
        var hasCities = plCheck.cities.length > 0;
        var hasSettlers = plCheck.units.some(function (u) { return u.type === 'settler'; });
        if (!hasCities && !hasSettlers) {
          // Find which surviving AI is strongest as the "winner"
          var winner = AI_SIDES[0];
          AI_SIDES.forEach(function (id) {
            if (state.civs[id] && state.civs[winner] &&
                state.civs[id].cities.length > state.civs[winner].cities.length) winner = id;
          });
          declareVictory(winner, 'domination');
        }
      }

      // Religions radiate to nearby cities, then check for a Religious win.
      spreadReligion();
      checkReligionVictory();
      // Culture + economic victory checks (every civ, every turn)
      checkProgressVictories();
      checkVictoryRaceAlerts();   // warn when someone nears the finish line

      // Roll into the next turn
      state.turn += 1;
      state.currentCiv = 'player';
      // Heal BEFORE moves reset — fortified +2 HP, idle (full moves) +1, moved = nothing
      CIV_SIDES.concat(['cs']).forEach(function (id) {
        state.civs[id].units.forEach(function (u) {
          if (u.hp >= u.maxHp) return;
          if (u.fortified) u.hp = Math.min(u.maxHp, u.hp + 2);
          else if (u.moves === u.maxMoves) u.hp = Math.min(u.maxHp, u.hp + 1);
        });
      });
      CIV_SIDES.concat(['barb','cs']).forEach(function (id) {
        var c = state.civs[id];
        if (!c) return;
        c.units.forEach(function (u) {
          u.moves = u.maxMoves;
          if (CIV_SIDES.indexOf(id) >= 0) u.hasActed = false;   // hasActed only used by planning civs
        });
      });
      recomputeBorders();
      CIV_SIDES.forEach(function (id) { recomputeVisibility(id); });
      recomputeIncome('player');
      checkCsQuests();   // award alliances for quests completed during the turn
      checkEraQuests();  // standing era objectives -> Era Points

      // Multi-turn movement: continue queued moves
      playerAutoMove();

      // Auto-improve: player workers with auto flag act automatically
      state.civs.player.units.forEach(function (u) {
        if (u.auto && u.type === 'worker' && u.moves > 0) {
          aiWorkerAction(u);
        }
        if (u.autoExplore && UNITS[u.type].canExplore && u.moves > 0) {
          playerAutoExplore(u);
        }
      });

      // Enemy spotted alerts — check for visible enemy units near player cities
      checkEnemySpotted();

      // Occasional world event for the player's new turn
      maybeFireWorldEvent();

      sfxTurnStart();
      focusFirstUnitNoSelect();   // start each turn with nothing selected
      showTurnSummary();
      aiThinking = false;
      save();
      flushYieldFx();             // staggered pop/build/wonder cascade for this turn
      draw();
      // Turn-start modal: a pending dilemma takes priority; otherwise a pending
      // peace offer; otherwise the Turn Brief auto-opens when something important
      // needs the player (revolt / no research / no civic / Great Person). Quiet
      // turns and minor nudges (idle units) never pop a modal. (One at a time.)
      if (findPendingPromoUnit()) {
        setTimeout(function () { maybePresentPromotion(); }, 400);
      } else if (state.pendingCrisis) {
        setTimeout(function () { presentCrisisDilemma(); }, 450);
      } else if (state.pendingDilemma) {
        setTimeout(function () { presentDilemma(); }, 450);
      } else if (state.pendingPeace) {
        setTimeout(function () { showPeaceOffer(); }, 400);
      } else if (briefAuto && !state.victory && computeTurnBrief().some(function (it) { return it.important; })) {
        setTimeout(function () { if (!openModal) openTurnBrief(); }, 450);
      }
    }, 300);
  }

  // Full shortest step-path (uniform 1/tile) from a unit to a destination, for
  // multi-turn Go-To. Routes AROUND impassable terrain, occupied tiles, and enemy
  // cities — a real BFS, so it never dead-ends at a mountain or coastline the way
  // a greedy "closest neighbour" step does. Recomputed each turn so transient
  // blockers resolve. Returns a path INCLUDING the start tile (so walkPath can
  // consume it), or null if no step gets the unit strictly closer.
  function findUnitPath(unit, destC, destR) {
    var startKey = unit.c + ',' + unit.r;
    var parent = {}; parent[startKey] = null;
    var q = [[unit.c, unit.r]], head = 0, found = false;
    while (head < q.length) {
      var cur = q[head++];
      if (cur[0] === destC && cur[1] === destR) { found = true; break; }
      var ns = neighbors(cur[0], cur[1]);
      for (var i = 0; i < ns.length; i++) {
        var nc = ns[i][0], nr = ns[i][1], k = nc + ',' + nr;
        if (k in parent) continue;
        var t = tileAt(nc, nr);
        if (!t || !canEnterTile(unit, t)) continue;
        var isDest = (nc === destC && nr === destR);
        if (!isDest) {
          if (t.unit) continue;                                                       // can't pass through anyone
          if (t.city && t.city.civ !== unit.civ && atWar(unit.civ, t.city.civ)) continue; // or through enemy cities
        }
        parent[k] = cur[0] + ',' + cur[1];
        q.push([nc, nr]);
      }
    }
    var targetKey;
    if (found) targetKey = destC + ',' + destR;
    else {
      // Unreachable exactly — head for the explored tile nearest the goal, but
      // only if it's strictly closer than where we stand (else we're boxed in).
      var best = null, bestD = Infinity, nowD = hexDist([unit.c, unit.r], [destC, destR]);
      for (var vk in parent) {
        if (vk === startKey) continue;
        var p = vk.split(','), d = hexDist([+p[0], +p[1]], [destC, destR]);
        if (d < bestD) { bestD = d; best = vk; }
      }
      if (best === null || bestD >= nowD) return null;
      targetKey = best;
    }
    var path = [], ck = targetKey;
    while (ck) { var pp = ck.split(','); path.unshift([+pp[0], +pp[1]]); ck = parent[ck]; }
    return path;   // index 0 is the unit's current tile
  }

  function playerAutoMove() {
    state.civs.player.units.forEach(function (u) {
      if (!u.goto || u.moves <= 0) return;
      if (u.c === u.goto.c && u.r === u.goto.r) { u.goto = null; return; }
      if (adjacentEnemy(u)) { u.goto = null; return; }        // enemy near — let the player decide
      var path = findUnitPath(u, u.goto.c, u.goto.r);
      if (!path || path.length < 2) { u.goto = null; return; }
      for (var i = 1; i < path.length && u.moves > 0; i++) {
        var t = tileAt(path[i][0], path[i][1]);
        if (!t || t.unit) break;                              // blocked this turn — keep goto, retry next turn
        moveUnit(u, path[i][0], path[i][1]);
        if (u.c === u.goto.c && u.r === u.goto.r) { u.goto = null; break; }   // arrived
        if (adjacentEnemy(u)) { u.goto = null; break; }       // enemy appeared mid-route — halt
      }
    });
  }

  function checkEnemySpotted() {
    var pl = state.civs.player;
    pl.cities.forEach(function (ct) {
      var nearby = tilesInRange(ct.c, ct.r, 3);
      for (var i = 0; i < nearby.length; i++) {
        var t = tileAt(nearby[i][0], nearby[i][1]);
        if (t && t.unit && t.unit.civ !== 'player' && t.unit.civ !== 'barb' && t.visible.player && atWar('player', t.unit.civ)) {
          logEvent('Enemy ' + UNITS[t.unit.type].name + ' spotted near ' + ct.name + '!', 'error');
          return; // one alert per city per turn
        }
      }
    });
  }

  function logEvent(msg, kind) {
    if (!state.turnLog) state.turnLog = [];
    state.turnLog.push({ msg: msg, kind: kind || 'info' });
    // Persistent history for the event-log panel (capped).
    if (!state.log) state.log = [];
    state.log.push({ turn: state.turn, msg: msg, kind: kind || 'info' });
    if (state.log.length > 90) state.log.splice(0, state.log.length - 90);
  }

  // THE CHRONICLE — a curated, age-stamped narrative of the game's defining
  // moments (NOT the spammy log). One push per genuine milestone; capped so the
  // save stays small. Renders as your "saga" recap, grouped by age.
  function chronicle(text) {
    if (!state.chronicle) state.chronicle = [];
    var age = state.civs.player ? getAge(state.civs.player).name : 'Ancient';
    state.chronicle.push({ turn: state.turn, age: age, text: text });
    if (state.chronicle.length > 80) state.chronicle.shift();
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

  // =====================================================================
  // TURN BRIEF — a triaged "what needs you" checklist. On a 600x600 glasses
  // screen in a 60-second session you can't scan the whole map every turn, so
  // the Brief surfaces the handful of things that want a decision and each row
  // is a ONE-TAP jump to the fix. Auto-opens for important items; always
  // reachable from the global menu.
  // =====================================================================
  var briefAuto = true;
  (function () { try { if (localStorage.getItem('mdg_microciv_brief') === '0') briefAuto = false; } catch (e) {} })();
  function setBriefAuto(on) { briefAuto = !!on; try { localStorage.setItem('mdg_microciv_brief', on ? '1' : '0'); } catch (e) {} }

  // Center + select a unit, then close any modal (used by Brief row jumps).
  function jumpToUnit(u) {
    if (!u) return;
    closeModal();
    state.cursor.c = u.c; state.cursor.r = u.r;
    state.selected = { c: u.c, r: u.r };
    ensureCursorVisible();
    draw();
  }
  // Center on a city and open its management screen.
  function jumpToCity(ct) {
    if (!ct) return;
    closeModal();
    state.cursor.c = ct.c; state.cursor.r = ct.r;
    ensureCursorVisible();
    openCity(ct);
  }

  // Build the prioritized list of things needing the player's attention.
  // `important` items (revolt / no research / no civic / Great Person) trigger
  // the turn-start auto-open; minor nudges (idle units, build plans) don't.
  function computeTurnBrief() {
    var pl = state && state.civs && state.civs.player;
    var items = [];
    if (!pl || state.victory) return items;
    // Cities in open revolt, then merely restless (most urgent first)
    pl.cities.forEach(function (ct) {
      if (cityRevolting(ct)) items.push({ icon: '🔥', kind: 'err', important: true, title: ct.name + ' in revolt', sub: 'Production halted — ease unrest', act: function () { jumpToCity(ct); } });
    });
    pl.cities.forEach(function (ct) {
      if (!cityRevolting(ct) && (ct.unrest || 0) >= revoltThreshold(ct) * 0.5)
        items.push({ icon: '⚠', kind: 'err', important: true, title: ct.name + ' is restless', sub: 'Unrest climbing toward revolt', act: function () { jumpToCity(ct); } });
    });
    // No research selected
    if (!pl.currentTech && TECH_ORDER.some(function (t) { return !pl.techs[t]; }))
      items.push({ icon: '◆', kind: 'info', important: true, title: 'Choose research', sub: 'No technology in progress', act: function () { closeModal(); openTech(); } });
    // No civic selected while culture is flowing
    if (!pl.currentCivic && (pl.culPerTurn || 0) > 0 && !civicsComplete(pl))
      items.push({ icon: '♪', kind: 'info', important: true, title: 'Choose a civic', sub: 'Culture going to waste', act: function () { closeModal(); openCivics(); } });
    // Great Person waiting to be used
    var gp = pl.units.filter(function (u) { return UNITS[u.type] && UNITS[u.type].great; });
    if (gp.length) items.push({ icon: '★', kind: 'win', important: true, title: gp.length + ' Great Person' + (gp.length > 1 ? 's' : '') + ' ready', sub: 'Activate for a powerful boon', act: function () { jumpToUnit(gp[0]); } });
    // Idle units that can still move (aggregate — minor)
    var idle = pl.units.filter(function (u) { return u.moves > 0 && !u.fortified && !u.auto && !u.autoExplore && !(UNITS[u.type] && UNITS[u.type].great); });
    if (idle.length) items.push({ icon: '⚑', kind: 'info', important: false, title: idle.length + ' unit' + (idle.length > 1 ? 's' : '') + ' can move', sub: 'Jump to the next idle unit', act: function () { jumpToUnit(idle[0]); } });
    // Cities about to finish production with nothing queued (aggregate — minor)
    var noPlan = pl.cities.filter(function (ct) {
      if ((ct.queue || []).length) return false;
      var p = ct.producing, cost = UNITS[p] ? UNITS[p].cost : (BUILDINGS[p] ? BUILDINGS[p].cost : 0);
      if (!cost) return false;
      return (ct.prod + workableYields(ct).prod) >= cost;   // completes next turn, no plan
    });
    if (noPlan.length) items.push({ icon: '⚒', kind: 'info', important: false, title: noPlan.length + ' city build' + (noPlan.length > 1 ? 's' : '') + ' ending', sub: 'Queue what comes next', act: function () { jumpToCity(noPlan[0]); } });
    return items;
  }

  // Render the Brief as an action list (reuses the proven modal renderer).
  function openTurnBrief() {
    var items = computeTurnBrief();
    var actions = [];
    actions.push({ header: true, disabled: true, icon: '📋', title: 'Turn ' + state.turn + ' Brief',
      sub: items.length ? (items.length + ' thing' + (items.length > 1 ? 's' : '') + ' need you') : 'All clear — nothing pressing' });
    if (!items.length) {
      actions.push({ header: true, disabled: true, icon: '✓', title: 'Empire running smoothly', sub: 'End the turn whenever you like' });
    } else {
      items.forEach(function (it) {
        actions.push({ icon: it.icon, title: it.title, sub: it.sub, danger: it.kind === 'err', primary: it.kind === 'win', do: function () { if (it.act) it.act(); } });
      });
    }
    actions.push({ icon: briefAuto ? '☑' : '☐', title: 'Auto-open each turn', sub: briefAuto ? 'On — opens when something important needs you' : 'Off — open it from the menu', do: function () { setBriefAuto(!briefAuto); openTurnBrief(); } });
    actions.push({ icon: '←', title: 'Close', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Turn Brief');
  }

  function flashEndTurn() {
    var el = document.getElementById('end-turn-flash');
    el.classList.remove('hidden');
    setTimeout(function () { el.classList.add('hidden'); }, 600);
  }

  // =====================================================================
  // RANDOM WORLD EVENTS
  // Occasional flavoured moments — good and bad — that shake up a run.
  // Each event's run() applies its effect and returns a message, or null if
  // it doesn't apply right now (so we try another).
  // =====================================================================
  var EVENT_CHANCE      = 0.20;   // per eligible turn
  var EVENT_COOLDOWN    = 5;      // min turns between events
  var EVENT_START_TURN  = 8;      // none in the very early game

  function randomPlayerCity() {
    var cs = state.civs.player.cities;
    return cs.length ? cs[Math.floor(rnd() * cs.length)] : null;
  }
  function spawnBarbNear(city) {
    if (!state.civs.barb) return false;
    var cand = [];
    for (var rr = Math.max(0, city.r - 3); rr <= Math.min(MAP_H - 1, city.r + 3); rr++) {
      for (var cc = Math.max(0, city.c - 3); cc <= Math.min(MAP_W - 1, city.c + 3); cc++) {
        var t = tileAt(cc, rr);
        if (!t || t.unit || t.city || TERRAIN[t.terrain].impassable) continue;
        var d = hexDist([cc, rr], [city.c, city.r]);
        if (d >= 2 && d <= 3) cand.push([cc, rr]);
      }
    }
    if (!cand.length) return false;
    var pos = cand[Math.floor(rnd() * cand.length)];
    spawnUnit('barb', 'raider', pos[0], pos[1]);
    return true;
  }

  var WORLD_EVENTS = [
    { id: 'harvest', good: true, run: function () {
      var c = randomPlayerCity(); if (!c) return null;
      c.pop += 1; c.food = 0; c.foodCap = 8 + c.pop * 5;
      return 'Bountiful harvest — ' + c.name + ' grows to pop ' + c.pop + '!';
    } },
    { id: 'goldrush', good: true, run: function () {
      var g = 30 + Math.floor(rnd() * 30) + Math.floor(state.turn / 2);
      state.civs.player.gold += g;
      return 'A gold rush fills your coffers (+' + g + ' gold).';
    } },
    { id: 'eureka', good: true, run: function () {
      var civ = state.civs.player; if (!civ.currentTech) return null;
      var cost = TECHS[civ.currentTech].cost;
      civ.techProgress = Math.min(cost, civ.techProgress + Math.ceil(cost * 0.4));
      return 'A breakthrough! Research on ' + TECHS[civ.currentTech].name + ' surges ahead.';
    } },
    { id: 'migrants', good: true, run: function () {
      var home = state.civs.player.cities[0]; if (!home) return null;
      var spot = findSpawnTile(home, 'worker'); if (!spot) return null;
      spawnUnit('player', 'worker', spot[0], spot[1]);
      return 'Migrants arrive — a free Worker joins you near ' + home.name + '.';
    } },
    { id: 'veterans', good: true, run: function () {
      var mil = state.civs.player.units.filter(function (u) { return !UNITS[u.type].civilian && u.hp > 0; });
      if (!mil.length) return null;
      var u = mil[Math.floor(rnd() * mil.length)];
      u.kills = (u.kills || 0) + 2; checkPromotion(u);
      return 'Veteran drills sharpen your ' + UNITS[u.type].name + ' — promoted!';
    } },
    { id: 'plague', good: false, run: function () {
      var cs = state.civs.player.cities.filter(function (c) { return c.pop > 1; });
      if (!cs.length) return null;
      var c = cs[Math.floor(rnd() * cs.length)]; c.pop -= 1;
      return 'A plague sweeps ' + c.name + ' — it falls to pop ' + c.pop + '.';
    } },
    { id: 'quake', good: false, run: function () {
      var cs = state.civs.player.cities.filter(function (c) { return c.prod > 0; });
      if (!cs.length) return null;
      var c = cs[Math.floor(rnd() * cs.length)]; var lost = Math.round(c.prod); c.prod = 0;
      return 'An earthquake wrecks the works in ' + c.name + ' (lost ' + lost + ' production).';
    } },
    { id: 'unrest', good: false, run: function () {
      var civ = state.civs.player; var loss = Math.min(civ.gold, 20 + Math.floor(rnd() * 25));
      if (loss <= 0) return null; civ.gold -= loss;
      return 'Civil unrest drains ' + loss + ' gold from your treasury.';
    } },
    { id: 'uprising', good: false, run: function () {
      var c = randomPlayerCity(); if (!c) return null;
      if (!spawnBarbNear(c)) return null;
      return 'Barbarians stir in the wilds near ' + c.name + '!';
    } }
  ];

  // DILEMMAS — a slice of world events become a 2-3 choice modal with real
  // tradeoffs (the most glasses-native interaction there is). Each choice's
  // apply() reuses existing mutators and returns a result string. Every dilemma
  // includes a low-risk option so it never forces a bad outcome.
  var DILEMMA_CHANCE = 0.4;   // share of fired events that become a choice
  var DILEMMAS = [
    { id: 'scholars', prompt: 'Wandering scholars seek your patronage.', choices: [
      { label: 'Fund their academy', sub: '−40 gold · big research boost', apply: function () {
        var civ = state.civs.player; if (civ.gold < 40) return 'You lacked the 40 gold to fund them.';
        civ.gold -= 40; if (civ.currentTech) { var cost = TECHS[civ.currentTech].cost; civ.techProgress = Math.min(cost, civ.techProgress + Math.ceil(cost * 0.5)); }
        return 'The academy flourishes — research surges ahead.'; } },
      { label: 'Put them to work', sub: '+25 era points · a little unrest', apply: function () {
        var civ = state.civs.player; civ.eraPoints += 25; var c = randomPlayerCity(); if (c) c.unrest = (c.unrest || 0) + 3;
        return 'Their works inspire the realm (+25 era points).'; } },
      { label: 'Send them away', sub: 'no cost', apply: function () { return 'You send the scholars on their way.'; } }
    ] },
    { id: 'raiders', prompt: 'Raiders mass in the wilds and demand tribute.', choices: [
      { label: 'Pay them off', sub: '−35 gold · they disperse', apply: function () {
        var civ = state.civs.player; var pay = Math.min(civ.gold, 35); civ.gold -= pay; return 'You buy off the raiders for ' + pay + ' gold.'; } },
      { label: 'Stand firm', sub: 'risk a raid · +20 era points', apply: function () {
        var civ = state.civs.player; civ.eraPoints += 20; var c = randomPlayerCity(); var raided = c && spawnBarbNear(c);
        return raided ? 'You refuse — and raiders strike near ' + c.name + '!' : 'You refuse; the raiders melt away.'; } }
    ] },
    { id: 'harvest', prompt: 'A bumper harvest fills the granaries.', choices: [
      { label: 'Store the grain', sub: '+1 pop in a city', apply: function () {
        var c = randomPlayerCity(); if (!c) return null; c.pop += 1; c.food = 0; c.foodCap = 8 + c.pop * 5; return c.name + ' grows to pop ' + c.pop + '.'; } },
      { label: 'Hold festivals', sub: 'calm every city · +15 era points', apply: function () {
        var civ = state.civs.player; civ.cities.forEach(function (c) { c.unrest = Math.max(0, (c.unrest || 0) - 4); }); civ.eraPoints += 15; return 'Festivals calm the realm (+15 era points).'; } }
    ] },
    { id: 'ruins', prompt: 'Explorers uncover ancient ruins.', choices: [
      { label: 'Excavate (gamble)', sub: 'treasure… or danger', apply: function () {
        var civ = state.civs.player; if (rnd() < 0.6) { var g = 40 + Math.floor(rnd() * 40); civ.gold += g; return 'Treasure! (+' + g + ' gold).'; }
        var c = randomPlayerCity(); var b = c && spawnBarbNear(c); return b ? 'You disturb a barbarian camp near ' + c.name + '!' : 'The ruins lay empty.'; } },
      { label: 'Seal it safely', sub: '+20 gold, no risk', apply: function () { state.civs.player.gold += 20; return 'You catalogue the site carefully (+20 gold).'; } }
    ] },
    { id: 'engineer', prompt: 'A master engineer offers her services.', choices: [
      { label: 'Hire her', sub: '−50 gold · rush capital production', apply: function () {
        var civ = state.civs.player; if (civ.gold < 50) return 'You cannot meet her 50-gold fee.'; civ.gold -= 50;
        var c = civ.cities[0]; if (!c) return null; var p = c.producing; var cost = UNITS[p] ? UNITS[p].cost : (BUILDINGS[p] ? BUILDINGS[p].cost : 0); c.prod = Math.max(c.prod, cost);
        return 'Production in ' + c.name + ' is rushed to completion.'; } },
      { label: 'Decline', sub: 'no cost', apply: function () { return 'You thank her and decline.'; } }
    ] }
  ];

  // Present the pending dilemma as a choice modal (reuses the action renderer).
  function presentDilemma() {
    var d = null;
    for (var i = 0; i < DILEMMAS.length; i++) if (DILEMMAS[i].id === state.pendingDilemma) { d = DILEMMAS[i]; break; }
    if (!d) { state.pendingDilemma = null; return; }
    var actions = [{ header: true, disabled: true, icon: '❖', title: 'A Decision', sub: d.prompt }];
    d.choices.forEach(function (ch) {
      actions.push({ icon: '◆', title: ch.label, sub: ch.sub, do: function () {
        state.pendingDilemma = null;
        var msg = null; try { msg = ch.apply(); } catch (e) { msg = null; }
        if (msg) { logEvent('Event — ' + msg, 'info'); showToast(msg); }
        recomputeBorders(); recomputeVisibility('player'); recomputeIncome('player');
        closeModal(); updateHud(); save(); draw();
      } });
    });
    renderDiplomacyActions(actions, 'Crossroads');
  }

  function maybeFireWorldEvent() {
    if (state.victory) return;
    if (state.civs.player.cities.length === 0) return;
    if (state.turn < EVENT_START_TURN) return;
    if (state.lastEventTurn && state.turn - state.lastEventTurn < EVENT_COOLDOWN) return;
    if (rnd() >= EVENT_CHANCE) return;
    // A share of events become an interactive dilemma, presented at turn start.
    if (rnd() < DILEMMA_CHANCE) {
      state.pendingDilemma = DILEMMAS[Math.floor(rnd() * DILEMMAS.length)].id;
      state.lastEventTurn = state.turn;
      return;
    }
    var order = WORLD_EVENTS.slice().sort(function () { return rnd() - 0.5; });
    for (var i = 0; i < order.length; i++) {
      var msg = order[i].run();
      if (msg) {
        state.lastEventTurn = state.turn;
        logEvent('Event — ' + msg, order[i].good ? 'success' : 'error');
        showToast(msg, order[i].good ? 'success' : 'error');
        if (order[i].good) sfxResearch(); else sfxError();
        recomputeBorders();
        recomputeVisibility('player');
        recomputeIncome('player');
        return;
      }
    }
  }

  // =====================================================================
  // ERA CRISES — a shared, lead-scaled hazard layer for the late game. Crossing
  // a new high age (Industrial+) fires ONE crisis that hits the frontrunner
  // hardest and can hand the trailing civ a leg up — a rubber-band that keeps
  // the lead tense to hold. Affects ALL civs, so AIs finally feel world events.
  // A civ in a Golden Age is immune to that crisis (Era Points = a real shield).
  // =====================================================================
  var ERA_CRISIS_MIN_AGE = 4;    // crises begin once any civ reaches Industrial (idx 4)
  function leadScore(civ) {
    if (!civ || !civ.cities.length) return 0;
    return civ.cities.length * 2 + wondersOwnedBy(civ.id) * 3 + techCountOf(civ) + Math.floor(civ.gold / 60) + (civ.goldenAgesHad || 0);
  }
  function biggestCity(civ) {
    var best = null; civ.cities.forEach(function (c) { if (!best || c.pop > best.pop) best = c; }); return best;
  }
  // Each crisis: run() applies the silent baseline effect to civs (skipping the
  // player when affectPlayer===false, because the player instead gets a choice
  // via dilemma()). A weaponize choice is only added when the frontrunner is an
  // AI (no point ganging up on yourself).
  function leaderName(ctx) { return (CIVS[ctx.leadId] ? CIVS[ctx.leadId].name : 'the frontrunner'); }
  function leaderIsRival(ctx) { return !!(ctx.leadId && ctx.leadId !== 'player' && state.civs[ctx.leadId]); }
  var ERA_CRISES = [
    { id: 'recession', name: 'Global Recession', run: function (scores, leadV, lowId, affectPlayer) {
      CIV_SIDES.forEach(function (id) {
        if (id === 'player' && affectPlayer === false) return;
        var c = state.civs[id]; if (!c || !c.cities.length || c.goldenAgeTurns > 0) return;
        var f = 0.12 + 0.22 * (scores[id] / Math.max(1, leadV));     // leader bleeds most
        c.gold = Math.max(0, Math.round(c.gold * (1 - f)));
      });
      return 'markets crash worldwide — the wealthiest empires bleed the most gold.';
    }, dilemma: function (ctx) {
      var p = state.civs.player;
      var ch = [
        { label: 'Austerity', sub: 'Lose 10% gold — steady and safe', apply: function () { var l = Math.round(p.gold * 0.10); p.gold -= l; return 'austerity steadies the books (-' + l + ' gold).'; } },
        { label: 'Stimulus gamble', sub: '50/50: a boom (+120g) or a deeper crash (-30%)', apply: function () { if (rnd() < 0.5) { p.gold += 120; return 'the stimulus sparks a boom (+120 gold)!'; } var l = Math.round(p.gold * 0.30); p.gold -= l; return 'the gamble backfires (-' + l + ' gold).'; } }
      ];
      if (leaderIsRival(ctx)) ch.push({ label: 'Profiteer off the chaos', weaponize: true, sub: leaderName(ctx) + ' loses 25% gold; you lose 12%', apply: function () { var l = Math.round(p.gold * 0.12); p.gold -= l; var L = state.civs[ctx.leadId]; var ll = 0; if (L) { ll = Math.round(L.gold * 0.25); L.gold = Math.max(0, L.gold - ll); recomputeIncome(ctx.leadId); } return 'you profiteer — ' + leaderName(ctx) + ' loses ' + ll + 'g, you lose ' + l + 'g.'; } });
      return { prompt: 'Markets crash worldwide. How does your treasury respond?', choices: ch };
    } },
    { id: 'pandemic', name: 'Pandemic', run: function (scores, leadV, lowId, affectPlayer) {
      CIV_SIDES.forEach(function (id) {
        if (id === 'player' && affectPlayer === false) return;
        var c = state.civs[id]; if (!c || !c.cities.length || c.goldenAgeTurns > 0) return;
        var big = biggestCity(c); if (!big) return;
        var loss = scores[id] >= leadV ? 2 : 1; big.pop = Math.max(1, big.pop - loss);
      });
      return 'a pandemic sweeps the continents, striking the largest cities.';
    }, dilemma: function (ctx) {
      var p = state.civs.player;
      var ch = [
        { label: 'Quarantine', sub: 'Your largest city loses 1 pop', apply: function () { var b = biggestCity(p); if (b) b.pop = Math.max(1, b.pop - 1); return 'quarantine limits the toll (largest city -1 pop).'; } },
        { label: 'Rush a cure', sub: 'Pay 80g · 60% no loss, else -2 pop', apply: function () { p.gold = Math.max(0, p.gold - 80); if (rnd() < 0.6) return 'the cure holds — no lives lost (-80 gold).'; var b = biggestCity(p); if (b) b.pop = Math.max(1, b.pop - 2); return 'the cure fails (-80 gold, largest city -2 pop).'; } }
      ];
      if (leaderIsRival(ctx)) ch.push({ label: 'Let it spread to rivals', weaponize: true, sub: 'Every rival’s largest city -1 pop; yours -1', apply: function () { var b = biggestCity(p); if (b) b.pop = Math.max(1, b.pop - 1); AI_SIDES.forEach(function (id) { var c = state.civs[id]; if (!c || !c.cities.length) return; var bb = biggestCity(c); if (bb) bb.pop = Math.max(1, bb.pop - 1); }); return 'you let the plague spread — rivals’ largest cities -1 pop, yours -1.'; } });
      return { prompt: 'A pandemic reaches your cities. Your response?', choices: ch };
    } },
    { id: 'unrest', name: 'Wave of Unrest', run: function (scores, leadV, lowId, affectPlayer) {
      CIV_SIDES.forEach(function (id) {
        if (id === 'player' && affectPlayer === false) return;
        var c = state.civs[id]; if (!c || !c.cities.length || c.goldenAgeTurns > 0) return;
        var add = Math.round(3 + 4 * (scores[id] / Math.max(1, leadV)));
        c.cities.forEach(function (ct) { ct.unrest = (ct.unrest || 0) + add; });
      });
      return 'discontent spreads — sprawling empires seethe with unrest.';
    }, dilemma: function (ctx) {
      var p = state.civs.player;
      var ch = [
        { label: 'Appease with festivals', sub: 'Pay 60g · no unrest', apply: function () { p.gold = Math.max(0, p.gold - 60); return 'festivals calm the people (-60 gold, no unrest).'; } },
        { label: 'Tough it out', sub: '60% calm, else +6 unrest per city', apply: function () { if (rnd() < 0.6) return 'the unrest fizzles out on its own.'; p.cities.forEach(function (ct) { ct.unrest = (ct.unrest || 0) + 6; }); return 'the unrest boils over (+6 unrest in every city).'; } }
      ];
      if (leaderIsRival(ctx)) ch.push({ label: 'Incite revolts abroad', weaponize: true, sub: 'Every rival +5 unrest/city; you +2/city', apply: function () { p.cities.forEach(function (ct) { ct.unrest = (ct.unrest || 0) + 2; }); AI_SIDES.forEach(function (id) { var c = state.civs[id]; if (!c) return; c.cities.forEach(function (ct) { ct.unrest = (ct.unrest || 0) + 5; }); }); return 'you fan the flames abroad — rivals +5 unrest/city, you +2.'; } });
      return { prompt: 'Discontent spreads through your empire.', choices: ch };
    } },
    { id: 'refugees', name: 'Refugee Surge', run: function (scores, leadV, lowId, affectPlayer) {
      var tid = lowId;
      if (affectPlayer === false && tid === 'player') {   // player handles theirs via the dilemma; help the lowest AI
        tid = null; var lv = Infinity;
        AI_SIDES.forEach(function (id) { var c = state.civs[id]; if (c && c.cities.length && scores[id] < lv) { lv = scores[id]; tid = id; } });
      }
      if (!tid) return 'displaced peoples wander, but find no haven.';
      var c = state.civs[tid]; if (!c || !c.cities.length) return 'displaced peoples wander, but find no haven.';
      var home = c.cities[0]; home.pop += 1; home.food = 0; home.foodCap = 8 + home.pop * 5;
      var spot = findSpawnTile(home, 'worker'); if (spot) spawnUnit(tid, 'worker', spot[0], spot[1]);
      return 'refugees flock to the struggling ' + (CIVS[tid] ? CIVS[tid].name : tid) + ', bolstering them.';
    }, dilemma: function (ctx) {
      var p = state.civs.player;
      function cap() { return p.cities[0]; }
      return { prompt: 'A surge of refugees reaches your borders.', choices: [
        { label: 'Welcome them', sub: 'Capital +1 pop and a free Worker', apply: function () { var h = cap(); if (h) { h.pop += 1; h.food = 0; h.foodCap = 8 + h.pop * 5; var s = findSpawnTile(h, 'worker'); if (s) spawnUnit('player', 'worker', s[0], s[1]); } return 'you welcome the refugees (capital +1 pop, free Worker).'; } },
        { label: 'Settle the frontier', sub: 'Capital +2 pop, but +6 unrest there', apply: function () { var h = cap(); if (h) { h.pop += 2; h.food = 0; h.foodCap = 8 + h.pop * 5; h.unrest = (h.unrest || 0) + 6; } return 'a crowded influx — capital +2 pop but restless (+6 unrest).'; } },
        { label: 'Charge for passage', sub: '+70 gold, no new citizens', apply: function () { p.gold += 70; return 'you charge for safe passage (+70 gold).'; } }
      ] };
    } }
  ];

  // Fire one crisis the first time the world crosses into a new high era.
  function maybeFireEraCrisis() {
    if (state.victory) return;
    var maxIdx = 0;
    CIV_SIDES.forEach(function (id) {
      var c = state.civs[id]; if (!c || !c.cities.length) return;
      var a = AGES.indexOf(getAge(c)); if (a > maxIdx) maxIdx = a;
    });
    if (maxIdx < ERA_CRISIS_MIN_AGE) return;
    if (typeof state.eraReached !== 'number') state.eraReached = ERA_CRISIS_MIN_AGE - 1;
    if (maxIdx <= state.eraReached) return;   // already fired for this era — one-shot lock
    state.eraReached = maxIdx;

    var scores = {}, leadV = -1, leadId = null, lowV = Infinity, lowId = null;
    CIV_SIDES.forEach(function (id) {
      var c = state.civs[id]; if (!c || !c.cities.length) return;
      var s = leadScore(c); scores[id] = s;
      if (s > leadV) { leadV = s; leadId = id; }
      if (s < lowV) { lowV = s; lowId = id; }
    });
    if (leadId === null) return;
    var crisis = ERA_CRISES[Math.floor(rnd() * ERA_CRISES.length)];
    var ageName = AGES[maxIdx] ? AGES[maxIdx].name : 'a new era';
    // The player gets a CHOICE (presented at turn start) instead of the silent
    // hit; the AI civs still feel the baseline effect (affectPlayer=false).
    var playerAlive = state.civs.player && state.civs.player.cities.length > 0;
    var hasDilemma = playerAlive && !!crisis.dilemma;
    var tail = crisis.run(scores, leadV, lowId, !hasDilemma) || '';
    logEvent('Era Crisis — ' + crisis.name + ': ' + tail, 'error');
    showToast('⚠ ' + crisis.name + ' grips the ' + ageName + ' world!', 'error');
    chronicle('Era Crisis: ' + crisis.name + ' struck the ' + ageName + ' world.');
    state.lastCrisis = { turn: state.turn, name: crisis.name, age: ageName };
    if (hasDilemma) state.pendingCrisis = { id: crisis.id, scores: scores, leadV: leadV, lowId: lowId, leadId: leadId };
    recomputeIncome('player');
  }

  // Present the player's Era-Crisis choice (set by maybeFireEraCrisis, shown at
  // turn start so it never collides with the AI-turn processing).
  function presentCrisisDilemma() {
    var pc = state.pendingCrisis;
    if (!pc) return;
    var crisis = null;
    for (var i = 0; i < ERA_CRISES.length; i++) if (ERA_CRISES[i].id === pc.id) { crisis = ERA_CRISES[i]; break; }
    if (!crisis || !crisis.dilemma) { state.pendingCrisis = null; return; }
    var ctx = { scores: pc.scores || {}, leadV: pc.leadV, lowId: pc.lowId, leadId: pc.leadId };
    var d = crisis.dilemma(ctx);
    var actions = [{ header: true, disabled: true, icon: '⚠', title: 'Era Crisis — ' + crisis.name, sub: d.prompt }];
    d.choices.forEach(function (ch) {
      actions.push({ icon: ch.weaponize ? '☠' : '◆', primary: !ch.weaponize, danger: ch.weaponize, title: ch.label, sub: ch.sub, do: function () {
        state.pendingCrisis = null;
        var msg = null; try { msg = ch.apply(); } catch (e) { msg = null; }
        if (msg) { logEvent('Crisis — ' + msg, 'info'); showToast(msg); chronicle('Era Crisis: ' + msg); }
        recomputeBorders(); recomputeVisibility('player'); recomputeIncome('player');
        closeModal(); updateHud(); save(); draw();
      } });
    });
    renderDiplomacyActions(actions, 'Era Crisis');
  }

  // =====================================================================
  // EVENT LOG PANEL — scrollable history of notifications
  // =====================================================================
  function openLog() {
    var body = document.getElementById('log-body');
    if (!body) return;
    body.innerHTML = '';
    var entries = (state.log || []).slice();
    if (entries.length === 0) {
      body.innerHTML = '<div class="log-empty">No events yet.</div>';
    } else {
      // Most recent first
      for (var i = entries.length - 1; i >= 0; i--) {
        var e = entries[i];
        var row = document.createElement('div');
        row.className = 'log-row' + (e.kind === 'error' ? ' err' : e.kind === 'success' ? ' win' : '');
        row.innerHTML = '<span class="log-turn">T' + (e.turn || '?') + '</span><span class="log-msg">' + e.msg + '</span>';
        body.appendChild(row);
      }
    }
    showModal('log-screen');
  }

  // In-game options — audio toggles, restart, quit to title. Reuses the
  // action-menu frame; toggles re-open to refresh their labels.
  function openOptions() {
    var actions = [];
    actions.push({ header: true, disabled: true, icon: '⚙', title: 'Options', sub: 'Audio · restart · quit' });
    actions.push({
      icon: '♪', title: 'Music: ' + (audioPrefs.music ? 'On' : 'Off'),
      sub: 'Toggle ambient music',
      do: function () { setMusicEnabled(!audioPrefs.music); openOptions(); }
    });
    actions.push({
      icon: '♫', title: 'Sound FX: ' + (audioPrefs.sfx ? 'On' : 'Off'),
      sub: 'Toggle sound effects',
      do: function () { setSfxEnabled(!audioPrefs.sfx); if (audioPrefs.sfx) sfxSelect(); openOptions(); }
    });
    if (window.__CLOUD && window.__CLOUD.enabled) {
      actions.push({
        icon: '☁', title: 'Cloud Sync', sub: 'Your cross-device save link + status',
        do: function () { closeModal(); openCloudSync(); }
      });
    }
    actions.push({
      icon: '⟳', title: 'Restart Game', danger: true, sub: 'Abandon and start a new game',
      do: function () { closeModal(); clearSave(); showScreen('civ-select'); renderCivCards(); }
    });
    actions.push({
      icon: '⌂', title: 'Quit to Title', danger: true, sub: 'Saved — Continue resumes later',
      do: function () { save(); closeModal(); showScreen('title'); setupTitleButtons(); }
    });
    actions.push({ icon: '←', title: 'Back', do: function () { closeModal(); } });
    renderDiplomacyActions(actions, 'Options');
  }

  // World report — per-civ standings + progress toward each victory path.
  function openStandings() {
    var body = document.getElementById('standings-body');
    if (!body) return;
    body.innerHTML = '';
    // World seed (shareable / replayable) + Daily marker.
    var seedLine = document.createElement('div');
    seedLine.className = 'rep-seed';
    seedLine.innerHTML = (state.isDaily ? '🔥 Daily ' + (state.dailyDate || '') + ' · ' : '') +
      'World Seed: <b>' + (state.seedCode || seedToCode(state.seed || 0)) + '</b>';
    body.appendChild(seedLine);
    var totalTechs = TECH_ORDER.length;
    CIV_SIDES.forEach(function (id) {
      var civ = state.civs[id];
      if (!civ) return;
      var alive = civ.cities.length > 0 || civ.units.some(function (u) { return u.type === 'settler'; });
      if (!alive && id !== 'player') return;                 // hide eliminated rivals
      var techCount = 0;
      for (var i = 0; i < totalTechs; i++) if (civ.techs[TECH_ORDER[i]]) techCount++;
      var wonders = wondersOwnedBy(id);
      var mil = civ.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;
      var per = (id !== 'player' && AI_PERSONALITIES[civ.personality]) ? AI_PERSONALITIES[civ.personality] : null;
      var name = CIVS[id] ? CIVS[id].name : id;
      var color = (CIVS[id] && CIVS[id].color) || '#fff';
      var nameLine = name + (id === 'player' ? ' (You)' : (per ? ' · ' + per.icon + ' ' + per.label : ''));
      // Closest victory hint
      var row = document.createElement('div');
      row.className = 'rep-civ' + (alive ? '' : ' dead');
      row.style.borderLeftColor = color;
      // Closest victory — the finish line for this civ.
      var vp = alive ? victoryProgress(civ) : { kind: 'none', frac: 0, label: '' };
      var vpct = Math.round(vp.frac * 100);
      var vfill = '<div class="rep-finish' + (vp.frac >= 0.75 ? ' hot' : '') + '"><span class="rep-finish-lbl">🏁 ' + (alive ? vp.kind + ' · ' + vp.label + ' · ' + vpct + '%' : '—') + '</span><span class="rep-finish-bar"><i style="width:' + vpct + '%"></i></span></div>';
      row.innerHTML =
        '<div class="rep-name" style="color:' + color + '">' + nameLine + (alive ? '' : ' — defeated') + '</div>' +
        '<div class="rep-stats">🏛 ' + civ.cities.length + '  ·  ⚔ ' + mil + '  ·  ● ' + Math.round(civ.gold) + 'g  ·  ◆ ' + techCount + '/' + totalTechs + '  ·  ✦ ' + wonders + '  ·  ♦ ' + distinctLuxuries(civ) + '</div>' +
        '<div class="rep-stats">⌛ ' + getAge(civ).name + '  ·  ⚖ ' + ((GOVERNMENTS[civ.government] || GOVERNMENTS.despotism).name) + (civ.goldenAgeTurns > 0 ? '  ·  ☀ Golden Age ' + civ.goldenAgeTurns : '') + '</div>' +
        (alive ? vfill : '') +
        '<div class="rep-vic">' +
          '<span class="rep-vbar">Civics ' + civicsAdopted(civ) + '/' + CIVIC_ORDER.length + '</span>' +
          '<span class="rep-vbar">Science ' + techCount + '/' + totalTechs + '</span>' +
          '<span class="rep-vbar">Gold ' + Math.round(civ.gold) + '/' + ECONOMIC_VICTORY_GOLD + '</span>' +
        '</div>';
      body.appendChild(row);
    });
    showModal('standings-screen');
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

  // Like autoSelectNextUnit but does NOT select — used at turn start so each
  // turn begins with nothing selected (tapping the ground opens the menu /
  // moves the cursor instead of commanding a leftover-selected unit). The
  // cursor is parked on a unit with moves so the view still centres usefully.
  function focusFirstUnitNoSelect() {
    state.selected = null;
    var pl = state.civs.player;
    var u = pl.units.find(function (x) { return x.moves > 0 && !x.fortified; });
    if (u) { state.cursor.c = u.c; state.cursor.r = u.r; ensureCursorVisible(); }
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
    AI_SIDES.forEach(function (id) {
      var civ = state.civs[id];
      if (!civ) return;
      civ.units.slice().forEach(function (u) {
        if (u.hp <= 0) return;
        aiMoveUnit(u);
      });
    });
    // City production picked in processCity / pickNextProduction
    aiCityStateDiplomacy();
  }

  // AIs occasionally bribe city-states. Skips ones the AI is at war with.
  function aiCityStateDiplomacy() {
    if (!state.civs.cs || state.civs.cs.cities.length === 0) return;
    AI_SIDES.forEach(function (aiId) {
      if (atWar(aiId, 'cs')) return;
      var aiCiv = state.civs[aiId];
      state.civs.cs.cities.forEach(function (csc) {
        if (csc.ally === aiId) return;
        var cost = csc.ally ? CS_BRIBE_COST : CS_BEFRIEND_COST;
        // Modest chance each turn so allegiance shifts but isn't chaotic
        if (rnd() > 0.08) return;
        if (aiCiv.gold < cost + 40) return;     // keep a buffer of ~40g
        aiCiv.gold -= cost;
        csc.ally = aiId;
        recomputeIncome(aiId);
        logEvent(CIVS[aiId].name + ' allied with ' + csc.name, 'info');
      });
    });
  }

  // -------- Barbarians ----------------------------------------------------
  function barbTurn() {
    if (!state.civs.barb) return;
    state.civs.barb.units.slice().forEach(function (u) {
      if (u.hp <= 0) return;
      barbMoveUnit(u);
    });
    // Spawn — only in the early game, only a few at a time, only on neutral land
    // Barbarian pressure scales with map size so big empty maps still feel
    // dangerous early (Small/Normal 3 · Large 4 · Huge 5 · Massive 6).
    var barbCap = MAP_W >= 28 ? 6 : MAP_W >= 24 ? 5 : MAP_W >= 20 ? 4 : 3;
    if (state.turn <= 28 && state.civs.barb.units.length < barbCap && state.turn % 3 === 0) {
      trySpawnBarbarian();
    }
  }

  function barbMoveUnit(u) {
    // Attack adjacent if any
    var adj = adjacentEnemy(u);
    if (adj) { attack(u, adj.unit); return; }
    // Bribed clans march on the paymaster's chosen rival first (wider radius —
    // they're being paid to go out of their way).
    if (state.barbBribe && state.barbBribe.turns > 0) {
      var bribed = findNearestOf(u, state.barbBribe.target, 8);
      if (bribed) { aiStepToward(u, bribed); return; }
    }
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

  // AI workers: if standing on an improvable owned tile, build; else walk toward one
  // Step a scout/explorer toward the nearest unexplored tile. If no fog remains
  // within sight, wander. Adjacent enemies stop the move so the player can react.
  function playerAutoExplore(u) {
    if (adjacentEnemy(u)) { u.autoExplore = false; return; }
    while (u.moves > 0) {
      // Pick nearest unexplored tile (limited search radius for cost)
      var bestTile = null, bestDist = Infinity;
      var radius = 8;
      var civ = state.civs[u.civ];
      for (var rr = Math.max(0, u.r - radius); rr <= Math.min(MAP_H - 1, u.r + radius); rr++) {
        for (var cc = Math.max(0, u.c - radius); cc <= Math.min(MAP_W - 1, u.c + radius); cc++) {
          var nt = tileAt(cc, rr);
          if (!nt) continue;
          if (nt.explored && nt.explored[u.civ]) continue;
          // Skip tiles we couldn't reach (water without sailing, etc.)
          if (TERRAIN[nt.terrain].impassable && !(nt.terrain === 'water' && civ.techs && civ.techs.sailing)) continue;
          var d = hexDist([u.c, u.r], [cc, rr]);
          if (d < bestDist) { bestDist = d; bestTile = [cc, rr]; }
        }
      }
      if (!bestTile) { aiWander(u); break; }
      // Step toward bestTile
      var ns = neighbors(u.c, u.r).filter(function (n) {
        var t = tileAt(n[0], n[1]);
        if (!canEnterTile(u, t)) return false;
        if (t.unit) return false;
        return true;
      });
      if (ns.length === 0) break;
      ns.sort(function (a, b) { return hexDist(a, bestTile) - hexDist(b, bestTile); });
      var step = ns[0];
      // No progress means we're stuck — wander then break
      if (hexDist(step, bestTile) >= hexDist([u.c, u.r], bestTile)) { aiWander(u); break; }
      if (!moveUnit(u, step[0], step[1])) break;
    }
  }

  function aiWorkerAction(u) {
    var t = tileAt(u.c, u.r);
    // Build on current tile if possible and we own it
    if (t && t.owner === u.civ && !t.improvement && !t.city) {
      var imp = pickImprovement(t);
      if (imp) {
        t.improvement = imp;
        u.moves = 0;
        return;
      }
    }
    // Search owned tiles within 4 hexes for the nearest improvable one
    var bestTile = null, bestDist = Infinity;
    for (var rr = Math.max(0, u.r - 4); rr <= Math.min(MAP_H - 1, u.r + 4); rr++) {
      for (var cc = Math.max(0, u.c - 4); cc <= Math.min(MAP_W - 1, u.c + 4); cc++) {
        var nt = tileAt(cc, rr);
        if (!nt || nt.owner !== u.civ || nt.improvement || nt.city) continue;
        var civ = state.civs[u.civ];
        if (TERRAIN[nt.terrain].impassable && !(nt.terrain === 'water' && civ.techs && civ.techs.sailing)) continue;
        if (!pickImprovement(nt)) continue;
        var d = hexDist([u.c, u.r], [cc, rr]);
        if (d < bestDist) { bestDist = d; bestTile = [cc, rr]; }
      }
    }
    if (bestTile) {
      aiStepToward(u, bestTile);
    } else {
      aiWander(u);
    }
  }

  function aiMoveUnit(u) {
    // Naval units: attack adjacent enemies on water, or patrol
    if (UNITS[u.type].naval) {
      var adj = adjacentEnemy(u);
      if (adj) { attack(u, adj.unit); return; }
      var target = findNearestEnemy(u, 5);
      if (target) aiStepToward(u, target);
      else aiWander(u);
      return;
    }
    if (u.type === 'settler') {
      // Found city if good spot — must be far from ALL existing cities of every civ
      var t = tileAt(u.c, u.r);
      if (t && !t.city && !TERRAIN[t.terrain].impassable) {
        var ok = true;
        CIV_SIDES.forEach(function (id) {
          state.civs[id].cities.forEach(function (ct) {
            if (hexDist([u.c, u.r], [ct.c, ct.r]) < 4) ok = false;
          });
        });
        if (state.civs[u.civ].cities.length === 0) { foundCity(u); return; }
        if (ok) { foundCity(u); return; }
      }
      // Move away from own cities to find a good spot
      var bestSpot = null, bestScore = -Infinity;
      for (var rr = Math.max(0, u.r - 6); rr <= Math.min(MAP_H - 1, u.r + 6); rr++) {
        for (var cc = Math.max(0, u.c - 6); cc <= Math.min(MAP_W - 1, u.c + 6); cc++) {
          var st = tileAt(cc, rr);
          if (!st || st.city || TERRAIN[st.terrain].impassable) continue;
          var tooClose = false;
          CIV_SIDES.forEach(function (id) {
            state.civs[id].cities.forEach(function (ct) {
              if (hexDist([cc, rr], [ct.c, ct.r]) < 4) tooClose = true;
            });
          });
          if (tooClose) continue;
          // Score: food/prod of nearby tiles
          var score = 0;
          var nbs = neighbors(cc, rr);
          for (var ni = 0; ni < nbs.length; ni++) {
            var nt = tileAt(nbs[ni][0], nbs[ni][1]);
            if (nt && !TERRAIN[nt.terrain].impassable) score += TERRAIN[nt.terrain].food + TERRAIN[nt.terrain].prod;
          }
          if (score > bestScore) { bestScore = score; bestSpot = [cc, rr]; }
        }
      }
      if (bestSpot) aiStepToward(u, bestSpot);
      else aiWander(u);
      return;
    }
    if (u.type === 'worker') { aiWorkerAction(u); return; }

    // Ranged units: try to fire at visible targets before moving
    if (aiTryRangedAttack(u)) return;

    var homeCt = nearestFriendlyCity(u);
    var civ = state.civs[u.civ];
    var myMil = civ.units.filter(function (x) { return !UNITS[x.type].civilian; }).length;

    // ---- Priority 1: Retreat if badly wounded (< 35% HP) ----
    if (u.hp < u.maxHp * 0.35 && homeCt) {
      if (hexDist([u.c, u.r], [homeCt.c, homeCt.r]) <= 1) {
        u.fortified = true; u.moves = 0;  // heal at home
      } else {
        aiStepToward(u, [homeCt.c, homeCt.r]);
      }
      return;
    }

    // ---- Priority 2: Defend threatened cities ----
    var threatenedCity = null;
    civ.cities.forEach(function (ct) {
      var ns = neighbors(ct.c, ct.r);
      for (var i = 0; i < ns.length; i++) {
        var nt = tileAt(ns[i][0], ns[i][1]);
        if (nt && nt.unit && nt.unit.civ !== u.civ && atWar(u.civ, nt.unit.civ) && !UNITS[nt.unit.type].civilian) {
          if (!threatenedCity || hexDist([u.c, u.r], [ct.c, ct.r]) < hexDist([u.c, u.r], [threatenedCity.c, threatenedCity.r])) {
            threatenedCity = ct;
          }
        }
      }
    });
    if (threatenedCity) {
      var dHome = hexDist([u.c, u.r], [threatenedCity.c, threatenedCity.r]);
      if (dHome <= 4) {
        // Rush to defend
        var adj = adjacentEnemy(u);
        if (adj) { attack(u, adj.unit); return; }
        aiStepToward(u, [threatenedCity.c, threatenedCity.r]);
        return;
      }
    }

    // ---- Build-up phase: early game, stay home ----
    var diff = DIFFICULTIES[state.difficulty || 'normal'] || DIFFICULTIES.normal;
    var aggressive = state.turn >= diff.aiAggroTurn && myMil >= 3;
    if (!aggressive) {
      if (homeCt && hexDist([u.c, u.r], [homeCt.c, homeCt.r]) > 2) {
        aiStepToward(u, [homeCt.c, homeCt.r]);
      } else {
        var adj = adjacentEnemy(u);
        if (adj) attack(u, adj.unit);
        else aiFortifyOrWait(u);
      }
      return;
    }

    // ---- Priority 3: Target selection ----
    // Prefer: undefended cities > capitals > weak units > nearest enemy
    var bestTarget = null, bestPri = Infinity;
    CIV_SIDES.forEach(function (id) {
      if (id === u.civ) return;
      if (!atWar(u.civ, id)) return;
      // Enemy cities — prioritize undefended and capitals
      state.civs[id].cities.forEach(function (ct) {
        var ctTile = tileAt(ct.c, ct.r);
        var defended = ctTile && ctTile.unit;
        var d = hexDist([u.c, u.r], [ct.c, ct.r]);
        var pri = d;
        if (!defended) pri -= 5;         // big bonus for undefended
        if (ct.capital) pri -= 3;        // prioritize capitals
        if (pri < bestPri) { bestPri = pri; bestTarget = [ct.c, ct.r]; }
      });
      // Enemy units — target weak ones
      state.civs[id].units.forEach(function (e) {
        if (UNITS[e.type].civilian) return; // don't chase settlers/workers
        var d = hexDist([u.c, u.r], [e.c, e.r]);
        var pri = d;
        if (e.hp < e.maxHp * 0.5) pri -= 2; // wounded enemies are attractive
        if (pri < bestPri) { bestPri = pri; bestTarget = [e.c, e.r]; }
      });
    });

    if (bestTarget) {
      // Ranged units: close to range then fire
      if (UNITS[u.type].ranged) {
        var d = hexDist([u.c, u.r], bestTarget);
        if (d > UNITS[u.type].ranged) {
          aiStepTowardRange(u, bestTarget, UNITS[u.type].ranged);
          aiTryRangedAttack(u);
        }
        if (u.moves > 0) aiTryRangedAttack(u);
      } else {
        aiStepToward(u, bestTarget);
      }
    } else {
      aiWander(u);
    }
  }

  // AI ranged units fire at the weakest enemy in range. Returns true if it fired.
  function aiTryRangedAttack(u) {
    var targets = computeRangedTargets(u);
    if (targets.length === 0) return false;
    // Prefer lowest HP target (finish them off)
    targets.sort(function (a, b) { return a.unit.hp - b.unit.hp; });
    if (UNITS[u.type].nuke) nukeStrike(u, targets[0].unit); else rangedAttack(u, targets[0].unit);
    return true;
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
      if (!atWar(u.civ, key)) continue;
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
        if (!canEnterTile(u, t)) return false;
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

  // Like aiStepToward, but stops walking once we're within `range` hex distance
  function aiStepTowardRange(u, target, range) {
    while (u.moves > 0) {
      if (hexDist([u.c, u.r], target) <= range) break;  // in firing range, stop
      var ns = neighbors(u.c, u.r).filter(function (n) {
        var t = tileAt(n[0], n[1]);
        if (!canEnterTile(u, t)) return false;
        if (t.unit && t.unit.civ === u.civ) return false;
        return true;
      });
      if (ns.length === 0) break;
      ns.sort(function (a, b) {
        return hexDist(a, target) - hexDist(b, target);
      });
      var step = ns[0];
      // Don't walk INTO the target tile (stay back for ranged fire)
      if (step[0] === target[0] && step[1] === target[1]) break;
      var moved = moveUnit(u, step[0], step[1]);
      if (!moved) break;
    }
  }

  function aiWander(u) {
    while (u.moves > 0) {
      var ns = neighbors(u.c, u.r).filter(function (n) {
        var t = tileAt(n[0], n[1]);
        if (!canEnterTile(u, t)) return false;
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
  // Combo window — presses spaced further apart than this can't form a combo.
  // Tight enough that a slow 2-press correction (e.g. ← then → after a pause)
  // never reads as combo intent.
  var COMBO_WINDOW_MS = 400;

  function pushKey(k) {
    var simple = k.replace('Arrow', '').toLowerCase();
    keyHistory.push({ k: simple, t: Date.now() });
    while (keyHistory.length > 4) keyHistory.shift();
    var cutoff = Date.now() - COMBO_WINDOW_MS;
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

        // Clicking your own city always opens the city screen — it never
        // commands the selected unit to walk there. Any standing multi-turn
        // order (goto) the unit already has is preserved; we just stop
        // treating this click as a move and drop the active selection so the
        // next click is a clean fresh action.
        if (t.city && t.city.civ === 'player') {
          state.selected = null;
          openCity(t.city);
          return;
        }

        // Clicking a different friendly unit switches the active selection to
        // it rather than trying to move the current unit onto an occupied tile.
        if (t.unit && t.unit.civ === 'player' && t.unit !== su) {
          state.selected = { c: t.unit.c, r: t.unit.r };
          sfxSelect();
          showToast(UNITS[t.unit.type].name + ' · ' + t.unit.moves + ' moves');
          return;
        }

        if (su.moves > 0) {
          // Ranged attack: if this is a ranged unit and cursor is on an enemy in range, fire
          var suDef = UNITS[su.type];
          if (suDef.ranged) {
            var ct = tileAt(state.cursor.c, state.cursor.r);
            if (ct && ct.unit && ct.unit.civ !== 'player' && atWar('player', ct.unit.civ) &&
                hexDist([su.c, su.r], [state.cursor.c, state.cursor.r]) <= suDef.ranged) {
              if (suDef.nuke) nukeStrike(su, ct.unit); else rangedAttack(su, ct.unit);
              recomputeVisibility('player');
              draw();
              save();
              return;
            }
          }
          // Try multi-tile path (walk / melee)
          var reach = computeReachable(su);
          var key = state.cursor.c + ',' + state.cursor.r;
          if (key in reach && reach[key].cost > 0) {
            su.goto = null;  // direct move — clear any queued destination
            var path = pathTo(reach, state.cursor.c, state.cursor.r);
            walkPath(su, path);
            return;
          }

          // Multi-turn move: destination beyond this turn's reach. Plot a full
          // path (routes around terrain/obstacles) and walk as far as this turn's
          // moves allow; playerAutoMove continues it automatically each turn.
          var destT = tileAt(state.cursor.c, state.cursor.r);
          if (destT && destT.explored.player && !destT.unit && canEnterTile(su, destT)) {
            var full = findUnitPath(su, state.cursor.c, state.cursor.r);
            if (full && full.length > 1) {
              su.goto = { c: state.cursor.c, r: state.cursor.r };
              showToast('Moving toward ' + TERRAIN[destT.terrain].name + '…', 'info');
              walkPath(su, full);   // stops when this turn's moves run out; goto persists
            } else {
              su.goto = null;
              showToast('No route there', 'error');
            }
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
      sfxSelect();
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

      // Garrisoned on your own city — offer quick access to the city screen so
      // a unit standing on the city tile never blocks reaching production.
      if (isCity) {
        actions.push({ icon: '🏛', primary: true, title: 'Manage ' + t.city.name, sub: 'Production, food, science', do: function () { closeModal(); openCity(t.city); } });
      }

      if (def.canFound) {
        actions.push({ icon: '★', primary: true, title: 'Found City', sub: 'Plant a settlement here', do: function () { u.goto = null; foundCity(u); closeModal(); draw(); } });
      }
      if (def.canImprove) {
        var impKind = pickImprovement(t);
        var owned = !!t && t.owner === u.civ;
        var canImp = !!impKind && owned;
        var idef = impKind && IMPROVEMENTS[impKind];
        var yieldStr = idef ? Object.keys(idef.yield).map(function (k) {
          return '+' + idef.yield[k] + ' ' + k;
        }).join(' · ') : '';
        var subText = canImp ? yieldStr :
                      t.improvement ? 'Already improved' :
                      !owned ? 'Outside your borders' :
                      'Not buildable here';
        actions.push({
          icon: '⛏',
          primary: true,
          title: canImp ? 'Build ' + idef.name : 'Build Improvement',
          sub: subText,
          disabled: !canImp,
          do: function () {
            t.improvement = impKind;
            u.moves = 0;
            showToast(idef.name + ' built', 'success');
            closeModal();
            draw();
          }
        });
      }
      if (def.canImprove) {
        actions.push({ icon: '⚙', title: u.auto ? 'Manual Control' : 'Auto-Improve', sub: u.auto ? 'Take back direct control' : 'Worker builds automatically each turn', do: function () { u.auto = !u.auto; u.moves = 0; showToast(u.auto ? 'Auto-improve ON' : 'Manual control', 'success'); closeModal(); draw(); } });
      }
      if (def.canExplore) {
        actions.push({
          icon: '⚐',
          title: u.autoExplore ? 'Manual Control' : 'Auto-Explore',
          sub: u.autoExplore ? 'Take back direct control' : 'Wander into fog each turn',
          do: function () {
            u.autoExplore = !u.autoExplore;
            u.moves = 0;
            showToast(u.autoExplore ? 'Auto-explore ON' : 'Manual control', 'success');
            closeModal();
            draw();
          }
        });
      }
      // Caravan — establish a trade route to an adjacent city
      if (def.trade) {
        var destCity = eligibleTradeCity(u);
        var atCap = tradeRouteCount('player') >= maxTradeRoutes(civPl);
        var canTrade = !!destCity && !atCap;
        actions.push({
          icon: '⇄',
          primary: canTrade,
          title: canTrade ? 'Trade Route to ' + destCity.name : 'Establish Trade Route',
          sub: atCap ? 'Route limit reached (' + maxTradeRoutes(civPl) + ')' : destCity ? '+' + routeBaseGold({ fromC: u.homeCity.c, fromR: u.homeCity.r, toC: destCity.c, toR: destCity.r, intl: destCity.civ !== 'player' }) + ' gold/turn' + (destCity.civ !== 'player' ? ' · international' : '') : 'Move next to another city first',
          disabled: !canTrade,
          do: function () { establishTradeRoute(u); closeModal(); draw(); }
        });
      }
      // Great person activation
      if (def.great) {
        var gpLabel = u.type === 'great_general' ? 'Inspire Army (+2 ATK, 8 turns)' :
                      u.type === 'great_scientist' ? 'Free Technology' :
                      u.type === 'great_engineer' ? 'Rush City Production' :
                      u.type === 'great_merchant' ? '+120 Gold · ally adjacent city-state' :
                      u.type === 'great_artist' ? 'Trigger a Golden Age (8 turns)' :
                      u.type === 'great_prophet' ? (prophetCanFound(civPl) ? 'Found a Religion (free)' : 'Spread your faith to nearby cities') :
                      'Activate';
        actions.push({ icon: '✦', primary: true, title: 'Activate', sub: gpLabel, do: function () { closeModal(); activateGreatPerson(u); draw(); } });
      }
      // Archaeologist — excavate the dig site underfoot
      if (UNITS[u.type].dig) {
        var site = digSiteAt(u.c, u.r);
        actions.push({ icon: '⚱', primary: !!site, title: 'Excavate', sub: site ? 'Unearth ' + site.label + ' · +' + DIG_ERA_POINTS + ' era pts, +' + DIG_CULTURE + ' culture' : 'Move onto a ruins tile first', disabled: !site, do: function () { if (excavate(u)) { updateHud(); save(); } closeModal(); draw(); } });
      }
      // Missionary — spread your faith to a nearby city (costs a charge)
      if (u.type === 'missionary') {
        var relM = civMajorityReligion(civPl);
        var tgtM = relM ? cityOnOrAdjacent(u, function (ct) { return ct.religion !== relM && !ct.holyCity && !(ct.religionLockTurns > 0); }) : null;
        actions.push({ icon: '☩', primary: true, title: 'Spread Faith', sub: tgtM ? 'Convert ' + tgtM.name + ' · ' + (u.spreadCharges || 0) + ' left' : 'Move next to a convertible city', disabled: !tgtM, do: function () { if (missionarySpread(u)) { updateHud(); save(); } closeModal(); draw(); } });
      }
      // Inquisitor — purge a rival faith from your city (locks it for a while)
      if (u.type === 'inquisitor') {
        var relI = civMajorityReligion(civPl);
        var tgtI = cityOnOrAdjacent(u, function (ct) { return ct.civ === u.civ; });
        var heretic = tgtI && relI && tgtI.religion !== relI;
        actions.push({ icon: '☨', primary: true, title: 'Purge Heresy', sub: tgtI ? (heretic ? 'Reconvert ' + tgtI.name : 'Sanctify ' + tgtI.name) : 'Move into your city first', disabled: !tgtI, do: function () { if (inquisitorPurge(u)) { updateHud(); save(); } closeModal(); draw(); } });
      }
      // Unit upgrade
      var upInfo = canUpgrade(u);
      if (upInfo) {
        actions.push({ icon: '⬆', primary: true, title: 'Upgrade → ' + UNITS[upInfo.to].name, sub: upInfo.cost + ' gold', do: function () { upgradeUnit(u); closeModal(); draw(); } });
      }
      // Pillage — a military unit standing on an enemy's improved tile can
      // raze the improvement for gold (rewards raiding, hurts their economy).
      if (pillageInfo(u, t)) {
        actions.push({
          icon: '🔥', primary: true, title: 'Pillage ' + IMPROVEMENTS[t.improvement].name,
          sub: '+' + PILLAGE_GOLD + ' gold · destroys it · ends move',
          do: function () { pillageTile(u, t); closeModal(); draw(); }
        });
      }
      actions.push({ icon: '▣', title: u.fortified ? 'Unfortify' : 'Fortify', sub: 'Heal +2/turn · +25% defense', do: function () { u.goto = null; u.fortified = !u.fortified; u.moves = 0; closeModal(); draw(); } });
      actions.push({ icon: '✕', title: 'Skip Unit', sub: 'End its turn', do: function () { u.goto = null; u.moves = 0; closeModal(); autoSelectNextUnit(); draw(); } });
    } else if (isCity) {
      title = t.city.name;
      actions.push({ icon: '🏛', primary: true, title: 'Manage ' + t.city.name, sub: 'Production, food, science', do: function () { closeModal(); openCity(t.city); } });
    } else if (t.city && t.city.civ === 'cs') {
      // City-state interaction (only when at peace; if at war, regular combat applies)
      title = t.city.name + ' (City-State)';
      var csc = t.city;
      var kindDef = CS_KINDS[csc.kind] || CS_KINDS.mercantile;
      var atPeace = !atWar('player', 'cs');
      if (atPeace) {
        if (csc.ally === 'player') {
          actions.push({ icon: kindDef.icon, primary: true, title: 'Allied — ' + kindDef.name, sub: kindDef.desc, disabled: true, do: function () {} });
        } else if (csc.ally) {
          var bribeCost = CS_BRIBE_COST;
          var bribeName = CIVS[csc.ally] ? CIVS[csc.ally].name : csc.ally;
          actions.push({
            icon: kindDef.icon,
            primary: true,
            title: 'Bribe (' + bribeCost + 'g)',
            sub: 'Steal alliance from ' + bribeName + ' · ' + kindDef.desc,
            disabled: civPl.gold < bribeCost,
            do: function () {
              civPl.gold -= bribeCost;
              csc.ally = 'player';
              recomputeIncome('player');
              sfxAlly();
              showToast('Allied with ' + csc.name, 'success');
              logEvent('Allied with ' + csc.name + ' (' + kindDef.name + ')', 'success');
              closeModal();
              draw();
            }
          });
        } else {
          if (csc.quest && !csc.quest.done) {
            actions.push({ icon: '🎯', title: 'Quest: ' + (csc.quest.label || csQuestText(csc)), sub: csQuestText(csc) + ' → free alliance', disabled: true, do: function () {} });
          }
          actions.push({
            icon: kindDef.icon,
            primary: true,
            title: 'Befriend (' + CS_BEFRIEND_COST + 'g)',
            sub: kindDef.desc,
            disabled: civPl.gold < CS_BEFRIEND_COST,
            do: function () {
              civPl.gold -= CS_BEFRIEND_COST;
              csc.ally = 'player';
              recomputeIncome('player');
              sfxAlly();
              showToast('Allied with ' + csc.name, 'success');
              logEvent('Allied with ' + csc.name + ' (' + kindDef.name + ')', 'success');
              closeModal();
              draw();
            }
          });
        }
        actions.push({
          icon: '⚔',
          danger: true,
          title: 'Declare War',
          sub: 'Your forces can attack the city',
          do: function () {
            state.diplomacy[dipKey('player','cs')] = 'war';
            if (csc.ally === 'player') csc.ally = null;
            showToast('Declared war on ' + csc.name, 'error');
            logEvent('Declared war on ' + csc.name, 'error');
            recomputeIncome('player');
            closeModal();
            draw();
          }
        });
      } else {
        // At war — show status; combat happens via adjacent-unit attack
        actions.push({ icon: '⚔', title: 'At War', sub: 'Walk a military unit in to attack', disabled: true, do: function () {} });
      }
    }

    // Global actions (always at bottom)
    // Turn Brief — triaged "what needs you" checklist with one-tap jumps.
    var briefN = computeTurnBrief().length;
    actions.push({ icon: '📋', primary: briefN > 0, title: 'Turn Brief', sub: briefN > 0 ? briefN + ' thing' + (briefN > 1 ? 's' : '') + ' need you' : 'All clear', do: function () { closeModal(); openTurnBrief(); } });
    actions.push({ icon: '◆', title: 'Research', sub: civPl.currentTech ? TECHS[civPl.currentTech].name + ' · ' + civPl.techProgress + '/' + TECHS[civPl.currentTech].cost : 'Choose research', do: function () { closeModal(); openTech(); } });
    actions.push({ icon: '♪', title: 'Civics', sub: civPl.currentCivic ? CIVICS[civPl.currentCivic].name + ' · ' + civPl.civicProgress + '/' + CIVICS[civPl.currentCivic].cost : (civicsAdopted(civPl) + '/' + CIVIC_ORDER.length + ' adopted'), do: function () { closeModal(); openCivics(); } });

    // Diplomacy — unified menu (alliances, war, peace, trade)
    var hasRival = AI_SIDES.some(function (id) {
      var c = state.civs[id];
      return c && (c.cities.length > 0 || c.units.length > 0);
    });
    if (hasRival) {
      actions.push({
        icon: '⚑',
        title: 'Diplomacy',
        sub: 'Alliances · trade · war',
        do: function () { closeModal(); openDiplomacy(); }
      });
    }

    // Government — switchable empire-wide stance
    var curGov = GOVERNMENTS[civPl.government] || GOVERNMENTS.despotism;
    actions.push({
      icon: '⚖',
      title: 'Government',
      sub: civPl.governmentTurns > 0 ? 'Anarchy · ' + civPl.governmentTurns + 'T → ' + curGov.name : curGov.name + ' · tap to change',
      do: function () { closeModal(); openGovernment(); }
    });

    // Edicts — fast reactive stance
    var curEd = activeEdict(civPl);
    actions.push({
      icon: '✶',
      title: 'Edicts',
      sub: curEd ? curEd.name + ' · ' + civPl.edictTurns + 'T left' : 'Proclaim a timed stance',
      do: function () { closeModal(); openEdicts(); }
    });

    // Espionage — spy missions, unlocked from the Classical age
    if (spySlots(civPl) > 0) {
      var opsN = (civPl.spyOps || []).length;
      actions.push({
        icon: '🕵',
        title: 'Espionage',
        sub: opsN ? opsN + '/' + spySlots(civPl) + ' spies deployed' : 'Deploy spies · steal, sabotage, guard',
        do: function () { closeModal(); openEspionage(); }
      });
    }

    // Barbarian Clans — hire or bribe the raiders, while any roam
    if (clansAvailable()) {
      actions.push({
        icon: '🏴',
        title: 'Barbarian Clans',
        sub: (state.barbBribe && state.barbBribe.turns > 0) ? 'Raiding ' + (CIVS[state.barbBribe.target] ? CIVS[state.barbBribe.target].name : '?') + ' · ' + state.barbBribe.turns + 'T' : 'Hire a raider · bribe the horde',
        do: function () { closeModal(); openClans(); }
      });
    }

    // Ideology — a late-game culture identity, unlocked in the Modern age
    if (ideologyUnlocked(civPl)) {
      actions.push({
        icon: '★',
        title: 'Ideology',
        sub: civPl.ideology ? IDEOLOGIES[civPl.ideology].name + ' · tap to change' : 'Adopt a guiding ideology',
        primary: !civPl.ideology,
        do: function () { closeModal(); openIdeology(); }
      });
    }

    // Religion — shown once a civ can generate faith (has theology / a shrine path)
    if (civPl.religionId || canFoundReligion(civPl) || faithPerTurn(civPl) > 0 || (civPl.faith || 0) > 0) {
      var rdp = religionDef(civPl.religionId);
      actions.push({
        icon: rdp ? rdp.icon : '☧',
        title: 'Religion',
        sub: rdp ? rdp.name + ' · ' + religionFollowerCount(civPl.religionId) + '/' + totalCityCount() + ' cities' : (canFoundReligion(civPl) ? 'Found a religion now!' : 'Faith ' + Math.round(civPl.faith || 0) + '/' + RELIGION_FOUND_COST),
        primary: canFoundReligion(civPl),
        do: function () { closeModal(); openReligion(); }
      });
    }

    // Tile yield overlay toggle
    actions.push({ icon: '⬡', title: showYieldOverlay ? 'Hide Yields' : 'Show Yields', sub: 'Food / prod / gold per tile', do: function () { showYieldOverlay = !showYieldOverlay; showToast(showYieldOverlay ? 'Yields ON' : 'Yields OFF'); closeModal(); draw(); } });

    // Event log + the Chronicle (curated saga)
    actions.push({ icon: '📜', title: 'Event Log', sub: 'Recent history & notifications', do: function () { closeModal(); openLog(); } });
    actions.push({ icon: '📖', title: 'Chronicle', sub: 'Your saga so far', do: function () { closeModal(); openChronicle(); } });

    // World report (standings) + options
    actions.push({ icon: '🏆', title: 'World Report', sub: 'Standings & victory progress', do: function () { closeModal(); openStandings(); } });
    actions.push({ icon: '⚙', title: 'Options', sub: 'Audio · restart · quit', do: function () { closeModal(); openOptions(); } });

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
      if (t && t.unit && t.unit.civ !== u.civ && atWar(u.civ, t.unit.civ)) return { c: ns[i][0], r: ns[i][1], unit: t.unit };
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
    document.getElementById('c-sci').textContent = '+' + cityScience(city);
    var def = (city.buildings.walls ? 4 : 0) + (city.buildings.bastion ? 6 : 0) + (city.buildings.castle ? 6 : 0) + (city.buildings.military_academy ? 4 : 0) + (city.pop);
    if (state.wondersBuilt && state.wondersBuilt.great_wall === city.civ) def = Math.round(def * 1.5);
    document.getElementById('c-def').textContent = def;
    // Mood / stability — Content, Restless, or in open Revolt
    var moodEl = document.getElementById('c-mood');
    if (moodEl) {
      var u = city.unrest || 0, thr = revoltThreshold(city);
      var delta = cityUnrestDelta(city);
      var label, col;
      if (u >= thr) { label = 'REVOLT'; col = '#ff5a5a'; }
      else if (u >= thr * 0.5) { label = 'Restless ' + u + '/' + thr; col = '#ffb14d'; }
      else { label = 'Content'; col = '#7bdc8a'; }
      var relStr = '';
      if (city.religion) { var crd = religionDef(city.religion); if (crd) relStr = '   ' + crd.icon + ' ' + crd.name + (city.holyCity ? ' ✦' : ''); }
      moodEl.textContent = label + (delta > 0 ? ' ▲' : delta < 0 ? ' ▼' : '') + relStr;
      moodEl.style.color = col;
    }

    // Current production
    var p = city.producing;
    var pCost = UNITS[p] ? UNITS[p].cost : (BUILDINGS[p] ? BUILDINGS[p].cost : 0);
    var pName = UNITS[p] ? UNITS[p].name : (BUILDINGS[p] ? BUILDINGS[p].name : '—');
    var turns = pCost > 0 && y.prod > 0 ? Math.max(1, Math.ceil((pCost - city.prod) / y.prod)) : '∞';
    var pct = pCost > 0 ? Math.min(100, (city.prod / pCost) * 100) : 0;
    document.getElementById('c-current').innerHTML =
      '<div>' + pName + ' <span style="color:#888">(' + (city.prod | 0) + '/' + pCost + ', ~' + turns + 't)</span></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>';

    // Queue section
    if (!Array.isArray(city.queue)) city.queue = [];
    var qSection = document.getElementById('c-queue-section');
    var qList = document.getElementById('c-queue');
    qList.innerHTML = '';
    if (city.queue.length === 0) {
      qSection.classList.add('hidden');
    } else {
      qSection.classList.remove('hidden');
      city.queue.forEach(function (qk, qi) {
        var qu = UNITS[qk] || BUILDINGS[qk];
        var chip = document.createElement('button');
        chip.className = 'queue-chip focusable';
        chip.title = 'Remove from queue';
        chip.innerHTML = '<span>' + (qu ? qu.name : qk) + '</span><span class="queue-x">×</span>';
        chip.addEventListener('click', function () {
          city.queue.splice(qi, 1);
          openCity(city);
        });
        qList.appendChild(chip);
      });
    }

    // Available options
    var civ = state.civs.player;
    var avail = availableProducibles(civ, city);
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
      var isSpace = isB && BUILDINGS[k].spacePart;
      var isNat = isB && BUILDINGS[k].national;
      var iconChar = isSpace ? '🚀' : isNat ? '★' : isWonder ? '✦' : (isB ? '▢' : UNITS[k].glyph);
      var sub;
      if (isSpace) {
        sub = (civ.spaceParts || 0) + '/' + SPACE_PARTS_NEEDED + ' assembled · ' + u.cost + ' prod';
      } else if (isNat) {
        sub = (BUILDINGS[k].lore || 'National project') + ' · ' + u.cost + ' prod';
      } else if (isWonder) {
        sub = BUILDINGS[k].lore + ' · ' + u.cost + ' prod';
      } else if (isB) {
        var parts = [];
        if (BUILDINGS[k].food) parts.push('+' + BUILDINGS[k].food + ' food');
        if (BUILDINGS[k].prod) parts.push('+' + BUILDINGS[k].prod + ' prod');
        if (BUILDINGS[k].prodMultiplier) parts.push('+' + Math.round(BUILDINGS[k].prodMultiplier * 100) + '% prod');
        if (BUILDINGS[k].gold) parts.push('+' + BUILDINGS[k].gold + ' gold');
        if (BUILDINGS[k].sci)  parts.push('+' + BUILDINGS[k].sci + ' sci');
        if (BUILDINGS[k].culture) parts.push('+' + BUILDINGS[k].culture + ' culture');
        if (BUILDINGS[k].content) parts.push('+' + BUILDINGS[k].content + ' stability');
        if (BUILDINGS[k].def)  parts.push('+' + BUILDINGS[k].def + ' def');
        sub = (parts.length ? parts.join(', ') : 'Building') + ' · ' + u.cost + ' prod';
      } else {
        var uDef = UNITS[k];
        var uParts = [uDef.atk + '⚔ ' + uDef.def + '🛡 ' + uDef.hp + '♥ ' + uDef.move + '→'];
        if (uDef.ranged) uParts.push('range ' + uDef.ranged);
        if (uDef.siege) uParts.push('siege');
        sub = uParts.join(' · ') + ' · ' + u.cost + ' prod';
      }
      // Two-button row: main switches now, side button queues
      var wrap = document.createElement('div');
      wrap.className = 'prod-row';
      var row = document.createElement('button');
      row.className = 'action-row focusable' + (isWonder ? ' primary' : '');
      row.innerHTML = '<div class="action-icon">' + iconChar + '</div>' +
        '<div class="action-body"><div class="action-title">' + u.name + (isWonder ? ' ✦' : '') + '</div>' +
        '<div class="action-sub">' + sub + '</div></div>';
      row.addEventListener('click', function () {
        city.producing = k;
        showToast('Producing ' + u.name);
        openCity(city);
      });
      var qBtn = document.createElement('button');
      qBtn.className = 'queue-add focusable';
      qBtn.title = 'Add to build queue';
      qBtn.textContent = '+';
      qBtn.addEventListener('click', function () {
        if (city.queue.length >= 3) { showToast('Queue full (3 max)'); return; }
        city.queue.push(k);
        showToast('Queued ' + u.name);
        openCity(city);
      });
      wrap.appendChild(row);
      wrap.appendChild(qBtn);
      list.appendChild(wrap);
    });

    // Resource-locked units: teched, but the required strategic resource isn't
    // controlled yet. Shown greyed so the player knows to expand toward it.
    for (var lk in UNITS) {
      var lu = UNITS[lk];
      if (lu.barb || lu.great) continue;
      if (lu.tech && !civ.techs[lu.tech]) continue;
      if (lu.naval && !isCoastalCity(city)) continue;
      if (!lu.requires || civHasResource(civ, lu.requires)) continue;
      var resLbl = (RESOURCES[lu.requires] && RESOURCES[lu.requires].label) || lu.requires;
      var lrow = document.createElement('div');
      lrow.className = 'action-row disabled';
      lrow.innerHTML = '<div class="action-icon">' + lu.glyph + '</div>' +
        '<div class="action-body"><div class="action-title">' + lu.name + '</div>' +
        '<div class="action-sub">Needs ' + resLbl + ' in your territory · ' + lu.cost + ' prod</div></div>';
      list.appendChild(lrow);
    }

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
      cur.textContent = state.freetech ? 'Great Scientist — pick a free tech:' : 'No research. Pick one:';
    }

    var list = document.getElementById('tech-list');
    list.innerHTML = '';

    // Click logic shared by every node (start research, or instant-complete
    // when a Great Scientist's free pick is pending).
    function chooseTech(k, def, canResearch) {
      if (!canResearch || k === civ.currentTech) return;
      if (state.freetech) {
        var ageBefore = getAge(civ);
        civ.techs[k] = true;
        state.freetech = false;
        if (civ.currentTech === k) { civ.currentTech = null; civ.techProgress = 0; }
        showToast(def.name + ' discovered free!', 'success');
        sfxBuild();
        var ageAfter = getAge(civ);
        if (ageAfter.name !== ageBefore.name) {
          var ageGold = ageAdvanceGold(ageAfter);
          civ.gold += ageGold;
          showToast(ageAfter.name + ' Age! +' + ageGold + ' gold', 'success');
        }
        var allDone = true;
        for (var ti = 0; ti < TECH_ORDER.length; ti++) { if (!civ.techs[TECH_ORDER[ti]]) { allDone = false; break; } }
        if (allDone) { closeModal(); showEndScreen('player', 'science'); return; }
        if (!civ.currentTech) popQueuedTech(civ);   // chain the plan after a free pick
        closeModal();
        updateHud();
        draw();
        save();
        return;
      }
      civ.currentTech = k;
      civ.techProgress = 0;
      showToast('Researching ' + def.name);
      openTech();
      updateHud();
      save();
    }

    // Render the research-plan chips under the current-research box.
    var qWrap = document.getElementById('tech-queue');
    if (!qWrap) {
      qWrap = document.createElement('div');
      qWrap.id = 'tech-queue';
      qWrap.className = 'research-queue';
      cur.parentNode.insertBefore(qWrap, cur.nextSibling);
    }
    qWrap.innerHTML = '';
    if (civ.researchQueue && civ.researchQueue.length) {
      var lbl = document.createElement('span');
      lbl.className = 'rq-label';
      lbl.textContent = 'Plan:';
      qWrap.appendChild(lbl);
      civ.researchQueue.forEach(function (qk, qi) {
        var chip = document.createElement('button');
        chip.className = 'rq-chip focusable';
        chip.title = 'Remove from plan';
        chip.innerHTML = '<span>' + (qi + 1) + '. ' + (TECHS[qk] ? TECHS[qk].name : qk) + '</span><span class="rq-x">×</span>';
        chip.addEventListener('click', function () {
          civ.researchQueue.splice(qi, 1);
          openTech(); updateHud(); save();
        });
        qWrap.appendChild(chip);
      });
    }

    // Group techs into tiers (rows) by prerequisite depth.
    var tiers = [];
    TECH_ORDER.forEach(function (k) {
      var d = TECH_DEPTH[k] || 0;
      (tiers[d] = tiers[d] || []).push(k);
    });

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var graph = document.createElement('div');
    graph.className = 'tech-graph';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tech-edges');
    graph.appendChild(svg);

    var nodeEls = {};
    tiers.forEach(function (tier) {
      if (!tier) return;
      var row = document.createElement('div');
      row.className = 'tier-row';
      tier.forEach(function (k) {
        var def = TECHS[k];
        var done = !!civ.techs[k];
        var isCur = k === civ.currentTech;
        var canResearch = def.req.every(function (r) { return civ.techs[r]; }) && !done;
        var queueIdx = civ.researchQueue ? civ.researchQueue.indexOf(k) : -1;
        var stateCls = done ? 'done' : isCur ? 'cur' : canResearch ? 'avail' : (queueIdx >= 0 ? 'queued' : 'locked');
        var node = document.createElement('button');
        node.className = 'tech-node ' + stateCls + ' focusable';
        if (done || isCur) node.setAttribute('disabled', '');   // avail/queued/locked stay clickable
        var badge = done ? '✓' : isCur ? '▶' : canResearch ? def.cost + '◆' : (queueIdx >= 0 ? (queueIdx + 1) + '' : '🔒');
        var sub = isCur ? civ.techProgress + '/' + def.cost : def.unlocks;
        var bar = isCur ? '<div class="tn-bar"><i style="width:' + Math.min(100, (civ.techProgress / def.cost) * 100) + '%"></i></div>' : '';
        node.innerHTML =
          '<div class="tn-badge">' + badge + '</div>' +
          '<div class="tn-name">' + def.name + '</div>' +
          '<div class="tn-sub">' + sub + '</div>' + bar;
        (function (k2, def2, can2, done2, cur2) {
          node.addEventListener('click', function () {
            if (can2) { chooseTech(k2, def2, true); return; }      // available → research now
            if (done2 || cur2) return;                              // researched / in progress → inert
            enqueueWithPrereqs(civ, k2);                            // locked → queue prereq chain
            sfxSelect();
            openTech(); updateHud(); save();
          });
        })(k, def, canResearch, done, isCur);
        row.appendChild(node);
        nodeEls[k] = node;
      });
      graph.appendChild(row);
    });

    list.appendChild(graph);
    showModal('tech-screen');

    // Draw prerequisite connectors once the modal has laid out. A green line
    // means the prerequisite is already researched; a faint line means it isn't.
    requestAnimationFrame(function () {
      var W = graph.offsetWidth, H = graph.offsetHeight;
      if (!W || !H) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      TECH_ORDER.forEach(function (k) {
        var el = nodeEls[k];
        if (!el) return;
        var x2 = el.offsetLeft + el.offsetWidth / 2, y2 = el.offsetTop;
        TECHS[k].req.forEach(function (rq) {
          var pe = nodeEls[rq];
          if (!pe) return;
          var x1 = pe.offsetLeft + pe.offsetWidth / 2, y1 = pe.offsetTop + pe.offsetHeight;
          var my = (y1 + y2) / 2;
          var path = document.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + my + ' ' + x2 + ',' + my + ' ' + x2 + ',' + y2);
          path.setAttribute('stroke', civ.techs[rq] ? 'rgba(110,210,150,0.75)' : 'rgba(150,170,190,0.30)');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          svg.appendChild(path);
        });
      });
    });
  }

  // The CIVICS tree screen — mirrors openTech, fuelled by culture/turn.
  function openCivics() {
    var civ = state.civs.player;
    var cur = document.getElementById('civic-current');
    if (civ.currentCivic) {
      var cdef = CIVICS[civ.currentCivic];
      var pct = (civ.civicProgress / cdef.cost) * 100;
      cur.innerHTML = '<b>' + cdef.name + '</b> — ' + civ.civicProgress + '/' + cdef.cost + ' (+' + (civ.culPerTurn || 0) + ' culture/turn)<br>' +
        '<span style="color:#888;font-size:11px">' + cdef.lore + '</span>' +
        '<div class="bar" style="margin-top:6px"><i style="width:' + Math.min(100, pct) + '%"></i></div>';
    } else {
      cur.innerHTML = 'No civic in progress — pick one. <span style="color:#888;font-size:11px">(' + civicsAdopted(civ) + '/' + CIVIC_ORDER.length + ' adopted · +' + (civ.culPerTurn || 0) + ' culture/turn)</span>';
    }
    var list = document.getElementById('civic-list');
    list.innerHTML = '';

    var tiers = [];
    CIVIC_ORDER.forEach(function (k) { var d = CIVIC_DEPTH[k] || 0; (tiers[d] = tiers[d] || []).push(k); });

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var graph = document.createElement('div');
    graph.className = 'tech-graph';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'tech-edges');
    graph.appendChild(svg);

    var nodeEls = {};
    tiers.forEach(function (tier) {
      if (!tier) return;
      var row = document.createElement('div');
      row.className = 'tier-row';
      tier.forEach(function (k) {
        var def = CIVICS[k];
        var done = !!(civ.civics && civ.civics[k]);
        var isCur = k === civ.currentCivic;
        var canAdopt = canAdoptCivic(civ, k);
        var qIdx = civ.civicQueue ? civ.civicQueue.indexOf(k) : -1;
        var stateCls = done ? 'done' : isCur ? 'cur' : canAdopt ? 'avail' : (qIdx >= 0 ? 'queued' : 'locked');
        var node = document.createElement('button');
        node.className = 'tech-node ' + stateCls + ' focusable';
        if (done || isCur) node.setAttribute('disabled', '');
        var badge = done ? '✓' : isCur ? '▶' : canAdopt ? def.cost + '♪' : (qIdx >= 0 ? (qIdx + 1) + '' : '🔒');
        var sub = isCur ? civ.civicProgress + '/' + def.cost : def.lore;
        var bar = isCur ? '<div class="tn-bar"><i style="width:' + Math.min(100, (civ.civicProgress / def.cost) * 100) + '%"></i></div>' : '';
        node.innerHTML =
          '<div class="tn-badge">' + badge + '</div>' +
          '<div class="tn-name">' + def.name + '</div>' +
          '<div class="tn-sub">' + sub + '</div>' + bar;
        (function (k2, can2, done2, cur2) {
          node.addEventListener('click', function () {
            if (can2) { civ.currentCivic = k2; civ.civicProgress = 0; showToast('Adopting ' + CIVICS[k2].name); openCivics(); updateHud(); save(); return; }
            if (done2 || cur2) return;
            enqueueCivicWithPrereqs(civ, k2);
            if (typeof sfxSelect === 'function') sfxSelect();
            openCivics(); updateHud(); save();
          });
        })(k, canAdopt, done, isCur);
        row.appendChild(node);
        nodeEls[k] = node;
      });
      graph.appendChild(row);
    });

    list.appendChild(graph);
    showModal('civics-screen');

    requestAnimationFrame(function () {
      var W = graph.offsetWidth, H = graph.offsetHeight;
      if (!W || !H) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.setAttribute('width', W);
      svg.setAttribute('height', H);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      CIVIC_ORDER.forEach(function (k) {
        var el = nodeEls[k];
        if (!el) return;
        var x2 = el.offsetLeft + el.offsetWidth / 2, y2 = el.offsetTop;
        CIVICS[k].req.forEach(function (rq) {
          var pe = nodeEls[rq];
          if (!pe) return;
          var x1 = pe.offsetLeft + pe.offsetWidth / 2, y1 = pe.offsetTop + pe.offsetHeight;
          var my = (y1 + y2) / 2;
          var path = document.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + my + ' ' + x2 + ',' + my + ' ' + x2 + ',' + y2);
          path.setAttribute('stroke', (civ.civics && civ.civics[rq]) ? 'rgba(200,140,255,0.75)' : 'rgba(150,170,190,0.30)');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          svg.appendChild(path);
        });
      });
    });
  }

  // =====================================================================
  // END SCREEN
  // =====================================================================
  function showEndScreen(winner, kind) {
    if (winner === 'player') recordDailyWin();   // log Daily best/streak on a win
    var title = document.getElementById('end-title');
    var detail = document.getElementById('end-detail');
    var VICTORY_MSG_WIN = {
      domination: 'You captured every rival capital.',
      science:    'You researched every technology.',
      culture:    'You adopted every civic — a Cultural Ascendancy.',
      economic:   'You held ' + ECONOMIC_VICTORY_GOLD + '+ gold for ' + ECONOMIC_VICTORY_TURNS + ' turns.',
      space:      'You won the Space Race — your ship reaches the stars first.',
      religion:   'Your faith swept the world — a Religious victory.'
    };
    var VICTORY_MSG_LOSS = {
      domination: ' captured all rival capitals.',
      science:    ' completed all research first.',
      culture:    ' achieved a Cultural Ascendancy first.',
      economic:   ' amassed ' + ECONOMIC_VICTORY_GOLD + '+ gold for ' + ECONOMIC_VICTORY_TURNS + ' turns.',
      space:      ' won the Space Race.',
      religion:   ' converted the world to their faith.'
    };
    if (winner === 'player') {
      title.textContent = 'Victory';
      title.style.color = '#00ff88';
      detail.innerHTML = VICTORY_MSG_WIN[kind] || 'You won.';
      sfxVictory();
    } else {
      title.textContent = 'Defeat';
      title.style.color = '#ff4466';
      sfxDefeat();
      var winName = CIVS[winner] ? CIVS[winner].name : 'Enemy';
      if (kind === 'domination' && state.civs.player.cities.length === 0) {
        detail.innerHTML = winName + ' conquered your civilization.';
      } else {
        detail.innerHTML = winName + (VICTORY_MSG_LOSS[kind] || ' won.');
      }
    }
    // Score summary
    var pl = state.civs.player;
    var techCount = 0;
    for (var i = 0; i < TECH_ORDER.length; i++) if (pl.techs[TECH_ORDER[i]]) techCount++;
    var stats = state.stats || {};
    var diffLabel = DIFFICULTIES[state.difficulty || 'normal'] ? DIFFICULTIES[state.difficulty || 'normal'].label : 'Normal';
    // Derive the size label from the actual map width so it stays correct as
    // sizes change (was hardcoded to the old 10/14/18 thresholds).
    var mapLabel = 'Normal';
    for (var msk in MAP_SIZES) {
      if (MAP_SIZES[msk].w === MAP_W) { mapLabel = MAP_SIZES[msk].label; break; }
    }
    detail.innerHTML += '<div class="end-stats">' +
      '<div class="stat-row"><span>Turns</span><span>' + state.turn + '</span></div>' +
      '<div class="stat-row"><span>Cities</span><span>' + pl.cities.length + '</span></div>' +
      '<div class="stat-row"><span>Techs</span><span>' + techCount + '/' + TECH_ORDER.length + '</span></div>' +
      '<div class="stat-row"><span>Kills</span><span>' + (stats.unitsKilled || 0) + '</span></div>' +
      '<div class="stat-row"><span>Lost</span><span>' + (stats.unitsLost || 0) + '</span></div>' +
      '<div class="stat-row"><span>Map / Difficulty</span><span>' + mapLabel + ' / ' + diffLabel + '</span></div>' +
      '</div>';
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
      // Help screen: arrow up/down scrolls the body before moving focus to the
      // top "back" button or bottom "Got it" button.
      if (openModal === 'help-screen' && (k === 'ArrowUp' || k === 'ArrowDown')) {
        e.preventDefault();
        scrollHelp(k);
        return;
      }
      if (openModal === 'log-screen' && (k === 'ArrowUp' || k === 'ArrowDown')) {
        e.preventDefault();
        var lb = document.getElementById('log-body');
        if (lb) lb.scrollTop += (k === 'ArrowDown' ? 1 : -1) * Math.max(40, Math.floor(lb.clientHeight * 0.6));
        return;
      }
      // Cloud code keyboard — arrows move the character grid, Enter presses.
      if (openModal === 'cloud-keyboard') {
        if (ACTION_KEYS.indexOf(k) >= 0) { e.preventDefault(); moveCloudKb(k); return; }
        if (k === 'Enter') { e.preventDefault(); pressCloudKb(); return; }
        return;
      }
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

      // Every directional press moves immediately for instant feedback. A combo
      // is detected after-the-fact from keyHistory — its cursor "wiggle" is
      // intentional: pressing ←→←→ moves the cursor left, right, left, right
      // (net zero), and only then fires the zoom toggle. This trades a tiny
      // bit of visual jitter during a 4-press combo for crisp, immediate
      // movement on every tap — way more important on a D-pad device.
      var dc = 0, dr = 0;
      if (k === 'ArrowUp') dr = -1;
      else if (k === 'ArrowDown') dr = +1;
      else if (k === 'ArrowLeft') dc = -1;
      else if (k === 'ArrowRight') dc = +1;
      if (state.mode === 'cursor') moveCursor(dc, dr);
      else panInDirection(dc, dr);

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
      draw();
      return;
    }

    if (k === 'Enter') {
      e.preventDefault();
      activate();
      draw();
    } else if (k === 'Escape') {
      e.preventDefault();
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

  function scrollHelp(k) {
    var body = document.querySelector('#help-screen .help-body');
    if (!body) return;
    var step = Math.max(40, Math.floor(body.clientHeight * 0.55));
    var atTop = body.scrollTop <= 0;
    var atBottom = (body.scrollTop + body.clientHeight) >= (body.scrollHeight - 1);
    var focusables = Array.from(document.querySelectorAll('#help-screen .focusable:not([disabled])'));
    var backBtn = focusables[0];               // ← (top)
    var gotIt   = focusables[focusables.length - 1];   // Got it (bottom)

    if (k === 'ArrowDown') {
      if (!atBottom) {
        body.scrollTop += step;
        if (document.activeElement !== gotIt && document.activeElement !== backBtn) backBtn && backBtn.focus();
      } else if (gotIt) {
        gotIt.focus();
      }
    } else {
      // ArrowUp
      if (!atTop) {
        body.scrollTop -= step;
        if (document.activeElement !== gotIt && document.activeElement !== backBtn) backBtn && backBtn.focus();
      } else if (backBtn) {
        backBtn.focus();
      }
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

    // --- Map size selector ---
    var mapRow = document.createElement('div');
    mapRow.className = 'setup-row';
    mapRow.innerHTML = '<div class="setup-label">Map Size</div>';
    var mapBtns = document.createElement('div');
    mapBtns.className = 'setup-options';
    MAP_SIZE_ORDER.forEach(function (key) {
      var ms = MAP_SIZES[key];
      var btn = document.createElement('button');
      btn.className = 'setup-btn focusable' + (selectedMapSize === key ? ' active' : '');
      btn.dataset.action = 'pick-mapsize';
      btn.dataset.mapsize = key;
      btn.innerHTML = '<b>' + ms.label + '</b><span class="setup-desc">' + ms.desc + '</span>';
      mapBtns.appendChild(btn);
    });
    mapRow.appendChild(mapBtns);
    host.appendChild(mapRow);

    // --- Difficulty slider ---
    var selIdx = Math.max(0, DIFFICULTY_ORDER.indexOf(selectedDifficulty));
    var selDiff = DIFFICULTIES[DIFFICULTY_ORDER[selIdx]];
    var diffRow = document.createElement('div');
    diffRow.className = 'setup-row';
    diffRow.innerHTML = '<div class="setup-label">Difficulty <span class="diff-current">' + selDiff.label + '</span></div>';

    var slider = document.createElement('div');
    slider.className = 'diff-slider';
    // Cyan fill line up to the active stop (frac of the inner track width)
    var frac = DIFFICULTY_ORDER.length > 1 ? selIdx / (DIFFICULTY_ORDER.length - 1) : 0;
    var fill = document.createElement('div');
    fill.className = 'diff-slider-fill';
    fill.style.width = 'calc((100% - 24px) * ' + frac + ')';
    slider.appendChild(fill);

    DIFFICULTY_ORDER.forEach(function (key, i) {
      var d = DIFFICULTIES[key];
      var stop = document.createElement('button');
      stop.className = 'diff-stop focusable' +
        (i <= selIdx ? ' filled' : '') +
        (key === selectedDifficulty ? ' active' : '');
      stop.dataset.action = 'pick-difficulty';
      stop.dataset.difficulty = key;
      stop.title = d.desc;
      stop.innerHTML = '<span class="diff-dot"></span><span class="diff-stop-label">' + d.label + '</span>';
      slider.appendChild(stop);
    });
    diffRow.appendChild(slider);

    var diffDesc = document.createElement('div');
    diffDesc.className = 'diff-desc';
    diffDesc.textContent = selDiff.desc;
    diffRow.appendChild(diffDesc);

    host.appendChild(diffRow);

    // --- World seed (optional): blank = random; a code replays the exact world ---
    var seedRow = document.createElement('div');
    seedRow.className = 'setup-row';
    seedRow.innerHTML = '<div class="setup-label">World Seed <span class="diff-current" id="seed-current">' +
      (selectedSeed ? seedToCode(selectedSeed) : 'random') + '</span></div>';
    var seedWrap = document.createElement('div');
    seedWrap.className = 'cloud-code-row';
    var seedInput = document.createElement('input');
    seedInput.className = 'cloud-code-input';
    seedInput.id = 'seed-input';
    seedInput.type = 'text';
    seedInput.spellcheck = false;
    seedInput.placeholder = 'seed code (blank = random)';
    seedInput.value = selectedSeed ? seedToCode(selectedSeed) : '';
    var seedBtn = document.createElement('button');
    seedBtn.className = 'nav-item primary small focusable';
    seedBtn.dataset.action = 'set-seed';
    seedBtn.textContent = 'Use';
    seedWrap.appendChild(seedInput);
    seedWrap.appendChild(seedBtn);
    seedRow.appendChild(seedWrap);
    host.appendChild(seedRow);
  }

  // After renderCivCards() rebuilds the setup DOM, return focus to the control
  // the player just changed (matched by data-action + a data-attr value), so
  // D-pad navigation doesn't snap back to the top of the list.
  function refocusSetup(action, attr, value) {
    var sel = '[data-action="' + action + '"][data-' + attr + '="' + value + '"]';
    var el = document.querySelector(sel);
    if (el) { try { el.focus(); el.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
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
    // Daily Challenge button — show today's status (won / best / streak).
    var dBtn = document.getElementById('daily-btn');
    if (dBtn) {
      var rec = loadDailyRec();
      var today = dailyKeyForToday();
      var wonToday = rec.lastWonDate === today || (rec.best && rec.best[today] != null);
      var streak = rec.streak || 0;
      var bits = [];
      if (wonToday && rec.best && rec.best[today] != null) bits.push('✓ T' + rec.best[today]);
      else if (wonToday) bits.push('✓ done');
      if (streak > 0) bits.push('🔥' + streak);
      dBtn.innerHTML = '🔥 Daily Challenge' + (bits.length ? ' <span class="daily-tag">' + bits.join(' · ') + '</span>' : '');
    }
    updateAudioToggles();
  }

  function updateAudioToggles() {
    var sfxBtn = document.getElementById('sfx-toggle');
    var musicBtn = document.getElementById('music-toggle');
    if (sfxBtn) {
      sfxBtn.classList.toggle('on', !!audioPrefs.sfx);
      sfxBtn.setAttribute('aria-pressed', audioPrefs.sfx ? 'true' : 'false');
      var s1 = sfxBtn.querySelector('.audio-state');
      if (s1) s1.textContent = audioPrefs.sfx ? 'ON' : 'OFF';
    }
    if (musicBtn) {
      musicBtn.classList.toggle('on', !!audioPrefs.music);
      musicBtn.setAttribute('aria-pressed', audioPrefs.music ? 'true' : 'false');
      var s2 = musicBtn.querySelector('.audio-state');
      if (s2) s2.textContent = audioPrefs.music ? 'ON' : 'OFF';
    }
  }

  // =====================================================================
  // SAVE EXPORT / IMPORT
  // Tracks which mode the share modal is currently in (export vs import)
  // so the Copy / Paste / Load buttons know what to do.
  // =====================================================================
  var shareMode = null;   // 'export' | 'import'

  // gzip + base64 a string; prefix with 'g:'. Falls back to base64-only ('j:')
  // if CompressionStream isn't available.
  async function encodeSavePayload(raw) {
    if (typeof CompressionStream === 'function') {
      try {
        var stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));
        var buf = await new Response(stream).arrayBuffer();
        var bytes = new Uint8Array(buf);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return 'g:' + btoa(bin);
      } catch (e) { /* fall through */ }
    }
    return 'j:' + btoa(unescape(encodeURIComponent(raw)));
  }

  // Inverse — accepts either prefix or raw JSON for legacy paste-ins.
  async function decodeSavePayload(code) {
    code = (code || '').trim();
    if (!code) throw new Error('Empty code');
    if (code.indexOf('g:') === 0) {
      if (typeof DecompressionStream !== 'function') throw new Error('Browser too old for gzip codes');
      var bin = atob(code.slice(2));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    }
    if (code.indexOf('j:') === 0) {
      return decodeURIComponent(escape(atob(code.slice(2))));
    }
    // Assume raw JSON
    return code;
  }

  function openCloudSync() {
    var statusEl = document.getElementById('cloud-status');
    var linkEl = document.getElementById('cloud-link');
    var qrWrap = document.getElementById('cloud-qr-wrap');
    var qr = document.getElementById('cloud-qr');
    var copyBtn = document.getElementById('cloud-copy');
    var cloud = window.__CLOUD;
    if (!cloud || !cloud.enabled) {
      statusEl.className = 'cloud-status warn';
      statusEl.innerHTML = '⚠ <b>Off</b> — cloud sync isn’t configured. Set <code>cloudUrl</code> in config.js to enable it. Export / Import codes still work.';
      linkEl.textContent = '';
      qrWrap.style.display = 'none';
      copyBtn.style.display = 'none';
      showModal('cloud-screen');
      return;
    }
    var link = cloud.link();
    linkEl.textContent = link;
    var codeInput = document.getElementById('cloud-code');
    if (codeInput && document.activeElement !== codeInput) codeInput.value = cloud.uid;
    qr.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=' + encodeURIComponent(link);
    qrWrap.style.display = '';
    copyBtn.style.display = '';
    statusEl.className = 'cloud-status checking';
    statusEl.innerHTML = '<span class="cloud-dot">●</span> Checking the save worker…';
    showModal('cloud-screen');
    cloud.health().then(function (h) {
      if (h.writable) {
        statusEl.className = 'cloud-status ok';
        statusEl.innerHTML = '<span class="cloud-dot ok">●</span> <b>Syncing</b> — your save uploads after each turn and downloads on every device that opens this link.';
      } else if (h.reachable) {
        statusEl.className = 'cloud-status warn';
        statusEl.innerHTML = '<span class="cloud-dot warn">●</span> <b>Read-only right now</b> — the save worker is reachable but refusing writes (likely its free-tier daily limit). Your save isn’t uploading yet; use Export / Import meanwhile. Sync resumes automatically once writes recover.';
      } else {
        statusEl.className = 'cloud-status err';
        statusEl.innerHTML = '<span class="cloud-dot err">●</span> <b>Offline</b> — can’t reach the save worker. Check your connection; Export / Import still works.';
      }
    });
  }

  function copyCloudLink() {
    if (!window.__CLOUD || !window.__CLOUD.enabled) return;
    var link = window.__CLOUD.link();
    copyTextToClipboard(link).then(function (ok) {
      showToast(ok ? 'Sync link copied' : 'Couldn’t copy — long-press the link to copy', ok ? 'success' : 'error');
    });
  }

  // Switch this device to a chosen sync code, then reconcile with the cloud
  // (pull that code's save if newer, push the local save up) — last-write-wins.
  function applyCloudCode(raw) {
    if (!window.__CLOUD || !window.__CLOUD.enabled) return;
    var newId = window.__CLOUD.setUid(raw);
    if (!newId) { showToast('Enter a code (letters / numbers)', 'error'); return; }
    window.__CLOUD.pull().then(function (remote) {
      return remote ? mergeRemoteSave(remote) : false;
    }).then(function () {
      scheduleCloudPush();
      setupTitleButtons();
      openCloudSync();
      showToast('Sync code set: ' + newId, 'success');
    });
  }
  function setCloudCode() {
    var input = document.getElementById('cloud-code');
    applyCloudCode(input ? input.value : '');
  }

  // ---- On-screen code keyboard (neural band: swipe = move, pinch = press) ----
  // The glasses have no text keyboard, so the sync code is entered on a character
  // grid driven entirely by arrows + Enter (and tap/click on phone/PC).
  var KB_COLS = 9;
  var KB_KEYS = (function () {
    var keys = [];
    'abcdefghijklmnopqrstuvwxyz0123456789'.split('').forEach(function (ch) { keys.push({ type: 'char', ch: ch, label: ch }); });
    keys.push({ type: 'del', label: '⌫' });
    keys.push({ type: 'set', label: '✓ Set' });
    keys.push({ type: 'cancel', label: '✕' });
    return keys;
  })();
  var cloudKb = { idx: 0, code: '' };
  function openCloudKeyboard() {
    if (!window.__CLOUD || !window.__CLOUD.enabled) { showToast('Cloud sync is off', 'error'); return; }
    cloudKb = { idx: 0, code: '' };
    renderCloudKb();
    showModal('cloud-keyboard');
  }
  function renderCloudKb() {
    var grid = document.getElementById('kb-grid');
    if (!grid) return;
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = 'repeat(' + KB_COLS + ', 1fr)';
    KB_KEYS.forEach(function (key, ix) {
      var b = document.createElement('button');
      b.className = 'kb-key' + (key.type !== 'char' ? ' kb-special kb-' + key.type : '');
      b.textContent = key.label;
      b.addEventListener('click', function () { cloudKb.idx = ix; pressCloudKb(); });
      grid.appendChild(b);
    });
    renderCloudKbHighlight();
  }
  function renderCloudKbHighlight() {
    var disp = document.getElementById('kb-display');
    if (disp) disp.textContent = cloudKb.code ? cloudKb.code + '▏' : 'type your code…';
    var grid = document.getElementById('kb-grid');
    if (!grid) return;
    var keys = grid.querySelectorAll('.kb-key');
    for (var i = 0; i < keys.length; i++) keys[i].classList.toggle('kb-focused', i === cloudKb.idx);
  }
  function moveCloudKb(k) {
    var n = KB_KEYS.length, i = cloudKb.idx;
    if (k === 'ArrowLeft') i = (i - 1 + n) % n;
    else if (k === 'ArrowRight') i = (i + 1) % n;
    else if (k === 'ArrowUp') i = Math.max(0, i - KB_COLS);
    else if (k === 'ArrowDown') i = Math.min(n - 1, i + KB_COLS);
    cloudKb.idx = i;
    renderCloudKbHighlight();
  }
  function pressCloudKb() {
    var key = KB_KEYS[cloudKb.idx];
    if (!key) return;
    if (key.type === 'char') { if (cloudKb.code.length < 40) cloudKb.code += key.ch; }
    else if (key.type === 'del') { cloudKb.code = cloudKb.code.slice(0, -1); }
    else if (key.type === 'cancel') { closeModal(); openCloudSync(); return; }
    else if (key.type === 'set') {
      if (!cloudKb.code) { showToast('Enter a code first', 'error'); return; }
      var code = cloudKb.code;
      closeModal();
      applyCloudCode(code);   // reopens Cloud Sync with the new code
      return;
    }
    if (typeof sfxSelect === 'function') sfxSelect();
    renderCloudKbHighlight();
  }

  async function openShareExport() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { showToast('No save to export', 'error'); return; }
    shareMode = 'export';
    document.getElementById('share-title').textContent = 'Export Save';
    document.getElementById('share-hint').innerHTML =
      'Copy this code and paste it into <b>Import Save</b> on another device. The code holds your whole game.';
    var ta = document.getElementById('share-code');
    ta.readOnly = true;
    ta.value = 'Encoding…';
    document.getElementById('share-primary').textContent = 'Copy';
    document.getElementById('share-secondary').textContent = 'Done';
    showModal('share-screen');
    try {
      ta.value = await encodeSavePayload(raw);
    } catch (e) {
      ta.value = '(error encoding save)';
    }
  }

  function openShareImport() {
    shareMode = 'import';
    document.getElementById('share-title').textContent = 'Import Save';
    document.getElementById('share-hint').innerHTML =
      'Paste a code from <b>Export Save</b> on another device, then tap <b>Load</b>. This overwrites your current save.';
    var ta = document.getElementById('share-code');
    ta.readOnly = false;
    ta.value = '';
    document.getElementById('share-primary').textContent = 'Load';
    document.getElementById('share-secondary').textContent = 'Paste';
    showModal('share-screen');
  }

  function shareModalPrimary() {
    var ta = document.getElementById('share-code');
    if (shareMode === 'export') {
      // Copy code to clipboard
      copyTextToClipboard(ta.value).then(function (ok) {
        if (ok) showToast('Save code copied to clipboard', 'success');
        else showToast('Couldn’t copy — select and copy manually', 'error');
        // Re-focus the textarea so the user can ⌘C/Ctrl+C themselves if needed
        ta.focus(); ta.select();
      });
    } else {
      // Load pasted code
      loadFromShareCode(ta.value);
    }
  }

  function shareModalSecondary() {
    var ta = document.getElementById('share-code');
    if (shareMode === 'export') {
      // Done — close
      closeModal();
      setupTitleButtons();
    } else {
      // Paste from clipboard (or focus textarea for manual paste)
      readTextFromClipboard().then(function (text) {
        if (text) {
          ta.value = text.trim();
          showToast('Pasted from clipboard');
        } else {
          ta.focus();
          showToast('Paste manually into the box', 'error');
        }
      });
    }
  }

  async function loadFromShareCode(code) {
    try {
      var raw = await decodeSavePayload(code);
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.civs || !parsed.map) throw new Error('Save data missing civs/map');
      localStorage.setItem(STORAGE_KEY, raw);
      sfxAlly();
      showToast('Save imported — Continue on title to load', 'success');
      closeModal();
      setupTitleButtons();   // refreshes the Continue button enabled state
    } catch (e) {
      showToast('Invalid save code: ' + e.message, 'error');
    }
  }

  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    // Legacy fallback for older browsers — works because we already have the
    // textarea on screen.
    try {
      var ta = document.getElementById('share-code');
      ta.select();
      var ok = document.execCommand('copy');
      return Promise.resolve(!!ok);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function readTextFromClipboard() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return navigator.clipboard.readText().then(function (t) { return t; }, function () { return null; });
    }
    return Promise.resolve(null);
  }

  // =====================================================================
  // DRAW
  // =====================================================================
  function draw() {
    if (!state) return;
    drawMap();
    drawMinimap();
    updateHud();
  }

  // World-overview minimap — small persistent panel in the upper-right corner.
  // Shows the whole revealed map at a glance with terrain tints, ownership,
  // cities (squares), player units (small dots), and the current viewport rect.
  function drawMinimap() {
    var mm = document.getElementById('minimap');
    if (!mm) return;
    var mctx = mm.getContext('2d');
    var W = mm.width, H = mm.height;
    mctx.fillStyle = 'rgba(6,8,14,1)';
    mctx.fillRect(0, 0, W, H);

    var pad = 3;
    // Hex cells are taller-than-wide visually; reserve space for the row offset
    var ts = Math.min((W - pad * 2) / (MAP_W + 0.5), (H - pad * 2) / (MAP_H * 0.85 + 0.15));
    var offX = (W - ts * (MAP_W + 0.5)) / 2;
    var offY = (H - ts * (MAP_H * 0.85 + 0.15)) / 2;
    var hexH = ts * 0.85;

    // Tile pass
    for (var r = 0; r < MAP_H; r++) {
      for (var c = 0; c < MAP_W; c++) {
        var t = state.map[r][c];
        var rowOffset = (r & 1) ? ts * 0.5 : 0;
        var x = offX + c * ts + rowOffset;
        var y = offY + r * hexH;
        if (!t.explored.player) {
          mctx.fillStyle = '#070a14';
        } else {
          mctx.fillStyle = (TERRAIN[t.terrain] && TERRAIN[t.terrain].color) || '#222';
        }
        mctx.fillRect(x, y, ts + 0.5, hexH + 0.5);
        // Owner tint (only on explored)
        if (t.explored.player && t.owner && CIVS[t.owner]) {
          var rgb = hexToRgb(CIVS[t.owner].color);
          mctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.35)';
          mctx.fillRect(x, y, ts + 0.5, hexH + 0.5);
        }
        // City marker — small filled square in civ color
        if (t.explored.player && t.city) {
          mctx.fillStyle = (CIVS[t.city.civ] && CIVS[t.city.civ].color) || '#fff';
          var cs = Math.max(2, ts * 0.7);
          mctx.fillRect(x + ts/2 - cs/2, y + hexH/2 - cs/2, cs, cs);
        }
      }
    }
    // Player units as tiny dots
    state.civs.player.units.forEach(function (u) {
      var x = offX + u.c * ts + ((u.r & 1) ? ts * 0.5 : 0);
      var y = offY + u.r * hexH;
      mctx.fillStyle = CIVS.player.color;
      var ds = Math.max(1, ts * 0.4);
      mctx.fillRect(x + ts/2 - ds/2, y + hexH/2 - ds/2, ds, ds);
    });

    // Current viewport rectangle (world coords → mini-map coords)
    var size = ZOOM_LEVELS[state.zoom];
    var hexWorldW = size * SQRT3;
    var hexWorldH = size * 1.5;
    var vc0 = state.camera.x / hexWorldW;
    var vc1 = (state.camera.x + VIEW_W) / hexWorldW;
    var vr0 = state.camera.y / hexWorldH;
    var vr1 = (state.camera.y + VIEW_H) / hexWorldH;
    // Clamp into map range so the box stays inside the minimap frame
    vc0 = Math.max(0, Math.min(MAP_W, vc0));
    vc1 = Math.max(0, Math.min(MAP_W, vc1));
    vr0 = Math.max(0, Math.min(MAP_H, vr0));
    vr1 = Math.max(0, Math.min(MAP_H, vr1));
    var rx0 = offX + vc0 * ts;
    var ry0 = offY + vr0 * hexH;
    var rx1 = offX + vc1 * ts;
    var ry1 = offY + vr1 * hexH;
    mctx.strokeStyle = 'rgba(0,212,255,0.9)';
    mctx.lineWidth = 1;
    mctx.strokeRect(rx0 + 0.5, ry0 + 0.5, Math.max(2, rx1 - rx0), Math.max(2, ry1 - ry0));
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
        newGame(selectedSeed, fac);
        selectedSeed = null;             // one-shot: next new game is random unless re-set
        showScreen('game');
        if (audioPrefs.music) startMusic();
        break;
      case 'start-daily':
        startDaily();
        break;
      case 'set-seed':
        (function () {
          var inp = document.getElementById('seed-input');
          var raw = inp ? inp.value : '';
          selectedSeed = raw && raw.trim() ? codeToSeed(raw) : null;
          renderCivCards();
          var cur = document.getElementById('seed-current');
          if (cur) cur.textContent = selectedSeed ? seedToCode(selectedSeed) : 'random';
        })();
        break;
      case 'pick-mapsize':
        selectedMapSize = el.dataset.mapsize;
        renderCivCards();
        // Re-render rebuilds the DOM, which drops focus — put it back on the
        // control just changed so D-pad / neural-band users keep their place
        // and can keep nudging the selection.
        refocusSetup('pick-mapsize', 'mapsize', selectedMapSize);
        break;
      case 'pick-difficulty':
        selectedDifficulty = el.dataset.difficulty;
        renderCivCards();
        refocusSetup('pick-difficulty', 'difficulty', selectedDifficulty);
        break;
      case 'new-game':
        clearSave();
        newGame();
        showScreen('game');
        if (audioPrefs.music) startMusic();
        break;
      case 'continue-game':
        continueGame();
        break;
      case 'cloud-sync':
        openCloudSync();
        break;
      case 'cloud-copy':
        copyCloudLink();
        break;
      case 'cloud-setcode':
        setCloudCode();
        break;
      case 'cloud-keyboard-open':
        openCloudKeyboard();
        break;
      case 'cloud-push':
        cloudPushNow().then(function (ok) {
          showToast(ok ? 'Uploaded this game to the cloud ✓' : 'Upload failed — try again', ok ? 'success' : 'error');
          openCloudSync();
        });
        break;
      case 'cloud-pull':
        cloudPullNow().then(function (ok) {
          if (ok) { setupTitleButtons(); showToast('Downloaded cloud game ✓ — tap Continue to play it', 'success'); }
          else showToast('No cloud game found for this code', 'error');
          openCloudSync();
        });
        break;
      case 'show-help':
        showScreen('help-screen');
        break;
      case 'share-export':
        openShareExport();
        break;
      case 'share-import':
        openShareImport();
        break;
      case 'share-primary':
        shareModalPrimary();
        break;
      case 'share-secondary':
        shareModalSecondary();
        break;
      case 'toggle-sfx':
        setSfxEnabled(!audioPrefs.sfx);
        updateAudioToggles();
        if (audioPrefs.sfx) sfxSelect();   // feedback chirp on enable
        break;
      case 'toggle-music':
        setMusicEnabled(!audioPrefs.music);
        updateAudioToggles();
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
      case 'open-menu':
        // Phone/PC affordance for the global menu (diplomacy, research, options,
        // end turn). On glasses the same menu opens with ⏎ on open land.
        if (openModal || state.victory) break;
        openActionMenu();
        break;
      case 'open-era':
        if (openModal || state.victory) break;
        openEra();
        break;
      case 'open-chronicle':
        openChronicle();
        break;
      case 'open-standings':
        if (openModal || state.victory) break;
        openStandings();
        break;
      case 'end-turn':
        if (openModal || state.victory) break;
        endTurn();
        break;
      case 'toggle-mode':
        if (openModal || !state || state.victory) break;
        toggleMode();
        updateHud(); draw();
        break;
      case 'cycle-zoom':
        if (openModal || !state || state.victory) break;
        cycleZoom();
        updateHud(); draw();
        break;
    }
  });

  // =====================================================================
  // GAMEPAD (Bluetooth / USB controller)
  // =====================================================================
  // Translates a Standard-mapping gamepad into the SAME synthetic key events
  // the keyboard handler already processes, so every existing rule — combo
  // detection, modal focus, busy-locking, victory checks — applies to the
  // controller unchanged. Runs alongside touch, mouse, keyboard, and the
  // Neural Band; no other input method is disabled.
  var gpActive = false;            // is the poll loop running?
  var gpPrev = {};                 // control id -> was-pressed last frame
  var gpRepeatAt = {};             // direction id -> next auto-repeat time (ms)
  var GP_DEADZONE = 0.5;           // analog-stick threshold to count as a press
  var GP_REPEAT_DELAY = 380;       // ms a direction is held before it repeats
  var GP_REPEAT_RATE = 110;        // ms between repeats while still held

  // Standard-mapping button index -> the key its press emits. The d-pad and
  // left stick are handled separately (they auto-repeat); these fire once per
  // press, mirroring a single keystroke.
  var GP_BUTTON_KEYS = {
    0: 'Enter',    // A — confirm / act on the tile under the cursor
    1: 'Escape',   // B — cancel selection / close menu / cycle to next unit
    2: 'm',        // X — toggle cursor <-> scroll mode
    3: 't',        // Y — open the research menu
    4: 'z',        // LB — cycle zoom (FAR / NORMAL / CLOSE)
    5: 'z',        // RB — cycle zoom
    8: 'Escape',   // Back / View — cancel
    9: 'e'         // Start / Menu — end turn
  };

  function dispatchGamepadKey(key) {
    // Reuse the keyboard path verbatim — same code handles all five inputs.
    onKeyDown({ key: key, preventDefault: function () {} });
  }

  function gpButtonDown(gp, i) {
    var b = gp.buttons[i];
    if (!b) return false;
    return typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5;
  }

  // One directional "virtual button" per arrow, fed by the d-pad OR the left
  // stick. The dominant stick axis wins so a diagonal push never fires two
  // arrows at once (grid movement is one tile at a time).
  function gpDirections(gp) {
    var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    var horiz = Math.abs(ax) >= Math.abs(ay);
    return {
      ArrowUp:    gpButtonDown(gp, 12) || (!horiz && ay < -GP_DEADZONE),
      ArrowDown:  gpButtonDown(gp, 13) || (!horiz && ay >  GP_DEADZONE),
      ArrowLeft:  gpButtonDown(gp, 14) || ( horiz && ax < -GP_DEADZONE),
      ArrowRight: gpButtonDown(gp, 15) || ( horiz && ax >  GP_DEADZONE)
    };
  }

  function getActiveGamepad() {
    if (!navigator.getGamepads) return null;
    var pads = navigator.getGamepads();
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return pads[i];
    return null;
  }

  function pollGamepad() {
    if (!gpActive) return;
    var gp = getActiveGamepad();
    if (gp) {
      var now = Date.now();
      // Directions: fire on the initial press, then auto-repeat while held so
      // holding a direction walks the cursor / scrolls a menu, like a keyboard.
      var dirs = gpDirections(gp);
      for (var d in dirs) {
        if (dirs[d]) {
          if (!gpPrev[d]) { dispatchGamepadKey(d); gpRepeatAt[d] = now + GP_REPEAT_DELAY; }
          else if (now >= gpRepeatAt[d]) { dispatchGamepadKey(d); gpRepeatAt[d] = now + GP_REPEAT_RATE; }
        }
        gpPrev[d] = dirs[d];
      }
      // Action buttons: edge-triggered, one keystroke per press (no repeat).
      for (var idx in GP_BUTTON_KEYS) {
        var pressed = gpButtonDown(gp, +idx);
        var id = 'b' + idx;
        if (pressed && !gpPrev[id]) dispatchGamepadKey(GP_BUTTON_KEYS[idx]);
        gpPrev[id] = pressed;
      }
    }
    requestAnimationFrame(pollGamepad);
  }

  function startGamepadLoop() {
    if (gpActive) return;
    gpActive = true;
    requestAnimationFrame(pollGamepad);
  }

  function initGamepad() {
    if (!('getGamepads' in navigator)) return;   // unsupported browser — no-op
    window.addEventListener('gamepadconnected', function () {
      showToast('🎮 Controller connected');
      startGamepadLoop();
    });
    window.addEventListener('gamepaddisconnected', function () {
      // Stop polling only once the last pad is gone; reset edge/repeat state.
      if (!getActiveGamepad()) { gpActive = false; gpPrev = {}; gpRepeatAt = {}; }
    });
    // Some browsers don't emit "connected" for a pad paired before load until
    // its first input — start polling now if one is already visible.
    if (getActiveGamepad()) startGamepadLoop();
  }

  // =====================================================================
  // INIT
  // =====================================================================
  function init() {
    canvas = document.getElementById('map');
    ctx = canvas.getContext('2d');
    document.addEventListener('keydown', onKeyDown);
    // Touch / mouse input on the map canvas — tap or click a tile to act on
    // it, same as pressing Enter on that tile with the keyboard. Glasses input
    // routes through keydown above and is unaffected.
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // Fit the 600x600 app to whatever device viewport we're in. On glasses the
    // device viewport IS 600x600 so this is always 1.0.
    updateAppScale();
    window.addEventListener('resize', updateAppScale);
    initGamepad();            // Bluetooth / USB controller — translated to keys
    // Swallow the synthetic "ghost click" a touch tap fires ~300ms later: if a
    // click lands near a recent canvas tap, it's the ghost (it would otherwise
    // hit a menu row that opened under the finger) — eat it. Real menu taps are
    // at a different spot / later, so they pass through.
    document.addEventListener('click', function (e) {
      if (!lastTouchTap) return;
      var dt = Date.now() - lastTouchTap.t;
      var near = Math.abs(e.clientX - lastTouchTap.x) < 32 && Math.abs(e.clientY - lastTouchTap.y) < 32;
      lastTouchTap = null;
      if (dt < 800 && near) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    cloudInit();              // pull any newer cloud save before Continue
    // Cloud writes are decoupled from the (free, local) saves: a 5-min safety net
    // while playing, plus an immediate content-deduped flush when the tab is hidden
    // or unloaded — so a mobile browser hard-killing the tab still syncs, without
    // writing on every action (KV free tier is only 1,000 writes/day).
    setInterval(function () { cloudPush(false, false); }, 300000);
    document.addEventListener('visibilitychange', function () { if (document.hidden) { save(); cloudPush(true, false); } });
    window.addEventListener('pagehide', function () { save(); cloudPush(true, false); });
    setupTitleButtons();
    showScreen('title');
  }

  function updateAppScale() {
    var s = Math.min(window.innerWidth, window.innerHeight) / 600;
    document.documentElement.style.setProperty('--app-scale', s.toFixed(4));
  }

  // --- Touch / mouse map input -------------------------------------------
  // Tap a tile to act on it (same as ⏎ on that tile); drag one finger / the
  // mouse to pan the map; pinch with two fingers to zoom. Glasses input routes
  // through keydown and is unaffected.
  var ptrs = {};                  // active pointerId -> { x, y } in CSS px
  var panState = null;            // { camX, camY, sx, sy, moved }
  var pinchState = null;          // { dist, zoom }
  var TAP_SLOP = 9;               // movement under this (CSS px) still counts as a tap
  var lastTouchTap = null;        // { x, y, t } — to swallow the synthetic "ghost click"

  function ptrList() { return Object.keys(ptrs).map(function (k) { return ptrs[k]; }); }
  function ptrDist(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
  function toCanvas(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
      sc: canvas.width / rect.width
    };
  }
  function inputBlocked() { return !state || state.victory || !isGameVisible() || isModalOpen() || isBusy(); }

  function onPointerDown(e) {
    if (inputBlocked()) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    var n = ptrList().length;
    if (n === 1) {
      panState = { camX: state.camera.x, camY: state.camera.y, sx: e.clientX, sy: e.clientY, moved: false };
      pinchState = null;
    } else if (n === 2) {
      var p = ptrList();
      pinchState = { dist: ptrDist(p[0], p[1]), zoom: state.zoom };
      panState = null;            // a second finger cancels the pan/tap
    }
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var p = ptrList();
    if (pinchState && p.length >= 2) {
      var d = ptrDist(p[0], p[1]);
      var ratio = d / pinchState.dist;
      var target = pinchState.zoom;
      if (ratio >= 1.30) target = Math.min(ZOOM_LEVELS.length - 1, pinchState.zoom + 1);
      else if (ratio <= 0.77) target = Math.max(0, pinchState.zoom - 1);
      if (target !== state.zoom) {
        var mid = toCanvas((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        zoomAtScreen(target, mid.x, mid.y);
        pinchState = { dist: d, zoom: target };   // ratchet to the next notch
        updateHud(); draw();
      }
    } else if (panState) {
      var dx = e.clientX - panState.sx, dy = e.clientY - panState.sy;
      if (!panState.moved && (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP)) panState.moved = true;
      if (panState.moved) {
        var sc = toCanvas(0, 0).sc;
        state.camera.x = panState.camX - dx * sc;
        state.camera.y = panState.camY - dy * sc;
        clampCamera();
        draw();
      }
    }
    e.preventDefault();
  }

  function onPointerUp(e) {
    var wasPan = panState;
    delete ptrs[e.pointerId];
    if (ptrList().length < 2) pinchState = null;
    if (ptrList().length === 0) {
      if (wasPan && !wasPan.moved && !inputBlocked()) {
        // A touch tap that opens a menu would otherwise get a synthetic "ghost
        // click" ~300ms later at the same spot, landing on whichever menu row
        // is now there (e.g. Show Yields). Remember the tap so we can swallow it.
        if (e.pointerType === 'touch') lastTouchTap = { x: e.clientX, y: e.clientY, t: Date.now() };
        tapTile(e.clientX, e.clientY);
      }
      panState = null;
    }
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  // Mouse-wheel zoom (PC): scroll up to zoom in, toward the cursor.
  function onWheel(e) {
    if (inputBlocked()) return;
    e.preventDefault();
    var dir = e.deltaY < 0 ? 1 : -1;
    var target = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, state.zoom + dir));
    if (target === state.zoom) return;
    var pc = toCanvas(e.clientX, e.clientY);
    zoomAtScreen(target, pc.x, pc.y);
    updateHud();
    draw();
  }

  // Change zoom while keeping the tile under (screen-space) sx,sy fixed.
  function zoomAtScreen(newZoom, sx, sy) {
    var oldSize = ZOOM_LEVELS[state.zoom];
    var wx = sx + state.camera.x - oldSize * SQRT3 / 2;
    var wy = sy + state.camera.y - oldSize;
    var hex = pixelToHex(wx, wy, oldSize);
    state.zoom = newZoom;
    var ns = ZOOM_LEVELS[newZoom];
    var np = pixelOf(hex[0], hex[1], ns);
    state.camera.x = np.x + ns * SQRT3 / 2 - sx;
    state.camera.y = np.y + ns - sy;
    clampCamera();
  }

  function tapTile(clientX, clientY) {
    var pc = toCanvas(clientX, clientY);
    var size = ZOOM_LEVELS[state.zoom];
    // drawMap places each hex centre at (pixelOf - camera + size*√3/2, +size),
    // so back the half-hex offset out before converting to a hex.
    var wx = pc.x + state.camera.x - size * SQRT3 / 2;
    var wy = pc.y + state.camera.y - size;
    var hex = pixelToHex(wx, wy, size);
    var c = hex[0], r = hex[1];
    if (!inBounds(c, r)) return;
    state.cursor.c = c;
    state.cursor.r = r;
    ensureCursorVisible();
    activate();
    draw();
  }

  // Test/debug hook — read-only access to internal state + the yield/effect
  // helpers, so headless verification can compute deltas on a single city
  // without UI navigation. Has no effect on gameplay.
  window.__mc = {
    get state() { return state; },
    workableYields: workableYields,
    cityScience: cityScience,
    cityCulturePerTurn: cityCulturePerTurn,
    atkTechBonus: atkTechBonus,
    availableProducibles: availableProducibles,
    openCity: openCity,
    draw: draw,
    updateHud: updateHud,
    setGovernment: setGovernment,
    aiPickGovernment: aiPickGovernment,
    recomputeIncome: recomputeIncome,
    DIFFICULTIES: DIFFICULTIES,
    diffOf: diffOf,
    aiEcoMult: aiEcoMult,
    activeGovernment: activeGovernment,
    openGovernment: openGovernment,
    accrueEraPoints: accrueEraPoints,
    triggerGoldenAge: triggerGoldenAge,
    pickGreatPerson: pickGreatPerson,
    merchantAllyCityState: merchantAllyCityState,
    activateGreatPersonAI: activateGreatPersonAI,
    openEra: openEra,
    goldenAgeThreshold: goldenAgeThreshold,
    leaderOf: leaderOf,
    remember: remember,
    updateTensions: updateTensions,
    tensionOf: tensionOf,
    openDiplomacy: openDiplomacy,
    AGENDAS: AGENDAS,
    cityUnrestDelta: cityUnrestDelta,
    cityRevolting: cityRevolting,
    revoltThreshold: revoltThreshold,
    processCity: processCity,
    setEdict: setEdict,
    aiPickEdict: aiPickEdict,
    activeEdict: activeEdict,
    edictEff: edictEff,
    openEdicts: openEdicts,
    DILEMMAS: DILEMMAS,
    presentDilemma: presentDilemma,
    maybeFireWorldEvent: maybeFireWorldEvent,
    maybeFireEraCrisis: maybeFireEraCrisis,
    leadScore: leadScore,
    ERA_CRISES: ERA_CRISES,
    chronicle: chronicle,
    openChronicle: openChronicle,
    CIVICS: CIVICS,
    CIVIC_ORDER: CIVIC_ORDER,
    CIVIC_DEPTH: CIVIC_DEPTH,
    civicSum: civicSum,
    civicsAdopted: civicsAdopted,
    civicsComplete: civicsComplete,
    canAdoptCivic: canAdoptCivic,
    progressCivic: progressCivic,
    progressTech: progressTech,
    pickAiCivic: pickAiCivic,
    enqueueCivicWithPrereqs: enqueueCivicWithPrereqs,
    openCivics: openCivics,
    openStandings: openStandings,
    civCulturePerTurn: civCulturePerTurn,
    cityCulturePerTurn: cityCulturePerTurn,
    distinctLuxuries: distinctLuxuries,
    luxurySet: luxurySet,
    luxurySwapDeal: luxurySwapDeal,
    playerSwapLuxuries: playerSwapLuxuries,
    seedToCode: seedToCode,
    codeToSeed: codeToSeed,
    seedFromString: seedFromString,
    generateMap: generateMap,
    pickStart: pickStart,
    MAP_SIZES: MAP_SIZES,
    _setSize: function (k) { var m = MAP_SIZES[k] || MAP_SIZES.normal; MAP_W = m.w; MAP_H = m.h; },
    mapWH: function () { return [MAP_W, MAP_H]; },
    newGame: newGame,
    startDaily: startDaily,
    dailyKeyForToday: dailyKeyForToday,
    loadDailyRec: loadDailyRec,
    recordDailyWin: recordDailyWin,
    queueYieldFx: queueYieldFx,
    flushYieldFx: flushYieldFx,
    goldenAgeFlash: goldenAgeFlash,
    fxActive: function () { return combatFx.length; },
    yieldFxPending: function () { return yieldFxQueue.length; },
    computeTurnBrief: computeTurnBrief,
    openTurnBrief: openTurnBrief,
    foundCity: foundCity,
    endTurn: endTurn,
    checkPromotion: checkPromotion,
    promotionOptions: promotionOptions,
    applyPromotion: applyPromotion,
    aiPickPromotion: aiPickPromotion,
    presentPromotion: presentPromotion,
    findPendingPromoUnit: findPendingPromoUnit,
    combatRatio: combatRatio,
    moveUnit: moveUnit,
    findUnitPath: findUnitPath,
    playerAutoMove: playerAutoMove,
    spawnUnit: spawnUnit,
    establishTradeRoute: establishTradeRoute,
    eligibleTradeCity: eligibleTradeCity,
    tradeRouteGold: tradeRouteGold,
    updateTradeRoutes: updateTradeRoutes,
    maxTradeRoutes: maxTradeRoutes,
    neighbors: neighbors,
    PROMOTIONS: PROMOTIONS,
    factionEff: factionEff,
    factionUnitFor: factionUnitFor,
    FACTIONS: FACTIONS,
    presentCrisisDilemma: presentCrisisDilemma,
    runawayLeader: runawayLeader,
    formCoalition: formCoalition,
    coalitionCost: coalitionCost,
    hasPact: hasPact,
    playerProposeDefensivePact: playerProposeDefensivePact,
    buyableTechFrom: buyableTechFrom,
    playerBuyTech: playerBuyTech,
    declareWarOn: declareWarOn,
    victoryProgress: victoryProgress,
    closestVictoryAll: closestVictoryAll,
    checkVictoryRaceAlerts: checkVictoryRaceAlerts,
    openCloudKeyboard: openCloudKeyboard,
    cloudKbState: function () { return { idx: cloudKb.idx, code: cloudKb.code }; },
    KB_KEYS: KB_KEYS,
    BUILDINGS: BUILDINGS,
    UNITS: UNITS,
    TECHS: TECHS,
    getAge: getAge,
    TECH_ORDER: TECH_ORDER,
    AGES: AGES,
    SPACE_PARTS_NEEDED: SPACE_PARTS_NEEDED,
    nukeStrike: nukeStrike,
    canEnterTile: canEnterTile,
    unitClassOf: unitClassOf,
    IDEOLOGIES: IDEOLOGIES,
    IDEOLOGY_ORDER: IDEOLOGY_ORDER,
    ideologyEff: ideologyEff,
    ideologyUnlocked: ideologyUnlocked,
    setIdeology: setIdeology,
    openIdeology: openIdeology,
    nationalAvailable: nationalAvailable,
    foundReligion: foundReligion,
    canFoundReligion: canFoundReligion,
    spreadReligion: spreadReligion,
    religionFollowerCount: religionFollowerCount,
    faithPerTurn: faithPerTurn,
    religionCityEff: religionCityEff,
    checkReligionVictory: checkReligionVictory,
    totalCityCount: totalCityCount,
    openReligion: openReligion,
    RELIGION_FOUND_COST: RELIGION_FOUND_COST,
    RELIGION_POOL: RELIGION_POOL,
    BELIEFS: BELIEFS,
    BELIEF_ORDER: BELIEF_ORDER,
    beliefsOf: beliefsOf,
    founderYield: founderYield,
    religionSpread: religionSpread,
    PANTHEONS: PANTHEONS,
    PANTHEON_ORDER: PANTHEON_ORDER,
    PANTHEON_COST: PANTHEON_COST,
    pantheonEff: pantheonEff,
    pantheonDef: pantheonDef,
    canFoundPantheon: canFoundPantheon,
    foundPantheon: foundPantheon,
    aiPickPantheon: aiPickPantheon,
    REFORMATION_FOLLOWERS: REFORMATION_FOLLOWERS,
    canReform: canReform,
    reformReligion: reformReligion,
    aiReform: aiReform,
    civMajorityReligion: civMajorityReligion,
    SPY_MISSIONS: SPY_MISSIONS,
    spySlots: spySlots,
    spyOdds: spyOdds,
    assignSpy: assignSpy,
    processSpyOps: processSpyOps,
    aiRunEspionage: aiRunEspionage,
    civHasCounterintel: civHasCounterintel,
    stealableTech: stealableTech,
    openEspionage: openEspionage,
    VASSAL_TRIBUTE: VASSAL_TRIBUTE,
    isVassal: isVassal,
    vassalsOf: vassalsOf,
    makeVassal: makeVassal,
    releaseVassal: releaseVassal,
    checkDominationByVassalage: checkDominationByVassalage,
    showPeaceOffer: showPeaceOffer,
    digSiteAt: digSiteAt,
    addDigSite: addDigSite,
    excavate: excavate,
    ERA_QUESTS: ERA_QUESTS,
    checkEraQuests: checkEraQuests,
    CLAN_HIRE_COST: CLAN_HIRE_COST,
    CLAN_BRIBE_COST: CLAN_BRIBE_COST,
    clansAvailable: clansAvailable,
    hireRaider: hireRaider,
    bribeClans: bribeClans,
    findNearestOf: findNearestOf,
    openClans: openClans,
    MISSIONARY_FAITH_COST: MISSIONARY_FAITH_COST,
    INQUISITOR_FAITH_COST: INQUISITOR_FAITH_COST,
    MISSIONARY_CHARGES: MISSIONARY_CHARGES,
    faithUnitCost: faithUnitCost,
    canBuyFaithUnit: canBuyFaithUnit,
    buyFaithUnit: buyFaithUnit,
    cityOnOrAdjacent: cityOnOrAdjacent,
    missionarySpread: missionarySpread,
    inquisitorPurge: inquisitorPurge,
    prophetCanFound: prophetCanFound,
    prophetSpread: prophetSpread,
    aiReligiousSpread: aiReligiousSpread,
    checkGreatPeople: checkGreatPeople,
    spawnGreatPerson: spawnGreatPerson,
    activateGreatPerson: activateGreatPerson
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
