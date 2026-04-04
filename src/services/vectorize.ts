/**
 * Vectorize client — upsert, query, delete
 */

export async function upsertVector(
  index: VectorizeIndex,
  id: string,
  values: number[],
  metadata: Record<string, string>,
): Promise<void> {
  await index.upsert([{ id, values, metadata }]);
}

export async function queryVectors(
  index: VectorizeIndex,
  values: number[],
  opts: { topK?: number; filter?: VectorizeVectorMetadataFilter },
): Promise<VectorizeMatches> {
  return await index.query(values, {
    topK: opts.topK || 5,
    filter: opts.filter,
    returnMetadata: 'all',
  });
}

export async function deleteVector(index: VectorizeIndex, id: string): Promise<void> {
  await index.deleteByIds([id]);
}

export async function deleteVectorsByIds(index: VectorizeIndex, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Vectorize deleteByIds has a batch limit, chunk if needed
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    await index.deleteByIds(ids.slice(i, i + BATCH));
  }
}
