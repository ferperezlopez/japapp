-- JAPapp: alias de pago (Mercado Pago / CBU / etc.) para que quien tiene
-- que transferirle plata a alguien en Gastos sepa a dónde mandarla, sin
-- tener que preguntar por WhatsApp cada vez.
--
-- Ver specs/008-alias-de-pago.md para el detalle completo.

alter table public.profiles add column alias text;

-- Sin policy nueva: "Un usuario puede actualizar su propio perfil"
-- (0001_init.sql, using (id = auth.uid())) ya cubre esta columna, RLS es
-- por fila, no por columna.
