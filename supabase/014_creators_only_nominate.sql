-- التحديث 14: الترشيح لصناع المحتوى فقط (قرار عبدالمحسن 16 نوفمبر — امتداد الملكية الكاملة)
-- أي موظف دوره ما فيه «صانع محتوى» (زياد، لؤي، صقر، الميديا باير...) ما يقدر يسجّل مؤثر ولا ترشيح حملة،
-- لا لنفسه ولا لغيره. الاستثناء الوحيد عبدالمحسن.
-- يُشغَّل مرة وحدة بعد 013. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

drop policy if exists i_ins on public.influencers;
create policy i_ins on public.influencers for insert with check (
  public.is_admin() or (nominated_by = auth.uid() and public.has_role('creator')));

drop policy if exists d_ins on public.deals;
create policy d_ins on public.deals for insert with check (
  public.is_admin() or (member_id = auth.uid() and public.has_role('creator')));
