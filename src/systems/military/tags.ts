import type { GameDate } from '@/core/clock';
import type { PatchOp } from '@/state/mvu-parse';
import type { GameState } from '@/state/slices';
import { realmStateOf } from '@/systems/realm/slice';
import { militaryResourcesOf, recruitableTypeOf, recruitUnit, sourceFor } from './recruitment';
import { militaryStateOf } from './slice';

const TAG_PATTERN = /<RequestRecruitment\b([^>]*?)\/?>/gi;
const ATTR_PATTERN = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;

export interface AiRecruitmentRequest {
  typeId: string;
  companies: number;
  destinationId: string;
}

export function parseRecruitmentRequests(raw: string): AiRecruitmentRequest[] {
  const requests: AiRecruitmentRequest[] = [];
  TAG_PATTERN.lastIndex = 0;
  for (let match = TAG_PATTERN.exec(raw); match !== null; match = TAG_PATTERN.exec(raw)) {
    const found: Record<string, string> = {};
    ATTR_PATTERN.lastIndex = 0;
    for (let attr = ATTR_PATTERN.exec(match[1] ?? ''); attr !== null; attr = ATTR_PATTERN.exec(match[1] ?? '')) {
      found[(attr[1] ?? attr[3] ?? '').toLowerCase()] = attr[2] ?? attr[4] ?? '';
    }
    const typeId = found['binh-chung'] ?? found['type'] ?? found['unit'] ?? '';
    if (typeId === '') continue;
    const amount = Number(found['so-doi'] ?? found['companies'] ?? '1');
    requests.push({
      typeId,
      companies: Number.isFinite(amount) ? Math.max(1, Math.round(amount)) : 1,
      destinationId: found['dao-quan'] ?? found['destination'] ?? '',
    });
  }
  return requests.slice(0, 3);
}

export function stripRecruitmentRequests(raw: string): string {
  return raw.replace(TAG_PATTERN, '').trim();
}

export interface AiRecruitmentOutcome {
  ops: PatchOp[];
  log: string[];
}

export function handleAiRecruitment(state: GameState, raw: string, date: GameDate): AiRecruitmentOutcome {
  const requests = parseRecruitmentRequests(raw);
  const originalMilitary = militaryStateOf(state);
  const originalRealm = realmStateOf(state);
  if (requests.length === 0 || originalMilitary === null || originalRealm === null || originalRealm.id === '') {
    return { ops: [], log: [] };
  }

  let military = originalMilitary;
  let treasury = originalRealm.treasury;
  const log: string[] = [];
  for (const request of requests) {
    const type = recruitableTypeOf(request.typeId);
    if (type === null) {
      log.push(`Từ chối tuyển quân do AI đề nghị: không có binh chủng ${request.typeId}.`);
      continue;
    }
    const result = recruitUnit(military, treasury, militaryResourcesOf(state), {
      ...request,
      source: sourceFor(type),
      requestedBy: 'ai',
      date,
    });
    military = result.military;
    treasury = result.treasury;
    log.push(result.line);
  }

  if (military === originalMilitary) return { ops: [], log };
  return {
    log,
    ops: [
      { op: 'set', path: 'military', to: military, reason: 'diễn biến truyện đã ra lệnh tuyển quân', source: 'json' },
      { op: 'set', path: 'realm.treasury', to: treasury, reason: 'trả chi phí tuyển quân theo diễn biến', source: 'json' },
    ],
  };
}
