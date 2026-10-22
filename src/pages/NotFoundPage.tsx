import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/ui/primitives';

export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-md p-10 text-center">
      <p className="text-sm font-medium text-accent">404</p>
      <h1 className="mt-1 text-lg font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-ink-3">The page you're looking for doesn't exist.</p>
      <Link to="/" className="mt-5 inline-block"><Button variant="primary">Go to dashboard</Button></Link>
    </Card>
  );
}
