// Tipos de Analytics (spec 021). La entrada son filas "planas" ya traducidas
// (camelCase, números de verdad, `now` explícito): así las funciones puras no
// dependen de Supabase ni del reloj y se prueban con fixtures chicas.

import type { Comparison, SeriesSummary } from "./stats";

export type RsvpKind = "juntada" | "futbol";
export type RsvpStatus = "yes" | "no" | "maybe";

/** Las tareas de organización que existen como fila de `event_tasks`. */
export type TaskType = "compra_insumos" | "lavado_platos" | "orden_sede" | "reserva_cancha";
/** «convocatoria» no es una fila de `event_tasks`: es quien creó el evento. */
export type TaskKey = TaskType | "convocatoria";

// ───────────────────────────── Entrada ─────────────────────────────

export interface MemberRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** `profiles.created_at`: desde cuándo es miembro. */
  joinedAt: string;
}

export interface EventRow {
  id: string;
  name: string;
  eventDate: string;
  location: string | null;
  hasFutbol: boolean;
  /** Grupo de gastos del evento, si lo tiene. */
  groupId: string | null;
  /** Quien creó el evento: la «convocatoria». */
  createdBy: string | null;
}

export interface RsvpRow {
  eventId: string;
  userId: string;
  kind: RsvpKind;
  status: RsvpStatus;
}

export interface GuestRow {
  eventId: string;
  guestId: string;
  kind: RsvpKind;
  broughtBy: string;
}

export interface ExpenseRow {
  id: string;
  groupId: string;
  paidBy: string;
  amount: number;
  shares: { userId: string; amount: number }[];
}

export interface PaymentRow {
  groupId: string;
  from: string;
  to: string;
  amount: number;
}

export interface FutbolRow {
  eventId: string;
  resultado: string | null;
  mvpUserId: string | null;
  goleadorUserId: string | null;
}

export interface TaskRow {
  eventId: string;
  taskType: TaskType;
  userId: string;
}

export interface AnalyticsInput {
  now: Date;
  members: MemberRow[];
  events: EventRow[];
  rsvps: RsvpRow[];
  guests: GuestRow[];
  expenses: ExpenseRow[];
  payments: PaymentRow[];
  futbol: FutbolRow[];
  tasks: TaskRow[];
}

// ───────────────────────────── Por evento ─────────────────────────────

export interface RsvpBreakdown {
  confirmed: number;
  declined: number;
  maybe: number;
  /** Elegibles que nunca respondieron. */
  noResponse: number;
}

export interface EventAttendance extends RsvpBreakdown {
  /** Miembros a los que se les «exigía» responder (ya eran miembros + los que respondieron). */
  eligible: number;
  /** `confirmed / eligible`, de 0 a 1. */
  ratio: number | null;
  /** Invitados a la juntada. */
  guests: number;
  guestsPerConfirmed: number | null;
  /** Invitados en total (juntada y/o fútbol), sin repetir a quien vino a las dos. */
  guestsTotal: number;
  /** Solo si el evento tiene fútbol. */
  futbol: (RsvpBreakdown & { ratio: number | null; guests: number }) | null;
}

export interface MemberMoney {
  userId: string;
  /** Lo que le tocó: Σ de sus partes. */
  consumed: number;
  /** Saldo después de los pagos de deuda reportados: positivo, le deben. */
  balance: number;
}

export interface EventSpending {
  expenseCount: number;
  total: number;
  /** Por ítem (cada gasto cargado es un ítem). */
  mean: number;
  median: number;
  max: number;
  /** Personas con alguna parte en algún gasto. */
  people: number;
  costPerPerson: number | null;
  /** Σ de saldos positivos: lo que falta saldar entre personas. */
  pending: number;
  settled: boolean;
  /** Quien puso o consumió algo, del que más consumió al que menos. */
  byMember: MemberMoney[];
}

export interface EventFutbol {
  resultado: string | null;
  mvpUserId: string | null;
  goleadorUserId: string | null;
}

export type EventMetricKey = "confirmed" | "ratio" | "total" | "costPerPerson" | "medianItem";

export interface MetricComparison {
  value: number | null;
  vsPrevious: Comparison | null;
  vsAverage: Comparison | null;
  /** Evento anterior con el que se comparó. */
  previousEventId: string | null;
  /** Cuántos otros eventos entran en el promedio. */
  others: number;
}

