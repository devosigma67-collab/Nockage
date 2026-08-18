// ============================================================
// NOCKAGE 1.2 — PRO MAX APP
// FULL APP
// VIDEO + SHORTS SEPARATION
// PREMIUM SHORTS UI SUPPORT
// AUTH
// PROFILES
// LIKES
// COMMENTS
// SUBSCRIPTIONS
// REPOSTS
// SEARCH
// STUDIO
// UPLOAD
// DELETE
// SETTINGS
// SUPABASE
// ============================================================

const NOCKAGE_CONFIG = {
  SUPABASE_URL: "https://ljveziwuxbiajxtguppy.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_pF6Fs7rvL1C-ib1mg_MRxg_qWuX8Int"
};

// ============================================================
// SUPABASE
// ============================================================

const hasSupabase =
  typeof window.supabase !== "undefined";

const ready =
  hasSupabase &&
  !!NOCKAGE_CONFIG.SUPABASE_URL &&
  !!NOCKAGE_CONFIG.SUPABASE_ANON_KEY &&
  !NOCKAGE_CONFIG.SUPABASE_URL.startsWith("YOUR_") &&
  !NOCKAGE_CONFIG.SUPABASE_ANON_KEY.startsWith("YOUR_");

const sb = ready
  ? window.supabase.createClient(
      NOCKAGE_CONFIG.SUPABASE_URL,
      NOCKAGE_CONFIG.SUPABASE_ANON_KEY
    )
  : null;

// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;
let profile = null;

let uploadMode = "video";

let booted = false;
let routeRunning = false;

let deleteTarget = null;
let deleteBusy = false;

let shortsObserver = null;
let shortsViewTimers = new Map();


// ============================================================
// DOM HELPER
// ============================================================

const $ = id =>
  document.getElementById(id);


// ============================================================
// HELPERS
// ============================================================

function toast(message) {
  const el = $("toast");

  if (!el) {
    return;
  }

  el.textContent =
    String(message || "");

  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer =
    setTimeout(() => {
      el.classList.remove("show");
    }, 2600);
}


function fmt(value) {
  const n =
    Number(value || 0);

  if (n >= 1e9) {
    return (
      (n / 1e9)
        .toFixed(1)
        .replace(/\.0$/, "") +
      "B"
    );
  }

  if (n >= 1e6) {
    return (
      (n / 1e6)
        .toFixed(1)
        .replace(/\.0$/, "") +
      "M"
    );
  }

  if (n >= 1e3) {
    return (
      (n / 1e3)
        .toFixed(1)
        .replace(/\.0$/, "") +
      "K"
    );
  }

  return String(n);
}


function esc(value) {
  return String(
    value ?? ""
  ).replace(
    /[&<>"']/g,
    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]
  );
}


