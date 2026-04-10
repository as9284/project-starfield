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

  /** Non-persisted: set by Luna to navigate Orbit to the meeting tab. */
  pendingOrbitTab: string | null;
  /** Non-persisted: meeting title pre-filled by Luna's OPEN_MEETING command. */
  pendingMeetingTitle: string | null;

  startSession: (title: string) => MeetingSession | null;
  addEntry: (content: string) => boolean;
  endSession: (artifacts: MeetingSessionArtifacts) => MeetingSession | null;
  deleteSession: (id: string) => boolean;
  discardActiveSession: () => boolean;

  /** Request Orbit to switch to a specific tab (consumed once by Orbit.tsx). */
  requestOrbitTab: (tab: string, meetingTitle?: string) => void;
  /** Consume and clear the pending tab request (call from Orbit.tsx useEffect). */
  consumePendingTab: () => { tab: string | null; meetingTitle: string | null };
}

export const useOrbitMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      activeSession: null,
      sessions: [],
      pendingOrbitTab: null,
      pendingMeetingTitle: null,

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
        const isActive = activeSession?.id === id;
        const existsInSessions = sessions.some((s) => s.id === id);
        if (!isActive && !existsInSessions) return false;
        set({
          activeSession: isActive ? null : activeSession,
          sessions: sessions.filter((s) => s.id !== id),
        });
        return true;
      },

      discardActiveSession: () => {
        const { activeSession } = get();
        if (!activeSession) return false;
        set({ activeSession: null });
        return true;
      },

      requestOrbitTab: (tab, meetingTitle) => {
        set({ pendingOrbitTab: tab, pendingMeetingTitle: meetingTitle ?? null });
      },

      consumePendingTab: () => {
        const { pendingOrbitTab, pendingMeetingTitle } = get();
        set({ pendingOrbitTab: null, pendingMeetingTitle: null });
        return { tab: pendingOrbitTab, meetingTitle: pendingMeetingTitle };
      },
    }),
    {
      name: "starfield-orbit-meetings",
      version: 1,
      // Don't persist ephemeral navigation signals
      partialize: (state) => ({
        activeSession: state.activeSession,
        sessions: state.sessions,
      }),
    },
  ),
);
