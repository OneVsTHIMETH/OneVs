#!/usr/bin/env python3
"""Simple FFmpeg assembly worker for already-generated scene clips.

Usage: python render.py manifest.json output.mp4
Manifest example is in manifest.example.json. This does not generate AI clips.
"""
import json, subprocess, sys, tempfile
from pathlib import Path

def run(args):
    subprocess.run(args, check=True)

def main():
    if len(sys.argv) != 3:
        raise SystemExit("Usage: python render.py manifest.json output.mp4")
    manifest_path, output = Path(sys.argv[1]), Path(sys.argv[2])
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    clips = [Path(x) for x in data.get("clips", [])]
    if not clips or any(not x.is_file() for x in clips):
        raise SystemExit("Manifest must contain existing local video clip paths.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        list_file = Path(td) / "clips.txt"
        list_file.write_text("".join(f"file '{p.resolve().as_posix()}'\n" for p in clips), encoding="utf-8")
        joined = Path(td) / "joined.mp4"
        run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(joined)])
        audio = data.get("audio")
        if audio:
            audio_path = Path(audio)
            if not audio_path.is_file():
                raise SystemExit(f"Audio file not found: {audio_path}")
            run(["ffmpeg", "-y", "-i", str(joined), "-i", str(audio_path), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", str(output)])
        else:
            run(["ffmpeg", "-y", "-i", str(joined), "-c", "copy", str(output)])
    print(f"Rendered: {output.resolve()}")

if __name__ == "__main__":
    main()
