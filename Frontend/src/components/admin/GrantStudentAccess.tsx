import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { 
  Users, 
  Search, 
  BookOpen, 
  UserPlus, 
  UserCheck, 
  CheckCircle, 
  XCircle, 
  Loader2,
  GraduationCap,
  Mail,
  Plus,
  ArrowRight,
  Briefcase,
  Clock,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWithAuth } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Profile, CourseEnrollment } from '@/hooks/useAdminData';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Course {
  id: string;
  title: string;
  status: string;
  course_type: 'full_time' | 'internship';
}

interface GrantStudentAccessProps {
    profiles?: Profile[];
    enrollments?: CourseEnrollment[];
}

// Map course_type value → human label + visual style
const COURSE_TYPE_META: Record<string, { label: string; icon: React.ElementType; badgeClass: string; filterLabel: string }> = {
  full_time:  { label: 'Full-Time',   icon: GraduationCap, badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',   filterLabel: 'Full-Time Students'   },
  internship: { label: 'Internship',  icon: Briefcase,     badgeClass: 'bg-amber-50 text-amber-700 border-amber-200', filterLabel: 'Internship Students'  },
};

export function GrantStudentAccess({ profiles: propProfiles = [], enrollments: propEnrollments = [], onSync: _onSync, loading: _loading }: GrantStudentAccessProps & { onSync?: () => void; loading?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Profile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // 'all' | 'full_time' | 'internship'
  const [courseTypeFilter, setCourseTypeFilter] = useState<'all' | 'full_time' | 'internship'>('all');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Self-fetch profiles (with roles merged) when not provided by parent
  const { data: fetchedProfiles = [] } = useQuery({
    queryKey: ['grant-access-profiles'],
    queryFn: async () => {
      const [profilesData, rolesData] = await Promise.all([
        fetchWithAuth('/data/profiles?sort=created_at&order=desc&limit=500') as Promise<Profile[]>,
        fetchWithAuth('/data/user_roles?limit=500') as Promise<{ user_id: string; role: string }[]>
      ]);
      const rolesMap = rolesData.reduce((acc, r) => {
        acc[r.user_id] = r.role;
        return acc;
      }, {} as Record<string, string>);
      return profilesData.map(p => {
        const dbRole = rolesMap[p.id] || 'student';
        const displayRole = dbRole === 'student' && p.course_type === 'internship' ? 'intern' : dbRole;
        return { ...p, role: displayRole };
      }) as Profile[];
    },
    enabled: propProfiles.length === 0,
  });

  // Self-fetch enrollments when not provided by parent
  const { data: fetchedEnrollments = [] } = useQuery({
    queryKey: ['grant-access-enrollments'],
    queryFn: async () => {
      const data = await fetchWithAuth('/courses/enrollments');
      return data as CourseEnrollment[];
    },
    enabled: propEnrollments.length === 0,
  });

  const profiles   = propProfiles.length > 0   ? propProfiles   : fetchedProfiles;
  const enrollments = propEnrollments.length > 0 ? propEnrollments : fetchedEnrollments;

  // Fetch all published/approved/active courses
  const { data: courses = [], isLoading: coursesLoading } = useQuery({
    queryKey: ['approved-courses'],
    queryFn: async () => {
      const data = await fetchWithAuth('/data/courses?limit=200');
      return (data as Course[]).filter(c => (c as any).is_active !== false);
    }
  });

  // Filter students: matching role + search query + course_type tab
  const filteredStudents = profiles.filter(profile => {
    const r = profile.role?.toLowerCase() || 'student';
    if (r !== 'student' && r !== 'intern' && r !== 'user') return false;
    if (courseTypeFilter !== 'all' && (profile as any).course_type !== courseTypeFilter) return false;
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      profile.full_name?.toLowerCase().includes(q) ||
      profile.email?.toLowerCase().includes(q) ||
      ((profile as any).college_name || '').toLowerCase().includes(q)
    );
  });

  // Courses available for the selected student — show ALL available courses (CRT, Full-Time, Internship, etc.)
  const availableCourses = courses.filter(course => {
    if (selectedStudent) {
      // Exclude courses that the student is already actively enrolled in
      if (enrollments.some(e => e.user_id === selectedStudent.id && e.course_id === course.id && e.status === 'active')) return false;
    }
    return true;
  });

  // Courses matching the dialog filter (for visual meta)
  const studentCourseType = (selectedStudent as any)?.course_type || 'full_time';
  const courseTypeMeta = COURSE_TYPE_META[studentCourseType] ?? COURSE_TYPE_META.full_time;

  // Grant access mutation
  const grantAccess = useMutation({
    mutationFn: async () => {
      if (!selectedCourse || !selectedStudent) return;
      return fetchWithAuth('/data/course_enrollments', {
        method: 'POST',
        body: JSON.stringify({
          user_id:             selectedStudent.id,
          course_id:           selectedCourse.id,
          status:              'active',
          progress_percentage: 0,
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grant-access-enrollments'] });
      queryClient.invalidateQueries({ queryKey: ['grant-access-profiles'] });
      toast({ title: 'Access Granted', description: `${selectedStudent?.full_name} enrolled in "${selectedCourse?.title}"` });
      setSelectedStudent(null);
      setSelectedCourse(null);
      setIsOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message || 'Failed to grant access', variant: 'destructive' });
    }
  });

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourse(availableCourses.find(c => c.id === courseId) || null);
  };

  const openDialogForStudent = (student: Profile) => {
    setSelectedStudent(student);
    setSelectedCourse(null);
    setIsOpen(true);
  };

  // ── Count helpers for tab badges ──────────────────────────────────────────
  const countByType = (type: string) =>
    profiles.filter(p => {
      const r = p.role?.toLowerCase();
      return (r === 'student' || r === 'intern') &&
        !enrollments.some(e => e.user_id === p.id) &&
        (p as any).course_type === type;
    }).length;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Grant Student Access
            </CardTitle>
            <CardDescription className="max-w-md">
              Assign an <strong>Internship</strong> or <strong>Full-Time</strong> course to students based on the programme they registered for.
            </CardDescription>
          </div>

          {/* Manual enroll trigger */}
          <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) { setSelectedStudent(null); setSelectedCourse(null); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => setSelectedStudent(null)}>
                <Plus className="h-4 w-4" />
                Enroll Student
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <GraduationCap className="h-5 w-5" />
                  Enroll Student in Course
                </DialogTitle>
                <DialogDescription>
                  {selectedStudent
                    ? <>Assigning a <strong>{courseTypeMeta.label}</strong> course to <strong>{selectedStudent.full_name}</strong>.</>
                    : 'Select a student then choose the matching course to grant access.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 py-2">

                {/* ── Student selection (when not pre-selected) ────────────── */}
                {!selectedStudent ? (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500">Select Student</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="border rounded-xl max-h-52 overflow-y-auto bg-slate-50">
                      {filteredStudents.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          {searchQuery ? 'No students found' : 'Type to search students'}
                        </div>
                      ) : (
                        filteredStudents.map(student => {
                          const sType = (student as any).course_type || 'full_time';
                          const sMeta = COURSE_TYPE_META[sType] ?? COURSE_TYPE_META.full_time;
                          return (
                            <div
                              key={student.id}
                              className="flex items-center gap-3 p-3 hover:bg-slate-100 cursor-pointer transition-colors border-b last:border-0"
                              onClick={() => { setSelectedStudent(student); setSelectedCourse(null); }}
                            >
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={student.avatar_url || ''} />
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {student.full_name?.[0]?.toUpperCase() || 'S'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="overflow-hidden flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold truncate">{student.full_name}</p>
                                  <Badge variant="outline" className={`text-[8px] h-4 px-1.5 rounded-md uppercase font-black tracking-tighter ${sMeta.badgeClass}`}>
                                    {sMeta.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-slate-500 truncate">{student.email}</p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── Selected student card ──────────────────────────────── */
                  <div className="rounded-2xl border-2 border-primary bg-primary/5 p-4 relative overflow-hidden">
                    <div className="absolute -top-12 -right-12 h-32 w-32 bg-primary/10 rounded-full blur-3xl animate-pulse" />
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                        <UserCheck className="h-3 w-3" /> Selected Candidate
                      </span>
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 rounded-full bg-white hover:bg-destructive hover:text-white shadow-sm transition-all"
                        onClick={() => { setSelectedStudent(null); setSelectedCourse(null); }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 relative">
                      <div className="relative">
                        <Avatar className="h-14 w-14 border-2 border-white shadow-md">
                          <AvatarImage src={selectedStudent.avatar_url || ''} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-lg font-bold">
                            {selectedStudent.full_name?.[0]?.toUpperCase() || 'S'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow-sm">
                          <CheckCircle className="h-5 w-5 text-emerald-500" />
                        </div>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="font-black text-slate-900 truncate leading-none mb-1">{selectedStudent.full_name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mb-2 truncate">
                          <Mail className="h-3 w-3" />{selectedStudent.email}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge className={`border text-[9px] h-4 px-2 uppercase font-black tracking-tighter ${courseTypeMeta.badgeClass}`}>
                            {courseTypeMeta.label}
                          </Badge>
                          {(selectedStudent as any).college_name && (
                            <span className="text-[10px] text-slate-400 truncate">{(selectedStudent as any).college_name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Course selection ─────────────────────────────────────── */}
                {selectedStudent && (
                  <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-1.5">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      Select Course to Grant Access
                    </Label>
                    {coursesLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm">Loading available courses...</span>
                      </div>
                    ) : availableCourses.length === 0 ? (
                      <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200 text-sm font-medium">
                        Student is already enrolled in all available courses.
                      </div>
                    ) : (
                      <Select value={selectedCourse?.id || ''} onValueChange={handleCourseSelect}>
                        <SelectTrigger className="h-12 rounded-xl bg-background border-slate-200">
                          <div className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="Select a course (CRT Classes, Full-Time, Internship...)" />
                          </div>
                        </SelectTrigger>
                        <SelectContent>
                          {availableCourses.map(course => (
                            <SelectItem key={course.id} value={course.id}>
                              <span className="flex items-center gap-2">
                                {course.course_type === 'internship'
                                  ? <Briefcase className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                  : <GraduationCap className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                                {course.title}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="rounded-xl h-11">Cancel</Button>
                <Button
                  onClick={() => grantAccess.mutate()}
                  disabled={!selectedCourse || !selectedStudent || grantAccess.isPending}
                  className="rounded-xl h-11 px-8 shadow-lg shadow-primary/20"
                >
                  {grantAccess.isPending
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enrolling...</>
                    : <>Grant Access</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* ── Course-Type Filter Tabs ────────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {([
            { key: 'all',        label: 'All Students',        count: profiles.filter(p => { const r = p.role?.toLowerCase(); return (r === 'student' || r === 'intern') && !enrollments.some(e => e.user_id === p.id); }).length },
            { key: 'full_time',  label: 'Full-Time',           count: countByType('full_time') },
            { key: 'internship', label: 'Internship',          count: countByType('internship') },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setCourseTypeFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${
                courseTypeFilter === tab.key
                  ? 'bg-primary text-white border-primary shadow-md shadow-primary/20'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-primary/40 hover:text-primary'
              }`}
            >
              {tab.key === 'full_time' && <GraduationCap className="h-3 w-3" />}
              {tab.key === 'internship' && <Briefcase className="h-3 w-3" />}
              {tab.key === 'all' && <Users className="h-3 w-3" />}
              {tab.label}
              <span className={`rounded-full px-1.5 text-[10px] font-black ${courseTypeFilter === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {/* ── Search bar ──────────────────────────────────────────────────── */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search students by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>

        {/* ── Student Grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredStudents.map(student => {
            const sType = (student as any).course_type || 'full_time';
            const sMeta = COURSE_TYPE_META[sType] ?? COURSE_TYPE_META.full_time;
            const SIcon = sMeta.icon;
            return (
              <div
                key={student.id}
                className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-2xl border border-slate-200 bg-white hover:border-primary/30 hover:shadow-md transition-all group overflow-hidden"
              >
                <div className="flex items-center gap-3 w-full sm:w-auto overflow-hidden">
                  <Avatar className="h-11 w-11 border-2 border-slate-100 shrink-0">
                    <AvatarImage src={student.avatar_url} />
                    <AvatarFallback className="bg-primary/5 text-primary font-bold text-sm">
                      {student.full_name?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 overflow-hidden">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-sm font-black text-slate-900 truncate leading-none">{student.full_name}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate mb-1.5">{student.email}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-[9px] h-4 px-1.5 rounded-md uppercase font-black tracking-tighter flex items-center gap-0.5 ${sMeta.badgeClass}`}>
                        <SIcon className="h-2.5 w-2.5" />
                        {sMeta.label}
                      </Badge>
                      {(student as any).college_name && (
                        <span className="text-[9px] text-slate-400 truncate max-w-[120px]">{(student as any).college_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full sm:w-auto sm:ml-auto h-9 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl shadow-none transition-all font-bold shrink-0"
                  onClick={() => openDialogForStudent(student)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1 shrink-0" />
                  Assign
                  <ArrowRight className="h-3.5 w-3.5 ml-1 hidden sm:block transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* Empty states */}
        {filteredStudents.length === 0 && searchQuery && (
          <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-xl mt-2">
            <Search className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="font-semibold">No students match &ldquo;{searchQuery}&rdquo;</p>
          </div>
        )}
        {filteredStudents.length === 0 && !searchQuery && (
          <div className="text-center py-14 text-muted-foreground border-2 border-dashed rounded-3xl bg-slate-50/50 mt-2">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <h3 className="font-bold text-slate-800 text-lg">No Students Awaiting Access</h3>
            <p className="text-sm max-w-xs mx-auto mt-2">
              {courseTypeFilter !== 'all'
                ? `All ${COURSE_TYPE_META[courseTypeFilter]?.filterLabel ?? courseTypeFilter} have been enrolled.`
                : 'All registered students have already been enrolled. New students will appear here after signup.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}