-- RAG-sovelluksen tietokantaskeema Supabaseen
-- Aja tama Supabase SQL Editorissa

-- 1. Ota pgvector-laajennus kayttoon
create extension if not exists vector with schema extensions;

-- 2. Kansiot (tiedostosetit)
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now()
);

alter table public.folders enable row level security;

create policy "Kayttaja nakee omat kansionsa"
  on public.folders for select
  using (auth.uid() = user_id);

create policy "Kayttaja luo omia kansioitaan"
  on public.folders for insert
  with check (auth.uid() = user_id);

create policy "Kayttaja poistaa omia kansioitaan"
  on public.folders for delete
  using (auth.uid() = user_id);

-- 3. Dokumentit
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.folders(id) on delete cascade not null,
  file_name text not null,
  file_type text not null, -- 'pdf', 'txt', 'md', 'docx'
  file_size integer,
  file_path text, -- Supabase Storage path
  chunk_count integer default 0,
  status text default 'pending', -- 'pending', 'processing', 'ready', 'error'
  error_message text,
  created_at timestamptz default now()
);

alter table public.documents enable row level security;

create policy "Kayttaja nakee omat dokumenttinsa"
  on public.documents for select
  using (
    folder_id in (
      select id from public.folders where user_id = auth.uid()
    )
  );

create policy "Kayttaja luo omia dokumenttejaan"
  on public.documents for insert
  with check (
    folder_id in (
      select id from public.folders where user_id = auth.uid()
    )
  );

create policy "Kayttaja poistaa omia dokumenttejaan"
  on public.documents for delete
  using (
    folder_id in (
      select id from public.folders where user_id = auth.uid()
    )
  );

-- 4. Dokumenttipalat (chunks) + vektoriembedding
create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade not null,
  content text not null,
  chunk_index integer not null,
  embedding vector(1536), -- OpenAI text-embedding-3-small dimensio
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.chunks enable row level security;

create policy "Kayttaja nakee omat chunkinsa"
  on public.chunks for select
  using (
    document_id in (
      select d.id from public.documents d
      join public.folders f on d.folder_id = f.id
      where f.user_id = auth.uid()
    )
  );

-- 5. HNSW-indeksi nopeaan vektorihakuun
create index on public.chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- 6. Chatit (yksi per kansio)
create table public.chats (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references public.folders(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(folder_id, user_id)
);

alter table public.chats enable row level security;

create policy "Kayttaja nakee omat chattinsa"
  on public.chats for select using (auth.uid() = user_id);

create policy "Kayttaja luo omia chattejaan"
  on public.chats for insert with check (auth.uid() = user_id);

-- 7. Viestit
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb default '[]', -- [{document_id, file_name, chunk_content, similarity}]
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

create policy "Kayttaja nakee omat viestinsa"
  on public.messages for select
  using (
    chat_id in (
      select id from public.chats where user_id = auth.uid()
    )
  );

create policy "Kayttaja luo omia viestejaan"
  on public.messages for insert
  with check (
    chat_id in (
      select id from public.chats where user_id = auth.uid()
    )
  );

-- 8. Vektorihakufunktio
create or replace function public.match_chunks(
  query_embedding vector(1536),
  target_folder_id uuid,
  match_count int default 5,
  match_threshold float default 0.7
)
returns table (
  id uuid,
  content text,
  document_id uuid,
  file_name text,
  chunk_index integer,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.content,
    c.document_id,
    d.file_name,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  join public.documents d on c.document_id = d.id
  where d.folder_id = target_folder_id
    and d.status = 'ready'
    and 1 - (c.embedding <=> query_embedding) > match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- 9. Storage bucket dokumenteille
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict do nothing;

create policy "Kayttaja lataa omiin kansioihinsa"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Kayttaja lukee omia tiedostojaan"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
