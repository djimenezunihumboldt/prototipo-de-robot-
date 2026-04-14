# T-800 IA Neural v3 — Robot 3D con IA

## 📋 Resumen

Proyecto educativo que simula un robot explorador autónomo con inteligencia artificial, visión 3D en tiempo real y navegación inteligente. Completamente reestructurado desde la versión monolítica original.

## ✅ Mejoras Implementadas

### 🏗️ Arquitectura Modular

El código original (1500+ líneas en un archivo) fue dividido en **9 módulos independientes**:

```text
robot/
├── index.html              # HTML principal
├── css/
│   └── styles.css          # Estilos globales
└── js/
    ├── utils.js            # Helpers y configuración
    ├── worldmap.js         # Generación del mundo
    ├── pathfinder.js       # Algoritmo A*
    ├── neural-network.js   # Red neuronal 5→4→3→6
    ├── voice.js            # Síntesis de voz en español
    ├── scene-builder.js    # Construcción 3D (luces, piso, muros)
    ├── robot-builder.js    # Construcción del robot T-800
    ├── robot-controller.js # MOTOR DE IA Y MOVIMIENTO
    └── simulation.js       # Renderización y loop principal
```

### 🤖 Robot Mejorado

#### Detección de Obstáculos Avanzada

- **rayDist()**: Raycast simple
- **rayDistAdvanced()**: Múltiples rayos simultáneos para mejor cobertura
- 9 sensores de radar en diferentes ángulos
- Detección sub-píxel cada 0.05 unidades

#### Anti-Oscilación Radical

**Problema anterior**: El robot se quedaba atrapado en rotaciones infinitas girar-izq ↔ girar-der

**Soluciones implementadas**:

1. **Detector de patrón**: Analiza las últimas 8 acciones
2. **Flujo alterno**: Detecta si alterna entre giros >4 veces
3. **Escape forzado**: Activa avance forzado durante 1.8-2.2 segundos
4. **Recálculo de ruta**: Encuentra el ángulo más abierto
5. **Lock rotacional**: Previene nuevas rotaciones inmediatas

```javascript
_isOscillating() {
  const turns = this.actionHistory.slice(-8)
    .filter(a => a === 'girar-izq' || a === 'girar-der');
  // Cuenta flips/alternaciones
  return flips >= 4;
}
```

#### Movimiento Mejorado

- **Sub-steps**: Movimiento en pasos de 0.05 unidades (mejor precisión)
- **Escape dinámico**: 5 radios de búsqueda para encontrar salidas
- **Stuck detection**: Contador que incrementa si no avanza
- **Replanificación automática**: Replán cada 1.5 segundos en auto

### 📹 Cámara Estabilizada

**Problema**: Cámara rotaba erráticamentemente con el robot

**Soluciones**:

- Lerp suave hacia la posición objetivo (velocidad adaptive)
- Distancia fija detrás del robot (8.5 unidades)
- Altura fija (7.5 unidades)
- Mira siempre a 1.5 unidades sobre el robot

```javascript
_updateCamera(dt) {
  const r = deg2rad(this.robotController.robotAngle);
  const targetDist = 8.5;
  const targetHeight = 7.5;
  this.camTarget.set(
    this.robot.position.x - Math.sin(r) * targetDist,
    targetHeight,
    this.robot.position.z - Math.cos(r) * targetDist
  );
  // Lerp adaptativo
  const camDist = this.camera.position.distanceTo(this.camTarget);
  const lerpSpeed = clamp(camDist * 0.02, 0.02, 0.1);
  this.camera.position.lerp(this.camTarget, lerpSpeed);
}
```

### 🧠 IA Mejorada

- Red neuronal con mejores pesos calibrados
- Detección avanzada: rayos múltiples en cono de visión
- Decisiones más inteligentes basadas en 5 inputs sensoriales
- Protocolo de respuesta a audio mejorado

### 🌍 Navegación A*

- Algoritmo A* de 8-direccionales
- Heurística Manhattan mejorada
- BFS para exploración de frontera
- Límite de 5000 iteraciones (previene bloqueo)

## 🎮 Controles

### Automático (Modo Recomendado)

- **Botón ▶ AUTO**: Activa/desactiva modo autónomo
- El robot decide acciones basadas en IA

### Manual

- **↑ / W**: Avanzar
- **↓ / S**: Retroceder
- **← / A**: Girar izquierda
- **→ / D**: Girar derecha
- **Espacio**: Toggle auto mode

### UI Interactivo

- **Sliders de sensores**: Modifica luz, audio, radar, térmica, energía
- **+ MURO**: Agrega obstáculos aleatorios
- **⟳ RST**: Reinicia la simulación
- **[ VOZ ON/OFF ]**: Activa/desactiva síntesis de voz

## 📊 Paneles de Información

### Status (Superior Izquierda)

