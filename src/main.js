import "./style.css";

import { supabase } from "./supabase.js";
import {
  getSession,
  signIn,
  signOut
} from "./auth.js";

import { Capacitor } from "@capacitor/core";
import {
  LocalNotifications
} from "@capacitor/local-notifications";

import {
  toGregorian,
  toJalaali,
  todayJalali,
  isValidJalaliDate,
  jalaliMonthDays,
  jalaliDate,
  compareDates,
  difference,
  isLeapJalaliYear
} from "./jalali.js";


/* =========================================================
   GLOBAL STATE
========================================================= */

let products = [];

let productionDate = null;
let expiryDate = null;

let productionCalendar = "jalali";
let expiryCalendar = "jalali";

let selectedImage = "";

let calendarType = null;
let calendarMode = "jalali";

let calendarYear = null;
let calendarMonth = null;

let editingProductId = null;

const STORAGE_KEY = "products";


/* =========================================================
   MONTH NAMES
========================================================= */

const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند"
];

const HIJRI_MONTHS = [
  "محرم",
  "صفر",
  "ربیع‌الاول",
  "ربیع‌الثانی",
  "جمادی‌الاول",
  "جمادی‌الثانی",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذوالقعده",
  "ذوالحجه"
];

const WEEK_DAYS = [
  "ش",
  "ی",
  "د",
  "س",
  "چ",
  "پ",
  "ج"
];


/* =========================================================
   AUTH STATE
========================================================= */

let currentSession = null;


/* =========================================================
   BASIC HELPERS
========================================================= */

function pad(number) {
  return String(number).padStart(2, "0");
}

function faNumbers(value) {
  return String(value)
    .replace(/0/g, "۰")
    .replace(/1/g, "۱")
    .replace(/2/g, "۲")
    .replace(/3/g, "۳")
    .replace(/4/g, "۴")
    .replace(/5/g, "۵")
    .replace(/6/g, "۶")
    .replace(/7/g, "۷")
    .replace(/8/g, "۸")
    .replace(/9/g, "۹");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function uid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2)
  );
}


/* =========================================================
   HIJRI / ISLAMIC CALENDAR
========================================================= */

/*
  Islamic civil calendar calculations.

  Internally the application still stores Jalali dates.
  When user selects Hijri, we convert:

  Hijri -> Gregorian -> Jalali

  This means the existing database structure can stay unchanged.
*/


function islamicLeapYear(year) {
  year = Number(year);

  return (
    ((11 * year + 14) % 30) < 11
  );
}


function hijriMonthDays(year, month) {
  year = Number(year);
  month = Number(month);

  if (
    month < 1 ||
    month > 12
  ) {
    return 0;
  }

  if (month === 12) {
    return islamicLeapYear(year)
      ? 30
      : 29;
  }

  return month % 2 === 1
    ? 30
    : 29;
}


function isValidHijriDate(
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
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  return day <=
    hijriMonthDays(
      year,
      month
    );
}


/*
  Julian Day conversion
*/

function gregorianToJD(
  year,
  month,
  day
) {
  year = Number(year);
  month = Number(month);
  day = Number(day);

  let a =
    Math.floor(
      (14 - month) / 12
    );

  let y =
    year + 4800 - a;

  let m =
    month + 12 * a - 3;

  return (
    day +
    Math.floor(
      (153 * m + 2) / 5
    ) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}


function jdToGregorian(jd) {
  jd = Math.floor(jd);

  let a = jd + 32044;

  let b =
    Math.floor(
      (4 * a + 3) / 146097
    );

  let c =
    a -
    Math.floor(
      (146097 * b) / 4
    );

  let d =
    Math.floor(
      (4 * c + 3) / 1461
    );

  let e =
    c -
    Math.floor(
      (1461 * d) / 4
    );

  let m =
    Math.floor(
      (5 * e + 2) / 153
    );

  let day =
    e -
    Math.floor(
      (153 * m + 2) / 5
    ) +
    1;

  let month =
    m +
    3 -
    12 *
      Math.floor(m / 10);

  let year =
    100 * b +
    d -
    4800 +
    Math.floor(m / 10);

  return {
    gy: year,
    gm: month,
    gd: day
  };
}


function hijriToJD(
  year,
  month,
  day
) {
  year = Number(year);
  month = Number(month);
  day = Number(day);

  return (
    day +
    Math.ceil(
      29.5 * (month - 1)
    ) +
    (year - 1) * 354 +
    Math.floor(
      (3 + 11 * year) / 30
    ) +
    1948439 -
    1
  );
}


function jdToHijri(jd) {
  jd = Math.floor(jd);

  let year =
    Math.floor(
      (30 * (jd - 1948439) + 10646) /
      10631
    );

  let month =
    Math.min(
      12,
      Math.ceil(
        (jd -
          (29 +
            hijriToJD(
              year,
              1,
              1
            ))) /
          29.5
      ) + 1
    );

  let day =
    jd -
    hijriToJD(
      year,
      month,
      1
    ) +
    1;

  return {
    hy: year,
    hm: month,
    hd: day
  };
}


function hijriToGregorian(
  year,
  month,
  day
) {
  return jdToGregorian(
    hijriToJD(
      year,
      month,
      day
    )
  );
}


function gregorianToHijri(
  year,
  month,
  day
) {
  return jdToHijri(
    gregorianToJD(
      year,
      month,
      day
    )
  );
}


/* =========================================================
   TODAY
========================================================= */

function getToday() {
  return todayJalali();
}


function getTodayHijri() {
  const now = new Date();

  return gregorianToHijri(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );
}


/* =========================================================
   DATE CONVERSIONS
========================================================= */

function jalaliToGregorianObject(date) {
  if (!date) {
    return null;
  }

  return toGregorian(
    date.year,
    date.month,
    date.day
  );
}


function jalaliToHijriObject(date) {
  const gregorian =
    jalaliToGregorianObject(date);

  if (!gregorian) {
    return null;
  }

  return gregorianToHijri(
    gregorian.gy,
    gregorian.gm,
    gregorian.gd
  );
}


function hijriToJalaliObject(date) {
  if (!date) {
    return null;
  }

  const gregorian =
    hijriToGregorian(
      date.year,
      date.month,
      date.day
    );

  return toJalaali(
    gregorian.gy,
    gregorian.gm,
    gregorian.gd
  );
}


function getDisplayDate(
  jalali,
  mode = "jalali"
) {
  if (!jalali) {
    return null;
  }

  if (mode === "hijri") {
    const h =
      jalaliToHijriObject(
        jalali
      );

    return {
      year: h.hy,
      month: h.hm,
      day: h.hd
    };
  }

  return {
    year: jalali.year,
    month: jalali.month,
    day: jalali.day
  };
}


/* =========================================================
   DATE FORMAT
========================================================= */

function formatDate(
  date,
  mode = "jalali"
) {
  if (!date) {
    return "انتخاب نشده";
  }

  const d =
    getDisplayDate(
      date,
      mode
    );

  if (!d) {
    return "انتخاب نشده";
  }

  return faNumbers(
    `${d.year}/${pad(d.month)}/${pad(d.day)}`
  );
}


function calendarName(mode) {
  return mode === "hijri"
    ? "هجری قمری"
    : "هجری شمسی";
}


/* =========================================================
   LOCAL STORAGE
========================================================= */

function loadLocalProducts() {
  try {
    const raw =
      localStorage.getItem(
        STORAGE_KEY
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.error(
      "Local products error:",
      error
    );

    return [];
  }
}


function saveLocalProducts() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(products)
    );
  } catch (error) {
    console.error(
      "Local save error:",
      error
    );
  }
}


