import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowLeftRight, ArrowRight, Braces, Check, ChevronDown,
  Circle, Clock3, Code2, Copy, GitBranch, GitFork, Layers3, LoaderCircle, Play, Plus,
  Radio, RefreshCw, Settings2, ShieldCheck, Trash2, Upload, X,
} from 'lucide-react';

type EventRecord = {
  event_id: string; operation_id: string; timestamp: string; sequence: number; entity_id: string;
  event_type: string; source: string; payload: Record<string, unknown>;
};
type Replay = { policy: string; events_processed: number; final_state: Record<string, any>; history: { event_id: string; event_type: string; state: Record<string, any> }[]; anomaly_count: number };
type Fork = { baseline: Replay; counterfactual: Replay; mutations: Mutation[]; differences: Record<string, { baseline: unknown; counterfactual: unknown }>; baseline_anomalies: number; counterfactual_anomalies: number };
type Mutation = { type: 'remove' | 'duplicate' | 'reorder'; event_id: string; new_event_id?: string; before_event_id?: string };
type Busy = '' | 'health' | 'replay' | 'fork' | 'compare';
const demoEvents: EventRecord[] = [
  { event_id: 'evt_001', operation_id: 'order_create_001', timestamp: '2026-11-13T10:00:00Z', sequence: 1, entity_id: 'order_001', event_type: 'ORDER_CREATED', source: 'order-service', payload: { customer_id: 'customer_001' } },
  { event_id: 'evt_002', operation_id: 'payment_123', timestamp: '2026-11-13T10:01:00Z', sequence: 2, entity_id: 'order_001', event_type: 'PAYMENT_AUTHORIZED', source: 'payment-service', payload: { amount: 50000, currency: 'INR' } },
  { event_id: 'evt_003', operation_id: 'payment_123', timestamp: '2026-11-13T10:02:00Z', sequence: 3, entity_id: 'order_001', event_type: 'PAYMENT_AUTHORIZED', source: 'payment-service', payload: { amount: 50000, currency: 'INR' } },
  { event_id: 'evt_004', operation_id: 'inventory_001', timestamp: '2026-11-13T10:03:00Z', sequence: 4, entity_id: 'order_001', event_type: 'INVENTORY_RESERVED', source: 'inventory-service', payload: { quantity: 1 } },
];
const apiDefault = import.meta.env.VITE_API_BASE_URL || '/api';
const fmt = (n: unknown) => typeof n === 'number' ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n) : String(n ?? '—');
const shortTime = (s: string) => { const d = new Date(s); return Number.isNaN(+d) ? s : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); };

