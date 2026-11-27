(function () {
  const CFG = window.HG_CONFIG;
  const STORAGE_KEYS = {
    ACCOUNTS: "hg_prod_accounts_v1",
    ORDERS: "hg_prod_orders_v1",
    SESSION: "hg_prod_session_v1"
  };

  let state = {
    accounts: [],
    orders: [],
    currentUser: null,
    selectedService: "RIDE",
    pinMode: "PICKUP",
    pickup: { address: "", lat: null, lng: null },
    dropoff: { address: "", lat: null, lng: null },
    distanceKm: 0,
    fare: { companyShare: 0, courierShare: 0, totalPayment: 0 },
    proofBase64: ""
  };

  let map = null;
  let pickupMarker = null;
  let dropoffMarker = null;
  let routeLine = null;

  function getScriptUrl() {
    return (CFG.APPS_SCRIPT_URL || "").trim();
  }

  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  function formatRupiah(num) {
    return "Rp " + Math.round(Number(num) || 0).toLocaleString("id-ID");
  }

  function formatDateTime(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }

  function loadLocalData() {
    let accounts = [];
    let orders = [];
    try {
      accounts = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACCOUNTS) || "[]");
      orders = JSON.parse(localStorage.getItem(STORAGE_KEYS.ORDERS) || "[]");
    } catch (_) {}

    if (!accounts.some(a => a.email === CFG.DEFAULT_ADMIN.email)) {
      accounts.unshift({ ...CFG.DEFAULT_ADMIN, createdAt: new Date().toISOString() });
    }
    state.accounts = accounts;
    state.orders = orders;
    saveLocalData();
  }

  function saveLocalData() {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(state.accounts));
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(state.orders));
  }

  async function apiCall(payload) {
    const url = getScriptUrl();
    if (!url) return null;
    try {
      const res = await fetch(url, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      const text = await res.text();
      return JSON.parse(text);
    } catch (err) {
      console.warn("Cloud sync error:", err);
      return null;
    }
  }

  async function syncFromCloud() {
    const url = getScriptUrl();
    if (!url) return;
    const data = await apiCall({ action: "getAll" });
    if (data && data.ok) {
      if (Array.isArray(data.accounts) && data.accounts.length > 0) {
        state.accounts = data.accounts;
        if (!state.accounts.some(a => a.email === CFG.DEFAULT_ADMIN.email)) {
          state.accounts.unshift({ ...CFG.DEFAULT_ADMIN });
        }
      }
      if (Array.isArray(data.orders)) {
        state.orders = data.orders;
      }
      saveLocalData();
      renderAll();
    }
  }

  async function persistAccount(acc) {
    const idx = state.accounts.findIndex(a => a.id === acc.id);
    if (idx >= 0) state.accounts[idx] = acc;
    else state.accounts.push(acc);
    saveLocalData();
    const res = await apiCall({ action: "upsertAccount", account: acc });
    if (getScriptUrl() && (!res || !res.ok)) {
      showToast("Tersimpan lokal. Periksa deployment Apps Script jika belum masuk ke Sheet.");
    }
  }

  async function persistOrder(order) {
    const idx = state.orders.findIndex(o => o.orderNumber === order.orderNumber);
    if (idx >= 0) state.orders[idx] = order;
    else state.orders.unshift(order);
    saveLocalData();
    const res = await apiCall({ action: "upsertOrder", order });
    if (getScriptUrl() && (!res || !res.ok)) {
      showToast("Order tersimpan lokal. Periksa deployment Apps Script jika belum masuk ke Sheet.");
    }
  }

  function generateOrderNumber(serviceType) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = (serviceType === "RIDE" ? "HGR" : "HGS") + yy + mm;

    let maxSeq = 0;
    state.orders.forEach(o => {
      if (typeof o.orderNumber === "string" && o.orderNumber.startsWith(prefix)) {
        const seqPart = parseInt(o.orderNumber.slice(prefix.length), 10);
        if (!isNaN(seqPart) && seqPart > maxSeq) maxSeq = seqPart;
      }
    });
    return prefix + String(maxSeq + 1).padStart(4, "0");
  }

  function initAuth() {
    document.querySelectorAll(".auth-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const isLogin = btn.dataset.authTab === "login";
        document.getElementById("loginForm").classList.toggle("hidden", !isLogin);
        document.getElementById("registerForm").classList.toggle("hidden", isLogin);
      });
    });

    document.getElementById("loginForm").addEventListener("submit", e => {
      e.preventDefault();
      const idVal = document.getElementById("loginIdentifier").value.trim().toLowerCase();
      const passVal = document.getElementById("loginPassword").value;
      const user = state.accounts.find(a =>
        (String(a.email).toLowerCase() === idVal || String(a.phone).trim() === idVal) &&
        String(a.password) === passVal
      );
      if (!user) {
        showToast("Email/No. HP atau password salah.");
        return;
      }
      setCurrentUser(user);
      showToast("Berhasil masuk sebagai " + user.name);
    });

    document.getElementById("registerForm").addEventListener("submit", async e => {
      e.preventDefault();
      const name = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim().toLowerCase();
      const phone = document.getElementById("regPhone").value.trim();
      const password = document.getElementById("regPassword").value;

      if (state.accounts.some(a => a.email.toLowerCase() === email || a.phone === phone)) {
        showToast("Email atau No. HP sudah terdaftar.");
        return;
      }
      const newCustomer = {
        id: "CUST-" + Date.now(),
        name,
        email,
        phone,
        password,
        role: "CUSTOMER",
        vehicle: "",
        createdAt: new Date().toISOString()
      };
      await persistAccount(newCustomer);
      setCurrentUser(newCustomer);
      e.target.reset();
      showToast("Akun Customer berhasil dibuat.");
    });

    document.getElementById("btnLogout").addEventListener("click", () => {
      state.currentUser = null;
      localStorage.removeItem(STORAGE_KEYS.SESSION);
      renderAuthState();
      showToast("Anda telah keluar.");
    });
  }

  function setCurrentUser(user) {
    state.currentUser = user;
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
    renderAuthState();
  }

  function restoreSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION) || "null");
      if (saved && saved.id) {
        const fresh = state.accounts.find(a => a.id === saved.id) || saved;
        state.currentUser = fresh;
      }
    } catch (_) {}
  }

  function renderAuthState() {
    const authSec = document.getElementById("authSection");
    const appSec = document.getElementById("appSection");
    const userBox = document.getElementById("userHeaderBox");

    if (!state.currentUser) {
      authSec.classList.remove("hidden");
      appSec.classList.add("hidden");
      userBox.classList.add("hidden");
      return;
    }

    authSec.classList.add("hidden");
    appSec.classList.remove("hidden");
    userBox.classList.remove("hidden");

    const u = state.currentUser;
    document.getElementById("headerUserName").textContent = u.name;
    document.getElementById("headerUserRole").textContent = u.role;

    const isAdmin = u.role === "ADMIN";
    const isCourier = u.role === "KURIR";

    document.getElementById("tabCreateOrder").classList.toggle("hidden", isCourier);
    document.getElementById("tabManageCourier").classList.toggle("hidden", !isAdmin);
    document.getElementById("tabRekap").classList.toggle("hidden", !isAdmin);
    document.getElementById("adminDistanceOverrideBox").classList.toggle("hidden", !isAdmin);

    document.getElementById("custNameInput").value = u.name || "";
    document.getElementById("custPhoneInput").value = u.phone || "";
    document.getElementById("custEmailInput").value = u.email || "";

    if (isCourier) {
      switchView("listView");
    } else {
      switchView("orderView");
      setTimeout(() => { if (map) map.invalidateSize(); }, 150);
    }

    renderAll();
  }

  function switchView(viewId) {
    document.querySelectorAll(".nav-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.view === viewId);
    });
    document.querySelectorAll(".view-panel").forEach(p => {
      p.classList.toggle("hidden", p.id !== viewId);
    });
    if (viewId === "orderView" && map) {
      setTimeout(() => map.invalidateSize(), 150);
    }
  }

  function initNavigation() {
    document.querySelectorAll(".nav-tab").forEach(btn => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
  }

  function initMap() {
    map = L.map("map").setView([-6.2615, 106.7810], 11);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19
    }).addTo(map);

    map.on("click", async e => {
      const { lat, lng } = e.latlng;
      const addr = await reverseGeocode(lat, lng);
      if (state.pinMode === "PICKUP") {
        setLocation("PICKUP", addr, lat, lng);
      } else {
        setLocation("DROPOFF", addr, lat, lng);
      }
    });

    const presetContainer = document.getElementById("presetList");
    CFG.PRESET_LOCATIONS.forEach(loc => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-chip";
      chip.textContent = loc.name;
      chip.addEventListener("click", () => {
        setLocation(state.pinMode, loc.name, loc.lat, loc.lng);
      });
      presetContainer.appendChild(chip);
    });

    document.getElementById("btnModePickup").addEventListener("click", () => setPinMode("PICKUP"));
    document.getElementById("btnModeDropoff").addEventListener("click", () => setPinMode("DROPOFF"));

    document.getElementById("btnSearchPickup").addEventListener("click", () => searchAddress("PICKUP"));
    document.getElementById("btnSearchDropoff").addEventListener("click", () => searchAddress("DROPOFF"));

    document.getElementById("btnSwapLocations").addEventListener("click", () => {
      const temp = { ...state.pickup };
      state.pickup = { ...state.dropoff };
      state.dropoff = temp;
      document.getElementById("pickupInput").value = state.pickup.address;
      document.getElementById("dropoffInput").value = state.dropoff.address;
      updateMarkersAndRoute();
    });
  }

  function setPinMode(mode) {
    state.pinMode = mode;
    document.getElementById("btnModePickup").className = mode === "PICKUP" ? "btn btn-sm btn-primary" : "btn btn-sm btn-outline";
    document.getElementById("btnModeDropoff").className = mode === "DROPOFF" ? "btn btn-sm btn-primary" : "btn btn-sm btn-outline";
  }

  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
      const data = await res.json();
      return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch (_) {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  async function searchAddress(target) {
    const inputEl = document.getElementById(target === "PICKUP" ? "pickupInput" : "dropoffInput");
    const q = inputEl.value.trim();
    if (!q) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=id&q=${encodeURIComponent(q)}`);
      const list = await res.json();
      if (!list || list.length === 0) {
        showToast("Alamat tidak ditemukan, coba kata kunci lain atau klik di peta.");
        return;
      }
      const item = list[0];
      setLocation(target, item.display_name, parseFloat(item.lat), parseFloat(item.lon));
    } catch (_) {
      showToast("Gagal mencari alamat.");
    }
  }

  function setLocation(target, address, lat, lng) {
    if (target === "PICKUP") {
      state.pickup = { address, lat, lng };
      document.getElementById("pickupInput").value = address;
      setPinMode("DROPOFF");
    } else {
      state.dropoff = { address, lat, lng };
      document.getElementById("dropoffInput").value = address;
    }
    updateMarkersAndRoute();
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function updateMarkersAndRoute() {
    if (pickupMarker) map.removeLayer(pickupMarker);
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    if (routeLine) map.removeLayer(routeLine);

    if (state.pickup.lat !== null) {
      pickupMarker = L.marker([state.pickup.lat, state.pickup.lng]).addTo(map).bindPopup("Jemput: " + state.pickup.address);
    }
    if (state.dropoff.lat !== null) {
      dropoffMarker = L.marker([state.dropoff.lat, state.dropoff.lng]).addTo(map).bindPopup("Tujuan: " + state.dropoff.address);
    }

    if (state.pickup.lat !== null && state.dropoff.lat !== null) {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${state.pickup.lng},${state.pickup.lat};${state.dropoff.lng},${state.dropoff.lat}?overview=full&geometries=geojson`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          state.distanceKm = Math.round((route.distance / 1000) * 10) / 10;
          const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
          routeLine = L.polyline(coords, { color: "#16a34a", weight: 5 }).addTo(map);
          map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
        } else {
          throw new Error("No route");
        }
      } catch (_) {
        const raw = haversineKm(state.pickup.lat, state.pickup.lng, state.dropoff.lat, state.dropoff.lng);
        state.distanceKm = Math.round(raw * 1.3 * 10) / 10;
        routeLine = L.polyline([
          [state.pickup.lat, state.pickup.lng],
          [state.dropoff.lat, state.dropoff.lng]
        ], { color: "#16a34a", weight: 4, dashArray: "6,6" }).addTo(map);
        map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
      }
      document.getElementById("adminDistanceInput").value = state.distanceKm;
      recalculateFare();
    } else if (state.pickup.lat !== null) {
      map.setView([state.pickup.lat, state.pickup.lng], 14);
    } else if (state.dropoff.lat !== null) {
      map.setView([state.dropoff.lat, state.dropoff.lng], 14);
    }
  }

  function recalculateFare() {
    const km = Math.max(0, Number(state.distanceKm) || 0);
    let total = 0;
    let company = 0;
    let courier = 0;
    let rateText = "";

    if (state.selectedService === "RIDE") {
      const vehicle = document.getElementById("vehicleTypeInput").value;
      const perKm = vehicle === "Mobil" ? CFG.TARIFF.RIDE_CAR_PER_KM : CFG.TARIFF.RIDE_MOTOR_PER_KM;
      rateText = formatRupiah(perKm) + " / km";
      total = km > 0 ? Math.max(CFG.TARIFF.RIDE_MIN, Math.round(km * perKm)) : 0;
      company = Math.round(total * (2 / 3));
      courier = total - company;
    } else {
      const perKm = CFG.TARIFF.SEND_PER_KM;
      rateText = formatRupiah(perKm) + " / km";
      total = km > 0 ? Math.max(CFG.TARIFF.SEND_MIN, Math.round(km * perKm)) : 0;
      company = Math.round(total * 0.75);
      courier = total - company;
    }

    state.fare = { companyShare: company, courierShare: courier, totalPayment: total };

    const banner = document.getElementById("fareBanner");
    banner.className = "fare-banner " + (state.selectedService === "RIDE" ? "fare-ride" : "fare-send");
    document.getElementById("fareServiceLabel").textContent = state.selectedService === "RIDE" ? "TARIF HG RIDE" : "TARIF HG SEND";
    document.getElementById("fareRateLabel").textContent = rateText;
    document.getElementById("fareTotalDisplay").textContent = formatRupiah(total);
    document.getElementById("fareDistanceDisplay").textContent = km.toFixed(1) + " km";

    const isAdmin = state.currentUser && state.currentUser.role === "ADMIN";
    document.getElementById("fareSplitRow").classList.toggle("hidden", !isAdmin);
    document.getElementById("fareCourierSplit").textContent = formatRupiah(courier);
    document.getElementById("fareCompanySplit").textContent = formatRupiah(company);
  }

  function initOrderForm() {
    const dt = new Date(Date.now() + 15 * 60000);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    document.getElementById("pickupDateTimeInput").value = dt.toISOString().slice(0, 16);

    document.querySelectorAll(".service-card").forEach(card => {
      card.addEventListener("click", () => {
        document.querySelectorAll(".service-card").forEach(c => c.classList.remove("active"));
        card.classList.add("active");
        state.selectedService = card.dataset.service;
        const isRide = state.selectedService === "RIDE";
        document.getElementById("rideFields").classList.toggle("hidden", !isRide);
        document.getElementById("sendFields").classList.toggle("hidden", isRide);
        document.getElementById("orderFormTitle").textContent = isRide ? "Form Pemesanan HG Ride" : "Form Pemesanan HG Send";
        document.getElementById("lblCustName").textContent = isRide ? "Nama Pemesan / Penumpang *" : "Nama Pengirim *";
        recalculateFare();
      });
    });

    document.getElementById("vehicleTypeInput").addEventListener("change", recalculateFare);

    document.getElementById("adminDistanceInput").addEventListener("input", e => {
      if (state.currentUser && state.currentUser.role === "ADMIN") {
        state.distanceKm = Math.max(0, parseFloat(e.target.value) || 0);
        recalculateFare();
      }
    });

    document.getElementById("orderForm").addEventListener("submit", async e => {
      e.preventDefault();
      if (!state.currentUser) return;

      const pickupAddress = document.getElementById("pickupInput").value.trim();
      const dropoffAddress = document.getElementById("dropoffInput").value.trim();
      if (!pickupAddress || !dropoffAddress || state.distanceKm <= 0) {
        showToast("Pilih titik penjemputan dan tujuan pada peta terlebih dahulu agar jarak terhitung otomatis.");
        return;
      }

      const isRide = state.selectedService === "RIDE";
      const orderNumber = generateOrderNumber(state.selectedService);
      const nowIso = new Date().toISOString();

      const orderObj = {
        orderNumber,
        serviceType: state.selectedService,
        createdAt: nowIso,
        createdById: state.currentUser.id,
        customerName: document.getElementById("custNameInput").value.trim(),
        customerPhone: document.getElementById("custPhoneInput").value.trim(),
        customerEmail: document.getElementById("custEmailInput").value.trim(),
        pickupDateTime: document.getElementById("pickupDateTimeInput").value,
        pickupAddress,
        pickupLat: state.pickup.lat || "",
        pickupLng: state.pickup.lng || "",
        dropoffAddress,
        dropoffLat: state.dropoff.lat || "",
        dropoffLng: state.dropoff.lng || "",
        distanceKm: state.distanceKm,
        vehicleType: isRide ? document.getElementById("vehicleTypeInput").value : "Motor",
        passengerCount: isRide ? document.getElementById("passengerCountInput").value : "",
        itemType: !isRide ? document.getElementById("itemTypeInput").value.trim() : "",
        itemWeight: !isRide ? document.getElementById("itemWeightInput").value : "",
        recipientName: !isRide ? document.getElementById("recipientNameInput").value.trim() : "",
        recipientPhone: !isRide ? document.getElementById("recipientPhoneInput").value.trim() : "",
        serviceSpeed: !isRide ? document.getElementById("sendServiceSpeedInput").value : "",
        paymentMethod: document.getElementById("paymentMethodInput").value,
        notes: document.getElementById("notesInput").value.trim(),
        companyShare: state.fare.companyShare,
        courierShare: state.fare.courierShare,
        totalPayment: state.fare.totalPayment,
        status: "New Order",
        courierId: "",
        courierName: "",
        courierPhone: "",
        proofUrl: "",
        paymentApproval: "",
        updatedAt: nowIso
      };

      await persistOrder(orderObj);
      showToast("Order " + orderNumber + " berhasil dibuat (Status: New Order).");
      renderAll();
      switchView("listView");
    });
  }

  function buildWhatsAppText(o) {
    if (o.serviceType === "RIDE") {
      return [
        `*HGRIDE — DETAIL ORDER*`,
        `Order No: *${o.orderNumber}*`,
        `Customer: ${o.customerName} (${o.customerPhone})`,
        `Jadwal: ${formatDateTime(o.pickupDateTime)}`,
        `Kendaraan: ${o.vehicleType} (${o.passengerCount || 1} org)`,
        `Jemput: ${o.pickupAddress}`,
        `Tujuan: ${o.dropoffAddress}`,
        `Jarak: ${o.distanceKm} km`,
        `Total Argo: *${formatRupiah(o.totalPayment)}* (${o.paymentMethod})`,
        o.notes ? `Catatan: ${o.notes}` : ""
      ].filter(Boolean).join("\n");
    }
    return [
      `*HGSEND — DETAIL ORDER*`,
      `Order No: *${o.orderNumber}*`,
      `Pengirim: ${o.customerName} (${o.customerPhone})`,
      `Penerima: ${o.recipientName || "-"} (${o.recipientPhone || "-"})`,
      `Barang: ${o.itemType || "-"} (${o.itemWeight || "-"} kg) • ${o.serviceSpeed || "Same day"}`,
      `Jadwal: ${formatDateTime(o.pickupDateTime)}`,
      `Jemput: ${o.pickupAddress}`,
      `Tujuan: ${o.dropoffAddress}`,
      `Jarak: ${o.distanceKm} km`,
      `Total Argo: *${formatRupiah(o.totalPayment)}* (${o.paymentMethod})`,
      o.notes ? `Catatan: ${o.notes}` : ""
    ].filter(Boolean).join("\n");
  }

  function normalizePhoneWa(phone) {
    let p = String(phone || "").replace(/[^0-9]/g, "");
    if (p.startsWith("0")) p = "62" + p.slice(1);
    return p;
  }

  function getVisibleOrders() {
    const u = state.currentUser;
    if (!u) return [];
    let list = [...state.orders];
    if (u.role === "CUSTOMER") {
      list = list.filter(o => o.createdById === u.id || o.customerPhone === u.phone);
    } else if (u.role === "KURIR") {
      list = list.filter(o => o.courierId === u.id);
    }

    const svcFilter = document.getElementById("filterService").value;
    const stFilter = document.getElementById("filterStatus").value;
    if (svcFilter !== "ALL") list = list.filter(o => o.serviceType === svcFilter);
    if (stFilter !== "ALL") list = list.filter(o => o.status === stFilter);
    return list;
  }

  function statusClass(st) {
    const mapSt = {
      "New Order": "st-new",
      "Process": "st-process",
      "Reschedule": "st-reschedule",
      "On Trip": "st-ontrip",
      "Trip Completed": "st-completed",
      "Pending Payment": "st-pending",
      "Success": "st-success",
      "Cancel": "st-cancel"
    };
    return mapSt[st] || "st-new";
  }

  function renderOrders() {
    const u = state.currentUser;
    if (!u) return;

    const visible = getVisibleOrders();
    document.getElementById("orderCountBadge").textContent = visible.length;

    const container = document.getElementById("ordersContainer");
    if (visible.length === 0) {
      container.innerHTML = `<p class="muted">Belum ada pesanan yang sesuai filter.</p>`;
      return;
    }

    const couriers = state.accounts.filter(a => a.role === "KURIR");
    container.innerHTML = "";

    visible.forEach(o => {
      const card = document.createElement("div");
      card.className = "order-item";

      const isAdmin = u.role === "ADMIN";
      const isCourier = u.role === "KURIR";

      let adminControlsHtml = "";
      if (isAdmin) {
        const courierOptions = couriers.map(c =>
          `<option value="${c.id}" ${o.courierId === c.id ? "selected" : ""}>${c.name} (${c.vehicle || "Motor"})</option>`
        ).join("");

        adminControlsHtml = `
          <select class="input-sm js-admin-status" data-order="${o.orderNumber}">
            <option value="New Order" ${o.status === "New Order" ? "selected" : ""}>New Order</option>
            <option value="Process" ${o.status === "Process" ? "selected" : ""}>Process</option>
            <option value="Reschedule" ${o.status === "Reschedule" ? "selected" : ""}>Reschedule</option>
            <option value="Cancel" ${o.status === "Cancel" ? "selected" : ""}>Cancel</option>
          </select>
          ${(o.status === "Process" || o.status === "On Trip") ? `
            <select class="input-sm js-assign-courier-select" data-order="${o.orderNumber}">
              <option value="">-- Pilih Kurir --</option>
              ${courierOptions}
            </select>
            <button type="button" class="btn btn-primary btn-sm js-btn-assign" data-order="${o.orderNumber}">
              Tugaskan Kurir (On Trip)
            </button>
          ` : ""}
          ${(o.status === "Trip Completed" || o.status === "Pending Payment" || o.proofUrl) ? `
            <button type="button" class="btn btn-primary btn-sm js-btn-approve" data-order="${o.orderNumber}">
              Approved (Success)
            </button>
            <button type="button" class="btn btn-danger-outline btn-sm js-btn-reject" data-order="${o.orderNumber}">
              Reject (Pending Payment)
            </button>
          ` : ""}
        `;
      }

      let courierControlsHtml = "";
      if (isCourier && (o.status === "On Trip" || o.status === "Pending Payment")) {
        courierControlsHtml = `
          <button type="button" class="btn btn-primary btn-sm js-btn-complete-trip" data-order="${o.orderNumber}">
            Proses Selesai & Upload Bukti Bayar
          </button>
        `;
      }

      const proofHtml = o.proofUrl
        ? `<a href="${o.proofUrl}" target="_blank" rel="noopener" class="btn-link">Lihat Bukti Bayar</a>`
        : `<span class="muted">Belum diunggah</span>`;

      card.innerHTML = `
        <div class="order-top">
          <div>
            <span class="order-code">${o.orderNumber}</span>
            <span class="svc-pill ${o.serviceType === "RIDE" ? "svc-ride" : "svc-send"}">
              ${o.serviceType === "RIDE" ? "HG RIDE" : "HG SEND"}
            </span>
          </div>
          <span class="status-badge ${statusClass(o.status)}">${o.status}</span>
        </div>

        <div class="order-grid">
          <div>
            <div class="order-field-label">${o.serviceType === "RIDE" ? "Penumpang / Pemesan" : "Pengirim & Penerima"}</div>
            <div><strong>${o.customerName}</strong> (${o.customerPhone})</div>
            ${o.serviceType === "SEND" ? `<div class="small muted">Penerima: ${o.recipientName || "-"} (${o.recipientPhone || "-"})</div>` : ""}
          </div>
          <div>
            <div class="order-field-label">Rute & Jadwal</div>
            <div><strong>Dari:</strong> ${o.pickupAddress}</div>
            <div><strong>Ke:</strong> ${o.dropoffAddress}</div>
            <div class="small muted">Jadwal: ${formatDateTime(o.pickupDateTime)}</div>
          </div>
          <div>
            <div class="order-field-label">Jarak & Tarif</div>
            <div>Jarak: <strong>${o.distanceKm} km</strong></div>
            <div>Total Bayar: <strong>${formatRupiah(o.totalPayment)}</strong> (${o.paymentMethod})</div>
            ${(isAdmin || isCourier) ? `<div class="small muted">Argo Kurir: ${formatRupiah(o.courierShare)}</div>` : ""}
          </div>
          <div>
            <div class="order-field-label">Kurir & Bukti Bayar</div>
            <div>Kurir: <strong>${o.courierName || "Belum ditugaskan"}</strong></div>
            <div>Bukti: ${proofHtml}</div>
          </div>
        </div>

        <div class="order-actions">
          <button type="button" class="btn btn-outline btn-sm js-btn-copy-wa" data-order="${o.orderNumber}">
            Salin Format WA
          </button>
          <button type="button" class="btn btn-wa btn-sm js-btn-send-wa" data-order="${o.orderNumber}">
            Kirim WhatsApp
          </button>
          ${adminControlsHtml}
          ${courierControlsHtml}
        </div>
      `;
      container.appendChild(card);
    });

    bindOrderActionEvents();
  }

  function bindOrderActionEvents() {
    document.querySelectorAll(".js-btn-copy-wa").forEach(btn => {
      btn.addEventListener("click", async () => {
        const o = state.orders.find(x => x.orderNumber === btn.dataset.order);
        if (!o) return;
        const text = buildWhatsAppText(o);
        await navigator.clipboard.writeText(text);
        showToast("Format WhatsApp " + o.orderNumber + " disalin.");
      });
    });

    document.querySelectorAll(".js-btn-send-wa").forEach(btn => {
      btn.addEventListener("click", () => {
        const o = state.orders.find(x => x.orderNumber === btn.dataset.order);
        if (!o) return;
        const text = encodeURIComponent(buildWhatsAppText(o));
        const targetPhone = o.courierPhone ? normalizePhoneWa(o.courierPhone) : normalizePhoneWa(o.customerPhone);
        const waUrl = targetPhone ? `https://wa.me/${targetPhone}?text=${text}` : `https://wa.me/?text=${text}`;
        window.open(waUrl, "_blank", "noopener");
      });
    });

    document.querySelectorAll(".js-admin-status").forEach(sel => {
      sel.addEventListener("change", async () => {
        const o = state.orders.find(x => x.orderNumber === sel.dataset.order);
        if (!o) return;
        o.status = sel.value;
        o.updatedAt = new Date().toISOString();
        await persistOrder(o);
        showToast(`Status ${o.orderNumber} diubah menjadi ${o.status}.`);
        renderAll();
      });
    });

    document.querySelectorAll(".js-btn-assign").forEach(btn => {
      btn.addEventListener("click", async () => {
        const orderNo = btn.dataset.order;
        const sel = document.querySelector(`.js-assign-courier-select[data-order="${orderNo}"]`);
        const courierId = sel ? sel.value : "";
        if (!courierId) {
          showToast("Pilih kurir terlebih dahulu.");
          return;
        }
        const courier = state.accounts.find(a => a.id === courierId);
        const o = state.orders.find(x => x.orderNumber === orderNo);
        if (!o || !courier) return;

        o.courierId = courier.id;
        o.courierName = courier.name;
        o.courierPhone = courier.phone;
        o.status = "On Trip";
        o.updatedAt = new Date().toISOString();
        await persistOrder(o);
        showToast(`Kurir ${courier.name} ditugaskan. Status: On Trip.`);
        renderAll();
      });
    });

    document.querySelectorAll(".js-btn-approve").forEach(btn => {
      btn.addEventListener("click", async () => {
        const o = state.orders.find(x => x.orderNumber === btn.dataset.order);
        if (!o) return;
        o.paymentApproval = "Approved";
        o.status = "Success";
        o.updatedAt = new Date().toISOString();
        await persistOrder(o);
        showToast(`Pembayaran ${o.orderNumber} Approved -> Status Success.`);
        renderAll();
      });
    });

    document.querySelectorAll(".js-btn-reject").forEach(btn => {
      btn.addEventListener("click", async () => {
        const o = state.orders.find(x => x.orderNumber === btn.dataset.order);
        if (!o) return;
        o.paymentApproval = "Rejected";
        o.status = "Pending Payment";
        o.updatedAt = new Date().toISOString();
        await persistOrder(o);
        showToast(`Pembayaran ${o.orderNumber} Ditolak -> Status Pending Payment.`);
        renderAll();
      });
    });

    document.querySelectorAll(".js-btn-complete-trip").forEach(btn => {
      btn.addEventListener("click", () => {
        const orderNo = btn.dataset.order;
        state.proofBase64 = "";
        document.getElementById("completeOrderId").value = orderNo;
        document.getElementById("completeOrderLabel").textContent = orderNo;
        document.getElementById("proofPreviewBox").classList.add("hidden");
        document.getElementById("proofFileInput").value = "";
        document.getElementById("proofCameraInput").value = "";
        document.getElementById("completeTripModal").classList.remove("hidden");
      });
    });
  }

  function initCompleteTripModal() {
    function handleImageSelect(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        state.proofBase64 = ev.target.result;
        document.getElementById("proofPreviewImg").src = state.proofBase64;
        document.getElementById("proofPreviewBox").classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    }

    document.getElementById("proofFileInput").addEventListener("change", e => handleImageSelect(e.target.files[0]));
    document.getElementById("proofCameraInput").addEventListener("change", e => handleImageSelect(e.target.files[0]));

    document.getElementById("completeTripForm").addEventListener("submit", async e => {
      e.preventDefault();
      const orderNo = document.getElementById("completeOrderId").value;
      if (!state.proofBase64) {
        showToast("Harap unggah atau ambil foto bukti pembayaran terlebih dahulu.");
        return;
      }
      const o = state.orders.find(x => x.orderNumber === orderNo);
      if (!o) return;

      let finalProofUrl = state.proofBase64;
      const cloudRes = await apiCall({
        action: "uploadProof",
        fileName: `${orderNo}_bukti_bayar_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        base64: state.proofBase64
      });
      if (cloudRes && cloudRes.ok && cloudRes.fileUrl) {
        finalProofUrl = cloudRes.fileUrl;
      }

      o.proofUrl = finalProofUrl;
      o.status = "Trip Completed";
      o.updatedAt = new Date().toISOString();
      await persistOrder(o);

      document.getElementById("completeTripModal").classList.add("hidden");
      showToast(`Order ${orderNo} selesai (Status: Trip Completed). Menunggu verifikasi Admin.`);
      renderAll();
    });

    document.querySelectorAll("[data-close-modal]").forEach(el => {
      el.addEventListener("click", () => {
        document.getElementById(el.dataset.closeModal).classList.add("hidden");
      });
    });
  }

  function initCourierManagement() {
    document.getElementById("createCourierForm").addEventListener("submit", async e => {
      e.preventDefault();
      const name = document.getElementById("courierNameInput").value.trim();
      const email = document.getElementById("courierEmailInput").value.trim().toLowerCase();
      const phone = document.getElementById("courierPhoneInput").value.trim();
      const vehicle = document.getElementById("courierVehicleInput").value;
      const password = document.getElementById("courierPassInput").value.trim();

      if (state.accounts.some(a => a.email.toLowerCase() === email || a.phone === phone)) {
        showToast("Email atau No. HP kurir sudah terdaftar.");
        return;
      }

      const courierAcc = {
        id: "KUR-" + Date.now(),
        name,
        email,
        phone,
        password,
        role: "KURIR",
        vehicle,
        createdAt: new Date().toISOString()
      };
      await persistAccount(courierAcc);
      e.target.reset();
      showToast("Akun kurir " + name + " berhasil dibuat.");
      renderCouriers();
    });
  }

  function renderCouriers() {
    const list = state.accounts.filter(a => a.role === "KURIR");
    const box = document.getElementById("courierListContainer");
    if (list.length === 0) {
      box.innerHTML = `<p class="muted small">Belum ada akun kurir terdaftar.</p>`;
      return;
    }
    box.innerHTML = list.map(c => `
      <div class="courier-item">
        <div>
          <strong>${c.name}</strong> <span class="badge-branch">${c.vehicle || "Motor"}</span>
          <div class="small muted">${c.email} • ${c.phone}</div>
        </div>
        <div class="small muted">Pass: <code>${c.password}</code></div>
      </div>
    `).join("");
  }

  function renderRekap() {
    const successOrders = state.orders.filter(o => o.status === "Success");
    const totalGross = successOrders.reduce((s, o) => s + Number(o.totalPayment || 0), 0);
    const totalCompany = successOrders.reduce((s, o) => s + Number(o.companyShare || 0), 0);
    const totalCourier = successOrders.reduce((s, o) => s + Number(o.courierShare || 0), 0);

    document.getElementById("rekapStats").innerHTML = `
      <div class="stat-card">
        <div class="muted small">Order Success</div>
        <div class="stat-value">${successOrders.length} Order</div>
      </div>
      <div class="stat-card">
        <div class="muted small">Total Customer Payment</div>
        <div class="stat-value">${formatRupiah(totalGross)}</div>
      </div>
      <div class="stat-card">
        <div class="muted small">Pendapatan Perusahaan</div>
        <div class="stat-value">${formatRupiah(totalCompany)}</div>
      </div>
      <div class="stat-card">
        <div class="muted small">Total Argo Kurir</div>
        <div class="stat-value">${formatRupiah(totalCourier)}</div>
      </div>
    `;

    const tbody = document.getElementById("rekapTableBody");
    tbody.innerHTML = successOrders.map(o => `
      <tr>
        <td><strong>${o.orderNumber}</strong></td>
        <td>${o.serviceType === "RIDE" ? "HG Ride" : "HG Send"}</td>
        <td>${o.customerName}</td>
        <td>${o.courierName || "-"}</td>
        <td>${o.distanceKm} km</td>
        <td>${formatRupiah(o.companyShare)}</td>
        <td>${formatRupiah(o.courierShare)}</td>
        <td><strong>${formatRupiah(o.totalPayment)}</strong></td>
        <td>${o.proofUrl ? `<a href="${o.proofUrl}" target="_blank" rel="noopener">Lihat</a>` : "-"}</td>
      </tr>
    `).join("");
  }

  function exportCsv() {
    const headers = [
      "Order Number", "Layanan", "Timestamp", "Customer", "No HP", "Jemput", "Tujuan",
      "Jarak (Km)", "Kurir", "Perusahaan", "Kurir Argo", "Customer Payment", "Status", "Bukti Bayar"
    ];
    const rows = state.orders.map(o => [
      o.orderNumber, o.serviceType, o.createdAt, o.customerName, o.customerPhone,
      `"${(o.pickupAddress || "").replace(/"/g, '""')}"`,
      `"${(o.dropoffAddress || "").replace(/"/g, '""')}"`,
      o.distanceKm, o.courierName, o.companyShare, o.courierShare, o.totalPayment, o.status, o.proofUrl
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HG_Ride_Send_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function renderAll() {
    recalculateFare();
    renderOrders();
    renderCouriers();
    renderRekap();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    loadLocalData();
    restoreSession();
    initAuth();
    initNavigation();
    initMap();
    initOrderForm();
    initCompleteTripModal();
    initCourierManagement();

    document.getElementById("filterService").addEventListener("change", renderOrders);
    document.getElementById("filterStatus").addEventListener("change", renderOrders);
    document.getElementById("btnRefreshOrders").addEventListener("click", syncFromCloud);
    document.getElementById("btnExportCsv").addEventListener("click", exportCsv);

    renderAuthState();
    await syncFromCloud();
  });
})();
