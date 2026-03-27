"use client";

import { useEffect, useState } from "react";
import { Theme as RadixTheme } from "@radix-ui/themes";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

function RadixThemeSync({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const appearance = !mounted ? "dark" : resolvedTheme === "dark" ? "dark" : "light";

  return (
    <RadixTheme
      appearance={appearance}
      accentColor="cyan"
      grayColor="slate"
      radius="large"
      scaling="100%"
      panelBackground="translucent"
      hasBackground={false}
    >
      {children}
    </RadixTheme>
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="shortsforge-theme"
      disableTransitionOnChange={false}
    >
      <RadixThemeSync>{children}</RadixThemeSync>
    </NextThemesProvider>
  );
}
