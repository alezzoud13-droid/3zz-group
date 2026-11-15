-- التحديث 9: خصوصية الطلبات (قرار عبدالمحسن 15 نوفمبر)
-- كل موظف يشوف الطلبات اللي هو طرف فيها فقط (طالب أو مطلوب منه).
-- عبدالمحسن ومتعب يشوفون كل الطلبات. والحماية هنا في قاعدة البيانات نفسها، مو في الواجهة.
-- يُشغَّل مرة وحدة بعد 008. آمن لإعادة التشغيل، ولا يحذف أي بيانات.

create or replace function public.req_visible(r_from uuid, r_to uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.has_role('approver') or r_from = auth.uid() or r_to = auth.uid()
$$;

drop policy if exists r_sel on public.requests;
create policy r_sel on public.requests for select using (public.req_visible(from_member, to_member));
drop policy if exists r_upd on public.requests;
create policy r_upd on public.requests for update
  using (public.req_visible(from_member, to_member)) with check (public.is_member());
drop policy if exists r_ins on public.requests;
create policy r_ins on public.requests for insert
  with check (public.is_member() and from_member = auth.uid());

drop policy if exists re_sel on public.request_events;
create policy re_sel on public.request_events for select using (
  exists (select 1 from public.requests q where q.id = request_id and public.req_visible(q.from_member, q.to_member)));
drop policy if exists re_ins on public.request_events;
create policy re_ins on public.request_events for insert with check (
  member_id = auth.uid()
  and exists (select 1 from public.requests q where q.id = request_id and public.req_visible(q.from_member, q.to_member)));
