export function InfoSection({
  title,
  items,
  tone = '',
}: {
  title: string;
  items: string[];
  tone?: string;
}) {
  return (
    <section className={`info-section ${tone}`}>
      <h2>{title}</h2>
      <ul>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>
            <span>{index + 1}</span>
            <p>{item}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
