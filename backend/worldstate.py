"""World-state hazard layer for the map — free, keyless feeds cached 30 min.

Sources (both verified 2026-07):
  USGS  — M4.5+ earthquakes, last 24h
  EONET — NASA's open natural events: wildfires, volcanoes, severe storms

Conflict/unrest feeds were all key-gated or dead when checked (GDELT GEO 404s,
UCDP needs a token, ReliefWeb needs an approved appname) — revisit if a
keyless source appears, or add ACLED as an optional BYOK key.
"""
import json
import time
import urllib.request

UA = {"User-Agent": "Quantily personal research dashboard"}
TTL_SECONDS = 1800
_cache = {"ts": 0.0, "data": None}


def _get_json(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def _quakes() -> list:
    d = _get_json("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson")
    out = []
    for f in d.get("features", []):
        lon, lat = f["geometry"]["coordinates"][:2]
        mag = f["properties"].get("mag") or 0
        out.append({
            "lat": lat, "lng": lon, "kind": "quake",
            "label": f"M{mag} — {f['properties'].get('place', '')}",
            "severity": 3 if mag >= 6 else 2 if mag >= 5 else 1,
        })
    return out


def _eonet() -> list:
    d = _get_json("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=300")
    kinds = {"wildfires": "wildfire", "volcanoes": "volcano", "severeStorms": "storm"}
    out = []
    fires = 0
    for e in d.get("events", []):
        kind = kinds.get((e.get("categories") or [{}])[0].get("id"))
        if not kind or not e.get("geometry"):
            continue
        if kind == "wildfire":
            fires += 1
            if fires > 15:
                continue  # ponytail: EONET lists hundreds of small fires; cap the noise
        coords = e["geometry"][-1].get("coordinates")
        if not coords or isinstance(coords[0], list):
            continue  # skip polygon geometries
        out.append({
            "lat": coords[1], "lng": coords[0], "kind": kind,
            "label": e.get("title", ""),
            "severity": 3 if kind == "volcano" else 2,
        })
    return out


def get_world_state() -> dict:
    now = time.time()
    if _cache["data"] and now - _cache["ts"] < TTL_SECONDS:
        return _cache["data"]
    events = []
    for source in (_quakes, _eonet):
        try:
            events += source()
        except Exception as e:
            print(f"World-state source {source.__name__} failed: {e}")
    data = {"events": events, "updated": int(now * 1000)}
    if events or not _cache["data"]:
        _cache.update(ts=now, data=data)
    return _cache["data"] or data
