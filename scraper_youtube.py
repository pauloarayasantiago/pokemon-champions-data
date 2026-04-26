"""
YouTube transcript scraper for Pokemon Champions competitive content.

Searches YouTube for recent Pokemon Champions videos (post-release only:
April 8, 2026+), extracts auto-generated transcripts, and saves them as
markdown files for indexing into the Supabase pgvector knowledge base.

Usage:
    python scraper_youtube.py                    # default search
    python scraper_youtube.py --max 30           # fetch up to 30 videos
    python scraper_youtube.py --query "rain team" # custom search term (appended to "Pokemon Champions")
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

RELEASE_DATE = "20260408"  # Pokemon Champions release date (YYYYMMDD)
OUTPUT_DIR = Path(__file__).parent / "data" / "transcripts"
DELAY_SECONDS = 5  # polite delay between transcript fetches (raised from 1 after IP rate-limit observed 2026-04-24)
MAX_FETCH_PER_RUN = int(os.environ.get("YOUTUBE_MAX_FETCH_PER_RUN", "20"))  # daily cadence × this cap = ~140/week ceiling
RATE_LIMIT_STREAK_ABORT = int(os.environ.get("YOUTUBE_RATE_LIMIT_STREAK", "3"))  # abort run after N consecutive 429s
IMPERSONATE_TARGET = os.environ.get("YOUTUBE_IMPERSONATE", "Chrome")  # requires curl_cffi 0.10-0.14.x installed

# Whisper fallback (per-video waterfall): if yt-dlp captions returns None, try
# faster-whisper on downloaded audio. Lower cap because whisper is heavier
# (audio download + GPU compute, ~1-3 min/video on RTX 2070 SUPER).
WHISPER_FALLBACK_ENABLED = os.environ.get("WHISPER_FALLBACK", "1") not in ("0", "false", "False")
MAX_WHISPER_PER_RUN = int(os.environ.get("YOUTUBE_MAX_WHISPER_PER_RUN", "5"))

# Fix Windows console encoding for emoji-heavy YouTube titles
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Search queries — "Pokemon Champions" is always prepended
SEARCH_QUERIES = [
    # Core competitive
    "competitive team building",
    "VGC doubles tier list",
    "best Pokemon meta",
    "team guide",
    "top Pokemon ranked",
    # Mega Evolution (the only gimmick)
    "mega evolution competitive",
    "best mega evolution tier list",
    "mega dragonite mega clefable mega meganium",
    # Weather wars (meta-defining)
    "rain team sun team weather",
    "trick room team",
    "sand team tyranitar excadrill",
    # Champions-specific mechanics
    "fake out changes encore mechanics",
    "missing items no life orb choice band",
    "stat points EV IV changes",
    # Key Pokemon
    "Incineroar no knock off parting shot",
    "Garchomp Sneasler Kingambit",
    "Floette Eternal fairy aura",
    # Specific creators (channel search)
    "WolfeyVGC champions",
    "CybertronVGC champions",
    "Freezai champions",
    # Tournament results
    "tournament winning team results",
]

# Reject videos with these in the title (wrong game / irrelevant)
REJECT_KEYWORDS = [
    "scarlet", "violet", "sword", "shield", "legends arceus",
    "legends z-a", "unite", "pokemon go", "tcg", "trading card",
    "unboxing", "pack opening", "asmr",
]


def slugify(text: str) -> str:
    """Convert text to filesystem-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text[:80].rstrip("-")


