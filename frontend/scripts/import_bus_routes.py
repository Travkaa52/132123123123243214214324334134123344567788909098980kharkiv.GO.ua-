import json
import re
import math
import glob
import os

ASSETS_BUS_DIR = "/home/claude/src_extracted/src/assets/marshryt transporty kharkiv/marshryt avtobus"
DATA_DIR = "/home/claude/src_extracted/src/data"
BUS_SCHEDULE_PATH = "/home/claude/src_extracted/src/assets/rozklad ryhy avtobus/all_routes_avtobus.json"

BUS_COLOR = "#4FA37A"  # TRANSPORT_COLORS.bus з config/map.ts


def dist_m(lat1, lng1, lat2, lng2):
    R = 6371000
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_kml(path):
    s = open(path, encoding="utf-8").read()
    doc_name_m = re.search(r"<Document>\s*<name>(.*?)</name>", s, re.S)
    doc_name = doc_name_m.group(1).strip() if doc_name_m else ""

    placemarks = re.findall(r"<Placemark>.*?</Placemark>", s, re.S)

    lines = []  # list of coord-lists (lng,lat)
    segments = [[]]  # list of stop segments; new segment starts right after each LineString

    for p in placemarks:
        name_m = re.search(r"<name>(.*?)</name>", p, re.S)
        name = name_m.group(1).strip() if name_m else ""

        if "<LineString>" in p:
            coords_m = re.search(r"<coordinates>(.*?)</coordinates>", p, re.S)
            coords = []
            if coords_m:
                for tok in coords_m.group(1).split():
                    parts = tok.split(",")
                    if len(parts) >= 2:
                        coords.append([float(parts[0]), float(parts[1])])
            lines.append(coords)
            segments.append([])
            continue

        if "<Point>" in p:
            coords_m = re.search(r"<coordinates>(.*?)</coordinates>", p, re.S)
            if not coords_m:
                continue
            parts = coords_m.group(1).strip().split(",")
            lng, lat = float(parts[0]), float(parts[1])
            stop_name = re.sub(r"^Остановка\s*", "", name).strip()
            stop_name = stop_name.replace("<![CDATA[", "").replace("]]>", "").strip()
            stop_name = re.sub(r"^Станция\s+метро\s+", 'Станція метро "', stop_name)
            if stop_name.startswith('Станція метро "') and not stop_name.endswith('"'):
                stop_name += '"'
            segments[-1].append({"name": stop_name, "lat": lat, "lng": lng})

    stop_groups = [seg for seg in segments if seg]
    return doc_name, lines, stop_groups


def extract_headsigns(doc_name):
    m = re.search(r"\(([^)]+)\)", doc_name)
    if not m:
        return None, None
    parts = [p.strip() for p in re.split(r"\s*-\s*", m.group(1)) if p.strip()]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return None, None


