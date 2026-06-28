"use strict";

// Arena Rubra – Fase B1 data extraction.
// File dati estratto da src/main.js senza modificare il gameplay.

const STATS_STORAGE_KEY = "arenaRubra.matchupStats.v1";
const START_ENE = 3;
const BASE_INCOME = 3;
const COMMANDER_FIELD_LIMIT = 1;
const LIGHT_FIELD_LIMIT = 10;
const HEAVY_FIELD_LIMIT = 2;
const ELITE_FIELD_LIMIT = 1;
const PIVOT_FIELD_LIMIT = 1;
const STRUCTURE_FIELD_LIMIT = 6;
const AGATHOI_STRUCTURE_FIELD_LIMIT = 7;
const PRESSURE_START_ROUND = 30;
const PRESSURE_WIN = 5;
const MAX_ROUND = 50;
const AUTO_RESIGN_ROUND = 25;
const AUTO_RESIGN_STREAK = 3;
const QG_THREAT_RANGE = 3;
const PACE_PRESETS = Object.freeze({
      standard: { key:"standard", label:"Standard", pressureStartRound:30, lightCapDefault:10, lightCapByFaction:{}, vehicleMove:1 },
      competitive: { key:"competitive", label:"Rapida / Competitive", pressureStartRound:20, lightCapDefault:5, lightCapByFaction:{ Liberti:7 }, vehicleMove:2 }
    });
const HEX_W = 66;
const CENTER_X = 460;
const CENTER_Y = 390;
const HEX_SIZE = 31;
const CONFIG = Object.freeze({
      version: (typeof buildInfoLabel === "function" ? buildInfoLabel() : "C2-STABLE-1-F9P1b-APK-M4c"),
      map: { radius: RADIUS, hqPositions: HQ_POS, psCoords: PS_COORDS },
      pacePresets: PACE_PRESETS,
      economy: { startEne: START_ENE, baseIncome: BASE_INCOME, supportsCostModifiers:true, supportsIncomeModifiers:true, maxHandSize:10, deckRecoveryCost:5, deckRecoveryDraw:3 },
      limits: {
        commander: COMMANDER_FIELD_LIMIT,
        light: LIGHT_FIELD_LIMIT,
        heavy: HEAVY_FIELD_LIMIT,
        elite: ELITE_FIELD_LIMIT,
        pivot: PIVOT_FIELD_LIMIT,
        structure: STRUCTURE_FIELD_LIMIT
      },
      victory: {
        pressureStartRound: PRESSURE_START_ROUND,
        pressureWin: PRESSURE_WIN,
        maxRound: MAX_ROUND,
        qgThreatRange: QG_THREAT_RANGE
      }
    });
