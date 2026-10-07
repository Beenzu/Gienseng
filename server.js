require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const QUIVERCRM_URL = String(process.env.QUIVERCRM_URL || '').replace(/\/$/, '');
const QUIVERCRM_KEY = process.env.QUIVERCRM_KEY;

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

function clean(v, max=500) { return String(v ?? '').trim().slice(0, max); }
function phone(v) { return String(v ?? '').replace(/[^0-9+]/g, '').slice(0, 25); }

app.get('/api/health', (_req,res) => {
  res.json({ ok:true, service:'Flavors Tea Website', quiverConfigured:Boolean(QUIVERCRM_URL && QUIVERCRM_KEY) });
});

app.post('/api/order', async (req,res) => {
  if (!QUIVERCRM_URL || !QUIVERCRM_KEY) {
    return res.status(503).json({ok:false,error:'Order service is not configured yet.'});
  }
  const b=req.body||{};
  const customerName=clean(b.customerName,150);
  const callPhone=phone(b.phone);
  const whatsapp=phone(b.altPhone);
  const address=clean(b.address,500);
  const province=clean(b.province,100);
  const items=Array.isArray(b.items) ? b.items.slice(0,5).map(i=>({
    id:clean(i?.id,100), name:clean(i?.name,150),
    price:Number(i?.price)||0, qty:Math.max(1,Math.min(20,Number(i?.qty)||1))
  })) : [];
  const total=Number(b.total)||items.reduce((sum,i)=>sum+i.price*i.qty,0);
  if(!customerName || !callPhone || !whatsapp || !address || !province || !items.length) {
    return res.status(400).json({ok:false,error:'Please provide your name, phone numbers, delivery address, delivery state and package.'});
  }
  const payload={
    externalId:`FT-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    source:'Flavors Tea Website', customerName, phone:callPhone, altPhone:whatsapp,
    address, province, items, total, currency:'ZMW', notes:clean(b.notes,500), createdAt:new Date().toISOString()
  };
  try {
    const upstream=await fetch(`${QUIVERCRM_URL}/api/integrations/orders`, {
      method:'POST', headers:{'Content-Type':'application/json','X-QuiverCRM-Key':QUIVERCRM_KEY}, body:JSON.stringify(payload)
    });
    const data=await upstream.json().catch(()=>({}));
    if(!upstream.ok) return res.status(upstream.status>=500?502:upstream.status).json({ok:false,error:data.error||'QuiverCRM could not accept the order.'});
    return res.json({ok:true,orderId:data.orderId||null});
  } catch (err) {
    console.error('QuiverCRM order submission failed:', err.message);
    return res.status(502).json({ok:false,error:'We could not reach the order system. Please try again in a moment.'});
  }
});

app.get('*', (_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`Flavors Tea website running on port ${PORT}`));
