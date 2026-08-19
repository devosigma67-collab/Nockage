// ============================================================
// NOCKAGE — FULL CLEAN APP.JS REPLACEMENT
// Supabase + Auth + Videos + Shorts + Likes + Counters
// Comments + Subscriptions + Reposts + Search + Studio
// Delete + Uploads + Fixed navigation + Fullscreen Shorts
// Creator views do NOT count as views
// Supports normal video URLs and /embed/ URLs (AnonMP4 etc.)
// ============================================================

const NOCKAGE_CONFIG = {
  SUPABASE_URL: "https://ljveziwuxbiajxtguppy.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_pF6Fs7rvL1C-ib1mg_MRxg_qWuX8Int"
};

const $ = id => document.getElementById(id);

const hasSupabase =
  typeof window !== "undefined" &&
  typeof window.supabase !== "undefined";

const ready =
  hasSupabase &&
  Boolean(NOCKAGE_CONFIG.SUPABASE_URL) &&
  Boolean(NOCKAGE_CONFIG.SUPABASE_ANON_KEY);

const sb = ready
  ? window.supabase.createClient(
      NOCKAGE_CONFIG.SUPABASE_URL,
      NOCKAGE_CONFIG.SUPABASE_ANON_KEY
    )
  : null;

let currentUser = null;
let profile = null;
let uploadMode = "video";
let booted = false;
let routeBusy = false;
let routeQueued = false;
let deleteTarget = null;
let deleteBusy = false;
let shortsItems = [];
let shortsIndex = 0;
let shortsWheelLock = false;
let touchStartY = 0;
let touchStartX = 0;
let toastTimer = null;

// ============================================================
// GENERAL HELPERS
// ============================================================

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = String(message || "");
  el.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

function fmt(value) {
  const n = Number(value || 0);

  if (!Number.isFinite(n)) {
    return "0";
  }

  if (n >= 1e9) {
    return `${(n / 1e9)
      .toFixed(1)
      .replace(/\.0$/, "")}B`;
  }

  if (n >= 1e6) {
    return `${(n / 1e6)
      .toFixed(1)
      .replace(/\.0$/, "")}M`;
  }

  if (n >= 1e3) {
    return `${(n / 1e3)
      .toFixed(1)
      .replace(/\.0$/, "")}K`;
  }

  return String(n);
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    ch =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[ch]
  );
}

function requireSupabase() {
  if (!ready || !sb) {
    toast("Nockage is connecting to Supabase...");
    return false;
  }

  return true;
}

function getErrorMessage(
  error,
  fallback = "Something went wrong."
) {
  return (
    error?.message ||
    error?.error_description ||
    error?.details ||
    fallback
  );
}

function getHashParts() {
  const raw = location.hash.replace(/^#/, "");

  if (!raw) {
    return ["home"];
  }

  return raw.split("/").map(part => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });
}

function setHash(route) {
  const next = `#${route}`;

  if (location.hash === next) {
    routeApp();
  } else {
    location.hash = next;
  }
}

