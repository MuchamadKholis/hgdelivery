const SPREADSHEET_ID = '1RfPzyNFgaT755P5LFV0lwESXNCIk_u3XexX1pFNLIHA';
const DRIVE_FOLDER_ID = '101gXN2Ks7BVSs9J8diiwYHJcsAURKt05';

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    ensureSheets(ss);

    const payload = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : ((e && e.parameter) || {});
    const action = payload.action || 'getAll';

    if (action === 'getAll') {
      return jsonOut({
        ok: true,
        accounts: readSheetObjects(ss.getSheetByName('Accounts')),
        orders: readSheetObjects(ss.getSheetByName('Orders'))
      });
    }

    if (action === 'upsertAccount') {
      upsertRow(ss.getSheetByName('Accounts'), 'id', payload.account || {});
      return jsonOut({ ok: true });
    }

    if (action === 'upsertOrder') {
      upsertRow(ss.getSheetByName('Orders'), 'orderNumber', payload.order || {});
      return jsonOut({ ok: true });
    }

    if (action === 'uploadProof') {
      const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
      const rawBase64 = payload.base64 || '';
      const base64Data = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
      const mimeType = payload.mimeType || 'image/jpeg';
      const fileName = payload.fileName || ('bukti_bayar_' + Date.now() + '.jpg');
      const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
      const file = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonOut({ ok: true, fileUrl: file.getUrl() });
    }

    return jsonOut({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function ensureSheets(ss) {
  const accHeaders = ['id', 'name', 'email', 'phone', 'password', 'role', 'vehicle', 'createdAt'];
  const ordHeaders = [
    'orderNumber', 'serviceType', 'createdAt', 'createdById', 'customerName',
    'customerPhone', 'customerEmail', 'pickupDateTime', 'pickupAddress', 'pickupLat',
    'pickupLng', 'dropoffAddress', 'dropoffLat', 'dropoffLng', 'distanceKm',
    'vehicleType', 'passengerCount', 'itemType', 'itemWeight', 'recipientName',
    'recipientPhone', 'serviceSpeed', 'paymentMethod', 'notes', 'companyShare',
    'courierShare', 'totalPayment', 'status', 'courierId', 'courierName',
    'courierPhone', 'proofUrl', 'paymentApproval', 'updatedAt'
  ];
  initSheetIfEmpty(ss, 'Accounts', accHeaders);
  initSheetIfEmpty(ss, 'Orders', ordHeaders);
}

function initSheetIfEmpty(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
  }
}

function readSheetObjects(sh) {
  const values = sh.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function upsertRow(sh, keyField, dataObj) {
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const keyIdx = headers.indexOf(keyField);
  const rowData = headers.map(h => dataObj[h] !== undefined ? dataObj[h] : '');
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][keyIdx]) === String(dataObj[keyField])) {
      sh.getRange(r + 1, 1, 1, headers.length).setValues([rowData]);
      return;
    }
  }
  sh.appendRow(rowData);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
