import { NODES } from '../core/nodes.js';

export default async function handler(req, res) {
  // امنیت واچ‌داگ تا دیگران سوءاستفاده نکنند
  if (req.query.auth !== process.env.WATCHDOG_AUTH) {
    return res.status(403).send('Forbidden');
  }

  const nodesToWatch = NODES.filter(node => node.isActive);
  const results = [];

  for (const node of nodesToWatch) {
    try {
      // ارسال درخواست تست برای بیدار نگه داشتن سرور (Keep-alive) و جلوگیری از خاموش شدن نود رایگان
      const urlToFetch = node.type === 'vless' 
        ? `https://${node.server}:${node.ports[0]}` 
        : `https://${node.server}:${node.port}`;

      await fetch(urlToFetch, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(3000) // تایم‌اوت ۳ ثانیه
      });
      
      results.push({ node: node.id, status: 'Online/Keep-alive sent' });
    } catch (error) {
      // اگر ارور داد، نود احتمالاً خاموش یا فیلتره
      results.push({ node: node.id, status: 'Offline/Timeout' });
    }
  }

  return res.status(200).json({ watchdog: 'executed', results });
}
