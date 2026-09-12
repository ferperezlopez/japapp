# 005 - Rediseño visual unificado, landing y PWA instalable

- **Estado:** Implemented
- **Rutas:** todas (rediseño transversal) + `/manifest.webmanifest`,
  `/icon-192`, `/icon-512`, `/icon-512-maskable`, `/apple-icon.png`
- **Migraciones relacionadas:** ninguna (solo estilo + configuración de
  Next.js, sin cambios de esquema ni de RLS)
- **Última actualización:** 2026-08-26

## 1. Resumen

Como usuario, quiero que toda la app se sienta como una sola cosa (no un
detalle de evento con estilo nuevo y el resto sin tocar), tener una pantalla
de inicio que liste las funcionalidades pensada para el celular, y poder
"instalar" JAPapp en la pantalla de inicio de mi teléfono como si fuera una
app nativa.

`specs/004-eventos-gastos-y-fotos.md` había aplicado a propósito la paleta
coral/amber/teal solo a `/eventos/[eventId]`, dejando explícitamente el resto
de la app afuera. Esta spec cierra ese pendiente y agrega landing + PWA.

## 2. Alcance

### Incluye

- Paleta coral/amber/teal aplicada a toda la app: login, calculadoras,
  gastos (lista y detalle de grupo), eventos (lista), y los componentes de
  `/eventos/[eventId]` que habían quedado sin tocar (`PhotoGrid`,
  `DeleteEventButton`, `DeletePhotoButton`).
- Overrides de dark mode para los tokens coral/amber/teal (antes solo
  existían para light mode).
- Primitivas de UI compartidas (`src/components/ui/Button.tsx`,
  `Card.tsx`) para no repetir clases Tailwind en cada página.
- Navegación mobile-first: barra fija inferior (`BottomNav`) con 4 accesos
  (Inicio/Eventos/Calculadoras/Gastos), reemplaza los links horizontales del
  header. El header queda reducido a logo + "Salir".
- Landing (`/`) rediseñada como una lista vertical de accesos a las 3
  funcionalidades, pensada para pantalla angosta.
- PWA instalable: manifest, set de íconos, `viewport`/`themeColor`.

### No incluye (por ahora)

- Push notifications, service worker, ni nada de background sync — decisión
  explícita del usuario para esta iteración (ver sección 6).
- Microinteracciones/animaciones JS del design system original más allá de
  transiciones de color (200ms) — mismo límite ya documentado en `004`.
- Offline support real (cachear rutas/assets) — no se agregó service worker.

## 3. Modelo de datos

No hay cambios de esquema. Los únicos archivos nuevos son de configuración
de Next.js (no van en `supabase/migrations/`):

- `src/app/manifest.ts`: convención de archivo de Next.js, sirve
  `/manifest.webmanifest` y linkea `<link rel="manifest">` automáticamente.
- `src/app/icon-192/route.tsx`, `src/app/icon-512/route.tsx`,
  `src/app/icon-512-maskable/route.tsx`: Route Handlers propios (no la
  convención `icon.tsx` de Next) para tener URLs fijas y predecibles que
  referenciar a mano desde `manifest.ts`. Generan la imagen en runtime con
  `ImageResponse` de `next/og` (ya incluido en Next, sin dependencias
  nuevas) — dibujan un monograma "J" blanco sobre fondo coral
  (`src/lib/appIcon.tsx`, componente compartido por los tres). El ícono
  "maskable" usa más padding (`paddingRatio=0.4`) porque Android puede
  recortarlo en un círculo.
- `src/app/apple-icon.tsx`: convención de archivo de Next.js (180×180);
  Next linkea el `<link rel="apple-touch-icon">` solo.

## 4. Diseño / flujo

- **Tokens**: `globals.css` ahora define un segundo juego de valores para
  `--color-coral*`/`--color-amber*`/`--color-teal*` dentro de
  `@media (prefers-color-scheme: dark)`. La lógica es invertir la escala:
  en light mode `*-soft`/`*-mid` son fondos claros e `*-ink` es texto
  oscuro; en dark mode `*-soft`/`*-mid` pasan a ser superficies oscuras e
  `*-ink` pasa a ser el texto claro que va sobre ellas.
- **Fondo unificado**: `layout.tsx` dejó de hardcodear
  `bg-zinc-50 dark:bg-zinc-950` y usa las utilities `bg-background
  text-foreground` que ya generaba Tailwind a partir de
  `--color-background`/`--color-foreground` — antes había dos fuentes de
  verdad para el mismo valor.
