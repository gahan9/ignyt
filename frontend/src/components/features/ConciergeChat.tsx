import { useCallback, useRef, useState } from "react";

import { apiStreamPost } from "@/lib/api";
import { useRecaptcha } from "@/hooks/useRecaptcha";
import type { ChatMessage } from "@/types";

export default function ConciergeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const getRecaptchaToken = useRecaptcha();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };

    // Snapshot the conversation we will send upstream BEFORE the state
    // update is enqueued. Using `messages` from the closure is safe here
    // because we already guard against re-entry via the `streaming` flag,
    // and React 18 does not guarantee that an updater function runs
    // synchronously — the previous closure-mutation pattern could leave
    // `outgoing` empty by the time `apiStreamPost` read it.
    const outgoing: ChatMessage[] = [...messages, userMsg];
    setMessages([
      ...outgoing,
      { role: "assistant", content: "", timestamp: Date.now() },
    ]);
    setInput("");
    setStreaming(true);

    const appendToAssistant = (append: string) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const nextLast: ChatMessage = {
          role: last.role,
          content: last.content + append,
          timestamp: last.timestamp,
        };
        return [...prev.slice(0, -1), nextLast];
      });
    };

    try {
      const rcToken = await getRecaptchaToken("concierge_chat");
      await apiStreamPost(
        "/v1/concierge/chat",
        {
          messages: outgoing.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
        (chunk) => {
          appendToAssistant(chunk);
          scrollToBottom();
        },
        undefined,
        rcToken,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      appendToAssistant(`\n\n[${msg}]`);
    } finally {
      setStreaming(false);
      scrollToBottom();
    }
  }, [input, messages, streaming, scrollToBottom, getRecaptchaToken]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  return (
    <section
      className="flex h-[calc(100vh-10rem)] flex-col"
      aria-labelledby="concierge-heading"
    >
      <div className="mb-4">
        <h2 id="concierge-heading" className="text-lg font-bold text-gray-800">
          AI Concierge
        </h2>
        <p className="text-sm text-gray-500">
          Ask about sessions, speakers, venue, or anything about the event.
        </p>
      </div>

      <div
        className="flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 space-y-3"
        role="region"
        aria-label="Conversation"
        aria-busy={streaming}
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-3xl mb-2">🤖</p>
              <p className="text-sm text-gray-600">
                Hi! I know everything about this event. Ask me anything.
              </p>
            </div>
          </div>
        )}

        {streaming && (
          <span className="sr-only" aria-live="polite">
            Assistant is generating a reply.
          </span>
        )}
        {messages.map((msg, i) => (
          <div
            key={`${msg.timestamp}-${msg.role}-${i}`}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
              aria-label={msg.role === "user" ? "You" : "Assistant"}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.role === "assistant" && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-500 animate-pulse rounded" />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 flex gap-2">
        <label htmlFor="concierge-input" className="sr-only">
          Message for the event assistant
        </label>
        <input
          id="concierge-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the event..."
          disabled={streaming}
          autoComplete="off"
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          aria-busy={streaming}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </section>
  );
}
