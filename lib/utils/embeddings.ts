import { AzureOpenAI } from "openai";

let client: AzureOpenAI | null = null;

function getClient() {
  if (client) return client;

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-04-01-preview";

  if (!endpoint || !apiKey) {
    console.warn('Azure OpenAI environment variables are missing.');
    return null;
  }

  client = new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion,
    deployment: process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  });

  return client;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const azureClient = getClient();

  if (!azureClient) {
    console.error('[generateEmbedding] Azure OpenAI client not initialized — AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_KEY missing from env');
    return [];
  }

  try {
    const response = await azureClient.embeddings.create({
      input: text,
      model: "", // Model is determined by the deployment in AzureOpenAI client options
    });

    if (!response.data || !response.data[0]?.embedding) {
      console.error('[generateEmbedding] Azure returned empty embedding data');
      return [];
    }

    return response.data[0].embedding;
  } catch (error: any) {
    console.error('[generateEmbedding] FAILED:',
      error?.message || String(error),
      '| status:', error?.status,
      '| code:', error?.code,
      '| deployment:', process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    );
    return [];
  }
}
