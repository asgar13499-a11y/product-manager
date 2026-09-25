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


/* =========================================================
   GLOBAL STATE
========================================================= */

let products = [];

let productionDate = null;
let expiryDate = null;

let selectedImage = "";

let calendarType = null;

let calendarYear = null;
let calendarMonth = null;

let editingProductId = null;

const STORAGE_KEY = "products";


/* =========================================================
   MONTH NAMES
========================================================= */

const MONTHS = [
  "ژانویه",
  "فوریه",
  "مارس",
  "آوریل",
  "مه",
  "ژوئن",
  "ژوئیه",
  "اوت",
  "سپتامبر",
  "اکتبر",
  "نوامبر",
  "دسامبر"
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
   GREGORIAN DATE HELPERS
========================================================= */

function getToday() {
  const now = new Date();

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate()
  };
}


function isLeapYear(year) {
  return (
    year % 4 === 0 &&
    (
      year % 100 !== 0 ||
      year % 400 === 0
    )
  );
}


function gregorianMonthDays(
  year,
  month
) {
  if (
    month === 2
  ) {
    return isLeapYear(year)
      ? 29
      : 28;
  }

  return [
    4,
    6,
    9,
    11
  ].includes(month)
    ? 30
    : 31;
}


function isValidGregorianDate(
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
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }

  return (
    day <=
    gregorianMonthDays(
      year,
      month
    )
  );
}


function dateToObject(date) {
  if (!date) {
    return null;
  }

  return {
    year: Number(date.year),
    month: Number(date.month),
    day: Number(date.day)
  };
}


function dateObjectToJS(date) {
  if (!date) {
    return null;
  }

  return new Date(
    Number(date.year),
    Number(date.month) - 1,
    Number(date.day),
    0,
    0,
    0,
    0
  );
}


function jsDateToObject(date) {
  if (!date) {
    return null;
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  };
}


function compareDates(
  first,
  second
) {
  const a =
    dateObjectToJS(first);

  const b =
    dateObjectToJS(second);

  if (!a || !b) {
    return 0;
  }

  if (a.getTime() < b.getTime()) {
    return -1;
  }

  if (a.getTime() > b.getTime()) {
    return 1;
  }

  return 0;
}


/* =========================================================
   EXACT MONTH ADDITION
========================================================= */

function addMonths(
  date,
  amount
) {
  if (!date) {
    return null;
  }

  const year =
    Number(date.year);

  const month =
    Number(date.month);

  const day =
    Number(date.day);

  const target =
    new Date(
      year,
      month - 1,
      1
    );

  target.setMonth(
    target.getMonth() + amount
  );

  const targetYear =
    target.getFullYear();

  const targetMonth =
    target.getMonth() + 1;

  const maxDay =
    gregorianMonthDays(
      targetYear,
      targetMonth
    );

  const targetDay =
    Math.min(
      day,
      maxDay
    );

  return {
    year: targetYear,
    month: targetMonth,
    day: targetDay
  };
}


/* =========================================================
   EXACT DIFFERENCE
========================================================= */

