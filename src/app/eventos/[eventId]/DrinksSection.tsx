"use client";

import { useState, useTransition } from "react";
import { saveEventDrinks } from "../actions";
import { Button } from "@/components/ui/Button";
import { BEBIDAS_ITEMS, calcularBebidas } from "@/lib/calculators/bebidas";
import { leftover, perPerson, type DrinksInput } from "@/lib/eventos/drinks";
import { withMinDuration } from "@/lib/withMinDuration";

const numberFormatter = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const fmt = (value: number) => numberFormatter.format(value);
/** «1 botella», «2 botellas», «0,5 botellas», «3 L». */
const withUnit = (value: number, unit: string) =>
  `${fmt(value)} ${unit === "botellas" && value === 1 ? "botella" : unit}`;

// Bebidas del evento (spec 023): lo que sugiere la calculadora para quienes
// van, y —opcional— cuánto se compró y cuánto se consumió realmente de cada
// tipo, para comparar. Editable por cualquier logueado hasta que el evento se
// salda (después, solo un admin: `editable` ya viene resuelto por la página).
export function DrinksSection({
  eventId,
  people,
  saved,
  started,
  editable,
}: {
  eventId: string;
  /** Confirmados («Voy») e invitados a la juntada: la cantidad con la que calcula la sugerencia. */
  people: number;
  saved: DrinksInput;
  /** El evento ya empezó: recién ahí tiene sentido cargar lo consumido. */
  started: boolean;
  editable: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const suggested = calcularBebidas(people);
  const hasData = BEBIDAS_ITEMS.some(
    (item) => saved[item.key].bought !== null || saved[item.key].consumed !== null,
  );

  return (
    <section className="mt-8">
      <details className="rounded-xl border border-surface-border bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">Bebidas</summary>
        <p className="mt-3 text-xs text-foreground/50">
          {people > 0
            ? `Sugerido para ${people} ${people === 1 ? "persona" : "personas"} (confirmados e invitados a la juntada), según la calculadora.`
            : "Todavía no hay confirmados: la sugerencia aparece cuando haya gente."}
        </p>

        {!editable && !hasData && (
          <p className="mt-3 text-sm text-foreground/50">
            No se cargaron datos de bebidas en este evento.
          </p>
        )}

        <form
          // Se remonta al cambiar lo guardado: los campos son no controlados.
          key={JSON.stringify(saved)}
          action={(formData: FormData) => {
            setError(null);
            setJustSaved(false);
            startTransition(async () => {
              const result = await withMinDuration(saveEventDrinks(eventId, formData));
              if (result.error) setError(result.error);
              else setJustSaved(true);
            });
          }}
          className="mt-3 space-y-3"
        >
          {BEBIDAS_ITEMS.map((item) => {
            const amounts = saved[item.key];
            const suggestion = suggested.find((s) => s.key === item.key)?.cantidad ?? null;
            const consumedPerPerson = perPerson(amounts.consumed, people);
            const left = leftover(amounts);
            // Sin edición y sin datos de este tipo, no hay nada que mostrar.
            if (!editable && amounts.bought === null && amounts.consumed === null) return null;

            return (
              <div
                key={item.key}
                className="rounded-lg border border-surface-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium">
                    <span aria-hidden="true">{item.icon}</span> {item.label}
                  </span>
                  <span className="tabular-nums text-foreground/60">
                    {suggestion === null ? "—" : `sugerido ${withUnit(suggestion, item.unit)}`}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-3">
                  <DrinkField
                    label={`Comprado (${item.unit})`}
                    name={`bought_${item.key}`}
                    value={amounts.bought}
                    editable={editable}
                  />
                  {started && (
                    <DrinkField
                      label={`Consumido (${item.unit})`}
                      name={`consumed_${item.key}`}
                      value={amounts.consumed}
                      editable={editable}
                    />
                  )}
                </div>

                {(consumedPerPerson !== null || left !== null) && (
                  <p className="mt-2 text-xs text-foreground/60">
                    {consumedPerPerson !== null &&
                      `Se tomó ${withUnit(consumedPerPerson, item.unit)} por persona (la calculadora sugiere ${withUnit(item.perPersona, item.unit)}). `}
                    {left !== null &&
                      (left >= 0
                        ? `Sobró ${withUnit(left, item.unit)}.`
                        : `Se tomó ${withUnit(-left, item.unit)} más de lo que figura comprado.`)}
                  </p>
                )}
              </div>
            );
          })}

          {editable && (
            <>
              {!started && (
                <p className="text-xs text-foreground/50">
                  Lo consumido se carga después del evento. Todo es opcional.
                </p>
              )}
              <div className="flex items-center gap-3">
                <Button type="submit" loading={pending}>
                  {pending ? "Guardando..." : "Guardar bebidas"}
                </Button>
                {justSaved && !pending && (
                  <span className="text-sm text-foreground/60" role="status">
                    Guardado
                  </span>
                )}
              </div>
            </>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </form>
      </details>
    </section>
  );
}

function DrinkField({
  label,
  name,
  value,
  editable,
}: {
  label: string;
  name: string;
  value: number | null;
  editable: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-foreground/50">{label}</span>
      {editable ? (
        <input
          type="number"
          name={name}
          min="0"
          step="0.01"
          inputMode="decimal"
          defaultValue={value ?? ""}
          className="mt-1 w-full rounded-lg border border-surface-border bg-background px-3 py-2 text-sm"
        />
      ) : (
        <span className="mt-1 block text-sm tabular-nums">
          {value === null ? "—" : fmt(value)}
        </span>
      )}
    </label>
  );
}