/* =========================================================
   DATABASE MAPPING
========================================================= */

/*
  IMPORTANT:

  image is intentionally NOT sent to Supabase.

  Product images remain local on the phone.
*/

function toDbProduct(product) {
  return {
    id: product.id,

    user_id:
      product.user_id ||
      currentSession?.user?.id,

    name: product.name,

    type: product.type || "",

    quantity:
      Number(product.quantity) || 0,

    production_year:
      Number(product.productionDate?.year),

    production_month:
      Number(product.productionDate?.month),

    production_day:
      Number(product.productionDate?.day),

    expiry_year:
      Number(product.expiryDate?.year),

    expiry_month:
      Number(product.expiryDate?.month),

    expiry_day:
      Number(product.expiryDate?.day),

    created_at:
      product.createdAt ||
      new Date().toISOString()
  };
}


function fromDbProduct(row) {
  return {
    id: row.id,

    user_id:
      row.user_id ||
      currentSession?.user?.id,

    name:
      row.name || "",

    type:
      row.type || "",

    quantity:
      Number(row.quantity) || 0,

    productionDate: {
      year:
        Number(row.production_year),

      month:
        Number(row.production_month),

      day:
        Number(row.production_day)
    },

    expiryDate: {
      year:
        Number(row.expiry_year),

      month:
        Number(row.expiry_month),

      day:
        Number(row.expiry_day)
    },

    /*
      Images are restored from localStorage
      after cloud loading.
    */
    image: "",

    productionCalendar:
      "jalali",

    expiryCalendar:
      "jalali",

    createdAt:
      row.created_at ||
      new Date().toISOString()
  };
}


/* =========================================================
   LOAD PRODUCTS FROM CLOUD
========================================================= */