function page(id) {
  document
    .querySelectorAll(".page")
    .forEach(section => {
      section.classList.remove(
        "active"
      );
    });

  const target =
    $(id);

  if (target) {
    target.classList.add(
      "active"
    );
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function requireSupabase() {
  if (
    !ready ||
    !sb
  ) {
    toast(
      "Nockage is connecting to Supabase..."
    );

    return false;
  }

  return true;
}


function getHashParts() {
  const raw =
    location.hash.replace(
      /^#/,
      ""
    );

  if (!raw) {
    return ["home"];
  }

  return raw
    .split("/")
    .map(x =>
      decodeURIComponent(x)
    );
}


function setHash(route) {
  if (
    location.hash ===
    `#${route}`
  ) {
    routeApp();

    return;
  }

  location.hash =
    `#${route}`;
}


function getErrorMessage(
  error,
  fallback =
    "Something went wrong."
) {
  return (
    error?.message ||
    error?.error_description ||
    fallback
  );
}


// ============================================================
// URL HELPERS
// ============================================================

function isEmbedUrl(url) {
  const value =
    String(url || "")
      .toLowerCase();

  return (
    value.includes("/embed/") ||
    value.includes("fembed.co/embed/") ||
    value.includes("embed.vdohide") ||
    value.includes("/player/")
  );
}


function getWatchUrl(videoId) {
  return (
    location.origin +
    location.pathname +
    `#watch/${encodeURIComponent(
      videoId
    )}`
  );
}


// ============================================================
// SHARE
// ============================================================

async function shareVideo(video) {
  if (!video) {
    return;
  }

  const url =
    getWatchUrl(video.id);

  try {
    if (
      navigator.share
    ) {
      await navigator.share({
        title:
          video.title ||
          "Nockage",
        text:
          `Watch ${video.title || "this video"} on Nockage`,
        url
      });

      return;
    }
  } catch (error) {
    if (
      error?.name ===
      "AbortError"
    ) {
      return;
    }
  }

  try {
    await navigator.clipboard.writeText(
      url
    );

    toast(
      "Link copied!"
    );

  } catch {
    toast(url);
  }
}


// ============================================================
// MEDIA RENDERING
// ============================================================

function mediaHtml(
  video,
  className =
    "watchVideo"
) {
  const url =
    esc(video.video_url);

  if (!url) {
    return `
      <div class="empty">
        Video URL is missing.
      </div>
    `;
  }

  if (
    isEmbedUrl(
      video.video_url
    )
  ) {
    return `
      <iframe
        class="${esc(className)}"
        src="${url}"
        title="${esc(
          video.title ||
          "Nockage video"
        )}"
        allow="autoplay; fullscreen; picture-in-picture"
        allowfullscreen
        loading="lazy"
      ></iframe>
    `;
  }

  return `
    <video
      class="${esc(className)}"
      controls
      playsinline
      preload="metadata"
      src="${url}"
    ></video>
  `;
}


// ============================================================
// SHORTS DYNAMIC STYLES
// ============================================================

function ensureShortsStyles() {
  if (
    $("nockageShortsEnhancements")
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "nockageShortsEnhancements";

  style.textContent = `
    .nockageShortRail {
      position:absolute;
      right:12px;
      bottom:115px;
      z-index:8;

      display:flex;
      flex-direction:column;
      align-items:center;

      gap:5px;
    }

    .nockageShortRail button {
      width:48px;
      height:48px;

      border-radius:50%;
      border:1px solid rgba(255,255,255,.14);

      background:rgba(0,0,0,.42);
      backdrop-filter:blur(14px);
      -webkit-backdrop-filter:blur(14px);

      color:#fff;

      display:grid;
      place-items:center;

      font-size:19px;

      cursor:pointer;

      transition:
        transform .18s ease,
        background .18s ease,
        border-color .18s ease;
    }

    .nockageShortRail button:hover {
      transform:scale(1.08);
      background:rgba(255,255,255,.12);
      border-color:rgba(255,255,255,.22);
    }

    .nockageShortRail button.liked {
      color:#fff;
      background:rgba(255,47,114,.3);
      border-color:rgba(255,47,114,.75);
    }

    .nockageShortRail small {
      min-height:15px;
      color:rgba(255,255,255,.85);
      font-size:11px;
      text-shadow:0 2px 8px rgba(0,0,0,.8);
    }

    .nockageShortCreator {
      display:flex;
      align-items:center;
      gap:9px;
      margin-bottom:10px;
    }

    .nockageShortAvatar {
      width:40px;
      height:40px;
      border-radius:50%;
      object-fit:cover;

      background:#171922;

      border:2px solid rgba(255,255,255,.18);

      flex-shrink:0;
    }

    .nockageShortCreatorName {
      font-weight:850;
      color:#fff;
      text-shadow:0 2px 8px rgba(0,0,0,.8);
    }

    .nockageShortFollow {
      margin-left:3px;

      padding:6px 10px;

      border-radius:9px;

      border:1px solid rgba(255,255,255,.18);

      color:#fff;

      background:rgba(0,0,0,.40);

      backdrop-filter:blur(12px);

      cursor:pointer;
    }

    .nockageShortFollow.following {
      background:rgba(255,255,255,.13);
    }

    .nockageShortDescription {
      max-width:82%;

      color:rgba(255,255,255,.86);

      font-size:13px;

      margin-top:5px;

      display:-webkit-box;
      -webkit-line-clamp:3;
      -webkit-box-orient:vertical;

      overflow:hidden;

      text-shadow:
        0 2px 9px rgba(0,0,0,.85);
    }

    .nockageShortMute {
      position:absolute;

      top:18px;
      right:18px;

      z-index:9;

      width:42px;
      height:42px;

      border-radius:50%;

      border:1px solid rgba(255,255,255,.15);

      background:rgba(0,0,0,.42);

      color:#fff;

      backdrop-filter:blur(12px);

      cursor:pointer;

      display:grid;
      place-items:center;
    }

    .nockageShortPlaying::after {
      content:"";

      position:absolute;
      inset:0;

      pointer-events:none;

      z-index:4;

      border:
        1px solid
        rgba(255,255,255,.08);
    }

    @media(max-width:520px) {
      .nockageShortRail {
        right:9px;
        bottom:118px;
      }

      .nockageShortRail button {
        width:46px;
        height:46px;
      }

      .nockageShortOverlay {
        padding-right:80px !important;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}


// ============================================================
// DELETE MODAL
// ============================================================

function setupDeleteModal() {
  if (
    $("nockageDeleteModal")
  ) {
    return;
  }

  const style =
    document.createElement(
      "style"
    );

  style.id =
    "nockageDeleteStyles";

  style.textContent = `
    #nockageDeleteModal {
      position:fixed;
      inset:0;

      z-index:99999;

      display:flex;
      align-items:center;
      justify-content:center;

      padding:20px;

      background:rgba(0,0,0,.72);

      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
    }

    #nockageDeleteModal.hidden {
      display:none;
    }

    .nockageDeleteBox {
      width:min(460px,100%);

      padding:24px;

      border:
        1px solid
        rgba(255,255,255,.12);

      border-radius:18px;

      background:#111;

      color:#fff;

      box-shadow:
        0 25px 80px
        rgba(0,0,0,.45);
    }

    .nockageDeleteBox h2 {
      margin:0 0 10px;
      font-size:22px;
    }

    .nockageDeleteBox p {
      margin:0 0 20px;

      color:rgba(255,255,255,.72);

      line-height:1.5;
    }

    .nockageDeleteButtons {
      display:flex;
      gap:10px;
      justify-content:flex-end;
    }

    .nockageDeleteButtons button {
      min-height:42px;

      padding:
        0 18px;

      border:0;
      border-radius:10px;

      cursor:pointer;

      font-weight:700;
    }

    #nockageCancelDelete {
      background:rgba(255,255,255,.1);
      color:#fff;
    }

    #nockageConfirmDelete {
      background:#e53935;
      color:#fff;
    }

    #nockageConfirmDelete:disabled,
    #nockageCancelDelete:disabled {
      opacity:.55;
      cursor:not-allowed;
    }

    .nockageDeleteButton {
      margin-top:10px;

      background:#e53935;
      color:#fff;

      border:0;
      border-radius:9px;

      padding:
        8px 12px;

      cursor:pointer;

      font-weight:700;
    }

    .nockageDeleteButton:hover {
      filter:brightness(1.08);
    }

    .nockageDeleteButton:disabled {
      opacity:.55;
      cursor:not-allowed;
    }
  `;

  document.head.appendChild(
    style
  );

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "nockageDeleteModal";

  modal.className =
    "hidden";

  modal.innerHTML = `
    <div
      class="nockageDeleteBox"
      role="dialog"
      aria-modal="true"
    >
      <h2 id="nockageDeleteTitle">
        Delete video?
      </h2>

      <p id="nockageDeleteText">
        This action cannot be undone.
      </p>

      <div
        class="nockageDeleteButtons"
      >

        <button
          id="nockageCancelDelete"
          type="button"
        >
          Cancel
        </button>

        <button
          id="nockageConfirmDelete"
          type="button"
        >
          Delete
        </button>

      </div>
    </div>
  `;

  document.body.appendChild(
    modal
  );

  $("nockageCancelDelete")?.addEventListener(
    "click",
    closeDeleteModal
  );

  $("nockageConfirmDelete")?.addEventListener(
    "click",
    confirmDelete
  );

  modal.addEventListener(
    "click",
    event => {
      if (
        event.target === modal &&
        !deleteBusy
      ) {
        closeDeleteModal();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Escape" &&
        !deleteBusy &&
        !modal.classList.contains(
          "hidden"
        )
      ) {
        closeDeleteModal();
      }
    }
  );
}


function openDeleteModal(video) {
  if (!video) {
    return;
  }

  setupDeleteModal();

  deleteTarget =
    video;

  const title =
    $("nockageDeleteTitle");

  const text =
    $("nockageDeleteText");

  const modal =
    $("nockageDeleteModal");

  const confirm =
    $("nockageConfirmDelete");

  const cancel =
    $("nockageCancelDelete");

  if (title) {
    title.textContent =
      video.is_short
        ? "Delete Short?"
        : "Delete video?";
  }

  if (text) {
    text.innerHTML = `
      Are you sure you want to permanently delete
      <strong>
        ${esc(
          video.title ||
          "this item"
        )}
      </strong>?

      <br><br>

      The
      ${
        video.is_short
          ? "Short"
          : "video"
      }
      and its thumbnail will be removed.
      This cannot be undone.
    `;
  }

  if (confirm) {
    confirm.disabled =
      false;

    confirm.textContent =
      "Delete";
  }

  if (cancel) {
    cancel.disabled =
      false;
  }

  modal?.classList.remove(
    "hidden"
  );
}


function closeDeleteModal() {
  if (deleteBusy) {
    return;
  }

  $("nockageDeleteModal")
    ?.classList.add(
      "hidden"
    );

  deleteTarget =
    null;
}


async function confirmDelete() {
  if (deleteBusy) {
    return;
  }

  if (!deleteTarget) {
    closeDeleteModal();
    return;
  }

  if (!currentUser) {
    closeDeleteModal();

    return openAuth(
      false
    );
  }

  if (!requireSupabase()) {
    return;
  }

  const video =
    deleteTarget;

  if (
    video.user_id !==
    currentUser.id
  ) {
    closeDeleteModal();

    return toast(
      "You can only delete your own videos."
    );
  }

  deleteBusy =
    true;

  const confirm =
    $("nockageConfirmDelete");

  const cancel =
    $("nockageCancelDelete");

  if (confirm) {
    confirm.disabled =
      true;

    confirm.textContent =
      "Deleting...";
  }

  if (cancel) {
    cancel.disabled =
      true;
  }

  try {

    // ----------------------------------------------------------
    // 1. DATABASE RECORD
    // ----------------------------------------------------------

    const {
      error:
        videoDeleteError
    } =
      await sb
        .from("videos")
        .delete()
        .eq(
          "id",
          video.id
        )
        .eq(
          "user_id",
          currentUser.id
        );

    if (
      videoDeleteError
    ) {
      throw videoDeleteError;
    }


    // ----------------------------------------------------------
    // 2. VIDEO STORAGE
    // ----------------------------------------------------------

    if (
      video.storage_path
    ) {
      const {
        error:
          storageError
      } =
        await sb.storage
          .from("Videos")
          .remove([
            video.storage_path
          ]);

      if (
        storageError
      ) {
        console.warn(
          "Video storage cleanup failed:",
          storageError
        );
      }
    }


    // ----------------------------------------------------------
    // 3. THUMBNAIL
    // ----------------------------------------------------------

    if (
      video.thumbnail_path
    ) {
      const {
        error:
          thumbnailError
      } =
        await sb.storage
          .from("Videos")
          .remove([
            video.thumbnail_path
          ]);

      if (
        thumbnailError
      ) {
        console.warn(
          "Thumbnail cleanup failed:",
          thumbnailError
        );
      }
    }

    closeDeleteModal();

    toast(
      video.is_short
        ? "Short deleted successfully."
        : "Video deleted successfully."
    );

    await loadStudio();

  } catch (error) {

    console.error(
      "Nockage delete error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not delete the item."
      )
    );

  } finally {

    deleteBusy =
      false;

    if (confirm) {
      confirm.disabled =
        false;

      confirm.textContent =
        "Delete";
    }

    if (cancel) {
      cancel.disabled =
        false;
    }
  }
}


// ============================================================
// ACCOUNT UI
// ============================================================

function renderAccount() {
  const area =
    $("accountArea");

  if (!area) {
    return;
  }

  if (currentUser) {

    const username =
      profile?.username ||
      profile?.display_name ||
      "Account";

    area.innerHTML = `
      <a
        class="ghost"
        href="#studio"
      >
        Studio
      </a>

      <a
        class="ghost"
        href="#profile/${encodeURIComponent(
          currentUser.id
        )}"
      >
        ${esc(username)}
      </a>

      <button
        class="primary"
        id="quickLogout"
        type="button"
      >
        Log out
      </button>
    `;

    $("quickLogout")?.addEventListener(
      "click",
      logout
    );

  } else {

    area.innerHTML = `
      <button
        class="ghost"
        id="loginBtn"
        type="button"
      >
        Log in
      </button>

      <button
        class="primary"
        id="signupBtn"
        type="button"
      >
        Create account
      </button>
    `;

    $("loginBtn")?.addEventListener(
      "click",
      () =>
        openAuth(false)
    );

    $("signupBtn")?.addEventListener(
      "click",
      () =>
        openAuth(true)
    );
  }
}


// ============================================================
// PROFILE
// ============================================================

async function loadProfile(userId) {
  if (
    !ready ||
    !userId
  ) {
    return null;
  }

  try {

    const {
      data,
      error
    } =
      await sb
        .from("profiles")
        .select("*")
        .eq(
          "id",
          userId
        )
        .maybeSingle();

    if (error) {
      console.error(
        "Nockage profile error:",
        error
      );

      return null;
    }

    return data || null;

  } catch (error) {

    console.error(
      error
    );

    return null;
  }
}


async function setUser(user) {
  currentUser =
    user || null;

  profile =
    null;

  if (currentUser) {
    profile =
      await loadProfile(
        currentUser.id
      );
  }

  renderAccount();
}


// ============================================================
// AUTH
// ============================================================

function openAuth(
  signup = false
) {
  const modal =
    $("authModal");

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "hidden"
  );

  const title =
    $("authTitle");

  if (title) {
    title.textContent =
      signup
        ? "Create your Nockage account"
        : "Log in to Nockage";
  }

  const submit =
    $("authSubmit");

  if (submit) {
    submit.textContent =
      signup
        ? "Create account"
        : "Log in";
  }

  const switchButton =
    $("switchAuth");

  if (switchButton) {
    switchButton.textContent =
      signup
        ? "Already have an account? Log in"
        : "New to Nockage? Create account";
  }

  const form =
    $("authForm");

  if (form) {
    form.dataset.signup =
      signup
        ? "1"
        : "0";
  }

  const username =
    $("authUsername");

  const usernameLabel =
    $("usernameLabel");

  if (username) {
    username.style.display =
      signup
        ? ""
        : "none";

    username.required =
      signup;
  }

  if (usernameLabel) {
    usernameLabel.style.display =
      signup
        ? ""
        : "none";
  }

  const password =
    $("authPassword");

  if (password) {
    password.autocomplete =
      signup
        ? "new-password"
        : "current-password";
  }

  const hint =
    $("authHint");

  if (hint) {
    hint.textContent =
      "";
  }

  setTimeout(() => {

    if (signup) {
      $("authUsername")
        ?.focus();
    } else {
      $("authEmail")
        ?.focus();
    }

  }, 50);
}


function closeAuth() {
  $("authModal")
    ?.classList.add(
      "hidden"
    );
}


async function logout() {

  try {

    if (
      ready &&
      sb
    ) {

      const {
        error
      } =
        await sb.auth.signOut();

      if (error) {
        throw error;
      }
    }

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );
  }

  currentUser =
    null;

  profile =
    null;

  renderAccount();

  setHash(
    "home"
  );

  toast(
    "Logged out."
  );
}


function setupAuth() {

  $("closeAuth")?.addEventListener(
    "click",
    closeAuth
  );

  $("authModal")?.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        $("authModal")
      ) {
        closeAuth();
      }
    }
  );

  $("switchAuth")?.addEventListener(
    "click",
    () => {

      const signup =
        $("authForm")
          ?.dataset.signup ===
        "1";

      openAuth(
        !signup
      );
    }
  );

  $("authForm")?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!requireSupabase()) {
        return;
      }

      const email =
        $("authEmail")
          ?.value
          .trim() ||
        "";

      const password =
        $("authPassword")
          ?.value ||
        "";

      const username =
        $("authUsername")
          ?.value
          .trim() ||
        "";

      const signup =
        $("authForm")
          ?.dataset.signup ===
        "1";

      if (!email) {
        return toast(
          "Enter your email."
        );
      }

      if (
        password.length <
        8
      ) {
        return toast(
          "Password must be at least 8 characters."
        );
      }

      if (
        signup &&
        !/^[A-Za-z0-9_]{3,24}$/.test(
          username
        )
      ) {
        return toast(
          "Username must be 3–24 letters, numbers or _."
        );
      }

      const button =
        $("authSubmit");

      if (button) {
        button.disabled =
          true;

        button.textContent =
          signup
            ? "Creating..."
            : "Logging in...";
      }

      try {

        if (signup) {

          const {
            data:
              existing,
            error:
              usernameError
          } =
            await sb
              .from("profiles")
              .select("id")
              .eq(
                "username",
                username
              )
              .maybeSingle();

          if (
            usernameError
          ) {
            console.warn(
              "Username lookup:",
              usernameError
            );
          }

          if (existing) {
            throw new Error(
              "That username is already taken."
            );
          }

          const {
            data,
            error
          } =
            await sb.auth.signUp({
              email,
              password,
              options: {
                data: {
                  username
                }
              }
            });

          if (error) {
            throw error;
          }

          const user =
            data?.user;

          if (!user) {
            throw new Error(
              "Account could not be created."
            );
          }

          const {
            error:
              profileError
          } =
            await sb
              .from("profiles")
              .upsert({
                id:
                  user.id,

                username,

                display_name:
                  username
              });

          if (
            profileError
          ) {
            console.error(
              "Profile creation:",
              profileError
            );

            toast(
              "Account created, but profile setup needs attention."
            );

          } else {

            toast(
              data?.session
                ? "Welcome to Nockage!"
                : "Account created! Check your email if verification is enabled."
            );
          }

          if (data?.session) {
            await setUser(
              user
            );
          }

          closeAuth();

        } else {

          const {
            data,
            error
          } =
            await sb.auth.signInWithPassword({
              email,
              password
            });

          if (error) {
            throw error;
          }

          await setUser(
            data?.user ||
            null
          );

          closeAuth();

          toast(
            "Welcome back to Nockage!"
          );
        }

      } catch (error) {

        console.error(
          "Nockage auth error:",
          error
        );

        const hint =
          $("authHint");

        if (hint) {
          hint.textContent =
            getErrorMessage(
              error,
              "Authentication failed."
            );
        }

      } finally {

        if (button) {

          button.disabled =
            false;

          button.textContent =
            signup
              ? "Create account"
              : "Log in";
        }
      }
    }
  );
}


// ============================================================
// VIDEO QUERIES
// ============================================================

async function queryVideos(
  options = {}
) {
  if (
    !ready ||
    !sb
  ) {
    return [];
  }

  const {
    shorts = false,
    creator = null,
    search = "",
    limit = 24
  } = options;

  let query =
    sb
      .from("videos")
      .select(`
        id,
        user_id,
        title,
        description,
        video_url,
        storage_path,
        thumbnail_url,
        thumbnail_path,
        visibility,
        is_short,
        views,
        created_at,
        allow_comments,
        profiles!videos_user_id_fkey (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq(
        "visibility",
        "public"
      )
      .eq(
        "is_short",
        shorts
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      )
      .limit(
        limit
      );

  if (creator) {
    query =
      query.eq(
        "user_id",
        creator
      );
  }

  if (search) {
    query =
      query.ilike(
        "title",
        `%${search}%`
      );
  }

  const {
    data,
    error
  } =
    await query;

  if (error) {

    console.error(
      "Nockage video query:",
      error
    );

    return [];
  }

  return data || [];
}


