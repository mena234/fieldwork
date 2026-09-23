-- Fieldwork MVP. Run once with the Supabase SQL editor or `supabase db push`.
create table public.projects (
 id uuid primary key default gen_random_uuid(), name text not null, region text not null,
 sites text[] not null default '{}', gps_threshold integer not null default 20 check(gps_threshold between 1 and 500)
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 user_id uuid not null references auth.users(id), role text not null check(role in ('surveyor','supervisor','admin')),
 unique(project_id,user_id)
);
create or replace function public.project_role(p_project uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.memberships where project_id=p_project and user_id=auth.uid();
$$;
revoke all on function public.project_role(uuid) from public;
grant execute on function public.project_role(uuid) to authenticated;
create table public.templates (
 id uuid primary key, project_id uuid not null references public.projects(id), stage text not null check(stage in ('baseline','consent','boundary','implementation','monitoring')),
 version integer not null check(version>0), data jsonb not null, published_at timestamptz not null default now(),
 unique(project_id,stage,version), unique(id,project_id)
);
create table public.farmers (
 id uuid primary key, project_id uuid not null references public.projects(id), created_by uuid not null references auth.users(id),
 created_at timestamptz not null, updated_at timestamptz not null default now(), revision integer not null check(revision>0), data jsonb not null,
 unique(id,project_id)
);
create table public.submissions (
 id uuid primary key, project_id uuid not null references public.projects(id), farmer_id uuid not null,
 template_id uuid not null, template_version integer not null, stage text not null,
 status text not null check(status in ('draft','submitted','approved','needs_changes')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null, updated_at timestamptz not null default now(),
 revision integer not null check(revision>0), data jsonb not null,
 foreign key(farmer_id,project_id) references public.farmers(id,project_id),
 foreign key(template_id,project_id) references public.templates(id,project_id), unique(id,project_id)
);
create table public.media (
 id uuid primary key, project_id uuid not null, submission_id uuid not null,
 created_by uuid not null references auth.users(id), created_at timestamptz not null, updated_at timestamptz not null default now(),
 revision integer not null check(revision>0), data jsonb not null,
 foreign key(submission_id,project_id) references public.submissions(id,project_id)
);
create table public.mutation_receipts (
 id uuid primary key, actor uuid not null references auth.users(id), kind text not null, entity_id uuid not null, result jsonb not null, created_at timestamptz default now()
);
create index memberships_user on public.memberships(user_id);
create index farmers_project on public.farmers(project_id);
create index submissions_project_status on public.submissions(project_id,status);
create index submissions_farmer on public.submissions(farmer_id);
create index media_project on public.media(project_id);
alter table public.projects enable row level security;
alter table public.memberships enable row level security;
alter table public.templates enable row level security;
alter table public.farmers enable row level security;
alter table public.submissions enable row level security;
alter table public.media enable row level security;
alter table public.mutation_receipts enable row level security;
create policy projects_member_read on public.projects for select to authenticated using(public.project_role(id) is not null);
create policy memberships_member_read on public.memberships for select to authenticated using(public.project_role(project_id) is not null);
create policy templates_member_read on public.templates for select to authenticated using(public.project_role(project_id) is not null);
create policy farmers_member_read on public.farmers for select to authenticated using(public.project_role(project_id) is not null);
create policy submissions_member_read on public.submissions for select to authenticated using(public.project_role(project_id) is not null);
create policy media_member_read on public.media for select to authenticated using(public.project_role(project_id) is not null);
-- The browser receives SELECT only. All mutations go through checked RPCs below;
-- no direct INSERT/UPDATE/DELETE RLS policies exist, including for privileged UI roles.
revoke all on public.projects,public.memberships,public.templates,public.farmers,public.submissions,public.media,public.mutation_receipts from anon,authenticated;
grant select on public.projects,public.memberships,public.templates,public.farmers,public.submissions,public.media to authenticated;

create function public.record_json(row_data jsonb) returns jsonb language sql immutable as $$
 select coalesce(row_data->'data','{}'::jsonb) || (row_data-'data');
$$;

create function public.validate_template(t jsonb) returns void language plpgsql set search_path='' as $$
declare f jsonb; o jsonb; ids text[]='{}';
begin
 if t->>'stage' not in ('baseline','consent','boundary','implementation','monitoring') or coalesce((t->>'version')::integer,0)<1
 or coalesce(t#>>'{name,en}','')='' or coalesce(t#>>'{name,hi}','')='' or jsonb_typeof(t->'fields') is distinct from 'array'
 then raise exception 'Invalid template header'; end if;
 if jsonb_array_length(t->'fields') not between 1 and 50 then raise exception 'Use 1–50 fields'; end if;
 for f in select value from jsonb_array_elements(t->'fields') loop
  if coalesce(f->>'id','') !~ '^[a-z][a-z0-9_]{0,49}$' or f->>'id'=any(ids) or f->>'type' not in ('text','number','date','select','multiselect','boolean','gps','photo')
  or coalesce(f#>>'{label,en}','')='' or coalesce(f#>>'{label,hi}','')='' or coalesce(f#>>'{section,en}','')='' or coalesce(f#>>'{section,hi}','')=''
  then raise exception 'Invalid bilingual field'; end if;
  if f ? 'visible_when' and (not (f#>>'{visible_when,field}'=any(ids)) or jsonb_typeof(f#>'{visible_when,equals}') not in ('string','boolean')) then raise exception 'Condition must reference an earlier field'; end if;
  ids=array_append(ids,f->>'id');
  if f->>'type' in ('select','multiselect') then
   if jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options')=0 then raise exception 'Select options required'; end if;
   for o in select value from jsonb_array_elements(f->'options') loop
    if coalesce(o->>'value','')='' or coalesce(o#>>'{label,en}','')='' or coalesce(o#>>'{label,hi}','')='' then raise exception 'Invalid option'; end if;
   end loop;
   if (select count(*) <> count(distinct value->>'value') from jsonb_array_elements(f->'options')) then raise exception 'Duplicate options'; end if;
  end if;
  if f ? 'min' and f ? 'max' and (f->>'min')::numeric>(f->>'max')::numeric then raise exception 'Invalid number range'; end if;
 end loop;
 if t->>'stage'='consent' and (coalesce(t#>>'{consent_statement,en}','')='' or coalesce(t#>>'{consent_statement,hi}','')='') then raise exception 'Consent statement required'; end if;
end;
$$;
create function public.validate_gps(g jsonb,p_project uuid) returns void language plpgsql set search_path='' as $$
declare threshold integer;
begin
 if g is null or g='null'::jsonb then return; end if;
 if jsonb_typeof(g) is distinct from 'object' or not(g ?& array['latitude','longitude','accuracy','timestamp'])
 or jsonb_typeof(g->'latitude') is distinct from 'number' or jsonb_typeof(g->'longitude') is distinct from 'number'
 or jsonb_typeof(g->'accuracy') is distinct from 'number' or coalesce(g->>'timestamp','')=''
 then raise exception 'GPS needs numeric coordinates, accuracy, and a timestamp'; end if;
 if (g->>'latitude')::numeric not between -90 and 90 or (g->>'longitude')::numeric not between -180 and 180 or (g->>'accuracy')::numeric<0 then raise exception 'Invalid GPS range'; end if;
 perform (g->>'timestamp')::timestamptz;
 select gps_threshold into threshold from public.projects where id=p_project;
 if (g->>'accuracy')::numeric>threshold and coalesce(trim(g->>'override_reason'),'')='' then raise exception 'Poor GPS accuracy requires an override reason'; end if;
end;
$$;
create function public.validate_submission(t jsonb,r jsonb) returns void language plpgsql set search_path='' as $$
declare f jsonb; v jsonb; answer jsonb; poly jsonb;
begin
 if jsonb_typeof(r->'answers') is distinct from 'object' or jsonb_typeof(r->'media_ids') is distinct from 'array' or jsonb_array_length(r->'media_ids')>3 then raise exception 'Invalid answers or photo count'; end if;
 for f in select value from jsonb_array_elements(t->'fields') loop
  if f ? 'visible_when' and (r->'answers'->(f#>>'{visible_when,field}')) is distinct from (f#>'{visible_when,equals}') then continue; end if;
  v=r->'answers'->(f->>'id');
  if f->>'type'='photo' then
   if (f->>'required')::boolean is true and jsonb_array_length(r->'media_ids')=0 then raise exception 'Photo required: %',f->>'id'; end if;continue;
  end if;
  if v is null or v in ('null'::jsonb,'""'::jsonb,'[]'::jsonb) then
   if (f->>'required')::boolean is true then raise exception 'Required field: %',f->>'id'; end if;continue;
  end if;
  if f->>'type'='number' and (jsonb_typeof(v)<>'number' or (f ? 'min' and (v#>>'{}')::numeric<(f->>'min')::numeric) or (f ? 'max' and (v#>>'{}')::numeric>(f->>'max')::numeric)) then raise exception 'Invalid number: %',f->>'id'; end if;
  if f->>'type'='boolean' and jsonb_typeof(v)<>'boolean' then raise exception 'Invalid yes/no'; end if;
  if f->>'type'='text' and (jsonb_typeof(v)<>'string' or length(v#>>'{}')>5000) then raise exception 'Invalid text'; end if;
  if f->>'type'='date' then
   if v#>>'{}' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;perform (v#>>'{}')::date;
  end if;
  if f->>'type'='select' and not exists(select 1 from jsonb_array_elements(f->'options') o where o->'value'=v) then raise exception 'Invalid selection'; end if;
  if f->>'type'='multiselect' then
   if jsonb_typeof(v)<>'array' then raise exception 'Invalid multiselect'; end if;
   for answer in select value from jsonb_array_elements(v) loop
    if not exists(select 1 from jsonb_array_elements(f->'options') o where o->'value'=answer) then raise exception 'Invalid selection'; end if;
   end loop;
  end if;
  if f->>'type'='gps' and (jsonb_typeof(v)<>'object' or not(v ?& array['latitude','longitude','accuracy','timestamp']) or (v->>'latitude')::numeric not between -90 and 90 or (v->>'longitude')::numeric not between -180 and 180 or (v->>'accuracy')::numeric<0) then raise exception 'Invalid GPS'; end if;
  if f->>'type'='gps' then perform public.validate_gps(v,(t->>'project_id')::uuid); end if;
 end loop;
 if r->>'stage'='boundary' then
  poly=r->'boundary';
  if poly->>'type' is distinct from 'Polygon' or jsonb_array_length(poly->'coordinates')<>1 or jsonb_array_length(poly#>'{coordinates,0}') not between 4 and 501 then raise exception 'A simple closed polygon is required'; end if;
  if (poly#>'{coordinates,0,0}')<>(poly->'coordinates'->0->-1) then raise exception 'Polygon must be closed'; end if;
  for v in select value from jsonb_array_elements(poly#>'{coordinates,0}') loop
   if jsonb_array_length(v)<>2 or (v->>0)::numeric not between -180 and 180 or (v->>1)::numeric not between -90 and 90 then raise exception 'Invalid polygon coordinate'; end if;
  end loop;
  for v in select value from jsonb_array_elements(coalesce(r->'vertex_gps','[]'::jsonb)) loop
   perform public.validate_gps(v,(t->>'project_id')::uuid);
  end loop;
 end if;
end;
$$;

create function public.fieldwork_write(p_kind text,p_record jsonb,p_expected integer,p_mutation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor uuid=auth.uid(); pid uuid=(p_record->>'project_id')::uuid; eid uuid=(p_record->>'id')::uuid;
 role_name text; old_row jsonb; result jsonb; receipt public.mutation_receipts; tbl text; data jsonb; tpl public.templates;
 rev integer; created timestamptz; parent public.submissions;
begin
 if actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 role_name=public.project_role(pid);
 if role_name not in ('surveyor','admin') or role_name is null then raise exception 'Collection requires project surveyor or admin membership' using errcode='42501'; end if;
 if p_kind not in ('farmer','submission','media') then raise exception 'Invalid record kind'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||eid::text,0));
 select * into receipt from public.mutation_receipts where id=p_mutation;
 if found then
  if receipt.actor<>actor or receipt.kind<>p_kind or receipt.entity_id<>eid or receipt.result#>>'{record,project_id}' is distinct from pid::text then raise exception 'Mutation identity mismatch'; end if;
  return receipt.result;
 end if;
 tbl=case p_kind when 'farmer' then 'farmers' when 'submission' then 'submissions' else 'media' end;
 execute format('select to_jsonb(r) from public.%I r where id=$1 for update',tbl) into old_row using eid;
 if old_row is not null and (old_row->>'project_id')::uuid<>pid then raise exception 'Record belongs to another project' using errcode='42501'; end if;
 if old_row is not null and (old_row->>'created_by')::uuid<>actor and role_name<>'admin' then raise exception 'Only the collector can edit this record' using errcode='42501'; end if;
 if coalesce((old_row->>'revision')::integer,0)<>p_expected then return jsonb_build_object('conflict',true,'server',public.record_json(old_row)); end if;
 rev=p_expected+1; created=coalesce((old_row->>'created_at')::timestamptz,(p_record->>'created_at')::timestamptz,now());
 data=p_record-array['id','project_id','created_by','created_at','updated_at','revision','sync_status','blob','uploaded'];
 if p_kind='farmer' then
  if coalesce(trim(data->>'name'),'')='' or coalesce(trim(data->>'ref'),'')='' or coalesce(trim(data->>'village'),'')='' or not exists(select 1 from public.projects where id=pid and data->>'site'=any(sites)) then raise exception 'Name, reference, village, and valid site are required'; end if;
  if data->'gps' is not null and data->'gps'<>'null'::jsonb and ((data#>>'{gps,latitude}')::numeric not between -90 and 90 or (data#>>'{gps,longitude}')::numeric not between -180 and 180 or (data#>>'{gps,accuracy}')::numeric<0) then raise exception 'Invalid farmer GPS'; end if;
  perform public.validate_gps(data->'gps',pid);
  insert into public.farmers values(eid,pid,coalesce((old_row->>'created_by')::uuid,actor),created,now(),rev,data)
   on conflict(id) do update set updated_at=now(),revision=excluded.revision,data=excluded.data;
 elsif p_kind='submission' then
  if old_row is not null and old_row->>'status' not in ('draft','needs_changes') then raise exception 'Submitted visits are immutable. Create a new visit.'; end if;
  if data->>'status' not in ('draft','submitted') then raise exception 'Surveyors cannot approve or return submissions' using errcode='42501'; end if;
  if old_row is not null and (old_row->>'template_id' is distinct from data->>'template_id' or old_row->>'farmer_id' is distinct from data->>'farmer_id') then raise exception 'Farmer and template version are immutable'; end if;
  select * into tpl from public.templates where id=(data->>'template_id')::uuid and project_id=pid;
  if not found or tpl.version<>(data->>'template_version')::integer or tpl.stage<>data->>'stage' then raise exception 'Template/version mismatch'; end if;
  if data->>'status'='submitted' then perform public.validate_submission(tpl.data,data); end if;
  data=jsonb_set(data,'{reviews}',coalesce(old_row#>'{data,reviews}','[]'::jsonb));
  if data->>'status'='draft' then data=jsonb_set(data,'{submitted_at}','null'::jsonb); else data=jsonb_set(data,'{submitted_at}',to_jsonb(coalesce((data->>'submitted_at')::timestamptz,now()))); end if;
  insert into public.submissions values(eid,pid,(data->>'farmer_id')::uuid,tpl.id,tpl.version,tpl.stage,data->>'status',coalesce((old_row->>'created_by')::uuid,actor),created,now(),rev,data)
   on conflict(id) do update set status=excluded.status,updated_at=now(),revision=excluded.revision,data=excluded.data;
 else
  select * into parent from public.submissions where id=(data->>'submission_id')::uuid and project_id=pid;
  if not found or parent.created_by<>actor or not(parent.data->'media_ids' ? eid::text) then raise exception 'Photo must belong to your submission'; end if;
  if old_row is not null then raise exception 'Uploaded media is immutable'; end if;
  if data->>'path' is distinct from pid::text||'/'||parent.id::text||'/'||eid::text||'.jpg' then raise exception 'Invalid storage path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='field-photos' and name=data->>'path') then raise exception 'Upload the photo before confirming its metadata'; end if;
  if not exists(select 1 from public.templates t, jsonb_array_elements(t.data->'fields') f where t.id=parent.template_id and f->>'id'=data->>'field_id' and f->>'type'='photo') then raise exception 'Invalid photo field'; end if;
  insert into public.media values(eid,pid,parent.id,actor,created,now(),rev,data);
 end if;
 execute format('select public.record_json(to_jsonb(r)) from public.%I r where id=$1',tbl) into result using eid;
 result=jsonb_build_object('record',result);
 insert into public.mutation_receipts(id,actor,kind,entity_id,result) values(p_mutation,actor,p_kind,eid,result);
 return result;
end;
$$;
create function public.fieldwork_review(p_id uuid,p_expected integer,p_status text,p_comment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.submissions; r jsonb; photo text; f jsonb; t public.templates;
begin
 select * into s from public.submissions where id=p_id for update;
 if not found or coalesce(public.project_role(s.project_id),'') not in ('supervisor','admin') then raise exception 'Supervisor membership required' using errcode='42501'; end if;
 if p_status not in ('approved','needs_changes') or length(trim(coalesce(p_comment,'')))=0 or length(p_comment)>5000 then raise exception 'Choose an outcome and add a review comment'; end if;
 if s.revision<>p_expected then raise exception 'This submission changed. Refresh before reviewing.'; end if;
 if s.status<>'submitted' then raise exception 'Only submitted records may be reviewed'; end if;
 for photo in select jsonb_array_elements_text(s.data->'media_ids') loop
  if not exists(select 1 from public.media where id=photo::uuid and submission_id=p_id) then raise exception 'Wait for all photos to finish uploading'; end if;
 end loop;
 select * into t from public.templates where id=s.template_id;
 for f in select value from jsonb_array_elements(t.data->'fields') loop
  if f->>'type'='photo' and (f->>'required')::boolean is true and not exists(select 1 from public.media where submission_id=p_id and data->>'field_id'=f->>'id') then raise exception 'Required photo field is missing'; end if;
 end loop;
 r=jsonb_build_object('status',p_status,'comment',p_comment,'reviewer',auth.uid(),'at',now());
 update public.submissions set status=p_status,revision=revision+1,updated_at=now(),data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(p_status)),'{reviews}',coalesce(data->'reviews','[]'::jsonb)||jsonb_build_array(r)) where id=p_id returning public.record_json(to_jsonb(submissions.*)) into r;
 return r;
end;
$$;
create function public.fieldwork_publish_template(p_template jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid=(p_template->>'project_id')::uuid; t jsonb;
begin
 if public.project_role(pid) is distinct from 'admin' then raise exception 'Project admin membership required' using errcode='42501'; end if;
 perform public.validate_template(p_template);
 t=jsonb_set(jsonb_set(p_template,'{id}',to_jsonb(gen_random_uuid())),'{published_at}',to_jsonb(now()));
 insert into public.templates(id,project_id,stage,version,data) values((t->>'id')::uuid,pid,t->>'stage',(t->>'version')::integer,t);
 return t;
end;
$$;
create function public.fieldwork_membership(p_project uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.project_role(p_project) is distinct from 'admin' then raise exception 'Project admin membership required' using errcode='42501'; end if;
 if p_user=auth.uid() then raise exception 'Ask another project admin to change your own membership'; end if;
 if p_role not in ('surveyor','supervisor','admin') then raise exception 'Invalid role'; end if;
 insert into public.memberships(project_id,user_id,role) values(p_project,p_user,p_role) on conflict(project_id,user_id) do update set role=excluded.role;
end;
$$;
revoke all on function public.fieldwork_write(text,jsonb,integer,uuid),public.fieldwork_review(uuid,integer,text,text),public.fieldwork_publish_template(jsonb),public.fieldwork_membership(uuid,uuid,text) from public,anon;
grant execute on function public.fieldwork_write(text,jsonb,integer,uuid),public.fieldwork_review(uuid,integer,text,text),public.fieldwork_publish_template(jsonb),public.fieldwork_membership(uuid,uuid,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('field-photos','field-photos',false,5242880,array['image/jpeg']) on conflict(id) do nothing;
create policy field_photos_read on storage.objects for select to authenticated using(
 bucket_id='field-photos' and exists(select 1 from public.submissions s where s.project_id::text=(storage.foldername(name))[1] and s.id::text=(storage.foldername(name))[2] and public.project_role(s.project_id) is not null)
);
create policy field_photos_insert on storage.objects for insert to authenticated with check(
 bucket_id='field-photos' and exists(select 1 from public.submissions s where s.project_id::text=(storage.foldername(name))[1]
 and s.id::text=(storage.foldername(name))[2] and s.created_by=auth.uid() and s.status in ('draft','submitted','needs_changes')
 and public.project_role(s.project_id) in ('surveyor','admin')
 and exists(select 1 from jsonb_array_elements_text(s.data->'media_ids') mid where name=s.project_id::text||'/'||s.id::text||'/'||mid||'.jpg'))
);
-- No UPDATE/DELETE storage policy: uploaded photos cannot be silently replaced.
