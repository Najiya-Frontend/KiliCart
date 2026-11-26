import { NotFoundState } from '../components/marketplace/States';

export default function NotFound() {
  return <div className="container page-shell"><NotFoundState title="This page isn’t available" description="The page may have moved, or it may not be publicly available yet." /></div>;
}
