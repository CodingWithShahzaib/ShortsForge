"use client";

import { memo, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  title: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapsible?: boolean;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
};

export const CollapsibleCard = memo(function CollapsibleCard({
  title,
  icon,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  collapsible = true,
  className,
  contentClassName,
  children,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = collapsible ? (controlledOpen ?? internalOpen) : true;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setInternalOpen(next);
  };

  return (
    <Card className={cn("w-full min-w-0 border-0 bg-transparent shadow-none", className)} size="2">
      <CardHeader className="space-y-0 p-3 pb-2 sm:px-3.5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold leading-tight tracking-tight text-foreground">
            {icon}
            <span className="min-w-0">{title}</span>
          </CardTitle>
          {collapsible ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              aria-label={open ? "Collapse section" : "Expand section"}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          ) : null}
        </div>
      </CardHeader>
      {open && <CardContent className={cn("space-y-3 px-3 pb-3 pt-0 sm:px-3.5", contentClassName)}>{children}</CardContent>}
    </Card>
  );
});
