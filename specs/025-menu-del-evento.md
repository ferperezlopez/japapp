# 025 - Menú del evento y sugerencias al crear

- **Estado:** In Progress (código y migración listos y probados en una réplica local de la base; falta aplicar la `0049` a la base viva, correr el relleno de los eventos pasados y desplegar)
- **Rutas:** `/eventos` (formulario de alta), `/eventos/[eventId]` (encabezado y edición)
- **Migraciones relacionadas:** `supabase/migrations/0049_event_menu.sql`
- **Última actualización:** 2026-11-01

## 1. Resumen

Pedido del usuario (2026-11-01): «al crear un evento, sugerir menú en base a los
anteriores y según tiempo que no se come».

Como organizador, quiero que al armar un evento nuevo la app me diga qué menús
hicimos antes y hace cuánto no hacemos cada uno (empanadas hace 6 semanas, asado
hace 2 días), para variar sin tener que acordarme.

## 2. Alcance

### Incluye
- Un campo **Menú** opcional en el evento (alta y edición): una lista corta
  (Asado, Empanadas, Pizza, Pastas, Hamburguesas) con autocompletado, y cualquier
  otro texto (hasta 40 caracteres).
- Al crear un evento, **sugerencias** arriba del campo: los menús que ya se hicieron
  en eventos anteriores, del que hace más tiempo que no se hace al más reciente, con
  su antigüedad («🥟 Empanadas · hace 6 semanas»). Tocar una sugerencia completa el
  campo.
- El menú se ve en el encabezado del evento («🥩 Asado»).
- Relleno de los eventos pasados con el menú que se infiere de sus insumos asignados
  (ver sección 3), para que las sugerencias sirvan desde el primer día.

### No incluye (por ahora)
- Un catálogo de menús editable (con íconos propios): la lista es una constante en
  código y los menús escritos a mano se agrupan por nombre.
- El menú en la lista de eventos, en las notificaciones o en Analytics.
- Sugerir según la temporada, la cantidad de gente o el clima.
- Más de un menú por evento (un evento con «Asado y empanadas» cuenta como un menú
  propio).

## 3. Modelo de datos

> Ver `supabase/migrations/0049_event_menu.sql`: una columna `events.menu` de texto,
> opcional, de 1 a 40 caracteres.

Lo que el SQL no explica por sí solo:
- **Es texto libre, no una tabla.** La lista de la app (`MENU_OPTIONS` en
  `src/lib/eventos/menu.ts`) es solo comodidad; al guardar, lo escrito se normaliza
  (espacios) y, si coincide con uno de la lista sin importar mayúsculas ni tildes, se
  guarda con su escritura canónica (`parseMenu`): «asado» → «Asado». Para comparar se
  ignoran mayúsculas, tildes y espacios (`normalizeMenu`): «Choripan» y «Choripán» son
  el mismo menú.
- **Sin cambios de permisos.** El menú se edita como el resto de los datos del evento:
  quien lo creó o un admin, y con el evento cerrado, solo un admin (0043 y 0044).
- **Relleno de los eventos pasados**, una sola vez, por fuera de la migración (es un
  dato, no esquema), a partir de los insumos asignados en «Compra de insumos»:
  1. un evento con un insumo que contenga «empanada» (Tapas de empanadas, Relleno
     empanadas) → **Empanadas**;
  2. si no, uno con Carbón, Carne o Entrañas → **Asado**;
  3. nunca pisa un menú ya cargado, y un evento sin pistas queda sin menú.
  Con los datos al 2026-11-01 da: 18/9 Empanadas; 2/10, 16/10 y 30/10 Asado. La regla
  está probada en `supabase/verify/0046_0049_gastos_bebidas_clima_menu.sql` (sección I).

## 4. Diseño / flujo

1. `/eventos` lee el menú de los eventos que lo tienen (consulta aparte, para que una
   columna que todavía no exista no se lleve puesta la lista) y calcula
   `suggestMenus(historial, ahora)`: agrupa por menú normalizado, se queda con la fecha
   de la última vez y cuenta cuántas veces se hizo; solo cuentan eventos que ya pasaron.
   Orden: más días desde la última vez primero; a igual antigüedad, el que más se hizo;
   después, alfabético. Hasta 4.
