# JAPapp

App privada para el grupo de amigos: eventos con confirmación de
asistencia, calculadoras de asado y empanadas, y un módulo de gastos
compartidos estilo Splitwise/Tricount.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS
- [Supabase](https://supabase.com) (Postgres + Auth con Google)
- Pensado para desplegarse en [Vercel](https://vercel.com)

## Funcionalidades

- **Eventos** (`/eventos`): crear juntadas (ej. "JAPA del viernes") con
  fecha, lugar y notas. Cualquier usuario logueado puede confirmar su
  asistencia (Voy / Tal vez / No voy) y ver quién más confirmó.
- **Calculadoras** (`/calculadoras`): asado y empanadas. Calculan cantidades
  de compra a partir de la cantidad de participantes/docenas, con la misma
  lógica que las planillas de Google Sheets originales del grupo.
- **Gastos** (`/gastos`): grupos de gastos compartidos. Cada grupo tiene
  miembros, gastos (con quién pagó y entre quiénes se divide) y calcula
  balances + sugerencias de transferencias para saldar cuentas con el
  mínimo de pagos posible.

Todas las secciones requieren estar logueado con Google.

### Roadmap: estadísticas

La tabla `events` ya tiene una columna `group_id` opcional para poder
enlazar un evento a un grupo de gastos existente. La idea a futuro es usar
eso, junto con `event_rsvps`, para armar una sección de estadísticas
(asistencia histórica, costo por evento/por persona, etc.) sin tener que
migrar el esquema de nuevo.

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear un proyecto de Supabase

1. Andá a [supabase.com](https://supabase.com) y creá un proyecto nuevo
   (el plan gratuito alcanza de sobra para este uso).
2. En **Project Settings → API**, copiá `Project URL` y `anon public key`.
3. Corré las migraciones de base de datos: en el SQL Editor de Supabase,
   pegá y ejecutá en orden el contenido de cada archivo en
   `supabase/migrations/` (`0001_init.sql`, `0002_events.sql`,
   `0003_harden_definer_functions.sql`). Esto crea las tablas (`profiles`,
   `groups`, `group_members`, `expenses`, `expense_shares`, `events`,
   `event_rsvps`), las políticas de Row Level Security, el trigger que
   crea un perfil automáticamente cuando alguien inicia sesión, y endurece
   los permisos de las funciones internas para que no queden expuestas
   por la REST API.

### 3. Habilitar login con Google

1. En Google Cloud Console, creá unas credenciales OAuth 2.0 (tipo
   "Aplicación web").
2. En **Authorized redirect URIs** agregá la URL de callback que te
   muestra Supabase en **Authentication → Providers → Google**
   (con forma `https://<tu-proyecto>.supabase.co/auth/v1/callback`).
3. Copiá el Client ID y Client Secret al proveedor de Google en Supabase y
   activalo.
4. En **Authentication → URL Configuration**, agregá
   `http://localhost:3000/auth/callback` (para desarrollo) y la URL de
   producción una vez desplegado (`https://tu-dominio/auth/callback`) a
   los Redirect URLs permitidos.

### 4. Variables de entorno

```bash
cp .env.local.example .env.local
```

Completá `.env.local` con los valores del paso 2:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 5. Correr en desarrollo

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## Deploy

El proyecto está listo para desplegarse en Vercel: importá el repo, cargá
las mismas variables de entorno (`NEXT_PUBLIC_SUPABASE_URL` y
`NEXT_PUBLIC_SUPABASE_ANON_KEY`) y agregá la URL de producción a los
Redirect URLs de Supabase (paso 3.4).

## Notas técnicas

- `src/lib/supabase/database.types.ts` está escrito a mano para reflejar
  el esquema de las migraciones en `supabase/migrations/`. Una vez creado
  el proyecto real, se puede regenerar con:

  ```bash
  npx supabase gen types typescript --project-id <tu-project-id> > src/lib/supabase/database.types.ts
  ```

- La protección de rutas (`/calculadoras`, `/gastos`, `/eventos`) vive en
  `src/proxy.ts` (el archivo `proxy.ts` reemplazó a `middleware.ts` en
  Next.js 16; la lógica es la misma).
