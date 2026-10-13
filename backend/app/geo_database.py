import math
import re
from typing import Dict, List, Optional, Tuple
from app.models import GeoPoint

# Strategic target cities, districts and hubs in Ukraine
UKRAINE_GEO: Dict[str, GeoPoint] = {
    # Kyiv and Kyiv region
    "київ": GeoPoint(lat=50.4501, lon=30.5234, name="Київ"),
    "киев": GeoPoint(lat=50.4501, lon=30.5234, name="Київ"),
    "вишгород": GeoPoint(lat=50.5855, lon=30.4908, name="Вишгород"),
    "вышгород": GeoPoint(lat=50.5855, lon=30.4908, name="Вишгород"),
    "бровари": GeoPoint(lat=50.5114, lon=30.7903, name="Бровари"),
    "бровары": GeoPoint(lat=50.5114, lon=30.7903, name="Бровари"),
    "бориспіль": GeoPoint(lat=50.3541, lon=30.9554, name="Бориспіль"),
    "борисполь": GeoPoint(lat=50.3541, lon=30.9554, name="Бориспіль"),
    "васильків": GeoPoint(lat=50.1783, lon=30.3150, name="Васильків"),
    "васильков": GeoPoint(lat=50.1783, lon=30.3150, name="Васильків"),
    "біла церква": GeoPoint(lat=49.7989, lon=30.1153, name="Біла Церква"),
    "белая церковь": GeoPoint(lat=49.7989, lon=30.1153, name="Біла Церква"),
    "обухів": GeoPoint(lat=50.1192, lon=30.6272, name="Обухів"),
    "фастів": GeoPoint(lat=50.0789, lon=29.9172, name="Фастів"),
    "ірпінь": GeoPoint(lat=50.5215, lon=30.2458, name="Ірпінь"),

    # Chernihiv region
    "чернігів": GeoPoint(lat=51.4982, lon=31.2893, name="Чернігів"),
    "чернигов": GeoPoint(lat=51.4982, lon=31.2893, name="Чернігів"),
    "ніжин": GeoPoint(lat=51.0487, lon=31.8845, name="Ніжин"),
    "нежин": GeoPoint(lat=51.0487, lon=31.8845, name="Ніжин"),
    "прилуки": GeoPoint(lat=50.5925, lon=32.3892, name="Прилуки"),

    # Sumy region
    "суми": GeoPoint(lat=50.9077, lon=34.7981, name="Суми"),
    "суммы": GeoPoint(lat=50.9077, lon=34.7981, name="Суми"),
    "глухів": GeoPoint(lat=51.6778, lon=33.3856, name="Глухів"),
    "глухов": GeoPoint(lat=51.6778, lon=33.3856, name="Глухів"),
    "конотоп": GeoPoint(lat=51.2405, lon=33.2036, name="Конотоп"),
    "шостка": GeoPoint(lat=51.8628, lon=33.4867, name="Шостка"),
    "ромни": GeoPoint(lat=50.7483, lon=33.4736, name="Ромни"),
    "охтирка": GeoPoint(lat=50.3114, lon=34.8986, name="Охтирка"),

    # Kharkiv region
    "харків": GeoPoint(lat=49.9935, lon=36.2304, name="Харків"),
    "харьков": GeoPoint(lat=49.9935, lon=36.2304, name="Харків"),
    "чугуїв": GeoPoint(lat=49.8356, lon=36.6853, name="Чугуїв"),
    "ізюм": GeoPoint(lat=49.2089, lon=37.2764, name="Ізюм"),
    "куп'янськ": GeoPoint(lat=49.7072, lon=37.6167, name="Куп'янськ"),

    # Poltava region
    "полтава": GeoPoint(lat=49.5883, lon=34.5514, name="Полтава"),
    "кременчук": GeoPoint(lat=49.0700, lon=33.4200, name="Кременчук"),
    "кременчуг": GeoPoint(lat=49.0700, lon=33.4200, name="Кременчук"),
    "миргород": GeoPoint(lat=49.9675, lon=33.6067, name="Миргород"),
    "лубни": GeoPoint(lat=50.0150, lon=33.0078, name="Лубни"),

    # Dnipro & Zaporizhzhia
    "дніпро": GeoPoint(lat=48.4647, lon=35.0462, name="Дніпро"),
    "днепр": GeoPoint(lat=48.4647, lon=35.0462, name="Дніпро"),
    "кривий ріг": GeoPoint(lat=47.9105, lon=33.3918, name="Кривий Ріг"),
    "кривой рог": GeoPoint(lat=47.9105, lon=33.3918, name="Кривий Ріг"),
    "кам'янське": GeoPoint(lat=48.5133, lon=34.6133, name="Кам'янське"),
    "павлоград": GeoPoint(lat=48.5300, lon=35.8700, name="Павлоград"),
    "запоріжжя": GeoPoint(lat=47.8388, lon=35.1396, name="Запоріжжя"),
    "запорожье": GeoPoint(lat=47.8388, lon=35.1396, name="Запоріжжя"),

    # South Ukraine
    "одеса": GeoPoint(lat=46.4825, lon=30.7233, name="Одеса"),
    "одесса": GeoPoint(lat=46.4825, lon=30.7233, name="Одеса"),
    "чорноморськ": GeoPoint(lat=46.3014, lon=30.6558, name="Чорноморськ"),
    "южне": GeoPoint(lat=46.6231, lon=31.1006, name="Южне"),
    "ізмаїл": GeoPoint(lat=45.3528, lon=28.8319, name="Ізмаїл"),
    "миколаїв": GeoPoint(lat=46.9750, lon=31.9946, name="Миколаїв"),
    "николаев": GeoPoint(lat=46.9750, lon=31.9946, name="Миколаїв"),
    "очаків": GeoPoint(lat=46.6186, lon=31.5478, name="Очаків"),
    "херсон": GeoPoint(lat=46.6354, lon=32.6169, name="Херсон"),

    # Central & Western Ukraine
    "черкаси": GeoPoint(lat=49.4444, lon=32.0598, name="Черкаси"),
    "черкассы": GeoPoint(lat=49.4444, lon=32.0598, name="Черкаси"),
    "умань": GeoPoint(lat=48.7484, lon=30.2218, name="Умань"),
    "кропивницький": GeoPoint(lat=48.5079, lon=32.2623, name="Кропивницький"),
    "вінниця": GeoPoint(lat=49.2331, lon=28.4682, name="Вінниця"),
    "винница": GeoPoint(lat=49.2331, lon=28.4682, name="Вінниця"),
    "житомир": GeoPoint(lat=50.2547, lon=28.6587, name="Житомир"),
    "хмельницький": GeoPoint(lat=49.4230, lon=26.9871, name="Хмельницький"),
    "старокостянтинів": GeoPoint(lat=49.7562, lon=27.2195, name="Старокостянтинів"),
    "рівне": GeoPoint(lat=50.6199, lon=26.2516, name="Рівне"),
    "луцьк": GeoPoint(lat=50.7472, lon=25.3254, name="Луцьк"),
    "львів": GeoPoint(lat=49.8397, lon=24.0297, name="Львів"),
    "тернопіль": GeoPoint(lat=49.5535, lon=25.5948, name="Тернопіль"),
    "івано-франківськ": GeoPoint(lat=48.9226, lon=24.7111, name="Івано-Франківськ"),
    "чернівці": GeoPoint(lat=48.2917, lon=25.9354, name="Чернівці"),
    "ужгород": GeoPoint(lat=48.6208, lon=22.2879, name="Ужгород"),
    # Declension aliases: monitor texts use oblique cases
    # ("на Одесу", "у районі Сум", "києва", "Кривого Рогу").
    "києва": GeoPoint(lat=50.4501, lon=30.5234, name="Київ"),
    "києві": GeoPoint(lat=50.4501, lon=30.5234, name="Київ"),
    "києвом": GeoPoint(lat=50.4501, lon=30.5234, name="Київ"),
    "одеси": GeoPoint(lat=46.4825, lon=30.7233, name="Одеса"),
    "одесу": GeoPoint(lat=46.4825, lon=30.7233, name="Одеса"),
    "одесою": GeoPoint(lat=46.4825, lon=30.7233, name="Одеса"),
    "сумщин": GeoPoint(lat=50.9077, lon=34.7981, name="Суми"),
    "сумськ": GeoPoint(lat=50.9077, lon=34.7981, name="Суми"),
    "сумах": GeoPoint(lat=50.9077, lon=34.7981, name="Суми"),
    "кривого рогу": GeoPoint(lat=47.9105, lon=33.3918, name="Кривий Ріг"),
    "рогу": GeoPoint(lat=47.9105, lon=33.3918, name="Кривий Ріг"),
    "харкова": GeoPoint(lat=49.9935, lon=36.2304, name="Харків"),
    "харкові": GeoPoint(lat=49.9935, lon=36.2304, name="Харків"),
    "харковом": GeoPoint(lat=49.9935, lon=36.2304, name="Харків"),
    "львова": GeoPoint(lat=49.8397, lon=24.0297, name="Львів"),
    "львові": GeoPoint(lat=49.8397, lon=24.0297, name="Львів"),
}

