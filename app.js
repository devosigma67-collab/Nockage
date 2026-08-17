/* Nockage real backend client.
   Replace the two values below with your Supabase project's public browser credentials. */
const NOCKAGE_CONFIG = {
  SUPABASE_URL: "https://ljveziwuxbiajxtguppy.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_pF6Fs7rvL1C-ib1mg_MRxg_qWuX8Int"
};

const ready = !NOCKAGE_CONFIG.SUPABASE_URL.startsWith("PASTE_") && !NOCKAGE_CONFIG.SUPABASE_ANON_KEY.startsWith("PASTE_");
let sb = ready ? supabase.createClient(NOCKAGE_CONFIG.SUPABASE_URL, NOCKAGE_CONFIG.SUPABASE_ANON_KEY) : null;
let currentUser = null, profile = null, uploadMode = "video";

const $ = id => document.getElementById(id);
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600)}
function fmt(n){n=Number(n||0);return n>=1e9?(n/1e9).toFixed(1).replace(/\.0$/,"")+"B":n>=1e6?(n/1e6).toFixed(1).replace(/\.0$/,"")+"M":n>=1e3?(n/1e3).toFixed(1).replace(/\.0$/,"")+"K":String(n)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function page(id){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));$(id)?.classList.add("active");window.scrollTo(0,0)}
function requireConfig(){if(!ready){toast("Finish the Supabase setup first.");return false}return true}


async function boot(){
  if(!ready){toast("Nockage is ready to connect — add your Supabase keys in app.js.");}
  if(ready){
    const {data:{session}}=await sb.auth.getSession(); await setUser(session?.user||null);
    sb.auth.onAuthStateChange(async(_e,s)=>{await setUser(s?.user||null)});
  }
  route(); loadHome();
}
async function setUser(u){
  currentUser=u; profile=null;
  if(u){const {data}=await sb.from("profiles").select("*").eq("id",u.id).maybeSingle();profile=data||null}
  renderAccount();
}
function renderAccount(){
  $("accountArea").innerHTML=currentUser
    ? `<a class="ghost" href="#studio">Studio</a><a class="ghost" href="#profile/${currentUser.id}">${esc(profile?.username||"Account")}</a><button class="primary" id="quickLogout">Log out</button>`
    : `<button class="ghost" id="loginBtn">Log in</button><button class="primary" id="signupBtn">Create account</button>`;
  $("loginBtn")?.addEventListener("click",()=>openAuth(false));$("signupBtn")?.addEventListener("click",()=>openAuth(true));$("quickLogout")?.addEventListener("click",logout);
}
function openAuth(signup){$("authModal").classList.remove("hidden");$("authTitle").textContent=signup?"Create your Nockage account":"Log in to Nockage";$("authSubmit").textContent=signup?"Create account":"Log in";$("switchAuth").textContent=signup?"Already have an account? Log in":"New to Nockage? Create account";$("authHint").textContent="";$("authForm").dataset.signup=signup?"1":"0"}
$("closeAuth").onclick=()=> $("authModal").classList.add("hidden");
$("switchAuth").onclick=()=>openAuth($("authForm").dataset.signup!=="1");
$("authForm").onsubmit=async e=>{e.preventDefault();if(!requireConfig())return;const u=$("authUsername").value.trim(),email=$("authEmail").value.trim(),p=$("authPassword").value;const signup=$("authForm").dataset.signup==="1";if(!/^[A-Za-z0-9_]{3,24}$/.test(u))return toast("Username must be 3–24 letters, numbers or _");
  $("authSubmit").disabled=true;
  try{
    
    if(signup){
      const {data,error}=await sb.auth.signUp({email,password:p,options:{data:{username:u}}});
      if(error)throw error;
      if(data.user){await sb.from("profiles").upsert({id:data.user.id,username:u,display_name:u});}
      toast("Account created!");$("authModal").classList.add("hidden");
    }else{
      const {error}=await sb.auth.signInWithPassword({email,password:p});if(error)throw error;
      toast("Welcome back!");$("authModal").classList.add("hidden");
    }
  }catch(err){$("authHint").textContent=err.message||"Something went wrong."}finally{$("authSubmit").disabled=false}
};
async function logout(){if(ready)await sb.auth.signOut();location.hash="#home";toast("Logged out")}
$("logoutBtn").onclick=logout;