function difference(
  start,
  end
) {
  if (!start || !end) {
    return {
      years: 0,
      months: 0,
      days: 0
    };
  }

  let startDate =
    dateObjectToJS(start);

  const endDate =
    dateObjectToJS(end);

  if (
    !startDate ||
    !endDate
  ) {
    return {
      years: 0,
      months: 0,
      days: 0
    };
  }

  if (
    startDate.getTime() >
    endDate.getTime()
  ) {
    return {
      years: 0,
      months: 0,
      days: 0
    };
  }

  let years =
    endDate.getFullYear() -
    startDate.getFullYear();

  let months =
    endDate.getMonth() -
    startDate.getMonth();

  let days =
    endDate.getDate() -
    startDate.getDate();

  if (days < 0) {
    months--;

    const previousMonth =
      new Date(
        endDate.getFullYear(),
        endDate.getMonth(),
        0
      );

    days +=
      previousMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return {
    years,
    months,
    days
  };
}


/* =========================================================
   DATE FORMAT
========================================================= */

function formatDate(
  date
) {
  if (!date) {
    return "انتخاب نشده";
  }

  return faNumbers(
    `${date.year}/${pad(date.month)}/${pad(date.day)}`
  );
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

function toDbProduct(product) {

  return {
    id: product.id,

    user_id:
      product.user_id ||
      currentSession?.user?.id,

    name:
      product.name,

    type:
      product.type || "",

    quantity:
      Number(product.quantity) || 0,

    /*
      IMPORTANT:
      Dates are now Gregorian.
    */

    production_year:
      Number(
        product.productionDate?.year
      ),

    production_month:
      Number(
        product.productionDate?.month
      ),

    production_day:
      Number(
        product.productionDate?.day
      ),

    expiry_year:
      Number(
        product.expiryDate?.year
      ),

    expiry_month:
      Number(
        product.expiryDate?.month
      ),

    expiry_day:
      Number(
        product.expiryDate?.day
      ),

    created_at:
      product.createdAt ||
      new Date().toISOString()
  };
}


function fromDbProduct(row) {

  return {

    id:
      row.id,

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
      Image is ALWAYS local.
    */

    image: "",

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

    if (
      !currentSession?.user?.id
    ) {

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
        ? data.map(
            fromDbProduct
          )
        : [];


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

            /*
              Restore image from phone.
            */

            image:
              local?.image ||
              "",

          };
        }
      );


    /*
      If cloud is empty,
      migrate local products.
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
        Keep local products.
        Images must stay on device.
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


  const name =
    document.querySelector(
      "#productName"
    )?.value.trim() || "";


  const type =
    document.querySelector(
      "#productType"
    )?.value.trim() || "";


  const quantity =
    Number(
      document.querySelector(
        "#productQuantity"
      )?.value
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
    !isValidGregorianDate(
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
    !isValidGregorianDate(
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

    button.disabled =
      true;

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

      /*
        Image stays local.
      */

      image:
        selectedImage || "",

      createdAt:
        now
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


    saveLocalProducts();


    /*
      Schedule exact 4-month notification.
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

      button.disabled =
        false;

      button.textContent =
        "ذخیره محصول";
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


/*
  Convert Gregorian product date
  to JS notification date.
*/

function getNotificationDate(
  date,
  hour = 9,
  minute = 0
) {

  return new Date(
    date.year,
    date.month - 1,
    date.day,
    hour,
    minute,
    0,
    0
  );
}


/* =========================================================
   NOTIFICATION ID
========================================================= */

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
    (
      hash %
      1900000000
    )
  );
}


/* =========================================================
   CANCEL NOTIFICATIONS
========================================================= */

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
        "4months"
      )

    ];


    await LocalNotifications
      .cancel({

        notifications:
          ids.map(
            id => ({
              id
            })
          )

      });

  } catch (error) {

    console.error(
      "Cancel notification error:",
      error
    );
  }
}


/* =========================================================
   SCHEDULE 4 MONTH NOTIFICATION
========================================================= */

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


    /*
      Exact calendar calculation:

      expiry:
      2026/09/25

      notification:
      2026/05/25

      NOT:
      120 days.
    */

    const fourMonthsBefore =
      addMonths(
        product.expiryDate,
        -4
      );


    const notificationDate =
      getNotificationDate(
        fourMonthsBefore,
        9,
        0
      );


    const now =
      new Date();


    if (
      notificationDate <= now
    ) {
      return;
    }


    await LocalNotifications
      .schedule({

        notifications: [

          {

            id:
              notificationId(
                product.id,
                "4months"
              ),

            title:
              "هشدار انقضا",

            body:
              "یک محصول در حال انقضا هست",

            schedule: {
              at:
                notificationDate
            }

          }

        ]

      });

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


  if (
    comparison < 0
  ) {

    return {
      type: "expired",
      text: "منقضی شده"
    };
  }


  /*
    Exact 4-month boundary.
  */

  const fourMonthsLater =
    addMonths(
      today,
      4
    );


  if (
    compareDates(
      expiry,
      fourMonthsLater
    ) <= 0
  ) {

    return {
      type: "warning",
      text: "در حال انقضا"
    };
  }


  return {
    type: "",
    text: "معتبر"
  };
}


