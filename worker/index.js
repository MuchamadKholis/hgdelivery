const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const uid=()=>crypto.randomUUID(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha(s){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))}
async function hashPass(p,salt=uid()){const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(p),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:100000,hash:"SHA-256"},k,256);return salt+":"+hex(bits)}
async function validPass(p,h){const [salt,want]=h.split(":");return (await hashPass(p,salt)).split(":")[1]===want}
async function body(r){try{return await r.json()}catch{return null}}
const validEmail=e=>typeof e==="string"&&e.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
async function loginAllowed(env,email,ip){
  const now=Math.floor(Date.now()/1000),windowSeconds=15*60;
  const keys=[{key:await sha(email.toLowerCase()+"|"+ip),limit:5},{key:await sha("ip|"+ip),limit:30}];
  for(const item of keys){
    const row=await env.DB.prepare("SELECT window_started_at,attempts FROM auth_login_limits WHERE limit_key=?").bind(item.key).first();
    if(row&&now-row.window_started_at<windowSeconds&&row.attempts>=item.limit)return false;
  }
  for(const item of keys){
    await env.DB.prepare("INSERT INTO auth_login_limits(limit_key,window_started_at,attempts) VALUES(?,?,1) ON CONFLICT(limit_key) DO UPDATE SET window_started_at=CASE WHEN excluded.window_started_at-auth_login_limits.window_started_at>=900 THEN excluded.window_started_at ELSE auth_login_limits.window_started_at END,attempts=CASE WHEN excluded.window_started_at-auth_login_limits.window_started_at>=900 THEN 1 ELSE auth_login_limits.attempts+1 END,updated_at=CURRENT_TIMESTAMP").bind(item.key,now).run();
  }
  return true;
}
async function clearLoginLimit(env,email,ip){
  const key=await sha(email.toLowerCase()+"|"+ip);
  await env.DB.prepare("DELETE FROM auth_login_limits WHERE limit_key=?").bind(key).run();
}
const cookie=(v,n)=>"hg_session="+v+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+n;
async function userFrom(r,env){const t=(r.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("hg_session="))?.slice(11);if(!t)return null;return env.DB.prepare("SELECT u.id,u.name,u.email,u.phone,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1").bind(await sha(t),new Date().toISOString()).first()}

const DRIVE_API="https://www.googleapis.com/drive/v3";
async function googleAccessToken(env){
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.GOOGLE_REFRESH_TOKEN)throw new Error("Google Drive belum dikonfigurasi");
  const form=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:"refresh_token"});
  const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:form});
  const data=await res.json();if(!res.ok||!data.access_token)throw new Error("Gagal memperoleh akses Google Drive");return data.access_token;
}
async function driveRequest(env,path,options={}){
  const token=await googleAccessToken(env);
  return fetch(DRIVE_API+path,{...options,headers:{authorization:"Bearer "+token,...(options.headers||{})}});
}
async function driveProofFolder(env){
  const row=await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='google_drive_proofs_folder_id'").first();
  if(row?.setting_value)return row.setting_value;
  const res=await driveRequest(env,"/files?fields=files(id,name,mimeType)&pageSize=100&q="+encodeURIComponent("mimeType='application/vnd.google-apps.folder' and name='HGDelivery Proofs' and trashed=false"));
  const data=await res.json();if(!res.ok)throw new Error("Tidak bisa mencari folder Google Drive");
  let folder=data.files?.[0];
  if(!folder){
    const made=await driveRequest(env,"/files?fields=id,name",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"HGDelivery Proofs",mimeType:"application/vnd.google-apps.folder"})});
    folder=await made.json();if(!made.ok||!folder.id)throw new Error("Tidak bisa membuat folder bukti HGDelivery");
  }
  await env.DB.prepare("INSERT INTO app_settings(setting_key,setting_value) VALUES('google_drive_proofs_folder_id',?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_at=CURRENT_TIMESTAMP").bind(folder.id).run();
  return folder.id;
}
async function uploadDriveProof(env,file,orderId){
  const folderId=await driveProofFolder(env),token=await googleAccessToken(env);
  const safeName=(file.name||"proof").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,100);
  const name=orderId+"_"+Date.now()+"_"+safeName;
  const init=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json","x-upload-content-type":file.type,"x-upload-content-length":String(file.size)},body:JSON.stringify({name,mimeType:file.type,parents:[folderId]})});
  const session=init.headers.get("location");if(!init.ok||!session)throw new Error("Google Drive menolak memulai upload");
  const sent=await fetch(session,{method:"PUT",headers:{"content-type":file.type},body:file.stream()});
  const meta=await sent.json();if(!sent.ok||!meta.id)throw new Error("Upload foto ke Google Drive gagal");return meta;
}

