// ============================================================
// NOCKAGE 1.3 — FULL APP.JS
// Videos + Shorts + Auth + Profiles + Uploads + Likes
// Comments + Subscriptions + Reposts + Search + Studio
// Delete + Routing + Supabase
// ============================================================

const NOCKAGE_CONFIG = {
  SUPABASE_URL: "https://ljveziwuxbiajxtguppy.supabase.co",
  SUPABASE_ANON_KEY:
    "sb_publishable_pF6Fs7rvL1C-ib1mg_MRxg_qWuX8Int"
};

// ============================================================
// SUPABASE
// ============================================================

const hasSupabase =
  typeof window !== "undefined" &&
  typeof window.supabase !== "undefined";

const ready =
  hasSupabase &&
  !!NOCKAGE_CONFIG.SUPABASE_URL &&
  !!NOCKAGE_CONFIG.SUPABASE_ANON_KEY;

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
let routeQueued = false;

let deleteTarget = null;
let deleteBusy = false;

let shortsObserver = null;

// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);

// ============================================================
// HELPERS
// ============================================================

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = String(message || "");
  el.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

function fmt(value) {
  const n = Number(value || 0);

  if (n >= 1e9)
    return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";

  if (n >= 1e6)
    return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";

  if (n >= 1e3)
    return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";

  return String(n);
}

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    char =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
  );
}

