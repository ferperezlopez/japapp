import Link from "next/link";
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
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-coral">
          Próximo evento
        </p>
        <h1 className="mt-1 font-serif text-2xl text-foreground">
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
