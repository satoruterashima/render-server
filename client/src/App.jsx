import React, { useEffect, useMemo, useState } from 'react';

/** ===== API helpers（サーバ同居想定: baseは空でOK） ===== */
const API_BASE = '';

async function apiJson(path, opts) {
  const r = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...(opts || {}) });
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  } catch (e) {
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);
    throw e;
  }
}

async function fetchCategories() {
  const j = await apiJson('/api/categories');
  const raw = Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : [];
  return normalizeCategories(raw);
}

async function checkAdmin(userId) {
  if (!userId) return { ok: false, isAdmin: false };
  try {
    const r = await fetch(`/api/checkAdmin?userId=${encodeURIComponent(userId)}`);
    if (!r.ok) return { ok: false, isAdmin: false };
    return await r.json();
  } catch {
    return { ok: false, isAdmin: false };
  }
}

async function registerFirstAdmin(userId, displayName) {
  const r = await fetch('/api/registerFirstAdmin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, displayName })
  });
  return r.json();
}

/** サーバが2次元配列を返しても、オブジェクト配列に正規化 */
function normalizeCategories(input) {
  if (!Array.isArray(input)) return [];
  // 2次元配列: [カテゴリ, サブカテゴリ, 商品名, 価格, 画像URL]
  if (input.length > 0 && Array.isArray(input[0])) {
    return input.map((row, idx) => {
      const [category, subcategory, name, price, imageUrl] = row;
      return {
        id: slugify(`${category}-${subcategory}-${name}-${idx}`),
        category: String(category || ''),
        subcategory: String(subcategory || ''),
        name: String(name || ''),
        price: Number(price || 0),
        imageUrl: String(imageUrl || '')
      };
    }).filter(x => x.name);
  }
  // すでにオブジェクト配列
  return input.map((x, i) => ({
    id: String(x.id ?? slugify(`${x.category ?? ''}-${x.subcategory ?? ''}-${x.name ?? x.title ?? ''}-${i}`)),
    category: String(x.category ?? ''),
    subcategory: String(x.subcategory ?? ''),
    name: String(x.name ?? x.title ?? ''),
    price: Number(x.price ?? 0),
    imageUrl: String(x.imageUrl ?? x.image ?? '')
  })).filter(x => x.name);
}

function slugify(s) {
  return String(s).normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '')
    .slice(0, 64) || String(Date.now());
}

