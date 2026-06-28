"use strict";

// Arena Rubra – Fase B1.5
// Utility geometriche per coordinate cubiche esagonali.
// Estratte da src/main.js senza cambiare gameplay.

const HEX_DIRECTIONS = Object.freeze([
  [1, -1, 0],
  [1, 0, -1],
  [0, 1, -1],
  [-1, 1, 0],
  [-1, 0, 1],
  [0, -1, 1]
]);

const coordKey = (c) => c.join(",");
const sameCoord = (a, b) => Boolean(a && b && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

function parseCoordKey(key) {
  return String(key).split(",").map(Number);
}

function isValidCubeCoord(coord) {
  return Array.isArray(coord) && coord.length === 3 && coord.every(Number.isFinite) && coord[0] + coord[1] + coord[2] === 0;
}



    function uniqueCoords(coords) {
      const seen = new Set();
      const out = [];
      for (const c of coords) {
        const key = coordKey(c);
        if (!seen.has(key)) { seen.add(key); out.push(c); }
      }
      return out;
    }




    function minDistance(coord, targets) { return Math.min(...targets.map(t => hexDistance(coord, t))); }



    function nearestCoord(from, coords) { return coords.slice().sort((a,b) => hexDistance(from,a) - hexDistance(from,b))[0] || null; }




    function hexDistance(a, b) {
      if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
      return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
    }



    function areAdjacent(a, b) { return hexDistance(a,b) === 1; }



    function neighbors(c) {
      if (!Array.isArray(c)) return [];
      return HEX_DIRECTIONS.map(d => [c[0]+d[0], c[1]+d[1], c[2]+d[2]]);
    }