async function loadProductsFromCloud() {
  const localProducts =
    loadLocalProducts();

  products =
    localProducts;

  try {
    if (!currentSession?.user?.id) {
      renderApp();
      return;
    }

    const {
      data,
      error
    } = await supabase
      .from("products")
      .select("*")
      .eq(
        "user_id",
        currentSession.user.id
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {
      console.error(
        "Cloud load error:",
        error
      );

      renderApp();
      return;
    }

    const cloudProducts =
      Array.isArray(data)
        ? data.map(fromDbProduct)
        : [];

    /*
      Keep local images and calendar mode.
    */

    const localMap =
      new Map(
        localProducts.map(
          product => [
            String(product.id),
            product
          ]
        )
      );

    products =
      cloudProducts.map(
        cloudProduct => {
          const local =
            localMap.get(
              String(
                cloudProduct.id
              )
            );

          return {
            ...cloudProduct,

            image:
              local?.image ||
              "",

            productionCalendar:
              local?.productionCalendar ||
              "jalali",

            expiryCalendar:
              local?.expiryCalendar ||
              "jalali"
          };
        }
      );


    /*
      If cloud is empty but local products exist,
      migrate local products to Supabase.
    */

    if (
      cloudProducts.length === 0 &&
      localProducts.length > 0
    ) {
      for (
        const product
        of localProducts
      ) {
        try {
          const dbProduct =
            toDbProduct(
              product
            );

          const {
            error:
              insertError
          } = await supabase
            .from("products")
            .insert(
              dbProduct
            );

          if (insertError) {
            console.error(
              "Migration error:",
              insertError
            );
          }
        } catch (error) {
          console.error(
            "Migration exception:",
            error
          );
        }
      }

      /*
        DO NOT remove localStorage.
        Images must remain on device.
      */
      products =
        localProducts;
    }

    saveLocalProducts();

    renderApp();

  } catch (error) {
    console.error(
      "Load products exception:",
      error
    );

    products =
      localProducts;

    renderApp();
  }
}


/* =========================================================
   SAVE PRODUCT
========================================================= */

async function saveProduct() {
  const form =
    document.querySelector(
      "#productForm"
    );

  if (!form) {
    return;
  }

  const nameInput =
    document.querySelector(
      "#productName"
    );

  const typeInput =
    document.querySelector(
      "#productType"
    );

  const quantityInput =
    document.querySelector(
      "#productQuantity"
    );

  const name =
    nameInput?.value.trim() || "";

  const type =
    typeInput?.value.trim() || "";

  const quantity =
    Number(
      quantityInput?.value
    ) || 0;


  if (!name) {
    alert(
      "لطفاً نام محصول را وارد کنید."
    );

    return;
  }


  if (quantity < 0) {
    alert(
      "تعداد محصول معتبر نیست."
    );

    return;
  }


  if (!productionDate) {
    alert(
      "لطفاً تاریخ تولید را انتخاب کنید."
    );

    return;
  }


  if (!expiryDate) {
    alert(
      "لطفاً تاریخ انقضا را انتخاب کنید."
    );

    return;
  }


  if (
    !isValidJalaliDate(
      productionDate.year,
      productionDate.month,
      productionDate.day
    )
  ) {
    alert(
      "تاریخ تولید معتبر نیست."
    );

    return;
  }


  if (
    !isValidJalaliDate(
      expiryDate.year,
      expiryDate.month,
      expiryDate.day
    )
  ) {
    alert(
      "تاریخ انقضا معتبر نیست."
    );

    return;
  }


  if (
    compareDates(
      productionDate,
      expiryDate
    ) > 0
  ) {
    alert(
      "تاریخ تولید نمی‌تواند بعد از تاریخ انقضا باشد."
    );

    return;
  }


  const button =
    document.querySelector(
      "#saveProductButton"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "در حال ذخیره...";
  }


  const now =
    new Date().toISOString();


  let product;


  if (editingProductId) {
    const oldProduct =
      products.find(
        item =>
          String(item.id) ===
          String(editingProductId)
      );

    product = {
      ...oldProduct,

      name,

      type,

      quantity,

      productionDate: {
        ...productionDate
      },

      expiryDate: {
        ...expiryDate
      },

      productionCalendar,

      expiryCalendar,

      image:
        selectedImage ||
        oldProduct?.image ||
        "",

      createdAt:
        oldProduct?.createdAt ||
        now
    };

  } else {
    product = {
      id: uid(),

      user_id:
        currentSession?.user?.id,

      name,

      type,

      quantity,

      productionDate: {
        ...productionDate
      },

      expiryDate: {
        ...expiryDate
      },

      productionCalendar,

      expiryCalendar,

      /*
        Image stays local.
      */
      image:
        selectedImage || "",

      createdAt: now
    };
  }


  try {

    const dbProduct =
      toDbProduct(
        product
      );


    if (editingProductId) {

      const {
        error
      } = await supabase
        .from("products")
        .update(
          dbProduct
        )
        .eq(
          "id",
          editingProductId
        )
        .eq(
          "user_id",
          currentSession.user.id
        );

      if (error) {
        throw error;
      }


      products =
        products.map(
          item =>
            String(item.id) ===
            String(editingProductId)
              ? product
              : item
        );

    } else {

      const {
        error
      } = await supabase
        .from("products")
        .insert(
          dbProduct
        );

      if (error) {
        throw error;
      }

      products.unshift(
        product
      );
    }


    /*
      Save image locally.
    */
    saveLocalProducts();


    /*
      Notifications.
    */
    await scheduleProductNotifications(
      product
    );


    editingProductId =
      null;

    productionDate =
      null;

    expiryDate =
      null;

    productionCalendar =
      "jalali";

    expiryCalendar =
      "jalali";

    selectedImage =
      "";


    renderDetails(
      product.id
    );


  } catch (error) {

    console.error(
      "Save product error:",
      error
    );

    alert(
      "خطایی هنگام ذخیره محصول رخ داد.\n\n" +
      (
        error?.message ||
        "خطای نامشخص"
      )
    );

  } finally {

    if (button) {
      button.disabled = false;

      button.textContent =
        editingProductId
          ? "ذخیره تغییرات"
          : "ذخیره محصول";
    }
  }
}


/* =========================================================
   DELETE PRODUCT
========================================================= */

async function deleteProduct(
  productId
) {
  const product =
    products.find(
      item =>
        String(item.id) ===
        String(productId)
    );

  if (!product) {
    return;
  }


  const confirmed =
    confirm(
      `آیا از حذف «${product.name}» مطمئن هستید؟`
    );

  if (!confirmed) {
    return;
  }


  try {

    if (
      currentSession?.user?.id
    ) {
      const {
        error
      } = await supabase
        .from("products")
        .delete()
        .eq(
          "id",
          productId
        )
        .eq(
          "user_id",
          currentSession.user.id
        );

      if (error) {
        throw error;
      }
    }


    await cancelProductNotifications(
      productId
    );


    products =
      products.filter(
        item =>
          String(item.id) !==
          String(productId)
      );


    saveLocalProducts();

    renderProducts();

  } catch (error) {

    console.error(
      "Delete error:",
      error
    );

    alert(
      "حذف محصول انجام نشد."
    );
  }
}


/* =========================================================
   NOTIFICATIONS
========================================================= */

async function setupNotifications() {
  if (
    Capacitor.getPlatform() ===
    "web"
  ) {
    return;
  }

  try {

    const permission =
      await LocalNotifications
        .checkPermissions();

    if (
      permission.display !==
      "granted"
    ) {
      await LocalNotifications
        .requestPermissions();
    }

  } catch (error) {
    console.error(
      "Notification permission error:",
      error
    );
  }
}


function getNotificationDate(
  jalali,
  hour = 9,
  minute = 0
) {
  const gregorian =
    toGregorian(
      jalali.year,
      jalali.month,
      jalali.day
    );

  return new Date(
    gregorian.gy,
    gregorian.gm - 1,
    gregorian.gd,
    hour,
    minute,
    0,
    0
  );
}


function notificationId(
  productId,
  type
) {
  let hash = 0;

  const value =
    `${productId}-${type}`;

  for (
    let i = 0;
    i < value.length;
    i++
  ) {
    hash =
      (
        hash * 31 +
        value.charCodeAt(i)
      ) >>> 0;
  }

  return (
    100000 +
    (hash % 1900000000)
  );
}


async function cancelProductNotifications(
  productId
) {
  if (
    Capacitor.getPlatform() ===
    "web"
  ) {
    return;
  }

  try {

    const ids = [
      notificationId(
        productId,
        "3days"
      ),

      notificationId(
        productId,
        "1day"
      ),

      notificationId(
        productId,
        "expiry"
      )
    ];

    await LocalNotifications
      .cancel({
        notifications:
          ids.map(id => ({
            id
          }))
      });

  } catch (error) {

    console.error(
      "Cancel notification error:",
      error
    );
  }
}


async function scheduleProductNotifications(
  product
) {
  if (
    Capacitor.getPlatform() ===
    "web"
  ) {
    return;
  }

  try {

    await cancelProductNotifications(
      product.id
    );


    const expiry =
      getNotificationDate(
        product.expiryDate,
        9,
        0
      );


    const notifications = [];


    const threeDays =
      new Date(
        expiry.getTime() -
        3 * 24 * 60 * 60 * 1000
      );


    const oneDay =
      new Date(
        expiry.getTime() -
        24 * 60 * 60 * 1000
      );


    const now =
      new Date();


    if (
      threeDays > now
    ) {
      notifications.push({
        id:
          notificationId(
            product.id,
            "3days"
          ),

        title:
          "محصول نزدیک به انقضا",

        body:
          `محصول «${product.name}» تا ۳ روز دیگر منقضی می‌شود.`,

        schedule: {
          at: threeDays
        }
      });
    }


    if (
      oneDay > now
    ) {
      notifications.push({
        id:
          notificationId(
            product.id,
            "1day"
          ),

        title:
          "هشدار انقضای محصول",

        body:
          `محصول «${product.name}» فردا منقضی می‌شود.`,

        schedule: {
          at: oneDay
        }
      });
    }


    if (
      expiry > now
    ) {
      notifications.push({
        id:
          notificationId(
            product.id,
            "expiry"
          ),

        title:
          "امروز تاریخ انقضای محصول است",

        body:
          `محصول «${product.name}» امروز منقضی می‌شود.`,

        schedule: {
          at: expiry
        }
      });
    }


    if (
      notifications.length
    ) {
      await LocalNotifications
        .schedule({
          notifications
        });
    }

  } catch (error) {

    console.error(
      "Schedule notification error:",
      error
    );
  }
}


/* =========================================================
   DATE STATUS
========================================================= */

function dateDifferenceText(
  start,
  end
) {
  if (!start || !end) {
    return "";
  }

  const result =
    difference(
      start,
      end
    );

  return (
    `${faNumbers(result.years)} سال، ` +
    `${faNumbers(result.months)} ماه و ` +
    `${faNumbers(result.days)} روز`
  );
}


function getDateStatus(
  expiry
) {
  if (!expiry) {
    return {
      type: "",
      text: ""
    };
  }


  const today =
    getToday();


  const comparison =
    compareDates(
      expiry,
      today
    );


  if (comparison < 0) {
    return {
      type: "expired",
      text: "منقضی شده"
    };
  }


  const diff =
    difference(
      today,
      expiry
    );


  const totalDays =
    Math.round(
      (
        jalaliDate(
          expiry.year,
          expiry.month,
          expiry.day
        ).getTime() -
        jalaliDate(
          today.year,
          today.month,
          today.day
        ).getTime()
      ) /
      86400000
    );


  if (
    totalDays <= 120
  ) {
    return {
      type: "warning",
      text: "نزدیک به انقضا"
    };
  }


  return {
    type: "",
    text: "معتبر"
  };
}


function remainingText(
  expiry
) {
  if (!expiry) {
    return "";
  }


  const today =
    getToday();


  if (
    compareDates(
      expiry,
      today
    ) < 0
  ) {
    return "محصول منقضی شده است";
  }


  const totalDays =
    Math.max(
      0,
      Math.round(
        (
          jalaliDate(
            expiry.year,
            expiry.month,
            expiry.day
          ).getTime() -
          jalaliDate(
            today.year,
            today.month,
            today.day
          ).getTime()
        ) /
        86400000
      )
    );


  if (
    totalDays === 0
  ) {
    return "امروز منقضی می‌شود";
  }


  if (
    totalDays === 1
  ) {
    return "۱ روز باقی مانده";
  }


  if (
    totalDays <= 120
  ) {
    return `${faNumbers(totalDays)} روز باقی مانده`;
  }


  const diff =
    difference(
      today,
      expiry
    );


  const parts = [];


  if (diff.years) {
    parts.push(
      `${faNumbers(diff.years)} سال`
    );
  }

  if (diff.months) {
    parts.push(
      `${faNumbers(diff.months)} ماه`
    );
  }

  if (diff.days) {
    parts.push(
      `${faNumbers(diff.days)} روز`
    );
  }


  return (
    parts.join(" و ") ||
    "معتبر"
  );
}


/* =========================================================
   APP HTML
========================================================= */

function appShell() {
  return `
    <div class="app" id="app">
      <div id="appContent"></div>

      <nav class="bottom-nav">

        <button
          class="nav-item active"
          data-page="home"
          type="button"
        >
          <span>⌂</span>
          <small>خانه</small>
        </button>

        <button
          class="nav-item"
          data-page="products"
          type="button"
        >
          <span>📦</span>
          <small>محصولات</small>
        </button>

        <button
          class="nav-item add-button"
          data-page="add"
          type="button"
        >
          <span>＋</span>
        </button>

        <button
          class="nav-item"
          data-page="alerts"
          type="button"
        >
          <span>🔔</span>
          <small>هشدارها</small>
        </button>

        <button
          class="nav-item"
          data-page="settings"
          type="button"
        >
          <span>⚙️</span>
          <small>تنظیمات</small>
        </button>

      </nav>
    </div>
  `;
}


/* =========================================================
   HEADER
========================================================= */

function normalHeader(
  title,
  subtitle = ""
) {
  return `
    <header class="topbar">

      <div class="header-icon">
        📦
      </div>

      <div class="page-title">

        <h1>
          ${escapeHTML(title)}
        </h1>

        ${
          subtitle
            ? `
              <p>
                ${escapeHTML(subtitle)}
              </p>
            `
            : ""
        }

      </div>

      <div style="width:48px"></div>

    </header>
  `;
}


function backHeader(
  title
) {
  return `
    <header class="topbar">

      <button
        class="back-button"
        id="backButton"
        type="button"
      >
        →
      </button>

      <div class="page-title">

        <h1>
          ${escapeHTML(title)}
        </h1>

      </div>

      <div style="width:45px"></div>

    </header>
  `;
}


/* =========================================================
   HOME
========================================================= */

function renderHome() {
  const valid =
    products.filter(
      p =>
        getDateStatus(
          p.expiryDate
        ).type !== "expired"
    ).length;


  const warning =
    products.filter(
      p =>
        getDateStatus(
          p.expiryDate
        ).type === "warning"
    ).length;


  const expired =
    products.filter(
      p =>
        getDateStatus(
          p.expiryDate
        ).type === "expired"
    ).length;


  const recent =
    [...products]
      .sort(
        (a, b) =>
          new Date(
            b.createdAt
          ) -
          new Date(
            a.createdAt
          )
      )
      .slice(0, 5);


  return `
    ${normalHeader(
      "مدیریت محصولات",
      "مدیریت تاریخ تولید و انقضا"
    )}

    <main>

      <section class="welcome-card">

        <div>

          <span class="welcome-small">
            خوش آمدید 👋
          </span>

          <h2>
            محصولات شما
          </h2>

          <p>
            اطلاعات محصولات را ثبت کنید
            و قبل از انقضا باخبر شوید.
          </p>

        </div>

        <div class="box-icon">
          📦
        </div>

      </section>


      <section class="stats">

        <div class="stat-card">

          <div class="stat-icon">
            📦
          </div>

          <span>
            کل محصولات
          </span>

          <strong>
            ${faNumbers(products.length)}
          </strong>

        </div>


        <div class="stat-card">

          <div class="stat-icon warning">
            ⚠️
          </div>

          <span>
            نزدیک انقضا
          </span>

          <strong>
            ${faNumbers(warning)}
          </strong>

        </div>


        <div class="stat-card">

          <div class="stat-icon expired">
            ⛔
          </div>

          <span>
            منقضی شده
          </span>

          <strong>
            ${faNumbers(expired)}
          </strong>

        </div>

      </section>


      <section class="actions">

        <button
          class="main-button"
          id="homeAddButton"
          type="button"
        >

          <span>
            ＋
          </span>

          <div>

            <strong>
              ثبت محصول جدید
            </strong>

            <small>
              محصول و تاریخ انقضا را ثبت کنید
            </small>

          </div>

        </button>

      </section>


      <div class="section-title">

        <h2>
          آخرین محصولات
        </h2>

        <span>
          ${faNumbers(recent.length)} مورد
        </span>

      </div>


      ${
        recent.length
          ? `
            <div class="products-list">
              ${recent
                .map(
                  renderProductCard
                )
                .join("")}
            </div>
          `
          : `
            ${emptyState()}
          `
      }

    </main>
  `;
}


/* =========================================================
   EMPTY
========================================================= */

function emptyState(
  title = "هنوز محصولی ثبت نشده",
  text = "برای شروع، اولین محصول خود را ثبت کنید."
) {
  return `
    <div class="empty-state">

      <div>
        📦
      </div>

      <strong>
        ${escapeHTML(title)}
      </strong>

      <p>
        ${escapeHTML(text)}
      </p>

    </div>
  `;
}


/* =========================================================
   PRODUCT CARD
========================================================= */

function renderProductCard(
  product
) {
  const status =
    getDateStatus(
      product.expiryDate
    );


  const remaining =
    remainingText(
      product.expiryDate
    );


  return `
    <div
      class="product-card"
      data-product-id="${escapeHTML(product.id)}"
    >

      <div class="product-image">

        ${
          product.image
            ? `
              <img
                src="${product.image}"
                alt=""
              >
            `
            : `
              📦
            `
        }

      </div>


      <div class="product-card-content">

        <div class="product-card-header">

          <div>

            <h3>
              ${escapeHTML(product.name)}
            </h3>

            <span>
              ${escapeHTML(
                product.type ||
                "بدون نوع"
              )}
            </span>

          </div>


          <span
            class="
              status-badge
              ${status.type}
            "
          >
            ${status.text}
          </span>

        </div>


        <div class="product-card-info">

          <span>
            تعداد:
            ${faNumbers(product.quantity)}
          </span>

          <span>
            انقضا:
            ${formatDate(
              product.expiryDate,
              product.expiryCalendar ||
                "jalali"
            )}
          </span>

        </div>


        <div
          class="
            product-remaining
            ${status.type}
          "
        >
          ${remaining}
        </div>

      </div>

    </div>
  `;
}


/* =========================================================
   PRODUCTS PAGE
========================================================= */

function renderProducts() {
  return `
    ${normalHeader(
      "محصولات",
      `${faNumbers(products.length)} محصول ثبت شده`
    )}

    <main>

      ${
        products.length
          ? `
            <div
              class="products-list"
              id="productsList"
            >
              ${products
                .map(
                  renderProductCard
                )
                .join("")}
            </div>
          `
          : `
            ${emptyState()}
          `
      }

    </main>
  `;
}


/* =========================================================
   ALERTS PAGE
========================================================= */

function renderAlerts() {
  const alerts =
    products.filter(
      product =>
        getDateStatus(
          product.expiryDate
        ).type ===
          "warning" ||
        getDateStatus(
          product.expiryDate
        ).type ===
          "expired"
    );


  return `
    ${normalHeader(
      "هشدارها",
      "محصولات نزدیک به انقضا"
    )}

    <main>

      ${
        alerts.length
          ? `
            <div class="products-list">
              ${alerts
                .map(
                  renderProductCard
                )
                .join("")}
            </div>
          `
          : `
            ${emptyState(
              "هشداری وجود ندارد",
              "در حال حاضر محصولی نزدیک به انقضا نیست."
            )}
          `
      }

    </main>
  `;
}


/* =========================================================
   SETTINGS
========================================================= */

function renderSettings() {
  return `
    ${normalHeader(
      "تنظیمات",
      "مدیریت برنامه"
    )}

    <main>

      <section class="form-section">

        <h3>
          حساب کاربری
        </h3>

        <label>
          ایمیل
        </label>

        <input
          type="text"
          value="${escapeHTML(
            currentSession?.user?.email ||
            ""
          )}"
          disabled
        >

        <button
          class="delete-button"
          id="logoutButton"
          type="button"
        >
          خروج از حساب
        </button>

      </section>


      <section
        class="form-section"
        style="margin-top:15px"
      >

        <h3>
          تقویم
        </h3>

        <p
          style="
            margin:0;
            color:#7d8492;
            font-size:12px;
            line-height:2;
          "
        >
          هنگام ثبت تاریخ می‌توانید
          بین هجری شمسی و هجری قمری
          انتخاب کنید.
        </p>

      </section>

    </main>
  `;
}


/* =========================================================
   FORM
========================================================= */

function renderForm(
  product = null
) {
  editingProductId =
    product?.id || null;


  productionDate =
    product?.productionDate
      ? {
          ...product.productionDate
        }
      : null;


  expiryDate =
    product?.expiryDate
      ? {
          ...product.expiryDate
        }
      : null;


  productionCalendar =
    product?.productionCalendar ||
    "jalali";


  expiryCalendar =
    product?.expiryCalendar ||
    "jalali";


  selectedImage =
    product?.image || "";


  return `
    ${backHeader(
      product
        ? "ویرایش محصول"
        : "ثبت محصول"
    )}

    <main>

      <form
        class="product-form"
        id="productForm"
      >

        <section class="form-section">

          <h3>
            اطلاعات محصول
          </h3>


          <label>
            نام محصول
          </label>

          <input
            type="text"
            id="productName"
            placeholder="مثلاً شیر"
            value="${escapeHTML(
              product?.name || ""
            )}"
          >


          <label>
            نوع محصول
          </label>

          <input
            type="text"
            id="productType"
            placeholder="مثلاً مواد غذایی"
            value="${escapeHTML(
              product?.type || ""
            )}"
          >


          <label>
            تعداد
          </label>

          <input
            type="number"
            id="productQuantity"
            min="0"
            placeholder="مثلاً 10"
            value="${escapeHTML(
              product?.quantity ??
              ""
            )}"
          >

        </section>


        <section class="form-section">

          <h3>
            تاریخ‌ها
          </h3>


          <label>
            تاریخ تولید
          </label>

          <button
            class="date-picker-button"
            id="productionDateButton"
            type="button"
          >
            ${dateButtonContent(
              productionDate,
              productionCalendar
            )}
          </button>


          <label>
            تاریخ انقضا
          </label>

          <button
            class="date-picker-button"
            id="expiryDateButton"
            type="button"
          >
            ${dateButtonContent(
              expiryDate,
              expiryCalendar
            )}
          </button>


          <div
            id="dateDifference"
          >
            ${renderDateDifference()}
          </div>

        </section>


        <section class="form-section">

          <h3>
            عکس محصول
          </h3>


          <label
            class="photo-button"
          >

            <span>
              📷
            </span>

            <div>

              <strong>
                انتخاب عکس
              </strong>

              <small>
                عکس فقط روی گوشی ذخیره می‌شود
              </small>

            </div>

            <input
              type="file"
              id="productImage"
              accept="image/*"
              capture="environment"
            >

          </label>


          ${
            selectedImage
              ? `
                <img
                  class="preview-image"
                  id="previewImage"
                  src="${selectedImage}"
                  alt=""
                >
              `
              : `
                <img
                  class="preview-image"
                  id="previewImage"
                  style="display:none"
                  alt=""
                >
              `
          }

        </section>


        <button
          class="save-button"
          id="saveProductButton"
          type="submit"
        >
          ${
            product
              ? "ذخیره تغییرات"
              : "ذخیره محصول"
          }
        </button>


        ${
          product
            ? `
              <button
                class="delete-button"
                id="formDeleteButton"
                type="button"
              >
                حذف محصول
              </button>
            `
            : ""
        }

      </form>

    </main>
  `;
}


/* =========================================================
   DATE BUTTON
========================================================= */

function dateButtonContent(
  date,
  mode
) {
  if (!date) {
    return `
      <span>
        📅
      </span>

      <div class="date-value">

        <strong>
          انتخاب تاریخ
        </strong>

        <small>
          هجری شمسی یا هجری قمری
        </small>

      </div>
    `;
  }


  return `
    <span>
      📅
    </span>

    <div class="date-value">

      <strong>
        ${formatDate(
          date,
          mode
        )}
      </strong>

      <small>
        ${calendarName(mode)}
      </small>

    </div>
  `;
}


/* =========================================================
   DATE DIFFERENCE
========================================================= */

function renderDateDifference() {
  if (
    !productionDate ||
    !expiryDate
  ) {
    return `
      <div class="date-difference">
        ابتدا تاریخ تولید و انقضا را انتخاب کنید.
      </div>
    `;
  }


  const status =
    getDateStatus(
      expiryDate
    );


  const text =
    dateDifferenceText(
      productionDate,
      expiryDate
    );


  return `
    <div
      class="
        date-difference
        ${status.type}
      "
    >
      فاصله تاریخ تولید تا انقضا:
      ${text}
    </div>
  `;
}


/* =========================================================
   CALENDAR
========================================================= */

function openCalendar(
  type
) {
  calendarType =
    type;


  if (
    type === "production"
  ) {
    calendarMode =
      productionCalendar;
  } else {
    calendarMode =
      expiryCalendar;
  }


  const selected =
    type === "production"
      ? productionDate
      : expiryDate;


  if (
    selected
  ) {
    const display =
      getDisplayDate(
        selected,
        calendarMode
      );

    calendarYear =
      display.year;

    calendarMonth =
      display.month;

  } else {

    if (
      calendarMode ===
      "hijri"
    ) {
      const today =
        getTodayHijri();

      calendarYear =
        today.hy;

      calendarMonth =
        today.hm;

    } else {

      const today =
        getToday();

      calendarYear =
        today.jy;

      calendarMonth =
        today.jm;
    }
  }


  renderCalendar();
}


function renderCalendar() {
  const old =
    document.querySelector(
      ".calendar-overlay"
    );

  if (old) {
    old.remove();
  }


  const selected =
    calendarType === "production"
      ? productionDate
      : expiryDate;


  const selectedDisplay =
    selected
      ? getDisplayDate(
          selected,
          calendarMode
        )
      : null;


  const monthNames =
    calendarMode === "hijri"
      ? HIJRI_MONTHS
      : JALALI_MONTHS;


  const title =
    `${monthNames[calendarMonth - 1]} ${faNumbers(calendarYear)}`;


  const overlay =
    document.createElement(
      "div"
    );

  overlay.className =
    "calendar-overlay";


  overlay.innerHTML = `
    <div
      class="calendar"
      role="dialog"
    >

      <div
        class="calendar-type-switch"
      >

        <button
          type="button"
          class="
            calendar-type-button
            ${
              calendarMode ===
              "jalali"
                ? "active"
                : ""
            }
          "
          data-calendar-mode="jalali"
        >
          هجری شمسی
        </button>

        <button
          type="button"
          class="
            calendar-type-button
            ${
              calendarMode ===
              "hijri"
                ? "active"
                : ""
            }
          "
          data-calendar-mode="hijri"
        >
          هجری قمری
        </button>

      </div>


      <div class="calendar-mode-label">
        انتخاب تاریخ
        <strong>
          ${calendarName(
            calendarMode
          )}
        </strong>
      </div>


      <div class="calendar-header">

        <button
          type="button"
          id="calendarNext"
        >
          ‹
        </button>


        <div class="calendar-title">

          <strong>
            ${title}
          </strong>

          <small>
            ${
              calendarMode ===
              "hijri"
                ? "تقویم قمری"
                : "تقویم شمسی"
            }
          </small>

        </div>


        <button
          type="button"
          id="calendarPrev"
        >
          ›
        </button>

      </div>


      <div class="weekdays">

        ${WEEK_DAYS
          .map(
            day =>
              `<span>${day}</span>`
          )
          .join("")}

      </div>


      <div
        class="calendar-days"
        id="calendarDays"
      >
      </div>


      <button
        class="close-calendar"
        id="closeCalendar"
        type="button"
      >
        بستن
      </button>

    </div>
  `;


  document.body.appendChild(
    overlay
  );


  drawCalendarDays(
    selectedDisplay
  );


  overlay
    .querySelectorAll(
      "[data-calendar-mode]"
    )
    .forEach(
      button => {
        button.addEventListener(
          "click",
          () => {

            changeCalendarMode(
              button.dataset
                .calendarMode
            );

          }
        );
      }
    );


  overlay
    .querySelector(
      "#calendarNext"
    )
    .addEventListener(
      "click",
      () => {

        moveCalendarMonth(
          1
        );

      }
    );


  overlay
    .querySelector(
      "#calendarPrev"
    )
    .addEventListener(
      "click",
      () => {

        moveCalendarMonth(
          -1
        );

      }
    );


  overlay
    .querySelector(
      "#closeCalendar"
    )
    .addEventListener(
      "click",
      closeCalendar
    );


  overlay.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        overlay
      ) {
        closeCalendar();
      }

    }
  );
}


