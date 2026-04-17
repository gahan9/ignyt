import { useCallback, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import { addDocument, useCollection } from "@/hooks/useFirestore";
import type { Reaction, Question } from "@/types";

const EMOJI_OPTIONS = ["👏", "🔥", "💡", "❤️", "😂", "🎉"];

interface EngagementWallProps {
  eventId: string;
  sessionId: string;
}

function ReactionBar({ eventId, sessionId }: EngagementWallProps) {
  const { user } = useAuth();
  const path = `events/${eventId}/sessions/${sessionId}/reactions`;
  const { docs: reactions } = useCollection<Reaction>(path, {
    orderByField: "timestamp",
    orderDirection: "desc",
    limitCount: 100,
  });

  const sendReaction = useCallback(
    async (emoji: string) => {
      if (!user) return;
      await addDocument(path, { emoji, userId: user.uid });
    },
    [user, path],
  );

  const emojiCounts = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        React
      </h3>
      <div className="flex flex-wrap gap-2">
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-lg transition-all hover:scale-110 hover:border-brand-300 hover:bg-brand-50 active:scale-95"
          >
            <span>{emoji}</span>
            {emojiCounts[emoji] ? (
              <span className="text-xs font-medium text-gray-600">
                {emojiCounts[emoji]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuestionBoard({ eventId, sessionId }: EngagementWallProps) {
  const { user } = useAuth();
  const [newQuestion, setNewQuestion] = useState("");
  const path = `events/${eventId}/sessions/${sessionId}/questions`;
  const { docs: questions, loading } = useCollection<Question>(path, {
    orderByField: "timestamp",
    orderDirection: "desc",
    limitCount: 50,
  });

  const submitQuestion = useCallback(async () => {
    if (!user || !newQuestion.trim()) return;
    await addDocument(path, {
      text: newQuestion.trim(),
      userId: user.uid,
      userName: user.displayName ?? "Anonymous",
      upvotes: 0,
    });
    setNewQuestion("");
  }, [user, newQuestion, path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitQuestion();
      }
    },
    [submitQuestion],
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Q&A
      </h3>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question..."
          maxLength={500}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          onClick={submitQuestion}
          disabled={!newQuestion.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          Ask
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading questions...</p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-gray-400">No questions yet. Be the first!</p>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {questions.map((q) => (
            <li
              key={q.id}
              className="rounded-lg bg-gray-50 px-3 py-2"
            >
              <p className="text-sm text-gray-800">{q.text}</p>
              <p className="mt-1 text-xs text-gray-400">{q.userName}</p>
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
