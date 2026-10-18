(() => {
  'use strict';
  const form = document.getElementById('flavors-order-form');
  if (!form) return;

  let success = document.createElement('div');
  success.className = 'flavors-order-success';
  success.setAttribute('role','status');
  success.textContent = 'Thank you! Your order has been received. We will contact you shortly to confirm delivery.';
  form.appendChild(success);
  let error = document.createElement('div');
  error.className = 'flavors-order-error';
  error.setAttribute('role','alert');
  form.appendChild(error);

  const submit = form.querySelector('input[type="submit"]');
  const value = (name) => (form.elements[name]?.value || '').trim();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    success.style.display = 'none'; error.style.display = 'none';
    const customerName=value('your-name'), phone=value('your-phone'), whatsapp=value('your-whatsapp'), address=value('your-address'), province=value('your-state'), pkg=value('menu-84');
    if (!customerName || !phone || !whatsapp || !address || !province || !pkg) {
      error.textContent='Please complete all required fields before submitting your order.';
      error.style.display='block'; return;
    }
    const match = pkg.match(/(One Month Treatment|Three months treatment|Five months treatment).*?(\d[\d,]*)\s*ZMW/i);
    const label = match ? match[1] : pkg;
    const total = match ? Number(match[2].replace(/,/g,'')) : 0;
    const qty = /3\s*packs?/i.test(pkg) ? 3 : /2\s*packs?/i.test(pkg) ? 2 : 1;
    const body = {
      customerName, phone, altPhone: whatsapp, address, province,
      source: 'Flavors Tea Website', currency: 'ZMW', total,
      items: [{ id: label.toLowerCase().replace(/[^a-z0-9]+/g,'-'), name: label, price: total, qty }],
      notes: `Package selected: ${pkg}`
    };
    if (submit) { submit.disabled=true; submit.value='Sending Order...'; }
    try {
      const res = await fetch('/api/order', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
      const data = await res.json().catch(()=>({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'We could not submit your order. Please try again.');
      form.reset(); success.style.display='block'; success.scrollIntoView({behavior:'smooth',block:'center'});
    } catch (e) {
      error.textContent=e.message || 'We could not submit your order. Please try again.';
      error.style.display='block';
    } finally { if (submit) { submit.disabled=false; submit.value='Order Now'; } }
  });
})();
