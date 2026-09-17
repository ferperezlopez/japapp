import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { AttendanceStatsLines } from "@/components/eventos/AttendanceStatsCard";
import { calcularAsistencia, type RsvpForAttendance } from "@/lib/eventos/attendance";

export default async function MiembrosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <p className="text-sm text-foreground/60">
          Iniciá sesión para ver a los miembros del grupo.
        </p>
      </div>
    );
  }

  const [{ data: members }, { data: rsvps }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, email, avatar_url")
      .order("name"),
    supabase.from("event_rsvps").select("user_id, kind, status"),
  ]);

  // Cada persona linkea a /perfil/[userId] — esa ruta ya redirige a /perfil
  // cuando el id es el propio, así que acá no hace falta distinguir "uno
  // mismo" del resto (mismo criterio ya usado en /gastos/[groupId]).
  const rsvpsByUser = new Map<string, RsvpForAttendance[]>();
  for (const r of rsvps ?? []) {
    const list = rsvpsByUser.get(r.user_id) ?? [];
    list.push({ kind: r.kind, status: r.status });
    rsvpsByUser.set(r.user_id, list);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        Grupo
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Miembros
      </h1>
      <p className="mt-2 text-sm text-foreground/60">
        Todos los del grupo, con su asistencia a la JAPA y al fútbol.
      </p>

      <div className="mt-6 space-y-2">
        {(members ?? []).map((m, index) => {
          const attendance = calcularAsistencia(rsvpsByUser.get(m.id) ?? []);
          return (
            <Link key={m.id} href={`/perfil/${m.id}`} className="block">
              <Card
                className="animate-reveal flex items-center gap-3 px-4 py-3 transition duration-200 hover:-translate-y-0.5 hover:bg-brand-soft hover:shadow-md"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <Avatar src={m.avatar_url} name={m.name ?? m.email} size="md" />
                <div>
                  <p className="font-medium">{m.name ?? m.email}</p>
                  <AttendanceStatsLines attendance={attendance} />
                </div>
              </Card>
            </Link>
          );
        })}
        {(members ?? []).length === 0 && (
          <p className="text-sm text-foreground/50">No hay miembros todavía.</p>
        )}
      </div>
    </div>
  );
}
