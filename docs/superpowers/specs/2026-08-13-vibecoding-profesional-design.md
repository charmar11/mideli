# Skill global Vibecoding Profesional

## Objetivo

Crear una skill global para que una persona sin conocimientos de programación pueda pedir funciones, correcciones, pulido visual y preparación de entregas en distintos proyectos con un flujo consistente y verificable.

## Alcance

La skill debe:

- Leer primero las reglas, documentación, estado de Git y estructura del proyecto.
- Distinguir entre consulta, diagnóstico, implementación y despliegue.
- Convertir peticiones ambiguas en un alcance concreto sin frenar trabajo seguro.
- Seleccionar únicamente las skills especializadas necesarias para cada tarea.
- Preservar cambios existentes y evitar refactorizaciones no relacionadas.
- Implementar cambios completos, con especial atención a móvil, tablet, rendimiento, accesibilidad, seguridad y datos.
- Ejecutar las verificaciones definidas por el repositorio y revisar el diff final.
- Explicar el resultado en lenguaje sencillo.

## Flujo

1. Descubrir reglas y contexto del repositorio.
2. Confirmar el resultado esperado y los riesgos materiales.
3. Preparar un plan breve cuando la tarea tenga varias partes.
4. Elegir skills por dominio, sin cargar combinaciones innecesarias.
5. Implementar cambios pequeños y coherentes con el código existente.
6. Verificar pruebas, lint, tipos y build disponibles.
7. Revisar seguridad, rendimiento, regresiones y cambios ajenos.
8. Entregar un resumen con archivos, validaciones y cualquier paso pendiente.

## Seguridad operativa

La skill puede leer, editar y probar dentro del alcance pedido. Debe exigir autorización explícita para publicar, enviar mensajes, aplicar migraciones remotas, eliminar datos, modificar producción o realizar acciones externas difíciles de revertir. Una autorización general anterior no se debe reutilizar automáticamente en otro proyecto.

Nunca debe leer ni mostrar secretos. Debe conservar archivos no relacionados y preferir acciones reversibles.

## Distribución

Se instalará como `vibecoding-profesional` en la ubicación global de skills de Codex. No incluirá reglas de Mideli, dependencias obligatorias ni scripts propios. Se apoyará en las skills disponibles en cada instalación y seguirá las instrucciones del repositorio actual.

## Validación

- Validar estructura y metadatos con `quick_validate.py`.
- Comprobar que Codex detecte la skill desde otra carpeta.
- Revisar que no contenga rutas, marcas, credenciales o comandos específicos de Mideli.
- Probar al menos un caso de función nueva, un diagnóstico y una entrega final simulada sin tocar producción.
