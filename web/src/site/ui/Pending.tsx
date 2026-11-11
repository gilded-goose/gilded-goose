// A page still being built: its h1 and plain summary, so every route reads and is reachable meanwhile.
export function Pending({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="wrap page-pending">
      <h1>{title}</h1>
      <p className="lede">{summary}</p>
    </div>
  );
}
