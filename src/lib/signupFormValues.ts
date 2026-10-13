export interface SignupFormValues {
  timeslotIds: string[];
  carClass: string;
  secondaryCarClass: string;
  carId: string;
  availableHours: string[];
}

export const EMPTY_SIGNUP_VALUES: SignupFormValues = {
  timeslotIds: [],
  carClass: '',
  secondaryCarClass: '',
  carId: '',
  availableHours: [],
};

/** Seeds the signup form from a saved signup. */
export function signupToFormValues(signup: {
  timeslots: { id: string }[];
  carClass: string | null;
  secondaryCarClass: string | null;
  carId: string | null;
  availableHours: string[];
}): SignupFormValues {
  return {
    timeslotIds: signup.timeslots.map((t) => t.id),
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
    carClass: values.carClass || null,
    secondaryCarClass: values.secondaryCarClass || null,
    carId: values.carId || null,
    availableHours: values.availableHours,
  };
}
