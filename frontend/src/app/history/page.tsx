"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Clock, CheckCircle, XCircle, Loader2, X, RotateCcw, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LinearProgress } from "@/components/ui/progress-linear";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useProjectStore } from "@/stores/projectStore";
import { useCancelJobMutation, useJobsQuery, useRetryJobMutation } from "@/lib/queries";

export default function HistoryPage() {
  const { jobs, setJobs } = useProjectStore();
  const [filter, setFilter] = useState("all");
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const { data: fetchedJobs, isLoading: loading, error } = useJobsQuery();
  const retryJobMutation = useRetryJobMutation();
  const cancelJobMutation = useCancelJobMutation();

  useEffect(() => {
    if (fetchedJobs) setJobs(fetchedJobs);
  }, [fetchedJobs, setJobs]);

  const visibleJobs = useMemo(
    () => (filter === "all" ? jobs : jobs.filter((job) => job.status === filter)),
    [jobs, filter]
  );

  const handleRetry = async (jobId: string) => {
    try {
      await retryJobMutation.mutateAsync(jobId);
      toast.success("Retry queued");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Retry failed";
      toast.error(message);
    }
  };

  const handleCancel = async (jobId: string) => {
    if (pendingCancelId !== jobId) {
      setPendingCancelId(jobId);
      toast.message("Tap cancel again to confirm.");
      return;
    }
    try {
      await cancelJobMutation.mutateAsync(jobId);
      toast.success("Job cancelled");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Cancel failed";
      toast.error(message);
    } finally {
      setPendingCancelId(null);
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-rose-500" />;
      case "in_progress": return <Loader2 className="h-4 w-4 text-cyan-500 animate-spin" />;
      case "queued": return <Clock className="h-4 w-4 text-amber-500" />;
      default: return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6 w-full text-slate-900 dark:text-slate-100">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2"><History className="h-8 w-8 text-cyan-500" /> Activity</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{visibleJobs.length} jobs</p>
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="queued">Queued</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="h-8 w-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <Card>
          <CardContent className="py-10 flex items-center justify-center gap-2 text-rose-500">
            <AlertTriangle className="h-4 w-4" />
            {(error as Error).message || "Could not load jobs"}
          </CardContent>
        </Card>
      ) : visibleJobs.length === 0 ? (
        <Card><CardContent className="py-20 text-center text-slate-500 dark:text-slate-400">No jobs found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {visibleJobs.map((job) => (
            <Card key={job.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {statusIcon(job.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{job.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                        <StatusBadge status={job.status} />
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {job.created_at && new Date(job.created_at).toLocaleString()}
                        {job.completed_at && ` — completed ${new Date(job.completed_at).toLocaleString()}`}
                      </p>
                      {(job.status === "in_progress" || job.status === "queued") && <LinearProgress value={job.progress} className="mt-2 h-1.5 max-w-xs" />}
                      {job.error && (
                        <p className="text-xs text-rose-500 mt-1">
                          {typeof job.error === "object" && job.error !== null && "message" in job.error
                            ? String((job.error as { message?: string }).message || JSON.stringify(job.error))
                            : String(job.error)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">{job.progress}%</span>
                    {job.status === "failed" && (
                      <Button
                        variant="outline-animated"
                        size="sm"
                        onClick={() => handleRetry(job.id)}
                        title="Retry"
                        disabled={retryJobMutation.isPending}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Retry
                      </Button>
                    )}
                    {(job.status === "queued" || job.status === "in_progress") && (
                      <Button
                        variant={pendingCancelId === job.id ? "destructive" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCancel(job.id)}
                        disabled={cancelJobMutation.isPending}
                        title={pendingCancelId === job.id ? "Confirm cancel" : "Cancel"}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
