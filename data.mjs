export const OWNER = 'zifeizzz';
export const REPOSITORY = 'zifeizzz/research-compass';
export const API = `https://api.github.com/repos/${REPOSITORY}`;

export function normalizeLink(value) {
  if (!value || typeof value !== 'object') throw new Error('网址条目格式不正确。');
  const name = String(value.name ?? '').trim();
  const category = String(value.category ?? '').trim();
  const raw = String(value.url ?? '').trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  if (!['https:', 'http:'].includes(url.protocol) || !name || !category || !url.hostname) {
    throw new Error('请填写名称、分类和有效的 http/https 网址。');
  }
  return { id: String(value.id ?? ''), name, url: url.href, category,
    note: String(value.note ?? '').trim(), ...(value.favorite ? { favorite: true } : {}) };
}

export function validateCatalog(value) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.links)) throw new Error('在线清单格式不正确。');
  const links = value.links.map(normalizeLink);
  const ids = new Set();
  for (const item of links) {
    if (!item.id || ids.has(item.id)) throw new Error('清单中存在缺失或重复的标识。');
    ids.add(item.id);
  }
  return { schemaVersion: 1, updatedAt: String(value.updatedAt ?? ''), links };
}

export function canonicalUrl(raw) {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|spm$|from$|ref$|referrer$|source$|share_)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.hostname.toLowerCase() + (url.pathname.replace(/\/$/, '') || '/') + url.search + url.hash;
}

export function encodeUTF8(text) {
  return btoa(Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join(''));
}
export function decodeUTF8(text) {
  return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), char => char.charCodeAt(0)));
}

export class GitHubStore {
  constructor(fetcher = fetch) {
    this.fetcher = (...args) => fetcher(...args);
    this.token = '';
    this.sha = '';
  }
  logout() { this.token = ''; this.sha = ''; }
  async request(path, options = {}, token = this.token) {
    if (!token) throw new Error('请先验证站长身份。');
    const response = await this.fetcher(`https://api.github.com${path}`, {
      ...options, cache: 'no-store', redirect: 'error',
      headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`, ...options.headers },
    });
    const body = await response.json();
    if (!response.ok) {
      const messages = { 401: '凭证已失效，请重新验证。', 403: 'GitHub 拒绝写入。请检查该仓库的 Contents 读写权限、令牌有效期和 API 限额。',
        404: '无法访问清单，请检查令牌是否已选择 research-compass 仓库。',
        409: '清单已在别处更新。请点击“重新载入”后再编辑；本次修改尚未发布。',
        422: 'GitHub 未接受保存，请重新载入清单并检查仓库写入规则。' };
      throw new Error(messages[response.status] || `GitHub 请求失败（${response.status}）。`);
    }
    return body;
  }
  async login(token) {
    this.logout();
    try {
      const user = await this.request('/user', {}, token);
      if (user.login?.toLowerCase() !== OWNER) throw new Error('只有站长 zifeizzz 可以管理此清单。');
      const repo = await this.request(`/repos/${REPOSITORY}`, {}, token);
      if (repo.archived || repo.owner?.login?.toLowerCase() !== OWNER || !repo.permissions?.push) {
        throw new Error('该凭证没有仓库写入权限。');
      }
      this.token = token;
      return await this.load();
    } catch (error) { this.logout(); throw error; }
  }
  async load() {
    const file = await this.request(`/repos/${REPOSITORY}/contents/sites.json?ref=main`);
    const catalog = validateCatalog(JSON.parse(decodeUTF8(file.content)));
    this.sha = file.sha;
    return catalog;
  }
  async save(value, message) {
    if (!this.token || !this.sha) throw new Error('请先验证站长身份并载入在线清单。');
    const catalog = validateCatalog({ ...value, updatedAt: new Date().toISOString() });
    const result = await this.request(`/repos/${REPOSITORY}/contents/sites.json`, {
      method: 'PUT', body: JSON.stringify({ message, branch: 'main', sha: this.sha,
        content: encodeUTF8(JSON.stringify(catalog, null, 2) + '\n') }),
    });
    this.sha = result.content.sha;
    return { catalog, commit: result.commit.sha };
  }
}
