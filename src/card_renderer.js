
"use strict";

// Arena Rubra – F9I1 Card Renderer Preview Foundation.
// Preview canvas non distruttiva: usa i dati del catalogo, il manifest asset carte e le coordinate del Card Composer.
// Scopo: anteprima leggibile nel Deck Builder senza toccare il gameplay o richiedere ancora tutte le illustrazioni finali.

const CARD_RENDERER_STATE = {
  selectedCardId: "",
  selectedSource: "",
  lastContext: "deckBuilder"
};

const CARD_RENDERER_FACTION_STYLE = Object.freeze({
  nexus: { text: "#d8dde6", textShadow: "rgba(0,0,0,.88)", stroke: "rgba(0,0,0,.82)", base: "#0f1e35", accent: "#2c5ea9" },
  exordium: { text: "#ffd35a", textShadow: "rgba(0,0,0,.88)", stroke: "rgba(0,0,0,.82)", base: "#34110f", accent: "#7f2917" },
  liberti: { text: "#ffe29a", textShadow: "rgba(0,0,0,.88)", stroke: "rgba(0,0,0,.82)", base: "#35250f", accent: "#866227" },
  agathoi: { text: "#f1e8aa", textShadow: "rgba(0,0,0,.88)", stroke: "rgba(0,0,0,.82)", base: "#273617", accent: "#557437" },
  fabeot: { text: "#d5d5df", textShadow: "rgba(0,0,0,.88)", stroke: "rgba(0,0,0,.82)", base: "#231d37", accent: "#55428a" },
  neutral: { text: "#ececec", textShadow: "rgba(0,0,0,.88)", stroke: "rgba(0,0,0,.82)", base: "#24262f", accent: "#525866" }
});

const cardRendererImageCache = Object.create(null);

function cardRendererSelectCard(cardId, source = "") {
  CARD_RENDERER_STATE.selectedCardId = String(cardId || "");
  CARD_RENDERER_STATE.selectedSource = String(source || "");
  return CARD_RENDERER_STATE.selectedCardId;
}

function cardRendererCurrentCardId() {
  return CARD_RENDERER_STATE.selectedCardId || "";
}

function cardRendererFactionStyle(card) {
  const key = typeof cardAssetFactionKey === "function" ? cardAssetFactionKey(card) : "neutral";
  return CARD_RENDERER_FACTION_STYLE[key] || CARD_RENDERER_FACTION_STYLE.neutral;
}

function cardRendererSourceBlueprint(card) {
  if (!card || card.sourceType !== "unit" || typeof BLUEPRINTS === "undefined") return null;
  return (BLUEPRINTS || []).find(bp => bp && bp.id === card.blueprintId) || null;
}

function cardRendererSourceTactic(card) {
  if (!card || card.sourceType !== "tactic" || typeof DECK_TACTICS === "undefined") return null;
  return (DECK_TACTICS || []).find(t => t && t.id === card.tacticId) || null;
}

function cardRendererTypeText(card) {
  if (!card) return "—";
  if (card.sourceType === "tactic") {
    return ["TATTICA", card.category].filter(Boolean).join(" · ").toUpperCase();
  }
  return [card.unitType, card.weight].filter(Boolean).join(" · ").toUpperCase() || String(card.cardType || "CARTA").toUpperCase();
}

function cardRendererDescriptionText(card) {
  if (!card) return "";
  if (card.sourceType === "tactic") {
    const tactic = cardRendererSourceTactic(card);
    return [card.effectText, tactic && tactic.notes, tactic && tactic.target ? `Bersaglio: ${tactic.target}.` : ""].filter(Boolean).join(" ").trim();
  }
  const bp = cardRendererSourceBlueprint(card);
  const parts = [];
  if (bp && bp.ability && bp.ability.description) {
    const abilityLabel = bp.ability.name ? `${bp.ability.name}: ` : "";
    parts.push(`${abilityLabel}${bp.ability.description}`);
  }
  if (bp && bp.psBonus && bp.psBonus.description) parts.push(bp.psBonus.description);
  if (!parts.length) parts.push("Anteprima dati base: in questa fase il renderer usa catalogo + manifest asset. Testo regole/abilità completo integrabile nelle prossime sottofasi.");
  return parts.join(" ");
}

function cardRendererStat(card, key) {
  const bp = cardRendererSourceBlueprint(card);
  if (bp && Number.isFinite(bp[key])) return bp[key];
  if (Number.isFinite(card && card[key])) return card[key];
  if (key === "cost" && Number.isFinite(card && card.cost)) return card.cost;
  return null;
}

