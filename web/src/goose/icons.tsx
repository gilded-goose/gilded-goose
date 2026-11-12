// The page's few icons: Phosphor (MIT), one weight, one size per place, the colour of the text beside them.
import { ArrowCounterClockwiseIcon, ArrowRightIcon, CameraIcon, CheckIcon, LockSimpleIcon, MicrophoneIcon, MinusIcon, PlusIcon, StopIcon, XIcon } from "@phosphor-icons/react";

const SET = { arrow: ArrowRightIcon, camera: CameraIcon, check: CheckIcon, lock: LockSimpleIcon, mic: MicrophoneIcon, stop: StopIcon, x: XIcon, again: ArrowCounterClockwiseIcon, minus: MinusIcon, plus: PlusIcon } as const;
export type IconName = keyof typeof SET;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const C = SET[name];
  return <C size={size} weight="regular" aria-hidden="true" className="gg-icon" />;
}
