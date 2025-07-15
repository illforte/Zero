import { HotkeyProviderWrapper } from '@/components/providers/hotkey-provider-wrapper';
import { ComposeTabs } from '@/components/create/compose-tabs';
import { OnboardingWrapper } from '@/components/onboarding';
import { AppSidebar } from '@/components/ui/app-sidebar';
import { Outlet } from 'react-router';

export default function MailLayout() {
  return (
    <HotkeyProviderWrapper>
      <AppSidebar />
      <div className="bg-sidebar dark:bg-sidebar w-full">
        <Outlet />
      </div>
      <ComposeTabs />
      <OnboardingWrapper />
    </HotkeyProviderWrapper>
  );
}
