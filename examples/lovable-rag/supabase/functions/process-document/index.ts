// Supabase Edge Function: Dokumentin prosessointi
// Pilkkoo tiedoston paloihin ja luo embedding-vektorit
//
// Deploy: supabase functions deploy process-document
// Vaatii: OPENAI_API_KEY (Supabase Secrets)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CHUNK_SIZE = 500; // sanaa per pala
const CHUNK_OVERLAP = 50; // sanojen overlap palojen valilla

interface ProcessRequest {
  document_id: string;
}

serve(async (req) => {
  try {
    const { document_id } = (await req.json()) as ProcessRequest;

    // Supabase-client kayttajan tokenilla
    const authHeader = req.headers.get("Authorization")!;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service role client tietokantatoimintoihin
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Hae dokumentin tiedot
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .select("*, folders!inner(user_id)")
      .eq("id", document_id)
      .single();

    if (docError || !doc) {
      return new Response(
        JSON.stringify({ error: "Dokumenttia ei loydy" }),
        { status: 404 }
      );
    }

    // Paivita status
    await supabaseAdmin
      .from("documents")
      .update({ status: "processing" })
      .eq("id", document_id);

    // 2. Lataa tiedosto Storagesta
    const { data: fileData, error: fileError } = await supabase.storage
      .from("documents")
      .download(doc.file_path);

    if (fileError || !fileData) {
      await supabaseAdmin
        .from("documents")
        .update({ status: "error", error_message: "Tiedoston lataus epaonnistui" })
        .eq("id", document_id);
      return new Response(
        JSON.stringify({ error: "Tiedoston lataus epaonnistui" }),
        { status: 500 }
      );
    }

    // 3. Muunna teksti
    const text = await extractText(fileData, doc.file_type);

    // 4. Pilko paloihin
    const chunks = chunkText(text, CHUNK_SIZE, CHUNK_OVERLAP);

    // 5. Luo embeddings erana (batch)
    const embeddings = await createEmbeddings(
      chunks,
      Deno.env.get("OPENAI_API_KEY")!
    );

    // 6. Tallenna chunkit tietokantaan
    const chunkRows = chunks.map((content, i) => ({
      document_id,
      content,
      chunk_index: i,
      embedding: embeddings[i],
      metadata: {
        file_name: doc.file_name,
        chunk_of: chunks.length,
      },
    }));

    const { error: insertError } = await supabaseAdmin
      .from("chunks")
      .insert(chunkRows);

    if (insertError) {
      await supabaseAdmin
        .from("documents")
        .update({ status: "error", error_message: insertError.message })
        .eq("id", document_id);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500 }
      );
    }

    // 7. Paivita dokumentin tila
    await supabaseAdmin
      .from("documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", document_id);

    return new Response(
      JSON.stringify({
        success: true,
        chunks: chunks.length,
        document_id,
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

// -- Apufunktiot --

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const chunks: string[] = [];

  if (words.length === 0) return [];

  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunk = words.slice(start, end).join(" ");
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
    if (end >= words.length) break;
    start += chunkSize - overlap;
  }

  return chunks;
}

async function createEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: batch,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Embedding-virhe: ${err}`);
    }

    const data = await response.json();
    for (const item of data.data) {
      allEmbeddings.push(item.embedding);
    }
  }

  return allEmbeddings;
}

async function extractText(blob: Blob, fileType: string): Promise<string> {
  // Tekstitiedostot suoraan
  if (["txt", "md"].includes(fileType)) {
    return await blob.text();
  }

  // PDF - yksinkertainen tekstinpurku
  // Tuotannossa kayta esim. pdf-parse tai vastaavaa
  if (fileType === "pdf") {
    // Perusratkaisu: yrita lukea teksti suoraan
    // Jos PDF sisaltaa kuvia, tarvitset OCR-palvelun
    const text = await blob.text();
    // Siivoa PDF-merkit pois
    return text
      .replace(/[^\x20-\x7E\xC0-\xFF\n\r\t\u00C0-\u024F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Muut tiedostotyypit: palauta raakiteksti
  return await blob.text();
}
