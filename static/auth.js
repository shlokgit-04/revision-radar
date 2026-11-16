// Shared auth helpers: token storage + fetch wrapper.
'use strict';

const RR_AUTH = {
  key: 'rr-token',
  get() { try { return localStorage.getItem(this.key) || ''; } catch { return ''; } },
  set(tok) { try { localStorage.setItem(this.key, tok); } catch {} },
  clear() { try { localStorage.removeItem(this.key); } catch {} },
  async api(path, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const tok = this.get();
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, Object.assign({}, opts, { headers }));
    if (res.status === 401 && !path.startsWith('/api/auth')) {
      this.clear();
      window.location.href = '/login';
      throw new Error('401');
    }
    return res;
  },
  parse(res) { return res.json().catch(() => ({})); },
};
