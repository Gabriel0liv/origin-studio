import { readFile } from "node:fs/promises";
import path from "node:path";
import { isObject } from "@origin-studio/core";

export interface OriginStudioProfileConfig {
  profile: string;
  extraAttributes: string[];
  extraEffects: string[];
  extraNamespaces: string[];
  folderRules: string[];
  legacyExceptions: string[];
  customDiagnostics: string[];
  knownPowers: string[];
  templates: Array<{
    id: string;
    label: string;
    kind: string;
    content: unknown;
  }>;
}

export const defaultTemplates: OriginStudioProfileConfig["templates"] = [
  {
    id: "new-power-simple",
    label: "New Power: Simple",
    kind: "power",
    content: { type: "origins:simple", name: "New Power", description: "Describe this power." }
  },
  {
    id: "new-power-passive-attribute",
    label: "New Power: Passive Attribute",
    kind: "power",
    content: { type: "origins:attribute", modifier: { attribute: "minecraft:generic.max_health", value: 2, operation: "addition" } }
  },
  {
    id: "new-power-active-self",
    label: "New Power: Active Self with Cooldown",
    kind: "power",
    content: { type: "origins:active_self", cooldown: 100, entity_action: { type: "origins:play_sound", sound: "minecraft:block.note_block.pling" } }
  },
  {
    id: "new-power-conditional-cooldown",
    label: "New Power: Conditional Active with Manual Cooldown",
    kind: "power",
    content: { type: "origins:multiple", active: { type: "origins:active_self", entity_action: { type: "origins:if_else" } }, cooldown: { type: "origins:cooldown", cooldown: 200 } }
  },
  {
    id: "new-power-on-hit",
    label: "New Power: On Hit",
    kind: "power",
    content: { type: "origins:action_on_hit", bientity_action: { type: "origins:damage", amount: 2 } }
  },
  {
    id: "new-power-when-hit",
    label: "New Power: When Hit",
    kind: "power",
    content: { type: "origins:action_when_hit" }
  },
  {
    id: "new-power-resource-decay",
    label: "New Power: Resource + Decay",
    kind: "power",
    content: { type: "origins:resource", min: 0, max: 100, start_value: 100 }
  },
  {
    id: "new-power-temporary",
    label: "New Power: Temporary Internal Power",
    kind: "power",
    content: { type: "origins:simple", hidden: true }
  },
  {
    id: "new-origin",
    label: "New Origin",
    kind: "origin",
    content: { name: "New Origin", description: "Describe this origin.", powers: [] }
  },
  {
    id: "new-origin-layer",
    label: "New Origin Layer",
    kind: "origin_layer",
    content: { replace: false, origins: [] }
  },
  {
    id: "new-item-modifier-add-power",
    label: "New Item Modifier: add_power",
    kind: "item_modifier",
    content: { function: "origins:add_power", power: "example:my_power", slot: "mainhand" }
  },
  {
    id: "new-tag",
    label: "New Tag",
    kind: "tag",
    content: { replace: false, values: [] }
  }
];

export const defaultProfile: OriginStudioProfileConfig = {
  profile: "default",
  extraAttributes: [],
  extraEffects: [],
  extraNamespaces: [],
  folderRules: [],
  legacyExceptions: [],
  customDiagnostics: [],
  knownPowers: [],
  templates: defaultTemplates
};

export async function loadProfile(projectRoot?: string): Promise<OriginStudioProfileConfig> {
  if (!projectRoot) {
    return defaultProfile;
  }

  const configPath = path.join(projectRoot, "origin-studio.config.json");

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return defaultProfile;

    return {
      ...defaultProfile,
      ...parsed,
      templates: Array.isArray(parsed.templates) ? [...defaultTemplates, ...parsed.templates] : defaultTemplates
    };
  } catch {
    return defaultProfile;
  }
}

export function listProfiles(): Array<{ id: string; label: string }> {
  return [{ id: "default", label: "Default" }];
}
