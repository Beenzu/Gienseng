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
const ADMIN_PASSWORD = String(process.env.IMAGE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '');
const ADMIN_SECRET = String(process.env.IMAGE_ADMIN_SECRET || process.env.QUIVERCRM_KEY || (ADMIN_PASSWORD ? crypto.createHash('sha256').update('flavors-tea-admin:' + ADMIN_PASSWORD).digest('hex') : ''));
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

fs.mkdirSync(ASSET_DIR, { recursive: true });

app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
// Uploaded assets take precedence over the bundled assets, but the public URL
// stays exactly /assets/<filename>, so the storefront markup does not change.
app.use('/assets', express.static(ASSET_DIR, { maxAge: 0, etag: true }));
app.get('/admin.html', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});
app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

function clean(v, max=500) { return String(v ?? '').trim().slice(0, max); }
function phone(v) { return String(v ?? '').replace(/[^0-9+]/g, '').slice(0, 25); }

/* ---------- Fixed storefront image slots ----------
   These filenames are deliberately fixed. The admin panel replaces the file
   at the same path, so the storefront HTML/CSS does not need to change.
*/
const IMAGE_SLOTS = [
  ['hero-banner','Hero banner','hero-banner.jpg'],
  ['banner2','Wellness banner','banner2.jpg'],
  ['benefit-fatigue','Fatigue / tiredness','benefit-fatigue.jpg'],
  ['benefit-stomach','Stomach discomfort','benefit-stomach.jpg'],
  ['benefit-cough','Cough / chest discomfort','benefit-cough.jpg'],
  ['benefit-headache','Headaches','benefit-headache.jpg'],
  ['benefit-weight','Healthy weight','benefit-weight.jpg'],
  ['benefit-list','Benefits checklist','benefit-list.jpg'],
  ['features-icons','Natural wellness features','features-icons.jpg'],
  ['product-showcase','Product showcase','product-showcase.jpg'],
  ['immunity','Immunity banner','immunity.jpg'],
  ['nature-goodness','Nature goodness','nature-goodness.jpg'],
  ['ingredient-hibiscus','Hibiscus ingredient','ingredient-hibiscus.jpg'],
  ['ingredient-ginger','Ginger ingredient','ingredient-ginger.jpg'],
  ['ingredient-mint','Mint ingredient','ingredient-mint.jpg'],
  ['ingredient-moringa','Moringa ingredient','ingredient-moringa.jpg'],
  ['ingredient-lemon','Lemon ingredient','ingredient-lemon.jpg'],
  ['ingredient-cinnamon','Cinnamon ingredient','ingredient-cinnamon.jpg'],
  ['ingredient-turmeric','Turmeric ingredient','ingredient-turmeric.jpg']
].map(([id,label,filename]) => ({id,label,filename}));

const GROUPS = {
  'Hero & promotional': new Set(['hero-banner','banner2','product-showcase','immunity','nature-goodness']),
  'Wellness / benefit cards': new Set(['benefit-fatigue','benefit-stomach','benefit-cough','benefit-headache','benefit-weight','benefit-list','features-icons']),
  'Ingredients': new Set(['ingredient-hibiscus','ingredient-ginger','ingredient-mint','ingredient-moringa','ingredient-lemon','ingredient-cinnamon','ingredient-turmeric'])
};
function slotGroup(id) {
  for (const [group, ids] of Object.entries(GROUPS)) if (ids.has(id)) return group;
  return 'Other';
}

function safeSlot(id) {
  return IMAGE_SLOTS.find(s => s.id === id);
}
function imageMime(ext) {
  return ({'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'})[ext];
}

/* ---------- Lightweight signed admin session ---------- */
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
    if (Date.now() - Number(time) > 7 * 24 * 60 * 60 * 1000) return false;
    const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(`${time}:${nonce}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}
function cookieToken(req) {
  const m = /(?:^|;\s*)ft_admin=([^;]+)/.exec(req.headers.cookie || '');
  return m ? decodeURIComponent(m[1]) : '';
}
function requireImageAdmin(req,res,next) {
  if (!ADMIN_PASSWORD || !ADMIN_SECRET) return res.status(503).json({ok:false,error:'Image admin is not configured. Set IMAGE_ADMIN_PASSWORD in Render Environment.'});
  if (!validSession(cookieToken(req))) return res.status(401).json({ok:false,error:'Please log in.'});
  next();
}

app.post('/api/admin/image-login', (req,res) => {
  if (!ADMIN_PASSWORD || !ADMIN_SECRET) return res.status(503).json({ok:false,error:'Image admin is not configured. Set IMAGE_ADMIN_PASSWORD in Render Environment.'});
  const supplied = String(req.body?.password || '');
  const a = Buffer.from(supplied), b = Buffer.from(ADMIN_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a,b);
  if (!ok) return res.status(401).json({ok:false,error:'Incorrect admin password.'});
  const token = signSession();
  res.setHeader('Set-Cookie', `ft_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${IS_PRODUCTION ? '; Secure' : ''}; Max-Age=604800`);
  res.json({ok:true});
});
app.post('/api/admin/image-logout', (_req,res) => {
  res.setHeader('Set-Cookie', `ft_admin=; Path=/; HttpOnly; SameSite=Lax${IS_PRODUCTION ? '; Secure' : ''}; Max-Age=0`);
  res.json({ok:true});
});
app.get('/api/admin/image-me', requireImageAdmin, (_req,res) => res.json({ok:true}));

app.get('/api/admin/image-slots', requireImageAdmin, (_req,res) => {
  res.json({slots:IMAGE_SLOTS.map(s => {
    const p = path.join(ASSET_DIR, s.filename);
    let exists = false, version = 0;
    try { const st = fs.statSync(p); exists = st.isFile(); version = exists ? st.mtimeMs : 0; } catch {}
    return {...s, group:slotGroup(s.id), exists, version, url:`/assets/${encodeURIComponent(s.filename)}`};
  })});
});

app.post('/api/admin/image-slots/:id', requireImageAdmin, (req,res) => {
  const slot = safeSlot(req.params.id);
  if (!slot) return res.status(404).json({ok:false,error:'Unknown image slot.'});
  const raw = String(req.body?.data || '');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(raw);
  if (!m) return res.status(400).json({ok:false,error:'Choose a JPG, PNG or WebP image.'});
  const buffer = Buffer.from(m[2].replace(/\s/g,''),'base64');
  if (!buffer.length) return res.status(400).json({ok:false,error:'The selected image is empty.'});
  if (buffer.length > 8 * 1024 * 1024) return res.status(400).json({ok:false,error:'Image must be 8 MB or smaller.'});
  const target = path.join(ASSET_DIR, slot.filename);
  fs.writeFileSync(target, buffer);
  res.json({ok:true,url:`/assets/${encodeURIComponent(slot.filename)}`,filename:slot.filename});
});

app.get('/api/health', (_req,res) => {
  res.json({ok:true, service:'Flavors Tea Website', quiverConfigured:Boolean(QUIVERCRM_URL && QUIVERCRM_KEY), imageAdminConfigured:Boolean(ADMIN_PASSWORD)});
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
