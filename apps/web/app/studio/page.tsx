'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchStudioRegistry,
  fetchStudioBatches,
  studioPreview,
  studioCreateBatch,
  fetchStudioBatch,
  studioApproveBatch,
  type StudioRegistry,
  type StudioPreviewResult,
  type StudioBatchResult,
  type StudioBatchVariant,
  type StudioBatchSummary,
  type CritiqueResult,
} from '../_lib/api';

/* ------------------------------------------------------------------ */
/*  Primitive config field definitions                                  */
/* ------------------------------------------------------------------ */

/** Fields to show for each primitive's config section */
const PRIMITIVE_FIELDS: Record<string, Array<{
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  placeholder?: string;
  options?: string[];
}>> = {
  proofHero: [
    { key: 'quote', label: 'Customer quote (the scroll-stopper)', type: 'textarea', placeholder: '"When the fish is bigger than you expected, your gear better not be the weak link."' },
    { key: 'starsText', label: 'Stars', type: 'text', placeholder: '\u2605\u2605\u2605\u2605\u2605' },
  ],
  comparisonTable: [
    { key: 'leftHeader', label: 'Left column header (the problem)', type: 'text', placeholder: 'STATUS QUO' },
    { key: 'rightHeader', label: 'Right column header (your brand)', type: 'text', placeholder: 'TACKLEROOM' },
  ],
  offerFrame: [
    { key: 'originalPrice', label: 'Original price (crossed out)', type: 'text', placeholder: '$49.99' },
    { key: 'salePrice', label: 'Sale price (hero number)', type: 'text', placeholder: '$34.99' },
    { key: 'savings', label: 'Savings badge text', type: 'text', placeholder: 'SAVE 30%' },
    { key: 'offerText', label: 'Offer details', type: 'text', placeholder: 'Free shipping on orders over $50' },
  ],
  benefitStack: [],
  testimonial: [
    { key: 'quote', label: 'Testimonial quote', type: 'textarea', placeholder: 'Best tackle shop online. Period.' },
    { key: 'name', label: 'Customer name', type: 'text', placeholder: 'Captain Mike R.' },
    { key: 'role', label: 'Title or location', type: 'text', placeholder: 'Charter Captain, Key West FL' },
  ],
  splitReveal: [],
  authorityBar: [],
  actionHero: [],
};

/* ------------------------------------------------------------------ */
/*  Score color helpers                                                 */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  if (score >= 85) return 'var(--ok)';
  if (score >= 65) return 'var(--warn)';
  return 'var(--err)';
}

function stopLabel(rec: string): { text: string; color: string } {
  if (rec === 'ship') return { text: 'Ready to ship', color: 'var(--ok)' };
  if (rec === 'iterate') return { text: 'Needs iteration', color: 'var(--warn)' };
  return { text: 'Needs escalation', color: 'var(--err)' };
}

/* ------------------------------------------------------------------ */
/*  Main Studio Page                                                    */
/* ------------------------------------------------------------------ */

