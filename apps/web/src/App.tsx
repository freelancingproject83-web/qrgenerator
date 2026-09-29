export function App() {
  return (
    <main className="page landing">
      <span className="eyebrow">Medicine code registry · Demo</span>
      <h1>Scan a registered code to check its status.</h1>
      <p>
        This public site opens automatically when a QR or Data Matrix identifier
        issued by the registry is scanned. The complete identifier must be
        present in the URL.
      </p>
      <aside className="notice">
        <strong>Important</strong>
        <p>
          A registered identifier can be copied. This service does not currently
          certify medicine authenticity, publish medicine details, or provide
          medical advice.
        </p>
      </aside>
    </main>
  );
}
