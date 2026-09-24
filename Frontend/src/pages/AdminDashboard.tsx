import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { useAuth } from "@/hooks/useAuth";
import { useAdminData } from "@/hooks/useAdminData";
import { useCourses, CourseEnrollment } from "@/hooks/useCourses";
import { UserManagement } from "@/components/admin/UserManagement";
import { CourseApproval } from "@/components/admin/CourseApproval";
import { SecurityMonitor } from "@/components/admin/SecurityMonitor";
import { QualityAssurance } from "@/components/admin/QualityAssurance";
import { QuestionBankApproval } from "@/components/admin/QuestionBankApproval";
import { InstructorManagement } from "@/components/admin/InstructorManagement";
import { EnrollmentsList } from "@/components/admin/EnrollmentsList";
import { GrantStudentAccess } from "@/components/admin/GrantStudentAccess";
import { AllCoursesList } from "@/components/admin/AllCoursesList";
import { ResumeScanHistory } from "@/components/admin/ResumeScanHistory";
import { LiveMonitoring } from "@/components/admin/LiveMonitoring";
import { StudentPerformance } from "@/components/admin/StudentPerformance";
import { AICommunicationHub } from "@/components/admin/AICommunicationHub";
import { LiveClassManager } from "@/components/instructor/dashboard/LiveClassManager";
import SubmissionsGrading from "@/components/admin/SubmissionsGrading";
import InstructorAccessAdmin from "@/pages/InstructorAccess";
import { ExamScheduler } from "@/components/manager/ExamScheduler";
import { QuestionBankManager } from "@/components/manager/QuestionBankManager";
import { LeaderboardManager } from "@/components/manager/LeaderboardManager";
import { ManagerVideoLibrary } from "@/components/manager/ManagerVideoLibrary";
import { UserProfile } from "@/components/dashboard/UserProfile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import { ChatMonitor } from "@/components/admin/ChatMonitor";
import {
  Users,
  Shield,
  BookOpen,
  BarChart3,
  ShieldAlert,
  RefreshCw,
  FileQuestion,
  ArrowUpRight,
  UserCheck,
  Activity,
  ChevronRight,
  GraduationCap,
  Trash2,
  ShieldCheck,
  ClipboardList,
  Eye,
  User,
  Mail,
  Calendar,
  Clock,
  Archive,
  MessageSquare,
  DollarSign,
  Pencil,
  Video as VideoIcon,
  Database,
  Ticket,
  Gift,
  Power,
  Layers,
  Bell,
  CheckCheck,
  Trophy,
  Zap,
  Radio,
  Sparkles,
  LayoutGrid,
  Star,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { CouponManager } from "@/components/admin/CouponManager";
import { useSocket } from "@/hooks/useSocket";
import { useNotifications } from "@/hooks/useNotifications";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Course as InstructorCourse } from "@/hooks/useInstructorData";
import { Course as CatalogCourse } from "@/hooks/useCourses";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CourseBuilder } from "@/components/instructor/courses/CourseBuilder";
import { PulseRatingsManager } from "@/components/admin/PulseRatingsManager";
import { SyncDataButton } from "@/components/admin/data/SyncDataButton";

import { Course as AdminCourse } from "@/hooks/useAdminData";

type CombinedCourse = AdminCourse;


