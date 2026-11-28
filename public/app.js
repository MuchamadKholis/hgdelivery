const $=s=>document.querySelector(s);let me=null;let publicPricing={};const maps={};const defaults={pickup:[-6.3422,106.7383],destination:[-6.2966,106.7124]};
async function api(path,opt={}){const r=await fetch(path,{...opt,credentials:"same-origin",headers:{"content-type":"application/json",...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=Error(d.error||"Permintaan gagal");e.diagnostic=d.diagnostic;throw e}return d}
function start(user){me=user;$("#login").hidden=true;$("#app").hidden=false;$("#welcomeName").textContent=user.name;$("#userbar").textContent=user.role;document.querySelectorAll(".admin-only").forEach(x=>x.hidden=user.role!=="ADMIN");$("#customerNameInput").value=user.name||"";$("#customerPhoneInput").value=user.phone||"";$("#customerEmailInput").value=user.email||"";if(user.role==="COURIER"){document.querySelector('[data-tab="new"]').hidden=true;$("#new").hidden=true;document.querySelector('[data-tab="orders"]').classList.add("active");$("#orders").hidden=false;}const dt=new Date(Date.now()+15*60000);dt.setMinutes(dt.getMinutes()-dt.getTimezoneOffset());$("#pickupDateTimeInput").value=dt.toISOString().slice(0,16);updateFare();initMaps();loadOrders();loadPublicPricing();loadRoleDashboard();if(user.role==="ADMIN")loadDashboard()}
async function loadRoleDashboard(){
 const root=$("#roleDashboard");if(!root||me?.role==="ADMIN"){if(root)root.hidden=true;return}
 root.hidden=false;
 try{
  const d=await api("/api/orders"),orders=d.orders||[],active=orders.filter(o=>!["SUCCESS","CANCEL"].includes(o.status)).length,done=orders.filter(o=>o.status==="SUCCESS").length;
  const items=[["Total riwayat",orders.length],["Sedang diproses",active],["Selesai",done]];
  root.replaceChildren();items.forEach(([label,value])=>{const card=document.createElement("article");card.className="metric";const small=document.createElement("small");small.textContent=label;const strong=document.createElement("strong");strong.textContent=Number(value).toLocaleString("id-ID");card.append(small,strong);root.append(card)});
 }catch(e){root.textContent="Ringkasan akun belum dapat dimuat."}
}
async function exportOrders(){
 const msg=$("#exportMessage");msg.textContent="Menyiapkan file…";
 const from=$("#filterDateFrom").value,to=$("#filterDateTo").value;
 const params=new URLSearchParams();if(from)params.set("from",from);if(to)params.set("to",to);
 try{
  const res=await fetch("/api/admin/orders/export?"+params.toString(),{credentials:"same-origin"});
  if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.error||"Export gagal")}
  const blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="HGDelivery_Orders_"+(from||"semua")+"_"+(to||"semua")+".csv";document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);msg.textContent="Export berhasil dibuat.";
 }catch(e){msg.textContent=e.message}
}
async function loadDashboard(){const root=$("#dashboardMetrics");try{const d=await api("/api/admin/dashboard"),m=d.metrics;root.replaceChildren();const items=[["Total order",m.total_orders],["Perlu diproses",m.waiting_orders],["Dalam proses",m.active_orders],["Selesai",m.completed_orders],["Kurir aktif",m.active_couriers],["Customer aktif",m.active_customers]];items.forEach(([label,value])=>{const card=document.createElement("div");card.className="metric";const name=document.createElement("small");name.textContent=label;const number=document.createElement("strong");number.textContent=Number(value||0).toLocaleString("id-ID");card.append(name,number);root.append(card)})}catch(e){root.textContent="Ringkasan dashboard belum dapat dimuat: "+e.message}}
let activePin="pickup";
function initMaps(){if(maps.map){maps.map.invalidateSize();return}const map=L.map("map").setView(defaults.pickup,12);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);maps.map=map;maps.markers={};for(const key of ["pickup","destination"]){const marker=L.marker(defaults[key],{draggable:true}).addTo(map);maps.markers[key]=marker;marker.on("dragend",()=>{const p=marker.getLatLng();setPoint(key,p.lat,p.lng,true)});setPoint(key,defaults[key][0],defaults[key][1],true)}map.on("click",e=>setPoint(activePin,e.latlng.lat,e.latlng.lng,true));document.querySelectorAll("[data-pin-target]").forEach(b=>b.onclick=()=>{activePin=b.dataset.pinTarget;document.querySelectorAll("[data-pin-target]").forEach(x=>x.classList.toggle("active",x===b))})}
async function reverse(lat,lng){try{const d=await api("/api/geocode/reverse?lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lng));return d.display_name||lat.toFixed(6)+", "+lng.toFixed(6)}catch{return lat.toFixed(6)+", "+lng.toFixed(6)}}
async function setPoint(key,lat,lng,rev){routeQuoteId="";maps.markers[key].setLatLng([lat,lng]);$("#"+key+"Lat").value=lat;$("#"+key+"Lng").value=lng;if(rev)$("#"+key+"Label").value=await reverse(lat,lng)}
async function searchPlace(key){const q=$("#"+key+"Search").value.trim(),root=$("#"+key+"Results");if(q.length<3){root.textContent="Ketik minimal 3 karakter alamat atau nama tempat.";return}root.textContent="Mencari alamat…";try{const d=await api("/api/geocode/search?q="+encodeURIComponent(q)),rows=d.results||[];root.replaceChildren();if(!rows.length){root.textContent="Lokasi belum ditemukan. Coba nama jalan + kelurahan/kecamatan + kota, atau nama tempat yang lebih spesifik.";return}rows.forEach(item=>{const b=document.createElement("button");b.type="button";b.className="result";b.textContent=item.display_name;b.onclick=()=>{const lat=Number(item.lat),lng=Number(item.lon);activePin=key;maps.map.setView([lat,lng],17);setPoint(key,lat,lng,false);$("#"+key+"Label").value=item.display_name;root.replaceChildren()};root.append(b)})}catch(x){root.textContent=x.message||"Pencarian gagal. Coba lagi."}}
document.querySelectorAll("[data-search]").forEach(b=>b.onclick=()=>searchPlace(b.dataset.search));
document.querySelectorAll("[data-gps]").forEach(b=>b.onclick=()=>{const k=b.dataset.gps;if(!navigator.geolocation)return alert("GPS tidak didukung");navigator.geolocation.getCurrentPosition(p=>{const a=p.coords.latitude,o=p.coords.longitude;activePin=k;maps.map.setView([a,o],17);setPoint(k,a,o,true)},()=>alert("GPS tidak dapat diakses. Periksa izin browser."),{enableHighAccuracy:true,timeout:12000})});
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#loginError").textContent="";try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});start(d.user)}catch(x){$("#loginError").textContent=x.message}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();const msg=$("#registerMessage");msg.textContent="Membuat akun…";try{const d=await api("/api/auth/register",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.target)))});msg.textContent="Akun customer berhasil dibuat.";start(d.user)}catch(x){msg.textContent=x.message}};
$("#bootstrapForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));const msg=$("#bootstrapMessage");msg.textContent="";if(v.password!==v.passwordConfirm){msg.textContent="Konfirmasi password tidak sama.";return}delete v.passwordConfirm;try{const d=await api("/api/auth/bootstrap",{method:"POST",body:JSON.stringify(v)});e.target.reset();msg.textContent=d.message+" Setelah itu jalankan perintah penghapusan secret di Cloudflare."; }catch(x){msg.textContent=x.message+(x.diagnostic?" — Detail teknis: "+x.diagnostic:"")}};
$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.reload()};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));["new","orders","users","pricing"].forEach(k=>$("#"+k).hidden=b.dataset.tab!==k);if(b.dataset.tab==="new")setTimeout(()=>maps.map.invalidateSize(),80);if(b.dataset.tab==="users")loadUsers();if(b.dataset.tab==="pricing")loadPricing()});
let routeLine=null,routeKm=0,routeQuoteId="";
function rupiah(n){return "Rp "+Math.round(Number(n)||0).toLocaleString("id-ID")}
function updateFare(){
 const type=$("#serviceTypeInput").value,vehicle=$("#vehicleTypeInput").value,km=routeKm;
 const key=type==="SEND"?"SEND":vehicle==="Mobil"?"RIDE_CAR":"RIDE_MOTOR",rule=publicPricing[key]||{},rate=Number(rule.rate_per_km??(type==="SEND"?2000:vehicle==="Mobil"?3500:1500)),minimum=Number(rule.minimum_price??(type==="SEND"?6000:5000));
 const total=km>0?Math.max(minimum,Math.round(km*rate)):0;
 const adminRule=window.adminPricing?.[key],courierRate=Number(adminRule?.courier_rate_per_km??1000),courier=Math.min(total,Math.round(km*courierRate)),company=total-courier;
 $("#fareServiceLabel").textContent=type==="SEND"?"TARIF HG SEND":"TARIF HG RIDE";$("#customerNameLabel").textContent=type==="SEND"?"Nama Pengirim *":"Nama Pemesan / Penumpang *";
 $("#fareRateLabel").textContent=rupiah(rate)+" / km";
 $("#fareTotalDisplay").textContent=rupiah(total);
 $("#fareDistanceDisplay").textContent=km.toFixed(1)+" km";
 $("#fareCourierSplit").textContent=rupiah(courier);
 $("#fareCompanySplit").textContent=rupiah(company);
 $("#fareSplitRow").hidden=me?.role!=="ADMIN";
 $("#rideFields").hidden=type!=="RIDE";
 $("#sendFields").hidden=type!=="SEND";
 $("#vehicleGroup").hidden=type!=="RIDE";
}
$("#estimateRoute").onclick=async()=>{const button=$("#estimateRoute"),box=$("#routeEstimate"),v=Object.fromEntries(new FormData($("#orderForm")));["pickup_lat","pickup_lng","destination_lat","destination_lng"].forEach(k=>v[k]=Number(v[k]));if(![v.pickup_lat,v.pickup_lng,v.destination_lat,v.destination_lng].every(Number.isFinite)){box.textContent="Pilih lokasi jemput dan tujuan terlebih dahulu.";return}button.disabled=true;box.textContent="Menghitung rute…";try{const d=await api("/api/route/estimate",{method:"POST",body:JSON.stringify(v)});routeKm=Number(d.distance_km)||0;routeQuoteId=d.quote_id||"";box.textContent="Jarak jalan ± "+routeKm.toLocaleString("id-ID")+" km · Waktu ± "+d.duration_minutes.toLocaleString("id-ID")+" menit · "+d.provider+". "+d.note+" "+d.attribution;updateFare();if(routeLine){maps.map.removeLayer(routeLine)}routeLine=L.geoJSON(d.geometry,{style:{color:"#16a34a",weight:5,opacity:.85}});routeLine.addTo(maps.map);maps.map.fitBounds(routeLine.getBounds(),{padding:[24,24]})}catch(x){routeKm=0;routeQuoteId="";updateFare();box.textContent=x.message}finally{button.disabled=false}};
$("#serviceTypeInput").onchange=updateFare;$("#vehicleTypeInput").onchange=updateFare;