// ============================================================
// VIDEO CARD
// ============================================================

function videoCard(
  video,
  short = false
) {

  const creator =
    video.profiles?.display_name ||
    video.profiles?.username ||
    "Creator";

  const thumbnail =
    video.thumbnail_url;

  return `
    <article
      class="card ${
        short
          ? "shortCard"
          : ""
      }"
      data-video-id="${esc(
        video.id
      )}"
      tabindex="0"
      role="button"
      aria-label="Watch ${
        esc(video.title)
      }"
    >

      ${
        thumbnail
          ? `
            <img
              class="thumb"
              src="${esc(
                thumbnail
              )}"
              alt=""
              loading="lazy"
              onerror="this.style.display='none'"
            >
          `
          : `
            <div
              class="thumb"
              aria-hidden="true"
            ></div>
          `
      }

      <div class="cardBody">

        <div class="cardTitle">
          ${esc(
            video.title
          )}
        </div>

        <div class="meta">
          ${esc(
            creator
          )}
          ·
          ${fmt(
            video.views
          )}
          views
        </div>

      </div>

    </article>
  `;
}


// ============================================================
// HOME
// ============================================================

async function loadHome() {

  const grid =
    $("homeGrid");

  if (!grid) {
    return;
  }

  grid.innerHTML = `
    <div class="empty">
      Loading Nockage videos...
    </div>
  `;

  const videos =
    await queryVideos({
      shorts:
        false
    });

  if (!videos.length) {

    grid.innerHTML = `
      <div class="empty">
        No public videos yet.
        Create the first one!
      </div>
    `;

  } else {

    grid.innerHTML =
      videos
        .map(video =>
          videoCard(
            video,
            false
          )
        )
        .join("");
  }

  if ($("homeCount")) {

    $("homeCount").textContent =
      videos.length
        ? `${videos.length} videos`
        : "";
  }
}


// ============================================================
// SHORT VIEW TRACKING
// ============================================================

async function addView(
  videoId
) {

  if (
    !ready ||
    !sb ||
    !videoId
  ) {
    return;
  }

  try {

    const {
      data,
      error
    } =
      await sb
        .from("videos")
        .select(
          "views"
        )
        .eq(
          "id",
          videoId
        )
        .maybeSingle();

    if (
      error ||
      !data
    ) {
      return;
    }

    await sb
      .from("videos")
      .update({
        views:
          Number(
            data.views ||
            0
          ) + 1
      })
      .eq(
        "id",
        videoId
      );

  } catch (error) {

    console.warn(
      "View tracking failed:",
      error
    );
  }
}


// ============================================================
// SHORT LIKES
// ============================================================

async function getLikeState(
  videoId
) {

  if (
    !currentUser ||
    !ready
  ) {
    return false;
  }

  try {

    const {
      data
    } =
      await sb
        .from("likes")
        .select(
          "video_id"
        )
        .eq(
          "video_id",
          videoId
        )
        .eq(
          "user_id",
          currentUser.id
        )
        .maybeSingle();

    return !!data;

  } catch {

    return false;
  }
}


