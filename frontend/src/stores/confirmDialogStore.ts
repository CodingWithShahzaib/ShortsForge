import { create } from "zustand";

export type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use destructive styling for the confirm action (e.g. delete, disconnect). */
  variant?: "default" | "destructive";
};

type QueueItem = { opts: ConfirmDialogOptions; resolve: (value: boolean) => void };

type ConfirmDialogState = {
  open: boolean;
  current: QueueItem | null;
  pending: QueueItem[];
  /** Show a confirmation dialog; resolves true if confirmed, false if cancelled. */
  request: (opts: ConfirmDialogOptions) => Promise<boolean>;
  /** Resolve the current dialog and show the next queued item if any. */
  respond: (value: boolean) => void;
};

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  open: false,
  current: null,
  pending: [],
  request(opts) {
    return new Promise<boolean>((resolve) => {
      const item: QueueItem = { opts, resolve };
      set((state) => {
        if (state.current) {
          return { pending: [...state.pending, item] };
        }
        return { current: item, open: true, pending: state.pending };
      });
    });
  },
  respond(value) {
    const { current, pending } = get();
    if (!current) return;
    current.resolve(value);
    const [next, ...rest] = pending;
    if (next) {
      set({ current: next, open: true, pending: rest });
    } else {
      set({ current: null, open: false, pending: [] });
    }
  },
}));

/** Imperative confirm for use outside React components (same queue as the host). */
export function appConfirm(opts: ConfirmDialogOptions): Promise<boolean> {
  return useConfirmDialogStore.getState().request(opts);
}
