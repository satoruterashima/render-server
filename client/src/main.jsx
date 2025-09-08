import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

/** 画面を落とさないための簡易エラーバウンダリ */
class Boundary extends React.Component {
  constructor(props){ super(props); this.state = { err: null, info: null }; }
  static getDerivedStateFromError(err){ return { err }; }
  componentDidCatch(err, info){ console.error('UI Error:', err, info); }
  render(){
    if (this.state.err) {
      const msg = (this.state.err && (this.state.err.message || String(this.state.err))) || 'Unknown error';
      return (
        <div style={{ padding: 16, color:'#fff', fontFamily:'system-ui,sans-serif' }}>
          <h2 style={{marginTop:0}}>UI error</h2>
          <pre style={{whiteSpace:'pre-wrap'}}>{msg}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const el = document.getElementById('root');
if (!el) {
  document.body.insertAdjacentHTML('beforeend', '<div style="padding:12px;color:#fff">ERROR: #root が見つかりません</div>');
} else {
  createRoot(el).render(
    <Boundary>
      <App />
    </Boundary>
  );
}