async function getLikeCount(
  videoId
) {

  try {

    const {
      count
    } =
      await sb
        .from("likes")
        .select(
          "*",
          {
            count:
              "exact",
            head:
              true
          }
        )
        .eq(
          "video_id",
          videoId
        );

    return Number(
      count || 0
    );

  } catch {

    return 0;
  }
}


async function shortLike(
  video,
  button,
  countEl
) {

  if (!currentUser) {
    return openAuth(
      false
    );
  }

  try {

    const wasLiked =
      button.classList.contains(
        "liked"
      );

    if (wasLiked) {

      const {
        error
      } =
        await sb
          .from("likes")
          .delete()
          .eq(
            "video_id",
            video.id
          )
          .eq(
            "user_id",
            currentUser.id
          );

      if (error) {
        throw error;
      }

      button.classList.remove(
        "liked"
      );

      toast(
        "Like removed."
      );

    } else {

      const {
        error
      } =
        await sb
          .from("likes")
          .insert({
            video_id:
              video.id,

            user_id:
              currentUser.id
          });

      if (error) {
        throw error;
      }

      button.classList.add(
        "liked"
      );

      toast(
        "Liked!"
      );
    }

    if (countEl) {

      const oldCount =
        Number(
          countEl.dataset.count ||
          0
        );

      const newCount =
        wasLiked
          ? Math.max(
              0,
              oldCount - 1
            )
          : oldCount + 1;

      countEl.dataset.count =
        String(
          newCount
        );

      countEl.textContent =
        fmt(
          newCount
        );
    }

  } catch (error) {

    console.error(
      "Short like error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not update like."
      )
    );
  }
}


// ============================================================
// SHORT SUBSCRIPTIONS
// ============================================================

async function shortSubscribe(
  video,
  button
) {

  if (!currentUser) {
    return openAuth(
      false
    );
  }

  if (
    video.user_id ===
    currentUser.id
  ) {
    return toast(
      "You can't subscribe to yourself."
    );
  }

  try {

    const {
      data:
        existing
    } =
      await sb
        .from("subscriptions")
        .select(
          "creator_id"
        )
        .eq(
          "creator_id",
          video.user_id
        )
        .eq(
          "subscriber_id",
          currentUser.id
        )
        .maybeSingle();

    if (existing) {

      const {
        error
      } =
        await sb
          .from("subscriptions")
          .delete()
          .eq(
            "creator_id",
            video.user_id
          )
          .eq(
            "subscriber_id",
            currentUser.id
          );

      if (error) {
        throw error;
      }

      button.textContent =
        "Subscribe";

      button.classList.remove(
        "following"
      );

      toast(
        "Unsubscribed."
      );

    } else {

      const {
        error
      } =
        await sb
          .from("subscriptions")
          .insert({
            creator_id:
              video.user_id,

            subscriber_id:
              currentUser.id
          });

      if (error) {
        throw error;
      }

      button.textContent =
        "Subscribed";

      button.classList.add(
        "following"
      );

      toast(
        "Subscribed!"
      );
    }

  } catch (error) {

    console.error(
      "Short subscription error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not update subscription."
      )
    );
  }
}


// ============================================================
// SHORT COMMENTS
// ============================================================

function openShortComments(
  videoId
) {
  if (!videoId) {
    return;
  }

  setHash(
    `watch/${encodeURIComponent(
      videoId
    )}`
  );
}


// ============================================================
// SHORT REPOST
// ============================================================

async function shortRepost(
  videoId
) {

  if (!currentUser) {
    return openAuth(
      false
    );
  }

  try {

    const {
      error
    } =
      await sb
        .from("reposts")
        .upsert(
          {
            video_id:
              videoId,

            user_id:
              currentUser.id
          },
          {
            onConflict:
              "video_id,user_id"
          }
        );

    if (error) {
      throw error;
    }

    toast(
      "Reposted!"
    );

  } catch (error) {

    console.error(
      "Short repost error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not repost."
      )
    );
  }
}


// ============================================================
// SHORT PLAYER OBSERVER
// ============================================================

function disconnectShortObserver() {

  if (shortsObserver) {
    shortsObserver.disconnect();
    shortsObserver =
      null;
  }

  shortsViewTimers.forEach(
    timer => clearTimeout(
      timer
    )
  );

  shortsViewTimers.clear();
}


function attachShortObserver() {

  disconnectShortObserver();

  const items =
    document.querySelectorAll(
      ".nockageShortItem"
    );

  if (!items.length) {
    return;
  }

  shortsObserver =
    new IntersectionObserver(
      entries => {

        entries.forEach(
          entry => {

            const item =
              entry.target;

            const video =
              item.querySelector(
                "video"
              );

            const videoId =
              item.dataset.videoId;

            if (
              entry.isIntersecting &&
              entry.intersectionRatio >=
                0.72
            ) {

              item.classList.add(
                "nockageShortPlaying"
              );

              if (video) {
                video
                  .play()
                  .catch(
                    () => {}
                  );
              }

              if (
                videoId &&
                !item.dataset.counted
              ) {

                item.dataset.counted =
                  "true";

                const timer =
                  setTimeout(
                    () => {

                      addView(
                        videoId
                      );

                      shortsViewTimers.delete(
                        videoId
                      );

                    },
                    800
                  );

                shortsViewTimers.set(
                  videoId,
                  timer
                );
              }

            } else {

              item.classList.remove(
                "nockageShortPlaying"
              );

              if (video) {
                video.pause();
              }

              if (videoId) {

                const timer =
                  shortsViewTimers.get(
                    videoId
                  );

                if (timer) {
                  clearTimeout(
                    timer
                  );

                  shortsViewTimers.delete(
                    videoId
                  );
                }
              }
            }
          }
        );

      },
      {
        threshold:[
          0.2,
          0.72,
          0.95
        ]
      }
    );

  items.forEach(
    item =>
      shortsObserver.observe(
        item
      )
  );
}


// ============================================================
// SHORTS PAGE
// ============================================================

