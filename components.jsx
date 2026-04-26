const DEPARTMENTS = ['常任局','構成局','ライブ局','講演局','パンフレット局','模擬局','ステ外局','広報局','財務局','備品局','企画局'];
const STATUSES = ['未定','合格','不合格','保留'];

// 局ごとのカラーパレット
const DEPT_COLORS = {
  '常任局':     { bg:'#dbeafe', color:'#1d4ed8', border:'#93c5fd' },
  '構成局':     { bg:'#ede9fe', color:'#6d28d9', border:'#c4b5fd' },
  'ライブ局':   { bg:'#fce7f3', color:'#be185d', border:'#f9a8d4' },
  '講演局':     { bg:'#ffedd5', color:'#c2410c', border:'#fdba74' },
  'パンフレット局': { bg:'#d1fae5', color:'#065f46', border:'#6ee7b7' },
  '模擬局':     { bg:'#fef9c3', color:'#92400e', border:'#fde047' },
  'ステ外局':   { bg:'#f0fdf4', color:'#15803d', border:'#86efac' },
  '広報局':     { bg:'#e0f2fe', color:'#0369a1', border:'#7dd3fc' },
  '財務局':     { bg:'#fdf4ff', color:'#7e22ce', border:'#e879f9' },
  '備品局':     { bg:'#fff7ed', color:'#9a3412', border:'#fb923c' },
  '企画局':     { bg:'#f0fdfa', color:'#0f766e', border:'#2dd4bf' },
};
const STATUS_CFG = {
  '未定': { bg:'#f1f0ee', color:'#6b6660', border:'#d4d0ca' },
  '合格': { bg:'#dcfce7', color:'#166534', border:'#86efac' },
  '不合格': { bg:'#fee2e2', color:'#991b1b', border:'#fca5a5' },
  '保留': { bg:'#fef9c3', color:'#854d0e', border:'#fde047' },
};



// ── GAS スクリプト ───────────────────────────────────────────────
// スキーマ: id | name | kana | depts | reason | 日時 | コマ | 評価 | ステータス | メモ
// depts は JSON 文字列: [{"name":"常任","rank":1}, ...]
const GAS_CODE = `const SHEET_NAME = 'applicants';

function doGet(e) {
  try {
    const action = e.parameter.action || 'getAll';
    const data = e.parameter.data ? JSON.parse(e.parameter.data) : {};

    if (action === 'getAll') {
      const sheet = getSheet();
      const values = sheet.getDataRange().getValues();
      if (values.length < 2) return jsonOk({ rows: [] });
      const headers = values[0];
      const rows = values.slice(1).map((row, i) => {
        const obj = { _row: i + 2 };
        headers.forEach((h, j) => {
          let v = String(row[j] != null ? row[j] : '');
          if (h === 'depts' && v) {
            try { v = JSON.parse(v); } catch(_) { v = []; }
          }
          obj[h] = v;
        });
        return obj;
      }).filter(r => r['name'] !== '');
      return jsonOk({ rows });
    }

    if (action === 'update') {
      const sheet = getSheet();
      const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      const col = headers.indexOf(data.field) + 1;
      if (col > 0) {
        let val = data.value;
        if (data.field === 'depts' && typeof val !== 'string') val = JSON.stringify(val);
        sheet.getRange(data.row, col).setValue(val);
      }
      return jsonOk({ success: true });
    }

    if (action === 'add') {
      const sheet = getSheet();
      const headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      sheet.appendRow(headers.map(h => {
        let v = data[h] != null ? data[h] : '';
        if (h === 'depts' && typeof v !== 'string') v = JSON.stringify(v);
        return v;
      }));
      return jsonOk({ success: true, row: sheet.getLastRow() });
    }

    if (action === 'delete') {
      getSheet().deleteRow(data.row);
      return jsonOk({ success: true });
    }

    return jsonOk({ error: 'Unknown action: ' + action });
  } catch(err) { return jsonOk({ error: err.toString() }); }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

function jsonOk(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ★ 初回のみ実行
function initSheet() {
  const sheet = getSheet();
  if (sheet.getLastRow() > 0) sheet.clearContents();
  const h = ['id','name','kana','depts','reason','日時','評価','ステータス','メモ'];
  sheet.appendRow(h);
  sheet.getRange(1,1,1,h.length)
    .setFontWeight('bold')
    .setBackground('#1e293b')
    .setFontColor('#ffffff');
  // depts 列を広めに
  sheet.setColumnWidth(4, 300);
  sheet.setColumnWidth(5, 250);
  SpreadsheetApp.flush();
  Logger.log('シートを初期化しました');
}`;

