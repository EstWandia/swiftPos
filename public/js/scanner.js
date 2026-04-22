/* ══════════════════════════════════════════════════════════════
   SwiftPOS — Barcode Scanner (scanner.js)

   Strategy (in order of preference):
   1. BarcodeDetector API  — Chrome 83+, Android WebView, Edge
   2. ZXing-js (via CDN)  — Safari, iOS, Firefox, older Chrome
   3. Manual text entry   — always available as fallback

   Hardware scanners (USB/Bluetooth) are also supported:
   they act as keyboards and type fast — we detect rapid
   keystrokes and treat them as a barcode scan automatically.
══════════════════════════════════════════════════════════════ */

// ── State ─────────────────────────────────────────────────────
let scannerStream     = null;   // active MediaStream
let scannerActive     = false;  // overlay is open
let scannerTimer      = null;   // polling interval
let useFrontCam       = false;  // camera facing mode
let zxingReader       = null;   // ZXing reader instance
let useZxing          = false;  // which engine to use
let lastScannedCode   = '';     // debounce duplicate scans
let scanCooldown      = false;  // 2s cooldown after success

// ── Hardware scanner detection ────────────────────────────────
// Most USB/Bluetooth barcode scanners type characters very fast
// (< 50ms between keystrokes) and end with Enter.
let hwBuffer = '';
let hwLastKey = 0;
const HW_THRESHOLD_MS = 60;   // faster than human typing
const HW_MIN_LENGTH   = 4;    // min barcode length

document.getElementById('hwScanInput').addEventListener('keydown', hwKeyHandler);

function hwKeyHandler(e) {
  const now = Date.now();
  const gap = now - hwLastKey;
  hwLastKey = now;

  if (e.key === 'Enter') {
    if (hwBuffer.length >= HW_MIN_LENGTH) {
      handleScanResult(hwBuffer.trim());
    }
    hwBuffer = '';
    return;
  }

  // If gap too large, this is not a scanner — reset buffer
  if (gap > 500 && hwBuffer.length > 0) {
    hwBuffer = '';
  }

  if (e.key.length === 1) hwBuffer += e.key;
}

// Route any keydown on the page body to the hidden input
// so hardware scanners work even when no input is focused
document.addEventListener('keydown', e => {
  // Ignore if user is typing in a real input/textarea
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  // Ignore modifier keys
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  // Focus hidden input and replay the event
  const hw = document.getElementById('hwScanInput');
  hw.removeAttribute('readonly');
  hw.focus();
  hw.setAttribute('readonly', '');
});

// ── Open / Close ──────────────────────────────────────────────
async function openScanner() {
  scannerActive = true;
  document.getElementById('scannerOverlay').classList.add('open');
  document.getElementById('scannerManualIn').value = '';
  setStatus('Starting camera…');
  await startCamera();
}

function closeScanner() {
  scannerActive = false;
  stopCamera();
  document.getElementById('scannerOverlay').classList.remove('open');
  document.getElementById('scannerOverlay').classList.remove('found');
  document.getElementById('scannerResult').classList.remove('show');
  clearInterval(scannerTimer);
  scannerTimer = null;
  lastScannedCode = '';
  scanCooldown = false;
}

// ── Camera ────────────────────────────────────────────────────
async function startCamera() {
  stopCamera();

  const facing = useFrontCam ? 'user' : 'environment';
  const constraints = {
    video: {
      facingMode: { ideal: facing },
      width:  { ideal: 1280 },
      height: { ideal: 720 },
    }
  };

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('scannerVideo');
    video.srcObject = scannerStream;
    await video.play();

    // Decide which scanning engine to use
    if (typeof BarcodeDetector !== 'undefined') {
      const supported = await BarcodeDetector.getSupportedFormats();
      if (supported.length > 0) {
        useZxing = false;
        startBarcodeDetector(video);
        setStatus('Point camera at barcode');
        return;
      }
    }

    // Fallback: ZXing
    if (typeof ZXing !== 'undefined') {
      useZxing = true;
      startZxing(video);
      setStatus('Point camera at barcode');
    } else {
      setStatus('Camera ready — or use manual entry below');
    }

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus('Camera permission denied — use manual entry');
    } else if (err.name === 'NotFoundError') {
      setStatus('No camera found — use manual entry');
    } else {
      setStatus('Camera error: ' + err.message);
      console.warn('Scanner camera error:', err);
    }
  }
}

function stopCamera() {
  clearInterval(scannerTimer);
  scannerTimer = null;
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  if (zxingReader) {
    try { zxingReader.reset(); } catch (_) {}
    zxingReader = null;
  }
}

function flipCamera() {
  useFrontCam = !useFrontCam;
  startCamera();
}

