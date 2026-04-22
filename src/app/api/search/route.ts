import { type NextRequest } from "next/server";
import { query } from "@core/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Phase 3: Gemma rerank can take 10-15s per query (4 sub-queries × ~10s
// reranks via Promise.all on vsPair planner). 30s is safe headroom over the
// 5s default for a Vercel Lambda Node runtime.
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q");
  const topK = Number(searchParams.get("topK") ?? "5");

  if (!q || q.trim().length === 0) {
    return Response.json({ error: "Missing q parameter" }, { status: 400 });
  }

  try {
    const results = await query(q, topK);
    return Response.json({ q, topK, results });
  } catch (err) {
    console.error("[/api/search] error:", err);
    return Response.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