const { useState, useEffect, useRef, useCallback } = React;

// ── SaveStatus ───────────────────────────────────────────────────
function SaveStatus({ status }) {
  if (status === 'idle') return null;
  const cfg = {
    saving: { text:'保存中…', color:'#94a3b8', pulse:true },
    saved:  { text:'✓ 保存済み', color:'#4ade80', pulse:false },
    error:  { text:'保存エラー', color:'#f87171', pulse:false },
  }[status] || {};
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', fontSize:'0.8rem', color:cfg.color, animation:'fadeIn 0.2s ease' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:cfg.color, display:'inline-block', animation:cfg.pulse?'pulse 1s infinite':'none' }} />
      {cfg.text}
    </div>
  );
}

// ── StatusBadge ──────────────────────────────────────────────────
function StatusBadge({ status }) {
  const c = STATUS_CFG[status] || STATUS_CFG['未定'];
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'0.15rem 0.6rem', borderRadius:'999px', fontSize:'0.72rem', fontWeight:700, background:c.bg, color:c.color, border:`1px solid ${c.border}`, whiteSpace:'nowrap', letterSpacing:'0.02em' }}>
      {status || '未定'}
    </span>
  );
}

// ── StatusSelect ─────────────────────────────────────────────────
function StatusSelect({ value, onChange }) {
  const v = value || '未定';
  const c = STATUS_CFG[v] || STATUS_CFG['未定'];
  return (
    <select value={v} onChange={e => onChange(e.target.value)} style={{
      fontSize:'0.72rem', fontWeight:700, padding:'0.15rem 1.4rem 0.15rem 0.6rem',
      borderRadius:'999px', border:`1px solid ${c.border}`, background:c.bg, color:c.color,
      cursor:'pointer', outline:'none', appearance:'none',
      backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' stroke='${encodeURIComponent(c.color)}' fill='none' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat:'no-repeat', backgroundPosition:'right 0.35rem center',
    }}>
      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

// ── EditableText ─────────────────────────────────────────────────
function EditableText({ value, onChange, multiline, placeholder, readOnly }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value || '');
  const timer = useRef(null);

  useEffect(() => { if (!editing) setLocal(value || ''); }, [value, editing]);

  const handleChange = (v) => {
    setLocal(v);
    if (multiline) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (v !== (value||'')) onChange(v); }, 2000);
    }
  };

  const commit = () => {
    setEditing(false);
    clearTimeout(timer.current);
    if (local !== (value||'')) onChange(local);
  };

  if (readOnly) {
    return (
      <div style={{ fontSize:'0.8125rem', color: local ? '#1a1917' : '#c4c0ba', lineHeight:1.55, minHeight:'1.25rem' }}>
        {local || (placeholder || '—')}
      </div>
    );
  }

  const sharedInputStyle = {
    width:'100%', border:'1.5px solid #3b82f6', borderRadius:'0.375rem',
    padding: multiline ? '0.375rem 0.5rem' : '0.25rem 0.4rem',
    fontSize:'0.8125rem', fontFamily:'inherit', outline:'none', background:'#fff',
    resize: multiline ? 'vertical' : 'none',
    minHeight: multiline ? '72px' : 'auto',
    lineHeight:1.55,
  };

  if (editing) {
    return multiline
      ? <textarea value={local} onChange={e => handleChange(e.target.value)} onBlur={commit} placeholder={placeholder} autoFocus style={sharedInputStyle} />
      : <input type="text" value={local} onChange={e => setLocal(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()} placeholder={placeholder} autoFocus style={sharedInputStyle} />;
  }

  return (
    <div onClick={() => setEditing(true)} title={local} style={{
      cursor:'text', fontSize:'0.8125rem', lineHeight:1.55,
      color: local ? '#1a1917' : '#c4c0ba',
      minHeight:'1.25rem', padding:'0.125rem 0',
      display: multiline ? '-webkit-box' : 'block',
      WebkitLineClamp: multiline ? 3 : undefined,
      WebkitBoxOrient: multiline ? 'vertical' : undefined,
      overflow: multiline ? 'hidden' : 'visible',
    }}>
      {local || (placeholder || '—')}
    </div>
  );
}

