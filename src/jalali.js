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

/*
  محاسبه سال کبیسه و شروع سال جلالی
*/
function jalCal(jy, withoutLeap) {
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

  if (jy < jp || jy >= breaks[bl - 1]) {
    throw new Error("Invalid Jalali year: " + jy);
  }

  for (let i = 1; i < bl; i++) {
    jm = breaks[i];
    jump = jm - jp;

    if (jy < jm) {
      break;
    }

    leapJ =
      leapJ +
      div(jump, 33) * 8 +
      div(mod(jump, 33), 4);

    jp = jm;
  }

  n = jy - jp;

  leapJ =
    leapJ +
    div(n, 33) * 8 +
    div(mod(n, 33) + 3, 4);

  if (
    mod(jump, 33) === 4 &&
    jump - n === 4
  ) {
    leapJ++;
  }

  leapG =
    div(gy, 4) -
    div((div(gy, 100) + 1) * 3, 4) -
    150;

  march = 20 + leapJ - leapG;

  if (withoutLeap) {
    return {
      gy,
      march
    };
  }

  if (jump - n < 6) {
    n =
      n -
      jump +
      div(jump + 4, 33) * 33;
  }

  leap =
    mod(
      mod(n + 1, 33) - 1,
      4
    );

  if (leap === -1) {
    leap = 4;
  }

  return {
    leap,
    gy,
    march
  };
}

/*
  تبدیل جلالی به میلادی
*/
export function toGregorian(
  jy,
  jm,
  jd
) {
  jy = Number(jy);
  jm = Number(jm);
  jd = Number(jd);

  const r = jalCal(jy);

  const gy = r.gy;
  const march = r.march;

  let days;

  if (jm <= 6) {
    days =
      (jm - 1) * 31 +
      (jd - 1);
  } else {
    days =
      (jm - 7) * 30 +
      186 +
      (jd - 1);
  }

  const date = new Date(
    gy,
    2,
    march
  );

  date.setDate(
    date.getDate() + days
  );

  return {
    gy: date.getFullYear(),
    gm: date.getMonth() + 1,
    gd: date.getDate()
  };
}

/*
  تبدیل میلادی به جلالی
*/
export function toJalaali(
  gy,
  gm,
  gd
) {
  gy = Number(gy);
  gm = Number(gm);
  gd = Number(gd);

  const jy = gy - 621;

  const r = jalCal(
    jy,
    false
  );

  const march = r.march;

  const gDate = new Date(
    gy,
    gm - 1,
    gd
  );

  const marchDate = new Date(
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

  let finalYear = jy;

  if (diff < 0) {
    finalYear--;

    const previous = jalCal(
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

  if (diff <= 185) {
    jm = Math.floor(
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
    jy: finalYear,
    jm,
    jd
  };
}

/*
  تاریخ امروز به جلالی
*/
export function todayJalali() {
  const now = new Date();

  return toJalaali(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );
}

/*
  اعتبارسنجی تاریخ جلالی
*/
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

/*
  تعداد روزهای ماه جلالی
*/
export function jalaliMonthDays(
  year,
  month
) {
  year = Number(year);
  month = Number(month);

  if (month >= 1 && month <= 6) {
    return 31;
  }

  if (month >= 7 && month <= 11) {
    return 30;
  }

  // اسفند
  return isLeapJalaliYear(year)
    ? 30
    : 29;
}

/*
  بررسی کبیسه بودن سال
*/
export function isLeapJalaliYear(
  year
) {
  const r = jalCal(
    Number(year),
    false
  );

  return r.leap === 0;
}

/*
  تبدیل تاریخ جلالی به Date میلادی
  ساعت را روی ظهر قرار می‌دهیم تا مشکل
  تغییر ساعت تابستانی/زمستانی ایجاد نشود.
*/
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

/*
  اختلاف دقیق دو تاریخ جلالی
  خروجی:
  سال + ماه + روز
*/
export function difference(
  start,
  end
) {
  let sy = Number(start.year);
  let sm = Number(start.month);
  let sd = Number(start.day);

  const ey = Number(end.year);
  const em = Number(end.month);
  const ed = Number(end.day);

  let months =
    (ey - sy) * 12 +
    (em - sm);

  let days =
    ed - sd;

  if (days < 0) {
    months--;

    let previousMonth =
      em - 1;

    let previousYear =
      ey;

    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear--;
    }

    days +=
      jalaliMonthDays(
        previousYear,
        previousMonth
      );
  }

  if (months < 0) {
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

/*
  مقایسه دو تاریخ جلالی
  خروجی:
  -1 = تاریخ اول قبل از دوم
   0 = برابر
   1 = تاریخ اول بعد از دوم
*/
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

  if (da < db) return -1;
  if (da > db) return 1;

  return 0;
}