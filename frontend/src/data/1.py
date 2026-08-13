import os
import json

def convert_route(old_route: dict) -> dict:
    return {
        "id": old_route.get("id"),
        "kind": old_route.get("kind"),
        "number": old_route.get("number"),
        "name": old_route.get("name"),
        "color": old_route.get("color"),
        "headsignForward": old_route.get("headsignForward"),
        "headsignBackward": old_route.get("headsignBackward"),
        "firstDeparture": old_route.get("firstDeparture"),
        "lastDeparture": old_route.get("lastDeparture"),
        "intervalMinutes": old_route.get("intervalMinutes"),
        "stopIdsForward": old_route.get("stopIds", []),
        "stopIdsBackward": []
    }

def find_file(possible_names):
    """Ищет файл в текущей папке, игнорируя регистр"""
    files_in_dir = os.listdir('.')
    for name in possible_names:
        for f in files_in_dir:
            if f.lower() == name.lower():
                return f
    return None

def main():
    # Автоподбор файлов, если они названы чуть иначе
    source_filename = find_file(["routes.json", "route.json", "routes.ts", "routes.js"])
    target_filename = find_file(["routesReal.json", "routesreal.json", "routes_real.json"])

    if not source_filename:
        print("ОШИБКА: Исходный файл (routes.json) не найден в этой папке!")
        print("Файлы в текущей папке:", os.listdir('.'))
        return

    if not target_filename:
        print("ОШИБКА: Целевой файл (routesReal.json) не найден в этой папке!")
        print("Файлы в текущей папке:", os.listdir('.'))
        return

    print(f"Используем файлы: '{source_filename}' -> '{target_filename}'")

    # 1. Читаем исходный файл
    with open(source_filename, 'r', encoding='utf-8') as f:
        source_raw = json.load(f)

    # Если внутри объекта лежит ключ "routes", достаем его
    if isinstance(source_raw, dict):
        source_data = source_raw.get("routes", [source_raw])
    else:
        source_data = source_raw

    # 2. Читаем целевой файл
    with open(target_filename, 'r', encoding='utf-8') as f:
        target_raw = json.load(f)

    if isinstance(target_raw, dict):
        target_data = target_raw.get("routes", [target_raw])
    else:
        target_data = target_raw

    # 3. Конвертируем ВСЕ маршруты
    converted_routes = [convert_route(r) for r in source_data if isinstance(r, dict)]

    # 4. Объединяем
    target_data.extend(converted_routes)

    # 5. Сохраняем прямо в файл
    with open(target_filename, 'w', encoding='utf-8') as f:
        json.dump(target_data, f, ensure_ascii=False, indent=2)

    print(f"ГОТОВО! Успешно перенесено {len(converted_routes)} маршрутов в файл '{target_filename}'.")

if __name__ == "__main__":
    main()