2. `CreateEventForm` → `EventFormFields` muestra las sugerencias como botones sobre el
   campo «Menú»; la antigüedad se escribe con `formatDaysAgo` («ayer», «hace 5 días»,
   «hace 6 semanas», «hace 3 meses»).
3. `createEvent` / `updateEvent` leen `menu` con `parseMenu`: vacío es «sin menú»
   (`null`; al editar, vaciar el campo lo borra), uno demasiado largo se rechaza con un
   aviso antes de tocar la base. `createEvent` no manda la columna si no hay menú.
4. La página del evento lee el menú en una consulta aparte y lo muestra en el
   encabezado; el formulario de edición lo trae cargado.

## 5. Criterios de aceptación

- [x] Las sugerencias son los menús de eventos pasados, ordenados por hace cuánto no se
      hacen, con su antigüedad en días de calendario de Buenos Aires
      (`src/lib/eventos/menu.test.ts`).
- [x] «asado», «Asado » y «ASADO» son un solo menú; «Choripan» y «Choripán» también.
- [x] Los eventos futuros y los que no tienen menú no cuentan.
- [x] Tocar una sugerencia completa el campo; el campo acepta uno de la lista (con
      autocompletado) o cualquier texto de hasta 40 caracteres.
- [x] Crear un evento sin menú anda como siempre (no manda la columna); vaciar el menú al
      editar lo borra; uno de más de 40 caracteres se rechaza antes de tocar la base
      (`src/app/eventos/actions.test.ts`).
- [x] La base rechaza un menú vacío o de más de 40 caracteres y respeta los permisos de
      siempre sobre el evento (`supabase/verify/0046_0049_gastos_bebidas_clima_menu.sql`,
      sección I).
- [x] El relleno de los eventos pasados asigna Empanadas / Asado según los insumos, no
      pisa un menú cargado y deja sin menú a quien no tiene pistas (sección I).
- [x] El menú se ve en el encabezado del evento y viene cargado al editarlo.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Un campo `events.menu` de texto libre, con una lista corta de comodidad | Una tabla de menús (catálogo con íconos), como `insumo_items` | Hoy no existe el concepto y el grupo hizo dos menús en cuatro eventos: un catálogo editable es más UI y más datos para casi nada. Si crece, se migra el texto a un catálogo. |
| Se sugiere solo lo que ya se hizo, ordenado por hace cuánto | Inventar menús nuevos («probemos pizza») | Es lo que se pidió: «en base a los anteriores y según tiempo que no se come». |
| Relleno inferido de los insumos asignados, con un `UPDATE` suelto | Cargarlo a mano evento por evento, o no rellenar | Sin historial las sugerencias no sirven al principio; los insumos (carbón, tapas de empanadas) lo dicen sin ambigüedad en estos cuatro eventos. Va por fuera de la migración porque es un dato. |
| Los días se cuentan en el calendario de Buenos Aires | Horas transcurridas | «Hace 2 días» es lo que se dice a viva voz; con horas, un asado de anteayer a la noche figuraba «hace 1 día». |
| El menú y la lista de eventos se leen en consultas aparte | Sumar `menu` a las consultas principales | Si el código llega antes que la migración, falla solo la consulta del menú y no la lista de eventos ni la página del evento. |
| Un menú escrito a mano se guarda tal cual; uno de la lista, con su escritura canónica | Guardar siempre lo tipeado | Evita «asado» y «Asado» como dos menús en el historial. |

## 7. Futuro / fuera de alcance

- Mostrar el menú en la lista de eventos y en Analytics (qué se come más, con qué
  asistencia).
- Un catálogo de menús editable.
- Sugerir según temporada, clima o cantidad de gente.

## 8. Changelog

- 2026-11-01: creada. Columna `events.menu` (`0049_event_menu.sql`),
  `src/lib/eventos/menu.ts` (lista, normalización, sugerencias y antigüedad), campo y
  sugerencias en `EventFormFields`, `createEvent`/`updateEvent`, menú en el encabezado
  del evento y relleno de los eventos pasados (Empanadas el 18/9; Asado el 2/10, 16/10 y
  30/10).
