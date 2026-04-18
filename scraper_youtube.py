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
import time
from datetime import datetime, timezone
from pathlib import Path

from youtube_transcript_api import YouTubeTranscriptApi

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

RELEASE_DATE = "20260408"  # Pokemon Champions release date (YYYYMMDD)
OUTPUT_DIR = Path(__file__).parent / "data" / "transcripts"
DELAY_SECONDS = 1  # polite delay between transcript fetches

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


def get_transcript(video_id: str) -> str | None:
    """Fetch transcript for a YouTube video. Returns None if unavailable."""
    try:
        api = YouTubeTranscriptApi()
        transcript = api.fetch(video_id, languages=["en"])
        # Join snippet texts into full transcript
        return " ".join(snippet.text for snippet in transcript)
    except Exception as e:
        safe_msg = str(e).encode("ascii", errors="replace").decode()
        print(f"  No transcript for {video_id}: {safe_msg}")
        return None


def save_transcript(video: dict, transcript_text: str, output_dir: Path) -> Path:
    """Save transcript as markdown with frontmatter metadata."""
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
    print(f"Queries: {len(queries)}")
    print()

    for qi, query in enumerate(queries, 1):
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

            print(f"  Fetching transcript: {title[:70]}...")
            transcript_text = get_transcript(video_id)

            if not transcript_text:
                no_transcript_count += 1
                continue

            filepath = save_transcript(video, transcript_text, OUTPUT_DIR)
            saved_count += 1
            print(f"    -> Saved: {filepath.name}")

            time.sleep(DELAY_SECONDS)

        print()

    print(f"Done!")
    print(f"  Saved: {saved_count} transcripts")
    print(f"  Skipped (filtered): {skip_count}")
    print(f"  No transcript available: {no_transcript_count}")
    print(f"  Total unique videos checked: {len(seen_ids)}")
    print(f"  Output directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
