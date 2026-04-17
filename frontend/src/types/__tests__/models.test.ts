import { describe, expect, it } from "vitest";

import type {
  Attendee,
  BudgetStatus,
  ChatMessage,
  EventInfo,
  Photo,
  Question,
  Reaction,
  Session,
} from "../index";

describe("TypeScript interface contracts", () => {
  it("Session has required fields", () => {
    const session: Session = {
      id: "s1",
      title: "Keynote",
      speaker: "Dr. Chen",
      time: "09:00",
      room: "Main Hall",
    };

    expect(session.id).toBe("s1");
    expect(session.title).toBe("Keynote");
  });

  it("Attendee has required fields and optional fields", () => {
    const attendee: Attendee = {
      id: "a1",
      name: "Alice",
      email: "alice@test.com",
      interests: ["AI", "Cloud"],
      checkedIn: false,
    };

    expect(attendee.checkedIn).toBe(false);
    expect(attendee.checkinTime).toBeUndefined();
    expect(attendee.photoUrl).toBeUndefined();

    const checkedIn: Attendee = {
      ...attendee,
      checkedIn: true,
      checkinTime: "2026-04-17T10:00:00Z",
    };
    expect(checkedIn.checkinTime).toBeDefined();
  });

  it("Reaction has required fields", () => {
    const reaction: Reaction = {
      id: "r1",
      emoji: "🔥",
      userId: "u1",
      timestamp: Date.now(),
    };

    expect(reaction.emoji).toBe("🔥");
  });

  it("Question has required fields", () => {
    const question: Question = {
      id: "q1",
      text: "When is the next break?",
      userId: "u1",
      userName: "Alice",
      upvotes: 3,
      timestamp: Date.now(),
    };

    expect(question.upvotes).toBe(3);
  });

  it("Photo has required fields", () => {
    const photo: Photo = {
      id: "p1",
      gcsUri: "gs://bucket/photo.jpg",
      downloadUrl: "https://storage.googleapis.com/...",
      uploadedBy: "u1",
      labels: ["sunset", "nature"],
      timestamp: Date.now(),
    };

    expect(photo.labels).toHaveLength(2);
  });

  it("ChatMessage role is constrained", () => {
    const userMsg: ChatMessage = {
      role: "user",
      content: "Hello",
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: "Hi there!",
      timestamp: Date.now(),
    };

    expect(userMsg.role).toBe("user");
    expect(assistantMsg.role).toBe("assistant");
  });

  it("BudgetStatus has all counter fields", () => {
    const budget: BudgetStatus = {
      gemini_used: 10,
      gemini_limit: 100,
      vision_used: 5,
      vision_limit: 50,
    };

    expect(budget.gemini_used).toBeLessThan(budget.gemini_limit);
    expect(budget.vision_used).toBeLessThan(budget.vision_limit);
  });

  it("EventInfo contains sessions array", () => {
    const event: EventInfo = {
      id: "e1",
      name: "Ignyt Demo Day",
      date: "2026-04-17",
      venue: "Innovation Hub",
      description: "A demo event",
      sessions: [
        { id: "s1", title: "Keynote", speaker: "Dr. Chen", time: "09:00", room: "Main Hall" },
      ],
    };

    expect(event.sessions).toHaveLength(1);
    expect(event.name).toBe("Ignyt Demo Day");
  });
});
