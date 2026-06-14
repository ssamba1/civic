import {
  Construction,
  Droplets,
  Footprints,
  HelpCircle,
  Lightbulb,
  type LucideIcon,
  ShieldAlert,
  Signpost,
  SprayCan,
  Trash2,
  TreePine,
  Users,
  Waves,
} from "lucide-react";

/* ==================================================================
   Maps the kebab `icon` field on TeamMeta to its lucide component.
   Centralized so any Teams surface (roster, bars, delegation chips)
   renders the same glyph for a given team.
   ================================================================== */

const ICON_MAP: Record<string, LucideIcon> = {
  users: Users,
  construction: Construction,
  footprints: Footprints,
  waves: Waves,
  droplets: Droplets,
  lightbulb: Lightbulb,
  "sign-post": Signpost,
  "tree-pine": TreePine,
  "spray-can": SprayCan,
  "shield-alert": ShieldAlert,
  "trash-2": Trash2,
  "help-circle": HelpCircle,
};

export function teamIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? HelpCircle;
}
