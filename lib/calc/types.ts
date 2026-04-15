// ── Core data types for Champions damage calculator ──

export interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

export interface StatSpread {
  hp: number;
  attack: number;
  defense: number;
  spAtk: number;
  spDef: number;
  speed: number;
}

export interface PokemonData {
  name: string;
  type1: string;
  type2: string | null;
  abilities: string[];
  moves: string[];
  baseStats: BaseStats;
}

export interface MegaData {
  basePokemon: string;
  megaName: string;
  type1: string;
  type2: string | null;
  ability: string;
  baseStats: BaseStats;
}

export interface MoveData {
  name: string;
  type: string;
  category: "Physical" | "Special" | "Status";
  pp: number;
  power: number; // 0 for status/variable-power moves
  accuracy: number; // 101 = never misses
  effect: string;
}

// ── Calculator input types ──

export type Nature = {
  plus: keyof BaseStats | null;
  minus: keyof BaseStats | null;
};

export interface CompetitiveSet {
  pokemon: PokemonData;
  mega?: MegaData; // if Mega-evolved, use these stats/type/ability
  ability: string;
  item: string;
  nature: Nature;
  sp: StatSpread; // Stat Points (0-32 each, 66 total)
  moves: string[];
}

export type Weather = "sun" | "rain" | "sand" | "snow" | null;
export type Terrain = "electric" | "grassy" | "misty" | "psychic" | null;

export interface FieldConditions {
  weather: Weather;
  terrain: Terrain;
  isDoubles: boolean;
  attackerSide: {
    isReflect: boolean;
    isLightScreen: boolean;
    isAuroraVeil: boolean;
    isHelpingHand: boolean;
    isFriendGuard: boolean; // ally has Friend Guard
    isBattery: boolean;
  };
  defenderSide: {
    isReflect: boolean;
    isLightScreen: boolean;
    isAuroraVeil: boolean;
    isProtect: boolean;
    isFriendGuard: boolean;
  };
  isCriticalHit: boolean;
  isSpread: boolean; // hitting 2 targets
  attackerBurned: boolean;
  statBoosts: { atk: number; def: number; spAtk: number; spDef: number };
}

export interface CalcResult {
  rolls: number[];
  minDmg: number;
  maxDmg: number;
  defenderHP: number;
  minPct: number;
  maxPct: number;
  isOHKO: boolean;
  effectiveness: number;
  moveName: string;
  moveType: string;
  description: string;
}

// ── Matchup matrix types ──

export interface MatchupEntry {
  attacker: string;
  defender: string;
  bestMove: string;
  damagePct: number;
  reverseMove: string;
  reversePct: number;
  speedAdvantage: number; // positive = attacker is faster
  score: number;
}

// ── Efficiency coefficient types ──

export interface EfficiencySubScores {
  offenseScore: number;       // [-1,+1]
  defenseScore: number;       // [-1,+1]
  speedScore: number;         // [-1,+1]
  typingScore: number;        // [-1,+1]
  movepoolScore: number;      // [-1,+1]
  megaScore: number;          // [-1,+1]
  // Diagnostic fields
  isOHKO: boolean;
  is2HKO: boolean;
  coverageDepth: number;      // [0,1] fraction of A's moves SE vs B
  survivalMargin: number;     // [-1,+1] (100 - reversePct)/100
  trickRoomFavor: number;     // [-1,+1]
  priorityNet: number;        // [-1,+1]
  coverageTypes: number;      // [0,1] distinct offensive types / 5
  statusThreatNet: number;    // [-1,+1]
  setupPotentialNet: number;  // [-1,+1]
}

export interface EfficiencyEntry extends MatchupEntry {
  subScores: EfficiencySubScores;
  efficiency: number;          // [-1,+1] composite coefficient
  metaWeight: number;          // [0,1] defender usage-based weight
  isMeta: boolean;             // defender has Pikalytics data
}

export const DEFAULT_FIELD: FieldConditions = {
  weather: null,
  terrain: null,
  isDoubles: true,
  attackerSide: {
    isReflect: false,
    isLightScreen: false,
    isAuroraVeil: false,
    isHelpingHand: false,
    isFriendGuard: false,
    isBattery: false,
  },
  defenderSide: {
    isReflect: false,
    isLightScreen: false,
    isAuroraVeil: false,
    isProtect: false,
    isFriendGuard: false,
  },
  isCriticalHit: false,
  isSpread: false,
  attackerBurned: false,
  statBoosts: { atk: 0, def: 0, spAtk: 0, spDef: 0 },
};
