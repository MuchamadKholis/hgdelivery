// Konfigurasi Utama Aplikasi HG Ride & Send
window.HG_CONFIG = {
  SPREADSHEET_ID: "1RfPzyNFgaT755P5LFV0lwESXNCIk_u3XexX1pFNLIHA",
  DRIVE_FOLDER_ID: "101gXN2Ks7BVSs9J8diiwYHJcsAURKt05",
  // Tempelkan Web App URL hasil deploy Google Apps Script di bawah ini agar tersimpan permanen di GitHub:
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyT3xOC8_5HnejNkL8brFm41qjcSHERIda0oemVAH_i55HKVCNU6l6BxA5U4PeWR56S/exec",
  DEFAULT_ADMIN: {
    id: "ADM-001",
    name: "Admin Healthy Go",
    email: "admin@healthygo.id",
    phone: "081100000000",
    password: "admin123",
    role: "ADMIN"
  },
  TARIFF: {
    RIDE_MOTOR_PER_KM: 1500,
    RIDE_CAR_PER_KM: 3500,
    RIDE_MIN: 5000,
    SEND_PER_KM: 2000,
    SEND_MIN: 6000
  },
  PRESET_LOCATIONS: [
    { name: "Stasiun Sudimara", lat: -6.2966, lng: 106.7124 },
    { name: "Healthy Go Pamulang", lat: -6.3422, lng: 106.7383 },
    { name: "Grisenda Kapuk", lat: -6.1352, lng: 106.7621 },
    { name: "Warehouse CK Kapuk", lat: -6.1248, lng: 106.7568 },
    { name: "Ummy Bakery Pamulang", lat: -6.3465, lng: 106.7312 },
    { name: "Bursa Kue Subuh", lat: -6.1767, lng: 106.8421 }
  ]
};
