export function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className={mono ? 'info-value-mono' : 'info-value'}>{value ?? '—'}</span>
    </div>
  )
}
