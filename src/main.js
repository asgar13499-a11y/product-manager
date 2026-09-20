import "./style.css";

import { supabase } from "./supabase.js";
import { renderAuth } from "./auth.js";

import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

import {
  todayJalali,
  jalaliMonthDays,
  isValidJalaliDate,
  jalaliDate,
  difference,
  compareDates
} from "./jalali.js";

const STORAGE_KEY = "products";

let products = [];
let productionDate = null;
let expiryDate = null;
let selectedImage = "";
let calendarType = null;

const app = document.getElementById("app");

/* =========================
   AUTH
========================= */

let currentSession = null;
let loadedUserId = null;

/* =========================
   LOCAL NOTIFICATIONS
========================= */

const NOTIFICATION_CHANNEL_ID =
  "product-expiry-alerts";

function isNativeApp() {
  return Capacitor.isNativePlatform();
}

function getNotificationBaseId(productId) {
  const text = String(productId);

  let hash = 0;

  for (let i = 0; i < text.length; i++) {
    hash =
      (hash * 31 + text.charCodeAt(i)) |
      0;
  }

  hash = Math.abs(hash);

  return (hash % 1000000) * 10;
}

function createNotificationId(
  productId,
  type
) {
  return (
    getNotificationBaseId(productId) +
    type
  );
}

async function setupNotifications() {
  if (!isNativeApp()) {
    return;
  }

  try {
    const permission =
      await LocalNotifications.checkPermissions();

    if (
      permission.display !== "granted"
    ) {
      const requested =
        await LocalNotifications.requestPermissions();

      if (
        requested.display !== "granted"
      ) {
        console.warn(
          "Notification permission was not granted."
        );

        return;
      }
    }

    if (
      Capacitor.getPlatform() ===
      "android"
    ) {
      await LocalNotifications.createChannel({
        id: NOTIFICATION_CHANNEL_ID,
        name: "هشدار انقضای محصولات",
        description:
          "اعلان‌های مربوط به تاریخ انقضای محصولات",
        importance: 5,
        visibility: 1,
        vibration: true,
        sound: "default"
      });
    }
  } catch (error) {
    console.error(
      "Notification setup error:",
      error
    );
  }
}

function getNotificationDate(
  jalali,
  hour = 9,
  minute = 0
) {
  const date =
    jalaliDate(
      jalali.year,
      jalali.month,
      jalali.day
    );

  date.setHours(
    hour,
    minute,
    0,
    0
  );

  return date;
}

