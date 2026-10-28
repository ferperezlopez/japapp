import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="mt-6 p-5 text-center">
      <p className="font-heading text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-foreground/60">{children}</p>
    </Card>
  );
}