function page(id) {
  document.querySelectorAll(".page").forEach(el => {
    el.classList.remove("active");
  });

  const target = $(id);

  if (target) {
    target.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function requireSupabase() {
  if (!ready || !sb) {
    toast("Nockage is connecting to Supabase...");
    return false;
  }

  return true;
}

function getHashParts() {
  const raw = location.hash.replace(/^#/, "");

  if (!raw) return ["home"];

  return raw
    .split("/")
    .map(part => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    });
}

function setHash(route) {
  const hash = `#${route}`;

  if (location.hash === hash) {
    routeApp();
  } else {
    location.hash = hash;
  }
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

function cleanFilename(name) {
  return String(name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isEmbedUrl(url) {
  const value = String(url || "").toLowerCase();

  return (
    value.includes("/embed/") ||
    value.includes("fembed.co/embed/") ||
    value.includes("embed.vdohide") ||
    value.includes("/player/")
  );
}

// ============================================================
// SHORTS STYLES
// ============================================================

function ensureShortsStyles() {
  if ($("nockageShortsStyles")) return;

  const style = document.createElement("style");
  style.id = "nockageShortsStyles";

  style.textContent = `
    .nockageShortsPage {
      width:100%;
      height:calc(100vh - 80px);
      min-height:600px;

      overflow-y:auto;
      overflow-x:hidden;

      scroll-snap-type:y mandatory;

      background:#000;
      border-radius:18px;

      display:flex;
      justify-content:center;
    }

    .nockageShortsFeed {
      width:100%;

      display:flex;
      flex-direction:column;
      align-items:center;

      gap:20px;
      padding:20px 0;
    }

    /* =========================================
       PC SHORT — YOUTUBE SHORTS 9:16
    ========================================= */

    .nockageShortItem {
      width:min(430px,100%);

      aspect-ratio:9 / 16;

      height:auto;
      max-height:calc(100vh - 100px);

      position:relative;

      overflow:hidden;

      background:#000;

      border-radius:12px;

      scroll-snap-align:center;
      scroll-snap-stop:always;

      flex-shrink:0;
    }

    .nockageShortVideo,
    .nockageShortEmbed {
      position:absolute;

      inset:0;

      width:100%;
      height:100%;

      border:0;

      background:#000;

      object-fit:cover;
    }

    .nockageShortVideo {
      cursor:pointer;
    }

    .nockageShortShade {
      position:absolute;

      inset:0;

      pointer-events:none;

      background:
        linear-gradient(
          to bottom,
          rgba(0,0,0,.05) 35%,
          rgba(0,0,0,.78) 100%
        );
    }

    .nockageShortInfo {
      position:absolute;

      left:16px;
      right:76px;
      bottom:22px;

      color:#fff;

      z-index:3;
    }

    .nockageShortCreator {
      font-weight:800;
      font-size:16px;

      margin-bottom:8px;
    }

    .nockageShortTitle {
      font-size:18px;
      font-weight:700;

      line-height:1.3;

      margin-bottom:7px;
    }

    .nockageShortDescription {
      font-size:14px;

      color:rgba(255,255,255,.82);

      line-height:1.4;

      max-height:62px;

      overflow:hidden;

      margin-bottom:8px;
    }

    .nockageShortViews {
      font-size:13px;

      color:rgba(255,255,255,.7);
    }

    .nockageShortActions {
      position:absolute;

      right:12px;
      bottom:24px;

      z-index:5;

      display:flex;

      flex-direction:column;

      gap:12px;

      align-items:center;
    }

    .nockageShortAction {
      width:48px;
      height:48px;

      border:0;

      border-radius:50%;

      background:rgba(20,20,20,.72);

      color:#fff;

      cursor:pointer;

      font-size:21px;

      display:flex;

      align-items:center;
      justify-content:center;

      backdrop-filter:blur(8px);
    }

    .nockageShortAction:hover {
      transform:scale(1.05);
    }

    .nockageShortOpen {
      width:48px;
      height:48px;

      border-radius:50%;

      background:#fff;

      color:#111;

      display:flex;

      align-items:center;
      justify-content:center;

      text-decoration:none;

      font-weight:800;

      font-size:14px;
    }

    .nockageShortMute {
      position:absolute;

      top:18px;
      right:18px;

      z-index:5;

      width:42px;
      height:42px;

      border:0;

      border-radius:50%;

      background:rgba(0,0,0,.58);

      color:#fff;

      cursor:pointer;

      font-size:18px;
    }

    .nockageShortBadge {
      display:inline-block;

      padding:4px 8px;

      border-radius:999px;

      background:rgba(255,255,255,.16);

      color:#fff;

      font-size:11px;

      font-weight:900;

      margin-bottom:8px;

      backdrop-filter:blur(8px);
    }

    .nockageShortEmpty {
      min-height:500px;

      display:flex;

      align-items:center;
      justify-content:center;

      color:#888;

      padding:30px;

      text-align:center;
    }

    /* =========================================
       MOBILE — FULL SCREEN 9:16
    ========================================= */

    @media(max-width:700px) {

      .nockageShortsPage {
        border-radius:0;

        height:calc(100vh - 60px);

        min-height:500px;
      }

      .nockageShortsFeed {
        padding:0;

        gap:0;
      }

      .nockageShortItem {
        width:100%;

        height:calc(100vh - 60px);

        max-height:none;

        aspect-ratio:auto;

        border-radius:0;
      }

      .nockageShortInfo {
        left:14px;
        right:70px;
        bottom:18px;
      }

      .nockageShortActions {
        right:8px;
        bottom:18px;
      }
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// DELETE MODAL
// ============================================================

function setupDeleteModal() {
  if ($("nockageDeleteModal")) return;

  const style = document.createElement("style");

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
    }

    #nockageDeleteModal.hidden {
      display:none;
    }

    .nockageDeleteBox {
      width:min(460px,100%);
      background:#111;
      color:#fff;
      border:1px solid rgba(255,255,255,.12);
      border-radius:18px;
      padding:24px;
      box-shadow:0 25px 80px rgba(0,0,0,.45);
    }

    .nockageDeleteBox h2 {
      margin:0 0 10px;
    }

    .nockageDeleteBox p {
      margin:0 0 20px;
      color:rgba(255,255,255,.7);
      line-height:1.5;
    }

    .nockageDeleteButtons {
      display:flex;
      gap:10px;
      justify-content:flex-end;
    }

    .nockageDeleteButtons button {
      min-height:42px;
      padding:0 18px;
      border-radius:10px;
      border:0;
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

    .nockageDeleteButton {
      margin-top:10px;
      background:#e53935;
      color:#fff;
      border:0;
      border-radius:9px;
      padding:8px 12px;
      cursor:pointer;
      font-weight:700;
    }
  `;

  document.head.appendChild(style);

  const modal = document.createElement("div");

  modal.id = "nockageDeleteModal";
  modal.className = "hidden";

  modal.innerHTML = `
    <div class="nockageDeleteBox">
      <h2 id="nockageDeleteTitle">
        Delete video?
      </h2>

      <p id="nockageDeleteText">
        This action cannot be undone.
      </p>

      <div class="nockageDeleteButtons">
        <button id="nockageCancelDelete">
          Cancel
        </button>

        <button id="nockageConfirmDelete">
          Delete
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  $("nockageCancelDelete")?.addEventListener(
    "click",
    closeDeleteModal
  );

  $("nockageConfirmDelete")?.addEventListener(
    "click",
    confirmDelete
  );

  modal.addEventListener("click", event => {
    if (event.target === modal && !deleteBusy) {
      closeDeleteModal();
    }
  });
}

function openDeleteModal(video) {
  if (!video) return;

  setupDeleteModal();

  deleteTarget = video;

  $("nockageDeleteTitle").textContent =
    video.is_short ? "Delete Short?" : "Delete video?";

  $("nockageDeleteText").innerHTML = `
    Are you sure you want to permanently delete
    <strong>${esc(video.title || "this video")}</strong>?
    <br><br>
    The ${video.is_short ? "Short" : "video"} and its
    thumbnail will be removed.
  `;

  $("nockageDeleteModal").classList.remove("hidden");
}

function closeDeleteModal() {
  if (deleteBusy) return;

  $("nockageDeleteModal")?.classList.add("hidden");
  deleteTarget = null;
}

async function confirmDelete() {
  if (deleteBusy || !deleteTarget) return;

  if (!currentUser) {
    closeDeleteModal();
    return openAuth(false);
  }

  if (!requireSupabase()) return;

  const video = deleteTarget;

  if (String(video.user_id) !== String(currentUser.id)) {
    closeDeleteModal();
    return toast("You can only delete your own videos.");
  }

  deleteBusy = true;

  const button = $("nockageConfirmDelete");

  if (button) {
    button.disabled = true;
    button.textContent = "Deleting...";
  }

  try {
    const { error } = await sb
      .from("videos")
      .delete()
      .eq("id", video.id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    if (video.storage_path) {
      const { error: storageError } =
        await sb.storage
          .from("Videos")
          .remove([video.storage_path]);

      if (storageError) {
        console.warn(
          "Video storage cleanup:",
          storageError
        );
      }
    }

    if (video.thumbnail_path) {
      const { error: thumbnailError } =
        await sb.storage
          .from("Videos")
          .remove([video.thumbnail_path]);

      if (thumbnailError) {
        console.warn(
          "Thumbnail cleanup:",
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

    if (getHashParts()[0] === "watch") {
      setHash("home");
    } else {
      await loadStudio();
    }

  } catch (error) {
    console.error("Delete error:", error);

    toast(
      getErrorMessage(
        error,
        "Could not delete the video."
      )
    );

  } finally {
    deleteBusy = false;

    if (button) {
      button.disabled = false;
      button.textContent = "Delete";
    }
  }
}

// ============================================================
// PROFILE
// ============================================================

async function loadProfile(userId) {
  if (!ready || !sb || !userId) return null;

  try {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Profile error:", error);
      return null;
    }

    return data || null;

  } catch (error) {
    console.error("Profile exception:", error);
    return null;
  }
}

async function setUser(user) {
  currentUser = user || null;
  profile = null;

  if (currentUser) {
    profile = await loadProfile(currentUser.id);

    // If the profile doesn't exist, attempt to create it.
    if (!profile && ready && sb) {
      const username =
        currentUser.user_metadata?.username ||
        currentUser.email?.split("@")[0] ||
        `user_${String(currentUser.id).slice(0, 8)}`;

      const safeUsername =
        username
          .replace(/[^A-Za-z0-9_]/g, "_")
          .slice(0, 24);

      const { data } = await sb
        .from("profiles")
        .upsert(
          {
            id: currentUser.id,
            username: safeUsername,
            display_name: safeUsername
          },
          {
            onConflict: "id"
          }
        )
        .select("*")
        .maybeSingle();

      profile = data || null;
    }
  }

  renderAccount();
}

// ============================================================
// ACCOUNT UI
// ============================================================

function renderAccount() {
  const area = $("accountArea");

  if (!area) return;

  if (currentUser) {
    const username =
      profile?.username ||
      profile?.display_name ||
      "Account";

    area.innerHTML = `
      <a class="ghost" href="#studio">
        Studio
      </a>

      <a
        class="ghost"
        href="#profile/${encodeURIComponent(currentUser.id)}"
      >
        ${esc(username)}
      </a>

      <button class="primary" id="quickLogout">
        Log out
      </button>
    `;

    $("quickLogout")?.addEventListener(
      "click",
      logout
    );

  } else {
    area.innerHTML = `
      <button class="ghost" id="loginBtn">
        Log in
      </button>

      <button class="primary" id="signupBtn">
        Create account
      </button>
    `;

    $("loginBtn")?.addEventListener(
      "click",
      () => openAuth(false)
    );

    $("signupBtn")?.addEventListener(
      "click",
      () => openAuth(true)
    );
  }
}

async function logout() {
  try {
    if (ready && sb) {
      const { error } = await sb.auth.signOut();

      if (error) {
        console.error("Logout:", error);
      }
    }
  } catch (error) {
    console.error("Logout:", error);
  }

  currentUser = null;
  profile = null;

  renderAccount();

  setHash("home");

  toast("Logged out.");
}

// ============================================================
// AUTH MODAL
// ============================================================

function openAuth(signup = false) {
  const modal = $("authModal");

  if (!modal) return;

  modal.classList.remove("hidden");

  if ($("authTitle")) {
    $("authTitle").textContent =
      signup
        ? "Create your Nockage account"
        : "Log in to Nockage";
  }

  if ($("authSubmit")) {
    $("authSubmit").textContent =
      signup
        ? "Create account"
        : "Log in";
  }

  if ($("switchAuth")) {
    $("switchAuth").textContent =
      signup
        ? "Already have an account? Log in"
        : "New to Nockage? Create account";
  }

  const form = $("authForm");

  if (form) {
    form.dataset.signup = signup ? "1" : "0";
  }

  const username = $("authUsername");
  const usernameLabel = $("usernameLabel");

  if (username) {
    username.style.display = signup ? "" : "none";
    username.required = signup;
  }

  if (usernameLabel) {
    usernameLabel.style.display =
      signup ? "" : "none";
  }

  if ($("authHint")) {
    $("authHint").textContent = "";
  }
}

function closeAuth() {
  $("authModal")?.classList.add("hidden");
}

function setupAuth() {
  $("closeAuth")?.addEventListener(
    "click",
    closeAuth
  );

  $("authModal")?.addEventListener(
    "click",
    event => {
      if (event.target === $("authModal")) {
        closeAuth();
      }
    }
  );

  $("switchAuth")?.addEventListener(
    "click",
    () => {
      const signup =
        $("authForm")?.dataset.signup === "1";

      openAuth(!signup);
    }
  );

  $("authForm")?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (!requireSupabase()) return;

      const email =
        $("authEmail")?.value.trim() || "";

      const password =
        $("authPassword")?.value || "";

      const username =
        $("authUsername")?.value.trim() || "";

      const signup =
        $("authForm")?.dataset.signup === "1";

      if (!email) {
        return toast("Enter your email.");
      }

      if (password.length < 8) {
        return toast(
          "Password must be at least 8 characters."
        );
      }

      if (
        signup &&
        !/^[A-Za-z0-9_]{3,24}$/.test(username)
      ) {
        return toast(
          "Username must be 3–24 letters, numbers or _."
        );
      }

      const button = $("authSubmit");

      if (button) {
        button.disabled = true;
        button.textContent =
          signup
            ? "Creating..."
            : "Logging in...";
      }

      try {
        if (signup) {

          // Check username first.
          const {
            data: existing,
            error: usernameError
          } = await sb
            .from("profiles")
            .select("id")
            .eq("username", username)
            .maybeSingle();

          if (
            usernameError &&
            usernameError.code !== "PGRST116"
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
          } = await sb.auth.signUp({
            email,
            password,
            options: {
              data: {
                username
              }
            }
          });

          if (error) throw error;

          const user = data?.user;

          if (!user) {
            throw new Error(
              "Account could not be created."
            );
          }

          // Create profile.
          const {
            error: profileError
          } = await sb
            .from("profiles")
            .upsert(
              {
                id: user.id,
                username,
                display_name: username
              },
              {
                onConflict: "id"
              }
            );

          if (profileError) {
            console.error(
              "Profile creation:",
              profileError
            );

            // Don't pretend signup completely failed.
            if (data?.session) {
              toast(
                "Account created, but your profile needs attention."
              );
            }
          }

          if (data?.session) {
            await setUser(user);

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
          } = await sb.auth.signInWithPassword({
            email,
            password
          });

          if (error) throw error;

          await setUser(
            data?.user || null
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
          $("authHint").textContent =
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
          button.disabled = false;
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
// VIDEO QUERY
// IMPORTANT:
// Use the explicit videos_user_id_fkey relationship.
// This fixes the PGRST201 profiles relationship error.
// ============================================================

async function queryVideos(options = {}) {
  if (!ready || !sb) return [];

  const {
    shorts = false,
    creator = null,
    search = "",
    limit = 24
  } = options;

  let query = sb
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
    .eq("visibility", "public")
    .eq("is_short", shorts)
    .order("created_at", {
      ascending: false
    })
    .limit(limit);

  if (creator) {
    query = query.eq(
      "user_id",
      creator
    );
  }

  if (search) {
    query = query.ilike(
      "title",
      `%${search}%`
    );
  }

  const {
    data,
    error
  } = await query;

  if (error) {
    console.error(
      "Video query error:",
      error
    );

    return [];
  }

  return data || [];
}

// ============================================================
// MEDIA
// ============================================================

function mediaHtml(
  video,
  className = "watchVideo"
) {
  const url = esc(video.video_url);

  if (!url) {
    return `
      <div class="empty">
        Video URL is missing.
      </div>
    `;
  }

  if (isEmbedUrl(video.video_url)) {
    return `
      <iframe
        class="${className}"
        src="${url}"
        title="${esc(video.title || "Nockage video")}"
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

function videoCard(video, short = false) {
  const creator =
    video.profiles?.display_name ||
    video.profiles?.username ||
    "Creator";

  return `
    <article
      class="card ${short ? "shortCard" : ""}"
      data-video-id="${esc(video.id)}"
      tabindex="0"
      role="button"
      aria-label="Watch ${esc(video.title)}"
    >

      ${
        video.thumbnail_url
          ? `
            <img
              class="thumb"
              src="${esc(video.thumbnail_url)}"
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
          ${esc(video.title)}
        </div>

        <div class="meta">
          ${esc(creator)}
          ·
          ${fmt(video.views)}
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
  const grid = $("homeGrid");

  if (!grid) return;

  grid.innerHTML = `
    <div class="empty">
      Loading Nockage videos...
    </div>
  `;

  const videos =
    await queryVideos({
      shorts: false
    });

  grid.innerHTML =
    videos.length
      ? videos.map(v => videoCard(v)).join("")
      : `
        <div class="empty">
          No public videos yet.
          Create the first one!
        </div>
      `;

  if ($("homeCount")) {
    $("homeCount").textContent =
      videos.length
        ? `${videos.length} videos`
        : "";
  }
}

// ============================================================
// SHORTS
// ============================================================

async function loadShorts() {
  const grid = $("shortsGrid");

  if (!grid) return;

  ensureShortsStyles();

  if (shortsObserver) {
    shortsObserver.disconnect();
    shortsObserver = null;
  }

  grid.innerHTML = `
    <div class="nockageShortsPage">
      <div class="nockageShortEmpty">
        Loading Shorts...
      </div>
    </div>
  `;

  const videos =
    await queryVideos({
      shorts: true,
      limit: 50
    });

  if (!videos.length) {
    grid.innerHTML = `
      <div class="nockageShortsPage">
        <div class="nockageShortEmpty">
          No Shorts yet.
          Be the first to publish one!
        </div>
      </div>
    `;

    return;
  }

  grid.innerHTML = `
    <div class="nockageShortsPage">
      <div class="nockageShortsFeed">

        ${videos.map(video => {

          const creator =
            video.profiles?.display_name ||
            video.profiles?.username ||
            "Creator";

          const media =
            isEmbedUrl(video.video_url)
              ? `
                <iframe
                  class="nockageShortEmbed"
                  src="${esc(video.video_url)}"
                  title="${esc(video.title)}"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowfullscreen
                ></iframe>
              `
              : `
                <video
                  class="nockageShortVideo"
                  playsinline
                  muted
                  loop
                  preload="metadata"
                  src="${esc(video.video_url)}"
                ></video>
              `;

          return `
            <article
              class="nockageShortItem"
              data-short-id="${esc(video.id)}"
            >

              ${media}

              <div class="nockageShortShade"></div>

              ${
                !isEmbedUrl(video.video_url)
                  ? `
                    <button
                      class="nockageShortMute"
                      type="button"
                      data-short-mute="${esc(video.id)}"
                    >
                      🔇
                    </button>
                  `
                  : ""
              }

              <div class="nockageShortInfo">

                <div class="nockageShortBadge">
                  SHORT
                </div>

                <div class="nockageShortCreator">
                  @${esc(
                    video.profiles?.username ||
                    creator
                  )}
                </div>

                <div class="nockageShortTitle">
                  ${esc(video.title)}
                </div>

                ${
                  video.description
                    ? `
                      <div class="nockageShortDescription">
                        ${esc(video.description)}
                      </div>
                    `
                    : ""
                }

                <div class="nockageShortViews">
                  ${fmt(video.views)} views
                </div>

              </div>

              <div class="nockageShortActions">

                <button
                  class="nockageShortAction"
                  type="button"
                  title="Like"
                  data-short-like="${esc(video.id)}"
                >
                  ♡
                </button>

                <button
                  class="nockageShortAction"
                  type="button"
                  title="Open"
                  data-short-open="${esc(video.id)}"
                >
                  ↗
                </button>

                <a
                  class="nockageShortOpen"
                  href="#profile/${encodeURIComponent(video.user_id)}"
                  title="Creator"
                >
                  👤
                </a>

              </div>

            </article>
          `;
        }).join("")}

      </div>
    </div>
  `;

  // Open
  grid.querySelectorAll("[data-short-open]")
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          const id =
            button.dataset.shortOpen;

          if (id) {
            setHash(
              `watch/${encodeURIComponent(id)}`
            );
          }
        }
      );
    });

  // Like
  grid.querySelectorAll("[data-short-like]")
    .forEach(button => {
      button.addEventListener(
        "click",
        async event => {
          event.stopPropagation();

          const id =
            button.dataset.shortLike;

          if (!currentUser) {
            return openAuth(false);
          }

          const {
            data,
            error
          } = await sb
            .from("likes")
            .select("video_id")
            .eq("video_id", id)
            .eq("user_id", currentUser.id)
            .maybeSingle();

          if (error) {
            console.error(
              "Short like check:",
              error
            );

            return toast(
              getErrorMessage(
                error,
                "Could not check like."
              )
            );
          }

          await toggleLike(
            id,
            !!data
          );
        }
      );
    });

  // Mute
  grid.querySelectorAll("[data-short-mute]")
    .forEach(button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          const item =
            button.closest(
              ".nockageShortItem"
            );

          const video =
            item?.querySelector("video");

          if (!video) return;

          video.muted =
            !video.muted;

          button.textContent =
            video.muted
              ? "🔇"
              : "🔊";
        }
      );
    });

  // Play/pause
  grid.querySelectorAll(
    ".nockageShortVideo"
  ).forEach(video => {
    video.addEventListener(
      "click",
      event => {
        event.stopPropagation();

        if (video.paused) {
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      }
    );
  });

  // Autoplay
  const videosElements =
    grid.querySelectorAll(
      ".nockageShortVideo"
    );

  if (
    "IntersectionObserver" in window
  ) {
    shortsObserver =
      new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            const video =
              entry.target;

            if (
              entry.isIntersecting
            ) {
              video
                .play()
                .catch(() => {});
            } else {
              video.pause();
            }
          });
        },
        {
          threshold: 0.65
        }
      );

    videosElements.forEach(video => {
      shortsObserver.observe(video);
    });

  } else {
    videosElements.forEach(video => {
      video.play().catch(() => {});
    });
  }
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

