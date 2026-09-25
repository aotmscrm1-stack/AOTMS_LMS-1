import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "@/lib/api";
import { useInstructorCourses, Course } from "@/hooks/useInstructorData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Filter,
  GraduationCap,
  HelpCircle,
  Layers,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  User,
  Users,
  XCircle,
  Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface StudentResultItem {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  student_avatar: string;
  student_college?: string;
  batch_name?: string;
  batch_type?: string;
  course_id: string;
  course_title: string;
  test_title: string;
  exam_type?: string;
  score: number;
  total_questions: number;
  total_marks: number;
  passing_marks: number;
  percentage: number;
  passed: boolean;
  grading_status: string;
  time_spent: number;
  submitted_at: string;
  questions_count?: number;
  questions_snapshot: Array<{
    question_id?: string;
    question_text: string;
    type?: string;
    correct_answer?: string;
    student_answer?: string;
    marks?: number;
    is_correct?: boolean;
    options?: Array<{
      id?: string;
      _id?: string;
      text?: string;
      option_text?: string;
      is_correct?: boolean;
    }>;
  }>;
}

interface ResultsApiResponse {
  summary: {
    total_submissions: number;
    unique_students: number;
    avg_percentage: number;
    pass_rate: number;
    top_score: number;
  };
  results: StudentResultItem[];
}

