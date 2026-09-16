# 014 - Login tradicional (email + contraseña)

- **Estado:** Implemented
- **Rutas:** `/login` (extendida), `/` (extendida)
- **Migraciones relacionadas:** `supabase/migrations/0015_similar_profile_names.sql`
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
- Aviso al crear una cuenta (no bloqueante) si el nombre cargado se
  parece mucho a uno ya registrado — para el caso de alguien que ya es
  parte del grupo (por ejemplo, con cuenta de Google) y no se da
  cuenta de que ya tiene perfil al crear uno nuevo con otro email.
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
- Vincular o fusionar automáticamente dos perfiles que resulten ser la
  misma persona — el aviso de nombre parecido (ver más abajo) solo
  informa; si igual se crean dos cuentas, unificarlas sigue siendo una
  intervención manual en la base, no un flujo de producto.
- Bloquear la creación de cuenta aunque el nombre coincida exacto —
  decisión explícita del usuario: nunca bloquea, solo avisa (mismo
  criterio de confianza total que el resto de la app).
- Detectar duplicados por email — ese caso ya está cubierto sin código
  nuevo (ver sección 3): `auth.users.email` es único a nivel de
  Supabase Auth.

## 3. Modelo de datos

Ver `supabase/migrations/0015_similar_profile_names.sql` para la única
función nueva. El resto usa tablas/triggers ya existentes:

- `handle_new_user()` (`0001_init.sql`) ya arma el `profile` desde
  `raw_user_meta_data ->> 'full_name'` — el `signUp` de email pasa el
  nombre cargado en el formulario por `options.data.full_name`, mismo
  campo que ya llenaba Google, así que el trigger no necesitó cambios.
- El aviso de "nuevo integrante" en Inicio se calcula al vuelo con
  `profiles.created_at` (`gte` a "hace 7 días"), sin tabla nueva.
- **Duplicados por el mismo email entre providers**: no necesitó nada
  nuevo. `auth.users.email` es único a nivel de Supabase Auth, así que
  intentar crear una cuenta con contraseña usando un email que ya
  existe como cuenta de Google devuelve un error en el `signUp` en vez
  de crear un segundo usuario — el caso que sí hace falta cubrir es el
  de un email **distinto** para la misma persona, indetectable por el
  sistema de auth.
- `find_similar_profile_names(candidate_name)`: función `security
  definer` (la policy de `profiles` para `select` exige `to
  authenticated`, y quien está creando una cuenta todavía no lo está)
  que usa `pg_trgm` (`similarity()`, trigramas) para encontrar nombres
  ya registrados parecidos al que se está por cargar, con un umbral de
  `0.4` — valor de referencia habitual para "se parece bastante",
  ajustable si tira falsos positivos/negativos con los nombres reales
  del grupo. Se eligió similitud por trigramas en vez de igualdad
  exacta para cubrir variantes de tildes o nombre completo vs. corto
  (ej. "Daniel Perez" vs "Daniel Pérez López").

## 4. Diseño / flujo

