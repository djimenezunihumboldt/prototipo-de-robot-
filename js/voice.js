/**
 * T-800 IA Neural v3 — Síntesis de voz en español
 */

export const VoiceModule = (() => {
  let enabled = false;
  let busy = false;
  const queue = [];

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

  function process() {
    if (!queue.length || !enabled) {
      busy = false;
      hide();
      return;
    }

    if (!('speechSynthesis' in window)) {
      setTimeout(process, 2500);
      return;
    }

    window.speechSynthesis.resume();
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      busy = false;
      setTimeout(process, 250);
      return;
    }

    busy = true;
    const text = queue.shift();
    show(text);

    window.speechSynthesis.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    const esVoices = voices.filter((v) => (v.lang || '').startsWith('es'));
    const naturalVoice = esVoices.find((v) =>
      /google|microsoft|helena|sabina|soledad|jorge|pablo|diego|miguel|carlos|antonio/i.test(v.name)
    );
    const expressiveVoice = esVoices.find((v) =>
      /natural|neural|online|españa|mexico|méxico/i.test(v.name)
    );

    utt.voice = expressiveVoice || naturalVoice || esVoices[0] || voices[0] || null;
    utt.rate = 0.92;
    utt.pitch = 0.95;
    utt.volume = 1;
    utt.lang = 'es-ES';
    utt.onend = () => setTimeout(process, 300);
    utt.onerror = () => {
      busy = false;
      hide();
    };

    window.speechSynthesis.speak(utt);
  }

  const cooldowns = {};

  function speakOnce(key, interval = 8000, ctx = {}) {
    const now = Date.now();
    if ((cooldowns[key] || 0) + interval > now) return;
    cooldowns[key] = now;
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

    const btn = document.getElementById('vbtn');

    if (enabled) {
      if (btn) {
        btn.textContent = '[ VOZ ON ]';
        btn.style.color = '#00d4ff';
      }

      if (announce && 'speechSynthesis' in window) {
        window.speechSynthesis.resume();
        window.speechSynthesis.getVoices();
        setTimeout(() => speak(pick('saludo')), 700);
      }
    } else {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      queue.length = 0;
      busy = false;
      hide();

      if (btn) {
        btn.textContent = '[ VOZ OFF ]';
        btn.style.color = '#2a5070';
      }
    }
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      if (enabled && queue.length && !busy) {
        process();
      }
    };
  }

  return {
    speak,
    speakOnce,
    speakContext,
    clearCooldown,
    pick,
    toggle,
    get enabled() {
      return enabled;
    },
  };
})();