async function queryVideos({shorts=false,creator=null,search=null,limit=30}={}){
  if(!ready)return [];
  let q=sb.from("videos").select("id,user_id,title,description,video_url,thumbnail_url,visibility,is_short,views,created_at,profiles(username,display_name)").eq("visibility","public").order("created_at",{ascending:false}).limit(limit);
  if(shorts)q=q.eq("is_short",true); else q=q.eq("is_short",false);
  if(creator)q=q.eq("user_id",creator);
  if(search)q=q.ilike("title",`%${search}%`);
  const {data,error}=await q;if(error){console.error(error);return []}return data||[];
}
function videoCard(v,short=false){const thumb=v.thumbnail_url||"";return `<article class="card ${short?"shortCard":""}" onclick="location.hash='#watch/${v.id}'"><img class="thumb" src="${esc(thumb)}" alt="" loading="lazy" onerror="this.style.display='none'"><div class="cardBody"><div class="cardTitle">${esc(v.title)}</div><div class="meta">${esc(v.profiles?.display_name||v.profiles?.username||"Creator")} · ${fmt(v.views)} views</div></div></article>`}
async function loadHome(){const vs=await queryVideos();$("homeGrid").innerHTML=vs.length?vs.map(v=>videoCard(v)).join():"<div class='empty'>No public videos yet. Create the first one!</div>";$("homeCount").textContent=vs.length?`${vs.length} videos`:""}
async function loadShorts(){const vs=await queryVideos({shorts:true});$("shortsGrid").innerHTML=vs.length?vs.map(v=>videoCard(v,true)).join():"<div class='empty'>No Shorts yet.</div>"}
async function loadSubs(){if(!currentUser){$("subsGrid").innerHTML="";$("subsEmpty").style.display="block";return}const {data:s}=await sb.from("subscriptions").select("creator_id").eq("subscriber_id",currentUser.id);const ids=(s||[]).map(x=>x.creator_id);if(!ids.length){$("subsGrid").innerHTML="";$("subsEmpty").style.display="block";return}$("subsEmpty").style.display="none";let all=[];for(const id of ids)all.push(...await queryVideos({creator:id}));$("subsGrid").innerHTML=all.length?all.map(v=>videoCard(v)).join():"<div class='empty'>Your subscriptions have no public videos yet.</div>"}
async function search(q){page("search");$("searchLabel").textContent=q;const vs=await queryVideos({search:q,limit:50});$("searchGrid").innerHTML=vs.length?vs.map(v=>videoCard(v)).join():"<div class='empty'>No results.</div>"}