async function api(r,env){const u=new URL(r.url),p=u.pathname;
if(!["GET","HEAD","OPTIONS"].includes(r.method)){
  const origin=r.headers.get("Origin");
  if(!origin||origin!==u.origin)return json({error:"Permintaan lintas situs ditolak"},403);
}
if(r.method==="POST"&&p==="/api/auth/bootstrap"){
 const b=await body(r);
 if(!env.BOOTSTRAP_ADMIN_PASSWORD||typeof b?.bootstrapPassword!=="string"||b.bootstrapPassword!==env.BOOTSTRAP_ADMIN_PASSWORD)return json({error:"Bootstrap tidak valid"},403);
 if(typeof b.name!=="string"||typeof b.email!=="string"||typeof b.password!=="string"||b.name.trim().length<2||b.name.length>100||!validEmail(b.email.trim())||b.password.length<12||b.password.length>1024)return json({error:"Nama, email, atau password tidak memenuhi ketentuan"},400);
 const email=b.email.trim().toLowerCase();
 let passwordHash;
 try{
  passwordHash=await hashPass(b.password);
 }catch(e){
  console.error("ADMIN_BOOTSTRAP_HASH_FAILED",e?.name||"Error",e?.message||String(e));
  return json({error:"Gagal memproses password admin",diagnostic:String(e?.message||e).slice(0,240)},500);
 }
 try{
  const made=await env.DB.prepare("INSERT INTO users(id,name,email,password_hash,role) SELECT ?,?,?,?,'ADMIN' WHERE NOT EXISTS (SELECT 1 FROM users WHERE role='ADMIN')").bind(uid(),b.name.trim(),email,passwordHash).run();
  if(!made.meta?.changes)return json({error:"Admin sudah dibuat"},409);
 }catch(e){
  console.error("ADMIN_BOOTSTRAP_INSERT_FAILED",e?.name||"Error",e?.message||String(e));
  return json({error:"Gagal menyimpan admin",diagnostic:String(e?.message||e).slice(0,240)},500);
 }
 await env.DB.prepare("INSERT INTO audit_logs(id,action,entity_type,detail) VALUES(?,'ADMIN_BOOTSTRAP','USER',?)").bind(uid(),email).run();
 return json({ok:true,message:"Admin berhasil dibuat. Hapus secret BOOTSTRAP_ADMIN_PASSWORD sekarang."},201);
}
if(r.method==="POST"&&p==="/api/auth/login"){
 const b=await body(r);if(!b?.email||!b?.password||typeof b.email!=="string"||typeof b.password!=="string")return json({error:"Email dan password wajib"},400);
 const email=b.email.trim().toLowerCase();if(email.length>254||b.password.length>1024)return json({error:"Data login tidak valid"},400);
 const ip=r.headers.get("CF-Connecting-IP")||"unknown";
 if(!(await loginAllowed(env,email,ip)))return json({error:"Terlalu banyak percobaan login. Coba lagi dalam 15 menit."},429,{"retry-after":"900"});
 const a=await env.DB.prepare("SELECT * FROM users WHERE (lower(email)=? OR phone=?) AND active=1").bind(email,b.email.trim()).first();
 if(!a||!(await validPass(b.password,a.password_hash)))return json({error:"Email atau password salah"},401);
 await clearLoginLimit(env,email,ip);
 const t=hex(crypto.getRandomValues(new Uint8Array(32))),exp=new Date(Date.now()+604800000).toISOString();
 await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(t),a.id,exp).run();
 return json({user:{id:a.id,name:a.name,email:a.email,role:a.role}},200,{"set-cookie":cookie(t,604800)});
}
if(r.method==="POST"&&p==="/api/auth/register"){
 const b=await body(r);
 if(typeof b?.name!=="string"||typeof b?.email!=="string"||typeof b?.password!=="string"||b.name.trim().length<2||b.name.trim().length>100||!validEmail(b.email.trim())||b.password.length<12||b.password.length>1024)return json({error:"Nama, email, atau password tidak valid. Password minimal 12 karakter."},400);
 const email=b.email.trim().toLowerCase(),phone=typeof b.phone==="string"?b.phone.trim().slice(0,30):"",id=uid();
 try{await env.DB.prepare("INSERT INTO users(id,name,email,phone,password_hash,role) VALUES(?,?,?,?,?,'CUSTOMER')").bind(id,b.name.trim(),email,phone||null,await hashPass(b.password)).run()}
 catch(e){if(String(e?.message||e).includes("UNIQUE"))return json({error:"Email sudah terdaftar. Gunakan email lain atau masuk."},409);throw e}
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),expires=new Date(Date.now()+604800000).toISOString();
 await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(token),id,expires).run();
 await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,'CUSTOMER_REGISTERED','USER',?,'Pendaftaran customer mandiri')").bind(uid(),id,id).run();
 return json({ok:true,user:{id,name:b.name.trim(),email,phone,role:"CUSTOMER"}},201,{"set-cookie":cookie(token,604800)});
}
if(r.method==="POST"&&p==="/api/auth/logout")if(r.method==="POST"&&p==="/api/auth/logout"){const t=(r.headers.get("cookie")||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("hg_session="))?.slice(11);if(t)await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(t)).run();return json({ok:true},200,{"set-cookie":cookie("",0)})}
const user=await userFrom(r,env);if(p==="/api/auth/me"&&r.method==="GET")return user?json({user}):json({error:"Unauthorized"},401);if(!user)return json({error:"Silakan login"},401);
if(p==="/api/geocode/search"&&r.method==="GET"){
 const q=(u.searchParams.get("q")||"").trim();
 if(q.length<3||q.length>180)return json({error:"Masukkan minimal 3 karakter alamat."},400);
 let results=[];
 try{
  const photon=new URL("https://photon.komoot.io/api/");
  photon.search=new URLSearchParams({q,lang:"id",limit:"10",lat:"-6.3000",lon:"106.8000"}).toString();
  const pr=await fetch(photon.toString(),{headers:{"Accept":"application/geo+json"}});
  if(pr.ok){const pd=await pr.json().catch(()=>null);results=(pd?.features||[]).map(f=>({lat:String(f.geometry.coordinates[1]),lon:String(f.geometry.coordinates[0]),display_name:[f.properties.name,f.properties.street,f.properties.district,f.properties.city||f.properties.county,f.properties.state,f.properties.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(", "),source:"Photon"}))}
 }catch(e){console.error("PHOTON_GEOCODE_FAILED",String(e))}
 if(!results.length){
  try{const target=new URL("https://nominatim.openstreetmap.org/search");target.search=new URLSearchParams({format:"jsonv2",addressdetails:"1",limit:"8",countrycodes:"id",accept_language:"id",q}).toString();const nr=await fetch(target.toString(),{headers:{"User-Agent":"HGDelivery/1.0 (address search)","Accept-Language":"id"}});if(nr.ok){const rows=await nr.json().catch(()=>[]);results=(Array.isArray(rows)?rows:[]).map(x=>({...x,source:"Nominatim"}))}else console.error("NOMINATIM_GEOCODE_FAILED",nr.status)}catch(e){console.error("NOMINATIM_GEOCODE_FAILED",String(e))}
 }
 return json({results:results.slice(0,10)});
}
if(p==="/api/geocode/reverse"&&r.method==="GET"){
 const lat=Number(u.searchParams.get("lat")),lon=Number(u.searchParams.get("lon"));
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return json({error:"Titik koordinat tidak valid."},400);
 try{const target=new URL("https://nominatim.openstreetmap.org/reverse");target.search=new URLSearchParams({format:"jsonv2",lat:String(lat),lon:String(lon),zoom:"18",addressdetails:"1",accept_language:"id"}).toString();const response=await fetch(target.toString(),{headers:{"User-Agent":"HGDelivery/1.0 (reverse address)","Accept-Language":"id"}});if(response.ok){const result=await response.json().catch(()=>null);if(result?.display_name)return json({display_name:result.display_name})}}catch(e){console.error("GEOCODE_REVERSE_FAILED",String(e))}
 return json({display_name:lat.toFixed(6)+", "+lon.toFixed(6)});
}
if(r.method==="POST"&&p==="/api/route/estimate"){
 if(user.role!=="ADMIN"&&user.role!=="CUSTOMER")return json({error:"Fitur estimasi hanya untuk admin dan customer"},403);
 const b=await body(r),coords=[b?.pickup_lat,b?.pickup_lng,b?.destination_lat,b?.destination_lng];
 if(!b||!coords.every(v=>typeof v==="number"&&Number.isFinite(v))||Math.abs(b.pickup_lat)>90||Math.abs(b.destination_lat)>90||Math.abs(b.pickup_lng)>180||Math.abs(b.destination_lng)>180)return json({error:"Koordinat lokasi tidak valid"},400);
 if(Math.abs(b.pickup_lat-b.destination_lat)<0.000001&&Math.abs(b.pickup_lng-b.destination_lng)<0.000001)return json({error:"Lokasi jemput dan tujuan masih berada di titik yang sama. Geser salah satu pin."},400);
 const coordsText=b.pickup_lng+","+b.pickup_lat+";"+b.destination_lng+","+b.destination_lat;
 let routeData=null,provider="OSRM";
 try{const osrm=await fetch("https://router.project-osrm.org/route/v1/driving/"+coordsText+"?overview=full&geometries=geojson&steps=false");const od=await osrm.json().catch(()=>null);if(osrm.ok&&od?.code==="Ok"&&od.routes?.[0])routeData={distance:od.routes[0].distance,duration:od.routes[0].duration,geometry:od.routes[0].geometry};else console.error("OSRM_ROUTE_FAILED",osrm.status,od?.code||"unknown")}catch(e){console.error("OSRM_NETWORK_FAILED",String(e))}
 if(!routeData&&env.OPENROUTESERVICE_API_KEY){
  try{const ors=await fetch("https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",{method:"POST",headers:{"authorization":env.OPENROUTESERVICE_API_KEY.trim(),"content-type":"application/json"},body:JSON.stringify({coordinates:[[b.pickup_lng,b.pickup_lat],[b.destination_lng,b.destination_lat]],instructions:false})});const od=await ors.json().catch(()=>null),summary=od?.features?.[0]?.properties?.summary;if(ors.ok&&summary){routeData={distance:summary.distance,duration:summary.duration,geometry:od.features[0].geometry};provider="HeiGIT OpenRouteService"}else console.error("HEIGIT_ROUTE_FAILED",ors.status,String(od?.error?.message||od?.message||"").slice(0,240))}catch(e){console.error("HEIGIT_ROUTE_NETWORK_FAILED",String(e))}
 }
 if(!routeData)return json({error:"Rute jalan belum berhasil ditemukan. Geser pin jemput/tujuan ke jalan terdekat lalu coba lagi."},502);
 return json({distance_km:Math.round(routeData.distance/100)/10,duration_minutes:Math.max(1,Math.round(routeData.duration/60)),geometry:routeData.geometry,provider,profile:"driving-car",note:"Estimasi jarak mengikuti rute jalan. Jarak aktual dapat berubah sesuai akses jalan dan kondisi lapangan.",attribution:"© OpenStreetMap contributors"});
}
const proofUploadParts=p.split("/");
if(proofUploadParts.length===5&&proofUploadParts[1]==="api"&&proofUploadParts[2]==="orders"&&proofUploadParts[4]==="proofs"&&r.method==="POST"){
 const orderId=proofUploadParts[3],order=await env.DB.prepare("SELECT id,customer_id,courier_id FROM orders WHERE id=?").bind(orderId).first();
 if(!order)return json({error:"Order tidak ditemukan"},404);
 if(user.role!=="COURIER"||order.courier_id!==user.id)return json({error:"Hanya kurir yang ditugaskan pada order ini yang dapat mengunggah bukti pembayaran"},403);
 const form=await r.formData(),file=form.get("file"),label=String(form.get("label")||"Bukti").slice(0,80);
 if(!file||typeof file.arrayBuffer!=="function")return json({error:"File foto wajib disertakan"},400);
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))return json({error:"Format foto harus JPG, PNG, atau WebP"},415);
 if(file.size<1||file.size>8*1024*1024)return json({error:"Ukuran foto maksimal 8 MB"},413);
 const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const jpeg=head[0]===0xff&&head[1]===0xd8&&head[2]===0xff;
 const png=head.length>=8&&head[0]===0x89&&head[1]===0x50&&head[2]===0x4e&&head[3]===0x47&&head[4]===0x0d&&head[5]===0x0a&&head[6]===0x1a&&head[7]===0x0a;
 const webp=head.length>=12&&String.fromCharCode(...head.slice(0,4))==="RIFF"&&String.fromCharCode(...head.slice(8,12))==="WEBP";
 if(!((file.type==="image/jpeg"&&jpeg)||(file.type==="image/png"&&png)||(file.type==="image/webp"&&webp)))return json({error:"Isi file tidak sesuai dengan format gambar yang diizinkan"},415);
 const meta=await uploadDriveProof(env,file,orderId),proofId=uid();
 await env.DB.batch([
  env.DB.prepare("INSERT INTO order_proofs(id,order_id,uploaded_by,object_key,content_type,size_bytes,label) VALUES(?,?,?,?,?,?,?)").bind(proofId,orderId,user.id,meta.id,file.type,file.size,label),
  env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,'ORDER_PROOF_UPLOADED','ORDER',?,?)").bind(uid(),user.id,orderId,label+" · "+file.type+" · "+file.size+" bytes")
 ]);
 return json({ok:true,proof:{id:proofId,label,content_type:file.type,size_bytes:file.size,created_at:new Date().toISOString()}},201);
}
const orderProofsMatch=p.match(/^\/api\/orders\/([\w-]+)\/proofs$/);
if(orderProofsMatch&&r.method==="GET"){
 const order=await env.DB.prepare("SELECT id,customer_id,courier_id FROM orders WHERE id=?").bind(orderProofsMatch[1]).first();
 if(!order)return json({error:"Order tidak ditemukan"},404);
 if(user.role!=="ADMIN"&&order.customer_id!==user.id&&order.courier_id!==user.id)return json({error:"Tidak berhak melihat bukti order ini"},403);
 const d=await env.DB.prepare("SELECT id,label,content_type,size_bytes,uploaded_by,created_at FROM order_proofs WHERE order_id=? ORDER BY created_at DESC").bind(order.id).all();
 return json({proofs:d.results});
}
const proofParts=p.split("/");
if(proofParts.length===4&&proofParts[1]==="api"&&proofParts[2]==="proofs"&&proofParts[3]&&r.method==="GET"){
 const proof=await env.DB.prepare("SELECT p.object_key,p.content_type,p.size_bytes,o.customer_id,o.courier_id FROM order_proofs p JOIN orders o ON o.id=p.order_id WHERE p.id=?").bind(proofParts[3]).first();
 if(!proof)return json({error:"Bukti tidak ditemukan"},404);
 if(user.role!=="ADMIN"&&proof.customer_id!==user.id&&proof.courier_id!==user.id)return json({error:"Tidak berhak melihat bukti ini"},403);
 const file=await driveRequest(env,"/files/"+encodeURIComponent(proof.object_key)+"?alt=media");
 if(!file.ok)return json({error:"Gagal mengambil foto dari Google Drive"},502);
 return new Response(file.body,{headers:{"content-type":proof.content_type,"content-length":String(proof.size_bytes),"cache-control":"private, no-store","x-content-type-options":"nosniff","content-disposition":"inline"}});
}

