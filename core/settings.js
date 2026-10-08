export const SETTINGS = {
  // فعال بودن تولید کانفیگ‌های فرگمنت‌دار (برای عبور از DPI)
  enableFragment: true, 
  
  // استفاده از آی‌پی تمیز به جای دامنه در کانفیگ نهایی
  preferCleanIP: true,

  // فعال کردن Mux برای تقویت اتصال‌های ناپایدار موبایل
  enableMux: true,

  // فعال کردن Padding (اضافه کردن دیتای تصادفی برای تشتباه در ترافیک)
  enablePadding: true,

  // قوانین مسیردهی (بای‌پس سایت‌های ایرانی و بلاک تبلیغات)
  routingRules: {
    directIrSites: true,
    blockAds: true
  }
};
