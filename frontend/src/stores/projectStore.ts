import { create } from "zustand";
import type { Project, ProjectListItem, Job, WsMessage, JobPipelinePayload } from "@/lib/types";

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

export const useProjectStore = create<ProjectStore>((set) => ({
  projects: [],
  currentProject: null,
  jobs: [],
  activeJobIds: new Set(),
  jobDetails: {},
  jobPipelines: {},

  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setJobs: (jobs) => {
    const active = new Set(jobs.filter((j) => j.status === "queued" || j.status === "in_progress").map((j) => j.id));
    set({ jobs, activeJobIds: active });
  },
  addJob: (job) => set((state) => {
    const idx = state.jobs.findIndex((j) => j.id === job.id);
    const jobs =
      idx >= 0
        ? state.jobs.map((j) => (j.id === job.id ? { ...j, ...job } : j))
        : [job, ...state.jobs];
    const active = new Set(jobs.filter((j) => j.status === "queued" || j.status === "in_progress").map((j) => j.id));
    return { jobs, activeJobIds: active };
  }),
  updateJobFromWs: (msg) => set((state) => {
    const jobs = state.jobs.map((j) => {
      if (j.id !== msg.job_id) return j;
      return {
        ...j,
        status: msg.type === "completed" ? "completed" : msg.type === "error" ? "failed" : msg.status || j.status,
        progress: msg.progress ?? j.progress,
        result: msg.result ?? j.result,
        error: msg.error ? { message: msg.error } : j.error,
      };
    });
    const active = new Set(jobs.filter((j) => j.status === "queued" || j.status === "in_progress").map((j) => j.id));
    const jobDetails = { ...state.jobDetails };
    if (msg.detail) jobDetails[msg.job_id] = msg.detail;
    if (msg.type === "completed" || msg.type === "error") delete jobDetails[msg.job_id];

    const jobPipelines = { ...state.jobPipelines };
    if (msg.pipeline && msg.job_id) {
      jobPipelines[msg.job_id] = msg.pipeline;
    }
    if (msg.type === "completed" || msg.type === "error") {
      delete jobPipelines[msg.job_id];
    }

    return { jobs, activeJobIds: active, jobDetails, jobPipelines };
  }),
}));
