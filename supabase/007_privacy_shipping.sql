-- التحديث 7: خصوصية البيانات + شركة الشحن
-- 1) كل صانع محتوى يشوف المؤثرين والترشيحات حقته فقط. الأدمن والمعتمد (متعب) يشوفون الكل.
--    الشحن يشوف المشاركات المعتمدة فقط، والميديا باير ومنسق المحتوى يشوفون اللي نزل فقط.
-- 2) دالة infl_lookup: تقول للموظف إن الحساب مسجّل عند زميله (الاسم فقط، بدون سعر ولا جوال).
-- 3) عمود شركة الشحن (ورقم التتبع يصير «رقم البوليصة» في الواجهة، نفس العمود).
-- يُشغَّل مرة وحدة بعد 006، وقبل نشر تحديث الواجهة. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

alter table public.deals add column if not exists ship_company text default '';

-- ============ هل الحساب مسجّل عند أحد؟ (بدون كشف بياناته) ============
create or replace function public.infl_lookup(p_handle text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not public.is_member() then null else (
    select jsonb_build_object('id', i.id, 'name', i.name, 'owner_name', coalesce(m.name, ''), 'mine', i.nominated_by is not distinct from auth.uid())
    from influencers i left join members m on m.id = i.nominated_by
    where (coalesce(p_handle, '') <> '' and lower(i.handle) = lower(p_handle))
       or (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 9
           and right(regexp_replace(i.phone, '\D', '', 'g'), 9) = right(regexp_replace(p_phone, '\D', '', 'g'), 9))
    order by i.created_at limit 1) end
$$;
revoke all on function public.infl_lookup(text, text) from public;
grant execute on function public.infl_lookup(text, text) to authenticated;

-- ============ المؤثرين: صاحب الترشيح + المعتمد + الأدمن ============
drop policy if exists i_sel on public.influencers;
drop policy if exists i_ins on public.influencers;
drop policy if exists i_upd on public.influencers;
create policy i_sel on public.influencers for select using (
  public.has_role('approver') or nominated_by = auth.uid()
  or exists (select 1 from public.deals d where d.influencer_id = influencers.id and d.member_id = auth.uid()));
create policy i_ins on public.influencers for insert with check (
  public.is_member() and (nominated_by = auth.uid() or public.has_role('approver')));
create policy i_upd on public.influencers for update
  using (public.has_role('approver') or nominated_by = auth.uid())
  with check (public.has_role('approver') or nominated_by = auth.uid());

-- ============ المشاركات: صاحبها + المعتمد + الأدمن، وكل دور يشوف مرحلته ============
drop policy if exists d_sel on public.deals;
drop policy if exists d_ins on public.deals;
drop policy if exists d_upd on public.deals;
create policy d_sel on public.deals for select using (
  public.has_role('approver') or member_id = auth.uid()
  or (approval = 'approved' and public.has_role('shipper'))
  or (approval = 'approved' and (tt_at is not null or ig_at is not null or sn_at is not null or posted_at is not null)
      and (public.has_role('media') or public.has_role('snap'))));
create policy d_ins on public.deals for insert with check (
  public.is_member() and (member_id = auth.uid() or public.has_role('approver')));
create policy d_upd on public.deals for update
  using (
    public.has_role('approver') or member_id = auth.uid()
    or (approval = 'approved' and public.has_role('shipper'))
    or (approval = 'approved' and (tt_at is not null or ig_at is not null or sn_at is not null or posted_at is not null)
        and (public.has_role('media') or public.has_role('snap'))))
  with check (public.is_member());
