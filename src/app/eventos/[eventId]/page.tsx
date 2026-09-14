import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calcularBalances, simplificarDeudas } from "@/lib/gastos/balances";
import { RsvpButtons } from "./RsvpButtons";
import { DeleteEventButton } from "./DeleteEventButton";
import { GastosEmbed } from "./GastosEmbed";
import { UploadPhotoForm } from "./UploadPhotoForm";
import { PhotoGrid } from "./PhotoGrid";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

const GROUPS: { status: "yes" | "maybe" | "no"; label: string }[] = [
  { status: "yes", label: "Van" },
  { status: "maybe", label: "Tal vez" },
  { status: "no", label: "No van" },
];

export default async function EventoPage({
  params,
}: PageProps<"/eventos/[eventId]">) {
  const { eventId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, event_date, location, description, created_by, group_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) notFound();

  // Compartir por WhatsApp: la API oficial de WhatsApp no permite postear a
  // un grupo existente (solo crear grupos nuevos de hasta 8 miembros, con
  // cuenta de negocio verificada) — un link wa.me con el texto ya armado,
  // para que quien lo comparta elija el grupo real y lo mande con un toque,
  // es la única vía que no viola los términos de uso.
  const requestHeaders = await headers();
  const origin = `https://${requestHeaders.get("host")}`;
  const eventUrl = `${origin}/eventos/${eventId}`;
  const shareText = [
    `🎉 *${event.name}*`,
    `📅 ${dateFormatter.format(new Date(event.event_date))}`,
    event.location ? `📍 ${event.location}` : null,
    event.description ? `\n${event.description}` : null,
    `\nConfirmá tu asistencia acá: ${eventUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const { data: rsvps } = await supabase
    .from("event_rsvps")
    .select("user_id, status, profiles(name, email)")
    .eq("event_id", eventId);

  const attendees = (rsvps ?? []).map((r) => ({
    userId: r.user_id,
    status: r.status,
    name: r.profiles?.name ?? r.profiles?.email ?? "Desconocido",
  }));

  const myStatus =
    (attendees.find((a) => a.userId === user?.id)?.status as
      | "yes"
      | "no"
      | "maybe"
      | undefined) ?? null;

  // Gastos del evento: solo si el evento tiene un grupo enlazado (siempre
  // debería tenerlo via el trigger private.handle_new_event, pero se
  // contempla el caso defensivo de que no lo tenga todavía).
  let groupMembers: { id: string; name: string | null; email: string }[] = [];
  let expenses: {
    id: string;
    description: string;
    amount: number;
    expense_date: string;
    paid_by: string;
    created_by: string;
  }[] = [];
  let canAddExpense = false;
  let expensesForBalance: {
    paidBy: string;
    shares: { userId: string; amount: number }[];
  }[] = [];

  if (event.group_id) {
    const { data: membershipRows } = await supabase
      .from("group_members")
      .select("user_id, profiles(id, name, email)")
      .eq("group_id", event.group_id);

    groupMembers = (membershipRows ?? [])
      .map((row) => row.profiles)
      .filter(
        (p): p is { id: string; name: string | null; email: string } => !!p,
      );

    const { data: expenseRows } = await supabase
      .from("expenses")
      .select(
        "id, description, amount, expense_date, paid_by, created_by, expense_shares(user_id, share_amount)",
      )
      .eq("group_id", event.group_id)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    expenses = (expenseRows ?? []).map((e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      expense_date: e.expense_date,
      paid_by: e.paid_by,
      created_by: e.created_by,
    }));

    canAddExpense =
      !!user &&
      (groupMembers.some((m) => m.id === user.id) ||
        event.created_by === user.id);

    expensesForBalance = (expenseRows ?? []).map((e) => ({
      paidBy: e.paid_by,
      shares: e.expense_shares.map((s) => ({
        userId: s.user_id,
        amount: Number(s.share_amount),
      })),
    }));
  }

  const balances = calcularBalances(
    groupMembers.map((m) => m.id),
    expensesForBalance,
  );
  const settlements = simplificarDeudas(balances);

  // Fotos: URLs firmadas en batch, expiran en 1h.
  const { data: mediaRows } = await supabase
    .from("event_media")
    .select("id, storage_path, uploaded_by")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  const paths = (mediaRows ?? []).map((m) => m.storage_path);
  const { data: signedUrls } =
    paths.length > 0
      ? await supabase.storage.from("event-photos").createSignedUrls(paths, 3600)
      : { data: [] as { path: string | null; signedUrl: string }[] };

  const photos = (mediaRows ?? []).map((m) => ({
    id: m.id,
    storagePath: m.storage_path,
    uploadedBy: m.uploaded_by,
    url:
      signedUrls?.find((s) => s.path === m.storage_path)?.signedUrl ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Link href="/eventos" className="text-sm text-foreground/50 hover:underline">
        ← Eventos
      </Link>

      <div className="animate-reveal bg-grain mt-3 rounded-2xl border border-surface-border bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-eventos">
          Próximo evento
        </p>
        <h1 className="mt-1 font-heading text-2xl font-semibold text-foreground">
          {event.name}
        </h1>
        <p className="mt-1 text-sm text-foreground/60">
          {dateFormatter.format(new Date(event.event_date))}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {event.description && (
          <p className="mt-2 text-sm text-foreground/80">
            {event.description}
          </p>
        )}
        <a
          href={whatsappShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-foreground/70 transition duration-200 hover:bg-surface active:scale-[0.98]"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
            <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.33 5l-1.41 5.15 5.28-1.38a9.9 9.9 0 0 0 4.76 1.21h.01c5.5 0 9.96-4.46 9.96-9.96C22 6.46 17.54 2 12.04 2Zm5.83 14.24c-.25.7-1.24 1.28-1.99 1.44-.53.11-1.22.2-3.55-.76-2.98-1.23-4.9-4.26-5.05-4.46-.15-.2-1.2-1.6-1.2-3.06s.75-2.16 1.02-2.46c.25-.28.55-.35.73-.35.19 0 .37 0 .53.01.17.01.4-.06.62.48.25.6.85 2.06.92 2.21.07.15.12.32.02.52-.09.2-.14.32-.28.49-.14.17-.29.38-.42.51-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.6-.07.17-.19.71-.83.9-1.11.19-.28.37-.24.63-.14.25.09 1.6.75 1.87.89.28.14.46.21.53.32.07.12.07.65-.18 1.35Z" />
          </svg>
          Compartir en WhatsApp
        </a>
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-medium">¿Vas?</h2>
        <div className="mt-2">
          <RsvpButtons eventId={eventId} currentStatus={myStatus} />
        </div>
      </section>

      <section className="mt-8 space-y-4">
        {GROUPS.map((group) => {
          const people = attendees.filter((a) => a.status === group.status);
          return (
            <div key={group.status}>
              <h3 className="text-sm font-medium text-foreground/50">
                {group.label} ({people.length})
              </h3>
              <ul className="mt-1 flex flex-wrap gap-2">
                {people.map((p, index) => (
                  <li
                    key={p.userId}
                    className="animate-reveal rounded-full bg-surface px-3 py-1 text-xs text-foreground/80"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    {p.name}
                  </li>
                ))}
                {people.length === 0 && (
                  <li className="text-xs text-foreground/40">Nadie por ahora</li>
                )}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Gastos</h2>
        <div className="mt-2">
          {event.group_id ? (
            <GastosEmbed
              groupId={event.group_id}
              members={groupMembers}
              expenses={expenses}
              balances={balances}
              settlements={settlements}
              currentUserId={user?.id}
              canAddExpense={canAddExpense}
            />
          ) : (
            <p className="text-sm text-foreground/50">
              Este evento todavía no tiene un grupo de gastos enlazado.
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium">Fotos</h2>
        <div className="mt-2">
          <UploadPhotoForm eventId={eventId} />
          <PhotoGrid
            eventId={eventId}
            photos={photos}
            currentUserId={user?.id}
            eventCreatorId={event.created_by}
          />
        </div>
      </section>

      {event.created_by === user?.id && (
        <div className="mt-8">
          <DeleteEventButton eventId={eventId} />
        </div>
      )}
    </div>
  );
}
