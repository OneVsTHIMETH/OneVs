# FFmpeg assembly worker

This worker assembles **existing generated clips**; it does not generate video or remove backgrounds.

Requirements: Python 3.10+ and FFmpeg available on PATH.

1. Copy `manifest.example.json` to `manifest.json`.
2. Put generated scene clips and optional soundtrack beside it, then update paths.
3. Run `python render.py manifest.json final-film.mp4`.

For production, run this in a private job worker/container, not in the browser. Validate ownership of every source asset, limit total duration/file size, use per-user temporary directories, and upload the finished MP4 to private object storage. Do not expose service-role keys to the browser.
