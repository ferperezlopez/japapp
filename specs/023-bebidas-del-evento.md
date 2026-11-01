# 023 - Bebidas del evento: calculadora y consumo real

- **Estado:** In Progress (código y migración listos y probados en una réplica local de la base; falta aplicar la `0047` a la base viva y desplegar)
- **Rutas:** `/calculadoras/bebidas`, `/eventos/[eventId]`
- **Migraciones relacionadas:** `supabase/migrations/0047_event_drinks.sql`
- **Última actualización:** 2026-11-01

## 1. Resumen

Pedido del usuario (2026-11-01): «sumar calculadora de bebidas» con la lógica de
su planilla (por persona: vino 0,5 botellas, cerveza 0,75 L, gaseosa 0,5 L) y
«habilitar la opción (no obligatoria) de marcar realmente cuánta bebida se
consumió sobre lo comprado, por tipo».

Como organizador, quiero saber cuánto vino, cerveza y gaseosa comprar según la
gente que va, y después —si quiero— anotar cuánto se compró y cuánto se tomó
de verdad, para comparar con lo sugerido y ajustar los factores con datos.

## 2. Alcance

### Incluye
- Pestaña **Bebidas** en `/calculadoras`: a partir de N personas, cantidad
  sugerida de vino (botellas), cerveza (L) y gaseosa (L). Mismo patrón que las
  otras calculadoras (`CalculatorForm`, resultado compartible).
- Tarjeta **Bebidas** en la página del evento (un `<details>`, entre las tareas y
  los gastos):
  - lo sugerido para la gente de la juntada (confirmados «Voy» + invitados a la
    juntada), con los mismos factores;
  - por tipo, dos campos **opcionales**: «Comprado» y «Consumido» (este último
    solo cuando el evento ya empezó);
  - ya cargado: lo consumido **por persona** contra lo que sugiere la calculadora,
    y lo que sobró (o cuánto se tomó de más de lo anotado como comprado).
- Editable por cualquier logueado mientras el evento no esté saldado; saldado,
  solo un admin (spec 022).

### No incluye (por ahora)
- Cambiar los factores desde la UI (son constantes en código, como en las otras
  calculadoras).
- Estadísticas del consumo real (promedios por persona, comparación entre eventos
  en Analytics): los datos quedan guardados para poder hacerlo.
- Más tipos de bebida (fernet, agua...): son los tres de la planilla.
- Tocar la calculadora de **Asado**, que trae sus propios factores de vino y gaseosa
  (0,4, de la planilla del asado). Si se quiere unificarlos, son dos números en
  `src/lib/calculators/asado.ts`.

## 3. Modelo de datos

> Ver `supabase/migrations/0047_event_drinks.sql` para la tabla, sus restricciones
> y las policies.

Lo que el SQL no explica por sí solo:
- No existen cantidades de compra en ningún otro lado: «Compra de insumos» y los
  gastos apuntan a un ítem del catálogo (Vinos, Cervezas...) sin cantidad. Por
  eso `event_drinks` guarda las dos cosas: `bought` y `consumed`.
- Una fila por evento y tipo (`vino`, `cerveza`, `gaseosa`: las claves de
  `DRINK_KEYS` en `src/lib/calculators/bebidas.ts`), con las unidades de la
  calculadora: botellas para el vino, litros para lo demás. Las dos cantidades son
  opcionales, pero una fila sin ninguna no tiene sentido (restricción): vaciar un
  tipo borra su fila.
- Permisos = los del resultado del partido (`futbol_stats`): cualquier logueado
  carga y corrige (`updated_by = auth.uid()`), y una policy restrictiva por comando
  deja solo al admin cuando el evento está **saldado** (`private.event_is_settled`,
  spec 022). El candado es el de «saldado» y no el de las 24 h porque el consumo se
  anota después del evento.

## 4. Diseño / flujo

1. `/calculadoras/bebidas` → `CalculatorForm` con `calcularBebidas(personas)`.
2. En `/eventos/[eventId]`, la página lee `event_drinks` del evento y calcula la
   gente de la juntada (confirmados + invitados). Si la consulta falla (la tabla
   todavía no existe), la tarjeta no se muestra.
