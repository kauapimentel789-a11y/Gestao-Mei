import { LegalPage } from '@/features/legal/LegalPage';
import { PRIVACY } from '@/features/legal/texts';

export default function PrivacyScreen() {
  return <LegalPage doc={PRIVACY} />;
}
