import { CalculatorTabs } from "./CalculatorTabs";

export default function CalculadorasLayout({
  children,
}: LayoutProps<"/calculadoras">) {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">
        Calculá
      </p>
      <h1 className="mt-1 font-heading text-3xl font-semibold text-foreground">
        Calculadoras
      </h1>
      <CalculatorTabs />
      <div className="py-6">{children}</div>
    </div>
  );
}
