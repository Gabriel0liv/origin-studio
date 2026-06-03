export declare function FileHeader({ kindLabel, fileName, directory, absolutePath, dirty, onSave, onReload, onOpenJson }: {
    kindLabel: string;
    fileName?: string | undefined;
    directory?: string | undefined;
    absolutePath?: string | undefined;
    dirty: boolean;
    onSave: () => void;
    onReload: () => void;
    onOpenJson: () => void;
}): import("react").JSX.Element;
