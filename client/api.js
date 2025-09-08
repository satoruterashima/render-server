const base = '';

export async function fetchCategories() {
  const r = await fetch(`${base}/api/categories`, { credentials:'include' });
  if (!r.ok) throw new Error(`categories ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'upstream_error');
  return normalizeCategories(j.items || []);
}

export async function isAdmin(userId) {
  const r = await fetch(`${base}/api/admins/is-admin`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!r.ok) return { ok:false, isAdmin:false };
  return r.json();
}

export async function registerAdmin(userId, displayName) {
  const r = await fetch(`${base}/api/admins/register`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ userId, displayName })
  });
  return r.json();
}

function normalizeCategories(items) {
  return items.map(x => ({
    id: String(x.id ?? ''),
    name: String(x.name ?? ''),
    imageUrl: String(x.imageUrl ?? '')
  })).filter(x => x.id && x.name);
}
