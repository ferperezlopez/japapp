import { stopImpersonation } from "@/app/actions/impersonation";

// Franja fija arriba de todo mientras un admin está "actuando como" otro
// usuario (ver src/lib/supabase/actingUser.ts) — visible en cualquier
// página, para que nunca pase desapercibido que las acciones se están
// atribuyendo a otra persona.
export function ImpersonationBanner({
  targetName,
}: {
  targetName: string;
}) {
  return (
    <div className="flex items-center justify-center gap-3 bg-amber px-4 py-2 text-sm text-amber-ink">
      <span>
        Actuando como <strong>{targetName}</strong>
      </span>
      <form
        action={async () => {
          "use server";
          await stopImpersonation();
        }}
      >
        <button
          type="submit"
          className="rounded-full bg-amber-ink/10 px-3 py-1 text-xs font-medium transition-colors duration-200 hover:bg-amber-ink/20"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
