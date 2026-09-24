import React from "react";
import { useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Video,
  FileQuestion,
  FileText,
  BarChart3,
  LogOut,
  FolderOpen,
  Radio,
  ShieldCheck,
  RefreshCw,
  User,
  MessageSquare,
  Bell,
  CheckCircle2,
  Award,
} from "lucide-react";

import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useInstructorStats } from "@/hooks/useInstructorData";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  isLive?: boolean;
  showBadge?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Operations Hub",
    items: [
      { title: "Dashboard", url: "/instructor", icon: LayoutDashboard },
      { title: "My Profile", url: "/instructor/profile", icon: User },
      { title: "My Course", url: "/instructor/my-courses", icon: BookOpen },
    ],
  },
  {
    label: "Student Hub",
    items: [
      { title: "Student Roaster", url: "/instructor/students", icon: Users, isLive: true, showBadge: true },
      { title: "Messages", url: "/instructor/chat", icon: MessageSquare },
      { title: "Live Board cast", url: "/instructor/live-classes", icon: Radio, isLive: true },
      { title: "Notifications", url: "/instructor/notifications", icon: Bell },
    ],
  },
  {
    label: "Curriculum Management",
    items: [
      { title: "Video Library", url: "/instructor/videos", icon: Video },
      { title: "Course resources", url: "/instructor/resources", icon: FolderOpen },
    ],
  },
  {
    label: "Test Conduct",
    items: [
      { title: "AssesMent Portal", url: "/instructor/exams", icon: ShieldCheck },
      { title: "Queation Bank", url: "/instructor/question-bank", icon: FileQuestion },
      { title: "Queation Access", url: "/instructor/question-access", icon: CheckCircle2 },
      { title: "Manual Grading", url: "/instructor/grading", icon: BarChart3 },
      { title: "Student Results", url: "/instructor/results", icon: Award },
      { title: "Course Resourses", url: "/instructor/test-resources", icon: FolderOpen },
    ],
  },
  {
    label: "ATS",
    items: [
      { title: "Resume Scan Logs", url: "/instructor/resume-scans", icon: FileText },
    ],
  },
];

export function InstructorSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const { data: stats } = useInstructorStats();

  const isActive = (path: string) => {
    if (path === "/instructor") {
      return (
        location.pathname === "/instructor" ||
        location.pathname === "/instructor/"
      );
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-slate-200/60 !bg-white font-sans shadow-sm"
    >
      <SidebarHeader className="h-20 flex items-center justify-center px-4 group-data-[collapsible=icon]:px-0 border-b border-slate-200/60">
        <Link
          to="/instructor"
          className="flex flex-col gap-1 items-center active:scale-95 transition-transform"
        >
          <img
            src={logo}
            alt="AOTMS Logo"
            className="h-11 w-auto object-contain group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:h-8"
          />
          {!collapsed && (
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Instructor Panel
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 group-data-[collapsible=icon]:px-2 py-4 space-y-6 scrollbar-hide">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label} className="p-0">
            {!collapsed && (
              <div className="px-3 mb-2">
                <SidebarGroupLabel className="text-[11px] uppercase font-medium tracking-wider text-slate-400 p-0 h-auto">
                  {group.label}
                </SidebarGroupLabel>
              </div>
            )}
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {group.items.map((item, idx) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={`${item.title}-${idx}`}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className={cn(
                          "h-10 px-3 rounded-lg transition-colors group relative overflow-hidden",
                          active
                            ? "bg-blue-600 text-white font-medium shadow-sm shadow-blue-600/20"
                            : "hover:bg-slate-100 text-slate-600 hover:text-slate-900 font-normal"
                        )}
                      >
                        <Link to={item.url} className="flex items-center gap-3 w-full">
                          <div className="relative z-10 flex items-center justify-center shrink-0">
                            <item.icon
                              className={cn(
                                "h-4 w-4 transition-colors",
                                active ? "text-white" : "text-slate-400 group-hover:text-slate-700"
                              )}
                            />
                            {item.isLive && (
                              <span
                                className={cn(
                                  "absolute -top-1 -right-1 h-2 w-2 rounded-full border-2 animate-pulse",
                                  active ? "bg-white border-blue-600" : "bg-emerald-500 border-white"
                                )}
                              />
                            )}
                          </div>

                          {!collapsed && (
                            <motion.div
                              className="flex items-center justify-between flex-1 z-10 min-w-0"
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                            >
                              <span
                                className={cn(
                                  "text-[13px] tracking-normal truncate transition-colors",
                                  active
                                    ? "text-white font-medium"
                                    : "text-slate-600 group-hover:text-slate-900 font-normal"
                                )}
                              >
                                {item.title}
                              </span>
                              {item.showBadge && stats?.totalStudents !== undefined && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "h-5 px-1.5 text-[10px] font-medium border-none transition-colors",
                                    active
                                      ? "bg-white/20 text-white"
                                      : "bg-slate-100 text-slate-600"
                                  )}
                                >
                                  {stats.totalStudents}
                                </Badge>
                              )}
                            </motion.div>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 group-data-[collapsible=icon]:p-2 border-t border-slate-100 bg-slate-50/50">
        <div className="space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start group-data-[collapsible=icon]:justify-center gap-3 h-9 px-3 group-data-[collapsible=icon]:px-0 rounded-lg text-slate-600 hover:bg-slate-100 font-normal transition-all"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 shrink-0 text-slate-500" />
            {!collapsed && <span className="text-[13px]">Refresh Data</span>}
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start group-data-[collapsible=icon]:justify-center gap-3 h-9 px-3 group-data-[collapsible=icon]:px-0 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-normal transition-all"
            onClick={signOut}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="text-[13px]">Sign Out</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
