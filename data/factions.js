"use strict";

// Arena Rubra – Fase B1 data extraction.
// File dati estratto da src/main.js senza modificare il gameplay.

const AI_PROFILES = Object.freeze({
      control: { label:"Controllo", guardPs:true, protectCommander:true, qgDefense:true },
      assault: { label:"Assalto", twoFronts:true, qgPressure:true, breakPressure:true },
      swarm: { label:"Sciame", packMovement:true, flankAfterFirstPs:true, bleedingPriority:true },
      endurance: { label:"Logoramento", guardPs:true, structureReliance:true, lateGame:true },
      manipulation: { label:"Manipolazione", economyControl:true, protectCommander:true, avoidAttrition:true }
    });
const FACTIONS = {
      Nexus: {
        label:"Nexus", key:"nexus", color:"#2b6fb8", soft:"#173a61",
        aiProfile:"control", rules:["psControlBonuses"]
      },
      Exordium: {
        label:"Exordium", key:"exordium", color:"#b43a32", soft:"#5b1e1a",
        aiProfile:"assault", rules:["assaultPressure"]
      },
      Liberti: {
        label:"Liberti", key:"liberti", color:"#b88720", soft:"#5d4211",
        aiProfile:"swarm", rules:["numericalSuperiority", "bleedingAttacks"]
      },
      Agathoi: {
        label:"Agathoi", key:"agathoi", color:"#4f9d58", soft:"#214e2a",
        aiProfile:"endurance", rules:["agathoiEndurance"]
      },
      Fabeot: {
        label:"Fabeot", key:"fabeot", color:"#8a4fb0", soft:"#3f2458",
        aiProfile:"manipulation", rules:["fabeotManipulation"]
      }
    };