// ── EditableNumber ───────────────────────────────────────────────
function EditableNumber({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal]     = useState(value != null && value !== '' ? String(value) : '');

  useEffect(() => { if (!editing) setLocal(value != null && value !== '' ? String(value) : ''); }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const n = parseInt(local);
    const clamped = isNaN(n) ? '' : Math.min(10, Math.max(1, n));
    setLocal(clamped === '' ? '' : String(clamped));
    if (String(clamped) !== String(value)) onChange(clamped === '' ? '' : clamped);
  };

  if (editing) {
    return (
      <input type="number" value={local} onChange={e => setLocal(e.target.value)} onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()} min={1} max={10} autoFocus
        style={{ width:'3.25rem', border:'1.5px solid #3b82f6', borderRadius:'0.375rem', padding:'0.3rem', fontSize:'0.875rem', fontFamily:'inherit', outline:'none', textAlign:'center' }}
      />
    );
  }

  const n = parseInt(local);
  const hasVal = !isNaN(n);
  const hue = hasVal ? Math.round((n - 1) / 9 * 120) : 0;
  return (
    <div onClick={() => setEditing(true)} style={{
      cursor:'pointer', width:'2.125rem', height:'2.125rem', borderRadius:'0.5rem',
      display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto',
      background: hasVal ? `hsl(${hue},55%,30%)` : '#f1f0ee',
      color: hasVal ? '#fff' : '#c4c0ba',
      fontSize:'0.875rem', fontWeight:700,
    }}>
      {hasVal ? n : '—'}
    </div>
  );
}

// ── DeptPills ── depts は [{name, rank}, ...] の配列 ────────────
function DeptPills({ depts, compact }) {
  if (!depts || !depts.length) return <span style={{ color:'#c4c0ba', fontSize:'0.75rem' }}>未入力</span>;
  const sorted = [...depts].sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const show = compact ? sorted.slice(0, 3) : sorted;
  const more = compact && sorted.length > 3 ? sorted.length - 3 : 0;
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem', alignItems:'center' }}>
      {show.map((d, i) => {
        const c = DEPT_COLORS[d.name] || { bg:'#f1f0ee', color:'#374151', border:'#d4d0ca' };
        const isFirst = d.rank === 1;
        return (
          <span key={i} style={{
            fontSize:'0.7rem', padding:'0.15rem 0.55rem', borderRadius:'999px',
            background: isFirst ? c.color : c.bg,
            color: isFirst ? '#fff' : c.color,
            border: `1px solid ${c.border}`,
            fontWeight: isFirst ? 700 : 500,
            boxShadow: isFirst ? `0 1px 4px ${c.border}` : 'none',
          }}>
            {d.rank}.{d.name}
          </span>
        );
      })}
      {more > 0 && <span style={{ fontSize:'0.68rem', color:'#9ca3af', fontWeight:500 }}>+{more}</span>}
    </div>
  );
}

