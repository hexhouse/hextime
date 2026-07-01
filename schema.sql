-- ============================================================
-- hex time — paste this entire file into Supabase SQL editor
-- ============================================================

-- PROFILES (one per user, stores invoice info + role)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text,
  business_name text,
  address text,
  city_state_zip text,
  invoice_email text,
  phone text,
  tax_id text,
  payment_method text,
  payment_details text,
  display_name text,
  role text not null default 'contractor' check (role in ('contractor', 'admin')),
  restricted boolean default false,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "authenticated users can read all profiles"
  on public.profiles for select
  using (auth.uid() is not null);

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, invoice_email)
  values (
    new.id,
    new.raw_user_meta_data->>'name',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- TIME ENTRIES
create table public.time_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  description text not null,
  project text,
  duration_seconds integer not null,
  entry_date date not null,
  created_at timestamptz default now()
);
alter table public.time_entries enable row level security;

create policy "users can manage own entries"
  on public.time_entries for all
  using (auth.uid() = user_id);

create policy "authenticated users can read all entries"
  on public.time_entries for select
  using (
    auth.uid() = user_id
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND restricted = true
    )
  );


-- QUARTERLY RATES (admin-set, read by everyone)
create table public.quarterly_rates (
  id uuid default gen_random_uuid() primary key,
  year integer not null,
  quarter integer not null check (quarter between 1 and 4),
  rate numeric(10,2),
  unique(year, quarter),
  created_at timestamptz default now()
);
alter table public.quarterly_rates enable row level security;

create policy "authenticated users can read rates"
  on public.quarterly_rates for select
  to authenticated
  using (true);

create policy "admins can manage rates"
  on public.quarterly_rates for all
  using (exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ));