function cleanFilename(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isEmbedUrl(url) {
  const value =
    String(url || "").toLowerCase();

  return (
    value.includes("/embed/") ||
    value.includes("fembed.co/embed/") ||
    value.includes("embed.vdohide") ||
    value.includes("/player/") ||
    value.includes("avcaption.com/watch/")
  );
}
function page(id) {
  document
    .querySelectorAll(".page")
    .forEach(el => {
      el.classList.remove("active");
    });

  const target = $(id);

  if (target) {
    target.classList.add("active");
  }

  if (id !== "shorts") {
    exitShortsMode();
  }

  window.scrollTo({
    top: 0,
    behavior: "auto"
  });
}

// ============================================================
// NAVIGATION
// The current index.html already contains the sidebar and
// mobile navigation. Do NOT inject duplicate navigation.
// ============================================================

function ensureNavigationUI() {
  document
    .querySelectorAll(
      "#nockageDesktopSidebar, #nockageMobileNav"
    )
    .forEach(el => el.remove());

  updateNavigationState();
}

function updateNavigationState() {
  const route =
    getHashParts()[0] || "home";

  document
    .querySelectorAll(
      ".sideNavLink, .mobileNavItem"
    )
    .forEach(link => {
      const target =
        (link.getAttribute("href") || "")
          .replace(/^#/, "")
          .split("/")[0];

      link.classList.toggle(
        "active",
        target === route
      );
    });
}

// ============================================================
// DYNAMIC LIKE STYLES
// ============================================================

function ensureLikeStyles() {
  if ($("nockageLikeStyles")) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "nockageLikeStyles";

  style.textContent = `
    #likeBtn.nockageLiked{
      color:#ff0000 !important;
      border-color:#ff0000 !important;
    }

    .nockageShortAction.shortLiked{
      color:#ff0000 !important;
      background:#222 !important;
    }

    .nockageWatchLikeCount{
      margin-left:6px;
      opacity:.85;
      font-size:13px;
      font-weight:700;
    }

    .nockageShortLikeCount{
      font-size:12px;
      font-weight:700;
      color:#fff;
      margin-top:-7px;
    }

    .nockageShortItem{
      user-select:none;
      -webkit-user-select:none;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// SHORTS STYLES
// ============================================================

function ensureShortsStyles() {
  if ($("nockageShortsStyles")) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "nockageShortsStyles";

  style.textContent = `
    body.nockageShortsMode{
      overflow:hidden !important;
      height:100dvh;
    }

    body.nockageShortsMode main{
      overflow:hidden !important;
    }

    #shorts.nockageShortsActive{
      position:relative;
      overflow:hidden !important;
    }

    .nockageShortsPage{
      position:relative;
      width:100%;
      height:100%;
      overflow:hidden;
      background:#000;
    }

    .nockageShortsFeed{
      position:relative;
      width:100%;
      height:100%;
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
    }

    .nockageShortItem{
      position:absolute;
      left:50%;
      top:50%;

      width:min(430px,48vw);

      height:min(
        calc(100dvh - 96px),
        760px
      );

      aspect-ratio:9/16;

      transform:
        translate(-50%,-50%)
        scale(.96);

      opacity:0;
      visibility:hidden;

      background:#000;
      border-radius:14px;
      overflow:hidden;

      transition:
        opacity .22s ease,
        transform .22s ease,
        visibility .22s ease;
    }

    .nockageShortItem.active{
      opacity:1;
      visibility:visible;

      transform:
        translate(-50%,-50%)
        scale(1);

      z-index:5;
    }

    .nockageShortVideo,
    .nockageShortEmbed{
      position:absolute;
      inset:0;

      width:100%;
      height:100%;

      border:0;
      background:#000;

      object-fit:cover;

      display:block;
    }

    .nockageShortShade{
      position:absolute;
      inset:0;
      z-index:2;
      pointer-events:none;

      background:
        linear-gradient(
          to bottom,
          transparent 45%,
          rgba(0,0,0,.88) 100%
        );
    }

    .nockageShortInfo{
      position:absolute;

      left:16px;
      right:70px;
      bottom:18px;

      z-index:8;

      color:#fff;

      pointer-events:none;

      text-shadow:
        0 2px 10px
        rgba(0,0,0,.85);
    }

    .nockageShortBadge{
      display:inline-flex;

      padding:4px 8px;

      margin-bottom:7px;

      border-radius:999px;

      background:
        rgba(255,255,255,.12);

      border:
        1px solid
        rgba(255,255,255,.08);

      font-size:10px;
      font-weight:900;
    }

    .nockageShortCreator{
      font-weight:850;
      margin-bottom:5px;
    }

    .nockageShortTitle{
      font-size:18px;
      line-height:1.25;
      font-weight:800;
      margin-bottom:5px;
    }

    .nockageShortDescription{
      font-size:13px;
      color:
        rgba(255,255,255,.8);

      max-height:55px;

      overflow:hidden;

      margin-bottom:5px;
    }

    .nockageShortViews{
      font-size:12px;
      color:#ccc;
    }

    .nockageShortActions{
      position:absolute;

      right:-72px;
      bottom:18px;

      z-index:15;

      display:flex;
      flex-direction:column;
      align-items:center;

      gap:11px;
    }

    .nockageShortAction,
    .nockageShortOpen{
      width:50px;
      height:50px;

      display:flex;
      align-items:center;
      justify-content:center;

      border-radius:50%;

      border:
        1px solid
        rgba(255,255,255,.12);

      background:
        rgba(30,30,30,.9);

      color:#fff;

      font-size:21px;

      text-decoration:none;

      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);

      cursor:pointer;
    }

    .nockageShortMute{
      position:absolute;

      top:14px;
      right:14px;

      z-index:15;

      width:42px;
      height:42px;

      border:
        1px solid
        rgba(255,255,255,.12);

      border-radius:50%;

      background:
        rgba(0,0,0,.65);

      color:#fff;

      cursor:pointer;
    }

    .nockageShortControls{
      position:absolute;

      right:24px;
      top:50%;

      transform:
        translateY(-50%);

      z-index:50;

      display:flex;

      flex-direction:column;

      gap:10px;
    }

    .nockageShortNavButton{
      width:50px;
      height:50px;

      display:flex;
      align-items:center;
      justify-content:center;

      border:
        1px solid
        #444;

      border-radius:50%;

      background:
        rgba(30,30,30,.9);

      color:#fff;

      font-size:24px;

      cursor:pointer;
    }

    .nockageShortNavButton:hover{
      background:#fff;
      color:#000;
    }

    .nockageShortNavButton.disabled{
      opacity:.28;
      pointer-events:none;
    }

    .nockageShortEmpty{
      width:100%;
      height:100%;

      display:grid;
      place-items:center;

      color:#aaa;

      text-align:center;
    }

    @media(max-width:1000px){

      .nockageShortItem{
        width:min(
          430px,
          calc(100vw - 54px)
        );

        height:
          calc(100dvh - 85px);

        max-height:none;

        border-radius:10px;
      }

      .nockageShortActions{
        right:10px;
      }

      .nockageShortControls{
        right:10px;

        top:auto;

        bottom:95px;

        transform:none;
      }

      .nockageShortNavButton{
        width:44px;
        height:44px;
      }
    }

    @media(max-width:520px){

      #shorts.nockageShortsActive{
        height:
          calc(100svh - 64px);
      }

      .nockageShortItem{
        left:0;
        top:0;

        width:100%;
        height:100%;

        transform:none;

        border-radius:0;
      }

      .nockageShortItem.active{
        transform:none;
      }

      .nockageShortVideo,
      .nockageShortEmbed,
      .nockageShortShade{
        border-radius:0;
      }

      .nockageShortActions{
        right:8px;
        bottom:15px;
        gap:9px;
      }

      .nockageShortInfo{
        left:12px;
        right:65px;
        bottom:15px;
      }

      .nockageShortAction,
      .nockageShortOpen{
        width:45px;
        height:45px;
      }

      .nockageShortControls{
        right:7px;
        bottom:120px;

        top:auto;
        transform:none;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}

// ============================================================
// SHORTS HELPERS
// ============================================================

function getShortVideo(item) {
  return item?.querySelector(
    ".nockageShortVideo"
  );
}

function loadShortVideo(video) {
  if (
    video &&
    !video.src &&
    video.dataset.src
  ) {
    video.src =
      video.dataset.src;

    video.load();
  }
}

function pauseAllShorts() {
  document
    .querySelectorAll(
      ".nockageShortVideo"
    )
    .forEach(video => {
      try {
        video.pause();
      } catch {}
    });
}

function updateShortsButtons() {
  const previous =
    $("nockageShortPrevious");

  const next =
    $("nockageShortNext");

  if (previous) {
    previous.classList.toggle(
      "disabled",
      shortsIndex <= 0
    );
  }

  if (next) {
    next.classList.toggle(
      "disabled",
      shortsIndex >=
        shortsItems.length - 1
    );
  }
}

function playShortAt(index) {
  if (!shortsItems.length) {
    return;
  }

  shortsIndex =
    Math.max(
      0,
      Math.min(
        index,
        shortsItems.length - 1
      )
    );

  shortsItems.forEach(
    (item, i) => {
      item.classList.toggle(
        "active",
        i === shortsIndex
      );
    }
  );

  pauseAllShorts();

  const video =
    getShortVideo(
      shortsItems[shortsIndex]
    );

  if (video) {
    loadShortVideo(video);

    video.muted =
      true;

    video
      .play()
      .catch(() => {});
  }

  updateShortsButtons();
}

function nextShort() {
  if (
    shortsIndex <
    shortsItems.length - 1
  ) {
    playShortAt(
      shortsIndex + 1
    );
  }
}

function previousShort() {
  if (
    shortsIndex > 0
  ) {
    playShortAt(
      shortsIndex - 1
    );
  }
}

function makeShortControls() {
  document
    .querySelectorAll(
      ".nockageShortControls"
    )
    .forEach(el =>
      el.remove()
    );

  const pageEl =
    $("shorts");

  if (!pageEl) {
    return;
  }

  const controls =
    document.createElement(
      "div"
    );

  controls.className =
    "nockageShortControls";

  controls.innerHTML = `
    <button
      id="nockageShortPrevious"
      class="nockageShortNavButton"
      type="button"
      aria-label="Previous Short"
      title="Previous Short"
    >
      ↑
    </button>

    <button
      id="nockageShortNext"
      class="nockageShortNavButton"
      type="button"
      aria-label="Next Short"
      title="Next Short"
    >
      ↓
    </button>
  `;

  pageEl.appendChild(
    controls
  );

  $("nockageShortPrevious")
    ?.addEventListener(
      "click",
      previousShort
    );

  $("nockageShortNext")
    ?.addEventListener(
      "click",
      nextShort
    );

  updateShortsButtons();
}

function enterShortsMode() {
  $("shorts")
    ?.classList.add(
      "nockageShortsActive"
    );

  document.body.classList.add(
    "nockageShortsMode"
  );

  makeShortControls();
}

function exitShortsMode() {
  $("shorts")
    ?.classList.remove(
      "nockageShortsActive"
    );

  document.body.classList.remove(
    "nockageShortsMode"
  );

  pauseAllShorts();

  document
    .querySelectorAll(
      ".nockageShortControls"
    )
    .forEach(el =>
      el.remove()
    );

  shortsItems = [];
  shortsIndex = 0;
}

// ============================================================
// SHORTS INPUT
// Wheel + Arrow Keys + Swipe
// ============================================================

function setupShortsInput() {

  document.addEventListener(
    "wheel",
    event => {

      const shortsPage =
        $("shorts");

      if (
        !shortsPage ||
        !shortsPage.classList.contains(
          "active"
        )
      ) {
        return;
      }

      if (
        shortsWheelLock
      ) {
        event.preventDefault();
        return;
      }

      if (
        Math.abs(
          event.deltaY
        ) < 20
      ) {
        return;
      }

      event.preventDefault();

      shortsWheelLock =
        true;

      if (
        event.deltaY > 0
      ) {
        nextShort();
      } else {
        previousShort();
      }

      setTimeout(
        () => {
          shortsWheelLock =
            false;
        },
        500
      );
    },
    {
      passive:false
    }
  );

  document.addEventListener(
    "keydown",
    event => {

      const shortsPage =
        $("shorts");

      if (
        !shortsPage ||
        !shortsPage.classList.contains(
          "active"
        )
      ) {
        return;
      }

      if (
        event.target.matches(
          "input,textarea,select"
        )
      ) {
        return;
      }

      if (
        event.key ===
        "ArrowDown"
      ) {
        event.preventDefault();
        nextShort();
      }

      if (
        event.key ===
        "ArrowUp"
      ) {
        event.preventDefault();
        previousShort();
      }
    }
  );

  document.addEventListener(
    "touchstart",
    event => {

      const shortsPage =
        $("shorts");

      if (
        !shortsPage ||
        !shortsPage.classList.contains(
          "active"
        )
      ) {
        return;
      }

      if (!event.touches.length) {
        return;
      }

      touchStartY =
        event.touches[0].clientY;

      touchStartX =
        event.touches[0].clientX;
    },
    {
      passive:true
    }
  );

  document.addEventListener(
    "touchend",
    event => {

      const shortsPage =
        $("shorts");

      if (
        !shortsPage ||
        !shortsPage.classList.contains(
          "active"
        )
      ) {
        return;
      }

      if (
        !event.changedTouches.length
      ) {
        return;
      }

      const endY =
        event
          .changedTouches[0]
          .clientY;

      const endX =
        event
          .changedTouches[0]
          .clientX;

      const diffY =
        touchStartY -
        endY;

      const diffX =
        touchStartX -
        endX;

      if (
        Math.abs(diffY) < 45 ||
        Math.abs(diffY) <
          Math.abs(diffX)
      ) {
        return;
      }

      if (diffY > 0) {
        nextShort();
      } else {
        previousShort();
      }
    },
    {
      passive:true
    }
  );
}

// ============================================================
// AUTH
// ============================================================

function openAuth(signup = false) {
  const modal =
    $("authModal");

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "hidden"
  );

  if ($("authTitle")) {
    $("authTitle")
      .textContent =
        signup
          ? "Create your Nockage account"
          : "Log in to Nockage";
  }

  if ($("authSubmit")) {
    $("authSubmit")
      .textContent =
        signup
          ? "Create account"
          : "Log in";
  }

  if ($("switchAuth")) {
    $("switchAuth")
      .textContent =
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

  const label =
    $("usernameLabel");

  if (username) {
    username.style.display =
      signup
        ? ""
        : "none";

    username.required =
      signup;
  }

  if (label) {
    label.style.display =
      signup
        ? ""
        : "none";
  }

  if ($("authHint")) {
    $("authHint")
      .textContent =
        "";
  }
}

function closeAuth() {
  $("authModal")
    ?.classList.add(
      "hidden"
    );
}

function setupAuth() {

  $("closeAuth")
    ?.addEventListener(
      "click",
      closeAuth
    );

  $("authModal")
    ?.addEventListener(
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

  $("switchAuth")
    ?.addEventListener(
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

  $("authForm")
    ?.addEventListener(
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
          password.length < 8
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
              data:existing,
              error:usernameError
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
              usernameError &&
              usernameError.code !==
                "PGRST116"
            ) {
              throw usernameError;
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
                options:{
                  data:{
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

            await sb
              .from("profiles")
              .upsert(
                {
                  id:user.id,
                  username,
                  display_name:
                    username
                },
                {
                  onConflict:
                    "id"
                }
              );

            if (data?.session) {

              await setUser(
                user
              );

              toast(
                "Welcome to Nockage!"
              );

            } else {

              toast(
                "Account created! Check your email if verification is enabled."
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
            "Auth error:",
            error
          );

          if ($("authHint")) {
            $("authHint")
              .textContent =
                getErrorMessage(
                  error,
                  "Authentication failed."
                );
          } else {
            toast(
              getErrorMessage(
                error,
                "Authentication failed."
              )
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
// USER / PROFILE
// ============================================================

async function loadProfile(
  userId
) {
  if (
    !ready ||
    !sb ||
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
        "Profile error:",
        error
      );

      return null;
    }

    return data ||
      null;

  } catch (error) {

    console.error(
      "Profile exception:",
      error
    );

    return null;
  }
}

async function setUser(
  user
) {
  currentUser =
    user || null;

  profile =
    null;

  if (currentUser) {

    profile =
      await loadProfile(
        currentUser.id
      );

    if (!profile) {

      const username =
        currentUser
          .user_metadata
          ?.username ||
        currentUser
          .email
          ?.split("@")[0] ||
        `user_${String(
          currentUser.id
        ).slice(0,8)}`;

      const safeUsername =
        username
          .replace(
            /[^A-Za-z0-9_]/g,
            "_"
          )
          .slice(
            0,
            24
          );

      const {
        data
      } =
        await sb
          .from("profiles")
          .upsert(
            {
              id:
                currentUser.id,
              username:
                safeUsername,
              display_name:
                safeUsername
            },
            {
              onConflict:"id"
            }
          )
          .select("*")
          .maybeSingle();

      profile =
        data ||
        null;
    }
  }

  renderAccount();
}

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
        ${esc(
          username
        )}
      </a>

      <button
        class="primary"
        id="quickLogout"
        type="button"
      >
        Log out
      </button>
    `;

    $("quickLogout")
      ?.addEventListener(
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

    $("loginBtn")
      ?.addEventListener(
        "click",
        () => openAuth(false)
      );

    $("signupBtn")
      ?.addEventListener(
        "click",
        () => openAuth(true)
      );
  }
}

async function logout() {

  try {

    if (
      ready &&
      sb
    ) {
      await sb.auth.signOut();
    }

  } catch (error) {

    console.error(
      "Logout:",
      error
    );
  }

  currentUser =
    null;

  profile =
    null;

  renderAccount();
  updateNavigationState();

  setHash(
    "home"
  );

  toast(
    "Logged out."
  );
}

// ============================================================
// VIDEO QUERY
// ============================================================

async function queryVideos(
  options = {}
) {
  if (!ready || !sb) {
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
        profiles:profiles!videos_user_id_fkey (
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
          ascending:false
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
      "Video query error:",
      error
    );

    return [];
  }

  return data ||
    [];
}

// ============================================================
// LIKE COUNTS
// ============================================================

async function getLikeCount(
  videoId
) {

  if (
    !ready ||
    !sb ||
    !videoId
  ) {
    return 0;
  }

  const {
    count,
    error
  } =
    await sb
      .from("likes")
      .select(
        "video_id",
        {
          count:"exact",
          head:true
        }
      )
      .eq(
        "video_id",
        videoId
      );

  if (error) {
    console.warn(
      "Like count:",
      error
    );

    return 0;
  }

  return Number(
    count || 0
  );
}

async function getLikeCounts(
  ids
) {

  const result =
    {};

  ids.forEach(
    id =>
      result[String(id)] =
        0
  );

  if (
    !ready ||
    !sb ||
    !ids.length
  ) {
    return result;
  }

  const {
    data,
    error
  } =
    await sb
      .from("likes")
      .select(
        "video_id"
      )
      .in(
        "video_id",
        ids
      );

  if (error) {
    return result;
  }

  (data || []).forEach(
    row => {

      const key =
        String(
          row.video_id
        );

      result[key] =
        (result[key] || 0) +
        1;
    }
  );

  return result;
}

async function getLikedSet(
  ids
) {

  const liked =
    new Set();

  if (
    !currentUser ||
    !ready ||
    !sb ||
    !ids.length
  ) {
    return liked;
  }

  const {
    data,
    error
  } =
    await sb
      .from("likes")
      .select(
        "video_id"
      )
      .eq(
        "user_id",
        currentUser.id
      )
      .in(
        "video_id",
        ids
      );

  if (!error) {

    (data || []).forEach(
      row =>
        liked.add(
          String(
            row.video_id
          )
        )
    );
  }

  return liked;
}

// ============================================================
// MEDIA
// ============================================================

function mediaHtml(
  video,
  className =
    "watchVideo"
) {

  const url =
    esc(
      video.video_url
    );

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
        class="${className}"
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
      class="${className}"
      controls
      playsinline
      preload="metadata"
      src="${url}"
    ></video>
  `;
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
      aria-label="Watch ${esc(
        video.title
      )}"
    >

      ${
        video.thumbnail_url
          ? `
            <img
              class="thumb"
              src="${esc(
                video.thumbnail_url
              )}"
              alt=""
              loading="lazy"
            >
          `
          : `
            <div class="thumb"></div>
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
      shorts:false
    });

  grid.innerHTML =
    videos.length
      ? videos
          .map(
            video =>
              videoCard(
                video
              )
          )
          .join("")
      : `
        <div class="empty">
          No public videos yet.
          Create the first one!
        </div>
      `;

  if ($("homeCount")) {
    $("homeCount")
      .textContent =
        videos.length
          ? `${videos.length} videos`
          : "";
  }
}

// ============================================================
// SHORTS
// ============================================================

async function loadShorts() {

  const grid =
    $("shortsGrid");

  if (!grid) {
    return;
  }

  ensureShortsStyles();

  exitShortsMode();

  grid.innerHTML = `
    <div class="nockageShortsPage">

      <div class="nockageShortsFeed">

        <div class="nockageShortEmpty">
          Loading Shorts...
        </div>

      </div>

    </div>
  `;

  const videos =
    await queryVideos({
      shorts:true,
      limit:50
    });

  if (!videos.length) {

    grid.innerHTML = `
      <div class="nockageShortsPage">

        <div class="nockageShortEmpty">
          No Shorts yet.<br>
          Be the first to publish one!
        </div>

      </div>
    `;

    enterShortsMode();
    makeShortControls();

    return;
  }

  const ids =
    videos.map(
      video =>
        String(
          video.id
        )
    );

  const [
    likeCounts,
    likedSet
  ] =
    await Promise.all([
      getLikeCounts(
        ids
      ),
      getLikedSet(
        ids
      )
    ]);

  grid.innerHTML = `
    <div class="nockageShortsPage">

      <div class="nockageShortsFeed">

        ${videos
          .map(
            (
              video,
              index
            ) => {

              const creator =
                video.profiles?.display_name ||
                video.profiles?.username ||
                "Creator";

              const key =
                String(
                  video.id
                );

              const isLiked =
                likedSet.has(
                  key
                );

              const embed =
                isEmbedUrl(
                  video.video_url
                );

              return `
                <article
                  class="nockageShortItem ${
                    index === 0
                      ? "active"
                      : ""
                  }"
                  data-short-id="${esc(
                    video.id
                  )}"
                  data-short-index="${index}"
                >

                  ${
                    embed
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
                          loading="${
                            index === 0
                              ? "eager"
                              : "lazy"
                          }"
                        ></iframe>
                      `
                      : `
                        <video
                          class="nockageShortVideo"
                          playsinline
                          muted
                          loop
                          preload="${
                            index === 0
                              ? "metadata"
                              : "none"
                          }"
                          ${
                            index === 0
                              ? `src="${esc(
                                  video.video_url
                                )}"`
                              : `data-src="${esc(
                                  video.video_url
                                )}"`
                          }
                        ></video>
                      `
                  }

                  <div
                    class="nockageShortShade"
                  ></div>

                  ${
                    !embed
                      ? `
                        <button
                          class="nockageShortMute"
                          type="button"
                          data-short-mute="${esc(
                            video.id
                          )}"
                        >
                          🔇
                        </button>
                      `
                      : ""
                  }

                  <div
                    class="nockageShortInfo"
                  >

                    <div
                      class="nockageShortBadge"
                    >
                      SHORT
                    </div>

                    <div
                      class="nockageShortCreator"
                    >
                      @${esc(
                        video.profiles?.username ||
                        creator
                      )}
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
                      class="nockageShortViews"
                    >
                      ${fmt(
                        video.views
                      )} views
                    </div>

                  </div>

                  <div
                    class="nockageShortActions"
                  >

                    <button
                      class="nockageShortAction ${
                        isLiked
                          ? "shortLiked"
                          : ""
                      }"
                      type="button"
                      data-short-like="${esc(
                        video.id
                      )}"
                      aria-pressed="${
                        isLiked
                      }"
                    >
                      ${
                        isLiked
                          ? "♥"
                          : "♡"
                      }
                    </button>

                    <span
                      class="nockageShortLikeCount"
                      data-short-like-count="${esc(
                        video.id
                      )}"
                    >
                      ${fmt(
                        likeCounts[key] ||
                        0
                      )}
                    </span>

                    <button
                      class="nockageShortAction"
                      type="button"
                      data-short-open="${esc(
                        video.id
                      )}"
                    >
                      ↗
                    </button>

                    <a
                      class="nockageShortOpen"
                      href="#profile/${encodeURIComponent(
                        video.user_id
                      )}"
                      title="Creator"
                    >
                      👤
                    </a>

                  </div>

                </article>
              `;
            }
          )
          .join("")}

      </div>

    </div>
  `;

  shortsItems =
    Array.from(
      grid.querySelectorAll(
        ".nockageShortItem"
      )
    );

  enterShortsMode();
  makeShortControls();
  playShortAt(0);

  grid
    .querySelectorAll(
      "[data-short-open]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            const id =
              button.dataset
                .shortOpen;

            if (id) {

              setHash(
                `watch/${encodeURIComponent(
                  id
                )}`
              );
            }
          }
        );
      }
    );

  grid
    .querySelectorAll(
      "[data-short-like]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          async event => {

            event.stopPropagation();

            const id =
              button.dataset
                .shortLike;

            if (!currentUser) {
              return openAuth(false);
            }

            if (!requireSupabase()) {
              return;
            }

            const countEl =
              grid.querySelector(
                `[data-short-like-count="${CSS.escape(
                  id
                )}"]`
              );

            let count =
              Number(
                countEl?.textContent ||
                0
              );

            const wasLiked =
              button.classList.contains(
                "shortLiked"
              );

            button.disabled =
              true;

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
                      id
                    )
                    .eq(
                      "user_id",
                      currentUser.id
                    );

                if (error) {
                  throw error;
                }

                count =
                  Math.max(
                    0,
                    count - 1
                  );

                button.classList.remove(
                  "shortLiked"
                );

                button.textContent =
                  "♡";

                button.setAttribute(
                  "aria-pressed",
                  "false"
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
                      video_id:id,
                      user_id:
                        currentUser.id
                    });

                if (error) {
                  throw error;
                }

                count += 1;

                button.classList.add(
                  "shortLiked"
                );

                button.textContent =
                  "♥";

                button.setAttribute(
                  "aria-pressed",
                  "true"
                );

                toast(
                  "Liked!"
                );
              }

              if (countEl) {
                countEl.textContent =
                  fmt(count);
              }

            } catch (error) {

              console.error(
                "Short like:",
                error
              );

              toast(
                getErrorMessage(
                  error,
                  "Could not update like."
                )
              );

            } finally {

              button.disabled =
                false;
            }
          }
        );
      }
    );

  grid
    .querySelectorAll(
      "[data-short-mute]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            const item =
              button.closest(
                ".nockageShortItem"
              );

            const video =
              getShortVideo(
                item
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
      }
    );

  grid
    .querySelectorAll(
      ".nockageShortVideo"
    )
    .forEach(
      video => {

        video.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            if (
              video.paused
            ) {

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
      }
    );
}