async function cancelProductNotifications(
  productId
) {
  if (!isNativeApp()) {
    return;
  }

  try {
    const ids = [
      {
        id:
          createNotificationId(
            productId,
            1
          )
      },
      {
        id:
          createNotificationId(
            productId,
            2
          )
      },
      {
        id:
          createNotificationId(
            productId,
            3
          )
      }
    ];

    await LocalNotifications.cancel({
      notifications: ids
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
  if (!isNativeApp()) {
    return;
  }

  if (!product?.expiryDate) {
    return;
  }

  try {
    await setupNotifications();

    await cancelProductNotifications(
      product.id
    );

    const expiry =
      getNotificationDate(
        product.expiryDate,
        9,
        0
      );

    const oneDayBefore =
      new Date(
        expiry.getTime() -
          24 * 60 * 60 * 1000
      );

    const threeDaysBefore =
      new Date(
        expiry.getTime() -
          3 * 24 * 60 * 60 * 1000
      );

    const notifications = [];

    const now =
      new Date();

    /*
      سه روز مانده
    */

    if (
      threeDaysBefore > now
    ) {
      notifications.push({
        id:
          createNotificationId(
            product.id,
            1
          ),

        title:
          "🔔 هشدار انقضای محصول",

        body:
          `${product.name} تا ۳ روز دیگر منقضی می‌شود.`,

        schedule: {
          at: threeDaysBefore
        },

        channelId:
          NOTIFICATION_CHANNEL_ID,

        sound: "default"
      });
    }

    /*
      یک روز مانده
    */

    if (
      oneDayBefore > now
    ) {
      notifications.push({
        id:
          createNotificationId(
            product.id,
            2
          ),

        title:
          "⚠️ نزدیک شدن تاریخ انقضا",

        body:
          `${product.name} فردا منقضی می‌شود.`,

        schedule: {
          at: oneDayBefore
        },

        channelId:
          NOTIFICATION_CHANNEL_ID,

        sound: "default"
      });
    }

    /*
      روز انقضا
    */

    if (
      expiry > now
    ) {
      notifications.push({
        id:
          createNotificationId(
            product.id,
            3
          ),

        title:
          "🚨 هشدار انقضا",

        body:
          `${product.name} امروز آخرین روز مصرف است.`,

        schedule: {
          at: expiry
        },

        channelId:
          NOTIFICATION_CHANNEL_ID,

        sound: "default"
      });
    }

    if (
      notifications.length > 0
    ) {
      await LocalNotifications.schedule({
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

async function scheduleAllProductNotifications() {
  if (!isNativeApp()) {
    return;
  }

  try {
    await setupNotifications();

    for (
      const product of products
    ) {
      await scheduleProductNotifications(
        product
      );
    }
  } catch (error) {
    console.error(
      "Schedule all notifications error:",
      error
    );
  }
}

/* =========================
   LOCAL STORAGE
========================= */

function getLocalProducts() {
  try {
    return JSON.parse(
      localStorage.getItem(STORAGE_KEY) ||
        "[]"
    );
  } catch {
    return [];
  }
}

function saveLocalProducts() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(products)
  );
}

/* =========================
   HELPERS
========================= */

function faNumbers(value) {
  return String(value).replace(
    /\d/g,
    (digit) =>
      "۰۱۲۳۴۵۶۷۸۹"[digit]
  );
}

function pad(value) {
  return String(value).padStart(
    2,
    "0"
  );
}

function formatDate(date) {
  if (!date) {
    return "---";
  }

  return (
    faNumbers(date.year) +
    "/" +
    faNumbers(
      pad(date.month)
    ) +
    "/" +
    faNumbers(
      pad(date.day)
    )
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

/* =========================
   SUPABASE PRODUCT MAPPING
========================= */

function toDbProduct(
  product,
  userId
) {
  return {
    id: String(product.id),
    user_id: userId,

    name: product.name,
    type: product.type || "",
    quantity:
      Number(product.quantity) || 1,

    production_year:
      Number(
        product.productionDate.year
      ),

    production_month:
      Number(
        product.productionDate.month
      ),

    production_day:
      Number(
        product.productionDate.day
      ),

    expiry_year:
      Number(
        product.expiryDate.year
      ),

    expiry_month:
      Number(
        product.expiryDate.month
      ),

    expiry_day:
      Number(
        product.expiryDate.day
      ),

    image:
      product.image || null,

    created_at:
      product.createdAt ||
      new Date().toISOString()
  };
}

function fromDbProduct(row) {
  return {
    id: row.id,

    name: row.name,

    type:
      row.type || "",

    quantity:
      Number(row.quantity) || 1,

    productionDate: {
      year:
        Number(
          row.production_year
        ),

      month:
        Number(
          row.production_month
        ),

      day:
        Number(
          row.production_day
        )
    },

    expiryDate: {
      year:
        Number(
          row.expiry_year
        ),

      month:
        Number(
          row.expiry_month
        ),

      day:
        Number(
          row.expiry_day
        )
    },

    image:
      row.image || "",

    createdAt:
      row.created_at ||
      new Date().toISOString()
  };
}

/* =========================
   LOAD PRODUCTS FROM CLOUD
========================= */

async function loadProductsFromCloud() {
  if (
    !currentSession?.user?.id
  ) {
    products = [];
    return false;
  }

  const userId =
    currentSession.user.id;

  try {
    const {
      data,
      error
    } = await supabase
      .from("products")
      .select("*")
      .eq(
        "user_id",
        userId
      )
      .order(
        "created_at",
        {
          ascending: false
        }
      );

    if (error) {
      console.error(
        "Load products error:",
        error
      );

      alert(
        "دریافت محصولات از سرور با خطا مواجه شد."
      );

      return false;
    }

    const cloudProducts =
      (data || []).map(
        fromDbProduct
      );

    const localProducts =
      getLocalProducts();

    if (
      cloudProducts.length === 0 &&
      localProducts.length > 0
    ) {
      const shouldMigrate =
        confirm(
          "در این حساب هنوز محصولی ذخیره نشده است.\n\n" +
            `تعداد ${faNumbers(
              localProducts.length
            )} محصول قدیمی روی این دستگاه پیدا شد.\n\n` +
            "آیا می‌خواهید آنها به این حساب منتقل شوند؟"
        );

      if (shouldMigrate) {
        const migrated =
          localProducts.map(
            (product) => ({
              ...product,

              id:
                product.id ||
                crypto.randomUUID()
            })
          );

        const rows =
          migrated.map(
            (product) =>
              toDbProduct(
                product,
                userId
              )
          );

        const {
          error:
            insertError
        } =
          await supabase
            .from("products")
            .insert(rows);

        if (insertError) {
          console.error(
            "Migration error:",
            insertError
          );

          alert(
            "انتقال محصولات قدیمی با خطا مواجه شد."
          );

          products =
            cloudProducts;

          return false;
        }

        products =
          migrated;

        localStorage.removeItem(
          STORAGE_KEY
        );

        return true;
      }
    }

    products =
      cloudProducts;

    return true;
  } catch (error) {
    console.error(
      "Cloud load error:",
      error
    );

    alert(
      "ارتباط با سرور برقرار نشد."
    );

    return false;
  }
}

/* =========================
   SAVE PRODUCT TO CLOUD
========================= */

async function saveProduct(
  oldProduct
) {
  if (
    !currentSession?.user?.id
  ) {
    alert(
      "ابتدا وارد حساب کاربری شوید."
    );

    renderAuth();

    return;
  }

  const name =
    document
      .getElementById(
        "productName"
      )
      .value
      .trim();

  const type =
    document
      .getElementById(
        "productType"
      )
      .value
      .trim();

  const quantity =
    Number(
      document
        .getElementById(
          "productQuantity"
        )
        .value
    );

  if (!name) {
    alert(
      "نام محصول را وارد کنید."
    );

    return;
  }

  if (!productionDate) {
    alert(
      "تاریخ تولید را انتخاب کنید."
    );

    return;
  }

  if (!expiryDate) {
    alert(
      "تاریخ انقضا را انتخاب کنید."
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
      "تاریخ تولید نامعتبر است."
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
      "تاریخ انقضا نامعتبر است."
    );

    return;
  }

  if (
    compareDates(
      expiryDate,
      productionDate
    ) < 0
  ) {
    alert(
      "تاریخ انقضا نمی‌تواند قبل از تاریخ تولید باشد."
    );

    return;
  }

  const product = {
    id:
      oldProduct
        ? oldProduct.id
        : crypto.randomUUID(),

    name,

    type,

    quantity:
      quantity > 0
        ? quantity
        : 1,

    productionDate: {
      year:
        Number(
          productionDate.year
        ),

      month:
        Number(
          productionDate.month
        ),

      day:
        Number(
          productionDate.day
        )
    },

    expiryDate: {
      year:
        Number(
          expiryDate.year
        ),

      month:
        Number(
          expiryDate.month
        ),

      day:
        Number(
          expiryDate.day
        )
    },

    image:
      selectedImage,

    createdAt:
      oldProduct?.createdAt ||
      new Date().toISOString()
  };

  const userId =
    currentSession.user.id;

  const dbProduct =
    toDbProduct(
      product,
      userId
    );

  try {
    if (oldProduct) {
      const {
        id,
        user_id,
        created_at,
        ...updatePayload
      } = dbProduct;

      const {
        error
      } =
        await supabase
          .from("products")
          .update(
            updatePayload
          )
          .eq(
            "id",
            String(
              oldProduct.id
            )
          )
          .eq(
            "user_id",
            userId
          );

      if (error) {
        console.error(
          "Update product error:",
          error
        );

        alert(
          "ذخیره تغییرات با خطا مواجه شد."
        );

        return;
      }

      products =
        products.map(
          (item) =>
            String(item.id) ===
            String(
              oldProduct.id
            )
              ? product
              : item
        );
    } else {
      const {
        error
      } =
        await supabase
          .from("products")
          .insert(
            dbProduct
          );

      if (error) {
        console.error(
          "Insert product error:",
          error
        );

        alert(
          "ذخیره محصول با خطا مواجه شد."
        );

        return;
      }

      products.unshift(
        product
      );
    }

    saveLocalProducts();

    /*
      بعد از ذخیره یا ویرایش محصول،
      اعلان‌های مربوط به تاریخ انقضا
      دوباره تنظیم می‌شوند.
    */

    await scheduleProductNotifications(
      product
    );

    renderProductDetails(
      product.id
    );
  } catch (error) {
    console.error(
      "Save product error:",
      error
    );

    alert(
      "خطایی هنگام ذخیره محصول رخ داد."
    );
  }
}

/* =========================
   DELETE PRODUCT FROM CLOUD
========================= */

async function deleteProduct(
  product
) {
  if (
    !currentSession?.user?.id
  ) {
    alert(
      "جلسه کاربری پیدا نشد."
    );

    return;
  }

  const userId =
    currentSession.user.id;

  try {
    const {
      error
    } =
      await supabase
        .from("products")
        .delete()
        .eq(
          "id",
          String(
            product.id
          )
        )
        .eq(
          "user_id",
          userId
        );

    if (error) {
      console.error(
        "Delete product error:",
        error
      );

      alert(
        "حذف محصول با خطا مواجه شد."
      );

      return;
    }

    /*
      اعلان‌های این محصول
      نیز حذف می‌شوند.
    */

    await cancelProductNotifications(
      product.id
    );

    products =
      products.filter(
        (item) =>
          String(item.id) !==
          String(
            product.id
          )
      );

    saveLocalProducts();

    renderHome();
  } catch (error) {
    console.error(
      "Delete error:",
      error
    );

    alert(
      "خطایی هنگام حذف محصول رخ داد."
    );
  }
}

/* =========================
   DATE SYSTEM
========================= */

function getToday() {
  const today =
    todayJalali();

  return {
    year: today.jy,
    month: today.jm,
    day: today.jd
  };
}

function dateDifferenceText(
  from,
  to
) {
  const result =
    difference(
      from,
      to
    );

  const parts = [];

  if (
    result.years > 0
  ) {
    parts.push(
      `${faNumbers(
        result.years
      )} سال`
    );
  }

  if (
    result.months > 0
  ) {
    parts.push(
      `${faNumbers(
        result.months
      )} ماه`
    );
  }

  if (
    result.days > 0
  ) {
    parts.push(
      `${faNumbers(
        result.days
      )} روز`
    );
  }

  if (
    parts.length === 0
  ) {
    return "امروز";
  }

  return parts.join(
    " و "
  );
}

function getDateStatus(
  expiryDate
) {
  const today =
    getToday();

  const comparison =
    compareDates(
      expiryDate,
      today
    );

  if (
    comparison < 0
  ) {
    const diff =
      dateDifferenceText(
        expiryDate,
        today
      );

    return {
      type: "expired",

      text:
        diff === "امروز"
          ? "امروز آخرین روز مصرف است"
          : `${diff} از انقضا گذشته`
    };
  }

  if (
    comparison === 0
  ) {
    return {
      type: "warning",

      text:
        "امروز آخرین روز مصرف است"
    };
  }

  const diff =
    dateDifferenceText(
      today,
      expiryDate
    );

  const todayDate =
    jalaliDate(
      today.year,
      today.month,
      today.day
    );

  const expiryDateObject =
    jalaliDate(
      expiryDate.year,
      expiryDate.month,
      expiryDate.day
    );

  const daysLeft =
    Math.round(
      (
        expiryDateObject.getTime() -
        todayDate.getTime()
      ) /
        86400000
    );

  return {
    type:
      daysLeft <= 120
        ? "warning"
        : "normal",

    text:
      `${diff} مانده`
  };
}

/* =========================
   HOME
========================= */

function renderHome() {
  window.scrollTo(
    0,
    0
  );

  const today =
    getToday();

  const expiredCount =
    products.filter(
      (product) =>
        getDateStatus(
          product.expiryDate
        ).type ===
        "expired"
    ).length;

  const warningCount =
    products.filter(
      (product) =>
        getDateStatus(
          product.expiryDate
        ).type ===
        "warning"
    ).length;

  const recentProducts =
    [...products]
      .sort(
        (a, b) =>
          new Date(
            b.createdAt || 0
          ) -
          new Date(
            a.createdAt || 0
          )
      )
      .slice(0, 5);

  app.innerHTML = `
    <div class="app">

      <header class="topbar">

        <div>

          <h1>
            مدیریت محصولات
          </h1>

          <p>
            مدیریت تاریخ تولید و انقضا
          </p>

        </div>

        <div class="header-icon">
          📦
        </div>

      </header>

      <main>

        <section class="welcome-card">

          <div>

            <span class="welcome-small">
              امروز
            </span>

            <h2>
              ${formatDate(today)}
            </h2>

            <p>
              محصولاتت را همیشه تحت کنترل داشته باش.
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
              ${faNumbers(
                products.length
              )}
            </strong>

          </div>

          <div class="stat-card">

            <div class="stat-icon warning">
              ⚠️
            </div>

            <span>
              هشدار
            </span>

            <strong>
              ${faNumbers(
                warningCount
              )}
            </strong>

          </div>

          <div class="stat-card">

            <div class="stat-icon expired">
              ❌
            </div>

            <span>
              منقضی
            </span>

            <strong>
              ${faNumbers(
                expiredCount
              )}
            </strong>

          </div>

        </section>

        <section class="actions">

          <button
            class="main-button"
            id="newProductButton"
          >

            <span>
              ＋
            </span>

            <div>

              <strong>
                ثبت محصول جدید
              </strong>

              <small>
                افزودن محصول و تاریخ انقضا
              </small>

            </div>

          </button>

        </section>

        <section class="products-section">

          <div class="section-title">

            <h2>
              محصولات اخیر
            </h2>

            <span>
              ${faNumbers(
                recentProducts.length
              )}
              محصول
            </span>

          </div>

          ${
            recentProducts.length ===
            0
              ? `
                <div class="empty-state">

                  <div>
                    📦
                  </div>

                  <strong>
                    هنوز محصولی ثبت نشده
                  </strong>

                  <p>
                    اولین محصول خودت را ثبت کن.
                  </p>

                </div>
              `
              : `
                <div class="products-list">

                  ${recentProducts
                    .map(
                      createProductCard
                    )
                    .join("")}

                </div>
              `
          }

        </section>

      </main>

      ${renderBottomNavigation(
        "home"
      )}

    </div>
  `;

  document
    .getElementById(
      "newProductButton"
    )
    .addEventListener(
      "click",
      () =>
        renderForm()
    );

  bindProductCards();

  bindNavigation();
}

/* =========================
   PRODUCT CARD
========================= */

function createProductCard(
  product
) {
  const status =
    getDateStatus(
      product.expiryDate
    );

  let badge =
    "سالم";

  if (
    status.type ===
    "warning"
  ) {
    badge =
      "هشدار";
  }

  if (
    status.type ===
    "expired"
  ) {
    badge =
      "منقضی";
  }

  return `
    <div
      class="product-card"
      data-id="${escapeAttribute(
        product.id
      )}"
    >

      <div class="product-image">

        ${
          product.image
            ? `
              <img
                src="${escapeAttribute(
                  product.image
                )}"
                alt=""
              >
            `
            : `
              <span>
                📦
              </span>
            `
        }

      </div>

      <div class="product-card-content">

        <div class="product-card-header">

          <div>

            <h3>
              ${escapeHtml(
                product.name
              )}
            </h3>

            <span>
              ${escapeHtml(
                product.type ||
                  "محصول"
              )}
            </span>

          </div>

          <span
            class="status-badge ${status.type}"
          >
            ${badge}
          </span>

        </div>

        <div class="product-card-info">

          <span>
            📅
            ${formatDate(
              product.expiryDate
            )}
          </span>

          <span>
            📦
            ${faNumbers(
              product.quantity
            )}
          </span>

        </div>

        <div
          class="product-remaining ${status.type}"
        >
          ${status.text}
        </div>

      </div>

    </div>
  `;
}

function bindProductCards() {
  document
    .querySelectorAll(
      ".product-card"
    )
    .forEach(
      (card) => {
        card.addEventListener(
          "click",
          () => {
            renderProductDetails(
              card.dataset.id
            );
          }
        );
      }
    );
}

/* =========================
   FORM
========================= */

function renderForm(
  editId = null
) {
  window.scrollTo(
    0,
    0
  );

  const product =
    editId
      ? products.find(
          (item) =>
            String(item.id) ===
            String(editId)
        )
      : null;

  productionDate =
    product
      ? {
          ...product.productionDate
        }
      : null;

  expiryDate =
    product
      ? {
          ...product.expiryDate
        }
      : null;

  selectedImage =
    product?.image || "";

  app.innerHTML = `
    <div class="app">

      <header class="topbar">

        <button
          class="back-button"
          id="backButton"
        >
          ←
        </button>

        <div class="page-title">

          <h1>
            ${
              product
                ? "ویرایش محصول"
                : "ثبت محصول"
            }
          </h1>

          <p>
            اطلاعات محصول را وارد کنید
          </p>

        </div>

        <div class="header-icon">
          📦
        </div>

      </header>

      <main>

        <form
          class="product-form"
          id="productForm"
        >

          <section class="form-section">

            <h3>
              اطلاعات محصول
            </h3>

            <label for="productName">
              نام محصول
            </label>

            <input
              id="productName"
              type="text"
              placeholder="مثلاً شیر"
              value="${
                product
                  ? escapeAttribute(
                      product.name
                    )
                  : ""
              }"
              required
            >

            <label for="productType">
              نوع محصول
            </label>

            <input
              id="productType"
              type="text"
              placeholder="مثلاً لبنیات"
              value="${
                product
                  ? escapeAttribute(
                      product.type ||
                        ""
                    )
                  : ""
              }"
            >

            <label for="productQuantity">
              تعداد
            </label>

            <input
              id="productQuantity"
              type="number"
              min="1"
              value="${
                product
                  ? product.quantity
                  : 1
              }"
              required
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
              type="button"
              class="date-picker-button"
              id="productionButton"
            >

              <span>
                📅
              </span>

              <span id="productionText">
                ${
                  productionDate
                    ? formatDate(
                        productionDate
                      )
                    : "انتخاب تاریخ تولید"
                }
              </span>

            </button>

            <label>
              تاریخ انقضا
            </label>

            <button
              type="button"
              class="date-picker-button"
              id="expiryButton"
            >

              <span>
                📅
              </span>

              <span id="expiryText">
                ${
                  expiryDate
                    ? formatDate(
                        expiryDate
                      )
                    : "انتخاب تاریخ انقضا"
                }
              </span>

            </button>

            <div
              id="dateDifference"
              class="date-difference"
            ></div>

          </section>

          <section class="form-section">

            <h3>
              تصویر محصول
            </h3>

            <label
              class="photo-button"
              for="imageInput"
            >

              <span>
                📷
              </span>

              <div>

                <strong>
                  انتخاب تصویر
                </strong>

                <small>
                  اختیاری
                </small>

              </div>

              <input
                id="imageInput"
                type="file"
                accept="image/*"
              >

            </label>

            <div id="imagePreview">

              ${
                selectedImage
                  ? `
                    <img
                      class="preview-image"
                      src="${escapeAttribute(
                        selectedImage
                      )}"
                      alt=""
                    >
                  `
                  : ""
              }

            </div>

          </section>

          <button
            class="save-button"
            type="submit"
          >
            ${
              product
                ? "ذخیره تغییرات"
                : "ثبت محصول"
            }
          </button>

        </form>

      </main>

    </div>
  `;

  document
    .getElementById(
      "backButton"
    )
    .addEventListener(
      "click",
      renderHome
    );

  document
    .getElementById(
      "productionButton"
    )
    .addEventListener(
      "click",
      () =>
        openCalendar(
          "production"
        )
    );

  document
    .getElementById(
      "expiryButton"
    )
    .addEventListener(
      "click",
      () =>
        openCalendar(
          "expiry"
        )
    );

  document
    .getElementById(
      "imageInput"
    )
    .addEventListener(
      "change",
      handleImage
    );

  document
    .getElementById(
      "productForm"
    )
    .addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const button =
          event.submitter;

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "در حال ذخیره...";
        }

        await saveProduct(
          product
        );

        if (button) {
          button.disabled =
            false;
        }
      }
    );

  updateFormDates();
}

/* =========================
   FORM DATE DISPLAY
========================= */

function updateFormDates() {
  const productionText =
    document.getElementById(
      "productionText"
    );

  const expiryText =
    document.getElementById(
      "expiryText"
    );

  if (productionText) {
    productionText.textContent =
      productionDate
        ? formatDate(
            productionDate
          )
        : "انتخاب تاریخ تولید";
  }

  if (expiryText) {
    expiryText.textContent =
      expiryDate
        ? formatDate(
            expiryDate
          )
        : "انتخاب تاریخ انقضا";
  }

  const differenceBox =
    document.getElementById(
      "dateDifference"
    );

  if (!differenceBox) {
    return;
  }

  if (!expiryDate) {
    differenceBox.textContent =
      "";

    differenceBox.className =
      "date-difference";

    return;
  }

  const status =
    getDateStatus(
      expiryDate
    );

  differenceBox.textContent =
    status.text;

  differenceBox.className =
    `date-difference ${status.type}`;
}

/* =========================
   IMAGE
========================= */

function handleImage(
  event
) {
  const file =
    event.target.files?.[0];

  if (!file) {
    return;
  }

  const reader =
    new FileReader();

  reader.onload = () => {
    selectedImage =
      reader.result;

    const preview =
      document.getElementById(
        "imagePreview"
      );

    if (!preview) {
      return;
    }

    preview.innerHTML = `
      <img
        class="preview-image"
        src="${escapeAttribute(
          selectedImage
        )}"
        alt=""
      >
    `;
  };

  reader.readAsDataURL(
    file
  );
}

/* =========================
   CALENDAR
========================= */

function openCalendar(
  type
) {
  calendarType =
    type;

  const current =
    type === "production"
      ? productionDate
      : expiryDate;

  const today =
    getToday();

  const date =
    current
      ? {
          ...current
        }
      : {
          ...today
        };

  renderCalendar(
    date.year,
    date.month,
    date.day
  );
}

function renderCalendar(
  year,
  month,
  selectedDay
) {
  const old =
    document.getElementById(
      "calendarOverlay"
    );

  if (old) {
    old.remove();
  }

  const overlay =
    document.createElement(
      "div"
    );

  overlay.className =
    "calendar-overlay";

  overlay.id =
    "calendarOverlay";

  overlay.innerHTML = `
    <div class="calendar">

      <div class="calendar-header">

        <button
          type="button"
          id="prevMonth"
        >
          ‹
        </button>

        <strong
          id="calendarTitle"
        >
          ${faNumbers(year)}
          /
          ${faNumbers(month)}
        </strong>

        <button
          type="button"
          id="nextMonth"
        >
          ›
        </button>

      </div>

      <div class="weekdays">

        <span>ش</span>
        <span>ی</span>
        <span>د</span>
        <span>س</span>
        <span>چ</span>
        <span>پ</span>
        <span>ج</span>

      </div>

      <div
        class="calendar-days"
        id="calendarDays"
      ></div>

      <button
        type="button"
        class="close-calendar"
        id="closeCalendar"
      >
        بستن
      </button>

    </div>
  `;

  document.body.appendChild(
    overlay
  );

  drawCalendarDays(
    year,
    month,
    selectedDay
  );

  document
    .getElementById(
      "prevMonth"
    )
    .addEventListener(
      "click",
      () => {
        month--;

        if (
          month < 1
        ) {
          month = 12;
          year--;
        }

        updateCalendarTitle(
          year,
          month
        );

        drawCalendarDays(
          year,
          month,
          selectedDay
        );
      }
    );

  document
    .getElementById(
      "nextMonth"
    )
    .addEventListener(
      "click",
      () => {
        month++;

        if (
          month > 12
        ) {
          month = 1;
          year++;
        }

        updateCalendarTitle(
          year,
          month
        );

        drawCalendarDays(
          year,
          month,
          selectedDay
        );
      }
    );

  document
    .getElementById(
      "closeCalendar"
    )
    .addEventListener(
      "click",
      closeCalendar
    );
}

function updateCalendarTitle(
  year,
  month
) {
  const title =
    document.getElementById(
      "calendarTitle"
    );

  if (title) {
    title.textContent =
      `${faNumbers(
        year
      )} / ${faNumbers(
        month
      )}`;
  }
}

function drawCalendarDays(
  year,
  month,
  selectedDay
) {
  const container =
    document.getElementById(
      "calendarDays"
    );

  if (!container) {
    return;
  }

  container.innerHTML =
    "";

  const firstGregorian =
    jalaliDate(
      year,
      month,
      1
    );

  const jsDay =
    firstGregorian.getDay();

  const firstDay =
    (jsDay + 1) % 7;

  for (
    let i = 0;
    i < firstDay;
    i++
  ) {
    const empty =
      document.createElement(
        "span"
      );

    empty.className =
      "calendar-empty";

    container.appendChild(
      empty
    );
  }

  const days =
    jalaliMonthDays(
      year,
      month
    );

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

    if (
      Number(selectedDay) ===
      day
    ) {
      button.classList.add(
        "selected"
      );
    }

    button.addEventListener(
      "click",
      () => {
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

        updateFormDates();

        closeCalendar();
      }
    );

    container.appendChild(
      button
    );
  }
}

