# 001 - Calculadoras (asado y empanadas)

- **Estado:** Implemented
- **Rutas:** `/calculadoras`, `/calculadoras/asado`, `/calculadoras/empanadas`
- **Migraciones relacionadas:** No aplica (feature stateless, sin DB)
- **Última actualización:** 2026-08-18

## 1. Resumen

Como miembro del grupo que organiza una juntada, quiero calcular cuánto
comprar de cada cosa a partir de la cantidad de gente (asado) o de
docenas de empanadas a hacer, para no tener que abrir la planilla de
Google Sheets original cada vez.

## 2. Alcance

### Incluye
- Calculadora de asado: a partir de N participantes, cantidad sugerida
  de carne (con y sin hueso), chorizos, vino, cerveza, gaseosa, pan,
  carbón, picada y papas fritas.
- Calculadora de empanadas: a partir de N docenas, cantidad de cada
  ingrediente del relleno.
- Lista de ingredientes de la ensalada criolla (no escala 1:1, se indica
  "duplicar/triplicar la receta" para grupos grandes).
- Lista de condimentos "a gusto" (no escalan) para empanadas.
- Receta paso a paso de empanadas.

### No incluye (por ahora)
- Persistencia de cálculos (no se guarda historial de qué se calculó).
- Ajuste de los factores per cápita desde la UI (son constantes en código).
- Otras recetas del grupo que puedan existir a futuro.

## 3. Modelo de datos

No aplica: feature completamente stateless. Los factores per cápita/por
docena viven como constantes TypeScript en `src/lib/calculators/asado.ts`
y `src/lib/calculators/empanadas.ts`, extraídos directamente de las
planillas de Google Sheets originales del grupo.

## 4. Diseño / flujo

1. Usuario entra a `/calculadoras/asado` o `/calculadoras/empanadas`
   (ambas rutas protegidas por `src/proxy.ts`, requieren login).
2. Ingresa un número (participantes o docenas) en `CalculatorForm`
   (`src/components/CalculatorForm.tsx`).
3. `calcularAsado(participantes)` / `calcularEmpanadas(docenas)` corren
   client-side (o en el render del server component, sin round-trip a
   DB) y devuelven cada ítem con `cantidad = factor * N`, redondeado a
   2 decimales.
4. Si `N` no es finito o es `<= 0`, ambas funciones devuelven `[]` (la UI
   no muestra tabla de resultados).

## 5. Criterios de aceptación

- [x] Con participantes > 0, `/calculadoras/asado` muestra cantidad para
      los 10 ítems de `ASADO_ITEMS`, cada uno `perPersona * participantes`
      redondeado a 2 decimales.
- [x] Con docenas > 0, `/calculadoras/empanadas` muestra cantidad para
      los 10 ítems de `EMPANADA_ITEMS`, cada uno `porDocena * docenas`
      redondeado a 2 decimales.
- [x] Con input inválido (0, negativo, no numérico) no se muestran
      resultados (array vacío), sin error visible.
- [x] La ensalada criolla y los condimentos "a gusto" se muestran como
      lista fija, no escalada por N.
- [x] La receta de empanadas se muestra siempre, independiente de N.
- [x] Ambas rutas requieren estar logueado (redirect a `/login` si no).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Factores hardcodeados como constantes TS, con comentario de origen | Guardarlos en una tabla `calculator_settings` en DB | Son datos que casi no cambian y esto es más simple; si el grupo empieza a ajustarlos seguido, se revisita. |
| Sin persistencia de cálculos pasados | Guardar historial "calculé para 20 personas el 3/1" | No hay caso de uso pedido todavía; se agrega si surge necesidad real. |
| `roundTo` duplicado en `asado.ts`, `empanadas.ts` y `balances.ts` | Extraer a un helper compartido `src/lib/round.ts` | Deuda técnica menor aceptada a propósito por simplicidad inicial; bajo riesgo porque es una función de 3 líneas. |

## 7. Futuro / fuera de alcance

- Calculadoras adicionales del grupo (si existen otras planillas) seguirían
  el mismo patrón: nuevo archivo en `src/lib/calculators/`, nueva ruta bajo
  `/calculadoras/`, nueva spec numerada.

## 8. Changelog

- 2026-08-18: spec retroactiva creada, feature ya implementada en
  commit `046bbf1` ("Scaffold JAPApp: calculadoras de asado/empanadas y
  gastos compartidos").
- 2026-08-18: fix de bug en producción — `asado/page.tsx` y
  `empanadas/page.tsx` eran Server Components pasando la función
  `calcularX` como prop a `CalculatorForm` (Client Component), lo cual
  Next.js no permite (las funciones no son serializables cruzando el
  límite servidor→cliente). Nunca se había probado en un browser real,
  solo `npm run build` (que no detecta este error, es de runtime). Fix:
  ambas páginas pasan a ser Client Components (`"use client"`), ya que
  no tienen lógica server-only. Verificado con Playwright local.
