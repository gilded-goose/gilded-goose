// Why "Gilded Goose": the summary's three origins, set as large ruled lines. The last is the gold that is only skin.
export function Name() {
  return (
    <section id="name" className="sx" aria-labelledby="name-title">
      <div className="wrap">
        <header className="name-head">
          <h2 id="name-title" className="sx-h">Why “Gilded <span className="sx-n">Goose</span>”</h2>
        </header>
        <ul className="name-list" role="list">
          <li>Geese that warned Rome.</li>
          <li>The goddess money is named after.</li>
          <li><span className="name-gold">Gold</span> that is only on the outside.</li>
        </ul>
      </div>
    </section>
  );
}