function cardRendererNormalizeDescription(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function cardRendererLoadImage(src, onDone) {
  if (!src) return null;
  const cached = cardRendererImageCache[src];
  if (cached) {
    if (cached.status === "loaded") return cached.img;
    if (cached.status === "error") return null;
    if (typeof onDone === "function") cached.listeners.push(onDone);
    return null;
  }
  const img = new Image();
  cardRendererImageCache[src] = { status: "loading", img, listeners: typeof onDone === "function" ? [onDone] : [] };
  img.onload = () => {
    const entry = cardRendererImageCache[src];
    if (!entry) return;
    entry.status = "loaded";
    const listeners = entry.listeners.splice(0);
    listeners.forEach(fn => { try { fn(); } catch (_) {} });
  };
  img.onerror = () => {
    const entry = cardRendererImageCache[src];
    if (!entry) return;
    entry.status = "error";
    const listeners = entry.listeners.splice(0);
    listeners.forEach(fn => { try { fn(); } catch (_) {} });
  };
  img.src = src;
  return null;
}

function cardRendererSetFont(ctx, size, weight = "700", family = "Georgia, 'Times New Roman', serif") {
  ctx.font = `${weight} ${Math.max(10, Math.round(size))}px ${family}`;
}

function cardRendererFitFont(ctx, text, maxWidth, maxSize, minSize, weight = "700") {
  let size = maxSize;
  for (; size >= minSize; size -= 1) {
    cardRendererSetFont(ctx, size, weight);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return minSize;
}

function cardRendererWrapText(ctx, text, maxWidth) {
  const tokens = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  tokens.forEach(token => {
    const probe = current ? `${current} ${token}` : token;
    if (ctx.measureText(probe).width <= maxWidth || !current) current = probe;
    else { lines.push(current); current = token; }
  });
  if (current) lines.push(current);
  return lines;
}

function cardRendererDrawTextBlock(ctx, text, area, options = {}) {
  const normalized = cardRendererNormalizeDescription(text);
  if (!normalized) return;
  const maxFont = area.maxFontSize || 32;
  const minFont = area.minFontSize || 18;
  const weight = options.weight || area.weight || "500";
  const lineHeightRatio = area.lineHeightRatio || 1.16;
  let fontSize = maxFont;
  let lines = [];
  for (; fontSize >= minFont; fontSize -= 1) {
    cardRendererSetFont(ctx, fontSize, weight);
    lines = cardRendererWrapText(ctx, normalized, area.w);
    const lineHeight = fontSize * lineHeightRatio;
    if (lines.length * lineHeight <= area.h) break;
  }
  cardRendererSetFont(ctx, fontSize, weight);
  const lineHeight = fontSize * lineHeightRatio;
  const totalHeight = lines.length * lineHeight;
  let y = area.y + Math.max(0, (area.h - totalHeight) / 2) + fontSize;
  lines.forEach(line => {
    ctx.fillText(line, area.x, y);
    y += lineHeight;
  });
}

function cardRendererDrawOutlinedText(ctx, text, x, y, opts = {}) {
  const fill = opts.fill || "#f5f5f5";
  const stroke = opts.stroke || "rgba(0,0,0,.82)";
  const lineWidth = Number.isFinite(opts.lineWidth) ? opts.lineWidth : Math.max(2, (opts.fontSize || 20) * 0.08);
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(String(text || ""), x, y);
  ctx.fillStyle = fill;
  ctx.fillText(String(text || ""), x, y);
}

function cardRendererDrawCardBase(ctx, canvas, card) {
  const style = cardRendererFactionStyle(card);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, style.base || "#20242f");
  grad.addColorStop(1, style.accent || "#4f5866");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function cardRendererDrawArtArea(ctx, card, layout, redraw) {
  const artPath = typeof cardAssetArtPathFor === "function" ? cardAssetArtPathFor(card) : "";
  const placeholderPath = typeof cardAssetEntryFor === "function" ? (cardAssetEntryFor(card).placeholderPath || "") : "";
  const artArea = layout.image;
  const transform = layout.imageTransform || { zoom: 1, offsetX: 0, offsetY: 0 };
  const artImg = cardRendererLoadImage(artPath, redraw);
  const placeholderImg = cardRendererLoadImage(placeholderPath, redraw);
  const img = artImg || placeholderImg;
  if (img && img.width && img.height) {
    const zoom = Number.isFinite(transform.zoom) ? transform.zoom : 1;
    const drawW = artArea.w * zoom;
    const drawH = artArea.h * zoom;
    const drawX = artArea.x + (artArea.w - drawW) / 2 + (transform.offsetX || 0);
    const drawY = artArea.y + (artArea.h - drawH) / 2 + (transform.offsetY || 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(artArea.x, artArea.y, artArea.w, artArea.h);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  } else {
    const grad = ctx.createLinearGradient(artArea.x, artArea.y, artArea.x + artArea.w, artArea.y + artArea.h);
    grad.addColorStop(0, "rgba(255,255,255,.08)");
    grad.addColorStop(1, "rgba(0,0,0,.18)");
    ctx.fillStyle = grad;
    ctx.fillRect(artArea.x, artArea.y, artArea.w, artArea.h);
    ctx.strokeStyle = "rgba(255,255,255,.18)";
    ctx.lineWidth = 3;
    ctx.strokeRect(artArea.x + 4, artArea.y + 4, artArea.w - 8, artArea.h - 8);
  }
}

function cardRendererDrawFrame(ctx, card, redraw) {
  const framePath = typeof cardAssetFramePathFor === "function" ? cardAssetFramePathFor(card) : "";
  const frameImg = cardRendererLoadImage(framePath, redraw);
  if (frameImg && frameImg.width && frameImg.height) {
    ctx.drawImage(frameImg, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

function cardRendererDrawStats(ctx, card, layout, style) {
  const stat = layout.statText || {};
  const cost = cardRendererStat(card, "cost");
  const hp = cardRendererStat(card, "hp");
  const def = cardRendererStat(card, "def");
  const att = cardRendererStat(card, "att");
  ctx.textAlign = "center";
  if (stat.ene) {
    cardRendererSetFont(ctx, stat.ene.valueSize || 100, "700");
    cardRendererDrawOutlinedText(ctx, Number.isFinite(cost) ? cost : "—", stat.ene.cx, stat.ene.valueY, { fill: style.text, stroke: style.stroke, fontSize: stat.ene.valueSize || 100, lineWidth: 7 });
  }
  if (card.sourceType !== "tactic") {
    if (stat.hp) {
      cardRendererSetFont(ctx, stat.hp.valueSize || 100, "700");
      cardRendererDrawOutlinedText(ctx, Number.isFinite(hp) ? hp : "—", stat.hp.cx, stat.hp.valueY, { fill: style.text, stroke: style.stroke, fontSize: stat.hp.valueSize || 100, lineWidth: 7 });
    }
    if (stat.def) {
      cardRendererSetFont(ctx, stat.def.valueSize || 70, "700");
      cardRendererDrawOutlinedText(ctx, Number.isFinite(def) ? def : "—", stat.def.cx, stat.def.valueY, { fill: style.text, stroke: style.stroke, fontSize: stat.def.valueSize || 70, lineWidth: 5 });
    }
    if (stat.att) {
      cardRendererSetFont(ctx, stat.att.valueSize || 100, "700");
      cardRendererDrawOutlinedText(ctx, Number.isFinite(att) ? att : "—", stat.att.cx, stat.att.valueY, { fill: style.text, stroke: style.stroke, fontSize: stat.att.valueSize || 100, lineWidth: 7 });
    }
  }
  ctx.textAlign = "left";
}

function renderArenaCardPreviewCanvas(canvas, card, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") return false;
  const redraw = () => {
    if (canvas.isConnected) renderArenaCardPreviewCanvas(canvas, card, options);
  };
  const ctx = canvas.getContext("2d");
  const kind = typeof cardAssetKind === "function" ? cardAssetKind(card) : (card && card.sourceType === "tactic" ? "tactic" : "unit");
  const layout = CARD_COMPOSER_TEMPLATE_GEOMETRY[kind] || CARD_COMPOSER_TEMPLATE_GEOMETRY.unit;
  const style = cardRendererFactionStyle(card);
  canvas.width = CARD_COMPOSER_TEMPLATE_GEOMETRY.canvas.w;
  canvas.height = CARD_COMPOSER_TEMPLATE_GEOMETRY.canvas.h;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  cardRendererDrawCardBase(ctx, canvas, card);

  if (!card) {
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.textAlign = "center";
    cardRendererSetFont(ctx, 42, "700");
    ctx.fillText("Seleziona una carta", canvas.width / 2, canvas.height / 2 - 20);
    cardRendererSetFont(ctx, 24, "400", "system-ui, sans-serif");
    ctx.fillText("Deck Builder · anteprima renderer F9I1", canvas.width / 2, canvas.height / 2 + 26);
    return true;
  }

  cardRendererDrawArtArea(ctx, card, layout, redraw);
  cardRendererDrawFrame(ctx, card, redraw);

  ctx.fillStyle = style.text;
  ctx.strokeStyle = style.stroke;
  ctx.shadowColor = style.textShadow;
  ctx.shadowBlur = 0;

  const nameArea = layout.textAreas.name;
  const typeArea = layout.textAreas.type;
  const descArea = layout.textAreas.description;
  const nameFont = cardRendererFitFont(ctx, card.name || "Carta", nameArea.w, nameArea.maxFontSize || 48, nameArea.minFontSize || 28, nameArea.weight || "700");
  cardRendererSetFont(ctx, nameFont, nameArea.weight || "700");
  ctx.fillText(String(card.name || "Carta"), nameArea.x, nameArea.y + nameFont);

  const typeText = cardRendererTypeText(card);
  const typeFont = cardRendererFitFont(ctx, typeText, typeArea.w, typeArea.maxFontSize || 28, typeArea.minFontSize || 16, typeArea.weight || "700");
  cardRendererSetFont(ctx, typeFont, typeArea.weight || "700");
  ctx.fillText(typeText, typeArea.x, typeArea.y + typeFont);

  const description = cardRendererDescriptionText(card);
  cardRendererSetFont(ctx, descArea.maxFontSize || 34, descArea.weight || "500");
  cardRendererDrawTextBlock(ctx, description, descArea, { weight: descArea.weight || "500" });

  cardRendererDrawStats(ctx, card, layout, style);
  return true;
}

function deckBuilderPreviewCardFromReport(report) {
  const sourceCards = [];
  if (report && Array.isArray(report.deck)) sourceCards.push(...report.deck);
  const pool = report && report.faction ? (typeof deckBuilderPoolFor === "function" ? deckBuilderPoolFor(report.faction, report.commanderId, deckBuilderCatalog()) : []) : [];
  sourceCards.push(...pool);
  const targetId = cardRendererCurrentCardId();
  const match = targetId ? sourceCards.find(card => card && card.id === targetId) : null;
  return match || sourceCards[0] || null;
}

function renderDeckBuilderCardPreview(report) {
  if (typeof document === "undefined") return null;
  const canvas = document.getElementById("deckBuilderCardPreviewCanvas");
  const meta = document.getElementById("deckBuilderCardPreviewMeta");
  const body = document.getElementById("deckBuilderCardPreviewBody");
  const card = deckBuilderPreviewCardFromReport(report);
  if (card) cardRendererSelectCard(card.id, "deckBuilder");
  renderArenaCardPreviewCanvas(canvas, card);
  if (meta) {
    meta.textContent = card
      ? `${card.faction || "—"} · ${card.sourceType === "tactic" ? "Tattica" : "Unità"} · ${card.id || ""}`
      : "Nessuna carta selezionata.";
  }
  if (body) {
    if (!card) {
      body.innerHTML = `<div class="deckBuilderPreviewHelp">Seleziona una riga dal draft o dal pool per vedere l'anteprima della carta.</div>`;
    } else {
      const entry = typeof cardAssetEntryFor === "function" ? cardAssetEntryFor(card) : null;
      const desc = cardRendererNormalizeDescription(cardRendererDescriptionText(card));
      body.innerHTML = `
        <div class="deckBuilderPreviewStats">
          <span><strong>Ruolo</strong> ${dbEscapeHtml(typeof deckBuilderRoleLabel === "function" ? deckBuilderRoleLabel(card) : (card.deckRole || "—"))}</span>
          <span><strong>Tipo</strong> ${dbEscapeHtml(typeof deckBuilderTypeLabel === "function" ? deckBuilderTypeLabel(card) : cardRendererTypeText(card))}</span>
          <span><strong>ENE</strong> ${Number.isFinite(cardRendererStat(card, "cost")) ? cardRendererStat(card, "cost") : "—"}</span>
          ${card.sourceType !== "tactic" ? `<span><strong>HP</strong> ${Number.isFinite(cardRendererStat(card, "hp")) ? cardRendererStat(card, "hp") : "—"}</span>
          <span><strong>DEF</strong> ${Number.isFinite(cardRendererStat(card, "def")) ? cardRendererStat(card, "def") : "—"}</span>
          <span><strong>ATT</strong> ${Number.isFinite(cardRendererStat(card, "att")) ? cardRendererStat(card, "att") : "—"}</span>` : ""}
        </div>
        <div class="deckBuilderPreviewDesc">${dbEscapeHtml(desc || "Nessun testo carta disponibile nel catalogo.")}</div>
        <div class="deckBuilderPreviewPaths">
          <div><strong>Frame:</strong> <code>${dbEscapeHtml(entry && entry.framePath || "")}</code></div>
          <div><strong>Art:</strong> <code>${dbEscapeHtml(entry && entry.artPath || "")}</code></div>
          <div><strong>Placeholder:</strong> <code>${dbEscapeHtml(entry && entry.placeholderPath || "")}</code></div>
        </div>`;
    }
  }
  return card;
}
