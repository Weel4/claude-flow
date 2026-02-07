# Lovable-prompt: RAG-dokumenttihaku

Kopioi alla oleva prompt Lovableen uuden projektin luonnissa.

---

## Prompt Lovablelle

```
Rakenna suomenkielinen dokumenttihaku-sovellus jossa:

RAKENNE:
- Vasemmalla sivupalkki: lista kansioista (folders)
- Oikealla: valitun kansion chat-nakyma
- Ylaosa: kansion tiedostolista ja "Lisaa tiedosto" -nappi

TOIMINNOT:

1. KANSIOT
   - Kayttaja voi luoda, nimetaa ja poistaa kansioita
   - Jokainen kansio = oma tiedostosetti + oma chat
   - Sivupalkissa kansiot listana, aktiivinen korostettu

2. TIEDOSTOT
   - Kayttaja voi ladata tiedostoja kansioon (PDF, TXT, MD)
   - Tiedostot nakyy listana kansion ylareunassa
   - Jokaisen tiedoston kohdalla: nimi, koko, tila (kasittelyssa / valmis / virhe)
   - Latauksen jalkeen kutsu Edge Function "process-document" joka pilkkoo
     ja indeksoi tiedoston

3. CHAT
   - Jokaisella kansiolla oma chat-historia
   - Kayttaja kirjoittaa kysymyksen, kutsu Edge Function "chat"
   - Vastaus nakyy chatissa lahdeviitteiden kanssa
   - Lahdeviitteet nakyy pieninä tageina vastauksen alla:
     [tiedostonimi.pdf - 94%]
   - Chat-historia sailyy (messages-taulu)

4. AUTENTIKOINTI
   - Supabase Auth: sahkoposti + salasana
   - Kirjautumis- ja rekisterointisivu
   - Kaikki data kayttajakohtaista (RLS)

TEKNINEN:
- Supabase-integraatio (tietokanta + storage + edge functions + auth)
- Tailwind CSS, tumma teema
- Responsiivinen: mobiilissa sivupalkki piiloon hampurilaisvalikkoon
- Toast-ilmoitukset tiedoston kasittelyn tilasta

ALA tee embeddingeja tai AI-kutsuja frontendissa. Kaikki AI-logiikka
tapahtuu Edge Functioneissa. Frontend kutsuu vain:
  - supabase.functions.invoke("process-document", { body: { document_id } })
  - supabase.functions.invoke("chat", { body: { folder_id, message } })
```

---

## Supabase-asetukset

Kun Lovable on luonut projektin:

1. **Luo Supabase-projekti** Lovablen integraatiosta
2. **Aja schema.sql** Supabase SQL Editorissa (loytyy `supabase/schema.sql`)
3. **Deployaa Edge Functions**:
   ```bash
   supabase functions deploy process-document
   supabase functions deploy chat
   ```
4. **Lisaa API-avaimet** Supabase Secretsiin:
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-...
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```

## Kustannusarvio

| Palvelu | Ilmaistaso | Arvio 100 dokumenttia/kk |
|---------|-----------|--------------------------|
| Supabase | 500 MB tietokanta, 1 GB storage | Riittaa |
| OpenAI Embeddings | - | ~$0.50/kk |
| Claude API (Haiku) | - | ~$2-5/kk riippuen kaytosta |
| **Yhteensa** | | **~$3-6/kk** |