def search_youtube(query: str, max_results: int = 20) -> list[dict]:
    """Use yt-dlp to search YouTube and return video metadata."""
    search_term = f"Pokemon Champions {query}"
    cmd = [
        sys.executable, "-m", "yt_dlp",
        f"ytsearch{max_results}:{search_term}",
        "--dump-json",
        "--flat-playlist",
        "--no-download",
        "--dateafter", RELEASE_DATE,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        print(f"  yt-dlp error for '{search_term}': {result.stderr[:200]}")
        return []

    videos = []
    for line in result.stdout.strip().split("\n"):
        if not line.strip():
            continue
        try:
            data = json.loads(line)
            videos.append(data)
        except json.JSONDecodeError:
            continue

    return videos


def filter_video(video: dict) -> bool:
    """Return True if the video is relevant Pokemon Champions content."""
    title = (video.get("title") or "").lower()

    # Reject wrong-game content
    for kw in REJECT_KEYWORDS:
        if kw in title:
            return False

    # Must mention pokemon or champions somewhere in title/description
    desc = (video.get("description") or "").lower()
    combined = title + " " + desc
    if "champion" not in combined and "pokemon" not in combined:
        return False

    # Date filter: reject before release date
    upload_date = video.get("upload_date") or ""
    if upload_date and upload_date < RELEASE_DATE:
        return False

    return True


def get_transcript(video_id: str) -> tuple[str | None, bool]:
    """Fetch transcript via yt-dlp's subtitle path with browser impersonation.

    Returns (transcript_text_or_None, was_rate_limited). The bool lets the
    main loop count consecutive 429s and abort early to avoid digging deeper
    into a known-blocked state.

    The original `youtube-transcript-api` backend was IP-blocked by YouTube
    (residential IP, post-2026-04-23). yt-dlp uses a different HTTP path
    plus curl_cffi-based TLS impersonation, which is more resilient.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        cmd = [
            sys.executable, "-m", "yt_dlp",
            "--write-auto-subs", "--skip-download",
            "--sub-lang", "en", "--sub-format", "vtt",
            "--impersonate", IMPERSONATE_TARGET,
            "-o", f"{tmpdir}/%(id)s.%(ext)s",
            "--no-warnings", "--quiet",
            f"https://www.youtube.com/watch?v={video_id}",
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
        except subprocess.TimeoutExpired:
            print(f"  yt-dlp timeout for {video_id}")
            return None, False
        vtt_path = Path(tmpdir) / f"{video_id}.en.vtt"
        stderr = (result.stderr or "")
        if not vtt_path.exists():
            stderr_tail = stderr.strip().splitlines()[-1] if stderr.strip() else "(no stderr)"
            safe_msg = stderr_tail.encode("ascii", errors="replace").decode()
            print(f"  No transcript for {video_id}: {safe_msg}")
            rate_limited = "429" in stderr or "Too Many Requests" in stderr
            return None, rate_limited
        return _vtt_to_text(vtt_path.read_text(encoding="utf-8", errors="replace")), False


def _vtt_to_text(vtt: str) -> str:
    """Strip VTT headers, timecodes, and inline tags. Dedup consecutive duplicate cues."""
    lines = []
    for raw in vtt.splitlines():
        line = raw.strip()
        if not line or line == "WEBVTT":
            continue
        if line.startswith(("NOTE", "Kind:", "Language:", "STYLE", "REGION")):
            continue
        if "-->" in line:
            continue
        line = re.sub(r"<[^>]+>", "", line)  # YouTube auto-subs interleave <c> and timestamp tags
        if line:
            lines.append(line)
    deduped = []
    for ln in lines:
        if not deduped or deduped[-1] != ln:
            deduped.append(ln)
    return " ".join(deduped)


def save_transcript(video: dict, transcript_text: str, output_dir: Path, source: str = "ytdlp") -> Path:
    """Save transcript as markdown with frontmatter metadata.

    `source` is the extraction method ("ytdlp" for native captions, "whisper"
    for ASR fallback). Saved to frontmatter for downstream auditing.
    """
    title = video.get("title", "Untitled")
    channel = video.get("channel") or video.get("uploader") or "Unknown"
    upload_date = video.get("upload_date") or "unknown"
    video_id = video.get("id") or video.get("url", "").split("=")[-1]
    view_count = video.get("view_count") or 0
    duration = video.get("duration") or 0

    # Format date
    if len(upload_date) == 8:
        date_str = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
    else:
        date_str = upload_date

    # Build filename
    slug = slugify(f"{channel}-{title}")
    filename = f"{date_str}_{slug}.md"
    filepath = output_dir / filename

    # Clean transcript: collapse excessive whitespace, add paragraph breaks
    lines = transcript_text.strip().split("\n")
    # Group into ~5-sentence paragraphs for better chunking
    paragraphs = []
    current = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        current.append(line)
        if len(current) >= 5:
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))

    body = "\n\n".join(paragraphs)

    # Format duration
    duration = int(duration)
    mins = duration // 60
    secs = duration % 60

    content = f"""---
title: "{title.replace('"', '\\"')}"
channel: "{channel.replace('"', '\\"')}"
date: {date_str}
url: https://www.youtube.com/watch?v={video_id}
views: {view_count}
duration: {mins}m{secs:02d}s
source: {source}
---

# {title}

**Channel:** {channel} | **Date:** {date_str} | **Views:** {view_count:,} | **Duration:** {mins}:{secs:02d}

---

{body}
"""

    filepath.write_text(content, encoding="utf-8")
    return filepath


def main():
    parser = argparse.ArgumentParser(description="Scrape Pokemon Champions YouTube transcripts")
    parser.add_argument("--max", type=int, default=15, help="Max videos per search query (default: 15)")
    parser.add_argument("--query", type=str, default=None, help="Custom search query (appended to 'Pokemon Champions')")
    args = parser.parse_args()

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Determine search queries
    queries = [args.query] if args.query else SEARCH_QUERIES

    # Track seen video IDs to avoid duplicates across queries
    # Also load IDs from existing transcripts to skip re-downloading
    seen_ids: set[str] = set()
    if OUTPUT_DIR.exists():
        for f in OUTPUT_DIR.glob("*.md"):
            content = f.read_text(encoding="utf-8", errors="replace")
            for line in content.split("\n"):
                if "youtube.com/watch?v=" in line:
                    vid = line.split("watch?v=")[-1].strip()
                    if vid:
                        seen_ids.add(vid)
        if seen_ids:
            print(f"Skipping {len(seen_ids)} previously downloaded videos")
    saved_count = 0
    skip_count = 0
    no_transcript_count = 0

    print(f"Pokemon Champions YouTube Transcript Scraper")
    print(f"Release date filter: >= {RELEASE_DATE}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Queries: {len(queries)} | Cap: {MAX_FETCH_PER_RUN}/run | Delay: {DELAY_SECONDS}s | 429-streak abort: {RATE_LIMIT_STREAK_ABORT} | Impersonate: {IMPERSONATE_TARGET}")
    print(f"Whisper fallback: {'on' if WHISPER_FALLBACK_ENABLED else 'off'} (cap {MAX_WHISPER_PER_RUN}/run)")
    print()

    fetch_attempts = 0
    whisper_attempts = 0
    saved_via_ytdlp = 0
    saved_via_whisper = 0
    rate_limit_streak = 0
    cap_hit = False
    rate_limit_aborted = False
    for qi, query in enumerate(queries, 1):
        if cap_hit or rate_limit_aborted:
            break
        print(f"[{qi}/{len(queries)}] Searching: 'Pokemon Champions {query}'")
        videos = search_youtube(query, max_results=args.max)
        print(f"  Found {len(videos)} results")

        for video in videos:
            video_id = video.get("id") or ""
            if not video_id or video_id in seen_ids:
                continue
            seen_ids.add(video_id)

            title = video.get("title", "?")

            if not filter_video(video):
                skip_count += 1
                continue

            if fetch_attempts >= MAX_FETCH_PER_RUN:
                print(f"  Reached MAX_FETCH_PER_RUN={MAX_FETCH_PER_RUN}; stopping this run to avoid rate-limit.")
                cap_hit = True
                break

            print(f"  Fetching transcript: {title[:70]}...")
            fetch_attempts += 1
            transcript_text, rate_limited = get_transcript(video_id)
            source = "ytdlp"

            if rate_limited:
                rate_limit_streak += 1
            else:
                rate_limit_streak = 0

            # Per-video waterfall: if yt-dlp captions came back empty (whether
            # 429, no captions, or other failure), try faster-whisper on the
            # downloaded audio. Whisper hits a different YouTube endpoint
            # (audio CDN), so it can succeed even when captions are blocked.
            if not transcript_text and WHISPER_FALLBACK_ENABLED and whisper_attempts < MAX_WHISPER_PER_RUN:
                from scraper_youtube_whisper import transcribe_via_whisper
                print(f"  -> trying whisper fallback ({whisper_attempts+1}/{MAX_WHISPER_PER_RUN})")
                whisper_attempts += 1
                w_text, w_rate_limited = transcribe_via_whisper(video_id)
                if w_rate_limited:
                    rate_limit_streak += 1
                # Whisper success resets the streak (we got data despite the captions block)
                if w_text:
                    rate_limit_streak = 0
                    transcript_text = w_text
                    source = "whisper"

            # 429-streak abort considered AFTER whisper fallback so we only bail
            # when both endpoints are simultaneously blocked.
            if rate_limit_streak >= RATE_LIMIT_STREAK_ABORT:
                print(f"  Aborting run after {rate_limit_streak} consecutive rate-limit signals across both methods.")
                rate_limit_aborted = True
                if not transcript_text:
                    no_transcript_count += 1
                    break

            if not transcript_text:
                no_transcript_count += 1
                continue

            filepath = save_transcript(video, transcript_text, OUTPUT_DIR, source=source)
            saved_count += 1
            if source == "whisper":
                saved_via_whisper += 1
            else:
                saved_via_ytdlp += 1
            print(f"    -> Saved ({source}): {filepath.name}")

            time.sleep(DELAY_SECONDS)

        print()

    print(f"Done!")
    print(f"  Saved: {saved_count} transcripts ({saved_via_ytdlp} via ytdlp, {saved_via_whisper} via whisper)")
    print(f"  Skipped (filtered): {skip_count}")
    print(f"  No transcript available: {no_transcript_count}")
    abort_note = " (cap hit)" if cap_hit else (" (rate-limit abort)" if rate_limit_aborted else "")
    print(f"  ytdlp fetch attempts: {fetch_attempts} / cap {MAX_FETCH_PER_RUN}{abort_note}")
    print(f"  whisper fetch attempts: {whisper_attempts} / cap {MAX_WHISPER_PER_RUN}")
    print(f"  Total unique videos checked: {len(seen_ids)}")
    print(f"  Output directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
