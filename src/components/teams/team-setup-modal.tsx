"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  AlertTriangle,
  Ambulance,
  Anchor,
  Bell,
  Bike,
  Box,
  Briefcase,
  Bug,
  Building,
  Building2,
  Bus,
  Car,
  Check,
  ChevronUp,
  ClipboardList,
  CloudRain,
  Cog,
  Construction,
  Cross,
  Droplet,
  Droplets,
  Eye,
  Factory,
  FileText,
  Flame,
  Flower2,
  Footprints,
  Fuel,
  Gauge,
  Gavel,
  Hammer,
  HardHat,
  Heart,
  HelpCircle,
  Home,
  Hospital,
  Landmark,
  Leaf,
  Lightbulb,
  type LucideIcon,
  Map as MapIcon,
  MapPin,
  Megaphone,
  Milestone,
  Mountain,
  Navigation,
  Package,
  Paintbrush,
  ParkingCircle,
  PawPrint,
  Phone,
  Plane,
  Plug,
  Plus,
  Power,
  Recycle,
  Route,
  Scale,
  School,
  Search,
  Shield,
  ShieldAlert,
  Ship,
  Signpost,
  Siren,
  Snowflake,
  SprayCan,
  Sprout,
  Stethoscope,
  Store,
  Sun,
  Thermometer,
  TrafficCone,
  Trash2,
  TreeDeciduous,
  TreePine,
  Trees,
  Truck,
  Umbrella,
  Users,
  Wallet,
  Warehouse,
  Waves,
  Wifi,
  Wind,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useCategoryOverrides } from "@/lib/category-overrides";
import { CATEGORY_META } from "@/lib/dashboard-data";
import { TEAMS, type TeamId } from "@/lib/teams";
import type { ReportCategory } from "@/lib/types";
import { cn } from "@/lib/utils/cn";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";

/* ==================================================================
   New-team setup modal. Opened from the AddTeamCard in the roster.

   Lives as an in-place overlay (not a route) so it inherits the dark
   team-dashboard theme and the FilterProvider tree, keeping the current
   team/city context instead of navigating away.

   Selecting auto-route categories calls setCategoryTeam() on submit,
   mutating the module-level routing snapshot consumed live by the
   delegation panel, routing matrix, and map filter.
   ================================================================== */

