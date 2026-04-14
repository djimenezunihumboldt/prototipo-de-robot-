---
name: flujo-memoria
description: 'Skill para recordar todo el contexto del proyecto y facilitar el trabajo. Úsalo siempre para iniciar tareas complejas, revisar memoria, planificar con TODOs y actualizar documentación como IMPROVEMENTS_V4.md y VERIFICATION.md.'
argument-hint: '¿Qué tarea deseas realizar manteniendo el contexto actualizado?'
---

# Flujo de Memoria y Facilitador de Trabajo

Este skill asegura que el agente recuerde todo el contexto del proyecto antes de actuar, organice el trabajo paso a paso para facilitarlo, y registre los cambios para no perder avance.

## Cuándo usar
- Al iniciar una sesión de trabajo o una nueva característica.
- Cuando la tarea tiene múltiples pasos y es crucial no perder detalles.
- Para asegurar que los archivos de documentación (como `IMPROVEMENTS_V4.md` o `VERIFICATION.md`) se mantengan actualizados con los cambios realizados.

## Procedimiento Paso a Paso

1. **Recuperación de Contexto (Recordar todo):**
   - El agente debe leer primero `VERIFICATION.md` e `IMPROVEMENTS_V4.md` usando la herramienta `read_file` para entender en qué estado quedó el proyecto.
   - Revisar la memoria del usuario, sesión o repositorio si están disponibles.

2. **Planificación Estructurada (Facilitar el trabajo):**
   - Usa la herramienta `manage_todo_list` para crear una lista de tareas claras, pequeñas y accionables.
   - Mantén visible el progreso marcando una única tarea como `in-progress` a la vez y cambiándola a `completed` de inmediato al terminar.

3. **Ejecución y Verificación:**
   - Realiza los cambios necesarios en el código (HTML, JS, CSS).
   - Valida que no se rompan las funcionalidades previas.

4. **Actualización de Memoria (No perder avance):**
   - Al finalizar, actualiza siempre `VERIFICATION.md` con las nuevas implementaciones comprobadas.
   - Si quedan tareas pendientes, agrégalas a `IMPROVEMENTS_V4.md`.
   - Crea o actualiza notas en `/memories/session/` si hubo lecciones aprendidas importantes.