async function loadShorts() {

  const grid =
    $("shortsGrid");

  if (!grid) {
    return;
  }

  ensureShortsStyles();

  disconnectShortObserver();

  grid.innerHTML = `
    <div class="empty">
      Loading Shorts...
    </div>
  `;

  const shorts =
    await queryVideos({
      shorts:
        true,

      limit:
        50
    });

  if (!shorts.length) {

    grid.innerHTML = `
      <div class="empty">
        No Shorts yet.
      </div>
    `;

    return;
  }

  const likeStates =
    new Map();

  const likeCounts =
    new Map();

  await Promise.all(
    shorts.map(
      async video => {

        likeStates.set(
          video.id,
          await getLikeState(
            video.id
          )
        );

        likeCounts.set(
          video.id,
          await getLikeCount(
            video.id
          )
        );
      }
    )
  );

  grid.innerHTML = `
    <div
      class="nockageShortsFeed"
    >

      ${
        shorts
          .map(video => {

            const creator =
              video.profiles
                ?.display_name ||
              video.profiles
                ?.username ||
              "Creator";

            const avatar =
              video.profiles
                ?.avatar_url ||
              "./assets/nockage-logo.png";

            const liked =
              likeStates.get(
                video.id
              ) || false;

            const likeCount =
              likeCounts.get(
                video.id
              ) || 0;

            const media =
              isEmbedUrl(
                video.video_url
              )

                ? `
                  <iframe
                    class="nockageShortEmbed"
                    src="${esc(
                      video.video_url
                    )}"
                    title="${esc(
                      video.title
                    )}"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen
                  ></iframe>
                `

                : `
                  <video
                    class="nockageShortVideo"
                    playsinline
                    loop
                    muted
                    preload="metadata"
                    src="${esc(
                      video.video_url
                    )}"
                  ></video>
                `;

            return `
              <article
                class="nockageShortItem"
                data-video-id="${esc(
                  video.id
                )}"
              >

                ${media}

                ${
                  !isEmbedUrl(
                    video.video_url
                  )
                    ? `
                      <button
                        class="nockageShortMute"
                        type="button"
                        data-short-mute="${esc(
                          video.id
                        )}"
                        aria-label="Unmute video"
                      >
                        🔇
                      </button>
                    `
                    : ""
                }

                <div
                  class="nockageShortRail"
                >

                  <button
                    type="button"
                    class="${
                      liked
                        ? "liked"
                        : ""
                    }"
                    data-short-like="${esc(
                      video.id
                    )}"
                    aria-label="Like"
                  >
                    ♥
                  </button>

                  <small
                    data-like-count="${esc(
                      video.id
                    )}"
                    data-count="${likeCount}"
                  >
                    ${fmt(
                      likeCount
                    )}
                  </small>

                  <button
                    type="button"
                    data-short-comment="${esc(
                      video.id
                    )}"
                    aria-label="Comments"
                  >
                    💬
                  </button>

                  <button
                    type="button"
                    data-short-repost="${esc(
                      video.id
                    )}"
                    aria-label="Repost"
                  >
                    ↻
                  </button>

                  <button
                    type="button"
                    data-short-share="${esc(
                      video.id
                    )}"
                    aria-label="Share"
                  >
                    ↗
                  </button>

                </div>

                <div
                  class="nockageShortOverlay"
                >

                  <div
                    class="nockageShortTop"
                  >

                    <div
                      class="nockageShortBadge"
                    >
                      SHORT
                    </div>

                  </div>

                  <div
                    class="nockageShortCreator"
                  >

                    <img
                      class="nockageShortAvatar"
                      src="${esc(
                        avatar
                      )}"
                      alt=""
                      onerror="this.src='./assets/nockage-logo.png'"
                    >

                    <span
                      class="nockageShortCreatorName"
                    >
                      ${esc(
                        creator
                      )}
                    </span>

                    ${
                      currentUser &&
                      video.user_id !==
                        currentUser.id
                        ? `
                          <button
                            type="button"
                            class="nockageShortFollow"
                            data-short-follow="${esc(
                              video.id
                            )}"
                          >
                            Subscribe
                          </button>
                        `
                        : ""
                    }

                  </div>

                  <div
                    class="nockageShortTitle"
                  >
                    ${esc(
                      video.title
                    )}
                  </div>

                  ${
                    video.description
                      ? `
                        <div
                          class="nockageShortDescription"
                        >
                          ${esc(
                            video.description
                          )}
                        </div>
                      `
                      : ""
                  }

                  <div
                    class="nockageShortMeta"
                  >
                    ${fmt(
                      video.views
                    )}
                    views
                  </div>

                </div>

              </article>
            `;
          })
          .join("")
      }

    </div>
  `;


  // ----------------------------------------------------------
  // LIKE BUTTONS
  // ----------------------------------------------------------

  grid
    .querySelectorAll(
      "[data-short-like]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const id =
            button.dataset.shortLike;

          const video =
            shorts.find(
              item =>
                String(
                  item.id
                ) ===
                String(
                  id
                )
            );

          const countEl =
            grid.querySelector(
              `[data-like-count="${CSS.escape(
                String(id)
              )}"]`
            );

          if (
            video &&
            countEl
          ) {
            shortLike(
              video,
              button,
              countEl
            );
          }
        }
      );
    });


  // ----------------------------------------------------------
  // COMMENTS
  // ----------------------------------------------------------

  grid
    .querySelectorAll(
      "[data-short-comment]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          openShortComments(
            button.dataset.shortComment
          );
        }
      );
    });


  // ----------------------------------------------------------
  // REPOST
  // ----------------------------------------------------------

  grid
    .querySelectorAll(
      "[data-short-repost]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          shortRepost(
            button.dataset.shortRepost
          );
        }
      );
    });


  // ----------------------------------------------------------
  // SHARE
  // ----------------------------------------------------------

  grid
    .querySelectorAll(
      "[data-short-share]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const video =
            shorts.find(
              item =>
                String(
                  item.id
                ) ===
                String(
                  button.dataset.shortShare
                )
            );

          if (video) {
            shareVideo(
              video
            );
          }
        }
      );
    });


  // ----------------------------------------------------------
  // SUBSCRIBE
  // ----------------------------------------------------------

  grid
    .querySelectorAll(
      "[data-short-follow]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const video =
            shorts.find(
              item =>
                String(
                  item.id
                ) ===
                String(
                  button.dataset.shortFollow
                )
            );

          if (video) {
            shortSubscribe(
              video,
              button
            );
          }
        }
      );
    });


  // ----------------------------------------------------------
  // MUTE
  // ----------------------------------------------------------

  grid
    .querySelectorAll(
      "[data-short-mute]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          const id =
            button.dataset.shortMute;

          const item =
            grid.querySelector(
              `[data-video-id="${CSS.escape(
                String(id)
              )}"]`
            );

          const video =
            item?.querySelector(
              "video"
            );

          if (!video) {
            return;
          }

          video.muted =
            !video.muted;

          button.textContent =
            video.muted
              ? "🔇"
              : "🔊";
        }
      );
    });


  // ----------------------------------------------------------
  // SHORT VIDEO CLICK
  // ----------------------------------------------------------

  grid
    .querySelectorAll(
      ".nockageShortVideo"
    )
    .forEach(video => {

      video.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          if (video.paused) {
            video
              .play()
              .catch(
                () => {}
              );
          } else {
            video.pause();
          }
        }
      );
    });


  attachShortObserver();
}


// ============================================================
// SUBSCRIPTIONS
// ============================================================

async function loadSubs() {

  const grid =
    $("subsGrid");

  if (!grid) {
    return;
  }

  if (!currentUser) {

    grid.innerHTML =
      "";

    if ($("subsEmpty")) {
      $("subsEmpty")
        .style.display =
        "block";
    }

    return;
  }

  grid.innerHTML = `
    <div class="empty">
      Loading subscriptions...
    </div>
  `;

  const {
    data,
    error
  } =
    await sb
      .from("subscriptions")
      .select(
        "creator_id"
      )
      .eq(
        "subscriber_id",
        currentUser.id
      );

  if (error) {

    console.error(
      "Subscriptions:",
      error
    );

    grid.innerHTML = `
      <div class="empty">
        ${esc(
          error.message
        )}
      </div>
    `;

    return;
  }

  const creatorIds =
    (data || [])
      .map(
        row =>
          row.creator_id
      )
      .filter(Boolean);

  if (
    !creatorIds.length
  ) {

    grid.innerHTML =
      "";

    if ($("subsEmpty")) {
      $("subsEmpty")
        .style.display =
        "block";
    }

    return;
  }

  if ($("subsEmpty")) {
    $("subsEmpty")
      .style.display =
      "none";
  }

  const results =
    await Promise.all(
      creatorIds.map(
        id =>
          queryVideos({
            creator:
              id,

            shorts:
              false
          })
      )
    );

  const videos =
    results.flat();

  grid.innerHTML =
    videos.length
      ? videos
          .map(
            video =>
              videoCard(
                video,
                false
              )
          )
          .join("")
      : `
        <div class="empty">
          Your subscriptions have no
          public videos yet.
        </div>
      `;
}


// ============================================================
// SEARCH
// ============================================================

async function searchVideos(
  queryText
) {

  const query =
    String(
      queryText ||
      ""
    ).trim();

  page(
    "search"
  );

  if ($("searchLabel")) {

    $("searchLabel").textContent =
      query
        ? `"${query}"`
        : "";
  }

  const grid =
    $("searchGrid");

  if (!grid) {
    return;
  }

  if (!query) {

    grid.innerHTML = `
      <div class="empty">
        Type something to search Nockage.
      </div>
    `;

    return;
  }

  grid.innerHTML = `
    <div class="empty">
      Searching Nockage...
    </div>
  `;

  const videos =
    await queryVideos({
      search:
        query,

      shorts:
        false,

      limit:
        50
    });

  grid.innerHTML =
    videos.length
      ? videos
          .map(
            video =>
              videoCard(
                video,
                false
              )
          )
          .join("")
      : `
        <div class="empty">
          No results for "${esc(
            query
          )}".
        </div>
      `;
}


// ============================================================
// WATCH
// ============================================================

