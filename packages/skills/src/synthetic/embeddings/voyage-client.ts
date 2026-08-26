const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-4-lite";

interface VoyageEmbeddingResponse {
  data: { embedding: number[]; index: number }[];
  usage: { total_tokens: number };
}

// Needs VOYAGE_API_KEY (voyageai.com). Plain fetch rather than a vendor SDK —
// one endpoint, not worth the dependency (same call as via NODE_USE_ENV_PROXY
// for the corporate proxy, since it's still Node's fetch under the hood).
export async function embed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
  const apiKey = process.env["VOYAGE_API_KEY"];
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set.");
  }

  const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType }),
  });

  if (!response.ok) {
    throw new Error(`Voyage embeddings request failed: ${response.status} ${await response.text()}`);
  }

  const body = (await response.json()) as VoyageEmbeddingResponse;
  return [...body.data].sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
}