1. `/login` (`src/app/login/page.tsx`): dos pestañas debajo del botón
   de Google. "Iniciar sesión" llama a
   `supabase.auth.signInWithPassword({ email, password })`. "Crear
   cuenta" llama a `supabase.auth.signUp({ email, password, options: {
   data: { full_name }, emailRedirectTo: `${origin}/auth/callback` }
   })`.
2. Antes de llamar a `signUp` (solo la primera vez que se envía el
   formulario de "Crear cuenta"), se llama a
   `supabase.rpc("find_similar_profile_names", { candidate_name: name })`.
   Si devuelve resultados, se muestra un aviso ("Ya hay alguien
   registrado con un nombre parecido: X. Si sos vos, iniciá sesión en
   vez de crear una cuenta nueva.") y el botón pasa a decir "Crear
   igual" — un segundo click salta el chequeo y sigue con el alta
   normal. Editar el nombre después de ver el aviso lo resetea (si
   cambió el nombre, el aviso anterior ya no aplica necesariamente).
3. Si el `signUp` no devuelve sesión (confirmación de email pendiente,
   comportamiento default de Supabase), se muestra "Revisá tu email
   para confirmar la cuenta" en vez de redirigir.
4. `src/app/auth/callback/route.ts` no se tocó: ya hacía
   `exchangeCodeForSession(code)` de forma genérica, así que sirve
   tanto para el redirect de Google como para el link de confirmación
   de email que manda Supabase.
5. En `src/app/page.tsx`, para un usuario logueado se agrega una query
   de `profiles` con `created_at` dentro de los últimos 7 días
   (excluyendo al propio usuario) y, si hay resultados, una `<Card>`
   arriba de "Evento en curso" listando los nombres.
6. El CTA de Inicio para quien no está logueado pasa de "Iniciar
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
- [x] Al crear una cuenta con un nombre parecido a uno ya registrado
      (umbral de similitud > 0.4), aparece un aviso no bloqueante antes
      de dar de alta la cuenta.
- [x] El botón pasa a decir "Crear igual" después del aviso; un segundo
      click completa el alta de todos modos, sin volver a chequear.
- [x] Editar el nombre después de ver el aviso lo resetea (vuelve a
      chequear si se reintenta crear la cuenta).
- [x] Un nombre sin parecidos registrados no muestra ningún aviso.
- [x] El login (no alta) y el login con Google no disparan este chequeo.

## 6. Decisiones y tradeoffs

| Decisión | Alternativa descartada | Por qué |
|---|---|---|
| Email + contraseña | Magic link (solo email, sin contraseña) | Pedido explícito del usuario, aunque implica más código (validación de contraseña) que un magic link. |
| Alta abierta a cualquiera con email | Lista de emails pre-aprobados | Decisión explícita del usuario: prioriza simplicidad, confía en que el link de la app no se comparte fuera del grupo. |
| Aviso dentro de la app (ventana de 7 días) | Email a todos los miembros | Decisión explícita del usuario: evita sumar un servicio de email transaccional nuevo (costo e infraestructura) que la app no tiene hoy. |
| Aviso calculado con `profiles.created_at` (sin tabla nueva) | Tabla de notificaciones con estado leído/no leído por usuario | Evita una feature de notificaciones completa para un aviso que alcanza con una ventana de tiempo fija. |
| `handle_new_user()` sin cambios | Adaptar el trigger para email | Ya cubre el caso: `full_name` en `options.data` cae en el mismo campo que usa Google. |
| Aviso de nombre parecido, no bloqueo | Bloquear el alta si el nombre coincide | Decisión explícita del usuario: mismo criterio de confianza total que el resto de la app (`futbol_stats`, `event_tasks`); bloquear generaría falsos positivos molestos para gente con nombres genuinamente parecidos. |
| Similitud por trigramas (`pg_trgm`, umbral 0.4) | Igualdad exacta de nombre | Cubre variantes de tildes o nombre completo vs. corto (ej. "Daniel Perez" vs "Daniel Pérez López") que una igualdad exacta no detecta. |
| `find_similar_profile_names` como función `security definer` | Chequear duplicados en un server action después del alta | Hace falta el chequeo *antes* de crear la cuenta, con el usuario todavía sin sesión — la policy de `profiles` para `select` exige `to authenticated`, así que solo una función `security definer` puede leer nombres sin sesión activa. |

## 7. Futuro / fuera de alcance

- Vincular cuentas de Google y de email para la misma persona.
- Lista de emails pre-aprobados, si en algún momento se quiere cerrar
  el alta.
- Notificaciones por email o push para altas nuevas (u otros eventos
  de la app).

## 8. Changelog

- 2026-09-16: creada e implementada.
- 2026-09-16: sumado el aviso no bloqueante de nombre parecido al crear
  una cuenta (`0015_similar_profile_names.sql`,
  `find_similar_profile_names`), para prevenir que alguien que ya es
  parte del grupo termine con dos perfiles por registrarse con un email
  distinto sin darse cuenta.
