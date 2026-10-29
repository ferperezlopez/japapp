import { describe, expect, it } from "vitest";
import { calcularAsistencia, contarEventosElegibles } from "@/lib/eventos/attendance";
import { buildEventAttendance, buildMemberAttendance, isPast } from "./attendance";
import { NOW, event, guest, member, rsvp } from "./fixtures";

const EV = event("e1", "2026-10-02T20:00:00Z");

describe("isPast", () => {
  it("es pasado solo si la fecha es anterior a ahora", () => {
    expect(isPast("2026-10-02T20:00:00Z", NOW)).toBe(true);
    expect(isPast("2026-10-30T20:00:00Z", NOW)).toBe(false);
    expect(isPast(NOW.toISOString(), NOW)).toBe(false);
  });
});

describe("buildEventAttendance", () => {
  const members = [member("a"), member("b"), member("c"), member("d")];

  it("separa confirmados, no, tal vez y sin respuesta; el ratio es sobre los elegibles", () => {
    const result = buildEventAttendance(
      EV,
      members,
      [rsvp("e1", "a", "yes"), rsvp("e1", "b", "no"), rsvp("e1", "c", "maybe")],
      [],
    );
    expect(result).toMatchObject({
      eligible: 4,
      confirmed: 1,
      declined: 1,
      maybe: 1,
      noResponse: 1,
      ratio: 0.25,
    });
  });

  it("no cuenta a quien todavía no era miembro cuando pasó el evento", () => {
    const late = [...members, member("e", "2026-10-10T00:00:00Z")];
    const result = buildEventAttendance(EV, late, [rsvp("e1", "a", "yes")], []);
    expect(result.eligible).toBe(4);
    expect(result.noResponse).toBe(3);
  });

  it("cuenta a quien se unió «después» pero respondió igual, y el ratio nunca pasa de 100 %", () => {
    const late = [member("a", "2026-10-10T00:00:00Z")];
    const result = buildEventAttendance(EV, late, [rsvp("e1", "a", "yes")], []);
    expect(result.eligible).toBe(1);
    expect(result.confirmed).toBe(1);
    expect(result.ratio).toBe(1);
  });

  it("quien se unió justo en el instante del evento ya cuenta (mismo borde que /miembros)", () => {
    const exact = [member("a", "2026-10-02T20:00:00Z")];
    expect(buildEventAttendance(EV, exact, [], []).eligible).toBe(1);
    const justAfter = [member("a", "2026-10-02T20:00:01Z")];
    expect(buildEventAttendance(EV, justAfter, [], []).eligible).toBe(0);
  });

  it("cuenta a un respondedor aunque no esté en la lista de miembros", () => {
    const result = buildEventAttendance(EV, [member("a")], [rsvp("e1", "zz", "yes")], []);
    expect(result.eligible).toBe(2);
    expect(result.confirmed).toBe(1);
  });

  it("sin ninguna respuesta: ratio 0 y todos sin respuesta (no null)", () => {
    const result = buildEventAttendance(EV, members, [], []);
    expect(result).toMatchObject({ eligible: 4, confirmed: 0, noResponse: 4, ratio: 0 });
  });

  it("sin nadie elegible el ratio es null, no NaN", () => {
    const result = buildEventAttendance(EV, [member("a", "2027-01-01T00:00:00Z")], [], []);
    expect(result.eligible).toBe(0);
    expect(result.ratio).toBeNull();
  });

  it("ignora las respuestas de otros eventos", () => {
    const result = buildEventAttendance(
      EV,
      members,
      [rsvp("otro", "a", "yes"), rsvp("e1", "b", "yes")],
      [],
    );
    expect(result.confirmed).toBe(1);
  });

  it("los invitados no entran en el ratio; se cuentan aparte y por confirmado", () => {
    const result = buildEventAttendance(
      EV,
      members,
      [rsvp("e1", "a", "yes"), rsvp("e1", "b", "yes")],
      [guest("e1", "g1"), guest("e1", "g2"), guest("e1", "g2"), guest("otro", "g3")],
    );
    expect(result.eligible).toBe(4);
    expect(result.ratio).toBe(0.5);
    expect(result.guests).toBe(2);
    expect(result.guestsPerConfirmed).toBe(1);
  });

  it("invitados en total: cada uno una sola vez aunque haya venido a la juntada y al fútbol", () => {
    const result = buildEventAttendance(
      EV,
      members,
      [],
      [
        guest("e1", "g1", "a", "juntada"),
        guest("e1", "g1", "a", "futbol"),
        guest("e1", "g2", "a", "futbol"),
        guest("otro", "g3"),
      ],
    );
    expect(result.guestsTotal).toBe(2);
    expect(result.guests).toBe(1);
  });

  it("invitados por confirmado es null si no confirmó nadie", () => {
    const result = buildEventAttendance(EV, members, [], [guest("e1", "g1")]);
    expect(result.guests).toBe(1);
    expect(result.guestsPerConfirmed).toBeNull();
  });

  it("fútbol: solo si el evento lo tiene, sobre los mismos elegibles y con sus propios invitados", () => {
    const withFutbol = event("e1", "2026-10-02T20:00:00Z", { hasFutbol: true });
    const result = buildEventAttendance(
      withFutbol,
      members,
      [
        rsvp("e1", "a", "yes"),
        rsvp("e1", "a", "yes", "futbol"),
        rsvp("e1", "b", "yes", "futbol"),
        rsvp("e1", "c", "no", "futbol"),
      ],
      [guest("e1", "g1", "a", "futbol"), guest("e1", "g2", "a", "juntada")],
    );
    expect(result.confirmed).toBe(1);
    expect(result.futbol).toEqual({
      confirmed: 2,
      declined: 1,
      maybe: 0,
      noResponse: 1,
      ratio: 0.5,
      guests: 1,
    });
    expect(result.guests).toBe(1);
  });

  it("fútbol es null si el evento no tiene fútbol, aunque haya respuestas sueltas", () => {
    const result = buildEventAttendance(EV, members, [rsvp("e1", "a", "yes", "futbol")], []);
    expect(result.futbol).toBeNull();
  });
});

