export function App() {
  return (
    <main className="page landing">
      <span className="eyebrow">MedTrace medicine registry</span>
      <h1>Scan the code on your medicine.</h1>
      <p>
        This public site opens automatically when a QR or Data Matrix identifier
        issued by the registry is scanned. It displays the registered batch,
        medicine information, dates, cautions, and code status.
      </p>
      <aside className="notice">
        <strong>Important</strong>
        <p>
          A registered identifier can be copied. A registry match does not by
          itself prove product authenticity, and the displayed information is
          not medical advice.
        </p>
      </aside>
    </main>
  );
}
