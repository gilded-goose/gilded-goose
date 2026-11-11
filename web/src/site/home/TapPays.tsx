// Only your tap pays: the statement beside the approve card drawn as a receipt strip on a scrap of night pond. It is a
// diagram, not a record: its fields carry no values, so nothing on it is invented.
export function TapPays() {
  return (
    <section id="tap" className="sx" aria-labelledby="tap-title">
      <div className="wrap tap">
        <div className="tap-words">
          <h2 id="tap-title" className="sx-h">Only your <span className="sx-n">tap</span> pays</h2>
          <p className="sx-lede">The approve card names the payee, the total and when it expires. Nothing pays until you tap it.</p>
          <p className="sx-voice">Your tap, and nothing else.</p>
        </div>
        <div className="tap-stage sx-pond">
        <figure className="tap-card" aria-label="The approve card’s fields: payee, total, expires">
          <p className="tap-head" aria-hidden="true">Approve card</p>
          <dl>
            <div><dt>Payee</dt><dd aria-hidden="true" /></div>
            <div><dt>Total</dt><dd aria-hidden="true" /></div>
            <div><dt>Expires</dt><dd aria-hidden="true" /></div>
          </dl>
          <span className="tap-approve" aria-hidden="true">Approve in PayPal</span>
        </figure>
        </div>
      </div>
    </section>
  );
}