// ── DeptOrderPicker (追加・編集用) ───────────────────────────────
function DeptOrderPicker({ value, onChange }) {
  // value: [{name, rank}, ...]
  const selected = [...(value || [])].sort((a, b) => a.rank - b.rank);
  const remaining = DEPARTMENTS.filter(d => !selected.find(s => s.name === d));

  const add = (name) => {
    const next = [...selected, { name, rank: selected.length + 1 }];
    onChange(next);
  };
  const remove = (name) => {
    const next = selected.filter(s => s.name !== name).map((s, i) => ({ ...s, rank: i + 1 }));
    onChange(next);
  };

  return (
    <div>
      {/* 選択済み */}
      {selected.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem', marginBottom:'0.5rem' }}>
          {selected.map(s => {
            const c = DEPT_COLORS[s.name] || { bg:'#f1f0ee', color:'#374151', border:'#d4d0ca' };
            return (
              <span key={s.name} style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', fontSize:'0.75rem', padding:'0.15rem 0.4rem 0.15rem 0.6rem', borderRadius:'999px', background:c.color, color:'#fff', fontWeight:600, border:`1px solid ${c.border}` }}>
                {s.rank}.{s.name}
                <button onClick={() => remove(s.name)} style={{ background:'rgba(255,255,255,0.25)', border:'none', borderRadius:'50%', width:14, height:14, cursor:'pointer', color:'#fff', fontSize:'0.65rem', display:'flex', alignItems:'center', justifyContent:'center', padding:0, lineHeight:1, flexShrink:0 }}>✕</button>
              </span>
            );
          })}
        </div>
      )}
      {/* 未選択 */}
      {remaining.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem' }}>
          {remaining.map(d => {
            const c = DEPT_COLORS[d] || { bg:'#f1f0ee', color:'#374151', border:'#d4d0ca' };
            return (
              <button key={d} onClick={() => add(d)} style={{ fontSize:'0.75rem', padding:'0.15rem 0.6rem', borderRadius:'999px', border:`1px dashed ${c.border}`, background:c.bg, color:c.color, cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
                + {d}
              </button>
            );
          })}
        </div>
      )}
      {selected.length === 0 && <p style={{ fontSize:'0.8rem', color:'#c4c0ba', margin:'0.25rem 0 0' }}>上のボタンで局を追加（クリック順が希望順）</p>}
    </div>
  );
}

