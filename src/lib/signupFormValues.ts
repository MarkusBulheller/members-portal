import { rankTimeslots } from './timeslotPreference';

export interface SignupFormValues {
  /** The picked start times, kept in preference order (most preferred first). */
  timeslotIds: string[];
  /** Same ids in the same order — what gets submitted as the ranking. */
  timeslotPreference: string[];
  carClass: string;
  secondaryCarClass: string;
  carId: string;
  availableHours: string[];
}

export const EMPTY_SIGNUP_VALUES: SignupFormValues = {
  timeslotIds: [],
  timeslotPreference: [],
  carClass: '',
  secondaryCarClass: '',
  carId: '',
  availableHours: [],
};

/** Seeds the signup form from a saved signup. */
export function signupToFormValues(signup: {
  timeslots: { id: string; startsAt: string }[];
  timeslotPreference?: string[] | null;
  carClass: string | null;
  secondaryCarClass: string | null;
  carId: string | null;
  availableHours: string[];
}): SignupFormValues {
  const timeslotIds = rankTimeslots(signup.timeslots, signup.timeslotPreference).map((t) => t.id);
  return {
    timeslotIds,
    timeslotPreference: timeslotIds,
    carClass: signup.carClass ?? '',
    secondaryCarClass: signup.secondaryCarClass ?? '',
    carId: signup.carId ?? '',
    availableHours: signup.availableHours,
  };
}

/** The API payload for a submitted form — empty strings become null so a cleared class/car is
 * actually cleared server-side rather than left unchanged. */
export function formValuesToSignupInput(values: SignupFormValues) {
  return {
    timeslotIds: values.timeslotIds,
    timeslotPreference: values.timeslotPreference,
    carClass: values.carClass || null,
    secondaryCarClass: values.secondaryCarClass || null,
    carId: values.carId || null,
    availableHours: values.availableHours,
  };
}
