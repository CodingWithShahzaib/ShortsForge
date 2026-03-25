"use client";

type LoadingStateProps = {
  label?: string;
  className?: string;
};

export function LoadingState({ label = "Loading...", className }: LoadingStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 ${className || ""}`}>
      <div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground mt-3">{label}</p>
    </div>
  );
}
