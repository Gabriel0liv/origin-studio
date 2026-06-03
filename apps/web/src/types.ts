export type TreeNode = {
  name: string;
  path: string;
  relativePath: string;
  type: "directory" | "file";
  kind?: string;
  children?: TreeNode[];
};

export type FileContentResponse = {
  path: string;
  filePath: string;
  raw: string;
  data?: unknown;
  errors: string[];
  kind: string;
};

export type Diagnostic = {
  id: string;
  severity: "error" | "warning" | "info";
  filePath: string;
  message: string;
  suggestion?: string;
  range?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  quickFix?: {
    label: string;
    replacement?: string;
  };
};

export type SchemaField = {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  allowedValues?: string[];
  nestedKind?: string;
  arrayItemType?: string;
};

export type SchemaType = {
  id: string;
  kind: string;
  description?: string;
  fields: SchemaField[];
  source: string;
};

export type FileReference = {
  kind:
    | "origin"
    | "origin_layer"
    | "power"
    | "item_modifier"
    | "tag"
    | "resource"
    | "function"
    | "damage_type";
  id: string;
  sourcePath: string;
  jsonPath?: string;
};

export type ReferenceItem = {
  id: string;
  kind: "power" | "tag" | "item_modifier" | "resource" | "function";
  status: "found" | "missing";
  path?: string;
};

export type DefinitionItem = {
  id: string;
  kind: string;
  path?: string;
};

export type LookupEntry = {
  id: string;
  kind: string;
  path: string;
  relativePath: string;
};

export type OpenDocumentState = {
  filePath: string;
  relativePath: string;
  kind: string;
  raw: string;
  parsed?: unknown;
  dirty: boolean;
  diagnostics: Diagnostic[];
  schema: SchemaType | null;
  incomingReferences: FileReference[];
};

export type NewFileKind = "power" | "origin" | "origin_layer" | "item_modifier" | "tag";

export type NewFileDraft = {
  kind: NewFileKind;
  namespace: string;
  path: string;
  type?: string;
  tagFolder?: string;
  name: string;
  description: string;
  hidden: boolean;
  impact?: number;
  order?: number;
  icon?: string;
};
