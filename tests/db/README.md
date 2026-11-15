# اختبار صلاحيات قاعدة البيانات (Postgres حقيقي)

يشغّل كل ملفات `supabase/` على PostgreSQL محلي فيه بدائل بسيطة لـ Supabase (`auth.uid()`، أدوار `anon` و`authenticated`)،
ويجرب كل دور: هجمات لازم تنرفض (VULN لو نجحت) وخطوات شغل عادية لازم تنجح (BROKEN لو انرفضت).

```bash
PGHOST=/tmp/pgd PGPORT=5544 ./reset.sh t1            # مع 011
PGHOST=/tmp/pgd PGPORT=5544 DB=t1 node rls.check.js   # يحتاج: npm i pg
PGHOST=/tmp/pgd PGPORT=5544 ./reset.sh t0 --without-011 && DB=t0 node rls.check.js   # يوضح الثغرات قبل 011
```
النتيجة المطلوبة: ولا سطر يبدأ بـ VULN أو BROKEN.
