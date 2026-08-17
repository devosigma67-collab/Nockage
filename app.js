/* Nockage real backend client.
   Replace the two values below with your Supabase project's public browser credentials. */
const NOCKAGE_CONFIG = {
  SUPABASE_URL: "https://ljveziwuxbiajxtguppy.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_pF6Fs7rvL1C-ib1mg_MRxg_qWuX8Int"
};

// ===============================
// NOCKAGE APP.JS
// ===============================

const ready =
  typeof NOCKAGE_CONFIG !== "undefined" &&
  NOCKAGE_CONFIG.SUPABASE_URL &&
  NOCKAGE_CONFIG.SUPABASE_ANON_KEY &&
  !NOCKAGE_CONFIG.SUPABASE_URL.startsWith("PASTE_") &&
  !NOCKAGE_CONFIG.SUPABASE_ANON_KEY.startsWith("PASTE_");

const sb = ready
  ? supabase.createClient(
      NOCKAGE_CONFIG.SUPABASE_URL,
      NOCKAGE_CONFIG.SUPABASE_ANON_KEY
    )
  : null;

let currentUser = null;
let profile = null;
let uploadMode = "video";

const $ = id => document.getElementById(id);

// ===============================
// HELPERS
// ===============================

function toast(msg) {
  const el = $("toast");
  if (!el) return;

  el.textContent = msg;
  el.classList.add("show");

  setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

function fmt(n) {
  n = Number(n || 0);

  if (n >= 1e9)
    return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";

  if (n >= 1e6)
    return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";

  if (n >= 1e3)
    return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";

  return String(n);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function page(id) {
  document.querySelectorAll(".page").forEach(x => {
    x.classList.remove("active");
  });

  $(id)?.classList.add("active");

  window.scrollTo(0, 0);
}

function requireConfig() {
  if (!ready) {
    toast("Finish the Supabase setup first.");
    return false;
  }

  return true;
}

// ===============================
// AUTH
// ===============================

async function boot() {
  if (!ready) {
    console.warn("Nockage: Supabase is not configured.");
  }

  if (ready) {
    const {
      data: { session }
    } = await sb.auth.getSession();

    await setUser(session?.user || null);

    sb.auth.onAuthStateChange(async (_event, session) => {
      await setUser(session?.user || null);
    });
  }

  setupButtons();
  route();
}

async function setUser(user) {
  currentUser = user;
  profile = null;

  if (user && ready) {
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (!error) {
      profile = data || null;
    }
  }

  renderAccount();
}

function renderAccount() {
  const area = $("accountArea");

  if (!area) return;

  if (currentUser) {
    area.innerHTML = `
      <a class="ghost" href="#studio">Studio</a>

      <a class="ghost" href="#profile/${currentUser.id}">
        ${esc(profile?.username || "Account")}
      </a>

      <button class="primary" id="quickLogout">
        Log out
      </button>
    `;

    $("quickLogout")?.addEventListener("click", logout);

  } else {
    area.innerHTML = `
      <button class="ghost" id="loginBtn">
        Log in
      </button>

      <button class="primary" id="signupBtn">
        Create account
      </button>
    `;

    $("loginBtn")?.addEventListener("click", () => openAuth(false));
    $("signupBtn")?.addEventListener("click", () => openAuth(true));
  }
}

function openAuth(signup) {
  const modal = $("authModal");

  if (!modal) return;

  modal.classList.remove("hidden");

  $("authTitle").textContent =
    signup
      ? "Create your Nockage account"
      : "Log in to Nockage";

  $("authSubmit").textContent =
    signup
      ? "Create account"
      : "Log in";

  $("switchAuth").textContent =
    signup
      ? "Already have an account? Log in"
      : "New to Nockage? Create account";

  $("authHint").textContent = "";

  $("authForm").dataset.signup = signup ? "1" : "0";
}

async function logout() {
  if (ready) {
    await sb.auth.signOut();
  }

  location.hash = "#home";

  toast("Logged out");
}

function setupAuth() {
  $("closeAuth")?.addEventListener("click", () => {
    $("authModal")?.classList.add("hidden");
  });

  $("switchAuth")?.addEventListener("click", () => {
    openAuth($("authForm")?.dataset.signup !== "1");
  });

  $("authForm")?.addEventListener("submit", async e => {
    e.preventDefault();

    if (!requireConfig()) return;

    const username =
      $("authUsername")?.value.trim() || "";

    const email =
      $("authEmail")?.value.trim() || "";

    const password =
      $("authPassword")?.value || "";

    const signup =
      $("authForm")?.dataset.signup === "1";

    if (
      !/^[A-Za-z0-9_]{3,24}$/.test(username)
    ) {
      return toast(
        "Username must be 3–24 letters, numbers or _"
      );
    }

    $("authSubmit").disabled = true;

    try {
      if (signup) {
        const { data, error } =
          await sb.auth.signUp({
            email,
            password,
            options: {
              data: {
                username
              }
            }
          });

        if (error) throw error;

        if (data.user) {
          const { error: profileError } =
            await sb.from("profiles").upsert({
              id: data.user.id,
              username,
              display_name: username
            });

          if (profileError) {
            console.error(profileError);
          }
        }

        toast("Account created!");

        $("authModal")?.classList.add("hidden");

      } else {
        const { error } =
          await sb.auth.signInWithPassword({
            email,
            password
          });

        if (error) throw error;

        toast("Welcome back!");

        $("authModal")?.classList.add("hidden");
      }

    } catch (err) {
      console.error(err);

      $("authHint").textContent =
        err.message || "Something went wrong.";

    } finally {
      $("authSubmit").disabled = false;
    }
  });
}

// ===============================
// VIDEOS
// ===============================

async function queryVideos({
  shorts = false,
  creator = null,
  search = null,
  limit = 30
} = {}) {

  if (!ready) return [];

  let q = sb
    .from("videos")
    .select(`
      id,
      user_id,
      title,
      description,
      video_url,
      thumbnail_url,
      visibility,
      is_short,
      views,
      created_at,
      profiles (
        username,
        display_name
      )
    `)
    .eq("visibility", "public")
    .eq("is_short", shorts)
    .order("created_at", {
      ascending: false
    })
    .limit(limit);

  if (creator) {
    q = q.eq("user_id", creator);
  }

  if (search) {
    q = q.ilike(
      "title",
      `%${search}%`
    );
  }

  const { data, error } = await q;

  if (error) {
    console.error("Video query error:", error);
    return [];
  }

  return data || [];
}

function videoCard(v, short = false) {
  const thumb = v.thumbnail_url || "";

  return `
    <article
      class="card ${short ? "shortCard" : ""}"
      onclick="location.hash='#watch/${v.id}'"
    >

      ${
        thumb
          ? `<img
              class="thumb"
              src="${esc(thumb)}"
              alt=""
              loading="lazy"
            >`
          : `<div class="thumb"></div>`
      }

      <div class="cardBody">

        <div class="cardTitle">
          ${esc(v.title)}
        </div>

        <div class="meta">
          ${esc(
            v.profiles?.display_name ||
            v.profiles?.username ||
            "Creator"
          )}
          ·
          ${fmt(v.views)} views
        </div>

      </div>
    </article>
  `;
}

async function loadHome() {
  if (!$("homeGrid")) return;

  const videos = await queryVideos();

  $("homeGrid").innerHTML =
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

async function loadShorts() {
  if (!$("shortsGrid")) return;

  const videos =
    await queryVideos({
      shorts: true
    });

  $("shortsGrid").innerHTML =
    videos.length
      ? videos.map(v => videoCard(v, true)).join("")
      : `
        <div class="empty">
          No Shorts yet.
        </div>
      `;
}

async function loadSubs() {
  if (!currentUser) {
    if ($("subsGrid")) $("subsGrid").innerHTML = "";
    if ($("subsEmpty")) $("subsEmpty").style.display = "block";
    return;
  }

  const { data, error } =
    await sb
      .from("subscriptions")
      .select("creator_id")
      .eq("subscriber_id", currentUser.id);

  if (error) {
    console.error(error);
    return;
  }

  const ids =
    (data || []).map(x => x.creator_id);

  if (!ids.length) {
    $("subsGrid").innerHTML = "";

    if ($("subsEmpty")) {
      $("subsEmpty").style.display = "block";
    }

    return;
  }

  if ($("subsEmpty")) {
    $("subsEmpty").style.display = "none";
  }

  let all = [];

  for (const id of ids) {
    const videos =
      await queryVideos({
        creator: id
      });

    all.push(...videos);
  }

  $("subsGrid").innerHTML =
    all.length
      ? all.map(v => videoCard(v)).join("")
      : `
        <div class="empty">
          Your subscriptions have no public videos yet.
        </div>
      `;
}

async function searchVideos(q) {
  page("search");

  if ($("searchLabel")) {
    $("searchLabel").textContent = q;
  }

  const videos =
    await queryVideos({
      search: q,
      limit: 50
    });

  $("searchGrid").innerHTML =
    videos.length
      ? videos.map(v => videoCard(v)).join("")
      : `
        <div class="empty">
          No results.
        </div>
      `;
}

// ===============================
// WATCH
// ===============================

async function showWatch(id) {
  if (!ready || !id) return;

  const { data: video, error } =
    await sb
      .from("videos")
      .select(`
        *,
        profiles (
          username,
          display_name
        )
      `)
      .eq("id", id)
      .maybeSingle();

  if (error || !video) {
    return toast("Video not found");
  }

  if (
    video.visibility === "private" &&
    video.user_id !== currentUser?.id
  ) {
    return toast("This video is private");
  }

  await sb
    .from("videos")
    .update({
      views: (video.views || 0) + 1
    })
    .eq("id", id);

  let liked = false;
  let subscribed = false;

  if (currentUser) {
    const { data: like } =
      await sb
        .from("likes")
        .select("video_id")
        .eq("video_id", id)
        .eq("user_id", currentUser.id)
        .maybeSingle();

    liked = !!like;

    const { data: sub } =
      await sb
        .from("subscriptions")
        .select("creator_id")
        .eq("creator_id", video.user_id)
        .eq("subscriber_id", currentUser.id)
        .maybeSingle();

    subscribed = !!sub;
  }

  const { data: comments } =
    await sb
      .from("comments")
      .select(`
        id,
        text,
        created_at,
        profiles (
          username,
          display_name
        )
      `)
      .eq("video_id", id)
      .order("created_at", {
        ascending: false
      })
      .limit(50);

  $("watchContent").innerHTML = `
    <div class="watch">

      <div>

        <video
          class="watchVideo"
          controls
          playsinline
          preload="metadata"
          src="${esc(video.video_url)}"
        ></video>

        <h1>
          ${esc(video.title)}
        </h1>

        <div class="meta">
          ${esc(
            video.profiles?.display_name ||
            video.profiles?.username ||
            "Creator"
          )}
          ·
          ${fmt(video.views)} views
        </div>

        <div class="actions">

          <button class="ghost" id="likeBtn">
            ${liked ? "♥ Liked" : "♡ Like"}
          </button>

          <button class="ghost" id="repostBtn">
            ↻ Repost
          </button>

          <button class="primary" id="subBtn">
            ${subscribed ? "Subscribed" : "Subscribe"}
          </button>

        </div>

        <p>
          ${esc(video.description || "")}
        </p>

      </div>

      <aside class="panel">

        <h3>Comments</h3>

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
            class="primary wide"
            ${currentUser ? "" : "disabled"}
          >
            Comment
          </button>

        </form>

        <div id="comments">

          ${
            (comments || []).map(c => `
              <div class="comment">

                <b>
                  ${esc(
                    c.profiles?.display_name ||
                    c.profiles?.username ||
                    "User"
                  )}
                </b>

                <div>
                  ${esc(c.text)}
                </div>

              </div>
            `).join("") ||
            "<p class='muted'>No comments yet.</p>"
          }

        </div>

      </aside>

    </div>
  `;

  $("likeBtn").onclick =
    () => toggleLike(id, liked);

  $("subBtn").onclick =
    () => toggleSub(video.user_id, subscribed);

  $("repostBtn").onclick =
    () => repost(id);

  $("commentForm").onsubmit =
    async e => {
      e.preventDefault();

      if (!currentUser) {
        return openAuth(false);
      }

      const text =
        $("commentInput").value.trim();

      if (!text) return;

      const { error } =
        await sb
          .from("comments")
          .insert({
            video_id: id,
            user_id: currentUser.id,
            text
          });

      if (error) {
        toast(error.message);
      } else {
        showWatch(id);
      }
    };
}

async function toggleLike(id, wasLiked) {
  if (!currentUser) {
    return openAuth(false);
  }

  if (wasLiked) {
    await sb
      .from("likes")
      .delete()
      .eq("video_id", id)
      .eq("user_id", currentUser.id);
  } else {
    await sb
      .from("likes")
      .insert({
        video_id: id,
        user_id: currentUser.id
      });
  }

  showWatch(id);
}

async function toggleSub(creator, wasSubscribed) {
  if (!currentUser) {
    return openAuth(false);
  }

  if (creator === currentUser.id) {
    return toast("You can't subscribe to yourself.");
  }

  if (wasSubscribed) {
    await sb
      .from("subscriptions")
      .delete()
      .eq("creator_id", creator)
      .eq("subscriber_id", currentUser.id);
  } else {
    await sb
      .from("subscriptions")
      .insert({
        creator_id: creator,
        subscriber_id: currentUser.id
      });
  }

  const id =
    location.hash.split("/")[1];

  showWatch(id);
}

async function repost(id) {
  if (!currentUser) {
    return openAuth(false);
  }

  const { error } =
    await sb
      .from("reposts")
      .upsert({
        video_id: id,
        user_id: currentUser.id
      });

  toast(
    error
      ? error.message
      : "Reposted to your profile."
  );
}

// ===============================
// PROFILE
// ===============================

async function showProfile(id) {
  if (!ready || !id) return;

  const { data: p } =
    await sb
      .from("profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();

  const videos =
    await queryVideos({
      creator: id
    });

  const { count: subscribers } =
    await sb
      .from("subscriptions")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("creator_id", id);

  const mine =
    currentUser?.id === id;

  let following = false;

  if (currentUser && !mine) {
    const { data } =
      await sb
        .from("subscriptions")
        .select("*")
        .eq("creator_id", id)
        .eq("subscriber_id", currentUser.id)
        .maybeSingle();

    following = !!data;
  }

  $("profileContent").innerHTML = `
    <div class="profileHead">

      <img
        class="avatar"
        src="${esc(
          p?.avatar_url ||
          "./assets/nockage-logo.png"
        )}"
        alt=""
      >

      <div>

        <h1>
          ${esc(
            p?.display_name ||
            p?.username ||
            "Creator"
          )}
        </h1>

        <div class="muted">
          @${esc(p?.username || "")}
          ·
          ${fmt(subscribers)} subscribers
        </div>

      </div>

      ${
        mine
          ? `
            <a class="primary" href="#studio">
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
        videos.map(v => videoCard(v)).join("") ||
        `
          <div class="empty">
            No public videos yet.
          </div>
        `
      }
    </div>
  `;

  if (!mine) {
    $("profileSub").onclick =
      () => toggleSub(id, following);
  }
}

// ===============================
// STUDIO
// ===============================

async function loadStudio() {
  if (!currentUser) {
    page("home");
    return openAuth(false);
  }

  const { data } =
    await sb
      .from("videos")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("created_at", {
        ascending: false
      });

  const videos = data || [];

  const views =
    videos.reduce(
      (total, v) =>
        total + Number(v.views || 0),
      0
    );

  const { count: subscribers } =
    await sb
      .from("subscriptions")
      .select("*", {
        count: "exact",
        head: true
      })
      .eq("creator_id", currentUser.id);

  if ($("studioStats")) {
    $("studioStats").innerHTML = `
      <div class="stat">
        <span>Views</span>
        <b>${fmt(views)}</b>
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
        <b>
          ${fmt(
            videos.filter(v => v.is_short).length
          )}
        </b>
      </div>
    `;
  }

  if ($("studioVideos")) {
    $("studioVideos").innerHTML =
      videos.map(v => `
        <div class="comment">

          <b>
            ${esc(v.title)}
          </b>

          <span class="pill">
            ${esc(v.visibility)}
          </span>

          <span class="muted">
            · ${fmt(v.views)} views
          </span>

        </div>
      `).join("") ||
      `
        <p class="muted">
          Upload your first video.
        </p>
      `;
  }
}

// ===============================
// UPLOAD
// ===============================

function setMode(mode) {
  uploadMode = mode;

  document.querySelectorAll(".mode")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.mode === mode
      );
    });

  if ($("uploadTitle")) {
    $("uploadTitle").textContent =
      mode === "short"
        ? "Create a Short"
        : "Upload a Video";
  }

  if ($("videoFile")) {
    $("videoFile").accept = "video/*";
  }
}

function setupUpload() {

  document.querySelectorAll(".mode")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => setMode(button.dataset.mode)
      );
    });

  $("videoFile")?.addEventListener(
    "change",
    e => {
      const file =
        e.target.files?.[0];

      if ($("fileInfo")) {
        $("fileInfo").textContent =
          file
            ? `${file.name} · ${(file.size / 1048576).toFixed(1)} MB`
            : "Maximum 50 MB on the free backend.";
      }
    }
  );

  $("uploadForm")?.addEventListener(
    "submit",
    async e => {

      e.preventDefault();

      if (!currentUser || !ready) {
        return openAuth(false);
      }

      const file =
        $("videoFile")?.files?.[0];

      if (!file) {
        return toast("Choose a video first.");
      }

      if (file.size > 50 * 1024 * 1024) {
        return toast(
          "This free setup accepts videos up to 50 MB."
        );
      }

      const title =
        $("videoTitle")?.value.trim() || "";

      const description =
        $("videoDescription")?.value.trim() || "";

      const visibility =
        $("visibility")?.value || "public";

      if (!title) {
        return toast(
          "Enter a video title."
        );
      }

      const progress =
        $("uploadProgress");

      const progressBar =
        progress?.querySelector("span");

      if (progress) {
        progress.style.display = "block";
      }

      if (progressBar) {
        progressBar.style.width = "20%";
      }

      try {

        const bucket = "Videos";

        const safeName =
          file.name.replace(
            /[^a-zA-Z0-9._-]/g,
            "_"
          );

        const path =
          `${currentUser.id}/${crypto.randomUUID()}-${safeName}`;

        const upload =
          await sb.storage
            .from(bucket)
            .upload(
              path,
              file,
              {
                contentType:
                  file.type || "video/mp4",
                upsert: false
              }
            );

        if (upload.error) {
          throw upload.error;
        }

        if (progressBar) {
          progressBar.style.width = "65%";
        }

        const publicUrl =
          sb.storage
            .from(bucket)
            .getPublicUrl(path)
            .data
            .publicUrl;

        const { error } =
          await sb
            .from("videos")
            .insert({
              user_id: currentUser.id,
              title,
              description,
              video_url: publicUrl,
              storage_path: path,
              thumbnail_url: null,
              visibility,
              is_short:
                uploadMode === "short",
              allow_comments:
                $("allowComments")?.checked ?? true
            });

        if (error) {
          throw error;
        }

        if (progressBar) {
          progressBar.style.width = "100%";
        }

        toast("Published to Nockage!");

        e.target.reset();

        setTimeout(() => {
          location.hash = "#studio";
        }, 500);

      } catch (err) {

        console.error(
          "Nockage upload error:",
          err
        );

        toast(
          err.message ||
          "Upload failed."
        );

      } finally {

        setTimeout(() => {
          if (progress) {
            progress.style.display = "none";
          }
        }, 700);

      }
    }
  );
}

// ===============================
// NAVIGATION
// ===============================

function setupButtons() {

  setupAuth();
  setupUpload();

  $("logoutBtn")?.addEventListener(
    "click",
    logout
  );

  $("heroUpload")?.addEventListener(
    "click",
    () => {
      if (currentUser) {
        location.hash = "#upload";
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

      location.hash = "#upload";

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

      location.hash = "#upload";
    }
  );

  $("searchBtn")?.addEventListener(
    "click",
    () => {
      const q =
        $("searchInput")?.value.trim();

      if (q) {
        location.hash =
          "#search/" +
          encodeURIComponent(q);
      }
    }
  );

  $("searchInput")?.addEventListener(
    "keydown",
    e => {
      if (e.key === "Enter") {
        $("searchBtn")?.click();
      }
    }
  );
}

async function route() {

  const hash =
    location.hash.slice(1);

  const decoded =
    decodeURIComponent(hash);

  const parts =
    decoded.split("/");

  const routeName =
    parts[0] || "home";

  if (routeName === "home") {

    page("home");
    await loadHome();

  } else if (routeName === "shorts") {

    page("shorts");
    await loadShorts();

  } else if (routeName === "subscriptions") {

    page("subscriptions");
    await loadSubs();

  } else if (routeName === "search") {

    page("search");

    await searchVideos(
      parts.slice(1).join("/") || ""
    );

  } else if (routeName === "watch") {

    page("watch");
    await showWatch(parts[1]);

  } else if (routeName === "studio") {

    page("studio");
    await loadStudio();

  } else if (routeName === "profile") {

    page("profile");
    await showProfile(parts[1]);

  } else if (routeName === "upload") {

    if (!currentUser) {
      page("home");
      return openAuth(false);
    }

    page("upload");

  } else if (routeName === "settings") {

    page("settings");

    if ($("settingsName")) {
      $("settingsName").textContent =
        profile?.username || "—";
    }

  } else {

    page("home");
    await loadHome();
  }
}

window.addEventListener(
  "hashchange",
  route
);

// ===============================
// START
// ===============================

boot();