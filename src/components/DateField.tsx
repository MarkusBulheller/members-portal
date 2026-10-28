import PickerField, { type PickerFieldProps } from './PickerField';

export type DateFieldProps = PickerFieldProps;

/** Custom picker for mode "date" values — a drop-in for the native input (see PickerField for the contract). */
export default function DateField(props: DateFieldProps) {
  return <PickerField mode="date" {...props} />;
}
