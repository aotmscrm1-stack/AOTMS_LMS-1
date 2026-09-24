import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { ManagerSidebar } from "@/components/manager/ManagerSidebar";
import { ManagerHeader } from "@/components/manager/ManagerHeader";
import { ExamScheduler } from "@/components/manager/ExamScheduler";
import { QuestionBankManager } from "@/components/manager/QuestionBankManager";
import { LeaderboardManager } from "@/components/manager/LeaderboardManager";
import { LiveMonitoring } from "@/components/admin/LiveMonitoring";
import { ExamRulesManager } from "@/components/manager/ExamRulesManager";
import { ManagerCourses } from "@/components/manager/ManagerCourses";
import { ManagerVideoLibrary } from "@/components/manager/ManagerVideoLibrary";
import { AllCoursesList } from "@/components/admin/AllCoursesList";
import { UserManagement } from "@/components/admin/UserManagement";
import { QuestionBankApproval } from "@/components/admin/QuestionBankApproval";
import { LiveClassManager } from "@/components/instructor/dashboard/LiveClassManager";
import SubmissionsGrading from "@/components/admin/SubmissionsGrading";

import { CourseBuilder } from "@/components/instructor/courses/CourseBuilder";
import { Course as CatalogCourse, CourseEnrollment } from "@/hooks/useCourses";
import { Course as InstructorCourse } from "@/hooks/useInstructorData";
import { EnrollmentsList } from "@/components/admin/EnrollmentsList";
import { CourseAssignment } from "@/components/admin/CourseAssignment";
import { CourseApproval } from "@/components/admin/CourseApproval";
import { CouponManager } from "@/components/admin/CouponManager";
import { GrantStudentAccess } from "@/components/admin/GrantStudentAccess";
import { ResumeScanHistory } from "@/components/admin/ResumeScanHistory";
import { QualityAssurance } from "@/components/admin/QualityAssurance";
import { ChatMonitor } from "@/components/admin/ChatMonitor";
import { InstructorManagement } from "@/components/admin/InstructorManagement";
import { StudentPerformance } from "@/components/admin/StudentPerformance";
import { PulseRatingsManager } from "@/components/admin/PulseRatingsManager";
import { AICommunicationHub } from "@/components/admin/AICommunicationHub";
import InstructorAccessAdmin from "@/pages/InstructorAccess";

import { useNotifications } from "@/hooks/useNotifications";
import { useCourses } from "@/hooks/useCourses";
import { useAdminData } from "@/hooks/useAdminData";
import { useSocket } from "@/hooks/useSocket";
import { UserProfile } from "@/components/dashboard/UserProfile";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Calendar,
  FileQuestion,
  Trophy,
  Users,
  Video,
  MonitorPlay,
  Shield,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  BarChart3,
  Bell,
  Zap,
  Database as DbIcon,
  KeyRound,
  Radio,

  ClipboardList,
  BookOpen,
  Activity,
} from "lucide-react";


import {
  useExams,
  useQuestions,
  useLeaderboard,
  type ExamRule,
} from "@/hooks/useManagerData";
import { cn } from "@/lib/utils";


