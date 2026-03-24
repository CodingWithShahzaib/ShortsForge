"use client";

import { memo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  title: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export const CollapsibleCard = memo(function CollapsibleCard({ title, icon, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            {icon}
            {title}
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 w-8 p-0"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse section" : "Expand section"}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4 pt-0">{children}</CardContent>}
    </Card>
  );
});