/* =========================================================
   CHANGE CALENDAR MODE
========================================================= */

function changeCalendarMode(
  mode
) {
  if (
    mode !== "jalali" &&
    mode !== "hijri"
  ) {
    return;
  }


  /*
    Keep currently selected date
    and convert it to the new calendar.
  */

  const selected =
    calendarType === "production"
      ? productionDate
      : expiryDate;


  calendarMode =
    mode;


  if (selected) {

    const display =
      getDisplayDate(
        selected,
        mode
      );

    calendarYear =
      display.year;

    calendarMonth =
      display.month;

  } else {

    if (
      mode === "hijri"
    ) {
      const today =
        getTodayHijri();

      calendarYear =
        today.hy;

      calendarMonth =
        today.hm;

    } else {

      const today =
        getToday();

      calendarYear =
        today.jy;

      calendarMonth =
        today.jm;
    }
  }


  if (
    calendarType === "production"
  ) {
    productionCalendar =
      mode;
  } else {
    expiryCalendar =
      mode;
  }


  renderCalendar();
}


/* =========================================================
   MOVE CALENDAR MONTH
========================================================= */

function moveCalendarMonth(
  amount
) {
  calendarMonth +=
    amount;


  if (
    calendarMonth < 1
  ) {
    calendarMonth = 12;
    calendarYear--;
  }


  if (
    calendarMonth > 12
  ) {
    calendarMonth = 1;
    calendarYear++;
  }


  /*
    Gregorian/Jalali algorithms support
    the normal supported year range.
  */

  renderCalendar();
}


