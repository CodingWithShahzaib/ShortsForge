import * as React from "react";
import { Button as RadixButton } from "@radix-ui/themes";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center text-center motion-reduce:transition-none gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "",
        quiet: "",
        danger: "",
        default: "",
        animated: "transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]",
        destructive: "",
        outline: "",
        "outline-animated":
          "transition-all duration-200 hover:scale-[1.02] hover:shadow-md active:scale-[0.98]",
        secondary: "",
        ghost: "",
        link: "underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        sm: "",
        lg: "",
        icon: "!inline-flex !h-10 !w-10 !p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type LegacyVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type LegacySize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

function radixButtonProps(variant: LegacyVariant | undefined, size: LegacySize | undefined) {
  const v = variant ?? "default";
  const s = size ?? "default";

  const sizeMap = { default: "3" as const, sm: "2" as const, lg: "4" as const, icon: "3" as const };

  switch (v) {
    case "primary":
    case "default":
      return { variant: "solid" as const, color: "cyan" as const, size: sizeMap[s] };
    case "animated":
      return { variant: "solid" as const, color: "cyan" as const, size: sizeMap[s] };
    case "outline":
    case "outline-animated":
      return { variant: "outline" as const, color: "cyan" as const, size: sizeMap[s] };
    case "ghost":
      return { variant: "ghost" as const, color: "gray" as const, size: sizeMap[s] };
    case "quiet":
      return { variant: "ghost" as const, color: "gray" as const, size: sizeMap[s] };
    case "secondary":
      return { variant: "soft" as const, color: "gray" as const, size: sizeMap[s] };
    case "danger":
    case "destructive":
      return { variant: "solid" as const, color: "red" as const, size: sizeMap[s] };
    case "link":
      return { variant: "ghost" as const, color: "cyan" as const, size: sizeMap[s] };
    default:
      return { variant: "solid" as const, color: "cyan" as const, size: sizeMap[s] };
  }
}

export interface ButtonProps
  extends Omit<React.ComponentPropsWithoutRef<typeof RadixButton>, "variant" | "color" | "size">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  loadingLabel?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingLabel = "Loading...",
      children,
      disabled,
      type = "button",
      ...props
    },
    ref
  ) => {
    const v = variant ?? "default";
    const { variant: rv, color, size: rs } = radixButtonProps(
      variant ?? undefined,
      size ?? undefined
    );
    const extraClass = buttonVariants({ variant: variant ?? undefined, size: size ?? undefined });
    const neonPrimary =
      (v === "default" || v === "primary" || v === "animated") && color === "cyan";
    const neonOutline =
      (v === "outline" || v === "outline-animated") && color === "cyan";

    return (
      <RadixButton
        ref={ref}
        asChild={asChild}
        type={type}
        variant={rv}
        color={color}
        size={rs}
        loading={loading}
        disabled={disabled || loading}
        className={cn(
          extraClass,
          neonPrimary && "btn-neon-primary",
          neonOutline && "btn-neon-outline",
          className
        )}
        {...props}
      >
        {loading ? loadingLabel : children}
      </RadixButton>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