/** Las categorías en las que se rankea un evento contra los demás. */
export type PositionKey =
  | "confirmed"
  | "ratio"
  | "total"
  | "costPerPerson"
  | "medianItem"
  | "items"
  | "guests"
  | "futbolConfirmed";

export interface Position {
  value: number | null;
  /** 1 = el más alto de los eventos pasados con dato. Los empates comparten puesto (1, 1, 3). */
  rank: number | null;
  /** Cuántos eventos pasados tienen dato en esta categoría. */
  of: number;
  /** Los valores de todos ellos (este incluido), de mayor a menor: dónde cae este entre los demás. */
  peers: number[];
}

export interface EventAnalytics {
  id: string;
  name: string;
  eventDate: string;
  location: string | null;
  hasFutbol: boolean;
  /** `next` es el próximo evento: se ve aparte y no entra en promedios. */
  status: "past" | "next";
  attendance: EventAttendance;
  spending: EventSpending | null;
  futbol: EventFutbol | null;
  /** Comparativas contra los otros eventos pasados. Vacías para el próximo. */
  comparisons: Record<EventMetricKey, MetricComparison>;
  /** Puesto en cada categoría entre los eventos pasados; null para el próximo. */
  positions: Record<PositionKey, Position> | null;
}

// ───────────────────────────── Por miembro ─────────────────────────────

export interface AttendanceCount {
  attended: number;
  absent: number;
  /** `attended / (attended + absent)`, de 0 a 1; null sin señal. */
  ratio: number | null;
}

export type MemberEventStatus = RsvpStatus | "none";

export interface MemberEventRow {
  eventId: string;
  name: string;
  eventDate: string;
  juntada: MemberEventStatus;
  /** null si el evento no tiene fútbol. */
  futbol: MemberEventStatus | null;
  consumed: number;
}

/** En cuántos eventos pasados se anotó (o convocó) cada persona, por tipo de tarea. */
export interface TaskCounts {
  /** Suma de todos los tipos. */
  total: number;
  byType: Record<TaskKey, number>;
}

export interface MemberAnalytics {
  id: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
  juntada: AttendanceCount;
  futbol: AttendanceCount;
  /** Eventos pasados desde que es miembro. */
  eligibleEvents: { juntada: number; futbol: number };
  /** Eventos pasados seguidos, hasta el más reciente, con «Voy». */
  streak: number;
  /** La racha más larga que tuvo, en cualquier momento. */
  bestStreak: number;
  guestsBrought: number;
  tasks: TaskCounts;
  money: {
    consumed: number;
    eventsConsumed: number;
    /** `consumed / eventsConsumed`. */
    avgConsumed: number | null;
    /** Σ de sus saldos por evento: positivo, le deben; negativo, debe. */
    balance: number;
  };
  mvp: number;
  goleador: number;
  /** Eventos pasados desde que es miembro, del más reciente al más viejo. */
  byEvent: MemberEventRow[];
}

// ───────────────────────────── General ─────────────────────────────

export interface SeriesPoint {
  eventId: string;
  name: string;
  eventDate: string;
  hasFutbol: boolean;
  /** El próximo evento va marcado: se dibuja distinto y no cuenta. */
  isNext: boolean;
  confirmed: number;
  ratio: number | null;
  total: number | null;
  costPerPerson: number | null;
}

export interface GeneralAnalytics {
  pastEvents: number;
  /** `small`: menos de 3 eventos pasados, las tendencias son ruido. */
  sample: "none" | "small" | "enough";
  members: number;
  attendance: {
    confirmed: SeriesSummary;
    ratio: SeriesSummary;
    /** Σ de confirmados en todos los eventos pasados. */
    confirmations: number;
    guests: number;
    /** Miembros que confirmaron «Voy» a alguna JAPA. */
    distinctAttendees: number;
  };
  spending: {
    eventsWithExpenses: number;
    total: number;
    perEvent: SeriesSummary;
    costPerPerson: SeriesSummary;
    pending: number;
  };
  /** Eventos pasados en orden cronológico y, al final, el próximo (si hay). */
  series: SeriesPoint[];
}

export interface Analytics {
  now: string;
  general: GeneralAnalytics;
  /** El próximo evento primero y después los pasados, del más reciente al más viejo. */
  events: EventAnalytics[];
  members: MemberAnalytics[];
}
