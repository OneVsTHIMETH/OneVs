#!/usr/bin/env python3
"""Assemble scene clips and mix music, SFX and voice into one MP4 using FFmpeg.

Usage: python render.py film-render-manifest.json [output.mp4]
All media paths are relative to the manifest file unless absolute.
"""
import json, subprocess, sys
from pathlib import Path

def run(args):
    subprocess.run(args, check=True)

def probe_duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=True, capture_output=True, text=True
    )
    return float(result.stdout.strip())

def main():
    if len(sys.argv) not in (2, 3):
        raise SystemExit("Usage: python render.py manifest.json [output.mp4]")
    manifest_path = Path(sys.argv[1]).resolve()
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    base = manifest_path.parent
    clips = [((base / p).resolve() if not Path(p).is_absolute() else Path(p)) for p in data.get("clips", [])]
    if not clips or any(not p.is_file() for p in clips):
        raise SystemExit("Manifest clips must list existing video files in the same folder.")
    tracks = data.get("audio_tracks", [])
    for track in tracks:
        p = Path(track["file"])
        track["_path"] = (base / p).resolve() if not p.is_absolute() else p
        if not track["_path"].is_file():
            raise SystemExit(f"Audio file not found: {track['_path']}")
    output = Path(sys.argv[2]).resolve() if len(sys.argv) == 3 else base / "final-film.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)
    durations = [probe_duration(p) for p in clips]
    total = sum(durations)
    width, height = int(data.get("width", 1920)), int(data.get("height", 1080))
    fps = int(data.get("fps", 30))

    cmd = ["ffmpeg", "-y"]
    for p in clips:
        cmd += ["-i", str(p)]
    audio_input_indexes = []
    for track in tracks:
        if track.get("loop") and track.get("type") == "music":
            cmd += ["-stream_loop", "-1"]
        cmd += ["-i", str(track["_path"])]
        audio_input_indexes.append(len(clips) + len(audio_input_indexes))
    if not tracks:
        cmd += ["-f", "lavfi", "-t", str(total), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
        audio_input_indexes.append(len(clips))

    filters = []
    video_labels = []
    for i in range(len(clips)):
        label = f"v{i}"
        filters.append(
            f"[{i}:v:0]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps},"
            f"format=yuv420p[{label}]"
        )
        video_labels.append(f"[{label}]")
    filters.append("".join(video_labels) + f"concat=n={len(clips)}:v=1:a=0[vout]")

    audio_labels = []
    for j, track in enumerate(tracks):
        idx = audio_input_indexes[j]
        label = f"a{j}"
        start = max(0, int(float(track.get("start_seconds", 0)) * 1000))
        volume = max(0.0, min(2.0, float(track.get("volume", 1))))
        filters.append(
            f"[{idx}:a:0]aresample=48000,adelay={start}|{start},"
            f"volume={volume},atrim=duration={total:.3f},asetpts=PTS-STARTPTS[{label}]"
        )
        audio_labels.append(f"[{label}]")
    if tracks:
        filters.append("".join(audio_labels) + f"amix=inputs={len(tracks)}:duration=longest:dropout_transition=2,"
                       f"alimiter=limit=0.95[aout]")
    else:
        filters.append(f"[{audio_input_indexes[0]}:a:0]atrim=duration={total:.3f},asetpts=PTS-STARTPTS[aout]")

    cmd += ["-filter_complex", ";".join(filters), "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
            "-t", f"{total:.3f}", str(output)]
    run(cmd)
    print(f"\nFinal film created: {output}")

if __name__ == "__main__":
    main()
