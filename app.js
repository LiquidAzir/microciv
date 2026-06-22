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
  var DIFFICULTIES = {
    chieftain: { label: 'Chieftain', desc: 'Very forgiving — passive AI', aiAtkBonus: -2, aiAggroTurn: 30, aiExtraWarrior: false },
    easy:      { label: 'Easy',      desc: 'Relaxed AI, late aggression', aiAtkBonus: -1, aiAggroTurn: 20, aiExtraWarrior: false },
    normal:    { label: 'Normal',    desc: 'Balanced challenge',          aiAtkBonus: 0,  aiAggroTurn: 10, aiExtraWarrior: false },
    hard:      { label: 'Hard',      desc: 'Aggressive AI, tough fights',  aiAtkBonus: 1,  aiAggroTurn: 8,  aiExtraWarrior: true },
    brutal:    { label: 'Brutal',    desc: 'Relentless — early rushes',    aiAtkBonus: 2,  aiAggroTurn: 5,  aiExtraWarrior: true }
  };
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
    grass:    { name: 'Grass',    food: 2, prod: 0, gold: 0, color: '#1a5c2e', edge: '#2e8a48', glyph: '',  fg: '#5cb070' },
    plains:   { name: 'Plains',   food: 1, prod: 1, gold: 0, color: '#5c4a18', edge: '#b89840', glyph: '',  fg: '#d4b878' },
    forest:   { name: 'Forest',   food: 1, prod: 2, gold: 0, color: '#0e2a14', edge: '#1c4a28', glyph: '♣', fg: '#4ca860' },
    hills:    { name: 'Hills',    food: 1, prod: 2, gold: 0, defBonus: 0.5, color: '#3a2a10', edge: '#8a6830', glyph: '▴', fg: '#d4a060' },
    mountain: { name: 'Mountain', food: 0, prod: 0, gold: 0, impassable: true, color: '#282434', edge: '#605078', glyph: '▲', fg: '#c2a8d0' },
    desert:   { name: 'Desert',   food: 0, prod: 1, gold: 1, color: '#7a6418', edge: '#d4a850', glyph: '·', fg: '#e8c878' },
    tundra:   { name: 'Tundra',   food: 0, prod: 1, gold: 0, color: '#2a3840', edge: '#6882a0', glyph: '',  fg: '#b8d4dc' },
    water:    { name: 'Sea',      food: 1, prod: 0, gold: 1, impassable: true, color: '#081e3c', edge: '#1a4880', glyph: '~', fg: '#5a92d0' },
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
    settler:   { name: 'Settler',   cost: 30, hp: 8,  atk: 0, def: 1, move: 2, glyph: '☗', tech: null,          civilian: true, canFound: true },
    worker:    { name: 'Worker',    cost: 20, hp: 8,  atk: 0, def: 1, move: 2, glyph: '⚒', tech: null,          civilian: true, canImprove: true },
    scout:     { name: 'Scout',     cost: 12, hp: 8,  atk: 0, def: 2, move: 3, glyph: '⚐', tech: null,          civilian: true, canExplore: true },
    warrior:   { name: 'Warrior',   cost: 15, hp: 14, atk: 4, def: 3, move: 2, glyph: '⚔', tech: null },
    archer:    { name: 'Archer',    cost: 25, hp: 10, atk: 5, def: 2, move: 2, glyph: '➹', tech: 'archery',     ranged: 2 },
    horseman:  { name: 'Horseman',  cost: 35, hp: 14, atk: 6, def: 3, move: 4, glyph: '♞', tech: 'husbandry' },
    swordsman: { name: 'Swordsman', cost: 45, hp: 18, atk: 8, def: 5, move: 2, glyph: '⚔', tech: 'steel' },
    catapult:  { name: 'Catapult',  cost: 40, hp: 8,  atk: 7, def: 1, move: 2, glyph: '⊕', tech: 'engineering', ranged: 2, siege: true },
    musketman: { name: 'Musketman', cost: 50, hp: 20, atk: 9, def: 4, move: 2, glyph: '⚡', tech: 'gunpowder',  ranged: 2 },
    galley:    { name: 'Galley',    cost: 30, hp: 14, atk: 5, def: 3, move: 3, glyph: '⛵', tech: 'sailing',     naval: true },
    raider:    { name: 'Raider',    cost: 0,  hp: 10, atk: 3, def: 2, move: 2, glyph: '⚔', tech: null,          barb: true },
    great_general:   { name: 'Great General',   cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '⚑', tech: null, civilian: true, great: true },
    great_scientist: { name: 'Great Scientist', cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '⚗', tech: null, civilian: true, great: true },
    great_engineer:  { name: 'Great Engineer',  cost: 0, hp: 4, atk: 0, def: 1, move: 2, glyph: '⚙', tech: null, civilian: true, great: true }
  };

  // Unit upgrade paths: type -> { to, tech, cost }
  var UPGRADES = {
    warrior:  { to: 'swordsman',  tech: 'steel',     cost: 30 },
    archer:   { to: 'musketman',  tech: 'gunpowder',  cost: 35 },
    horseman: { to: 'swordsman',  tech: 'steel',      cost: 25 }
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
    }
  };
  // Order = priority. First matching wins.
  var IMPROVEMENT_ORDER = ['fishing_boats', 'pasture', 'lumber', 'mine', 'quarry', 'farm'];

  function pickImprovement(t) {
    if (!t || t.improvement || t.city) return null;
    for (var i = 0; i < IMPROVEMENT_ORDER.length; i++) {
      var id = IMPROVEMENT_ORDER[i];
      if (IMPROVEMENTS[id].suitable(t)) return id;
    }
    return null;
  }

  var BUILDINGS = {
    granary:  { name: 'Granary',    cost: 30, food: 2, tech: 'pottery'  },
    library:  { name: 'Library',    cost: 30, sci:  2, tech: 'writing'  },
    walls:    { name: 'Walls',      cost: 40, def:  4, tech: 'masonry'  },
    market:   { name: 'Market',     cost: 50, gold: 3, tech: 'currency' },
    aqueduct: { name: 'Aqueduct',   cost: 45, food: 3, tech: 'engineering' },
    temple:   { name: 'Temple',     cost: 40, sci:  3, tech: 'theology' },
    university:{name: 'University', cost: 70, sci:  4, tech: 'education' },
    bank:     { name: 'Bank',       cost: 55, gold: 4, tech: 'banking' },
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
                        lore: '+1 attack on all your military units' }
  };

  var TECHS = {
    pottery:     { name: 'Pottery',      cost:  14, req: [],                          unlocks: 'Granary' },
    writing:     { name: 'Writing',      cost:  22, req: ['pottery'],                 unlocks: 'Library' },
    sailing:     { name: 'Sailing',      cost:  25, req: ['pottery'],                 unlocks: 'Galley, Fishing Boats' },
    archery:     { name: 'Archery',      cost:  25, req: [],                          unlocks: 'Archer' },
    masonry:     { name: 'Masonry',      cost:  30, req: ['pottery'],                 unlocks: 'Walls' },
    husbandry:   { name: 'Husbandry',    cost:  35, req: ['archery'],                 unlocks: 'Horseman' },
    currency:    { name: 'Currency',     cost:  45, req: ['masonry'],                 unlocks: 'Market' },
    iron:        { name: 'Metalworking', cost:  60, req: ['husbandry','currency'],    unlocks: '+2 atk Warriors' },
    engineering: { name: 'Engineering',  cost:  50, req: ['masonry','archery'],       unlocks: 'Catapult, Aqueduct' },
    theology:    { name: 'Theology',     cost:  60, req: ['currency','pottery'],      unlocks: 'Temple' },
    philosophy:  { name: 'Philosophy',   cost:  55, req: ['theology','writing'],      unlocks: '+1 sci per Temple' },
    education:   { name: 'Education',    cost:  80, req: ['theology','writing'],      unlocks: 'University' },
    steel:       { name: 'Steel',        cost:  80, req: ['iron'],                    unlocks: 'Swordsman' },
    gunpowder:   { name: 'Gunpowder',    cost: 100, req: ['steel','engineering'],     unlocks: 'Musketman' },
    banking:     { name: 'Banking',      cost:  90, req: ['theology','currency'],     unlocks: 'Bank' }
  };
  var TECH_ORDER = ['pottery','writing','sailing','archery','masonry','husbandry','currency','iron','engineering','theology','philosophy','education','steel','gunpowder','banking'];

  // Victory thresholds (used by culture + economic checks)
  var CULTURE_VICTORY_WONDERS = 4;     // own this many World Wonders → culture victory
  var ECONOMIC_VICTORY_GOLD   = 1500;  // hold this much gold...
  var ECONOMIC_VICTORY_TURNS  = 5;     // ...for this many consecutive turns → economic victory

  // Age thresholds — purely cosmetic + small gold bonus on advancement
  var AGES = [
    { name: 'Ancient',   minTechs: 0 },
    { name: 'Classical', minTechs: 4 },
    { name: 'Medieval',  minTechs: 8 },
    { name: 'Modern',    minTechs: 12 }
  ];
  function getAge(civ) {
    var count = 0;
    for (var i = 0; i < TECH_ORDER.length; i++) if (civ.techs[TECH_ORDER[i]]) count++;
    for (var a = AGES.length - 1; a >= 0; a--) {
      if (count >= AGES[a].minTechs) return AGES[a];
    }
    return AGES[0];
  }
  // Gold bonus on age advancement — Modern > Medieval > Classical > Ancient
  function ageAdvanceGold(age) {
    if (age.minTechs >= AGES[3].minTechs) return 60;
    if (age.minTechs >= AGES[2].minTechs) return 40;
    return 20;
  }

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
    },
    // --- New factions ---
    ferrum: {
      name: 'Ferrum',
      title: 'The Iron Legion',
      color: '#d9892b', edge: '#ffc06a',
      bonus: { prod: 1 },
      lean: 'warmonger',
      lore: '+1 production in every city. Their forges never cool between wars.'
    },
    vorne: {
      name: 'Vorne',
      title: 'The Bloodbound',
      color: '#d83a4a', edge: '#ff7a86',
      bonus: { atk: 1 },
      lean: 'aggressive',
      lore: '+1 attack on military units. A horde that lives to charge.'
    },
    myrr: {
      name: 'Myrr',
      title: 'The Tidewardens',
      color: '#2ad0c0', edge: '#7af0e4',
      bonus: { gold: 1 },
      lore: '+1 gold in every city. Masters of trade across the open seas.'
    }
  };
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
    barb:   { name: 'Raiders',    color: '#7a7888', edge: '#b8b6c4' },
    cs:     { name: 'City-State', color: '#ffd34d', edge: '#fff0a8' }
  };
  // Non-barbarian civilization side IDs. Loops over real civs iterate this.
  var CIV_SIDES = ['player', 'ai', 'ai2'];
  var AI_SIDES  = ['ai', 'ai2'];

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
  }
  function makePeace(a, b) {
    if (!state.diplomacy) return;
    state.diplomacy[dipKey(a, b)] = 'peace';
    var aName = CIVS[a] ? CIVS[a].name : a;
    var bName = CIVS[b] ? CIVS[b].name : b;
    if (a === 'player' || b === 'player') {
      showToast('Peace with ' + (a === 'player' ? bName : aName) + '!', 'success');
      logEvent('Peace treaty with ' + (a === 'player' ? bName : aName), 'success');
    }
  }
  function declareWarOn(a, b) {
    if (!state.diplomacy) return;
    state.diplomacy[dipKey(a, b)] = 'war';
    var aName = CIVS[a] ? CIVS[a].name : a;
    var bName = CIVS[b] ? CIVS[b].name : b;
    if (a === 'player' || b === 'player') {
      var enemy = a === 'player' ? bName : aName;
      showToast('War declared on ' + enemy + '!', 'error');
      logEvent('War with ' + enemy + '!', 'error');
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
    // Water tiles: only workers with Sailing tech
    if (tile.terrain === 'water') {
      return !!(udef.canImprove && state.civs[unit.civ].techs && state.civs[unit.civ].techs.sailing);
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
      visible: { player: false, ai: false, ai2: false },
      explored: { player: false, ai: false, ai2: false }
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
        // Per-terrain density: bias for richer biomes (slightly bumped to keep
        // resource scarcity from feeling thin on the larger maps)
        var density = {
          grass:   0.15, plains:  0.15, forest:  0.07,
          hills:   0.34, mountain:0.00, desert:  0.13,
          water:   0.12
        }[t.terrain] || 0;
        if (rnd() < density) {
          t.resource = candidates[Math.floor(rnd() * candidates.length)];
        }
      }
    }

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

  function pickStart(map, awayFrom) {
    // awayFrom can be a single [c,r] or an array of them
    var existing = [];
    if (awayFrom && awayFrom.length) {
      existing = (typeof awayFrom[0] === 'number') ? [awayFrom] : awayFrom;
    }
    // Scale minimum distance with map size
    var minDist = Math.max(4, Math.floor(Math.min(MAP_W, MAP_H) * 0.55));
    var fallbackDist = Math.max(3, minDist - 2);
    for (var tries = 0; tries < 600; tries++) {
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
      if (ok >= 4) return [c, r];
      if (tries > 300) minDist = fallbackDist;
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
    // Shuffle so AI faction assignment is randomized
    others.sort(function () { return Math.random() - 0.5; });
    var aiFaction  = others[0];
    var ai2Faction = others[1];

    // Apply map size
    var mSize = MAP_SIZES[selectedMapSize] || MAP_SIZES.normal;
    MAP_W = mSize.w;
    MAP_H = mSize.h;

    applyFaction('player', playerFaction);
    applyFaction('ai',  aiFaction);
    applyFaction('ai2', ai2Faction);

    var map = generateMap(seed);

    state = {
      seed: seed,
      turn: 1,
      currentCiv: 'player',
      map: map,
      mapW: MAP_W,
      mapH: MAP_H,
      difficulty: selectedDifficulty,
      civs: {
        player: makeCiv('player', playerFaction),
        ai:     makeCiv('ai',  aiFaction),
        ai2:    makeCiv('ai2', ai2Faction),
        barb:   makeBarbCiv(),
        cs:     makeCsCiv()
      },
      cursor: { c: 0, r: 0 },
      camera: { x: 0, y: 0 },           // world pixel offset of top-left of view
      zoom: DEFAULT_ZOOM,
      mode: 'cursor',                    // 'cursor' | 'scroll'
      selected: null,                    // { c, r } of selected friendly unit
      victory: null,                     // 'player' | 'ai' | null
      log: [],
      turnLog: [],
      wondersBuilt: {},                  // wonder id -> civ id who built it
      stats: { unitsKilled: 0, unitsLost: 0 },
      diplomacy: {
        ai_player: 'war',
        ai2_player: 'war',
        ai_ai2: 'war',
        ai_cs:     'peace',   // dipKey sorts alphabetically: ai < cs < player
        ai2_cs:    'peace',
        cs_player: 'peace'
      },
      pendingPeace: null,                // { from: civId } when AI offers peace
      freetech: false                     // great scientist free tech pick
    };

    var p  = pickStart(map);
    var a  = pickStart(map, [p]);
    var a2 = pickStart(map, [p, a]);

    state.cursor.c = p[0]; state.cursor.r = p[1];

    spawnStarter('player', p);
    spawnStarter('ai',  a);
    spawnStarter('ai2', a2);

    state.civs.player.currentTech = 'pottery';
    state.civs.ai.currentTech     = 'archery';
    state.civs.ai2.currentTech    = 'pottery';
    // Assign a personality per AI. A faction with a `lean` forces that
    // personality (e.g. Ferrum is always a warmonger); factions without one
    // draw distinct random personalities so the two AIs still feel different.
    var bag = PERSONALITY_ORDER.slice();
    bag.sort(function () { return Math.random() - 0.5; });
    function assignPersonality(sideId) {
      var fac = FACTIONS[state.civs[sideId].faction];
      if (fac && fac.lean && AI_PERSONALITIES[fac.lean]) return fac.lean;
      return bag.shift() || 'aggressive';
    }
    state.civs.ai.personality  = assignPersonality('ai');
    state.civs.ai2.personality = assignPersonality('ai2');

    // City-states scale with map size — denser worlds have more neutrals to court
    var csCount = MAP_W >= 28 ? 6 : MAP_W >= 24 ? 5 : MAP_W >= 20 ? 4 : MAP_W >= 16 ? 3 : 2;
    spawnCityStates(csCount, [p, a, a2]);

    recomputeVisibility('player');
    recomputeVisibility('ai');
    recomputeVisibility('ai2');
    recomputeBorders();
    centerCameraOn(state.cursor.c, state.cursor.r);
    save();
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
      greatPoints: { culture: 0, military: 0 },
      greatPeopleSpawned: 0,
      generalBonus: null,
      economicCountdown: 0
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
    if (ns.length > 0) spawnUnit(civId, 'warrior', ns[0][0], ns[0][1]);
    // Hard difficulty: AI gets an extra warrior
    var diff = DIFFICULTIES[state.difficulty || 'normal'] || DIFFICULTIES.normal;
    if (diff.aiExtraWarrior && civId !== 'player' && ns.length > 1) {
      spawnUnit(civId, 'warrior', ns[1][0], ns[1][1]);
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
        seed: state.seed,
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
        stats: state.stats || { unitsKilled: 0, unitsLost: 0 },
        diplomacy: state.diplomacy,
        pendingPeace: state.pendingPeace || null,
        freetech: state.freetech || false
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
      state.stats = state.stats || { unitsKilled: 0, unitsLost: 0 };
      state.difficulty = state.difficulty || 'normal';
      // Diplomacy backfill
      if (!state.diplomacy) {
        state.diplomacy = { ai_player: 'war', ai2_player: 'war', ai_ai2: 'war' };
      }
      if (state.diplomacy.cs_player === undefined) state.diplomacy.cs_player = 'peace';
      if (state.diplomacy.ai_cs === undefined)     state.diplomacy.ai_cs     = 'peace';
      if (state.diplomacy.ai2_cs === undefined)    state.diplomacy.ai2_cs    = 'peace';
      if (state.pendingPeace === undefined) state.pendingPeace = null;
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
        if (!cv.greatPoints) cv.greatPoints = { culture: 0, military: 0 };
        if (cv.greatPeopleSpawned === undefined) cv.greatPeopleSpawned = 0;
        if (cv.generalBonus === undefined) cv.generalBonus = null;
        if (cv.economicCountdown === undefined) cv.economicCountdown = 0;
      });
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
      });
      // Backfill unit promo/kills fields from older saves
      CIV_SIDES.concat(['barb','cs']).forEach(function (id) {
        (state.civs[id].units || []).forEach(function (u) {
          if (u.kills === undefined) u.kills = 0;
          if (u.promoAtk === undefined) u.promoAtk = 0;
          if (u.promoDef === undefined) u.promoDef = 0;
          if (u.promoHp === undefined) u.promoHp = 0;
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

  function addFx(type, c, r, data, durationMs) {
    combatFx.push({ type: type, c: c, r: r, data: data || {}, start: Date.now(), dur: durationMs || 600 });
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
      // Subtle tufts — lighter greens on darker base
      for (var i = 0; i < 5; i++) {
        var x = (rng() - 0.5) * size * 1.1;
        var y = (rng() - 0.5) * size * 0.9;
        dot(x, y, px, px, '#1e6a38');
        dot(x + px, y, px*0.6, px*0.6, '#2e8848');
      }
      // Scattered bright specks (flowers/clover)
      for (var i = 0; i < 2; i++) {
        var x = (rng() - 0.5) * size * 0.8;
        var y = (rng() - 0.5) * size * 0.7;
        dot(x, y, px*0.5, px*0.5, '#4aba68');
      }
    } else if (terrain === 'plains') {
      // Golden wheat-like tufts — clearly warmer than grass
      for (var i = 0; i < 6; i++) {
        var x = (rng() - 0.5) * size * 1.1;
        var y = (rng() - 0.5) * size * 0.9;
        dot(x, y, px*0.8, px*0.5, '#b89840');
        dot(x + px*0.4, y - px*0.3, px*0.5, px*0.3, '#c8a850');
      }
    } else if (terrain === 'forest') {
      var nTrees = 3 + Math.floor(rng() * 2);
      var positions = [];
      for (var i = 0; i < nTrees; i++) {
        positions.push([(rng() - 0.5) * size * 0.9, (rng() - 0.4) * size * 0.7]);
      }
      positions.sort(function (a, b) { return a[1] - b[1]; });
      for (var i = 0; i < positions.length; i++) {
        tree(positions[i][0], positions[i][1], '#0a2012', '#164a22', '#228a34');
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
        ctx.fillStyle = '#352010';
        ctx.beginPath();
        ctx.ellipse(cx + bx, cy + by, bw, bh, 0, 0, Math.PI);
        ctx.fill();
        ctx.fillStyle = '#4a3218';
        ctx.beginPath();
        ctx.ellipse(cx + bx - bw*0.15, cy + by, bw*0.7, bh*0.9, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        // Subtle grass tint on top of hill
        ctx.fillStyle = 'rgba(40, 80, 30, 0.3)';
        ctx.beginPath();
        ctx.ellipse(cx + bx - bw*0.1, cy + by, bw*0.5, bh*0.5, 0, Math.PI, Math.PI * 2);
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
      // Deep water shimmer highlights
      for (var i = 0; i < 2; i++) {
        var sx = (rng() - 0.5) * size * 0.8;
        var sy = (rng() - 0.5) * size * 0.6;
        ctx.fillStyle = 'rgba(20, 60, 110, 0.5)';
        ctx.beginPath();
        ctx.ellipse(cx + sx, cy + sy, size * 0.18, size * 0.06, rng() * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // wave lines — staggered, varying widths
      ctx.lineWidth = Math.max(1, px * 0.6);
      for (var i = 0; i < 4; i++) {
        var y = -size*0.35 + i * size * 0.24;
        var xoff = (i % 2 ? 0.06 : -0.06) * size;
        ctx.strokeStyle = i % 2 === 0 ? '#164070' : '#1a4a80';
        ctx.beginPath();
        ctx.moveTo(cx - size*0.38 + xoff, cy + y);
        ctx.quadraticCurveTo(cx - size*0.08 + xoff, cy + y - 2.5, cx + xoff, cy + y);
        ctx.quadraticCurveTo(cx + size*0.16 + xoff, cy + y + 2.5, cx + size*0.38 + xoff, cy + y);
        ctx.stroke();
      }
      // Specular highlight dot
      ctx.fillStyle = 'rgba(80, 160, 220, 0.25)';
      var hx = (rng() - 0.5) * size * 0.5;
      var hy = (rng() - 0.5) * size * 0.4;
      ctx.beginPath();
      ctx.arc(cx + hx, cy + hy, size * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
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
    // Dark blue outline
    ctx.strokeStyle = '#0a2c44';
    ctx.lineWidth = Math.max(3, size * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(cx + wiggle * size * 0.2, cy + size * 0.05, b[0], b[1]);
    ctx.stroke();
    // Bright water
    ctx.strokeStyle = '#3a92d0';
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(cx, cy + size * 0.05, b[0], b[1]);
    ctx.stroke();
    // Sparkle highlight
    ctx.strokeStyle = '#7ce5ff';
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.beginPath();
    ctx.moveTo(a[0] + 1, a[1] - 1);
    ctx.quadraticCurveTo(cx + 1, cy + size * 0.04, b[0] + 1, b[1] - 1);
    ctx.stroke();
    ctx.lineCap = 'butt';
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
    else if (kind === 'pasture') drawPastureImprovement(cx, cy, size);
    else if (kind === 'lumber') drawLumberImprovement(cx, cy, size);
    else if (kind === 'quarry') drawQuarryImprovement(cx, cy, size);
    else if (kind === 'fishing_boats') drawFishingBoatsImprovement(cx, cy, size);
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
          // Unexplored — paint a very faint hex with subtle edge
          hexPath(cx, cy, inset);
          ctx.fillStyle = 'rgba(12, 12, 22, 0.6)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(60, 60, 90, 0.25)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          continue;
        }

        hexPath(cx, cy, inset);
        ctx.fillStyle = terrain.color;
        ctx.fill();
        ctx.save();
        ctx.clip();                      // clip decals to hex
        drawTerrainDetail(cx, cy, size, t, c, r);
        if (t.river) drawRiverOnTile(cx, cy, size, c, r);
        ctx.restore();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = terrain.edge;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1.0;

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
          ctx.fillStyle = 'rgba(0,0,0,0.48)';
          ctx.fill();
        }
      }
    }

    // Territorial borders (between owners) — drawn after terrain, before entities
    drawBorders(size, inset);

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
        var hasCity = !!t.city;
        var hasUnit = t.unit && visible;
        if (!hasVillage && !hasCity && !hasUnit) continue;

        var p = pixelOf(c, r, size);
        var cx = p.x - state.camera.x + size * SQRT3 / 2;
        var cy = p.y - state.camera.y + size;
        if (cx < -size * 2 || cy < -size * 2 || cx > VIEW_W + size * 2 || cy > VIEW_H + size * 2) continue;

        // Tribal village
        if (hasVillage) {
          drawVillage(cx, cy, size);
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
      // Outer glow
      hexPath(ccx, ccy, inset);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,212,255,0.25)';
      ctx.stroke();
      // Inner bright line
      hexPath(ccx, ccy, inset);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00d4ff';
      ctx.shadowColor = '#00d4ff';
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

  var UNIT_DRAW = {
    settler:   drawSettler,
    worker:    drawWorker,
    scout:     drawScout,
    warrior:   drawWarrior,
    archer:    drawArcher,
    horseman:  drawHorseman,
    swordsman: drawSwordsman,
    catapult:  drawCatapult,
    musketman: drawMusketman,
    galley:    drawGalley,
    raider:    drawWarrior,  // reuses warrior sprite; civ color makes it grey
    great_general:   drawGreatPerson,
    great_scientist: drawGreatPerson,
    great_engineer:  drawGreatPerson
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
    var totalPromos = (unit.promoAtk || 0) + (unit.promoDef || 0) + (unit.promoHp || 0);
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

  function rangedAttack(attacker, defender) {
    var aDef = UNITS[attacker.type], dDef = UNITS[defender.type];
    if (aDef.atk === 0) { showToast('Cannot attack'); return false; }
    if (!atWar(attacker.civ, defender.civ)) { showToast('At peace'); return false; }
    var dTile = tileAt(defender.c, defender.r);
    var terr = TERRAIN[dTile.terrain];
    var dBonus = (terr.defBonus || 0);
    if (defender.fortified) dBonus += 0.25;
    if (dTile.city && dTile.city.civ === defender.civ) {
      dBonus += dTile.city.buildings.walls ? 0.75 : 0.25;
      if (state.wondersBuilt && state.wondersBuilt.great_wall === defender.civ) dBonus += 0.5;
    }
    if (dTile.owner === defender.civ) dBonus += 0.10;
    if (dBonus > 1.5) dBonus = 1.5;

    var aPower = aDef.atk + atkTechBonus(attacker);
    // Siege bonus: catapults halve city defense bonuses
    if (aDef.siege && dTile.city) dBonus = dBonus * 0.5;
    var dPower = (dDef.def + (defender.promoDef || 0)) * (1 + dBonus);
    var ratio = aPower / (aPower + dPower);

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
      if (attacker.civ === 'player') state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1;
      if (defender.civ === 'player') state.stats.unitsLost = (state.stats.unitsLost || 0) + 1;
      killUnit(defender);
      checkPromotion(attacker);
      // Ranged attacker does NOT move into the vacated tile
    }
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
    document.getElementById('hud-tech-name').textContent = civ.currentTech
      ? TECHS[civ.currentTech].name
      : 'No research';

    // Age indicator
    var age = getAge(civ);
    var ageEl = document.getElementById('hud-age');
    if (ageEl) {
      ageEl.textContent = age.name.toUpperCase();
      var cell = ageEl.parentElement;
      cell.classList.remove('classical', 'medieval', 'modern');
      if (age.name === 'Classical') cell.classList.add('classical');
      if (age.name === 'Medieval') cell.classList.add('medieval');
      if (age.name === 'Modern') cell.classList.add('modern');
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

    var hint = document.getElementById('hud-hint');
    var selUnit = state.selected && tileAt(state.selected.c, state.selected.r);
    selUnit = selUnit && selUnit.unit;
    if (state.selected && !selUnit) state.selected = null;

    var readyToEnd = !hasMovesLeft && !state.victory;

    if (selUnit) {
      var rangeHint = UNITS[selUnit.type] && UNITS[selUnit.type].ranged ? ' · rng ' + UNITS[selUnit.type].ranged : '';
      hint.textContent = '⏎ move/fire · esc next · ' + selUnit.moves + '/' + selUnit.maxMoves + ' mv' + rangeHint;
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
    if (city.buildings.market) gold += BUILDINGS.market.gold;
    if (city.buildings.bank) gold += BUILDINGS.bank.gold;

    // Adjacency bonuses for gold-buildings (Market / Bank near rivers)
    gold += buildingAdjacency(city).gold;

    // Pyramids — +1 production in every city of the owner
    if (wb.pyramids === city.civ) prod += 1;

    return { food: food, prod: prod, gold: gold };
  }

  function cityScience(city) {
    // Floor of 2/turn so the very first city isn't crawling at 1 sci/turn
    // while Pottery is being researched.
    var sci = 2 + Math.floor((city.pop - 1) / 2);
    var b = city.buildings || {};
    if (b.library)    sci += BUILDINGS.library.sci;     // +2
    if (b.temple)     sci += BUILDINGS.temple.sci;      // +3
    if (b.university) sci += BUILDINGS.university.sci;  // +4
    // Philosophy: temples give an extra +1 science
    var civ = state.civs[city.civ];
    if (b.temple && civ && civ.techs && civ.techs.philosophy) sci += 1;
    // Adjacency bonuses for science buildings
    sci += buildingAdjacency(city).sci;
    // Library of Alexandria — +2 science in every city of the owner
    var wb2 = state.wondersBuilt || {};
    if (wb2.library_of_alex === city.civ) sci += BUILDINGS.library_of_alex.perCitySci;
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
    civ.goldPerTurn = gpt;
    civ.sciPerTurn = spt;
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
    // Siege bonus: catapults halve city defense bonuses
    if (aDef.siege && dTile.city) dBonus = dBonus * 0.5;
    var dPower = (dDef.def + (defender.promoDef || 0)) * (1 + dBonus);
    var ratio = aPower / (aPower + dPower);

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
      if (attacker.civ === 'player') state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1;
      if (defender.civ === 'player') state.stats.unitsLost = (state.stats.unitsLost || 0) + 1;
      killUnit(defender);
      checkPromotion(attacker);
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
        if (defender.civ === 'player') state.stats.unitsKilled = (state.stats.unitsKilled || 0) + 1;
        checkPromotion(defender);
      }
      killUnit(attacker);
    }
    return true;
  }

  function atkTechBonus(unit) {
    var bonus = 0;
    if (state.civs[unit.civ].techs.iron && unit.type === 'warrior') bonus += 2;
    var f = FACTIONS[state.civs[unit.civ].faction];
    if (f && f.bonus && f.bonus.atk && !UNITS[unit.type].civilian) bonus += f.bonus.atk;
    // Militaristic city-state ally bonus
    if (!UNITS[unit.type].civilian) bonus += csMilitaryBonus(unit.civ);
    // Statue of Liberty — +1 ATK on all military units of the owner
    if (state.wondersBuilt && state.wondersBuilt.statue_liberty === unit.civ && !UNITS[unit.type].civilian) {
      bonus += BUILDINGS.statue_liberty.militaryAtk;
    }
    // Unit promotion attack bonus
    bonus += (unit.promoAtk || 0);
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

  function checkPromotion(unit) {
    if (!unit || unit.hp <= 0 || UNITS[unit.type].civilian) return;
    // Military XP for great general
    var civ = state.civs[unit.civ];
    if (civ && civ.greatPoints) civ.greatPoints.military += 5;
    var kills = unit.kills || 0;
    var totalPromos = (unit.promoAtk || 0) + (unit.promoDef || 0) + (unit.promoHp || 0);
    var earned = Math.floor(kills / 2);
    if (earned <= totalPromos) return;
    // Auto-promote cycling: HP → ATK → DEF
    var cycle = totalPromos % 3;
    if (cycle === 0) {
      unit.promoHp = (unit.promoHp || 0) + 1;
      unit.maxHp += 2;
      unit.hp = Math.min(unit.hp + 2, unit.maxHp);
      if (unit.civ === 'player') { sfxPromote(); showToast(UNITS[unit.type].name + ' promoted! +2 HP', 'success'); logEvent(UNITS[unit.type].name + ' promoted: +2 HP', 'success'); }
    } else if (cycle === 1) {
      unit.promoAtk = (unit.promoAtk || 0) + 1;
      if (unit.civ === 'player') { sfxPromote(); showToast(UNITS[unit.type].name + ' promoted! +1 ATK', 'success'); logEvent(UNITS[unit.type].name + ' promoted: +1 ATK', 'success'); }
    } else {
      unit.promoDef = (unit.promoDef || 0) + 1;
      if (unit.civ === 'player') { sfxPromote(); showToast(UNITS[unit.type].name + ' promoted! +1 DEF', 'success'); logEvent(UNITS[unit.type].name + ' promoted: +1 DEF', 'success'); }
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
      // Player picks production explicitly; AI defaults to warrior so its
      // cities never sit idle.
      producing: unit.civ === 'player' ? null : 'warrior',
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
    if (unit.civ === 'player') {
      sfxFound();
      logEvent('Choose production for ' + name, 'info');
      // Auto-open the city screen so the player picks immediately
      setTimeout(function () { openCity(city); }, 350);
    }
  }

  function captureCity(city, newOwnerId) {
    var oldOwner = state.civs[city.civ];
    var oldOwnerId = oldOwner.id;
    // Barbarian raiders pillage and burn — they don't keep cities.
    if (newOwnerId === 'barb') {
      var idx0 = oldOwner.cities.indexOf(city);
      if (idx0 >= 0) oldOwner.cities.splice(idx0, 1);
      var t0 = tileAt(city.c, city.r);
      if (t0) t0.city = null;
      if (oldOwnerId === 'player') logEvent(city.name + ' was razed by raiders!', 'error');
      showToast(city.name + ' razed by raiders!', 'error');
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
    state.civs[newOwnerId].cities.forEach(function (ct) {
      if (ct.capital && ct.originalCiv && ct.originalCiv !== newOwnerId) {
        capturedRivalCapitals++;
      }
    });
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
            // Race lost — banked production is forfeit (otherwise a lost race would
            // pop a free warrior the next turn). Pick a sensible default.
            city.prod = 0;
            city.producing = 'warrior';
            if (city.civ === 'player') logEvent('Lost the race for ' + bdef.name, 'error');
          } else {
            city.buildings[p] = true;
            state.wondersBuilt[p] = city.civ;
            applyWonderOneShot(city, p);
            if (city.civ === 'player') { logEvent(city.name + ' built ' + bdef.name + ' (wonder)', 'success'); sfxWonder(); }
            else logEvent(CIVS[city.civ].name + ' built ' + bdef.name, 'error');
          }
        } else {
          city.buildings[p] = true;
          if (city.civ === 'player') logEvent(city.name + ' built ' + bdef.name, 'success');
        }
      } else {
        var spawnTile = findSpawnTile(city, p);
        if (spawnTile) {
          spawnUnit(city.civ, p, spawnTile[0], spawnTile[1]);
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

    // City attack power: base 3 + pop + 2 if walls
    var atkPower = 3 + city.pop + (city.buildings.walls ? 2 : 0);
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
    if (!bdef || !bdef.wonder) return;
    var civ = state.civs[city.civ];
    if (bdef.oneShotScience) {
      civ.techProgress = (civ.techProgress || 0) + bdef.oneShotScience;
    }
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
        var SCI_BLDGS = { library: 1, university: 1, temple: 1 };
        var GOLD_BLDGS = { market: 1, bank: 1 };
        var DEF_BLDGS = { walls: 1 };
        regBldgs.sort(function (a, b) {
          var pri = function (k) {
            if (civ.personality === 'scientific' && SCI_BLDGS[k]) return 3;
            if (civ.personality === 'economic'  && GOLD_BLDGS[k]) return 3;
            if ((civ.personality === 'aggressive' || civ.personality === 'warmonger') && DEF_BLDGS[k]) return 3;
            return 1;
          };
          return pri(b) - pri(a);
        });
        return regBldgs[0];
      }
      if (available.indexOf('musketman') >= 0) return 'musketman';
      if (available.indexOf('swordsman') >= 0) return 'swordsman';
      if (available.indexOf('horseman') >= 0) return 'horseman';
      if (available.indexOf('archer') >= 0) return 'archer';
      if (available.indexOf('catapult') >= 0 && rnd() < 0.3) return 'catapult';
      if (available.indexOf('galley') >= 0 && isCoastalCity(city) && rnd() < 0.2) return 'galley';
      return 'warrior';
    }
    // Player: if current production is a completed building, switch to warrior
    if (BUILDINGS[city.producing] && city.buildings[city.producing]) return 'warrior';
    return city.producing;
  }

  function availableProducibles(civ, city) {
    var out = [];
    for (var k in UNITS) {
      var u = UNITS[k];
      if (u.tech && !civ.techs[u.tech]) continue;
      if (u.barb) continue;             // raiders aren't trainable
      if (u.great) continue;            // great people aren't trainable
      if (u.naval && city && !isCoastalCity(city)) continue; // naval only at coastal cities
      out.push(k);
    }
    for (var k in BUILDINGS) {
      var b = BUILDINGS[k];
      if (b.tech && !civ.techs[b.tech]) continue;
      if (b.wonder && state.wondersBuilt && state.wondersBuilt[k]) continue;
      // Don't suggest already-built regular buildings to this city
      if (city && city.buildings && city.buildings[k] && !b.wonder) continue;
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
          sfxAgeUp();
        }
      }
      // Every AI picks its next tech automatically; player picks from the menu.
      if (AI_SIDES.indexOf(civ.id) >= 0) {
        civ.currentTech = pickAiTech(civ);
      } else if (civ.id === 'player') {
        // Prompt player to pick a new tech
        var hasMore = TECH_ORDER.some(function (tk) { return !civ.techs[tk]; });
        if (hasMore) {
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
    var SCI_TECHS = { writing: 1, philosophy: 1, education: 1 };
    var GOLD_TECHS = { currency: 1, banking: 1 };
    var MIL_TECHS = { archery: 1, husbandry: 1, iron: 1, steel: 1, gunpowder: 1, engineering: 1 };
    var BAL_TECHS = { pottery: 1, masonry: 1, theology: 1, sailing: 1 };
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
  function checkGreatPeople(civId) {
    var civ = state.civs[civId];
    if (!civ.greatPoints) return;
    var threshold = GP_THRESHOLD + civ.greatPeopleSpawned * 25;

    // Culture → Great Scientist or Great Engineer
    if (civ.greatPoints.culture >= threshold) {
      civ.greatPoints.culture -= threshold;
      civ.greatPeopleSpawned++;
      var gpType = rnd() < 0.5 ? 'great_scientist' : 'great_engineer';
      spawnGreatPerson(civId, gpType);
    }
    // Recompute threshold after culture spawn may have incremented counter
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
    }
    killUnit(unit);
  }

  // =====================================================================
  // AI DIPLOMACY
  // =====================================================================
  function aiDiplomacyCheck() {
    if (state.victory) return;
    AI_SIDES.forEach(function (aiId) {
      var aiCiv = state.civs[aiId];
      if (!aiCiv || aiCiv.cities.length === 0) return;
      var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.aggressive;
      var aiMil = aiCiv.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;

      // Check vs player
      if (atWar(aiId, 'player')) {
        var plMil = state.civs.player.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;
        // Offer peace if significantly weaker (peace probability scaled by peaceMul)
        if (aiMil < plMil * 0.5 && aiCiv.cities.length <= state.civs.player.cities.length && state.turn >= 8) {
          if (!state.pendingPeace && rnd() < 0.3 * per.peaceMul) {
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
        // At peace — maybe declare war if strong enough and enough turns passed
        var plMil = state.civs.player.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;
        if (aiMil >= plMil * 1.5 && aiMil >= 4 && state.turn >= 15 && rnd() < 0.15 * per.warMul) {
          declareWarOn(aiId, 'player');
        } else if (!state.pendingPeace && state.turn >= 10 && rnd() < per.offerAlliance) {
          // Otherwise propose an alliance based on personality
          state.pendingPeace = { from: aiId, kind: 'alliance' };
        }
      }

      // AI vs AI diplomacy
      AI_SIDES.forEach(function (otherId) {
        if (otherId === aiId) return;
        var otherCiv = state.civs[otherId];
        if (!otherCiv || otherCiv.cities.length === 0) return;
        var otherMil = otherCiv.units.filter(function (u) { return !UNITS[u.type].civilian; }).length;
        if (atWar(aiId, otherId)) {
          // Peace if both weak (peace probability scaled by peaceMul)
          if (aiMil <= 2 && otherMil <= 2 && rnd() < 0.2 * per.peaceMul) {
            makePeace(aiId, otherId);
          }
        } else if (state.diplomacy[dipKey(aiId, otherId)] !== 'allied') {
          // War if strong (scaled by warMul)
          if (aiMil >= otherMil * 1.5 && aiMil >= 4 && state.turn >= 12 && rnd() < 0.1 * per.warMul) {
            declareWarOn(aiId, otherId);
          }
        }
      });
    });
  }

  function showPeaceOffer() {
    if (!state.pendingPeace) return;
    var offer = state.pendingPeace;
    var fromId = offer.from;
    var fromName = CIVS[fromId] ? CIVS[fromId].name : 'Enemy';
    var kind = offer.kind || 'peace';
    var actions = [];
    if (kind === 'alliance') {
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

  function relationLabel(rel) {
    if (rel === 'war') return 'At War';
    if (rel === 'peace') return 'At Peace';
    if (rel === 'allied') return 'Allied ★';
    return rel || 'Unknown';
  }

  function openDiplomacy() {
    var civPl = state.civs.player;
    var actions = [];
    ['ai','ai2'].forEach(function (aiId) {
      var aiCiv = state.civs[aiId];
      // Skip only if civ is fully eliminated (no cities, no units)
      if (!aiCiv || (aiCiv.cities.length === 0 && aiCiv.units.length === 0)) return;
      var aiName = CIVS[aiId].name;
      // Always fall back to a defined personality so the % displays + action
      // probabilities don't throw on a malformed save.
      var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.peaceful;
      var perLabel = per.icon + ' ' + per.label;
      var rel = relation('player', aiId);

      // Header row (informational)
      actions.push({
        header: true, disabled: true,
        icon: '⬢', title: aiName + ' — ' + relationLabel(rel),
        sub: perLabel + (rel === 'allied' ? ' · permanent peace pact' : '')
      });

      if (rel === 'war') {
        actions.push({
          icon: '☮', primary: true, title: 'Offer Peace',
          sub: per ? 'Likely: ' + Math.round(per.acceptPeace * 100) + '%' : 'Sue for peace',
          do: function () { playerOfferPeace(aiId); closeModal(); draw(); }
        });
      } else if (rel === 'allied') {
        actions.push({
          icon: '✕', danger: true, title: 'Renounce Alliance',
          sub: 'Back to peace; either side may then declare war',
          do: function () { setRelation('player', aiId, 'peace'); showToast('Alliance with ' + aiName + ' renounced', 'error'); logEvent('Renounced alliance with ' + aiName, 'error'); closeModal(); draw(); }
        });
        actions.push({
          icon: '⚗', title: 'Trade for Tech',
          sub: TRADE_GOLD_COST + 'g → +' + TRADE_SCI_GAIN + ' science · likely: ' + Math.round(per.acceptTrade * 100) + '%',
          disabled: civPl.gold < TRADE_GOLD_COST || !civPl.currentTech,
          do: function () { playerTradeForTech(aiId); closeModal(); draw(); }
        });
      } else {
        // at peace
        actions.push({
          icon: '★', primary: true, title: 'Propose Alliance',
          sub: 'Permanent peace pact · likely: ' + Math.round(per.acceptAlliance * 100) + '%',
          do: function () { playerProposeAlliance(aiId); closeModal(); draw(); }
        });
        actions.push({
          icon: '⚗', title: 'Trade for Tech',
          sub: TRADE_GOLD_COST + 'g → +' + TRADE_SCI_GAIN + ' science · likely: ' + Math.round(per.acceptTrade * 100) + '%',
          disabled: civPl.gold < TRADE_GOLD_COST || !civPl.currentTech,
          do: function () { playerTradeForTech(aiId); closeModal(); draw(); }
        });
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

  function playerOfferPeace(aiId) {
    var aiCiv = state.civs[aiId];
    var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.aggressive;
    if (rnd() < per.acceptPeace) {
      makePeace('player', aiId);
      logEvent(CIVS[aiId].name + ' accepted peace', 'success');
    } else {
      showToast(CIVS[aiId].name + ' refuses peace', 'error');
      logEvent(CIVS[aiId].name + ' refused peace offer', 'error');
    }
  }

  function playerProposeAlliance(aiId) {
    var aiCiv = state.civs[aiId];
    var per = AI_PERSONALITIES[aiCiv.personality] || AI_PERSONALITIES.aggressive;
    if (rnd() < per.acceptAlliance) {
      setRelation('player', aiId, 'allied');
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
    if (rnd() < per.acceptTrade) {
      civPl.gold -= TRADE_GOLD_COST;
      aiCiv.gold += TRADE_GOLD_COST;
      civPl.techProgress = Math.min((TECHS[civPl.currentTech].cost), civPl.techProgress + TRADE_SCI_GAIN);
      sfxResearch();
      showToast('Trade with ' + CIVS[aiId].name + ': +' + TRADE_SCI_GAIN + ' science', 'success');
      logEvent('Traded ' + TRADE_GOLD_COST + 'g for ' + TRADE_SCI_GAIN + ' science via ' + CIVS[aiId].name, 'success');
    } else {
      showToast(CIVS[aiId].name + ' rejects the trade', 'error');
      logEvent(CIVS[aiId].name + ' rejected the science trade', 'info');
    }
  }

  function declareVictory(civId, kind) {
    state.victory = civId;
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
      // Culture victory: own enough World Wonders
      if (wondersOwnedBy(id) >= CULTURE_VICTORY_WONDERS) {
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

  // =====================================================================
  // TURN
  // =====================================================================
  function endTurn() {
    if (state.victory) return;
    // Player end-of-turn
    var pl = state.civs.player;
    state.turnLog = [];                  // fresh log for events from this round
    pl.cities.forEach(function (ct) { cityBombard(ct); });   // cities fire at adjacent enemies
    recomputeIncome('player');
    pl.cities.forEach(processCity);
    pl.gold += pl.goldPerTurn;
    progressTech(pl);
    // Great people culture points from temples
    pl.cities.forEach(function (ct) {
      if (ct.buildings && ct.buildings.temple) pl.greatPoints.culture += 3;
      // Notre Dame — +N culture per city per turn
      if (state.wondersBuilt && state.wondersBuilt.notre_dame === 'player') pl.greatPoints.culture += BUILDINGS.notre_dame.perCityCulture;
    });
    checkGreatPeople('player');

    // AI turn — lock input while the AI thinks/moves
    state.currentCiv = 'ai';
    aiThinking = true;
    flashEndTurn();
    setTimeout(function () {
      aiDiplomacyCheck();
      aiTurn();
      barbTurn();

      // End-of-turn for every AI side
      AI_SIDES.forEach(function (id) {
        var c = state.civs[id];
        c.cities.forEach(function (ct) { cityBombard(ct); }); // AI cities fire too
        recomputeIncome(id);
        c.cities.forEach(processCity);
        c.gold += c.goldPerTurn;
        progressTech(c);
        // Great people culture points for AI
        c.cities.forEach(function (ct) {
          if (ct.buildings && ct.buildings.temple) c.greatPoints.culture += 3;
          if (state.wondersBuilt && state.wondersBuilt.notre_dame === c.id) c.greatPoints.culture += BUILDINGS.notre_dame.perCityCulture;
        });
        checkGreatPeople(id);
        // AI auto-upgrades
        c.units.slice().forEach(function (u) {
          if (canUpgrade(u)) upgradeUnit(u);
        });
      });

      // Decay general bonuses for all civs
      CIV_SIDES.forEach(function (id) {
        var gb = state.civs[id].generalBonus;
        if (gb) {
          gb.turnsLeft--;
          if (gb.turnsLeft <= 0) state.civs[id].generalBonus = null;
        }
      });

      // Check player elimination — no cities and no settlers means defeat
      if (!state.victory) {
        var plCheck = state.civs.player;
        var hasCities = plCheck.cities.length > 0;
        var hasSettlers = plCheck.units.some(function (u) { return u.type === 'settler'; });
        if (!hasCities && !hasSettlers) {
          // Find which AI is strongest as the "winner"
          var winner = 'ai';
          if (state.civs.ai2.cities.length > state.civs.ai.cities.length) winner = 'ai2';
          declareVictory(winner, 'domination');
        }
      }

      // Culture + economic victory checks (every civ, every turn)
      checkProgressVictories();

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

      sfxTurnStart();
      // Show peace offer from AI if pending
      if (state.pendingPeace) {
        setTimeout(function () { showPeaceOffer(); }, 400);
      }
      autoSelectNextUnit();
      showTurnSummary();
      aiThinking = false;
      save();
      draw();
    }, 300);
  }

  function playerAutoMove() {
    state.civs.player.units.forEach(function (u) {
      if (!u.goto || u.moves <= 0) return;
      // Already arrived
      if (u.c === u.goto.c && u.r === u.goto.r) { u.goto = null; return; }
      // Stop if enemies adjacent — let player decide
      var adj = adjacentEnemy(u);
      if (adj) { u.goto = null; return; }
      // Step toward destination
      var startDist = hexDist([u.c, u.r], [u.goto.c, u.goto.r]);
      while (u.moves > 0) {
        if (u.c === u.goto.c && u.r === u.goto.r) { u.goto = null; break; }
        var ns = neighbors(u.c, u.r).filter(function (n) {
          var t = tileAt(n[0], n[1]);
          if (!canEnterTile(u, t)) return false;
          if (t.unit) return false;   // don't walk into anyone
          return true;
        });
        if (ns.length === 0) { u.goto = null; break; }
        ns.sort(function (a, b) {
          return hexDist(a, [u.goto.c, u.goto.r]) - hexDist(b, [u.goto.c, u.goto.r]);
        });
        var step = ns[0];
        // If closest neighbor is not actually closer, we're stuck
        if (hexDist(step, [u.goto.c, u.goto.r]) >= hexDist([u.c, u.r], [u.goto.c, u.goto.r])) {
          u.goto = null; break;
        }
        moveUnit(u, step[0], step[1]);
        // Check for enemies after each step
        var adjNow = adjacentEnemy(u);
        if (adjNow) { u.goto = null; break; }
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
        if (csc.ally === aiId && (aiId === 'ai' || aiId === 'ai2')) {
          logEvent(CIVS[aiId].name + ' allied with ' + csc.name, 'info');
        }
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
    rangedAttack(u, targets[0].unit);
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
              rangedAttack(su, ct.unit);
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

          // Multi-turn move: destination beyond this turn's reach
          var destT = tileAt(state.cursor.c, state.cursor.r);
          if (destT && destT.explored.player && !destT.unit) {
            // Check tile is theoretically enterable
            var canReach = canEnterTile(su, destT);
            if (canReach) {
              su.goto = { c: state.cursor.c, r: state.cursor.r };
              // Walk as far as possible this turn toward the destination
              var bestKey = null, bestDist = Infinity;
              for (var rk in reach) {
                if (reach[rk].cost === 0) continue;
                var parts = rk.split(',');
                var rc = +parts[0], rr = +parts[1];
                var rt = tileAt(rc, rr);
                if (rt && rt.unit && rt.unit !== su) continue;
                var d = hexDist([rc, rr], [state.cursor.c, state.cursor.r]);
                if (d < bestDist) { bestDist = d; bestKey = rk; }
              }
              if (bestKey) {
                var bParts = bestKey.split(',');
                var walkPath2 = pathTo(reach, +bParts[0], +bParts[1]);
                var terrName = TERRAIN[destT.terrain].name;
                showToast('Moving toward ' + terrName + '...', 'info');
                walkPath(su, walkPath2);
              } else {
                showToast('Moving next turn...', 'info');
              }
              return;
            }
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
      // Great person activation
      if (def.great) {
        var gpLabel = u.type === 'great_general' ? 'Inspire Army (+2 ATK, 8 turns)' :
                      u.type === 'great_scientist' ? 'Free Technology' :
                      'Rush City Production';
        actions.push({ icon: '✦', primary: true, title: 'Activate', sub: gpLabel, do: function () { closeModal(); activateGreatPerson(u); draw(); } });
      }
      // Unit upgrade
      var upInfo = canUpgrade(u);
      if (upInfo) {
        actions.push({ icon: '⬆', primary: true, title: 'Upgrade → ' + UNITS[upInfo.to].name, sub: upInfo.cost + ' gold', do: function () { upgradeUnit(u); closeModal(); draw(); } });
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
    actions.push({ icon: '◆', title: 'Research', sub: civPl.currentTech ? TECHS[civPl.currentTech].name + ' · ' + civPl.techProgress + '/' + TECHS[civPl.currentTech].cost : 'Choose research', do: function () { closeModal(); openTech(); } });

    // Diplomacy — unified menu (alliances, war, peace, trade)
    var hasRival = ['ai','ai2'].some(function (id) {
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

    // Tile yield overlay toggle
    actions.push({ icon: '⬡', title: showYieldOverlay ? 'Hide Yields' : 'Show Yields', sub: 'Food / prod / gold per tile', do: function () { showYieldOverlay = !showYieldOverlay; showToast(showYieldOverlay ? 'Yields ON' : 'Yields OFF'); closeModal(); draw(); } });

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
    var def = (city.buildings.walls ? 4 : 0) + (city.pop);
    if (state.wondersBuilt && state.wondersBuilt.great_wall === city.civ) def = Math.round(def * 1.5);
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
      var iconChar = isWonder ? '✦' : (isB ? '▢' : UNITS[k].glyph);
      var sub;
      if (isWonder) {
        sub = BUILDINGS[k].lore + ' · ' + u.cost + ' prod';
      } else if (isB) {
        var parts = [];
        if (BUILDINGS[k].food) parts.push('+' + BUILDINGS[k].food + ' food');
        if (BUILDINGS[k].gold) parts.push('+' + BUILDINGS[k].gold + ' gold');
        if (BUILDINGS[k].sci)  parts.push('+' + BUILDINGS[k].sci + ' sci');
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
    // Techs grouped by age for section headers
    var TECH_AGES = { pottery:0, writing:0, sailing:0, archery:0, masonry:0, husbandry:0, currency:0, iron:0, engineering:1, theology:1, philosophy:1, education:1, steel:2, gunpowder:3, banking:3 };
    var AGE_LABELS = ['Ancient Age', 'Classical Age', 'Medieval Age', 'Modern Age'];
    var lastAge = -1;
    TECH_ORDER.forEach(function (k) {
      // Insert era header when crossing into a new age
      var ta = TECH_AGES[k] || 0;
      if (ta !== lastAge) {
        lastAge = ta;
        var hdr = document.createElement('div');
        hdr.className = 'tech-age-header';
        hdr.textContent = AGE_LABELS[ta];
        list.appendChild(hdr);
      }
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
        if (state.freetech) {
          // Great Scientist — instantly complete this tech
          var ageBefore = getAge(civ);
          civ.techs[k] = true;
          state.freetech = false;
          if (civ.currentTech === k) { civ.currentTech = null; civ.techProgress = 0; }
          showToast(def.name + ' discovered free!', 'success');
          sfxBuild();
          // Age advancement check
          var ageAfter = getAge(civ);
          if (ageAfter.name !== ageBefore.name) {
            var ageGold = ageAdvanceGold(ageAfter);
            civ.gold += ageGold;
            showToast(ageAfter.name + ' Age! +' + ageGold + ' gold', 'success');
          }
          // Science victory check
          var allDone = true;
          for (var ti = 0; ti < TECH_ORDER.length; ti++) { if (!civ.techs[TECH_ORDER[ti]]) { allDone = false; break; } }
          if (allDone) { closeModal(); showEndScreen('player', 'science'); return; }
          closeModal();
          updateHud();
          draw();
          return;
        }
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
    var VICTORY_MSG_WIN = {
      domination: 'You captured every rival capital.',
      science:    'You researched every technology.',
      culture:    'You completed ' + CULTURE_VICTORY_WONDERS + ' World Wonders.',
      economic:   'You held ' + ECONOMIC_VICTORY_GOLD + '+ gold for ' + ECONOMIC_VICTORY_TURNS + ' turns.'
    };
    var VICTORY_MSG_LOSS = {
      domination: ' captured all rival capitals.',
      science:    ' completed all research first.',
      culture:    ' completed ' + CULTURE_VICTORY_WONDERS + ' World Wonders first.',
      economic:   ' amassed ' + ECONOMIC_VICTORY_GOLD + '+ gold for ' + ECONOMIC_VICTORY_TURNS + ' turns.'
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
    var mapLabel = '';
    if (MAP_W <= 10) mapLabel = 'Small';
    else if (MAP_W >= 18) mapLabel = 'Large';
    else mapLabel = 'Normal';
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
        newGame(null, fac);
        showScreen('game');
        if (audioPrefs.music) startMusic();
        break;
      case 'pick-mapsize':
        selectedMapSize = el.dataset.mapsize;
        renderCivCards();
        break;
      case 'pick-difficulty':
        selectedDifficulty = el.dataset.difficulty;
        renderCivCards();
        break;
      case 'new-game':
        clearSave();
        newGame();
        showScreen('game');
        if (audioPrefs.music) startMusic();
        break;
      case 'continue-game':
        if (!hasSave()) return;
        if (load()) {
          showScreen('game');
          if (audioPrefs.music) startMusic();
        }
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
    }
  });

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
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // Fit the 600x600 app to whatever device viewport we're in. On glasses the
    // device viewport IS 600x600 so this is always 1.0.
    updateAppScale();
    window.addEventListener('resize', updateAppScale);
    setupTitleButtons();
    showScreen('title');
  }

  function updateAppScale() {
    var s = Math.min(window.innerWidth, window.innerHeight) / 600;
    document.documentElement.style.setProperty('--app-scale', s.toFixed(4));
  }

  function onCanvasClick(ev) {
    if (!state || state.victory) return;
    if (!isGameVisible()) return;
    if (isModalOpen()) return;            // modals handle their own clicks
    if (isBusy()) return;                  // AI thinking / walk animation
    var rect = canvas.getBoundingClientRect();
    // Map the click to canvas-native coordinates regardless of CSS scaling
    var cx = (ev.clientX - rect.left) * (canvas.width / rect.width);
    var cy = (ev.clientY - rect.top)  * (canvas.height / rect.height);
    var size = ZOOM_LEVELS[state.zoom];
    // drawMap places each hex centre at (pixelOf - camera + size*√3/2, +size),
    // so to recover a hex from a click we have to back the half-hex offset
    // out of the world coordinate before passing it to pixelToHex.
    var wx = cx + state.camera.x - size * SQRT3 / 2;
    var wy = cy + state.camera.y - size;
    var hex = pixelToHex(wx, wy, size);
    var c = hex[0], r = hex[1];
    if (!inBounds(c, r)) return;
    // If the tapped tile is already the cursor, treat the second tap as a
    // confirm (just call activate); otherwise move the cursor and act.
    state.cursor.c = c;
    state.cursor.r = r;
    ensureCursorVisible();
    activate();
    draw();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
