# 014 - Login tradicional (email + contraseña)

- **Estado:** Implemented
- **Rutas:** `/login` (extendida), `/` (extendida)
- **Migraciones relacionadas:** No aplica
- **Última actualización:** 2026-09-16

## 1. Resumen

Como miembro del grupo sin cuenta de Google, quiero poder crear una
cuenta e iniciar sesión con email y contraseña, para poder usar la app
igual que el resto.

## 2. Alcance

### Incluye

- `/login` suma pestañas "Iniciar sesión" / "Crear cuenta" debajo del
  botón de Google existente, con email + contraseña (y nombre al
  crear cuenta, ya que no hay perfil de Google del que tomarlo).
- Alta abierta: cualquiera con un email puede crear una cuenta, sin
  lista de invitados pre-aprobados.
- Aviso dentro de la app cuando se suma alguien nuevo: en Inicio, una
  tarjeta "🎉 Se sumó/sumaron a JAPapp: X" visible para el resto de los
  miembros durante los 7 días posteriores al alta.
- El login con Google sigue exactamente igual (no se tocó su flujo).

### No incluye (por ahora)

- Lista de emails pre-aprobados para poder registrarse — decisión
  explícita del usuario: alta abierta a cualquiera con el link de la
  app.
- Aviso por email o WhatsApp de un alta nueva — decisión explícita del
  usuario: alcanza con el aviso dentro de la app, sin sumar un
  servicio de email transaccional (costo/infraestructura nueva) ni
  depender de que alguien lo comparta a mano.
- Marcar el aviso de "nuevo integrante" como leído/visto — es una
  ventana de tiempo fija (7 días), no un sistema de notificaciones con
  estado por usuario.
- Vincular una cuenta de Google y una de email que compartan la misma
  persona — si alguien ya tiene cuenta de Google y después crea una
  con email usando el mismo mail, Supabase los trata como identidades
  separadas: quedan dos `profiles` distintos. No hay pedido de esto
  todavía y mezclarlo es una migración de datos manual, no un flujo de
  producto.

## 3. Modelo de datos

No aplica: sin migraciones nuevas. Usa las tablas/triggers ya
existentes:

- `handle_new_user()` (`0001_init.sql`) ya arma el `profile` desde
  `raw_user_meta_data ->> 'full_name'` — el `signUp` de email pasa el
  nombre cargado en el formulario por `options.data.full_name`, mismo
  campo que ya llenaba Google, así que el trigger no necesitó cambios.
- El aviso de "nuevo integrante" en Inicio se calcula al vuelo con
  `profiles.created_at` (`gte` a "hace 7 días"), sin tabla nueva.

## 4. Diseño / flujo

1. `/login` (`src/app/login/page.tsx`): dos pestañas debajo del botón
   de Google. "Iniciar sesión" llama a
   `supabase.auth.signInWithPassword({ email, password })`. "Crear
   cuenta" llama a `supabase.auth.signUp({ email, password, options: {
   data: { full_name }, emailRedirectTo: `${origin}/auth/callback` }
   })`.
2. Si el `signUp` no devuelve sesión (confirmación de email pendiente,
   comportamiento default de Supabase), se muestra "Revisá tu email
   para confirmar la cuenta" en vez de redirigir.
3. `src/app/auth/callback/route.ts` no se tocó: ya hacía
   `exchangeCodeForSession(code)` de forma genérica, así que sirve
   tanto para el redirect de Google como para el link de confirmación
   de email que manda Supabase.
4. En `src/app/page.tsx`, para un usuario logueado se agrega una query
   de `profiles` con `created_at` dentro de los últimos 7 días
   (excluyendo al propio usuario) y, si hay resultados, una `<Card>`
   arriba de "Evento en curso" listando los nombres.
5. El CTA de Inicio para quien no está logueado pasa de "Iniciar
   sesión con Google" a "Iniciar sesión" (ya no es exclusivamente
   Google).

### Paso manual pendiente (fuera del código)

Habilitar/confirmar el provider de **Email** en el dashboard de
Supabase (Authentication → Providers → Email) — no hay ninguna tool
de MCP disponible en este proyecto que exponga esa configuración, así
que no se pudo automatizar. Se recomienda dejar activado el toggle
**"Confirm email"** (exige click en un link antes de poder loguearse),
para filtrar emails con errores de tipeo.

## 5. Criterios de aceptación

- [x] Se puede crear una cuenta nueva con email + contraseña + nombre.
- [x] Se puede iniciar sesión con una cuenta de email ya creada.
- [x] El login con Google sigue funcionando sin cambios.
- [x] Un usuario logueado ve el aviso de "se sumó X" en Inicio si hubo
      un alta nueva en los últimos 7 días.
- [ ] Verificación manual pendiente (requiere un email real y el
      provider habilitado en el dashboard, ver sección 4): el flujo
      completo de alta → email de confirmación → link → sesión activa.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Email + contraseña | Magic link (solo email, sin contraseña) | Pedido explícito del usuario, aunque implica más código (validación de contraseña) que un magic link. |
| Alta abierta a cualquiera con email | Lista de emails pre-aprobados | Decisión explícita del usuario: prioriza simplicidad, confía en que el link de la app no se comparte fuera del grupo. |
| Aviso dentro de la app (ventana de 7 días) | Email a todos los miembros | Decisión explícita del usuario: evita sumar un servicio de email transaccional nuevo (costo e infraestructura) que la app no tiene hoy. |
| Aviso calculado con `profiles.created_at` (sin tabla nueva) | Tabla de notificaciones con estado leído/no leído por usuario | Evita una feature de notificaciones completa para un aviso que alcanza con una ventana de tiempo fija. |
| `handle_new_user()` sin cambios | Adaptar el trigger para email | Ya cubre el caso: `full_name` en `options.data` cae en el mismo campo que usa Google. |

## 7. Futuro / fuera de alcance

- Vincular cuentas de Google y de email para la misma persona.
- Lista de emails pre-aprobados, si en algún momento se quiere cerrar
  el alta.
- Notificaciones por email o push para altas nuevas (u otros eventos
  de la app).

## 8. Changelog

- 2026-09-16: creada e implementada.
