import PickerField, { type PickerFieldProps } from './PickerField';

export type TimeFieldProps = PickerFieldProps;

/** Custom picker for mode "time" values — a drop-in for the native input (see PickerField for the contract). */
export default function TimeField(props: TimeFieldProps) {
  return <PickerField mode="time" {...props} />;
}
