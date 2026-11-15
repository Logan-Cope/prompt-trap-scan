import test from 'node:test';
import assert from 'node:assert/strict';
import { runCorpus } from '../eval/run.mjs';

test('fixture corpus meets the bar: every planted trap found, no false flags, a11y routed', async () => {
  const { rows, summary: s } = await runCorpus();
  assert.ok(s.planted >= 15, 'at least 15 planted traps');
  assert.ok(s.cleanPages >= 10, 'at least 10 clean pages');
  const missed = rows.flatMap((r) => r.planted.filter((p) => !p.found).map((p) => `${r.id}: ${p.fragment}`));
  assert.deepEqual(missed, []);
  assert.equal(s.falseFlags, 0);
  assert.equal(s.accessibilityRouted, s.cleanPages);
  assert.equal(s.verdictsOk, s.cleanPages);
  for (const m of ['display-none', 'visibility-hidden', 'zero-opacity', 'tiny-font', 'color-match', 'text-indent', 'clipped', 'offscreen', 'zero-size']) {
    assert.ok(s.byMethod[m] && s.byMethod[m].n >= 1, `corpus plants ${m}`);
  }
  assert.ok(s.found > s.naiveFound, 'beats the naive baseline');
});

test('documented limits stay documented: both read clean', async () => {
  const { rows } = await runCorpus();
  for (const r of rows.filter((x) => x.kind === 'limit')) assert.equal(r.verdict, 'clean', r.id);
});
