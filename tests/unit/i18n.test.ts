/// <reference types="jest" />
import en from '@/i18n/locales/en';
import ptBR from '@/i18n/locales/pt-BR';

type Tree = { [k: string]: string | Tree };

function flatten(t: Tree, prefix = ''): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') acc[key] = v;
    else Object.assign(acc, flatten(v, key));
    return acc;
  }, {});
}

const vars = (s: string) => [...s.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('i18n catalogs', () => {
  const a = flatten(en as unknown as Tree);
  const b = flatten(ptBR as unknown as Tree);

  it('pt-BR and en have exactly the same keys', () => {
    expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
  });

  it('interpolation variables match in every string', () => {
    for (const k of Object.keys(a)) expect([k, vars(b[k])]).toEqual([k, vars(a[k])]);
  });

  it('no empty strings, and pt-BR is actually translated', () => {
    for (const [k, v] of Object.entries(b)) expect([k, v.trim().length > 0]).toEqual([k, true]);
    // Strings that are the same in both languages on purpose.
    const sameOnPurpose = new Set(['join.pastePlaceholder', 'viewer.original', 'common.appName', 'paywall.title', 'create.namePlaceholder', 'common.items_one', 'upload.reviewTitle_one', 'queue.stateUploading', 'settings.planPlus']);
    const same = Object.keys(a).filter((k) => a[k] === b[k] && /[a-z]{4,}/i.test(a[k]) && !sameOnPurpose.has(k) && !/^\{\{.*\}\}$/.test(a[k]));
    expect(same).toEqual([]);
  });

  it('pt-BR uses informal "você", never "o senhor/a senhora"', () => {
    const text = Object.values(b).join(' ');
    expect(text).not.toMatch(/o senhor|a senhora|V\. ?Sa\./i);
  });
});
