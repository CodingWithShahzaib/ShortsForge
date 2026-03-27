"use client";

import { useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useConfirmDialogStore } from "@/stores/confirmDialogStore";

export function ConfirmDialogHost() {
  const open = useConfirmDialogStore((s) => s.open);
  const current = useConfirmDialogStore((s) => s.current);
  const respond = useConfirmDialogStore((s) => s.respond);
  const confirmedByActionRef = useRef(false);

  const opts = current?.opts;
  const destructive = opts?.variant === "destructive";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          if (confirmedByActionRef.current) {
            confirmedByActionRef.current = false;
            return;
          }
          respond(false);
        }
      }}
    >
      <AlertDialogContent
        onEscapeKeyDown={() => respond(false)}
        className="border-border/80"
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title ?? ""}</AlertDialogTitle>
          {opts?.description ? (
            <AlertDialogDescription>{opts.description}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">{opts?.title}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => respond(false)}>
            {opts?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && buttonVariants({ variant: "destructive" }))}
            onClick={() => {
              confirmedByActionRef.current = true;
              respond(true);
            }}
          >
            {opts?.confirmLabel ?? "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
