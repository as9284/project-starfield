import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MeetingSessionEntry {
  id: string;
  content: string;
  createdAt: string;
}

export interface MeetingSessionArtifacts {
  createdAt: string;
  warning?: string | null;
  note: {
    title: string;
    content: string;
  };
  task: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    subTasks: string[];
  };
}

export interface MeetingSession {
  id: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  entries: MeetingSessionEntry[];
  artifacts?: MeetingSessionArtifacts;
}

interface MeetingState {
  activeSession: MeetingSession | null;
  sessions: MeetingSession[];

  startSession: (title: string) => MeetingSession | null;
  addEntry: (content: string) => boolean;
  endSession: (artifacts: MeetingSessionArtifacts) => MeetingSession | null;
  deleteSession: (id: string) => boolean;
  discardActiveSession: () => boolean;
}

export const useOrbitMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      activeSession: null,
      sessions: [],

      startSession: (title) => {
        const trimmed = title.trim();
        if (!trimmed || get().activeSession) return null;
        const session: MeetingSession = {
          id: crypto.randomUUID(),
          title: trimmed,
          startedAt: new Date().toISOString(),
          endedAt: null,
          entries: [],
        };
        set({ activeSession: session });
        return session;
      },

      addEntry: (content) => {
        const trimmed = content.trim();
        if (!trimmed) return false;
        const { activeSession } = get();
        if (!activeSession) return false;
        set({
          activeSession: {
            ...activeSession,
            entries: [
              ...activeSession.entries,
              {
                id: crypto.randomUUID(),
                content: trimmed,
                createdAt: new Date().toISOString(),
              },
            ],
          },
        });
        return true;
      },

      endSession: (artifacts) => {
        const { activeSession, sessions } = get();
        if (!activeSession) return null;
        const completed: MeetingSession = {
          ...activeSession,
          endedAt: new Date().toISOString(),
          artifacts,
        };
        set({
          activeSession: null,
          sessions: [completed, ...sessions.filter((s) => s.id !== activeSession.id)],
        });
        return completed;
      },

      deleteSession: (id) => {
        const { activeSession, sessions } = get();
        const existed = sessions.some((s) => s.id === id);
        const isActive = activeSession?.id === id;
        set({
          activeSession: isActive ? null : activeSession,
          sessions: sessions.filter((s) => s.id !== id),
        });
        return existed || isActive;
      },

      discardActiveSession: () => {
        const { activeSession } = get();
        if (!activeSession) return false;
        set({ activeSession: null });
        return true;
      },
    }),
    {
      name: "starfield-orbit-meetings",
      version: 1,
    },
  ),
);
