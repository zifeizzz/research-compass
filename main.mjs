import { GitHubStore, validateCatalog, normalizeLink, canonicalUrl, REPOSITORY } from './data.mjs';

const $ = id => document.getElementById(id);
const store = new GitHubStore();
const order = ['学术检索', '文献与图书', '古地磁与岩石磁学', '地学数据与模型', 'GIS与制图', '软件与编程', 'AI工具', '课程与教学', '工具与社区'];
let catalog = { schemaVersion: 1, updatedAt: '', links: [] };
let active = '学术检索';
let query = '';
let editingId = null;
let busy = false;
let authenticated = false;
let loaded = false;
let publicationTimer;

function status(id, text, error = false) {
  $(id).textContent = text;
  $(id).classList.toggle('error', error);
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#editor button, #editor input, #login-form button, #login-form input, #admin-bar button, #logout-button, #add-button, .item-actions button')
    .forEach(button => { button.disabled = value; });
}
function closeDialog(id) { if (!busy) $(id).close(); }
function el(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function render() {
  $('add-button').hidden = !authenticated;
  $('logout-button').hidden = !authenticated;
  $('admin-bar').hidden = !authenticated;
  $('legacy-button').hidden = true;
  if (authenticated) {
    try { $('legacy-button').hidden = !localStorage.getItem('research-compass-public-v1'); } catch { /* optional migration */ }
  }
  const links = catalog.links;
  const found = [...new Set(links.map(item => item.category))];
  const categories = [...order.filter(category => found.includes(category)), ...found.filter(category => !order.includes(category))];
  if (loaded && active !== '全部' && active !== '★ 常用' && !found.includes(active)) active = '全部';
  const keyword = query.trim().toLowerCase();
  const shown = links.filter(item => {
    if (keyword) return `${item.name} ${item.note} ${item.url} ${item.category}`.toLowerCase().includes(keyword);
    return active === '全部' || (active === '★ 常用' ? item.favorite : item.category === active);
  }).sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.name.localeCompare(b.name, 'zh-CN'));
  $('total-count').textContent = links.length;
  $('category-count').textContent = categories.length;
  $('favorite-count').textContent = links.filter(item => item.favorite).length;
  const updated = new Date(catalog.updatedAt);
  $('updated-date').textContent = Number.isNaN(updated.valueOf()) ? '' : `更新于 ${updated.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}`;
  $('result-count').textContent = keyword ? `找到 ${shown.length} 个结果` : `${active} · ${shown.length} 个`;
  const tabs = ['全部', ...categories, '★ 常用'].map(category => {
    const count = category === '全部' ? links.length : category === '★ 常用' ? links.filter(item => item.favorite).length : links.filter(item => item.category === category).length;
    const button = el('button', category, `${active === category && !keyword ? 'active' : ''} ${category === '★ 常用' ? 'favorite-tab' : ''}`);
    button.append(el('small', count));
    button.onclick = () => { active = category; query = ''; $('search').value = ''; render(); };
    return button;
  });
  $('tabs').replaceChildren(...tabs);
  const rows = shown.map(item => {
    const article = el('article');
    const anchor = el('a');
    anchor.href = item.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    const label = el('span');
    label.append(el('b', `${item.favorite ? '★ ' : ''}${item.name}`), el('small', item.note || item.category));
    anchor.title = `${item.name}\n${item.url}`;
    anchor.append(el('i', item.name.slice(0, 1)), label, el('em', '↗'));
    article.append(anchor);
    if (authenticated) {
      const actions = el('div', undefined, 'item-actions');
      const edit = el('button', '编辑'); edit.setAttribute('aria-label', `编辑 ${item.name}`);
      edit.onclick = () => openEditor(item);
      const remove = el('button', '删除'); remove.setAttribute('aria-label', `删除 ${item.name}`);
      remove.onclick = async () => {
        if (busy || !authenticated || !confirm(`删除“${item.name}”？此修改将更新公开清单。`)) return;
        await publish(catalog.links.filter(link => link.id !== item.id), `Remove link: ${item.name}`);
      };
      edit.disabled = busy; remove.disabled = busy;
      actions.append(edit, remove); article.append(actions);
    }
    return article;
  });
  if (!rows.length) {
    const empty = el('div', undefined, 'empty');
    empty.append(el('strong', loaded ? '没有匹配的网站' : '正在载入公开清单…'), el('span', loaded ? '试试更短的关键词或其他分类。' : ''));
    rows.push(empty);
  }
  $('links').replaceChildren(...rows);
}

