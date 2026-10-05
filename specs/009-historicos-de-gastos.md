# 009 - Históricos de gastos

- **Estado:** Implemented
- **Rutas:** `/gastos/historicos`
- **Migraciones relacionadas:** No aplica.
- **Última actualización:** 2026-10-05

## 1. Resumen

Como miembro del grupo, quiero que `/gastos` muestre primero mis grupos
más recientes/próximos, sin que la pantalla se llene si tengo muchos, y
poder ir a buscar el resto a un archivo aparte.

Desde 2026-10-05 "histórico" ya **no** significa "evento que ya pasó" —
significa "no entra en los primeros 5 de la pantalla principal", sea un
grupo realmente pasado o uno vigente que simplemente quedó afuera del
tope. Ver la sección 8 (Changelog) para el porqué de este cambio de
criterio.

## 2. Alcance

### Incluye

- `/gastos` (lista principal) muestra como máximo los primeros 5 grupos,
  ordenados por fecha efectiva descendente (la del evento enlazado, o
  `created_at` si el grupo es standalone) — sin importar si el evento ya
  pasó o es futuro.
- Nueva página `/gastos/historicos` con el resto (posición 6 en
  adelante), mismo orden.
- Botón "Ver histórico (N) →" en `/gastos`, visible solo si hay al menos
  un grupo que no entró en el top 5.
- Cada grupo histórico linkea a la misma página `/gastos/[groupId]` de
  siempre — no hay una vista "de solo lectura" distinta, el histórico es
  solo una forma distinta de *encontrar* el grupo.
- El badge "Pendiente" (saldo sin saldar, `hasPendingBalance`) puede
  aparecer en cualquiera de las dos listas — es independiente de la
  fecha: un grupo viejo con una deuda sin saldar lo sigue mostrando
  aunque esté en históricos.

### No incluye (por ahora)

- Resumen agregado (cuánto gastó cada persona sumando todos los
  históricos) — se pidió explícitamente para "más adelante", no ahora.
- Aplicar el mismo patrón a Eventos — mencionado como intención futura
  por el usuario, no parte de este alcance.
- Filtro/búsqueda dentro de históricos (por fecha, por nombre).

## 3. Modelo de datos

No aplica: no hay tablas ni columnas nuevas. El corte "principal vs.
histórico" es puramente de presentación (posición en un array ordenado
en memoria), no un estado persistido en `groups` ni en `events`.

## 4. Diseño / flujo

1. `getGroupsWithEventDates(supabase, userId)`
   (`src/lib/gastos/groups.ts`, compartido entre `/gastos` y
   `/gastos/historicos`) trae los grupos de los que el usuario es
   miembro, la `event_date` del evento enlazado a cada uno (si tiene), y
   `hasPendingBalance: boolean` — calculado en batch con
   `hasPendingSettlement` (`src/lib/gastos/balances.ts`), mismo criterio
   que usa `/gastos/[groupId]` para decidir si mostrar "Para saldar
   cuentas".
2. `sortGroupsByRecency(groups)` (mismo archivo) ordena por
   `eventDate ?? created_at` descendente — es la única fuente de verdad
   de orden, la usan ambas páginas.
3. `/gastos` toma `sortGroupsByRecency(allGroups).slice(0, 5)` para la
   lista principal, y muestra el botón a históricos con el conteo de los
   que quedaron afuera (`sorted.length - 5`).
4. `/gastos/historicos` toma `sortGroupsByRecency(allGroups).slice(5)` —
   el complemento exacto de lo anterior, mismo orden.
5. `formatGroupDateLabel(group, formatter)` (mismo archivo) arma el
   label de fecha de cada card: la del evento enlazado, o
   "Creado el ..." para uno standalone — reusado por ambas páginas.
6. `src/app/gastos/GroupListCard.tsx` es el componente compartido que
   renderizan ambas listas: nombre, fecha/etiqueta temporal, y el badge
   "Pendiente" cuando `hasPendingBalance` es true — en ambas páginas por
   igual, ya no es exclusivo de la lista principal.
