"use client";

import { useId, useState } from "react";
import { cn } from "./cn";

export type TickOption = { value: number; label: string };

/**
 * Discrete slider over a fixed set of values, with the choices printed as
 * ticks underneath.
 *
 * The range input slides over the *index*, because the values aren't evenly
 * spaced (30s → 1h), and a hidden input carries the real value so this drops
 * into a plain form action with no client state to thread.
 */
export function TickSlider({
  name,
  options,
  defaultValue,
  className,
}: {
  name: string;
  options: TickOption[];
  defaultValue: number;
  className?: string;
}) {
  const id = useId();
  const initial = Math.max(
    0,
    options.findIndex((o) => o.value === defaultValue),
  );
  const [index, setIndex] = useState(initial);
  const current = options[index] ?? options[0];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input type="hidden" name={name} value={current?.value ?? defaultValue} />
      <input
        id={id}
        type="range"
        min={0}
        max={options.length - 1}
        step={1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-label="Interval"
        aria-valuetext={current?.label}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
      />
      <div
        className="flex w-full items-start justify-between font-medium text-muted-foreground text-xs"
        aria-hidden
      >
        {options.map((option, i) => (
          <span key={option.value} className="flex flex-col items-center gap-1">
            <span className="h-1 w-px bg-muted-foreground/70" />
            <span className={cn(i === index && "text-foreground")}>{option.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
