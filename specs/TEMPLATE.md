# NNN - &lt;Nombre de la feature&gt;

- **Estado:** Draft
- **Rutas:** `/ruta`, `/ruta/[id]`
- **Migraciones relacionadas:** `supabase/migrations/000X_....sql` (o "No aplica")
- **Última actualización:** YYYY-MM-DD

## 1. Resumen

Qué es y por qué existe, en 2-4 líneas. Si aplica, como user story:
"Como &lt;rol&gt;, quiero &lt;acción&gt; para &lt;beneficio&gt;."

## 2. Alcance

### Incluye
-

### No incluye (por ahora)
-

## 3. Modelo de datos

Si usa DB, referenciar la migración en vez de repetir el schema:

> Ver `supabase/migrations/000X_....sql` para tablas, columnas y RLS.

Documentar acá solo lo que no se ve leyendo el SQL: por qué se modeló así,
relación con otras features, columnas reservadas a futuro.

Si es stateless: "No aplica: feature sin persistencia en DB."

## 4. Diseño / flujo

Paso a paso de la interacción principal (UI → server action → DB).

## 5. Criterios de aceptación

- [ ]
- [ ]

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|

## 7. Futuro / fuera de alcance

Qué se pospuso a propósito y por qué (para no re-litigarlo cada vez que
se toca esta feature).

## 8. Changelog

- YYYY-MM-DD: creada.
