#!/usr/bin/env python3
"""
Import trails from exported JSON and add them to the trail dataset.

Usage:
  python import-trails.py trails.json [--output trails-all.json] [--append]

Each trail in the input is an array of [pixelX, pixelY] points.
The output includes GPS coordinates computed via the same affine transform
used in the web app.
"""

import json
import sys
import argparse
from pathlib import Path

# Same reference points and affine computation as app.js
REF_POINTS = [
    (476, 378, 38.134167, -79.234444),
    (480, 600, 38.134167, -79.230833),
    (493, 595, 38.134444, -79.231111),
    (469, 575, 38.133889, -79.231111),
    (385, 613, 38.132778, -79.230556),
]


def compute_affine(points):
    sxx = syy = sxy = sx = sy = 0
    sxlat = sylat = slat = 0
    sxlon = sylon = slon = 0
    n = len(points)
    for px, py, lat, lon in points:
        sxx += px * px; syy += py * py; sxy += px * py
        sx += px; sy += py
        sxlat += px * lat; sylat += py * lat; slat += lat
        sxlon += px * lon; sylon += py * lon; slon += lon

    def solve3(m, v):
        def det3(m):
            return (m[0]*(m[4]*m[8]-m[5]*m[7])
                  - m[1]*(m[3]*m[8]-m[5]*m[6])
                  + m[2]*(m[3]*m[7]-m[4]*m[6]))
        d = det3(m)
        res = []
        for i in range(3):
            mc = list(m)
            mc[i] = v[0]; mc[i+3] = v[1]; mc[i+6] = v[2]
            res.append(det3(mc) / d)
        return res

    M = [sxx, sxy, sx, sxy, syy, sy, sx, sy, n]
    a, b, c = solve3(M, [sxlat, sylat, slat])
    d, e, f = solve3(M, [sxlon, sylon, slon])
    return a, b, c, d, e, f


def pixel_to_gps(px, py, affine):
    a, b, c, d, e, f = affine
    return a * px + b * py + c, d * px + e * py + f


def main():
    parser = argparse.ArgumentParser(description="Import and convert trail data")
    parser.add_argument("input", help="Input trails JSON file")
    script_dir = Path(__file__).resolve().parent
    parser.add_argument("--output", "-o", default=str(script_dir / "trails-geo.json"),
                        help="Output file (default: map/trails-geo.json)")
    parser.add_argument("--append", "-a", action="store_true",
                        help="Append to existing output file")
    args = parser.parse_args()

    with open(args.input) as f:
        raw_trails = json.load(f)

    affine = compute_affine(REF_POINTS)

    converted = []
    for i, trail in enumerate(raw_trails):
        points = []
        for px, py in trail:
            lat, lon = pixel_to_gps(px, py, affine)
            points.append({"px": px, "py": py, "lat": round(lat, 6), "lon": round(lon, 6)})
        converted.append({"id": i + 1, "name": f"Trail {i + 1}", "points": points})

    if args.append and Path(args.output).exists():
        with open(args.output) as f:
            existing = json.load(f)
        max_id = max((t["id"] for t in existing), default=0)
        for t in converted:
            t["id"] = max_id + t["id"]
        existing.extend(converted)
        converted = existing

    with open(args.output, "w") as f:
        json.dump(converted, f, indent=2)

    print(f"Wrote {len(converted)} trail(s) to {args.output}")
    for t in converted:
        print(f"  - {t['name']}: {len(t['points'])} points")


if __name__ == "__main__":
    main()
