# KICK MODS: بوابة تقديم المودريتورز

موقع تقديم + لوحة مراجعة، على Supabase (مشروع `kick`) وجاهز للنشر على Vercel.

## اللي اتعمل على Supabase (مشروع `kick`)
- جدول `applications` + RLS (الزائر يقدر يضيف تقديم جديد بس، ومفيش قراءة ولا تعديل).
- Bucket خاص `application-private` (حد أقصى 50MB للملف، فيديو وصور فقط).
- جدول `admin_settings` فيه **bcrypt hash** لباسورد الأدمن، مقفول بـ RLS ومفيش حد يقراه غير الـ service role.
- جدول `admin_login_failures`: بعد 5 محاولات غلط من نفس الـ IP بيتقفل الدخول 15 دقيقة.
- Edge Function `admin-gate`: بتتحقق من الباسورد وبتطلع توكن مدته 12 ساعة، وبتعرض التقديمات (روابط فيديو مؤقتة) وبتحفظ قرار القبول/الرفض.

## نتيجة التقديم للمتقدّم
- بعد الإرسال بيظهر للمتقدّم **رمز متابعة** (UUID عشوائي) ويتحفظ في متصفحه. لما يرجع للموقع النتيجة بتظهر تلقائيًا.
- جديد / تحت المراجعة: «استنى يوم ونتيجتك هتظهر هنا». مقبول: رسالة قبول + زرار سيرفر الديسكورد. مرفوض: رسالة مهذبة.
- الدالة `get_application_status(uuid)` في Supabase بترجّع **الحالة فقط** لمن يعرف الرمز.
- رابط الديسكورد في `src/main.js` (الثابت `DISCORD_URL`).
- رسالة «ملكش دعوه» عند Ctrl+U في `src/guard.js`، وده شكلي فقط؛ الحماية الحقيقية في Supabase.

## تغيير باسورد الأدمن
من SQL Editor في Supabase:
```sql
update public.admin_settings
set pass_hash = extensions.crypt('الباسورد_الجديد', extensions.gen_salt('bf', 10)), updated_at = now()
where id = 1;
```

## النشر على Vercel
1. ارفع المشروع على GitHub وادخل Vercel واعمل Import.
2. Framework: Vite. Build: `npm run build`. Output: `dist`.
3. Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (الـ anon key العادي، مش الـ service role)
4. بعد النشر: الصفحة الرئيسية للتقديم، و`/admin` للمراجعة.
   لو عايز دومينين منفصلين، اعمل Import تاني لنفس الريبو كمشروع تاني على Vercel وكل واحد بدومينه.

## تشغيل محلي
```
npm install
npm run dev
```
ملف `.env` موجود فيه بيانات مشروع `kick` (المفتاح public بطبيعته). **ماتحطش** الـ service role key في الواجهة أبدًا.

## ملاحظات
- التسجيل بجودة منخفضة (حوالي 2.6MB في الدقيقة) عشان يفضل تحت حد 50MB، يعني تقريبًا 17 دقيقة. لو عندك Supabase Pro زوّد `file_size_limit` للـ bucket.
- المتصفح مش بيقدر يمنع كل محاولات الغش. الموقع بيسجل مرات خروج المتقدم من الصفحة وبيعرضها في اللوحة، بس مش دليل قاطع.
- متجمعش صورة بطاقة كاملة إلا لو لازم، واحذفها بعد المراجعة.
