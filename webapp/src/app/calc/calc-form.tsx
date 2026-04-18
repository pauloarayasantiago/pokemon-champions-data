"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CalcFormProps {
  pokemonNames: string[];
  moveNames: string[];
}

interface CalcResult {
  rolls: number[];
  minDmg: number;
  maxDmg: number;
  defenderHP: number;
  minPct: number;
  maxPct: number;
  isOHKO: boolean;
  effectiveness: number;
  moveName: string;
  description: string;
}

interface CalcResponse {
  attacker: string;
  defender: string;
  result?: CalcResult;
  results?: CalcResult[];
  error?: string;
}

export function CalcForm({ pokemonNames, moveNames }: CalcFormProps) {
  const [attacker, setAttacker] = useState("");
  const [defender, setDefender] = useState("");
  const [move, setMove] = useState("");
  const [weather, setWeather] = useState("");
  const [spread, setSpread] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<CalcResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!attacker.trim() || !defender.trim()) return;
    setLoading(true);
    setError(null);
    setResponse(null);
    try {
      const params = new URLSearchParams({ attacker, defender });
      if (move.trim()) params.set("move", move);
      if (weather) params.set("weather", weather);
      if (spread) params.set("spread", "true");
      const res = await fetch(`/api/calc?${params.toString()}`);
      const data = (await res.json()) as CalcResponse;
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResponse(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium">Attacker</span>
            <Input
              list="pokemon-list"
              value={attacker}
              onChange={(e) => setAttacker(e.target.value)}
              placeholder="e.g. Incineroar, Mega Dragonite"
              required
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Defender</span>
            <Input
              list="pokemon-list"
              value={defender}
              onChange={(e) => setDefender(e.target.value)}
              placeholder="e.g. Azumarill"
              required
            />
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs font-medium">Move (optional — omit for all-moves)</span>
          <Input
            list="moves-list"
            value={move}
            onChange={(e) => setMove(e.target.value)}
            placeholder="e.g. Flare Blitz"
          />
        </label>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="space-y-1">
            <span className="text-xs font-medium">Weather</span>
            <select
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="">None</option>
              <option value="sun">Sun</option>
              <option value="rain">Rain</option>
              <option value="sand">Sand</option>
              <option value="snow">Snow</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm mt-5">
            <input
              type="checkbox"
              checked={spread}
              onChange={(e) => setSpread(e.target.checked)}
            />
            Spread move
          </label>
        </div>
        <datalist id="pokemon-list">
          {pokemonNames.map((n) => (
            <option key={n} value={n} />
          ))}
          {pokemonNames.map((n) => (
            <option key={`m-${n}`} value={`Mega ${n}`} />
          ))}
        </datalist>
        <datalist id="moves-list">
          {moveNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <Button type="submit" disabled={loading}>
          {loading ? "Calculating..." : "Calculate"}
        </Button>
      </form>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {response && response.result && (
        <SingleResult
          attacker={response.attacker}
          defender={response.defender}
          result={response.result}
        />
      )}

      {response && response.results && (
        <AllMovesTable
          attacker={response.attacker}
          defender={response.defender}
          results={response.results}
        />
      )}
    </div>
  );
}

function SingleResult({
  attacker,
  defender,
  result,
}: {
  attacker: string;
  defender: string;
  result: CalcResult;
}) {
  const avg = result.rolls.reduce((a, b) => a + b, 0) / result.rolls.length;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="font-medium">
        {attacker} <span className="text-muted-foreground">→ {result.moveName} →</span> {defender}
      </div>
      <div className="text-xs text-muted-foreground">{result.description}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
        <span>Damage: {result.minDmg}-{result.maxDmg}</span>
        <span>Avg: {avg.toFixed(0)}</span>
        <span>%HP: {result.minPct.toFixed(1)}-{result.maxPct.toFixed(1)}%</span>
        <span>Eff: {result.effectiveness}x</span>
        {result.isOHKO && <span className="text-destructive font-semibold">OHKO</span>}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">16 rolls</summary>
        <div className="mt-1 font-mono">{result.rolls.join(", ")}</div>
      </details>
    </div>
  );
}

function AllMovesTable({
  attacker,
  defender,
  results,
}: {
  attacker: string;
  defender: string;
  results: CalcResult[];
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        {attacker} vs {defender} · all moves
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="p-1.5 text-left">Move</th>
              <th className="p-1.5 text-right">Damage</th>
              <th className="p-1.5 text-right">%HP</th>
              <th className="p-1.5 text-right">Eff</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.moveName} className="border-b">
                <td className="p-1.5 font-medium">{r.moveName}</td>
                <td className="p-1.5 text-right font-mono">{r.minDmg}-{r.maxDmg}</td>
                <td className="p-1.5 text-right font-mono">{r.minPct.toFixed(1)}-{r.maxPct.toFixed(1)}%</td>
                <td className="p-1.5 text-right font-mono">{r.effectiveness}x</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
