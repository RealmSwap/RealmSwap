export function resolveTargetServerIds(
  body: { all?: boolean; serverIds?: string[] },
  ownedServerIds: string[],
): string[] {
  if (body.all) return [...ownedServerIds];
  if (Array.isArray(body.serverIds)) return body.serverIds.filter((id) => ownedServerIds.includes(id));
  return [];
}
