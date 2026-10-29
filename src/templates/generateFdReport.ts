/**
 * The FD (ONDC:FIS14:FD) HTML report. The Beckn template (generateReport.ts) is untouched;
 * reportService picks this one by domain.
 *
 * Unlike the Beckn report, a flow's PASS/FAIL here is the judge's fail-closed verdict: any
 * finding, missing evidence or engine error fails it. Every value from a recorded message is
 * escaped, since a participant controls it.
 */
import { FdReport } from "../fd/report";
import { FdFlowVerdict, FdJudgedFinding, JUDGE_RULES } from "../fd/judge";
import { CERTIFICATION_RULES } from "../fd/plan";
import { SLA_RULES } from "../fd/sla";

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const NO_REQUIREMENT = "(no requirement ID)";

function badge(text: string, kind: "pass" | "fail" | "neutral"): string {
  return `<span class="badge ${kind}">${esc(text)}</span>`;
}

function verdictBadge(verdict: string): string {
  return badge(verdict, verdict === "PASS" || verdict === "JUDGED" ? "pass" : verdict === "NOT_COVERED" || verdict === "NO_SLA" ? "neutral" : "fail");
}

function list(items: readonly string[], empty = ""): string {
  if (items.length === 0) return empty;
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

/** Findings grouped by requirement ID; a finding citing several IDs is listed under each. */
function groupByRequirement(findings: FdJudgedFinding[]): [string, FdJudgedFinding[]][] {
  const groups = new Map<string, FdJudgedFinding[]>();
  for (const f of findings) {
    const ids = f.requirementIds.length > 0 ? f.requirementIds : [NO_REQUIREMENT];
    for (const id of ids) groups.set(id, [...(groups.get(id) ?? []), f]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === NO_REQUIREMENT ? 1 : b === NO_REQUIREMENT ? -1 : a.localeCompare(b)));
}

function findingsHtml(findings: FdJudgedFinding[]): string {
  if (findings.length === 0) return `<p class="ok">No findings.</p>`;
  return groupByRequirement(findings)
    .map(([id, list]) => {
      const rows = list
        .map((f) => {
          const meta = [
            f.action ? `action ${esc(f.action)}` : "",
            f.errorCode ? `code ${esc(f.errorCode)}` : "",
            f.fieldPath ? `field ${esc(f.fieldPath)}` : "",
          ]
            .filter(Boolean)
            .join(" · ");
          return `<tr>
            <td><code>${esc(f.rule)}</code><div class="muted">${esc(f.source)}</div></td>
            <td>${esc(f.detail)}${meta ? `<div class="muted">${meta}</div>` : ""}</td>
            <td><code>${esc(f.messageId ?? "")}</code>${f.payloadId ? `<div class="muted">payload ${esc(f.payloadId)}</div>` : ""}</td>
          </tr>`;
        })
        .join("");
      return `<div class="req-group">
        <div class="req-id">${esc(id)} <span class="muted">(${list.length})</span></div>
        <table><thead><tr><th>Rule</th><th>Finding</th><th>Message ID</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    })
    .join("");
}

function exchangesHtml(flow: FdFlowVerdict): string {
  if (flow.exchanges.length === 0) return `<p class="muted">No recorded exchange.</p>`;
  const rows = flow.exchanges
    .map(
      (e, i) => `<tr class="${e.findings > 0 ? "row-fail" : e.judged ? "" : "row-skip"}">
        <td>${i + 1}</td>
        <td>${esc(e.recordedAt)}</td>
        <td>${esc(e.sender)}</td>
        <td><code>${esc(e.action ?? "?")}</code></td>
        <td><code>${esc(e.messageId ?? "")}</code></td>
        <td>${esc(e.httpStatus ?? "")}</td>
        <td>${esc(e.answer)}</td>
        <td>${e.judged ? (e.findings > 0 ? `${e.findings} finding(s)` : "ok") : "not judged"}</td>
      </tr>`
    )
    .join("");
  return `<table><thead><tr><th>#</th><th>Recorded</th><th>Sent by</th><th>Action</th><th>Message ID</th><th>HTTP</th><th>Answer</th><th>Judged</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function flowCard(flow: FdFlowVerdict, index: number): string {
  const reasons = flow.reasons.length > 0 ? `<ul class="reasons">${flow.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : "";
  return `<div class="card">
    <div class="flow-header" onclick="toggle('fd-flow-${index}')">
      <div><span class="arrow" id="arrow-fd-flow-${index}">▼</span>
        <span class="flow-id">Flow ID: ${esc(flow.flowId)}</span>
        <span class="muted">(Txn ID: ${esc(flow.transactionId ?? "N/A")})</span></div>
      <div>${verdictBadge(flow.verdict)}</div>
    </div>
    <div class="flow-content" id="fd-flow-${index}">
      ${reasons}
      ${flow.engineError ? `<p class="error">Engine error: ${esc(flow.engineError)}</p>` : ""}
      <div class="section-title">Findings by requirement ID</div>
      ${findingsHtml(flow.findings)}
      <div class="section-title">Exchanges, in recorded order</div>
      ${exchangesHtml(flow)}
    </div>
  </div>`;
}

function coverageHtml(report: FdReport): string {
  const entries = Object.entries(report.coverage);
  if (entries.length === 0) return `<p class="muted">No coverage: nothing was judged.</p>`;
  const count = (s: string) => entries.filter(([, e]) => e.status === s).length;
  const rows = entries
    .map(
      ([id, e]) => `<tr>
        <td><code>${esc(id)}</code></td>
        <td>${verdictBadge(e.status)}</td>
        <td>${e.scenarios.map(esc).join(", ")}</td>
        <td class="evidence">${e.evidence.map((m) => `<code>${esc(m)}</code>`).join(" ")}</td>
      </tr>`
    )
    .join("");
  const scope = report.certification?.plan
    ? `in the certification plan for ${esc(report.npRole ?? "")} (action groups ${esc(report.certification.plan.actionGroups.join(", "))})`
    : `in scope for ${esc(report.npRole ?? "")} (every route the role takes part in: no certification plan could be computed)`;
  return `<p>${count("PASS")} PASS · ${count("FAIL")} FAIL · ${count("NOT_COVERED")} NOT_COVERED, of ${entries.length} requirements ${scope}.</p>
    <table><thead><tr><th>Requirement</th><th>Status</th><th>Scenarios</th><th>Evidence (message IDs)</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function certificateHtml(report: FdReport): string {
  const c = report.certificate;
  if (!c) return `<p class="muted">No run summary: ${esc(report.error ?? "the run could not be judged")}.</p>`;
  const reasons = c.reasons.length > 0 ? `<details><summary>${c.reasons.length} reason(s)</summary><ul>${c.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul></details>` : "";
  if (c.sent) {
    const r = c.response ?? {};
    const serverReasons = r.reasons && r.reasons.length > 0 ? `<details><summary>automation-db reasons</summary><ul>${r.reasons.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>` : "";
    return `<p>Run summary sent to automation-db: certificate <code>${esc(r.certificateId ?? "?")}</code>, status ${verdictBadge(r.status === "VALID" ? "PASS" : String(r.status ?? "?"))} ${esc(r.status ?? "")} (verdict ${esc(r.verdict ?? "?")}).</p>${serverReasons}`;
  }
  const notSent = (c.notSent ?? []).map((r) => `<li>${esc(r)}</li>`).join("");
  return `<p>Would issue: ${c.decision === "PASS" ? badge("PASS", "pass") : badge("REFUSED", "fail")}</p>
    ${c.error ? `<p class="error">${esc(c.error)}</p>` : ""}
    ${notSent ? `<div class="muted">Not sent:</div><ul>${notSent}</ul>` : ""}
    ${reasons}`;
}

function planHtml(report: FdReport): string {
  const c = report.certification;
  if (!c) return `<p class="muted">No certification plan: ${esc(report.error ?? "the run could not be judged")}.</p>`;
  const d = c.declaration;
  const declaration =
    d.source === "default"
      ? `<p><strong>Declaration:</strong> the session carries no capability declaration (<code>capabilityDeclaration</code>), so certification assumes <strong>BOOKING only</strong>.</p>`
      : `<p><strong>Declaration:</strong> from the session${d.problem ? "" : ":"} <code>${esc(JSON.stringify(d.declaration))}</code></p>`;
  const problem = d.problem ? `<p class="error">${esc(d.problem)}; the plan below is for BOOKING only, and the certificate is refused.</p>` : "";
  const plan = c.plan;
  if (!plan) return `${declaration}${problem}<p class="error">${esc(c.planError ?? "the certification plan could not be computed")}</p>`;

  const flowRows = c.flows
    .map(
      (f) => `<tr>
        <td><code>${esc(f.planFlowId)}</code></td>
        <td>${f.sessionFlowId ? `<code>${esc(f.sessionFlowId)}</code>` : `<span class="muted">none</span>`}</td>
        <td>${verdictBadge(f.status)}</td>
        <td>${f.verdict ? verdictBadge(f.verdict) : ""}</td>
      </tr>`
    )
    .join("");
  const run = c.flows.filter((f) => f.status === "JUDGED").length;
  const gapRows = plan.gapDetails
    .map(
      (g) => `<tr>
        <td><code>${esc(g.requirementId)}</code></td>
        <td>${g.actions.map((a) => `<code>${esc(a)}</code>`).join(" ")}</td>
        <td>${g.scenarios.length > 0 ? esc(g.scenarios.join(", ")) : `<span class="muted">none in the catalogue</span>`}</td>
      </tr>`
    )
    .join("");
  const notRun = plan.notRun.map((s) => `scenario ${s.n}: ${s.coverage}${s.dependsOn ? ` (waits for spec change ${s.dependsOn.join(", ")})` : ""}${s.missingFlows ? ` (flow ${s.missingFlows.join(", ")} not available)` : ""}`);
  const blockers = [...c.blockers, ...(report.sla?.blockers ?? [])];
  return `${declaration}${problem}
    <p>Role <strong>${esc(plan.role)}</strong>, action groups <strong>${esc(plan.actionGroups.join(", "))}</strong>: ${plan.requirementIds.length} requirement IDs in scope, ${plan.covered.length} covered by a runnable flow, ${plan.gaps.length} gap(s). Plan certifiable: ${plan.certifiable ? badge("yes", "pass") : badge("no", "fail")}</p>
    <div class="section-title">Flows: ${run} of ${c.flows.length} required flows run and judged</div>
    <table><thead><tr><th>Plan flow</th><th>Session flow</th><th>Status</th><th>Verdict</th></tr></thead><tbody>${flowRows || `<tr><td colspan="4" class="muted">The plan lists no flow.</td></tr>`}</tbody></table>
    <div class="section-title">Gaps: in-scope requirements no runnable flow covers</div>
    ${gapRows ? `<table><thead><tr><th>Requirement</th><th>Actions citing it</th><th>Scenarios that would cover it</th></tr></thead><tbody>${gapRows}</tbody></table>` : `<p class="ok">No gap.</p>`}
    <div class="section-title">Blockers (${blockers.length})</div>
    ${list(blockers, `<p class="ok">No blocker.</p>`)}
    <details><summary>Scenarios: ${plan.runnable.length} run by the flows, ${plan.edge.length} checked on every message, ${plan.notRun.length} not run yet, ${plan.outOfScope.length} out of scope</summary>
      <p>Run by the flows: ${esc(plan.runnable.join(", ") || "none")}. Checked on every message: ${esc(plan.edge.join(", ") || "none")}.</p>
      ${notRun.length > 0 ? `<div class="muted">Not run yet:</div>${list(notRun)}` : ""}
      ${plan.outOfScope.length > 0 ? `<div class="muted">Out of scope:</div>${list(plan.outOfScope.map((o) => `scenario ${o.n}: ${o.reason}`))}` : ""}
    </details>`;
}

function slaHtml(report: FdReport): string {
  const sla = report.sla;
  if (!sla) return `<p class="muted">No SLA scores: ${esc(report.error ?? "the run could not be judged")}.</p>`;
  const answerRows = sla.answerTimes
    .map(
      (r) => `<tr class="${r.verdict === "PASS" || r.verdict === "NO_SLA" ? "" : "row-fail"}">
        <td><code>${esc(r.action)}</code></td>
        <td>${esc(r.sla ?? "")}${r.proposed ? ` <span class="muted">(proposed)</span>` : ""}</td>
        <td>${esc(r.n)} / ${esc(sla.minSamples)}${r.untimed > 0 ? `<div class="muted">${esc(r.untimed)} untimed</div>` : ""}</td>
        <td>${r.observedMs === null ? "" : `${esc(r.observedMs)} ms`}</td>
        <td>${r.limitMs === null ? "" : `${esc(r.limitMs)} ms`}</td>
        <td>${verdictBadge(r.verdict)}</td>
        <td>${r.needed > 0 ? `${esc(r.needed)} more` : ""}</td>
      </tr>`
    )
    .join("");
  const deadlineRows = sla.deadlines
    .map(
      (r) => `<tr class="${r.verdict === "PASS" ? "" : "row-fail"}">
        <td>${esc(r.flowId)}</td>
        <td><code>${esc(r.request)}</code><div class="muted">${esc(r.messageId)}</div></td>
        <td><code>${esc(r.callback)}</code></td>
        <td>${r.elapsedMs === null ? "none" : `${esc(r.elapsedMs)} ms`}</td>
        <td>${r.deadline ? `${esc(r.deadline.text)} <span class="muted">(${esc(r.deadline.source)})</span>` : ""}</td>
        <td>${verdictBadge(r.verdict)}</td>
        <td>${esc(r.detail)}</td>
      </tr>`
    )
    .join("");
  return `<p>Only what the NP answers is scored. Answer times: nearest-rank percentile over at least <strong>${esc(sla.minSamples)}</strong> timed answers per action (env <code>FD_SLA_MIN_SAMPLES</code>); fewer is INSUFFICIENT_SAMPLES, which refuses the certificate. SLAs certifiable: ${sla.certifiable ? badge("yes", "pass") : badge("no", "fail")}</p>
    ${sla.minSamplesNote ? `<p class="error">${esc(sla.minSamplesNote)}</p>` : ""}
    ${sla.error ? `<p class="error">${esc(sla.error)}</p>` : ""}
    <div class="section-title">Answer times (SYNC routes the NP answers)</div>
    ${answerRows ? `<table><thead><tr><th>Action</th><th>SLA</th><th>Samples</th><th>Observed</th><th>Limit</th><th>Verdict</th><th>Needed</th></tr></thead><tbody>${answerRows}</tbody></table>` : `<p class="muted">No SYNC route the NP answers is in scope with an answer-time SLA.</p>`}
    <div class="section-title">Callback deadlines (callbacks the NP owed)</div>
    ${deadlineRows ? `<table><thead><tr><th>Flow</th><th>Request</th><th>Callback</th><th>Elapsed</th><th>Deadline</th><th>Verdict</th><th>Detail</th></tr></thead><tbody>${deadlineRows}</tbody></table>` : `<p class="muted">The NP owed no callback in this run.</p>`}
    <details><summary>Known biases</summary>${list(sla.biases)}</details>`;
}

function rulesLegend(): string {
  return `<details><summary>Judge rules</summary><ul>${Object.entries(JUDGE_RULES)
    .map(([rule, text]) => `<li><code>${esc(rule)}</code>: ${esc(text)}</li>`)
    .join("")}</ul><p class="muted">Certification and SLA rules, on the run as a whole (they cite no requirement ID, so no waiver covers them):</p><ul>${Object.entries({ ...CERTIFICATION_RULES, ...SLA_RULES })
    .map(([rule, text]) => `<li><code>${esc(rule)}</code>: ${esc(text)}</li>`)
    .join("")}</ul><p class="muted">Every other rule is the engine's (@ondc/fd-contract ENVELOPE_RULES and JOURNEY_RULES).</p></details>`;
}

export function generateFdHTMLReport(report: FdReport): { html: string; flowResults: Record<string, "PASS" | "FAIL"> } {
  const flowResults: Record<string, "PASS" | "FAIL"> = {};
  for (const flow of report.flows) flowResults[flow.flowId] = flow.verdict === "PASS" ? "PASS" : "FAIL";

  const styles = `<style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f7f7f7; color: #333; }
    h1 { text-align: center; color: #0056a6; font-size: 26px; margin-bottom: 10px; }
    .sub { text-align: center; color: #555; margin-bottom: 24px; }
    .card { background: #fff; margin: 15px 0 25px; padding: 15px; border-radius: 8px; border: 1px solid #ddd; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
    .flow-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 8px 4px; }
    .flow-id { font-size: 18px; font-weight: bold; color: #0056a6; margin: 0 8px; }
    .arrow { color: #0056a6; display: inline-block; min-width: 20px; }
    .flow-content { display: none; padding-top: 10px; }
    .flow-content.expanded { display: block; }
    .badge { font-size: 13px; padding: 4px 10px; border-radius: 14px; color: #fff; font-weight: bold; }
    .badge.pass { background: #28a745; } .badge.fail { background: #dc3545; } .badge.neutral { background: #6c757d; }
    .section-title { font-size: 15px; font-weight: bold; margin: 16px 0 8px; }
    .req-group { margin-bottom: 12px; } .req-id { font-weight: bold; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: auto; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; word-break: break-word; }
    th { background: #f0f4f8; }
    tr.row-fail td { background: #fce8e6; } tr.row-skip td { color: #999; }
    code { font-size: 12px; } .evidence code { display: inline-block; margin: 1px 2px; }
    .muted { color: #777; font-size: 12px; } .ok { color: #155724; } .error { color: #721c24; background: #fce8e6; padding: 6px 8px; border-radius: 4px; }
    .verdict { font-size: 18px; text-align: center; margin: 10px 0; }
    .controls { display: flex; justify-content: flex-end; gap: 10px; margin-bottom: 10px; }
    .control-btn { background: #0056a6; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
  </style>`;
  const script = `<script>
    function toggle(id) {
      var c = document.getElementById(id); var a = document.getElementById('arrow-' + id);
      var open = c.classList.toggle('expanded'); a.textContent = open ? '▲' : '▼';
    }
    function expandAll() { document.querySelectorAll('.flow-content').forEach(function (c) { c.classList.add('expanded'); }); }
    function collapseAll() { document.querySelectorAll('.flow-content').forEach(function (c) { c.classList.remove('expanded'); }); }
  </script>`;

  const facts = [
    `Session ID: <strong>${esc(report.sessionId)}</strong>`,
    `${esc(report.domain)} ${esc(report.version)}`,
    report.npRole ? `NP under test: <strong>${esc(report.npRole)}</strong> (npType ${esc(report.npType ?? "")}); the workbench played ${esc(report.workbenchRole ?? "")}` : "",
    report.tableHash ? `route table <code>${esc(report.tableHash)}</code>` : "",
    report.contractVersion ? `@ondc/fd-contract ${esc(report.contractVersion)}` : "",
    `generated ${esc(report.generatedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FD Protocol Report</title>
  ${styles}
</head>
<body>
  <h1>FD Protocol Report</h1>
  <div class="sub">${facts}</div>
  <div class="controls">
    <button class="control-btn" onclick="expandAll()">▼ Expand All</button>
    <button class="control-btn" onclick="collapseAll()">▲ Collapse All</button>
  </div>
  <div class="card">
    <div class="verdict">Run verdict: ${verdictBadge(report.verdict)}</div>
    <p class="muted">Fail-closed: a flow passes only with no finding, recorded evidence for every step and no engine error.</p>
    ${report.error ? `<p class="error">${esc(report.error)}</p>` : ""}
    <ul>${report.flows.map((f) => `<li>${esc(f.flowId)}: ${verdictBadge(f.verdict)} ${f.findings.length} finding(s)</li>`).join("")}</ul>
    ${rulesLegend()}
  </div>
  <div class="card">
    <div class="section-title">Certificate</div>
    ${certificateHtml(report)}
  </div>
  <div class="card">
    <div class="section-title">Certification plan</div>
    ${planHtml(report)}
  </div>
  <div class="card">
    <div class="section-title">SLA</div>
    ${slaHtml(report)}
  </div>
  ${report.flows.map(flowCard).join("")}
  <div class="card">
    <div class="section-title">Requirement coverage</div>
    ${coverageHtml(report)}
  </div>
  ${script}
</body>
</html>`;
  return { html, flowResults };
}