/* =========================================================
   DRAW CALENDAR DAYS
========================================================= */

function drawCalendarDays(
  selectedDisplay
) {
  const container =
    document.querySelector(
      "#calendarDays"
    );

  if (!container) {
    return;
  }


  container.innerHTML = "";


  let firstDate;


  if (
    calendarMode ===
    "jalali"
  ) {

    firstDate =
      jalaliDate(
        calendarYear,
        calendarMonth,
        1
      );

  } else {

    const gregorian =
      hijriToGregorian(
        calendarYear,
        calendarMonth,
        1
      );

    firstDate =
      new Date(
        gregorian.gy,
        gregorian.gm - 1,
        gregorian.gd
      );
  }


  /*
    JavaScript:
    Sunday = 0
    Saturday = 6

    We want:
    Saturday first
    Friday last

    Convert:
    Sunday -> 1
    Monday -> 2
    ...
    Friday -> 6
    Saturday -> 0
  */

  const startDay =
    (
      firstDate.getDay() +
      1
    ) % 7;


  for (
    let i = 0;
    i < startDay;
    i++
  ) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "calendar-empty";

    container.appendChild(
      empty
    );
  }


  const days =
    calendarMode === "jalali"
      ? jalaliMonthDays(
          calendarYear,
          calendarMonth
        )
      : hijriMonthDays(
          calendarYear,
          calendarMonth
        );


  let todayDisplay = null;


  if (
    calendarMode ===
    "jalali"
  ) {

    const today =
      getToday();

    todayDisplay = {
      year: today.jy,
      month: today.jm,
      day: today.jd
    };

  } else {

    const today =
      getTodayHijri();

    todayDisplay = {
      year: today.hy,
      month: today.hm,
      day: today.hd
    };
  }


  for (
    let day = 1;
    day <= days;
    day++
  ) {

    const button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.textContent =
      faNumbers(day);


    const isSelected =
      selectedDisplay &&
      Number(
        selectedDisplay.year
      ) ===
        Number(calendarYear) &&
      Number(
        selectedDisplay.month
      ) ===
        Number(calendarMonth) &&
      Number(
        selectedDisplay.day
      ) ===
        Number(day);


    const isToday =
      todayDisplay &&
      Number(
        todayDisplay.year
      ) ===
        Number(calendarYear) &&
      Number(
        todayDisplay.month
      ) ===
        Number(calendarMonth) &&
      Number(
        todayDisplay.day
      ) ===
        Number(day);


    if (isSelected) {
      button.classList.add(
        "selected"
      );
    }


    if (isToday) {
      button.classList.add(
        "today"
      );
    }


    button.addEventListener(
      "click",
      () => {

        selectCalendarDate(
          calendarYear,
          calendarMonth,
          day
        );

      }
    );


    container.appendChild(
      button
    );
  }
}


