type Props = {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "normal" | "watch" | "warning" | "critical";
};

export default function MetricCard({ title, value, subtitle, tone = "normal" }: Props) {
  return (
    <section className={`metric-card tone-${tone}`}>
      <div className="metric-title">{title}</div>
      <div className="metric-value">{value}</div>
      {subtitle ? <div className="metric-subtitle">{subtitle}</div> : null}
    </section>
  );
}
