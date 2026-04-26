import { cn } from "@/lib/utils";

export type PokemonType =
  | "Normal" | "Fire" | "Water" | "Electric" | "Grass" | "Ice"
  | "Fighting" | "Poison" | "Ground" | "Flying" | "Psychic"
  | "Bug" | "Rock" | "Ghost" | "Dragon" | "Dark" | "Steel" | "Fairy";

const TYPE_COLOR_VAR: Record<PokemonType, string> = {
  Normal:   "var(--type-normal)",
  Fire:     "var(--type-fire)",
  Water:    "var(--type-water)",
  Electric: "var(--type-electric)",
  Grass:    "var(--type-grass)",
  Ice:      "var(--type-ice)",
  Fighting: "var(--type-fighting)",
  Poison:   "var(--type-poison)",
  Ground:   "var(--type-ground)",
  Flying:   "var(--type-flying)",
  Psychic:  "var(--type-psychic)",
  Bug:      "var(--type-bug)",
  Rock:     "var(--type-rock)",
  Ghost:    "var(--type-ghost)",
  Dragon:   "var(--type-dragon)",
  Dark:     "var(--type-dark)",
  Steel:    "var(--type-steel)",
  Fairy:    "var(--type-fairy)",
};

const ALL_TYPES: PokemonType[] = [
  "Normal", "Fire", "Water", "Electric", "Grass", "Ice",
  "Fighting", "Poison", "Ground", "Flying", "Psychic",
  "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
];

export { ALL_TYPES, TYPE_COLOR_VAR };

export function isPokemonType(value: string): value is PokemonType {
  return (ALL_TYPES as string[]).includes(value);
}

export function TypeBadge({
  type,
  size = "md",
  variant = "soft",
  className,
}: {
  type: PokemonType;
  size?: "sm" | "md";
  variant?: "soft" | "solid" | "outline";
  className?: string;
}) {
  const color = TYPE_COLOR_VAR[type];
  const base =
    "inline-flex items-center justify-center rounded font-semibold uppercase tracking-wide select-none";
  const sizing =
    size === "sm" ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]";

  if (variant === "solid") {
    return (
      <span
        className={cn(base, sizing, "text-white", className)}
        style={{ backgroundColor: color }}
        title={type}
      >
        {type}
      </span>
    );
  }
  if (variant === "outline") {
    return (
      <span
        className={cn(base, sizing, "border", className)}
        style={{ color, borderColor: color }}
        title={type}
      >
        {type}
      </span>
    );
  }
  return (
    <span
      className={cn(base, sizing, className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
        color,
      }}
      title={type}
    >
      {type}
    </span>
  );
}
