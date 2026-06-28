# Arena Rubra – Card assets directory

F9P1 prepara il percorso asset per il futuro Card Renderer senza includere immagini pesanti nelle patch di codice.

## Cornici e retro
Inserire qui i file leggeri condivisi:

```text
assets/cards/frames/nexus_unit_frame.png
assets/cards/frames/nexus_tactic_frame.png
assets/cards/frames/nexus_back.png
assets/cards/frames/exordium_unit_frame.png
assets/cards/frames/exordium_tactic_frame.png
assets/cards/frames/exordium_back.png
assets/cards/frames/liberti_unit_frame.png
assets/cards/frames/liberti_tactic_frame.png
assets/cards/frames/liberti_back.png
assets/cards/frames/agathoi_unit_frame.png
assets/cards/frames/agathoi_tactic_frame.png
assets/cards/frames/agathoi_back.png
assets/cards/frames/fabeot_unit_frame.png
assets/cards/frames/fabeot_tactic_frame.png
assets/cards/frames/fabeot_back.png
```

## Illustrazioni
Le illustrazioni pesanti non devono essere incluse nelle patch ordinarie. Il manifest generato da `copyCardAssetManifestJson()` indica il path atteso per ogni carta.

Esempi:

```text
assets/cards/art/nexus/units/nx_drone_geniere.png
assets/cards/art/nexus/tactics/nxtac_protocollo_di_blocco.png
assets/cards/art/exordium/units/ex_carro_leggero.png
```

Regole nome file:

- minuscolo;
- niente spazi;
- niente accenti;
- solo lettere, numeri e underscore;
- estensione `.png`.

## Dimensioni consigliate dal Card Composer

- Unità / comandanti / strutture: `1664x1700 px`.
- Tattiche: `1664x1400 px`.

## Placeholder
Il futuro renderer dovrà usare placeholder se l'art non è presente:

```text
assets/cards/placeholders/missing_art_unit.png
assets/cards/placeholders/missing_art_tactic.png
```
