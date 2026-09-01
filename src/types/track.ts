export interface Track {
  id: string;
  name: string;
  category: string;
  location: string | null;
  notes: string | null;
  imageUrl: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTrackInput {
  name: string;
  category: string;
  location?: string;
  notes?: string;
  imageUrl?: string;
}

export type UpdateTrackInput = Partial<CreateTrackInput> & { active?: boolean };
