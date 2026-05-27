import { Link, useLocation } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  Brain,
  ClipboardCheck,
  FileSearch,
  Inbox,
  KeyRound,
  Layers,
  ListChecks,
  Network,
  ScrollText,
  Search,
  Sparkles,
  Telescope,
  Users,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { cn } from "../lib/cn";
import { Separator } from "./ui/separator";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: IconComponent;
  readonly hint?: string;
}

interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

const NAV: readonly NavGroup[] = [
  {
    label: "Capture",
    items: [
      { to: "/", label: "Capture", icon: Sparkles, hint: "New thought" },
      { to: "/search", label: "Search", icon: Search, hint: "Semantic lookup" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { to: "/thoughts", label: "Thoughts", icon: Brain },
      { to: "/entities", label: "Entities", icon: Boxes },
      { to: "/crm", label: "CRM", icon: Users },
      { to: "/graph", label: "Graph", icon: Network },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/stats", label: "Stats", icon: Activity },
      { to: "/briefings", label: "Briefings", icon: ScrollText },
      { to: "/digests", label: "Digests", icon: Layers },
      { to: "/quality", label: "Quality", icon: ClipboardCheck },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/inspector", label: "Inspector", icon: Telescope },
      { to: "/ingest", label: "Ingest", icon: Inbox },
      { to: "/jobs", label: "Jobs", icon: ListChecks },
      { to: "/audit", label: "Audit", icon: FileSearch },
      { to: "/api-keys", label: "API Keys", icon: KeyRound },
    ],
  },
];

interface AppSidebarProps {
  readonly onNavigate?: () => void;
}

/**
 * Vertical primary nav. Groups by purpose so a 15-route surface stays
 * legible. `onNavigate` lets the mobile drawer close itself on link click.
 */
export function AppSidebar({ onNavigate }: AppSidebarProps) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 px-4">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background"
        >
          <Brain className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-sm">OpenBrains</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Persistent memory
          </span>
        </div>
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-6">
          {NAV.map((group) => (
            <li key={group.label}>
              <p className="px-2 pb-2 font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.to);
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        onClick={onNavigate}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                          active
                            ? "bg-foreground text-background"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            active ? "text-background" : "text-muted-foreground/80",
                          )}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function isActive(pathname: string, to: string): boolean {
  if (to === "/") {
    return pathname === "/";
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}
