/* How individual lines count, checked against the real week-2 data where the
   sheet proved the answer, and against a small fixture for the rules. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'stats.js'), 'utf8'), ctx);
const { build } = ctx.window.LeagueStats;

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));

// --- the rules, on a fixture ----------------------------------------------
const fx = {
  league: { name: 'T', weeksInSeason: 32 },
  scoring: { gamesPerWeek: 3, useHandicap: true, handicapBasis: 220, handicapPercent: 90,
             pointsPerGame: 1, pointsForSeries: 1 },
  teams: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  players: [
    { id: 'p1', name: 'Blind Bob', teamId: 'a', entryAverage: 200 },   // hdcp 18
    { id: 'p2', name: 'Lent Lou', teamId: 'a', entryAverage: 180 },    // hdcp 36
    { id: 'p3', name: 'Sub Sam', teamId: null, substitute: true, entryAverage: 160 }, // hdcp 54
    { id: 'p4', name: 'Home Hal', teamId: 'b', entryAverage: 220 },    // hdcp 0
  ],
  weeks: [{
    number: 1, date: '2026-09-08',
    scores: [
      { playerId: 'p1', games: [190, 190, 190], blind: true },
      { playerId: 'p2', teamId: 'b', games: [200, 200, 200] },
      { playerId: 'p3', teamId: 'a', games: [150, 150, 150] },
      { playerId: 'p4', games: [210, 210, 210] },
    ],
    matches: [{ homeTeamId: 'a', awayTeamId: 'b', lanes: '1-2' }],
  }],
};
let m = build(fx);
const P = id => m.players.find(p => p.id === id);
const T = id => m.teams.find(t => t.id === id);

// The league software counts a blind in the bowler's average (week 3 sheet:
// Lawson 2019 over 9 games, his week-2 blind included), so the site does too.
check('a blind counts toward the bowler\'s games, as the league counts it', P('p1').games === 3, P('p1').games);
check('and toward their average', P('p1').average === 190, P('p1').average);
check('but it is never one of their highs', P('p1').highGame == null && P('p1').highSeries == null,
      P('p1').highGame + '/' + P('p1').highSeries);
check('nor a night they bowled', P('p1').weeks.length === 0 && P('p1').blinds.length === 1, '');
check('but it counts for the team: A scratch includes 570', T('a').pins === 570 + 450, T('a').pins);
check('with the bowler\'s handicap: A hdcp is 18 + 54 per game',
      T('a').weeks[0].handicap === 18 + 54, T('a').weeks[0].handicap);
check('and it is marked absent on the team\'s night',
      T('a').weeks[0].lines.find(l => l.playerId === 'p1').role === 'absentee', '');

check('a lent bowler counts for the team they bowled for',
      T('b').pins === 600 + 630, T('b').pins);
check('not for their own roster', T('a').weeks[0].lines.every(l => l.playerId !== 'p2'), '');
check('their games still count toward their own average', P('p2').average === 200, P('p2').average);
check('their week records who they bowled for', P('p2').weeks[0].teamId === 'b', P('p2').weeks[0].teamId);
check('and they are marked sub on that team\'s night',
      T('b').weeks[0].lines.find(l => l.playerId === 'p2').role === 'substitute', '');

check('a teamless substitute is on no roster', m.teams.every(t => !t.players.includes(P('p3'))), '');
check('and is labelled a substitute', P('p3').teamName === 'Substitute', P('p3').teamName);
check('their line counts for the team it names',
      T('a').weeks[0].lines.some(l => l.playerId === 'p3'), '');

// Points from the sheet override the scores, and carry their note.
const fx2 = JSON.parse(JSON.stringify(fx));
fx2.weeks[0].matches[0] = Object.assign(fx2.weeks[0].matches[0],
  { homePoints: 0, awayPoints: 4, note: 'forfeit' });
m = build(fx2);
check('sheet points override the scores',
      T('a').points === 0 && T('b').points === 4, T('a').points + '/' + T('b').points);
check('the note travels with both sides',
      T('a').weeks[0].note === 'forfeit' && T('b').weeks[0].note === 'forfeit', '');

// --- the real week 2, where the printed totals proved the lineups ----------
const rctx = { window: {} };
vm.createContext(rctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'league.js'), 'utf8'), rctx);
// The season as it stood after a given week, so older assertions keep
// describing the sheet they were written from as new weeks are added.
const raw = rctx.window.LEAGUE_DATA;
// Corrections the league made on a later sheet are left out too: a pin adjustment
// "afterWeek" n first shows on the sheet for week n + 1, and a book change "afterWeek"
// n re-figures week n + 1, which the following sheet prints.
const asOf = (data, n) => Object.assign({}, data, {
  weeks: data.weeks.filter(w => w.number <= n),
  players: data.players.map(p => {
    if (!p.pinAdjustments && !p.bookChanges) return p;
    const q = Object.assign({}, p);
    if (p.pinAdjustments) q.pinAdjustments = p.pinAdjustments.filter(a => a.afterWeek < n);
    if (p.bookChanges) q.bookChanges = p.bookChanges.filter(b => b.afterWeek < n - 1);
    return q;
  }),
});
const at = n => build(asOf(raw, n));
let live = at(4);
const team = n => live.teams.find(t => t.id === 't' + n);
const night = (n, wk) => team(n).weeks.find(w => w.number === wk);
const games = (n, wk) => night(n, wk).hdcpGameTotals.join(',');

// These are the printed "HDCP -1- -2- -3-" figures for week 2.
check('9 Pin City with Spicer subbing = 869,823,815', games(5, 2) === '869,823,815', games(5, 2));
check('Bowling Buddies with Hancock = 840,931,891', games(22, 2) === '840,931,891', games(22, 2));
check('Team 21 without Hancock = 849,915,841', games(21, 2) === '849,915,841', games(21, 2));
check('Team 24 with Lawson\'s blind = 911,958,927', games(24, 2) === '911,958,927', games(24, 2));
check('Team 10 with Thompson\'s blind = 850,866,838', games(10, 2) === '850,866,838', games(10, 2));
check('Nutz with the vacancy = 906,895,829', games(15, 2) === '906,895,829', games(15, 2));

const lawson = live.players.find(p => p.name === 'Oliver Lawson');
// From week 4 the sheet leaves Lawson's week-2 blind out: 2044 over 9.
check('Lawson\'s 2044 over 9 leaves out his week-2 blind, as printed', lawson.games === 9 && lawson.pins === 2044,
      lawson.games + ' games, ' + lawson.pins);
const white = live.players.find(p => p.name === 'Aaron White');
check('Aaron White\'s 1964 over 9 includes his week-1 blind, as printed', white.games === 9 && white.pins === 1964,
      white.games + ' games, ' + white.pins);
check('and his 289 is his high game, the blind never is', white.highGame === 289, white.highGame);

// Week 3 put Ken Grizzard back on 160 and Leon Farmer on 195; the printed
// standings show week 1 rescored with them, back to 4-0.
check('Week 1 rescored with the week-3 books: Strike Scratch Fever 4 - Warriors 0',
      night(1, 1).points === 4 && night(2, 1).points === 0,
      night(1, 1).points + '-' + night(2, 1).points);

// --- week 3: the printed standings are cumulative, so they prove weeks 1-3 --
check('We Got This with Bryant\'s blind = 890,858,900', games(9, 3) === '890,858,900', games(9, 3));
check('Hookers and Bowl with Terry\'s blind = 836,867,878', games(12, 3) === '836,867,878', games(12, 3));
check('Bowling Buddies with Spicer subbing = 920,892,914', games(22, 3) === '920,892,914', games(22, 3));
check('Team 21 = 853,1102,1006', games(21, 3) === '853,1102,1006', games(21, 3));
check('Week 2 on Gruver\'s 189 book: House Hacks 3 - NBO 1',
      night(6, 2).points === 3 && night(7, 2).points === 1, night(6, 2).points + '-' + night(7, 2).points);
check('Week 1 with Toby Crisp\'s corrected 204: Old School 1 - Team 4 3',
      night(3, 1).points === 1 && night(4, 1).points === 3, night(3, 1).points + '-' + night(4, 1).points);
check('Week 1 with the vacancy for Jesse\'s Gym: Big Orange Bowling 4 - 0',
      night(19, 1).points === 4 && night(20, 1).points === 0, night(19, 1).points + '-' + night(20, 1).points);
// Points won after week 3, as printed.
const WON3 = {1: 5, 2: 4, 3: 7, 4: 7, 5: 2, 6: 11, 7: 7, 8: 5, 9: 3, 10: 5, 11: 6, 12: 8.5,
  13: 5, 14: 7, 15: 6.5, 16: 7, 17: 5.5, 18: 3, 19: 9, 20: 0.5, 21: 7, 22: 9, 23: 7, 24: 7};
const through = (n, wk) => team(n).weeks.filter(w => w.number <= wk)
  .reduce((t, w) => t + (w.points || 0), 0);
const offPts = Object.keys(WON3).filter(n => through(n, 3) !== WON3[n]);
check('every team\'s points after week 3 match the sheet', !offPts.length,
      offPts.map(n => n + ': ' + through(n, 3) + ' v ' + WON3[n]).join(', '));

// --- week 4: points, scratch and pins + hdcp after week 4, as printed --------
const STAND4 = {6:[12,10621,11065],22:[12,9869,10712],12:[11.5,9622,10690],16:[11,8416,10672],
  24:[10.5,10708,10816],21:[10,9495,10989],19:[10,9285,10869],3:[10,10254,10686],4:[10,9627,10611],
  11:[10,9232,10345],15:[9.5,9463,10447],7:[9,8638,10591],1:[8,7921,10420],23:[8,7269,10029],
  14:[7,8999,10427],13:[6,10356,10620],10:[6,9755,10571],17:[6,8510,10463],18:[6,7011,10269],
  8:[6,7854,10242],2:[6,8876,10169],9:[3,8641,10357],5:[3,8153,10148],20:[1.5,8226,10098]};
const off4 = Object.keys(STAND4).filter(n => {
  const t = team(n), s = STAND4[n];
  return through(n, 4) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 4 match the sheet', !off4.length,
      off4.map(n => n + ': ' + [through(n, 4), team(n).pins, team(n).hdcpPins] + ' v ' + STAND4[n]).join('; '));
check('Old School with Spicer subbing = 906,1009,1003', games(3, 4) === '906,1009,1003', games(3, 4));
check('NBO with two blinds = 837,909,892', games(7, 4) === '837,909,892', games(7, 4));
check('9 Pin City with Eisel\'s blind = 804,875,783', games(5, 4) === '804,875,783', games(5, 4));
check('Ruthless with Martin subbing = 937,857,821', games(17, 4) === '937,857,821', games(17, 4));
const seda = live.players.find(p => p.name === 'Jason Seda-Haas');
check('a blind the league leaves out of the average stays out: Seda-Haas 1661 over 9',
      seda.pins === 1661 && seda.games === 9, seda.pins + '/' + seda.games);
const woody = live.players.find(p => p.name === 'Thomas Woody');
check('a pin adjustment counts: Woody 1892 over 12', woody.pins === 1892 && woody.games === 12,
      woody.pins + '/' + woody.games);

// --- week 5: the same checks against the week-5 sheet ----------------------
live = at(5);
const STAND5 = {6:[15,13314,13830],12:[14.5,12129,13407],4:[14,12210,13449],16:[14,10587,13323],
  3:[13,12843,13380],11:[13,11563,12997],19:[12,11306,13349],22:[12,12376,13333],
  24:[11.5,13405,13513],21:[11,11739,13605],7:[11,10747,13099],1:[11,9932,13076],
  10:[10,12253,13294],15:[9.5,11953,13072],18:[9,8857,12892],2:[9,11219,12818],
  23:[9,9178,12679],14:[8,11213,12998],13:[7,12798,13125],17:[7,10613,13004],
  8:[7,9870,12864],5:[6,10244,12803],9:[4,10953,13104],20:[2.5,10417,12742]};
const off5 = Object.keys(STAND5).filter(n => {
  const t = team(n), s = STAND5[n];
  return through(n, 5) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 5 match the sheet', !off5.length,
      off5.map(n => n + ': ' + [through(n, 5), team(n).pins, team(n).hdcpPins] + ' v ' + STAND5[n]).join('; '));
check('Warriors bowling four, no blind = 819,945,885', games(2, 5) === '819,945,885', games(2, 5));
check('We The People with Chad Clark subbing = 859,903,890', games(11, 5) === '859,903,890', games(11, 5));
check('Bowling Buddies with Kimble and Spicer = 845,889,887', games(22, 5) === '845,889,887', games(22, 5));
check('Nutz with Phan subbing = 825,933,867', games(15, 5) === '825,933,867', games(15, 5));
check('Ruthless with Martin subbing = 945,802,794', games(17, 5) === '945,802,794', games(17, 5));
check('Big Orange with Speer back on the roster = 813,835,832', games(19, 5) === '813,835,832', games(19, 5));
check('Bowlers Anonymous = 855,904,863', games(8, 5) === '855,904,863', games(8, 5));
const eisel = live.players.find(p => p.name === 'Michael Eisel');
check('Eisel\'s week-4 blind is the one in his average: 1171 over 6',
      eisel.pins === 1171 && eisel.games === 6, eisel.pins + '/' + eisel.games);
const speer = live.players.find(p => p.name === 'Don Speer');
check('Speer\'s two sheet records are one player: 921 over 6, on Big Orange',
      speer.pins === 921 && speer.games === 6 && speer.teamId === 't19', speer.pins + '/' + speer.games);
const lawson5 = live.players.find(p => p.name === 'Oliver Lawson');
check('Lawson 2723 over 12 with no blinds in it', lawson5.pins === 2723 && lawson5.games === 12,
      lawson5.pins + '/' + lawson5.games);

// --- week 6: the same checks against the week-6 sheet ----------------------
live = at(6);
const STAND6 = {12:[17.5,14607,16104],4:[17,14639,16103],6:[16,15707,16298],16:[16,12834,16035],
  19:[16,13451,15935],10:[14,14865,16095],22:[14,14759,15959],11:[14,13929,15645],
  24:[13.5,16098,16206],3:[13,15263,15893],15:[12.5,14638,15844],7:[12,12951,15684],
  1:[12,11725,15502],23:[12,11124,15348],21:[11,13836,16023],13:[10,15359,15773],
  14:[10,13540,15682],5:[10,12449,15599],17:[10,12760,15517],2:[10,13449,15432],
  18:[9,10516,15319],8:[8,11941,15532],9:[7,13212,15765],20:[3.5,12586,15364]};
const off6 = Object.keys(STAND6).filter(n => {
  const t = team(n), s = STAND6[n];
  return through(n, 6) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 6 match the sheet', !off6.length,
      off6.map(n => n + ': ' + [through(n, 6), team(n).pins, team(n).hdcpPins] + ' v ' + STAND6[n]).join('; '));
const REV6 = {10:'1006,930,865',18:'816,815,796',20:'876,805,941',12:'858,896,943',22:'905,875,846',14:'856,870,958',
  16:'957,900,855',24:'821,923,949',17:'801,899,813',1:'776,785,865',19:'830,917,839',3:'819,864,830',
  5:'1013,911,872',21:'890,768,760',23:'875,815,979',7:'862,846,877',2:'884,842,888',9:'833,931,897',
  4:'952,839,863',11:'933,901,814',6:'873,795,800',13:'982,883,783',8:'868,900,900',15:'972,857,943'};
const offGames = Object.keys(REV6).filter(n => games(n, 6) !== REV6[n]);
check('every team\'s three handicap game totals in week 6 match the sheet', !offGames.length,
      offGames.map(n => n + ': ' + games(n, 6) + ' v ' + REV6[n]).join('; '));
check('9 Pin City with Dansby subbing, Eisel and Monroe out = 1013,911,872', games(5, 6) === '1013,911,872', games(5, 6));
check('Bowling Buddies with Hancock and Terhune subbing = 905,875,846', games(22, 6) === '905,875,846', games(22, 6));
check('Neal\'s a212 blind is the one in his team total but not in his average: 2674 over 12',
      (n => n.pins === 2674 && n.games === 12)(live.players.find(p => p.name === 'Chris Neal')), '');
const hicks = live.players.find(p => p.name === 'Wesley Hicks');
check('Hicks\' i173 counts on the night (series 520) but not in his average: 1915 over 11, still on book 36',
      hicks.pins === 1915 && hicks.games === 11 && hicks.handicap === 36 && hicks.weeks.find(w => w.number === 6).series === 520,
      hicks.pins + '/' + hicks.games + ' h' + hicks.handicap);
const dansby = live.players.find(p => p.name === 'Don Dansby');
check('Dansby, with no book, goes from 38 to 37 on his 178 average: 1070 over 6',
      dansby.pins === 1070 && dansby.games === 6 && dansby.handicap === 37 && dansby.handicapByWeek[6] === 38,
      dansby.pins + '/' + dansby.games + ' h' + dansby.handicap + ' wk6 h' + dansby.handicapByWeek[6]);
const speer6 = live.players.find(p => p.name === 'Don Speer');
check('Speer\'s 463 makes his two records one player: 1384 over 9', speer6.pins === 1384 && speer6.games === 9, speer6.pins + '/' + speer6.games);
check('Ben Deloach bowled 300', live.players.find(p => p.name === 'Ben Deloach').highGame === 300, '');

// --- week 7: the same checks against the week-7 sheet ----------------------
live = at(7);
const STAND7 = {12:[19.5,17007,18687],4:[18,17046,18735],16:[18,15016,18670],6:[17.5,18216,18891],19:[17,15707,18509],11:[17,16323,18315],24:[16.5,18750,18873],3:[16,17769,18513],
  10:[15,17305,18700],22:[15,17166,18525],15:[15,17210,18494],23:[15,13040,17972],21:[14,16137,18675],14:[14,15867,18357],13:[13,18172,18685],7:[13,15079,18202],
  5:[13,14617,18199],1:[13,13609,17971],8:[11,13998,18126],17:[11,14815,18058],2:[11,15604,17977],18:[11,12265,17860],9:[8,15196,18142],20:[4.5,14734,17929]};
const off7 = Object.keys(STAND7).filter(n => {
  const t = team(n), s = STAND7[n];
  return through(n, 7) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 7 match the sheet', !off7.length,
      off7.map(n => n + ': ' + [through(n, 7), team(n).pins, team(n).hdcpPins] + ' v ' + STAND7[n]).join('; '));
// [game 1, game 2, game 3, series, points], as in "Review of Last Week's Bowling"
const REV7 = { 22:[895,872,880,2647,2], 16:[901,834,900,2635,2], 10:[876,849,880,2605,1], 24:[955,800,912,2667,3], 12:[956,864,763,2583,2], 18:[865,892,784,2541,2],
  20:[861,830,874,2565,1], 14:[829,929,917,2675,3], 7:[889,802,827,2518,1], 21:[834,899,919,2652,3], 1:[809,861,799,2469,1], 23:[857,841,926,2624,3],
  17:[825,850,866,2541,1], 3:[830,848,942,2620,3], 5:[842,884,874,2600,3], 19:[832,850,892,2574,1], 15:[855,887,908,2650,2.5], 6:[858,887,848,2593,1.5],
  9:[819,738,820,2377,1], 8:[798,895,901,2594,3], 11:[915,829,926,2670,3], 2:[852,833,860,2545,1], 13:[986,984,942,2912,3], 4:[699,1006,927,2632,1] };
const offRev7 = Object.keys(REV7).filter(n => {
  const w = night(n, 7);
  return w.hdcpGameTotals.concat([w.hdcpSeries, w.points]).join(',') !== REV7[n].join(',');
});
check('every team\'s three handicap game totals, series and points in week 7 match the sheet', !offRev7.length,
      offRev7.map(n => n + ': ' + night(n, 7).hdcpGameTotals.concat([night(n, 7).hdcpSeries, night(n, 7).points]) + ' v ' + REV7[n]).join('; '));
// each bowler's printed "HDCP total" for the night
const HT7 = { 'Ken Grizzard':672,'Marty Tate':570,'Rick Goodwin':660,'Paul Presswood':567,'Leon Farmer':621,'Jon Boxwell':664,'Terry Cranfield':590,'Wesley Hicks':670,'Toby Crisp':657,'Wendell Defriece':658,'Robbie Defriece':592,'Keith White':713,
 'Jason Thompson':635,'Ben Deloach':698,'Jason Seda-Haas':765,'Darius Thompson':534,'Dale Dutcher':584,'Daryl Blair':632,'John Brogdon':651,'Don Dansby':733,'Spencer Foutz':694,'Cam Miller':544,'Worm Davis':628,'Alex Davis':727,
 'Davis Segui':645,'Jim Sedgwick':677,'James Gruver':575,'James Duffee':621,'Nick Grabe':660,'Mike Davis':687,'Starr Jensen':667,'Rodney Benefield':578,'Tim Charleson':567,'Darrell Smith':547,'Bobby Bryant':685,
 'Jeremy Malek':584,'Kamus Thompson':688,'John Jenner':666,'Derek Banther':667,'Josh Bomboy':700,'Josh Malek':514,'Jimmy Malek':716,'John Smeltzer':740,'Randy Dockery':582,'Cody LaCroix':643,'Jayson Scoggins':698,'Shayne Terry':660,
 'Chad Green':653,'Lynn Collins':825,'Chris Neal':491,'Steven Adler':278,'Grant Benton':665,'Yogi Cabrera':680,'Mitchell Mayo':700,'Duane Mayo':681,'Mark Youngblood':614,'Hunter Moffitt':635,'Chris Daughtry':612,'Cameron Compton':771,'Briton Helton':632,
 'John Linan':674,'Stan Stinnett':668,'Matt Linan':621,'Stonewall Stinnett':672,'Hamilton Hickman':559,'Ken Ellis':716,'Richard Simpson':667,'Joey Zinn':599,'Butch Finkbeiner':667,'Treifor Grant':619,'Paul Queen':583,'Jerry Lance':672,
 'Tanner Collins':733,'Chuck Broesche':614,'Mark Thompson':694,'Jared King':533,'Jesse Cabrera':649,'Thomas Woody':675,'Joe Morgan':586,'Keith Jackson':655,'Coty Rymer':672,'Sam Hunter':710,'Todd Deluca':648,'Matt Clark':622,
 'Porky Davis':640,'Bryant Johns':630,'Dave Terhune':653,'Lenny Kersten':724,'Al Vietor':689,'Matt Rayfield':687,'Jimmy Campbell':660,'Tyler Green':588,'Aaron White':583,'Michael Shipley':706,'Jason Day':664,'Oliver Lawson':714 };
const offHt7 = [];
live.teams.forEach(t => t.weeks.filter(w => w.number === 7).forEach(w => w.lines.forEach(l => {
  if (HT7[l.name] != null && l.hdcpSeries !== HT7[l.name]) offHt7.push(l.name + ' ' + l.hdcpSeries + ' v ' + HT7[l.name]);
})));
check('all ' + Object.keys(HT7).length + ' printed bowler handicap totals for week 7 match', !offHt7.length, offHt7.join('; '));
const hicks7 = live.players.find(p => p.name === 'Wesley Hicks');
check('Hicks\' i173 is back in his average on the week-7 sheet (handicap 41 into week 7, 2635 over 15 after it) without counting twice for the team',
      hicks7.handicapByWeek[7] === 41 && hicks7.pins === 2635 && hicks7.games === 15 && hicks7.handicap === 40 && team(2).pins === 15604,
      hicks7.handicapByWeek[7] + ' ' + hicks7.pins + '/' + hicks7.games + ' h' + hicks7.handicap + ' team ' + team(2).pins);
const terhune7 = live.players.find(p => p.name === 'Dave Terhune');
check('Terhune\'s book of 198 re-figures his week-6 night: handicap 27 lower that night, 19 now',
      terhune7.handicap === 19 && terhune7.handicapByWeek[6] === 19 && terhune7.handicapByWeek[7] === 19,
      terhune7.handicap + ' ' + JSON.stringify(terhune7.handicapByWeek));
check('Neal and Adler each bowled only some of the three games, with the handicap per game: Armenian Noodle Dippers 986,984,942',
      games(13, 7) === '986,984,942', games(13, 7));

// --- week 8: the same checks against the week-8 sheet ----------------------
live = at(8);
const STAND8 = {12:[21.5,19652,21488],24:[20.5,21453,21603],11:[20,18727,20965],6:[19.5,20761,21538],19:[19,18252,21372],4:[19,19390,21289],
  23:[19,15002,20534],16:[18,17027,21122],15:[18,19734,21057],22:[17,19614,21168],3:[17,20265,21132],21:[16,18601,21484],
  10:[16,19670,21230],14:[16,18255,21078],13:[15,20737,21325],5:[15,16643,20765],2:[15,17993,20735],7:[14,17197,20722],
  17:[14,16866,20607],1:[14,15423,20391],9:[11,17393,20762],8:[11,16009,20713],18:[11,13901,20297],20:[7.5,16870,20488]};
const off8 = Object.keys(STAND8).filter(n => {
  const t = team(n), s = STAND8[n];
  return through(n, 8) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 8 match the sheet', !off8.length,
      off8.map(n => n + ': ' + [through(n, 8), team(n).pins, team(n).hdcpPins] + ' v ' + STAND8[n]).join('; '));
const REV8 = { 9:[823,952,845,2620,3], 1:[846,789,785,2420,1], 11:[876,871,903,2650,3], 3:[875,829,915,2619,1],
  13:[883,846,911,2640,2], 5:[914,864,788,2566,2], 15:[816,876,871,2563,3], 7:[762,911,847,2520,1],
  2:[884,929,945,2758,4], 18:[834,790,813,2437,0], 4:[858,861,835,2554,1], 20:[869,816,874,2559,3],
  6:[909,891,847,2647,2], 22:[937,830,876,2643,2], 8:[858,828,901,2587,0], 24:[901,909,920,2730,4],
  10:[769,930,831,2530,1], 17:[901,805,843,2549,3], 12:[922,977,902,2801,2], 19:[891,952,1020,2863,2],
  14:[923,822,976,2721,2], 21:[915,922,972,2809,2], 16:[856,801,795,2452,0], 23:[866,838,858,2562,4] };
const offRev8 = Object.keys(REV8).filter(n => {
  const w = night(n, 8);
  return w.hdcpGameTotals.concat([w.hdcpSeries, w.points]).join(',') !== REV8[n].join(',');
});
check('every team\'s three handicap game totals, series and points in week 8 match the sheet', !offRev8.length,
      offRev8.map(n => n + ': ' + night(n, 8).hdcpGameTotals.concat([night(n, 8).hdcpSeries, night(n, 8).points]) + ' v ' + REV8[n]).join('; '));
// the printed places: ties in points go to pins plus handicap (Bowling Buddies over Old School, Big Orange over Team 4)
const PLACES8 = [12, 24, 11, 6, 19, 4, 23, 16, 15, 22, 3, 21, 10, 14, 13, 5, 2, 7, 17, 1, 9, 8, 18, 20];
const rank8 = live.teams.slice().sort((a, b) => a.trend[a.trend.length - 1].rank - b.trend[b.trend.length - 1].rank).map(t => +t.id.slice(1));
const half8 = live.halves[0].standings.map(r => +r.team.id.slice(1));
check('the team standings place all 24 teams as the week-8 sheet does, in the season and in the first half',
      rank8.join(' ') === PLACES8.join(' ') && half8.join(' ') === PLACES8.join(' '), rank8.join(' ') + ' | ' + half8.join(' '));
const HT8 = { 'Ken Grizzard':611,'Marty Tate':604,'Rick Goodwin':556,'Paul Presswood':649,'Jon Boxwell':715,'Terry Cranfield':659,'Tony Bullington':664,'Wesley Hicks':720,
 'Toby Crisp':655,'Wendell Defriece':591,'Robbie Defriece':682,'Keith White':691,'Jason Thompson':638,'Ben Deloach':643,'Jason Seda-Haas':686,'Darius Thompson':587,
 'Aaron Jones':720,'Dale Dutcher':653,'Daryl Blair':564,'Don Dansby':629,'Spencer Foutz':674,'Cam Miller':599,'Worm Davis':663,'Alex Davis':711,
 'Davis Segui':651,'Jim Sedgwick':605,'James Gruver':643,'James Duffee':621,'Steve Smith':641,'Nick Grabe':588,'Mike Davis':644,'Starr Jensen':714,
 'Rodney Benefield':632,'Tim Charleson':700,'Darrell Smith':601,'Bobby Bryant':687,'Jeremy Malek':694,'Kamus Thompson':670,'John Jenner':594,'Derek Banther':572,
 'Josh Bomboy':726,'Jimmy Malek':674,'John Smeltzer':675,'Chad Clark':575,'Randy Dockery':714,'Cody LaCroix':726,'Shayne Terry':716,'Matthew Spicer':645,
 'Chad Green':733,'Lynn Collins':731,'Chris Neal':651,'Grant Benton':525,'Yogi Cabrera':676,'Mitchell Mayo':746,'Duane Mayo':623,'Mark Youngblood':676,
 'Chris Daughtry':658,'Cameron Compton':657,'Briton Helton':685,'Michael Kimble':563,'John Linan':642,'Stan Stinnett':605,'Matt Linan':641,'Stonewall Stinnett':564,
 'Hamilton Hickman':655,'Ken Ellis':613,'Richard Simpson':664,'Joey Zinn':617,'Shane Armstrong':642,'Tanner Collins':802,'Chuck Broesche':648,'Mark Thompson':669,'Jared King':744,
 'Jesse Cabrera':636,'Thomas Woody':652,'Joe Morgan':599,'Keith Jackson':672,'Coty Rymer':811,'Sam Hunter':621,'Todd Deluca':663,'Matt Clark':714,
 'Bryant Johns':633,'Dave Terhune':603,'Lenny Kersten':651,'John Hancock':756,'Al Vietor':637,'Matt Rayfield':710,'Tyler Green':638,'Bryan Martin':577,
 'Aaron White':699,'Michael Shipley':635,'Jason Day':702,'Oliver Lawson':694 };
const offHt8 = [];
live.teams.forEach(t => t.weeks.filter(w => w.number === 8).forEach(w => w.lines.forEach(l => {
  if (HT8[l.name] != null && l.hdcpSeries !== HT8[l.name]) offHt8.push(l.name + ' ' + l.hdcpSeries + ' v ' + HT8[l.name]);
})));
check('all ' + Object.keys(HT8).length + ' printed bowler handicap totals for week 8 match', !offHt8.length, offHt8.join('; '));
// the six subs each fit their team's printed game totals to the pin
check('six teams with a sub: 9 Pin City + Dansby, We The People + Chad Clark, Hookers + Spicer, Armenian Noodle + Benton, Nutz + Kimble, Stars & Strikes + Martin',
      games(5, 8) === '914,864,788' && games(11, 8) === '876,871,903' && games(12, 8) === '922,977,902' &&
      games(13, 8) === '883,846,911' && games(15, 8) === '816,876,871' && games(23, 8) === '866,838,858',
      [5, 11, 12, 13, 15, 23].map(n => games(n, 8)).join(' | '));
const armstrong = live.players.find(p => p.name === 'Shane Armstrong');
check('Shane Armstrong\'s first night is on a handicap off the 163 he bowled (51), for Team 18',
      armstrong.handicapByWeek[8] === 51 && armstrong.pins === 489 && armstrong.games === 3 && night(18, 8).lines.some(l => l.name === 'Shane Armstrong'),
      armstrong.handicapByWeek[8] + ' ' + armstrong.pins + '/' + armstrong.games);
const spicer8 = live.players.find(p => p.name === 'Matthew Spicer');
check('Spicer\'s week-8 night confirms week 7: 4613 over 21 less 645 is the 3968 over 18 entered then',
      spicer8.pins === 4613 && spicer8.games === 21 && spicer8.handicap === 0 && at(7).players.find(p => p.name === 'Matthew Spicer').pins === 3968,
      spicer8.pins + '/' + spicer8.games);

// --- week 9: the same checks against the week-9 sheet ----------------------
live = at(9);
const STAND9 = {12:[24.5,22110,24084],6:[23.5,23457,24339],11:[22,21027,23520],16:[21,19098,23652],24:[20.5,24044,24215],19:[20,20525,23924],
  23:[20,16809,23037],10:[19,22266,24000],14:[19,20694,23835],15:[19,22309,23710],4:[19,21570,23673],13:[18,23524,24139],
  22:[18,21956,23750],5:[18,18952,23461],21:[17,20869,23986],3:[17,22638,23634],2:[16.5,20253,23373],1:[16,17441,23015],
  9:[15,19612,23401],7:[15,19400,23333],17:[15,19082,23192],18:[15,15590,22787],8:[14,18186,23460],20:[10,19148,23231]};
const off9 = Object.keys(STAND9).filter(n => {
  const t = team(n), s = STAND9[n];
  return through(n, 9) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 9 match the sheet', !off9.length,
      off9.map(n => n + ': ' + [through(n, 9), team(n).pins, team(n).hdcpPins] + ' v ' + STAND9[n]).join('; '));
const REV9 = { 13:[937,926,951,2814,3], 7:[971,813,827,2611,1], 15:[947,880,826,2653,1], 5:[888,948,860,2696,3],
  9:[850,899,890,2639,4], 3:[762,873,867,2502,0], 11:[791,870,894,2555,2], 1:[882,850,892,2624,2],
  8:[949,855,943,2747,3], 22:[893,880,809,2582,1], 6:[867,949,985,2801,4], 24:[812,889,911,2612,0],
  4:[775,859,750,2384,0], 18:[833,889,768,2490,4], 2:[830,897,911,2638,1.5], 20:[947,885,911,2743,2.5],
  14:[968,905,884,2757,3], 23:[809,807,887,2503,1], 16:[816,805,909,2530,3], 21:[781,823,898,2502,1],
  10:[1009,959,802,2770,3], 19:[901,835,816,2552,1], 12:[906,833,857,2596,3], 17:[836,831,918,2585,1] };
const offRev9 = Object.keys(REV9).filter(n => {
  const w = night(n, 9);
  return w.hdcpGameTotals.concat([w.hdcpSeries, w.points]).join(',') !== REV9[n].join(',');
});
check('every team\'s three handicap game totals, series and points in week 9 match the sheet', !offRev9.length,
      offRev9.map(n => n + ': ' + night(n, 9).hdcpGameTotals.concat([night(n, 9).hdcpSeries, night(n, 9).points]) + ' v ' + REV9[n]).join('; '));
const HT9 = { 'Ken Grizzard':682,'Ed Curtis':612,'Marty Tate':687,'Paul Presswood':643,'Leon Farmer':646,'Jon Boxwell':587,'Terry Cranfield':689,'Wesley Hicks':716,
 'Toby Crisp':631,'Wendell Defriece':683,'Robbie Defriece':596,'Keith White':592,'Jason Thompson':654,'Ben Deloach':554,'Jason Seda-Haas':631,'Darius Thompson':545,
 'Dale Dutcher':664,'Daryl Blair':623,'John Brogdon':652,'Bryan Martin':757,'Cam Miller':705,'Worm Davis':732,'Alex Davis':655,'Benson Colburn':709,
 'Davis Segui':539,'Jim Sedgwick':677,'James Gruver':663,'James Duffee':732,'Steve Smith':703,'Nick Grabe':668,'Mike Davis':641,'Starr Jensen':735,
 'Rodney Benefield':733,'Tim Charleson':700,'Darrell Smith':558,'Bobby Bryant':648,'Jeremy Malek':672,'Kamus Thompson':675,'John Jenner':641,'Derek Banther':782,
 'Josh Bomboy':667,'Josh Malek':664,'Jimmy Malek':669,'John Smeltzer':555,'Randy Dockery':632,'Cody LaCroix':652,'Shayne Terry':668,'Matthew Spicer':644,
 'Chad Green':744,'Lynn Collins':710,'Chris Neal':587,'Steven Adler':773,'Yogi Cabrera':721,'Mitchell Mayo':623,'Duane Mayo':673,'Mark Youngblood':740,
 'Hunter Moffitt':741,'Chris Daughtry':616,'Cameron Compton':642,'John Brooks':654,'Ken Ellis':622,'Richard Simpson':605,'Joey Zinn':636,'Avery Rhoden':722,
 'Butch Finkbeiner':690,'Treifor Grant':597,'Paul Queen':634,'Jerry Lance':569,'Tanner Collins':614,'Chuck Broesche':645,'Mark Thompson':618,'Jared King':675,
 'Jesse Cabrera':739,'Thomas Woody':681,'Tim Berthianne':715,'Joe Morgan':608,'Coty Rymer':632,'Sam Hunter':691,'Matt Clark':543,'John Hancock':636,
 'Porky Davis':722,'Bryant Johns':594,'Dave Terhune':631,'Lenny Kersten':635,'Al Vietor':639,'Matt Rayfield':634,'Jimmy Campbell':582,'Tyler Green':648,
 'Aaron White':618,'Michael Shipley':701,'Jason Day':665,'Oliver Lawson':628 };
const offHt9 = [];
live.teams.forEach(t => t.weeks.filter(w => w.number === 9).forEach(w => w.lines.forEach(l => {
  if (HT9[l.name] != null && l.hdcpSeries !== HT9[l.name]) offHt9.push(l.name + ' ' + l.hdcpSeries + ' v ' + HT9[l.name]);
})));
check('all ' + Object.keys(HT9).length + ' printed bowler handicap totals for week 9 match', !offHt9.length, offHt9.join('; '));
const PLACES9 = [12, 6, 11, 16, 24, 19, 23, 10, 14, 15, 4, 13, 22, 5, 21, 3, 2, 1, 9, 7, 17, 18, 8, 20];
const rank9 = live.teams.slice().sort((a, b) => a.trend[a.trend.length - 1].rank - b.trend[b.trend.length - 1].rank).map(t => +t.id.slice(1));
check('the team standings place all 24 teams as the week-9 sheet does', rank9.join(' ') === PLACES9.join(' '), rank9.join(' '));
check('the three subs fit their teams\' printed game totals: Brogdon and Martin for 9 Pin City, Spicer for Hookers and Bowl',
      games(5, 9) === '888,948,860' && games(12, 9) === '906,833,857', games(5, 9) + ' | ' + games(12, 9));
check('Hancock is printed under Bowling Buddies but bowled for Team 21, whose totals only fit that way',
      games(21, 9) === '781,823,898' && games(22, 9) === '893,880,809' && night(21, 9).lines.some(l => l.name === 'John Hancock') && !night(22, 9).lines.some(l => l.name === 'John Hancock'),
      games(21, 9) + ' | ' + games(22, 9));
check('three new bowlers: first night on a handicap off the average they bowled (Colburn 0, Brooks 9, Rhoden 0)',
      ['Benson Colburn', 'John Brooks', 'Avery Rhoden'].map(n => live.players.find(p => p.name === n).handicapByWeek[9]).join() === '0,9,0',
      ['Benson Colburn', 'John Brooks', 'Avery Rhoden'].map(n => live.players.find(p => p.name === n).handicapByWeek[9]).join());

// --- week 10: the same checks against the week-10 sheet ---------------------
live = at(10);
const STAND10 = {1:[16,19364,25583],2:[20.5,22596,26088],3:[18,25306,26437],4:[19,23870,26186],5:[18,20963,26015],6:[26.5,26062,27037],7:[16,21585,25917],8:[17,20142,25971],9:[19,21889,26095],10:[23,24789,26679],11:[25,23413,26164],12:[27.5,24760,26899],13:[22,26225,26858],14:[20,22907,26342],15:[22,25117,26578],16:[21,21101,26192],17:[18,21141,25761],18:[16,17323,25330],19:[24,23026,26710],20:[11,21124,25654],21:[17,23032,26440],22:[18,24200,26270],23:[21,18946,25750],24:[24.5,26715,26952]};
const off10 = Object.keys(STAND10).filter(n => {
  const t = team(n), s = STAND10[n];
  return through(n, 10) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 10 match the sheet', !off10.length,
      off10.map(n => n + ': ' + [through(n, 10), team(n).pins, team(n).hdcpPins] + ' v ' + STAND10[n]).join('; '));
const REV10 = {1:[822,836,910,2568,0],2:[847,935,933,2715,4],3:[979,964,860,2803,1],4:[806,803,904,2513,0],5:[809,897,848,2554,0],6:[860,924,914,2698,3],7:[799,892,893,2584,1],8:[836,806,869,2511,3],9:[884,939,871,2694,4],10:[868,904,907,2679,4],11:[845,946,853,2644,3],12:[885,973,957,2815,3],13:[869,900,950,2719,4],14:[821,846,840,2507,1],15:[948,992,928,2868,3],16:[854,790,896,2540,0],17:[850,837,882,2569,3],18:[839,942,762,2543,1],19:[856,996,934,2786,4],20:[822,815,786,2423,1],21:[789,768,897,2454,0],22:[786,872,862,2520,0],23:[894,897,922,2713,1],24:[866,942,929,2737,4]};
const offRev10 = Object.keys(REV10).filter(n => {
  const w = night(n, 10);
  return w.hdcpGameTotals.concat([w.hdcpSeries, w.points]).join(',') !== REV10[n].join(',');
});
check('every team\'s three handicap game totals, series and points in week 10 match the sheet', !offRev10.length,
      offRev10.map(n => n + ': ' + night(n, 10).hdcpGameTotals.concat([night(n, 10).hdcpSeries, night(n, 10).points]) + ' v ' + REV10[n]).join('; '));
const HT10 = {'Ken Grizzard':628,'Ed Curtis':587,'Rick Goodwin':657,'Paul Presswood':696,'Marty Tate':623,'Leon Farmer':665,'Jon Boxwell':658,'Terry Cranfield':720,'Wesley Hicks':672,'Toby Crisp':693,'Wendell Defriece':763,'Robbie Defriece':699,'Keith White':648,'Jason Thompson':593,'Ben Deloach':627,'Jason Seda-Haas':634,'Darius Thompson':659,'Aaron Jones':642,'Dale Dutcher':622,'Daryl Blair':606,'Don Dansby':684,'Spencer Foutz':626,'Cam Miller':683,'Worm Davis':724,'Alex Davis':665,'Benson Colburn':659,'Davis Segui':579,'Jim Sedgwick':772,'James Gruver':620,'James Duffee':613,'Steve Smith':605,'Nick Grabe':532,'Mike Davis':651,'Starr Jensen':723,'Rodney Benefield':677,'Tim Charleson':694,'Darrell Smith':611,'Bobby Bryant':712,'Jeremy Malek':687,'Kamus Thompson':692,'John Jenner':632,'Derek Banther':668,'Josh Bomboy':644,'Josh Malek':680,'Jimmy Malek':606,'John Smeltzer':714,'Randy Dockery':622,'Cody LaCroix':738,'Jayson Scoggins':781,'Shayne Terry':674,'Chad Green':614,'Lynn Collins':702,'Chris Neal':728,'Steven Adler':675,'Yogi Cabrera':583,'Duane Mayo':635,'Mark Youngblood':588,'Matthew Spicer':701,'Hunter Moffitt':706,'Cameron Compton':726,'Briton Helton':777,'Stonewall Stinnett':608,'Hamilton Hickman':578,'Ken Ellis':641,'Richard Simpson':716,'Joey Zinn':634,'Avery Rhoden':715,'Butch Finkbeiner':615,'Treifor Grant':629,'Paul Queen':661,'Jerry Lance':638,'Tanner Collins':687,'Chuck Broesche':769,'Mark Thompson':638,'Jared King':692,'Jesse Cabrera':598,'Thomas Woody':649,'Tim Berthianne':534,'Joe Morgan':642,'Coty Rymer':563,'Sam Hunter':684,'Matt Clark':562,'Michael Kimble':645,'Porky Davis':647,'Bryant Johns':583,'Dave Terhune':645,'Lenny Kersten':645,'Matt Rayfield':730,'Jimmy Campbell':685,'Tyler Green':711,'Bryan Martin':587,'Aaron White':605,'Jason Day':761,'James Campbell':656};
const offHt10 = [];
live.teams.forEach(t => t.weeks.filter(w => w.number === 10).forEach(w => w.lines.forEach(l => {
  if (HT10[l.name] != null && l.hdcpSeries !== HT10[l.name]) offHt10.push(l.name + ' ' + l.hdcpSeries + ' v ' + HT10[l.name]);
})));
check('all ' + Object.keys(HT10).length + ' printed bowler handicap totals for week 10 match', !offHt10.length, offHt10.join('; '));
const PLACES10 = [12, 6, 11, 24, 19, 10, 13, 15, 16, 23, 2, 14, 4, 9, 3, 22, 5, 17, 21, 8, 7, 1, 18, 20];
const rank10 = live.teams.slice().sort((a, b) => a.trend[a.trend.length - 1].rank - b.trend[b.trend.length - 1].rank).map(t => +t.id.slice(1));
check('the team standings place all 24 teams as the week-10 sheet does', rank10.join(' ') === PLACES10.join(' '), rank10.join(' '));
check('four subs fit their teams\' printed game totals: Dansby for 9 Pin City, Spicer for Too Easy, Kimble for Team 21, Martin for Stars & Strikes',
      games(5, 10) === '809,897,848' && games(14, 10) === '821,846,840' && games(21, 10) === '789,768,897' && games(23, 10) === '894,897,922',
      [5, 14, 21, 23].map(n => games(n, 10)).join(' | '));
check('Tate, Colburn and Rhoden are printed under their own teams but bowled for Balls Out, Nutz and Team 24, whose totals only fit that way',
      games(16, 10) === '854,790,896' && games(15, 10) === '948,992,928' && games(24, 10) === '866,942,929' &&
      night(16, 10).lines.some(l => l.name === 'Marty Tate') && night(15, 10).lines.some(l => l.name === 'Benson Colburn') && night(24, 10).lines.some(l => l.name === 'Avery Rhoden') &&
      !night(1, 10).lines.some(l => l.name === 'Marty Tate') && !night(6, 10).lines.some(l => l.name === 'Benson Colburn') && !night(17, 10).lines.some(l => l.name === 'Avery Rhoden'),
      [16, 15, 24].map(n => games(n, 10)).join(' | '));
const campbell = live.players.find(p => p.name === 'James Campbell');
check('James Campbell\'s first night is on a handicap off the 205 he bowled (13), for Team 24',
      campbell.handicapByWeek[10] === 13 && campbell.pins === 617 && campbell.games === 3 && night(24, 10).lines.some(l => l.name === 'James Campbell'),
      campbell.handicapByWeek[10] + ' ' + campbell.pins + '/' + campbell.games);
const day10 = live.players.find(p => p.name === 'Jason Day');
check('Jason Day\'s 300 in game 2 makes his night 761 and his high game 300',
      night(24, 10).lines.find(l => l.name === 'Jason Day').series === 761 && day10.highGame === 300, String(day10.highGame));

// the new rules, on the fixture
{
  const fx2 = JSON.parse(JSON.stringify(fx));
  fx2.players[1].noBook = true;                       // Lent Lou: first night off the 200 he bowled
  fx2.players[1].entryAverage = 200;
  fx2.weeks[0].scores[1] = { playerId: 'p2', teamId: 'b', games: [200, 200, 200], outOfAverage: [3] };
  fx2.weeks.push({ number: 2, date: '2026-09-15', scores: [{ playerId: 'p2', teamId: 'b', games: [150, 150, 150] }], matches: [] });
  const mm = build(fx2);
  const lou = mm.players.find(p => p.id === 'p2');
  check('an outOfAverage game counts in the night\'s series but not in games, pins or average',
        lou.weeks[0].series === 600 && lou.games === 5 && lou.pins === 400 + 450, lou.games + '/' + lou.pins);
  check('a noBook bowler is handicapped off their average so far from the second night',
        lou.handicapByWeek[1] === handicapOf(200) && lou.handicapByWeek[2] === handicapOf(200), JSON.stringify(lou.handicapByWeek));
}
function handicapOf(avg) { return Math.max(0, Math.floor((220 - avg) * 0.9)); }

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall line-rule assertions passed');
process.exit(fails.length ? 1 : 0);