- **Uso semántico de color** (igual en toda la app): coral = acción
  primaria/marca, teal = confirmado/balance a favor, amber = dinero
  pendiente/deuda, zinc = texto y superficies neutras (no se reemplazó zinc
  por completo, es la base neutra sobre la que coral/amber/teal son
  acentos).
- **`AddExpenseForm`/`DeleteExpenseButton`**: perdieron el prop
  `variant: "neutral" | "coral"` que habían agregado en `004` para no
  filtrar el estilo nuevo a `/gastos/[groupId]` standalone — ya no hace
  falta esa bifurcación porque toda la app usa la misma paleta ahora.
- **Navegación**: `layout.tsx` resuelve el usuario logueado una sola vez
  (antes lo hacía `Header` por su cuenta) y se lo pasa a `Header` como
  prop; si hay sesión, también renderiza `<BottomNav />` (client component,
  resalta la sección activa vía `usePathname`) y agrega `padding-bottom` al
  contenedor de contenido para que no quede tapado detrás de la barra fija.
- **Landing**: si hay sesión, lista vertical de 3 `Card` (Eventos,
  Calculadoras, Gastos) con ícono + título + descripción de una línea; si
  no hay sesión, un único CTA a `/login`.
- **PWA**: criterio de instalabilidad de Chrome/Android es manifest válido
  + HTTPS (ya cubierto por el deploy en Vercel) — no hace falta service
  worker para esto, solo para push notifications (explícitamente fuera de
  alcance).

## 5. Criterios de aceptación

- [x] `npm run build` y `npm run lint` sin errores.
- [x] Ninguna página de la app queda con el estilo `zinc` puro original
      (login, calculadoras, gastos, eventos-lista y los componentes sueltos
      del detalle de evento migran a la paleta).
- [x] `/gastos/[groupId]` y `/eventos/[eventId]` mantienen su
      comportamiento (mismas queries, mismas reglas de permisos) — el
      cambio es solo visual.
- [x] La bottom nav solo se muestra con sesión iniciada y no tapa contenido
      de la página.
- [x] `/manifest.webmanifest` resuelve con `name`, `icons` (192/512/512
      maskable) y `display: "standalone"`.
- [x] `/icon-192`, `/icon-512`, `/icon-512-maskable` y `/apple-icon.png`
      devuelven una imagen PNG real (no 404/500).

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| PWA solo instalable (manifest + íconos), sin push ni service worker | Implementar también push notifications (VAPID + Supabase) | Decisión explícita del usuario: alcance acotado para esta iteración; según la propia guía de Next.js el criterio de instalabilidad no requiere service worker, solo push lo necesita. |
| Ícono generado por código (`next/og` + monograma) | Pedir/usar un logo real, o un generador externo de favicons | No hay logo real todavía; generarlo con `ImageResponse` no agrega dependencias y da URLs fijas para el manifest. Se puede reemplazar por un logo real más adelante sin tocar `manifest.ts`. |
| Bottom nav fija reemplaza los links del header | Mantener el header horizontal, solo restylearlo | Patrón estándar de apps mobile (la app "va a ser esencialmente una mobile app", pedido explícito del usuario); con 4 secciones entra cómodo y dejar de repetir los links en el header simplifica esa pieza. |
| Sacar el prop `variant` de `AddExpenseForm`/`DeleteExpenseButton` | Mantenerlo por si se necesita un estilo "neutral" en el futuro | Ya no hay ningún lugar de la app que use el estilo neutral — mantenerlo sería una abstracción sin caso de uso real. |
| Rutas de íconos propias (`/icon-192`, etc.) en vez de la convención `icon.tsx`/`generateImageMetadata` de Next | Usar `generateImageMetadata` para generar variantes | Esa convención resuelve las URLs internamente y no da control directo sobre el path exacto, que se necesita para escribirlo a mano en `manifest.ts`. Rutas propias son más simples de razonar aunque no sigan la convención al 100%. |

## 7. Futuro / fuera de alcance

- Push notifications (requeriría tabla de suscripciones, claves VAPID y un
  service worker con `self.addEventListener('push', ...)`).
- Offline support (cachear rutas/assets con un service worker o Serwist).
- Reemplazar el ícono generado por un logo real si el usuario diseña uno.
- Microinteracciones JS del design system original (animaciones >200ms,
  overshoot en confirmaciones, stagger de listas) — mismo pendiente que
  dejó `004`.
- La sección de estadísticas de `003-eventos.md` sigue sin construirse.

## 8. Changelog

- 2026-08-26: creada e implementada. Cierra el pendiente de
  `specs/004-eventos-gastos-y-fotos.md` ("Restyling del resto de la app...
  esta spec solo cubre `/eventos/[eventId]`") y agrega landing + PWA.
