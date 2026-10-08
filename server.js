require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const QUIVERCRM_URL = String(process.env.QUIVERCRM_URL || '').replace(/\/$/, '');
const QUIVERCRM_KEY = process.env.QUIVERCRM_KEY;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ASSET_DIR = process.env.IMAGE_ASSET_DIR || path.join(PUBLIC_DIR, 'assets');
const IMAGE_UPLOAD_DIR = path.join(ASSET_DIR, '_admin_uploads');
const IMAGE_MAP_FILE = path.join(ASSET_DIR, '.admin-image-map.json');

function envValue(name) {
  let v = String(process.env[name] || '').trim();
  // Remove accidental matching quotes commonly pasted into Render values.
  if (v.length >= 2 && ((v[0] === '"' && v[v.length-1] === '"') || (v[0] === "'" && v[v.length-1] === "'"))) {
    v = v.slice(1,-1).trim();
  }
  return v;
}

const ADMIN_PASSWORD = envValue('IMAGE_ADMIN_PASSWORD') || envValue('ADMIN_PASSWORD');
const ADMIN_SECRET = envValue('IMAGE_ADMIN_SECRET') || envValue('QUIVERCRM_KEY') ||
  (ADMIN_PASSWORD ? crypto.createHash('sha256').update('flavors-tea-admin:' + ADMIN_PASSWORD).digest('hex') : '');
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

fs.mkdirSync(ASSET_DIR, { recursive: true });
fs.mkdirSync(IMAGE_UPLOAD_DIR, { recursive: true });

