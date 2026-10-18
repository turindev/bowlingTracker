/*
 * The private vault: where the shot tracker keeps your games.
 *
 * This site is public, so nothing private can sit on it in the clear. The
 * library (balls and games) is encrypted in the browser with a key made from
 * your passphrase, and only the ciphertext ever leaves the device:
 *
 *   - The encrypted file lives on its own branch of the repo (`bowling-data`),
 *     so saving never redeploys the site and the history is a free backup.
 *   - Reading it needs no token — it is ciphertext anyone can fetch but only
 *     your passphrase opens. Writing needs a fine-grained GitHub token, which
 *     is kept on the device (itself encrypted by the passphrase key).
 *   - The device keeps its own encrypted copy, so a game can be bowled with no
 *     signal and synced afterwards. Two devices merge by game, newest edit wins.
 *
 * Crypto is WebCrypto only: PBKDF2-SHA256 (600k rounds) into AES-256-GCM, a
 * fresh IV for every write. Works in the browser (window.Vault) and Node
 * (module.exports) so it can be tested.
 */
(function () {
  'use strict';

  var FORMAT = 'leaguecraft-private-v1';
  var ITERATIONS = 600000;
  var MIN_PASSPHRASE = 12;
  var DEFAULTS = {
    repo: 'turindev/bowlingTracker',
    branch: 'bowling-data',
    path: 'bowling.enc.json',
  };

  var root = typeof globalThis !== 'undefined' ? globalThis : window;

  function VaultError(code, message, detail) {
    var e = new Error(message);
    e.name = 'VaultError';
    e.code = code;
    e.detail = detail;
    return e;
  }

  /* ---------- bytes ---------- */

  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }

  function fromB64(text) {
    var s = atob(text);
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function utf8(text) { return new TextEncoder().encode(text); }

  async function pipe(bytes, stream) {
    var writer = stream.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Uint8Array(await new Response(stream.readable).arrayBuffer());
  }

  /* ---------- crypto ---------- */

  function subtle() {
    var c = root.crypto;
    if (!c || !c.subtle) {
      throw VaultError('no-crypto', 'This browser cannot do encryption here. Use https and a current browser.');
    }
    return c.subtle;
  }

  function randomBytes(n) {
    var out = new Uint8Array(n);
    root.crypto.getRandomValues(out);
    return out;
  }

  async function deriveKey(passphrase, salt, iterations) {
    var base = await subtle().importKey(
      'raw', utf8(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  /* Encrypts a JSON value into the file format. */
  async function seal(key, kdf, value) {
    var raw = utf8(JSON.stringify(value));
    var packed = null;
    if (typeof CompressionStream !== 'undefined') {
      try { packed = await pipe(raw, new CompressionStream('gzip')); } catch (e) { packed = null; }
    }
    var iv = randomBytes(12);
    var cipher = await subtle().encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: utf8(FORMAT) }, key, packed || raw);
    return {
      format: FORMAT,
      kdf: kdf,
      z: packed ? 'gzip' : null,
      iv: toB64(iv),
      ciphertext: toB64(new Uint8Array(cipher)),
    };
  }

  async function unseal(key, file) {
    var plain;
    try {
      plain = new Uint8Array(await subtle().decrypt(
        { name: 'AES-GCM', iv: fromB64(file.iv), additionalData: utf8(FORMAT) },
        key, fromB64(file.ciphertext)));
    } catch (e) {
      throw VaultError('bad-passphrase', 'That passphrase does not open this vault.');
    }
    if (file.z === 'gzip') plain = await pipe(plain, new DecompressionStream('gzip'));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function parseFile(text) {
    var file;
    try { file = JSON.parse(text); } catch (e) { file = null; }
    if (!file || file.format !== FORMAT || !file.kdf || !file.iv || !file.ciphertext) {
      throw VaultError('bad-file', 'The vault file is not in a format this page understands.');
    }
    return file;
  }

  /* ---------- the library ---------- */

  function emptyLibrary() { return { v: 1, balls: [], games: [] }; }

  function newer(a, b) {
    return String((a && a.updatedAt) || '') >= String((b && b.updatedAt) || '') ? a : b;
  }

  function mergeList(mine, theirs) {
    var byId = {};
    (mine || []).forEach(function (item) { byId[item.id] = item; });
    (theirs || []).forEach(function (item) {
      byId[item.id] = byId[item.id] ? newer(byId[item.id], item) : item;
    });
    return Object.keys(byId).sort().map(function (id) { return byId[id]; });
  }

  /* Union by id; where both sides have an item the later edit wins, and ties
     keep the local one. Deletions travel as `deleted: true` records. */
  function mergeLibraries(mine, theirs) {
    var merged = {
      v: 1,
      balls: mergeList(mine && mine.balls, theirs && theirs.balls),
      games: mergeList(mine && mine.games, theirs && theirs.games),
    };
    /* Settings are one record: the later edit wins. */
    var mineSet = mine && mine.settings, theirSet = theirs && theirs.settings;
    var settings = mineSet && theirSet ? newer(mineSet, theirSet) : (mineSet || theirSet);
    if (settings) merged.settings = settings;
    return merged;
  }

  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* ---------- GitHub ---------- */

  function github(cfg) {
    var base = 'https://api.github.com/repos/' + cfg.repo;

    async function call(method, url, body, accept) {
      var headers = {
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      var token = cfg.token ? await cfg.token() : null;
      if (token) headers.Authorization = 'Bearer ' + token;
      if (body) headers['Content-Type'] = 'application/json';
      var res;
      try {
        res = await cfg.fetch(url, {
          method: method, headers: headers, cache: 'no-store',
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        throw VaultError('network', 'Could not reach GitHub. Your games are saved on this device.');
      }
      return res;
    }

    function fail(res, what) {
      if (res.status === 401 || res.status === 403) {
        return VaultError('auth', 'GitHub refused the token (' + res.status + '). Check it has Contents: read and write on this repo, and has not expired.');
      }
      if (res.status === 409) return VaultError('conflict', 'The vault changed on GitHub while saving.');
      return VaultError('github', what + ' failed (' + res.status + ').', res.status);
    }

    var contentsUrl = base + '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/');

    return {
      /* The encrypted file and its sha, or null if the branch or file is not there yet. */
      async getFile() {
        var url = contentsUrl + '?ref=' + encodeURIComponent(cfg.branch) + '&_=' + Date.now();
        var res = await call('GET', url);
        if (res.status === 404) return null;
        if (!res.ok) throw fail(res, 'Reading the vault');
        var meta = await res.json();
        var text;
        if (meta.content && meta.encoding === 'base64') {
          text = new TextDecoder().decode(fromB64(meta.content.replace(/\s/g, '')));
        } else {
          var raw = await call('GET', url, null, 'application/vnd.github.raw+json');
          if (!raw.ok) throw fail(raw, 'Reading the vault');
          text = await raw.text();
        }
        return { sha: meta.sha, text: text };
      },

      async putFile(text, sha, message) {
        var res = await call('PUT', contentsUrl, {
          message: message, branch: cfg.branch,
          content: toB64(utf8(text)), sha: sha || undefined,
        });
        if (res.status === 422 && sha) throw VaultError('conflict', 'The vault changed on GitHub while saving.');
        if (!res.ok) throw fail(res, 'Saving the vault');
        return (await res.json()).content.sha;
      },

      /* First save ever: an orphan commit holding only the file, so the data
         branch carries none of the site. */
      async createBranch(text, message) {
        var blob = await call('POST', base + '/git/blobs', { content: toB64(utf8(text)), encoding: 'base64' });
        if (!blob.ok) throw fail(blob, 'Creating the data branch');
        var tree = await call('POST', base + '/git/trees', {
          tree: [{ path: cfg.path, mode: '100644', type: 'blob', sha: (await blob.json()).sha }],
        });
        if (!tree.ok) throw fail(tree, 'Creating the data branch');
        var commit = await call('POST', base + '/git/commits', {
          message: message, tree: (await tree.json()).sha, parents: [],
        });
        if (!commit.ok) throw fail(commit, 'Creating the data branch');
        var ref = await call('POST', base + '/git/refs', {
          ref: 'refs/heads/' + cfg.branch, sha: (await commit.json()).sha,
        });
        if (ref.status === 422) return false;   /* the branch already exists */
        if (!ref.ok) throw fail(ref, 'Creating the data branch');
        return true;
      },
    };
  }

  /* ---------- the vault ---------- */

  function create(options) {
    var cfg = Object.assign({}, DEFAULTS, options || {});
    var storage = cfg.storage;          /* { get, set, remove } — synchronous */
    var keystore = cfg.keystore || null; /* { get, set, clear } — async, optional */
    var doFetch = cfg.fetch || (root.fetch && root.fetch.bind(root));
    var LOCAL = 'lc-private-v1';
    var TOKEN = 'lc-private-token';
    var DIRTY = 'lc-private-dirty';

    var key = null;
    var kdf = null;
    var library = null;
    var chain = Promise.resolve();
    var info = { dirty: storage.get(DIRTY) === '1', lastSync: null, error: null };

    var gh = github({
      repo: cfg.repo, branch: cfg.branch, path: cfg.path, fetch: doFetch,
      token: function () { return readToken(); },
    });

    /* One thing at a time, so a save never races a sync. */
    function queue(task) {
      var run = chain.then(task, task);
      chain = run.catch(function () {});
      return run;
    }

    function now() { return new Date().toISOString(); }

    async function readToken() {
      if (!key) return null;
      var raw = storage.get(TOKEN);
      if (!raw) return null;
      try { return (await unseal(key, JSON.parse(raw))).token || null; } catch (e) { return null; }
    }

    function localFile() {
      var text = storage.get(LOCAL);
      if (!text) return null;
      try { return parseFile(text); } catch (e) { return null; }
    }

    async function persist() {
      var file = await seal(key, kdf, library);
      storage.set(LOCAL, JSON.stringify(file));
      return file;
    }

    function markDirty(on) {
      info.dirty = on;
      if (on) storage.set(DIRTY, '1'); else storage.remove(DIRTY);
    }

    async function keyFor(passphrase, file) {
      var salt = fromB64(file.kdf.salt);
      var k = await deriveKey(passphrase, salt, file.kdf.iterations);
      return { key: k, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: file.kdf.iterations, salt: file.kdf.salt } };
    }

    function adopt(k, derived, lib) {
      key = k; kdf = derived; library = lib;
      info.error = null;
    }

    var api = {
      config: cfg,
      info: info,
      MIN_PASSPHRASE: MIN_PASSPHRASE,

      isUnlocked: function () { return !!key && !!library; },
      library: function () { return library; },
      hasLocal: function () { return !!localFile(); },

      /* Looks for the encrypted file: on GitHub if reachable, else this device. */
      async probe() {
        var remote = null;
        var reachable = true;
        try {
          var f = await gh.getFile();
          remote = f ? parseFile(f.text) : null;
        } catch (e) {
          if (e.code === 'network') reachable = false; else throw e;
        }
        return { remote: remote, local: localFile(), reachable: reachable };
      },

      /* First-time setup: only offered when no vault exists anywhere. */
      setup: function (passphrase) {
        return queue(async function () {
          if (String(passphrase || '').length < MIN_PASSPHRASE) {
            throw VaultError('weak', 'Use at least ' + MIN_PASSPHRASE + ' characters. Four unrelated words is a good one.');
          }
          var found = await api.probe();
          if (!found.reachable) {
            throw VaultError('offline', 'Setting up needs a connection, to be sure no vault exists yet.');
          }
          if (found.remote || found.local) {
            throw VaultError('exists', 'A vault already exists. Unlock it instead.');
          }
          var salt = toB64(randomBytes(16));
          var derived = await keyFor(passphrase, { kdf: { salt: salt, iterations: ITERATIONS } });
          adopt(derived.key, derived.kdf, emptyLibrary());
          await persist();
          markDirty(true);
          return true;
        });
      },

      /* Opens the vault with the passphrase. */
      unlock: function (passphrase) {
        return queue(async function () {
          var found = await api.probe();
          var file = found.remote || found.local;
          if (!file) {
            throw found.reachable
              ? VaultError('none', 'There is no vault yet.')
              : VaultError('offline', 'Cannot reach GitHub, and this device has no saved copy yet.');
          }
          var derived = await keyFor(passphrase, file);
          var lib = await unseal(derived.key, file);

          /* Anything written on this device and not yet synced is merged in. */
          if (found.remote && found.local && found.local.kdf.salt === file.kdf.salt) {
            try { lib = mergeLibraries(await unseal(derived.key, found.local), lib); } catch (e) { /* stale copy */ }
          }
          adopt(derived.key, derived.kdf, lib);
          await persist();
          if (found.remote) {
            var mine = JSON.stringify(lib);
            markDirty(info.dirty || mine !== JSON.stringify(await unseal(derived.key, found.remote)));
          }
          return true;
        });
      },

      /* Opens straight away from a key remembered on this device. */
      unlockRemembered: function () {
        return queue(async function () {
          if (!keystore) return false;
          var saved = await keystore.get();
          if (!saved || !saved.key || !saved.kdf || saved.expires < Date.now()) {
            if (saved) await keystore.clear();
            return false;
          }
          var file = localFile();
          if (!file) {
            var found = await api.probe();
            file = found.remote;
          }
          if (!file || file.kdf.salt !== saved.kdf.salt) { await keystore.clear(); return false; }
          try {
            adopt(saved.key, saved.kdf, await unseal(saved.key, file));
          } catch (e) {
            await keystore.clear();
            return false;
          }
          return true;
        });
      },

      /* Keep the key on this device (non-extractable) so the passphrase is not
         needed at every visit. */
      async remember(days) {
        if (!keystore || !key) return false;
        await keystore.set({ key: key, kdf: kdf, expires: Date.now() + days * 86400000 });
        return true;
      },
      async forget() { if (keystore) await keystore.clear(); },
      async isRemembered() {
        if (!keystore) return false;
        var saved = await keystore.get();
        return !!(saved && saved.expires > Date.now());
      },

      lock: function () {
        key = null; kdf = null; library = null;
      },

      /* Changes the library, then saves it on this device straight away. */
      commit: function (mutate) {
        return queue(async function () {
          if (!library) throw VaultError('locked', 'The vault is locked.');
          var next = JSON.parse(JSON.stringify(library));
          mutate(next);
          library = next;
          await persist();
          markDirty(true);
          return library;
        });
      },

      /* Pulls the vault from GitHub, merges, and pushes anything new. */
      sync: function () {
        return queue(async function () {
          if (!library) throw VaultError('locked', 'The vault is locked.');
          for (var attempt = 0; attempt < 4; attempt++) {
            var remote = await gh.getFile();
            var remoteLib = null;
            if (remote) {
              var file = parseFile(remote.text);
              if (file.kdf.salt !== kdf.salt) {
                throw VaultError('other-vault', 'The vault on GitHub was made with a different passphrase.');
              }
              remoteLib = await unseal(key, file);
              library = mergeLibraries(library, remoteLib);
            }
            await persist();

            var needs = !remote || !same(library, remoteLib);
            if (!needs) {
              markDirty(false);
              info.lastSync = now();
              info.error = null;
              return { pushed: false, at: info.lastSync };
            }
            if (!(await readToken())) {
              throw VaultError('no-token', 'Saved on this device. Add a GitHub token in Settings to sync it.');
            }
            var text = JSON.stringify(await seal(key, kdf, library));
            var message = 'Update private data (encrypted)';
            try {
              if (remote) {
                await gh.putFile(text, remote.sha, message);
              } else if (!(await gh.createBranch(text, 'Create private data (encrypted)'))) {
                await gh.putFile(text, null, message);
              }
            } catch (e) {
              if (e.code === 'conflict' && attempt < 3) continue;
              throw e;
            }
            markDirty(false);
            info.lastSync = now();
            info.error = null;
            return { pushed: true, at: info.lastSync };
          }
        }).catch(function (e) {
          info.error = e.message;
          throw e;
        });
      },

      /* The GitHub token: kept encrypted on this device, never in the library. */
      setToken: function (token) {
        return queue(async function () {
          if (!key) throw VaultError('locked', 'The vault is locked.');
          if (!token) { storage.remove(TOKEN); return; }
          storage.set(TOKEN, JSON.stringify(await seal(key, kdf, { token: String(token).trim() })));
        });
      },
      hasToken: function () { return !!storage.get(TOKEN); },

      /* The encrypted file as stored on this device, for a manual backup. */
      exportEncrypted: function () { return storage.get(LOCAL); },

      /* Forget everything on this device. The copy on GitHub is untouched. */
      wipeLocal: async function () {
        key = null; kdf = null; library = null;
        storage.remove(LOCAL); storage.remove(TOKEN); storage.remove(DIRTY);
        info.dirty = false;
        if (keystore) await keystore.clear();
      },
    };
    return api;
  }

  /* ---------- browser plumbing ---------- */

  function browserStorage() {
    var memory = {};
    function ok() { try { return !!root.localStorage; } catch (e) { return false; } }
    return {
      get: function (k) { try { return ok() ? root.localStorage.getItem(k) : (memory[k] || null); } catch (e) { return memory[k] || null; } },
      set: function (k, v) { try { if (ok()) root.localStorage.setItem(k, v); else memory[k] = v; } catch (e) { memory[k] = v; } },
      remove: function (k) { try { if (ok()) root.localStorage.removeItem(k); } catch (e) { /* ignore */ } delete memory[k]; },
    };
  }

  /* A non-extractable CryptoKey can be stored in IndexedDB as it is, so the
     raw key never exists where a script could read it. */
  function browserKeystore() {
    function open() {
      return new Promise(function (resolve, reject) {
        var req = root.indexedDB.open('leaguecraft-private', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('keys'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    function run(mode, fn) {
      return open().then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction('keys', mode);
          var out = fn(tx.objectStore('keys'));
          tx.oncomplete = function () { db.close(); resolve(out && out.result); };
          tx.onerror = function () { db.close(); reject(tx.error); };
        });
      });
    }
    return {
      get: function () { return root.indexedDB ? run('readonly', function (s) { return s.get('key'); }).catch(function () { return null; }) : Promise.resolve(null); },
      set: function (v) { return run('readwrite', function (s) { return s.put(v, 'key'); }); },
      clear: function () { return root.indexedDB ? run('readwrite', function (s) { return s.delete('key'); }).catch(function () {}) : Promise.resolve(); },
    };
  }

  var api = {
    FORMAT: FORMAT, ITERATIONS: ITERATIONS, MIN_PASSPHRASE: MIN_PASSPHRASE, DEFAULTS: DEFAULTS,
    create: create, mergeLibraries: mergeLibraries, emptyLibrary: emptyLibrary,
    browserStorage: browserStorage, browserKeystore: browserKeystore,
    /* exposed for tests */
    _seal: seal, _unseal: unseal, _deriveKey: deriveKey,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.Vault = api;
})();