# Known launch / spotted origin regions
LAUNCH_ORIGINS: Dict[str, GeoPoint] = {
    # North / Ballistic launchers (Iskander-M, S-400)
    "брянськ": GeoPoint(lat=52.7539, lon=32.2345, name="Брянська обл (Клинці)"),
    "брянск": GeoPoint(lat=52.7539, lon=32.2345, name="Брянська обл (Клинці)"),
    "брянської": GeoPoint(lat=52.7539, lon=32.2345, name="Брянська обл (Клинці)"),
    "смоленськ": GeoPoint(lat=54.7826, lon=32.0453, name="Смоленська обл"),
    "смоленск": GeoPoint(lat=54.7826, lon=32.0453, name="Смоленська обл"),
    "курськ": GeoPoint(lat=51.7303, lon=36.1926, name="Курська обл"),
    "курск": GeoPoint(lat=51.7303, lon=36.1926, name="Курська обл"),
    "курьск": GeoPoint(lat=51.7303, lon=36.1926, name="Курська обл"),
    "бєлгород": GeoPoint(lat=50.5954, lon=36.5873, name="Бєлгородська обл"),
    "белгород": GeoPoint(lat=50.5954, lon=36.5873, name="Бєлгородська обл"),
    "воронеж": GeoPoint(lat=51.6720, lon=39.1843, name="Воронезька обл"),
    
    # South / Crimea / Shahed launch bases
    "крим": GeoPoint(lat=45.0069, lon=35.8394, name="Крим (Чауда)"),
    "крым": GeoPoint(lat=45.0069, lon=35.8394, name="Крим (Чауда)"),
    "чауда": GeoPoint(lat=45.0069, lon=35.8394, name="Крим (м. Чауда)"),
    "ейськ": GeoPoint(lat=46.7128, lon=38.2741, name="Єйськ"),
    "ейск": GeoPoint(lat=46.7128, lon=38.2741, name="Єйськ"),
    "приморсько-ахтарськ": GeoPoint(lat=46.0464, lon=38.1747, name="Приморсько-Ахтарськ"),
    "приморско-ахтарск": GeoPoint(lat=46.0464, lon=38.1747, name="Приморсько-Ахтарськ"),
    "таганрог": GeoPoint(lat=47.2362, lon=38.8969, name="Таганрог / Ростов"),
    
    # Strategic aviation airfields & maritime launch zones
    "саваслейка": GeoPoint(lat=55.4550, lon=42.3160, name="АБ Саваслейка (МіГ-31К)"),
    "оленья": GeoPoint(lat=68.1528, lon=33.4650, name="АБ Оленья (Ту-95МС)"),
    "енгельс": GeoPoint(lat=51.4828, lon=46.2117, name="АБ Енгельс"),
    "чорне море": GeoPoint(lat=44.1500, lon=34.5000, name="Чорне море (Калібри)"),
    "каспій": GeoPoint(lat=44.5000, lon=50.0000, name="Каспійське море (Х-101)"),
    "південь": GeoPoint(lat=45.2000, lon=35.5000, name="Південний напрямок"),
    "північ": GeoPoint(lat=52.5000, lon=33.0000, name="Північний напрямок"),
    "схід": GeoPoint(lat=48.5000, lon=38.5000, name="Східний напрямок"),
    # Declension aliases for direction words ("з півдня", "зі сходу").
    # Stem matcher covers most, these close the і/о-alternation gaps.
    "півдня": GeoPoint(lat=45.2000, lon=35.5000, name="Південний напрямок"),
    "південний": GeoPoint(lat=45.2000, lon=35.5000, name="Південний напрямок"),
    "південному": GeoPoint(lat=45.2000, lon=35.5000, name="Південний напрямок"),
    "півночі": GeoPoint(lat=52.5000, lon=33.0000, name="Північний напрямок"),
    "північний": GeoPoint(lat=52.5000, lon=33.0000, name="Північний напрямок"),
    "північному": GeoPoint(lat=52.5000, lon=33.0000, name="Північний напрямок"),
    "сходу": GeoPoint(lat=48.5000, lon=38.5000, name="Східний напрямок"),
    "східний": GeoPoint(lat=48.5000, lon=38.5000, name="Східний напрямок"),
    "східному": GeoPoint(lat=48.5000, lon=38.5000, name="Східний напрямок"),
    "сході": GeoPoint(lat=48.5000, lon=38.5000, name="Східний напрямок"),
    # Oblique cases of maritime launch zones ("з Чорного моря").
    "чорного моря": GeoPoint(lat=44.1500, lon=34.5000, name="Чорне море (Калібри)"),
    "чорним морем": GeoPoint(lat=44.1500, lon=34.5000, name="Чорне море (Калібри)"),
    "чорному морі": GeoPoint(lat=44.1500, lon=34.5000, name="Чорне море (Калібри)"),
}


