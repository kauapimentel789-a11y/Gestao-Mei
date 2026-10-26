import { LegalPage } from '@/features/legal/LegalPage';
import { TERMS } from '@/features/legal/texts';

export default function TermsScreen() {
  return <LegalPage doc={TERMS} />;
}