// ── SetupModal ───────────────────────────────────────────────────
function SetupModal({ onSave, initialUrl, onClose }) {
  const [tab, setTab]           = useState('url');
  const [url, setUrl]           = useState(initialUrl || '');
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [copied, setCopied]     = useState(false);

  const testConnection = async () => {
    if (!url) return;
    setTesting(true); setTestResult(null);
    try {
      const res  = await fetch(`${url}?action=getAll`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTestResult({ ok:true, msg:`接続成功！ ${json.rows?.length ?? 0}件のデータを確認しました。` });
    } catch(e) {
      setTestResult({ ok:false, msg:`接続失敗: ${e.message}` });
    }
    setTesting(false);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(GAS_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }}>
      <div style={{ background:'#fff', borderRadius:'1rem', width:'100%', maxWidth:'680px', maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ padding:'1.5rem 1.5rem 0', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <h2 style={{ margin:0, fontSize:'1.25rem', fontWeight:700 }}>⚙ セットアップ</h2>
              <p style={{ margin:'0.25rem 0 0', fontSize:'0.8125rem', color:'#9ca3af' }}>スキーマ: id / name / kana / depts / reason / 日時 / コマ / 評価 / ステータス / メモ</p>
            </div>
            {onClose && <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:'1.25rem', lineHeight:1, padding:'0.25rem' }}>✕</button>}
          </div>
          <div style={{ display:'flex', marginTop:'1.25rem', borderBottom:'2px solid #f0ede8' }}>
            {[['url','① URL設定'],['code','② GASコード'],['guide','③ 手順']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} style={{ padding:'0.5rem 1rem', border:'none', background:'none', cursor:'pointer', fontSize:'0.8125rem', fontWeight:tab===id?700:400, color:tab===id?'#1e40af':'#6b6660', borderBottom:tab===id?'2px solid #1e40af':'2px solid transparent', marginBottom:'-2px', whiteSpace:'nowrap' }}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ padding:'1.5rem', overflowY:'auto', flex:1 }}>
          {tab === 'url' && (
            <div>
              <label style={{ display:'block', fontSize:'0.875rem', fontWeight:600, marginBottom:'0.5rem', color:'#374151' }}>GAS Web App URL</label>
              <input type="url" value={url} onChange={e => { setUrl(e.target.value); setTestResult(null); }}
                placeholder="https://script.google.com/macros/s/..."
                style={{ width:'100%', padding:'0.75rem', border:'1.5px solid #d4d0ca', borderRadius:'0.5rem', fontSize:'0.875rem', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
                onFocus={e => e.target.style.borderColor='#3b82f6'} onBlur={e => e.target.style.borderColor='#d4d0ca'}
              />
              {testResult && (
                <div style={{ marginTop:'0.75rem', padding:'0.625rem 0.875rem', borderRadius:'0.5rem', background:testResult.ok?'#f0fdf4':'#fef2f2', color:testResult.ok?'#166534':'#991b1b', border:`1px solid ${testResult.ok?'#86efac':'#fca5a5'}`, fontSize:'0.8125rem' }}>
                  {testResult.msg}
                </div>
              )}
              <div style={{ display:'flex', gap:'0.75rem', marginTop:'1rem' }}>
                <button onClick={testConnection} disabled={!url||testing} style={{ flex:1, padding:'0.625rem', border:'1.5px solid #d4d0ca', borderRadius:'0.5rem', background:'#fff', cursor:url?'pointer':'not-allowed', fontSize:'0.875rem', fontFamily:'inherit', fontWeight:500, opacity:(!url||testing)?0.6:1 }}>
                  {testing ? '確認中…' : '接続テスト'}
                </button>
                <button onClick={() => url && onSave(url)} disabled={!url} style={{ flex:2, padding:'0.625rem', border:'none', borderRadius:'0.5rem', background:url?'#1e293b':'#d4d0ca', color:'#fff', cursor:url?'pointer':'not-allowed', fontSize:'0.875rem', fontFamily:'inherit', fontWeight:700 }}>
                  保存して接続する
                </button>
              </div>
            </div>
          )}

          {tab === 'code' && (
            <div>
              <p style={{ margin:'0 0 0.875rem', fontSize:'0.875rem', color:'#6b6660', lineHeight:1.6 }}>このコードをコピーして Apps Script に貼り付けてください。</p>
              <div style={{ position:'relative' }}>
                <pre style={{ background:'#0f172a', color:'#e2e8f0', padding:'1rem', borderRadius:'0.625rem', fontSize:'0.7rem', lineHeight:1.65, overflowX:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all', margin:0, maxHeight:'52vh', overflowY:'auto' }}>
                  {GAS_CODE}
                </pre>
                <button onClick={copyCode} style={{ position:'absolute', top:'0.625rem', right:'0.625rem', padding:'0.3rem 0.875rem', background:copied?'rgba(74,222,128,0.2)':'rgba(255,255,255,0.12)', color:copied?'#4ade80':'#e2e8f0', border:`1px solid ${copied?'rgba(74,222,128,0.4)':'rgba(255,255,255,0.2)'}`, borderRadius:'0.375rem', cursor:'pointer', fontSize:'0.75rem', fontFamily:'inherit' }}>
                  {copied ? '✓ コピー済み' : 'コピー'}
                </button>
              </div>
            </div>
          )}

          {tab === 'guide' && (
            <ol style={{ paddingLeft:'1.25rem', margin:0 }}>
              {[
                ['Google スプレッドシートを新規作成する', null],
                ['「拡張機能」→「Apps Script」を開く', null],
                ['「② GASコード」タブのコードを全て貼り付けて保存（Ctrl+S）', null],
                ['「実行」→「initSheet」を実行（初回のみ）', '⚠ 権限の許可ダイアログが出たら「許可」を選んでください'],
                ['「デプロイ」→「新しいデプロイ」→ ウェブアプリ', null],
                ['次のユーザーとして実行: 自分 ／ アクセス: 全員', null],
                ['デプロイURLをコピーして「① URL設定」タブに貼り付ける', null],
              ].map(([step, note], i) => (
                <li key={i} style={{ marginBottom:'0.75rem', fontSize:'0.875rem', color:'#374151', lineHeight:1.6 }}>
                  <strong>Step {i+1}:</strong> {step}
                  {note && <div style={{ marginTop:'0.25rem', fontSize:'0.8rem', color:'#d97706', background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'0.375rem', padding:'0.375rem 0.625rem' }}>{note}</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

// ── AddApplicantModal ────────────────────────────────────────────
function AddApplicantModal({ onAdd, onClose }) {
  const blank = { id:'', name:'', kana:'', depts:[], reason:'', 日時:'' };
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.name.trim().length > 0;

  const inputBase = { width:'100%', padding:'0.5rem 0.625rem', border:'1.5px solid #d4d0ca', borderRadius:'0.375rem', fontSize:'0.875rem', fontFamily:'inherit', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' };
  const focusStyle = e => e.target.style.borderColor = '#3b82f6';
  const blurStyle  = e => e.target.style.borderColor = '#d4d0ca';

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'1rem' }}>
      <div style={{ background:'#fff', borderRadius:'1rem', width:'100%', maxWidth:'540px', maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid #f0ede8', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <h3 style={{ margin:0, fontSize:'1.125rem', fontWeight:700 }}>応募者を追加</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#9ca3af', fontSize:'1.25rem', lineHeight:1, padding:'0.25rem' }}>✕</button>
        </div>

        <div style={{ padding:'1.25rem 1.5rem', overflowY:'auto', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem' }}>

            <div style={{ gridColumn:'span 2' }}>
              <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, marginBottom:'0.3rem', color:'#4b5563' }}>名前 *</label>
              <input type="text" value={form.name} onChange={e => set('name', e.target.value)} style={inputBase} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            <div>
              <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, marginBottom:'0.3rem', color:'#4b5563' }}>フリガナ</label>
              <input type="text" value={form.kana} onChange={e => set('kana', e.target.value)} style={inputBase} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            <div>
              <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, marginBottom:'0.3rem', color:'#4b5563' }}>学籍番号 (id)</label>
              <input type="text" value={form.id} onChange={e => set('id', e.target.value)} placeholder="例: 情25-1001" style={inputBase} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            <div style={{ gridColumn:'span 2' }}>
              <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, marginBottom:'0.5rem', color:'#4b5563' }}>
                志望局（クリックした順が希望順）
              </label>
              <DeptOrderPicker value={form.depts} onChange={v => set('depts', v)} />
            </div>

            <div style={{ gridColumn:'span 2' }}>
              <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, marginBottom:'0.3rem', color:'#4b5563' }}>志望動機</label>
              <textarea value={form.reason} onChange={e => set('reason', e.target.value)} rows={3} style={{ ...inputBase, resize:'vertical' }} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            <div style={{ gridColumn:'span 2' }}>
              <label style={{ display:'block', fontSize:'0.8rem', fontWeight:600, marginBottom:'0.3rem', color:'#4b5563' }}>面接日時</label>
              <input type="text" value={form.日時} onChange={e => set('日時', e.target.value)} placeholder="例: 4/25 10:00" style={inputBase} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
          </div>
        </div>

        <div style={{ padding:'1rem 1.5rem', borderTop:'1px solid #f0ede8', display:'flex', gap:'0.75rem', justifyContent:'flex-end', flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'0.5625rem 1.25rem', border:'1.5px solid #d4d0ca', borderRadius:'0.5rem', background:'#fff', cursor:'pointer', fontSize:'0.875rem', fontFamily:'inherit', fontWeight:500 }}>キャンセル</button>
          <button onClick={() => valid && onAdd(form)} disabled={!valid} style={{ padding:'0.5625rem 1.5rem', border:'none', borderRadius:'0.5rem', background:valid?'#1e293b':'#d4d0ca', color:'#fff', cursor:valid?'pointer':'not-allowed', fontSize:'0.875rem', fontFamily:'inherit', fontWeight:700 }}>
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ExpandedSection ──────────────────────────────────────────────
function ExpandedSection({ applicant: a }) {
  return (
    <div style={{ padding:'0.875rem 1rem 1rem 1rem', background:'#f8f7f5', borderTop:'1px solid #f0ede8', animation:'fadeIn 0.15s ease' }}>
      <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', maxWidth:'820px' }}>
        <div>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.4rem' }}>志望局（全希望）</div>
          <DeptPills depts={a.depts} />
        </div>
        <div>
          <div style={{ fontSize:'0.72rem', fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.375rem' }}>志望動機</div>
          <div style={{ fontSize:'0.8125rem', color:'#374151', lineHeight:1.8, whiteSpace:'pre-wrap', background:'#fff', border:'1px solid #ece9e4', borderRadius:'0.5rem', padding:'0.625rem 0.75rem' }}>
            {a.reason || <span style={{ color:'#c4c0ba' }}>未入力</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  DEPARTMENTS, STATUSES, STATUS_CFG, GAS_CODE,
  SaveStatus, StatusBadge, StatusSelect, EditableText, EditableNumber,
  DeptPills, DeptOrderPicker, SetupModal, AddApplicantModal, ExpandedSection,
});