export function InstructorStudentResults() {
  const { data: courses = [], isLoading: coursesLoading } = useInstructorCourses();
  const [selectedCourseId, setSelectedCourseId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "failed" | "pending">("all");
  const [sortBy, setSortBy] = useState<"newest" | "highest" | "lowest">("newest");
  const [selectedResult, setSelectedResult] = useState<StudentResultItem | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);

  // Fetch results based on selected course
  const {
    data: apiData,
    isLoading: resultsLoading,
    isFetching,
    refetch,
  } = useQuery<ResultsApiResponse>({
    queryKey: ["instructor-student-results", selectedCourseId],
    queryFn: async () => {
      const url =
        selectedCourseId && selectedCourseId !== "all"
          ? `/instructor/student-results?course_id=${selectedCourseId}`
          : "/instructor/student-results";
      return fetchWithAuth<ResultsApiResponse>(url);
    },
    staleTime: 1000 * 30,
  });

  const rawResults = apiData?.results || [];
  const summary = apiData?.summary || {
    total_submissions: 0,
    unique_students: 0,
    avg_percentage: 0,
    pass_rate: 0,
    top_score: 0,
  };

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let list = [...rawResults];

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          r.student_email.toLowerCase().includes(q) ||
          r.test_title.toLowerCase().includes(q) ||
          r.course_title.toLowerCase().includes(q) ||
          (r.student_college && r.student_college.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (statusFilter === "passed") {
      list = list.filter((r) => r.passed);
    } else if (statusFilter === "failed") {
      list = list.filter((r) => !r.passed);
    } else if (statusFilter === "pending") {
      list = list.filter((r) => r.grading_status === "pending");
    }

    // Sorting
    if (sortBy === "newest") {
      list.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
    } else if (sortBy === "highest") {
      list.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
    } else if (sortBy === "lowest") {
      list.sort((a, b) => (a.percentage || 0) - (b.percentage || 0));
    }

    return list;
  }, [rawResults, searchQuery, statusFilter, sortBy]);

  // Format time spent helper
  const formatTimeSpent = (seconds: number) => {
    if (!seconds || seconds <= 0) return "< 1m";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
  };

  // Helper to format/resolve student answer text (prevent showing raw ObjectIds)
  const formatAnswerText = (
    rawAns?: string,
    options?: Array<{ id?: string; _id?: string; text?: string; option_text?: string }>
  ) => {
    if (!rawAns || rawAns.trim() === "") return "Not Attempted / Skipped";

    const clean = rawAns.trim();
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(clean);

    if (options && Array.isArray(options) && options.length > 0) {
      const match = options.find(
        (o) =>
          (o._id && o._id.toString() === clean) ||
          (o.id && o.id.toString() === clean) ||
          (o.text && o.text.trim() === clean) ||
          (o.option_text && o.option_text.trim() === clean)
      );
      if (match) {
        return match.text || match.option_text || clean;
      }
    }

    if (isObjectId) {
      return `Attempted (Option ${clean.slice(-4)})`;
    }

    return clean;
  };

  // Helper to format/resolve correct answer text
  const formatCorrectAnswerText = (
    rawCorrect?: string,
    options?: Array<{ id?: string; _id?: string; text?: string; option_text?: string; is_correct?: boolean }>
  ) => {
    if (rawCorrect && rawCorrect.trim() !== "") {
      const clean = rawCorrect.trim();
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(clean);
      if (options && Array.isArray(options) && options.length > 0) {
        const match = options.find(
          (o) =>
            (o._id && o._id.toString() === clean) ||
            (o.id && o.id.toString() === clean) ||
            (o.text && o.text.trim() === clean) ||
            (o.option_text && o.option_text.trim() === clean)
        );
        if (match) {
          return match.text || match.option_text || clean;
        }
      }
      if (!isObjectId) return clean;
    }

    if (options && Array.isArray(options)) {
      const correctOpt = options.find((o) => o.is_correct);
      if (correctOpt) {
        return correctOpt.text || correctOpt.option_text || "N/A";
      }
    }

    return rawCorrect || "Not Specified";
  };

  // CSV Export handler
  const handleExportCSV = () => {
    if (filteredResults.length === 0) return;

    const headers = [
      "Student Name",
      "Student Email",
      "College",
      "Course",
      "Batch",
      "Test Title",
      "Score",
      "Total Marks",
      "Percentage",
      "Status",
      "Time Spent (sec)",
      "Submitted At",
    ];

    const rows = filteredResults.map((r) => [
      `"${r.student_name.replace(/"/g, '""')}"`,
      `"${r.student_email}"`,
      `"${(r.student_college || "").replace(/"/g, '""')}"`,
      `"${r.course_title.replace(/"/g, '""')}"`,
      `"${(r.batch_name || "").replace(/"/g, '""')}"`,
      `"${r.test_title.replace(/"/g, '""')}"`,
      r.score,
      r.total_marks || r.total_questions,
      `${r.percentage}%`,
      r.passed ? "Passed" : "Needs Improvement",
      r.time_spent || 0,
      `"${new Date(r.submitted_at).toLocaleString()}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `student_mock_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* ── Header & Course Selector ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <Award className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Student Mock Paper Results</h1>
              <p className="text-xs text-slate-500 font-normal">
                Review mock paper test submissions, scores, and student performance by course
              </p>
            </div>
          </div>
        </div>

        {/* Course Selector Dropdown */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 shrink-0">Filter by Course:</span>
            <Select value={selectedCourseId} onValueChange={(val) => setSelectedCourseId(val)}>
              <SelectTrigger className="w-[230px] sm:w-[280px] h-10 bg-slate-50 border-slate-200 text-xs font-medium rounded-xl">
                <SelectValue placeholder="All My Courses" />
              </SelectTrigger>
              <SelectContent className="bg-white border-slate-200 shadow-xl rounded-xl max-h-[320px]">
                <SelectItem value="all" className="text-xs font-medium py-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="h-3.5 w-3.5 text-blue-600" />
                    <span>All My Courses ({courses.length})</span>
                  </div>
                </SelectItem>
                {courses.map((course: Course) => (
                  <SelectItem key={course.id || course._id} value={course.id || course._id || ""} className="text-xs font-medium py-2.5">
                    <div className="flex items-center gap-2 truncate">
                      <BookOpen className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{course.title}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-10 px-3.5 rounded-xl border-slate-200 text-xs font-medium gap-2 text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin text-blue-600" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredResults.length === 0}
            className="h-10 px-3.5 rounded-xl border-slate-200 text-xs font-medium gap-2 text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── KPI Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Submissions */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Award className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Submissions</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mt-1">
              {summary.total_submissions}
            </h3>
          </div>
        </div>

        {/* Unique Students */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Students</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mt-1">
              {summary.unique_students}
            </h3>
          </div>
        </div>

        {/* Average Score */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Avg Score</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mt-1">
              {summary.avg_percentage}%
            </h3>
          </div>
        </div>

        {/* Pass Rate */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Pass Rate</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mt-1">
              {summary.pass_rate}%
            </h3>
          </div>
        </div>

        {/* Top Score */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4 col-span-2 lg:col-span-1">
          <div className="h-11 w-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Top Score</p>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-none mt-1">
              {summary.top_score}%
            </h3>
          </div>
        </div>
      </div>

      {/* ── Filters & Search Bar ─────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by student name, email, college, test..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10 bg-slate-50 border-slate-200 rounded-xl text-xs font-normal placeholder:text-slate-400 text-slate-700"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <Button
            size="sm"
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
            className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === "all" ? "bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            All ({rawResults.length})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "passed" ? "default" : "outline"}
            onClick={() => setStatusFilter("passed")}
            className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === "passed"
                ? "bg-emerald-600 text-white"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Passed ({rawResults.filter((r) => r.passed).length})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "failed" ? "default" : "outline"}
            onClick={() => setStatusFilter("failed")}
            className={`h-9 px-3 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === "failed" ? "bg-rose-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            Needs Work ({rawResults.filter((r) => !r.passed).length})
          </Button>
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 font-medium">Sort:</span>
          <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
            <SelectTrigger className="w-[140px] h-9 bg-slate-50 border-slate-200 text-xs font-medium rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200 shadow-lg rounded-xl">
              <SelectItem value="newest" className="text-xs font-medium">Newest First</SelectItem>
              <SelectItem value="highest" className="text-xs font-medium">Highest Score</SelectItem>
              <SelectItem value="lowest" className="text-xs font-medium">Lowest Score</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Student Results Table / Content ──────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {resultsLoading ? (
          <div className="p-12 text-center space-y-4">
            <RefreshCw className="h-8 w-8 text-blue-600 animate-spin mx-auto" />
            <p className="text-sm font-medium text-slate-500">Loading student mock paper results...</p>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Award className="h-7 w-7" />
            </div>
            <h4 className="text-base font-bold text-slate-800">No Student Results Found</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto font-normal">
              {searchQuery || statusFilter !== "all"
                ? "No submissions matched your search filters. Try clearing or relaxing your criteria."
                : "No mock paper tests have been submitted for this course yet."}
            </p>
            {(searchQuery || statusFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                className="mt-2 text-xs font-medium rounded-xl"
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full min-w-[1350px] text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/90 text-[11px] uppercase font-semibold tracking-wider text-slate-500">
                  <th className="py-4 px-6 w-[280px] min-w-[280px]">Student</th>
                  <th className="py-4 px-5 w-[240px] min-w-[240px]">Course & Batch</th>
                  <th className="py-4 px-5 w-[240px] min-w-[240px]">Mock Paper Test</th>
                  <th className="py-4 px-5 w-[160px] min-w-[160px]">Score & %</th>
                  <th className="py-4 px-5 w-[140px] min-w-[140px]">Status</th>
                  <th className="py-4 px-5 w-[140px] min-w-[140px]">Time Taken</th>
                  <th className="py-4 px-5 w-[180px] min-w-[180px]">Submitted At</th>
                  <th className="py-4 px-6 w-[120px] min-w-[120px] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredResults.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition-colors group">
                    {/* Student Info */}
                    <td className="py-4 px-6 w-[280px] min-w-[280px]">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-slate-200 shrink-0">
                          <AvatarImage src={item.student_avatar} />
                          <AvatarFallback className="bg-blue-50 text-blue-600 font-bold text-xs">
                            {item.student_name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate leading-tight">{item.student_name}</p>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">{item.student_email}</p>
                          {item.student_college && (
                            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-normal mt-0.5 truncate">
                              <GraduationCap className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                              <span className="truncate">{item.student_college}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Course & Batch */}
                    <td className="py-4 px-5 w-[240px] min-w-[240px]">
                      <div className="min-w-0 space-y-1">
                        <Badge
                          variant="secondary"
                          className="bg-blue-50 text-blue-700 border-none font-medium text-[11px] px-2.5 py-0.5 rounded-md truncate max-w-[220px]"
                        >
                          {item.course_title}
                        </Badge>
                        {item.batch_name && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 font-normal">
                            <span className="capitalize text-slate-400 font-medium">{item.batch_type || "Batch"}:</span>
                            <span className="truncate">{item.batch_name}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Test Title */}
                    <td className="py-4 px-5 w-[240px] min-w-[240px]">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 truncate max-w-[220px]">{item.test_title}</p>
                        <span className="text-[10px] text-slate-400 font-normal">
                          {item.total_questions || item.questions_count} questions
                        </span>
                      </div>
                    </td>

                    {/* Score & Percentage */}
                    <td className="py-4 px-5 w-[160px] min-w-[160px]">
                      <div className="space-y-1">
                        <div className="flex items-baseline gap-1">
                          <span className="font-bold text-sm text-slate-900">{item.score}</span>
                          <span className="text-[11px] text-slate-400 font-normal">
                            / {item.total_marks || item.total_questions}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${item.passed ? "bg-emerald-500" : "bg-rose-500"}`}
                              style={{ width: `${Math.min(item.percentage, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-[10px] font-semibold ${
                              item.passed ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {item.percentage}%
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Pass/Fail Status */}
                    <td className="py-4 px-5 w-[140px] min-w-[140px]">
                      {item.passed ? (
                        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200/60 font-medium text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                          <CheckCircle2 className="h-3 w-3" />
                          Passed
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-50 text-rose-700 hover:bg-rose-50 border-rose-200/60 font-medium text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                          <XCircle className="h-3 w-3" />
                          Needs Work
                        </Badge>
                      )}
                    </td>

                    {/* Time Taken */}
                    <td className="py-4 px-5 w-[140px] min-w-[140px] text-slate-600 font-normal whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        <span>{formatTimeSpent(item.time_spent)}</span>
                      </div>
                    </td>

                    {/* Date Submitted */}
                    <td className="py-4 px-5 w-[180px] min-w-[180px] text-slate-500 font-normal whitespace-nowrap">
                      {new Date(item.submitted_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <span className="block text-[10px] text-slate-400">
                        {new Date(item.submitted_at).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-4 px-6 w-[120px] min-w-[120px] text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedResult(item);
                          setIsReviewOpen(true);
                        }}
                        className="h-8 px-3 rounded-lg border-slate-200 text-xs font-medium gap-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Test Review Modal ────────────────────────────────────────────── */}
      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl p-0 overflow-hidden bg-white border-none shadow-2xl rounded-2xl">
          {selectedResult && (
            <div>
              {/* Header */}
              <DialogHeader className="p-6 bg-slate-50/80 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                      <AvatarImage src={selectedResult.student_avatar} />
                      <AvatarFallback className="bg-blue-600 text-white font-bold text-sm">
                        {selectedResult.student_name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <DialogTitle className="text-lg font-bold text-slate-900 leading-tight">
                        {selectedResult.student_name}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 font-normal mt-0.5">
                        {selectedResult.student_email}
                        {selectedResult.student_college && ` • ${selectedResult.student_college}`}
                      </DialogDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs font-medium text-slate-400">Score</p>
                      <p className="text-xl font-bold text-slate-900 leading-none mt-0.5">
                        {selectedResult.score} / {selectedResult.total_marks || selectedResult.total_questions}
                      </p>
                    </div>
                    <Badge
                      className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        selectedResult.passed
                          ? "bg-emerald-500 text-white hover:bg-emerald-500"
                          : "bg-rose-500 text-white hover:bg-rose-500"
                      }`}
                    >
                      {selectedResult.percentage}%
                    </Badge>
                  </div>
                </div>

                {/* Sub-bar */}
                <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-slate-200/60 text-xs text-slate-600 font-normal">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-medium text-slate-800">{selectedResult.course_title}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5 text-slate-400" />
                    <span>{selectedResult.test_title}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Time: {formatTimeSpent(selectedResult.time_spent)}</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{new Date(selectedResult.submitted_at).toLocaleString()}</span>
                  </div>
                </div>
              </DialogHeader>

              {/* Questions Breakdown */}
              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4 custom-scrollbar">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Question Breakdown ({selectedResult.questions_snapshot?.length || 0} Questions)
                </h4>

                {(!selectedResult.questions_snapshot || selectedResult.questions_snapshot.length === 0) ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    No question breakdown snapshot available for this submission.
                  </div>
                ) : (
                  selectedResult.questions_snapshot.map((q, idx) => {
                    const studentAnsText = formatAnswerText(q.student_answer, q.options);
                    const correctAnsText = formatCorrectAnswerText(q.correct_answer, q.options);
                    const isSkipped =
                      !q.student_answer ||
                      q.student_answer.trim() === "" ||
                      studentAnsText.includes("Not Attempted");
                    const isCorrect =
                      !isSkipped &&
                      (q.is_correct !== undefined
                        ? q.is_correct
                        : studentAnsText.trim().toLowerCase() === correctAnsText.trim().toLowerCase());

                    return (
                      <div
                        key={idx}
                        className={`p-4 sm:p-5 rounded-2xl border text-xs space-y-3 transition-colors ${
                          isCorrect
                            ? "bg-emerald-50/40 border-emerald-200/80"
                            : isSkipped
                            ? "bg-amber-50/40 border-amber-200/80"
                            : "bg-rose-50/40 border-rose-200/80"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold text-slate-800 leading-snug text-sm">
                            <span className="text-slate-400 mr-2 font-mono font-medium">Q{idx + 1}.</span>
                            {q.question_text}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            {isCorrect ? (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold text-[11px] px-2.5 py-0.5">
                                ✓ Correct (+{q.marks || 1})
                              </Badge>
                            ) : isSkipped ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[11px] px-2.5 py-0.5">
                                ○ Skipped (0)
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-semibold text-[11px] px-2.5 py-0.5">
                                ✕ Incorrect (0)
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Options preview if available */}
                        {q.options && q.options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pb-1">
                            {q.options.map((opt, oIdx) => {
                              const optText = opt.text || opt.option_text || "";
                              const optId = opt._id?.toString() || opt.id?.toString();
                              const isSelectedByStudent =
                                q.student_answer === optId ||
                                q.student_answer === optText ||
                                studentAnsText === optText;
                              const isThisCorrectOpt =
                                Boolean(opt.is_correct) ||
                                (correctAnsText && optText && correctAnsText.trim().toLowerCase() === optText.trim().toLowerCase()) ||
                                q.correct_answer === optId ||
                                q.correct_answer === optText;

                              return (
                                <div
                                  key={oIdx}
                                  className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                                    isSelectedByStudent && isThisCorrectOpt
                                      ? "bg-emerald-100/80 border-emerald-300 text-emerald-900 font-medium"
                                      : isSelectedByStudent
                                      ? "bg-rose-100/80 border-rose-300 text-rose-900 font-medium"
                                      : isThisCorrectOpt
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                      : "bg-white border-slate-200 text-slate-700"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="font-semibold text-slate-400 text-[10px] w-4">
                                      {String.fromCharCode(65 + oIdx)}.
                                    </span>
                                    <span className="truncate">{optText}</span>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-1 text-[10px]">
                                    {isSelectedByStudent && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded font-bold ${
                                          isThisCorrectOpt ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
                                        }`}
                                      >
                                        Student Choice
                                      </span>
                                    )}
                                    {!isSelectedByStudent && isThisCorrectOpt && (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold">
                                        ✓ Correct
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Student Attempted Answer vs Correct Answer Summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                          <div
                            className={`p-3 rounded-xl border space-y-1 ${
                              isCorrect
                                ? "bg-white border-emerald-300 shadow-sm"
                                : isSkipped
                                ? "bg-white border-amber-300 shadow-sm"
                                : "bg-white border-rose-300 shadow-sm"
                            }`}
                          >
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                              Student's Attempted Answer:
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isCorrect ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              ) : isSkipped ? (
                                <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                              )}
                              <span
                                className={`text-xs font-semibold ${
                                  isCorrect
                                    ? "text-emerald-700"
                                    : isSkipped
                                    ? "text-amber-700"
                                    : "text-rose-700"
                                }`}
                              >
                                {studentAnsText}
                              </span>
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-white border border-emerald-300 shadow-sm space-y-1">
                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide block">
                              Correct Answer:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              <span className="text-xs font-semibold text-emerald-800">
                                {correctAnsText}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => setIsReviewOpen(false)}
                  className="h-9 px-4 rounded-xl text-xs font-medium"
                >
                  Close Review
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
