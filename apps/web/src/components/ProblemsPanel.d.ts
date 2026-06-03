import type { Diagnostic } from "../types";
export declare function ProblemsPanel({ currentFileProblems, projectProblems, onExplain, onApplyQuickFix, onGoToProblem }: {
    currentFileProblems: Diagnostic[];
    projectProblems: Diagnostic[];
    onExplain: (id: string) => void;
    onApplyQuickFix: (replacement: string) => void;
    onGoToProblem: (diagnostic: Diagnostic) => void;
}): import("react").JSX.Element;
