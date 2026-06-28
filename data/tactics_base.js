"use strict";

// Arena Rubra – Fase B1 data extraction.
// File dati estratto da src/main.js senza modificare il gameplay.

const TACTICS = Object.freeze([
      { id:"NX_TAC_RECALC", faction:"Nexus", name:"Ricalcolo Strategico", cost:2, cooldown:2, target:"ally", kind:"healArmorOnPS", description:"Una tua unità su PS recupera 1 HP e 1 DEF fino ai massimi." },
      { id:"NX_TAC_BLOCK", faction:"Nexus", name:"Protocollo di Blocco", cost:1, cooldown:2, target:"enemy", kind:"damageNearPS", value:1, description:"1 danno a un nemico su PS o adiacente a un PS." },
      { id:"EX_TAC_ORDER", faction:"Exordium", name:"Ordine d’Assalto", cost:2, cooldown:2, target:"ally", kind:"assaultOrder", description:"Una tua fanteria e un tuo veicolo adiacenti ottengono +1 ATT fino a fine turno." },
      { id:"EX_TAC_PUSH", faction:"Exordium", name:"Spinta di Guerra", cost:3, cooldown:3, target:"ally", kind:"warPush", description:"Un tuo veicolo non ancora attivato muove di +1 e può ancora agire." },
      { id:"LX_TAC_HORDE", faction:"Liberti", name:"Carica dell’Orda", cost:3, cooldown:3, target:"ally", kind:"hordeCharge", description:"Una tua unità e gli alleati adiacenti ottengono +1 ATT fino a fine turno." },
      { id:"LX_TAC_RAID", faction:"Liberti", name:"Razzie Rapide", cost:0, cooldown:2, target:"enemy", kind:"raidMark", description:"Marchia un nemico; se muore entro il turno, guadagni +1 ENE." },
      { id:"AG_TAC_ROOTS", faction:"Agathoi", name:"Radici Difensive", cost:2, cooldown:2, target:"ally", kind:"defensiveRoots", description:"Una tua unità su PS o struttura ottiene Spine 2 per un turno." },
      { id:"AG_TAC_WALL", faction:"Agathoi", name:"Muro Verde", cost:3, cooldown:2, target:"none", kind:"greenWall", description:"Le tue unità adiacenti a una tua struttura recuperano +1 DEF fino al massimo." },
      { id:"FB_TAC_CHOKE", faction:"Fabeot", name:"Strozzatura Logistica", cost:1, cooldown:2, target:"enemy", kind:"logisticChoke", description:"Marchia un nemico; se attacca, Fabeot guadagna +2 ENE." },
      { id:"FB_TAC_CONTRACT", faction:"Fabeot", name:"Contratto Capestro", cost:4, cooldown:3, target:"none", kind:"contractTrap", description:"Il nemico paga +1 ENE per acquistare unità fino alla fine del suo prossimo turno." }
    ]);
