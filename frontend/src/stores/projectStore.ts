import { create } from "zustand";
import type { Project, ProjectListItem, Job, WsMessage, JobPipelinePayload } from "@/lib/types";
import { mergeJobPipelinePayload, normalizeWsErrorPayload } from "@/lib/job-ws";

interface ProjectStore {
  projects: ProjectListItem[];
  currentProject: Project | null;
  jobs: Job[];
  activeJobIds: Set<string>;
  jobDetails: Record<string, string>;
  jobPipelines: Record<string, JobPipelinePayload>;
  setProjects: (projects: ProjectListItem[]) => void;
  setCurrentProject: (project: Project | null) => void;
  setJobs: (jobs: Job[]) => void;
  updateJobFromWs: (msg: WsMessage) => void;
  addJob: (job: Job) => void;
}

function isActiveJob(job: Job): boolean {
  return job.status === "queued" || job.status === "in_progress";
}

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,
  jobs: [],
  activeJobIds: new Set(),
  jobDetails: {},
  jobPipelines: {},

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setJobs: (jobs) => set((state) => {
    const previousById = new Map(state.jobs.map((job) => [job.id, job]));
    const mergedJobs = jobs.map((job) => {
      const previous = previousById.get(job.id);
      if (!previous || !isActiveJob(previous) || !isActiveJob(job)) {
        return job;
      }
      return {
        ...job,
        progress: Math.max(job.progress || 0, previous.progress || 0),
      };
    });
    const active = new Set(mergedJobs.filter(isActiveJob).map((j) => j.id));
    return { jobs: mergedJobs, activeJobIds: active };
  }),
  addJob: (job) => set((state) => {
    const idx = state.jobs.findIndex((j) => j.id === job.id);
    const jobs =
      idx >= 0
        ? state.jobs.map((j) => (j.id === job.id ? { ...j, ...job } : j))
        : [job, ...state.jobs];
    const active = new Set(jobs.filter(isActiveJob).map((j) => j.id));
    return { jobs, activeJobIds: active };
  }),
  updateJobFromWs: (msg) => set((state) => {
    const jobs = state.jobs.map((j) => {
      if (j.id !== msg.job_id) return j;
      const nextProgress =
        msg.type === "progress"
          ? Math.max(j.progress || 0, msg.progress ?? 0)
          : msg.progress ?? j.progress;
      return {
        ...j,
        status: msg.type === "completed" ? "completed" : msg.type === "error" ? "failed" : msg.status || j.status,
        progress: nextProgress,
        result: msg.type === "completed" ? (msg.result ?? j.result) : j.result,
        error: msg.type === "error" ? (normalizeWsErrorPayload(msg.error) ?? j.error) : j.error,
      };
    });
    const active = new Set(jobs.filter(isActiveJob).map((j) => j.id));
    const jobDetails = { ...state.jobDetails };
    if (msg.detail) jobDetails[msg.job_id] = msg.detail;
    if (msg.type === "completed" || msg.type === "error") delete jobDetails[msg.job_id];

    const jobPipelines = { ...state.jobPipelines };
    if ("pipeline" in msg && msg.pipeline && msg.job_id) {
      jobPipelines[msg.job_id] = mergeJobPipelinePayload(jobPipelines[msg.job_id], msg.pipeline);
    }
    if (msg.type === "completed" || msg.type === "error") {
      delete jobPipelines[msg.job_id];
    }

    return { jobs, activeJobIds: active, jobDetails, jobPipelines };
  }),
}));
