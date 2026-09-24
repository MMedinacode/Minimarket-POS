-- =====================================================================
-- Caja Minimarket · base de datos en Supabase
--
-- Cómo usarlo: Supabase → tu proyecto → SQL Editor → New query →
-- pegar TODO este archivo → Run. Se puede ejecutar varias veces sin
-- problema (no borra datos).
--
-- Idea central: los dispositivos no envían "el stock quedó en 34", sino
-- OPERACIONES ("se vendieron 2 Coca-Cola"). El servidor las aplica una por
-- una sobre el stock real, así dos cajas vendiendo a la vez nunca se pisan.
-- Cada operación trae un id único: si llega repetida (se cortó internet y el
-- celular reintentó), se ignora.
-- =====================================================================

-- ---------- Tablas ----------------------------------------------------
-- Cada cuenta (auth.users) es un negocio. owner_id separa los datos.

create table if not exists public.stores (
  owner_id   uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  sale_seq   integer not null default 0,           -- correlativo de ventas
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.products (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  barcode    text not null default '',
  name       text not null,
  category   text not null default 'Otros',
  cost       numeric not null default 0,
  price      numeric not null default 0,
  stock      numeric not null default 0,
  unit       text not null default 'un' check (unit in ('un', 'kg')),
  rotation   text not null default 'Media' check (rotation in ('Alta', 'Media', 'Baja')),
  min_stock  numeric,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted    boolean not null default false,        -- borrado "suave": los demás dispositivos se enteran
  primary key (owner_id, id)
);

create table if not exists public.sales (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  number     integer not null,
  date       timestamptz not null,
  items      jsonb not null,
  total      numeric not null,
  cost       numeric not null,
  payment    text not null,
  received   numeric,
  change     numeric,
  voided     boolean not null default false,
  voided_at  timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  deleted    boolean not null default false,
  primary key (owner_id, id)
);

create table if not exists public.expenses (
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id             text not null,
  date           timestamptz not null,
  description    text not null,
  category       text not null,
  amount         numeric not null,
  paid_from_cash boolean not null default true,
  updated_at     timestamptz not null default clock_timestamp(),
  deleted        boolean not null default false,
  primary key (owner_id, id)
);

-- Registro de operaciones ya aplicadas (para ignorar reintentos)
create table if not exists public.applied_ops (
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  op_id      text not null,
  applied_at timestamptz not null default clock_timestamp(),
  error      text,
  primary key (owner_id, op_id)
);

create index if not exists products_sync_idx on public.products (owner_id, updated_at);
create index if not exists sales_sync_idx on public.sales (owner_id, updated_at);
create index if not exists expenses_sync_idx on public.expenses (owner_id, updated_at);

-- ---------- updated_at automático ------------------------------------
-- La hora la pone SIEMPRE el servidor: los relojes de los celulares no importan.

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['stores', 'products', 'sales', 'expenses'] loop
    execute format('drop trigger if exists touch_updated_at on public.%I', t);
    execute format(
      'create trigger touch_updated_at before insert or update on public.%I
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------- Seguridad: cada cuenta ve solo lo suyo (RLS) --------------

do $$
declare t text;
begin
  foreach t in array array['stores', 'products', 'sales', 'expenses', 'applied_ops'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "solo_el_dueno" on public.%I', t);
    execute format(
      'create policy "solo_el_dueno" on public.%I for all to authenticated
       using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------- Funciones auxiliares -------------------------------------

-- Redondeo igual al de la app: unidades enteras, kilos con 3 decimales
create or replace function public.round_qty(q numeric, unit text) returns numeric
language sql immutable as $$
  select round(q, case when unit = 'kg' then 3 else 0 end)
$$;

-- Crea o actualiza un producto desde JSON (formato de la app)
create or replace function public.upsert_product(uid uuid, p jsonb, with_stock boolean) returns void
language plpgsql set search_path = public as $$
begin
  insert into products as t (owner_id, id, barcode, name, category, cost, price, stock, unit, rotation, min_stock, created_at, deleted)
  values (
    uid,
    p->>'id',
    coalesce(p->>'barcode', ''),
    p->>'name',
    coalesce(nullif(p->>'category', ''), 'Otros'),
    coalesce((p->>'cost')::numeric, 0),
    coalesce((p->>'price')::numeric, 0),
    coalesce((p->>'stock')::numeric, 0),
    coalesce(p->>'unit', 'un'),
    coalesce(p->>'rotation', 'Media'),
    (p->>'minStock')::numeric,
    coalesce((p->>'createdAt')::timestamptz, clock_timestamp()),
    false
  )
  on conflict (owner_id, id) do update set
    barcode   = excluded.barcode,
    name      = excluded.name,
    category  = excluded.category,
    cost      = excluded.cost,
    price     = excluded.price,
    stock     = case when with_stock then excluded.stock else t.stock end,
    unit      = excluded.unit,
    rotation  = excluded.rotation,
    min_stock = excluded.min_stock,
    deleted   = false;
end $$;

-- ---------- apply_ops: aplica las operaciones que manda un dispositivo --

create or replace function public.apply_ops(ops jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid       uuid := auth.uid();
  op        jsonb;
  kind      text;
  p         jsonb;
  item      jsonb;
  allow_neg boolean;
  seq       integer;
  q         numeric;
  errors    jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Debes iniciar sesión';
  end if;
  insert into stores (owner_id) values (uid) on conflict (owner_id) do nothing;

  for op in select value from jsonb_array_elements(ops) loop
    -- Idempotencia: si esta operación ya se aplicó, se salta
    insert into applied_ops (owner_id, op_id) values (uid, op->>'opId') on conflict do nothing;
    if not found then
      continue;
    end if;

    kind := op->>'type';
    begin
      select coalesce((settings->>'allowNegativeStock')::boolean, false) into allow_neg
      from stores where owner_id = uid;

      case kind
        when 'addProduct' then
          perform upsert_product(uid, op->'product', true);

        when 'updateProduct' then
          p := op->'patch';
          -- Solo cambia los campos que vienen. El stock solo si el usuario lo editó.
          update products set
            barcode   = case when p ? 'barcode'  then p->>'barcode' else barcode end,
            name      = case when p ? 'name'     then p->>'name' else name end,
            category  = case when p ? 'category' then p->>'category' else category end,
            cost      = case when p ? 'cost'     then (p->>'cost')::numeric else cost end,
            price     = case when p ? 'price'    then (p->>'price')::numeric else price end,
            stock     = case when p ? 'stock'    then (p->>'stock')::numeric else stock end,
            unit      = case when p ? 'unit'     then p->>'unit' else unit end,
            rotation  = case when p ? 'rotation' then p->>'rotation' else rotation end,
            min_stock = case when p ? 'minStock' then (p->>'minStock')::numeric else min_stock end
          where owner_id = uid and id = op->>'id';

        when 'deleteProduct' then
          update products set deleted = true where owner_id = uid and id = op->>'id';

        when 'adjustStock' then
          q := (op->>'qty')::numeric;
          update products set stock = round_qty(greatest(0,
            case op->>'mode'
              when 'set' then q
              when 'add' then stock + q
              else stock - q
            end), unit)
          where owner_id = uid and id = op->>'id';

        when 'upsertProducts' then
          for p in select value from jsonb_array_elements(op->'products') loop
            perform upsert_product(uid, p, true);
          end loop;

        when 'setProducts' then
          for p in select value from jsonb_array_elements(op->'products') loop
            perform upsert_product(uid, p, true);
          end loop;
          update products set deleted = true
          where owner_id = uid and not deleted
            and id not in (select value->>'id' from jsonb_array_elements(op->'products'));

        when 'registerSale' then
          p := op->'sale';
          update stores set sale_seq = sale_seq + 1 where owner_id = uid returning sale_seq into seq;
          insert into sales (owner_id, id, number, date, items, total, cost, payment, received, change, voided)
          values (uid, p->>'id', seq, (p->>'date')::timestamptz, p->'items', (p->>'total')::numeric,
                  (p->>'cost')::numeric, p->>'payment', (p->>'received')::numeric, (p->>'change')::numeric, false)
          on conflict (owner_id, id) do nothing;
          if found then
            -- EL punto clave: se RESTA lo vendido al stock que hay en el servidor
            for item in select value from jsonb_array_elements(p->'items') loop
              q := (item->>'qty')::numeric;
              update products set stock = case
                  when allow_neg then round_qty(stock - q, unit)
                  else greatest(0, round_qty(stock - q, unit))
                end
              where owner_id = uid and id = item->>'productId';
            end loop;
          end if;

        when 'voidSale' then
          update sales set voided = true, voided_at = clock_timestamp()
          where owner_id = uid and id = op->>'id' and not voided
          returning items into p;
          if found then
            for item in select value from jsonb_array_elements(p) loop
              update products set stock = round_qty(stock + (item->>'qty')::numeric, unit)
              where owner_id = uid and id = item->>'productId';
            end loop;
          end if;

        when 'addExpense' then
          p := op->'expense';
          insert into expenses (owner_id, id, date, description, category, amount, paid_from_cash)
          values (uid, p->>'id', (p->>'date')::timestamptz, p->>'description', p->>'category',
                  (p->>'amount')::numeric, coalesce((p->>'paidFromCash')::boolean, true))
          on conflict (owner_id, id) do nothing;

        when 'deleteExpense' then
          update expenses set deleted = true where owner_id = uid and id = op->>'id';

        when 'updateSettings' then
          update stores set settings = settings || (op->'patch') where owner_id = uid;

        when 'endDemo' then
          update sales set deleted = true where owner_id = uid and not deleted;
          update expenses set deleted = true where owner_id = uid and not deleted;
          if not coalesce((op->>'keepProducts')::boolean, true) then
            update products set deleted = true where owner_id = uid and not deleted;
          end if;

        when 'wipeAll' then
          update products set deleted = true where owner_id = uid and not deleted;
          update sales set deleted = true where owner_id = uid and not deleted;
          update expenses set deleted = true where owner_id = uid and not deleted;

        when 'importAll' then
          -- Subir los datos que había en un dispositivo antes de crear la cuenta
          for p in select value from jsonb_array_elements(op->'products') loop
            perform upsert_product(uid, p, true);
          end loop;
          insert into sales (owner_id, id, number, date, items, total, cost, payment, received, change, voided, voided_at)
          select uid, s->>'id', (s->>'number')::integer, (s->>'date')::timestamptz, s->'items',
                 (s->>'total')::numeric, (s->>'cost')::numeric, s->>'payment', (s->>'received')::numeric,
                 (s->>'change')::numeric, coalesce((s->>'voided')::boolean, false), (s->>'voidedAt')::timestamptz
          from jsonb_array_elements(op->'sales') s
          on conflict (owner_id, id) do nothing;
          insert into expenses (owner_id, id, date, description, category, amount, paid_from_cash)
          select uid, e->>'id', (e->>'date')::timestamptz, e->>'description', e->>'category',
                 (e->>'amount')::numeric, coalesce((e->>'paidFromCash')::boolean, true)
          from jsonb_array_elements(op->'expenses') e
          on conflict (owner_id, id) do nothing;
          update stores set
            settings = settings || coalesce(op->'settings', '{}'::jsonb),
            sale_seq = greatest(sale_seq, coalesce((select max(number) from sales where owner_id = uid), 0))
          where owner_id = uid;

        else
          raise exception 'Operación desconocida: %', kind;
      end case;
    exception when others then
      -- Una operación con error no bloquea a las siguientes: se anota y se sigue
      update applied_ops set error = sqlerrm where owner_id = uid and op_id = op->>'opId';
      errors := errors || jsonb_build_object('opId', op->>'opId', 'type', kind, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('errors', errors);
end $$;

-- ---------- pull_changes: lo que cambió desde la última vez ----------
-- cursors = {"products": "<fecha>", "sales": "...", "expenses": "..."}
-- Devuelve máximo max_rows filas por tabla; si llegan justo max_rows, hay más.

create or replace function public.pull_changes(cursors jsonb default '{}'::jsonb, overlap_seconds integer default 5, max_rows integer default 1000)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  since_p timestamptz := coalesce((cursors->>'products')::timestamptz, '-infinity') - make_interval(secs => overlap_seconds);
  since_s timestamptz := coalesce((cursors->>'sales')::timestamptz, '-infinity') - make_interval(secs => overlap_seconds);
  since_e timestamptz := coalesce((cursors->>'expenses')::timestamptz, '-infinity') - make_interval(secs => overlap_seconds);
begin
  if uid is null then
    raise exception 'Debes iniciar sesión';
  end if;
  return jsonb_build_object(
    'store', (select to_jsonb(s) from stores s where s.owner_id = uid),
    'products', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.updated_at) from (
        select * from products where owner_id = uid and updated_at > since_p order by updated_at limit max_rows
      ) t), '[]'::jsonb),
    'sales', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.updated_at) from (
        select * from sales where owner_id = uid and updated_at > since_s order by updated_at limit max_rows
      ) t), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.updated_at) from (
        select * from expenses where owner_id = uid and updated_at > since_e order by updated_at limit max_rows
      ) t), '[]'::jsonb)
  );
end $$;

-- Por defecto Postgres deja ejecutar funciones a todos (public): solo usuarios con sesión
revoke execute on function public.apply_ops(jsonb) from public, anon;
revoke execute on function public.pull_changes(jsonb, integer, integer) from public, anon;
revoke execute on function public.upsert_product(uuid, jsonb, boolean) from public, anon;
grant execute on function public.apply_ops(jsonb) to authenticated;
grant execute on function public.pull_changes(jsonb, integer, integer) to authenticated;
grant execute on function public.upsert_product(uuid, jsonb, boolean) to authenticated;

-- ---------- Tiempo real ----------------------------------------------
-- Avisa a los demás dispositivos apenas cambia algo.

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['stores', 'products', 'sales', 'expenses'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
