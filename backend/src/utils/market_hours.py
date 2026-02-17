"""Market hours utilities — check if KR/US markets are currently open."""

from __future__ import annotations

from datetime import date, datetime, timezone, timedelta

# Timezone offsets
_KST = timezone(timedelta(hours=9))
_EST = timezone(timedelta(hours=-5))
_EDT = timezone(timedelta(hours=-4))


# ---------------------------------------------------------------------------
# US market holidays (NYSE/NASDAQ)
# Rule-based: computed algorithmically for any year.
# ---------------------------------------------------------------------------

def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """Return the n-th occurrence of a weekday in a given month.

    weekday: 0=Mon … 6=Sun.  n: 1-based (1=first, -1=last).
    """
    if n > 0:
        first = date(year, month, 1)
        diff = (weekday - first.weekday()) % 7
        return first + timedelta(days=diff + 7 * (n - 1))
    else:
        # last occurrence
        if month == 12:
            last = date(year + 1, 1, 1) - timedelta(days=1)
        else:
            last = date(year, month + 1, 1) - timedelta(days=1)
        diff = (last.weekday() - weekday) % 7
        return last - timedelta(days=diff + 7 * (-n - 1))


def _easter_date(year: int) -> date:
    """Compute Easter Sunday using the Anonymous Gregorian algorithm."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def _us_holidays(year: int) -> set[date]:
    """Return NYSE/NASDAQ market holidays for a given year."""
    holidays: set[date] = set()

    def _observed(d: date) -> date:
        """If holiday falls on weekend, return the observed weekday."""
        if d.weekday() == 5:   # Saturday → Friday
            return d - timedelta(days=1)
        if d.weekday() == 6:   # Sunday → Monday
            return d + timedelta(days=1)
        return d

    # New Year's Day
    holidays.add(_observed(date(year, 1, 1)))
    # MLK Day — 3rd Monday of January
    holidays.add(_nth_weekday(year, 1, 0, 3))
    # Presidents' Day — 3rd Monday of February
    holidays.add(_nth_weekday(year, 2, 0, 3))
    # Good Friday — Friday before Easter
    holidays.add(_easter_date(year) - timedelta(days=2))
    # Memorial Day — last Monday of May
    holidays.add(_nth_weekday(year, 5, 0, -1))
    # Juneteenth — June 19 (observed since 2022)
    if year >= 2022:
        holidays.add(_observed(date(year, 6, 19)))
    # Independence Day — July 4
    holidays.add(_observed(date(year, 7, 4)))
    # Labor Day — 1st Monday of September
    holidays.add(_nth_weekday(year, 9, 0, 1))
    # Thanksgiving — 4th Thursday of November
    holidays.add(_nth_weekday(year, 11, 3, 4))
    # Christmas — December 25
    holidays.add(_observed(date(year, 12, 25)))

    return holidays


# ---------------------------------------------------------------------------
# KR market holidays (KRX)
# Fixed holidays + lunar calendar dates (pre-computed lookup table).
# ---------------------------------------------------------------------------

# Lunar New Year (설날) and Chuseok (추석) dates shift each year.
# Pre-computed for 2024–2030 from KRX announcements / lunar calendar.
# Each entry: (month, day) for the main day; ±1 day neighbors are also holidays.
_LUNAR_NEW_YEAR: dict[int, tuple[int, int]] = {
    2024: (2, 10), 2025: (1, 29), 2026: (2, 17), 2027: (2, 7),
    2028: (1, 27), 2029: (2, 13), 2030: (2, 3),
}
_CHUSEOK: dict[int, tuple[int, int]] = {
    2024: (9, 17), 2025: (10, 6), 2026: (9, 25), 2027: (9, 15),
    2028: (10, 3), 2029: (9, 22), 2030: (9, 12),
}
# Buddha's Birthday (석가탄신일, 음력 4/8)
_BUDDHA_BIRTHDAY: dict[int, tuple[int, int]] = {
    2024: (5, 15), 2025: (5, 5), 2026: (5, 24), 2027: (5, 13),
    2028: (5, 2), 2029: (5, 20), 2030: (5, 9),
}


def _kr_holidays(year: int) -> set[date]:
    """Return KRX market holidays for a given year."""
    holidays: set[date] = set()

    def _sub_if_weekend(d: date) -> date:
        """KRX substitute holiday: if holiday falls on weekend, next Monday off."""
        if d.weekday() == 5:
            return d + timedelta(days=2)
        if d.weekday() == 6:
            return d + timedelta(days=1)
        return d

    # New Year's Day
    holidays.add(_sub_if_weekend(date(year, 1, 1)))
    # Independence Movement Day — March 1
    holidays.add(_sub_if_weekend(date(year, 3, 1)))
    # Children's Day — May 5
    holidays.add(_sub_if_weekend(date(year, 5, 5)))
    # Memorial Day — June 6
    holidays.add(date(year, 6, 6))
    # Liberation Day — August 15
    holidays.add(_sub_if_weekend(date(year, 8, 15)))
    # National Foundation Day — October 3
    holidays.add(_sub_if_weekend(date(year, 10, 3)))
    # Hangul Day — October 9
    holidays.add(_sub_if_weekend(date(year, 10, 9)))
    # Christmas
    holidays.add(_sub_if_weekend(date(year, 12, 25)))
    # Year-end closing day (KRX specific)
    holidays.add(date(year, 12, 31))

    # Lunar New Year: main day ± 1
    if year in _LUNAR_NEW_YEAR:
        m, d = _LUNAR_NEW_YEAR[year]
        base = date(year, m, d)
        for delta in (-1, 0, 1):
            day = base + timedelta(days=delta)
            holidays.add(day)
            holidays.add(_sub_if_weekend(day))

    # Chuseok: main day ± 1
    if year in _CHUSEOK:
        m, d = _CHUSEOK[year]
        base = date(year, m, d)
        for delta in (-1, 0, 1):
            day = base + timedelta(days=delta)
            holidays.add(day)
            holidays.add(_sub_if_weekend(day))

    # Buddha's Birthday
    if year in _BUDDHA_BIRTHDAY:
        m, d = _BUDDHA_BIRTHDAY[year]
        holidays.add(_sub_if_weekend(date(year, m, d)))

    return holidays


# Cache computed holidays per year
_holiday_cache: dict[tuple[str, int], set[date]] = {}


def _is_holiday(market_type: str, d: date) -> bool:
    """Check if a date is a market holiday."""
    key = (market_type, d.year)
    if key not in _holiday_cache:
        if market_type == "US":
            _holiday_cache[key] = _us_holidays(d.year)
        elif market_type == "KR":
            _holiday_cache[key] = _kr_holidays(d.year)
        else:
            return False
    return d in _holiday_cache[key]


# ---------------------------------------------------------------------------
# DST helpers
# ---------------------------------------------------------------------------

def _is_us_dst(dt: datetime) -> bool:
    """Check if a UTC datetime falls within US Eastern Daylight Time.

    DST: second Sunday of March 02:00 → first Sunday of November 02:00.
    """
    year = dt.year
    # weekday(): Mon=0 ... Sun=6  →  days until first Sunday = (6 - weekday) % 7
    first_sun_mar = 1 + (6 - date(year, 3, 1).weekday()) % 7
    second_sun_mar = first_sun_mar + 7
    dst_start = datetime(year, 3, second_sun_mar, 7, 0, tzinfo=timezone.utc)  # 2am EST = 7am UTC

    first_sun_nov = 1 + (6 - date(year, 11, 1).weekday()) % 7
    dst_end = datetime(year, 11, first_sun_nov, 6, 0, tzinfo=timezone.utc)  # 2am EDT = 6am UTC

    return dst_start <= dt < dst_end


def _us_eastern_tz() -> timezone:
    """Return current US Eastern timezone (EST or EDT)."""
    now_utc = datetime.now(timezone.utc)
    return _EDT if _is_us_dst(now_utc) else _EST


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def is_market_open(market_type: str) -> bool:
    """Check if a market is currently open.

    Args:
        market_type: "KR" or "US"

    Returns:
        True if the market is open right now.
    """
    now_utc = datetime.now(timezone.utc)

    if market_type == "KR":
        now_kst = now_utc.astimezone(_KST)
        if now_kst.weekday() >= 5:  # Saturday=5, Sunday=6
            return False
        if _is_holiday("KR", now_kst.date()):
            return False
        t = now_kst.hour * 100 + now_kst.minute
        return 900 <= t < 1530  # 09:00 ~ 15:30

    if market_type == "US":
        etz = _us_eastern_tz()
        now_et = now_utc.astimezone(etz)
        if now_et.weekday() >= 5:
            return False
        if _is_holiday("US", now_et.date()):
            return False
        t = now_et.hour * 100 + now_et.minute
        return 930 <= t < 1600  # 09:30 ~ 16:00

    return False


def get_market_status() -> dict:
    """Return open/closed status for KR and US markets."""
    now_utc = datetime.now(timezone.utc)
    now_kst = now_utc.astimezone(_KST)
    etz = _us_eastern_tz()
    now_et = now_utc.astimezone(etz)

    kr_holiday = _is_holiday("KR", now_kst.date())
    us_holiday = _is_holiday("US", now_et.date())

    return {
        "KR": {
            "is_open": is_market_open("KR"),
            "local_time": now_kst.strftime("%H:%M"),
            "timezone": "KST",
            "hours": "09:00-15:30",
            "holiday": kr_holiday,
        },
        "US": {
            "is_open": is_market_open("US"),
            "local_time": now_et.strftime("%H:%M"),
            "timezone": "EDT" if _is_us_dst(now_utc) else "EST",
            "hours": "09:30-16:00",
            "holiday": us_holiday,
        },
    }
