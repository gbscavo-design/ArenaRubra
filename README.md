# Arena Rubra – C2-STABLE-1-F9H1-APK-M4c

Build: Deck Builder Read/Validate Foundation.

Base: C2-STABLE-1-F9G-APK-M4c Camera Foundation.

F9H1 apre la fase Deck Builder in modalità prudente: aggiunge una schermata `Costruisci deck` reale ma di sola lettura/validazione. La schermata legge il catalogo carte esistente, permette di scegliere fazione e comandante, mostra starter esclusi dal deck, pool legale, template deck generato da 30 carte, regole copie e report JSON copiabile.

Questa build non salva deck personalizzati, non modifica il setup partita e non cambia il deck usato dal gameplay: integrazione, editing e save/load restano rinviati a F9H2/F9H3.

Starter Logic Freeze preservata: nessuna modifica a gameplay, AI, deck rules, tattiche, mappa, roster, costi, HP/DEF/ATT o regola danno no-overflow.

Vedi `docs/F9H1_DECK_BUILDER_READ_VALIDATE_FOUNDATION.md` e `docs/CHECK_F9H1_DECK_BUILDER_READ_VALIDATE_FOUNDATION.txt`.

---

# Arena Rubra – C2-STABLE-1-F9G-APK-M4c

Build: Camera Foundation.

Base: C2-STABLE-1-F9F-APK-M4c Stats & Export Foundation.

F9G formalizza una camera UI/render separata dallo stato logico della partita. Su desktop aggiunge modalità `Fit` e `Focus`: `Fit` chiude i pannelli e riadatta la board, `Focus` chiude i pannelli e centra la vista su unità selezionata, target/pending utile o QG del giocatore corrente. La camera APK-M4 mobile già validata resta preservata.

Starter Logic Freeze preservata: nessuna modifica a gameplay, AI, deck rules, tattiche, mappa, roster, costi, HP/DEF/ATT o regola danno no-overflow.

Vedi `docs/F9G_CAMERA_FOUNDATION.md` e `docs/CHECK_F9G_CAMERA_FOUNDATION.txt`.

---

# Arena Rubra – C2-STABLE-1-F9F-APK-M4c

Build: Stats & Export Foundation.

Base: C2-STABLE-1-F9E1-APK-M4c HUD & Panel Usability Hotfix.

F9F introduce matchStats in memoria alimentato dagli eventi tipizzati e aggiunge export strutturati dal pannello Stats: statistiche JSON, report sintetico, eventi JSON e log completo.

Starter Logic Freeze preservata: nessuna modifica a gameplay, AI, deck rules, tattiche, mappa, roster, costi, HP/DEF/ATT o regola danno no-overflow.

Vedi `docs/F9F_STATS_EXPORT_FOUNDATION.md` e `docs/CHECK_F9F_STATS_EXPORT_FOUNDATION.txt`.

---

# Arena Rubra – C2-STABLE-1-F9E1-APK-M4c

## HUD & Panel Usability Hotfix

Base: `C2-STABLE-1-F9E-APK-M4c HUD & Tactical Panel Flow`.

Questa microfix corregge la frizione UI emersa nei test F9E, senza modificare la logica Starter congelata.

### Correzioni F9E1

- `Fit` ora torna sempre alla mappa: chiude eventuali pannelli desktop/mobile, rimuove lo scrim e riadatta la board.
- Il PanelManager recupera correttamente la definizione del pannello prima di applicare `data-game-panel-placement`, evitando stati incompleti dei pannelli.
- `Gioca carta`, `Gioca ora` e `Piazza starter` chiudono in modo più robusto la Mano/Azioni quando l'azione è accettata e parte un flusso su mappa.
- Il pulsante `Unità` è stato rimosso dalla action bar desktop e mobile perché ridondante: la scheda unità appare già quando si seleziona un'unità sulla mappa e ha il proprio toggle `+ / −`.
- La action bar desktop ora ha: `Fit`, `Mano`, `Azioni`, `Log`, `Setup`, `Stats`.
- La mobile bar ora ha: `Fit`, `Focus`, `Azioni`, `Mano`, `Log`, `Opz`.

### Non modificato

Nessuna modifica a gameplay, AI, deck rules, effetti tattiche, mappa, roster, costi, HP/DEF/ATT, splash/audio o regola danno no-overflow.

### Build info

- `version`: `C2-STABLE-1-F9E1-APK-M4c`
- `buildName`: `HUD & Panel Usability Hotfix`
