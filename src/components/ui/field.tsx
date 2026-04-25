"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface FieldContextValue {
  id: string;
  errorId: string;
  hintId: string;
  invalid: boolean;
  hasHint: boolean;
  hasError: boolean;
  setHasHint: (v: boolean) => void;
  setHasError: (v: boolean) => void;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function Field({
  id: idProp,
  invalid = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { id?: string; invalid?: boolean }) {
  const reactId = React.useId();
  const id = idProp ?? `field-${reactId}`;
  const [hasHint, setHasHint] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const value = React.useMemo<FieldContextValue>(
    () => ({
      id,
      errorId: `${id}-error`,
      hintId: `${id}-hint`,
      invalid,
      hasHint,
      hasError,
      setHasHint,
      setHasError,
    }),
    [id, invalid, hasHint, hasError],
  );
  return (
    <FieldContext.Provider value={value}>
      <div className={cn("space-y-1", className)} {...props}>
        {children}
      </div>
    </FieldContext.Provider>
  );
}

function FieldLabel({
  className,
  children,
  ...props
}: Omit<React.LabelHTMLAttributes<HTMLLabelElement>, "htmlFor">) {
  const ctx = React.useContext(FieldContext);
  return (
    <label
      htmlFor={ctx?.id}
      className={cn("block text-xs font-medium text-foreground", className)}
      {...props}
    >
      {children}
    </label>
  );
}

function FieldHint({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const ctx = React.useContext(FieldContext);
  React.useEffect(() => {
    ctx?.setHasHint(true);
    return () => ctx?.setHasHint(false);
  }, [ctx]);
  return (
    <p
      id={ctx?.hintId}
      className={cn("text-[11px] text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  );
}

function FieldError({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  const ctx = React.useContext(FieldContext);
  const hasContent = !!children;
  React.useEffect(() => {
    ctx?.setHasError(hasContent);
    return () => ctx?.setHasError(false);
  }, [ctx, hasContent]);
  if (!hasContent) return null;
  return (
    <p
      id={ctx?.errorId}
      role="alert"
      className={cn("text-[11px] text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );
}

interface FieldControlProps {
  id: string | undefined;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
}

function useFieldControl(): FieldControlProps {
  const ctx = React.useContext(FieldContext);
  if (!ctx) {
    return { id: undefined, "aria-invalid": undefined, "aria-describedby": undefined };
  }
  const describedBy = [ctx.hasError ? ctx.errorId : null, ctx.hasHint ? ctx.hintId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  return {
    id: ctx.id,
    "aria-invalid": ctx.invalid || ctx.hasError ? true : undefined,
    "aria-describedby": describedBy,
  };
}

export { Field, FieldLabel, FieldHint, FieldError, useFieldControl };
