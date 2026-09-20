import { supabase } from "./supabase.js";

let mode = "login";

export function renderAuth() {
  const app = document.getElementById("app");

  mode = "login";

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">

        <div class="auth-logo">
          📦
        </div>

        <h1 class="auth-title">
          مدیریت محصولات
        </h1>

        <p class="auth-subtitle" id="authSubtitle">
          وارد حساب خود شوید
        </p>

        <form id="authForm" class="auth-form">

          <label class="auth-label">
            ایمیل
          </label>

          <input
            id="authEmail"
            class="auth-input"
            type="email"
            placeholder="example@gmail.com"
            autocomplete="email"
            required
          />

          <label class="auth-label">
            رمز عبور
          </label>

          <div class="password-wrapper">
            <input
              id="authPassword"
              class="auth-input"
              type="password"
              placeholder="رمز عبور"
              autocomplete="current-password"
              required
            />

            <button
              type="button"
              id="togglePassword"
              class="password-toggle"
            >
              👁
            </button>
          </div>

          <div id="confirmPasswordBox" style="display:none;">

            <label class="auth-label">
              تکرار رمز عبور
            </label>

            <input
              id="authConfirmPassword"
              class="auth-input"
              type="password"
              placeholder="تکرار رمز عبور"
              autocomplete="new-password"
            />

          </div>

          <div id="authMessage" class="auth-message"></div>

          <button
            type="submit"
            id="authSubmit"
            class="auth-submit"
          >
            ورود
          </button>

        </form>

        <div class="auth-switch">

          <span id="authSwitchText">
            حساب ندارید؟
          </span>

          <button
            type="button"
            id="authSwitchButton"
            class="auth-switch-button"
          >
            ساخت حساب
          </button>

        </div>

      </div>
    </div>
  `;

  bindAuthEvents();
}

function bindAuthEvents() {
  const form = document.getElementById("authForm");

  const emailInput =
    document.getElementById("authEmail");

  const passwordInput =
    document.getElementById("authPassword");

  const confirmInput =
    document.getElementById("authConfirmPassword");

  const submitButton =
    document.getElementById("authSubmit");

  const switchButton =
    document.getElementById("authSwitchButton");

  const togglePassword =
    document.getElementById("togglePassword");

  switchButton.addEventListener("click", () => {
    mode = mode === "login"
      ? "register"
      : "login";

    updateAuthMode();

    emailInput.focus();
  });

  togglePassword.addEventListener("click", () => {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      togglePassword.textContent = "🙈";
    } else {
      passwordInput.type = "password";
      togglePassword.textContent = "👁";
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    clearAuthMessage();

    const email =
      emailInput.value.trim().toLowerCase();

    const password =
      passwordInput.value;

    if (!email) {
      showAuthMessage(
        "ایمیل را وارد کنید.",
        true
      );
      return;
    }

    if (!password) {
      showAuthMessage(
        "رمز عبور را وارد کنید.",
        true
      );
      return;
    }

    if (password.length < 6) {
      showAuthMessage(
        "رمز عبور باید حداقل ۶ کاراکتر باشد.",
        true
      );
      return;
    }

    if (mode === "register") {
      const confirmPassword =
        confirmInput.value;

      if (password !== confirmPassword) {
        showAuthMessage(
          "رمز عبور و تکرار آن یکسان نیست.",
          true
        );
        return;
      }
    }

    submitButton.disabled = true;

    submitButton.textContent =
      mode === "login"
        ? "در حال ورود..."
        : "در حال ساخت حساب...";

    try {

      if (mode === "register") {
        await registerUser(
          email,
          password
        );
      } else {
        await loginUser(
          email,
          password
        );
      }

    } catch (error) {

      console.error(error);

      showAuthMessage(
        error.message ||
        "خطایی رخ داد.",
        true
      );

      submitButton.disabled = false;

      submitButton.textContent =
        mode === "login"
          ? "ورود"
          : "ساخت حساب";
    }
  });
}

function updateAuthMode() {

  const subtitle =
    document.getElementById("authSubtitle");

  const confirmBox =
    document.getElementById(
      "confirmPasswordBox"
    );

  const submitButton =
    document.getElementById("authSubmit");

  const switchText =
    document.getElementById(
      "authSwitchText"
    );

  const switchButton =
    document.getElementById(
      "authSwitchButton"
    );

  if (mode === "login") {

    subtitle.textContent =
      "وارد حساب خود شوید";

    confirmBox.style.display =
      "none";

    submitButton.textContent =
      "ورود";

    switchText.textContent =
      "حساب ندارید؟";

    switchButton.textContent =
      "ساخت حساب";

  } else {

    subtitle.textContent =
      "یک حساب جدید بسازید";

    confirmBox.style.display =
      "block";

    submitButton.textContent =
      "ساخت حساب";

    switchText.textContent =
      "قبلاً حساب دارید؟";

    switchButton.textContent =
      "ورود";
  }

  clearAuthMessage();
}


/* =========================
   REGISTER
========================= */

async function registerUser(
  email,
  password
) {

  const {
    data,
    error
  } = await supabase.functions.invoke(
    "register-user",
    {
      body: {
        email,
        password
      }
    }
  );

  if (error) {
    console.error(
      "Register function error:",
      error
    );

    throw new Error(
      error.message ||
      "ساخت حساب انجام نشد."
    );
  }

  if (!data?.success) {
    throw new Error(
      data?.error ||
      "ساخت حساب انجام نشد."
    );
  }

  /*
   * کاربر توسط Edge Function ساخته شده
   * و email_confirm=true است.
   *
   * بنابراین حالا مستقیماً با همان
   * ایمیل و رمز وارد می‌شویم.
   */

  const {
    data: loginData,
    error: loginError
  } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (loginError) {
    throw new Error(
      "حساب ساخته شد، اما ورود خودکار انجام نشد."
    );
  }

  if (!loginData?.session) {
    throw new Error(
      "حساب ساخته شد، اما ورود انجام نشد."
    );
  }

  showAuthMessage(
    "حساب ساخته شد ✓ در حال ورود...",
    false
  );
}


/* =========================
   LOGIN
========================= */

async function loginUser(
  email,
  password
) {

  const {
    data,
    error
  } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {

    const message =
      error.message?.toLowerCase() || "";

    if (
      message.includes(
        "invalid login credentials"
      )
    ) {
      throw new Error(
        "ایمیل یا رمز عبور اشتباه است."
      );
    }

    throw new Error(
      error.message ||
      "ورود انجام نشد."
    );
  }

  if (!data?.session) {
    throw new Error(
      "ورود انجام نشد."
    );
  }

  showAuthMessage(
    "ورود موفق بود ✓",
    false
  );
}


/* =========================
   MESSAGE
========================= */

function showAuthMessage(
  message,
  isError
) {

  const element =
    document.getElementById(
      "authMessage"
    );

  if (!element) return;

  element.textContent =
    message;

  element.className =
    isError
      ? "auth-message auth-error"
      : "auth-message auth-success";
}

function clearAuthMessage() {

  const element =
    document.getElementById(
      "authMessage"
    );

  if (!element) return;

  element.textContent = "";

  element.className =
    "auth-message";
}