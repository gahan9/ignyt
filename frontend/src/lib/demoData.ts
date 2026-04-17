import type { Attendee } from "@/types";

/**
 * Seed roster for the demo event.
 *
 * `name_lower` is REQUIRED: the backend attendee lookup runs a Firestore
 * range query against that field (see attendee_repo.find_attendee_by_name),
 * which needs a precomputed lowercase copy to support case-insensitive
 * prefix matching without downloading the full collection.
 *
 * Keep the list short but diverse enough to demo the check-in/search flows.
 */
export const DEMO_ATTENDEES: Array<
  Omit<Attendee, "checkinTime" | "photoUrl"> & { name_lower: string }
> = [
  {
    id: "att-0001",
    name: "Alice Chen",
    name_lower: "alice chen",
    email: "alice.chen@example.com",
    interests: ["AI", "Design"],
    checkedIn: false,
  },
  {
    id: "att-0002",
    name: "Bob Patel",
    name_lower: "bob patel",
    email: "bob.patel@example.com",
    interests: ["Cloud", "DevOps"],
    checkedIn: false,
  },
  {
    id: "att-0003",
    name: "Carla Rossi",
    name_lower: "carla rossi",
    email: "carla.rossi@example.com",
    interests: ["Product", "UX"],
    checkedIn: false,
  },
  {
    id: "att-0004",
    name: "Daniel Okafor",
    name_lower: "daniel okafor",
    email: "daniel.okafor@example.com",
    interests: ["Data", "ML Ops"],
    checkedIn: false,
  },
  {
    id: "att-0005",
    name: "Emma Lindqvist",
    name_lower: "emma lindqvist",
    email: "emma.lindqvist@example.com",
    interests: ["Frontend", "Accessibility"],
    checkedIn: false,
  },
  {
    id: "att-0006",
    name: "Farhan Siddiqui",
    name_lower: "farhan siddiqui",
    email: "farhan.siddiqui@example.com",
    interests: ["Security", "IAM"],
    checkedIn: false,
  },
  {
    id: "att-0007",
    name: "Grace Nakamura",
    name_lower: "grace nakamura",
    email: "grace.nakamura@example.com",
    interests: ["Robotics", "Edge AI"],
    checkedIn: false,
  },
  {
    id: "att-0008",
    name: "Hiro Tanaka",
    name_lower: "hiro tanaka",
    email: "hiro.tanaka@example.com",
    interests: ["Gaming", "Graphics"],
    checkedIn: false,
  },
  {
    id: "att-0009",
    name: "Isabel Martinez",
    name_lower: "isabel martinez",
    email: "isabel.martinez@example.com",
    interests: ["FinTech", "Compliance"],
    checkedIn: false,
  },
  {
    id: "att-0010",
    name: "Jamal Williams",
    name_lower: "jamal williams",
    email: "jamal.williams@example.com",
    interests: ["HealthTech", "APIs"],
    checkedIn: false,
  },
  {
    id: "att-0011",
    name: "Kira Volkov",
    name_lower: "kira volkov",
    email: "kira.volkov@example.com",
    interests: ["Research", "Papers"],
    checkedIn: false,
  },
  {
    id: "att-0012",
    name: "Liam O'Connor",
    name_lower: "liam o'connor",
    email: "liam.oconnor@example.com",
    interests: ["Mobile", "iOS"],
    checkedIn: false,
  },
  {
    id: "att-0013",
    name: "Mei Zhang",
    name_lower: "mei zhang",
    email: "mei.zhang@example.com",
    interests: ["Growth", "Analytics"],
    checkedIn: false,
  },
  {
    id: "att-0014",
    name: "Noah Brooks",
    name_lower: "noah brooks",
    email: "noah.brooks@example.com",
    interests: ["Infra", "Kubernetes"],
    checkedIn: false,
  },
  {
    id: "att-0015",
    name: "Olivia Keller",
    name_lower: "olivia keller",
    email: "olivia.keller@example.com",
    interests: ["Community", "DevRel"],
    checkedIn: false,
  },
];

/**
 * The QR code payload encoded on each attendee badge. Keeping this as a
 * function (not a string template) lets us swap to a signed JWT later without
 * touching call sites.
 */
export function attendeeQrPayload(attendeeId: string): string {
  return attendeeId;
}
