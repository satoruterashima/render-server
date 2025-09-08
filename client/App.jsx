import React, { useEffect, useMemo, useState } from 'react';
import { fetchCategories, isAdmin, registerAdmin } from './api';
// LIFF 初期化は既存のロジックを流用してください
// import liff from '@line/liff';

export default function App() {
  const [user, setUser] = useState(null);         // { userId, displayName }
  const [admin, setAdmin] = useState(false);
  const [cats, setCats] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [catsError, setCatsError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // 既存の LIFF 初期化を使用
        // await liff.init({ liffId: process.env.REACT_APP_LIFF_ID });
        // if (!liff.isLoggedIn()) liff.login();
        // const p = await liff.getProfile();
        const p = { userId: 'mock-user', displayName: 'Mock' }; // ← 既存に置換
        setUser({ userId: p.userId, displayName: p.displayName });

        const r = await isAdmin(p.userId);
        setAdmin(!!r.isAdmin);
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
      setCatsError(e.message || 'failed');
    } finally {
      setLoadingCats(false);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const needAdminRescue = useMemo(() => user && !admin, [user, admin]);

  const handleRescueRegister = async () => {
    if (!user) return;
    const r = await registerAdmin(user.userId, user.displayName);
    if (r && r.ok) {
      const chk = await isAdmin(user.userId);
      setAdmin(!!chk.isAdmin);
      alert(chk.isAdmin ? '管理者登録に成功しました' : '登録は完了しましたが反映に失敗しました');
    } else {
      alert('登録に失敗しました: ' + (r.error || 'unknown'));
    }
  };

  return (
    <div className="app">
      <header>
        <h1>LIFF POS 注文</h1>
        {admin && <nav><a href="#admin">管理</a></nav>}
      </header>

      <main>
        {loadingCats && <p>商品カテゴリを読み込み中…</p>}
        {catsError && (
          <div>
            <p>商品取得に失敗しました（{catsError}）</p>
            <button onClick={loadCategories}>再試行</button>
          </div>
        )}
        {!loadingCats && !catsError && cats.length === 0 && (
          <p>商品カテゴリが未登録です（`Categories` シートをご確認ください）。</p>
        )}
        {!loadingCats && cats.length > 0 && (
          <ul>
            {cats.map(c => (
              <li key={c.id}>
                {c.imageUrl ? <img src={c.imageUrl} alt={c.name} style={{width:48,height:48,objectFit:'cover'}}/> : null}
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
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