/* =========================================================
   SELECT CALENDAR DATE
========================================================= */

function selectCalendarDate(
  year,
  month,
  day
) {
  let canonicalJalali;


  if (
    calendarMode ===
    "jalali"
  ) {

    if (
      !isValidJalaliDate(
        year,
        month,
        day
      )
    ) {
      return;
    }

    canonicalJalali = {
      year,
      month,
      day
    };

  } else {

    if (
      !isValidHijriDate(
        year,
        month,
        day
      )
    ) {
      return;
    }

    canonicalJalali =
      hijriToJalaliObject({
        year,
        month,
        day
      });
  }


  if (
    calendarType ===
    "production"
  ) {

    productionDate =
      canonicalJalali;

    productionCalendar =
      calendarMode;

  } else {

    expiryDate =
      canonicalJalali;

    expiryCalendar =
      calendarMode;
  }


  closeCalendar();


  updateDateButtons();
}


/* =========================================================
   CLOSE CALENDAR
========================================================= */

function closeCalendar() {
  const overlay =
    document.querySelector(
      ".calendar-overlay"
    );

  if (overlay) {
    overlay.remove();
  }
}


/* =========================================================
   UPDATE FORM DATES
========================================================= */

function updateDateButtons() {
  const productionButton =
    document.querySelector(
      "#productionDateButton"
    );

  if (productionButton) {

    productionButton.innerHTML =
      dateButtonContent(
        productionDate,
        productionCalendar
      );
  }


  const expiryButton =
    document.querySelector(
      "#expiryDateButton"
    );

  if (expiryButton) {

    expiryButton.innerHTML =
      dateButtonContent(
        expiryDate,
        expiryCalendar
      );
  }


  const differenceBox =
    document.querySelector(
      "#dateDifference"
    );

  if (differenceBox) {

    differenceBox.innerHTML =
      renderDateDifference();
  }
}