function readImageMap() {
  try {
    const data = JSON.parse(fs.readFileSync(IMAGE_MAP_FILE, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}
function writeImageMap(map) {
  fs.writeFileSync(IMAGE_MAP_FILE, JSON.stringify(map, null, 2));
}
function mimeForUploadedImage(buffer, filename='', declaredMime='') {
  const declared = String(declaredMime || '').toLowerCase().trim();
  if (declared === 'image/jpg') return 'image/jpeg';
  if (declared.startsWith('image/')) return declared;
  if (buffer.length >= 8 && buffer.slice(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer.slice(0,3).equals(Buffer.from([0xff,0xd8,0xff]))) return 'image/jpeg';
  if (buffer.length >= 6 && (buffer.slice(0,6).toString() === 'GIF87a' || buffer.slice(0,6).toString() === 'GIF89a')) return 'image/gif';
  if (buffer.length >= 12 && buffer.slice(0,4).toString() === 'RIFF' && buffer.slice(8,12).toString() === 'WEBP') return 'image/webp';
  const lower = String(filename).toLowerCase();
  const byExt = {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.avif':'image/avif','.bmp':'image/bmp','.tif':'image/tiff','.tiff':'image/tiff','.ico':'image/x-icon'};
  return byExt[path.extname(lower)] || '';
}

app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

app.use('/assets', (req, res, next) => {
  const requested = path.basename(decodeURIComponent(req.path || ''));
  const map = readImageMap();
  const mapped = map[requested];
  if (!mapped) return next();
  const file = path.join(IMAGE_UPLOAD_DIR, mapped.file);
  if (!fs.existsSync(file)) return next();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Content-Type', mapped.mime || 'application/octet-stream');
  res.sendFile(file);
});
app.use('/assets', express.static(ASSET_DIR, { maxAge: 0, etag: true }));

// Always serve the admin page fresh so an old browser/CDN copy cannot keep the old login code.
app.get('/admin.html', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

function clean(v, max=500) { return String(v ?? '').trim().slice(0, max); }
function phone(v) { return String(v ?? '').replace(/[^0-9+]/g, '').slice(0, 25); }

/*
 * IMPORTANT:
 * The original storefront uses hashed image filenames. We DO NOT invent new
 * filenames. These are the image files actually referenced by the supplied
 * storefront index.html. Replacing one of these files leaves the HTML/layout
 * untouched.
 */
const STOREFRONT_IMAGES = ["192c8d15d0799dc4776d27642180566b0c0437e0.webp", "1c09394cf152c0d4ce8a684ffc5e6a77c142c902.jpeg", "3b28b0e8a8ccbe5b7a03b773f6dd66cc23aecca4.jpeg", "3cdf5f88490038368d2acc78efbb95bcae81358c.jpeg", "4015909316ed5084b3190b9a529a4f855a277821-600.webp", "444a8cb4700c87956503330384b9c3d0bfc5c719-600.webp", "4a30162eb56e3c0c09e87414ef2a8e7892fb629e.jpeg", "61OcoJsDVbL-rdcn29vgrajydco0ryojje1b6pkdiwjocruawbp6ko.jpg", "61kPcUgz4qL-1-rdcn2atay4l8oymnmh363vsrs3fqqlneowhsdlnseg.jpg", "6ae3754654528b3e43f667c0df55e462dfbf28dc-600.webp", "71FNiTqUfWL-rdcn271y6sg3eis48fgntwqxejy9vt8hcdvughtd3c.jpg", "71bMS337B-L-rdcn2eknpgqdzeh70ipoduum5mx7le2c1f3qapi7pk.jpg", "7583a0a9da438e1f565d86cf550e29c1ccba9c25.jpeg", "7f0911b58e7c0f8c36ac94e16534e9f9a3547284.jpeg", "80ccaf7c30330441b1bafba2cda56b3b78388f45.jpeg", "9872bd30868dffc2b54d4323dcf20824d19b8731.jpeg", "b86085a1ec6a99873199591f6ac5ab2dfba4bd83.jpeg", "b8e6a75f8befe5da974a6bfabfb652d4320ac1ea.jpeg", "e1a6920888ac8c03730722fa002a98110600cb96.jpeg", "e7364fda518cb78f1c97b3543fabc1da4e8acbc1.jpeg", "f794cd6305a50d4c4d8ed3857f5cef7e136cb20e.jpeg", "fb06dc16b588e4d4d9d3469f842383d9637348e3.jpeg", "finger-pointing-down-emoji-by-google.png", "videoframe_11639-rdcn2j9unmwtlgad92qt8bnx4ka1nvkzq2d5p3b8ug.jpg"];

const IMAGE_SLOTS = STOREFRONT_IMAGES.map((filename, i) => ({
  id: 'image-' + (i + 1),
  label: 'Storefront image ' + (i + 1),
  filename
}));

function safeSlot(id) {
  return IMAGE_SLOTS.find(s => s.id === id);
}

function safeImageExtension(mime, originalName='') {
  const byMime = {
    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
    'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg',
    'image/avif': '.avif', 'image/bmp': '.bmp', 'image/tiff': '.tiff',
    'image/x-icon': '.ico', 'image/vnd.microsoft.icon': '.ico'
  };
  if (byMime[mime]) return byMime[mime];
  const ext = path.extname(String(originalName || '')).toLowerCase();
  return /^[.][a-z0-9]{1,10}$/.test(ext) ? ext : '.img';
}

/* ---------- Admin session ---------- */
function signSession() {
  const payload = `${Date.now()}:${crypto.randomBytes(12).toString('hex')}`;
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

function validSession(token) {
  if (!ADMIN_SECRET || !token) return false;
  try {
    const raw = Buffer.from(String(token), 'base64url').toString();
    const parts = raw.split(':');
    if (parts.length !== 3) return false;
    const [time, nonce, sig] = parts;
    const timestamp = Number(time);
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > 7 * 24 * 60 * 60 * 1000) return false;
    const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(`${time}:${nonce}`).digest('hex');
    return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

function cookieToken(req) {
  const m = /(?:^|;\s*)ft_admin=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : '';
}

function requireImageAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ok:false,error:'Image admin is not configured. Set IMAGE_ADMIN_PASSWORD in Render.'});
  if (!validSession(cookieToken(req))) return res.status(401).json({ok:false,error:'Please log in.'});
  next();
}

app.post('/api/admin/image-login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ok:false,error:'Image admin is not configured. Set IMAGE_ADMIN_PASSWORD in Render.'});
  const supplied = String(req.body?.password ?? '').trim();
  const ok = supplied === ADMIN_PASSWORD;
  if (!ok) return res.status(401).json({ok:false,error:'Incorrect admin password.'});
  const token = signSession();
  res.setHeader('Set-Cookie', `ft_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${IS_PRODUCTION ? '; Secure' : ''}; Max-Age=604800`);
  res.json({ok:true});
});

app.post('/api/admin/image-logout', (_req, res) => {
  res.setHeader('Set-Cookie', `ft_admin=; Path=/; HttpOnly; SameSite=Lax${IS_PRODUCTION ? '; Secure' : ''}; Max-Age=0`);
  res.json({ok:true});
});

app.get('/api/admin/image-me', requireImageAdmin, (_req, res) => res.json({ok:true}));

app.get('/api/admin/image-slots', requireImageAdmin, (_req, res) => {
  const map = readImageMap();
  res.json({slots: IMAGE_SLOTS.map(s => {
    const p = path.join(ASSET_DIR, s.filename);
    let exists = false, version = 0;
    try {
      const st = fs.statSync(p);
      exists = st.isFile();
      version = exists ? st.mtimeMs : 0;
    } catch {}
    if (map[s.filename]?.uploadedAt) version = new Date(map[s.filename].uploadedAt).getTime();
    return {...s, group:'Storefront images', exists, version, overridden:Boolean(map[s.filename]), mime:map[s.filename]?.mime || null, url:`/assets/${encodeURIComponent(s.filename)}`};
  })});
});

app.post('/api/admin/image-slots/:id', requireImageAdmin, (req, res) => {
  const slot = safeSlot(req.params.id);
  if (!slot) return res.status(404).json({ok:false,error:'Unknown image slot.'});

  const raw = String(req.body?.data || '');
  const m = /^data:(image\/[^;]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(raw);
  if (!m) return res.status(400).json({ok:false,error:'Please choose an image file.'});

  const mime = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
  if (!mime.startsWith('image/')) return res.status(400).json({ok:false,error:'The selected file is not an image.'});
  const buffer = Buffer.from(m[2].replace(/\s/g,''), 'base64');
  if (!buffer.length) return res.status(400).json({ok:false,error:'The selected image is empty.'});
  if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ok:false,error:'Image must be 8 MB or smaller.'});

  const ext = safeImageExtension(mime);
  const storedName = crypto.randomBytes(16).toString('hex') + ext;
  fs.writeFileSync(path.join(IMAGE_UPLOAD_DIR, storedName), buffer);
  const map = readImageMap();
  const previous = map[slot.filename];
  map[slot.filename] = { file: storedName, mime, uploadedAt: new Date().toISOString() };
  writeImageMap(map);

  // Keep the original storefront URL/filename unchanged. The browser receives
  // the correct MIME type for whatever image the admin uploaded.
  if (previous?.file && previous.file !== storedName) {
    try { fs.unlinkSync(path.join(IMAGE_UPLOAD_DIR, previous.file)); } catch {}
  }

  res.json({ok:true,url:`/assets/${encodeURIComponent(slot.filename)}`,filename:slot.filename,mime});
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok:true,
    service:'Flavors Tea Website',
    quiverConfigured:Boolean(QUIVERCRM_URL && QUIVERCRM_KEY),
    imageAdminConfigured:Boolean(ADMIN_PASSWORD)
  });
});

app.post('/api/order', async (req,res) => {
  if (!QUIVERCRM_URL || !QUIVERCRM_KEY) return res.status(503).json({ok:false,error:'Order service is not configured yet.'});
  const b=req.body||{};
  const customerName=clean(b.customerName,150), callPhone=phone(b.phone), whatsapp=phone(b.altPhone);
  const address=clean(b.address,500), province=clean(b.province,100);
  const items=Array.isArray(b.items) ? b.items.slice(0,5).map(i=>({id:clean(i?.id,100),name:clean(i?.name,150),price:Number(i?.price)||0,qty:Math.max(1,Math.min(20,Number(i?.qty)||1))})) : [];
  const total=Number(b.total)||items.reduce((sum,i)=>sum+i.price*i.qty,0);
  if(!customerName || !callPhone || !whatsapp || !address || !province || !items.length) return res.status(400).json({ok:false,error:'Please provide your name, phone numbers, delivery address, delivery state and package.'});
  const payload={externalId:`FT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,source:'Flavors Tea Website',customerName,phone:callPhone,altPhone:whatsapp,address,province,items,total,currency:'ZMW',notes:clean(b.notes,500),createdAt:new Date().toISOString()};
  try {
    const upstream=await fetch(`${QUIVERCRM_URL}/api/integrations/orders`,{method:'POST',headers:{'Content-Type':'application/json','X-QuiverCRM-Key':QUIVERCRM_KEY},body:JSON.stringify(payload)});
    const data=await upstream.json().catch(()=>({}));
    if(!upstream.ok) return res.status(upstream.status>=500?502:upstream.status).json({ok:false,error:data.error||'QuiverCRM could not accept the order.'});
    return res.json({ok:true,orderId:data.orderId||null});
  } catch(err) {
    console.error('QuiverCRM order submission failed:',err.message);
    return res.status(502).json({ok:false,error:'We could not reach the order system. Please try again in a moment.'});
  }
});

app.use((_req,res) => res.sendFile(path.join(PUBLIC_DIR,'index.html')));
app.listen(PORT,()=>console.log(`Flavors Tea website running on port ${PORT}`));