- Modo actual del robot
- Objetivo (coordenadas A*)
- Orientación (ángulo)
- Obstáculos evitados
- Pasos tomados
- Porcentaje del mapa explorado
- Barra de energía

### Sensores (Superior Derecha)

- Visión (luz)
- Audio (sonido)
- Radar (distancia)
- Térmica
- Energía (batería)

### Red Neuronal (Inferior Izquierda)

Visualización en tiempo real de:

- Entrada (5 neuronas): luz, audio, radar, térmica, batería
- Capa oculta 1 (4 neuronas)
- Capa oculta 2 (3 neuronas)
- Salida (6 neuronas): 6 acciones posibles

### Protocoles Activos (Inferior Derecha)

Muestra qué acción está activa y con qué confianza (%).

## 🔧 Configuración (CONFIG en utils.js)

```javascript
GRID_SIZE: 26,                           // Tamaño del mundo
ROBOT_RADIUS: 0.38,                     // Radio de colisión
SPEED: 2.4,                             // Velocidad de movimiento
TURN_SPEED: 102,                        // Velocidad de rotación (°/s)
FORCED_FWD_DURATION: 1.8,              // Duración de escape forzado
STUCK_THRESHOLD: 5,                     // Pasos antes de escape
TURN_LOCK_DURATION: 0.9,               // Segundos de lock rotacional
```

## 🚀 Cómo Usar

### Local

1. Coloca el proyecto en un servidor local (Python: `python -m http.server`)
2. Abre `http://localhost:8000`

### GitHub Pages

1. Crea un repositorio
2. Sube los archivos (mantén la estructura de carpetas)
3. Settings → Pages → Source: main branch
4. Tu sitio estará en `https://tu-usuario.github.io/robot/`

## 🎯 Mejoras Técnicas Clave

| Problema | Solución | Resultado |
| --- | --- | --- |
| Robot atrapado en rotación | Detector de oscilación + escape forzado | ✅ Casi nunca se queda stuck |
| Tropieza constantemente | Rayos múltiples + detección sub-píxel | ✅ Evita mejor los obstáculos |
| Cámara inconsistente | Seguimiento con lerp adaptativo | ✅ Cámara suave y estable |
| IA predecible | Red neuronal mejorada | ✅ Decisiones más inteligentes |
| Código mantenimiento difícil | Modularización en 9 archivos | ✅ Fácil de entender y extender |

## 📚 Estructura del Código

### Flujo Principal

```text
index.html (carga módulos ES6)
  ↓
Application constructor
  ├→ Renderer & Scene setup
  ├→ WorldMap generación
  ├→ SceneBuilder (luces, piso, muros)
  ├→ RobotBuilder (construye T-800)
  ├→ Pathfinder (A*)
  ├→ RobotController (IA y movimiento)
  └→ Simulation (loop de renderización)
```

### Loop de IA

```text
Simulation.loop(dt)
  ├→ RobotController.decide()
  │   ├→ Lee sensores (luz, audio, radar, térmica, batería)
  │   ├→ Forward pass red neuronal
  │   └→ Elige acción basada en outputs
  ├→ RobotController.applyMovement(dt, action)
  │   ├→ Detecta colisiones
  │   ├→ Aplica movimiento si es seguro
  │   ├→ Antioscilación si es necesario
  │   └→ Replanifica ruta si vacía
  ├→ Simulation._updateCamera()
  ├→ Simulation._updateRays()
  ├→ Simulation._drawNN()
  └→ renderer.render()
```

## 🐛 Debugging

### El robot se queda stuck

- Verifica que la detección de oscilación está activada
- Reduce `STUCK_THRESHOLD` en CONFIG

### La cámara se mueve erráticaily

- Verifica el lerp speed en `_updateCamera()`
- Aumento `0.02` para más responsividad

### IA toma decisiones tontas

- Revisa los pesos de la red neuronal en `neural-network.js`
- Aumenta los valores de sensor en los sliders

## 📝 Próximas Mejoras Sugeridas

- [ ] Mapa de calor visual del área explorada
- [ ] Guardado de rutas previas
- [ ] Múltiples robots cooperativos
- [ ] Editor visual de pesos neuronales
- [ ] Estadísticas de eficiencia
- [ ] Grabación de sesiones

## 🎓 Conceptos Aprendidos

1. **Pathfinding**: A* con heurística Manhattan
2. **IA**: Red neuronal feed-forward con backprop
3. **3D**: Three.js, materiales, sombras, iluminación
4. **Detección de colisiones**: Raycast y AABB
5. **Antialiasing de comportamiento**: Detección de patrones
6. **Suavizado de animaciones**: Lerp y easing

---

**Versión**: 3.0 Reestructurada
**Líneas de código**: ~3000 (modularizadas)
**Módulos**: 9
**Sensores**: 5
**Neuronas**: 5→4→3→6
**FPS objetivo**: 60
