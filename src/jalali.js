// src/jalali.js

const breaks = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111,
  1181, 1210, 1635, 2060, 2097, 2192, 2262,
  2324, 2394, 2456, 3178
];

function div(a, b) {
  return Math.floor(a / b);
}

function mod(a, b) {
  return a - Math.floor(a / b) * b;
}

/* =========================
   JALALI CALENDAR
========================= */

function jalCal(jy, withoutLeap = false) {
  const bl = breaks.length;
  const gy = jy + 621;

  let leapJ = -14;
  let jp = breaks[0];

  let jm = 0;
  let jump = 0;
  let leap = 0;
  let leapG = 0;
  let march = 0;
  let n = 0;

  if (
    jy < jp ||
    jy >= breaks[bl - 1]
  ) {
    throw new Error(
      "Invalid Jalali year: " + jy
    );
  }

  for (
    let i = 1;
    i < bl;
    i++
  ) {
    jm = breaks[i];

    jump =
      jm - jp;

    if (
      jy < jm
    ) {
      break;
    }

    leapJ =
      leapJ +
      div(jump, 33) * 8 +
      div(
        mod(jump, 33),
        4
      );

    jp = jm;
  }

  n =
    jy - jp;

  leapJ =
    leapJ +
    div(n, 33) * 8 +
    div(
      mod(n, 33) + 3,
      4
    );

  if (
    mod(jump, 33) === 4 &&
    jump - n === 4
  ) {
    leapJ++;
  }

  leapG =
    div(gy, 4) -
    div(
      (div(gy, 100) + 1) * 3,
      4
    ) -
    150;

  march =
    20 +
    leapJ -
    leapG;

  if (
    withoutLeap
  ) {
    return {
      gy,
      march
    };
  }

  if (
    jump - n < 6
  ) {
    n =
      n -
      jump +
      div(
        jump + 4,
        33
      ) *
        33;
  }

  leap =
    mod(
      mod(n + 1, 33) - 1,
      4
    );

  if (
    leap === -1
  ) {
    leap = 4;
  }

  return {
    leap,
    gy,
    march
  };
}

/* =========================
   JALALI → GREGORIAN
========================= */

export function toGregorian(
  jy,
  jm,
  jd
) {
  jy = Number(jy);
  jm = Number(jm);
  jd = Number(jd);

  const r =
    jalCal(jy);

  const gy =
    r.gy;

  const march =
    r.march;

  let days;

  if (
    jm <= 6
  ) {
    days =
      (jm - 1) * 31 +
      (jd - 1);
  } else {
    days =
      (jm - 7) * 30 +
      186 +
      (jd - 1);
  }

  const date =
    new Date(
      gy,
      2,
      march
    );

  date.setDate(
    date.getDate() +
      days
  );

  return {
    gy:
      date.getFullYear(),

    gm:
      date.getMonth() + 1,

    gd:
      date.getDate()
  };
}

/* =========================
   GREGORIAN → JALALI
========================= */

export function toJalaali(
  gy,
  gm,
  gd
) {
  gy = Number(gy);
  gm = Number(gm);
  gd = Number(gd);

  const jy =
    gy - 621;

  const r =
    jalCal(
      jy,
      false
    );

  const march =
    r.march;

  const gDate =
    new Date(
      gy,
      gm - 1,
      gd
    );

  const marchDate =
    new Date(
      r.gy,
      2,
      march
    );

  let diff =
    Math.floor(
      (
        gDate.getTime() -
        marchDate.getTime()
      ) /
        86400000
    );

  let finalYear =
    jy;

  if (
    diff < 0
  ) {
    finalYear--;

    const previous =
      jalCal(
        finalYear,
        false
      );

    const previousMarchDate =
      new Date(
        previous.gy,
        2,
        previous.march
      );

    diff =
      Math.floor(
        (
          gDate.getTime() -
          previousMarchDate.getTime()
        ) /
          86400000
      );
  }

  let jm;
  let jd;

  if (
    diff <= 185
  ) {
    jm =
      Math.floor(
        diff / 31
      ) + 1;

    jd =
      (diff % 31) + 1;
  } else {
    diff -= 186;

    jm =
      Math.floor(
        diff / 30
      ) + 7;

    jd =
      (diff % 30) + 1;
  }

  return {
    jy:
      finalYear,

    jm,

    jd
  };
}

/* =========================
   TODAY
========================= */

export function todayJalali() {
  const now =
    new Date();

  return toJalaali(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );
}

export function todayGregorian() {
  const now =
    new Date();

  return {
    gy:
      now.getFullYear(),

    gm:
      now.getMonth() + 1,

    gd:
      now.getDate()
  };
}