async function loadPublic() {
  const response = await fetch(`./sites.json?v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error('无法载入公开清单，请稍后刷新。');
  catalog = validateCatalog(await response.json());
  loaded = true; render();
  await refreshLatest();
}
async function refreshLatest() {
  if (authenticated || busy) return;
  // Read the shared source as well as the Pages snapshot so a new commit can appear before redeployment finishes.
  try {
    const response = await fetch(`https://raw.githubusercontent.com/${REPOSITORY}/main/sites.json?v=${Date.now()}`, {
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const latest = validateCatalog(await response.json());
    if (!authenticated && !busy && latest.updatedAt >= catalog.updatedAt) { catalog = latest; render(); }
  } catch { /* The deployed Pages snapshot remains usable when GitHub raw is unavailable. */ }
}
function openEditor(item = null) {
  if (!authenticated || busy) return;
  editingId = item?.id ?? null;
  $('dialog-title').textContent = item ? '编辑网址' : '添加网址';
  $('name').value = item?.name ?? '';
  $('url').value = item?.url ?? '';
  $('category').value = item?.category ?? (active === '全部' || active === '★ 常用' ? '我的收藏' : active);
  $('note').value = item?.note ?? '';
  $('favorite').checked = Boolean(item?.favorite);
  status('editor-status', '保存后将更新所有访客看到的公开清单。');
  $('editor').showModal();
  $('name').focus();
}
async function publish(links, message) {
  if (!authenticated || busy) return false;
  setBusy(true);
  status('page-status', '正在保存到 GitHub…');
  if ($('editor').open) status('editor-status', '正在保存到 GitHub…');
  try {
    const result = await store.save({ ...catalog, links }, message);
    catalog = result.catalog;
    status('page-status', '已保存到 GitHub，正在自动发布。新访客会读取最新清单。');
    monitorPublication(result.commit);
    return true;
  } catch (error) {
    const text = error instanceof TypeError ? '网络中断，尚无法确认保存结果。请重新载入在线清单核对后再尝试。' : error.message;
    status('page-status', text, true);
    if ($('editor').open) status('editor-status', text, true);
    return false;
  } finally { setBusy(false); render(); }
}
function monitorPublication(commit) {
  clearTimeout(publicationTimer);
  let attempts = 0;
  const poll = async () => {
    if (!authenticated) return;
    try {
      const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/runs?head_sha=${commit}&per_page=5`, { cache: 'no-store' });
      if (response.ok) {
        const runs = (await response.json()).workflow_runs ?? [];
        const run = runs.find(item => item.name === 'Deploy to GitHub Pages');
        if (run?.status === 'completed') {
          status('page-status', run.conclusion === 'success' ? '已保存并发布到线上，所有访客将看到最新清单。' : '清单已保存，自动发布未成功。请查看仓库 Actions 的发布记录。', run.conclusion !== 'success');
          return;
        }
      }
    } catch { /* Saving succeeded independently of status polling. */ }
    if (++attempts < 20) publicationTimer = setTimeout(poll, 15000);
  };
  publicationTimer = setTimeout(poll, 10000);
}
function openLogin() {
  if (authenticated || busy) return;
  status('login-status', ''); $('github-token').value = '';
  if (!$('login-dialog').open) $('login-dialog').showModal();
}
$('admin-entry').onclick = event => { event.preventDefault(); openLogin(); };
$('login-form').onsubmit = async event => {
  event.preventDefault(); if (busy) return;
  setBusy(true); status('login-status', '正在验证 GitHub 身份…');
  const token = $('github-token').value.trim(); $('github-token').value = '';
  try {
    catalog = await store.login(token);
    authenticated = true; loaded = true;
    $('login-dialog').close();
    status('page-status', '已进入站长管理。每次保存都会更新公开清单。');
  } catch (error) {
    status('login-status', error instanceof TypeError ? '无法连接 GitHub，请检查网络后重试。' : error.message, true);
  } finally { setBusy(false); render(); }
};
$('logout-button').onclick = () => {
  if (busy) return;
  store.logout(); authenticated = false; clearTimeout(publicationTimer);
  $('editor').close(); status('page-status', '已退出管理。'); render(); refreshLatest();
};
$('reload-button').onclick = async () => {
  if (!authenticated || busy) return;
  setBusy(true);
  try { catalog = await store.load(); status('page-status', '已重新载入最新在线清单。'); }
  catch (error) { status('page-status', error.message, true); }
  finally { setBusy(false); render(); }
};
$('add-button').onclick = () => openEditor();
$('editor-form').onsubmit = async event => {
  event.preventDefault(); if (!authenticated || busy) return;
  try {
    const item = normalizeLink({ id: editingId || crypto.randomUUID(), name: $('name').value,
      url: $('url').value, category: $('category').value, note: $('note').value, favorite: $('favorite').checked });
    if (catalog.links.some(link => link.id !== editingId && canonicalUrl(link.url) === canonicalUrl(item.url))) {
      throw new Error('清单中已存在这个网址，请编辑原有条目。');
    }
    const links = editingId ? catalog.links.map(link => link.id === editingId ? item : link) : [...catalog.links, item];
    if (await publish(links, `${editingId ? 'Edit' : 'Add'} link: ${item.name}`)) $('editor').close();
  } catch (error) { status('editor-status', error.message, true); }
};
for (const [button, dialog] of [['close-button', 'editor'], ['cancel-button', 'editor'], ['login-close', 'login-dialog'], ['login-cancel', 'login-dialog']]) {
  $(button).onclick = () => closeDialog(dialog);
}
for (const id of ['editor', 'login-dialog']) {
  $(id).addEventListener('cancel', event => { if (busy) event.preventDefault(); });
}
$('login-dialog').addEventListener('close', () => { $('github-token').value = ''; });
$('search').oninput = event => { query = event.target.value; render(); };
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !$('editor').open && !$('login-dialog').open) {
    event.preventDefault(); $('search').focus();
  }
});
function download(value, filename) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }));
  const anchor = el('a'); anchor.href = href; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
$('export-button').onclick = () => download(catalog, 'research-compass-online.json');
$('legacy-button').onclick = () => {
  if (!authenticated) return;
  try { download(JSON.parse(localStorage.getItem('research-compass-public-v1')), 'research-compass-old-local.json'); }
  catch { status('page-status', '无法读取旧本机清单。', true); }
};
loadPublic().catch(error => { status('page-status', error.message, true); });
setInterval(() => { if (!document.hidden) refreshLatest(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshLatest(); });
if (location.hash === '#admin') openLogin();
render();
