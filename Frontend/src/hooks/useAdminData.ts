import { fetchWithAuth } from '@/lib/api';
import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// Types for admin data
export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  mobile_number?: string | null;
  status: 'active' | 'suspended' | 'pending' | 'approved' | 'rejected' | string;
  approval_status: 'pending' | 'approved' | 'rejected' | 'suspended' | string;
  last_active_at: string | null;
  created_at: string;
  registration_date?: string | null;
  role?: string;
  suspended_until?: string | null;
  user_id?: string;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  full_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  college_name?: string | null;
  institute_name?: string | null;
  course_type?: 'full_time' | 'internship' | 'bridge' | string | null;
  course_title?: string | null;
  batch_name?: string | null;
  batch?: string | null;
  batch_type?: string | null;
  batch_timing?: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'manager' | 'instructor' | 'student';
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string | null;
  instructor_id: string | null;
  instructor_name: string | null;
  instructor_email?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'disabled' | 'published' | 'draft';
  category: string | null;
  thumbnail_url: string | null;
  submitted_at?: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  price: string | number | null;
  image?: string | null;
  duration?: string | null;
  level?: string | null;
  is_active?: boolean;
  created_at: string;
}

import { CourseEnrollment } from './useCourses';
export type { CourseEnrollment };

export interface SecurityEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  user_email: string | null;
  ip_address: string | null;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  details: Record<string, unknown> | null;
  resolved: boolean;
  created_at: string;
}