function closeCalendar() {
  const overlay =
    document.getElementById(
      "calendarOverlay"
    );

  if (overlay) {
    overlay.remove();
  }
}

/* =========================
   DETAILS
========================= */

function renderProductDetails(
  id
) {
  window.scrollTo(
    0,
    0
  );

  const product =
    products.find(
      (item) =>
        String(item.id) ===
        String(id)
    );

  if (!product) {
    renderHome();

    return;
  }

  const status =
    getDateStatus(
      product.expiryDate
    );

  app.innerHTML = `
    <div class="app">

      <header class="topbar">

        <button
          class="back-button"
          id="backButton"
        >
          ←
        </button>

        <div class="page-title">

          <h1>
            جزئیات محصول
          </h1>

          <p>
            اطلاعات کامل محصول
          </p>

        </div>

        <div class="header-icon">
          📦
        </div>

      </header>

      <main>

        <section class="details-card">

          <div class="details-image">

            ${
              product.image
                ? `
                  <img
                    src="${escapeAttribute(
                      product.image
                    )}"
                    alt=""
                  >
                `
                : `
                  <span>
                    📦
                  </span>
                `
            }

          </div>

          <h2>
            ${escapeHtml(
              product.name
            )}
          </h2>

          <span class="details-type">
            ${escapeHtml(
              product.type ||
                "محصول"
            )}
          </span>

          <div
            class="details-status ${status.type}"
          >
            ${status.text}
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

        </section>

        <div class="details-actions">

          <button
            class="save-button edit-button"
            id="editProduct"
          >
            ✏️ ویرایش محصول
          </button>

          <button
            class="delete-button"
            id="deleteProduct"
          >
            🗑️ حذف محصول
          </button>

        </div>

      </main>

      ${renderBottomNavigation(
        ""
      )}

    </div>
  `;

  document
    .getElementById(
      "backButton"
    )
    .addEventListener(
      "click",
      renderHome
    );

  document
    .getElementById(
      "editProduct"
    )
    .addEventListener(
      "click",
      () =>
        renderForm(
          product.id
        )
    );

  document
    .getElementById(
      "deleteProduct"
    )
    .addEventListener(
      "click",
      async () => {
        if (
          !confirm(
            "آیا از حذف این محصول مطمئن هستید؟"
          )
        ) {
          return;
        }

        const button =
          document.getElementById(
            "deleteProduct"
          );

        if (button) {
          button.disabled =
            true;

          button.textContent =
            "در حال حذف...";
        }

        await deleteProduct(
          product
        );
      }
    );

  bindNavigation();
}

