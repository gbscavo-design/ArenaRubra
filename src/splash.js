"use strict";

// Arena Rubra – C2e-6a APK-M4c. Splash/audio flow inherited from C2e-4h1; full log export microfix applied elsewhere.
// Flusso richiesto:
// - musica in loop avviata quando compare il logo G vibe dev;
// - splash G vibe dev senza pulsanti, 5 secondi, click/touch passa alla title;
// - transizione dev -> nero -> title, con fade più lento sulla title;
// - title resta sullo sfondo finché non si preme il solo pulsante Starter Game : Blueprint.

const ARENA_SPLASH_DEV_MS = 5000;
const ARENA_SPLASH_BLACKOUT_MS = 520;

const arenaSplashState = {
  phase: "boot",
  leavingDev: false,
  titleReady: false,
  hidden: false,
  musicStarted: false,
  timers: []
};

function arenaSplashElement() {
  return document.getElementById("appSplash");
}

function arenaIntroAudio() {
  return document.getElementById("introMusic");
}

function clearArenaSplashTimers() {
  for (const id of arenaSplashState.timers) clearTimeout(id);
  arenaSplashState.timers.length = 0;
}

function setArenaSplashPhase(phase) {
  const splash = arenaSplashElement();
  if (!splash) return;
  arenaSplashState.phase = phase;
  splash.dataset.splashPhase = phase;
  splash.querySelectorAll(".splashSlide").forEach(slide => {
    slide.classList.toggle("isActive", slide.dataset.splashPanel === phase);
  });
}

async function tryStartArenaMusic() {
  const audio = arenaIntroAudio();
  if (!audio || arenaSplashState.musicStarted) return true;
  try {
    audio.loop = true;
    audio.volume = 0.67;
    await audio.play();
    arenaSplashState.musicStarted = true;
    return true;
  } catch (_) {
    return false;
  }
}

function armAudioFallbackOnce() {
  const unlock = () => {
    tryStartArenaMusic();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("touchstart", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

function showTitleSplash() {
  if (arenaSplashState.hidden) return;
  arenaSplashState.leavingDev = false;
  arenaSplashState.titleReady = true;
  setArenaSplashPhase("title");
}

function leaveDevSplash() {
  if (arenaSplashState.hidden || arenaSplashState.leavingDev || arenaSplashState.titleReady) return;
  arenaSplashState.leavingDev = true;
  clearArenaSplashTimers();
  setArenaSplashPhase("blackout");
  arenaSplashState.timers.push(setTimeout(showTitleSplash, ARENA_SPLASH_BLACKOUT_MS));
}

function enterArena(ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  if (!arenaSplashState.titleReady) return;
  const splash = arenaSplashElement();
  if (!splash || arenaSplashState.hidden) return;
  arenaSplashState.hidden = true;
  clearArenaSplashTimers();
  tryStartArenaMusic();
  splash.classList.add("isHidden");
  setTimeout(() => {
    if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
  }, 720);
}

function bindArenaSplash() {
  const splash = arenaSplashElement();
  if (!splash || splash.dataset.apkM3bBound === "1") return;
  splash.dataset.apkM3bBound = "1";

  const enter = document.getElementById("splashEnterBtn");
  if (enter) enter.addEventListener("click", enterArena);

  // Nella prima schermata qualunque click/touch passa alla seconda.
  splash.addEventListener("pointerup", ev => {
    if (arenaSplashState.phase === "dev" || arenaSplashState.phase === "boot") {
      ev.preventDefault();
      ev.stopPropagation();
      tryStartArenaMusic();
      leaveDevSplash();
    }
  });

  // Tastiera utile in desktop/debug: Enter sulla title entra, altrimenti salta alla title.
  window.addEventListener("keydown", ev => {
    if (arenaSplashState.hidden) return;
    if (ev.key === "Enter" && arenaSplashState.titleReady) enterArena(ev);
    else if (["Enter", " ", "Escape"].includes(ev.key) && !arenaSplashState.titleReady) leaveDevSplash();
  });
}

function startArenaSplashFlow() {
  const splash = arenaSplashElement();
  if (!splash) return;

  bindArenaSplash();

  setArenaSplashPhase("boot");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setArenaSplashPhase("dev");
      // L'audio viene avviato insieme alla comparsa del logo G vibe dev.
      // Se il runtime/WebView blocca l'autoplay, il primo gesto utente lo sblocca.
      tryStartArenaMusic().then(ok => { if (!ok) armAudioFallbackOnce(); });
      arenaSplashState.timers.push(setTimeout(leaveDevSplash, ARENA_SPLASH_DEV_MS));
    });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startArenaSplashFlow);
else startArenaSplashFlow();
