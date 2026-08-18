# Specs de JAPapp

Este directorio contiene una spec por feature, escrita ANTES de programarla
(Spec Driven Development). La spec gobierna la implementación: si el código
diverge de la spec, se actualiza uno de los dos a propósito, no en silencio.

## Convención

- Un archivo por feature de usuario: `NNN-slug.md`.
- `NNN` es correlativo por orden de creación (no reutilizar números).
- `slug` en kebab-case, igual al nombre de carpeta bajo `src/app/` cuando
  aplica (ej. `gastos` → `002-gastos.md`).
- Para arrancar una spec nueva, copiar `TEMPLATE.md`.

## Qué va acá y qué no

- Va acá: objetivo, alcance, criterios de aceptación, decisiones y
  tradeoffs explícitos, estado.
- NO va acá: setup del proyecto, stack, cómo correr `npm run dev` (eso es
  el `README.md` de la raíz) ni el schema SQL completo (eso vive en
  `supabase/migrations/`, la spec solo lo referencia).

## Estados

- **Draft**: se está discutiendo el diseño, todavía no hay código.
- **In Progress**: hay una implementación parcial en curso.
- **Implemented**: lo descrito en la spec está en `master`/deployado.
  Si después se cambia el comportamiento, se actualiza la spec Y se anota
  en el changelog al final del archivo — no se reescribe la historia.