updateFare();
$("#orderForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));["pickup_lat","pickup_lng","destination_lat","destination_lng"].forEach(k=>v[k]=Number(v[k]));v.distance_km=routeKm;v.route_quote_id=routeQuoteId;try{const d=await api("/api/orders",{method:"POST",body:JSON.stringify(v)});$("#orderMessage").textContent="Order berhasil dibuat: "+d.order_code+" · Total "+rupiah(d.total_payment);loadOrders()}catch(x){$("#orderMessage").textContent=x.message}};
async function loadSummary(){
 try{
  const d=await api("/api/admin/summary"),root=$("#dashboardSummary");root.replaceChildren();
  const items=[["Pengguna aktif",d.users],["Kurir aktif",d.active_couriers],["Total order",d.orders],["Order berjalan",d.active_orders],["Selesai",d.completed],["Dibatalkan",d.cancelled]];
  items.forEach(([label,value])=>{const el=document.createElement("article");el.className="metric";const title=document.createElement("small");title.textContent=label;const number=document.createElement("strong");number.textContent=Number(value).toLocaleString("id-ID");el.append(title,number);root.append(el)});
 }catch(e){$("#dashboardSummary").textContent=e.message}
}
async function loadOrders(){
 try{
  const d=await api("/api/orders"),root=$("#orderList");root.replaceChildren();let orders=d.orders;const sf=$("#filterService")?.value||"ALL",st=$("#filterStatus")?.value||"ALL",from=$("#filterDateFrom")?.value||"",to=$("#filterDateTo")?.value||"";if(sf!=="ALL")orders=orders.filter(o=>o.type===sf);if(st!=="ALL")orders=orders.filter(o=>o.status===st);if(from)orders=orders.filter(o=>String(o.created_at||"").slice(0,10)>=from);if(to)orders=orders.filter(o=>String(o.created_at||"").slice(0,10)<=to);
  if(!orders.length){root.innerHTML='<div class="empty">Belum ada order.</div>';return}
  let couriers=[];
  if(me.role==="ADMIN"){const ud=await api("/api/admin/users");couriers=ud.users.filter(x=>x.role==="COURIER"&&x.active)}
  orders.forEach(o=>{
   const el=document.createElement("article");el.className="order";
   const h=document.createElement("div");h.className="orderhead";
   const b=document.createElement("b");b.textContent=o.order_code+" · "+o.type;
   const s=document.createElement("span");s.className="pill";s.textContent=o.status.replaceAll("_"," ");h.append(b,s);
   const paymentLine=document.createElement("p");paymentLine.className="payment-status";paymentLine.textContent="Pembayaran: "+(o.payment_status==="PAID"?"Verified":o.payment_status==="PENDING"?"Pending":"Belum diverifikasi");el.append(paymentLine);
   const people=document.createElement("p");people.textContent=(o.customer_name||"Pemesan")+" ("+(o.customer_phone||"-")+")"+(o.recipient_name?" · Penerima: "+o.recipient_name+" ("+(o.recipient_phone||"-")+")":"");const p=document.createElement("p");p.textContent="Dari: "+o.pickup_label+" → Ke: "+o.destination_label;const details=document.createElement("p");details.textContent="Jarak: "+Number(o.distance_km||0).toFixed(1)+" km · Total bayar: "+rupiah(o.total_payment||o.price||0)+" ("+(o.payment_method||"Individual")+")"+(me.role==="ADMIN"?" · Argo kurir: "+rupiah(o.courier_share||0)+" · Perusahaan: "+rupiah(o.company_share||0):"");const courier=document.createElement("p");courier.textContent="Kurir: "+(o.courier_name||"Belum ditugaskan")+" · Bukti foto tersedia di bagian bawah order";const t=document.createElement("small");t.textContent="Jadwal: "+(o.pickup_datetime||"-")+" · Dibuat: "+new Date(o.created_at+"Z").toLocaleString("id-ID");el.append(h,people,p,details,courier,t);
   const waLines=o.type==="RIDE"?["*HGRIDE — DETAIL ORDER*","Order No: *"+o.order_code+"*","Customer: "+(o.customer_name||"")+" ("+(o.customer_phone||"-")+")","Jadwal: "+(o.pickup_datetime||"-"),"Kendaraan: "+(o.vehicle||"Motor")+" ("+(o.passenger_count||1)+" org)","Jemput: "+o.pickup_label,"Tujuan: "+o.destination_label,"Jarak: "+o.distance_km+" km","Total Argo: *"+rupiah(o.total_payment||o.price)+"* ("+(o.payment_method||"Individual")+")",o.notes?"Catatan: "+o.notes:""]:["*HGSEND — DETAIL ORDER*","Order No: *"+o.order_code+"*","Pengirim: "+(o.customer_name||"")+" ("+(o.customer_phone||"-")+")","Penerima: "+(o.recipient_name||"-")+" ("+(o.recipient_phone||"-")+")","Barang: "+(o.item_type||o.item_description||"-")+" ("+(o.item_weight_kg||"-")+" kg) · "+(o.delivery_speed||"SAME_DAY"),"Jadwal: "+(o.pickup_datetime||"-"),"Jemput: "+o.pickup_label,"Tujuan: "+o.destination_label,"Jarak: "+o.distance_km+" km","Total Argo: *"+rupiah(o.total_payment||o.price)+"* ("+(o.payment_method||"Individual")+")",o.notes?"Catatan: "+o.notes:""];
   const waText=waLines.filter(Boolean).join("\n"),waActions=document.createElement("div");waActions.className="assignline";
   const copyWa=document.createElement("button");copyWa.type="button";copyWa.className="secondary";copyWa.textContent="Salin Format WA";copyWa.onclick=async()=>{try{await navigator.clipboard.writeText(waText);copyWa.textContent="Tersalin"}catch{alert("Browser tidak mengizinkan salin otomatis.")}};
   const sendWa=document.createElement("a");sendWa.className="secondary";sendWa.textContent="Kirim WhatsApp";sendWa.href="https://wa.me/?text="+encodeURIComponent(waText);sendWa.target="_blank";sendWa.rel="noopener";
   waActions.append(copyWa,sendWa);el.append(waActions);
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
   if(me.role==="COURIER"&&o.courier_id===me.id&&o.status==="ON_TRIP"){
    const upload=document.createElement("div");upload.className="proof-upload";
    const file=document.createElement("input");file.type="file";file.accept="image/jpeg,image/png,image/webp";file.setAttribute("aria-label","Pilih foto bukti");
    const label=document.createElement("input");label.type="text";label.maxLength=80;label.placeholder="Keterangan foto (opsional)";
    const send=document.createElement("button");send.type="button";send.className="secondary";send.textContent="Unggah bukti";
    send.onclick=async()=>{if(!file.files?.[0]){alert("Pilih foto terlebih dahulu.");return}send.disabled=true;const fd=new FormData();fd.append("file",file.files[0]);fd.append("label",label.value||"Bukti");try{const res=await fetch("/api/orders/"+encodeURIComponent(o.id)+"/proofs",{method:"POST",credentials:"same-origin",body:fd});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||"Upload gagal");file.value="";label.value="";send.textContent="Terkirim";const refresh=await fetch("/api/orders/"+encodeURIComponent(o.id)+"/proofs",{credentials:"same-origin"});const list=await refresh.json();renderProofs(list.proofs);await loadOrders()}catch(err){alert(err.message);send.disabled=false}};
    upload.append(file,label,send);proofBox.append(upload);
   }
   el.append(proofBox);
   if(me.role==="ADMIN"){
    if(o.status==="VERIFIED"){
     const line=document.createElement("div");line.className="assignline";
     const sel=document.createElement("select");sel.setAttribute("aria-label","Pilih kurir "+o.order_code);
     const empty=document.createElement("option");empty.value="";empty.textContent="Pilih kurir aktif";sel.append(empty);
     couriers.forEach(c=>{const op=document.createElement("option");op.value=c.id;op.textContent=c.name;if(c.id===o.courier_id)op.selected=true;sel.append(op)});
     const btn=document.createElement("button");btn.type="button";btn.className="secondary";btn.textContent="Tugaskan & mulai trip";
     btn.onclick=async()=>{if(!sel.value){alert("Pilih kurir terlebih dahulu.");return}btn.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/assign",{method:"PATCH",body:JSON.stringify({courierId:sel.value})});await loadOrders()}catch(e){alert(e.message);btn.disabled=false}};
     line.append(sel,btn);el.append(line);
    }
    if(["NEW_ORDER","VERIFIED","RESCHEDULE"].includes(o.status)){
     const line=document.createElement("div");line.className="assignline";
     const date=document.createElement("input");date.type="datetime-local";date.value=(o.pickup_datetime||"").slice(0,16);date.setAttribute("aria-label","Jadwal baru "+o.order_code);
     const res=document.createElement("button");res.type="button";res.className="secondary";res.textContent="Reschedule";
     res.onclick=async()=>{if(!date.value){alert("Pilih tanggal dan jam baru.");return}res.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/reschedule",{method:"PATCH",body:JSON.stringify({pickup_datetime:date.value})});await loadOrders()}catch(e){alert(e.message);res.disabled=false}};
     line.append(date,res);el.append(line);
    }
    if(!["SUCCESS","CANCEL"].includes(o.status)){
     const line=document.createElement("div");line.className="assignline";
     const distance=document.createElement("input");distance.type="number";distance.min="0.1";distance.step="0.1";distance.value=Number(o.distance_km||0);distance.setAttribute("aria-label","Koreksi jarak km "+o.order_code);
     const save=document.createElement("button");save.type="button";save.className="secondary";save.textContent="Simpan koreksi jarak";
     save.onclick=async()=>{save.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/distance",{method:"PATCH",body:JSON.stringify({distance_km:Number(distance.value)})});await loadOrders()}catch(e){alert(e.message);save.disabled=false}};
     line.append(distance,save);el.append(line);
    }
    if(["TRIP_COMPLETED","PENDING_PAYMENT"].includes(o.status)){
     const line=document.createElement("div");line.className="assignline";
     const sel=document.createElement("select");[["VERIFIED","Pembayaran Verified"],["PENDING","Pembayaran Pending"]].forEach(([v,t])=>{const op=document.createElement("option");op.value=v;op.textContent=t;sel.append(op)});
     const btn=document.createElement("button");btn.type="button";btn.className="secondary";btn.textContent="Simpan status pembayaran";
     btn.onclick=async()=>{btn.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/payment-status",{method:"PATCH",body:JSON.stringify({status:sel.value})});await loadOrders()}catch(e){alert(e.message);btn.disabled=false}};
     line.append(sel,btn);el.append(line);
    }
    const allowed={NEW_ORDER:["VERIFIED","CANCEL"],VERIFIED:["CANCEL"],RESCHEDULE:["VERIFIED","CANCEL"]}[o.status]||[];
    if(allowed.length){
     const line=document.createElement("div");line.className="assignline";const sel=document.createElement("select");
     allowed.forEach(v=>{const op=document.createElement("option");op.value=v;op.textContent=v==="VERIFIED"?"Verified":v==="CANCEL"?"Cancel":v;sel.append(op)});
     const btn=document.createElement("button");btn.type="button";btn.className="secondary";btn.textContent="Perbarui status";
     btn.onclick=async()=>{btn.disabled=true;try{await api("/api/orders/"+encodeURIComponent(o.id)+"/status",{method:"PATCH",body:JSON.stringify({status:sel.value})});await loadOrders()}catch(e){alert(e.message);btn.disabled=false}};
     line.append(sel,btn);el.append(line);
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
async function loadPublicPricing(){try{const d=await api("/api/pricing");publicPricing={};(d.rules||[]).forEach(r=>publicPricing[r.service_type]=r);updateFare()}catch{}}
async function loadPricing(){
 try{
  const d=await api("/api/admin/pricing"),root=$("#pricingList");window.adminPricing={};(d.rules||[]).forEach(r=>window.adminPricing[r.service_type]=r);updateFare();root.replaceChildren();
  if(!d.rules.length){root.innerHTML='<div class="empty">Belum ada tarif aktif.</div>';return}
  d.rules.forEach(r=>{const el=document.createElement("article");el.className="order";const b=document.createElement("b");b.textContent=({RIDE_MOTOR:"HG Ride Motor",RIDE_CAR:"HG Ride Mobil",SEND:"HG Send"})[r.service_type]||r.service_type;const p=document.createElement("p");p.textContent="Customer Rp "+Number(r.rate_per_km).toLocaleString("id-ID")+"/km · Kurir Rp "+Number(r.courier_rate_per_km||0).toLocaleString("id-ID")+"/km · Minimum Rp "+Number(r.minimum_price).toLocaleString("id-ID");el.append(b,p);root.append(el)})
 }catch(e){$("#pricingList").textContent=e.message}
}
$("#pricingForm").onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target));v.rate_per_km=Number(v.rate_per_km);v.courier_rate_per_km=Number(v.courier_rate_per_km);v.minimum_price=Number(v.minimum_price);const msg=$("#pricingMessage");msg.textContent="";try{await api("/api/admin/pricing",{method:"POST",body:JSON.stringify(v)});msg.textContent="Tarif berhasil disimpan.";loadPricing()}catch(x){msg.textContent=x.message}};
$("#refreshPricing").onclick=loadPricing;
$("#refresh").onclick=loadOrders;$("#filterService").onchange=loadOrders;$("#filterStatus").onchange=loadOrders;$("#filterDateFrom").onchange=loadOrders;$("#filterDateTo").onchange=loadOrders;$("#exportOrders").onclick=exportOrders;setInterval(()=>{if(me&&document.visibilityState==="visible")loadOrders()},30000);(async()=>{try{const d=await api("/api/auth/me");start(d.user)}catch{}})();