def main():
    stops = json.load(open(os.path.join(DATA_DIR, "stopsReal.json"), encoding="utf-8"))
    routes = json.load(open(os.path.join(DATA_DIR, "routesReal.json"), encoding="utf-8"))
    geometries = json.load(open(os.path.join(DATA_DIR, "routeGeometries.json"), encoding="utf-8"))
    schedules = json.load(open(BUS_SCHEDULE_PATH, encoding="utf-8"))

    next_stop_num = max(int(s["id"].split("-")[1]) for s in stops) + 1
    stops_by_id = {s["id"]: s for s in stops}

    MATCH_RADIUS_M = 45

    def find_or_create_stop(name, lat, lng, route_id, kind):
        nonlocal next_stop_num
        best = None
        best_d = None
        for s in stops:
            d = dist_m(lat, lng, s["position"]["lat"], s["position"]["lng"])
            if d <= MATCH_RADIUS_M and (best_d is None or d < best_d):
                best, best_d = s, d

        if best is not None:
            if kind not in best["kinds"]:
                best["kinds"].append(kind)
            if route_id not in best["routeIds"]:
                best["routeIds"].append(route_id)
            return best["id"]

        new_id = f"stop-{next_stop_num}"
        next_stop_num += 1
        new_stop = {
            "id": new_id,
            "name": name,
            "kinds": [kind],
            "position": {"lat": lat, "lng": lng},
            "routeIds": [route_id],
        }
        stops.append(new_stop)
        stops_by_id[new_id] = new_stop
        return new_id

    def dedupe_consecutive(ids):
        out = []
        for sid in ids:
            if not out or out[-1] != sid:
                out.append(sid)
        return out

    new_routes = []
    kml_files = sorted(
        glob.glob(os.path.join(ASSETS_BUS_DIR, "bus_*.kml")),
        key=lambda p: re.search(r"bus_(.+)\.kml", p).group(1),
    )

    for path in kml_files:
        number = re.search(r"bus_(.+)\.kml", path).group(1)
        doc_name, lines, stop_groups = parse_kml(path)
        if len(lines) < 2 or len(stop_groups) < 2:
            print(f"SKIP bus {number}: unexpected KML shape ({len(lines)} lines, {len(stop_groups)} groups)")
            continue

        route_id = f"bus-{number}"

        forward_stops, backward_stops = stop_groups[0], stop_groups[1]
        forward_ids = dedupe_consecutive(
            [find_or_create_stop(s["name"], s["lat"], s["lng"], route_id, "bus") for s in forward_stops]
        )
        backward_ids = dedupe_consecutive(
            [find_or_create_stop(s["name"], s["lat"], s["lng"], route_id, "bus") for s in backward_stops]
        )

        headsign_forward, headsign_backward = extract_headsigns(doc_name)
        if not headsign_forward:
            headsign_forward = forward_stops[-1]["name"] if forward_stops else ""
        if not headsign_backward:
            headsign_backward = backward_stops[-1]["name"] if backward_stops else ""

        # Розклад (якщо є в спільному файлі all_routes_avtobus.json) — перший/
        # останній рейс і орієнтовний інтервал з реальних часів відправлення.
        first_dep, last_dep, interval = "06:00", "22:00", 20
        sched_rows = schedules.get(number)
        if sched_rows:
            all_times = []
            for row in sched_rows:
                cols = row.get("columns") or []
                for col in cols[1:3]:
                    if isinstance(col, str):
                        all_times += [t.rstrip("*") for t in col.split() if re.match(r"^\d{1,2}:\d{2}\*?$", t)]
            minutes = sorted(int(t.split(":")[0]) * 60 + int(t.split(":")[1]) for t in all_times)
            if minutes:
                first_dep = f"{minutes[0] // 60:02d}:{minutes[0] % 60:02d}"
                last_dep = f"{minutes[-1] // 60:02d}:{minutes[-1] % 60:02d}"
                diffs = [b - a for a, b in zip(minutes, minutes[1:]) if 0 < b - a <= 90]
                if diffs:
                    interval = max(3, round(sum(diffs) / len(diffs)))

        new_routes.append(
            {
                "id": route_id,
                "kind": "bus",
                "number": number,
                "name": doc_name or f"Автобусний маршрут №{number} Харків",
                "color": BUS_COLOR,
                "headsignForward": headsign_forward,
                "headsignBackward": headsign_backward,
                "firstDeparture": first_dep,
                "lastDeparture": last_dep,
                "intervalMinutes": interval,
                "stopIdsForward": forward_ids,
                "stopIdsBackward": backward_ids,
            }
        )

        geometries[route_id] = [lines[0], lines[1]]

    routes.extend(new_routes)

    json.dump(routes, open(os.path.join(DATA_DIR, "routesReal.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(stops, open(os.path.join(DATA_DIR, "stopsReal.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    json.dump(geometries, open(os.path.join(DATA_DIR, "routeGeometries.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    print(f"Додано {len(new_routes)} автобусних маршрутів, всього зупинок: {len(stops)}")


if __name__ == "__main__":
    main()
