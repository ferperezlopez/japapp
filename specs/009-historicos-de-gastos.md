# 009 - Históricos de gastos

- **Estado:** Implemented
- **Rutas:** `/gastos/historicos`
- **Migraciones relacionadas:** No aplica.
- **Última actualización:** 2026-09-15

## 1. Resumen

Como miembro del grupo, quiero poder revisar los gastos de juntadas que ya
pasaron sin que se mezclen con la lista principal de grupos vigentes, para
tener `/gastos` enfocado en lo actual y un archivo aparte para "¿cuánto
gastamos en tal asado de hace dos meses?".

Es el primer lugar de la app con este patrón de "vigente vs. histórico";
la idea explícita del usuario es reusarlo más adelante en otras secciones
(no solo gastos).

## 2. Alcance

### Incluye

- `/gastos` (lista principal) deja de mostrar los grupos enlazados a un
  evento cuya fecha ya pasó.
- Nueva página `/gastos/historicos` con esos grupos, ordenados del más
  reciente al más viejo, mostrando la fecha del evento (no la fecha de
  creación del grupo).
- Link "Ver históricos (N) →" en `/gastos`, visible solo si hay al menos
  un grupo histórico.
- Cada grupo histórico linkea a la misma página `/gastos/[groupId]` de
  siempre — no hay una vista "de solo lectura" distinta, el histórico es
  solo una forma distinta de *encontrar* el grupo.

### No incluye (por ahora)

- Un grupo de gastos standalone (sin evento enlazado) nunca es
  "histórico": no tiene una fecha natural para decidir si "ya pasó". Se
  queda siempre en la lista principal.
- Resumen agregado (cuánto gastó cada persona sumando todos los
  históricos) — se pidió explícitamente para "más adelante", no ahora.
- Aplicar el mismo patrón vigente/histórico a Eventos — mencionado como
  intención futura por el usuario, no parte de este alcance.
- Filtro/búsqueda dentro de históricos (por fecha, por nombre).

## 3. Modelo de datos

No aplica: no hay tablas ni columnas nuevas. "Histórico" es una condición
calculada en el server component (`event_date < ahora`), no un estado
persistido en `groups` ni en `events`.

## 4. Diseño / flujo

1. `getGroupsWithEventDates(supabase, userId)`
   (`src/lib/gastos/groups.ts`, nuevo, compartido entre `/gastos` y
   `/gastos/historicos`) trae los grupos de los que el usuario es
   miembro (igual que antes) y, en una segunda consulta, la
   `event_date` del evento enlazado a cada uno (si tiene).
2. `/gastos` filtra a `!eventDate || eventDate >= ahora` para la lista
   principal, y muestra el link a históricos con el conteo de los que
   quedaron afuera.
3. `/gastos/historicos` filtra al complemento (`eventDate < ahora`),
   ordenado por `eventDate` descendente (no por `created_at` del grupo,
   que no es lo relevante acá).
4. `/gastos/[groupId]` no cambió: un grupo histórico se ve y se comporta
   exactamente igual que uno vigente (balances, gastos, "para saldar
   cuentas" — incluso se puede seguir cargando gastos ahí si alguien
   todavía no arregló cuentas de esa juntada).

## 5. Criterios de aceptación

- [x] Un grupo enlazado a un evento con fecha futura aparece en `/gastos`,
      no en históricos.
- [x] Un grupo enlazado a un evento con fecha pasada aparece en
      `/gastos/historicos`, no en la lista principal.
- [x] Un grupo standalone (sin evento) aparece siempre en `/gastos`,
      nunca en históricos.
- [x] El link "Ver históricos" no aparece si no hay ningún grupo
      histórico.
- [x] Entrar a un grupo histórico desde `/gastos/historicos` lleva a la
      misma página de siempre, con toda la funcionalidad intacta.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Página separada `/gastos/historicos` en vez de un filtro/tab en la misma vista | Tabs "Vigentes" / "Históricos" dentro de `/gastos` | Pedido explícito del usuario: quería una sección separada, no todo mezclado con un filtro. |
| "Histórico" calculado en cada request (`event_date < ahora`), no persistido | Columna `is_historico` mantenida por trigger o cron | No hay necesidad de una columna extra: la condición es barata de calcular (una comparación de fechas) y siempre está actualizada sin mantenimiento. |
| Grupos standalone nunca son históricos | Usar `created_at` del grupo como fecha de referencia | No hay una noción real de "cuándo pasó" un grupo sin evento — usar `created_at` sería arbitrario y probablemente confuso (un grupo activo desde hace meses no es "viejo"). |

## 7. Futuro / fuera de alcance

- Mismo patrón vigente/histórico para Eventos y (a futuro) para
  Estadísticas de partidos.
- Resumen agregado de gastos históricos por persona.
- Filtro/búsqueda dentro de `/gastos/historicos`.

## 8. Changelog

- 2026-09-15: creada e implementada.
