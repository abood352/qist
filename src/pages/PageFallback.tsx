import { Skeleton } from '../components/ui';

/** Shown while a page chunk loads: a quiet skeleton, not a spinner, to avoid layout jumps. */
export function PageFallback() {
  return (
    <div className="container" style={{ paddingBlock: 32, display: 'grid', gap: 16 }} aria-hidden="true">
      <Skeleton w="40%" h={32} r={10} />
      <Skeleton w="70%" h={16} />
      <Skeleton h={180} r={20} />
      <Skeleton h={120} r={20} />
    </div>
  );
}
