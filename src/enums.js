"use strict";

// Arena Rubra – Fase B1.5
// Enum nominali centralizzati.
// In questa fase sono preparatori: la sostituzione delle stringhe magiche sarà graduale.

const UnitTypes = Object.freeze({
  INFANTRY: "Fanteria",
  VEHICLE: "Veicolo",
  STRUCTURE: "Struttura",
  COMMANDER: "Comandante",
  HQ: "QG"
});

const UnitWeights = Object.freeze({
  LIGHT: "Leggera",
  HEAVY: "Pesante",
  ELITE: "Elite",
  PIVOT: "Pivot",
  BASE: "Base"
});

const FactionIds = Object.freeze({
  NEXUS: "Nexus",
  EXORDIUM: "Exordium",
  LIBERTI: "Liberti",
  AGATHOI: "Agathoi",
  FABEOT: "Fabeot"
});

const StatusKinds = Object.freeze({
  BLEED: "bleed",
  THORNS: "thorns",
  INHIBIT_ACTION: "inhibitAction",
  INHIBIT_ATTACK: "inhibitAttack",
  INHIBIT_MOVE: "inhibitMove",
  UNTARGETABLE: "untargetable",
  RAID_MARK: "raidMark",
  LOGISTIC_CHOKE: "logisticChoke",
  PURPLE_SENTENCE: "purpleSentence",
  COLLECTION_CONTRACT: "collectionContract"
});

const AbilityKinds = Object.freeze({
  DAMAGE: "damage",
  DIRECT_DAMAGE: "directDamage",
  SHRED: "shred",
  HEAL: "heal",
  STATUS: "status",
  BUFF: "buff",
  ECONOMY: "economy",
  PS_LOCK: "psLock",
  CONVERT: "convert",
  POSITIONING: "positioning"
});

const WinTypes = Object.freeze({
  PRESSURE: "pressione",
  HQ: "qg",
  RESIGN: "resa",
  TECHNICAL_RESIGN: "resa_tecnica",
  ROUND_LIMIT: "limite_round"
});

const PlayerModes = Object.freeze({
  HUMAN: "human",
  BOT: "bot"
});