/* =========================
   SETTINGS
========================= */

function renderSettings() {
  window.scrollTo(
    0,
    0
  );

  const email =
    currentSession?.user?.email ||
    "";

  app.innerHTML = `
    <div class="app">

      <header class="topbar">

        <div>

          <h1>
            تنظیمات
          </h1>

          <p>
            مدیریت حساب کاربری
          </p>

        </div>

        <div class="header-icon">
          ⚙️
        </div>

      </header>

      <main>

        <section class="details-card">

          <div class="details-image">

            <span>
              👤
            </span>

          </div>

          <h2>
            حساب کاربری
          </h2>

          <span class="details-type">
            ${escapeHtml(
              email
            )}
          </span>

          <div class="details-status normal">
            اطلاعات محصولات شما به این حساب متصل است.
          </div>

        </section>

        <div class="details-actions">

          <button
            class="delete-button"
            id="logoutButton"
          >
            🚪 خروج از حساب
          </button>

        </div>

      </main>

      ${renderBottomNavigation(
        "settings"
      )}

    </div>
  `;

  document
    .getElementById(
      "logoutButton"
    )
    .addEventListener(
      "click",
      async () => {
        const button =
          document.getElementById(
            "logoutButton"
          );

        button.disabled =
          true;

        button.textContent =
          "در حال خروج...";

        const {
          error
        } =
          await supabase.auth.signOut();

        if (error) {
          console.error(
            "Logout error:",
            error
          );

          alert(
            "خروج از حساب با خطا مواجه شد."
          );

          button.disabled =
            false;

          button.textContent =
            "🚪 خروج از حساب";
        }
      }
    );

  bindNavigation();
}