3. «Guardar bebidas» → `saveEventDrinks(eventId, formData)`
   (`src/app/eventos/actions.ts`): valida las cantidades (`parseDrinksForm`,
   `src/lib/eventos/drinks.ts`: vacío = sin dato, coma o punto, 0 a 9999,99),
   consulta la guarda (`guardEdit(…, "settlement")`), hace `upsert` de los tipos con
   alguna cantidad y borra los que quedaron vacíos.
4. La tarjeta se vuelve a pintar con lo guardado: por persona, contra lo sugerido, y
   lo que sobró.

## 5. Criterios de aceptación

- [x] `/calculadoras/bebidas` con N personas muestra vino `0,5·N` botellas,
      cerveza `0,75·N` L y gaseosa `0,5·N` L, redondeado a 2 decimales; con una
      entrada inválida no muestra nada (`src/lib/calculators/bebidas.test.ts`).
- [x] La pestaña «Bebidas» aparece junto a Asado y Empanadas.
- [x] La tarjeta del evento sugiere según confirmados + invitados a la juntada, y
      sin gente lo dice.
- [x] Guardar con campos vacíos no guarda ceros: vacío es «sin dato»; un 0 escrito sí
      es un dato. Un tipo con las dos cantidades vacías no deja fila.
- [x] Lo consumido solo se pide cuando el evento ya empezó.
- [x] Con lo consumido cargado se ve lo consumido por persona contra lo sugerido y lo
      que sobró (`src/lib/eventos/drinks.test.ts`).
- [x] Cantidades negativas, con letras o pasadas del tope se rechazan con un aviso
      que nombra la bebida, antes de tocar la base
      (`src/app/eventos/actions.test.ts`).
- [x] Cualquier logueado carga y corrige hasta que el evento se salda (también con
      el evento cerrado con deuda); saldado, solo un admin
      (`supabase/verify/0046_0049_gastos_bebidas_clima_menu.sql`, sección G).
- [x] La tabla rechaza cantidades negativas, filas sin ninguna cantidad, tipos que no
      son los tres y un autor que no es quien guarda; las bebidas se borran con el
      evento (sección G).
- [x] Un evento saldado muestra los datos de bebidas sin campos, y sin datos lo dice.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Tabla propia `event_drinks` con `bought` y `consumed` por tipo | Columnas en `events`, o un `jsonb` | Una fila por tipo se consulta y se agrega fácil (para Analytics más adelante) y la restricción «al menos una cantidad» y las unidades por tipo se hacen cumplir en la base. |
| Los dos datos (comprado y consumido) son opcionales | Pedir siempre los dos | Pedido del usuario: «no obligatoria». Se puede anotar solo lo consumido, o solo lo comprado. |
| «Consumido» solo se pide cuando el evento empezó | Pedirlo siempre | Antes del evento no existe; evita datos inventados y una tarjeta cargada de campos. |
| La cantidad de gente es confirmados «Voy» + invitados a la juntada | Todos los miembros de la app, o los asistentes al fútbol | Es quien va a tomar; es lo mismo que cuenta el RSVP de la juntada (`RsvpSection`). |
| El candado es el de «saldado» (como el resultado del partido) | El de las 24 h de la historia del evento | El consumo se anota después del evento; con las 24 h, quien lo anota al otro día ya no podría. |
| La pestaña Bebidas va aparte y el Asado no se toca | Unificar los factores de vino y gaseosa del Asado (0,4) con los de la imagen (0,5) | No se pidió cambiar el Asado, que viene de otra planilla; son dos números si se quiere. |
| Factores como constantes en código | Una tabla de ajustes | Mismo criterio que las otras calculadoras (spec 001). Con los datos de consumo real se podrán ajustar a mano. |

## 7. Futuro / fuera de alcance

- Mostrar el consumo real por persona en Analytics (promedio por tipo, evolución) y,
  con eso, ajustar los factores.
- Unificar los factores del Asado con los de Bebidas, si se quiere.
- Otros tipos de bebida.

## 8. Changelog

- 2026-11-01: creada. Calculadora de bebidas (`src/lib/calculators/bebidas.ts`,
  `/calculadoras/bebidas`), tabla `event_drinks` (`0047_event_drinks.sql`),
  `saveEventDrinks`, `DrinksSection` en la página del evento y
  `src/lib/eventos/drinks.ts`. El aviso de evento saldado
  (`lockedMessage("settlement")`) ahora nombra las bebidas.
