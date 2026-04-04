/**
 * Workers AI bge-m3 embedding service
 */

const MODEL = '@cf/baai/bge-m3';

export async function getEmbedding(ai: Ai, text: string): Promise<number[]> {
  const result = await ai.run(MODEL, { text: [text] }) as any;
  return result.data[0];
}

export async function getEmbeddings(ai: Ai, texts: string[]): Promise<number[][]> {
  const result = await ai.run(MODEL, { text: texts }) as any;
  return result.data;
}