def haversine_distance_km(p1: GeoPoint, p2: GeoPoint) -> float:
    """Calculates spherical distance in km between two GeoPoints."""
    r = 6371.0  # Earth's radius in km
    dlat = math.radians(p2.lat - p1.lat)
    dlon = math.radians(p2.lon - p1.lon)
    lat1 = math.radians(p1.lat)
    lat2 = math.radians(p2.lat)

    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def calculate_bearing(p1: GeoPoint, p2: GeoPoint) -> float:
    """Calculates initial bearing (0..360) from p1 to p2."""
    lat1 = math.radians(p1.lat)
    lat2 = math.radians(p2.lat)
    diff_lon = math.radians(p2.lon - p1.lon)

    x = math.sin(diff_lon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - (math.sin(lat1) * math.cos(lat2) * math.cos(diff_lon))
    initial_bearing = math.atan2(x, y)
    degrees = (math.degrees(initial_bearing) + 360) % 360
    return round(degrees, 1)


def generate_curved_ballistic_arc(origin: GeoPoint, dest: GeoPoint, num_points: int = 50) -> List[List[float]]:
    """
    Generates a curved ballistic trajectory path (lat, lon coordinates).
    In suborbital ballistic flight and military radar visual projections,
    the trajectory arches through the upper atmosphere towards apogee,
    forming a distinct curved sweep (as shown in the reference image).
    NOTE: this is the ground-track curvature (2D shape as before).
    Vertical lift is added on the frontend via altitude profile.
    """
    coords: List[List[float]] = []

    # Vector from origin to destination
    d_lat = dest.lat - origin.lat
    d_lon = dest.lon - origin.lon

    # Perpendicular normal vector for the arc convexity
    # (Arches outward perpendicular to the flight path)
    norm_lat = -d_lon
    norm_lon = d_lat
    norm_len = math.sqrt(norm_lat**2 + norm_lon**2)

    if norm_len > 0:
        norm_lat /= norm_len
        norm_lon /= norm_len
    else:
        norm_lat, norm_lon = 0, 0

    # Arc curvature strength: depends on distance and direction
    dist_km = haversine_distance_km(origin, dest)
    # Calculate offset control point for quadratic / cubic curve
    # Higher curvature for tactical ballistics looking like the user reference
    arc_amplitude = min(max(dist_km * 0.0035, 0.4), 1.8)

    # Determine arch direction (curve upwards/northwards towards apogee like in screenshot)
    if norm_lat < 0:
        norm_lat = -norm_lat
        norm_lon = -norm_lon

    # Control point for quadratic Bezier
    mid_lat = (origin.lat + dest.lat) / 2 + norm_lat * arc_amplitude
    mid_lon = (origin.lon + dest.lon) / 2 + norm_lon * arc_amplitude

    # Quadratic Bezier formula: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
    for i in range(num_points + 1):
        t = i / float(num_points)
        b_lat = ((1 - t) ** 2) * origin.lat + 2 * (1 - t) * t * mid_lat + (t ** 2) * dest.lat
        b_lon = ((1 - t) ** 2) * origin.lon + 2 * (1 - t) * t * mid_lon + (t ** 2) * dest.lon
        coords.append([round(b_lat, 5), round(b_lon, 5)])

    return coords


def generate_linear_waypoints(
    origin: GeoPoint,
    dest: GeoPoint,
    num_points: int = 25,
    weave_deg: float = 0.0,
    weave_cycles: float = 2.0,
) -> List[List[float]]:
    """Generates direct waypoint route for cruise missiles or drones.

    weave_deg > 0 adds a sinusoidal lateral S-weave (degrees, perpendicular
    to the flight path) so low-altitude threats don't fly laser-straight:
    Shaheds wander between landmarks, cruise missiles dog-leg. One full
    lateral swing spans roughly weave_deg*111 km peak-to-peak.

    The weave scales to the leg length: a fixed cycle count draws wild
    loops on short final legs, so short legs get fewer, smaller swings.
    """
    # Perpendicular unit normal to the flight direction
    d_lat = dest.lat - origin.lat
    d_lon = dest.lon - origin.lon
    norm_len = math.sqrt(d_lat**2 + d_lon**2)
    if norm_len > 0:
        n_lat, n_lon = -d_lon / norm_len, d_lat / norm_len
    else:
        n_lat, n_lon = 0.0, 0.0

    leg_km = haversine_distance_km(origin, dest)
    eff_cycles = min(weave_cycles, max(0.6, leg_km / 150.0))
    eff_weave = min(weave_deg, norm_len * 0.06)

    coords: List[List[float]] = []
    for i in range(num_points + 1):
        t = i / float(num_points)
        lat = origin.lat + (dest.lat - origin.lat) * t
        lon = origin.lon + (dest.lon - origin.lon) * t
        if eff_weave > 0:
            w = eff_weave * math.sin(2.0 * math.pi * eff_cycles * t)
            lat += n_lat * w
            lon += n_lon * w
        coords.append([round(lat, 5), round(lon, 5)])
    return coords


_WORD_RE = re.compile(r"[а-яіїєґa-z']+", re.IGNORECASE)


def _norm_token(word: str) -> str:
    """Lowercase + unify yo/ye variants across RU/UA mixed texts."""
    return word.lower().replace("ё", "е").replace("є", "е")


def _tokens(text: str) -> List[str]:
    return [_norm_token(w) for w in _WORD_RE.findall(text or "")]


_INFLECTION_TAIL = "аеєиіїоуюяыэёь"


def _stem(word: str) -> str:
    """Inflection-resistant stem: strip the variable ending only.

    Only trailing vowels/soft sign are cut ('одеса'->'одес',
    'умань'->'уман'), consonant-final words stay whole ('курск',
    'курськ', 'воронеж') — so plain words like 'курсом' or
    'ворожий' can never collide with them. 4-letter vowel-final
    words ('суми'->'сум') match whole tokens only (see
    _part_matches), which keeps 'Сум' but rejects 'сумно'.
    """
    w = _norm_token(word)
    while len(w) > 4 and w[-1] in _INFLECTION_TAIL:
        w = w[:-1]
    if len(w) == 4 and w[-1] in _INFLECTION_TAIL:
        w = w[:-1]
    return w


def _part_matches(key_word: str, tokens: List[str]) -> bool:
    """One entry word against text tokens.

    - stem >= 4 chars: prefix match ('одесу' startswith 'одес');
    - 3-char stems (from 4-letter words like 'суми'): whole-token
      equality only, so 'Сум' matches but 'сумно'/'сумка' don't;
    - shorter: exact substring handled by the fast path, skip here.
    """
    stem = _stem(key_word)
    if len(stem) >= 4:
        return any(len(t) >= 4 and t.startswith(stem) for t in tokens)
    if len(stem) == 3:
        return any(t == stem for t in tokens)
    return False


def _match_entry(name: str, tokens: List[str]) -> bool:
    """True when EVERY significant word of the entry matches a token.

    Multi-word entries ('чорне море') need all parts, so a lone
    'моря' never fires without 'чорн'.
    """
    parts = [p for p in re.split(r"[\s\-’']+", name.lower()) if len(p) >= 3]
    if not parts:
        return False
    return all(_part_matches(p, tokens) for p in parts)


def _find_in(text: str, table: Dict[str, GeoPoint]) -> Optional[GeoPoint]:
    # Fast path: exact mention (preserves previous behaviour).
    lower_text = (text or "").lower()
    for name, point in table.items():
        if name in lower_text:
            return point.model_copy(deep=True)
    # Fallback: stem match per word — covers UA/RU declensions
    # ('Одесу'->'одеса', 'Чорного моря'->'чорне море').
    tokens = _tokens(text)
    if not tokens:
        return None
    for name, point in table.items():
        if _match_entry(name, tokens):
            return point.model_copy(deep=True)
    return None


def find_geo_location(text: str) -> Optional[GeoPoint]:
    """Finds matching Ukrainian settlement or region from text.

    Matches oblique cases too ('на Одесу', 'у районі Сум'). Exact
    mentions win; stem fallback never splits multi-word names.
    """
    return _find_in(text, UKRAINE_GEO)


# Kyiv city districts — monitor channels report vectors at district precision
# ("Вектор Оболонь", "~Нивки"). Approximate centers.
KYIV_DISTRICTS: Dict[str, GeoPoint] = {
    "оболонь": GeoPoint(lat=50.5220, lon=30.4980, name="Оболонь (Київ)"),
    "нивки": GeoPoint(lat=50.4560, lon=30.3880, name="Нивки (Київ)"),
    "троєщина": GeoPoint(lat=50.5120, lon=30.6020, name="Троєщина (Київ)"),
    "троещина": GeoPoint(lat=50.5120, lon=30.6020, name="Троєщина (Київ)"),
    "позняки": GeoPoint(lat=50.4020, lon=30.6170, name="Позняки (Київ)"),
    "позняковы": GeoPoint(lat=50.4020, lon=30.6170, name="Позняки (Київ)"),
    "дарниця": GeoPoint(lat=50.4330, lon=30.6490, name="Дарниця (Київ)"),
    "дарница": GeoPoint(lat=50.4330, lon=30.6490, name="Дарниця (Київ)"),
    "голосіїв": GeoPoint(lat=50.3910, lon=30.5130, name="Голосіїв (Київ)"),
    "голосеево": GeoPoint(lat=50.3910, lon=30.5130, name="Голосіїв (Київ)"),
    "печерськ": GeoPoint(lat=50.4290, lon=30.5530, name="Печерськ (Київ)"),
    "печерск": GeoPoint(lat=50.4290, lon=30.5530, name="Печерськ (Київ)"),
    "шевченківський": GeoPoint(lat=50.4510, lon=30.5140, name="Шевченківський (Київ)"),
    "солом'янка": GeoPoint(lat=50.4330, lon=30.4780, name="Солом'янка (Київ)"),
    "соломянка": GeoPoint(lat=50.4330, lon=30.4780, name="Солом'янка (Київ)"),
    "святошин": GeoPoint(lat=50.4510, lon=30.3760, name="Святошин (Київ)"),
    "святошино": GeoPoint(lat=50.4510, lon=30.3760, name="Святошин (Київ)"),
    "поділ": GeoPoint(lat=50.4690, lon=30.5140, name="Поділ (Київ)"),
    "подол": GeoPoint(lat=50.4690, lon=30.5140, name="Поділ (Київ)"),
    "дніпровський": GeoPoint(lat=50.4420, lon=30.6030, name="Дніпровський (Київ)"),
    "деснянський": GeoPoint(lat=50.5200, lon=30.5750, name="Деснянський (Київ)"),
    "виноградар": GeoPoint(lat=50.5100, lon=30.4180, name="Виноградар (Київ)"),
    "борщагівка": GeoPoint(lat=50.4340, lon=30.3750, name="Борщагівка (Київ)"),
    "борщаговка": GeoPoint(lat=50.4340, lon=30.3750, name="Борщагівка (Київ)"),
    "сирець": GeoPoint(lat=50.4740, lon=30.4340, name="Сирець (Київ)"),
    "березняки": GeoPoint(lat=50.4230, lon=30.5820, name="Березняки (Київ)"),
    "осокорки": GeoPoint(lat=50.3960, lon=30.6050, name="Осокорки (Київ)"),
}


def find_district(text: str) -> Optional[GeoPoint]:
    """Finds matching Kyiv district from text (district-level vectors)."""
    return _find_in(text, KYIV_DISTRICTS)


def find_launch_origin(text: str) -> Optional[GeoPoint]:
    """Finds matching launch origin from text.

    Stem matching is deliberately conservative: 'крилата ракета'
    must NOT match 'крим', 'ворожий шахед' must NOT match
    'воронеж' (see _part_matches).
    """
    return _find_in(text, LAUNCH_ORIGINS)
