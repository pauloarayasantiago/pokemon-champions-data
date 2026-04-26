"""
faster-whisper transcription fallback for YouTube videos whose captions endpoint
is rate-limited or unavailable.

Pipeline: yt-dlp -x (audio-only download via the audio CDN, different infra than
the captions endpoint) -> faster-whisper local ASR (medium.en on GPU). Used as
a per-video fallback when scraper_youtube.py's primary yt-dlp captions path
returns None.

Module-global model is lazy-loaded on first call (first call also downloads
~1.5 GB of model weights to ~/.cache/huggingface/hub/ if not cached). Subsequent
calls reuse the loaded model.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Lazy import inside transcribe_via_whisper() so this module can be imported
# even if faster_whisper isn't installed (caller can detect via the env knob).

WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "medium.en")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")  # "cuda" or "cpu"
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
WHISPER_AUDIO_TIMEOUT = int(os.environ.get("WHISPER_AUDIO_TIMEOUT", "300"))  # 5 min audio download
WHISPER_TRANSCRIBE_TIMEOUT = int(os.environ.get("WHISPER_TRANSCRIBE_TIMEOUT", "1200"))  # 20 min transcription
IMPERSONATE_TARGET = os.environ.get("YOUTUBE_IMPERSONATE", "Chrome")

_model = None  # cached after first load


def _load_model():
    """Lazy-load + cache the WhisperModel. Returns None if faster-whisper is not installed."""
    global _model
    if _model is not None:
        return _model
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("  whisper unavailable: faster-whisper not installed (pip install faster-whisper)")
        return None
    t0 = time.time()
    try:
        _model = WhisperModel(WHISPER_MODEL_NAME, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE_TYPE)
    except Exception as exc:
        # Common cause: CUDA not available -> retry on CPU
        if WHISPER_DEVICE == "cuda":
            print(f"  whisper CUDA load failed ({type(exc).__name__}); falling back to CPU")
            try:
                _model = WhisperModel(WHISPER_MODEL_NAME, device="cpu", compute_type=WHISPER_COMPUTE_TYPE)
            except Exception as exc2:
                print(f"  whisper CPU load also failed: {exc2}")
                return None
        else:
            print(f"  whisper load failed: {exc}")
            return None
    print(f"  whisper model {WHISPER_MODEL_NAME} loaded ({WHISPER_DEVICE}/{WHISPER_COMPUTE_TYPE}) in {time.time()-t0:.1f}s")
    return _model


def _download_audio(video_id: str, dest_dir: Path) -> tuple[Path | None, bool]:
    """Download a video's audio track only via yt-dlp.

    Returns (path_or_None, was_rate_limited). Uses --impersonate Chrome via the
    same curl_cffi-backed pathway as scraper_youtube.py's get_transcript(). The
    audio CDN appears to be rate-limited separately from the captions endpoint
    (different infrastructure), but we still propagate the 429 signal so the
    caller can short-circuit if both endpoints are simultaneously blocked.
    """
    out_template = str(dest_dir / "%(id)s.%(ext)s")
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-x", "--audio-format", "mp3", "--audio-quality", "7",  # quality 7 = ~64kbps, plenty for ASR
        "--impersonate", IMPERSONATE_TARGET,
        "--no-warnings", "--quiet",
        "-o", out_template,
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=WHISPER_AUDIO_TIMEOUT, check=False)
    except subprocess.TimeoutExpired:
        print(f"  whisper audio-download timeout for {video_id}")
        return None, False
    audio_path = dest_dir / f"{video_id}.mp3"
    if audio_path.exists():
        return audio_path, False
    stderr = result.stderr or ""
    rate_limited = "429" in stderr or "Too Many Requests" in stderr
    stderr_tail = stderr.strip().splitlines()[-1] if stderr.strip() else "(no stderr)"
    safe_msg = stderr_tail.encode("ascii", errors="replace").decode()
    print(f"  whisper audio-download failed for {video_id}: {safe_msg}")
    return None, rate_limited


def transcribe_via_whisper(video_id: str) -> tuple[str | None, bool]:
    """Download audio for video_id and transcribe with faster-whisper.

    Returns (transcript_text_or_None, was_rate_limited). The bool propagates
    yt-dlp's 429 signal from the audio download (NOT a whisper-level failure)
    so scraper_youtube.py's main loop can fold it into its 429-streak counter.

    Whisper-internal failures (CUDA OOM, model load error, transcription crash)
    return (None, False) — they're not rate-limit signals.
    """
    model = _load_model()
    if model is None:
        return None, False

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        audio_path, rate_limited = _download_audio(video_id, tmp_path)
        if audio_path is None:
            return None, rate_limited
        t0 = time.time()
        try:
            segments, info = model.transcribe(
                str(audio_path),
                beam_size=WHISPER_BEAM_SIZE,
                language="en",
                vad_filter=True,  # voice activity detection - skips silence, speeds up
            )
            text_parts = [seg.text.strip() for seg in segments]
        except Exception as exc:
            print(f"  whisper transcription failed for {video_id}: {type(exc).__name__}: {str(exc)[:200]}")
            return None, False
        text = " ".join(p for p in text_parts if p)
        elapsed = time.time() - t0
        rt_factor = info.duration / elapsed if elapsed > 0 else 0
        print(f"  whisper {info.duration:.0f}s audio in {elapsed:.0f}s ({rt_factor:.1f}x realtime, {len(text)} chars)")
        if not text or len(text) < 200:
            # Sub-200-char output on a real video signals transcription failure
            # (silent / heavily-compressed / non-English with .en model).
            print(f"  whisper output too short ({len(text)} chars); treating as failure")
            return None, False
        return text, False