export default function StudioPage() {
  // Registry
  const [registry, setRegistry] = useState<StudioRegistry | null>(null);
  const [registryLoading, setRegistryLoading] = useState(true);

  // Config builder state
  const [preset, setPreset] = useState('social-square');
  const [primitive, setPrimitive] = useState('');
  const [headline, setHeadline] = useState('');
  const [subhead, setSubhead] = useState('');
  const [cta, setCta] = useState('');
  const [footer, setFooter] = useState('');
  const [personality, setPersonality] = useState('editorial-left');
  const [primitiveConfig, setPrimitiveConfig] = useState<Record<string, string>>({});

  // Preview state
  const [preview, setPreview] = useState<StudioPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Batch state
  const [batch, setBatch] = useState<StudioBatchResult | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchCount, setBatchCount] = useState(25);
  const [selectedVariants, setSelectedVariants] = useState<Set<number>>(new Set());
  const [approving, setApproving] = useState(false);
  const [approveResult, setApproveResult] = useState('');
  const [inspectedVariant, setInspectedVariant] = useState<number | null>(null);

  // Batch history (shows agent-created batches too)
  const [batchHistory, setBatchHistory] = useState<StudioBatchSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const refreshHistory = useCallback(() => {
    fetchStudioBatches()
      .then(d => setBatchHistory(d.batches))
      .catch(() => {});
  }, []);

  // Load a batch from history into the grid
  const loadBatch = useCallback(async (batchId: string) => {
    setPreview(null);
    setBatchLoading(true);
    setSelectedVariants(new Set());
    setApproveResult('');
    setInspectedVariant(null);
    try {
      const result = await fetchStudioBatch(batchId);
      setBatch(result);
    } catch {
      /* ignore */
    } finally {
      setBatchLoading(false);
    }
  }, []);

  // Load registry + history on mount
  useEffect(() => {
    fetchStudioRegistry()
      .then(setRegistry)
      .catch(() => {})
      .finally(() => setRegistryLoading(false));
    fetchStudioBatches()
      .then(d => setBatchHistory(d.batches))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, []);

  // Build the config object from form state
  const buildConfig = useCallback((): Record<string, unknown> => {
    const cfg: Record<string, unknown> = {
      preset,
      text: { headline, subhead, cta, footer },
      layout: { personality },
    };
    if (primitive && PRIMITIVE_FIELDS[primitive]) {
      const primCfg: Record<string, unknown> = {};
      for (const field of PRIMITIVE_FIELDS[primitive]) {
        if (primitiveConfig[field.key]) {
          primCfg[field.key] = field.type === 'number'
            ? Number(primitiveConfig[field.key])
            : primitiveConfig[field.key];
        }
      }
      // Use the primitive's configKey (comparisonTable for comparisonPanel, etc.)
      const prim = registry?.primitives.find(p => p.id === primitive);
      const configKey = prim?.configKey ?? primitive;
      cfg[configKey] = primCfg;
    }
    return cfg;
  }, [preset, headline, subhead, cta, footer, personality, primitive, primitiveConfig, registry]);

  // Generate single preview
  const handlePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError('');
    setPreview(null);
    setBatch(null);
    try {
      const result = await studioPreview(buildConfig());
      setPreview(result);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [buildConfig]);

  // Generate batch
  const handleBatch = useCallback(async () => {
    setBatchLoading(true);
    setPreview(null);
    setBatch(null);
    setSelectedVariants(new Set());
    setApproveResult('');
    try {
      const { batchId } = await studioCreateBatch(buildConfig(), { count: batchCount });
      // Poll for completion
      const poll = async () => {
        for (let i = 0; i < 120; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const result = await fetchStudioBatch(batchId);
          setBatch(result);
          if (result.status === 'complete' || result.status === 'failed') {
            setBatchLoading(false);
            refreshHistory();
            return;
          }
        }
        setBatchLoading(false);
      };
      poll();
    } catch {
      setBatchLoading(false);
    }
  }, [buildConfig, batchCount, refreshHistory]);

  // Approve selected variants
  const handleApprove = useCallback(async () => {
    if (!batch || selectedVariants.size === 0) return;
    setApproving(true);
    try {
      const result = await studioApproveBatch(batch.batchId, [...selectedVariants]);
      setApproveResult(result.message);
      // Reload batch to show approved state + refresh history
      const updated = await fetchStudioBatch(batch.batchId);
      setBatch(updated);
      refreshHistory();
    } catch (err) {
      setApproveResult(err instanceof Error ? err.message : 'Approve failed');
    } finally {
      setApproving(false);
    }
  }, [batch, selectedVariants, refreshHistory]);

  // Toggle variant selection
  const toggleVariant = useCallback((idx: number) => {
    setSelectedVariants(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // Select all passing variants
  const selectAllPassing = useCallback(() => {
    if (!batch?.results) return;
    const passing = batch.results.filter(r => r.critiqueScore >= 85).map(r => r.index);
    setSelectedVariants(new Set(passing));
  }, [batch]);

  // The critique to show (from single preview or inspected batch variant)
  const activeCritique: CritiqueResult | null = useMemo(() => {
    if (preview) return preview.critique;
    return null;
  }, [preview]);

  // Primitive-specific fields
  const primFields = primitive ? (PRIMITIVE_FIELDS[primitive] ?? []) : [];

  if (registryLoading) {
    return <div style={{ padding: 32 }}><p className="subtle">Loading Studio...</p></div>;
  }

  return (
    <div style={{ display: 'flex', gap: 24, padding: '0 8px', minHeight: '80vh', flexWrap: 'wrap' }}>

      {/* ---- LEFT: Config Builder ---- */}
      <div style={{ flex: '0 0 320px', maxWidth: 360 }}>
        <h2 className="sectionTitle" style={{ marginBottom: 16 }}>Creative Studio</h2>
        <p className="subtle" style={{ marginBottom: 20, fontSize: 13 }}>
          Pick a primitive and preset, fill in your content, then generate a preview or batch.
        </p>

        {/* Preset */}
        <div className="formGroup">
          <label className="formLabel">Preset (canvas size)</label>
          <select className="formInput" value={preset} onChange={e => setPreset(e.target.value)}>
            {registry?.presets.map(p => (
              <option key={p.name} value={p.name}>{p.name} ({p.width}x{p.height})</option>
            ))}
          </select>
        </div>

        {/* Primitive */}
        <div className="formGroup">
          <label className="formLabel">Primitive (layout type)</label>
          <select className="formInput" value={primitive} onChange={e => { setPrimitive(e.target.value); setPrimitiveConfig({}); }}>
            <option value="">None (text + CTA only)</option>
            {registry?.primitives.map(p => (
              <option key={p.id} value={p.id}>
                {p.id} ({p.variants.length} variant{p.variants.length !== 1 ? 's' : ''})
              </option>
            ))}
          </select>
        </div>

        {/* Layout personality */}
        <div className="formGroup">
          <label className="formLabel">Layout personality</label>
          <select className="formInput" value={personality} onChange={e => setPersonality(e.target.value)}>
            <option value="editorial-left">Editorial left (text left, image right)</option>
            <option value="centered-hero">Centered hero (text centered over image)</option>
            <option value="split-card">Split card (frosted panel over image)</option>
          </select>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Text fields */}
        <div className="formGroup">
          <label className="formLabel">Headline (2-8 words, what stops the scroll)</label>
          <input className="formInput" value={headline} onChange={e => setHeadline(e.target.value)}
            placeholder="SHARPEN YOUR HOOKS" />
        </div>
        <div className="formGroup">
          <label className="formLabel">Subhead (supporting detail, 1-2 lines)</label>
          <input className="formInput" value={subhead} onChange={e => setSubhead(e.target.value)}
            placeholder="Thirty seconds with a file changes everything" />
        </div>
        <div className="formGroup">
          <label className="formLabel">CTA button text</label>
          <input className="formInput" value={cta} onChange={e => setCta(e.target.value)}
            placeholder="SHOP NOW" />
        </div>
        <div className="formGroup">
          <label className="formLabel">Footer text (brand name or tagline)</label>
          <input className="formInput" value={footer} onChange={e => setFooter(e.target.value)}
            placeholder="TACKLEROOM" />
        </div>

        {/* Primitive-specific fields */}
        {primFields.length > 0 && (
          <>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
            <p className="subtle" style={{ fontSize: 12, marginBottom: 8 }}>
              {primitive} settings
            </p>
            {primFields.map(field => (
              <div className="formGroup" key={field.key}>
                <label className="formLabel">{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea className="formInput" rows={3}
                    value={primitiveConfig[field.key] ?? ''}
                    placeholder={field.placeholder}
                    onChange={e => setPrimitiveConfig(prev => ({ ...prev, [field.key]: e.target.value }))} />
                ) : (
                  <input className="formInput"
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={primitiveConfig[field.key] ?? ''}
                    placeholder={field.placeholder}
                    onChange={e => setPrimitiveConfig(prev => ({ ...prev, [field.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={handlePreview}
            disabled={previewLoading || !headline}
            style={{ opacity: previewLoading || !headline ? 0.5 : 1 }}>
            {previewLoading ? 'Rendering...' : 'Generate Preview'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn" onClick={handleBatch}
              disabled={batchLoading || !headline}
              style={{ opacity: batchLoading || !headline ? 0.5 : 1 }}>
              {batchLoading ? `Rendering ${batch?.rendered ?? 0}/${batchCount}...` : 'Generate Batch'}
            </button>
            <select style={{ width: 56, padding: '4px 2px', background: 'var(--panel)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
              value={batchCount} onChange={e => setBatchCount(Number(e.target.value))}>
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {/* Batch History — shows agent-created and UI-created batches */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h3 className="sectionTitle" style={{ fontSize: 13, margin: 0 }}>Recent Batches</h3>
            <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }} onClick={refreshHistory}>
              Refresh
            </button>
          </div>
          {historyLoading ? (
            <p className="subtle" style={{ fontSize: 12 }}>Loading...</p>
          ) : batchHistory.length === 0 ? (
            <p className="subtle" style={{ fontSize: 12 }}>No batches yet. Generate one above or let an agent create one via the API.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {batchHistory.map(b => (
                <button key={b.batchId}
                  onClick={() => loadBatch(b.batchId)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: 8,
                    background: batch?.batchId === b.batchId ? 'var(--panel-3)' : 'var(--panel)',
                    border: batch?.batchId === b.batchId ? '1px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer', width: '100%', textAlign: 'left',
                    color: 'var(--text)', fontSize: 12,
                    transition: 'background 0.15s',
                  }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>
                      {b.count} variants
                      {b.approvedCount > 0 && <span style={{ color: 'var(--ok)', marginLeft: 6 }}>{b.approvedCount} approved</span>}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                      {new Date(b.createdAt).toLocaleDateString()} {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: scoreColor(b.avgScore), fontWeight: 600, fontSize: 13 }}>
                      {b.avgScore > 0 ? `${b.avgScore}` : '--'}
                    </div>
                    <div style={{
                      fontSize: 10, marginTop: 2,
                      color: b.status === 'complete' ? 'var(--ok)'
                        : b.status === 'rendering' ? 'var(--warn)'
                        : b.status === 'failed' ? 'var(--err)'
                        : 'var(--muted)',
                    }}>
                      {b.status}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- CENTER: Preview / Batch Grid ---- */}
      <div style={{ flex: '1 1 400px', minWidth: 300 }}>

        {/* Single preview */}
        {preview && !batch && (
          <div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--panel)' }}>
              <img
                src={preview.previewUrl}
                alt="Studio preview"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 13, color: 'var(--muted)' }}>
              <span>{preview.width}x{preview.height}</span>
              <span>{Math.round(preview.sizeBytes / 1024)} KB</span>
            </div>
          </div>
        )}

        {/* Batch grid */}
        {batch && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="subtle" style={{ fontSize: 13 }}>
                {batch.status === 'complete'
                  ? `${batch.rendered} variants rendered`
                  : `Rendering ${batch.rendered}/${batch.count}...`}
                {selectedVariants.size > 0 && ` \u2022 ${selectedVariants.size} selected`}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={selectAllPassing}>
                  Select all passing
                </button>
                <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => setSelectedVariants(new Set())}>
                  Clear
                </button>
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
            }}>
              {(batch.results || []).map((v: StudioBatchVariant) => (
                <div key={v.index}
                  onClick={() => toggleVariant(v.index)}
                  onDoubleClick={() => setInspectedVariant(v.index === inspectedVariant ? null : v.index)}
                  style={{
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: selectedVariants.has(v.index)
                      ? '2px solid var(--ok)'
                      : v.approved
                        ? '2px solid var(--accent)'
                        : '1px solid var(--border)',
                    cursor: 'pointer',
                    background: 'var(--panel)',
                    transition: 'border-color 0.15s',
                  }}>
                  {v.previewUrl ? (
                    <img src={v.previewUrl} alt={`Variant ${v.index}`}
                      style={{ width: '100%', height: 'auto', display: 'block' }} />
                  ) : (
                    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--err)', fontSize: 12 }}>
                      Render failed
                    </div>
                  )}
                  <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: scoreColor(v.critiqueScore), fontWeight: 600 }}>
                      {v.critiqueScore}/100
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      {v.approved ? 'Approved' : `#${v.index}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Approve bar */}
            {batch.status === 'complete' && (
              <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn primary" onClick={handleApprove}
                  disabled={approving || selectedVariants.size === 0}
                  style={{ opacity: approving || selectedVariants.size === 0 ? 0.5 : 1 }}>
                  {approving ? 'Approving...' : `Approve ${selectedVariants.size} variant${selectedVariants.size !== 1 ? 's' : ''}`}
                </button>
                {approveResult && (
                  <span style={{ fontSize: 13, color: approveResult.includes('failed') ? 'var(--err)' : 'var(--ok)' }}>
                    {approveResult}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading spinner */}
        {previewLoading && !batch && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--muted)' }}>
            Rendering preview...
          </div>
        )}

        {/* Error */}
        {previewError && (
          <div style={{ padding: 16, background: 'rgba(251,113,133,0.1)', borderRadius: 10, color: 'var(--err)', fontSize: 14 }}>
            {previewError}
          </div>
        )}

        {/* Empty state */}
        {!preview && !batch && !previewLoading && !previewError && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--muted)', textAlign: 'center', gap: 8 }}>
            <span style={{ fontSize: 48, opacity: 0.3 }}>&#9881;</span>
            <p style={{ fontSize: 15 }}>Fill in your content and click Generate Preview.</p>
            <p style={{ fontSize: 13, maxWidth: 320 }}>
              Or generate a batch of variants to compare side by side. Approved variants automatically become drafts for publishing.
            </p>
          </div>
        )}
      </div>

      {/* ---- RIGHT: Critique Panel ---- */}
      <div style={{ flex: '0 0 260px', maxWidth: 300 }}>
        {activeCritique && (
          <CritiquePanel critique={activeCritique} />
        )}
        {batch && inspectedVariant !== null && (
          <InspectedVariantInfo variant={batch.results.find(r => r.index === inspectedVariant)} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Critique Panel                                                      */
/* ------------------------------------------------------------------ */

function CritiquePanel({ critique }: { critique: CritiqueResult }) {
  const stop = stopLabel(critique.stopRecommendation);

  return (
    <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16 }}>
      <h3 className="sectionTitle" style={{ fontSize: 14, marginBottom: 12 }}>Quality Score</h3>

      {/* Overall score */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 36, fontWeight: 700, color: scoreColor(critique.overallScore) }}>
          {critique.overallScore}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>/100</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: stop.color, fontWeight: 600 }}>
          {stop.text}
        </span>
      </div>

      {/* Dimension bars */}
      {critique.dimensions.map(d => (
        <div key={d.name} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
            <span style={{ textTransform: 'capitalize', color: 'var(--text)' }}>{d.name}</span>
            <span style={{ color: scoreColor(d.score), fontWeight: 600 }}>{d.score}</span>
          </div>
          <div style={{ height: 6, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${d.score}%`,
              background: scoreColor(d.score),
              borderRadius: 3,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      ))}

      {/* Warnings */}
      {critique.warnings.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600, marginBottom: 6 }}>
            Warnings ({critique.warnings.length})
          </p>
          {critique.warnings.map((w, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.4 }}>
              {w.message}
              {w.action && <span style={{ display: 'block', fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>Fix: {w.action}</span>}
            </p>
          ))}
        </div>
      )}

      {/* Failures */}
      {critique.failures.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, color: 'var(--err)', fontWeight: 600, marginBottom: 6 }}>
            Failures ({critique.failures.length})
          </p>
          {critique.failures.map((f, i) => (
            <p key={i} style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.4 }}>
              {f.message}
              {f.action && <span style={{ display: 'block', fontSize: 11, color: 'var(--err)', marginTop: 2 }}>Fix: {f.action}</span>}
            </p>
          ))}
        </div>
      )}

      {/* Summary */}
      <p style={{ marginTop: 14, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
        {critique.summary}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inspected Variant Info (when double-clicking a batch variant)       */
/* ------------------------------------------------------------------ */

function InspectedVariantInfo({ variant }: { variant?: StudioBatchVariant }) {
  if (!variant) return null;
  const stop = stopLabel(variant.stopRecommendation);

  return (
    <div style={{ background: 'var(--panel)', borderRadius: 12, padding: 16, marginTop: 12 }}>
      <h3 className="sectionTitle" style={{ fontSize: 14, marginBottom: 8 }}>Variant #{variant.index}</h3>
      <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Score</span>
          <span style={{ color: scoreColor(variant.critiqueScore), fontWeight: 600 }}>{variant.critiqueScore}/100</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Recommendation</span>
          <span style={{ color: stop.color, fontWeight: 600 }}>{stop.text}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Size</span>
          <span>{Math.round(variant.sizeBytes / 1024)} KB</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--muted)' }}>Dims</span>
          <span>{variant.width}x{variant.height}</span>
        </div>
        {variant.approved && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>Status</span>
            <span style={{ color: 'var(--ok)', fontWeight: 600 }}>Approved</span>
          </div>
        )}
      </div>
    </div>
  );
}
