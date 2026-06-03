export interface FlowHelpSourcePage {
  path: string;
  title?: string;
}

export interface FlowHelpIndex {
  data: string[];
  default?: {
    title?: string;
    text?: string;
  };
  redirects?: Record<string, string>;
}

export interface FlowHelpLink {
  id: string;
  title: string;
  href: string;
  description: string;
}

export interface FlowHelpRegistry {
  source: "origins-flow-help";
  indexPath: string;
  pages: FlowHelpSourcePage[];
  links: FlowHelpLink[];
}

export const ORIGINS_FLOW_HELP_REPOSITORY = "https://github.com/mathgeniuszach/origins-flow-help";

export function createBuiltinFlowHelpRegistry(): FlowHelpRegistry {
  return {
    source: "origins-flow-help",
    indexPath: "index.yaml",
    pages: [
      { path: "data/index.yaml", title: "Index" },
      { path: "data/bug-fix.yaml", title: "Bug Fix" },
      { path: "data/installing-datapacks.yaml", title: "Installing Datapacks" },
      { path: "data/installing-the-mod.yaml", title: "Installing the Mod" },
      { path: "data/making-datapacks.yaml", title: "Making Datapacks" },
      { path: "data/powers.yaml", title: "Powers" },
      { path: "data/first-datapack.yaml", title: "First Datapack" },
      { path: "data/random.yaml", title: "Random" }
    ],
    links: [
      {
        id: "repo",
        title: "origins-flow-help repository",
        href: ORIGINS_FLOW_HELP_REPOSITORY,
        description: "Flow-chart like help for making and using Origins."
      },
      {
        id: "live-help",
        title: "Hosted flow help",
        href: "https://xmgzx.github.io/origins-flow-help/",
        description: "Hosted version linked from the repository README."
      },
      {
        id: "origin-creator-help",
        title: "Origin Creator help",
        href: "https://mathgeniuszach.com/apps/origin-creator/help",
        description: "Original help entrypoint referenced by the repository."
      }
    ]
  };
}

export function normalizeFlowHelpIndex(index: FlowHelpIndex): FlowHelpSourcePage[] {
  return (index.data ?? []).map((entry) => ({
    path: entry,
    ...(entry.split("/").pop()?.replace(/\.yaml$/i, "").replace(/-/g, " ")
      ? { title: entry.split("/").pop()!.replace(/\.yaml$/i, "").replace(/-/g, " ") }
      : {})
  }));
}
