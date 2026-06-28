"use strict";

// Arena Rubra – Fase B1 data extraction.
// File dati estratto da src/main.js senza modificare il gameplay.

const RADIUS = 6;
const HQ_MARKER = "QG";
const CENTER_PS_COORD = [0,0,0];
const CENTER_OPENING_END_ROUND = 4;
const CENTER_CONTEST_END_ROUND = 7;
const HQ_POS = { 1: [-6, 0, 6], 2: [6, 0, -6] };
// MAP1: PS invariati per funzione tattica, con nuovo margine esterno su radius 6.
const PS_COORDS = [[0,0,0], [0,-4,4], [0,4,-4]];