/* =========================
   NAVIGATION
========================= */

function renderBottomNavigation(
  active
) {
  return `
    <nav class="bottom-nav">

      <button
        class="nav-item ${
          active === "home"
            ? "active"
            : ""
        }"
        data-page="home"
      >
        <span>⌂</span>

        <small>
          خانه
        </small>
      </button>

      <button
        class="nav-item ${
          active === "products"
            ? "active"
            : ""
        }"
        data-page="products"
      >
        <span>📦</span>

        <small>
          محصولات
        </small>
      </button>

      <button
        class="nav-item add-button"
        data-page="add"
      >
        <span>＋</span>
      </button>

      <button
        class="nav-item ${
          active === "alerts"
            ? "active"
            : ""
        }"
        data-page="alerts"
      >
        <span>🔔</span>

        <small>
          هشدارها
        </small>
      </button>

      <button
        class="nav-item ${
          active === "settings"
            ? "active"
            : ""
        }"
        data-page="settings"
      >
        <span>⚙️</span>

        <small>
          تنظیمات
        </small>
      </button>

    </nav>
  `;
}

function bindNavigation() {
  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const page =
              button.dataset
                .page;

            if (
              page === "add"
            ) {
              renderForm();

              return;
            }

            if (
              page === "products"
            ) {
              renderProducts();

              return;
            }

            if (
              page === "alerts"
            ) {
              renderAlerts();

              return;
            }

            if (
              page === "settings"
            ) {
              renderSettings();

              return;
            }

            renderHome();
          }
        );
      }
    );
}