// ============================================================
// VIDEO / SUBSCRIPTIONS / SEARCH
// ============================================================

async function loadSubs() {

  const grid =
    $("subsGrid");

  if (!grid) {
    return;
  }

  if (!currentUser) {

    grid.innerHTML = "";

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
      .from(
        "subscriptions"
      )
      .select(
        "creator_id"
      )
      .eq(
        "subscriber_id",
        currentUser.id
      );

  if (error) {

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

  if (!creatorIds.length) {

    grid.innerHTML = "";

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
            creator:id,
            shorts:false
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
                video
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

async function searchVideos(
  queryText
) {

  const query =
    String(
      queryText || ""
    ).trim();

  page(
    "search"
  );

  if ($("searchLabel")) {

    $("searchLabel")
      .textContent =
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
      shorts:false,
      search:query,
      limit:50
    });

  grid.innerHTML =
    videos.length
      ? videos
          .map(
            video =>
              videoCard(
                video
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

  if (!requireSupabase()) {

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
    data:video,
    error
  } =
    await sb
      .from("videos")
      .select(`
        *,
        profiles:profiles!videos_user_id_fkey (
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

  // ==========================================================
  // CREATOR VIEW PROTECTION
  // ==========================================================

  const isCreator =
    Boolean(
      currentUser
    ) &&
    String(
      currentUser.id
    ) ===
    String(
      video.user_id
    );

  const oldViews =
    Number(
      video.views || 0
    );

  if (!isCreator) {

    const {
      error:viewError
    } =
      await sb
        .from("videos")
        .update({
          views:
            oldViews + 1
        })
        .eq(
          "id",
          id
        )
        .eq(
          "visibility",
          "public"
        );

    if (!viewError) {
      video.views =
        oldViews + 1;
    }
  }

  let liked =
    false;

  let subscribed =
    false;

  if (currentUser) {

    const {
      data:like
    } =
      await sb
        .from("likes")
        .select(
          "video_id"
        )
        .eq(
          "video_id",
          id
        )
        .eq(
          "user_id",
          currentUser.id
        )
        .maybeSingle();

    liked =
      Boolean(
        like
      );

    if (!isCreator) {

      const {
        data:sub
      } =
        await sb
          .from(
            "subscriptions"
          )
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
        Boolean(
          sub
        );
    }
  }

  const likeCount =
    await getLikeCount(
      id
    );

  const comments =
    video.allow_comments === false
      ? []
      : await loadComments(
          id
        );

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
            class="ghost ${
              liked
                ? "nockageLiked"
                : ""
            }"
            id="likeBtn"
            aria-pressed="${
              liked
            }"
          >
            ${
              liked
                ? "♥ Liked"
                : "♡ Like"
            }

            <span
              id="likeCount"
              class="nockageWatchLikeCount"
            >
              ${fmt(
                likeCount
              )}
            </span>
          </button>

          <button
            type="button"
            class="ghost"
            id="repostBtn"
          >
            ↻ Repost
          </button>

          ${
            isCreator
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
          video.allow_comments === false
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

              <div
                id="comments"
              >

                ${
                  comments.length
                    ? comments
                        .map(
                          comment =>
                            `
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
                      <p
                        class="muted"
                      >
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

  $("likeBtn")
    ?.addEventListener(
      "click",
      async () => {

        if (!currentUser) {
          return openAuth(
            false
          );
        }

        if (!requireSupabase()) {
          return;
        }

        const button =
          $("likeBtn");

        const countEl =
          $("likeCount");

        if (!button) {
          return;
        }

        const wasLiked =
          button.classList.contains(
            "nockageLiked"
          );

        let count =
          Number(
            countEl?.textContent ||
            0
          );

        button.disabled =
          true;

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
                  id
                )
                .eq(
                  "user_id",
                  currentUser.id
                );

            if (error) {
              throw error;
            }

            count =
              Math.max(
                0,
                count - 1
              );

            button.classList.remove(
              "nockageLiked"
            );

            button.setAttribute(
              "aria-pressed",
              "false"
            );

            const nodes =
              Array.from(
                button.childNodes
              );

            if (
              nodes.length
            ) {
              nodes[0].textContent =
                "♡ Like ";
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
                    id,
                  user_id:
                    currentUser.id
                });

            if (error) {
              throw error;
            }

            count += 1;

            button.classList.add(
              "nockageLiked"
            );

            button.setAttribute(
              "aria-pressed",
              "true"
            );

            const nodes =
              Array.from(
                button.childNodes
              );

            if (
              nodes.length
            ) {
              nodes[0].textContent =
                "♥ Liked ";
            }

            toast(
              "Liked!"
            );
          }

          if (countEl) {
            countEl.textContent =
              fmt(count);
          }

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

        } finally {

          button.disabled =
            false;
        }
      }
    );

  $("repostBtn")
    ?.addEventListener(
      "click",
      () =>
        repost(
          id
        )
    );

  $("subBtn")
    ?.addEventListener(
      "click",
      () =>
        toggleSub(
          video.user_id,
          subscribed
        )
    );

  $("watchDeleteBtn")
    ?.addEventListener(
      "click",
      () =>
        openDeleteModal(
          video
        )
    );

  $("commentForm")
    ?.addEventListener(
      "submit",
      async event => {

        event.preventDefault();

        if (!currentUser) {
          return openAuth(false);
        }

        if (!requireSupabase()) {
          return;
        }

        const input =
          $("commentInput");

        const text =
          input?.value.trim() ||
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

        try {

          const {
            error
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

          if (error) {
            throw error;
          }

          toast(
            "Comment posted."
          );

          await showWatch(
            id
          );

        } catch (error) {

          toast(
            getErrorMessage(
              error,
              "Could not post comment."
            )
          );
        }
      }
    );
}

async function loadComments(
  videoId
) {

  const {
    data,
    error
  } =
    await sb
      .from("comments")
      .select(`
        id,
        text,
        created_at,
        user_id,
        profiles:profiles!comments_user_id_fkey (
          username,
          display_name
        )
      `)
      .eq(
        "video_id",
        videoId
      )
      .order(
        "created_at",
        {
          ascending:false
        }
      )
      .limit(50);

  if (error) {
    console.warn(
      "Comments:",
      error
    );

    return [];
  }

  return data ||
    [];
}

// ============================================================
// SUBSCRIBE / REPOST
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

  if (!requireSupabase()) {
    return;
  }

  if (
    String(
      creatorId
    ) ===
    String(
      currentUser.id
    )
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
          .from(
            "subscriptions"
          )
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
          .from(
            "subscriptions"
          )
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
      "watch"
    ) {

      await showWatch(
        parts[1]
      );

    } else if (
      parts[0] ===
      "profile"
    ) {

      await showProfile(
        parts[1]
      );

    } else {

      await loadSubs();
    }

  } catch (error) {

    console.error(
      "Subscribe:",
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

async function repost(
  videoId
) {

  if (!currentUser) {
    return openAuth(false);
  }

  if (!requireSupabase()) {
    return;
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

    toast(
      getErrorMessage(
        error,
        "Could not repost."
      )
    );
  }
}

// ============================================================
// PROFILE
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

  if (!requireSupabase()) {
    return;
  }

  container.innerHTML = `
    <div class="empty">
      Loading profile...
    </div>
  `;

  const {
    data:creator,
    error
  } =
    await sb
      .from("profiles")
      .select("*")
      .eq(
        "id",
        id
      )
      .maybeSingle();

  if (error) {

    container.innerHTML = `
      <div class="empty">
        ${esc(
          error.message
        )}
      </div>
    `;

    return;
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
      creator:id,
      shorts:false
    });

  const shorts =
    await queryVideos({
      creator:id,
      shorts:true,
      limit:50
    });

  const {
    count:subscribers
  } =
    await sb
      .from(
        "subscriptions"
      )
      .select(
        "*",
        {
          count:
            "exact",
          head:true
        }
      )
      .eq(
        "creator_id",
        id
      );

  const mine =
    String(
      currentUser?.id
    ) ===
    String(
      id
    );

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
        .from(
          "subscriptions"
        )
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
      Boolean(
        data
      );
  }

  container.innerHTML = `
    <div class="profileHead">

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

    <div class="sectionHead">

      <h2>
        Videos
      </h2>

    </div>

    <div class="videoGrid">

      ${
        videos.length
          ? videos
              .map(
                v =>
                  videoCard(
                    v
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
          <div class="sectionHead">

            <h2>
              Shorts
            </h2>

          </div>

          <div class="videoGrid">

            ${
              shorts
                .map(
                  v =>
                    videoCard(
                      v,
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

    $("profileSub")
      ?.addEventListener(
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
    page("home");
    openAuth(false);
    return;
  }

  if (!requireSupabase()) {
    return;
  }

  const stats =
    $("studioStats");

  const videoList =
    $("studioVideos");

  if (
    !stats ||
    !videoList
  ) {
    return;
  }

  stats.innerHTML = `
    <div class="stat">
      <span>Loading</span>
      <b>...</b>
    </div>
  `;

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
          ascending:false
        }
      );

  if (error) {

    videoList.innerHTML = `
      <p class="muted">
        ${esc(
          error.message
        )}
      </p>
    `;

    return;
  }

  const all =
    data ||
    [];

  const videos =
    all.filter(
      video =>
        video.is_short !== true
    );

  const shorts =
    all.filter(
      video =>
        video.is_short === true
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
    count:subscribers
  } =
    await sb
      .from(
        "subscriptions"
      )
      .select(
        "*",
        {
          count:"exact",
          head:true
        }
      )
      .eq(
        "creator_id",
        currentUser.id
      );

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

  videoList.innerHTML =
    all.length
      ? all
          .map(
            video =>
              `
                <div
                  class="comment"
                >

                  <div>

                    <b>
                      ${esc(
                        video.title
                      )}
                    </b>

                    <span
                      class="pill"
                    >
                      ${
                        video.is_short
                          ? "Short"
                          : "Video"
                      }
                    </span>

                    <span
                      class="pill"
                    >
                      ${esc(
                        video.visibility ||
                        "Public"
                      )}
                    </span>

                    <span
                      class="muted"
                    >
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

            const video =
              all.find(
                item =>
                  String(
                    item.id
                  ) ===
                  String(
                    button.dataset
                      .deleteVideoId
                  )
              );

            if (video) {
              openDeleteModal(
                video
              );
            }
          }
        );
      }
    );
}