// First PRIMARY_ICON_COUNT entries show by default; the rest are revealed by
// the "More" toggle, which also surfaces a search box for filtering by label.
const ICON_OPTIONS: { key: string; Icon: LucideIcon; label: string }[] = [
  { key: "users", Icon: Users, label: "Users" },
  { key: "construction", Icon: Construction, label: "Construction" },
  { key: "footprints", Icon: Footprints, label: "Sidewalk" },
  { key: "waves", Icon: Waves, label: "Water" },
  { key: "droplets", Icon: Droplets, label: "Droplets" },
  { key: "lightbulb", Icon: Lightbulb, label: "Lighting" },
  { key: "sign-post", Icon: Signpost, label: "Signs" },
  { key: "tree-pine", Icon: TreePine, label: "Parks" },
  { key: "spray-can", Icon: SprayCan, label: "Graffiti" },
  { key: "shield-alert", Icon: ShieldAlert, label: "Enforcement" },
  { key: "trash-2", Icon: Trash2, label: "Waste" },
  { key: "help-circle", Icon: HelpCircle, label: "General" },
  // --- extended set (revealed by "More") ---
  { key: "car", Icon: Car, label: "Car" },
  { key: "bus", Icon: Bus, label: "Bus" },
  { key: "truck", Icon: Truck, label: "Truck" },
  { key: "bike", Icon: Bike, label: "Bike" },
  { key: "traffic-cone", Icon: TrafficCone, label: "Traffic" },
  { key: "parking", Icon: ParkingCircle, label: "Parking" },
  { key: "plane", Icon: Plane, label: "Airport" },
  { key: "ship", Icon: Ship, label: "Port" },
  { key: "anchor", Icon: Anchor, label: "Harbor" },
  { key: "map-pin", Icon: MapPin, label: "Location" },
  { key: "map", Icon: MapIcon, label: "Map" },
  { key: "navigation", Icon: Navigation, label: "Navigation" },
  { key: "route", Icon: Route, label: "Route" },
  { key: "milestone", Icon: Milestone, label: "Markers" },
  { key: "building", Icon: Building, label: "Building" },
  { key: "building-2", Icon: Building2, label: "Offices" },
  { key: "home", Icon: Home, label: "Housing" },
  { key: "hospital", Icon: Hospital, label: "Hospital" },
  { key: "school", Icon: School, label: "Schools" },
  { key: "landmark", Icon: Landmark, label: "Civic" },
  { key: "store", Icon: Store, label: "Business" },
  { key: "factory", Icon: Factory, label: "Industry" },
  { key: "warehouse", Icon: Warehouse, label: "Facilities" },
  { key: "tree-deciduous", Icon: TreeDeciduous, label: "Trees" },
  { key: "trees", Icon: Trees, label: "Forestry" },
  { key: "leaf", Icon: Leaf, label: "Green" },
  { key: "sprout", Icon: Sprout, label: "Planting" },
  { key: "flower", Icon: Flower2, label: "Gardens" },
  { key: "mountain", Icon: Mountain, label: "Terrain" },
  { key: "sun", Icon: Sun, label: "Weather" },
  { key: "cloud-rain", Icon: CloudRain, label: "Rain" },
  { key: "snowflake", Icon: Snowflake, label: "Snow" },
  { key: "wind", Icon: Wind, label: "Wind" },
  { key: "flame", Icon: Flame, label: "Fire" },
  { key: "thermometer", Icon: Thermometer, label: "Heat" },
  { key: "umbrella", Icon: Umbrella, label: "Storm" },
  { key: "wrench", Icon: Wrench, label: "Repairs" },
  { key: "hammer", Icon: Hammer, label: "Maintenance" },
  { key: "hard-hat", Icon: HardHat, label: "Safety Gear" },
  { key: "cog", Icon: Cog, label: "Operations" },
  { key: "plug", Icon: Plug, label: "Utilities" },
  { key: "zap", Icon: Zap, label: "Power" },
  { key: "power", Icon: Power, label: "Grid" },
  { key: "wifi", Icon: Wifi, label: "Network" },
  { key: "gauge", Icon: Gauge, label: "Metering" },
  { key: "fuel", Icon: Fuel, label: "Fuel" },
  { key: "recycle", Icon: Recycle, label: "Recycling" },
  { key: "droplet", Icon: Droplet, label: "Drainage" },
  { key: "shield", Icon: Shield, label: "Security" },
  { key: "siren", Icon: Siren, label: "Emergency" },
  { key: "alert-triangle", Icon: AlertTriangle, label: "Hazards" },
  { key: "phone", Icon: Phone, label: "Hotline" },
  { key: "megaphone", Icon: Megaphone, label: "Outreach" },
  { key: "bell", Icon: Bell, label: "Alerts" },
  { key: "eye", Icon: Eye, label: "Monitoring" },
  { key: "heart", Icon: Heart, label: "Health" },
  { key: "stethoscope", Icon: Stethoscope, label: "Medical" },
  { key: "cross", Icon: Cross, label: "Aid" },
  { key: "ambulance", Icon: Ambulance, label: "Ambulance" },
  { key: "paw-print", Icon: PawPrint, label: "Animals" },
  { key: "bug", Icon: Bug, label: "Pests" },
  { key: "paintbrush", Icon: Paintbrush, label: "Painting" },
  { key: "package", Icon: Package, label: "Deliveries" },
  { key: "box", Icon: Box, label: "Storage" },
  { key: "clipboard-list", Icon: ClipboardList, label: "Inspections" },
  { key: "file-text", Icon: FileText, label: "Records" },
  { key: "briefcase", Icon: Briefcase, label: "Admin" },
  { key: "wallet", Icon: Wallet, label: "Finance" },
  { key: "scale", Icon: Scale, label: "Compliance" },
  { key: "gavel", Icon: Gavel, label: "Legal" },
];

const PRIMARY_ICON_COUNT = 12;

const COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#84cc16",
  "#d4d4d4",
  "#737373",
  "#a78bfa",
];

const ALL_CATEGORIES = Object.keys(CATEGORY_META) as ReportCategory[];
const REAL_TEAMS = Object.values(TEAMS).filter((t) => t.id !== "all");