async function showWatch(id){
  if(!ready)return;
  const {data:v,error}=await sb.from("videos").select("*,profiles(username,display_name)").eq("id",id).maybeSingle();if(error||!v){return toast("Video not found")}
  if(v.visibility==="private" && v.user_id!==currentUser?.id)return toast("This video is private");
  await sb.from("videos").update({views:(v.views||0)+1}).eq("id",id);
  let liked=false,sub=false,comments=[];
  if(currentUser){
    liked=!!(await sb.from("likes").select("video_id").eq("video_id",id).eq("user_id",currentUser.id).maybeSingle()).data;
    sub=!!(await sb.from("subscriptions").select("creator_id").eq("creator_id",v.user_id).eq("subscriber_id",currentUser.id).maybeSingle()).data;
  }
  const {data:cs}=await sb.from("comments").select("id,text,created_at,profiles(username,display_name)").eq("video_id",id).order("created_at",{ascending:false}).limit(50);comments=cs||[];
  $("watchContent").innerHTML=`<div class="watch"><div><video class="watchVideo" controls playsinline preload="metadata" src="${esc(v.video_url)}"></video><h1>${esc(v.title)}</h1><div class="meta">${esc(v.profiles?.display_name||v.profiles?.username)} · ${fmt(v.views)} views</div><div class="actions"><button class="ghost" id="likeBtn">${liked?"♥ Liked":"♡ Like"}</button><button class="ghost" id="repostBtn">↻ Repost</button><button class="primary" id="subBtn">${sub?"Subscribed":"Subscribe"}</button></div><p>${esc(v.description||"")}</p></div><aside class="panel"><h3>Comments</h3><form id="commentForm"><input id="commentInput" placeholder="${currentUser?"Add a comment…":"Log in to comment"}" ${currentUser?"":"disabled"}><button class="primary wide" ${currentUser?"":"disabled"}>Comment</button></form><div id="comments">${comments.map(c=>`<div class="comment"><b>${esc(c.profiles?.display_name||c.profiles?.username||"User")}</b><div>${esc(c.text)}</div></div>`).join("")||"<p class='muted'>No comments yet.</p>"}</div></aside></div>`;
  $("likeBtn").onclick=()=>toggleLike(id,liked);$("subBtn").onclick=()=>toggleSub(v.user_id,sub);$("repostBtn").onclick=()=>repost(id);
  $("commentForm").onsubmit=async e=>{e.preventDefault();const text=$("commentInput").value.trim();if(!text||!currentUser)return;const {error}=await sb.from("comments").insert({video_id:id,user_id:currentUser.id,text});if(error)toast(error.message);else showWatch(id)}
}
async function toggleLike(id,was){if(!currentUser)return openAuth(false);if(was)await sb.from("likes").delete().eq("video_id",id).eq("user_id",currentUser.id);else await sb.from("likes").insert({video_id:id,user_id:currentUser.id});showWatch(id)}
async function toggleSub(creator,was){if(!currentUser)return openAuth(false);if(creator===currentUser.id)return toast("You can't subscribe to yourself.");if(was)await sb.from("subscriptions").delete().eq("creator_id",creator).eq("subscriber_id",currentUser.id);else await sb.from("subscriptions").insert({creator_id:creator,subscriber_id:currentUser.id});showWatch(location.hash.split("/")[1])}
async function repost(id){if(!currentUser)return openAuth(false);const {error}=await sb.from("reposts").upsert({video_id:id,user_id:currentUser.id});toast(error?error.message:"Reposted to your profile.")}
async function showProfile(id){if(!ready)return;const {data:p}=await sb.from("profiles").select("*").eq("id",id).maybeSingle();const vs=await queryVideos({creator:id});const {count:subs}=await sb.from("subscriptions").select("*",{count:"exact",head:true}).eq("creator_id",id);const mine=currentUser?.id===id;let following=false;if(currentUser&&!mine)following=!!(await sb.from("subscriptions").select("*").eq("creator_id",id).eq("subscriber_id",currentUser.id).maybeSingle()).data;
  $("profileContent").innerHTML=`<div class="profileHead"><img class="avatar" src="${esc(p?.avatar_url||"./assets/nockage-logo.png")}" alt=""><div><h1>${esc(p?.display_name||p?.username||"Creator")}</h1><div class="muted">@${esc(p?.username||"")} · ${fmt(subs)} subscribers</div></div>${mine?`<a class="primary" href="#studio">Nockage Studio</a>`:`<button class="primary" id="profileSub">${following?"Subscribed":"Subscribe"}</button>`}</div><div class="sectionHead"><h2>Videos</h2></div><div class="videoGrid">${vs.map(v=>videoCard(v)).join()||"<div class='empty'>No public videos yet.</div>"}</div>`;
  if(!mine)$("profileSub").onclick=()=>toggleSub(id,following);
}