// ============================================================
// DELETE MODAL
// ============================================================

function setupDeleteModal() {

  if ($("nockageDeleteModal")) {
    return;
  }

  const modal =
    document.createElement(
      "div"
    );

  modal.id =
    "nockageDeleteModal";

  modal.className =
    "modal hidden";

  modal.innerHTML = `
    <div
      class="modalCard"
    >

      <button
        class="close"
        id="nockageCancelDelete"
        type="button"
        aria-label="Close"
      >
        ×
      </button>

      <h2
        id="nockageDeleteTitle"
      >
        Delete video?
      </h2>

      <p
        id="nockageDeleteText"
        class="muted"
      >
        This action cannot be undone.
      </p>

      <button
        class="primary wide"
        id="nockageConfirmDelete"
        type="button"
      >
        Delete
      </button>

    </div>
  `;

  document.body.appendChild(
    modal
  );

  $("nockageCancelDelete")
    ?.addEventListener(
      "click",
      closeDeleteModal
    );

  $("nockageConfirmDelete")
    ?.addEventListener(
      "click",
      confirmDelete
    );

  modal.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        modal &&
        !deleteBusy
      ) {
        closeDeleteModal();
      }
    }
  );
}

function openDeleteModal(
  video
) {

  if (!video) {
    return;
  }

  setupDeleteModal();

  deleteTarget =
    video;

  $("nockageDeleteTitle")
    .textContent =
      video.is_short
        ? "Delete Short?"
        : "Delete video?";

  $("nockageDeleteText")
    .innerHTML = `
      Are you sure you want to permanently delete
      <strong>
        ${esc(
          video.title ||
          "this video"
        )}
      </strong>?
    `;

  $("nockageDeleteModal")
    .classList.remove(
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

  if (
    deleteBusy ||
    !deleteTarget
  ) {
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
    String(
      video.user_id
    ) !==
    String(
      currentUser.id
    )
  ) {

    return toast(
      "You can only delete your own videos."
    );
  }

  deleteBusy =
    true;

  const button =
    $("nockageConfirmDelete");

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Deleting...";
  }

  try {

    const {
      error
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

    if (error) {
      throw error;
    }

    if (
      video.storage_path
    ) {

      await sb.storage
        .from("Videos")
        .remove([
          video.storage_path
        ]);
    }

    if (
      video.thumbnail_path
    ) {

      await sb.storage
        .from("Videos")
        .remove([
          video.thumbnail_path
        ]);
    }

    closeDeleteModal();

    toast(
      video.is_short
        ? "Short deleted successfully."
        : "Video deleted successfully."
    );

    const route =
      getHashParts()[0];

    if (
      route ===
      "watch"
    ) {

      setHash(
        "home"
      );

    } else if (
      route ===
      "shorts"
    ) {

      await loadShorts();

    } else {

      await loadStudio();
    }

  } catch (error) {

    console.error(
      "Delete error:",
      error
    );

    toast(
      getErrorMessage(
        error,
        "Could not delete the video."
      )
    );

  } finally {

    deleteBusy =
      false;

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Delete";
    }
  }
}

