import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function FeaturePlaceholder({ title, description }) {
  return (
    <div className="py-8">
      <EmptyState
        icon={Construction}
        title={title}
        description={description}
      />
    </div>
  );
}