/* =========================================================
   REMAINING TEXT
========================================================= */

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


  if (
    compareDates(
      expiry,
      today
    ) === 0
  ) {

    return "امروز منقضی می‌شود";
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
    <div
      class="app"
      id="app"
    >

      <div
        id="appContent"
      ></div>


      <nav
        class="bottom-nav"
      >

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
    <header
      class="topbar"
    >

      <div
        class="header-icon"
      >
        📦
      </div>


      <div
        class="page-title"
      >

        <h1>
          ${escapeHTML(title)}
        </h1>


        ${
          subtitle
            ? `
              <p>
                ${escapeHTML(
                  subtitle
                )}
              </p>
            `
            : ""
        }

      </div>


      <div
        style="width:48px"
      ></div>

    </header>
  `;
}


function backHeader(
  title
) {

  return `
    <header
      class="topbar"
    >

      <button
        class="back-button"
        id="backButton"
        type="button"
      >
        →
      </button>


      <div
        class="page-title"
      >

        <h1>
          ${escapeHTML(title)}
        </h1>

      </div>


      <div
        style="width:45px"
      ></div>

    </header>
  `;
}


/* =========================================================
   HOME
========================================================= */

function renderHome() {

  const warning =
    products.filter(
      p =>
        getDateStatus(
          p.expiryDate
        ).type ===
        "warning"
    ).length;


  const expired =
    products.filter(
      p =>
        getDateStatus(
          p.expiryDate
        ).type ===
        "expired"
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
      .slice(
        0,
        5
      );


  return `

    ${normalHeader(
      "مدیریت محصولات",
      "مدیریت تاریخ تولید و انقضا"
    )}


    <main>

      <section
        class="welcome-card"
      >

        <div>

          <span
            class="welcome-small"
          >
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


        <div
          class="box-icon"
        >
          📦
        </div>

      </section>


      <section
        class="stats"
      >

        <div
          class="stat-card"
        >

          <div
            class="stat-icon"
          >
            📦
          </div>

          <span>
            کل محصولات
          </span>

          <strong>
            ${faNumbers(
              products.length
            )}
          </strong>

        </div>


        <div
          class="stat-card"
        >

          <div
            class="stat-icon warning"
          >
            ⚠️
          </div>

          <span>
            در حال انقضا
          </span>

          <strong>
            ${faNumbers(
              warning
            )}
          </strong>

        </div>


        <div
          class="stat-card"
        >

          <div
            class="stat-icon expired"
          >
            ⛔
          </div>

          <span>
            منقضی شده
          </span>

          <strong>
            ${faNumbers(
              expired
            )}
          </strong>

        </div>

      </section>


      <section
        class="actions"
      >

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


      <div
        class="section-title"
      >

        <h2>
          آخرین محصولات
        </h2>

        <span>
          ${faNumbers(
            recent.length
          )} مورد
        </span>

      </div>


      ${
        recent.length
          ? `
            <div
              class="products-list"
            >
              ${recent
                .map(
                  renderProductCard
                )
                .join("")}
            </div>
          `
          : emptyState()
      }

    </main>
  `;
}


/* =========================================================
   EMPTY
========================================================= */

function emptyState(
  title = "هنوز محصولی ثبت نشده",
  text =
    "برای شروع، اولین محصول خود را ثبت کنید."
) {

  return `
    <div
      class="empty-state"
    >

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
      data-product-id="${escapeHTML(
        product.id
      )}"
    >

      <div
        class="product-image"
      >

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


      <div
        class="product-card-content"
      >

        <div
          class="product-card-header"
        >

          <div>

            <h3>
              ${escapeHTML(
                product.name
              )}
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


        <div
          class="product-card-info"
        >

          <span>
            تعداد:
            ${faNumbers(
              product.quantity
            )}
          </span>


          <span>
            انقضا:
            ${formatDate(
              product.expiryDate
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
      `${faNumbers(
        products.length
      )} محصول ثبت شده`
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
          : emptyState()
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
      product => {

        const status =
          getDateStatus(
            product.expiryDate
          );

        return (
          status.type ===
            "warning" ||
          status.type ===
            "expired"
        );
      }
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
            <div
              class="products-list"
            >
              ${alerts
                .map(
                  renderProductCard
                )
                .join("")}
            </div>
          `
          : emptyState(
              "هشداری وجود ندارد",
              "در حال حاضر محصولی در محدوده چهار ماهه انقضا نیست."
            )
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

      <section
        class="form-section"
      >

        <h3>
          حساب کاربری
        </h3>


        <label>
          ایمیل
        </label>


        <input
          type="text"
          value="${escapeHTML(
            currentSession
              ?.user
              ?.email ||
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
          تاریخ
        </h3>


        <p
          style="
            margin:0;
            color:#7d8492;
            font-size:12px;
            line-height:2;
          "
        >
          تاریخ‌ها در برنامه به صورت
          میلادی نمایش داده می‌شوند؛
          برای مثال 2026/09/25.
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
    product?.id ||
    null;


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


  selectedImage =
    product?.image ||
    "";


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

        <section
          class="form-section"
        >

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
              product?.name ||
              ""
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
              product?.type ||
              ""
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


        <section
          class="form-section"
        >

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
              productionDate
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
              expiryDate
            )}
          </button>


          <div
            id="dateDifference"
          >
            ${renderDateDifference()}
          </div>

        </section>


        <section
          class="form-section"
        >

          <h3>
            عکس محصول
          </h3>


          <label
            class="photo-button"
          >

            <span>
              🖼️
            </span>


            <div>

              <strong>
                انتخاب عکس از گالری
              </strong>


              <small>
                عکس فقط روی گوشی ذخیره می‌شود
              </small>

            </div>


            <input
              type="file"
              id="productImage"
              accept="image/*"
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
  date
) {

  if (!date) {

    return `
      <span>
        📅
      </span>


      <div
        class="date-value"
      >

        <strong>
          انتخاب تاریخ
        </strong>


        <small>
          تاریخ میلادی
        </small>

      </div>
    `;
  }


  return `
    <span>
      📅
    </span>


    <div
      class="date-value"
    >

      <strong>
        ${formatDate(
          date
        )}
      </strong>


      <small>
        میلادی
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
      <div
        class="date-difference"
      >
        ابتدا تاریخ تولید و انقضا را انتخاب کنید.
      </div>
    `;
  }


  const text =
    dateDifferenceText(
      productionDate,
      expiryDate
    );


  const status =
    getDateStatus(
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


function dateDifferenceText(
  start,
  end
) {

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


/* =========================================================
   CALENDAR
========================================================= */

function openCalendar(
  type
) {

  calendarType =
    type;


  const selected =
    type === "production"
      ? productionDate
      : expiryDate;


  if (selected) {

    calendarYear =
      selected.year;

    calendarMonth =
      selected.month;

  } else {

    const today =
      getToday();

    calendarYear =
      today.year;

    calendarMonth =
      today.month;
  }


  renderCalendar();
}


/* =========================================================
   RENDER CALENDAR
========================================================= */

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


  const title =
    `${MONTHS[calendarMonth - 1]} ${calendarYear}`;


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
        class="calendar-mode-label"
      >
        انتخاب تاریخ
        <strong>
          میلادی
        </strong>
      </div>


      <div
        class="calendar-header"
      >

        <button
          type="button"
          id="calendarNext"
        >
          ‹
        </button>


        <div
          class="calendar-title"
        >

          <strong>
            ${escapeHTML(title)}
          </strong>


          <small>
            Gregorian
          </small>

        </div>


        <button
          type="button"
          id="calendarPrev"
        >
          ›
        </button>

      </div>


      <div
        class="weekdays"
      >

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
    selected
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

    calendarMonth =
      12;

    calendarYear--;
  }


  if (
    calendarMonth > 12
  ) {

    calendarMonth =
      1;

    calendarYear++;
  }


  renderCalendar();
}


/* =========================================================
   DRAW CALENDAR DAYS
========================================================= */

function drawCalendarDays(
  selected
) {

  const container =
    document.querySelector(
      "#calendarDays"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    "";


  const firstDate =
    new Date(
      calendarYear,
      calendarMonth - 1,
      1
    );


  /*
    Saturday first.
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
    gregorianMonthDays(
      calendarYear,
      calendarMonth
    );


  const today =
    getToday();


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
      selected &&
      Number(
        selected.year
      ) ===
        Number(calendarYear) &&
      Number(
        selected.month
      ) ===
        Number(calendarMonth) &&
      Number(
        selected.day
      ) ===
        Number(day);


    const isToday =
      Number(
        today.year
      ) ===
        Number(calendarYear) &&
      Number(
        today.month
      ) ===
        Number(calendarMonth) &&
      Number(
        today.day
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
   SELECT DATE
========================================================= */

function selectCalendarDate(
  year,
  month,
  day
) {

  if (
    !isValidGregorianDate(
      year,
      month,
      day
    )
  ) {
    return;
  }


  const selected = {
    year,
    month,
    day
  };


  if (
    calendarType ===
    "production"
  ) {

    productionDate =
      selected;

  } else {

    expiryDate =
      selected;
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
   UPDATE DATE BUTTONS
========================================================= */

function updateDateButtons() {

  const productionButton =
    document.querySelector(
      "#productionDateButton"
    );


  if (productionButton) {

    productionButton.innerHTML =
      dateButtonContent(
        productionDate
      );
  }


  const expiryButton =
    document.querySelector(
      "#expiryDateButton"
    );


  if (expiryButton) {

    expiryButton.innerHTML =
      dateButtonContent(
        expiryDate
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
   IMAGE PICKER
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


/* =========================================================
   COMPRESS IMAGE
========================================================= */

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


  document.querySelector(
    "#appContent"
  ).innerHTML = `

    ${backHeader(
      "جزئیات محصول"
    )}


    <main>

      <section
        class="details-card"
      >

        <div
          class="details-image"
        >

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


        <span
          class="details-type"
        >
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


        <div
          class="details-grid"
        >

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
                product.productionDate
              )}
            </strong>

          </div>


          <div>

            <span>
              تاریخ انقضا
            </span>


            <strong>
              ${formatDate(
                product.expiryDate
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
          تاریخ‌ها به صورت میلادی ذخیره می‌شوند.
        </div>


        <div
          class="details-actions"
        >

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

      updateNav(
        "products"
      );
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

        updateNav(
          "home"
        );
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

  updateNav(
    page
  );


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

      updateNav(
        "add"
      );
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

    <div
      class="auth-page"
    >

      <div
        class="auth-card"
      >

        <div
          class="auth-icon"
        >
          📦
        </div>


        <h1>
          مدیریت محصولات
        </h1>


        <p
          class="auth-description"
        >
          برای مدیریت محصولات و دریافت
          هشدار انقضا وارد حساب خود شوید.
        </p>


        <form
          id="loginForm"
        >

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
            ${escapeHTML(
              message
            )}
          </div>

        </form>


        <div
          class="auth-info"
        >
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


  if (
    !email ||
    !password
  ) {

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