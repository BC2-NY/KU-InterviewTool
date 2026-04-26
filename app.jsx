const { useState, useEffect, useRef, useCallback, useMemo } = React;

const GAS_URL_KEY = 'interview_mgr_gas_url_v1';

// ── useApplicants hook ───────────────────────────────────────────
function useApplicants(gasUrl) {
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle');
  const localEdits = useRef({});
  const saveTimer  = useRef(null);

  const flashSave = useCallback((ok) => {
    setSaveStatus(ok ? 'saved' : 'error');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveStatus('idle'), 2500);
  }, []);

  // GAS への GET リクエスト（CORS 回避のため全て GET）
  const callGAS = useCallback(async (action, data) => {
    if (!gasUrl) return null;
    const params = new URLSearchParams({ action });
    if (data) params.set('data', JSON.stringify(data));
    const res  = await fetch(`${gasUrl}?${params.toString()}`);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch(e) { throw new Error('GASからの応答が不正です: ' + text.slice(0, 100)); }
    if (json.error) throw new Error(json.error);
    return json;
  }, [gasUrl]);

  const fetchAll = useCallback(async (silent = false) => {
    if (!gasUrl) return;
    if (!silent) setLoading(true);
    try {
      const json = await callGAS('getAll');
      const rows = json?.rows || [];
      setApplicants(prev => {
        if (Object.keys(localEdits.current).length === 0) return rows;
        return rows.map(newRow => {
          const merged = { ...newRow };
          Object.keys(newRow).forEach(field => {
            const key = `${newRow._row}_${field}`;
            if (localEdits.current[key] !== undefined) merged[field] = localEdits.current[key];
          });
          return merged;
        });
      });
    } catch(e) {
      console.error('GAS fetch error:', e.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [gasUrl, callGAS]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!gasUrl) return;
    const t = setInterval(() => fetchAll(true), 10000);
    return () => clearInterval(t);
  }, [gasUrl, fetchAll]);

  const updateField = useCallback(async (row, field, value) => {
    setApplicants(prev => prev.map(a => a._row === row ? { ...a, [field]: value } : a));
    localEdits.current[`${row}_${field}`] = value;
    setSaveStatus('saving');
    try {
      // depts は配列なので送信前に stringify
      const sendVal = (field === 'depts' && Array.isArray(value)) ? JSON.stringify(value) : value;
      await callGAS('update', { row, field, value: sendVal });
      delete localEdits.current[`${row}_${field}`];
      flashSave(true);
    } catch(e) {
      console.error('Update failed:', e.message);
      flashSave(false);
    }
  }, [callGAS, flashSave]);

  const addApplicant = useCallback(async (data) => {
    setSaveStatus('saving');
    try {
      // depts 配列は JSON 文字列として送る
      const payload = {
        ...data,
        depts: Array.isArray(data.depts) ? JSON.stringify(data.depts) : (data.depts || '[]'),
        ステータス: '未定',
        評価: '',
        メモ: '',
      };
      await callGAS('add', payload);
      flashSave(true);
      await fetchAll();
    } catch(e) {
      console.error('Add failed:', e.message);
      flashSave(false);
      throw e; // モーダル側でキャッチ
    }
  }, [callGAS, flashSave, fetchAll]);

  const deleteApplicant = useCallback(async (row) => {
    try {
      await callGAS('delete', { row });
      setApplicants(prev => prev.filter(a => a._row !== row));
    } catch(e) {
      console.error('Delete failed:', e.message);
    }
  }, [callGAS]);

  return { applicants, loading, saveStatus, updateField, addApplicant, deleteApplicant, fetchAll };
}