async function loadStudio(){if(!currentUser){page("home");openAuth(false);return}const {data:vs}=await sb.from("videos").select("*").eq("user_id",currentUser.id).order("created_at",{ascending:false});const vids=vs||[];const views=vids.reduce((a,v)=>a+(v.views||0),0);const {count:subs}=await sb.from("subscriptions").select("*",{count:"exact",head:true}).eq("creator_id",currentUser.id);$("studioStats").innerHTML=`<div class="stat"><span>Views</span><b>${fmt(views)}</b></div><div class="stat"><span>Subscribers</span><b>${fmt(subs)}</b></div><div class="stat"><span>Videos</span><b>${fmt(vids.length)}</b></div><div class="stat"><span>Shorts</span><b>${fmt(vids.filter(v=>v.is_short).length)}</b></div>`;$("studioVideos").innerHTML=vids.map(v=>`<div class="comment"><b>${esc(v.title)}</b><span class="pill">${v.visibility}</span><span class="muted"> · ${fmt(v.views)} views</span></div>`).join("")||"<p class='muted'>Upload your first video.</p>"}
$("heroUpload").onclick=()=>currentUser?location.hash="#upload":openAuth(false);$("shortUpload").onclick=()=>currentUser?(location.hash="#upload",setTimeout(()=>setMode("short"),0)):openAuth(false);$("studioUpload").onclick=()=>location.hash="#upload";
$("searchBtn").onclick=()=>{const q=$("searchInput").value.trim();if(q)location.hash="#search/"+encodeURIComponent(q)};$("searchInput").onkeydown=e=>{if(e.key==="Enter")$("searchBtn").click()};

function setMode(m){uploadMode=m;document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("active",b.dataset.mode===m));$("uploadTitle").textContent=m==="short"?"Create a Short":"Upload a Video";$("videoFile").accept="video/*"}
document.querySelectorAll(".mode").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
$("videoFile").onchange=e=>{const f=e.target.files[0];$("fileInfo").textContent=f?`${f.name} · ${(f.size/1048576).toFixed(1)} MB`:"Maximum 50 MB on the free backend."}

$("uploadForm").onsubmit=async e=>{
  e.preventDefault();if(!currentUser||!ready)return openAuth(false);const file=$("videoFile").files[0];if(!file)return; if(file.size>50*1024*1024)return toast("This free setup accepts videos up to 50 MB.");
  const title=$("videoTitle").value.trim();const desc=$("videoDescription").value.trim();const visibility=$("visibility").value;
  $("uploadProgress").style.display="block";$("uploadProgress span").style.width="20%";
  try{
    const bucket=visibility==="private"?"private-videos":"public-videos";
    const path=`${currentUser.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    const up=await sb.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error;
    $("uploadProgress span").style.width="65%";
    let videoUrl="";
    if(bucket==="public-videos")videoUrl=sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    else videoUrl=path;
    let thumbUrl=null;const tf=$("thumbFile").files[0];if(tf){const tp=`${currentUser.id}/${crypto.randomUUID()}-${tf.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const tu=await sb.storage.from("thumbnails").upload(tp,tf,{contentType:tf.type});if(!tu.error)thumbUrl=sb.storage.from("thumbnails").getPublicUrl(tp).data.publicUrl}
    const {error}=await sb.from("videos").insert({user_id:currentUser.id,title,description:desc,video_url:videoUrl,storage_path:path,thumbnail_url:thumbUrl,visibility,is_short:uploadMode==="short",allow_comments:$("allowComments").checked});
    if(error)throw error;$("uploadProgress span").style.width="100%";toast("Published to Nockage!");e.target.reset();location.hash="#studio";
  }catch(err){toast(err.message||"Upload failed.");console.error(err)}finally{setTimeout(()=>$("uploadProgress").style.display="none",500)}
};

async function route(){
  const parts=decodeURIComponent(location.hash.slice(1)).split("/");const r=parts[0]||"home";
  if(r==="home"){page("home");loadHome()}else if(r==="shorts"){page("shorts");loadShorts()}else if(r==="subscriptions"){page("subscriptions");loadSubs()}else if(r==="search"){page("search");search(parts.slice(1).join("/")||"")}else if(r==="watch"){page("watch");showWatch(parts[1])}else if(r==="studio"){page("studio");loadStudio()}else if(r==="profile"){page("profile");showProfile(parts[1])}else if(r==="upload"){page("upload");if(!currentUser)openAuth(false)}else if(r==="settings"){page("settings");$("settingsName").textContent=profile?.username||"—"}else{page("home");loadHome()}
}
window.addEventListener("hashchange",route);
boot();
