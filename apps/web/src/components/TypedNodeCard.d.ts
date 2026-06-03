import type { ReactNode } from "react";
export declare function TypedNodeCard({ title, type, description, children, defaultOpen }: {
    title: string;
    type?: string | undefined;
    description?: string | undefined;
    children: ReactNode;
    defaultOpen?: boolean;
}): import("react").JSX.Element;