// ── ApplicantTable (desktop) ─────────────────────────────────────
function ApplicantTable({ applicants, onUpdate, onDelete, searchQuery, statusFilter }) {
  const [expandedRow, setExpandedRow] = useState(null);
  const [sortKey, setSortKey]         = useState(null);
  const [sortDir, setSortDir]         = useState('asc');
  const [confirmDel, setConfirmDel]   = useState(null);

  const filtered = useMemo(() => {
    let rows = [...applicants];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(a =>
        ['name','kana','id'].some(k => String(a[k]||'').toLowerCase().includes(q))
      );
    }
    if (statusFilter && statusFilter !== 'all') {
      rows = rows.filter(a => (a['ステータス']||'未定') === statusFilter);
    }
    if (sortKey) {
      rows.sort((a, b) => {
        const va = String(a[sortKey]||''), vb = String(b[sortKey]||'');
        const cmp = sortKey === '評価'
          ? (parseFloat(va)||0) - (parseFloat(vb)||0)
          : va.localeCompare(vb, 'ja');
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return rows;
  }, [applicants, searchQuery, statusFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return <span style={{ opacity:0.3, marginLeft:'0.2rem' }}>↕</span>;
    return <span style={{ marginLeft:'0.2rem', color:'#3b82f6' }}>{sortDir==='asc'?'↑':'↓'}</span>;
  };

  const TH = ({ label, sk, w, center }) => (
    <th onClick={sk ? () => toggleSort(sk) : undefined} style={{
      padding:'0.625rem 0.875rem', fontSize:'0.7rem', fontWeight:700, color:'#9ca3af',
      textTransform:'uppercase', letterSpacing:'0.07em', whiteSpace:'nowrap',
      width:w, minWidth:w, textAlign:center?'center':'left',
      background:'#faf9f7', borderBottom:'2px solid #ece9e4',
      position:'sticky', top:0, zIndex:10,
      cursor:sk?'pointer':'default', userSelect:'none',
    }}>
      {label}{sk && sortIcon(sk)}
    </th>
  );

  const TD = ({ w, center, vAlign, children, noPad }) => (
    <td style={{ padding: noPad ? 0 : '0.625rem 0.875rem', borderBottom:'1px solid #f0ede8', verticalAlign:vAlign||'top', width:w, maxWidth:w }}>
      {center ? <div style={{ display:'flex', justifyContent:'center' }}>{children}</div> : children}
    </td>
  );

  if (filtered.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'0.5rem', color:'#c4c0ba', padding:'4rem' }}>
        <div style={{ fontSize:'2.5rem' }}>📋</div>
        <div>該当する応募者がいません</div>
      </div>
    );
  }

  return (
    <div style={{ overflowX:'auto', overflowY:'auto', flex:1 }}>
      <table style={{ borderCollapse:'collapse', width:'100%', minWidth:'980px' }}>
        <thead>
          <tr>
            <TH label="#"           w="3rem" />
            <TH label="名前/フリガナ"  w="9.5rem"  sk="name" />
            <TH label="学籍番号"      w="8rem"    sk="id" />
            <TH label="志望局"        w="14rem" />
            <TH label="日時"          w="7rem"    sk="日時" />
            <TH label="評価"          w="5rem"    sk="評価" center />
            <TH label="ステータス"    w="7rem"    sk="ステータス" />
            <TH label="メモ（共有）"  w="16rem" />
            <TH label=""              w="2.5rem" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((a, idx) => (
            <React.Fragment key={a._row}>
              <tr style={{
                background: expandedRow===a._row ? '#f0f4ff' : idx%2===0 ? '#fff' : '#fafbff',
                borderLeft: `3px solid ${STATUS_CFG[a.ステータス||'未定']?.border || '#d4d0ca'}`,
                transition:'background 0.1s'
              }}>

                {/* # + expand */}
                <TD w="3rem" vAlign="middle" center>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.2rem' }}>
                    <span style={{ fontSize:'0.7rem', color:'#c4c0ba', fontWeight:600 }}>{idx+1}</span>
                    <button onClick={() => setExpandedRow(expandedRow===a._row ? null : a._row)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#c4c0ba', fontSize:'0.65rem', padding:0, lineHeight:1 }}
                      title="志望動機を表示">
                      {expandedRow===a._row ? '▲' : '▼'}
                    </button>
                  </div>
                </TD>

                {/* 名前 / フリガナ */}
                <TD w="9.5rem">
                  <div style={{ fontWeight:600, fontSize:'0.875rem' }}>
                    <EditableText value={a.name} onChange={v => onUpdate(a._row,'name',v)} placeholder="名前" />
                  </div>
                  <div style={{ marginTop:'0.2rem', opacity:0.55 }}>
                    <EditableText value={a.kana} onChange={v => onUpdate(a._row,'kana',v)} placeholder="フリガナ" />
                  </div>
                </TD>

                {/* 学籍番号 */}
                <TD w="8rem">
                  <EditableText value={a.id} onChange={v => onUpdate(a._row,'id',v)} placeholder="—" />
                </TD>

                {/* 志望局（上位3件 + overflow） */}
                <TD w="14rem" vAlign="middle">
                  <DeptPills depts={a.depts} compact />
                </TD>

                {/* 日時 */}
                <TD w="7rem">
                  <EditableText value={a.日時} onChange={v => onUpdate(a._row,'日時',v)} placeholder="日時" />
                </TD>

                {/* 評価 */}
                <TD w="5rem" center vAlign="middle">
                  <EditableNumber value={a.評価} onChange={v => onUpdate(a._row,'評価',v)} />
                </TD>

                {/* ステータス */}
                <TD w="7rem" vAlign="middle">
                  <StatusSelect value={a.ステータス||'未定'} onChange={v => onUpdate(a._row,'ステータス',v)} />
                </TD>

                {/* メモ */}
                <TD w="16rem">
                  <EditableText value={a.メモ} onChange={v => onUpdate(a._row,'メモ',v)} multiline placeholder="メモを入力…" />
                </TD>

                {/* 削除 */}
                <TD w="2.5rem" vAlign="middle" center>
                  {confirmDel === a._row ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem', alignItems:'center' }}>
                      <button onClick={() => { onDelete(a._row); setConfirmDel(null); }}
                        style={{ background:'#dc2626', color:'#fff', border:'none', borderRadius:'0.25rem', padding:'0.2rem 0.4rem', fontSize:'0.7rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>削除</button>
                      <button onClick={() => setConfirmDel(null)}
                        style={{ background:'#f1f0ee', color:'#374151', border:'none', borderRadius:'0.25rem', padding:'0.2rem 0.4rem', fontSize:'0.7rem', cursor:'pointer', fontFamily:'inherit' }}>取消</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDel(a._row)}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'#d4d0ca', fontSize:'1rem', padding:'0.25rem', lineHeight:1, transition:'color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.color='#dc2626'}
                      onMouseLeave={e => e.currentTarget.style.color='#d4d0ca'}>✕</button>
                  )}
                </TD>
              </tr>

              {/* 志望動機 展開行 */}
              {expandedRow === a._row && (
                <tr>
                  <td colSpan={9} style={{ padding:0 }}>
                    <ExpandedSection applicant={a} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── MobileCard ───────────────────────────────────────────────────
function MobileCard({ applicant: a, onUpdate, onDelete }) {
  const [expanded, setExpanded]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const n = parseInt(a.評価);
  const hasScore = !isNaN(n);
  const hue = hasScore ? Math.round((n-1)/9*120) : 0;

  return (
    <div style={{ background:'#fff', borderRadius:'0.875rem', border:'1px solid #e8e6e1', overflow:'hidden', marginBottom:'0.75rem', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
      {/* ヘッダー */}
      <div onClick={() => setExpanded(!expanded)} style={{ padding:'0.875rem 1rem', display:'flex', alignItems:'center', gap:'0.75rem', cursor:'pointer', userSelect:'none' }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:'0.9375rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {a.name || <span style={{ color:'#c4c0ba' }}>名前未入力</span>}
          </div>
          <div style={{ fontSize:'0.75rem', color:'#9ca3af', marginTop:'0.1rem' }}>
            {[a.kana, a.id].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        {/* 第1志望の局 */}
        {a.depts && a.depts.length > 0 && (
          <span style={{ fontSize:'0.72rem', color:'#64748b', background:'#f1f5f9', padding:'0.15rem 0.5rem', borderRadius:'999px', whiteSpace:'nowrap', flexShrink:0 }}>
            {[...a.depts].sort((x,y) => x.rank-y.rank)[0]?.name}
          </span>
        )}
        <StatusBadge status={a.ステータス||'未定'} />
        {hasScore && (
          <div style={{ background:`hsl(${hue},55%,30%)`, color:'#fff', borderRadius:'0.5rem', width:'2rem', height:'2rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8125rem', fontWeight:700, flexShrink:0 }}>
            {n}
          </div>
        )}
        <span style={{ color:'#c4c0ba', fontSize:'0.75rem', flexShrink:0 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* 展開エリア */}
      {expanded && (
        <div style={{ borderTop:'1px solid #f0ede8', padding:'0.875rem 1rem' }} onClick={e => e.stopPropagation()}>

          {/* 基本情報（読み取り専用） */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.875rem' }}>
            <div>
              <div style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'0.25rem' }}>学籍番号</div>
              <EditableText value={a.id} onChange={v => onUpdate(a._row,'id',v)} placeholder="—" />
            </div>
            <div>
              <div style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'0.25rem' }}>日時</div>
              <EditableText value={a.日時} onChange={v => onUpdate(a._row,'日時',v)} placeholder="—" />
            </div>
          </div>

          {/* 志望局（全件） */}
          <div style={{ marginBottom:'0.875rem' }}>
            <div style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'0.375rem' }}>志望局（全希望）</div>
            <DeptPills depts={a.depts} />
          </div>

          {/* 志望動機 */}
          {a.reason && (
            <div style={{ marginBottom:'0.875rem', padding:'0.625rem 0.75rem', background:'#f8f7f5', borderRadius:'0.5rem', border:'1px solid #f0ede8' }}>
              <div style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'0.375rem' }}>志望動機</div>
              <div style={{ fontSize:'0.8125rem', color:'#374151', lineHeight:1.7 }}>{a.reason}</div>
            </div>
          )}

          {/* 評価・ステータス */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem', marginBottom:'0.875rem', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'0.25rem' }}>評価（1-10）</div>
              <EditableNumber value={a.評価} onChange={v => onUpdate(a._row,'評価',v)} />
            </div>
            <div>
              <div style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'0.25rem' }}>ステータス</div>
              <StatusSelect value={a.ステータス||'未定'} onChange={v => onUpdate(a._row,'ステータス',v)} />
            </div>
          </div>

          {/* 共有メモ */}
          <div style={{ marginBottom:'0.875rem' }}>
            <div style={{ fontSize:'0.72rem', color:'#9ca3af', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'0.375rem' }}>メモ（共有）</div>
            <EditableText value={a.メモ} onChange={v => onUpdate(a._row,'メモ',v)} multiline placeholder="メモを入力…" />
          </div>

          {/* 削除ボタン */}
          <div style={{ display:'flex', justifyContent:'flex-end' }}>
            {confirmDel ? (
              <div style={{ display:'flex', gap:'0.5rem' }}>
                <button onClick={() => setConfirmDel(false)} style={{ padding:'0.4rem 0.875rem', border:'1px solid #d4d0ca', borderRadius:'0.5rem', background:'#fff', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'inherit' }}>取消</button>
                <button onClick={() => onDelete(a._row)} style={{ padding:'0.4rem 0.875rem', border:'none', borderRadius:'0.5rem', background:'#dc2626', color:'#fff', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'inherit', fontWeight:600 }}>削除する</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDel(true)} style={{ padding:'0.4rem 0.875rem', border:'1px solid #fca5a5', borderRadius:'0.5rem', background:'#fff', color:'#dc2626', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'inherit' }}>削除</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── App root ─────────────────────────────────────────────────────
function App() {
  const [gasUrl, setGasUrl]       = useState(() => localStorage.getItem(GAS_URL_KEY) || '');
  const [showSetup, setShowSetup] = useState(!localStorage.getItem(GAS_URL_KEY));
  const [showAdd, setShowAdd]     = useState(false);
  const [addError, setAddError]   = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isMobile, setIsMobile]   = useState(window.innerWidth < 768);

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  const { applicants, loading, saveStatus, updateField, addApplicant, deleteApplicant, fetchAll } =
    useApplicants(gasUrl);

  const handleSaveUrl = (url) => {
    setGasUrl(url);
    localStorage.setItem(GAS_URL_KEY, url);
    setShowSetup(false);
  };

  const handleAddApplicant = async (data) => {
    setAddError('');
    try {
      await addApplicant(data);
      setShowAdd(false);
    } catch(e) {
      setAddError('追加に失敗しました: ' + e.message);
    }
  };

  const stats = useMemo(() => ({
    total: applicants.length,
    ...Object.fromEntries(STATUSES.map(s => [s, applicants.filter(a => (a.ステータス||'未定') === s).length])),
  }), [applicants]);

  const mobileFiltered = useMemo(() => applicants.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || ['name','kana','id'].some(k => String(a[k]||'').toLowerCase().includes(q));
    const matchStatus = statusFilter === 'all' || (a.ステータス||'未定') === statusFilter;
    return matchSearch && matchStatus;
  }), [applicants, search, statusFilter]);

  const btnBase = { border:'none', borderRadius:'0.5rem', cursor:'pointer', fontSize:'0.8125rem', fontFamily:'inherit', fontWeight:600, padding:'0.5rem 0.875rem', transition:'opacity 0.15s' };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#f5f4f2' }}>

      {/* ── ヘッダー ─────────────────────────────────── */}
      <header style={{ background:'linear-gradient(135deg, #1e293b 0%, #1e3a5f 100%)', color:'#fff', padding:isMobile?'0.75rem 1rem':'0.875rem 1.5rem', flexShrink:0, boxShadow:'0 2px 16px rgba(0,0,0,0.25)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.875rem', flexWrap:'wrap', rowGap:'0.625rem' }}>

          {/* ロゴ */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.625rem', flexShrink:0 }}>
            <div style={{ background:'#3b82f6', width:30, height:30, borderRadius:'0.5rem', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem', fontWeight:900, flexShrink:0, boxShadow:'0 2px 8px rgba(59,130,246,0.5)' }}>面</div>
            <div>
              <div style={{ fontWeight:800, fontSize:'0.9375rem', lineHeight:1.1, letterSpacing:'-0.01em' }}>面接管理システム</div>
              <div style={{ fontSize:'0.7rem', color:'#64748b', marginTop:'0.1rem' }}>{stats.total}名 · 10秒同期</div>
            </div>
          </div>

          {/* 検索 */}
          <div style={{ flex:'1 1 160px', maxWidth:300, position:'relative' }}>
            <span style={{ position:'absolute', left:'0.625rem', top:'50%', transform:'translateY(-50%)', color:'#475569', fontSize:'0.875rem', pointerEvents:'none' }}>🔍</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="名前・学籍番号で検索…"
              style={{ width:'100%', padding:'0.5rem 0.75rem 0.5rem 2rem', background:'rgba(255,255,255,0.09)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:'0.5rem', color:'#fff', fontSize:'0.8125rem', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
            />
          </div>

          {/* ステータスフィルター */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding:'0.5rem 0.75rem', background:'rgba(255,255,255,0.09)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:'0.5rem', color:'#fff', fontSize:'0.8125rem', fontFamily:'inherit', outline:'none', cursor:'pointer', flexShrink:0 }}>
            <option value="all" style={{background:'#1e293b'}}>すべて ({stats.total})</option>
            {STATUSES.map(s => <option key={s} value={s} style={{background:'#1e293b'}}>{s} ({stats[s]||0})</option>)}
          </select>

          {/* 保存インジケーター */}
          <SaveStatus status={saveStatus} />

          {/* ボタン群 */}
          <div style={{ display:'flex', gap:'0.5rem', flexShrink:0, marginLeft:'auto' }}>
            <button onClick={() => fetchAll(false)} style={{ ...btnBase, background:'rgba(255,255,255,0.1)', color:'#fff', border:'1px solid rgba(255,255,255,0.15)', fontWeight:500 }}>↺{!isMobile && ' 更新'}</button>
            <button onClick={() => { setAddError(''); setShowAdd(true); }} style={{ ...btnBase, background:'linear-gradient(135deg,#3b82f6,#6366f1)', color:'#fff', boxShadow:'0 2px 8px rgba(99,102,241,0.4)' }}>＋{!isMobile && ' 追加'}</button>
            <button onClick={() => setShowSetup(true)} style={{ ...btnBase, background:'rgba(255,255,255,0.1)', color:'#94a3b8', border:'1px solid rgba(255,255,255,0.12)', fontWeight:400, fontSize:'1rem', padding:'0.5rem 0.625rem' }} title="設定">⚙</button>
          </div>
        </div>

        {/* ステータスチップ（デスクトップ） */}
        {!isMobile && (
          <div style={{ display:'flex', gap:'0.5rem', marginTop:'0.625rem', flexWrap:'wrap' }}>
            {STATUSES.map(s => {
              const c = STATUS_CFG[s];
              return (
                <button key={s} onClick={() => setStatusFilter(statusFilter===s ? 'all' : s)} style={{
                  padding:'0.2rem 0.75rem', borderRadius:'999px', border:`1px solid ${c.border}`,
                  background: statusFilter===s ? c.bg : 'transparent',
                  color: statusFilter===s ? c.color : '#64748b',
                  fontSize:'0.75rem', fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
                }}>
                  {s} {stats[s]||0}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* ── メインコンテンツ ──────────────────────────── */}
      <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
        {!gasUrl ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem' }}>
            <div style={{ textAlign:'center', maxWidth:'380px' }}>
              <div style={{ fontSize:'3.5rem', marginBottom:'1rem' }}>🔗</div>
              <h2 style={{ margin:'0 0 0.625rem', fontSize:'1.375rem', color:'#1a1917', fontWeight:800 }}>Google Sheetsに接続する</h2>
              <p style={{ color:'#6b6660', lineHeight:1.75, marginBottom:'1.75rem', fontSize:'0.9375rem' }}>
                まず Google Apps Script を設定してスプレッドシートと接続してください。セットアップは5〜10分で完了します。
              </p>
              <button onClick={() => setShowSetup(true)} style={{ padding:'0.875rem 2rem', background:'#1e293b', color:'#fff', border:'none', borderRadius:'0.75rem', cursor:'pointer', fontSize:'1rem', fontWeight:700, fontFamily:'inherit', boxShadow:'0 4px 20px rgba(30,41,59,0.3)' }}>
                セットアップを始める
              </button>
            </div>
          </div>
        ) : loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'0.75rem', color:'#9ca3af' }}>
            <div style={{ fontSize:'2rem', animation:'pulse 1.2s infinite' }}>⏳</div>
            <div>データを読み込み中…</div>
          </div>
        ) : isMobile ? (
          <div style={{ flex:1, overflowY:'auto', padding:'1rem' }}>
            {mobileFiltered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'4rem 2rem', color:'#c4c0ba' }}>
                <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>📋</div>
                <div>該当する応募者がいません</div>
              </div>
            ) : mobileFiltered.map(a => (
              <MobileCard key={a._row} applicant={a} onUpdate={updateField} onDelete={deleteApplicant} />
            ))}
          </div>
        ) : (
          <ApplicantTable
            applicants={applicants}
            onUpdate={updateField}
            onDelete={deleteApplicant}
            searchQuery={search}
            statusFilter={statusFilter}
          />
        )}
      </main>

      {/* ── モーダル ─────────────────────────────────── */}
      {showSetup && (
        <SetupModal
          onSave={handleSaveUrl}
          initialUrl={gasUrl}
          onClose={gasUrl ? () => setShowSetup(false) : null}
        />
      )}
      {showAdd && (
        <AddApplicantModal
          onAdd={handleAddApplicant}
          onClose={() => { setShowAdd(false); setAddError(''); }}
          error={addError}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
