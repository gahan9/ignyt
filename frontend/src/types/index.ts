export interface EventInfo {
  id: string;
  name: string;
  date: string;
  venue: string;
  description: string;
  sessions: Session[];
}

export interface Session {
  id: string;
  title: string;
  speaker: string;
  time: string;
  room: string;
}

export interface Attendee {
  id: string;
  name: string;
  email: string;
  interests: string[];
  checkedIn: boolean;
  checkinTime?: string;
  photoUrl?: string;
}

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  timestamp: number;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, string>;
}

export interface Question {
  id: string;
  text: string;
  userId: string;
  userName: string;
  upvotes: number;
  timestamp: number;
}

export interface Photo {
  id: string;
  gcsUri: string;
  downloadUrl: string;
  uploadedBy: string;
  labels: string[];
  timestamp: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface BudgetStatus {
  gemini_used: number;
  gemini_limit: number;
  vision_used: number;
  vision_limit: number;
}
