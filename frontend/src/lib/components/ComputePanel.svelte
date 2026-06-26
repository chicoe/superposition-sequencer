<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount, onDestroy } from 'svelte';
  import { circuit, currentStep, numSteps, loadCircuit } from '$lib/stores/circuit';
  import type { CircuitSpec } from '$lib/types';
  import { ionqApiKey, clearIonqApiKey, setIonqApiKey } from '$lib/stores/apiKey';
  import {
    computedRun,
    computedSteps,
    setStepRun,
    parseRunFile,
    clearRun,
    BACKEND_LABELS,
    isHardware,
    type BackendId
  } from '$lib/stores/run';
  import { compute, submitCompute, pollCompute, cancelCompute, importQasm } from '$lib/quantum/client';
  import { resetRunCursor } from '$lib/audio/sequencer';
  import { resetShots, mode } from '$lib/stores/playback';
  import { circuitQasm } from '$lib/stores/qasm';
  import { isComputing, pendingJob, clearPendingJob } from '$lib/stores/compute';

  let backend: BackendId = 'aer';
  let shots = 1024;
  let status: 'idle' | 'computing' | 'done' | 'error' = 'idle';
  let errorMsg = '';

  // Advanced feature — keep collapsed by default so the play loop & timeline
  // are the centre of attention on first load.
  let open = false;

  // API key modal
  let modalOpen = false;
  let keyDraft = '';

  // Hardware-run confirmation modal. Real QPU shots cost real money, so we
  // gate them behind an explicit confirm step every time.
  let confirmOpen = false;

  function openModal() {
    keyDraft = $ionqApiKey;
    modalOpen = true;
  }
  function closeModal() {
    modalOpen = false;
    keyDraft = '';
  }
  function saveKey() {
    setIonqApiKey(keyDraft);
    closeModal();
    // If a job survived a reload, resume tracking it now that we have the key.
    if (get(pendingJob) && !pollTimer) startPolling();
  }
  function removeKey() {
    clearIonqApiKey();
    keyDraft = '';
  }

  function onComputeClick() {
    // Preflight: API key gate first (avoid confirming a run that can't go).
    if (backend !== 'aer' && !$ionqApiKey) {
      errorMsg = 'IonQ backends require an API key';
      status = 'error';
      openModal();
      return;
    }
    if (isHardware(backend)) {
      confirmOpen = true;
      return;
    }
    void runCompute();
  }

  function confirmRunHardware() {
    confirmOpen = false;
    void runCompute();
  }

  async function runCompute() {
    // Compute the CURRENTLY-SELECTED layer: the backend measures the sub-circuit
    // up to that layer. The result is merged into the per-step run set.
    const spec = structuredClone(get(circuit));
    const step = get(currentStep);
    errorMsg = '';

    if (backend === 'aer') {
      // Local sim is instant — keep the blocking overlay.
      status = 'computing';
      isComputing.set({ backend, shots, startedAt: Date.now() });
      try {
        const res = await compute(spec, backend, shots, undefined, step);
        applyResult(spec, step, res.backend, res.shots, res.memory, res.memory_source, res.completed_at);
        status = 'done';
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : String(e);
        status = 'error';
      } finally {
        isComputing.set(null);
      }
      return;
    }

    // IonQ: submit (returns immediately), then poll in the background. No
    // blocking overlay — a QPU job can sit queued for minutes to hours.
    status = 'computing';
    try {
      const { job_id } = await submitCompute(spec, backend, shots, $ionqApiKey, step);
      pendingJob.set({
        jobId: job_id,
        backend,
        shots,
        step,
        circuit: spec,
        startedAt: Date.now(),
        status: 'queued'
      });
      status = 'idle';
      startPolling();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      status = 'error';
    }
  }

  function applyResult(
    spec: CircuitSpec,
    step: number,
    be: BackendId,
    sh: number,
    memory: string[],
    source: 'memory' | 'counts',
    completedAt: number
  ) {
    setStepRun(spec, step, { backend: be, shots: sh, memory, memorySource: source, completedAt });
    resetRunCursor();
    resetShots(spec.num_qubits);
  }

  // ---- async IonQ polling ---------------------------------------------------
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let tickTimer: ReturnType<typeof setInterval> | null = null;
  let elapsed = 0;

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (tickTimer) clearInterval(tickTimer);
    pollTimer = null;
    tickTimer = null;
  }

  function startPolling() {
    stopPolling();
    const job = get(pendingJob);
    if (!job) return;
    elapsed = Math.floor((Date.now() - job.startedAt) / 1000);
    tickTimer = setInterval(() => {
      const j = get(pendingJob);
      elapsed = j ? Math.floor((Date.now() - j.startedAt) / 1000) : 0;
    }, 1000);
    pollTimer = setInterval(pollOnce, 4000);
    void pollOnce();
  }

  async function pollOnce() {
    const job = get(pendingJob);
    if (!job) {
      stopPolling();
      return;
    }
    const key = get(ionqApiKey);
    if (!key) return; // after a reload: wait for the key to be re-entered
    let res;
    try {
      res = await pollCompute(job.jobId, job.backend, key);
    } catch {
      return; // transient network/API hiccup — keep polling
    }
    if (res.status === 'completed' && res.memory) {
      applyResult(
        job.circuit,
        job.step,
        job.backend,
        job.shots,
        res.memory,
        res.memory_source ?? 'counts',
        res.completed_at ?? Date.now() / 1000
      );
      status = 'done';
      errorMsg = '';
      clearPendingJob();
      stopPolling();
    } else if (res.status === 'failed' || res.status === 'canceled') {
      errorMsg = res.detail || `IonQ job ${res.status}`;
      status = 'error';
      clearPendingJob();
      stopPolling();
    } else {
      pendingJob.update((p) => (p ? { ...p, status: res.status } : p));
    }
  }

  async function cancelPending() {
    const job = get(pendingJob);
    if (!job) return;
    const key = get(ionqApiKey);
    try {
      if (key) await cancelCompute(job.jobId, job.backend, key);
    } catch {
      // ignore — clear our local tracking regardless
    }
    clearPendingJob();
    stopPolling();
    status = 'idle';
  }

  function fmtElapsed(s: number): string {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  onMount(() => {
    // Resume tracking a job that survived a reload (its meta is in localStorage;
    // the key is not — polling starts once the key is re-entered).
    if (get(pendingJob)) {
      open = true;
      if (get(ionqApiKey)) startPolling();
    }
  });
  onDestroy(stopPolling);

  function exportRun() {
    const run = get(computedRun);
    if (!run) return;
    // Schema 2: the whole per-step run set. Drop this file into
    // lib/quantum/runs/ to bundle it with a preset for auto-load.
    const steps: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(run.steps)) {
      steps[k] = {
        backend: s.backend,
        shots: s.shots,
        memory: s.memory,
        memory_source: s.memorySource,
        completed_at: s.completedAt
      };
    }
    const payload = { schema: 2, app: 'superposition-sequencer', circuit: run.circuit, steps };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `superposition-run-${get(computedSteps).length}steps-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load a parsed run set: swap in its circuit + per-step memory and switch to
  // Auto so Play cycles the computed steps. Shared by file-load and preset-load.
  function applyRun(data: unknown) {
    const run = parseRunFile(data);
    if (!run) throw new Error('Run file has no measurements');
    loadCircuit(run.circuit);
    computedRun.set(run);
    mode.set('auto');
    // Land on the first computed step (loadCircuit defaults to the last, which a
    // partial run may not cover) so playback starts on real data.
    const steps = Object.keys(run.steps).map(Number);
    if (steps.length) currentStep.set(Math.min(...steps));
    resetRunCursor();
    resetShots(run.circuit.num_qubits);
  }

  let runFileInput: HTMLInputElement;
  function pickRunFile() {
    runFileInput.value = '';
    runFileInput.click();
  }
  async function onRunFile(e: Event) {
    const t = e.target as HTMLInputElement;
    const file = t.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.app !== 'superposition-sequencer' || !data.circuit) {
        throw new Error('Not a Superposition Sequencer run file');
      }
      applyRun(data);
      status = 'done';
      errorMsg = '';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      status = 'error';
    }
  }

  function exportQasm() {
    const qasm = get(circuitQasm);
    if (!qasm) {
      errorMsg = 'No QASM available yet — wait for the circuit to sync.';
      status = 'error';
      return;
    }
    const blob = new Blob([qasm], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `superposition-circuit-${stamp}.qasm`;
    a.click();
    URL.revokeObjectURL(url);
  }

  let qasmFileInput: HTMLInputElement;
  function pickQasmFile() {
    qasmFileInput.value = '';
    qasmFileInput.click();
  }
  async function onQasmFile(e: Event) {
    const t = e.target as HTMLInputElement;
    const file = t.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const spec = await importQasm(text);
      // Loading a circuit replaces the active circuit — discard any stale
      // run that pointed at a different one.
      clearRun();
      loadCircuit(spec);
      resetShots(spec.num_qubits);
      status = 'idle';
      errorMsg = '';
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
      status = 'error';
    }
  }

  function discardRun() {
    clearRun();
    status = 'idle';
  }
</script>

<div class="compute" class:open>
  <button class="header-toggle" on:click={() => (open = !open)} aria-expanded={open}>
    <span class="caret">{open ? '▼' : '▶'}</span>
    <span class="head-title">› Compute</span>
    {#if $computedSteps.length}
      <span class="head-tag run">{$computedSteps.length} / {$numSteps} LAYERS</span>
    {/if}
    {#if $pendingJob}
      <span class="head-tag pending">⏳ IONQ {$pendingJob.status === 'running' ? 'RUNNING' : 'QUEUED'}</span>
    {/if}
    {#if status === 'error'}
      <span class="head-tag err">! error</span>
    {/if}
  </button>

  {#if open}
  <div class="row main">

    <label class="field">
      <span class="k">backend</span>
      <select bind:value={backend}>
        <option value="aer">Local · Aer</option>
        <option value="ionq_simulator">IonQ · Simulator (ideal)</option>
        <option value="ionq_simulator.forte_1">IonQ · Sim (Forte-1 noise)</option>
        <option value="ionq_simulator.forte_enterprise_1">IonQ · Sim (Forte-Ent noise)</option>
        <option value="ionq_qpu.forte_1">IonQ · Forte-1 (QPU)</option>
        <option value="ionq_qpu.forte_enterprise_1">IonQ · Forte-Enterprise-1 (QPU)</option>
      </select>
    </label>

    <label class="field">
      <span class="k">shots</span>
      <input type="number" min="1" max="100000" step="1" bind:value={shots} />
    </label>

    <button
      class="btn primary"
      class:hw={isHardware(backend)}
      on:click={onComputeClick}
      disabled={status === 'computing' || $pendingJob !== null}
      title="Measure the sub-circuit up to the current layer on the chosen backend"
    >
      {#if $pendingJob}
        … JOB IN FLIGHT
      {:else if status === 'computing'}
        … SUBMITTING
      {:else if isHardware(backend)}
        ▶ COMPUTE LAYER {String($currentStep + 1).padStart(2, '0')} (HW)
      {:else}
        ▶ COMPUTE LAYER {String($currentStep + 1).padStart(2, '0')}
      {/if}
    </button>

    <button class="btn key" on:click={openModal} title="Manage your IonQ API key">
      [ API KEY{$ionqApiKey ? ' · SET' : ''} ]
    </button>

    {#if $computedRun}
      <button class="btn warn" on:click={discardRun} title="Discard the run; preview takes over">
        [ DISCARD RUN ]
      </button>
    {/if}

    <span class="io-sep" />

    <span class="io-label">› I/O</span>

    {#if $computedRun}
      <button class="btn" on:click={exportRun} title="Save the current run + circuit as JSON">
        [ EXPORT RUN ]
      </button>
    {/if}
    <button class="btn" on:click={pickRunFile} title="Load a previously saved run file">
      [ LOAD RUN ]
    </button>

    <button
      class="btn"
      on:click={exportQasm}
      disabled={!$circuitQasm}
      title="Download the current circuit as an OpenQASM 3 file"
    >
      [ EXPORT QASM ]
    </button>
    <button class="btn" on:click={pickQasmFile} title="Load a circuit from an OpenQASM 3 file">
      [ LOAD QASM ]
    </button>

    <input
      type="file"
      accept="application/json,.json"
      bind:this={runFileInput}
      on:change={onRunFile}
      style="display:none"
    />
    <input
      type="file"
      accept=".qasm,text/plain"
      bind:this={qasmFileInput}
      on:change={onQasmFile}
      style="display:none"
    />
  </div>

  <!-- Status rows: error always wins so a failed re-run isn't hidden behind
       a previously-successful run. -->
  {#if status === 'error'}
    <div class="row status-row error">
      <span class="err-tag">[ ERROR ]</span>
      <span class="err-msg">{errorMsg}</span>
      <button class="btn dismiss" on:click={() => (status = $computedRun ? 'done' : 'idle')}>
        [ DISMISS ]
      </button>
    </div>
  {/if}
  {#if status === 'computing'}
    <div class="row status-row">
      <span class="hint">submitting to {BACKEND_LABELS[backend]} …</span>
    </div>
  {/if}
  {#if $pendingJob}
    <div class="row status-row pending">
      <span class="badge">{$pendingJob.status === 'running' ? '▶ RUNNING' : '⏳ QUEUED'}</span>
      <span class="meta">
        {BACKEND_LABELS[$pendingJob.backend]} · layer {String($pendingJob.step + 1).padStart(2, '0')} · {fmtElapsed(elapsed)} elapsed
      </span>
      {#if !$ionqApiKey}
        <button class="btn" on:click={openModal}>[ RE-ENTER KEY TO RESUME ]</button>
      {:else}
        <span class="hint">hardware jobs queue — minutes to hours; results land here when ready.</span>
      {/if}
      <button class="btn dismiss" on:click={cancelPending}>[ CANCEL ]</button>
    </div>
  {/if}
  {#if $computedRun}
    {@const cur = $computedRun.steps[$currentStep]}
    <div class="row status-row run">
      <span class="badge">{$computedSteps.length} / {$numSteps} LAYERS</span>
      <span class="meta">
        computed: {$computedSteps.map((s) => String(s + 1).padStart(2, '0')).join(' · ')}
      </span>
      {#if cur}
        <span class="meta">
          layer {String($currentStep + 1).padStart(2, '0')}: {BACKEND_LABELS[cur.backend]} · {cur.shots} shots
        </span>
        <span
          class="meta source-tag"
          class:counts={cur.memorySource === 'counts'}
          title={cur.memorySource === 'memory'
            ? 'Per-shot ordering returned directly by the backend — temporal sequence is real.'
            : 'Backend only returned aggregated counts; we expanded and shuffled them. Marginals and pairwise correlations are real, but the time ordering of shots is synthetic.'}
        >
          order: {cur.memorySource === 'memory' ? 'real per-shot' : 'shuffled from counts'}
        </span>
      {:else}
        <span class="meta">
          layer {String($currentStep + 1).padStart(2, '0')} not computed — previewing live
        </span>
      {/if}
      <span class="hint">Auto cycles only computed layers · edit the circuit to invalidate</span>
    </div>
  {/if}
  {/if}
</div>

{#if confirmOpen}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="scrim" on:click={() => (confirmOpen = false)}>
    <div class="modal hw-confirm" on:click|stopPropagation>
      <div class="m-head warn">
        <span>! Hardware Run</span>
        <button class="x" on:click={() => (confirmOpen = false)} aria-label="close">[ × ]</button>
      </div>
      <p class="m-rec">
        You're about to submit this circuit to <strong>{BACKEND_LABELS[backend]}</strong>
        for <strong>{shots} shots</strong>.
      </p>
      <p class="m-rec dim">
        IonQ bills real QPU time per shot — usage shows up on your IonQ
        account, not here. Make sure your circuit is the one you want and
        that the shot count matches your budget. Local Aer and the IonQ
        simulators are free for iteration.
      </p>
      <div class="m-actions">
        <span class="spacer" />
        <button class="btn" on:click={() => (confirmOpen = false)}>[ CANCEL ]</button>
        <button class="btn primary hw" on:click={confirmRunHardware}>
          ▶ RUN ON {BACKEND_LABELS[backend]}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if modalOpen}
  <!-- svelte-ignore a11y-no-static-element-interactions a11y-click-events-have-key-events -->
  <div class="scrim" on:click={closeModal}>
    <div class="modal" on:click|stopPropagation>
      <div class="m-head">
        <span>› IonQ API Key</span>
        <button class="x" on:click={closeModal} aria-label="close">[ × ]</button>
      </div>
      <p class="m-rec">
        Recommended: create an API key dedicated to this application from your
        IonQ dashboard (Settings → API keys → New key). Scope or rotate it
        independently of your other tooling so you can revoke it without
        affecting anything else.
      </p>
      <p class="m-rec dim">
        This key is held only in your browser tab's memory and sent with each
        compute request you make. It is never written to disk, cookies, or
        local storage; refreshing the page wipes it. Other users of this app
        cannot see or use your key.
      </p>
      <label class="m-field">
        <span>API key</span>
        <input
          type="password"
          autocomplete="off"
          placeholder="paste your IonQ API key"
          bind:value={keyDraft}
        />
      </label>
      <div class="m-actions">
        {#if $ionqApiKey}
          <button class="btn warn" on:click={removeKey}>[ CLEAR KEY ]</button>
        {/if}
        <span class="spacer" />
        <button class="btn" on:click={closeModal}>[ CANCEL ]</button>
        <button class="btn primary" on:click={saveKey}>[ SAVE ]</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .compute {
    background: var(--bg-1);
    border: 1px solid var(--border);
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    display: flex;
    flex-direction: column;
  }
  .compute.open {
    padding-bottom: 0.45rem;
  }
  .header-toggle {
    background: transparent;
    border: none;
    color: var(--fg-dim);
    cursor: pointer;
    font: inherit;
    letter-spacing: 0.04em;
    padding: 0.5rem 0.75rem;
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    text-transform: uppercase;
  }
  .header-toggle:hover {
    color: var(--mint);
  }
  .header-toggle .caret {
    color: var(--mint);
    font-size: 0.7rem;
  }
  .head-title {
    color: var(--fg-dim);
    letter-spacing: 0.12em;
  }
  .head-tag {
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    padding: 0.05rem 0.4rem;
    border: 1px solid currentColor;
  }
  .head-tag.run {
    color: var(--mint);
  }
  .head-tag.err {
    color: var(--mauve);
  }
  .head-tag.pending {
    color: var(--beige);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
    padding: 0 0.85rem;
  }
  .row + .row {
    margin-top: 0.3rem;
  }
  .field {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .k {
    color: var(--fg-mute);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.65rem;
  }
  select,
  input[type='number'] {
    background: var(--bg-3);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 0;
    padding: 0.18rem 0.4rem;
    font-family: inherit;
    font-size: inherit;
  }
  input[type='number'] {
    width: 5.5rem;
  }
  .btn {
    background: transparent;
    color: var(--fg);
    border: 1px solid var(--border);
    padding: 0.32rem 0.7rem;
    font-family: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--bg-2);
  }
  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .btn.primary {
    background: var(--mint);
    color: var(--bg);
    border-color: var(--mint);
    font-weight: 700;
  }
  .btn.primary:hover {
    background: var(--mint-bright);
  }
  .btn.primary.hw {
    background: var(--mauve);
    border-color: var(--mauve);
    color: var(--bg);
  }
  .btn.primary.hw:hover {
    background: var(--mauve);
    filter: brightness(1.15);
  }
  .btn.key {
    border-color: var(--beige);
    color: var(--beige);
  }
  .btn.warn {
    border-color: var(--mauve);
    color: var(--mauve);
  }
  .io-sep {
    display: inline-block;
    width: 1px;
    height: 1.4rem;
    background: var(--border);
    margin: 0 0.25rem;
  }
  .io-label {
    color: var(--fg-dim);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-right: 0.1rem;
  }
  .status-row {
    padding: 0.25rem 0;
    color: var(--fg-mute);
    border-top: 1px dashed var(--border-dim);
  }
  .status-row.run {
    color: var(--fg-dim);
  }
  .status-row.pending {
    color: var(--beige);
    background: rgba(196, 184, 150, 0.08);
    border: 1px solid var(--beige);
    border-top: 1px solid var(--beige);
    padding: 0.4rem 0.55rem;
    align-items: center;
  }
  .status-row.error {
    color: var(--mauve);
    background: rgba(166, 152, 176, 0.08);
    border: 1px solid var(--mauve);
    border-top: 1px solid var(--mauve);
    padding: 0.4rem 0.55rem;
    align-items: center;
  }
  .err-tag {
    background: var(--mauve);
    color: var(--bg);
    padding: 0.05rem 0.4rem;
    font-weight: 700;
    letter-spacing: 0.12em;
  }
  .err-msg {
    flex: 1;
    color: var(--fg);
    word-break: break-word;
    font-family: var(--mono);
  }
  .btn.dismiss {
    border-color: var(--border);
    color: var(--fg-mute);
  }
  .badge {
    background: var(--bg-3);
    color: var(--mint);
    border: 1px solid var(--mint);
    padding: 0.1rem 0.45rem;
    letter-spacing: 0.1em;
  }
  .meta {
    color: var(--fg-mute);
  }
  .source-tag {
    color: var(--mint);
  }
  .source-tag.counts {
    color: var(--beige);
  }
  .hint {
    color: var(--fg-mute);
    margin-left: auto;
    font-style: italic;
  }

  /* Modal */
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal {
    width: min(520px, 92vw);
    background: var(--bg-1);
    border: 1px solid var(--border);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
    padding: 1rem 1.1rem;
    color: var(--fg);
    font-family: var(--mono);
    font-size: 0.75rem;
    line-height: 1.5;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .m-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    color: var(--mint);
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.75rem;
  }
  .m-head.warn {
    color: var(--mauve);
  }
  .hw-confirm {
    border-color: var(--mauve);
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(166, 152, 176, 0.3);
  }
  .x {
    background: transparent;
    border: none;
    color: var(--fg-mute);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.75rem;
  }
  .x:hover {
    color: var(--mauve);
  }
  .m-rec {
    margin: 0;
    color: var(--fg);
  }
  .m-rec.dim {
    color: var(--fg-mute);
    font-size: 0.7rem;
  }
  .m-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-top: 0.4rem;
  }
  .m-field span {
    color: var(--fg-mute);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.65rem;
  }
  .m-field input {
    background: var(--bg-3);
    color: var(--fg);
    border: 1px solid var(--border);
    padding: 0.45rem 0.55rem;
    font-family: inherit;
    font-size: 0.8rem;
  }
  .m-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
  }
  .m-actions .spacer {
    flex: 1;
  }
</style>
