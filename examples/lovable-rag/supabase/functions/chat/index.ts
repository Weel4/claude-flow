// Supabase Edge Function: Chat (RAG-haku)
// Hakee relevanteimmat dokumenttipalat ja vastaa Claudella
//
// Deploy: supabase functions deploy chat
// Vaatii: OPENAI_API_KEY + ANTHROPIC_API_KEY (Supabase Secrets)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ChatRequest {
  folder_id: string;
  message: string;
  chat_id?: string; // olemassa oleva chat, tai luodaan uusi
}

serve(async (req) => {
  try {
    const { folder_id, message, chat_id } = (await req.json()) as ChatRequest;

    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Hae tai luo chat
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Kirjaudu sisaan" }),
        { status: 401 }
      );
    }

    let activeChatId = chat_id;
    if (!activeChatId) {
      const { data: existing } = await supabase
        .from("chats")
        .select("id")
        .eq("folder_id", folder_id)
        .eq("user_id", user.id)
        .single();

      if (existing) {
        activeChatId = existing.id;
      } else {
        const { data: newChat } = await supabase
          .from("chats")
          .insert({ folder_id, user_id: user.id })
          .select("id")
          .single();
        activeChatId = newChat!.id;
      }
    }

    // 2. Tallenna kayttajan viesti
    await supabaseAdmin
      .from("messages")
      .insert({
        chat_id: activeChatId,
        role: "user",
        content: message,
      });

    // 3. Luo kysymyksen embedding
    const queryEmbedding = await createQueryEmbedding(
      message,
      Deno.env.get("OPENAI_API_KEY")!
    );

    // 4. Vektorihaku - hae relevanteimmat palat
    const { data: matches, error: matchError } = await supabaseAdmin
      .rpc("match_chunks", {
        query_embedding: queryEmbedding,
        target_folder_id: folder_id,
        match_count: 5,
        match_threshold: 0.65,
      });

    if (matchError) {
      throw new Error(`Hakuvirhe: ${matchError.message}`);
    }

    // 5. Hae viesthistoria (viimeiset 10 viestia)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("chat_id", activeChatId)
      .order("created_at", { ascending: false })
      .limit(10);

    const previousMessages = (history || []).reverse();

    // 6. Rakenna konteksti ja laheta Claudelle
    const sources = (matches || []).map((m: any) => ({
      document_id: m.document_id,
      file_name: m.file_name,
      chunk_content: m.content,
      similarity: m.similarity,
    }));

    const contextText = sources
      .map(
        (s: any, i: number) =>
          `[Lahde ${i + 1}: ${s.file_name} (osuvuus: ${(s.similarity * 100).toFixed(0)}%)]\n${s.chunk_content}`
      )
      .join("\n\n---\n\n");

    const systemPrompt = `Olet avulias assistentti joka vastaa kysymyksiin AINOASTAAN annettujen lahdedokumenttien perusteella.

Saannot:
- Vastaa VAIN jos tieto loytyy lahteista. Jos tietoa ei ole, sano se rehellisesti.
- Viittaa lahteisiin vastauksessasi: [Lahde 1], [Lahde 2] jne.
- Vastaa samalla kielella kuin kayttaja kysyy.
- Ole tarkka ja ytimeras. Ala keksi tietoa jota ei ole lahteissa.

Lahdedokumentit:
${contextText || "Yhtaan osuvaa lahdetta ei loytynyt."}`;

    const claudeMessages = [
      ...previousMessages.slice(0, -1).map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: claudeMessages,
        }),
      }
    );

    if (!claudeResponse.ok) {
      const err = await claudeResponse.text();
      throw new Error(`Claude-virhe: ${err}`);
    }

    const claudeData = await claudeResponse.json();
    const assistantMessage =
      claudeData.content[0]?.text || "Vastauksen luonti epaonnistui.";

    // 7. Tallenna assistentin vastaus
    await supabaseAdmin.from("messages").insert({
      chat_id: activeChatId,
      role: "assistant",
      content: assistantMessage,
      sources,
    });

    return new Response(
      JSON.stringify({
        chat_id: activeChatId,
        message: assistantMessage,
        sources: sources.map((s: any) => ({
          file_name: s.file_name,
          similarity: s.similarity,
        })),
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500 }
    );
  }
});

async function createQueryEmbedding(
  text: string,
  apiKey: string
): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding-virhe: ${await response.text()}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
