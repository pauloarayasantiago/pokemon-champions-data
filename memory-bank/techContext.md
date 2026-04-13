# Tech Context

## Environment
- **Platform:** Windows 11 Pro
- **Python:** 3.13 (system, miniconda3)
- **Node.js:** with npx tsx for TypeScript execution
- **Shell:** bash (Git Bash on Windows)
- **Encoding:** UTF-8 (set PYTHONIOENCODING=utf-8 for Windows console)

## Python Dependencies
- `requests` + `beautifulsoup4` — Web scraping (Serebii)
- `yt-dlp` — YouTube search and metadata extraction
- `youtube-transcript-api` (v1.2.4) — YouTube transcript fetching
  - API: `YouTubeTranscriptApi().fetch(video_id, languages=["en"])` returns `FetchedTranscript` with `.text` snippets
  - **Known issue:** YouTube rate-limits/IP-blocks after ~24 sequential requests; no documented cooldown period (community reports 1-24 hours)

## TypeScript / Node.js Dependencies
- `@huggingface/transformers` (^4.0.0) — Local embedding model
- `@lancedb/lancedb` (^0.27.2) — Vector database
- `apache-arrow` (^18.1.0) — Data serialization
- `csv-parse` (^6.2.1) — CSV parsing
- `tsx` (^4.21.0) — TypeScript executor
- `typescript` (^6.0.2)

## Embedding Model
- Model: `Xenova/all-MiniLM-L6-v2`
- Dimensions: 384
- Download: ~80MB (first run, cached locally)
- Normalization: L2 for cosine distance

## Scraper Architecture

### scraper.py (Serebii)
- Source: `serebii.net/pokemonchampions/` and `/pokedex-champions/`
- 1-second delay between Pokémon page requests
- Deduplicates by URL (Mega/regional forms share base URLs)
- Extracts all forms (base + Mega) from each page
- Key HTML patterns:
  - Type images: `<img src="/pokedex-bw/type/{type}.gif">`
  - Abilities: `<a href="/abilitydex/...">`
  - Moves: "Standard Moves" `dextable`
  - Mega sections: `class="fooevo"` headers

### scraper_youtube.py (YouTube)
- yt-dlp for search (no API key needed)
- youtube-transcript-api for transcripts (auto-captions)
- Date filter: `--dateafter 20260408` (release day)
- Keyword filter on titles; rejects S/V, Sword/Shield, Unite, TCG, etc.
- Output: `data/transcripts/{date}_{channel}_{slug}.md` with YAML frontmatter
- Deduplication: reads existing transcripts to skip re-downloads
- 21 search queries covering competitive topics, specific creators, and mechanics