async function showWatch(
  id
) {

  const container =
    $("watchContent");

  if (
    !container ||
    !id
  ) {
    return;
  }

  if (
    !ready ||
    !sb
  ) {

    container.innerHTML = `
      <div class="empty">
        Nockage is not connected to Supabase.
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="empty">
      Loading video...
    </div>
  `;

  const {
    data: video,
    error
  } =
    await sb
      .from("videos")
      .select(`
        *,
        profiles!videos_user_id_fkey (
          username,
          display_name,
          avatar_url
        )
      `)
      .eq(
        "id",
        id
      )
      .eq(
        "visibility",
        "public"
      )
      .maybeSingle();

  if (error) {

    console.error(
      "Watch query:",
      error
    );

    container.innerHTML = `
      <div class="empty">
        ${esc(
          error.message
        )}
      </div>
    `;

    return;
  }

  if (!video) {

    container.innerHTML = `
      <div class="empty">
        Video not found.
      </div>
    `;

    return;
  }

  const oldViews =
    Number(
      video.views ||
      0
    );

  await sb
    .from("videos")
    .update({
      views:
        oldViews + 1
    })
    .eq(
      "id",
      id
    );

  video.views =
    oldViews + 1;

  let liked =
    false;

  let subscribed =
    false;

  if (currentUser) {

    liked =
      await getLikeState(
        id
      );

    if (
      video.user_id !==
      currentUser.id
    ) {

      const {
        data:
          subscription
      } =
        await sb
          .from("subscriptions")
          .select(
            "creator_id"
          )
          .eq(
            "creator_id",
            video.user_id
          )
          .eq(
            "subscriber_id",
            currentUser.id
          )
          .maybeSingle();

      subscribed =
        !!subscription;
    }
  }

  let comments =
    [];

  if (
    video.allow_comments !==
    false
  ) {

    const {
      data,
      error:
        commentsError
    } =
      await sb
        .from("comments")
        .select(`
          id,
          text,
          created_at,
          user_id,
          profiles (
            username,
            display_name
          )
        `)
        .eq(
          "video_id",
          id
        )
        .order(
          "created_at",
          {
            ascending:
              false
          }
        )
        .limit(
          50
        );

    if (
      commentsError
    ) {

      console.warn(
        "Comments query:",
        commentsError
      );

    } else {

      comments =
        data || [];
    }
  }

  const creator =
    video.profiles?.display_name ||
    video.profiles?.username ||
    "Creator";

  container.innerHTML = `
    <div class="watch">

      <div>

        ${mediaHtml(
          video,
          video.is_short
            ? "shortWatchVideo"
            : "watchVideo"
        )}

        <h1>
          ${esc(
            video.title
          )}
        </h1>

        <div class="meta">

          ${
            video.is_short
              ? "Short"
              : "Video"
          }

          ·

          ${esc(
            creator
          )}

          ·

          ${fmt(
            video.views
          )}

          views

        </div>

        <div class="actions">

          <button
            type="button"
            class="ghost"
            id="likeBtn"
          >
            ${
              liked
                ? "♥ Liked"
                : "♡ Like"
            }
          </button>

          <button
            type="button"
            class="ghost"
            id="repostBtn"
          >
            ↻ Repost
          </button>

          <button
            type="button"
            class="ghost"
            id="shareBtn"
          >
            ↗ Share
          </button>

          ${
            video.user_id ===
            currentUser?.id

              ? `
                <button
                  type="button"
                  class="ghost"
                  id="watchDeleteBtn"
                >
                  🗑 Delete
                </button>
              `

              : `
                <button
                  type="button"
                  class="primary"
                  id="subBtn"
                >
                  ${
                    subscribed
                      ? "Subscribed"
                      : "Subscribe"
                  }
                </button>
              `
          }

        </div>

        ${
          video.description
            ? `
              <p>
                ${esc(
                  video.description
                )}
              </p>
            `
            : ""
        }

      </div>

      <aside class="panel">

        <h3>
          Comments
        </h3>

        ${
          video.allow_comments ===
          false

            ? `
              <p class="muted">
                Comments are disabled for this video.
              </p>
            `

            : `
              <form
                id="commentForm"
              >

                <input
                  id="commentInput"
                  placeholder="${
                    currentUser
                      ? "Add a comment…"
                      : "Log in to comment"
                  }"
                  ${
                    currentUser
                      ? ""
                      : "disabled"
                  }
                >

                <button
                  type="submit"
                  class="primary wide"
                  ${
                    currentUser
                      ? ""
                      : "disabled"
                  }
                >
                  Comment
                </button>

              </form>

              <div id="comments">

                ${
                  comments.length
                    ? comments
                        .map(
                          comment => `
                            <div
                              class="comment"
                            >

                              <b>
                                ${esc(
                                  comment
                                    .profiles
                                    ?.display_name ||
                                  comment
                                    .profiles
                                    ?.username ||
                                  "User"
                                )}
                              </b>

                              <div>
                                ${esc(
                                  comment.text
                                )}
                              </div>

                            </div>
                          `
                        )
                        .join("")

                    : `
                      <p class="muted">
                        No comments yet.
                      </p>
                    `
                }

              </div>
            `
        }

      </aside>

    </div>
  `;


  $("likeBtn")?.addEventListener(
    "click",
    () =>
      toggleLike(
        id,
        liked
      )
  );


  $("repostBtn")?.addEventListener(
    "click",
    () =>
      repost(
        id
      )
  );


  $("shareBtn")?.addEventListener(
    "click",
    () =>
      shareVideo(
        video
      )
  );


  $("subBtn")?.addEventListener(
    "click",
    () =>
      toggleSub(
        video.user_id,
        subscribed
      )
  );


  $("watchDeleteBtn")?.addEventListener(
    "click",
    () =>
      openDeleteModal(
        video
      )
  );


  $("commentForm")?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!currentUser) {
        return openAuth(
          false
        );
      }

      const input =
        $("commentInput");

      const text =
        input
          ?.value
          .trim() ||
        "";

      if (!text) {
        return;
      }

      if (
        text.length >
        1000
      ) {
        return toast(
          "Comment is too long."
        );
      }

      const button =
        event.submitter;

      if (button) {
        button.disabled =
          true;
      }

      try {

        const {
          error:
            commentError
        } =
          await sb
            .from("comments")
            .insert({
              video_id:
                id,

              user_id:
                currentUser.id,

              text
            });

        if (
          commentError
        ) {
          throw commentError;
        }

        toast(
          "Comment posted."
        );

        await showWatch(
          id
        );

      } catch (error) {

        console.error(
          "Comment error:",
          error
        );

        toast(
          getErrorMessage(
            error,
            "Could not post comment."
          )
        );

      } finally {

        if (button) {
          button.disabled =
            false;
        }
      }
    }
  );
}


// ============================================================
// LIKES
// ============================================================

async function getLikeState(
  videoId
) {

  if (!currentUser) {
    return false;
  }

  try {

    const {
      data
    } =
      await sb
        .from("likes")
        .select(
          "video_id"
        )
        .eq(
          "video_id",
          videoId
        )
        .eq(
          "user_id",
          currentUser.id
        )
        .maybeSingle();

    return !!data;

  } catch {

    return false;
  }
}


async function toggleLike(
  videoId,
  wasLiked
) {

  if (!currentUser) {
    return openAuth(
      false
    );
  }

  try {

    if (wasLiked) {

      const {
        error
      } =
        await sb
          .from("likes")
          .delete()
          .eq(
            "video_id",
            videoId
          )
          .eq(
            "user_id",
            currentUser.id
          );

      if (error) {
        throw error;
      }

      toast(
        "Like removed."
      );

    } else {

      const {
        error
      } =
        await sb
          .from("likes")
          .insert({
            video_id:
              videoId,

            user_id:
              currentUser.id
          });

      if (error) {
        throw error;
      }

      toast(
        "Liked!"
      );
    }

    await showWatch(
      videoId
    );

  } catch (error) {

    console.error(
      "Like error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not update like."
      )
    );
  }
}


// ============================================================
// SUBSCRIPTIONS
// ============================================================

async function toggleSub(
  creatorId,
  wasSubscribed
) {

  if (!currentUser) {
    return openAuth(
      false
    );
  }

  if (
    creatorId ===
    currentUser.id
  ) {
    return toast(
      "You can't subscribe to yourself."
    );
  }

  try {

    if (wasSubscribed) {

      const {
        error
      } =
        await sb
          .from("subscriptions")
          .delete()
          .eq(
            "creator_id",
            creatorId
          )
          .eq(
            "subscriber_id",
            currentUser.id
          );

      if (error) {
        throw error;
      }

      toast(
        "Unsubscribed."
      );

    } else {

      const {
        error
      } =
        await sb
          .from("subscriptions")
          .insert({
            creator_id:
              creatorId,

            subscriber_id:
              currentUser.id
          });

      if (error) {
        throw error;
      }

      toast(
        "Subscribed!"
      );
    }

    const parts =
      getHashParts();

    if (
      parts[0] ===
        "watch" &&
      parts[1]
    ) {

      await showWatch(
        parts[1]
      );

    } else if (
      parts[0] ===
        "profile" &&
      parts[1]
    ) {

      await showProfile(
        parts[1]
      );

    } else {

      await loadSubs();
    }

  } catch (error) {

    console.error(
      "Subscribe error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not update subscription."
      )
    );
  }
}


// ============================================================
// REPOSTS
// ============================================================

async function repost(
  videoId
) {

  if (!currentUser) {
    return openAuth(
      false
    );
  }

  try {

    const {
      error
    } =
      await sb
        .from("reposts")
        .upsert(
          {
            video_id:
              videoId,

            user_id:
              currentUser.id
          },
          {
            onConflict:
              "video_id,user_id"
          }
        );

    if (error) {
      throw error;
    }

    toast(
      "Reposted to your profile!"
    );

  } catch (error) {

    console.error(
      "Repost error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not repost."
      )
    );
  }
}


// ============================================================
// PROFILE PAGE
// ============================================================