7. El control de crear grupo (`CreateGroupForm`) es un botón de solo
   ícono (+) arriba a la derecha del encabezado de `/gastos` (un
   `<details>` cuyo panel se posiciona `absolute` para no empujar el
   título al abrirse), no un elemento de la lista.
8. `/gastos/[groupId]` no cambió: un grupo histórico se ve y se comporta
   exactamente igual que uno vigente (balances, gastos, "para saldar
   cuentas" — incluso se puede seguir cargando gastos ahí si alguien
   todavía no arregló cuentas de esa juntada).

## 5. Criterios de aceptación

- [x] `/gastos` muestra como máximo 5 grupos, los de fecha efectiva más
      reciente/próxima primero.
- [x] El grupo 6 en adelante (por esa misma fecha) aparece en
      `/gastos/historicos`, no en la lista principal.
- [x] Un grupo standalone (sin evento) entra en el mismo orden usando su
      `created_at` como fecha efectiva.
- [x] El botón "Ver histórico" no aparece si hay 5 grupos o menos en
      total.
- [x] El badge "Pendiente" aparece en el grupo que corresponda en
      cualquiera de las dos listas, sin alterar su posición en el orden
      por fecha.
- [x] Entrar a un grupo histórico desde `/gastos/historicos` lleva a la
      misma página de siempre, con toda la funcionalidad intacta.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Página separada `/gastos/historicos` en vez de un filtro/tab en la misma vista | Tabs "Vigentes" / "Históricos" dentro de `/gastos` | Pedido explícito del usuario: quería una sección separada, no todo mezclado con un filtro. |
| Corte por posición (top 5 de la lista ordenada por fecha) en vez de por `event_date < ahora` | Mantener el corte por fecha de evento | Pedido explícito del usuario (2026-10-05): quería la lista principal siempre acotada a 5, sin importar si esos 5 incluyen algún evento ya pasado o si quedan vigentes afuera. |
| Grupos standalone usan `created_at` como fecha efectiva para ordenar | Excluirlos del ordenamiento por fecha | Con el corte por posición (no por "pasado/futuro"), un standalone necesita algún valor para competir en el orden — `created_at` es lo único disponible y ya se usaba como fallback de *label* antes de este cambio. |
| El badge "Pendiente" no afecta el orden, solo es un indicador visual | Mantener el reordenamiento "pendiente primero" del cambio anterior (2026-10-03) | El usuario vio esa versión en producción y la rechazó explícitamente: pidió orden puramente cronológico: el destaque se queda, el salto de posición se saca. |

## 7. Futuro / fuera de alcance

- Mismo patrón para Eventos y (a futuro) para Estadísticas de partidos.
- Resumen agregado de gastos históricos por persona.
- Filtro/búsqueda dentro de `/gastos/historicos`.

## 8. Changelog

- 2026-09-15: creada e implementada.
- 2026-10-03: `/gastos` dejó de mostrar siempre expandido el formulario
  de crear grupo (pasa a un botoncito chico "+ Nuevo grupo" colapsado) y
  ahora muestra la fecha de cada grupo (la del evento enlazado, o "Creado
  el ..." para uno standalone) + un badge "Pendiente" y reordenamiento
  arriba de todo para el/los grupo(s) que todavía tienen saldo sin
  saldar — el mismo cálculo (`calcularBalances` + `simplificarDeudas`)
  que ya usaba `/gastos/[groupId]` para "Para saldar cuentas", ahora
  batcheado para toda la lista vía `getGroupsWithEventDates`.
- 2026-10-05: el usuario vio el cambio anterior en producción y pidió un
  layout distinto. Cambios: (1) el botón de crear grupo pasa de pastilla
  de texto a un ícono "+" solo, arriba a la derecha del encabezado; (2) el
  orden de la lista pasa a ser 100% por fecha descendente (ya no
  "pendiente primero"); (3) `/gastos` se corta en los primeros 5 grupos;
  (4) "histórico" deja de significar "evento pasado" y pasa a significar
  "no entra en el top 5" — `/gastos/historicos` ahora puede incluir
  grupos vigentes que simplemente no entraron. El badge "Pendiente" se
  mantiene como indicador visual (pedido explícito), y ahora se muestra
  también en `/gastos/historicos` (antes nunca aplicaba ahí).
