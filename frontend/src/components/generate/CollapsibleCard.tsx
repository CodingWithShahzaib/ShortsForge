"use client";

import { memo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Props = {
  title: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

export const CollapsibleCard = memo(function CollapsibleCard({
  title,
  icon,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  return (
    <Card className={open ? "border-cyan-500/40 shadow-[0_0_0_1px_rgba(34,211,238,0.1)]" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={`flex items-center gap-2 text-base sm:text-lg ${open ? "text-cyan-600 dark:text-cyan-400" : ""}`}>
            {icon}
            {title}
          </CardTitle>
          <Button
            type="button"
            variant={open ? "secondary" : "ghost"}
            size="sm"
            className="shrink-0 h-8 w-8 p-0"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
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
