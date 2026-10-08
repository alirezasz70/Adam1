import { generateSubscription } from '../core/generator.js';

export default function handler(req, res) {
  // لایه امنیتی: فقط کسانی که توکن رو دارند ببینند
  const token = req.query.token;
  
  if (token !== process.env.SUB_TOKEN) {
    return res.status(403).send('Access Denied');
  }

  const subscriptionContent = generateSubscription();
  
  // تنظیم هدرها برای کلاینت‌های V2ray
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('profile-update-interval', '24'); // آپدیت هر ۲۴ ساعت
  res.setHeader('profile-web-page-url', 'https://your-vercel-app.vercel.app');
  
  return res.status(200).send(subscriptionContent);
}
