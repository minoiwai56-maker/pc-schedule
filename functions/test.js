const { diffLines, summarize } = require('./notify');
const before = { properties: [
  { id: 1, name: 'A邸', pcdates: ['2026-11-25'], dodai: '2026-11-26', joto: '2026-11-28', pcFactory: '中国木材' },
  { id: 2, name: 'B邸', pcdates: ['2026-11-20'] } ] };
const after = { properties: [
  { id: 1, name: 'A邸', pcdates: ['2026-11-25'], dodai: '2026-11-27', joto: '2026-11-28', pcFactory: '中国木材', note: 'x' },
  { id: 3, name: 'C邸', pcdates: ['2026-12-01', '2026-12-03'], joto: '2026-12-05' } ] };
console.log(diffLines(before, after).map(l => l.text).join('\n'));
console.log('---');
console.log(summarize([
  { id: '1', before: before.properties[0], after: { ...before.properties[0], dodai: '2026-11-27' } },
  { id: '1', before: { ...before.properties[0], dodai: '2026-11-27' }, after: { ...before.properties[0], dodai: '2026-11-29' } },
  { id: '9', before: null, after: { id: 9, name: '新', pcdates: ['2026-12-10'] } },
  { id: '9', before: { id: 9, name: '新', pcdates: ['2026-12-10'] }, after: { id: 9, name: '新', pcdates: ['2026-12-11'] } },
  { id: '5', before: { id: 5, name: '戻した' , dodai:'2026-11-01'}, after: { id: 5, name: '戻した', dodai: '2026-11-02' } },
  { id: '5', before: { id: 5, name: '戻した', dodai: '2026-11-02' }, after: { id: 5, name: '戻した', dodai: '2026-11-01' } },
]).join('\n'));
