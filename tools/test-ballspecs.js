/* Ball specs: tidying what was typed, the labelled facts, and the factory catalogue. */
const B = require('../js/ballspecs.js');

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails.push(l + '  →  ' + d), c && ok.push(l));

// --- clean ----------------------------------------------------------------------------------
const c1 = B.clean({ weight: '15', core: 'asym', rg: '2.48', diff: '0.050', intDiff: '0.015', coverstock: ' Solid ', finish: '', layout: '' });
check('numbers are parsed and text trimmed, empties dropped', JSON.stringify(c1.specs) === JSON.stringify({ weight: 15, rg: 2.48, diff: 0.05, intDiff: 0.015, core: 'asym', coverstock: 'Solid' }) && !c1.problems.length, JSON.stringify(c1));
check('a comma decimal is accepted', B.clean({ rg: '2,55' }).specs.rg === 2.55, '');
check('nothing filled in is nothing', !B.has(B.clean({ weight: '', core: '', rg: '' }).specs), '');
const bad = B.clean({ weight: '40', rg: '9', diff: 'abc', intDiff: '0.5' });
check('out-of-range and non-numeric values are refused, each named', bad.problems.length === 4 && !B.has(bad.specs) && /Weight/.test(bad.problems[0]), JSON.stringify(bad));
check('an unknown core value is ignored', !('core' in B.clean({ core: 'banana' }).specs), '');
check('weight keeps one decimal, RG and diff three', B.clean({ weight: '14.04', rg: '2.4812', diff: '0.04999' }).specs.weight === 14 && B.clean({ rg: '2.4812' }).specs.rg === 2.481 && B.clean({ diff: '0.04999' }).specs.diff === 0.05, '');

// --- facts ----------------------------------------------------------------------------------
const f = B.facts({ weight: 15, core: 'asym', coreName: 'Overload', rg: 2.48, diff: 0.05, intDiff: 0.015, coverstock: 'Solid', finish: '2000', layout: '4 x 5 x 3' });
check('facts come in a fixed order with units', f.map(x => x[0]).join() === 'Weight,Core,RG,Differential,Int. diff,Coverstock,Finish,Layout', f.map(x => x[0]).join());
check('values are formatted: 15 lb, Asymmetric · Overload, 2.48, 0.050, 0.015', f[0][1] === '15 lb' && f[1][1] === 'Asymmetric · Overload' && f[2][1] === '2.48' && f[3][1] === '0.050' && f[4][1] === '0.015', JSON.stringify(f));
check('only what is filled in is listed', B.facts({ rg: 2.5 }).length === 1 && B.facts(null).length === 0 && B.facts({}).length === 0, '');
check('a core name without a type still shows', B.facts({ coreName: 'Quadfire' })[0][1] === 'Quadfire', '');

// --- catalogue ------------------------------------------------------------------------------
check('a ball is found by name, any case or spacing', B.find('  STORM   Bionic ').rg === 2.47 && B.find('storm-bionic').core === 'sym', '');
check('with or without the maker', B.find('Evoke Mayhem').core === 'asym' && B.find('Motiv Evoke Mayhem').intDiff === 0.015, '');
check('every catalogue entry passes the same tidy-up', B.CATALOGUE.every(e => { const r = B.clean(e.specs); return !r.problems.length && Object.keys(e.specs).length === Object.keys(r.specs).length && Object.keys(e.specs).every(k => r.specs[k] === e.specs[k]); }), '');
check('asymmetric entries carry an intermediate differential, symmetric ones do not', B.CATALOGUE.every(e => (e.specs.core === 'asym') === (e.specs.intDiff != null)), '');
check('an unknown ball is not found, and finding returns a copy', B.find('Mystery Ball') === null && (() => { const a = B.find('storm bionic'); a.rg = 1; return B.find('storm bionic').rg === 2.47; })(), '');

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n') : '\nall ball-spec assertions passed');
process.exit(fails.length ? 1 : 0);