async function loadSubs() {
  const grid = $("subsGrid");

  if (!grid) return;

  if (!currentUser) {
    grid.innerHTML = "";

    if ($("subsEmpty")) {
      $("subsEmpty").style.display =
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
  } = await sb
    .from("subscriptions")
    .select("creator_id")
    .eq(
      "subscriber_id",
      currentUser.id
    );

  if (error) {
    grid.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  const creatorIds =
    (data || [])
      .map(row => row.creator_id)
      .filter(Boolean);

  if (!creatorIds.length) {
    grid.innerHTML = "";

    if ($("subsEmpty")) {
      $("subsEmpty").style.display =
        "block";
    }

    return;
  }

  if ($("subsEmpty")) {
    $("subsEmpty").style.display =
      "none";
  }

  const results =
    await Promise.all(
      creatorIds.map(id =>
        queryVideos({
          creator: id,
          shorts: false
        })
      )
    );

  const videos =
    results.flat();

  grid.innerHTML =
    videos.length
      ? videos.map(v =>
          videoCard(v)
        ).join("")
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

async function searchVideos(queryText) {
  const query =
    String(queryText || "").trim();

  page("search");

  if ($("searchLabel")) {
    $("searchLabel").textContent =
      query ? `"${query}"` : "";
  }

  const grid = $("searchGrid");

  if (!grid) return;

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
      shorts: false,
      search: query,
      limit: 50
    });

  grid.innerHTML =
    videos.length
      ? videos.map(v =>
          videoCard(v)
        ).join("")
      : `
        <div class="empty">
          No results for "${esc(query)}".
        </div>
      `;
}

// ============================================================
// WATCH
// ============================================================

async function showWatch(id) {
  const container =
    $("watchContent");

  if (!container || !id) return;

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

  // Explicit relationship FIX.
  const {
    data: video,
    error
  } = await sb
    .from("videos")
    .select(`
      *,
      profiles:profiles!videos_user_id_fkey (
        username,
        display_name,
        avatar_url
      )
    `)
    .eq("id", id)
    .eq("visibility", "public")
    .maybeSingle();

  if (error) {
    console.error(
      "Watch query:",
      error
    );

    container.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
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

  // Increment views.
  // This is intentionally done after the video exists.
  const oldViews =
    Number(video.views || 0);

  const {
    error: viewError
  } = await sb
    .from("videos")
    .update({
      views: oldViews + 1
    })
    .eq("id", id)
    .eq("visibility", "public");

  if (!viewError) {
    video.views =
      oldViews + 1;
  }

  let liked = false;
  let subscribed = false;

  if (currentUser) {

    const {
      data: like,
      error: likeError
    } = await sb
      .from("likes")
      .select("video_id")
      .eq("video_id", id)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!likeError) {
      liked = !!like;
    }

    if (
      String(video.user_id) !==
      String(currentUser.id)
    ) {
      const {
        data: sub,
        error: subError
      } = await sb
        .from("subscriptions")
        .select("creator_id")
        .eq(
          "creator_id",
          video.user_id
        )
        .eq(
          "subscriber_id",
          currentUser.id
        )
        .maybeSingle();

      if (!subError) {
        subscribed = !!sub;
      }
    }
  }

  let comments = [];

  if (video.allow_comments !== false) {

    // Explicit relationship to avoid ambiguous profiles relation.
    const {
      data,
      error: commentError
    } = await sb
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
      .eq("video_id", id)
      .order(
        "created_at",
        {
          ascending: false
        }
      )
      .limit(50);

    if (commentError) {
      console.warn(
        "Comments query:",
        commentError
      );
    } else {
      comments = data || [];
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
          ${esc(video.title)}
        </h1>

        <div class="meta">
          ${video.is_short ? "Short" : "Video"}
          ·
          ${esc(creator)}
          ·
          ${fmt(video.views)}
          views
        </div>

        <div class="actions">

          <button
            type="button"
            class="ghost"
            id="likeBtn"
          >
            ${liked ? "♥ Liked" : "♡ Like"}
          </button>

          <button
            type="button"
            class="ghost"
            id="repostBtn"
          >
            ↻ Repost
          </button>

          ${
            String(video.user_id) ===
            String(currentUser?.id)
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
                ${esc(video.description)}
              </p>
            `
            : ""
        }

      </div>

      <aside class="panel">

        <h3>Comments</h3>

        ${
          video.allow_comments === false
            ? `
              <p class="muted">
                Comments are disabled for this video.
              </p>
            `
            : `
              <form id="commentForm">

                <input
                  id="commentInput"
                  placeholder="${
                    currentUser
                      ? "Add a comment…"
                      : "Log in to comment"
                  }"
                  ${currentUser ? "" : "disabled"}
                >

                <button
                  type="submit"
                  class="primary wide"
                  ${currentUser ? "" : "disabled"}
                >
                  Comment
                </button>

              </form>

              <div id="comments">

                ${
                  comments.length
                    ? comments.map(
                        comment => `
                          <div class="comment">

                            <b>
                              ${esc(
                                comment.profiles?.display_name ||
                                comment.profiles?.username ||
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
                      ).join("")
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
    () => toggleLike(id, liked)
  );

  $("repostBtn")?.addEventListener(
    "click",
    () => repost(id)
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
      openDeleteModal(video)
  );

  $("commentForm")?.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      if (!currentUser) {
        return openAuth(false);
      }

      const input =
        $("commentInput");

      const text =
        input?.value.trim() || "";

      if (!text) return;

      if (text.length > 1000) {
        return toast(
          "Comment is too long."
        );
      }

      try {
        const {
          error
        } = await sb
          .from("comments")
          .insert({
            video_id: id,
            user_id: currentUser.id,
            text
          });

        if (error) throw error;

        toast(
          "Comment posted."
        );

        await showWatch(id);

      } catch (error) {
        console.error(
          "Comment:",
          error
        );

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

// ============================================================
// LIKE
// ============================================================

async function toggleLike(
  videoId,
  wasLiked
) {
  if (!currentUser) {
    return openAuth(false);
  }

  if (!requireSupabase()) return;

  try {
    if (wasLiked) {

      const {
        error
      } = await sb
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

      if (error) throw error;

      toast("Like removed.");

    } else {

      const {
        error
      } = await sb
        .from("likes")
        .insert({
          video_id: videoId,
          user_id: currentUser.id
        });

      if (error) throw error;

      toast("Liked!");
    }

    const route =
      getHashParts();

    if (
      route[0] === "shorts"
    ) {
      await loadShorts();
    } else {
      await showWatch(videoId);
    }

  } catch (error) {
    console.error(
      "Like:",
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
// SUBSCRIBE
// ============================================================

async function toggleSub(
  creatorId,
  wasSubscribed
) {
  if (!currentUser) {
    return openAuth(false);
  }

  if (!requireSupabase()) return;

  if (
    String(creatorId) ===
    String(currentUser.id)
  ) {
    return toast(
      "You can't subscribe to yourself."
    );
  }

  try {

    if (wasSubscribed) {

      const {
        error
      } = await sb
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

      if (error) throw error;

      toast("Unsubscribed.");

    } else {

      const {
        error
      } = await sb
        .from("subscriptions")
        .insert({
          creator_id: creatorId,
          subscriber_id:
            currentUser.id
        });

      if (error) throw error;

      toast("Subscribed!");
    }

    const parts =
      getHashParts();

    if (
      parts[0] === "watch"
    ) {
      await showWatch(parts[1]);

    } else if (
      parts[0] === "profile"
    ) {
      await showProfile(parts[1]);

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

// ============================================================
// REPOST
// ============================================================

async function repost(videoId) {
  if (!currentUser) {
    return openAuth(false);
  }

  if (!requireSupabase()) return;

  try {
    const {
      error
    } = await sb
      .from("reposts")
      .upsert(
        {
          video_id: videoId,
          user_id: currentUser.id
        },
        {
          onConflict:
            "video_id,user_id"
        }
      );

    if (error) throw error;

    toast(
      "Reposted to your profile!"
    );

  } catch (error) {
    console.error(
      "Repost:",
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

async function showProfile(id) {
  const container =
    $("profileContent");

  if (!container || !id) return;

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
      Loading profile...
    </div>
  `;

  const {
    data: creator,
    error
  } = await sb
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      "Profile page:",
      error
    );

    container.innerHTML = `
      <div class="empty">
        ${esc(error.message)}
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
      creator: id,
      shorts: false
    });

  const shorts =
    await queryVideos({
      creator: id,
      shorts: true,
      limit: 50
    });

  const {
    count: subscribers,
    error: subscriberError
  } = await sb
    .from("subscriptions")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq(
      "creator_id",
      id
    );

  if (subscriberError) {
    console.warn(
      "Subscriber count:",
      subscriberError
    );
  }

  const mine =
    String(currentUser?.id) ===
    String(id);

  let following = false;

  if (currentUser && !mine) {

    const {
      data,
      error: followingError
    } = await sb
      .from("subscriptions")
      .select("creator_id")
      .eq(
        "creator_id",
        id
      )
      .eq(
        "subscriber_id",
        currentUser.id
      )
      .maybeSingle();

    if (!followingError) {
      following = !!data;
    }
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
            creator.username || ""
          )}
          ·
          ${fmt(subscribers)}
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
      <h2>Videos</h2>
    </div>

    <div class="videoGrid">

      ${
        videos.length
          ? videos.map(v =>
              videoCard(v)
            ).join("")
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
            <h2>Shorts</h2>
          </div>

          <div class="videoGrid">
            ${shorts.map(v =>
              videoCard(v, true)
            ).join("")}
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
    page("home");
    openAuth(false);
    return;
  }

  if (!requireSupabase()) return;

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
  } = await sb
    .from("videos")
    .select("*")
    .eq(
      "user_id",
      currentUser.id
    )
    .order(
      "created_at",
      {
        ascending: false
      }
    );

  if (error) {
    if (videoList) {
      videoList.innerHTML = `
        <p class="muted">
          ${esc(error.message)}
        </p>
      `;
    }

    return;
  }

  const all =
    data || [];

  const videos =
    all.filter(
      v => v.is_short !== true
    );

  const shorts =
    all.filter(
      v => v.is_short === true
    );

  const totalViews =
    all.reduce(
      (total, video) =>
        total +
        Number(video.views || 0),
      0
    );

  const {
    count: subscribers
  } = await sb
    .from("subscriptions")
    .select("*", {
      count: "exact",
      head: true
    })
    .eq(
      "creator_id",
      currentUser.id
    );

  if (stats) {
    stats.innerHTML = `
      <div class="stat">
        <span>Views</span>
        <b>${fmt(totalViews)}</b>
      </div>

      <div class="stat">
        <span>Subscribers</span>
        <b>${fmt(subscribers)}</b>
      </div>

      <div class="stat">
        <span>Videos</span>
        <b>${fmt(videos.length)}</b>
      </div>

      <div class="stat">
        <span>Shorts</span>
        <b>${fmt(shorts.length)}</b>
      </div>
    `;
  }

  if (!videoList) return;

  videoList.innerHTML =
    all.length
      ? all.map(video => `
          <div
            class="comment"
            data-studio-video-id="${esc(video.id)}"
          >

            <div>
              <b>
                ${esc(video.title)}
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
                · ${fmt(
                  video.views
                )} views
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
                href="#watch/${encodeURIComponent(video.id)}"
              >
                Watch
              </a>

              <button
                class="nockageDeleteButton"
                type="button"
                data-delete-video-id="${esc(video.id)}"
              >
                🗑 Delete
              </button>

            </div>

          </div>
        `).join("")
      : `
        <p class="muted">
          Upload your first video or Short.
        </p>
      `;

  videoList
    .querySelectorAll(
      "[data-delete-video-id]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {
          event.preventDefault();
          event.stopPropagation();

          const id =
            button.dataset.deleteVideoId;

          const video =
            all.find(
              item =>
                String(item.id) ===
                String(id)
            );

          if (video) {
            openDeleteModal(video);
          }
        }
      );
    });
}

// ============================================================
// UPLOAD MODE
// ============================================================

function setMode(mode) {
  uploadMode =
    mode === "short"
      ? "short"
      : "video";

  document
    .querySelectorAll(".mode")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.mode ===
          uploadMode
      );
    });

  if ($("uploadTitle")) {
    $("uploadTitle").textContent =
      uploadMode === "short"
        ? "Create a Short"
        : "Upload a Video";
  }

  if ($("videoFile")) {
    $("videoFile").accept =
      "video/*";
  }
}

// ============================================================
// STORAGE
// ============================================================

async function uploadToStorage(
  bucket,
  path,
  file
) {
  const {
    error
  } = await sb.storage
    .from(bucket)
    .upload(
      path,
      file,
      {
        contentType:
          file.type ||
          "application/octet-stream",
        upsert: false
      }
    );

  if (error) throw error;

  const {
    data
  } = sb.storage
    .from(bucket)
    .getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error(
      "Could not create public file URL."
    );
  }

  return data.publicUrl;
}

// ============================================================
// UPLOAD
// ============================================================

function setupUpload() {

  document
    .querySelectorAll(".mode")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          setMode(
            button.dataset.mode
          )
      );

    });

  $("videoFile")?.addEventListener(
    "change",
    event => {

      const file =
        event.target.files?.[0];

      if ($("fileInfo")) {
        $("fileInfo").textContent =
          file
            ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`
            : "Maximum 50 MB on the free backend.";
      }

    }
  );

  $("thumbFile")?.addEventListener(
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
        event.target.value = "";

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
        return openAuth(false);
      }

      if (!requireSupabase()) return;

      const videoFile =
        $("videoFile")
          ?.files?.[0];

      const thumbnailFile =
        $("thumbFile")
          ?.files?.[0];

      const title =
        $("videoTitle")
          ?.value.trim() || "";

      const description =
        $("videoDescription")
          ?.value.trim() || "";

      const allowComments =
        $("allowComments")
          ?.checked ?? true;

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
        50 * 1024 * 1024
      ) {
        return toast(
          "Video must be 50 MB or smaller."
        );
      }

      if (
        thumbnailFile &&
        thumbnailFile.size >
        10 * 1024 * 1024
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
        uploadMode === "short";

      let uploadedVideoPath = null;
      let uploadedThumbnailPath = null;

      if (button) {
        button.disabled = true;

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

        const bucket =
          "Videos";

        uploadedVideoPath =
          `${currentUser.id}/${crypto.randomUUID()}-${cleanFilename(videoFile.name)}`;

        if (progressBar) {
          progressBar.style.width =
            "15%";
        }

        const videoUrl =
          await uploadToStorage(
            bucket,
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
            `${currentUser.id}/thumbnails/${crypto.randomUUID()}-${cleanFilename(thumbnailFile.name)}`;

          thumbnailUrl =
            await uploadToStorage(
              bucket,
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
        } = await sb
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
            views: 0,
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

        setMode("video");

        if ($("fileInfo")) {
          $("fileInfo").textContent =
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

        // Clean up uploaded files if DB insert failed.
        try {
          const paths = [];

          if (uploadedVideoPath) {
            paths.push(
              uploadedVideoPath
            );
          }

          if (uploadedThumbnailPath) {
            paths.push(
              uploadedThumbnailPath
            );
          }

          if (paths.length) {
            await sb.storage
              .from("Videos")
              .remove(paths);
          }
        } catch (cleanupError) {
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
          button.disabled = false;
          button.textContent =
            "Publish";
        }

        setTimeout(() => {

          if (progress) {
            progress.style.display =
              "none";
          }

          if (progressBar) {
            progressBar.style.width =
              "0%";
          }

        }, 800);
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
        setHash("upload");
      } else {
        openAuth(false);
      }

    }
  );

  $("shortUpload")?.addEventListener(
    "click",
    () => {

      if (!currentUser) {
        return openAuth(false);
      }

      setHash("upload");

      setTimeout(() => {
        setMode("short");
      }, 50);

    }
  );

  $("studioUpload")?.addEventListener(
    "click",
    () => {

      if (!currentUser) {
        return openAuth(false);
      }

      setHash("upload");

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

      if (event.key === "Enter") {
        performSearch();
      }

    }
  );

  // Video card clicks.
  document.addEventListener(
    "click",
    event => {

      const card =
        event.target.closest(
          "[data-video-id]"
        );

      if (!card) return;

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
          `watch/${encodeURIComponent(id)}`
        );
      }

    }
  );

  // Keyboard access.
  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !== "Enter" &&
        event.key !== " "
      ) {
        return;
      }

      const card =
        event.target.closest(
          "[data-video-id]"
        );

      if (!card) return;

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
          `watch/${encodeURIComponent(id)}`
        );
      }

    }
  );
}

