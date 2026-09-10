import { useState, useEffect, useRef } from "react";
import { fetchWithAuth } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Search,
  Plus,
  Edit,
  Lock,
  Unlock,
  UserCog,
  Clock,
  AlertCircle,
  Send,
  CheckCircle,
  Copy,
  Eye,
  Loader2,
  Github,
  Briefcase,
  GraduationCap,
  Award,
  Presentation,
  Shield,
  Mail,
  Fingerprint,
  Calendar,
  Activity,
  MoreVertical,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  BookOpen,
  CreditCard,
  ImageOff,
  Zap,
  ShieldCheck,
  RefreshCw,
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Profile } from "@/hooks/useAdminData";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { SyncDataButton } from "./data/SyncDataButton";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix for leaflet default marker icon issues in React
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;
 
const formatTime = (timeStr: string) => {
    if (!timeStr) return '—';
    if (timeStr.includes('AM') || timeStr.includes('PM')) return timeStr;
    try {
        const [hours, minutes] = timeStr.split(':');
        const h = parseInt(hours);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${minutes} ${ampm}`;
    } catch {
        return timeStr;
    }
};

interface AttendanceRecord {
  id: string;
  user_id: string;
  timestamp: string;
  ip_address: string;
  day: string;
  time: string;
  date: string;
}

interface UserManagementProps {
  users: Profile[];
  loading: boolean;
  roleCounts: Record<string, number>;
  onUpdateStatus: (
    userId: string,
    status: "approved" | "rejected" | "suspended" | "active",
    suspensionDays?: string
  ) => Promise<boolean>;
  onUpdateRole: (
    userId: string,
    role: "admin" | "manager" | "instructor" | "student" | "intern",
  ) => Promise<boolean>;
  onSendEmail: (userId: string) => Promise<boolean>;
  onUpdateEnrollmentStatus?: (id: string, status: "rejected" | "active") => Promise<void>;
  onResetATS?: (userId: string) => Promise<void>;
  onDeleteUser?: (userId: string) => Promise<boolean>;
  onSync?: () => void;
}

export function UserManagement({
  users = [],
  loading,
  roleCounts = {},
  onUpdateStatus,
  onUpdateRole,
  onSendEmail,
  onUpdateEnrollmentStatus,
  onResetATS,
  onDeleteUser,
  onSync,
}: UserManagementProps) {

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [newRole, setNewRole] = useState<string>("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [suspensionDays, setSuspensionDays] = useState("7");

  // Edit Profile States
  const [showEditProfileDialog, setShowEditProfileDialog] = useState(false);
  const [editFullName, setEditFullName] = useState("");
  const [editCollegeName, setEditCollegeName] = useState("");
  const [editInstituteName, setEditInstituteName] = useState("");
  const [editMobileNumber, setEditMobileNumber] = useState("");
  const [editCourseType, setEditCourseType] = useState("full_time");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleSaveProfileDetails = async () => {
    if (!selectedUser) return;
    setIsSavingProfile(true);
    try {
      await fetchWithAuth('/admin/update-user-profile', {
        method: 'PUT',
        body: JSON.stringify({
          userId: selectedUser.id,
          full_name: editFullName,
          college_name: editCollegeName,
          institute_name: editInstituteName,
          mobile_number: editMobileNumber,
          course_type: editCourseType,
        }),
      });
      toast.success('User profile & college details updated successfully!');
      setShowEditProfileDialog(false);
      if (onSync) onSync();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user profile details');
    } finally {
      setIsSavingProfile(false);
    }
  };
  
  interface PendingEnrollment {
    id: string;
    course_name: string;
    payment_proof_url: string;
    utr_number: string;
    status: string;
    final_price: number;
    payment_term: string;
    requested_batch_type: string;
  }
  const [pendingEnrollment, setPendingEnrollment] = useState<PendingEnrollment | null>(null);
  const [loadingEnrollment, setLoadingEnrollment] = useState(false);

  interface PerformanceData {
    enrollments: { course_name: string; progress: number; status: string }[];
    results: { title: string; score: number; total: number; percentage: number; date: string }[];
    github_url?: string;
    resume_url?: string;
  }
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // Attendance states
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);
  const emailTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const emailIntervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Cleanup timeouts on unmount
  useEffect(() => {
    const timeouts = emailTimeouts.current;
    const intervals = emailIntervals.current;
    return () => {
      Object.values(timeouts).forEach(timeout => clearTimeout(timeout));
      Object.values(intervals).forEach(interval => clearInterval(interval));
    };
  }, []);

  const handleSendEmail = (user: Profile) => {
    if (sendingEmailId === user.id) return;

    let timeLeft = 5;
    const getToastMessage = (time: number) => `Sending notification to ${user.full_name} in ${time}s...`;

    // Function to handle the UNDO action
    const handleUndo = (tId: string | number) => {
      if (emailTimeouts.current[user.id]) {
        clearTimeout(emailTimeouts.current[user.id]);
        clearInterval(emailIntervals.current[user.id]);
        delete emailTimeouts.current[user.id];
        delete emailIntervals.current[user.id];
        setSendingEmailId(null);
        toast.dismiss(tId);
        toast.info(`Sending cancelled for ${user.full_name}`, {
          icon: <Clock className="h-4 w-4" />,
        });
      }
    };

    // Show the initial toast with undo action
    const toastId = toast(getToastMessage(timeLeft), {
      description: "Action will execute shortly. You can still undo.",
      action: {
        label: "Undo",
        onClick: () => handleUndo(toastId),
      },
      duration: 6000, // Slightly longer than 5s to ensure UI stays
    });

    setSendingEmailId(user.id);

    // Visual countdown interval
    const interval = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft > 0) {
        toast(getToastMessage(timeLeft), {
          id: toastId,
          description: "Action will execute shortly. You can still undo.",
          action: {
            label: "Undo",
            onClick: () => handleUndo(toastId),
          },
        });
      } else {
        clearInterval(interval);
      }
    }, 1000);

    emailIntervals.current[user.id] = interval;

    // Schedule the actual email sending
    const timeout = setTimeout(async () => {
      delete emailTimeouts.current[user.id];
      delete emailIntervals.current[user.id];
      
      try {
        await fetchWithAuth(`/admin/send-student-email`, {
          method: "POST",
          body: JSON.stringify({ 
            userId: user.id,
            fullName: user.full_name // Passing full name to backend/n8n
          }),
        });
        toast.dismiss(toastId);
        toast.success(`Notification successfully sent to ${user.full_name}`);
      } catch (err) {
        console.error("Failed to send email:", err);
        toast.dismiss(toastId);
        toast.error("Could not send notification email");
      } finally {
        setSendingEmailId(null);
      }
    }, 5000);

    emailTimeouts.current[user.id] = timeout;
  };

  const handleViewAttendance = async (user: Profile) => {
    setSelectedUser(user);
    setLoadingAttendance(true);
    setShowAttendanceDialog(true);
    try {
      const data = await fetchWithAuth(`/admin/attendance/${user.id}`);
      setAttendanceRecords(data as AttendanceRecord[]);
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
      setAttendanceRecords([]);
    } finally {
      setLoadingAttendance(false);
    }
  };

  useEffect(() => {
    if (showApprovalDialog && selectedUser?.id) {
       setLoadingEnrollment(true);
       // Fetch most recent pending enrollment for this user
       fetchWithAuth(`/data/course_enrollments?user_id=eq.${selectedUser.id}&status=eq.pending`)
          .then(data => {
            const enrollments = data as PendingEnrollment[];
            if (enrollments && enrollments.length > 0) {
              setPendingEnrollment(enrollments[0]);
            } else {
              setPendingEnrollment(null);
            }
          })
          .catch(err => {
              console.error("Failed to fetch pending enrollment:", err);
              setPendingEnrollment(null);
          })
          .finally(() => setLoadingEnrollment(false));
    } else {
       setPendingEnrollment(null);
    }
  }, [showApprovalDialog, selectedUser]);

  useEffect(() => {
    if (showProfileDialog && selectedUser?.id) {
       setLoadingPerformance(true);
       fetchWithAuth(`/admin/student-performance/${selectedUser.id}`)
          .then(data => setPerformanceData(data as PerformanceData))
          .catch(err => {
              console.error("Failed to fetch student performance:", err);
              setPerformanceData(null);
          })
          .finally(() => setLoadingPerformance(false));
    } else {
       setPerformanceData(null);
    }
  }, [showProfileDialog, selectedUser]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleViewProfile = (user: Profile) => {
    setSelectedUser(user);
    setShowProfileDialog(true);
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleRoleChange = async () => {
    if (selectedUser && newRole) {
      await onUpdateRole(
        selectedUser.id,
        newRole as "admin" | "manager" | "instructor" | "student" | "intern",
      );
      setShowRoleDialog(false);
      setSelectedUser(null);
      setNewRole("");
    }
  };

  const formatLastActive = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return `${Math.floor(diffMins / 1440)} days ago`;
  };

  const getRoleBadgeVariant = (role: string | undefined) => {
    switch (role) {
      case "admin":
        return "default";
      case "manager":
        return "secondary";
      case "instructor":
        return "outline";
      default:
        return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      {/* Main Student Registry - Realigned with Grant Access Style */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="pb-6 border-b border-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-1">
              <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-900">
                <Users className="h-5 w-5 text-primary" />
                User Management
              </CardTitle>
              <CardDescription className="text-sm font-medium text-slate-500 max-w-md">
                Manage all registered users and platform role assignments.
              </CardDescription>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative group w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search user registry..."
                  className="pl-9 h-10 rounded-xl bg-slate-50 border-slate-200 focus:bg-white transition-all text-sm font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-10 w-full sm:w-40 rounded-xl bg-slate-50 border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-tight">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200">
                  <SelectItem value="all" className="text-xs font-bold py-2">ALL USERS</SelectItem>
                  <SelectItem value="admin" className="text-xs font-bold py-2">ADMINS</SelectItem>
                  <SelectItem value="manager" className="text-xs font-bold py-2">MANAGERS</SelectItem>
                  <SelectItem value="instructor" className="text-xs font-bold py-2">INSTRUCTORS</SelectItem>
                  <SelectItem value="student" className="text-xs font-bold py-2">STUDENTS</SelectItem>
                  <SelectItem value="intern" className="text-xs font-bold py-2">INTERNS</SelectItem>
                </SelectContent>
              </Select>

              {onSync && (
                <div className="flex items-center gap-2">
                  <div className="h-6 w-[1px] bg-slate-200 mx-1 hidden sm:block" />
                  <SyncDataButton 
                    onSync={onSync}
                    isLoading={loading}
                    className="h-10 px-4 border-slate-200 bg-white/70 shadow-sm"
                  />
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-4 sm:p-6">
          {filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100">
               <Users className="h-10 w-10 opacity-20 mb-4" />
               <p className="font-bold text-slate-800">No users found</p>
               <p className="text-xs">Adjust your filters to see more results</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredUsers.map((user, idx) => (
                <div
                  key={user.id}
                  className={`group flex flex-col gap-3 p-4 rounded-[1.5rem] border transition-all relative overflow-hidden ${
                    user.approval_status === 'rejected' 
                      ? 'border-rose-200 bg-rose-50/30' 
                      : 'border-slate-200 bg-white hover:border-primary/30 hover:shadow-md'
                  }`}
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  {/* ── ROW 1 : Avatar · Name · Email · Role ── */}
                  <div className="flex items-start gap-4 min-w-0">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <Avatar className="h-14 w-14 border border-slate-100 shadow-lg rounded-2xl overflow-hidden">
                        <AvatarImage src={user.avatar_url} className="object-cover" />
                        <AvatarFallback className="bg-slate-900 text-white font-black text-lg">
                          {(user.full_name || user.email || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white shadow-sm ${
                        user.status === 'suspended' ? 'bg-rose-500' : 'bg-emerald-500'
                      }`} />
                    </div>

                    {/* Name + Email + Role stacked */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-base font-black text-slate-900 leading-tight truncate">
                          {user.full_name || "Platform User"}
                        </p>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] h-6 px-2.5 rounded-lg uppercase font-black tracking-tight border shadow-sm ${
                            user.role === 'intern'
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : user.role === 'student'
                              ? 'border-blue-100 bg-blue-50 text-blue-900'
                              : 'border-slate-100 bg-slate-50 text-slate-900'
                          }`}
                        >
                          {user.role === 'intern' ? '🎓 Intern' : user.role || "student"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 font-bold truncate flex items-center gap-2">
                        <Mail className="h-3 w-3 opacity-40" />
                        {user.email}
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100/50">
                           {formatLastActive(user.last_active_at)}
                         </span>
                         {user.approval_status === 'pending' && (
                           <span className="text-[9px] font-black text-amber-600 uppercase px-2 py-0.5 bg-amber-50 rounded-md animate-pulse">Pending Review</span>
                         )}
                      </div>
                    </div>
                  </div>

                  {/* ── ROW 2 : Action buttons ── */}
                  <div className="flex items-center gap-2 pt-3 mt-1 border-t border-slate-50/50">
                    <Button
                      onClick={() => handleViewProfile(user)}
                      className="h-10 w-10 p-0 rounded-2xl bg-slate-50 text-slate-500 hover:bg-slate-900 hover:text-white transition-all shadow-sm border border-slate-100 flex items-center justify-center shrink-0"
                      title="View Metrics"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>

                    <Button
                      onClick={() => {
                        setSelectedUser(user);
                        if (user.approval_status === "pending") {
                          setShowApprovalDialog(true);
                        } else {
                          setShowProfileDialog(true);
                        }
                      }}
                      className={`flex-1 h-10 px-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.1em] transition-all shadow-sm border-none ${
                        user.approval_status === "pending"
                          ? "bg-amber-500 text-white hover:bg-amber-600"
                          : "bg-primary text-white hover:bg-slate-900"
                      }`}
                    >
                      {user.approval_status === "pending" ? "Review Credentials" : " Review Profile"}
                    </Button>

                    {user.role !== 'admin' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            className="h-10 w-10 p-0 rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-all border border-slate-100 flex items-center justify-center shrink-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-[1.5rem] p-2 border-slate-100 shadow-2xl animate-in zoom-in-95 duration-200">
                          <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-slate-400 p-2 border-b mb-1">Account Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => handleViewAttendance(user)} className="rounded-xl font-bold text-[13px] py-2.5 cursor-pointer hover:bg-slate-50">
                            <Fingerprint className="mr-3 h-4 w-4 text-blue-500" /> Attendance Records
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleSendEmail(user)}
                            disabled={sendingEmailId === user.id}
                            className="rounded-xl font-bold text-[13px] py-2.5 cursor-pointer hover:bg-slate-50"
                          >
                            {sendingEmailId === user.id ? (
                              <Loader2 className="mr-3 h-4 w-4 animate-spin text-primary" />
                            ) : (
                              <Mail className="mr-3 h-4 w-4 text-amber-500" />
                            )}
                            Send Notification Mail
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setEditFullName(user.full_name || "");
                            setEditCollegeName((user as any).college_name || "");
                            setEditInstituteName((user as any).institute_name || "");
                            setEditMobileNumber((user as any).mobile_number || (user as any).phone || "");
                            setEditCourseType((user as any).course_type || "full_time");
                            setShowEditProfileDialog(true);
                          }} className="rounded-xl font-bold text-[13px] py-2.5 cursor-pointer hover:bg-slate-50 text-slate-700">
                            <Edit className="mr-3 h-4 w-4 text-indigo-500" /> Edit Profile & College
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedUser(user);
                            setNewRole(user.role || "student");
                            setShowRoleDialog(true);
                          }} className="rounded-xl font-bold text-[13px] py-2.5 cursor-pointer hover:bg-slate-50">
                            <UserCog className="mr-3 h-4 w-4 text-emerald-500" /> Reassign Role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="my-1.5 bg-slate-100" />
                          {user.approval_status === 'rejected' && (
                            <DropdownMenuItem onClick={() => onUpdateStatus(user.id, "approved")} className="rounded-xl font-bold text-[13px] py-2.5 text-emerald-600 bg-emerald-50 cursor-pointer mb-1 shadow-sm">
                              <CheckCircle className="mr-3 h-4 w-4" /> Approve Access
                            </DropdownMenuItem>
                          )}
                          {user.status === 'suspended' ? (
                            <DropdownMenuItem onClick={() => onUpdateStatus(user.id, "approved")} className="rounded-xl font-bold text-[13px] py-2.5 text-emerald-600 bg-emerald-50/50 cursor-pointer">
                              <Unlock className="mr-3 h-4 w-4" /> Restore Access
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => {
                              setSelectedUser(user);
                              setShowSuspendDialog(true);
                            }} className="rounded-xl font-bold text-[13px] py-2.5 text-rose-600 bg-rose-50/50 cursor-pointer">
                              <Lock className="mr-3 h-4 w-4" /> Suspend Access
                            </DropdownMenuItem>
                          )}
                          {onDeleteUser && (
                            <>
                              <DropdownMenuSeparator className="my-1.5 bg-rose-100" />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUser(user);
                                  setShowDeleteDialog(true);
                                }}
                                className="rounded-xl font-bold text-[13px] py-2.5 text-rose-700 bg-rose-50 cursor-pointer hover:bg-rose-100"
                              >
                                <Trash2 className="mr-3 h-4 w-4" /> Delete User Permanently
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Authorities Header - Separate Full Width */}
      <div className="flex flex-col gap-6">
        <div className="px-4">
          <div className="flex items-center gap-4 mb-2">
            <Shield className="h-7 w-7 text-primary" />
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">User Roles & Distribution</h3>
          </div>
          <p className="text-[13px] font-medium text-slate-500 ml-11 uppercase tracking-[0.2em]">Overview of all registered accounts on the platform</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Students",    count: roleCounts.student    || 0, icon: Users,        desc: "Full-time registered students",     accent: "bg-blue-50",   iconColor: "text-blue-600" },
            { label: "Interns",     count: roleCounts.intern     || 0, icon: Briefcase,    desc: "Internship programme students",     accent: "bg-amber-50",  iconColor: "text-amber-600" },
            { label: "Instructors", count: roleCounts.instructor || 0, icon: Presentation, desc: "Course & content management",       accent: "bg-emerald-50",iconColor: "text-emerald-600" },
            { label: "Managers",    count: roleCounts.manager    || 0, icon: UserCog,      desc: "Operational management team",       accent: "bg-purple-50", iconColor: "text-purple-600" },
          ].map((role) => (
            <Card key={role.label} className="border-none shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden group transition-all duration-500 hover:-translate-y-2 bg-white">
              <CardContent className="p-8">
                <div className="flex justify-between items-start mb-8">
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform duration-500 group-hover:rotate-12 ${role.accent}`}>
                    <role.icon className={`h-6 w-6 ${role.iconColor}`} />
                  </div>
                  <div className="h-2 w-2 rounded-full animate-ping bg-emerald-500/40" />
                </div>
                
                <div className="space-y-1">
                  <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-900">
                    {role.label}
                  </h5>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black tracking-tighter text-slate-900">
                      {role.count}
                    </span>
                    <span className="text-[11px] font-bold text-slate-500">Users</span>
                  </div>
                  <p className="text-[11px] font-medium pt-3 border-t mt-4 border-slate-50 text-slate-500">
                    {role.desc}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Role Change Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent aria-describedby="role-dialog-description" className="max-w-md overflow-hidden bg-white/95 backdrop-blur-2xl border border-slate-200/60 shadow-2xl rounded-2xl p-0">
          <DialogHeader className="px-4 sm:px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="flex items-center gap-3 text-lg font-semibold text-slate-800">
              <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center shadow-inner">
                <UserCog className="h-5 w-5 text-accent" />
              </div>
              Modify User Role
            </DialogTitle>
            <DialogDescription id="role-dialog-description" className="text-sm text-slate-600 font-medium sm:ml-13">
              Change the system permissions for{" "}
              <span className="text-slate-700 font-semibold">
                {selectedUser?.full_name || selectedUser?.email}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                Select New Role
              </label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 hover:border-accent hover:bg-white transition-all font-medium">
                  <SelectValue placeholder="Select new role" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 shadow-xl overflow-hidden p-1">
                  <SelectItem
                    value="student"
                    className="rounded-lg h-10 font-medium hover:bg-slate-50"
                  >
                    Student (Full-Time)
                  </SelectItem>
                  <SelectItem
                    value="intern"
                    className="rounded-lg h-10 font-medium hover:bg-slate-50"
                  >
                    Intern (Internship)
                  </SelectItem>
                  <SelectItem
                    value="instructor"
                    className="rounded-lg h-10 font-medium hover:bg-slate-50"
                  >
                    Instructor
                  </SelectItem>
                  <SelectItem
                    value="manager"
                    className="rounded-lg h-10 font-medium hover:bg-slate-50"
                  >
                    Manager
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
            <Button
              variant="ghost"
              className="rounded-xl font-semibold text-slate-600 hover:text-slate-700 hover:bg-slate-200/50 h-11 px-6 active:scale-95 transition-all"
              onClick={() => setShowRoleDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl font-semibold bg-accent hover:bg-accent/90 text-white shadow-sm shadow-accent/20 h-11 px-6 active:scale-95 transition-all"
              onClick={handleRoleChange}
            >
              Update Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Profile Dialog */}
      <Dialog open={showEditProfileDialog} onOpenChange={setShowEditProfileDialog}>
        <DialogContent aria-describedby="edit-profile-dialog-description" className="max-w-lg overflow-hidden bg-white/95 backdrop-blur-2xl border border-slate-200/60 shadow-2xl rounded-3xl p-0">
          <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="flex items-center gap-3 text-lg font-bold text-slate-800">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shadow-inner">
                <Edit className="h-5 w-5 text-indigo-600" />
              </div>
              Edit Profile & College Details
            </DialogTitle>
            <DialogDescription id="edit-profile-dialog-description" className="text-sm text-slate-500 font-medium sm:ml-13">
              Update credentials and registration info for <span className="text-slate-900 font-bold">{selectedUser?.full_name || selectedUser?.email}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Full Name</label>
              <Input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="Student Full Name"
                className="h-11 rounded-xl font-bold text-slate-800"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-indigo-600 tracking-wider flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5 text-indigo-500" /> College Name
              </label>
              <Input
                value={editCollegeName}
                onChange={(e) => setEditCollegeName(e.target.value)}
                placeholder="e.g. ABC College of Engineering"
                className="h-11 rounded-xl font-bold text-slate-800 border-indigo-200 bg-indigo-50/20 focus:border-indigo-500 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Institute Name (Branch / Department)</label>
              <Input
                value={editInstituteName}
                onChange={(e) => setEditInstituteName(e.target.value)}
                placeholder="e.g. Computer Science Engineering"
                className="h-11 rounded-xl font-medium text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Mobile Number</label>
                <Input
                  value={editMobileNumber}
                  onChange={(e) => setEditMobileNumber(e.target.value)}
                  placeholder="+91 9876543210"
                  className="h-11 rounded-xl font-medium text-slate-800"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Course Programme</label>
                <Select value={editCourseType} onValueChange={setEditCourseType}>
                  <SelectTrigger className="h-11 rounded-xl font-bold text-slate-800 border-slate-200">
                    <SelectValue placeholder="Course Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-xl">
                    <SelectItem value="full_time" className="font-bold text-xs">Full-Time Student</SelectItem>
                    <SelectItem value="internship" className="font-bold text-xs">Internship Student</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-3">
            <Button
              variant="ghost"
              className="rounded-xl font-semibold text-slate-600 hover:bg-slate-200/50 h-11 px-6"
              onClick={() => setShowEditProfileDialog(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={isSavingProfile}
              onClick={handleSaveProfileDetails}
              className="rounded-xl font-bold bg-primary text-white shadow-lg shadow-primary/20 h-11 px-8 gap-2"
            >
              {isSavingProfile ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent aria-describedby="approval-dialog-description" className="w-[95vw] sm:max-w-xl max-h-[90vh] overflow-hidden bg-white/95 backdrop-blur-2xl border border-slate-200/60 shadow-2xl rounded-[2.5rem] p-0 flex flex-col">
          <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 shrink-0 relative">
            <DialogTitle className="flex items-center gap-3 text-lg font-bold text-slate-800">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-inner">
                <Users className="h-5 w-5 text-primary" />
              </div>
              User Review & Approval
            </DialogTitle>
            <DialogDescription id="approval-dialog-description" className="text-sm text-slate-500 font-medium sm:ml-13">
              Review credential details and enrollment assets.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin">
            <div className="bg-slate-50/50 p-5 rounded-[2rem] border border-slate-100 space-y-4 shadow-sm">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-200/50">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                    Full Name
                  </p>
                  <p className="text-sm font-black text-slate-900 leading-tight">
                    {selectedUser?.full_name || "Not provided"}
                  </p>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                    Assigned Role
                  </p>
                  <div>
                    <Badge
                      variant="secondary"
                      className="h-5 px-2 bg-white border text-slate-700 border-slate-200 shadow-sm font-black uppercase tracking-tighter text-[9px]"
                    >
                      {selectedUser?.role || "student"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                    Email Address
                  </p>
                  <p className="text-[13px] font-bold text-slate-700 break-all leading-tight">
                    {selectedUser?.email}
                  </p>
                </div>
                <div className="space-y-1.5 sm:text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">
                    Mobile Number
                  </p>
                  <p className="text-[13px] font-bold text-slate-700 leading-tight">
                    {selectedUser?.mobile_number || "N/A"}
                  </p>
                </div>
              </div>
            </div>

            {loadingEnrollment ? (
              <div className="p-10 flex flex-col items-center justify-center gap-4 bg-slate-50/50 rounded-[2rem] border border-slate-100">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Loading enrollment data...</p>
              </div>
            ) : pendingEnrollment ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Enrollment Info Card */}
                <div className="p-6 rounded-[2rem] bg-indigo-50 border border-indigo-100/50 space-y-5 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <BookOpen className="h-16 w-16 text-indigo-900" />
                  </div>
                  
                  <div className="flex justify-between items-start relative z-10">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Enrolling for Course</p>
                      <h4 className="text-lg font-black text-indigo-900 leading-tight">{pendingEnrollment.course_name}</h4>
                    </div>
                    <Badge className="bg-white/80 text-indigo-600 border-indigo-100 shadow-sm font-black text-[9px] uppercase tracking-wider">
                      {pendingEnrollment.requested_batch_type || 'morning'} session
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-2 relative z-10">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Transaction (UTR)</p>
                      <p className="text-xs font-mono font-black text-indigo-800 tracking-wider flex items-center gap-2">
                        {pendingEnrollment.utr_number || 'N/A'}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-indigo-400 hover:text-indigo-600"
                          onClick={() => copyToClipboard(pendingEnrollment.utr_number)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Payment Term</p>
                      <p className="text-xs font-black text-indigo-800 uppercase tracking-tight italic">
                        {pendingEnrollment.payment_term || 'Full Pay'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Proof Visualizer */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <CreditCard className="h-3 w-3" /> Payment Proof Documentation
                    </p>
                    {pendingEnrollment.payment_proof_url && (
                        <a 
                          href={pendingEnrollment.payment_proof_url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline"
                        >
                          Open Original
                        </a>
                    )}
                  </div>
                  <div className="relative group cursor-zoom-in rounded-[2.5rem] overflow-hidden bg-slate-100 border-2 border-slate-50 shadow-xl shadow-slate-200/20">
                    {pendingEnrollment.payment_proof_url ? (
                      <img 
                        src={pendingEnrollment.payment_proof_url} 
                        alt="Payment Proof" 
                        className="w-full h-auto max-h-[350px] object-contain transition-transform duration-700 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="h-48 flex flex-col items-center justify-center text-slate-300 gap-3">
                         <ImageOff className="h-10 w-10 opacity-20" />
                         <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">No preview available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 flex gap-3 shadow-sm">
                <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-slate-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-black text-slate-700 uppercase tracking-tight">No Dynamic Enrollment Found</p>
                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed">Checking primary profile credentials only. Access will be granted based on manual verification.</p>
                </div>
              </div>
            )}
            
            <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-200/40 flex gap-3 items-start shadow-sm mt-4">
              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Zap className="h-4 w-4 text-amber-600 fill-amber-600" />
              </div>
              <div className="space-y-0.5">
                <p className="text-[10px] font-black text-amber-900 uppercase tracking-tight">System Automation</p>
                <p className="text-[10px] font-medium text-amber-800/70 leading-normal">
                  Approving will instantly activate the user profile and (if found) the pending course enrollment simultaneously.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-5 border-t border-slate-100 bg-slate-50/50 flex shrink-0 sm:flex-row sm:justify-between items-center gap-4">
            <Button
              variant="ghost"
              className="w-full sm:w-auto rounded-2xl font-black uppercase tracking-widest text-[10px] text-slate-400 hover:text-slate-600 h-14 px-8 active:scale-95 transition-all"
              onClick={() => setShowApprovalDialog(false)}
            >
              Close
            </Button>

            <div className="flex gap-3 w-full sm:w-auto">
              {(!pendingEnrollment || pendingEnrollment.status === 'pending') ? (
                <>
                  <Button
                    variant="outline"
                    className="flex-1 sm:w-32 rounded-2xl font-black uppercase tracking-widest text-[10px] border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 h-14 px-6 active:scale-95 transition-all shadow-sm"
                    disabled={processingAction !== null}
                    onClick={async () => {
                      if (selectedUser) {
                        setProcessingAction("reject");
                        try {
                          // Reject enrollment if exists
                          if (pendingEnrollment && onUpdateEnrollmentStatus) {
                            await onUpdateEnrollmentStatus(pendingEnrollment.id, "rejected");
                          }
                          // Reject user profile
                          const success = await onUpdateStatus(selectedUser.id, "rejected");
                          if (success) setShowApprovalDialog(false);
                        } finally {
                          setProcessingAction(null);
                        }
                      }
                    }}
                  >
                    {processingAction === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Deny Access"}
                  </Button>

                  <Button
                    className="flex-1 sm:w-48 rounded-2xl font-black uppercase tracking-widest text-[10px] bg-slate-900 border-2 border-slate-900 text-white hover:bg-white hover:text-slate-900 shadow-xl shadow-slate-200/50 gap-3 h-14 px-8 active:scale-95 transition-all"
                    disabled={processingAction !== null}
                    onClick={async () => {
                      if (selectedUser) {
                        setProcessingAction("approve");
                        try {
                          // Approve enrollment if exists
                          if (pendingEnrollment && onUpdateEnrollmentStatus) {
                            await onUpdateEnrollmentStatus(pendingEnrollment.id, "active");
                          }
                          // Approve user profile
                          const success = await onUpdateStatus(selectedUser.id, "approved");
                          if (success) setShowApprovalDialog(false);
                        } finally {
                          setProcessingAction(null);
                        }
                      }
                    }}
                  >
                    {processingAction === "approve" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="h-5 w-5" />
                        Approve Entry
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-3 px-6 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/50">
                   <ShieldCheck className="h-5 w-5" />
                   <span className="text-[10px] font-black uppercase tracking-widest">Enrollment Active</span>
                </div>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Profile Dialog */}
      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent aria-describedby="profile-dialog-description" className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              User Profile
            </DialogTitle>
            <DialogDescription id="profile-dialog-description" className="sr-only">
              View user profile details including name, email, UUID, and status.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              {/* Avatar and Name */}
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {selectedUser.full_name?.charAt(0).toUpperCase() || 'U'}
                  </span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">
                    {selectedUser.full_name || 'Unknown'}
                  </h3>
                  <Badge variant="secondary" className="mt-1">
                    {selectedUser.role || 'student'}
                  </Badge>
                </div>
              </div>

              {/* Details */}
              <div className="grid gap-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium">{selectedUser.email || 'N/A'}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Mobile Number</span>
                  <span className="text-sm font-medium">{selectedUser.mobile_number || 'Not provided'}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">College</span>
                  <span className="text-sm font-medium truncate max-w-[200px]" title={selectedUser.college_name}>{selectedUser.college_name || 'N/A'}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Institute</span>
                  <span className="text-sm font-medium truncate max-w-[200px]" title={selectedUser.institute_name}>{selectedUser.institute_name || 'N/A'}</span>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">UUID</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono">{selectedUser.id?.substring(0, 8)}...</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => selectedUser.id && copyToClipboard(selectedUser.id)}
                    >
                      {copiedId === selectedUser.id ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant={selectedUser.status === 'active' ? 'default' : 'destructive'}>
                    {selectedUser.status || 'active'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Approval</span>
                  <Badge variant={selectedUser.approval_status === 'approved' ? 'default' : 'secondary'}>
                    {selectedUser.approval_status || 'pending'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">Joined</span>
                  <span className="text-sm font-medium">
                    {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Location Map Ingress */}
              {(selectedUser.latitude && selectedUser.longitude) && (
                <div className="space-y-3 pt-2">
                   <h4 className="font-semibold flex items-center justify-between text-sm">
                     <span className="flex items-center">
                        <Activity className="h-4 w-4 mr-2 text-primary" /> Geographical Ingress Node
                        <a 
                          href={`https://www.google.com/maps?q=${selectedUser.latitude},${selectedUser.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-2 p-1.5 rounded-lg bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all shadow-sm border border-primary/10 group"
                          title="View on Google Maps"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                     </span>
                     {selectedUser.full_address && !selectedUser.full_address.includes('Network Based Fallback') && (
                        <Badge className="bg-emerald-500 text-white border-none text-[8px] h-4 animate-pulse">LIVE GPS VERIFIED</Badge>
                     )}
                   </h4>
                   
                   <div className="h-[200px] w-full rounded-2xl overflow-hidden border-2 border-slate-100 shadow-inner relative z-0">
                      <MapContainer 
                        center={[selectedUser.latitude, selectedUser.longitude]} 
                        zoom={13} 
                        scrollWheelZoom={false}
                        className="h-full w-full"
                      >
                        <TileLayer
                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <Marker position={[selectedUser.latitude, selectedUser.longitude]}>
                          <Popup>
                            <div className="text-xs font-bold">
                              {selectedUser.full_name}'s Location<br/>
                              <span className="text-[10px] font-normal text-slate-500">{selectedUser.full_address}</span>
                            </div>
                          </Popup>
                        </Marker>
                      </MapContainer>
                   </div>

                   <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Latitude</p>
                          <p className="text-[11px] font-bold text-slate-700">{selectedUser.latitude.toFixed(6)}</p>
                      </div>
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Longitude</p>
                          <p className="text-[11px] font-bold text-slate-700">{selectedUser.longitude.toFixed(6)}</p>
                      </div>
                   </div>
                </div>
              )}

              {!(selectedUser.latitude && selectedUser.longitude) && (selectedUser.city || selectedUser.country) && (
                <div className="space-y-3 pt-2">
                   <h4 className="font-semibold flex items-center text-sm">
                     <Activity className="h-4 w-4 mr-2 text-primary" /> Geospatial Node (Legacy)
                   </h4>
                   <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">City / District</p>
                          <p className="text-xs font-bold text-slate-700 truncate" title={selectedUser.city || ''}>{selectedUser.city || 'N/A'}, {selectedUser.district || ''}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Country</p>
                          <p className="text-xs font-bold text-slate-700 truncate" title={selectedUser.country || ''}>{selectedUser.country || 'N/A'}</p>
                      </div>
                   </div>
                </div>
              )}

              {/* Performance Section */}
              <div className="space-y-3 pt-2">
                 <h4 className="font-semibold flex items-center text-sm">
                   <Presentation className="h-4 w-4 mr-2 text-primary" /> Performance & Portfolio
                 </h4>
                 {loadingPerformance ? (
                    <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                 ) : performanceData ? (
                    <div className="grid gap-3">
                       {/* Github & Resume */}
                       {(performanceData.github_url || performanceData.resume_url) && (
                          <div className="flex flex-col gap-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                             {performanceData.github_url && (
                                <a href={performanceData.github_url} target="_blank" rel="noreferrer" className="flex items-center text-sm text-blue-700 hover:underline">
                                  <Github className="h-4 w-4 mr-2" /> GitHub Repository
                                </a>
                             )}
                             {performanceData.resume_url && (
                                <a 
                                  href={performanceData.resume_url.startsWith('http') 
                                    ? performanceData.resume_url 
                                    : `${(import.meta.env.VITE_API_URL || 'http://localhost:5001/api').replace(/\/api$/, '')}${performanceData.resume_url.startsWith('/') ? '' : '/'}${performanceData.resume_url}`
                                  } 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="flex items-center text-sm text-blue-700 hover:underline"
                                >
                                  <Briefcase className="h-4 w-4 mr-2" /> View Resume
                                </a>
                             )}
                          </div>
                       )}

                       {/* Active Enrollments */}
                       {performanceData.enrollments.length > 0 && (
                          <div className="space-y-2">
                             <span className="text-xs font-semibold text-muted-foreground uppercase">Active Enrollments</span>
                             {performanceData.enrollments.map((env, i) => (
                                <div key={i} className="bg-muted p-2 rounded flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2 max-w-[70%]">
                                     <GraduationCap className="h-3 w-3 shrink-0" />
                                     <span className="truncate" title={env.course_name}>{env.course_name}</span>
                                  </div>
                                  <Badge variant={env.progress === 100 ? "default" : "secondary"} className="text-[10px]">
                                     {env.progress}%
                                  </Badge>
                                </div>
                             ))}
                          </div>
                       )}

                       {/* Exam Results */}
                       {performanceData.results.length > 0 && (
                          <div className="space-y-2">
                             <span className="text-xs font-semibold text-muted-foreground uppercase">Recent Assessments</span>
                             {performanceData.results.map((res, i) => (
                                <div key={i} className="bg-muted p-2 rounded flex justify-between items-center text-sm">
                                  <div className="flex items-center gap-2 max-w-[65%]">
                                     <Award className="h-3 w-3 shrink-0" />
                                     <span className="truncate" title={res.title}>{res.title}</span>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-[11px]">{res.percentage}%</div>
                                    <div className="text-[9px] text-muted-foreground">{res.score}/{res.total}</div>
                                  </div>
                                </div>
                             ))}
                          </div>
                       )}
                    </div>
                 ) : (
                    <div className="text-sm text-muted-foreground text-center p-3">No performance data found.</div>
                 )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setNewRole(selectedUser.role || 'student');
                    setShowProfileDialog(false);
                    setShowRoleDialog(true);
                  }}
                >
                  <UserCog className="h-4 w-4 mr-2" />
                  Change Role
                </Button>

                {/* Dashboard Access Button — routes based on role */}
                {(selectedUser.role === 'student' || selectedUser.role === 'intern') && (
                  <a
                    href={selectedUser.role === 'intern' ? '/intern-dashboard' : '/student-dashboard'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1"
                  >
                    <Button variant="outline" className={`w-full ${selectedUser.role === 'intern' ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {selectedUser.role === 'intern' ? 'Intern Dashboard' : 'Student Dashboard'}
                    </Button>
                  </a>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                {selectedUser.status === 'suspended' ? (
                  <Button
                    variant="outline"
                    className="flex-1 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                    onClick={async () => {
                      setIsProcessing(true);
                      const success = await onUpdateStatus(selectedUser.id, "approved");
                      if (success) {
                        setShowProfileDialog(false);
                      }
                      setIsProcessing(false);
                    }}
                    disabled={isProcessing}
                  >
                    <Unlock className="h-4 w-4 mr-2" />
                    Restore
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1 border-rose-200 text-rose-600 hover:bg-rose-50"
                    onClick={() => {
                      setShowProfileDialog(false);
                      setShowSuspendDialog(true);
                    }}
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    Suspend
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Suspend Confirmation Dialog */}
      <Dialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend User Access</DialogTitle>
            <DialogDescription>
              Are you sure you want to suspend <span className="font-bold">{selectedUser?.full_name}</span>?
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Duration (Days)</label>
                <Select value={suspensionDays} onValueChange={setSuspensionDays}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">1 Day</SelectItem>
                        <SelectItem value="3">3 Days</SelectItem>
                        <SelectItem value="7">7 Days (1 Week)</SelectItem>
                        <SelectItem value="14">14 Days (2 Weeks)</SelectItem>
                        <SelectItem value="30">30 Days (1 Month)</SelectItem>
                        <SelectItem value="90">90 Days (3 Months)</SelectItem>
                        <SelectItem value="365">365 Days (1 Year)</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-100">
                This user will be blocked from all platform features until the suspension expires.
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowSuspendDialog(false)}>Cancel</Button>
            <Button 
                variant="destructive" 
                onClick={async () => {
                    if (selectedUser) {
                        setIsProcessing(true);
                        await onUpdateStatus(selectedUser.id, "suspended", suspensionDays);
                        setIsProcessing(false);
                        setShowSuspendDialog(false);
                    }
                }}
                disabled={isProcessing}
            >
                {isProcessing ? "Processing..." : "Confirm Suspension"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md rounded-2xl border-rose-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash2 className="h-5 w-5" />
              Permanently Delete User
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              This action <span className="font-black text-rose-600">cannot be undone</span>. All data including enrollments, exam results, messages, and attendance records will be permanently erased.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 space-y-2">
              <p className="text-sm font-bold text-rose-800">User to be deleted:</p>
              <p className="text-base font-black text-rose-900">{selectedUser?.full_name || 'Unknown User'}</p>
              <p className="text-xs text-rose-600 font-medium">{selectedUser?.email}</p>
            </div>
            <div className="mt-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">What gets deleted:</p>
              <ul className="text-xs text-slate-500 mt-1 space-y-0.5 font-medium">
                <li>• User account &amp; profile</li>
                <li>• All course enrollments</li>
                <li>• All exam results &amp; submissions</li>
                <li>• All messages &amp; chat history</li>
                <li>• Attendance &amp; ATS records</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteDialog(false)} className="rounded-xl">
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl bg-rose-600 hover:bg-rose-700"
              disabled={isProcessing}
              onClick={async () => {
                if (selectedUser && onDeleteUser) {
                  setIsProcessing(true);
                  await onDeleteUser(selectedUser.id);
                  setIsProcessing(false);
                  setShowDeleteDialog(false);
                  setSelectedUser(null);
                }
              }}
            >
              {isProcessing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting...</> : <><Trash2 className="mr-2 h-4 w-4" /> Yes, Delete Permanently</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attendance History Dialog */}
      <Dialog open={showAttendanceDialog} onOpenChange={setShowAttendanceDialog}>
        <DialogContent className="w-[95vw] sm:max-w-lg p-0 border-0 rounded-[2rem] shadow-2xl bg-white overflow-hidden flex flex-col max-h-[90vh]">
           <DialogHeader className="sr-only">
             <DialogTitle>Attendance Log</DialogTitle>
             <DialogDescription>Viewing attendance history and node verification status.</DialogDescription>
           </DialogHeader>
           <div className="bg-slate-900 px-6 py-5 text-white shrink-0">
             <div className="flex items-center gap-3">
               <div className="h-10 w-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/20">
                 <Fingerprint className="h-5 w-5 text-blue-400" />
               </div>
               <div>
                 <h2 className="text-lg font-black leading-none">Attendance Log</h2>
                 <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-bold">24H Node Monitoring</p>
               </div>
               <div className="ml-auto flex items-center gap-2">
                 <Badge className="bg-emerald-500/10 text-emerald-400 border-none text-[9px] font-black">{attendanceRecords.length} Check-ins</Badge>
               </div>
             </div>
           </div>

           <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
             {loadingAttendance ? (
               <div className="flex flex-col items-center justify-center py-20 gap-4">
                 <Loader2 className="h-8 w-8 animate-spin text-primary" />
                 <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Querying Node History...</p>
               </div>
             ) : attendanceRecords.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                 <Activity className="h-12 w-12 mb-4" />
                 <p className="text-sm font-bold text-slate-900 uppercase">No Activity Detected</p>
                 <p className="text-[10px] font-medium text-slate-500 max-w-[200px] mt-1">This node has not initiated any attendance protocols yet.</p>
               </div>
             ) : (
               <div className="space-y-2">
                 {attendanceRecords.map((record, i) => (
                   <div key={record.id || i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group hover:border-blue-200 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-xl bg-white flex flex-col items-center justify-center border border-slate-200 shadow-sm">
                           <span className="text-[9px] font-black text-slate-400 uppercase leading-none mb-0.5">{record.day}</span>
                           <span className="text-sm font-black text-slate-900 leading-none">{record.date.split('-').pop()}</span>
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-slate-900">{record.date}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Clock className="h-3 w-3 text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{formatTime(record.time)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                         <Badge variant="outline" className="text-[9px] font-black border-slate-200 bg-white text-slate-500">
                           {record.ip_address || '0.0.0.0'}
                         </Badge>
                         <div className="flex items-center gap-1 justify-end mt-1 text-emerald-500">
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="text-[8px] font-black uppercase tracking-tighter">Verified</span>
                         </div>
                      </div>
                   </div>
                 ))}
               </div>
             )}
           </div>

           <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
              <p className="text-[9px] text-slate-400 font-medium">Automatic suspension triggers at 10+ missing days.</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowAttendanceDialog(false)}
                className="h-9 px-6 rounded-xl font-bold text-[10px] uppercase border-slate-200 bg-white"
              >
                Close Logs
              </Button>
           </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}