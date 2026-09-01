import { api } from '../api';
import type { ContactInquiry } from '../../types/contactInquiry';

export const contactInquiriesApi = {
  list: () => api.get<ContactInquiry[]>('/contact-inquiries'),
  setReviewed: (id: string, reviewed: boolean) =>
    api.patch<ContactInquiry>(`/contact-inquiries/${id}`, { reviewed }),
  remove: (id: string) => api.delete<void>(`/contact-inquiries/${id}`),
};
