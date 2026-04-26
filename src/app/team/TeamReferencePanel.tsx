"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALL_TYPES,
  TYPE_COLOR_VAR,
  type PokemonType,
} from "@/components/ui/type-badge";
import {
  abilitySpeedBoost,
  checkItemClause,
  computeDefensiveWeakness,
  effectiveSpeed,
  type FilledTeamSlot,
  type TeamSlot,
} from "./teamParser";

export interface StalenessSource {
  name: string;
  fileCount: number;
  mostRecentMtime: string;
  hoursSinceMostRecent: number;
  hasFsDrift: boolean;
}

export interface StalenessInfo {
  indexedAt: string;
  hoursSinceIndex: number;
  sources: StalenessSource[];
  hasFsDrift: boolean;
}

const STALENESS_WARN_HOURS = 72;

function formatHoursAgo(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

function SectionHeader({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h2>
      {hint && (
        <span className="text-[10px] text-muted-foreground/70">{hint}</span>
      )}
    </div>
  );
}

// ─── Coverage (offense + defense) ────────────────────────────────────────

function CoverageGrid({
  team,
}: {
  team: TeamSlot[];
}) {
  const filled = team.filter((s): s is FilledTeamSlot => !!s && s.types.length > 0);
  const offCovered = React.useMemo(() => {
    const set = new Set<PokemonType>();
    for (const s of filled) {
      for (const myType of s.types) {
        for (const target of ALL_TYPES) {
          if (effectivenessFromMap(myType, target) > 1) set.add(target);
        }
      }
    }
    return set;
  }, [filled]);

  const defWeakness = React.useMemo(
    () => computeDefensiveWeakness(team),
    [team],
  );

  const fourXThreats = ALL_TYPES.filter(
    (t) => (defWeakness.get(t) ?? 0) >= 4,
  );
  const twoXThreats = ALL_TYPES.filter((t) => {
    const m = defWeakness.get(t) ?? 0;
    return m >= 2 && m < 4;
  });
  const noOffenseAgainst = ALL_TYPES.filter((t) => !offCovered.has(t));

  if (filled.length === 0) {
    return (
      <section>
        <SectionHeader>Coverage</SectionHeader>
        <p className="text-[11px] italic text-muted-foreground/70">
          Coverage populates as the assistant names Pokemon.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <SectionHeader hint={`${offCovered.size}/18 covered`}>
          Offensive Coverage
        </SectionHeader>
        <TypeRow
          types={ALL_TYPES.map((t) => ({
            type: t,
            highlighted: offCovered.has(t),
          }))}
        />
        {noOffenseAgainst.length > 0 && noOffenseAgainst.length < 18 && (
          <div className="mt-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-[11px]">
            <span className="text-muted-foreground/80 font-semibold">
              No super-effective answer for:
            </span>{" "}
            <span className="text-foreground/80">
              {noOffenseAgainst.slice(0, 6).join(", ")}
              {noOffenseAgainst.length > 6 && ` +${noOffenseAgainst.length - 6}`}
            </span>
          </div>
        )}
      </div>

      <div>
        <SectionHeader
          hint={
            twoXThreats.length > 0
              ? `${twoXThreats.length} ≥2× threats`
              : undefined
          }
        >
          Defensive Profile
        </SectionHeader>
        {fourXThreats.length > 0 && (
          <div className="mb-2 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" aria-hidden />
            <div>
              <span className="font-semibold">4× weak to:</span>{" "}
              {fourXThreats.join(", ")}
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1">
          {ALL_TYPES.map((type) => {
            const mult = defWeakness.get(type) ?? 1;
            const color = TYPE_COLOR_VAR[type];
            const stateClass =
              mult >= 4
                ? "ring-1 ring-destructive/60"
                : mult >= 2
                  ? "ring-1 ring-amber-500/40"
                  : "";
            const opacity = mult >= 2 ? 1 : mult >= 1 ? 0.55 : 0.3;
            return (
              <div
                key={type}
                className={cn(
                  "relative rounded px-1 py-1 text-center text-[10px] font-semibold",
                  stateClass,
                )}
                style={{
                  backgroundColor: `color-mix(in srgb, ${color} ${mult >= 2 ? "22%" : "10%"}, transparent)`,
                  color,
                  opacity,
                }}
                title={`${type} hits team at ${formatMult(mult)}`}
              >
                {type}
                {mult > 1 && (
                  <span className="absolute -top-1 -right-1 rounded-full bg-card border px-1 text-[8px] font-mono text-foreground">
                    {formatMult(mult)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground/70">
          <span>
            <span className="inline-block h-2 w-2 rounded-sm bg-destructive/60 mr-1" />
            4×
          </span>
          <span>
            <span className="inline-block h-2 w-2 rounded-sm bg-amber-500/40 mr-1" />
            2×
          </span>
        </div>
      </div>
    </section>
  );
}

function TypeRow({
  types,
}: {
  types: Array<{ type: PokemonType; highlighted: boolean }>;
}) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {types.map(({ type, highlighted }) => {
        const color = TYPE_COLOR_VAR[type];
        return (
          <div
            key={type}
            className={cn(
              "rounded px-1.5 py-1 text-center text-[10px] font-semibold transition-opacity",
              highlighted ? "opacity-100" : "opacity-25",
            )}
            style={{
              backgroundColor: `color-mix(in srgb, ${color} ${highlighted ? "22%" : "10%"}, transparent)`,
              color,
            }}
          >
            {type}
          </div>
        );
      })}
    </div>
  );
}

function formatMult(m: number): string {
  if (m === 0) return "0";
  if (m === 0.25) return "¼";
  if (m === 0.5) return "½";
  if (m === 1) return "1";
  if (m === 2) return "2×";
  if (m === 4) return "4×";
  return `${m}×`;
}

const TYPE_CHART_INLINE: Record<
  PokemonType,
  Partial<Record<PokemonType, number>>
> = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

function effectivenessFromMap(attacker: PokemonType, target: PokemonType): number {
  return TYPE_CHART_INLINE[attacker]?.[target] ?? 1;
}

// ─── Speed Tiers ─────────────────────────────────────────────────────────

const SPEED_BENCHMARKS: Array<{ label: string; speed: number; subtle?: boolean }> = [
  { label: "TR", speed: 60, subtle: true },
  { label: "Excadrill (88)", speed: 88 },
  { label: "Tyranitar (95)", speed: 95 },
  { label: "Garchomp (102)", speed: 102 },
  { label: "Charizard (110)", speed: 110 },
  { label: "Sneasler (120)", speed: 120 },
  { label: "Aerodactyl (130)", speed: 130 },
];

interface SpeedRow {
  name: string;
  base: number;
  eff: number;
  ability: string | undefined;
}

function SpeedTiersSection({ team }: { team: TeamSlot[] }) {
  const filled = team.filter((s): s is FilledTeamSlot => !!s);
  if (filled.length === 0) return null;

  const speeds: SpeedRow[] = [];
  for (const s of filled) {
    const base = s.stats?.spe;
    const eff = effectiveSpeed(s);
    if (base !== undefined && eff !== null) {
      speeds.push({ name: s.name, base, eff, ability: s.build?.ability });
    }
  }

  if (speeds.length === 0) {
    return (
      <section>
        <SectionHeader>Speed Tiers</SectionHeader>
        <p className="text-[11px] italic text-muted-foreground/70">
          Loading stats…
        </p>
      </section>
    );
  }

  const allSpeeds = [...speeds.map((s) => s.eff), ...SPEED_BENCHMARKS.map((b) => b.speed)];
  const maxS = Math.max(...allSpeeds, 200);
  const minS = Math.min(...allSpeeds, 40);
  const range = maxS - minS || 1;

  const pos = (v: number) => `${((v - minS) / range) * 100}%`;
  const slowest = Math.min(...speeds.map((s) => s.eff));
  const fastest = Math.max(...speeds.map((s) => s.eff));

  const sortedSpeeds = [...speeds].sort((a, b) => b.eff - a.eff);

  // Weather/ability boost detection for callouts.
  const weatherBoosts = speeds
    .map((s) => ({
      name: s.name,
      boost: abilitySpeedBoost(s.ability),
      eff: s.eff,
    }))
    .filter((x) => x.boost.type !== null);

  const labelBenchmarks = [60, 88, 102, 120, 130];

  return (
    <section>
      <SectionHeader hint={`${slowest}–${fastest}`}>Speed Tiers</SectionHeader>

      {/* Lane: dots only */}
      <div className="relative mt-2 h-5">
        <div className="absolute top-1/2 left-0 right-0 h-px bg-border" />
        {SPEED_BENCHMARKS.map((b) => (
          <div
            key={b.label}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos(b.speed) }}
            title={b.label}
          >
            <div
              className={cn(
                "h-2 w-px",
                b.subtle ? "bg-border" : "bg-muted-foreground/40",
              )}
            />
          </div>
        ))}
        {speeds.map((s, i) => (
          <div
            key={`${s.name}-${i}`}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: pos(s.eff) }}
            title={`${s.name}: ${s.eff}`}
          >
            <div className="h-2.5 w-2.5 rounded-full bg-vgc-accent border border-foreground/30 shadow-sm" />
          </div>
        ))}
      </div>

      {/* Benchmark axis numbers */}
      <div className="relative mt-1 h-3">
        {labelBenchmarks.map((s) => (
          <span
            key={s}
            className="absolute -translate-x-1/2 text-[8px] text-muted-foreground/60 tabular-nums"
            style={{ left: pos(s) }}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Team speed chips, fastest first */}
      <ul className="mt-2 space-y-1">
        {sortedSpeeds.map((s, i) => {
          const boost = abilitySpeedBoost(s.ability);
          const boosted = boost.type ? Math.floor(s.eff * boost.mult) : null;
          return (
            <li
              key={`${s.name}-${i}`}
              className="flex items-center gap-2 text-[11px]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-vgc-accent shrink-0" />
              <span className="flex-1 truncate text-foreground/90">
                {s.name}
              </span>
              <span className="font-mono tabular-nums text-foreground">
                {s.eff}
              </span>
              {boosted && (
                <span className="font-mono tabular-nums text-vgc-accent text-[10px]">
                  → {boosted}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {weatherBoosts.length > 0 && (
        <div className="mt-2 text-[10px] text-muted-foreground/70">
          {weatherBoosts
            .map((w) => `${w.name} ×2 in ${w.boost.type}`)
            .join(" · ")}
        </div>
      )}
    </section>
  );
}

// ─── Item Clause ─────────────────────────────────────────────────────────

function ItemClauseSection({
  team,
  megaStone,
}: {
  team: TeamSlot[];
  megaStone?: string;
}) {
  const result = checkItemClause(team);
  if (result.items.length === 0) return null;
  const megaKey = megaStone?.trim().toLowerCase() ?? null;

  return (
    <section>
      <SectionHeader
        hint={
          result.hasViolation ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" /> violation
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-500">
              <CheckCircle2 className="h-3 w-3" /> all unique
            </span>
          )
        }
      >
        Item Clause
      </SectionHeader>
      <ul className="space-y-1">
        {result.items.map(({ holder, item, duplicate }, i) => {
          const isMega = megaKey && item.toLowerCase() === megaKey;
          return (
            <li
              key={`${holder}-${i}`}
              className={cn(
                "grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-2 py-1 text-[11px]",
                duplicate
                  ? "border-destructive/40 bg-destructive/10"
                  : isMega
                    ? "border-vgc-accent/40 bg-vgc-accent-muted"
                    : "bg-card",
              )}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-foreground/90 truncate">
                  {item}
                </span>
                {isMega && (
                  <Sparkles
                    className="h-2.5 w-2.5 shrink-0 text-vgc-accent"
                    aria-hidden
                  />
                )}
              </span>
              <span className="text-muted-foreground/80 truncate text-right">
                {holder}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Meta Position ───────────────────────────────────────────────────────

function MetaPositionSection({ team }: { team: TeamSlot[] }) {
  const filled = team.filter((s): s is FilledTeamSlot => !!s);
  if (filled.length === 0) return null;
  const withUsage = filled.filter((s) => s.usage);
  if (withUsage.length === 0) return null;

  return (
    <section>
      <SectionHeader hint="Pikalytics">Meta Position</SectionHeader>
      <ul className="space-y-1">
        {filled.map((s, i) => {
          const usage = s.usage;
          const tier = usage ? tierForRank(usage.rank) : null;
          return (
            <li
              key={`${s.name}-${i}`}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border bg-card px-2 py-1 text-[11px]"
            >
              <span className="truncate text-foreground/90">{s.name}</span>
              {usage ? (
                <>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {usage.pct.toFixed(1)}%
                  </span>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                      tier === "S"
                        ? "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                        : tier === "A"
                          ? "bg-blue-500/20 text-blue-700 dark:text-blue-400"
                          : tier === "B"
                            ? "bg-muted text-muted-foreground"
                            : "border border-dashed text-muted-foreground",
                    )}
                    title={`Rank #${usage.rank}`}
                  >
                    {tier === "off" ? "off" : `#${usage.rank}`}
                  </span>
                </>
              ) : (
                <>
                  <span />
                  <span className="rounded border border-dashed px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/60">
                    off-meta
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function tierForRank(rank: number): "S" | "A" | "B" | "off" {
  if (rank <= 10) return "S";
  if (rank <= 25) return "A";
  if (rank <= 50) return "B";
  return "off";
}

// ─── Staleness ───────────────────────────────────────────────────────────

function StalenessSection({ staleness }: { staleness: StalenessInfo | null }) {
  const [open, setOpen] = React.useState(false);
  if (!staleness) return null;
  const maxAge = staleness.sources.reduce(
    (acc, s) => Math.max(acc, s.hoursSinceMostRecent),
    0,
  );
  const warn = maxAge > STALENESS_WARN_HOURS;
  const driftCount = staleness.sources.filter((s) => s.hasFsDrift).length;
  return (
    <section className="text-[11px] text-muted-foreground/80">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 transition-colors hover:text-foreground",
          warn && "text-amber-600 dark:text-amber-500",
        )}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" aria-hidden />
        )}
        <span className="text-left">
          Data refreshed {formatHoursAgo(maxAge)} ago
          {warn && " · stale"}
          {driftCount > 0 && ` · ${driftCount} local drift`}
        </span>
      </button>
      {open && (
        <div className="mt-1.5 ml-4 grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-0.5 font-mono text-[10px]">
          {staleness.sources.map((s) => (
            <React.Fragment key={s.name}>
              <span className="text-foreground/80">{s.name}</span>
              <span>{formatHoursAgo(s.hoursSinceMostRecent)} ago</span>
              <span className={s.hasFsDrift ? "text-amber-600" : ""}>
                {s.fileCount} file{s.fileCount === 1 ? "" : "s"}
                {s.hasFsDrift && " · drift"}
              </span>
            </React.Fragment>
          ))}
          <span className="text-foreground/80">index</span>
          <span>{formatHoursAgo(staleness.hoursSinceIndex)} ago</span>
          <span />
        </div>
      )}
    </section>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────────

export function TeamReferencePanel({
  team,
  megaStone,
  staleness,
  className,
}: {
  team: TeamSlot[];
  megaStone?: string;
  staleness: StalenessInfo | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-5 overflow-y-auto rounded-xl border bg-card/30 p-4",
        className,
      )}
    >
      <CoverageGrid team={team} />
      <SpeedTiersSection team={team} />
      <ItemClauseSection team={team} megaStone={megaStone} />
      <MetaPositionSection team={team} />
      <div className="mt-auto border-t pt-3">
        <StalenessSection staleness={staleness} />
      </div>
    </div>
  );
}
