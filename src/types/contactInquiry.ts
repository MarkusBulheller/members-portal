export interface ContactInquiry {
  id: string;
  name: string;
  email: string;
  iracingId: string | null;
  interestedIn: string;
  message: string | null;
  reviewed: boolean;
  createdAt: string;
}