async function request<T>(base: string, path: string, body?: unknown): Promise<T> {
  const root = base.trim().replace(/\/$/, '');
  const response = await fetch(`${root}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail ? String(data.detail) : `API returned ${response.status} ${response.statusText}`);
  return data as T;
}

function App() {
  const [events, setEvents] = useState<EventRecord[]>(demoEvents);
  const [json, setJson] = useState(JSON.stringify(demoEvents, null, 2));
  const [selected, setSelected] = useState('evt_003');
  const [policy, setPolicy] = useState<'strict' | 'idempotent'>('idempotent');
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('chronofork-api-base') || apiDefault);
  const [busy, setBusy] = useState<Busy>('');
  const [health, setHealth] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [replay, setReplay] = useState<Replay | null>(null);
  const [fork, setFork] = useState<Fork | null>(null);
  const [comparison, setComparison] = useState<Record<string, any> | null>(null);
  const [view, setView] = useState<'timeline' | 'json'>('timeline');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftBase, setDraftBase] = useState(baseUrl);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateId, setDuplicateId] = useState('evt_003_copy');

  const parsed = useMemo(() => { try { const v = JSON.parse(json); return Array.isArray(v) ? { value: v as EventRecord[], error: '' } : { value: null, error: 'The root value must be a JSON array of events.' }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : 'Invalid JSON' }; } }, [json]);
  const activeEvents = parsed.value || events;
  const chosen = activeEvents.find((event) => event.event_id === selected) || activeEvents[0];
  const apiReady = health === 'connected';
  const anomalyItems = (fork?.counterfactual.final_state?.anomalies || replay?.final_state?.anomalies || []) as Record<string, any>[];

  const checkHealth = useCallback(async () => {
    setBusy('health');
    try { await request(baseUrl, '/health'); setHealth('connected'); setError(''); }
    catch (e) { setHealth('offline'); setError(e instanceof Error ? e.message : 'Could not reach API'); }
    finally { setBusy(''); }
  }, [baseUrl]);
  useEffect(() => { void checkHealth(); }, [checkHealth]);

  const syncEvents = (next: EventRecord[]) => { setEvents(next); setJson(JSON.stringify(next, null, 2)); setReplay(null); setFork(null); setComparison(null); setError(''); };
  const parseEditor = () => {
    if (!parsed.value) { setError(`JSON editor: ${parsed.error}`); return false; }
    setEvents(parsed.value); setError(''); return true;
  };
  const runReplay = async () => {
    if (!parseEditor()) return;
    setBusy('replay'); setError(''); setNotice('');
    try { const result = await request<Replay>(baseUrl, '/replay', { events: parsed.value, policy }); setReplay(result); setFork(null); setComparison(null); setNotice('Baseline replay completed against the API.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Replay failed'); }
    finally { setBusy(''); }
  };
  const runFork = async () => {
    if (!parseEditor()) return;
    setBusy('fork'); setError(''); setNotice('');
    const payload = { events: parsed.value, mutations, branch_policy: policy };
    try {
      const [forkResult, compareResult] = await Promise.all([
        request<Fork>(baseUrl, '/fork', payload), request<Record<string, any>>(baseUrl, '/compare', payload),
      ]);
      setFork(forkResult); setComparison(compareResult); setReplay(null); setNotice('Branch and comparison completed against the API.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Counterfactual run failed'); }
    finally { setBusy(''); }
  };
  const addMutation = (mutation: Mutation) => {
    setMutations((current) => [...current, mutation]); setFork(null); setComparison(null);
    if (mutation.type === 'duplicate') setDuplicateOpen(false);
  };
  const clearMutation = (i: number) => setMutations((current) => current.filter((_, index) => index !== i));
  const loadDemo = () => { syncEvents(demoEvents); setMutations([]); setSelected('evt_003'); setNotice('Loaded the repository’s duplicate payment sample dataset.'); };
  const importFile = async (file?: File) => {
    if (!file) return;
    try { const value = JSON.parse(await file.text()); if (!Array.isArray(value)) throw new Error('Expected a JSON array of events.'); syncEvents(value); setMutations([]); setNotice(`Imported ${value.length} events from ${file.name}.`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not import JSON'); }
  };
  const saveBase = () => { const value = draftBase.trim().replace(/\/$/, ''); if (!value) { setError('Enter an API base URL.'); return; } localStorage.setItem('chronofork-api-base', value); setBaseUrl(value); setSettingsOpen(false); setHealth('checking'); setNotice('API base URL saved in this browser.'); };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><GitFork size={19} strokeWidth={2.2}/></div><span>chrono<span className="brand-accent">fork</span></span><span className="brand-tag">LAB</span></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="project-switch"><div className="project-icon">C</div><span><strong>chronofork</strong><small>Local workspace</small></span><ChevronDown size={15}/></div>
      <div className="nav-label">DEVELOP</div>
      <div className="nav-item active"><Activity size={16}/><span>Replay lab</span><span className="nav-pip"/></div>
      <div className="nav-item muted"><GitBranch size={16}/><span>Event histories</span><span className="soon">LIVE</span></div>
      <div className="nav-item muted"><Layers3 size={16}/><span>Environments</span></div>
      <div className="sidebar-spacer" />
      <div className="api-card"><div className="api-card-top"><span className={`status-dot ${apiReady ? 'up' : health === 'offline' ? 'down' : ''}`}/><span>{apiReady ? 'API connected' : health === 'offline' ? 'API unreachable' : 'Checking API'}</span><button aria-label="Check API connection" onClick={() => void checkHealth()}><RefreshCw size={13}/></button></div><code>{baseUrl}</code><button className="configure-link" onClick={() => { setDraftBase(baseUrl); setSettingsOpen(true); }}><Settings2 size={13}/> Configure endpoint</button></div>
      <div className="user-row"><div className="avatar">CF</div><span><strong>Developer</strong><small>Free workspace</small></span></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb"><span>chronofork</span><span className="crumb-slash">/</span><strong>Replay lab</strong></div><div className="top-actions"><span className="env-chip"><span className="tiny-dot"/> DEVELOPMENT</span><button className="top-icon" onClick={() => { setDraftBase(baseUrl); setSettingsOpen(true); }} aria-label="API settings"><Settings2 size={16}/></button><div className="top-avatar">CF</div></div></header>
      <div className="content">
        <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line"/> EVENT-DRIVEN DEBUGGING</div><h1>Replay <span>&</span> explore.</h1><p>Reconstruct what happened. Change one thing. See what follows.</p></div><div className="intro-right"><div className="run-meta"><span className="live-ring"/> READY TO RUN</div><button className="icon-text" onClick={loadDemo}><RefreshCw size={14}/> Load demo dataset</button></div></section>
        {error && <div className="alert error-alert"><AlertCircle size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={15}/></button></div>}
        {notice && !error && <div className="alert success-alert"><Check size={16}/><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={15}/></button></div>}
        <section className="metrics-row">
          <div className="metric"><span className="metric-label">EVENTS IN TRACE</span><strong>{activeEvents.length.toString().padStart(2, '0')}</strong><span className="metric-foot"><Radio size={12}/> {new Set(activeEvents.map((e) => e.source)).size} services</span></div>
          <div className="metric"><span className="metric-label">REPLAY STATUS</span><strong className={`metric-status ${replay || fork ? 'complete' : ''}`}><span className="status-indicator"/>{replay || fork ? 'Complete' : busy ? 'Running' : 'Idle'}</strong><span className="metric-foot"><Clock3 size={12}/> {replay || fork ? `${replay?.events_processed ?? fork?.baseline.events_processed} events processed` : 'Awaiting execution'}</span></div>
          <div className="metric"><span className="metric-label">DETECTED ANOMALIES</span><strong>{String(fork?.counterfactual.anomaly_count ?? replay?.anomaly_count ?? '—').padStart(2, '0')}</strong><span className={`metric-foot ${anomalyItems.length ? 'warning-text' : ''}`}><AlertCircle size={12}/> {anomalyItems.length ? 'Requires attention' : 'From latest replay'}</span></div>
          <div className="metric"><span className="metric-label">ACTIVE POLICY</span><strong className="policy-value">{policy === 'idempotent' ? 'Idempotent' : 'Strict'}</strong><span className="metric-foot"><ShieldCheck size={12}/> {policy === 'idempotent' ? 'Duplicate operations skipped' : 'Duplicate operations applied'}</span></div>
        </section>

        <div className="workbench-grid">
          <section className="panel timeline-panel">
            <div className="panel-heading"><div><div className="section-kicker"><span className="step-num">01</span> TRACE EXPLORER</div><h2>Event timeline <span className="count-pill">{activeEvents.length}</span></h2></div><div className="panel-tools"><button className={`seg-button ${view === 'timeline' ? 'selected' : ''}`} onClick={() => setView('timeline')}><Activity size={13}/> Timeline</button><button className={`seg-button ${view === 'json' ? 'selected' : ''}`} onClick={() => setView('json')}><Braces size={13}/> JSON</button><label className="tool-button" title="Import event JSON"><Upload size={14}/><input type="file" accept="application/json,.json" onChange={(e) => { void importFile(e.target.files?.[0]); e.currentTarget.value = ''; }}/></label></div></div>
            {view === 'timeline' ? <div className="timeline-body">
              {activeEvents.length ? <div className="event-list">{activeEvents.map((event, index) => {
                const isSelected = selected === event.event_id; const duplicate = activeEvents.some((other, i) => i !== index && other.operation_id === event.operation_id);
                return <button key={`${event.event_id}-${index}`} className={`event-row ${isSelected ? 'is-selected' : ''}`} onClick={() => setSelected(event.event_id)}><div className="event-time">{shortTime(event.timestamp)}<span>#{String(event.sequence).padStart(2, '0')}</span></div><div className={`event-marker ${duplicate ? 'marker-warning' : ''}`}>{duplicate ? <AlertCircle size={13}/> : <Circle size={10} fill="currentColor"/>}</div><div className="event-main"><div className="event-name">{event.event_type.replaceAll('_', ' ')}</div><div className="event-meta"><span className="service-badge">{event.source}</span><span className="event-id">{event.event_id}</span>{duplicate && <span className="duplicate-tag">REPEATED OP</span>}</div></div><ArrowRight size={14} className="event-arrow"/></button>;
              })}</div> : <div className="empty-state"><Layers3 size={22}/><strong>No events yet</strong><span>Import a JSON event array or load the sample dataset.</span></div>}
              <div className="timeline-footer"><span><span className="legend-dot"/> Event received</span><span><span className="legend-dot amber"/> Repeated operation</span><button onClick={loadDemo}>Load sample <ArrowRight size={12}/></button></div>
            </div> : <div className="json-editor-wrap"><div className="editor-toolbar"><span><Code2 size={13}/> events.json</span><span className={parsed.error ? 'editor-invalid' : 'editor-valid'}>{parsed.error ? 'INVALID JSON' : `${parsed.value?.length ?? 0} EVENTS · VALID JSON`}</span></div><textarea aria-label="Event JSON editor" spellCheck={false} value={json} onChange={(e) => setJson(e.target.value)} /><div className="editor-hint">Expected: array of events with event_id, operation_id, timestamp, sequence, entity_id, event_type, source, payload.</div></div>}
            <div className="selected-event"><div className="selected-header"><span><span className="mini-dot"/> SELECTED EVENT</span>{chosen && <code>{chosen.event_id}</code>}</div>{chosen ? <pre>{JSON.stringify(chosen, null, 2)}</pre> : <div className="selected-empty">Select an event from the timeline to inspect its payload.</div>}</div>
          </section>

          <section className="panel branch-panel">
            <div className="panel-heading"><div><div className="section-kicker"><span className="step-num">02</span> COUNTERFACTUAL BRANCH</div><h2>Change the past.</h2></div><span className="branch-icon"><GitBranch size={17}/></span></div>
            <p className="panel-copy">Apply controlled mutations and compare the alternate timeline with your baseline.</p>
            <div className="branch-label"><span>REPLAY POLICY</span><button className="policy-select" onClick={() => setPolicy((p) => p === 'idempotent' ? 'strict' : 'idempotent')}><span className="policy-dot"/>{policy}<ChevronDown size={13}/></button></div>
            <div className="policy-caption">{policy === 'idempotent' ? 'Repeated operation IDs are flagged and skipped.' : 'Repeated operations are flagged, then applied again.'}</div>
            <div className="mutation-heading"><span>MUTATIONS</span><span>{mutations.length} queued</span></div>
            <div className="mutation-buttons"><button onClick={() => chosen && addMutation({ type: 'remove', event_id: chosen.event_id })} disabled={!chosen}><Trash2 size={13}/> Remove event</button><button onClick={() => { if (chosen) { setDuplicateId(`${chosen.event_id}_copy`); setDuplicateOpen(true); } }} disabled={!chosen}><Copy size={13}/> Duplicate</button></div>
            {mutations.length ? <div className="mutation-list">{mutations.map((m, i) => <div className="mutation-item" key={`${m.type}-${m.event_id}-${i}`}><span className="mutation-symbol">{m.type === 'remove' ? '−' : m.type === 'duplicate' ? '+' : '↕'}</span><span><strong>{m.type === 'remove' ? 'Remove event' : m.type === 'duplicate' ? 'Duplicate event' : 'Reorder event'}</strong><small>{m.event_id}{m.new_event_id ? ` → ${m.new_event_id}` : ''}</small></span><button aria-label="Remove mutation" onClick={() => clearMutation(i)}><X size={13}/></button></div>)}</div> : <div className="mutation-empty"><Plus size={13}/> Select an event, then add a mutation</div>}
            <button className="run-branch" disabled={!apiReady || !!busy || !!parsed.error || activeEvents.length === 0} onClick={() => void runFork()}>{busy === 'fork' ? <LoaderCircle className="spin" size={16}/> : <GitFork size={16}/>}<span>{busy === 'fork' ? 'Running comparison…' : 'Run counterfactual'}</span><ArrowRight size={15}/></button>
            <button className="run-baseline" disabled={!apiReady || !!busy || !!parsed.error || activeEvents.length === 0} onClick={() => void runReplay()}>{busy === 'replay' ? <LoaderCircle className="spin" size={15}/> : <Play size={14}/>} Replay baseline</button>
            <div className={`connection-note ${apiReady ? 'online' : ''}`}><span className={`status-dot ${apiReady ? 'up' : 'down'}`}/>{apiReady ? 'Connected to ChronoFork API' : health === 'checking' ? 'Checking API connection…' : 'API offline — check your endpoint'}<button onClick={() => void checkHealth()} aria-label="Retry API health check"><RefreshCw size={12}/></button></div>
          </section>
        </div>

        <section className="panel outcomes-panel">
          <div className="outcome-heading"><div><div className="section-kicker"><span className="step-num">03</span> OUTCOME ANALYSIS</div><h2>What changed?</h2></div><div className="outcome-heading-right">{comparison ? <span className={`outcome-badge ${comparison.outcome_changed ? 'changed' : ''}`}><span/>{comparison.outcome_changed ? 'OUTCOME CHANGED' : 'NO STATE CHANGE'}</span> : <span className="waiting-label"><Clock3 size={13}/> Waiting for a run</span>}<button className="compare-again" disabled={!apiReady || !!busy || !!parsed.error || activeEvents.length === 0} onClick={() => void runFork()}>{busy === 'fork' ? <LoaderCircle className="spin" size={13}/> : <ArrowLeftRight size={13}/>} Compare branches</button></div></div>
          {!fork && !replay ? <div className="outcome-placeholder"><div className="placeholder-icon"><GitFork size={20}/></div><div><strong>Your replay results will appear here</strong><span>Run a baseline replay or counterfactual to inspect state changes, anomalies, and execution differences.</span></div></div> : fork ? <div className="comparison-grid">
            <StateCard title="BASELINE" subtitle="Original event history" state={fork.baseline.final_state} anomalies={fork.baseline.final_state.anomalies || []} tone="base"/>
            <div className="diff-connector"><div><ArrowLeftRight size={15}/></div><span>STATE<br/>DIFF</span></div>
            <StateCard title="COUNTERFACTUAL" subtitle={`${policy} · ${mutations.length} mutation${mutations.length === 1 ? '' : 's'}`} state={fork.counterfactual.final_state} anomalies={fork.counterfactual.final_state.anomalies || []} tone="fork"/>
            <div className="differences-card"><div className="diff-card-title"><ArrowLeftRight size={14}/> DIFFERENCES <span>{Object.keys(fork.differences).length}</span></div>{Object.keys(fork.differences).length ? Object.entries(fork.differences).map(([key, value]) => <div className="diff-row" key={key}><code>{key}</code><span>{String(value.baseline)}</span><ArrowRight size={12}/><strong>{String(value.counterfactual)}</strong></div>) : <div className="no-diff"><Check size={14}/> No state differences detected</div>}{comparison && <div className="compare-summary">API comparison · authorized amount {comparison.authorized_amount_difference >= 0 ? '+' : ''}{fmt(comparison.authorized_amount_difference)}</div>}</div>
          </div> : <div className="comparison-grid single-state"><StateCard title="BASELINE" subtitle={`${replay?.policy} · ${replay?.events_processed} events`} state={replay!.final_state} anomalies={replay!.final_state.anomalies || []} tone="base"/><div className="single-run-note"><div className="placeholder-icon"><GitFork size={18}/></div><strong>Explore a counterfactual</strong><span>Queue one or more mutations and run a branch comparison to see how the outcome changes.</span><button onClick={() => { if (chosen) { setDuplicateId(`${chosen.event_id}_copy`); setDuplicateOpen(true); } }}>Add a mutation <ArrowRight size={12}/></button></div></div>}
        </section>
        <footer className="footer"><span><span className="footer-mark"><GitFork size={12}/></span> ChronoFork <span className="footer-divider">·</span> Deterministic replay for distributed systems</span><span>API <code>{baseUrl}</code></span></footer>
      </div>
    </main>

    {settingsOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSettingsOpen(false); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div className="modal-top"><div className="modal-icon"><Settings2 size={18}/></div><button aria-label="Close settings" onClick={() => setSettingsOpen(false)}><X size={16}/></button></div><h3 id="settings-title">API connection</h3><p>Point ChronoFork to your FastAPI server. The endpoint is saved in this browser only.</p><label className="field-label" htmlFor="api-base">API BASE URL</label><input id="api-base" value={draftBase} onChange={(e) => setDraftBase(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveBase(); }} placeholder="http://localhost:8000"/><div className="modal-hint">Local development uses the Vite proxy at <code>/api</code> by default.</div><div className="modal-actions"><button className="cancel-button" onClick={() => setSettingsOpen(false)}>Cancel</button><button className="save-button" onClick={saveBase}>Save & reconnect <ArrowRight size={14}/></button></div></div></div>}
    {duplicateOpen && chosen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDuplicateOpen(false); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title"><div className="modal-top"><div className="modal-icon amber-icon"><Copy size={17}/></div><button aria-label="Close duplicate dialog" onClick={() => setDuplicateOpen(false)}><X size={16}/></button></div><h3 id="duplicate-title">Duplicate this event</h3><p>ChronoFork will replay the same logical operation a second time under the new event ID.</p><label className="field-label" htmlFor="duplicate-id">NEW EVENT ID</label><input id="duplicate-id" value={duplicateId} onChange={(e) => setDuplicateId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && duplicateId.trim()) addMutation({ type: 'duplicate', event_id: chosen.event_id, new_event_id: duplicateId.trim() }); }}/><div className="modal-hint">Source event: <code>{chosen.event_id}</code> · operation: <code>{chosen.operation_id}</code></div><div className="modal-actions"><button className="cancel-button" onClick={() => setDuplicateOpen(false)}>Cancel</button><button className="save-button" disabled={!duplicateId.trim()} onClick={() => addMutation({ type: 'duplicate', event_id: chosen.event_id, new_event_id: duplicateId.trim() })}>Queue mutation <Plus size={14}/></button></div></div></div>}
  </div>;
}

function StateCard({ title, subtitle, state, anomalies, tone }: { title: string; subtitle: string; state: Record<string, any>; anomalies: Record<string, any>[]; tone: 'base' | 'fork' }) {
  const fields = [['status', state.status], ['authorized_amount', fmt(state.authorized_amount)], ['refunded_amount', fmt(state.refunded_amount)], ['inventory_reserved', state.inventory_reserved ? 'Reserved' : 'Not reserved']] as const;
  return <div className={`state-card ${tone}`}><div className="state-card-head"><div><span className="state-title"><span className="state-dot"/>{title}</span><small>{subtitle}</small></div><span className="event-count">{state.processed_operations?.length ?? 0} ops</span></div><div className="state-fields">{fields.map(([name, value]) => <div className="state-field" key={name}><code>{name}</code><strong>{String(value)}</strong></div>)}</div><div className="anomaly-block"><div className="anomaly-head"><span><AlertCircle size={13}/> ANOMALIES</span><b className={anomalies.length ? 'has-anomaly' : ''}>{anomalies.length}</b></div>{anomalies.length ? anomalies.map((a, i) => <div className="anomaly-item" key={`${a.event_id}-${i}`}><span className="anomaly-icon">!</span><span><strong>{String(a.type || 'ANOMALY').replaceAll('_', ' ')}</strong><small>{a.message}{a.event_id ? ` · ${a.event_id}` : ''}</small></span></div>) : <div className="anomaly-clear"><Check size={12}/> No anomalies detected</div>}</div></div>;
}

export default App;
