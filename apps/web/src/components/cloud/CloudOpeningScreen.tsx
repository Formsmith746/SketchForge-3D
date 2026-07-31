type CloudOpeningScreenProps = {
  label?: string;
  detail?: string;
};

export default function CloudOpeningScreen({
  label = "Opening SketchForge Cloud",
  detail = "Restoring your session and workspace",
}: CloudOpeningScreenProps) {
  return (
    <main className="cloud-opening-page" role="status" aria-live="polite" aria-label={`${label}. ${detail}.`}>
      <div className="cloud-opening-content">
        <p>{label}</p>
        <span className="cloud-opening-dots" aria-hidden="true"><i /><i /><i /></span>
      </div>
    </main>
  );
}
