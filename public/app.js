const $=s=>document.querySelector(s);let me=null;const maps={};const defaults={pickup:[-6.3422,106.7383],destination:[-6.2966,106.7124]};
async function api(path,opt={}){const r=await fetch(path,{...opt,credentials:"same-origin",headers:{"content-type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Permintaan gagal");return d}
function start(user){me=user;$("#login").hidden=true;$("#app").hidden=false;$("#welcomeName").textContent=user.name;$("#userbar").textContent=user.role;document.querySelectorAll(".admin-only").forEach(x=>x.hidden=user.role!=="ADMIN");initMaps();loadOrders();if(user.role==="ADMIN")loadDashboard()}
async function loadDashboard(){const root=$("#dashboardMetrics");try{const d=await api("/api/admin/dashboard"),m=d.metrics;root.replaceChildren();const items=[["Total order",m.total_orders],["Perlu diproses",m.waiting_orders],["Dalam proses",m.active_orders],["Selesai",m.completed_orders],["Kurir aktif",m.active_couriers],["Customer aktif",m.active_customers]];items.forEach(([label,value])=>{const card=document.createElement("div");card.className="metric";const name=document.createElement("small");name.textContent=label;const number=document.createElement("strong");number.textContent=Number(value||0).toLocaleString("id-ID");card.append(name,number);root.append(card)})}catch(e){root.textContent="Ringkasan dashboard belum dapat dimuat: "+e.message}}
function initMaps(){for(const key of ["pickup","destination"]){if(maps[key]){maps[key].map.invalidateSize();continue}const map=L.map(key+"Map").setView(defaults[key],13);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);const marker=L.marker(defaults[key],{draggable:true}).addTo(map);maps[key]={map,marker};marker.on("dragend",()=>{const p=marker.getLatLng();setPoint(key,p.lat,p.lng,true)});map.on("click",e=>{marker.setLatLng(e.latlng);setPoint(key,e.latlng.lat,e.latlng.lng,true)});setPoint(key,defaults[key][0],defaults[key][1],true)}}
async function reverse(lat,lng){try{const r=await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat="+lat+"&lon="+lng);const d=await r.json();return d.display_name||lat.toFixed(6)+", "+lng.toFixed(6)}catch{return lat.toFixed(6)+", "+lng.toFixed(6)}}
async function setPoint(key,lat,lng,rev){maps[key].marker.setLatLng([lat,lng]);$("#"+key+"Lat").value=lat;$("#"+key+"Lng").value=lng;if(rev)$("#"+key+"Label").value=await reverse(lat,lng)}
async function searchPlace(key){const q=$("#"+key+"Search").value.trim(),root=$("#"+key+"Results");if(!q)return;root.textContent="Mencari alamat…";try{const r=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=id&q="+encodeURIComponent(q)),rows=await r.json();root.replaceChildren();if(!rows.length){root.textContent="Lokasi tidak ditemukan.";return}rows.forEach(item=>{const b=document.createElement("button");b.type="button";b.className="result";b.textContent=item.display_name;b.onclick=()=>{const lat=Number(item.lat),lng=Number(item.lon);maps[key].map.setView([lat,lng],17);setPoint(key,lat,lng,false);$("#"+key+"Label").value=item.display_name;root.replaceChildren()};root.append(b)})}catch{root.textContent="Pencarian gagal. Coba lagi."}}
document.querySelectorAll("[data-search]").forEach(b=>b.onclick=()=>searchPlace(b.dataset.search));
document.querySelectorAll("[data-gps]").forEach(b=>b.onclick=()=>{const k=b.dataset.gps;if(!navigator.geolocation)return alert("GPS tidak didukung");navigator.geolocation.getCurrentPosition(p=>{const a=p.coords.latitude,o=p.coords.longitude;maps[k].map.setView([a,o],17);setPoint(k,a,o,true)},()=>alert("GPS tidak dapat diakses. Periksa izin browser."),{enableHighAccuracy:true,timeout:12000})});
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#loginError").textContent="";try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});start(d.user)}catch(x){$("#loginError").textContent=x.message}};
$("#bootstrapForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));const msg=$("#bootstrapMessage");msg.textContent="";if(v.password!==v.passwordConfirm){msg.textContent="Konfirmasi password tidak sama.";return}delete v.passwordConfirm;try{const d=await api("/api/auth/bootstrap",{method:"POST",body:JSON.stringify(v)});e.target.reset();msg.textContent=d.message+" Setelah itu jalankan perintah penghapusan secret di Cloudflare."; }catch(x){msg.textContent=x.message}};
$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.reload()};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));["new","orders","users","pricing"].forEach(k=>$("#"+k).hidden=b.dataset.tab!==k);if(b.dataset.tab==="new")setTimeout(()=>Object.values(maps).forEach(x=>x.map.invalidateSize()),80);if(b.dataset.tab==="users")loadUsers();if(b.dataset.tab==="pricing")loadPricing()});
let routeLine=null;
$("#estimateRoute").onclick=async()=>{const button=$("#estimateRoute"),box=$("#routeEstimate"),v=Object.fromEntries(new FormData($("#orderForm")));["pickup_lat","pickup_lng","destination_lat","destination_lng"].forEach(k=>v[k]=Number(v[k]));if(![v.pickup_lat,v.pickup_lng,v.destination_lat,v.destination_lng].every(Number.isFinite)){box.textContent="Pilih lokasi jemput dan tujuan terlebih dahulu.";return}button.disabled=true;box.textContent="Menghitung rute…";try{const d=await api("/api/route/estimate",{method:"POST",body:JSON.stringify(v)});box.textContent="Jarak jalan ± "+d.distance_km.toLocaleString("id-ID")+" km · Waktu ± "+d.duration_minutes.toLocaleString("id-ID")+" menit. "+d.note+" "+d.attribution;if(routeLine){Object.values(maps).forEach(m=>m.map.removeLayer(routeLine))}routeLine=L.geoJSON(d.geometry,{style:{color:"#2563eb",weight:5,opacity:.8}});routeLine.addTo(maps.pickup.map);maps.pickup.map.fitBounds(routeLine.getBounds(),{padding:[24,24]})}catch(x){box.textContent=x.message}finally{button.disabled=false}};
$("#orderForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));["pickup_lat","pickup_lng","destination_lat","destination_lng"].forEach(k=>v[k]=Number(v[k]));try{const d=await api("/api/orders",{method:"POST",body:JSON.stringify(v)});$("#orderMessage").textContent="Order berhasil dibuat: "+d.order_code;loadOrders()}catch(x){$("#orderMessage").textContent=x.message}};
async function loadSummary(){
 try{
  const d=await api("/api/admin/summary"),root=$("#dashboardSummary");root.replaceChildren();
  const items=[["Pengguna aktif",d.users],["Kurir aktif",d.active_couriers],["Total order",d.orders],["Order berjalan",d.active_orders],["Selesai",d.completed],["Dibatalkan",d.cancelled]];
  items.forEach(([label,value])=>{const el=document.createElement("article");el.className="metric";const title=document.createElement("small");title.textContent=label;const number=document.createElement("strong");number.textContent=Number(value).toLocaleString("id-ID");el.append(title,number);root.append(el)});
 }catch(e){$("#dashboardSummary").textContent=e.message}
}
async function loadOrders(){
 try{
  const d=await api("/api/orders"),root=$("#orderList");root.replaceChildren();
  if(!d.orders.length){root.innerHTML='<div class="empty">Belum ada order.</div>';return}
  let couriers=[];
  if(me.role==="ADMIN"){const ud=await api("/api/admin/users");couriers=ud.users.filter(x=>x.role==="COURIER"&&x.active)}
  d.orders.forEach(o=>{
   const el=document.createElement("article");el.className="order";
   const h=document.createElement("div");h.className="orderhead";
   const b=document.createElement("b");b.textContent=o.order_code+" · "+o.type;
   const s=document.createElement("span");s.className="pill";s.textContent=o.status;h.append(b,s);
   const paymentLine=document.createElement("p");paymentLine.className="payment-status";paymentLine.textContent="Pembayaran: "+(o.payment_status||"UNPAID");el.append(paymentLine);
   if(me.role==="ADMIN"||me.role==="CUSTOMER")fetch("/api/orders/"+encodeURIComponent(o.id)+"/payments",{credentials:"same-origin"}).then(async res=>{const data=await res.json();if(!res.ok)throw Error(data.error||"Gagal memuat pembayaran");if(data.payments.length){const last=data.payments[0];const detail=document.createElement("small");detail.className="payment-detail";detail.textContent="Tercatat: Rp "+Number(last.amount).toLocaleString("id-ID")+" · "+({CASH:"Tunai",BANK_TRANSFER:"Transfer bank",QRIS:"QRIS",OTHER:"Lainnya"}[last.method]||last.method)+" · "+new Date(last.paid_at+"Z").toLocaleString("id-ID");el.append(detail)}}).catch(()=>{});
   if(me.role==="ADMIN"&&o.payment_status!=="PAID"){
    const pay=document.createElement("div");pay.className="payment-entry";
    const amount=document.createElement("input");amount.type="number";amount.min="1";amount.max="100000000";amount.step="1";amount.placeholder="Nominal diterima (Rp)";
    const method=document.createElement("select");[["CASH","Tunai"],["BANK_TRANSFER","Transfer bank"],["QRIS","QRIS"],["OTHER","Lainnya"]].forEach(([v,t])=>{const op=document.createElement("option");op.value=v;op.textContent=t;method.append(op)});
    const reference=document.createElement("input");reference.maxLength=100;reference.placeholder="Referensi transaksi (opsional)";
    const record=document.createElement("button");record.type="button";record.className="secondary";record.textContent="Catat pembayaran diterima";
    record.onclick=async()=>{const value=Number(amount.value);if(!Number.isSafeInteger(value)||value<1){alert("Isi nominal pembayaran yang valid.");return}record.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/payments",{method:"POST",body:JSON.stringify({amount:value,method:method.value,reference:reference.value})});await loadOrders()}catch(err){alert(err.message);record.disabled=false}};
    pay.append(amount,method,reference,record);el.append(pay);
   }
   const p=document.createElement("p");p.textContent=o.pickup_label+" → "+o.destination_label;
   const t=document.createElement("small");t.textContent=new Date(o.created_at+"Z").toLocaleString("id-ID");el.append(h,p,t);
   if(me.role==="ADMIN"){
    const line=document.createElement("div");line.className="assignline";
    const sel=document.createElement("select");sel.setAttribute("aria-label","Pilih kurir untuk "+o.order_code);
    const empty=document.createElement("option");empty.value="";empty.textContent="Pilih kurir aktif";sel.append(empty);
    couriers.forEach(c=>{const op=document.createElement("option");op.value=c.id;op.textContent=c.name+" · "+c.email;if(c.id===o.courier_id)op.selected=true;sel.append(op)});
    const btn=document.createElement("button");btn.type="button";btn.className="secondary";btn.textContent="Tugaskan";
    btn.onclick=async()=>{if(!sel.value){alert("Pilih kurir terlebih dahulu.");return}btn.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/assign",{method:"PATCH",body:JSON.stringify({courierId:sel.value})});btn.textContent="Tersimpan"}catch(e){alert(e.message);btn.disabled=false}};
    line.append(sel,btn);el.append(line)
   }
   const proofBox=document.createElement("div");proofBox.className="proof-box";
   const proofTitle=document.createElement("b");proofTitle.textContent="Bukti foto";proofBox.append(proofTitle);
   const proofList=document.createElement("div");proofList.className="proof-list";proofList.textContent="Memuat bukti…";proofBox.append(proofList);
   const renderProofs=proofs=>{proofList.replaceChildren();if(!proofs.length){proofList.textContent="Belum ada foto bukti.";return}proofs.forEach(pr=>{const link=document.createElement("a");link.href="/api/proofs/"+encodeURIComponent(pr.id);link.target="_blank";link.rel="noopener";link.textContent=pr.label+" · "+new Date(pr.created_at+"Z").toLocaleString("id-ID")+" · "+Math.ceil(pr.size_bytes/1024)+" KB";proofList.append(link)})};
   fetch("/api/orders/"+encodeURIComponent(o.id)+"/proofs",{credentials:"same-origin"}).then(async res=>{const data=await res.json();if(!res.ok)throw Error(data.error||"Gagal memuat bukti");renderProofs(data.proofs)}).catch(err=>{proofList.textContent=err.message});
   if(me.role==="ADMIN"||(me.role==="COURIER"&&o.courier_id===me.id)){
    const upload=document.createElement("div");upload.className="proof-upload";
    const file=document.createElement("input");file.type="file";file.accept="image/jpeg,image/png,image/webp";file.setAttribute("aria-label","Pilih foto bukti");
    const label=document.createElement("input");label.type="text";label.maxLength=80;label.placeholder="Keterangan foto (opsional)";
    const send=document.createElement("button");send.type="button";send.className="secondary";send.textContent="Unggah bukti";
    send.onclick=async()=>{if(!file.files?.[0]){alert("Pilih foto terlebih dahulu.");return}send.disabled=true;const fd=new FormData();fd.append("file",file.files[0]);fd.append("label",label.value||"Bukti");try{const res=await fetch("/api/orders/"+encodeURIComponent(o.id)+"/proofs",{method:"POST",credentials:"same-origin",body:fd});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||"Upload gagal");file.value="";label.value="";send.textContent="Terkirim";const refresh=await fetch("/api/orders/"+encodeURIComponent(o.id)+"/proofs",{credentials:"same-origin"});const list=await refresh.json();renderProofs(list.proofs)}catch(err){alert(err.message);send.disabled=false}};
    upload.append(file,label,send);proofBox.append(upload);
   }
   el.append(proofBox);
   if(me.role==="ADMIN"||me.role==="COURIER"){
    const adminTransitions={NEW_ORDER:["VERIFIED","CANCEL"],VERIFIED:["PROCESS","PENDING_PAYMENT","CANCEL","RESCHEDULE"],PENDING_PAYMENT:["VERIFIED","CANCEL"],PROCESS:["ON_TRIP","CANCEL","RESCHEDULE"],ON_TRIP:["TRIP_COMPLETED","CANCEL"],TRIP_COMPLETED:["SUCCESS"],RESCHEDULE:["VERIFIED","PROCESS","CANCEL"],SUCCESS:[],CANCEL:[]};const choices=me.role==="ADMIN"?(adminTransitions[o.status]||[]):o.status==="PROCESS"?["ON_TRIP"]:o.status==="ON_TRIP"?["TRIP_COMPLETED"]:[];
    if(choices.length){
     const statusLine=document.createElement("div");statusLine.className="assignline";
     const statusSelect=document.createElement("select");statusSelect.setAttribute("aria-label","Ubah status "+o.order_code);
     choices.forEach(v=>{const op=document.createElement("option");op.value=v;op.textContent=v.replaceAll("_"," ");statusSelect.append(op)});
     const statusButton=document.createElement("button");statusButton.type="button";statusButton.className="secondary";statusButton.textContent="Perbarui status";
     statusButton.onclick=async()=>{statusButton.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/status",{method:"PATCH",body:JSON.stringify({status:statusSelect.value})});await loadOrders()}catch(e){alert(e.message);statusButton.disabled=false}};
     statusLine.append(statusSelect,statusButton);el.append(statusLine)
    }
   }
   root.append(el)
  })
 }catch(e){$("#orderList").textContent=e.message}
}
async function loadUsers(){
 try{
  const d=await api("/api/admin/users"),root=$("#userList");root.replaceChildren();
  if(!d.users.length){root.innerHTML='<div class="empty">Belum ada pengguna.</div>';return}
  d.users.forEach(u=>{
   const el=document.createElement("article");el.className="order";
   const head=document.createElement("div");head.className="orderhead";
   const title=document.createElement("b");title.textContent=u.name+" · "+u.role;
   const status=document.createElement("span");status.className="pill";status.textContent=u.active?"Aktif":"Nonaktif";head.append(title,status);
   const info=document.createElement("p");info.textContent=u.email+(u.phone?" · "+u.phone:"");
   const btn=document.createElement("button");btn.type="button";btn.className="secondary";btn.textContent=u.active?"Nonaktifkan":"Aktifkan";btn.disabled=u.id===me.id;
   btn.onclick=async()=>{btn.disabled=true;try{await api("/api/admin/users/"+encodeURIComponent(u.id)+"/active",{method:"PATCH",body:JSON.stringify({active:!u.active})});loadUsers()}catch(e){alert(e.message);btn.disabled=false}};
   el.append(head,info,btn);root.append(el)
  })
 }catch(e){$("#userList").textContent=e.message}
}
$("#userForm").onsubmit=async e=>{e.preventDefault();const msg=$("#userMessage"),v=Object.fromEntries(new FormData(e.target));msg.textContent="";try{await api("/api/admin/users",{method:"POST",body:JSON.stringify(v)});e.target.reset();msg.textContent="Pengguna berhasil dibuat.";loadUsers()}catch(x){msg.textContent=x.message}};
$("#refreshUsers").onclick=loadUsers;
async function loadPricing(){
 try{
  const d=await api("/api/admin/pricing"),root=$("#pricingList");root.replaceChildren();
  if(!d.rules.length){root.innerHTML='<div class="empty">Belum ada tarif aktif.</div>';return}
  d.rules.forEach(r=>{const el=document.createElement("article");el.className="order";const b=document.createElement("b");b.textContent=({RIDE_MOTOR:"HG Ride Motor",RIDE_CAR:"HG Ride Mobil",SEND:"HG Send"})[r.service_type]||r.service_type;const p=document.createElement("p");p.textContent="Rp "+Number(r.rate_per_km).toLocaleString("id-ID")+" / km · Minimum Rp "+Number(r.minimum_price).toLocaleString("id-ID");el.append(b,p);root.append(el)})
 }catch(e){$("#pricingList").textContent=e.message}
}
$("#pricingForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));v.rate_per_km=Number(v.rate_per_km);v.minimum_price=Number(v.minimum_price);const msg=$("#pricingMessage");msg.textContent="";try{await api("/api/admin/pricing",{method:"POST",body:JSON.stringify(v)});msg.textContent="Tarif berhasil disimpan.";loadPricing()}catch(x){msg.textContent=x.message}};
$("#refreshPricing").onclick=loadPricing;
$("#refresh").onclick=loadOrders;(async()=>{try{const d=await api("/api/auth/me");start(d.user)}catch{}})();