export function TeamSetupModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { setCategoryTeam } = useCategoryOverrides();

  // Portal mount gate — SSR + first CSR render both return null so the
  // hydration trees match before createPortal runs on the second commit.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [name, setName] = useState("");
  const [shortLabel, setShortLabel] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [selectedIcon, setSelectedIcon] = useState("users");
  const [iconsExpanded, setIconsExpanded] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [duties, setDuties] = useState("");
  const [assignedCategories, setAssignedCategories] = useState<
    Set<ReportCategory>
  >(new Set());
  // User-defined report types added inline. Kept in local state (not the
  // ReportCategory-keyed override store) because the category union is closed
  // at compile time — see the note on handleSubmit.
  const [customCategories, setCustomCategories] = useState<
    { id: string; label: string; color: string }[]
  >([]);
  const [selectedCustom, setSelectedCustom] = useState<Set<string>>(new Set());
  // Monotonic id source — never reuses a suffix after a removal, so two live
  // custom rows can't collide (a .length-based id would).
  const customIdRef = useRef(0);
  const [addingCategory, setAddingCategory] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftColor, setDraftColor] = useState(COLOR_PRESETS[0]);
  const [submitted, setSubmitted] = useState(false);

  // Success-state celebration: pulse the confirmation check (0 → 1.3 → 1).
  // matchMedia-gated so reduce-motion users get a clean static check.
  const checkRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!submitted || !checkRef.current) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          checkRef.current,
          { scale: 0 },
          { scale: 1, duration: 0.4, ease: "back.out(2.6)" },
        );
      });
      return () => mm.revert();
    },
    { dependencies: [submitted] },
  );

  // Escape-to-close + scroll lock + focus trap while open. aria-modal alone
  // doesn't keep keyboard focus inside the dialog; trap Tab/Shift+Tab at the
  // boundaries, move focus in on open, and restore it to the opener on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const focusables = dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const unlock = lockBodyScroll();
    window.addEventListener("keydown", onKey);
    return () => {
      unlock();
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  // Reset the form each time the modal re-opens.
  useEffect(() => {
    if (!open) return;
    setName("");
    setShortLabel("");
    setColor("#3b82f6");
    setSelectedIcon("users");
    setIconsExpanded(false);
    setIconSearch("");
    setDuties("");
    setAssignedCategories(new Set());
    setCustomCategories([]);
    setSelectedCustom(new Set());
    customIdRef.current = 0;
    setAddingCategory(false);
    setDraftLabel("");
    setDraftColor(COLOR_PRESETS[0]);
    setSubmitted(false);
  }, [open]);

  if (!mounted || !open) return null;

  function toggleCategory(cat: ReportCategory) {
    setAssignedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function addCustomCategory() {
    const label = draftLabel.trim();
    if (!label) return;
    const id = `custom:${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${customIdRef.current++}`;
    setCustomCategories((prev) => [...prev, { id, label, color: draftColor }]);
    setSelectedCustom((prev) => new Set(prev).add(id));
    setDraftLabel("");
    setAddingCategory(false);
  }

  function removeCustomCategory(id: string) {
    setCustomCategories((prev) => prev.filter((c) => c.id !== id));
    setSelectedCustom((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function toggleCustomCategory(id: string) {
    setSelectedCustom((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Apply category routing overrides live. "general_admin" stands in as
    // the owning team until a persisted team registry exists in Supabase.
    for (const cat of assignedCategories) {
      setCategoryTeam(cat, "general_admin" as TeamId);
    }
    // Custom categories aren't persisted to the override store: it's keyed by
    // the closed ReportCategory union and the AI classifier only emits those
    // built-in categories, so a custom type would never actually receive a
    // report. They exist here for team-definition UX; making them route for
    // real means widening ReportCategory + the classifier prompt.
    setSubmitted(true);
  }

  const SelectedIcon =
    ICON_OPTIONS.find((o) => o.key === selectedIcon)?.Icon ?? Users;
  const isValid = name.trim().length > 0 && shortLabel.trim().length > 0;
  const totalSelected = assignedCategories.size + selectedCustom.size;

  // Collapsed: the curated first PRIMARY_ICON_COUNT. Expanded: the full set,
  // filtered by the search box (matched against each icon's label).
  const iconQuery = iconSearch.trim().toLowerCase();
  const visibleIcons = iconsExpanded
    ? ICON_OPTIONS.filter((o) => o.label.toLowerCase().includes(iconQuery))
    : ICON_OPTIONS.slice(0, PRIMARY_ICON_COUNT);

  return createPortal(
    <div className="fixed inset-0 z-50 animate-backdrop-in">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close team setup"
        className="absolute inset-0 bg-black/75"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="New team setup"
        tabIndex={-1}
        className={cn(
          "absolute inset-2 sm:inset-4 lg:inset-x-0 lg:inset-y-6 lg:mx-auto lg:max-w-2xl",
          "flex flex-col overflow-hidden text-foreground",
          "rounded-[var(--radius-lg)] border border-hairline bg-surface",
          "shadow-[var(--shadow-pop)]",
          "origin-center animate-[city-pop_120ms_ease-out]",
        )}
      >
        {/* Header */}
        <header className="flex flex-shrink-0 items-center justify-between border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md"
              style={{ background: `${color}22`, color }}
            >
              <SelectedIcon className="h-4 w-4" strokeWidth={1.75} />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold text-foreground leading-tight">
                New Team
              </h2>
              <p className="text-[12px] text-faint leading-tight">
                Details &amp; auto-routing rules
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            className="-m-1.5"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        </header>

        {submitted ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)]"
              style={{ background: `${color}22`, color }}
            >
              <SelectedIcon className="h-7 w-7" strokeWidth={1.75} />
            </span>
            <div
              ref={checkRef}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-success)]/20 text-[var(--status-success-fg)] will-change-transform"
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-foreground">
                {name} created
              </h3>
              <p className="mt-1 text-sm text-subtle">
                {assignedCategories.size > 0
                  ? `${assignedCategories.size} category routing rule${assignedCategories.size !== 1 ? "s" : ""} applied.`
                  : "No auto-routing rules applied."}
              </p>
              {customCategories.length > 0 && (
                <p className="text-[12px] text-faint">
                  {customCategories.length} custom type
                  {customCategories.length !== 1 ? "s" : ""} added — not routed
                  until added to the classifier.
                </p>
              )}
            </div>
            <Button onClick={onClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar p-5 pb-safe">
              {/* Team info */}
              <section className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                  Team Information
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-subtle">
                      Team name
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Environmental Services"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-lg border border-hairline bg-overlay px-3 py-2 text-sm text-foreground placeholder:text-faint outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[12px] font-medium text-subtle">
                      Short label
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="Env. Services"
                      value={shortLabel}
                      onChange={(e) => setShortLabel(e.target.value)}
                      className="rounded-lg border border-hairline bg-overlay px-3 py-2 text-sm text-foreground placeholder:text-faint outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                    />
                  </label>
                </div>

                {/* Color */}
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-medium text-subtle">
                    Team color
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                          color === c
                            ? "border-hairline-strong"
                            : "border-transparent",
                        )}
                        style={{ background: c }}
                        aria-label={c}
                      />
                    ))}
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                        title="Custom color"
                      />
                      <span className="text-[11px] text-faint">Custom</span>
                    </label>
                  </div>
                </div>

                {/* Icon */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-medium text-subtle">
                      Icon
                    </span>
                    {iconsExpanded && (
                      <button
                        type="button"
                        onClick={() => {
                          setIconsExpanded(false);
                          setIconSearch("");
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-faint transition-colors hover:text-subtle"
                      >
                        <ChevronUp className="h-3 w-3" strokeWidth={2} />
                        Show less
                      </button>
                    )}
                  </div>

                  {iconsExpanded && (
                    <div className="relative">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint"
                        strokeWidth={1.75}
                      />
                      <input
                        type="text"
                        placeholder="Search icons…"
                        value={iconSearch}
                        onChange={(e) => setIconSearch(e.target.value)}
                        className="w-full rounded-lg border border-hairline bg-overlay py-1.5 pl-8 pr-3 text-[13px] text-foreground placeholder:text-faint outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                      />
                    </div>
                  )}

                  <div
                    className={cn(
                      "flex flex-wrap gap-2",
                      iconsExpanded &&
                        "max-h-44 overflow-y-auto custom-scrollbar pr-1",
                    )}
                  >
                    {visibleIcons.map(({ key, Icon, label }) => (
                      <button
                        key={key}
                        type="button"
                        title={label}
                        onClick={() => setSelectedIcon(key)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg border transition-all",
                          selectedIcon === key
                            ? "border-transparent text-white"
                            : "border-hairline bg-overlay text-faint hover:border-hairline-strong hover:text-foreground",
                        )}
                        style={
                          selectedIcon === key
                            ? { background: color }
                            : undefined
                        }
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    ))}

                    {!iconsExpanded && (
                      <button
                        type="button"
                        onClick={() => setIconsExpanded(true)}
                        className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-hairline-strong px-3 text-[12px] font-medium text-subtle transition-colors hover:border-hairline-strong hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                        More
                      </button>
                    )}

                    {iconsExpanded && visibleIcons.length === 0 && (
                      <p className="px-1 py-2 text-[12px] text-faint">
                        No icons match “{iconSearch.trim()}”.
                      </p>
                    )}
                  </div>
                </div>

                {/* Duties */}
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12px] font-medium text-subtle">
                    Duties &amp; responsibilities
                  </span>
                  <textarea
                    rows={3}
                    placeholder="Describe what this team handles — shown on hover in the dashboard."
                    value={duties}
                    onChange={(e) => setDuties(e.target.value)}
                    className="resize-none rounded-lg border border-hairline bg-overlay px-3 py-2 text-sm text-foreground placeholder:text-faint outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                  />
                </label>
              </section>

              {/* Auto-routing */}
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                    Auto-Routing Rules
                  </h3>
                  {totalSelected > 0 && (
                    <span className="text-[12px] font-medium text-[var(--color-primary)]">
                      {totalSelected} selected
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-faint">
                  Incoming reports matching the selected categories are
                  automatically routed to this team.
                </p>

                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {ALL_CATEGORIES.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const checked = assignedCategories.has(cat);
                    const currentOwner = REAL_TEAMS.find((t) =>
                      t.categories.includes(cat),
                    );
                    return (
                      <li key={cat}>
                        <button
                          type="button"
                          onClick={() => toggleCategory(cat)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                            checked ? "bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]" : "hover:bg-overlay",
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                              checked
                                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--accent-contrast)]"
                                : "border-hairline-strong bg-transparent",
                            )}
                          >
                            {checked && (
                              <Check className="h-3 w-3" strokeWidth={2.5} />
                            )}
                          </span>
                          <span
                            className="h-2 w-2 flex-shrink-0 rounded-full bg-faint"
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-medium text-foreground">
                              {meta.label}
                            </span>
                            {currentOwner && (
                              <span className="block truncate text-[11px] text-faint">
                                Currently → {currentOwner.shortLabel}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}

                  {customCategories.map((c) => {
                    const checked = selectedCustom.has(c.id);
                    return (
                      <li key={c.id}>
                        <div
                          className={cn(
                            "flex w-full items-center gap-1 rounded-lg pr-1.5 transition-colors",
                            checked ? "bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]" : "hover:bg-overlay",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleCustomCategory(c.id)}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left"
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                                checked
                                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--accent-contrast)]"
                                  : "border-hairline-strong bg-transparent",
                              )}
                            >
                              {checked && (
                                <Check className="h-3 w-3" strokeWidth={2.5} />
                              )}
                            </span>
                            <span
                              className="h-2 w-2 flex-shrink-0 rounded-full bg-faint"
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium text-foreground">
                                {c.label}
                              </span>
                              <span className="block truncate text-[11px] text-faint">
                                Custom type
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCustomCategory(c.id)}
                            aria-label={`Remove ${c.label}`}
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-overlay-strong hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Add a custom report type. Lives in local state only — see
                    the note on handleSubmit for why it can't route for real. */}
                {addingCategory ? (
                  <div className="space-y-2.5 rounded-lg border border-hairline bg-overlay p-3">
                    <input
                      type="text"
                      // biome-ignore lint/a11y/noAutofocus: intentional focus when the add-category input is revealed by an explicit user action (clicking "add report type"), not on page load
                      autoFocus
                      placeholder="New report type — e.g. Broken Bench"
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onKeyDown={(e) => {
                        // Inside the <form>, Enter would submit (Create Team).
                        // Intercept it to add the row instead.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomCategory();
                        }
                      }}
                      className="w-full rounded-lg border border-hairline bg-overlay px-3 py-2 text-sm text-foreground placeholder:text-faint outline-none focus:border-[color-mix(in_srgb,var(--color-primary)_60%,transparent)] focus:ring-1 focus:ring-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {COLOR_PRESETS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setDraftColor(c)}
                          className={cn(
                            "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                            draftColor === c
                              ? "border-hairline-strong"
                              : "border-transparent",
                          )}
                          style={{ background: c }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAddingCategory(false);
                          setDraftLabel("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={addCustomCategory}
                        disabled={!draftLabel.trim()}
                      >
                        Add type
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftColor(
                        COLOR_PRESETS[
                          customCategories.length % COLOR_PRESETS.length
                        ],
                      );
                      setAddingCategory(true);
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline-strong px-3 py-2.5 text-[13px] font-medium text-subtle transition-colors hover:border-hairline-strong hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2} />
                    Add category
                  </button>
                )}
              </section>
            </div>

            {/* Footer actions */}
            <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-hairline px-5 py-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!isValid}>
                Create Team
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