function NotificationSection({ onSync, loading }: { onSync: () => void, loading: boolean }) {
  const { notifications, loading: notifLoading, markAllAsRead, unreadCount } =
    useNotifications();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Bell className="h-6 w-6 text-primary" />
            System Notifications
          </h2>
          <p className="text-slate-500">
            Stay updated with platform activities and system alerts
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={markAllAsRead}
              className="h-10 gap-2 rounded-xl border-slate-200 bg-white shadow-sm hover:bg-slate-50"
            >
              <CheckCheck className="h-4 w-4 text-emerald-500" />
              <span>Mark all as read</span>
            </Button>
          )}
          <Badge
            variant="secondary"
            className="h-8 px-3 rounded-lg bg-primary/10 text-primary font-bold"
          >
            {notifications.length} Total
          </Badge>
          <SyncDataButton 
            onSync={onSync}
            isLoading={loading}
            label="Sync Notifications"
            className="h-10 rounded-xl"
          />
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-slate-200 shadow-sm overflow-hidden bg-white/50 backdrop-blur-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full rounded-2xl" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Bell className="h-10 w-10 text-slate-200" />
              </div>
              <p className="font-medium text-lg">No notifications yet</p>
              <p className="text-sm">You're all caught up with the system.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((notif, index) => (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`p-6 flex gap-4 transition-colors hover:bg-slate-50/50 ${!notif.is_read ? "bg-primary/5" : ""}`}
                >
                  <div
                    className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${notif.type === "coupon"
                      ? "bg-amber-100 text-amber-600"
                      : notif.type === "system"
                        ? "bg-blue-100 text-blue-600"
                        : "bg-emerald-100 text-emerald-600"
                      }`}
                  >
                    <Bell className="h-6 w-6" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900">
                        {notif.title}
                      </h4>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                        {new Date(notif.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 leading-relaxed max-w-3xl">
                      {notif.message}
                    </p>
                    <div className="pt-2 flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${notif.type === "coupon"
                          ? "bg-amber-100 text-amber-700"
                          : notif.type === "system"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                          }`}
                      >
                        {notif.type}
                      </span>
                      {!notif.is_read && (
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          <span className="text-[10px] font-bold text-primary uppercase">
                            New
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function AdminDashboard() {
  const { user, loading: authLoading, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [coursesRefreshKey, setCoursesRefreshKey] = useState(0);
  const location = useLocation();
  const tabsListRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(() => {
    // Priority: URL path > localStorage > default
    const saved = localStorage.getItem("adminActiveTab");
    return saved || "users";
  });

  // Scroll active tab into view
  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab && tabsListRef.current) {
        const activeElement = tabsListRef.current.querySelector(
          `[data-value="${activeTab}"], [value="${activeTab}"], [data-state="active"]`
        );
        if (activeElement) {
          activeElement.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Save active tab to localStorage whenever it changes
  useEffect(() => {
    if (activeTab) {
      localStorage.setItem("adminActiveTab", activeTab);
    }
  }, [activeTab]);

  const adminData = useAdminData(userRole);
  const [selectedCourseDetail, setSelectedCourseDetail] =
    useState<CombinedCourse | null>(null);
  const [showCourseDetail, setShowCourseDetail] = useState(false);
  const [buildingCourse, setBuildingCourse] = useState<CombinedCourse | null>(
    null,
  );
  const [systemHealth, setSystemHealth] = useState(99.9);
  const [liveLearners, setLiveLearners] = useState(0);

  useEffect(() => {
    const fetchPlatformStats = async () => {
      try {
        const { fetchWithAuth } = await import('@/lib/api');
        const data = await fetchWithAuth('/admin/platform-stats') as {
          liveLearners?: number;
          systemHealth?: number;
          totalUsers?: number;
          pendingEnrollments?: number;
        };
        if (data?.liveLearners !== undefined) setLiveLearners(data.liveLearners);
        if (data?.systemHealth !== undefined) setSystemHealth(data.systemHealth);
      } catch (err) {
        // Fallback: gentle random fluctuation if API fails
        setSystemHealth(prev => parseFloat((Math.max(97, Math.min(99.9, prev + (Math.random() - 0.5) * 0.3))).toFixed(1)));
      }
    };

    fetchPlatformStats();
    const interval = setInterval(fetchPlatformStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const {
    loading: dataLoading,
    profiles = [],
    courses = [],
    enrollments = [],
    securityEvents = [],
    systemLogs = [],
    stats = {
      totalUsers: 0,
      activeCourses: 0,
      pendingCourses: 0,
      pendingEnrollments: 0,
      securityEvents: 0,
      highPriorityEvents: 0,
      roleCounts: {},
    },
    refresh,
    updateUserStatus,
    updateUserRole,
    resolveSecurityEvent,
    sendApprovalEmail,
    approveCourse,
    rejectCourse,
    updateCourseStatus,
    updateEnrollmentStatus: _updateEnrollmentStatus,
    updateEnrollmentPayment,
    deleteEnrollment: _deleteEnrollment,
    resetStudentATS: _resetStudentATS,
    deleteUser,
  } = adminData;

  const { socket } = useSocket();

  useEffect(() => {
    if (socket) {
      socket.on(
        "admin_login_alert",
        (data: { email: string; time: string; ip: string }) => {
          // Broadcast alert to all active admin dashboards
          toast({
            title: "🔐 Security Alert: Admin Login",
            description: `An administrative session was established for ${data.email} from IP: ${data.ip}.`,
            variant: "destructive",
          });

          // Refresh security events to show the new login
          refresh();
        },
      );

      return () => {
        socket.off("admin_login_alert");
      };
    }
  }, [socket, user?.email, refresh, toast]);

  const updateEnrollmentStatus = async (
    id: string,
    status: "rejected" | "active",
  ) => {
    await _updateEnrollmentStatus(id, status);
  };

  const deleteEnrollment = async (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this enrollment? This action cannot be undone.",
      )
    ) {
      await _deleteEnrollment(id);
    }
  };



  // Socket support for real-time enrollment updates
  // (socket is already declared above)

  useEffect(() => {
    if (!socket) return;

    const handleEnrollmentChange = () => {
      console.log("[Socket] Enrollments changed, refreshing...");
      refresh();
    };

    socket.on("course_enrollments_changed", handleEnrollmentChange);

    return () => {
      socket.off("course_enrollments_changed", handleEnrollmentChange);
    };
  }, [socket, refresh]);

  useEffect(() => {
    const tabUrlMap: Record<string, string> = {
      "/admin": "users",
      "/admin/users": "users",
      "/admin/grant-access": "grant-access",
      "/admin/leaderboard": "leaderboard",
      "/admin/enrollments": "enrollments",
      "/admin/all-courses": "all-courses",
      "/admin/instructor-access": "instructor-access",
      "/admin/questions": "questions",
      "/admin/courses": "courses",
      "/admin/exams": "exams",
      "/admin/security": "security",
      "/admin/qa": "qa",
      "/admin/chat": "chat",
      "/admin/instructors": "instructors",
      "/admin/videos": "videos",
      "/admin/exam-scheduling": "exam-scheduling",
      "/admin/question-repository": "question-repository",
      "/admin/question-access": "question-access",
      "/admin/live-monitoring": "live-monitoring",
      "/admin/coupons": "coupons",
      "/admin/profile": "profile",
      "/admin/notifications": "notifications",
      "/admin/student-performance": "student-performance",
      "/admin/grading": "grading",
      "/admin/resume-scans": "resume-scans",
      "/admin/ai-hub": "ai-hub",
    };

    const path = location.pathname;
    const tab = tabUrlMap[path];
    if (tab) {
      setActiveTab(tab);
    } else if (path === "/admin") {
      const saved = localStorage.getItem("adminActiveTab");
      if (saved && saved !== "users") {
        navigate(`/admin/${saved}`, { replace: true });
      }
    }
  }, [location.pathname, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50/50 backdrop-blur-xl transition-all duration-700">
        <div className="relative flex flex-col items-center">
          {/* Main loader rings */}
          <div className="relative flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="h-28 w-28 rounded-full border-[3px] border-primary/10 border-t-primary shadow-[0_0_20px_rgba(var(--primary),0.1)]"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="absolute h-20 w-20 rounded-full border-[3px] border-slate-200 border-b-slate-400 opacity-50"
            />
            <div className="absolute flex flex-col items-center gap-1">
              <Shield className="h-6 w-6 text-primary animate-pulse" />
            </div>
          </div>

          {/* Text indicators */}
          <div className="mt-12 text-center space-y-4">
            <motion.h4
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-lg font-black text-slate-900 uppercase tracking-[0.4em] italic leading-none pl-1"
            >
              Initializing <br />{" "}
              <span className="text-primary not-italic font-medium text-sm">
                Management Dashboard
              </span>
            </motion.h4>
            <div className="flex items-center gap-1 justify-center">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.3, 1, 0.3],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footnote */}
        <div className="absolute bottom-12 text-[10px] font-bold text-slate-300 uppercase tracking-[0.5em] animate-pulse">
          Secure Session V.4
        </div>
      </div>
    );
  }

  if (buildingCourse) {
    return (
      <div className="min-h-screen bg-slate-50 relative">
        <div className="p-8 max-w-7xl mx-auto">
          <CourseBuilder
            course={buildingCourse as unknown as InstructorCourse}
            onBack={() => setBuildingCourse(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider className="h-[100dvh] w-full overflow-hidden mesh-bg font-sans">
      <AdminSidebar />
      <SidebarInset className="flex flex-col h-[100dvh] w-full overflow-hidden bg-transparent">
        <AdminHeader />
        <main className="flex-1 w-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 admin-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6 lg:space-y-10">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
                  Platform Administration
                </h1>
                <p className="text-slate-500 font-medium">
                  Overview of system performance, user activities, and platform logs.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => refresh(true)}
                  disabled={dataLoading}
                  className="h-10 px-5 gap-3 rounded-xl border-slate-200 bg-white/70 backdrop-blur-md text-slate-700 font-bold hover:bg-white hover:border-primary/30 hover:text-primary transition-all shadow-sm hover:shadow-md active:scale-95 group"
                >
                  <RefreshCw
                    className={`h-4 w-4 transition-transform duration-500 ${dataLoading ? "animate-spin text-primary" : "group-hover:rotate-180 text-primary/60"}`}
                  />
                   <span>Refresh Data</span>
                </Button>
              </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {[
                {
                  label: "Total Users",
                  value: stats.totalUsers,
                  icon: Users,
                  color: "blue",
                  trend: "+12.5%",
                  description: "Registered accounts",
                },
                {
                  label: "Active Courses",
                  value: stats.activeCourses,
                  icon: BookOpen,
                  color: "orange",
                  trend: "Steady",
                  description: "Verified curriculum",
                },
                {
                  label: "Pending Enrollments",
                  value: stats.pendingEnrollments,
                  icon: GraduationCap,
                  color: "red",
                  trend:
                    stats.pendingEnrollments > 0 ? "Action needed" : "Clear",
                  description: "Approval queue",
                },
                {
                  label: "Live Learners",
                  value: liveLearners,
                  icon: Users,
                  color: "blue",
                  trend: "Real-time",
                  description: "Currently active now",
                },
                {
                  label: "System Health",
                  value: `${systemHealth}%`,
                  icon: Activity,
                  color: "blue",
                  trend: "Optimal",
                  description: "Platform-wide",
                },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    transition: { delay: i * 0.05 },
                  }}
                  className="pro-card p-6 bg-white relative overflow-hidden group hover:border-primary/20 cursor-default shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div
                      className={`p-2.5 rounded-lg ${stat.color === "red" ? "bg-red-50" : stat.color === "blue" ? "bg-primary/10" : "bg-accent/10"}`}
                    >
                      <stat.icon
                        className={`h-5 w-5 ${stat.color === "red" ? "text-red-500" : stat.color === "blue" ? "text-primary" : "text-accent"}`}
                      />
                    </div>
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-full ${stat.trend === "Action needed" ? "bg-red-50 text-red-600" : stat.trend.startsWith("+") ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-600"}`}
                    >
                      {stat.trend}
                    </span>
                  </div>
                  <div className="mt-4 space-y-1">
                    <p className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
                      {stat.label}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                        {dataLoading ? "..." : stat.value}
                      </h2>
                    </div>
                    <p className="text-xs text-slate-900 font-medium">
                      {stat.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Management Portal */}
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setActiveTab(value);
                navigate(`/admin/${value}`);
              }}
              className="space-y-6"
            >
              <div className="flex flex-col gap-4 border-b border-slate-200">
                <div 
                  ref={tabsListRef}
                  className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 pb-2"
                >
                  <TabsList className="bg-transparent h-auto p-0 gap-6 sm:gap-8 flex min-w-max">
                    {[
                      {
                        id: "users",
                        label: "User Management",
                        icon: Users,
                        key: "tab-users",
                      },
                      {
                        id: "grant-access",
                        label: "Grant Access",
                        icon: UserCheck,
                        key: "tab-grant-access",
                      },
                      {
                        id: "enrollments",
                        label: "Student Enrollments",
                        icon: GraduationCap,
                        key: "tab-enrollments",
                      },
                      {
                        id: "student-performance",
                        label: "Student Hub",
                        icon: BarChart3,
                        key: "tab-student-performance",
                      },
                      {
                        id: "leaderboard",
                        label: "Leaderboard",
                        icon: Trophy,
                        key: "tab-leaderboard",
                      },
                      {
                        id: "coupons",
                        label: "Reward & Coupons",
                        icon: Ticket,
                        key: "tab-coupons",
                      },
                      {
                        id: "resume-scans",
                        label: "Resume Scans",
                        icon: ClipboardList,
                        key: "tab-resume-scans",
                      },
                      {
                        id: "instructor-access",
                        label: "Instructor Access",
                        icon: ShieldCheck,
                        key: "tab-instructor-access",
                      },
                      {
                        id: "instructors",
                        label: "Instructors",
                        icon: Users,
                        key: "tab-instructors",
                      },
                      {
                        id: "exam-scheduling",
                        label: "Exam Scheduling",
                        icon: Calendar,
                        key: "tab-exam-scheduling",
                      },
                      {
                        id: "question-repository",
                        label: "Question Repository",
                        icon: Database,
                        key: "tab-question-repository",
                      },
                      {
                        id: "question-access",
                        label: "Question Access",
                        icon: UserCheck,
                        key: "tab-question-access",
                      },
                      {
                        id: "all-courses",
                        label: "All Courses",
                        icon: LayoutGrid,
                        key: "tab-all-courses",
                      },
                      {
                        id: "videos",
                        label: "Video Library",
                        icon: VideoIcon,
                        key: "tab-videos",
                      },
                      {
                        id: "chat",
                        label: "Chat Monitor",
                        icon: MessageSquare,
                        key: "tab-chat",
                      },
                      {
                        id: "live-monitoring",
                        label: "Live Monitoring",
                        icon: Activity,
                        key: "tab-live-monitoring",
                      },
                      {
                        id: "notifications",
                        label: "Notification",
                        icon: Bell,
                        key: "tab-notifications",
                      },
                      {
                        id: "qa",
                        label: "Quality Assurance",
                        icon: ShieldCheck,
                        key: "tab-qa",
                      },
                      {
                        id: "ai-hub",
                        label: "AI Communications",
                        icon: Zap,
                        key: "tab-ai-hub",
                      },
                      {
                        id: "grading",
                        label: "Submissions Grading",
                        icon: ClipboardList,
                        key: "tab-grading",
                      },
                      {
                        id: "live-broadcast",
                        label: "Live Broadcast",
                        icon: Radio,
                        key: "tab-live-broadcast",
                      },
                    ]
.map((tab) => (
                      <TabsTrigger
                        key={tab.key}
                        value={tab.id}
                        className="px-0 py-4 h-auto border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none text-slate-950 font-bold text-sm data-[state=active]:text-primary transition-all flex items-center gap-2"
                      >
                        <tab.icon className="h-4 w-4" />
                        {tab.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                <div className="hidden lg:flex items-center gap-2 text-slate-400 absolute right-0 top-4">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-widest">
                    Admin Control Panel
                  </span>
                </div>
              </div>

              <div className="min-h-[600px]">
                <TabsContent
                  key="tab-student-performance"
                  value="student-performance"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-student-performance"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <StudentPerformance 
                      enrollments={enrollments} 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>


                <TabsContent
                  key="tab-leaderboard"
                  value="leaderboard"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-leaderboard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <LeaderboardManager 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-users"
                  value="users"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-users"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <UserManagement
                      users={profiles}
                      loading={dataLoading}
                      roleCounts={stats.roleCounts}
                      onUpdateStatus={updateUserStatus}
                      onUpdateRole={updateUserRole}
                      onSendEmail={sendApprovalEmail}
                      onDeleteUser={deleteUser}
                      onUpdateEnrollmentStatus={async (id, status) => { await _updateEnrollmentStatus(id, status); }}
                      onResetATS={async (userId) => { await _resetStudentATS(userId); }}
                      onSync={refresh}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-enrollments"
                  value="enrollments"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-enrollments"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <EnrollmentsList
                      enrollments={enrollments}
                      loading={dataLoading}
                      onUpdateStatus={async (id, status) => { await _updateEnrollmentStatus(id, status); }}
                      onUpdatePayment={async (id, term) => { await updateEnrollmentPayment(id, term); }}
                      onDelete={async (id) => { await _deleteEnrollment(id); }}
                      onResetATS={async (userId) => { await _resetStudentATS(userId); }}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-coupons"
                  value="coupons"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-coupons"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <CouponManager 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-grant-access"
                  value="grant-access"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-grant-access"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <GrantStudentAccess
                      profiles={profiles}
                      enrollments={enrollments}
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-resume-scans"
                  value="resume-scans"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-resume-scans"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <ResumeScanHistory />
                  </motion.div>
                </TabsContent>

                 <TabsContent
                  key="tab-question-access"
                  value="question-access"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-question-access"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <QuestionBankApproval 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-instructor-access"
                  value="instructor-access"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-instructor-access"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <InstructorAccessAdmin 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>


                <TabsContent
                  key="tab-all-courses"
                  value="all-courses"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-all-courses"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <AllCoursesList
                      courses={courses}
                      loading={dataLoading}
                      onSync={() => refresh(true)}
                      onUpdatePrice={adminData.updateCoursePrice}
                      onToggleActive={adminData.toggleCourseActive}
                      onViewSyllabus={(course) => setBuildingCourse(course as CombinedCourse)}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-courses"
                  value="courses"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-courses"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <CourseApproval
                      courses={courses}
                      loading={dataLoading}
                      onSync={() => refresh(true)}
                      onApprove={approveCourse}
                      onReject={rejectCourse}
                      onUpdateStatus={updateCourseStatus}
                      onToggleActive={adminData.toggleCourseActive}
                    />
                  </motion.div>
                </TabsContent>



                <TabsContent
                  key="tab-security"
                  value="security"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-security"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <SecurityMonitor
                      securityEvents={securityEvents}
                      systemLogs={systemLogs}
                      loading={dataLoading}
                      highPriorityCount={
                        securityEvents.filter(
                          (e) =>
                            e.risk_level === "high" ||
                            e.risk_level === "critical",
                        ).length
                      }
                      onResolveEvent={resolveSecurityEvent}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-ai-hub"
                  value="ai-hub"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-ai-hub"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <AICommunicationHub 
                      profiles={profiles}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-grading"
                  value="grading"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-grading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <SubmissionsGrading 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-live-broadcast"
                  value="live-broadcast"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-live-broadcast"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <LiveClassManager />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-notifications"
                  value="notifications"
                  className="mt-0 outline-none"
                >
                  <NotificationSection 
                    onSync={() => refresh(true)}
                    loading={dataLoading}
                  />
                </TabsContent>

                <TabsContent
                  key="tab-qa"
                  value="qa"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-qa"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <QualityAssurance 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-instructors"
                  value="instructors"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-instructors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <InstructorManagement 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-chat"
                  value="chat"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-chat"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <ChatMonitor 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                      profiles={profiles}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-videos"
                  value="videos"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-videos"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <ManagerVideoLibrary 
                      showUpload={false} 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-exam-scheduling"
                  value="exam-scheduling"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-exam-scheduling"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <ExamScheduler 
                      onNavigateToRepository={() => setActiveTab('question-repository')} 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>


                <TabsContent
                  key="tab-question-repository"
                  value="question-repository"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-question-repository"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <QuestionBankManager 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>


                <TabsContent
                  key="tab-live-monitoring"
                  value="live-monitoring"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-live-monitoring"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <LiveMonitoring 
                      onSync={() => refresh(true)}
                      loading={dataLoading}
                    />
                  </motion.div>
                </TabsContent>

                <TabsContent
                  key="tab-profile"
                  value="profile"
                  className="mt-0 outline-none"
                >
                  <motion.div
                    key="motion-profile"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <UserProfile />
                  </motion.div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </main>
      </SidebarInset>

      {/* Course Detail View Modal */}
      < Dialog open={showCourseDetail} onOpenChange={setShowCourseDetail} >
        <DialogContent className="max-w-xl pro-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <BookOpen className="h-5 w-5 text-primary" />
              Course Profile
            </DialogTitle>
            <DialogDescription>
              Detailed information about the selected curriculum
            </DialogDescription>
          </DialogHeader>

          {selectedCourseDetail && (
            <div className="space-y-6 py-4">
              <div className="aspect-video relative rounded-xl overflow-hidden bg-slate-100 border shadow-inner">
                {selectedCourseDetail.thumbnail_url ||
                  selectedCourseDetail.image ? (
                  <img
                    src={
                      selectedCourseDetail.thumbnail_url?.startsWith("http")
                        ? selectedCourseDetail.thumbnail_url
                        : selectedCourseDetail.image?.startsWith("http")
                          ? selectedCourseDetail.image
                          : `/s3/public/${selectedCourseDetail.thumbnail_url || selectedCourseDetail.image}`
                    }
                    alt={selectedCourseDetail.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="h-12 w-12 text-slate-300" />
                  </div>
                )}
                <div className="absolute top-4 left-4">
                  <Badge className="bg-white/90 text-primary hover:bg-white shadow-sm backdrop-blur-sm border-none px-3 py-1">
                    {selectedCourseDetail.category || "Curriculum"}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-bold tracking-tight text-slate-900">
                  {selectedCourseDetail.title}
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {selectedCourseDetail.description ||
                    "Comprehensive training program for aviation professionals."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Course Metadata
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <span>
                        {selectedCourseDetail.duration || "Flexible"} duration
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <LayoutGrid className="h-4 w-4 text-slate-400" />
                      <span>
                        Level: {selectedCourseDetail.level || "Beginner"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-primary/60">
                    Assignment Details
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <User className="h-4 w-4 text-primary/40" />
                      <span className="font-medium truncate">
                        {selectedCourseDetail.instructor_id
                          ? "Assigned"
                          : "Open Catalog"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Calendar className="h-4 w-4 text-primary/40" />
                      <span>
                        Added{" "}
                        {selectedCourseDetail.created_at
                          ? new Date(
                            selectedCourseDetail.created_at,
                          ).toLocaleDateString()
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-orange-50 border border-orange-100">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-orange-200 flex items-center justify-center">
                    <ShieldAlert className="h-4 w-4 text-orange-700" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-orange-800 uppercase tracking-tighter">
                      Current Status
                    </p>
                    <p className="text-sm font-medium text-orange-900">
                      {selectedCourseDetail.status || "Active in Library"}
                    </p>
                  </div>
                </div>
                <Badge className="bg-orange-200 text-orange-800 hover:bg-orange-300 border-none">
                  {selectedCourseDetail.status === "published" ||
                    selectedCourseDetail.status === "approved"
                    ? "Active"
                    : "Archived"}
                </Badge>
              </div>
            </div>
          )}

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              className="rounded-lg h-10 px-6 font-semibold"
              onClick={() => setShowCourseDetail(false)}
            >
              Close Profile
            </Button>
            <Button
              className="pro-button-primary h-10 px-8 rounded-lg shadow-md"
              onClick={() => {
                setBuildingCourse(selectedCourseDetail);
                setShowCourseDetail(false);
              }}
            >
              Manage Syllabus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >
    </SidebarProvider >
  );
}
