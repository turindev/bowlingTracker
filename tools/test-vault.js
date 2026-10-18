/* The private vault: encryption, device storage, GitHub sync and merging,
   against a small in-memory stand-in for the GitHub API. */
const Vault = require('../js/vault.js');

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));

const { fakeGitHub } = require('./fake-github.js');

function memoryStorage() {
  const m = {};
  return {
    get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; }, remove: k => { delete m[k]; },
    dump: () => JSON.stringify(m),
  };
}

function memoryKeystore() {
  let rec = null;
  return { get: async () => rec, set: async v => { rec = v; }, clear: async () => { rec = null; } };
}

const PASS = 'correct horse battery staple';
const device = (gh, extra) => {
  const storage = memoryStorage();
  const keystore = memoryKeystore();
  const vault = Vault.create(Object.assign({ fetch: gh.fetch, storage, keystore }, extra));
  return { vault, storage, keystore };
};
const throws = async fn => { try { await fn(); return null; } catch (e) { return e; } };
const game = (id, at, extra) => Object.assign({ id, date: '2026-10-18', status: 'done', frames: [], updatedAt: at }, extra);

(async () => {
  // --- the crypto ------------------------------------------------------------
  const salt = new Uint8Array(16).fill(7);
  const k1 = await Vault._deriveKey(PASS, salt, 1000);
  const kdf = { name: 'PBKDF2', hash: 'SHA-256', iterations: 1000, salt: Buffer.from(salt).toString('base64') };
  const sealed = await Vault._seal(k1, kdf, { secret: 'SECRET-NOTE', n: [1, 2, 3] });
  check('sealed data round-trips', JSON.stringify(await Vault._unseal(k1, sealed)) === '{"secret":"SECRET-NOTE","n":[1,2,3]}', '');
  check('the sealed file does not contain the plaintext', !JSON.stringify(sealed).includes('SECRET-NOTE'), '');
  const sealedAgain = await Vault._seal(k1, kdf, { secret: 'SECRET-NOTE', n: [1, 2, 3] });
  check('every write uses a fresh IV, so the ciphertext changes', sealed.iv !== sealedAgain.iv && sealed.ciphertext !== sealedAgain.ciphertext, '');
  const wrong = await Vault._deriveKey(PASS + '!', salt, 1000);
  const e1 = await throws(() => Vault._unseal(wrong, sealed));
  check('the wrong key is refused with a clear error', e1 && e1.code === 'bad-passphrase', e1 && e1.code);
  const tampered = Object.assign({}, sealed, { ciphertext: sealed.ciphertext.slice(0, -4) + 'AAAA' });
  const e2 = await throws(() => Vault._unseal(k1, tampered));
  check('tampered ciphertext is refused', e2 && e2.code === 'bad-passphrase', '');
  check('compression is used when available', sealed.z === 'gzip', sealed.z);

  // --- first-time setup and the first sync --------------------------------------
  const gh = fakeGitHub();
  const A = device(gh);
  const weak = await throws(() => A.vault.setup('short'));
  check('a short passphrase is refused', weak && weak.code === 'weak', weak && weak.code);

  await A.vault.setup(PASS);
  check('setup unlocks the vault with an empty library', A.vault.isUnlocked() && A.vault.library().games.length === 0, '');
  check('and keeps an encrypted copy on the device', A.vault.hasLocal(), '');

  await A.vault.commit(lib => {
    lib.balls.push({ id: 'b1', name: 'Hammer Black Widow', updatedAt: '2026-10-18T10:00:00Z' });
    lib.games.push(game('g1', '2026-10-18T10:05:00Z', { notes: 'SECRET-NOTE', pattern: 'Kegel Flagship' }));
  });
  check('a change marks the vault as not yet synced', A.vault.info.dirty === true, '');

  const noToken = await throws(() => A.vault.sync());
  check('syncing without a token says so, and keeps the data', noToken && noToken.code === 'no-token' && A.vault.library().games.length === 1, noToken && noToken.code);
  check('nothing was written to GitHub without a token', !gh.log.some(l => l.method !== 'GET'), JSON.stringify(gh.log.map(l => l.method)));

  await A.vault.setToken('github_pat_SECRETTOKEN');
  check('the token is stored encrypted on the device', !A.storage.dump().includes('SECRETTOKEN'), '');
  const synced = await A.vault.sync();
  check('with a token the first sync creates the data branch', synced.pushed === true && !!gh.repo.branches['bowling-data'], JSON.stringify(synced));
  check('and is no longer dirty', A.vault.info.dirty === false, '');
  const writes = gh.log.filter(l => l.method !== 'GET');
  check('writes carried the token', writes.length > 0 && writes.every(l => l.auth === 'Bearer github_pat_SECRETTOKEN'), JSON.stringify(writes.map(w => w.auth)));
  const everything = JSON.stringify(gh.log) + JSON.stringify(gh.repo);
  check('nothing readable left the device: no note, ball, pattern, passphrase',
        !/SECRET-NOTE|Hammer|Kegel|battery staple/.test(everything), '');
  const file = JSON.parse(gh.repo.branches['bowling-data']['bowling.enc.json'].text);
  check('the file on GitHub is the encrypted format', file.format === Vault.FORMAT && file.kdf.iterations === 600000 && !!file.ciphertext, '');
  const orphan = Object.values(gh.repo.commits)[0];
  check('the data branch is an orphan commit with no site files', orphan.parents.length === 0 && Object.keys(gh.repo.branches['bowling-data']).join() === 'bowling.enc.json', '');

  // --- a second device -------------------------------------------------------------
  const B = device(gh);
  const exists = await throws(() => B.vault.setup('another long passphrase here'));
  check('setup is refused when a vault already exists', exists && exists.code === 'exists', exists && exists.code);
  const bad = await throws(() => B.vault.unlock('not the passphrase at all'));
  check('the wrong passphrase cannot open it, and nothing unlocks', bad && bad.code === 'bad-passphrase' && !B.vault.isUnlocked(), bad && bad.code);
  await B.vault.unlock(PASS);
  check('the right passphrase opens it on a fresh device, no token needed',
        B.vault.isUnlocked() && B.vault.library().games[0].notes === 'SECRET-NOTE' && B.vault.library().balls[0].name === 'Hammer Black Widow', '');
  check('reading used no token on a device without one', gh.log.filter(l => l.method === 'GET').slice(-1)[0].auth === null, '');

  // --- merging two devices ------------------------------------------------------------
  await B.vault.setToken('github_pat_B');
  await A.vault.commit(lib => lib.games.push(game('g2', '2026-10-19T10:00:00Z', { notes: 'from A' })));
  await B.vault.commit(lib => lib.games.push(game('g3', '2026-10-19T11:00:00Z', { notes: 'from B' })));
  await A.vault.sync();
  await B.vault.sync();
  await A.vault.sync();
  const ids = v => v.vault.library().games.map(g => g.id).sort().join();
  check('both devices end with all three games', ids(A) === 'g1,g2,g3' && ids(B) === 'g1,g2,g3', ids(A) + ' | ' + ids(B));

  // a write that loses a race is retried against the new remote
  await A.vault.commit(lib => lib.games.push(game('g4', '2026-10-20T10:00:00Z')));
  gh.beforePut = () => {
    const f = gh.repo.branches['bowling-data']['bowling.enc.json'];
    f.sha = 'raced';
  };
  const raced = await A.vault.sync();
  check('a lost race is retried and still lands', raced.pushed === true && JSON.parse(gh.repo.branches['bowling-data']['bowling.enc.json'].text).format === Vault.FORMAT, '');
  await B.vault.sync();
  check('and the other device receives it', ids(B) === 'g1,g2,g3,g4', ids(B));

  // later edit wins; deletion propagates
  await A.vault.commit(lib => { lib.games.find(g => g.id === 'g2').notes = 'A edited'; lib.games.find(g => g.id === 'g2').updatedAt = '2026-10-21T10:00:00Z'; });
  await B.vault.commit(lib => { lib.games.find(g => g.id === 'g2').notes = 'B older edit'; lib.games.find(g => g.id === 'g2').updatedAt = '2026-10-20T10:00:00Z'; });
  await A.vault.sync(); await B.vault.sync();
  check('the later edit wins whichever device it came from', B.vault.library().games.find(g => g.id === 'g2').notes === 'A edited', '');
  await B.vault.commit(lib => { const g = lib.games.find(g => g.id === 'g3'); g.deleted = true; g.updatedAt = '2026-10-22T10:00:00Z'; });
  await B.vault.sync(); await A.vault.sync();
  check('a deletion travels as a record and wins', A.vault.library().games.find(g => g.id === 'g3').deleted === true, '');

  // --- no signal ---------------------------------------------------------------------------
  gh.offline = true;
  await A.vault.commit(lib => lib.games.push(game('g5', '2026-10-23T10:00:00Z', { notes: 'bowled offline' })));
  const off = await throws(() => A.vault.sync());
  check('with no signal a game is still saved on the device', off && off.code === 'network' && A.vault.library().games.some(g => g.id === 'g5'), off && off.code);
  check('and stays marked unsynced', A.vault.info.dirty === true, '');

  // the page is closed and reopened: a new vault object on the same storage
  await A.vault.remember(30);
  const reopened = Vault.create({ fetch: gh.fetch, storage: A.storage, keystore: A.keystore });
  check('reopening on the device is still dirty', reopened.info.dirty === true, '');
  const back = await reopened.unlockRemembered();
  check('a remembered key reopens the vault with no passphrase, offline, with the unsynced game',
        back === true && reopened.library().games.some(g => g.id === 'g5'), '');
  gh.offline = false;
  await reopened.sync();
  const C = device(gh);
  await C.vault.unlock(PASS);
  check('then the offline game syncs up and a fresh device sees it', C.vault.library().games.some(g => g.id === 'g5'), '');

  const forgot = Vault.create({ fetch: gh.fetch, storage: A.storage, keystore: memoryKeystore() });
  check('without a remembered key the passphrase is needed', (await forgot.unlockRemembered()) === false && !forgot.isUnlocked(), '');
  await A.vault.forget();
  check('forgetting removes the remembered key', (await A.vault.isRemembered()) === false, '');
  const expired = device(gh);
  await expired.keystore.set({ key: {}, kdf: { salt: 'x' }, expires: Date.now() - 1000 });
  check('an expired remembered key is not used', (await expired.vault.unlockRemembered()) === false && (await expired.keystore.get()) === null, '');

  // --- large files and locking ------------------------------------------------------------------
  const gh2 = fakeGitHub({ hideContent: true });
  const D = device(gh2);
  await D.vault.setup(PASS); await D.vault.setToken('t'); await D.vault.sync();
  const E = device(gh2);
  await E.vault.unlock(PASS);
  check('a file too big for the JSON contents response is read as raw', E.vault.isUnlocked(), '');

  A.vault.lock();
  check('locking drops the library from memory', !A.vault.isUnlocked() && A.vault.library() === null, '');
  const locked = await throws(() => A.vault.commit(() => {}));
  check('a locked vault refuses changes', locked && locked.code === 'locked', '');
  await A.vault.wipeLocal();
  check('wiping removes everything from the device', !A.vault.hasLocal() && !A.vault.hasToken(), '');

  // --- pure merge -------------------------------------------------------------------------------
  const m = Vault.mergeLibraries(
    { balls: [], games: [{ id: 'a', updatedAt: '2' }, { id: 'b', updatedAt: '1', x: 'mine' }] },
    { balls: [], games: [{ id: 'b', updatedAt: '1', x: 'theirs' }, { id: 'c', updatedAt: '3' }] });
  check('merge is a union by id', m.games.map(g => g.id).join() === 'a,b,c', '');
  check('a tie keeps the local copy', m.games.find(g => g.id === 'b').x === 'mine', '');

  console.log(ok.map(s => '  ok  ' + s).join('\n'));
  console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                           : '\nall vault assertions passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
