# F9P1 – Persistent Storage + Asset Manifest Foundation

## Base
`C2-STABLE-1-F9H3-APK-M4c Deck Save/Load + Setup Integration`.

## Obiettivo
Consolidare la persistenza prima del renderer carte, evitando che Deck Builder e statistiche dipendano direttamente da chiamate sparse a `localStorage`.

## Storage
Aggiunto `src/storage.js` con funzioni per:

- custom deck save/load/export/import;
- storico matchup legacy;
- storico partite persistente leggero;
- settings future;
- copia testo JSON;
- lettura/scrittura JSON centralizzate.

La chiave deck F9H3 `arenaRubraF9H3SavedDecksV1` è stata mantenuta per compatibilità: i deck già salvati non vengono persi.

## Deck Builder
Il Deck Builder continua a funzionare come F9H3, ma ora passa dallo storage layer. Aggiunti pulsanti:

- `Esporta tutti deck JSON`;
- `Importa deck JSON`;
- `Copia manifest asset carte`.

## Statistiche persistenti
`matchStats` rimane il contenitore in memoria della partita corrente. Alla fine partita viene salvato anche un record leggero nello storico persistente.

Il pannello Stats ora distingue:

- partita corrente;
- storico partite persistente JSON;
- storico matchup/CSV legacy.

Lo storico partite non salva il log completo: per quello restano i pulsanti di export log/eventi JSON.

## Asset carte
Aggiunto `src/card_assets.js` con:

- path cornici e retro per le 5 fazioni;
- path attesi delle illustrazioni;
- coordinate e misure derivate dal Card Composer allegato;
- manifest dinamico generato dal catalogo carte;
- policy: cornici/retro leggeri nel progetto, illustrazioni pesanti inserite manualmente.

## Directory asset prevista
Vedi `assets/cards/README.md`.

## Non modificato
Nessuna modifica a gameplay, AI, deck rules runtime, effetti tattiche, mappa, roster, costi, HP/DEF/ATT, splash/audio, UI mobile partita o regola danno no-overflow.
