/* A small in-memory stand-in for the GitHub API, shared by the vault tests and
   the browser walk-through: one repo, branches, contents + git data endpoints. */
function fakeGitHub(opts) {
  opts = opts || {};
  const repo = { branches: {}, blobs: {}, trees: {}, commits: {} };   /* branch -> { file: {sha, text} } */
  let counter = 0;
  const log = [];
  const sha = () => 'sha' + (++counter);
  const b64text = s => Buffer.from(s, 'base64').toString('utf8');
  const res = (status, body, text) => ({
    status, ok: status >= 200 && status < 300,
    json: async () => body, text: async () => (text != null ? text : JSON.stringify(body)),
  });

  const api = {
    repo, log, offline: false, beforePut: null,
    fetch: async (url, init) => {
      if (api.offline) throw new TypeError('network down');
      const u = new URL(url);
      const method = init.method || 'GET';
      const auth = (init.headers || {}).Authorization || null;
      const body = init.body ? JSON.parse(init.body) : null;
      log.push({ method, path: u.pathname, auth, body: init.body || null });
      const p = u.pathname.replace('/repos/turindev/bowlingTracker', '');

      if (p.startsWith('/contents/')) {
        const name = decodeURIComponent(p.slice('/contents/'.length));
        if (method === 'GET') {
          const branch = repo.branches[u.searchParams.get('ref')];
          if (!branch || !branch[name]) return res(404, { message: 'Not Found' });
          const f = branch[name];
          if (opts.hideContent && !(init.headers.Accept || '').includes('raw')) {
            return res(200, { sha: f.sha, size: f.text.length, encoding: 'none', content: '' });
          }
          if ((init.headers.Accept || '').includes('raw')) return res(200, null, f.text);
          return res(200, { sha: f.sha, encoding: 'base64', content: Buffer.from(f.text).toString('base64').replace(/(.{60})/g, '$1\n') });
        }
        if (method === 'PUT') {
          if (!auth) return res(401, { message: 'Requires authentication' });
          if (api.beforePut) { const hook = api.beforePut; api.beforePut = null; hook(); }
          const branch = repo.branches[body.branch];
          if (!branch) return res(404, { message: 'Branch not found' });
          const existing = branch[name];
          if (existing && body.sha !== existing.sha) return res(409, { message: 'sha does not match' });
          if (!existing && body.sha) return res(422, { message: 'sha given for a new file' });
          if (existing && !body.sha) return res(422, { message: 'sha wasn\'t supplied' });
          branch[name] = { sha: sha(), text: b64text(body.content) };
          return res(200, { content: { sha: branch[name].sha } });
        }
      }
      if (!auth && method !== 'GET') return res(401, { message: 'Requires authentication' });
      if (p === '/git/blobs') { const id = sha(); repo.blobs[id] = b64text(body.content); return res(201, { sha: id }); }
      if (p === '/git/trees') {
        const id = sha();
        repo.trees[id] = body.tree.map(t => ({ path: t.path, blob: t.sha }));
        return res(201, { sha: id });
      }
      if (p === '/git/commits') {
        const id = sha();
        repo.commits[id] = { tree: body.tree, parents: body.parents };
        return res(201, { sha: id });
      }
      if (p === '/git/refs') {
        const name = body.ref.replace('refs/heads/', '');
        if (repo.branches[name]) return res(422, { message: 'Reference already exists' });
        const files = {};
        repo.trees[repo.commits[body.sha].tree].forEach(t => { files[t.path] = { sha: sha(), text: repo.blobs[t.blob] }; });
        repo.branches[name] = files;
        return res(201, {});
      }
      return res(404, { message: 'unhandled ' + method + ' ' + p });
    },
  };
  return api;
}

module.exports = { fakeGitHub };
