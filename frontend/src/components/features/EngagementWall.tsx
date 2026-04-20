import { useCallback, useId, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { addDocument, useCollection } from "@/hooks/useFirestore";
import type { Reaction, Question } from "@/types";

const EMOJI_OPTIONS: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: "👏", label: "Applause" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "💡", label: "Insightful" },
  { emoji: "❤️", label: "Love" },
  { emoji: "😂", label: "Funny" },
  { emoji: "🎉", label: "Celebrate" },
];

interface EngagementWallProps {
  eventId: string;
  sessionId: string;
}

function ReactionBar({ eventId, sessionId }: EngagementWallProps) {
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const path = `events/${eventId}/sessions/${sessionId}/reactions`;
  const { docs: reactions } = useCollection<Reaction>(path, {
    orderByField: "timestamp",
    orderDirection: "desc",
    limitCount: 100,
  });

  const sendReaction = useCallback(
    async (emoji: string) => {
      if (!user) return;
      try {
        await addDocument(path, { emoji, userId: user.uid });
        setError(null);
      } catch (err) {
        // Surfacing the failure is critical: a silently-dropped reaction
        // is a bad live-event experience and the user has no other signal.
        setError(err instanceof Error ? err.message : "Could not send reaction");
      }
    },
    [user, path],
  );

  // ``reactions`` can hit ``limitCount`` quickly during a busy session;
  // the previous inline ``reduce`` ran on every render and on every
  // unrelated re-render of the parent. Memoising halves render cost
  // when the reaction stream is stable.
  const emojiCounts = useMemo(
    () =>
      reactions.reduce<Record<string, number>>((acc, r) => {
        acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
        return acc;
      }, {}),
    [reactions],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        React
      </h3>
      <div className="flex flex-wrap gap-2">
        {EMOJI_OPTIONS.map(({ emoji, label }) => (
          <button
            key={emoji}
            type="button"
            onClick={() => sendReaction(emoji)}
            aria-label={`React with ${label}`}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-lg transition-all hover:scale-110 hover:border-brand-300 hover:bg-brand-50 active:scale-95"
          >
            <span aria-hidden="true">{emoji}</span>
            {emojiCounts[emoji] ? (
              <span className="text-xs font-medium text-gray-600">
                {emojiCounts[emoji]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function QuestionBoard({ eventId, sessionId }: EngagementWallProps) {
  const { user } = useAuth();
  const [newQuestion, setNewQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const path = `events/${eventId}/sessions/${sessionId}/questions`;
  const { docs: questions, loading } = useCollection<Question>(path, {
    orderByField: "timestamp",
    orderDirection: "desc",
    limitCount: 50,
  });

  const submitQuestion = useCallback(async () => {
    if (!user || !newQuestion.trim()) return;
    try {
      await addDocument(path, {
        text: newQuestion.trim(),
        userId: user.uid,
        userName: user.displayName ?? "Anonymous",
        upvotes: 0,
      });
      setNewQuestion("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit question");
    }
  }, [user, newQuestion, path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submitQuestion();
      }
    },
    [submitQuestion],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Q&amp;A
      </h3>

      <div className="mb-4 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Ask a question
        </label>
        <input
          id={inputId}
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          maxLength={500}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => void submitQuestion()}
          disabled={!newQuestion.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          Ask
        </button>
      </div>

      {error ? (
        <p className="mb-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-600">Loading questions...</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-gray-600">No questions yet. Be the first!</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {questions.map((q) => (
            <li
              key={q.id}
              className="rounded-lg bg-gray-50 px-3 py-2"
            >
              <p className="text-sm text-gray-800">{q.text}</p>
              <p className="mt-1 text-xs text-gray-600">{q.userName}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EngagementWall({ eventId, sessionId }: EngagementWallProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Live Engagement</h2>
      <ReactionBar eventId={eventId} sessionId={sessionId} />
      <QuestionBoard eventId={eventId} sessionId={sessionId} />
    </section>
  );
}