const orderPaymentsMatch=p.match(/^\/api\/orders\/([\w-]+)\/payments$/);
if(orderPaymentsMatch&&r.method==="GET"){
 const order=await env.DB.prepare("SELECT id,customer_id FROM orders WHERE id=?").bind(orderPaymentsMatch[1]).first();
 if(!order)return json({error:"Order tidak ditemukan"},404);
 if(user.role!=="ADMIN"&&!(user.role==="CUSTOMER"&&order.customer_id===user.id))return json({error:"Tidak berhak melihat pembayaran ini"},403);
 const d=await env.DB.prepare("SELECT id,amount,method,reference,status,paid_at,created_at FROM order_payments WHERE order_id=? ORDER BY created_at DESC").bind(order.id).all();
 return json({payments:d.results});
}
if(orderPaymentsMatch&&r.method==="POST"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin yang dapat mencatat pembayaran"},403);
 const b=await body(r),order=await env.DB.prepare("SELECT id,payment_status FROM orders WHERE id=?").bind(orderPaymentsMatch[1]).first();
 if(!order)return json({error:"Order tidak ditemukan"},404);
 if(order.payment_status==="PAID")return json({error:"Pembayaran order ini sudah tercatat lunas"},409);
 const methods=["CASH","BANK_TRANSFER","QRIS","OTHER"];
 if(!Number.isSafeInteger(b?.amount)||b.amount<1||b.amount>100000000||!methods.includes(b.method)||typeof (b.reference??"")!=="string"||(b.reference||"").length>100)return json({error:"Nominal, metode, atau referensi pembayaran tidak valid"},400);
 const id=uid(),ref=(b.reference||"").trim()||null;
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO order_payments(id,order_id,amount,method,reference,status,paid_at) VALUES(?,?,?,?,?,'PAID',CURRENT_TIMESTAMP)").bind(id,order.id,b.amount,b.method,ref),
   env.DB.prepare("UPDATE orders SET payment_status='PAID',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(order.id),
   env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,'PAYMENT_RECORDED','ORDER',?,?)").bind(uid(),user.id,order.id,"Rp "+b.amount+" · "+b.method+(ref?" · "+ref:""))
  ]);
 }catch(e){
  if(String(e?.message||e).includes("idx_order_single_paid_payment")||String(e?.message||e).includes("UNIQUE constraint failed: order_payments.order_id"))return json({error:"Pembayaran order ini sudah tercatat. Muat ulang daftar order."},409);
  throw e;
 }
 return json({ok:true,payment_id:id},201);
}
if(p==="/api/admin/dashboard"&&r.method==="GET"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const d=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM orders) total_orders,(SELECT COUNT(*) FROM orders WHERE status IN ('NEW_ORDER','VERIFIED','PENDING_PAYMENT')) waiting_orders,(SELECT COUNT(*) FROM orders WHERE status IN ('PROCESS','ON_TRIP','TRIP_COMPLETED','RESCHEDULE')) active_orders,(SELECT COUNT(*) FROM orders WHERE status='SUCCESS') completed_orders,(SELECT COUNT(*) FROM users WHERE role='COURIER' AND active=1) active_couriers,(SELECT COUNT(*) FROM users WHERE role='CUSTOMER' AND active=1) active_customers").first();
 return json({metrics:d});
}
if(p==="/api/admin/summary"&&r.method==="GET"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const [users,orders,activeOrders,completed,cancelled,couriers]=await Promise.all([
  env.DB.prepare("SELECT COUNT(*) n FROM users WHERE active=1").first(),
  env.DB.prepare("SELECT COUNT(*) n FROM orders").first(),
  env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('NEW_ORDER','VERIFIED','PENDING_PAYMENT','PROCESS','ON_TRIP','RESCHEDULE')").first(),
  env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE status IN ('TRIP_COMPLETED','SUCCESS')").first(),
  env.DB.prepare("SELECT COUNT(*) n FROM orders WHERE status='CANCEL'").first(),
  env.DB.prepare("SELECT COUNT(*) n FROM users WHERE role='COURIER' AND active=1").first()
 ]);
 return json({users:users.n,orders:orders.n,active_orders:activeOrders.n,completed:completed.n,cancelled:cancelled.n,active_couriers:couriers.n});
}
if(p==="/api/admin/users"&&r.method==="GET"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const d=await env.DB.prepare("SELECT id,name,email,phone,role,active,created_at FROM users ORDER BY created_at DESC LIMIT 500").all();
 return json({users:d.results});
}
if(p==="/api/admin/users"&&r.method==="POST"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const b=await body(r);
 if(typeof b?.name!=="string"||typeof b?.email!=="string"||typeof b?.password!=="string"||!["CUSTOMER","COURIER"].includes(b.role)||b.name.trim().length<2||b.name.length>100||!validEmail(b.email.trim())||b.password.length<12||b.password.length>1024)return json({error:"Nama, email, role, atau password tidak valid. Password minimal 12 karakter."},400);
 const id=uid(),email=b.email.trim().toLowerCase();
 try{
  await env.DB.prepare("INSERT INTO users(id,name,email,phone,password_hash,role) VALUES(?,?,?,?,?,?)").bind(id,b.name.trim(),email,typeof b.phone==="string"?b.phone.trim().slice(0,30):null,await hashPass(b.password),b.role).run();
 }catch{return json({error:"Email sudah digunakan atau data tidak valid"},409)}
 await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,'USER_CREATED','USER',?,?)").bind(uid(),user.id,id,b.role).run();
 return json({ok:true,user:{id,name:b.name.trim(),email,role:b.role,active:1}},201);
}
const activeMatch=p.match(/^\/api\/admin\/users\/([\w-]+)\/active$/);
if(activeMatch&&r.method==="PATCH"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const b=await body(r),target=await env.DB.prepare("SELECT id,role,active FROM users WHERE id=?").bind(activeMatch[1]).first();
 if(!target)return json({error:"Pengguna tidak ditemukan"},404);
 if(target.id===user.id&&b?.active===false)return json({error:"Akun admin yang sedang digunakan tidak dapat dinonaktifkan"},400);
 if(typeof b?.active!=="boolean")return json({error:"Status aktif tidak valid"},400);
 if(target.role==="ADMIN"&&b.active===false){
  const n=await env.DB.prepare("SELECT COUNT(*) n FROM users WHERE role='ADMIN' AND active=1").first();
  if(n.n<=1)return json({error:"Minimal harus ada satu admin aktif"},400);
 }
 await env.DB.prepare("UPDATE users SET active=? WHERE id=?").bind(b.active?1:0,target.id).run();
 if(!b.active)await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id).run();
 await env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?)").bind(uid(),user.id,b.active?"USER_ACTIVATED":"USER_DEACTIVATED","USER",target.id,target.role).run();
 return json({ok:true});
}
const assignMatch=p.match(/^\/api\/orders\/([\w-]+)\/assign$/);
if(assignMatch&&r.method==="PATCH"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const b=await body(r),courier=await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='COURIER' AND active=1").bind(b?.courierId).first();
 if(!courier)return json({error:"Pilih akun kurir aktif yang valid"},400);
 const order=await env.DB.prepare("SELECT id,courier_id,status FROM orders WHERE id=?").bind(assignMatch[1]).first();
 if(!order)return json({error:"Order tidak ditemukan"},404);
 await env.DB.batch([
  env.DB.prepare("UPDATE orders SET courier_id=?,assigned_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(courier.id,order.id),
  env.DB.prepare("INSERT INTO order_events(id,order_id,actor_id,from_status,to_status,note) VALUES(?,?,?,?,?,?)").bind(uid(),order.id,user.id,order.status,order.status,"Kurir ditugaskan: "+courier.id),
  env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,'COURIER_ASSIGNED','ORDER',?,?)").bind(uid(),user.id,order.id,courier.id)
 ]);
 return json({ok:true});
}
if(p==="/api/admin/pricing"&&r.method==="GET"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const d=await env.DB.prepare("SELECT id,service_type,rate_per_km,minimum_price,effective_from FROM pricing_rules WHERE active=1 ORDER BY service_type").all();
 return json({rules:d.results});
}
if(p==="/api/admin/pricing"&&r.method==="POST"){
 if(user.role!=="ADMIN")return json({error:"Hanya admin"},403);
 const b=await body(r),types=["RIDE_MOTOR","RIDE_CAR","SEND"];
 if(!types.includes(b?.service_type)||!Number.isSafeInteger(b.rate_per_km)||!Number.isSafeInteger(b.minimum_price)||b.rate_per_km<0||b.rate_per_km>10000000||b.minimum_price<0||b.minimum_price>100000000)return json({error:"Jenis layanan atau tarif tidak valid"},400);
 const id=uid();
 await env.DB.batch([
  env.DB.prepare("UPDATE pricing_rules SET active=0 WHERE service_type=? AND active=1").bind(b.service_type),
  env.DB.prepare("INSERT INTO pricing_rules(id,service_type,rate_per_km,minimum_price,active) VALUES(?,?,?,?,1)").bind(id,b.service_type,b.rate_per_km,b.minimum_price),
  env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,'PRICING_UPDATED','PRICING',?,?)").bind(uid(),user.id,id,b.service_type+" rate="+b.rate_per_km+" minimum="+b.minimum_price)
 ]);
 return json({ok:true,id},201);
}
if(p==="/api/orders"&&r.method==="GET"){let q=user.role==="ADMIN"?env.DB.prepare("SELECT o.*,c.name AS courier_name,c.phone AS courier_phone FROM orders o LEFT JOIN users c ON c.id=o.courier_id ORDER BY o.created_at DESC LIMIT 200"):user.role==="COURIER"?env.DB.prepare("SELECT o.*,c.name AS courier_name,c.phone AS courier_phone FROM orders o LEFT JOIN users c ON c.id=o.courier_id WHERE o.courier_id=? ORDER BY o.created_at DESC LIMIT 200").bind(user.id):env.DB.prepare("SELECT o.*,c.name AS courier_name,c.phone AS courier_phone FROM orders o LEFT JOIN users c ON c.id=o.courier_id WHERE o.customer_id=? ORDER BY o.created_at DESC LIMIT 100").bind(user.id);const d=await q.all();return json({orders:d.results})}
if(p==="/api/orders"&&r.method==="POST"){
 if(user.role!=="CUSTOMER"&&user.role!=="ADMIN")return json({error:"Hanya customer yang dapat membuat order"},403);
 const b=await body(r),coords=[b?.pickup_lat,b?.pickup_lng,b?.destination_lat,b?.destination_lng];
 if(!b||!["RIDE","SEND"].includes(b.type)||!coords.every(v=>typeof v==="number"&&Number.isFinite(v))||Math.abs(b.pickup_lat)>90||Math.abs(b.destination_lat)>90||Math.abs(b.pickup_lng)>180||Math.abs(b.destination_lng)>180||typeof b.pickup_label!=="string"||typeof b.destination_label!=="string"||!b.pickup_label.trim()||!b.destination_label.trim()||b.pickup_label.length>500||b.destination_label.length>500)return json({error:"Data order dan lokasi belum lengkap atau tidak valid"},400);
 const distance=Number(b.distance_km);
 if(!Number.isFinite(distance)||distance<=0||distance>1000)return json({error:"Hitung jarak rute terlebih dahulu sebelum membuat order."},400);
 if(b.type==="SEND"&&(!String(b.item_type||"").trim()||!String(b.recipient_name||"").trim()||!String(b.recipient_phone||"").trim()))return json({error:"Jenis barang, nama penerima, dan nomor telepon penerima wajib diisi untuk HG Send."},400);
 if(b.type==="RIDE"&&(!Number.isInteger(Number(b.passenger_count))||Number(b.passenger_count)<1||Number(b.passenger_count)>4))return json({error:"Jumlah penumpang tidak valid."},400);
 if(typeof b.pickup_datetime!=="string"||!b.pickup_datetime.trim())return json({error:"Tanggal dan jam penjemputan wajib diisi."},400);
 const name=typeof b.customer_name==="string"&&b.customer_name.trim()?b.customer_name.trim():user.name;
 const phone=typeof b.customer_phone==="string"?b.customer_phone.trim().slice(0,30):(user.phone||"");
 const email=typeof b.customer_email==="string"?b.customer_email.trim().slice(0,254):user.email;
 if(name.length>100||phone.length>30||email.length>254)return json({error:"Data pemesan terlalu panjang."},400);
 const vehicle=b.type==="RIDE"?(["Motor","Mobil"].includes(b.vehicle)?b.vehicle:"Motor"):"Motor";
 const serviceKey=b.type==="RIDE"?(vehicle==="Mobil"?"RIDE_CAR":"RIDE_MOTOR"):"SEND";
 const pricing=await env.DB.prepare("SELECT rate_per_km,minimum_price FROM pricing_rules WHERE service_type=? AND active=1 ORDER BY effective_from DESC LIMIT 1").bind(serviceKey).first();
 const rate=Number(pricing?.rate_per_km??(serviceKey==="RIDE_CAR"?3500:serviceKey==="SEND"?2000:1500));
 const minimum=Number(pricing?.minimum_price??(b.type==="SEND"?6000:5000));
 const total=Math.max(minimum,Math.round(distance*rate));
 const company=b.type==="RIDE"?Math.round(total*2/3):Math.round(total*0.75),courier=total-company;
 const speed=b.type==="SEND"?(String(b.delivery_speed||"SAME_DAY").toUpperCase().replaceAll(" ","_")==="KILAT"?"KILAT":"SAME_DAY"):null;
 const oid=uid();
 const jakartaParts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jakarta",year:"2-digit",month:"2-digit"}).formatToParts(new Date());
 const yy=jakartaParts.find(x=>x.type==="year")?.value,mm=jakartaParts.find(x=>x.type==="month")?.value;
 const prefix=(b.type==="RIDE"?"HGR":"HGS")+yy+mm,pad=b.type==="RIDE"?5:4;
 let code=null,inserted=false;
 for(let attempt=0;attempt<5&&!inserted;attempt++){
  const next=await env.DB.prepare("SELECT COALESCE(MAX(CAST(substr(order_code,8) AS INTEGER)),0)+1 AS n FROM orders WHERE order_code LIKE ?").bind(prefix+"%").first();
  const sequence=Number(next?.n||1);
  if(sequence>=10**pad)return json({error:"Nomor order bulan ini sudah mencapai batas."},409);
  code=prefix+String(sequence).padStart(pad,"0");
  try{
   await env.DB.prepare("INSERT INTO orders(id,order_code,type,customer_id,status,pickup_label,pickup_lat,pickup_lng,destination_label,destination_lat,destination_lng,distance_km,vehicle,notes,branch,customer_name,customer_phone,customer_email,pickup_datetime,passenger_count,item_description,item_type,item_weight_kg,delivery_speed,recipient_name,recipient_phone,payment_method,company_share,courier_share,total_payment,price) VALUES(?,?,?,?,'NEW_ORDER',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(
    oid,code,b.type,user.id,b.pickup_label.trim(),b.pickup_lat,b.pickup_lng,b.destination_label.trim(),b.destination_lat,b.destination_lng,distance,vehicle,typeof b.notes==="string"?b.notes.slice(0,1000):null,
    "Healthy Go",name,phone,email,typeof b.pickup_datetime==="string"?b.pickup_datetime.slice(0,40):null,
    b.type==="RIDE"?Math.max(1,Math.min(4,Number(b.passenger_count)||1)):null,
    b.type==="SEND"&&typeof b.item_type==="string"?b.item_type.trim().slice(0,120):null,
    b.type==="SEND"&&typeof b.item_type==="string"?b.item_type.trim().slice(0,120):null,
    b.type==="SEND"&&Number.isFinite(Number(b.item_weight_kg))?Math.max(0,Number(b.item_weight_kg)):null,
    speed,b.type==="SEND"&&typeof b.recipient_name==="string"?b.recipient_name.trim().slice(0,100):null,
    b.type==="SEND"&&typeof b.recipient_phone==="string"?b.recipient_phone.trim().slice(0,30):null,
    typeof b.payment_method==="string"?b.payment_method.slice(0,100):"Individual",company,courier,total,total
   ).run();
   inserted=true;
  }catch(e){if(!String(e?.message||e).includes("UNIQUE constraint failed: orders.order_code")||attempt===4)throw e}
 }
 if(!inserted)return json({error:"Gagal membuat nomor order. Silakan coba kembali."},409);
 await env.DB.prepare("INSERT INTO order_events(id,order_id,actor_id,to_status,note) VALUES(?,?,?,'NEW_ORDER','Order dibuat')").bind(uid(),oid,user.id).run();
 return json({ok:true,order_code:code,total_payment:total,courier_share:courier,company_share:company,distance_km:distance},201);
}
const m=p.match(/^\/api\/orders\/([\w-]+)\/status$/);
if(m&&r.method==="PATCH"){
 const b=await body(r),adminStatuses=["VERIFIED","PROCESS","ON_TRIP","TRIP_COMPLETED","SUCCESS","RESCHEDULE","CANCEL","PENDING_PAYMENT"],courierStatuses=["ON_TRIP","TRIP_COMPLETED"];
 if(user.role!=="ADMIN"&&user.role!=="COURIER")return json({error:"Tidak berhak mengubah status"},403);
 if(user.role==="ADMIN"&&!adminStatuses.includes(b?.status))return json({error:"Status tidak valid"},400);
 if(user.role==="COURIER"&&!courierStatuses.includes(b?.status))return json({error:"Kurir hanya dapat memperbarui status perjalanan"},403);
 const old=await env.DB.prepare("SELECT status,courier_id FROM orders WHERE id=?").bind(m[1]).first();
 if(!old)return json({error:"Order tidak ditemukan"},404);
 if(user.role==="COURIER"&&old.courier_id!==user.id)return json({error:"Order ini bukan tugas Anda"},403);
 if(user.role==="COURIER"&&old.status!=="PROCESS"&&!(old.status==="ON_TRIP"&&b.status==="TRIP_COMPLETED"))return json({error:"Status order belum memungkinkan diperbarui oleh kurir"},409);
 const transitions={NEW_ORDER:["VERIFIED","CANCEL"],VERIFIED:["PROCESS","PENDING_PAYMENT","CANCEL","RESCHEDULE"],PENDING_PAYMENT:["VERIFIED","CANCEL"],PROCESS:["ON_TRIP","CANCEL","RESCHEDULE"],ON_TRIP:["TRIP_COMPLETED","CANCEL"],TRIP_COMPLETED:["SUCCESS"],RESCHEDULE:["VERIFIED","PROCESS","CANCEL"],SUCCESS:[],CANCEL:[]};
 if(user.role==="ADMIN"&&!(transitions[old.status]||[]).includes(b.status))return json({error:"Perubahan status tidak sesuai alur order saat ini"},409);
 const completed=["TRIP_COMPLETED","SUCCESS"].includes(b.status)?"CURRENT_TIMESTAMP":"NULL";
 const cancelled=b.status==="CANCEL"?"CURRENT_TIMESTAMP":"NULL";
 await env.DB.batch([
  env.DB.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP,completed_at="+completed+",cancelled_at="+cancelled+" WHERE id=?").bind(b.status,m[1]),
  env.DB.prepare("INSERT INTO order_events(id,order_id,actor_id,from_status,to_status,note) VALUES(?,?,?,?,?,?)").bind(uid(),m[1],user.id,old.status,b.status,typeof b.note==="string"?b.note.slice(0,500):null),
  env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?)").bind(uid(),user.id,"ORDER_STATUS_CHANGED","ORDER",m[1],old.status+" -> "+b.status)
 ]);
 return json({ok:true});
}
return json({error:"Endpoint tidak ditemukan"},404)}
export default{async fetch(r,env){const u=new URL(r.url);if(u.pathname.startsWith("/api/")){try{return await api(r,env)}catch(e){return json({error:"Kesalahan server",detail:env.ENVIRONMENT==="development"?String(e):undefined},500)}}return env.ASSETS.fetch(r)}};