import { LoadingSkeleton } from '../components/marketplace/States';

export default function Loading() {
  return <div className="container page-shell"><div className="page-intro"><span className="eyebrow">KILICART MARKETPLACE</span><h1>Just a moment…</h1></div><LoadingSkeleton /></div>;
}