/* =========================================================
   IMAGE
========================================================= */

function setupImagePicker() {
  const input =
    document.querySelector(
      "#productImage"
    );

  if (!input) {
    return;
  }


  input.addEventListener(
    "change",
    event => {

      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }


      /*
        Compress image before localStorage.
        This prevents localStorage from becoming
        unnecessarily huge.
      */

      compressImage(
        file,
        imageData => {

          selectedImage =
            imageData;


          const preview =
            document.querySelector(
              "#previewImage"
            );


          if (preview) {

            preview.src =
              imageData;

            preview.style.display =
              "block";
          }

        }
      );

    }
  );
}


function compressImage(
  file,
  callback
) {
  const reader =
    new FileReader();


  reader.onload = () => {

    const image =
      new Image();


    image.onload = () => {

      const maxWidth =
        1000;

      const maxHeight =
        1000;


      let width =
        image.width;

      let height =
        image.height;


      if (
        width > maxWidth ||
        height > maxHeight
      ) {

        const ratio =
          Math.min(
            maxWidth / width,
            maxHeight / height
          );

        width =
          Math.round(
            width * ratio
          );

        height =
          Math.round(
            height * ratio
          );
      }


      const canvas =
        document.createElement(
          "canvas"
        );


      canvas.width =
        width;

      canvas.height =
        height;


      const context =
        canvas.getContext(
          "2d"
        );


      context.drawImage(
        image,
        0,
        0,
        width,
        height
      );


      callback(
        canvas.toDataURL(
          "image/jpeg",
          0.78
        )
      );
    };


    image.src =
      reader.result;
  };


  reader.readAsDataURL(
    file
  );
}


/* =========================================================
   DETAILS
========================================================= */

function renderDetails(
  productId
) {
  const product =
    products.find(
      item =>
        String(item.id) ===
        String(productId)
    );


  if (!product) {
    renderProducts();
    return;
  }


  const status =
    getDateStatus(
      product.expiryDate
    );


  const productionMode =
    product.productionCalendar ||
    "jalali";


  const expiryMode =
    product.expiryCalendar ||
    "jalali";


  document.querySelector(
    "#appContent"
  ).innerHTML = `

    ${backHeader(
      "جزئیات محصول"
    )}

    <main>

      <section class="details-card">

        <div class="details-image">

          ${
            product.image
              ? `
                <img
                  src="${product.image}"
                  alt=""
                >
              `
              : `
                📦
              `
          }

        </div>


        <h2>
          ${escapeHTML(
            product.name
          )}
        </h2>


        <span class="details-type">
          ${escapeHTML(
            product.type ||
            "بدون نوع"
          )}
        </span>


        <div
          class="
            details-status
            ${status.type}
          "
        >
          ${status.text}
          —
          ${remainingText(
            product.expiryDate
          )}
        </div>


        <div class="details-grid">

          <div>

            <span>
              تعداد
            </span>

            <strong>
              ${faNumbers(
                product.quantity
              )}
            </strong>

          </div>


          <div>

            <span>
              تاریخ تولید
            </span>

            <strong>
              ${formatDate(
                product.productionDate,
                productionMode
              )}
            </strong>

          </div>


          <div>

            <span>
              تاریخ انقضا
            </span>

            <strong>
              ${formatDate(
                product.expiryDate,
                expiryMode
              )}
            </strong>

          </div>

        </div>


        <div
          style="
            margin-top:10px;
            color:#9299a6;
            font-size:10px;
          "
        >

          تولید:
          ${calendarName(
            productionMode
          )}

          <br>

          انقضا:
          ${calendarName(
            expiryMode
          )}

        </div>


        <div class="details-actions">

          <button
            class="save-button"
            id="editProductButton"
            type="button"
          >
            ویرایش محصول
          </button>


          <button
            class="delete-button"
            id="detailsDeleteButton"
            type="button"
          >
            حذف محصول
          </button>

        </div>

      </section>

    </main>
  `;


  document.querySelector(
    "#backButton"
  )?.addEventListener(
    "click",
    () => {
      renderProducts();
    }
  );


  document.querySelector(
    "#editProductButton"
  )?.addEventListener(
    "click",
    () => {
      renderFormPage(
        product
      );
    }
  );


  document.querySelector(
    "#detailsDeleteButton"
  )?.addEventListener(
    "click",
    async () => {

      await deleteProduct(
        product.id
      );

    }
  );
}


/* =========================================================
   FORM PAGE
========================================================= */

