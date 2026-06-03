import { Copy } from "lucide-react";
import type { Diagnostic } from "../types";
import { copyToClipboard, problemKey } from "../utils";

export function ProblemsPanel({
  currentFileProblems,
  projectProblems,
  onExplain,
  onApplyQuickFix,
  onGoToProblem
}: {
  currentFileProblems: Diagnostic[];
  projectProblems: Diagnostic[];
  onExplain: (id: string) => void;
  onApplyQuickFix: (replacement: string) => void;
  onGoToProblem: (diagnostic: Diagnostic) => void;
}) {
  return (
    <section className="inspector-card">
      <div className="inspector-card-header">
        <h3>Problems</h3>
        <p>Current file first, then the rest of the project.</p>
      </div>

      <div className="inspector-problems-group">
        <h4>Current file</h4>
        {currentFileProblems.length === 0 ? <p className="empty-state compact">No problems in this file.</p> : null}
        {currentFileProblems.map((problem) => (
          <ProblemRow
            key={problemKey(problem)}
            diagnostic={problem}
            onExplain={onExplain}
            onApplyQuickFix={onApplyQuickFix}
            onGoToProblem={onGoToProblem}
          />
        ))}
      </div>

      <div className="inspector-problems-group">
        <h4>Whole project</h4>
        {projectProblems.length === 0 ? <p className="empty-state compact">No additional project problems.</p> : null}
        {projectProblems.map((problem) => (
          <ProblemRow
            key={problemKey(problem)}
            diagnostic={problem}
            onExplain={onExplain}
            onApplyQuickFix={onApplyQuickFix}
            onGoToProblem={onGoToProblem}
          />
        ))}
      </div>
    </section>
  );
}

function ProblemRow({
  diagnostic,
  onExplain,
  onApplyQuickFix,
  onGoToProblem
}: {
  diagnostic: Diagnostic;
  onExplain: (id: string) => void;
  onApplyQuickFix: (replacement: string) => void;
  onGoToProblem: (diagnostic: Diagnostic) => void;
}) {
  return (
    <article className={`problem-row ${diagnostic.severity}`}>
      <div className="problem-row-copy">
        <div className="problem-row-meta">
          <span className={`severity-badge ${diagnostic.severity}`}>{diagnostic.severity}</span>
          <strong>{diagnostic.id}</strong>
        </div>
        <p>{diagnostic.message}</p>
        {diagnostic.suggestion ? <small>{diagnostic.suggestion}</small> : null}
      </div>
      <div className="problem-row-actions">
        {diagnostic.range ? (
          <button className="ghost-button compact" onClick={() => onGoToProblem(diagnostic)}>
            Go to field
          </button>
        ) : null}
        <button className="ghost-button compact" onClick={() => onExplain(diagnostic.id)}>
          Explain
        </button>
        <button className="ghost-button compact" onClick={() => void copyToClipboard(JSON.stringify(diagnostic, null, 2))}>
          <Copy size={14} />
          Copy
        </button>
        {diagnostic.quickFix?.replacement ? (
          <button className="ghost-button compact" onClick={() => onApplyQuickFix(diagnostic.quickFix!.replacement!)}>
            {diagnostic.quickFix.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}