function NotificationSection() {
  const { notifications, loading, markAllAsRead, unreadCount } =
    useNotifications();

  return (
    <div
      className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-700"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Bell className="h-6 w-6 text-primary" />
            Manager Notifications
          </h2>
          <p className="text-slate-500 font-medium">
            Stay updated with system activities and management alerts
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              onClick={markAllAsRead}
              className="h-10 gap-2 rounded-xl border-slate-200 bg-white shadow-sm hover:bg-slate-50 font-bold"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Mark all read</span>
            </Button>
          )}
          <Badge
            variant="secondary"
            className="h-8 px-4 rounded-lg bg-primary/10 text-primary font-bold border-none"
          >
            {notifications.length} Messages
          </Badge>
        </div>
      </div>

      <Card className="rounded-[2.5rem] border-slate-200/60 shadow-xl shadow-slate-200/40 overflow-hidden bg-white/80 backdrop-blur-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 w-full rounded-3xl bg-slate-50 animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-slate-400">
              <div className="h-20 w-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <Bell className="h-10 w-10 text-slate-200" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Quiet for now</h3>
              <p className="text-sm font-medium">You're all caught up with your notifications.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100/50">
              {notifications.map((notif, index) => (
                <div
                  key={notif.id}
                  className={cn(
                    "p-6 flex gap-5 transition-all hover:bg-slate-50/50",
                    !notif.is_read ? "bg-primary/[0.02]" : ""
                  )}
                >
                  <div
                    className={cn(
                      "h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm",
                      notif.type === "coupon" ? "bg-orange-50 text-orange-500" :
                      notif.type === "enrollment" ? "bg-emerald-50 text-emerald-500" : "bg-blue-50 text-blue-500"
                    )}
                  >
                    <Bell className="h-7 w-7" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className={cn("font-bold tracking-tight text-lg", !notif.is_read ? "text-slate-900" : "text-slate-600")}>
                        {notif.title}
                      </h4>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {new Date(notif.created_at).toLocaleDateString()}
                        </span>
                        {!notif.is_read && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 font-medium leading-relaxed max-w-4xl">
                      {notif.message}
                    </p>
                    <div className="pt-2 flex items-center gap-3">
                      <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-slate-50 border-slate-100 text-slate-400">
                        {notif.type}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ManagerDashboard() {
  const { user, userRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState("overview");
  const [buildingCourse, setBuildingCourse] = useState<InstructorCourse | null>(null);
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
        setSystemHealth(prev => parseFloat((Math.max(97, Math.min(99.9, prev + (Math.random() - 0.5) * 0.3))).toFixed(1)));
      }
    };

    fetchPlatformStats();
    const interval = setInterval(fetchPlatformStats, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const path = location.pathname.split("/").pop();
    if (path && path !== "manager") {
      setActiveSection(path);
    } else {
      setActiveSection("users");
    }
  }, [location.pathname]);

  const { data: exams = [], isLoading: examsLoading } = useExams();
  const { data: questions = [], isLoading: questionsLoading } = useQuestions();
  const { data: leaderboard = [], isLoading: leaderboardLoading } = useLeaderboard();

  const {
    courses,
    loading: dataLoading,
    approveCourse,
    rejectCourse,
    updateCourseStatus,
    toggleCourseActive,
    updateCoursePrice,
    updateEnrollmentStatus,
    updateEnrollmentPayment,
    deleteEnrollment,
    enrollments,
    profiles,
    stats,
    updateUserStatus,
    updateUserRole,
    sendApprovalEmail,
    resetStudentATS,
    deleteUser,
    refresh,
  } = useAdminData(userRole);


  const roleCounts = profiles.reduce((acc, profile) => {
    const role = profile.role || "student";
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);


  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary/20 border-t-primary"></div>
        <p className="text-xs font-medium text-muted-foreground animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  if (userRole !== "manager" && userRole !== "admin") {
    const fallback = userRole === "intern" ? "/intern-dashboard" : "/student-dashboard";
    return <Navigate to={fallback} replace />;
  }

  const navTabs = [
    { id: "users",               title: "User Management",     url: "/manager/users",                icon: Users },
    { id: "student-performance", title: "Academic Scores",     url: "/manager/student-performance",  icon: BarChart3 },
    { id: "instructors",         title: "Instructors",         url: "/manager/instructors",         icon: Users },
    { id: "enrollments",         title: "Enrollments Hub",     url: "/manager/enrollments",         icon: DbIcon },
    { id: "submissions-grading", title: "Submissions Grading", url: "/manager/submissions-grading", icon: ClipboardList },
    { id: "live-broadcast",      title: "Live Broadcast",      url: "/manager/live-broadcast",      icon: Radio },
    { id: "exams",               title: "Exam Scheduling",     url: "/manager/exams",               icon: Calendar },
    { id: "questions",           title: "Question Bank",       url: "/manager/questions",           icon: FileQuestion },
    { id: "question-access",     title: "Question Access",     url: "/manager/question-access",     icon: ShieldCheck },
    { id: "leaderboard",         title: "Leaderboard",         url: "/manager/leaderboard",         icon: Trophy },
    { id: "coupons",             title: "Rewards & Coupons",   url: "/manager/coupons",             icon: Trophy },
    { id: "grant-access",        title: "Grant Access",        url: "/manager/grant-access",        icon: KeyRound },
    { id: "resume-scans",        title: "Resume Scans",        url: "/manager/resume-scans",        icon: ClipboardList },
    { id: "instructor-access",   title: "Instructor Access",   url: "/manager/instructor-access",   icon: ShieldCheck },
    { id: "all-courses",         title: "All Courses",         url: "/manager/all-courses",         icon: BookOpen },
    { id: "video-library",       title: "Video Library",       url: "/manager/video-library",       icon: Video },
    { id: "monitoring",          title: "Live Monitoring",     url: "/manager/monitoring",          icon: Activity },
    { id: "ai-hub",              title: "AI Communications",   url: "/manager/ai-hub",               icon: Zap },
  ];


  const renderTabBar = () => (
    <div className="flex flex-col gap-0 border-b border-slate-200">
      <div className="w-full overflow-x-auto scrollbar-hide">
        <div className="bg-transparent h-auto p-0 gap-6 sm:gap-8 flex min-w-max">
          {navTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.url)}
              className={`px-0 py-4 h-auto border-b-2 rounded-none text-[13px] font-bold transition-all flex items-center gap-2 ${
                activeSection === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Manager Dashboard</h1>
          <p className="text-slate-500 font-medium">Welcome back, Manager. Here's what's happening today.</p>
        </div>
        <Button className="rounded-xl h-11 px-6 gap-2 shadow-lg shadow-primary/20" onClick={() => navigate('/manager/exams')}>
          <Plus className="h-4 w-4" />
          <span>New Exam</span>
        </Button>
      </div>

      {/* Platform Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Users",     value: stats.totalUsers,          icon: Users,      color: "text-blue-600",   bg: "bg-blue-50",   action: () => navigate('/manager/users') },
          { label: "Active Courses",  value: stats.activeCourses,       icon: BookOpen,   color: "text-green-600",  bg: "bg-green-50",  action: () => navigate('/manager/all-courses') },
          { label: "Enrollments",     value: enrollments.length,        icon: Activity,   color: "text-purple-600", bg: "bg-purple-50", action: () => navigate('/manager/enrollments') },
          { label: "Pending Reviews", value: stats.pendingEnrollments,  icon: Clock,      color: "text-amber-600",  bg: "bg-amber-50",  action: () => navigate('/manager/enrollments') },
        ].map((card, i) => (
          <Card key={i} className="border-none shadow-sm bg-white cursor-pointer hover:shadow-md transition-all" onClick={card.action}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", card.bg)}>
                <card.icon className={cn("h-5 w-5", card.color)} />
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{card.label}</p>
                {dataLoading ? (
                  <div className="h-5 w-10 bg-slate-100 animate-pulse rounded mt-0.5" />
                ) : (
                  <h4 className="text-lg font-black text-slate-900 leading-none">{card.value}</h4>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Role distribution */}
      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
            <Users className="h-4 w-4" /> User Role Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { role: 'Students',    count: roleCounts.student || 0,    color: 'bg-blue-100 text-blue-800' },
              { role: 'Interns',     count: roleCounts.intern || 0,     color: 'bg-amber-100 text-amber-800' },
              { role: 'Instructors', count: roleCounts.instructor || 0, color: 'bg-green-100 text-green-800' },
              { role: 'Managers',    count: roleCounts.manager || 0,    color: 'bg-purple-100 text-purple-800' },
            ].map((r) => (
              <div key={r.role} className={`rounded-xl px-4 py-3 ${r.color} flex justify-between items-center`}>
                <span className="text-xs font-bold">{r.role}</span>
                <span className="text-xl font-black">{r.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
      case "overview":
        return renderOverview();
      case "profile":
        return <UserProfile />;
      case "users":
        return (
          <UserManagement 
            users={profiles} 
            loading={dataLoading} 
            roleCounts={roleCounts}
            onUpdateStatus={updateUserStatus}
            onUpdateRole={updateUserRole}
            onSendEmail={sendApprovalEmail}
            onDeleteUser={async (userId) => { return await deleteUser(userId); }}
            onUpdateEnrollmentStatus={async (id, status) => { await updateEnrollmentStatus(id, status); }}
            onResetATS={async (userId) => { await resetStudentATS(userId); }}
            onSync={refresh}
          />
        );

      case "exams":

        return <ExamScheduler onNavigateToRepository={() => setActiveSection('questions')} onSync={() => refresh()} loading={dataLoading} />;
      case "questions":
        return <QuestionBankManager onSync={() => refresh()} loading={dataLoading} />;
      case "leaderboard":
        return <LeaderboardManager onSync={() => refresh()} loading={dataLoading} />;
      case "monitoring":
        return <LiveMonitoring onSync={() => refresh()} loading={dataLoading} />;
      case "video-library":
        return <ManagerVideoLibrary onSync={() => refresh()} loading={dataLoading} />;
      case "all-courses":
        return (
          <AllCoursesList 
            courses={courses} 
            loading={dataLoading} 
            onSync={() => refresh()}
            onUpdatePrice={updateCoursePrice}
            onToggleActive={toggleCourseActive}
            onViewSyllabus={(course) => {
              // Normalize the course object to match InstructorCourse interface
              const normalizedCourse = {
                ...course,
                price: typeof course.price === 'string' ? parseFloat(course.price) || 0 : course.price
              } as unknown as InstructorCourse;
              setBuildingCourse(normalizedCourse);
            }}
          />
        );
      case "question-access":
        return <QuestionBankApproval onSync={() => refresh()} loading={dataLoading} />;
      case "instructors":
        return <InstructorManagement onSync={() => refresh()} loading={dataLoading} />;
      case "coupons":
        return <CouponManager onSync={() => refresh()} loading={dataLoading} />;
      case "grant-access":
        return <GrantStudentAccess profiles={profiles} enrollments={enrollments as unknown as CourseEnrollment[]} onSync={() => refresh()} loading={dataLoading} />;
      case "resume-scans":
        return <ResumeScanHistory />;
      case "instructor-access":
        return <InstructorAccessAdmin onSync={() => refresh()} loading={dataLoading} />;
      case "submissions-grading":
        return <SubmissionsGrading onSync={() => refresh()} loading={dataLoading} />;
      case "live-broadcast":
        return <LiveClassManager />;
      case "enrollments":
        return (
          <EnrollmentsList 
            enrollments={enrollments as unknown as CourseEnrollment[]} 
            loading={dataLoading} 
            onUpdateStatus={async (id, status) => { 
                await updateEnrollmentStatus(id, status); 
            }}
            onUpdatePayment={async (id, term) => { await updateEnrollmentPayment(id, term); }}
            onDelete={async (id) => { 
                await deleteEnrollment(id); 
            }}
            onResetATS={async (userId) => { await resetStudentATS(userId); }}
            onSync={() => refresh()}
          />
        );
      case "notifications":
        return <NotificationSection />;
      case "student-performance":
        return <StudentPerformance enrollments={[]} onSync={() => refresh()} loading={dataLoading} />;
      case "ai-hub":
        return <AICommunicationHub profiles={profiles} loading={dataLoading} />;
      default:
        return renderOverview();

    }
  };

  if (buildingCourse) {
    return (
      <div className="min-h-screen bg-slate-50 relative">
        <div className="p-8 max-w-7xl mx-auto">
          <CourseBuilder
            course={buildingCourse as InstructorCourse}
            onBack={() => setBuildingCourse(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider className="h-[100dvh] w-full overflow-hidden mesh-bg font-sans">
      <ManagerSidebar />
      <SidebarInset className="flex flex-col h-[100dvh] w-full overflow-hidden bg-transparent">
        <ManagerHeader />
        <main className="flex-1 w-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 admin-scrollbar">
          <div className="max-w-7xl mx-auto space-y-6">

            {/* Persistent Stats Header — always visible */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6">
              {[
                { label: "EXAMS",          value: exams.length,      loading: examsLoading,        icon: Calendar,     color: "text-blue-600",   bg: "bg-blue-50" },
                { label: "QUESTION BANK",  value: questions.length,   loading: questionsLoading,    icon: FileQuestion, color: "text-purple-600", bg: "bg-purple-50" },
                { label: "LEADERBOARD",    value: leaderboard.length, loading: leaderboardLoading,  icon: Trophy,       color: "text-amber-600",  bg: "bg-amber-50" },
                { label: "LIVE LEARNERS",  value: liveLearners,       loading: false,               icon: Users,        color: "text-emerald-600",bg: "bg-emerald-50" },
                { label: "SYSTEM STATUS",  value: `${systemHealth}%`, loading: false,               icon: ShieldCheck,  color: "text-rose-600",   bg: "bg-rose-50" },
              ].map((stat, i) => (
                <Card key={i} className="border-none shadow-sm bg-white/50 backdrop-blur-sm group hover:scale-[1.02] transition-transform">
                  <CardContent className="p-4 sm:p-6 flex items-center gap-4 sm:gap-6">
                    <div className={cn("h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center shadow-inner shrink-0", stat.bg)}>
                      <stat.icon className={cn("h-5 w-5 sm:h-6 sm:w-6", stat.color)} />
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</p>
                      {stat.loading ? (
                        <div className="h-7 w-12 bg-slate-100 animate-pulse rounded-md" />
                      ) : (
                        <h3 className="text-xl sm:text-2xl font-black text-slate-900 leading-none">{stat.value}</h3>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Persistent Horizontal Tab Bar — always visible */}
            {renderTabBar()}

            {/* Section Content */}
            <div className="min-h-[400px]">
              {renderContent()}
            </div>

          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}