function renderFormPage(
  product = null
) {
  document.querySelector(
    "#appContent"
  ).innerHTML =
    renderForm(
      product
    );


  document.querySelector(
    "#backButton"
  )?.addEventListener(
    "click",
    () => {

      if (product) {
        renderDetails(
          product.id
        );
      } else {
        renderHome();
        updateNav("home");
      }

    }
  );


  document.querySelector(
    "#productForm"
  )?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      await saveProduct();

    }
  );


  document.querySelector(
    "#productionDateButton"
  )?.addEventListener(
    "click",
    () => {
      openCalendar(
        "production"
      );
    }
  );


  document.querySelector(
    "#expiryDateButton"
  )?.addEventListener(
    "click",
    () => {
      openCalendar(
        "expiry"
      );
    }
  );


  document.querySelector(
    "#formDeleteButton"
  )?.addEventListener(
    "click",
    async () => {

      if (product) {
        await deleteProduct(
          product.id
        );
      }

    }
  );


  setupImagePicker();
}


/* =========================================================
   NAVIGATION
========================================================= */

function updateNav(
  page
) {
  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      item => {

        item.classList.toggle(
          "active",
          item.dataset.page ===
            page
        );

      }
    );
}


function renderPage(
  page
) {
  updateNav(page);


  if (
    page === "home"
  ) {

    document.querySelector(
      "#appContent"
    ).innerHTML =
      renderHome();

    bindHome();

    return;
  }


  if (
    page === "products"
  ) {

    document.querySelector(
      "#appContent"
    ).innerHTML =
      renderProducts();

    bindProductCards();

    return;
  }


  if (
    page === "add"
  ) {

    renderFormPage();

    return;
  }


  if (
    page === "alerts"
  ) {

    document.querySelector(
      "#appContent"
    ).innerHTML =
      renderAlerts();

    bindProductCards();

    return;
  }


  if (
    page === "settings"
  ) {

    document.querySelector(
      "#appContent"
    ).innerHTML =
      renderSettings();

    bindSettings();

    return;
  }
}


/* =========================================================
   BIND HOME
========================================================= */

function bindHome() {
  document.querySelector(
    "#homeAddButton"
  )?.addEventListener(
    "click",
    () => {

      renderFormPage();

      updateNav("add");

    }
  );


  bindProductCards();
}


/* =========================================================
   BIND PRODUCT CARDS
========================================================= */

function bindProductCards() {
  document
    .querySelectorAll(
      ".product-card"
    )
    .forEach(
      card => {

        card.addEventListener(
          "click",
          () => {

            const id =
              card.dataset
                .productId;

            renderDetails(
              id
            );

          }
        );

      }
    );
}


/* =========================================================
   BIND SETTINGS
========================================================= */

function bindSettings() {
  document.querySelector(
    "#logoutButton"
  )?.addEventListener(
    "click",
    async () => {

      const confirmed =
        confirm(
          "آیا می‌خواهید از حساب خارج شوید؟"
        );

      if (!confirmed) {
        return;
      }


      try {

        await signOut();

      } catch (error) {

        console.error(
          "Logout error:",
          error
        );

      }

    }
  );
}


/* =========================================================
   RENDER APP
========================================================= */

function renderApp() {
  if (
    !document.querySelector(
      "#app"
    )
  ) {

    document.body.innerHTML =
      appShell();
  }


  renderPage(
    "home"
  );
}


/* =========================================================
   AUTH PAGE
========================================================= */

function renderAuthPage(
  message = ""
) {
  document.body.innerHTML = `
    <div class="auth-page">

      <div class="auth-card">

        <div class="auth-icon">
          📦
        </div>

        <h1>
          مدیریت محصولات
        </h1>

        <p class="auth-description">
          برای مدیریت محصولات و دریافت
          هشدار انقضا وارد حساب خود شوید.
        </p>


        <form id="loginForm">

          <label>
            ایمیل
          </label>

          <input
            type="email"
            id="loginEmail"
            placeholder="example@gmail.com"
            autocomplete="email"
            required
          >


          <label
            style="margin-top:15px"
          >
            رمز عبور
          </label>

          <input
            type="password"
            id="loginPassword"
            placeholder="رمز عبور"
            autocomplete="current-password"
            required
          >


          <button
            type="submit"
            id="loginButton"
          >
            ورود
          </button>


          <div
            class="auth-message"
            id="authMessage"
          >
            ${escapeHTML(message)}
          </div>

        </form>


        <div class="auth-info">
          اطلاعات محصولات شما در حساب کاربری
          ذخیره می‌شود.
          <br>
          عکس محصولات فقط روی دستگاه شما نگهداری می‌شود.
        </div>

      </div>

    </div>
  `;


  document.querySelector(
    "#loginForm"
  )?.addEventListener(
    "submit",
    handleLogin
  );
}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(
  event
) {
  event.preventDefault();


  const email =
    document.querySelector(
      "#loginEmail"
    )?.value.trim();


  const password =
    document.querySelector(
      "#loginPassword"
    )?.value;


  const button =
    document.querySelector(
      "#loginButton"
    );


  const message =
    document.querySelector(
      "#authMessage"
    );


  if (!email || !password) {
    if (message) {
      message.textContent =
        "ایمیل و رمز عبور را وارد کنید.";
    }

    return;
  }


  if (button) {
    button.disabled =
      true;

    button.textContent =
      "در حال ورود...";
  }


  try {

    const result =
      await signIn(
        email,
        password
      );


    if (
      result?.error
    ) {
      throw result.error;
    }


  } catch (error) {

    console.error(
      "Login error:",
      error
    );


    if (message) {
      message.textContent =
        error?.message ||
        "ورود انجام نشد.";
    }


    if (button) {
      button.disabled =
        false;

      button.textContent =
        "ورود";
    }
  }
}


/* =========================================================
   SESSION
========================================================= */

async function checkSession() {
  try {

    const session =
      await getSession();


    currentSession =
      session;


    if (
      currentSession
    ) {

      renderApp();

      await setupNotifications();

      await loadProductsFromCloud();

    } else {

      renderAuthPage();

    }

  } catch (error) {

    console.error(
      "Session error:",
      error
    );

    renderAuthPage(
      "خطایی هنگام بررسی حساب رخ داد."
    );
  }
}


/* =========================================================
   SUPABASE AUTH LISTENER
========================================================= */

function setupAuthListener() {
  if (
    !supabase?.auth
  ) {
    return;
  }


  supabase.auth.onAuthStateChange(
    async (
      event,
      session
    ) => {

      currentSession =
        session;


      if (
        event ===
          "SIGNED_IN" &&
        session
      ) {

        renderApp();

        await setupNotifications();

        await loadProductsFromCloud();

      }


      if (
        event ===
        "SIGNED_OUT"
      ) {

        products = [];

        currentSession =
          null;

        renderAuthPage();

      }

    }
  );
}


/* =========================================================
   NAV LISTENER
========================================================= */

function setupNavigation() {
  document.addEventListener(
    "click",
    event => {

      const nav =
        event.target.closest(
          ".nav-item"
        );

      if (!nav) {
        return;
      }


      const page =
        nav.dataset.page;


      if (!page) {
        return;
      }


      renderPage(
        page
      );

    }
  );
}


/* =========================================================
   START APP
========================================================= */

async function startApp() {
  setupNavigation();

  setupAuthListener();

  await checkSession();
}


/* =========================================================
   START
========================================================= */

startApp();