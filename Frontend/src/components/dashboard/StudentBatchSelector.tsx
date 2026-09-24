import { useState, useEffect, useMemo } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  BookOpen,
  Layers,
  Clock,
  CheckCircle2,
  Info,
  Calendar,
  Sparkles,
  Send,
  AlertCircle
} from "lucide-react";
import {
  useEnrolledCourses,
  StudentCourse,
  useStudentBatch,
  useAvailableBatches,
  useRequestBatchAssignment,
} from "@/hooks/useStudentData";
import { useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "@/lib/api";
import { toast } from "sonner";

export function StudentBatchSelector() {
  const queryClient = useQueryClient();
  const { data: courses, isLoading: isLoadingCourses } = useEnrolledCourses();
  const allCourses: StudentCourse[] = courses || [];

  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-select the first enrolled course if available
  useEffect(() => {
    if (!selectedCourseId && allCourses.length > 0) {
      setSelectedCourseId(allCourses[0].id);
    }
  }, [allCourses, selectedCourseId]);

  // Fetch student's assigned batch and all available batches for the selected course
  const { data: assignedBatch, isLoading: isAssignedLoading } = useStudentBatch(
    selectedCourseId || null
  );
  const { data: availableBatches = [], isLoading: isBatchesLoading } =
    useAvailableBatches(selectedCourseId || null);

  const requestBatchMutation = useRequestBatchAssignment();

  // Combine and format all batches for this course
  const allBatches = useMemo(() => {
    if (!availableBatches || !Array.isArray(availableBatches)) return [];
    const list: any[] = [];
    const seenIds = new Set<string>();

    // If student has an assigned batch, place it first in the list
    if (assignedBatch && assignedBatch.id) {
      list.push({ ...assignedBatch, is_assigned: true });
      seenIds.add(assignedBatch.id);
    }

    availableBatches.forEach((b: any) => {
      const bId = b.id || b._id;
      if (bId && !seenIds.has(bId)) {
        list.push({ ...b, id: bId, is_assigned: assignedBatch?.id === bId });
        seenIds.add(bId);
      }
      // If composite sub-batches exist inside b.batches
      if (Array.isArray(b.batches)) {
        b.batches.forEach((sub: any) => {
          const subId = sub.id || sub._id;
          if (subId && !seenIds.has(subId)) {
            list.push({
              ...sub,
              id: subId,
              batch_name: `${b.batch_name} - ${sub.batch_name}`,
              is_assigned: assignedBatch?.id === subId,
            });
            seenIds.add(subId);
          }
        });
      }
    });

    return list;
  }, [availableBatches, assignedBatch]);

  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [activeBatchDetail, setActiveBatchDetail] = useState<any | null>(null);

  // Sync selectedBatchId with assignedBatch or first available batch
  useEffect(() => {
    if (assignedBatch?.id) {
      setSelectedBatchId(assignedBatch.id);
    } else if (allBatches.length > 0) {
      setSelectedBatchId(allBatches[0].id);
    } else {
      setSelectedBatchId("");
    }
  }, [assignedBatch, allBatches, selectedCourseId]);

  // Format 24-hr time string (e.g. "18:00") into 12-hr AM/PM format
  const formatTime = (time?: string) => {
    if (!time) return "TBD";
    if (time.includes("AM") || time.includes("PM")) return time;
    const [hours, minutes] = time.split(":");
    const h = parseInt(hours, 10);
    if (isNaN(h)) return time;
    const ampm = h >= 12 ? "PM" : "AM";
    const displayH = h % 12 || 12;
    return `${displayH}:${minutes || "00"} ${ampm}`;
  };

  const handleAutoAssignBatch = async (overrideBatchId?: string) => {
    const targetBatchId = overrideBatchId || selectedBatchId;
    if (!selectedCourseId || !targetBatchId) {
      toast.error("Please select a batch to assign.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth<{ success: boolean; message: string }>('/batches/student-self-assign', {
        method: 'POST',
        body: JSON.stringify({
          course_id: selectedCourseId,
          batch_id: targetBatchId,
        }),
      });

      toast.success(res?.message || "Batch successfully assigned!");
      setDetailModalOpen(false);

      // Invalidate queries so that badges and dashboard update immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['student-course-batch', selectedCourseId] }),
        queryClient.invalidateQueries({ queryKey: ['enrolled-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['enrolled-courses-details'] }),
        queryClient.invalidateQueries({ queryKey: ['available-batches', selectedCourseId] }),
      ]);
    } catch (err: any) {
      toast.error(err.message || "Failed to assign batch");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestBatch = async (batchId: string, sessionType?: string) => {
    if (!selectedCourseId || !batchId) return;
    try {
      await requestBatchMutation.mutateAsync({
        courseId: selectedCourseId,
        batchId,
        session_type: sessionType || "all",
      });
      toast.success(
        "Batch assignment request submitted successfully! Instructor/Admin will review shortly."
      );
      setDetailModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to submit batch request");
    }
  };

  const selectedCourse = allCourses.find((c) => c.id === selectedCourseId);
  const selectedBatch = allBatches.find((b) => b.id === selectedBatchId) || assignedBatch;

  return (
    <>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
        {/* ── 1. SELECT COURSE DROPDOWN ── */}
        <Select
          value={selectedCourseId}
          onValueChange={(val) => {
            setSelectedCourseId(val);
            setSelectedBatchId("");
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px] md:w-[220px] h-10 rounded-xl border-slate-200 bg-white text-[11px] font-bold shadow-sm shrink-0 hover:border-primary/40 transition-colors">
            {isLoadingCourses ? (
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Loading Courses...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 truncate">
                <BookOpen className="h-3.5 w-3.5 text-primary shrink-0" />
                <SelectValue placeholder="Select Course" />
              </div>
            )}
          </SelectTrigger>
          <SelectContent className="rounded-xl border-slate-100 shadow-xl max-h-60 min-w-[200px]">
            {allCourses.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-slate-400 text-center">
                No enrolled courses found
              </div>
            ) : (
              allCourses.map((course: StudentCourse) => (
                <SelectItem
                  key={course.id}
                  value={course.id}
                  className="text-[11px] font-medium p-2.5 cursor-pointer"
                >
                  <span className="font-semibold text-slate-800">{course.title}</span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* ── 2. SELECT & VIEW BATCHES DROPDOWN ── */}
        {selectedCourseId && (
          <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
            <Select
              value={selectedBatchId || (assignedBatch?.id || "")}
              onValueChange={(val) => {
                setSelectedBatchId(val);
                const chosen = allBatches.find((b) => b.id === val);
                if (chosen) {
                  setActiveBatchDetail(chosen);
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-[260px] md:w-[280px] h-10 rounded-xl border-slate-200 bg-white text-[11px] font-bold shadow-sm shrink-0 hover:border-indigo-400/40 transition-colors">
                {isBatchesLoading || isAssignedLoading ? (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />
                    <span>Loading Batches...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 truncate text-left">
                    <Layers className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                    {assignedBatch ? (
                      <span className="truncate flex items-center gap-1.5 text-slate-800">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                        <strong className="text-emerald-700 font-bold">Assigned:</strong>{" "}
                        <span className="truncate">{assignedBatch.batch_name}</span>
                        {assignedBatch.start_time && (
                          <span className="text-[10px] text-slate-400 font-normal hidden md:inline">
                            ({formatTime(assignedBatch.start_time)})
                          </span>
                        )}
                      </span>
                    ) : allBatches.length > 0 ? (
                      <span className="truncate flex items-center gap-1.5 text-slate-700">
                        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                        <span className="truncate">
                          {selectedBatchId && allBatches.find((b) => b.id === selectedBatchId)
                            ? allBatches.find((b) => b.id === selectedBatchId)?.batch_name
                            : `Select Batch (${allBatches.length} Available)`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">No Batches Scheduled</span>
                    )}
                  </div>
                )}
              </SelectTrigger>

              <SelectContent className="rounded-xl border-slate-100 shadow-xl max-h-72 min-w-[280px]">
                <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3 w-3 text-indigo-500" />
                    Batches for Course
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1.5 h-4 border-slate-200">
                    {allBatches.length} Available
                  </Badge>
                </div>

                {allBatches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 font-medium">
                    No batches scheduled for this course yet.
                  </div>
                ) : (
                  allBatches.map((b) => {
                    const isAssigned = assignedBatch?.id === b.id;
                    return (
                      <SelectItem
                        key={b.id}
                        value={b.id}
                        className={`text-xs p-2.5 cursor-pointer rounded-lg my-0.5 ${
                          isAssigned ? "bg-emerald-50 text-emerald-900 font-bold" : ""
                        }`}
                      >
                        <div className="flex flex-col gap-0.5 text-left w-full">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-800 truncate">
                              {b.batch_name}
                            </span>
                            {isAssigned ? (
                              <Badge className="bg-emerald-600 text-white text-[9px] px-1.5 py-0 h-4 uppercase tracking-wider font-bold shrink-0">
                                ✓ Assigned
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 h-4 uppercase tracking-wider text-slate-500 border-slate-200 shrink-0"
                              >
                                {b.batch_type || "Session"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                            <Clock className="h-3 w-3 text-slate-400 shrink-0" />
                            <span>
                              {formatTime(b.start_time)} - {formatTime(b.end_time)}
                            </span>
                          </div>
                        </div>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>

            {/* Batch Info Action Button */}
            {selectedBatch && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setActiveBatchDetail(selectedBatch);
                  setDetailModalOpen(true);
                }}
                className="h-10 w-10 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl shrink-0 border border-slate-200 bg-white shadow-sm"
                title="View Full Batch Details"
              >
                <Info className="h-4 w-4" />
              </Button>
            )}

            {/* ── 3. SUBMIT (AUTOMATIC BATCH ASSIGNMENT) BUTTON ── */}
            <Button
              type="button"
              disabled={!selectedCourseId || !selectedBatchId || isSubmitting || (assignedBatch?.id === selectedBatchId)}
              onClick={() => handleAutoAssignBatch(selectedBatchId)}
              className={`h-10 px-5 rounded-xl font-bold transition-all text-xs flex items-center gap-2 shrink-0 shadow-sm ${
                assignedBatch?.id === selectedBatchId
                  ? "bg-emerald-600 text-white hover:bg-emerald-700 cursor-default shadow-emerald-500/10"
                  : "bg-primary text-white hover:bg-slate-900 shadow-primary/20 active:scale-95 cursor-pointer"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Assigning...</span>
                </>
              ) : assignedBatch?.id === selectedBatchId ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Assigned</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Submit</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* ── BATCH DETAILS MODAL ── */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-md rounded-3xl bg-white border border-slate-200 shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="flex items-center gap-3 text-base font-bold text-slate-800">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shadow-inner">
                <Layers className="h-5 w-5 text-indigo-600" />
              </div>
              Batch Details & Schedule
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-medium sm:ml-13">
              {selectedCourse?.title || "Course Batch Schedule"}
            </DialogDescription>
          </DialogHeader>

          {activeBatchDetail && (
            <div className="p-6 space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-500">
                    Batch Name
                  </span>
                  {assignedBatch?.id === activeBatchDetail.id ? (
                    <Badge className="bg-emerald-600 text-white font-bold text-[9px] uppercase tracking-wider">
                      ✓ Your Assigned Batch
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-indigo-200 text-indigo-600">
                      Available Batch
                    </Badge>
                  )}
                </div>
                <h3 className="text-lg font-black text-slate-900 leading-tight">
                  {activeBatchDetail.batch_name}
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Session Slot
                  </span>
                  <p className="font-bold text-slate-800 capitalize">
                    {activeBatchDetail.batch_type || "Regular Session"}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Class Timings
                  </span>
                  <p className="font-bold text-slate-800">
                    {formatTime(activeBatchDetail.start_time)} - {formatTime(activeBatchDetail.end_time)}
                  </p>
                </div>
              </div>

              {assignedBatch?.id !== activeBatchDetail.id && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-xs flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    Clicking Submit will automatically assign you to this batch immediately.
                  </span>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex gap-2">
            <Button
              variant="ghost"
              className="rounded-xl font-bold text-xs h-10 px-5"
              onClick={() => setDetailModalOpen(false)}
            >
              Close
            </Button>
            {activeBatchDetail && assignedBatch?.id !== activeBatchDetail.id && (
              <Button
                disabled={isSubmitting}
                onClick={() => handleAutoAssignBatch(activeBatchDetail.id)}
                className="rounded-xl font-bold bg-primary text-white shadow-md shadow-primary/20 text-xs h-10 px-6 gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Assigning...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> Submit Batch Assignment
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}