import glob
import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

# === НАСТРОЙКИ ДЛЯ ТРОЛЛЕЙБУСОВ ===
INPUT_DIR = "kml_trolleybus"  # Папка, куда ты положил файлы троллейбусов
OUTPUT_FILE = "all_trolleybus_routes_ua.kml"  # Итоговый объединенный файл
VEHICLE_TYPE = "Тролейбус"  # Префикс для папок в KML


def smart_translate(text: str) -> str:
    """Переводит названия остановок и описания с русского на украинский."""
    if not text or not text.strip():
        return text

    text = " ".join(text.split())

    replacements = {
        "Остановка": "Зупинка",
        "остановка": "зупинка",
        "Автобус": "Автобус",
        "Маршрутка": "Маршрутка",
        "Троллейбус": "Тролейбус",
        "Трамвай": "Трамвай",
        "ул.": "вул.",
        "улица": "вулиця",
        "пр.": "пр.",
        "проспект": "проспект",
        "пер.": "пров.",
        "переулок": "пров.",
        "пл.": "пл.",
        "площадь": "площа",
        "ст. метро": "ст. метро",
        "станция метро": "станція метро",
        "шоссе": "шосе",
        "тупик": "тупик",
        "спуск": "узвіз",
    }

    for ru_word, uk_word in replacements.items():
        text = re.sub(r"\b" + ru_word + r"\b", uk_word, text)

    try:
        encoded_text = urllib.parse.quote(text)
        url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=uk&dt=t&q={encoded_text}"

        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=3) as response:
            result = json.loads(response.read().decode("utf-8"))
            if result and result[0]:
                translated_sentence = "".join(
                    [item[0] for item in result[0] if item[0]]
                )
                if translated_sentence:
                    return translated_sentence
    except Exception:
        pass

    return text


def merge_and_translate_kml():
    kml_files = glob.glob(os.path.join(INPUT_DIR, "*.kml"))

    if not kml_files:
        print(f"❌ В папке '{INPUT_DIR}' не найдено KML-файлов!")
        return

    print(
        f"📂 Найдено файлов троллейбусов для обработки: {len(kml_files)}\n"
    )

    kml_ns = "http://www.opengis.net/kml/2.2"
    ET.register_namespace("", kml_ns)

    root = ET.Element(f"{{{kml_ns}}}kml")
    document = ET.SubElement(root, f"{{{kml_ns}}}Document")

    doc_name = ET.SubElement(document, f"{{{kml_ns}}}name")
    doc_name.text = "Харків — Усі тролейбусні маршрути (Перекладено)"

    total_routes_added = 0
    ns = {"kml": kml_ns}

    for file_path in kml_files:
        file_name = os.path.basename(file_path)

        # Вытаскиваем номер маршрута из названия файла (например, "Троллейбусный маршрут №11...")
        match = re.search(r"№\s*(\d+[А-Яа-я]*)", file_name)
        route_num = match.group(1) if match else "???"
        folder_title = f"{VEHICLE_TYPE} №{route_num}"

        print(f"🔄 Обработка маршрута: {folder_title}...")

        try:
            tree = ET.parse(file_path)
            file_root = tree.getroot()

            folder = ET.SubElement(document, f"{{{kml_ns}}}Folder")
            f_name = ET.SubElement(folder, f"{{{kml_ns}}}name")
            f_name.text = folder_title

            placemarks = file_root.findall(".//kml:Placemark", ns)
            if not placemarks:
                placemarks = file_root.findall(".//Placemark")

            for pm in placemarks:
                name_elem = pm.find("kml:name", ns)
                if name_elem is None:
                    name_elem = pm.find("name")

                if name_elem is not None and name_elem.text:
                    name_elem.text = smart_translate(name_elem.text)

                desc_elem = pm.find("kml:description", ns)
                if desc_elem is None:
                    desc_elem = pm.find("description")

                if desc_elem is not None and desc_elem.text:
                    desc_elem.text = smart_translate(desc_elem.text)

                folder.append(pm)

            total_routes_added += 1

        except Exception as e:
            print(f" ⚠️ Ошибка в файле {file_name}: {e}")

    tree = ET.ElementTree(root)
    tree.write(OUTPUT_FILE, encoding="utf-8", xml_declaration=True)

    print("\n" + "=" * 50)
    print(f"🎉 Готово!")
    print(f"📊 Успешно обработано маршрутов: {total_routes_added}")
    print(f"📁 Итоговый файл: {os.path.abspath(OUTPUT_FILE)}")


if __name__ == "__main__":
    merge_and_translate_kml()