// ── Engine 1: BarcodeDetector (Chrome / Android) ──────────────
function startBarcodeDetector(video) {
  const formats = [
    'code_128','code_39','code_93','ean_13','ean_8',
    'qr_code','upc_a','upc_e','pdf417','data_matrix','aztec','itf'
  ];
  const detector = new BarcodeDetector({ formats });

  scannerTimer = setInterval(async () => {
    if (!scannerActive || scanCooldown) return;
    if (video.readyState < 2) return;

    try {
      const barcodes = await detector.detect(video);
      if (barcodes.length > 0) {
        const code = barcodes[0].rawValue;
        if (code && code !== lastScannedCode) {
          handleScanResult(code);
        }
      }
    } catch (_) {}
  }, 200); // 5fps detection
}

// ── Engine 2: ZXing-js (Safari / iOS / Firefox) ───────────────
function startZxing(video) {
  try {
    zxingReader = new ZXing.BrowserMultiFormatReader();
    const canvas  = document.getElementById('scannerCanvas');
    const ctx     = canvas.getContext('2d');

    scannerTimer = setInterval(() => {
      if (!scannerActive || scanCooldown) return;
      if (video.readyState < 2) return;

      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const result = zxingReader.decodeFromCanvas(canvas);
        if (result) {
          const code = result.getText();
          if (code && code !== lastScannedCode) {
            handleScanResult(code);
          }
        }
      } catch (_) {
        // ZXing throws NotFoundException when nothing found — expected, ignore
      }
    }, 300);
  } catch (e) {
    console.warn('ZXing init failed:', e);
    setStatus('Camera ready — use manual entry below');
  }
}

// ── Handle a successfully decoded barcode ─────────────────────
async function handleScanResult(code) {
  if (scanCooldown) return;
  scanCooldown = true;
  lastScannedCode = code;

  // Brief haptic feedback on mobile
  if (navigator.vibrate) navigator.vibrate(80);

  setStatus('Looking up: ' + code);

  try {
    const { item } = await API.get(`/api/items/sku/${encodeURIComponent(code)}`);

    // Check out of stock
    if (item.track_stock && parseInt(item.stock_qty) <= 0) {
      showToast(`❌ ${item.name} is out of stock`, 'error');
      setStatus('Out of stock: ' + item.name);
      setTimeout(() => {
        if (scannerActive) {
          setStatus('Point camera at barcode');
          scanCooldown = false;
          lastScannedCode = '';
        }
      }, 2000);
      return;
    }

    // Show success flash in scanner
    const overlay = document.getElementById('scannerOverlay');
    overlay.classList.add('found');
    document.getElementById('srName').textContent  = item.emoji + ' ' + item.name;
    document.getElementById('srPrice').textContent = fmt(item.on_sale && item.sale_price ? item.sale_price : item.price);
    document.getElementById('scannerResult').classList.add('show');

    // Add to cart
    const effPrice = item.on_sale && item.sale_price ? parseFloat(item.sale_price) : parseFloat(item.price);
    addToCart({
      id: item.id, name: item.name, sku: item.sku,
      emoji: item.emoji, price: effPrice,
      tax_rate: item.tax_rate || 10,
      track_stock: item.track_stock, stock_qty: item.stock_qty
    });

    setStatus('✓ Added: ' + item.name);

    // Auto-resume scanning after 1.5s
    setTimeout(() => {
      if (scannerActive) {
        overlay.classList.remove('found');
        document.getElementById('scannerResult').classList.remove('show');
        setStatus('Point camera at barcode');
        scanCooldown  = false;
        lastScannedCode = '';
      }
    }, 1500);

  } catch (err) {
    // Item not found
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]); // double buzz = not found
    setStatus('Not found: ' + code);
    showToast(`Barcode not found: ${code}`, 'error');
    setTimeout(() => {
      if (scannerActive) {
        setStatus('Point camera at barcode');
        scanCooldown  = false;
        lastScannedCode = '';
      }
    }, 2200);
  }
}

// ── Manual entry fallback ─────────────────────────────────────
async function manualScan() {
  const val = document.getElementById('scannerManualIn').value.trim();
  if (!val) return;
  document.getElementById('scannerManualIn').value = '';
  await handleScanResult(val);
}

// ── Also handle scanMode() called from elsewhere (backwards compat) ──
function scanMode() { openScanner(); }

// ── Helper ────────────────────────────────────────────────────
function setStatus(msg) {
  const el = document.getElementById('scannerStatus');
  if (el) el.textContent = msg;
}

// ── Keyboard shortcut: press F2 or Ctrl+B to open scanner ─────
document.addEventListener('keydown', e => {
  if (e.key === 'F2' || (e.ctrlKey && e.key === 'b')) {
    e.preventDefault();
    if (scannerActive) closeScanner(); else openScanner();
  }
  if (e.key === 'Escape' && scannerActive) closeScanner();
});