/* =========================
   PRODUCTS PAGE
========================= */

function renderProducts() {
  window.scrollTo(
    0,
    0
  );

  app.innerHTML = `
    <div class="app">

      <header class="topbar">

        <div>

          <h1>
            محصولات من
          </h1>

          <p>
            تمام محصولات ثبت شده
          </p>

        </div>

        <div class="header-icon">
          📦
        </div>

      </header>

      <main>

        ${
          products.length === 0
            ? `
              <div class="empty-state">

                <div>
                  📦
                </div>

                <strong>
                  محصولی وجود ندارد
                </strong>

              </div>
            `
            : `
              <div
                style="
                  margin-bottom: 16px;
                "
              >

                <input
                  id="productSearch"
                  type="search"
                  placeholder="🔎 جستجوی محصول..."
                  autocomplete="off"
                  style="
                    width: 100%;
                    box-sizing: border-box;
                    padding: 14px 16px;
                    border-radius: 14px;
                    border: 1px solid #dfe3ea;
                    background: #ffffff;
                    font-family: inherit;
                    font-size: 15px;
                    outline: none;
                  "
                >

              </div>

              <div
                class="products-list"
                id="productsList"
              >

                ${products
                  .map(
                    createProductCard
                  )
                  .join("")}

              </div>
            `
        }

      </main>

      ${renderBottomNavigation(
        "products"
      )}

    </div>
  `;

  bindProductCards();

  bindNavigation();

  const searchInput =
    document.getElementById(
      "productSearch"
    );

  const productsList =
    document.getElementById(
      "productsList"
    );

  if (
    searchInput &&
    productsList
  ) {
    searchInput.addEventListener(
      "input",
      () => {
        const query =
          searchInput.value
            .trim()
            .toLocaleLowerCase();

        const filtered =
          products.filter(
            (product) => {
              const name =
                String(
                  product.name ||
                    ""
                ).toLocaleLowerCase();

              const type =
                String(
                  product.type ||
                    ""
                ).toLocaleLowerCase();

              return (
                name.includes(
                  query
                ) ||
                type.includes(
                  query
                )
              );
            }
          );

        if (
          filtered.length === 0
        ) {
          productsList.innerHTML = `
            <div class="empty-state">

              <div>
                🔎
              </div>

              <strong>
                محصولی پیدا نشد
              </strong>

              <p>
                نام یا نوع محصول را بررسی کنید.
              </p>

            </div>
          `;

          return;
        }

        productsList.innerHTML =
          filtered
            .map(
              createProductCard
            )
            .join("");

        bindProductCards();
      }
    );
  }
}

