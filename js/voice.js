/**
 * T-800 IA Neural v3 — Síntesis de voz en español
 */

export const VoiceModule = (() => {
  let enabled = false;
  let busy = false;
  const queue = [];
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voicesReady = false;
  let primeDone = false;
  let retryTimer = null;

  const PHRASES = {
    saludo: [
      'Hola, profesora Ofelia. Ya estoy listo para comenzar.',
      'Buenos días, profesora Ofelia. Sistema encendido y misión preparada.',
      'Saludos, profesora Ofelia. Estoy activo y listo para avanzar.',
      'Hola, profesora Ofelia. Ya puede empezar la exploración.',
    ],
    start: [
      'Hola, profesora Ofelia. Soy el robot explorador creado por el ingeniero Daniel Jiménez. Primero saludo, luego avanzo, y si la energía baja regreso al centro de recarga.',
      'Profesora Ofelia, ya estoy listo. Mi misión es explorar, evitar obstáculos y volver a cargar cuando sea necesario.',
      'Hola, profesora Ofelia. Inicio el recorrido con cuidado, manteniendo la ruta limpia y la batería bajo control.',
    ],
    avanzar: [
      'Camino libre. Continúo con paso firme.',
      'La ruta está despejada. Avanzo hacia el siguiente punto.',
      'Veo un tramo seguro. Sigo adelante.',
      'Paso sin obstáculos. Mantengo el rumbo.',
      'Todo despejado. Prosigo con la navegación.',
    ],
    girar: [
      'Detecté un obstáculo. Giro para rodearlo.',
      'Cambio de dirección para mantener la ruta libre.',
      'Hay una pared cerca. Corrijo el rumbo.',
      'Voy a rodear el objeto y sigo adelante.',
    ],
    retroceder: [
      'Estoy demasiado cerca del obstáculo. Retrocedo.',
      'No hay espacio suficiente. Doy marcha atrás.',
      'Paso bloqueado. Retrocedo para buscar salida.',
      'La distancia es corta. Me alejo un poco y reintento.',
    ],
    explorar: [
      'Voy a una zona que todavía no conozco.',
      'Estoy revisando un sector nuevo del mapa.',
      'Exploro terreno sin registrar.',
      'Busco áreas nuevas para completar el mapa.',
    ],
    responder: [
      'Escuché una señal. La estoy procesando.',
      'Recibí un estímulo. Respondo con calma.',
      'Detecté actividad. Analizo la información.',
    ],
    stuck: [
      'Me detuve un momento. Recalculando la mejor salida.',
      'La ruta se cerró. Busco otra opción.',
      'Estoy atascado. Replanifico para seguir avanzando.',
      'Bloqueo detectado. Busco una abertura mejor.',
    ],
    reset: [
      'Sistema reiniciado. Vuelvo a estado inicial.',
      'Reinicio completo. Listo para una nueva misión.',
      'Listo. Vuelvo a empezar desde cero.',
    ],
    lowbat: [
      'Batería baja: {battery} por ciento. Estoy en el sector {x}, {z} y regreso a la base central de recarga.',
      'Energía en {battery} por ciento. Desde {x}, {z} voy hacia la estación de recarga.',
      'Nivel bajo de energía. Estoy en {x}, {z} y vuelvo al centro de carga.',
      'Me queda poca energía. Repliego al punto de carga desde {x}, {z}.',
    ],
    recharge: [
      'Ya estoy en la base de recarga, en {x}, {z}. Cargando energía ahora mismo.',
      'Llegué al centro de recarga. Recuperando batería en {x}, {z}.',
      'Me conecto a la estación central para recargar.',
      'Estoy en la base. Recupero energía para continuar.',
    ],
    charged: [
      'Batería recuperada. Retomo la exploración.',
      'Carga completada. Puedo seguir la misión.',
      'Energía suficiente otra vez. Continúo navegando.',
      'Listo. La batería volvió a niveles normales.',
    ],
    explore_done: [
      'Misión de exploración completada. Ya conozco todo el sector.',
      'Mapeo terminado. Mantendré vigilancia mientras espero nuevas órdenes.',
      'Sector completo. Ya registré la zona principal.',
    ],
    progress: [
      'Avanzo sin problemas. El mapa se está completando.',
      'Mi recorrido sigue estable y ordenado.',
      'Buen progreso. Sigo registrando terreno nuevo.',
      'Todo marcha bien. La ruta sigue limpia.',
    ],
    obstacle: [
      'Hay muchos obstáculos en esta zona. Avanzo con cuidado.',
      'Detecto bloqueo cercano. Ajusto la ruta para no perder tiempo.',
      'Objeto cercano. Cambio el paso antes de tocarlo.',
    ],
  };

  function format(text, ctx = {}) {
    return String(text).replace(/\{(\w+)\}/g, (_, key) => {
      const value = ctx[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  function pick(key, ctx = {}) {
    const v = PHRASES[key];
    if (!v) return 'Procesando.';
    const raw = Array.isArray(v)
      ? v[Math.floor(Math.random() * v.length)]
      : v;
    return format(raw, ctx);
  }

  function speak(text) {
    if (!enabled || !text) return;
    queue.push(text);
    if (!busy) process();
  }

  function updateButton() {
    const btn = document.getElementById('vbtn');
    if (!btn) return;
    btn.textContent = enabled ? '[ VOZ ON ]' : '[ VOZ OFF ]';
    btn.style.color = enabled ? '#00d4ff' : '#2a5070';
    updateStateChip();
  }

  function updateStateChip() {
    const chip = document.getElementById('vstate');
    if (!chip) return;

    let text = 'VOZ: OFF';
    let klass = 'off';

    if (!synth) {
      text = 'VOZ: NO DISPONIBLE';
      klass = 'bad';
      chip.title = 'Tu navegador no soporta SpeechSynthesis.';
    } else if (!enabled) {
      text = 'VOZ: OFF';
      klass = 'off';
      chip.title = 'Pulsa [ VOZ OFF ] para activar la voz.';
    } else if (busy) {
      text = 'VOZ: HABLANDO';
      klass = 'ok';
      chip.title = 'La síntesis está reproduciendo audio.';
    } else if (voicesReady || primeDone) {
      text = 'VOZ: LISTA';
      klass = 'ok';
      chip.title = 'Voz desbloqueada y lista para hablar.';
    } else {
      text = 'VOZ: BLOQUEADA';
      klass = 'warn';
      chip.title = 'Haz clic o toca la pantalla y luego pulsa [ VOZ OFF ] para desbloquear en Chrome.';
    }

    chip.textContent = text;
    chip.className = 'pn ' + klass;
  }

  function getVoicesSafe() {
    if (!synth) return [];
    const voices = synth.getVoices() || [];
    if (voices.length) voicesReady = true;
    return voices;
  }

  function unlock() {
    if (!synth) return;
    primeDone = true;
    synth.resume();
    getVoicesSafe();
    updateStateChip();
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (enabled && queue.length && !busy) {
      process();
    }
  }

  function process() {
    if (!queue.length || !enabled) {
      busy = false;
      hide();
      return;
    }

    if (!synth) {
      updateStateChip();
      setTimeout(process, 2500);
      return;
    }

    synth.resume();
    const voices = getVoicesSafe();
    if (!voices.length) {
      busy = false;
      updateStateChip();
      retryTimer = setTimeout(process, 350);
      return;
    }

    busy = true;
    const text = queue.shift();
    show(text);

    synth.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    const esVoices = voices.filter((v) => (v.lang || '').startsWith('es'));
    const naturalVoice = esVoices.find((v) =>
      /google|microsoft|helena|sabina|soledad|jorge|pablo|diego|miguel|carlos|antonio/i.test(v.name)
    );
    const expressiveVoice = esVoices.find((v) =>
      /natural|neural|online|españa|mexico|méxico/i.test(v.name)
    );

    const selected = expressiveVoice || naturalVoice || esVoices[0] || voices[0] || null;
    if (selected) {
      utt.voice = selected;
      if (selected.lang) utt.lang = selected.lang;
    } else {
      utt.lang = 'es-ES';
    }
    utt.rate = 0.92;
    utt.pitch = 0.95;
    utt.volume = 1;
    utt.onstart = () => {
      busy = true;
      updateStateChip();
    };
    utt.onend = () => {
      busy = false;
      updateStateChip();
      setTimeout(process, 300);
    };
    utt.onerror = () => {
      busy = false;
      hide();
      updateStateChip();
      setTimeout(process, 350);
    };

    // En Chrome, un micro-delay tras cancel() mejora la fiabilidad.
    setTimeout(() => {
      try {
        synth.speak(utt);
      } catch {
        busy = false;
        hide();
        updateStateChip();
      }
    }, 35);
  }

  const cooldowns = {};
  let lastGlobalSpeak = 0;
  const GLOBAL_COOLDOWN = 14000; // 14 segundos de silencio global por defecto

  function speakOnce(key, interval = 8000, ctx = {}) {
    const now = Date.now();
    
    // Evitar que el robot hable tan seguido (Global mute) excepto para el arranque o finalización
    const isPriority = key === 'start' || key === 'explore_done';
    if (!isPriority && now - lastGlobalSpeak < GLOBAL_COOLDOWN) {
      return;
    }
    
    if ((cooldowns[key] || 0) + interval > now) return;
    
    cooldowns[key] = now;
    if (!isPriority) lastGlobalSpeak = now;
    
    speak(pick(key, ctx));
  }

  function speakContext(key, ctx = {}, interval = 8000) {
    speakOnce(key, interval, ctx);
  }

  function clearCooldown(key) {
    delete cooldowns[key];
  }

  function show(text) {
    const b = document.getElementById('sb');
    const t = document.getElementById('speech-text');
    if (b) b.style.display = 'block';
    if (t) t.textContent = text;
  }

  function hide() {
    const b = document.getElementById('sb');
    if (b) b.style.display = 'none';
  }

  function toggle(forceState, announce = true) {
    if (forceState !== undefined) {
      if (enabled === Boolean(forceState)) return;
      enabled = Boolean(forceState);
    } else {
      enabled = !enabled;
    }

    updateButton();

    if (enabled) {
      if (announce && synth) {
        unlock();
        setTimeout(() => speak(pick('saludo')), 700);
      }
    } else {
      if (synth) synth.cancel();
      queue.length = 0;
      busy = false;
      hide();
      updateStateChip();
    }
  }

  if (synth) {
    synth.onvoiceschanged = () => {
      getVoicesSafe();
      updateStateChip();
      if (enabled && queue.length && !busy) {
        process();
      }
    };

    // Pre-carga inicial de voces en navegadores que tardan en exponerlas.
    setTimeout(() => getVoicesSafe(), 100);
    setTimeout(() => getVoicesSafe(), 500);
  }

  setTimeout(() => updateStateChip(), 0);

  return {
    speak,
    speakOnce,
    speakContext,
    clearCooldown,
    pick,
    toggle,
    unlock,
    get available() {
      return !!synth;
    },
    get ready() {
      return voicesReady || primeDone;
    },
    get enabled() {
      return enabled;
    },
  };
})();
