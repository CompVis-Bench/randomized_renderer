import type { ConcatLinkSpec, CompositionSpec } from "../types";

const MINIMUM_POLAR_BAND_RATIO = 0.03;

export function polarConcatAxisLayout(
  memberIds: string[],
  links: ConcatLinkSpec[],
  direction: "radial" | "angular",
) {
  const memberIdSet = new Set(memberIds);
  const adjacency = new Map<string, Array<{ nodeId: string; delta: number }>>();
  memberIds.forEach((memberId) => adjacency.set(memberId, []));
  links.filter((link) =>
    link.direction === direction
    && memberIdSet.has(link.targetNodeId)
    && memberIdSet.has(link.sourceNodeId),
  ).forEach((link) => {
    const delta = link.position === "after" ? 1 : -1;
    adjacency.get(link.targetNodeId)?.push({ nodeId: link.sourceNodeId, delta });
    adjacency.get(link.sourceNodeId)?.push({ nodeId: link.targetNodeId, delta: -delta });
  });

  const positions = new Map<string, number>();
  let count = 1;
  memberIds.forEach((memberId) => {
    if (positions.has(memberId)) return;
    const rawPositions = new Map<string, number>([[memberId, 0]]);
    const queue = [memberId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentPosition = rawPositions.get(currentId)!;
      adjacency.get(currentId)?.forEach(({ nodeId, delta }) => {
        if (rawPositions.has(nodeId)) return;
        rawPositions.set(nodeId, currentPosition + delta);
        queue.push(nodeId);
      });
    }
    const component = memberIds
      .filter((candidateId) => rawPositions.has(candidateId))
      .sort((leftId, rightId) =>
        rawPositions.get(leftId)! - rawPositions.get(rightId)!
        || memberIds.indexOf(leftId) - memberIds.indexOf(rightId));
    component.forEach((candidateId, index) => positions.set(candidateId, index));
    count = Math.max(count, component.length);
  });
  return { positions, count };
}

export function normalizedPolarRadialBoundaries(
  composition: CompositionSpec,
  count: number,
) {
  const expectedLength = count + 1;
  const stored = composition.polarRadialBoundaries;
  const valid = stored?.length === expectedLength
    && stored.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    && stored.every((value, index) => index === 0 || value - stored[index - 1]! >= MINIMUM_POLAR_BAND_RATIO)
    && Math.abs(stored[expectedLength - 1]! - 1) < 0.0001;
  return valid
    ? [...stored!]
    : Array.from({ length: expectedLength }, (_, index) => index / count);
}

export function updatedPolarRadialBoundary(
  boundaries: number[],
  boundaryIndex: number,
  requestedRatio: number,
) {
  if (boundaryIndex < 0 || boundaryIndex >= boundaries.length - 1) return [...boundaries];
  const lower = boundaryIndex === 0
    ? 0
    : boundaries[boundaryIndex - 1]! + MINIMUM_POLAR_BAND_RATIO;
  const upper = boundaries[boundaryIndex + 1]! - MINIMUM_POLAR_BAND_RATIO;
  const next = [...boundaries];
  next[boundaryIndex] = Math.max(lower, Math.min(requestedRatio, upper));
  return next;
}
