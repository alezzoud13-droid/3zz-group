-- التحديث 13: الملكية الكاملة (قرار عبدالمحسن 16 نوفمبر)
-- كل موظف مسؤول 100% عن مؤثرينه وترشيحاته: ما أحد يضيف باسم زميله، وما أحد يعدّل بياناته — إلا عبدالمحسن.
-- متعب يظل صاحب القرار (اعتماد/إرجاع/رفض، اعتماد المقطع، الحصص) لكنه ما يلمس «بيانات» ملفات غيره.
-- يُشغَّل مرة وحدة بعد 012. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

-- 1) الإضافة باسم صاحبها فقط (كانت مفتوحة للمعتمد)
drop policy if exists i_ins on public.influencers;
create policy i_ins on public.influencers for insert with check (
  public.is_member() and (nominated_by = auth.uid() or public.is_admin()));
drop policy if exists d_ins on public.deals;
create policy d_ins on public.deals for insert with check (
  public.is_member() and (member_id = auth.uid() or public.is_admin()));

-- 2) بيانات المؤثر: على ملفات الغير، المسموح الوحيد لغير عبدالمحسن هو خانات قرار الاستقطاب
create or replace function public.guard_infl_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; c text;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if old.nominated_by = auth.uid() then return new; end if;
  o := to_jsonb(old); n := to_jsonb(new);
  select x into c from jsonb_object_keys(n) x
    where (o -> x) is distinct from (n -> x)
      and x not in ('acq_status', 'acq_decided_by', 'acq_decided_at', 'acq_reason') limit 1;
  if c is not null then raise exception 'بيانات المؤثر (%) يعدّلها صاحبه (اللي رشّحه) أو عبدالمحسن فقط', c; end if;
  return new;
end $$;
drop trigger if exists a1_guard_infl_owner on public.influencers;
create trigger a1_guard_infl_owner before update on public.influencers for each row execute function public.guard_infl_owner();

-- 3) بيانات الترشيح في الحملة: نفس المبدأ — المعتمد ما عاد يعدّلها على ملفات الغير
create or replace function public.guard_deal_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb; c text;
  data_cols text[] := array['name','phone','handle','platform','city','acc_type','followers','price','currency','price_note','notes',
    'draft_url','draft_note','post_url','tt_code','ig_code','sn_code','sn_user','hook','planned_date','price_before','ad_type',
    'campaign_id','influencer_id','rcv_name','rcv_phone','rcv_city','address','short_code','country'];
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if old.member_id = auth.uid() then return new; end if;
  o := to_jsonb(old); n := to_jsonb(new);
  c := public._chg(o, n, data_cols);
  if c is not null then raise exception 'بيانات الترشيح (%) يعدّلها صاحبه أو عبدالمحسن فقط — المعتمد يرجّعها له بـ«يحتاج تعديل»', c; end if;
  return new;
end $$;
drop trigger if exists a1_guard_deal_owner on public.deals;
create trigger a1_guard_deal_owner before update on public.deals for each row execute function public.guard_deal_owner();
