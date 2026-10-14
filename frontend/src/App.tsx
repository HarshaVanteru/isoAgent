import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, BookOpen, ChevronRight, Database, FileText, Layers, LoaderCircle, MessageSquare, Plus, ShieldCheck, X } from 'lucide-react';

type Source = { text: string; score: number; citation: number; metadata: Record<string, string | number | null | string[] | number[]> };
type Chat = { thread_id: string; category: string; pending_clarification: boolean; clarification_question: string; clarification_history: { question: string; answer: string }[]; messages: { role: string; content: string; reviewed?: boolean }[]; question: string; draft: string; answer: string; decision: string; sources: Source[] };
type File = { source: string; file_type: string; size_bytes?: number; status?: string; chunks?: number; error?: string };
type Library = { inventory: File[]; files: File[]; chunks: number; indexed_at: string | null };
class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const emptyChat = (): Chat => ({ thread_id: '', category: '', pending_clarification: false, clarification_question: '', clarification_history: [], messages: [], question: '', draft: '', answer: '', decision: '', sources: [] });
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status})`, response.status);
  }
  return response.json();
}
const suggestions = ['What does ISO 9001 require for document control?', 'How do we handle a customer complaint?', 'Which forms support supplier evaluation?'];

export default function App() {
  const [tab, setTab] = useState<'chat' | 'library'>('chat');
  const [chat, setChat] = useState<Chat>(emptyChat);
  const [library, setLibrary] = useState<Library | null>(null);
  const [health, setHealth] = useState<{ groq_configured: boolean; model: string } | null>(null);
  const [question, setQuestion] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(true);
  const [pendingMessage, setPendingMessage] = useState('');
  const requestInFlight = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => api<Library>('/documents').then(data => { if (active) setLibrary(data); }).catch(e => { if (active) setError(e.message); });
    void refresh();
    void api<typeof health>('/health').then(data => { if (active) setHealth(data); }).catch(e => { if (active) setError(e.message); });
    const stored = localStorage.getItem('iso-thread');
    if (stored) void api<Chat>(`/threads/${stored}`).then(data => { if (active) { setChat(data); setCategory(data.category ?? ''); } }).catch(e => {
      if (!active) return;
      if (e instanceof ApiError && (e.status === 404 || e.status === 422)) localStorage.removeItem('iso-thread');
      else { setChat(current => ({ ...current, thread_id: stored })); setError(e.message); }
    }).finally(() => { if (active) setRestoring(false); });
    else setRestoring(false);
    const timer = window.setInterval(() => { if (!requestInFlight.current) void refresh(); }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, busy, pendingMessage]);
  const indexed = library?.files.filter(f => f.status === 'indexed').length ?? 0;
  const files = [...new Map([...(library?.inventory ?? []), ...(library?.files ?? [])].map(file => [file.source, file])).values()];
  const categories = [...new Set(files.map(f => f.source.includes('/') ? f.source.split('/')[0] : 'General'))];
  async function ask(text = question) {
    if (!text.trim() || requestInFlight.current || restoring) return;
    requestInFlight.current = true;
    setBusy(true); setError(''); setPendingMessage(text.trim());
    try {
      let id = chat.thread_id;
      if (!id) {
        id = (await api<{ thread_id: string }>('/threads', {})).thread_id;
        localStorage.setItem('iso-thread', id);
        setChat(current => ({ ...current, thread_id: id }));
      }
      const result = chat.pending_clarification
        ? await api<Chat>(`/threads/${id}/clarify`, { answer: text })
        : await api<Chat>(`/threads/${id}/messages`, { question: text, category });
      setChat(result); setQuestion('');
    } catch (e) { setError((e as Error).message); }
    finally { requestInFlight.current = false; setBusy(false); setPendingMessage(''); }
  }
  function newChat() { if (requestInFlight.current || restoring) return; localStorage.removeItem('iso-thread'); setChat(emptyChat()); setQuestion(''); setCategory(''); setError(''); }

  return <div className="workspace">
    <aside className="sidebar">
      <a className="brand" href="/" aria-label="ISO workspace home"><span className="brand-icon"><Layers size={22}/></span><span>iso<span className="brand-dot">.</span><small>KNOWLEDGE WORKSPACE</small></span></a>
      <button className="new-chat" onClick={newChat} disabled={busy || restoring}><Plus size={16}/> New conversation <span>+</span></button>
      <div className="nav-label">WORKSPACE</div>
      <nav><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageSquare size={17}/> Ask your documents</button><button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><BookOpen size={17}/> Document library <span className="count">{files.length || '—'}</span></button></nav>
      <div className="sidebar-card"><div className="tiny-icon"><ShieldCheck size={19}/></div><h3>Your documents. Clear answers.</h3><p>Ask naturally and get answers with sources. The assistant asks a follow-up when it needs more detail.</p><span className="small-tag"><span/> Conversational assistant</span></div>
      <div className="sidebar-bottom"><Database size={16}/><div>Local knowledge base<small>{indexed} documents · {library?.chunks ?? 0} chunks</small></div><span className="status-dot"/></div>
    </aside>
    <main>
      <header><div><span className="breadcrumb">Workspace</span><ChevronRight size={13}/><strong>{tab === 'chat' ? 'Ask your documents' : 'Document library'}</strong></div><span className="review-badge"><ShieldCheck size={14}/> Answers with sources</span></header>
      {error && <div className="notice error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={15}/></button></div>}
      {health && !health.groq_configured && <div className="notice">Add your GROQ_API_KEY to .env and restart the backend to enable answers.</div>}
      {tab === 'library' ? <section className="library-page"><div className="page-heading"><div><span className="eyebrow">YOUR SOURCE OF TRUTH</span><h1>Document library</h1><p>Documents indexed by the separate ingestion command appear here.</p></div></div>
        <div className="stats"><div><strong>{files.length}</strong><span>Source documents</span></div><div><strong>{indexed}</strong><span>Indexed successfully</span></div><div><strong>{library?.chunks ?? 0}</strong><span>Searchable chunks</span></div></div>
        <p className="library-note">PDF · Word · Excel · PowerPoint · Visio. Visio and unsupported legacy files need LibreOffice or Microsoft Office. Files that need attention appear below.</p>
        <div className="file-list">{files.map(file => { const result = file; return <div className="file-row" key={file.source}><FileText size={20}/><div><strong>{file.source.split('/').pop()}</strong><small>{file.source}</small>{result?.error && <p className="file-error">{result.error}</p>}</div><span className={`file-status ${result?.status ?? ''}`}>{result?.status === 'indexed' ? `${result.chunks} chunks` : result?.status === 'error' ? 'Needs attention' : 'Not indexed'}</span></div>; })}</div>
      </section> : <>
        <div className="chat-scroll">
          {!restoring && !busy && !chat.messages.length && !chat.pending_clarification && <section className="welcome"><div className="welcome-mark"><BookOpen size={29}/><span className="spark">✦</span></div><span className="eyebrow">CLARITY, BACKED BY YOUR DOCUMENTS</span><h1>Your next answer<br/>is already in your files.</h1><p>Explore your ISO 9001 knowledge base.<br/>Ask a question, check the sources, and make it yours.</p><div className="suggestions">{suggestions.map((s, i) => <button key={s} onClick={() => void ask(s)} disabled={busy || restoring || !indexed}><span className="suggestion-number">0{i + 1}</span>{s}<ChevronRight size={17}/></button>)}</div><div className="welcome-foot"><ShieldCheck size={14}/> Grounded in your documents <span>·</span> Ask follow-up questions</div></section>}
          <div className="messages">{chat.messages.map((m, i) => <article className={`message ${m.role}`} key={i}><span className="message-avatar">{m.role === 'user' ? 'Y' : <Layers size={17}/>}</span><div><strong>{m.role === 'user' ? 'You' : 'ISO assistant'}</strong><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div></article>)}
            {(chat.pending_clarification) && chat.clarification_history.length > 0 && <section className="clarification-history" aria-label="Clarification exchange"><p><strong>Your request:</strong> {chat.question}</p>{chat.clarification_history.map((item, i) => <div key={i}><p><strong>Assistant:</strong> {item.question}</p><p><strong>You:</strong> {item.answer}</p></div>)}</section>}
            {chat.pending_clarification && <section className="draft-card clarification-card" aria-live="polite"><div className="draft-heading"><span><MessageSquare size={16}/> A detail before I search</span></div>{!chat.clarification_history.length && <p><strong>Your request:</strong> {chat.question}</p>}<ReactMarkdown remarkPlugins={[remarkGfm]}>{chat.clarification_question}</ReactMarkdown><p className="clarification-hint">Reply in the message box below to continue.</p></section>}
            {chat.sources.length > 0 && <section className="sources"><h3><BookOpen size={14}/> Retrieved sources <span>{chat.sources.length}</span></h3>{chat.sources.map(s => <details key={String(s.metadata.chunk_id ?? s.citation)}><summary><span className="source-number">{s.citation}</span><span>{String(s.metadata.document_name ?? s.metadata.filename ?? s.metadata.source ?? 'Document')}<small>{(s.metadata.page ?? s.metadata.page_number) ? `Page ${s.metadata.page ?? s.metadata.page_number}` : s.metadata.slide ? `Slide ${s.metadata.slide}` : s.metadata.sheet ? `Sheet: ${s.metadata.sheet}` : s.metadata.category} · Chunk {s.metadata.chunk_index}</small></span><ChevronRight size={14}/></summary><ReactMarkdown remarkPlugins={[remarkGfm]}>{s.text}</ReactMarkdown><dl>{Object.entries(s.metadata).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value ?? '?')}</dd></div>)}<div><dt>relevance score</dt><dd>{s.score}</dd></div></dl></details>)}</section>}
            {pendingMessage && <article className="message user"><span className="message-avatar">Y</span><div><strong>You</strong><p>{pendingMessage}</p></div></article>}
            {restoring && <div className="thinking" role="status">Loading conversation...</div>}
            {busy && <div className="thinking" role="status"><LoaderCircle size={17} className="spin"/> Working with your documents…</div>}<div ref={end}/>
          </div>
        </div>
        <div className="composer-area">{!indexed && <div className="index-prompt"><FileText size={15}/>{library ? 'Your document library has not been indexed yet.' : 'Loading document library...'}<button onClick={() => setTab('library')}>Open library <ChevronRight size={13}/></button></div>}<form className="composer" onSubmit={e => { e.preventDefault(); void ask(); }}><textarea aria-label="Your question" placeholder={restoring ? 'Loading conversation...' : chat.pending_clarification ? 'Reply to the clarification...' : 'Ask anything about your documents...'} value={question} disabled={busy || restoring} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }}/><div className="composer-bottom"><label><Layers size={14}/><select aria-label="Document category" value={category} disabled={busy || restoring || chat.pending_clarification} onChange={e => setCategory(e.target.value)}><option value="">All documents</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label><button className="send" aria-label="Send question" type="submit" disabled={busy || restoring || !question.trim()}><ArrowUp size={19}/></button></div></form><p className="composer-caption">{health?.model ? `${health.model} via Groq` : 'ISO assistant'} <span>·</span> Answers can be imperfect. Review the evidence.</p></div>
      </>}
    </main>
  </div>;
}
