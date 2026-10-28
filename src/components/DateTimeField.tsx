import PickerField, { type PickerFieldProps } from './PickerField';

export type DateTimeFieldProps = PickerFieldProps;

/** Custom picker for mode "datetime" values — a drop-in for the native input (see PickerField for the contract). */
export default function DateTimeField(props: DateTimeFieldProps) {
  return <PickerField mode="datetime" {...props} />;
}
