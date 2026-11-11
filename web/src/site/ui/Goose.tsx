// The mark beside the name: the Gilded Goose drawing (public/site/goose-96.webp, 192 for dense screens). The gold egg stays the limit.
import "./goose.css";

const BASE = import.meta.env.BASE_URL;
const MARK_SRC = `${BASE}site/goose-96.webp`;
const MARK_SRC_2X = `${BASE}site/goose-192.webp`;

export function GooseMark({ className }: { className?: string }) {
  return <img className={className ? `gz-mark ${className}` : "gz-mark"} src={MARK_SRC} srcSet={`${MARK_SRC} 1x, ${MARK_SRC_2X} 2x`} alt="" width={26} height={40} decoding="async" draggable={false} />;
}