/** ===== App Component ===== */
export default function App() {
  const [user, setUser] = useState(null);      // { userId, displayName }
  const [admin, setAdmin] = useState(false);
  const [cats, setCats] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [catsError, setCatsError] = useState('');

  // --- Cart ---
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const cartTotal = useMemo(
    () => cart.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 0)), 0),
    [cart]
  );

  useEffect(() => {
    (async () => {
      try {
        // --- LIFF が使える場合のみ実ユーザーを読む（ない場合はモック） ---
        let userId = 'mock-user';
        let displayName = 'Mock';
        if (typeof window !== 'undefined' && window.liff) {
  try {
    const liffId = import.meta.env.VITE_LIFF_ID || window.LIFF_ID || '';
    if (!liffId) throw new Error('LIFF_ID_MISSING');
    await window.liff.init({ liffId });
    if (!window.liff.isLoggedIn()) {
      // LIFF内なら login() は遷移を引き起こすので try/catch で握る
      try { window.liff.login(); return; } catch (_) {}
    }
    const p = await window.liff.getProfile();
    userId = p.userId;
    displayName = p.displayName;
  } catch (e) {
    console.warn('LIFF init skipped:', e);
    // 失敗してもモックで続行（画面は落とさない）
  }
}

        setUser({ userId, displayName });

        const chk = await checkAdmin(userId);
        setAdmin(!!chk.isAdmin);
      } catch (e) {
        console.error('init failed', e);
      }
    })();
  }, []);

  const loadCategories = async () => {
    setLoadingCats(true);
    setCatsError('');
    try {
      const list = await fetchCategories();
      setCats(list);
    } catch (e) {
      console.error(e);
      setCatsError(e.message || 'failed');
    } finally {
      setLoadingCats(false);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const needAdminRescue = useMemo(() => !!(user && !admin), [user, admin]);

  const addToCart = (item) => {
    setCart((prev) => {
      const i = prev.findIndex(p => p.id === item.id);
      if (i >= 0) {
        const copy = [...prev];
        copy[i] = { ...copy[i], qty: (copy[i].qty || 0) + 1 };
        return copy;
      }
      return [...prev, { id: item.id, name: item.name, price: Number(item.price || 0), qty: 1 }];
    });
  };

  const changeQty = (id, delta) => {
    setCart((prev) => {
      return prev
        .map(it => it.id === id ? { ...it, qty: (it.qty || 0) + delta } : it)
        .filter(it => it.qty > 0);
    });
  };

  const submitOrder = async () => {
    if (!cart.length) return;
    try {
      setSubmitting(true);
      const body = {
        liffUserId: user?.userId || '',
        items: cart.map(it => ({ id: it.id, name: it.name, price: it.price, qty: it.qty })),
        note: ''
      };
      const r = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok || j?.ok !== true) throw new Error(j?.error || '注文に失敗しました');
      alert(`注文を受け付けました。注文番号: ${j.orderId || '(発行なし)'}`);
      setCart([]);
    } catch (e) {
      alert(`注文エラー: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
	<div
  className="app"
  style={{ padding: 16, fontFamily: 'system-ui, sans-serif', color: '#fff', minHeight: '100vh' }}
>
  {/* ここが見えたら React は動いています */}
  <p style={{opacity:.6,fontSize:12,margin:'4px 0'}}>DEBUG: app mounted</p>

	>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>LIFF POS 注文</h1>
        {admin && (
          <nav><a href="#admin">管理</a></nav>
        )}
      </header>

      <main style={{ marginTop: 16 }}>
        {loadingCats && <p>商品カテゴリを読み込み中…</p>}

        {catsError && (
          <div>
            <p>商品取得に失敗しました（{catsError}）</p>
            <button onClick={loadCategories}>再試行</button>
          </div>
        )}

        {!loadingCats && !catsError && cats.length === 0 && (
          <p>商品カテゴリが未登録です（スプレッドシート「Categories」をご確認ください）。</p>
        )}

        {!loadingCats && !catsError && cats.length > 0 && (
          <ul style={{ paddingLeft: 20 }}>
            {cats.map(c => (
              <li
                key={c.id}
                style={{
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {c.imageUrl ? (
                    <img
                      src={c.imageUrl}
                      alt={c.name}
                      width={48}
                      height={48}
                      style={{ objectFit: 'cover', borderRadius: 6 }}
                    />
                  ) : null}
                  <span>{c.category} / {c.subcategory} — {c.name}：¥{c.price}</span>
                </div>
                <button onClick={() => addToCart(c)} style={{ padding: '6px 10px' }}>追加</button>
              </li>
            ))}
          </ul>
        )}

        {/* --- Cart --- */}
        {cart.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <h2>カート</h2>
            <ul style={{ paddingLeft: 20 }}>
              {cart.map(it => (
                <li key={it.id} style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <strong>{it.name}</strong> ¥{it.price} × {it.qty}
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <button onClick={() => changeQty(it.id, -1)}>-</button>
                    <button onClick={() => changeQty(it.id, +1)}>+</button>
                  </div>
                </li>
              ))}
            </ul>
            <p><strong>合計：¥{cartTotal}</strong></p>
            <button onClick={submitOrder} disabled={submitting} style={{ padding: '8px 12px' }}>
              {submitting ? '送信中…' : '注文する'}
            </button>
          </section>
        )}

        {/* 初回管理者登録の救済UI（Adminsが空でもOK） */}
        {needAdminRescue && (
          <section style={{ marginTop: 24 }}>
            <h2>管理者登録</h2>
            <p>このアカウントを管理者として登録しますか？</p>
            <button onClick={handleRescueRegister}>管理者として登録</button>
          </section>
        )}
      </main>
    </div>
  );
}