async function showProfile(
  id
) {

  const container =
    $("profileContent");

  if (
    !container ||
    !id
  ) {
    return;
  }

  if (
    !ready ||
    !sb
  ) {

    container.innerHTML = `
      <div class="empty">
        Nockage is not connected to Supabase.
      </div>
    `;

    return;
  }

  container.innerHTML = `
    <div class="empty">
      Loading profile...
    </div>
  `;

  const {
    data:
      creator,
    error:
      profileError
  } =
    await sb
      .from("profiles")
      .select("*")
      .eq(
        "id",
        id
      )
      .maybeSingle();

  if (
    profileError
  ) {
    console.error(
      "Profile query:",
      profileError
    );
  }

  if (!creator) {

    container.innerHTML = `
      <div class="empty">
        Creator not found.
      </div>
    `;

    return;
  }

  const videos =
    await queryVideos({
      creator:
        id,

      shorts:
        false
    });

  const shorts =
    await queryVideos({
      creator:
        id,

      shorts:
        true,

      limit:
        50
    });

  const {
    count:
      subscribers
  } =
    await sb
      .from("subscriptions")
      .select(
        "*",
        {
          count:
            "exact",

          head:
            true
        }
      )
      .eq(
        "creator_id",
        id
      );

  const mine =
    currentUser?.id ===
    id;

  let following =
    false;

  if (
    currentUser &&
    !mine
  ) {

    const {
      data
    } =
      await sb
        .from("subscriptions")
        .select(
          "creator_id"
        )
        .eq(
          "creator_id",
          id
        )
        .eq(
          "subscriber_id",
          currentUser.id
        )
        .maybeSingle();

    following =
      !!data;
  }

  container.innerHTML = `

    <div
      class="profileHead"
    >

      <img
        class="avatar"
        src="${esc(
          creator.avatar_url ||
          "./assets/nockage-logo.png"
        )}"
        alt=""
        onerror="this.src='./assets/nockage-logo.png'"
      >

      <div>

        <h1>
          ${esc(
            creator.display_name ||
            creator.username ||
            "Creator"
          )}
        </h1>

        <div class="muted">

          @${esc(
            creator.username ||
            ""
          )}

          ·

          ${fmt(
            subscribers
          )}

          subscribers

        </div>

      </div>

      ${
        mine

          ? `
            <a
              class="primary"
              href="#studio"
            >
              Nockage Studio
            </a>
          `

          : `
            <button
              class="primary"
              id="profileSub"
              type="button"
            >
              ${
                following
                  ? "Subscribed"
                  : "Subscribe"
              }
            </button>
          `
      }

    </div>


    <div
      class="sectionHead"
    >

      <h2>
        Videos
      </h2>

    </div>


    <div
      class="videoGrid"
    >

      ${
        videos.length

          ? videos
              .map(
                video =>
                  videoCard(
                    video,
                    false
                  )
              )
              .join("")

          : `
            <div class="empty">
              No public videos yet.
            </div>
          `
      }

    </div>


    ${
      shorts.length

        ? `
          <div
            class="sectionHead"
            style="margin-top:32px;"
          >
            <h2>
              Shorts
            </h2>
          </div>

          <div
            class="videoGrid"
          >

            ${
              shorts
                .map(
                  video =>
                    videoCard(
                      video,
                      true
                    )
                )
                .join("")
            }

          </div>
        `

        : ""
    }

  `;

  if (!mine) {

    $("profileSub")?.addEventListener(
      "click",
      () =>
        toggleSub(
          id,
          following
        )
    );
  }
}


// ============================================================
// STUDIO
// ============================================================

async function loadStudio() {

  if (!currentUser) {

    page(
      "home"
    );

    openAuth(
      false
    );

    return;
  }

  const stats =
    $("studioStats");

  const videoList =
    $("studioVideos");

  if (stats) {

    stats.innerHTML = `
      <div class="stat">
        <span>Loading</span>
        <b>...</b>
      </div>
    `;
  }

  const {
    data,
    error
  } =
    await sb
      .from("videos")
      .select("*")
      .eq(
        "user_id",
        currentUser.id
      )
      .order(
        "created_at",
        {
          ascending:
            false
        }
      );

  if (error) {

    console.error(
      "Studio query:",
      error
    );

    if (videoList) {

      videoList.innerHTML = `
        <p class="muted">
          ${esc(
            error.message
          )}
        </p>
      `;
    }

    return;
  }

  const all =
    data || [];

  const videos =
    all.filter(
      video =>
        video.is_short !==
        true
    );

  const shorts =
    all.filter(
      video =>
        video.is_short ===
        true
    );

  const totalViews =
    all.reduce(
      (
        total,
        video
      ) =>
        total +
        Number(
          video.views ||
          0
        ),
      0
    );

  const {
    count:
      subscribers
  } =
    await sb
      .from("subscriptions")
      .select(
        "*",
        {
          count:
            "exact",

          head:
            true
        }
      )
      .eq(
        "creator_id",
        currentUser.id
      );

  if (stats) {

    stats.innerHTML = `

      <div class="stat">

        <span>
          Views
        </span>

        <b>
          ${fmt(
            totalViews
          )}
        </b>

      </div>


      <div class="stat">

        <span>
          Subscribers
        </span>

        <b>
          ${fmt(
            subscribers
          )}
        </b>

      </div>


      <div class="stat">

        <span>
          Videos
        </span>

        <b>
          ${fmt(
            videos.length
          )}
        </b>

      </div>


      <div class="stat">

        <span>
          Shorts
        </span>

        <b>
          ${fmt(
            shorts.length
          )}
        </b>

      </div>

    `;
  }

  if (!videoList) {
    return;
  }

  videoList.innerHTML =
    all.length

      ? all
          .map(
            video => `
              <div
                class="comment"
                data-studio-video-id="${esc(
                  video.id
                )}"
              >

                <div>

                  <b>
                    ${esc(
                      video.title
                    )}
                  </b>

                  <span class="pill">

                    ${
                      video.is_short
                        ? "Short"
                        : "Video"
                    }

                  </span>

                  <span class="pill">

                    ${esc(
                      video.visibility ||
                      "Public"
                    )}

                  </span>

                  <span class="muted">

                    ·

                    ${fmt(
                      video.views
                    )}

                    views

                  </span>

                </div>


                <div
                  style="
                    display:flex;
                    gap:8px;
                    flex-wrap:wrap;
                    margin-top:8px;
                  "
                >

                  <a
                    class="ghost"
                    href="#watch/${encodeURIComponent(
                      video.id
                    )}"
                  >
                    Watch
                  </a>


                  <button
                    class="nockageDeleteButton"
                    type="button"
                    data-delete-video-id="${esc(
                      video.id
                    )}"
                  >
                    🗑 Delete
                  </button>

                </div>

              </div>
            `
          )
          .join("")

      : `
        <p class="muted">
          Upload your first video or Short.
        </p>
      `;


  videoList
    .querySelectorAll(
      "[data-delete-video-id]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.preventDefault();
            event.stopPropagation();

            const videoId =
              button.dataset
                .deleteVideoId;

            const video =
              all.find(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    videoId
                  )
              );

            if (!video) {

              return toast(
                "Video could not be found."
              );
            }

            openDeleteModal(
              video
            );
          }
        );
      }
    );
}


// ============================================================
// UPLOAD MODE
// ============================================================

function setMode(
  mode
) {

  uploadMode =
    mode === "short"
      ? "short"
      : "video";

  document
    .querySelectorAll(
      ".mode"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.mode ===
            uploadMode
        );
      }
    );

  if ($("uploadTitle")) {

    $("uploadTitle").textContent =
      uploadMode ===
      "short"

        ? "Create a Short"

        : "Upload a Video";
  }

  if ($("videoFile")) {

    $("videoFile").accept =
      "video/*";
  }
}


// ============================================================
// STORAGE UPLOAD
// ============================================================

async function uploadToStorage(
  bucket,
  path,
  file
) {

  const {
    error
  } =
    await sb.storage
      .from(bucket)
      .upload(
        path,
        file,
        {
          contentType:
            file.type ||
            "application/octet-stream",

          upsert:
            false
        }
      );

  if (error) {
    throw error;
  }

  const {
    data
  } =
    sb.storage
      .from(bucket)
      .getPublicUrl(
        path
      );

  if (
    !data?.publicUrl
  ) {

    throw new Error(
      "Could not create public file URL."
    );
  }

  return data.publicUrl;
}


function cleanFilename(
  name
) {

  return String(
    name ||
    "file"
  )
    .replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );
}


// ============================================================
// UPLOAD
// ============================================================

