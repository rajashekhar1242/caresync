export function PageSkeleton() {
  return (
    <div className="flex h-64 w-full items-center justify-center" data-testid="route-skeleton">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

export default PageSkeleton;
