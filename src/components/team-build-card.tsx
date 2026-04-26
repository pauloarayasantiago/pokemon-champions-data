"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TypeBadge,
  type PokemonType,
} from "@/components/ui/type-badge";

export interface TeamBuildPokemon {
  name: string;
  item?: string;
  ability?: string;
  moves?: string[];
  spread?: string;
  nature?: string;
}

export interface TeamBuildData {
  archetype?: string;
  megaStone?: string;
  pokemon: TeamBuildPokemon[];
}

const STAT_LABELS = ["HP", "Atk", "Def", "SpA", "SpD", "Spe"] as const;

function parseSpread(spread: string | undefined): number[] | null {
  if (!spread) return null;
  const parts = spread.split(/[\/,\s]+/).filter(Boolean).map(Number);
  if (parts.length !== 6 || parts.some((n) => Number.isNaN(n))) return null;
  return parts;
}

function PokemonCard({
  pokemon,
  isMega,
  types,
}: {
  pokemon: TeamBuildPokemon;
  isMega: boolean;
  types: PokemonType[] | null;
}) {
  const spread = parseSpread(pokemon.spread);
  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2 transition-colors bg-card",
        isMega && "border-vgc-accent/50 bg-vgc-accent-muted",
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-foreground">
          {pokemon.name}
        </span>
        {isMega && (
          <span className="inline-flex items-center gap-0.5 rounded bg-vgc-accent text-black px-1 text-[9px] font-bold uppercase tracking-wide">
            <Sparkles className="h-2.5 w-2.5" aria-hidden />
            Mega
          </span>
        )}
        {types && types.length > 0 && (
          <span className="ml-auto flex gap-1">
            {types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </span>
        )}
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
        {pokemon.item && (
          <>
            <span className="text-muted-foreground/70 uppercase tracking-wide text-[9px] self-center">
              Item
            </span>
            <span
              className="font-mono text-[11px] truncate text-foreground"
              title={pokemon.item}
            >
              {pokemon.item}
            </span>
          </>
        )}
        {pokemon.ability && (
          <>
            <span className="text-muted-foreground/70 uppercase tracking-wide text-[9px] self-center">
              Ability
            </span>
            <span
              className="text-[11px] truncate text-foreground"
              title={pokemon.ability}
            >
              {pokemon.ability}
            </span>
          </>
        )}
      </div>

      {pokemon.moves && pokemon.moves.length > 0 && (
        <div className="grid grid-cols-2 gap-1">
          {pokemon.moves.slice(0, 4).map((m, i) => (
            <span
              key={i}
              className="rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-foreground/90 truncate"
              title={m}
            >
              {m}
            </span>
          ))}
        </div>
      )}

      {(spread || pokemon.nature) && (
        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          {spread ? (
            <div className="grid grid-cols-6 gap-0.5">
              {STAT_LABELS.map((label, i) => {
                const v = spread[i] ?? 0;
                const isMax = v === 32;
                const isZero = v === 0;
                return (
                  <div key={label} className="text-center">
                    <div className="text-[8px] uppercase tracking-wide text-muted-foreground/60">
                      {label}
                    </div>
                    <div
                      className={cn(
                        "font-mono text-[10px]",
                        isMax && "text-vgc-accent font-bold",
                        isZero && "text-muted-foreground/50",
                      )}
                    >
                      {v}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : pokemon.spread ? (
            <div className="font-mono text-[10px] text-muted-foreground">
              {pokemon.spread}
            </div>
          ) : null}
          {pokemon.nature && (
            <div className="mt-1 text-center text-[9px] uppercase tracking-wide text-muted-foreground/70">
              {pokemon.nature}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TeamBuildGrid({
  team,
  lookupTypes,
}: {
  team: TeamBuildData;
  lookupTypes?: (name: string) => PokemonType[] | null;
}) {
  if (!team.pokemon || team.pokemon.length === 0) return null;
  const megaStone = team.megaStone?.trim() ?? null;

  return (
    <div className="my-3 rounded-xl border bg-background/60 p-3">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            Team
          </span>
          {team.archetype && (
            <span className="text-sm font-semibold text-foreground">
              {team.archetype}
            </span>
          )}
        </div>
        {megaStone && (
          <span className="inline-flex items-center gap-1 rounded-md bg-vgc-accent-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
            <Sparkles className="h-3 w-3 text-vgc-accent" aria-hidden />
            <span className="font-mono">{megaStone}</span>
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {team.pokemon.map((p, i) => {
          const isMega = !!megaStone && p.item === megaStone;
          const types = lookupTypes?.(p.name) ?? null;
          return (
            <PokemonCard
              key={`${p.name}-${i}`}
              pokemon={p}
              isMega={isMega}
              types={types}
            />
          );
        })}
      </div>
    </div>
  );
}
