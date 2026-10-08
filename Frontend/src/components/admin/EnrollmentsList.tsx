import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, 
  Search, 
  BookOpen, 
  Calendar, 
  CreditCard,
  Globe,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Fingerprint,
  Loader2,
  Trash2,
  Eye,
  GraduationCap,
  MoreVertical,
  Copy,
  Check,
  ShieldCheck,
  Zap,
  TrendingUp,
  ArrowRight,
  RotateCcw
} from "lucide-react";
import { SyncDataButton } from "./data/SyncDataButton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { CourseEnrollment } from "@/hooks/useCourses";

interface EnrollmentsListProps {
  enrollments: CourseEnrollment[];
  loading: boolean;
  onUpdateStatus?: (id: string, status: 'active' | 'rejected') => Promise<void>;
  onUpdatePayment?: (id: string, term: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onResetATS?: (userId: string) => Promise<void>;
  onSync?: () => void;
}

export function EnrollmentsList({ 
  enrollments, 
  loading, 
  onUpdateStatus, 
  onUpdatePayment, 
  onDelete, 
  onResetATS,
  onSync
}: EnrollmentsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTimeframe, setFilterTimeframe] = useState("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedEnrollment, setSelectedEnrollment] = useState<CourseEnrollment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const safeParsePrice = (price?: string | number) => {
    if (!price) return 0;
    if (typeof price === 'number') return price;
    const cleaned = price.toString().replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const EnrollmentAvatar = ({ enrollment }: { enrollment: CourseEnrollment }) => {
    const avatar = enrollment.user_avatar || (enrollment as any).profile?.avatar_url;
    const name = getEnrollmentFullName(enrollment) || 'U';

    if (avatar) {
      return (
        <div className="relative group">
          <div className="h-14 w-14 rounded-2xl overflow-hidden border border-slate-100 shadow-lg bg-slate-50 transition-transform duration-500 group-hover:scale-110">
            <img 
              src={avatar} 
              alt={name} 
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-slate-900 border-2 border-white shadow-sm flex items-center justify-center">
             <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
          </div>
        </div>
      );
    }

    return (
      <div className={cn(
        "h-14 w-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner border border-slate-100 transition-all duration-500 hover:scale-110",
        "bg-slate-900 text-white"
      )}>
         {name.charAt(0).toUpperCase()}{name.split(' ').length > 1 ? name.split(' ')[1].charAt(0).toUpperCase() : ''}
      </div>
    );
  };

  const copyToClipboard = async (text: string, enrollmentId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(enrollmentId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleUpdateStatus = async (id: string, status: 'active' | 'rejected') => {
    if (!onUpdateStatus) return;
    setProcessingId(id);
    try {
      await onUpdateStatus(id, status);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!onDelete) return;
    setProcessingId(id);
    try {
      await onDelete(id);
    } finally {
      setProcessingId(null);
    }
  };

  const getEnrollmentFullName = (e: CourseEnrollment): string => {
    if (e.user_name) return e.user_name;
    if ((e as any).student_name) return (e as any).student_name;
    if ((e as any).profile?.full_name) return (e as any).profile.full_name;
    if (typeof e.user_id === 'object' && (e.user_id as any)?.full_name) return (e.user_id as any).full_name;
    if (typeof e.user_id === 'object' && (e.user_id as any)?.email) return (e.user_id as any).email.split('@')[0];
    if (e.user_email) return e.user_email.split('@')[0];
    if (typeof e.user_id === 'string' && e.user_id) return e.user_id;
    return 'Student';
  };

  const formatShortName = (rawName?: string, maxLen = 9): string => {
    if (!rawName) return 'Student';
    const name = String(rawName).trim();
    if (!name) return 'Student';

    // If email address, strip the domain
    const cleanName = name.includes('@') ? name.split('@')[0] : name;
    if (cleanName.length <= maxLen) return cleanName;

    // If multiple words (e.g. John Doe)
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const first = parts[0];
      if (first.length <= maxLen) {
        const withInitial = `${first} ${parts[1][0]}.`;
        if (withInitial.length <= maxLen) {
          return withInitial;
        }
        return first;
      }
      return first.slice(0, maxLen);
    }

    // Single long word / ID / hash like xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -> xxxxxxxxx
    return cleanName.slice(0, maxLen);
  };

  const getEnrollmentShortName = (e: CourseEnrollment): string => {
    return formatShortName(getEnrollmentFullName(e));
  };

  const getUserIdString = (uid: any): string => {
    if (!uid) return '';
    if (typeof uid === 'object') return uid._id || uid.id || '';
    return String(uid);
  };

  const formatShortId = (id?: string) => {
    if (!id) return 'N/A';
    if (id.length <= 10) return id;
    return `${id.slice(0, 4)}...${id.slice(-4)}`;
  };

  const getEnrollmentName = (e: CourseEnrollment) => getEnrollmentFullName(e);
  const getEnrollmentEmail = (e: CourseEnrollment) => e.user_email || (e as any).student_email || (e as any).profile?.email || (typeof e.user_id === 'object' ? (e.user_id as any)?.email : 'N/A');
  const getCourseName = (e: CourseEnrollment) => e.course_name || (e as any).course_title || (e as any).course?.title || 'Unknown Course';
  const getAvatarUrl = (e: CourseEnrollment) => e.user_avatar || (e as any).student_avatar || (e as any).profile?.avatar_url || null;

  const courses = [...new Set((enrollments || []).map(e => getCourseName(e)).filter(Boolean))];

  const filteredEnrollments = (enrollments || []).filter(e => {
    const fullName = getEnrollmentFullName(e);
    const shortName = getEnrollmentShortName(e);
    const userEmail = getEnrollmentEmail(e);
    const courseName = getCourseName(e);
    const userId = getUserIdString(e.user_id);
    
    const matchesSearch = 
      fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      shortName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      courseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      userId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCourse = filterCourse === "all" || courseName === filterCourse;
    const matchesStatus = filterStatus === "all" || e.status === filterStatus;

    let matchesTimeframe = true;
    if (filterTimeframe !== 'all') {
      const enrollmentDate = new Date(e.enrolled_at || (e as any).enrollment_date || 0);
      const now = new Date();
      
      switch (filterTimeframe) {
        case 'day':
          matchesTimeframe = enrollmentDate.toDateString() === now.toDateString();
          break;
        case 'week': {
          const weekAgo = new Date();
          weekAgo.setDate(now.getDate() - 7);
          matchesTimeframe = enrollmentDate >= weekAgo;
          break;
        }
        case 'month': {
          const monthAgo = new Date();
          monthAgo.setMonth(now.getMonth() - 1);
          matchesTimeframe = enrollmentDate >= monthAgo;
          break;
        }
        case 'year': {
          const yearAgo = new Date();
          yearAgo.setFullYear(now.getFullYear() - 1);
          matchesTimeframe = enrollmentDate >= yearAgo;
          break;
        }
        case 'custom': {
          if (customFrom) {
            const from = new Date(customFrom);
            from.setHours(0, 0, 0, 0);
            matchesTimeframe = enrollmentDate >= from;
          }
          if (customTo) {
            const to = new Date(customTo);
            to.setHours(23, 59, 59, 999);
            matchesTimeframe = matchesTimeframe && enrollmentDate <= to;
          }
          break;
        }
      }
    }

    return matchesSearch && matchesCourse && matchesStatus && matchesTimeframe;
  });

  const totalValue = filteredEnrollments.reduce((acc, e) => {
    const full = safeParsePrice(e.final_price || e.price);
    const paid = (e.payment_term === 'full' || e.payment_term === 'term2') ? full : 
                 (e.payment_term === 'term1') ? Math.round(full * 0.6) : 0;
    return acc + paid;
  }, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 rounded-full border border-slate-800 shadow-lg shadow-slate-200">
            <CheckCircle className="h-3 w-3 text-white" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Approved</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-full border border-slate-200">
            <XCircle className="h-3 w-3 text-slate-400" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rejected</span>
          </div>
        );
      case 'pending':
      default:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full border border-slate-200">
            <Clock className="h-3 w-3 text-slate-500 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Pending</span>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-[2rem]" />)}
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { icon: Users, label: "Total Enrollments", value: filteredEnrollments.length, color: "text-slate-900", bg: "bg-slate-100" },
          { icon: BookOpen, label: "Active Courses", value: courses.length, color: "text-slate-900", bg: "bg-slate-100" },
          { icon: TrendingUp, label: "Active Students", value: new Set(filteredEnrollments.map(e => e.user_id)).size, color: "text-slate-900", bg: "bg-slate-100" },
          { icon: CreditCard, label: "Total Revenue", value: `₹${totalValue.toLocaleString('en-IN')}`, color: "text-slate-900", bg: "bg-slate-100" },
        ].map((stat, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i}
          >
            <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/40 bg-white/80 backdrop-blur-md hover:translate-y-[-5px] transition-all duration-300">
              <CardContent className="p-6">
                <div className="flex items-center gap-5">
                  <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3", stat.bg)}>
                    <stat.icon className={cn("h-7 w-7", stat.color)} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-2xl font-black tracking-tight text-slate-900">{stat.value}</p>
                    <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter flex items-center gap-3">
             <div className="h-10 px-2 rounded-xl bg-slate-900 text-white text-xs flex items-center justify-center font-bold">LMS</div>
             Enrollment Hub
          </h2>
          <p className="text-sm font-bold text-slate-400">Manage and verify institutional admission pipelines</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by student name or course..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-14 w-full bg-white border-none shadow-xl shadow-slate-200/20 rounded-2xl focus-visible:ring-2 focus-visible:ring-emerald-600 transition-all font-bold text-slate-900"
            />
          </div>
          
          {onSync && (
            <SyncDataButton 
              onSync={onSync} 
              isLoading={loading} 
              className="h-14 px-8 shadow-xl shadow-emerald-200/50"
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Select value={filterCourse} onValueChange={setFilterCourse}>
              <SelectTrigger className="h-12 w-44 rounded-2xl bg-white border-none shadow-xl shadow-slate-200/20 font-bold">
                 <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-2xl">
                <SelectItem value="all">All Courses</SelectItem>
                {courses.map(course => (
                  <SelectItem key={course} value={course}>{course}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-12 w-40 rounded-2xl bg-white border-none shadow-xl shadow-slate-200/20 font-bold">
                 <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-2xl">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterTimeframe} onValueChange={(v) => { setFilterTimeframe(v); if (v !== 'custom') { setCustomFrom(''); setCustomTo(''); } }}>
              <SelectTrigger className="h-12 w-40 rounded-2xl bg-white border-none shadow-xl shadow-slate-200/20 font-bold">
                 <SelectValue placeholder="Timeframe" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl border-none shadow-2xl">
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="day">Today</SelectItem>
                <SelectItem value="week">Past Week</SelectItem>
                <SelectItem value="month">Past Month</SelectItem>
                <SelectItem value="year">Past Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {filterTimeframe === 'custom' && (
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-xl shadow-slate-200/20 border border-slate-100 flex-shrink-0 animate-in slide-in-from-right-4">
                <Calendar className="h-4 w-4 text-slate-400" />
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 border-none bg-transparent font-bold text-[10px] w-28 p-0 focus-visible:ring-0" />
                <div className="h-3 w-px bg-slate-200 mx-1" />
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 border-none bg-transparent font-bold text-[10px] w-28 p-0 focus-visible:ring-0" />
              </div>
            )}
          </div>
        </div>
      </div>
            
      <div className="min-h-[400px]">
        {filteredEnrollments.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 bg-white rounded-[3rem] border-4 border-dashed border-slate-100"
          >
            <div className="h-24 w-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
              <Users className="h-10 w-10 text-slate-200" />
            </div>
            <p className="text-lg font-black text-slate-300 uppercase tracking-widest">No matching records found</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            <div className="hidden xl:block">
              <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200/50 overflow-hidden border border-slate-100">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-8 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] w-[30%]">Student Profile</th>
                      <th className="px-6 py-8 text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] w-[18%]">Enrolled Course</th>
                      <th className="px-4 py-8 text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] text-center w-[12%]">Term 1</th>
                      <th className="px-4 py-8 text-[11px] font-black text-slate-800 uppercase tracking-[0.2em] text-center w-[12%]">Term 2</th>
                      <th className="px-8 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] w-[18%]">Payment Summary</th>
                      <th className="px-8 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] text-right w-[10%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    <AnimatePresence mode="popLayout">
                      {filteredEnrollments.map((enrollment, index) => {
                        const fullFee = safeParsePrice(enrollment.final_price || enrollment.price);
                        const isPaidFull = enrollment.payment_term === 'full';
                        const isTerm1 = enrollment.payment_term === 'term1';
                        const isTerm2 = enrollment.payment_term === 'term2';
                        const term1Fee = Math.round(fullFee * 0.6);
                        const term2Fee = Math.round(fullFee * 0.4);
                        const depositedValue = isPaidFull || isTerm2 ? fullFee : isTerm1 ? term1Fee : 0;

                        return (
                          <motion.tr 
                            layout
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ delay: index * 0.05 }}
                            key={enrollment.id} 
                            className="hover:bg-slate-50/50 transition-colors group"
                          >
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-5">
                                <EnrollmentAvatar enrollment={enrollment} />
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-3">
                                    <h4 
                                      title={getEnrollmentFullName(enrollment)}
                                      className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors whitespace-nowrap cursor-default"
                                    >
                                      {getEnrollmentShortName(enrollment)}
                                    </h4>
                                    {getStatusBadge(enrollment.status || 'pending')}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] font-bold text-slate-900 bg-slate-50/80 px-2 py-1 rounded-lg w-fit">
                                    <Calendar className="h-3 w-3 text-indigo-500" />
                                    <span>
                                      {(enrollment.enrolled_at || (enrollment as any).enrollment_date) 
                                        ? new Date(enrollment.enrolled_at || (enrollment as any).enrollment_date).toLocaleDateString('en-GB') + ' | ' + new Date(enrollment.enrolled_at || (enrollment as any).enrollment_date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                        : 'N/A'
                                      }
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-900 group-hover:text-slate-600 transition-colors">
                                    <Fingerprint className="h-3 w-3" />
                                    <span className="truncate max-w-[120px]" title={getUserIdString(enrollment.user_id)}>
                                      {formatShortId(getUserIdString(enrollment.user_id))}
                                    </span>
                                    <button
                                      onClick={() => copyToClipboard(getUserIdString(enrollment.user_id), enrollment.id)}
                                      className="p-1 hover:bg-white rounded-md transition-all text-indigo-500"
                                      title="Copy User ID"
                                    >
                                      {copiedId === enrollment.id ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-6 font-black">
                              <div className="space-y-2">
                                <p className="text-xs text-slate-900 leading-tight uppercase tracking-tight">
                                  {enrollment.course_name || (enrollment as any).course?.title}
                                </p>
                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 w-fit">
                                  <Globe className="h-2.5 w-2.5 text-slate-400" />
                                  <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Course Bundle</span>
                                </div>
                                {(enrollment as any).requested_time_slot && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-50 w-fit border border-indigo-100">
                                    <Clock className="h-2.5 w-2.5 text-indigo-500" />
                                    <span className="text-[8px] font-black uppercase text-indigo-700 tracking-wider">Req: {(enrollment as any).requested_time_slot}</span>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-6 text-center">
                              <div className="space-y-1.5">
                                <p className="text-sm font-black text-indigo-600 tracking-tighter italic">₹{term1Fee.toLocaleString('en-IN')}</p>
                                <Badge className={cn(
                                  "rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-none shadow-sm",
                                  (isTerm1 || isTerm2 || isPaidFull) ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400 animate-pulse"
                                )}>
                                  {(isTerm1 || isTerm2 || isPaidFull) ? "Cleared" : "Pending"}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-4 py-6 text-center">
                              <div className="space-y-1.5">
                                <p className={cn(
                                  "text-sm font-black tracking-tighter italic",
                                  (isTerm2 || isPaidFull) ? "text-emerald-600" : isTerm1 ? "text-amber-500" : "text-slate-300"
                                )}>
                                  ₹{(isTerm2 || isPaidFull) ? term2Fee.toLocaleString('en-IN') : (safeParsePrice((enrollment as any).remaining_balance) || term2Fee).toLocaleString('en-IN')}
                                </p>
                                <Badge className={cn(
                                  "rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-none shadow-sm",
                                  (isTerm2 || isPaidFull) ? "bg-emerald-50 text-emerald-600" : isTerm1 ? "bg-amber-50 text-amber-600 animate-pulse" : "bg-slate-100 text-slate-300"
                                )}>
                                  {(isTerm2 || isPaidFull) ? "Cleared" : isTerm1 ? "Awaited" : "Locked"}
                                </Badge>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                  <div className="space-y-0.5">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Deposited</p>
                                    <p className="text-xs font-black text-emerald-600 tracking-tighter">₹{depositedValue.toLocaleString('en-IN')}</p>
                                  </div>
                                  <div className="space-y-0.5 text-right font-black">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Value</p>
                                    <p className="text-xs text-slate-900 tracking-tighter italic">₹{fullFee.toLocaleString('en-IN')}</p>
                                  </div>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/20">
                                  <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, (depositedValue / (fullFee || 1)) * 100)}%` }}
                                    className="h-full bg-indigo-600 rounded-full shadow-[0_0_15px_rgba(79,70,229,0.3)]" />
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <div className="flex items-center justify-end gap-3 transition-all duration-300">
                                {enrollment.status === 'pending' || !enrollment.status ? (
                                  <Button 
                                    onClick={() => handleUpdateStatus(enrollment.id, 'active')}
                                    disabled={processingId === enrollment.id}
                                    className="h-10 px-5 bg-slate-900 text-white font-black uppercase tracking-widest text-[9px] rounded-xl hover:bg-indigo-600 transition-all shadow-xl"
                                  >
                                    {processingId === enrollment.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve"}
                                  </Button>
                                ) : (
                                  <Button 
                                    onClick={() => setSelectedEnrollment(enrollment)}
                                    className="h-11 w-11 p-0 bg-white shadow-lg shadow-slate-200/50 text-indigo-600 rounded-2xl hover:scale-110 active:scale-95 transition-all border border-slate-50"
                                  >
                                    <Eye className="h-5 w-5" />
                                  </Button>
                                )}
                                
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-11 w-11 rounded-2xl text-slate-300 hover:text-slate-600 hover:bg-slate-50 transition-all">
                                      <MoreVertical className="h-5 w-5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="rounded-2xl p-2 border-none shadow-2xl w-52 bg-white/95 backdrop-blur-md">
                                    <DropdownMenuItem onClick={() => setSelectedEnrollment(enrollment)} className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-800 focus:bg-slate-900 focus:text-white transition-colors cursor-pointer">
                                      <Eye className="h-4 w-4 mr-3 text-indigo-500" /> View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleUpdateStatus(enrollment.id, 'active')} className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-600 focus:bg-emerald-600 focus:text-white transition-colors cursor-pointer">
                                      <ShieldCheck className="h-4 w-4 mr-3" /> Approve Access
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleUpdateStatus(enrollment.id, 'rejected')} className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-orange-600 focus:bg-orange-600 focus:text-white transition-colors cursor-pointer">
                                      <XCircle className="h-4 w-4 mr-3" /> Deny Access
                                    </DropdownMenuItem>
                                    <div className="h-px bg-slate-100 my-2" />
                                    <DropdownMenuItem 
                                      onClick={() => enrollment.user_id && onResetATS?.(enrollment.user_id)} 
                                      className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-600 focus:bg-amber-600 focus:text-white transition-colors cursor-pointer"
                                    >
                                      <RotateCcw className="h-4 w-4 mr-3" /> Reset ATS Score
                                    </DropdownMenuItem>
                                    <div className="h-px bg-slate-100 my-2" />
                                    <DropdownMenuItem onClick={() => handleDelete(enrollment.id)} className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-600 focus:bg-rose-600 focus:text-white transition-colors cursor-pointer">
                                      <Trash2 className="h-4 w-4 mr-3" /> Remove Record
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredEnrollments.map((enrollment, index) => {
                const fullFee = safeParsePrice(enrollment.final_price || enrollment.price);
                const term1Fee = Math.round(fullFee * 0.6);
                const term2Fee = Math.round(fullFee * 0.4);
                const isPaidFull = enrollment.payment_term === 'full';
                const isTerm1 = enrollment.payment_term === 'term1';
                const isTerm2 = enrollment.payment_term === 'term2';
                const depositedValue = isPaidFull || isTerm2 ? fullFee : isTerm1 ? term1Fee : 0;

                return (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    key={enrollment.id}
                    className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 overflow-hidden flex flex-col group hover:border-indigo-600/30 transition-all duration-500"
                  >
                    <div className="p-7 space-y-7 flex-1">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-4">
                          <EnrollmentAvatar enrollment={enrollment} />
                          <div className="space-y-1">
                            <h4 
                              title={getEnrollmentFullName(enrollment)}
                              className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight cursor-default"
                            >
                              {getEnrollmentShortName(enrollment)}
                            </h4>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[140px]" title={getEnrollmentEmail(enrollment)}>
                              {getEnrollmentEmail(enrollment)}
                            </p>
                          </div>
                        </div>
                        {getStatusBadge(enrollment.status || 'pending')}
                      </div>

                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Enrolled Course</p>
                        <h5 className="text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">
                          {enrollment.course_name || (enrollment as any).course?.title}
                        </h5>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-indigo-500 tracking-widest pt-1">
                          <Globe className="h-3 w-3" />
                          <span>Course Bundle Access</span>
                        </div>
                      </div>

                      <div className="bg-slate-50/50 p-5 rounded-3xl space-y-4 border border-slate-100">
                        <div className="flex justify-between items-end">
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financial Status</p>
                            <div className="flex items-center gap-3">
                              <span className="text-xl font-black text-slate-900 italic tracking-tighter">₹{depositedValue.toLocaleString('en-IN')}</span>
                              <span className="text-xs font-bold text-slate-300 line-through">₹{fullFee.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                             <div className="flex gap-2 justify-end">
                                <Badge variant="outline" className={cn(
                                  "rounded-lg px-2 py-0 text-[8px] font-black uppercase tracking-widest border-slate-100",
                                  isTerm1 || isTerm2 || isPaidFull ? "bg-slate-900 text-white" : "bg-white text-slate-300"
                                )}>T1</Badge>
                                <Badge variant="outline" className={cn(
                                  "rounded-lg px-2 py-0 text-[8px] font-black uppercase tracking-widest border-slate-100",
                                  isTerm2 || isPaidFull ? "bg-slate-900 text-white" : "bg-white text-slate-300"
                                )}>T2</Badge>
                             </div>
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Terms Cleared</p>
                          </div>
                        </div>
                        <div className="relative h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                           <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${Math.min(100, (depositedValue / (fullFee || 1)) * 100)}%` }}
                             className="h-full bg-slate-900 rounded-full shadow-[0_0_10px_rgba(15,23,42,0.2)]"
                           />
                        </div>
                      </div>

                      <div className="flex items-center lg:justify-end gap-3">
                        <Button 
                          onClick={() => setSelectedEnrollment(enrollment)}
                          className="flex-1 h-12 px-6 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                        >
                           <Eye className="h-5 w-5 mr-2" />
                           <span className="text-[10px] font-black uppercase tracking-widest">Review</span>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-12 w-12 rounded-2xl border border-slate-100 text-slate-400">
                              <MoreVertical className="h-5 w-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl border-none shadow-2xl bg-white/95 backdrop-blur-md">
                            <DropdownMenuItem 
                              onClick={() => handleUpdateStatus(enrollment.id, 'active')}
                              className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-900 hover:text-white transition-colors cursor-pointer"
                            >
                               <ShieldCheck className="h-4 w-4 mr-3" /> Approve Access
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleUpdateStatus(enrollment.id, 'rejected')}
                              className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                               <XCircle className="h-4 w-4 mr-3" /> Reject Access
                            </DropdownMenuItem>
                            <div className="h-px bg-slate-100 my-2" />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(enrollment.id)}
                              className="rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                               <Trash2 className="h-4 w-4 mr-3" /> Delete Record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedEnrollment} onOpenChange={(open) => !open && setSelectedEnrollment(null)}>
        <DialogContent className="w-[95vw] sm:max-w-4xl h-[92vh] p-0 overflow-hidden bg-[#fafafa] border-none shadow-[0_50px_200px_rgba(0,0,0,0.15)] rounded-[3rem] flex flex-col">
          <div className="flex-1 overflow-y-auto scrollbar-none pb-20">
            <div className="flex flex-col md:flex-row min-h-full">
              <div className="w-full md:w-80 bg-white p-12 md:border-r border-slate-100 flex flex-col shrink-0">
                <div className="space-y-12">
                  <div className="space-y-4">
                    <Badge className="bg-indigo-600 text-white rounded-lg px-3 py-1 text-[9px] uppercase font-black tracking-widest border-none shadow-lg shadow-indigo-200">Management Panel</Badge>
                    <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-[0.9]">Enrollment<br /><span className="text-indigo-600">Details</span></h3>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" /> Transaction (UTR) ID
                      </label>
                      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100 shadow-inner">
                        <span className="text-sm font-mono font-black text-slate-900 tracking-wider break-all leading-relaxed">{selectedEnrollment?.utr_number || "NO_UTR_DATA"}</span>
                      </div>
                    </div>

                    <div className="space-y-6 pt-2">
                      <div className="flex items-center gap-4 group">
                        <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center shadow-lg transition-transform group-hover:scale-110">
                          <Users className="h-6 w-6 text-white" />
                        </div>
                        <div className="space-y-0.5">
                          <p 
                            title={selectedEnrollment ? getEnrollmentFullName(selectedEnrollment) : 'Unknown Student'}
                            className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight"
                          >
                            {selectedEnrollment ? getEnrollmentShortName(selectedEnrollment) : 'Unknown Student'}
                          </p>
                          {selectedEnrollment && getEnrollmentFullName(selectedEnrollment) !== getEnrollmentShortName(selectedEnrollment) && (
                            <p className="text-[11px] font-medium text-slate-400 truncate max-w-[200px]" title={getEnrollmentFullName(selectedEnrollment)}>
                              {getEnrollmentFullName(selectedEnrollment)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 group">
                        <div className="h-12 w-12 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-xl transition-transform group-hover:scale-110">
                          <GraduationCap className="h-6 w-6 text-indigo-600" />
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-base font-black text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">
                            {selectedEnrollment ? getCourseName(selectedEnrollment) : 'Unknown Course'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5 pt-4 border-t border-slate-100">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Financial Breakdown (60/40)</p>
                      <div className="grid grid-cols-1 gap-4">
                        {(() => {
                          const full = safeParsePrice(selectedEnrollment?.final_price || selectedEnrollment?.price);
                          const term1 = Math.round(full * 0.6);
                          const term2 = Math.round(full * 0.4);
                          const pTerm = selectedEnrollment?.payment_term;

                          return (
                            <>
                              <div className="flex items-center justify-between p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/50">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Term 01 (60%)</p>
                                  <p className="text-lg font-black text-indigo-900 italic">₹{term1.toLocaleString('en-IN')}</p>
                                </div>
                                <Badge className={cn(
                                  "rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest border-none",
                                  (pTerm === 'full' || pTerm === 'term1' || pTerm === 'term2') ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"
                                )}>
                                  {(pTerm === 'full' || pTerm === 'term1' || pTerm === 'term2') ? "Cleared" : "Pending"}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between p-4 rounded-2xl bg-amber-50/50 border border-amber-100/50">
                                <div className="space-y-1">
                                  <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Term 02 (40%)</p>
                                  <p className="text-lg font-black text-amber-900 italic">₹{term2.toLocaleString('en-IN')}</p>
                                </div>
                                <Badge
                                  onClick={() => {
                                    if (pTerm === 'term1' || (pTerm === 'term2' && selectedEnrollment?.status === 'pending')) {
                                      const msg = pTerm === 'term1' ?
                                        'Trigger Term 2 payment requirement for this student?' :
                                        'Confirm final payment receipt and Activate student?';

                                      if (window.confirm(msg)) {
                                        onUpdatePayment?.(selectedEnrollment!.id, 'term2');
                                        setSelectedEnrollment({
                                          ...selectedEnrollment!,
                                          payment_term: 'term2',
                                          status: pTerm === 'term1' ? 'deactivate' : 'active'
                                        });
                                      }
                                    }
                                  }}
                                  className={cn(
                                    "rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest border-none transition-all",
                                    (pTerm === 'full' || (pTerm === 'term2' && selectedEnrollment?.status === 'active')) ? "bg-emerald-600 text-white" :
                                      (pTerm === 'term1') ? "bg-amber-600 text-white animate-pulse cursor-pointer hover:scale-105 active:scale-95" :
                                        (pTerm === 'term2' && selectedEnrollment?.status === 'pending') ? "bg-blue-600 text-white animate-pulse cursor-pointer hover:scale-105 active:scale-95" :
                                          (pTerm === 'term2' && selectedEnrollment?.status === 'deactivate') ? "bg-rose-500 text-white" :
                                            "bg-slate-200 text-slate-400"
                                  )}
                                >
                                  {(pTerm === 'full' || (pTerm === 'term2' && selectedEnrollment?.status === 'active')) ? "Cleared" :
                                    (pTerm === 'term1') ? "Confirm Pay?" :
                                      (pTerm === 'term2' && selectedEnrollment?.status === 'pending') ? "Clear Now?" :
                                        (pTerm === 'term2' && selectedEnrollment?.status === 'deactivate') ? "Awaiting Pay" :
                                          "Locked"}
                                </Badge>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 p-8 md:p-14">
                <div className="h-full bg-white rounded-[3rem] p-10 shadow-2xl shadow-slate-200/50 flex flex-col border border-slate-100 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8">
                    <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                      <CreditCard className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center relative z-10">
                    {selectedEnrollment?.payment_proof_url ? (
                      <div className="relative group/proof cursor-zoom-in max-w-full">
                        <img
                          src={selectedEnrollment.payment_proof_url}
                          alt="Payment Proof"
                          className="max-h-[45vh] lg:max-h-[55vh] rounded-[2rem] object-contain shadow-[0_30px_60px_rgba(0,0,0,0.12)] transition-all duration-700 group-hover/proof:scale-[1.03]" />
                        <div className="absolute inset-0 bg-indigo-600/0 group-hover/proof:bg-indigo-600/5 transition-all duration-700 rounded-[2rem]" />
                      </div>
                    ) : (
                      <div className="text-center space-y-6 py-20 opacity-20">
                        <div className="h-32 w-32 mx-auto rounded-full bg-slate-100 flex items-center justify-center border-4 border-dashed border-slate-200">
                          <RefreshCw className="h-10 w-10 text-slate-400" />
                        </div>
                        <p className="font-black text-slate-400 uppercase tracking-[0.3em] text-[10px]">No Payment Document</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-10 p-6 bg-slate-50/50 rounded-3xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Proof Verified</p>
                    </div>
                    <Badge className="bg-emerald-50 text-emerald-600 border-none px-3 font-black text-[9px] uppercase tracking-tighter">Verified</Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-8 bg-white/80 backdrop-blur-xl border-t border-slate-100 flex flex-wrap justify-end gap-5 rounded-b-[3rem] z-20">
            <Button variant="ghost" onClick={() => setSelectedEnrollment(null)} className="text-slate-400 font-black uppercase tracking-widest text-[10px] h-14 px-8 rounded-2xl hover:bg-slate-50 transition-all">Close Viewer</Button>
            
            {selectedEnrollment?.status === 'pending' && (
              <>
                <Button 
                  variant="destructive"
                  className="rounded-2xl h-14 px-8 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-rose-100 border-none transition-all hover:translate-y-[-4px]" 
                  onClick={() => { if(selectedEnrollment) handleUpdateStatus(selectedEnrollment.id, 'rejected'); setSelectedEnrollment(null); }}
                >
                  Reject Admission
                </Button>
                <Button 
                  className="bg-indigo-600 hover:bg-slate-900 text-white rounded-2xl h-14 px-12 font-black uppercase tracking-widest text-[10px] transition-all shadow-2xl shadow-indigo-200 hover:translate-y-[-4px] active:translate-y-0" 
                  onClick={() => { if(selectedEnrollment) handleUpdateStatus(selectedEnrollment.id, 'active'); setSelectedEnrollment(null); }}
                >
                  Approve Enrollment
                  <ArrowRight className="h-4 w-4 ml-3" />
                </Button>
              </>
            )}

            {selectedEnrollment?.status === 'active' && (
              <div className="flex items-center gap-3 px-6 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/50">
                 <ShieldCheck className="h-5 w-5" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Enrolled & Active</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