// ============================================================
// UPLOAD
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

    $("uploadTitle")
      .textContent =
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
          upsert:false
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

  if (!data?.publicUrl) {
    throw new Error(
      "Could not create public file URL."
    );
  }

  return data.publicUrl;
}

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

  $("videoFile")
    ?.addEventListener(
      "change",
      event => {

        const file =
          event.target.files?.[0];

        if ($("fileInfo")) {

          $("fileInfo")
            .textContent =
              file
                ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`
                : "Maximum 50 MB on the free backend.";
        }
      }
    );

  $("thumbFile")
    ?.addEventListener(
      "change",
      event => {

        const file =
          event.target.files?.[0];

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

  $("uploadForm")
    ?.addEventListener(
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
            ?.files?.[0];

        const thumbnailFile =
          $("thumbFile")
            ?.files?.[0];

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

        const button =
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

        let uploadedVideoPath =
          null;

        let uploadedThumbnailPath =
          null;

        if (button) {

          button.disabled =
            true;

          button.textContent =
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

          uploadedVideoPath =
            `${currentUser.id}/${crypto.randomUUID()}-${cleanFilename(
              videoFile.name
            )}`;

          if (progressBar) {

            progressBar.style.width =
              "15%";
          }

          const videoUrl =
            await uploadToStorage(
              "Videos",
              uploadedVideoPath,
              videoFile
            );

          if (progressBar) {

            progressBar.style.width =
              "60%";
          }

          let thumbnailUrl =
            null;

          if (thumbnailFile) {

            uploadedThumbnailPath =
              `${currentUser.id}/thumbnails/${crypto.randomUUID()}-${cleanFilename(
                thumbnailFile.name
              )}`;

            thumbnailUrl =
              await uploadToStorage(
                "Videos",
                uploadedThumbnailPath,
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
                  uploadedVideoPath,
                thumbnail_url:
                  thumbnailUrl,
                thumbnail_path:
                  uploadedThumbnailPath,
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

            $("fileInfo")
              .textContent =
                "Maximum 50 MB on the free backend.";
          }

          setHash(
            publishedAsShort
              ? "shorts"
              : "home"
          );

        } catch (error) {

          console.error(
            "Upload error:",
            error
          );

          try {

            const paths =
              [];

            if (
              uploadedVideoPath
            ) {

              paths.push(
                uploadedVideoPath
              );
            }

            if (
              uploadedThumbnailPath
            ) {

              paths.push(
                uploadedThumbnailPath
              );
            }

            if (paths.length) {

              await sb.storage
                .from("Videos")
                .remove(
                  paths
                );
            }

          } catch (
            cleanupError
          ) {

            console.warn(
              "Upload cleanup:",
              cleanupError
            );
          }

          toast(
            getErrorMessage(
              error,
              "Upload failed."
            )
          );

        } finally {

          if (button) {

            button.disabled =
              false;

            button.textContent =
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
// BUTTONS
// ============================================================

function setupButtons() {

  $("heroUpload")
    ?.addEventListener(
      "click",
      () => {

        if (currentUser) {
          setHash(
            "upload"
          );
        } else {
          openAuth(false);
        }
      }
    );

  $("shortUpload")
    ?.addEventListener(
      "click",
      () => {

        if (!currentUser) {
          return openAuth(false);
        }

        setHash(
          "upload"
        );

        setTimeout(
          () => {
            setMode(
              "short"
            );
          },
          50
        );
      }
    );

  $("studioUpload")
    ?.addEventListener(
      "click",
      () => {

        if (!currentUser) {
          return openAuth(false);
        }

        setHash(
          "upload"
        );
      }
    );

  $("logoutBtn")
    ?.addEventListener(
      "click",
      logout
    );

  $("searchBtn")
    ?.addEventListener(
      "click",
      performSearch
    );

  $("searchInput")
    ?.addEventListener(
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
          "button,a,input,textarea,iframe,video"
        )
      ) {

        return;
      }

      const id =
        card.dataset.videoId;

      if (id) {

        setHash(
          `watch/${encodeURIComponent(
            id
          )}`
        );
      }
    }
  );

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
          "input,textarea,button,a,iframe,video"
        )
      ) {
        return;
      }

      event.preventDefault();

      const id =
        card.dataset.videoId;

      if (id) {

        setHash(
          `watch/${encodeURIComponent(
            id
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

  if (routeBusy) {

    routeQueued =
      true;

    return;
  }

  routeBusy =
    true;

  try {

    updateNavigationState();

    const parts =
      getHashParts();

    const route =
      parts[0] ||
      "home";

    if (
      route !==
      "shorts"
    ) {

      exitShortsMode();
    }

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

        if (!parts[1]) {

          setHash(
            "home"
          );

          break;
        }

        await showWatch(
          parts[1]
        );

        break;

      case "studio":

        if (!currentUser) {

          page(
            "home"
          );

          openAuth(false);

          break;
        }

        page(
          "studio"
        );

        await loadStudio();

        break;

      case "profile":

        if (!parts[1]) {

          setHash(
            "home"
          );

          break;
        }

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

          openAuth(false);

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

          openAuth(false);

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

    routeBusy =
      false;

    if (routeQueued) {

      routeQueued =
        false;

      setTimeout(
        routeApp,
        0
      );
    }
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

  ensureNavigationUI();
  ensureShortsStyles();
  ensureLikeStyles();
  setupShortsInput();
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
      await sb.auth
        .getSession();

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

        renderAccount();
        updateNavigationState();
      }
    );

  } catch (error) {

    console.error(
      "Supabase startup error:",
      error
    );

    toast(
      "Could not connect to Nockage."
    );
  }

  await routeApp();
}

// ============================================================
// EVENTS
// ============================================================

window.addEventListener(
  "hashchange",
  routeApp
);

window.addEventListener(
  "beforeunload",
  () => {
    pauseAllShorts();
  }
);

// ============================================================
// START
// ============================================================

boot();