export interface SystemLog {
  id: string;
  log_type: 'info' | 'warning' | 'error' | 'audit' | 'system';
  module: string;
  action: string;
  user_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface MonitoringEnrollment {
  id: string;
  student: string;
  email: string;
  course: string;
  category: string;
  progress: number;
  status: string;
  last_accessed: string;
}

export interface MonitoringResult {
  id: string;
  student: string;
  email: string;
  test_title: string;
  type: string;
  score: number;
  total: number;
  percentage: number;
  time_spent: number;
  submitted_at: string;
}

export interface AdminStats {
  totalUsers: number;
  activeCourses: number;
  pendingCourses: number;
  pendingEnrollments: number;
  securityEvents: number;
  highPriorityEvents: number;
  roleCounts: Record<string, number>;
}

interface SummaryData {
  users: number;
  courses: number;
  activeCourses: number;
  enrollments: number;
  questionBanks: number;
  exams: number;
  securityEvents: number;
  pendingCourses: number;
  pendingEnrollments: number;
  pendingExams: number;
  highPriorityEvents: number;
  roleCounts: Record<string, number>;
}

export function useAdminData(userRole?: string | null) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrollments, setEnrollments] = useState<CourseEnrollment[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [stats, setStats] = useState<AdminStats>({
    totalUsers: 0,
    activeCourses: 0,
    pendingCourses: 0,
    pendingEnrollments: 0,
    securityEvents: 0,
    highPriorityEvents: 0,
    roleCounts: {},
  });

  const fetchAllData = useCallback(async (isManual = false) => {
    if (!userRole || (userRole !== 'admin' && userRole !== 'manager')) {
      console.warn(`[AdminData] Fetch skipped: current role is "${userRole}"`);
      setLoading(false);
      return;
    }

    if (isManual) {
      toast({
        title: "System Synchronization",
        description: "Fetching latest platform telemetry...",
      });
    }

    setLoading(true);
    try {
      // Create a promise array to track all fetches if we want a single completion toast
      const fetchPromises = [
        fetchWithAuth('/admin/data-summary')
          .then(summaryData => {
            if (summaryData) {
              const data = summaryData as SummaryData;
              setStats({
                totalUsers: data.users || 0,
                activeCourses: data.activeCourses || 0,
                pendingCourses: data.pendingCourses || 0,
                pendingEnrollments: data.pendingEnrollments || 0,
                securityEvents: data.securityEvents || 0,
                highPriorityEvents: data.highPriorityEvents || 0,
                roleCounts: data.roleCounts || {}
              });
            }
          }),
        // Use the new cross-validated endpoint — no ghost users from orphaned profiles
        fetchWithAuth('/admin/users')
          .then((usersData) => {
            if (usersData) {
              setProfiles(usersData as Profile[]);
              // Build userRoles array from the merged data for compatibility
              const rolesArray = (usersData as Profile[]).map(u => ({
                id: u.id,
                user_id: u.id,
                role: (u.role || 'student') as UserRole['role'],
                created_at: u.created_at
              }));
              setUserRoles(rolesArray);
            }
          }),
        fetchWithAuth('/data/courses?sort=created_at&order=desc&limit=200')
          .then(data => data && setCourses(data as Course[])),
        fetchWithAuth('/courses/enrollments')
          .then(data => data && setEnrollments(data as CourseEnrollment[])),
        fetchWithAuth('/data/security_events?sort=created_at&order=desc&limit=50')
          .then(data => data && setSecurityEvents(data as SecurityEvent[])),
        fetchWithAuth('/data/system_logs?sort=created_at&order=desc&limit=100')
          .then(data => data && setSystemLogs(data as SystemLog[]))
      ];

      await Promise.all(fetchPromises);

      if (isManual) {
        toast({
          title: "Success",
          description: "All administrative nodes are synchronized.",
        });
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error fetching admin data:', error);
        if (error.message?.includes('403') || error.message?.includes('Access denied')) {
          toast({
            title: 'Authorization Required',
            description: 'Managers/Admins only. Please re-login if this is an error.',
            variant: 'destructive',
          });
        }
      }
    } finally {
      setLoading(false);
    }
  }, [toast, userRole]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const approveCourse = async (courseId: string) => {
    try {
      await fetchWithAuth('/admin/approve-course', {
        method: 'PUT',
        body: JSON.stringify({ courseId, status: 'approved' })
      });
      toast({ title: 'Success', description: 'Course approved' });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to approve', variant: 'destructive' });
      return false;
    }
  };

  const rejectCourse = async (courseId: string, reason: string) => {
    try {
      await fetchWithAuth('/admin/approve-course', {
        method: 'PUT',
        body: JSON.stringify({ courseId, status: 'rejected', rejectionReason: reason })
      });
      toast({ title: 'Success', description: 'Course rejected' });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to reject', variant: 'destructive' });
      return false;
    }
  };

  const updateCourseStatus = async (courseId: string, status: string) => {
    try {
      await fetchWithAuth('/admin/approve-course', {
        method: 'PUT',
        body: JSON.stringify({ courseId, status })
      });
      toast({ title: 'Success', description: `Status updated to ${status}` });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Failed update', variant: 'destructive' });
      return false;
    }
  };

  const updateUserStatus = async (userId: string, status: string, suspensionDays?: string) => {
    // Store previous state for rollback
    const previousProfiles = [...profiles];
    
    // Determine the precise status values
    // In our system, 'active' status typically maps to 'approved' approval_status
    // and 'suspended' maps to 'suspended'
    const newApprovalStatus = status === 'active' ? 'approved' : status;
    const newStatus = status === 'suspended' ? 'suspended' : 'active';

    // Optimistically update the UI
    setProfiles(prev => prev.map(p => 
      p.id === userId 
        ? { 
            ...p, 
            approval_status: newApprovalStatus as Profile['approval_status'], 
            status: newStatus as Profile['status'],
            suspended_until: status === 'active' ? null : p.suspended_until // Clear if unsuspending
          } 
        : p
    ));

    try {
      await fetchWithAuth('/admin/update-user-status', {
        method: 'PUT',
        body: JSON.stringify({ userId, status: newApprovalStatus, suspensionDays })
      });
      toast({ title: 'Success', description: `User status updated to ${status}` });
      // Refresh to get precise server-calculated fields (like suspended_until)
      fetchAllData();
      return true;
    } catch (error) {
      setProfiles(previousProfiles);
      toast({ title: 'Error', description: 'Failed status update', variant: 'destructive' });
      return false;
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    const previousProfiles = [...profiles];
    
    // Optimistically update
    setProfiles(prev => prev.map(p => 
      p.id === userId ? { ...p, role: newRole } : p
    ));

    try {
      await fetchWithAuth('/admin/update-user-role', {
        method: 'PUT',
        body: JSON.stringify({ userId, role: newRole })
      });
      toast({ title: 'Success', description: `User role updated to ${newRole}` });
      fetchAllData();
      return true;
    } catch (error) {
      setProfiles(previousProfiles);
      toast({ title: 'Error', description: 'Failed role update', variant: 'destructive' });
      return false;
    }
  };

  const sendApprovalEmail = async (userId: string) => {
    try {
      await fetchWithAuth('/admin/send-approval-email', { method: 'POST', body: JSON.stringify({ userId }) });
      toast({ title: 'Success', description: 'Email sent' });
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Email failed', variant: 'destructive' });
      return false;
    }
  };

  const updateEnrollmentStatus = async (enrollmentId: string, status: string) => {
    // Store previous states for rollback
    const previousEnrollments = [...enrollments];
    const previousStats = { ...stats };

    // Optimistically update the UI
    setEnrollments(prev => prev.map(e => {
      const eId = (e as any)._id || e.id;
      return eId === enrollmentId 
        ? { ...e, status: status as CourseEnrollment['status'] } 
        : e;
    }));

    // If approved/rejected, we typically reduce pending count
    if (status === 'active' || status === 'rejected') {
      setStats(prev => ({
        ...prev,
        pendingEnrollments: Math.max(0, prev.pendingEnrollments - 1)
      }));
    }

    try {
      await fetchWithAuth('/courses/enrollment-status', { method: 'PUT', body: JSON.stringify({ enrollmentId, status }) });
      toast({ title: 'Success', description: `Enrollment ${status}` });
      // Refresh in background to ensure sync with server-side side effects
      fetchAllData();
      return true;
    } catch (error) {
      // Rollback on error
      setEnrollments(previousEnrollments);
      setStats(previousStats);
      toast({ title: 'Error', description: 'Failed enrollment update', variant: 'destructive' });
      return false;
    }
  };

  const updateEnrollmentPayment = async (enrollmentId: string, payment_term: string) => {
    try {
      await fetchWithAuth('/admin/update-enrollment-payment', { 
        method: 'PUT', 
        body: JSON.stringify({ enrollmentId, payment_term }) 
      });
      toast({ title: 'Success', description: `Payment method updated to ${payment_term}` });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Failed payment update', variant: 'destructive' });
      return false;
    }
  };

  const deleteEnrollment = async (enrollmentId: string) => {
    try {
      await fetchWithAuth(`/courses/enrollment/${enrollmentId}`, { method: 'DELETE' });
      toast({ title: 'Deleted', description: 'Enrollment removed' });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Delete failed', variant: 'destructive' });
      return false;
    }
  };



  const deleteExamResult = async (resultId: string) => {
    try {
      await fetchWithAuth(`/data/exam_results/${resultId}`, { method: 'DELETE' });
      toast({ title: 'Deleted', description: 'Exam result removed' });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Delete failed', variant: 'destructive' });
      return false;
    }
  };

  const resolveSecurityEvent = async (eventId: string) => {
    try {
      const resp = await fetchWithAuth('/user/profile') as { id: string, user?: { id: string } };
      await fetchWithAuth(`/data/security_events/${eventId}`, {
        method: 'PUT',
        body: JSON.stringify({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: resp.user?.id || resp.id })
      });
      toast({ title: 'Resolved', description: 'Event fixed' });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Resolve failed', variant: 'destructive' });
      return false;
    }
  };

  const updateCoursePrice = async (courseId: string, newPrice: string | number) => {
    try {
      await fetchWithAuth(`/data/courses/${courseId}`, { method: 'PUT', body: JSON.stringify({ price: newPrice }) });
      toast({ title: 'Success', description: 'Price updated' });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Price failed', variant: 'destructive' });
      return false;
    }
  };

  const toggleCourseActive = async (courseId: string, isActive: boolean) => {
    try {
      await fetchWithAuth('/admin/toggle-course-active', {
        method: 'PUT',
        body: JSON.stringify({ courseId, is_active: isActive })
      });
      toast({ title: 'Success', description: `Course ${isActive ? 'activated' : 'deactivated'}` });
      fetchAllData();
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to toggle status', variant: 'destructive' });
      return false;
    }
  };

    const resetStudentATS = async (userId: string) => {
    try {
      await fetchWithAuth('/admin/reset-ats', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });
      toast({ title: 'Success', description: 'ATS Score and credits reset successfully' });
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to reset ATS', variant: 'destructive' });
      return false;
    }
  };

  const deleteUser = async (userId: string) => {
    const previousProfiles = [...profiles];
    // Optimistically remove from UI immediately
    setProfiles(prev => prev.filter(p => p.id !== userId));

    try {
      await fetchWithAuth(`/admin/delete-user/${userId}`, { method: 'DELETE' });
      toast({ title: 'User Deleted', description: 'User and all associated data have been permanently removed.' });
      // Refresh to sync stats
      fetchAllData();
      return true;
    } catch (error) {
      // Rollback if delete failed
      setProfiles(previousProfiles);
      toast({ title: 'Error', description: 'Failed to delete user. Please try again.', variant: 'destructive' });
      return false;
    }
  };

  return {
    loading,
    profiles,
    courses,
    enrollments,
    securityEvents,
    systemLogs,
    stats,
    userRoles,
    refresh: fetchAllData,
    updateUserStatus,
    updateUserRole,
    updateEnrollmentStatus,
    updateEnrollmentPayment,
    deleteEnrollment,
    resolveSecurityEvent,
    sendApprovalEmail,
    approveCourse,
    rejectCourse,
    updateCourseStatus,
    updateCoursePrice,
    deleteExamResult,
    toggleCourseActive,
    resetStudentATS,
    deleteUser
  };
}

export function useLiveMonitoring() {
  const [data, setData] = useState<{ enrollments: MonitoringEnrollment[], results: MonitoringResult[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const resp = await fetchWithAuth('/admin/live-monitoring');
      setData(resp as { enrollments: MonitoringEnrollment[], results: MonitoringResult[] });
    } catch (err) {
      console.error('Failed to fetch monitoring data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const deleteEnrollment = async (id: string) => {
    try {
      await fetchWithAuth(`/data/course_enrollments/${id}`, { method: 'DELETE' });
      fetchData();
      return true;
    } catch (err) { return false; }
  };

  const deleteExamResult = async (id: string) => {
    try {
      await fetchWithAuth(`/data/exam_results/${id}`, { method: 'DELETE' });
      fetchData();
      return true;
    } catch (err) { return false; }
  };

  return { data, loading, refresh: fetchData, deleteEnrollment, deleteExamResult };
}