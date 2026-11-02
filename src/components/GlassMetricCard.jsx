import GlassCard from "./GlassCard.jsx";

export default function GlassMetricCard({ label, value, change, icon: Icon, tone = "violet" }) {
  return (
    <GlassCard className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top">
        <span>{label}</span>
        {Icon && <span className="metric-card__icon"><Icon size={17}/></span>}
      </div>
      <strong>{value}</strong>
      {change && <small>{change}</small>}
    </GlassCard>
  );
}
