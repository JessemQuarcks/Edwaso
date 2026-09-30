'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()} className="border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100">
      <Printer /> Print
    </Button>
  );
}
