import { describe, expect, it } from 'vitest';
import {
  ID_PREFIXES,
  IdFormatError,
  idKindOf,
  isId,
  makeId,
  parseId,
  type HoldingId,
  type RealmId,
} from './ids';

describe('ids — prefix per kind (README 7.1)', () => {
  it('builds an id with the right prefix', () => {
    expect(makeId('holding', 'thon-bach-duong')).toBe('hold_thon-bach-duong');
    expect(makeId('realm', 'xu-bac')).toBe('realm_xu-bac');
    expect(makeId('corps', 'quan-doan-7')).toBe('corps_quan-doan-7');
  });

  it('covers every prefix the README fixes', () => {
    expect(Object.values(ID_PREFIXES).sort()).toEqual(
      ['corps_', 'fief_', 'hold_', 'item_', 'npc_', 'prov_', 'realm_', 'unit_'].sort(),
    );
  });

  it('recognises which kind an id belongs to', () => {
    expect(idKindOf('hold_a')).toBe('holding');
    expect(idKindOf('realm_a')).toBe('realm');
    expect(idKindOf('fief_a')).toBe('fief');
    expect(idKindOf('gi-do')).toBeNull();
  });
});

describe('ids — cross-layer confusion is caught (README 8.1)', () => {
  it('refuses a holding id where a realm id is required', () => {
    expect(() => parseId('realm', 'hold_bach-duong')).toThrow(IdFormatError);
    expect(isId('realm', 'hold_bach-duong')).toBe(false);
  });

  it('refuses a realm id where a holding id is required', () => {
    expect(() => parseId('holding', 'realm_xu-bac')).toThrow(IdFormatError);
  });

  it('does not confuse fief with any of the other two', () => {
    expect(isId('fief', 'fief_bach-duong')).toBe(true);
    expect(isId('holding', 'fief_bach-duong')).toBe(false);
    expect(isId('realm', 'fief_bach-duong')).toBe(false);
  });

  it('refuses ids that are only a prefix, or have an illegal suffix', () => {
    for (const bad of ['hold_', 'hold_Bach', 'hold_bạch', 'hold_-a', 'hold_a b', 'hold_a_b', '']) {
      expect(isId('holding', bad)).toBe(false);
    }
  });

  it('refuses anything that is not a string', () => {
    for (const bad of [null, undefined, 42, {}, ['hold_a']]) {
      expect(isId('holding', bad)).toBe(false);
      expect(() => parseId('holding', bad)).toThrow(IdFormatError);
    }
  });

  it('names the expected prefix in the error, so bad data is easy to fix', () => {
    expect(() => parseId('province', 'hold_x')).toThrow(/prov_/);
  });

  it('narrows to the branded type once parsed', () => {
    const holding: HoldingId = parseId('holding', 'hold_bach-duong');
    const realm: RealmId = parseId('realm', 'realm_xu-bac');

    // Vẫn là string lúc chạy: lưu, so sánh, JSON đều bình thường.
    expect(typeof holding).toBe('string');
    expect(JSON.parse(JSON.stringify({ holding, realm }))).toEqual({
      holding: 'hold_bach-duong',
      realm: 'realm_xu-bac',
    });

    // @ts-expect-error — thành trì không được lọt vào chỗ cần lãnh thổ.
    const wrong: RealmId = holding;
    expect(wrong).toBe('hold_bach-duong');
  });
});