function setupUpload() {

  document
    .querySelectorAll(
      ".mode"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            setMode(
              button.dataset.mode
            )
        );
      }
    );


  $("videoFile")?.addEventListener(
    "change",
    event => {

      const file =
        event.target.files
          ?.[0];

      if ($("fileInfo")) {

        $("fileInfo").textContent =
          file

            ? `${file.name} · ${(
                file.size /
                1048576
              ).toFixed(
                1
              )} MB`

            : "Maximum 50 MB on the free backend.";
      }
    }
  );


  $("thumbFile")?.addEventListener(
    "change",
    event => {

      const file =
        event.target.files
          ?.[0];

      if (
        file &&
        !file.type.startsWith(
          "image/"
        )
      ) {

        event.target.value =
          "";

        toast(
          "Choose an image thumbnail."
        );
      }
    }
  );


  $("uploadForm")?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      if (!currentUser) {
        return openAuth(
          false
        );
      }

      if (!requireSupabase()) {
        return;
      }

      const videoFile =
        $("videoFile")
          ?.files
          ?.[0];

      const thumbnailFile =
        $("thumbFile")
          ?.files
          ?.[0];

      const title =
        $("videoTitle")
          ?.value
          .trim() ||
        "";

      const description =
        $("videoDescription")
          ?.value
          .trim() ||
        "";

      const allowComments =
        $("allowComments")
          ?.checked ??
        true;

      if (!videoFile) {
        return toast(
          "Choose a video first."
        );
      }

      if (!title) {
        return toast(
          "Enter a video title."
        );
      }

      if (
        videoFile.size >
        50 *
        1024 *
        1024
      ) {

        return toast(
          "Video must be 50 MB or smaller."
        );
      }

      if (
        thumbnailFile &&
        thumbnailFile.size >
        10 *
        1024 *
        1024
      ) {

        return toast(
          "Thumbnail must be 10 MB or smaller."
        );
      }

      const publishButton =
        event.target.querySelector(
          'button[type="submit"]'
        );

      const progress =
        $("uploadProgress");

      const progressBar =
        progress?.querySelector(
          "span"
        );

      const publishedAsShort =
        uploadMode ===
        "short";

      if (publishButton) {

        publishButton.disabled =
          true;

        publishButton.textContent =
          publishedAsShort
            ? "Publishing Short..."
            : "Publishing...";
      }

      if (progress) {
        progress.style.display =
          "block";
      }

      if (progressBar) {
        progressBar.style.width =
          "5%";
      }

      try {

        const bucket =
          "Videos";

        const videoPath =
          `${currentUser.id}/${crypto.randomUUID()}-${cleanFilename(
            videoFile.name
          )}`;

        if (progressBar) {
          progressBar.style.width =
            "15%";
        }

        const videoUrl =
          await uploadToStorage(
            bucket,
            videoPath,
            videoFile
          );

        if (progressBar) {
          progressBar.style.width =
            "60%";
        }

        let thumbnailUrl =
          null;

        let thumbnailPath =
          null;

        if (
          thumbnailFile
        ) {

          thumbnailPath =
            `${currentUser.id}/thumbnails/${crypto.randomUUID()}-${cleanFilename(
              thumbnailFile.name
            )}`;

          thumbnailUrl =
            await uploadToStorage(
              bucket,
              thumbnailPath,
              thumbnailFile
            );
        }

        if (progressBar) {
          progressBar.style.width =
            "80%";
        }

        const {
          error
        } =
          await sb
            .from("videos")
            .insert({

              user_id:
                currentUser.id,

              title,

              description,

              video_url:
                videoUrl,

              storage_path:
                videoPath,

              thumbnail_url:
                thumbnailUrl,

              thumbnail_path:
                thumbnailPath,

              visibility:
                "public",

              is_short:
                publishedAsShort,

              views:
                0,

              allow_comments:
                allowComments
            });

        if (error) {
          throw error;
        }

        if (progressBar) {
          progressBar.style.width =
            "100%";
        }

        toast(
          publishedAsShort
            ? "Short published to Nockage!"
            : "Published to Nockage!"
        );

        event.target.reset();

        setMode(
          "video"
        );

        if ($("fileInfo")) {

          $("fileInfo").textContent =
            "Maximum 50 MB on the free backend.";
        }

        setTimeout(
          () => {

            setHash(
              publishedAsShort
                ? "shorts"
                : "home"
            );

          },
          350
        );

      } catch (error) {

        console.error(
          "Nockage upload error:",
          error
        );

        toast(
          getErrorMessage(
            error,
            "Upload failed."
          )
        );

      } finally {

        if (publishButton) {

          publishButton.disabled =
            false;

          publishButton.textContent =
            "Publish";
        }

        setTimeout(
          () => {

            if (progress) {

              progress.style.display =
                "none";
            }

            if (progressBar) {

              progressBar.style.width =
                "0%";
            }

          },
          800
        );
      }
    }
  );
}


// ============================================================
// NAVIGATION BUTTONS
// ============================================================

function setupButtons() {

  $("heroUpload")?.addEventListener(
    "click",
    () => {

      if (currentUser) {

        setHash(
          "upload"
        );

      } else {

        openAuth(
          false
        );
      }
    }
  );


  $("shortUpload")?.addEventListener(
    "click",
    () => {

      if (!currentUser) {
        return openAuth(
          false
        );
      }

      setHash(
        "upload"
      );

      setTimeout(
        () =>
          setMode(
            "short"
          ),
        50
      );
    }
  );


  $("studioUpload")?.addEventListener(
    "click",
    () => {

      if (!currentUser) {
        return openAuth(
          false
        );
      }

      setHash(
        "upload"
      );
    }
  );


  $("logoutBtn")?.addEventListener(
    "click",
    logout
  );


  $("searchBtn")?.addEventListener(
    "click",
    performSearch
  );


  $("searchInput")?.addEventListener(
    "keydown",
    event => {

      if (
        event.key ===
        "Enter"
      ) {

        performSearch();
      }
    }
  );


  // ----------------------------------------------------------
  // CARD NAVIGATION
  // ----------------------------------------------------------

  document.addEventListener(
    "click",
    event => {

      const card =
        event.target.closest(
          "[data-video-id]"
        );

      if (!card) {
        return;
      }

      if (
        event.target.closest(
          "button, a, input, iframe, video"
        )
      ) {
        return;
      }

      const videoId =
        card.dataset.videoId;

      if (videoId) {

        setHash(
          `watch/${encodeURIComponent(
            videoId
          )}`
        );
      }
    }
  );


  // ----------------------------------------------------------
  // KEYBOARD
  // ----------------------------------------------------------

  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !==
          "Enter" &&
        event.key !==
          " "
      ) {
        return;
      }

      const card =
        event.target.closest(
          "[data-video-id]"
        );

      if (!card) {
        return;
      }

      if (
        event.target.closest(
          "input, textarea, button, a, iframe, video"
        )
      ) {
        return;
      }

      event.preventDefault();

      const videoId =
        card.dataset.videoId;

      if (videoId) {

        setHash(
          `watch/${encodeURIComponent(
            videoId
          )}`
        );
      }
    }
  );
}


function performSearch() {

  const input =
    $("searchInput");

  const query =
    input?.value.trim() ||
    "";

  if (!query) {

    input?.focus();

    return;
  }

  setHash(
    `search/${encodeURIComponent(
      query
    )}`
  );
}


// ============================================================
// ROUTER
// ============================================================

async function routeApp() {

  if (routeRunning) {
    return;
  }

  routeRunning =
    true;

  try {

    const parts =
      getHashParts();

    const route =
      parts[0] ||
      "home";


    // --------------------------------------------------------
    // SHORTS CLEANUP WHEN LEAVING
    // --------------------------------------------------------

    if (
      route !==
      "shorts"
    ) {

      disconnectShortObserver();

      document.body.classList.remove(
        "nockage-shorts-mode"
      );

    } else {

      document.body.classList.add(
        "nockage-shorts-mode"
      );
    }


    // --------------------------------------------------------
    // ROUTES
    // --------------------------------------------------------

    switch (route) {

      case "home":

        page(
          "home"
        );

        await loadHome();

        break;


      case "shorts":

        page(
          "shorts"
        );

        await loadShorts();

        break;


      case "subscriptions":

        page(
          "subscriptions"
        );

        await loadSubs();

        break;


      case "search":

        page(
          "search"
        );

        await searchVideos(
          parts
            .slice(1)
            .join("/")
        );

        break;


      case "watch":

        page(
          "watch"
        );

        await showWatch(
          parts[1]
        );

        break;


      case "studio":

        if (!currentUser) {

          page(
            "home"
          );

          openAuth(
            false
          );

          break;
        }

        page(
          "studio"
        );

        await loadStudio();

        break;


      case "profile":

        page(
          "profile"
        );

        await showProfile(
          parts[1]
        );

        break;


      case "upload":

        if (!currentUser) {

          page(
            "home"
          );

          openAuth(
            false
          );

          break;
        }

        page(
          "upload"
        );

        break;


      case "settings":

        if (!currentUser) {

          page(
            "home"
          );

          openAuth(
            false
          );

          break;
        }

        page(
          "settings"
        );

        if ($("settingsName")) {

          $("settingsName")
            .textContent =
              profile?.username ||
              profile?.display_name ||
              "—";
        }

        break;


      default:

        setHash(
          "home"
        );

        break;
    }

  } catch (error) {

    console.error(
      "Nockage routing error:",
      error
    );

    toast(
      "Nockage encountered an error."
    );

  } finally {

    routeRunning =
      false;
  }
}


// ============================================================
// BOOT
// ============================================================

async function boot() {

  if (booted) {
    return;
  }

  booted =
    true;

  ensureShortsStyles();

  setupDeleteModal();

  setupButtons();

  setupAuth();

  setupUpload();


  if (!ready) {

    console.error(
      "Nockage: Supabase is not configured."
    );

    renderAccount();

    await routeApp();

    return;
  }


  try {

    const {
      data,
      error
    } =
      await sb.auth.getSession();

    if (error) {
      throw error;
    }

    await setUser(
      data?.session?.user ||
      null
    );


    sb.auth.onAuthStateChange(
      async (
        _event,
        session
      ) => {

        await setUser(
          session?.user ||
          null
        );
      }
    );

  } catch (error) {

    console.error(
      "Nockage Supabase startup error:",
      error
    );

    toast(
      "Could not connect to Nockage."
    );
  }


  await routeApp();
}


// ============================================================
// HASH ROUTING
// ============================================================

window.addEventListener(
  "hashchange",
  routeApp
);


// ============================================================
// START
// ============================================================

boot();