/* =========================
   JALALI VALIDATION
========================= */

export function isValidJalaliDate(
  year,
  month,
  day
) {
  year = Number(year);
  month = Number(month);
  day = Number(day);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  const maxDay =
    jalaliMonthDays(
      year,
      month
    );

  return day <= maxDay;
}

/* =========================
   GREGORIAN VALIDATION
========================= */

export function isValidGregorianDate(
  year,
  month,
  day
) {
  year = Number(year);
  month = Number(month);
  day = Number(day);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  if (
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  const maxDay =
    gregorianMonthDays(
      year,
      month
    );

  return day <= maxDay;
}

/* =========================
   JALALI MONTH DAYS
========================= */

export function jalaliMonthDays(
  year,
  month
) {
  year = Number(year);
  month = Number(month);

  if (
    month >= 1 &&
    month <= 6
  ) {
    return 31;
  }

  if (
    month >= 7 &&
    month <= 11
  ) {
    return 30;
  }

  if (
    month === 12
  ) {
    return isLeapJalaliYear(
      year
    )
      ? 30
      : 29;
  }

  return 0;
}

/* =========================
   GREGORIAN MONTH DAYS
========================= */

export function gregorianMonthDays(
  year,
  month
) {
  year = Number(year);
  month = Number(month);

  if (
    month < 1 ||
    month > 12
  ) {
    return 0;
  }

  if (
    month === 2
  ) {
    return isLeapGregorianYear(
      year
    )
      ? 29
      : 28;
  }

  if (
    month === 4 ||
    month === 6 ||
    month === 9 ||
    month === 11
  ) {
    return 30;
  }

  return 31;
}

/* =========================
   LEAP YEARS
========================= */

export function isLeapJalaliYear(
  year
) {
  const r =
    jalCal(
      Number(year),
      false
    );

  return r.leap === 0;
}

export function isLeapGregorianYear(
  year
) {
  year = Number(year);

  return (
    year % 4 === 0 &&
    (
      year % 100 !== 0 ||
      year % 400 === 0
    )
  );
}

/* =========================
   JALALI → JS DATE
========================= */

export function jalaliDate(
  year,
  month,
  day
) {
  const g =
    toGregorian(
      year,
      month,
      day
    );

  return new Date(
    g.gy,
    g.gm - 1,
    g.gd,
    12,
    0,
    0,
    0
  );
}

/* =========================
   GREGORIAN → JS DATE
========================= */

export function gregorianDate(
  year,
  month,
  day
) {
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    12,
    0,
    0,
    0
  );
}

/* =========================
   GENERIC DATE → JS DATE
=========================

calendar:
"jalali"
"gregorian"
*/

export function calendarDate(
  calendar,
  year,
  month,
  day
) {
  if (
    calendar ===
    "gregorian"
  ) {
    return gregorianDate(
      year,
      month,
      day
    );
  }

  return jalaliDate(
    year,
    month,
    day
  );
}

/* =========================
   GENERIC VALIDATION
========================= */

export function isValidCalendarDate(
  calendar,
  year,
  month,
  day
) {
  if (
    calendar ===
    "gregorian"
  ) {
    return isValidGregorianDate(
      year,
      month,
      day
    );
  }

  return isValidJalaliDate(
    year,
    month,
    day
  );
}

/* =========================
   DATE OBJECT
========================= */

export function createCalendarDate(
  calendar,
  year,
  month,
  day
) {
  return {
    calendar:
      calendar ===
      "gregorian"
        ? "gregorian"
        : "jalali",

    year:
      Number(year),

    month:
      Number(month),

    day:
      Number(day)
  };
}

/* =========================
   CONVERT ANY DATE
   TO GREGORIAN
========================= */

export function calendarToGregorian(
  date
) {
  if (
    !date
  ) {
    return null;
  }

  if (
    date.calendar ===
    "gregorian"
  ) {
    return {
      gy:
        Number(date.year),

      gm:
        Number(date.month),

      gd:
        Number(date.day)
    };
  }

  return toGregorian(
    date.year,
    date.month,
    date.day
  );
}

/* =========================
   CONVERT ANY DATE
   TO JALALI
========================= */

export function calendarToJalali(
  date
) {
  if (
    !date
  ) {
    return null;
  }

  if (
    date.calendar ===
    "jalali"
  ) {
    return {
      jy:
        Number(date.year),

      jm:
        Number(date.month),

      jd:
        Number(date.day)
    };
  }

  return toJalaali(
    date.year,
    date.month,
    date.day
  );
}

/* =========================
   COMPARE ANY TWO DATES
========================= */

