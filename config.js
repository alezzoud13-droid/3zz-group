// إعدادات الاتصال بقاعدة البيانات. المفتاح هنا «عام» (publishable) وآمن في المتصفح؛
// الحماية الفعلية بقواعد الصلاحيات (RLS) داخل قاعدة البيانات.
window.APP_CONFIG = {
  supabaseUrl: 'https://lxhvgfskfmqljqjtijwf.supabase.co',
  supabaseKey: 'sb_publishable_8WKwxDr3oPM3lTe7LKyGyA_e920nt0h',
  brand: 'أداء فريق العز',
  // صفحة تعبئة بيانات المؤثر تبقى على الرابط العام القديم (بدون بوابة الدخول) عشان الروابط المرسلة ما تخرب
  intakeBase: 'https://alezzoud13-droid.github.io/3zz-group/'
};
