/*
 * What a ball is made of: weight, core, RG, differentials, coverstock, finish, layout.
 *
 * Pure helpers for the Arsenal page: tidy what was typed, turn it into labelled facts, and a
 * small catalogue of factory specs so a ball you add by name can be filled in. The catalogue
 * holds the figures the makers publish for the 15 lb ball (RG and differential change a little
 * with weight), so treat them as a starting point to correct.
 */
(function () {
  'use strict';

  /* ---- what a ball record may carry ---- */
  var LIMITS = {
    weight: [6, 16],        // pounds
    rg: [2.3, 2.9],
    diff: [0, 0.09],        // total differential
    intDiff: [0, 0.06],     // intermediate differential, asymmetric cores
  };

  function num(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function text(v) { return v == null ? '' : String(v).trim(); }

  /*
   * Tidy a set of specs from a form (or anywhere): numbers parsed and kept in range, empty things
   * dropped. Returns { specs, problems }: specs holds only what was filled in, and each problem
   * names a field that was out of range or not a number.
   */
  function clean(input) {
    input = input || {};
    var specs = {}, problems = [];
    [['weight', 'Weight'], ['rg', 'RG'], ['diff', 'Differential'], ['intDiff', 'Intermediate differential']].forEach(function (f) {
      var raw = input[f[0]];
      if (raw == null || raw === '') return;
      var n = num(raw);
      var lim = LIMITS[f[0]];
      if (n == null || n < lim[0] || n > lim[1]) { problems.push(f[1] + ' should be between ' + lim[0] + ' and ' + lim[1]); return; }
      specs[f[0]] = f[0] === 'weight' ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 1000;
    });
    var core = input.core === 'sym' || input.core === 'asym' ? input.core : '';
    if (core) specs.core = core;
    ['coreName', 'coverstock', 'finish', 'layout'].forEach(function (k) { if (text(input[k])) specs[k] = text(input[k]); });
    return { specs: specs, problems: problems };
  }

  function has(specs) { return !!specs && Object.keys(specs).length > 0; }

  var CORE_NAMES = { sym: 'Symmetric', asym: 'Asymmetric' };

  /* Labelled facts, in the order they are shown, for whatever is filled in. */
  function facts(specs) {
    if (!has(specs)) return [];
    var out = [];
    if (specs.weight != null) out.push(['Weight', specs.weight + ' lb']);
    if (specs.core) out.push(['Core', CORE_NAMES[specs.core] + (specs.coreName ? ' · ' + specs.coreName : '')]);
    else if (specs.coreName) out.push(['Core', specs.coreName]);
    if (specs.rg != null) out.push(['RG', specs.rg.toFixed(3).replace(/0$/, '')]);
    if (specs.diff != null) out.push(['Differential', specs.diff.toFixed(3)]);
    if (specs.intDiff != null) out.push(['Int. diff', specs.intDiff.toFixed(3)]);
    if (specs.coverstock) out.push(['Coverstock', specs.coverstock]);
    if (specs.finish) out.push(['Finish', specs.finish]);
    if (specs.layout) out.push(['Layout', specs.layout]);
    return out;
  }

  /* ---- the catalogue: published 15 lb specs, by ball name ---- */
  var CATALOGUE = [
    { names: ['storm bionic'], specs: { weight: 15, core: 'sym', coreName: 'Torsion A.I.', rg: 2.47, diff: 0.05, coverstock: 'NRG Hybrid Reactive', finish: '4000 Abralon' } },
    { names: ['motiv evoke mayhem', 'evoke mayhem'], specs: { weight: 15, core: 'asym', coreName: 'Overload', rg: 2.48, diff: 0.05, intDiff: 0.015, coverstock: 'Propulsion MXV Solid Reactive' } },
    { names: ['storm ion pro solid', 'ion pro solid'], specs: { weight: 15, core: 'asym', coreName: 'Element Tour A.I.', rg: 2.47, diff: 0.035, intDiff: 0.014, coverstock: 'TX-16 Solid Reactive', finish: 'Power Edge' } },
    { names: ['motiv supra sport', 'supra sport'], specs: { weight: 15, core: 'sym', coreName: 'Quadfire', rg: 2.55, diff: 0.043, coverstock: 'Leverage MFS Solid Reactive', finish: '4000 LSS' } },
  ];

  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }

  /* The catalogue's specs for a ball name (spelled as typed, any case), or null. */
  function find(name) {
    var n = norm(name);
    if (!n) return null;
    for (var i = 0; i < CATALOGUE.length; i++) {
      if (CATALOGUE[i].names.indexOf(n) !== -1) return JSON.parse(JSON.stringify(CATALOGUE[i].specs));
    }
    return null;
  }

  var api = { clean: clean, facts: facts, has: has, find: find, LIMITS: LIMITS, CATALOGUE: CATALOGUE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.BallSpecs = api;
})();