export function compareCalendarDates(
  a,
  b
) {
  const da =
    calendarDate(
      a.calendar,
      a.year,
      a.month,
      a.day
    ).getTime();

  const db =
    calendarDate(
      b.calendar,
      b.year,
      b.month,
      b.day
    ).getTime();

  if (
    da < db
  ) {
    return -1;
  }

  if (
    da > db
  ) {
    return 1;
  }

  return 0;
}

/* =========================
   DIFFERENCE IN DAYS
========================= */

export function differenceInDays(
  start,
  end
) {
  const startDate =
    calendarDate(
      start.calendar,
      start.year,
      start.month,
      start.day
    );

  const endDate =
    calendarDate(
      end.calendar,
      end.year,
      end.month,
      end.day
    );

  return Math.round(
    (
      endDate.getTime() -
      startDate.getTime()
    ) /
      86400000
  );
}

/* =========================
   DIFFERENCE ANY TWO DATES
=========================

خروجی تقریبی بر اساس تقویم
تاریخ شروع است.
*/

export function differenceCalendarDates(
  start,
  end
) {
  if (
    start.calendar ===
      "jalali" &&
    end.calendar ===
      "jalali"
  ) {
    return difference(
      start,
      end
    );
  }

  const totalDays =
    differenceInDays(
      start,
      end
    );

  if (
    totalDays < 0
  ) {
    return {
      years: 0,
      months: 0,
      days: 0
    };
  }

  if (
    totalDays === 0
  ) {
    return {
      years: 0,
      months: 0,
      days: 0
    };
  }

  /*
    برای محاسبه ترکیبی،
    ابتدا تاریخ پایان را به
    تقویم شروع تبدیل می‌کنیم.
  */

  const endInStartCalendar =
    start.calendar ===
    "jalali"
      ? calendarToJalali(
          end
        )
      : calendarToGregorian(
          end
        );

  const normalizedEnd = {
    calendar:
      start.calendar,

    year:
      start.calendar ===
      "jalali"
        ? endInStartCalendar.jy
        : endInStartCalendar.gy,

    month:
      start.calendar ===
      "jalali"
        ? endInStartCalendar.jm
        : endInStartCalendar.gm,

    day:
      start.calendar ===
      "jalali"
        ? endInStartCalendar.jd
        : endInStartCalendar.gd
  };

  let years =
    normalizedEnd.year -
    start.year;

  let months =
    normalizedEnd.month -
    start.month;

  let days =
    normalizedEnd.day -
    start.day;

  if (
    days < 0
  ) {
    months--;

    let previousMonth =
      normalizedEnd.month - 1;

    let previousYear =
      normalizedEnd.year;

    if (
      previousMonth === 0
    ) {
      previousMonth =
        12;

      previousYear--;
    }

    const monthDays =
      start.calendar ===
      "jalali"
        ? jalaliMonthDays(
            previousYear,
            previousMonth
          )
        : gregorianMonthDays(
            previousYear,
            previousMonth
          );

    days +=
      monthDays;
  }

  if (
    months < 0
  ) {
    years--;

    months += 12;
  }

  if (
    years < 0
  ) {
    return {
      years: 0,
      months: 0,
      days: 0
    };
  }

  return {
    years,
    months,
    days
  };
}

/* =========================
   OLD DIFFERENCE FUNCTION
========================= */

export function difference(
  start,
  end
) {
  let sy =
    Number(start.year);

  let sm =
    Number(start.month);

  let sd =
    Number(start.day);

  const ey =
    Number(end.year);

  const em =
    Number(end.month);

  const ed =
    Number(end.day);

  let months =
    (ey - sy) * 12 +
    (em - sm);

  let days =
    ed - sd;

  if (
    days < 0
  ) {
    months--;

    let previousMonth =
      em - 1;

    let previousYear =
      ey;

    if (
      previousMonth === 0
    ) {
      previousMonth = 12;
      previousYear--;
    }

    days +=
      jalaliMonthDays(
        previousYear,
        previousMonth
      );
  }

  if (
    months < 0
  ) {
    return {
      years: 0,
      months: 0,
      days: 0
    };
  }

  const years =
    Math.floor(
      months / 12
    );

  months =
    months % 12;

  return {
    years,
    months,
    days
  };
}

/* =========================
   OLD COMPARE FUNCTION
========================= */

export function compareDates(
  a,
  b
) {
  const da =
    jalaliDate(
      a.year,
      a.month,
      a.day
    ).getTime();

  const db =
    jalaliDate(
      b.year,
      b.month,
      b.day
    ).getTime();

  if (
    da < db
  ) {
    return -1;
  }

  if (
    da > db
  ) {
    return 1;
  }

  return 0;
}