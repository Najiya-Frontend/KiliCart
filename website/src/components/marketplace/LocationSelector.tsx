'use client';

export default function LocationSelector() {
  return (
    <details className="location-selector">
      <summary aria-label="Delivery location information">
        <span className="location-pin" aria-hidden="true">⌖</span>
        <span><small>Delivery location</small><strong>Choose area</strong></span>
        <span className="location-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="location-popover">
        <strong>Local delivery is coming soon</strong>
        <p>Browse the marketplace while delivery locations are being connected.</p>
      </div>
    </details>
  );
}