/* =========================
   ALERTS
========================= */

function renderAlerts() {
  const alerts =
    products.filter(
      (product) => {
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

  app.innerHTML = `
    <div class="app">

      <header class="topbar">

        <div>

          <h1>
            هشدارها
          </h1>

          <p>
            محصولات نیازمند توجه
          </p>

        </div>

        <div class="header-icon">
          🔔
        </div>

      </header>

      <main>

        ${
          alerts.length ===
          0
            ? `
              <div class="empty-state">

                <div>
                  ✅
                </div>

                <strong>
                  هشداری وجود ندارد
                </strong>

                <p>
                  همه چیز مرتب است.
                </p>

              </div>
            `
            : `
              <div class="products-list">

                ${alerts
                  .map(
                    createProductCard
                  )
                  .join("")}

              </div>
            `
        }

      </main>

      ${renderBottomNavigation(
        "alerts"
      )}

    </div>
  `;

  bindProductCards();

  bindNavigation();
}

/* =========================
   AUTH / START
========================= */

async function handleSession(
  session
) {
  currentSession =
    session;

  if (!session) {
    products = [];

    loadedUserId =
      null;

    renderAuth();

    return;
  }

  const userId =
    session.user.id;

  if (
    loadedUserId ===
    userId
  ) {
    renderHome();

    return;
  }

  loadedUserId =
    userId;

  const loaded =
    await loadProductsFromCloud();

  if (!loaded) {
    products = [];
  } else {
    /*
      بعد از دریافت محصولات از Supabase،
      اعلان‌های همه محصولات روی دستگاه
      تنظیم می‌شوند.
    */

    await scheduleAllProductNotifications();
  }

  renderHome();
}

async function startApplication() {
  try {
    const {
      data,
      error
    } =
      await supabase.auth.getSession();

    if (error) {
      console.error(
        "Session error:",
        error
      );

      renderAuth();

      return;
    }

    await handleSession(
      data.session
    );
  } catch (error) {
    console.error(
      "Application start error:",
      error
    );

    renderAuth();
  }
}

/*
  عمداً عملیات سنگین Supabase را مستقیماً
  داخل callback انجام نمی‌دهیم.
*/

supabase.auth.onAuthStateChange(
  (
    event,
    session
  ) => {
    setTimeout(
      () => {
        handleSession(
          session
        );
      },
      0
    );
  }
);

startApplication();

/*
  در نسخه Android درخواست اجازه
  اعلان‌ها انجام می‌شود.
*/

setupNotifications();