describe("buildMemberAttendance", () => {
  const e1 = event("e1", "2026-09-18T19:30:00Z", { hasFutbol: true });
  const e2 = event("e2", "2026-10-02T20:00:00Z", { hasFutbol: true });
  const e3 = event("e3", "2026-10-16T19:20:00Z");
  const past = [e1, e2, e3];
  const a = member("a");

  it("ausencia = «No» o sin respuesta; «tal vez» no suma a ningún lado", () => {
    const result = buildMemberAttendance(
      a,
      past,
      [rsvp("e1", "a", "yes"), rsvp("e2", "a", "maybe")],
    );
    // e1 sí, e2 tal vez (ni suma ni resta), e3 sin respuesta → ausencia
    expect(result.juntada).toEqual({ attended: 1, absent: 1, ratio: 0.5 });
    expect(result.eligibleEvents).toEqual({ juntada: 3, futbol: 2 });
  });

  it("da lo mismo que /miembros (calcularAsistencia + contarEventosElegibles) en el caso normal", () => {
    // Caso normal: nadie respondió a un evento anterior a su alta ni a uno
    // futuro (lo que /miembros hace con las respuestas de la persona).
    const answers: [string, "yes" | "no" | "maybe"][] = [
      ["e1", "yes"],
      ["e2", "no"],
      ["e3", "maybe"],
    ];
    for (const joinedAt of [
      "2026-01-01T00:00:00Z",
      "2026-09-30T00:00:00Z",
      "2026-10-10T00:00:00Z",
      "2026-10-20T00:00:00Z",
    ]) {
      const joined = member("a", joinedAt);
      const rsvps = past.flatMap((e) => {
        if (new Date(e.eventDate) < new Date(joinedAt)) return [];
        const status = answers.find(([id]) => id === e.id)?.[1] ?? "yes";
        return [rsvp(e.id, "a", status), rsvp(e.id, "a", status, "futbol")];
      });
      const mine = buildMemberAttendance(joined, past, rsvps);

      const eligible = contarEventosElegibles(
        past.map((e) => ({ eventDate: e.eventDate, hasFutbol: e.hasFutbol })),
        joinedAt,
        NOW,
      );
      const reference = calcularAsistencia(
        rsvps.map((r) => ({ kind: r.kind, status: r.status })),
        eligible,
      );

      expect(mine.eligibleEvents, joinedAt).toEqual(eligible);
      expect(mine.juntada.attended, joinedAt).toBe(reference.juntada.asistencias);
      expect(mine.juntada.absent, joinedAt).toBe(reference.juntada.ausencias);
      expect(mine.futbol.attended, joinedAt).toBe(reference.futbol.asistencias);
      expect(mine.futbol.absent, joinedAt).toBe(reference.futbol.ausencias);
      expect((mine.juntada.ratio ?? 0) * 100, joinedAt).toBeCloseTo(reference.juntada.porcentaje ?? 0, 9);
    }
  });

  it("no cuenta los eventos anteriores a que se uniera", () => {
    const joined = member("a", "2026-10-10T00:00:00Z");
    const result = buildMemberAttendance(joined, past, [rsvp("e3", "a", "yes")]);
    expect(result.eligibleEvents.juntada).toBe(1);
    expect(result.juntada).toEqual({ attended: 1, absent: 0, ratio: 1 });
    expect(result.byEvent.map((r) => r.eventId)).toEqual(["e3"]);
  });

  it("el evento del mismo instante del alta es elegible; uno anterior por un segundo, no", () => {
    expect(buildMemberAttendance(member("a", "2026-10-16T19:20:00Z"), past, []).eligibleEvents.juntada).toBe(1);
    expect(buildMemberAttendance(member("a", "2026-10-16T19:20:01Z"), past, []).eligibleEvents.juntada).toBe(0);
  });

  it("una respuesta a un evento anterior al alta sí cuenta ese evento (no se ignora un «Voy»)", () => {
    const joined = member("a", "2026-10-10T00:00:00Z");
    const result = buildMemberAttendance(joined, past, [rsvp("e1", "a", "yes")]);
    expect(result.eligibleEvents.juntada).toBe(2); // e1 (respondió) y e3
    expect(result.juntada.attended).toBe(1);
  });

  it("solo mira los eventos que se le pasan: un evento futuro respondido no suma", () => {
    const result = buildMemberAttendance(a, [e1], [
      rsvp("e1", "a", "yes"),
      rsvp("futuro", "a", "yes"),
    ]);
    expect(result.juntada).toEqual({ attended: 1, absent: 0, ratio: 1 });
  });

  it("solo mira las respuestas de esa persona", () => {
    const result = buildMemberAttendance(a, [e1], [rsvp("e1", "b", "yes")]);
    expect(result.juntada).toEqual({ attended: 0, absent: 1, ratio: 0 });
  });

  it("fútbol: solo cuenta los eventos con fútbol", () => {
    const result = buildMemberAttendance(a, past, [
      rsvp("e1", "a", "yes", "futbol"),
      rsvp("e3", "a", "yes", "futbol"), // e3 no tiene fútbol: se ignora
    ]);
    expect(result.eligibleEvents.futbol).toBe(2);
    expect(result.futbol).toEqual({ attended: 1, absent: 1, ratio: 0.5 });
  });

  it("sin eventos pasados: nada, con ratio null", () => {
    const result = buildMemberAttendance(a, [], []);
    expect(result.juntada).toEqual({ attended: 0, absent: 0, ratio: null });
    expect(result.streak).toBe(0);
    expect(result.byEvent).toEqual([]);
  });

  it("racha: eventos seguidos con «Voy», desde el más reciente", () => {
    const yes = (id: string) => rsvp(id, "a", "yes");
    expect(buildMemberAttendance(a, past, [yes("e1"), yes("e2"), yes("e3")]).streak).toBe(3);
    expect(buildMemberAttendance(a, past, [yes("e1"), yes("e3")]).streak).toBe(1);
    expect(buildMemberAttendance(a, past, [yes("e1"), yes("e2")]).streak).toBe(0);
    expect(buildMemberAttendance(a, past, [yes("e2"), yes("e3"), rsvp("e1", "a", "no")]).streak).toBe(2);
  });

  it("mejor racha: la tanda más larga de «Voy» seguidos, en cualquier momento", () => {
    const yes = (id: string) => rsvp(id, "a", "yes");
    // e1 sí, e2 sí, e3 no → la actual es 0 pero la mejor es 2
    const result = buildMemberAttendance(a, past, [yes("e1"), yes("e2"), rsvp("e3", "a", "no")]);
    expect(result.streak).toBe(0);
    expect(result.bestStreak).toBe(2);
    expect(buildMemberAttendance(a, past, [yes("e1"), yes("e2"), yes("e3")]).bestStreak).toBe(3);
    // sí, no, sí → mejor 1 (y la actual 1)
    expect(buildMemberAttendance(a, past, [yes("e1"), rsvp("e2", "a", "no"), yes("e3")]).bestStreak).toBe(1);
    // sin ningún «Voy», ninguna racha
    expect(buildMemberAttendance(a, past, []).bestStreak).toBe(0);
  });

  it("la mejor racha no se corta por eventos anteriores al alta, y un «tal vez» sí la corta", () => {
    const joined = member("a", "2026-10-01T00:00:00Z");
    expect(buildMemberAttendance(joined, past, [rsvp("e2", "a", "yes"), rsvp("e3", "a", "yes")]).bestStreak).toBe(2);
    expect(
      buildMemberAttendance(a, past, [rsvp("e1", "a", "yes"), rsvp("e2", "a", "maybe"), rsvp("e3", "a", "yes")]).bestStreak,
    ).toBe(1);
  });

  it("«tal vez» rompe la racha", () => {
    const result = buildMemberAttendance(a, past, [
      rsvp("e1", "a", "yes"),
      rsvp("e2", "a", "maybe"),
      rsvp("e3", "a", "yes"),
    ]);
    expect(result.streak).toBe(1);
  });

  it("la racha no se corta por eventos anteriores al alta (no era elegible)", () => {
    const joined = member("a", "2026-10-01T00:00:00Z");
    const result = buildMemberAttendance(joined, past, [rsvp("e2", "a", "yes"), rsvp("e3", "a", "yes")]);
    expect(result.streak).toBe(2);
  });

  it("detalle por evento: del más reciente al más viejo, con fútbol solo donde hay", () => {
    const result = buildMemberAttendance(a, past, [
      rsvp("e1", "a", "yes"),
      rsvp("e1", "a", "no", "futbol"),
      rsvp("e3", "a", "maybe"),
    ]);
    expect(result.byEvent).toEqual([
      { eventId: "e3", juntada: "maybe", futbol: null },
      { eventId: "e2", juntada: "none", futbol: "none" },
      { eventId: "e1", juntada: "yes", futbol: "no" },
    ]);
  });

  it("ordena por fecha real, no por el orden en que vienen los eventos", () => {
    const result = buildMemberAttendance(a, [e3, e1, e2], []);
    expect(result.byEvent.map((r) => r.eventId)).toEqual(["e3", "e2", "e1"]);
  });
});
