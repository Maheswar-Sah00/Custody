"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { UserRole } from "@/core/db/schema"

/**
 * The single shared navigation for the whole app. Feature engineers add their
 * screens as pages under the matching route folder — they never edit this file.
 * To add a nav entry, append to NAV_ITEMS below.
 */
interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Roles allowed to see this item; omit for "everyone". */
  roles?: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Organization setup",
    href: "/org",
    icon: Building2,
    roles: ["admin"],
  },
  { label: "Assets", href: "/assets", icon: Boxes },
  { label: "Allocation & Transfer", href: "/allocation", icon: ArrowLeftRight },
  { label: "Resource Booking", href: "/booking", icon: CalendarDays },
  { label: "Maintenance", href: "/maintenance", icon: Wrench },
  // Audit is also shown to any user assigned as an auditor on a cycle — see
  // the isAuditor escape hatch in the filter below.
  {
    label: "Audit",
    href: "/audit",
    icon: ClipboardCheck,
    roles: ["admin", "asset_manager"],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    roles: ["admin", "asset_manager", "dept_head"],
  },
  { label: "Notifications", href: "/notifications", icon: Bell },
]

export interface SidebarUser {
  name: string
  role: UserRole
}

/** Humanize a role enum value, e.g. "asset_manager" → "Asset Manager". */
function formatRole(role: UserRole): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function Sidebar({
  user,
  isAuditor = false,
}: {
  user: SidebarUser
  /** True when this user is assigned as an auditor on at least one cycle. */
  isAuditor?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

  // Defensive: if the session role is missing, treat as least-privileged.
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles || (user.role && item.roles.includes(user.role))) {
      return true
    }
    // Audit is role-gated but also open to assigned auditors of any role.
    return item.href === "/audit" && isAuditor
  })

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`)

  const signOut = async () => {
    setSigningOut(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch {
      // Ignore network errors — clearing the cookie server-side is best effort;
      // we still send the user back to the login screen.
    }
    router.push("/login")
    router.refresh()
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-sidebar">
      {/* Wordmark */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          AF
        </span>
        <span className="text-lg font-semibold tracking-tight text-foreground">
          AssetFlow
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {visibleItems.map((item) => {
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Account / sign out */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {user.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatRole(user.role)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50 [&_svg]:size-4"
        >
          <LogOut />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </aside>
  )
}