function performSearch() {
  const input =
    $("searchInput");

  const query =
    input?.value.trim() || "";

  if (!query) {
    input?.focus();
    return;
  }

  setHash(
    `search/${encodeURIComponent(query)}`
  );
}

// ============================================================
// ROUTER
// ============================================================

async function routeApp() {

  if (routeRunning) {
    routeQueued = true;
    return;
  }

  routeRunning = true;

  try {

    const parts =
      getHashParts();

    const route =
      parts[0] || "home";

    switch (route) {

      case "home":
        page("home");
        await loadHome();
        break;

      case "shorts":
        page("shorts");
        await loadShorts();
        break;

      case "subscriptions":
        page("subscriptions");
        await loadSubs();
        break;

      case "search":
        page("search");

        await searchVideos(
          parts
            .slice(1)
            .join("/")
        );

        break;

      case "watch":
        page("watch");

        if (!parts[1]) {
          setHash("home");
          break;
        }

        await showWatch(
          parts[1]
        );

        break;

      case "studio":

        if (!currentUser) {
          page("home");
          openAuth(false);
          break;
        }

        page("studio");
        await loadStudio();
        break;

      case "profile":

        if (!parts[1]) {
          setHash("home");
          break;
        }

        page("profile");

        await showProfile(
          parts[1]
        );

        break;

      case "upload":

        if (!currentUser) {
          page("home");
          openAuth(false);
          break;
        }

        page("upload");
        break;

      case "settings":

        if (!currentUser) {
          page("home");
          openAuth(false);
          break;
        }

        page("settings");

        if ($("settingsName")) {
          $("settingsName").textContent =
            profile?.username ||
            profile?.display_name ||
            "—";
        }

        break;

      default:
        setHash("home");
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

    routeRunning = false;

    if (routeQueued) {
      routeQueued = false;
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

  if (booted) return;

  booted = true;

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
    } = await sb.auth.getSession();

    if (error) {
      throw error;
    }

    await setUser(
      data?.session?.user ||
      null
    );

    sb.auth.onAuthStateChange(
      async (_event, session) => {

        await setUser(
          session?.user ||
          null
        );

        // Keep UI in sync after login/logout.
        renderAccount();
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
// HASH ROUTING
// ============================================================

window.addEventListener(
  "hashchange",
  () => routeApp()
);

window.addEventListener(
  "beforeunload",
  () => {

    if (shortsObserver) {
      shortsObserver.disconnect();
    }

  }
);

// ============================================================
// START
// ============================================================

boot();