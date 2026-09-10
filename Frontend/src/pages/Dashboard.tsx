import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { useAuth } from "@/hooks/useAuth";
import { useEnrolledCourses, useStudentStats } from "@/hooks/useStudentData";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: enrolledCourses, isLoading: coursesLoading } =
    useEnrolledCourses();
  const { data: stats, isLoading: statsLoading } = useStudentStats();
  const { userRole } = useAuth();

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate("/auth");
      } else if (
        userRole === "instructor" &&
        location.pathname === "/student-dashboard"
      ) {
        navigate("/instructor");
      } else if (
        userRole === "admin" &&
        location.pathname === "/student-dashboard"
      ) {
        navigate("/admin");
      }
    }
  }, [user, authLoading, userRole, navigate, location.pathname]);

  if (authLoading || coursesLoading || statsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm font-medium text-slate-500">
            Loading Student Dashboard...
          </p>
        </div>
      </div>
    );
  }

  const handleUpgrade = async () => {
    try {
      const { fetchWithAuth } = await import('@/lib/api');
      const resp = await fetchWithAuth<{ success: boolean }>('/auth/self-upgrade', { method: 'POST' });
      if (resp?.success) {
         window.location.reload(); 
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <SidebarProvider className="h-[100dvh] w-full overflow-hidden mesh-bg font-sans">
      <DashboardSidebar />
      <SidebarInset className="flex flex-col h-[100dvh] w-full overflow-hidden bg-transparent">
        <DashboardHeader />

        <main className="flex-1 w-full overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-8 lg:p-10 custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-10"
              >
                <DashboardContent />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
