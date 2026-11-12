// The mark beside the name: the Gilded Goose drawing (public/site/goose-96.webp, 192 for dense screens). The gold egg stays the limit.
// The same drawing is the site's loader: it walks on the spot (goose.css) only while something is really on its way.
import "./goose.css";

const BASE = import.meta.env.BASE_URL;
const MARK_SRC = `${BASE}site/goose-96.webp`;
const MARK_SRC_2X = `${BASE}site/goose-192.webp`;

/** `walk`: the waddle of a wait (goose.css), hidden from a screen reader; the words beside it say what is loading. */
export function GooseMark({ className, walk }: { className?: string; walk?: boolean }) {
  return <img className={`gz-mark${walk ? " gz-walk" : ""}${className ? ` ${className}` : ""}`} aria-hidden={walk} src={MARK_SRC} srcSet={`${MARK_SRC} 1x, ${MARK_SRC_2X} 2x`} alt="" width={26} height={40} decoding="async" draggable={false} />;
}

/** The loading screen: the goose walking on the spot, and the words saying what is on its way. The header's own drawing,
 *  so a load asks for no file of its own. */
export function GooseLoader({ label = "Loading", fill = true }: { label?: string; fill?: boolean }) {
  return (
    <div className="gz-load" data-fill={fill ? "" : undefined} role="status">
      <GooseMark walk />
      <span>{label}</span>
    </div>
  );
}
