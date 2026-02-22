import { useUndoSend, type EmailData, deserializeFiles } from '@/hooks/use-undo-send';
import { useActiveConnection } from '@/hooks/use-connections';
import { Dialog, DialogClose } from '@/components/ui/dialog';
import { useEmailAliases } from '@/hooks/use-email-aliases';
import { cleanEmailAddresses } from '@/lib/email-utils';

import { useTRPC } from '@/providers/query-provider';
import { useMutation } from '@tanstack/react-query';
import { useSettings } from '@/hooks/use-settings';
import { EmailComposer } from './email-composer';
import { useSession } from '@/lib/auth-client';
import { serializeFiles } from '@/lib/schemas';
import { useDraft } from '@/hooks/use-drafts';
import { useEffect, useMemo, useState } from 'react';

import type { Attachment } from '@/types';
import { useQueryState } from 'nuqs';
import { X } from '../icons/icons';
import posthog from 'posthog-js';
import { toast } from 'sonner';
import './prosemirror.css';

// Define the draft type to include CC and BCC fields
type DraftType = {
  id: string;
  content?: string;
  subject?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  attachments?: File[];
};

export function CreateEmail({
  initialTo = '',
  initialSubject = '',
  initialBody = '',
  initialCc = '',
  initialBcc = '',
  draftId: propDraftId,
}: {
  initialTo?: string;
  initialSubject?: string;
  initialBody?: string;
  initialCc?: string;
  initialBcc?: string;
  draftId?: string | null;
}) {
  const { data: session } = useSession();

  const { data: aliases } = useEmailAliases();
  const [draftId, setDraftId] = useQueryState('draftId');
  const {
    data: draft,
    isLoading: isDraftLoading,
    error: draftError,
  } = useDraft(draftId ?? propDraftId ?? null);

  const [, setIsDraftFailed] = useState(false);
  const trpc = useTRPC();
  const { mutateAsync: sendEmail } = useMutation(trpc.mail.send.mutationOptions());
  const [isComposeOpen, setIsComposeOpen] = useQueryState('isComposeOpen');
  const [, setThreadId] = useQueryState('threadId');
  const [, setActiveReplyId] = useQueryState('activeReplyId');
  const { data: activeConnection } = useActiveConnection();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { handleUndoSend } = useUndoSend();
  // If there was an error loading the draft, set the failed state
  useEffect(() => {
    if (draftError) {
      console.error('Error loading draft:', draftError);
      setIsDraftFailed(true);
      toast.error('Failed to load draft');
    }
  }, [draftError]);

  const { data: activeAccount } = useActiveConnection();

  const userEmail = activeAccount?.email || activeConnection?.email || session?.user?.email || '';
  const userName = activeAccount?.name || activeConnection?.name || session?.user?.name || '';

  const handleSendEmail = async (data: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    attachments: File[];
    fromEmail?: string;
    scheduleAt?: string;
  }) => {
    const fromEmail = data.fromEmail || aliases?.[0]?.email || userEmail;

    const zeroSignature = settings?.settings.zeroSignature
      ? '<p style="color: #666; font-size: 12px;">Sent via <a href="https://0.email/" style="color: #0066cc; text-decoration: none;">Zero</a></p>'
      : '';

    const result = await sendEmail({
      to: data.to.map((email) => ({ email, name: email.split('@')[0] || email })),
      cc: data.cc?.map((email) => ({ email, name: email.split('@')[0] || email })),
      bcc: data.bcc?.map((email) => ({ email, name: email.split('@')[0] || email })),
      subject: data.subject,
      message: data.message + zeroSignature,
      attachments: await serializeFiles(data.attachments),
      fromEmail: userName.trim() ? `${userName.replace(/[<>]/g, '')} <${fromEmail}>` : fromEmail,
      draftId: draftId ?? undefined,
      scheduleAt: data.scheduleAt,
    });

    setDraftId(null);
    clearUndoData();

    // Track different email sending scenarios
    if (data.cc && data.cc.length > 0 && data.bcc && data.bcc.length > 0) {
      posthog.capture('Create Email Sent with CC and BCC');
    } else if (data.cc && data.cc.length > 0) {
      posthog.capture('Create Email Sent with CC');
    } else if (data.bcc && data.bcc.length > 0) {
      posthog.capture('Create Email Sent with BCC');
    } else {
      posthog.capture('Create Email Sent');
    }

    handleUndoSend(result, settings, {
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: data.subject,
      message: data.message,
      attachments: data.attachments,
      fromEmail: data.fromEmail,
      scheduleAt: data.scheduleAt,
    });
  };

  useEffect(() => {
    if (propDraftId && !draftId) {
      setDraftId(propDraftId);
    }
  }, [propDraftId, draftId, setDraftId]);

  // Process initial email addresses
  const processInitialEmails = (emailStr: string) => {
    if (!emailStr) return [];
    const cleanedAddresses = cleanEmailAddresses(emailStr);
    return cleanedAddresses || [];
  };

  const clearUndoData = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('undoEmailData');
    }
  };

  const [undoEmailData, setUndoEmailData] = useState<EmailData | null>(null);
  const [isUndoDataLoading, setIsUndoDataLoading] = useState(false);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [isDraftFilesLoading, setIsDraftFilesLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadUndoData = async () => {
      if (isComposeOpen !== 'true') {
        setUndoEmailData(null);
        return;
      }
      if (typeof window === 'undefined') return;

      const storedData = localStorage.getItem('undoEmailData');
      if (!storedData) {
        setUndoEmailData(null);
        return;
      }

      try {
        setIsUndoDataLoading(true);
        const parsedData = JSON.parse(storedData);

        if (parsedData.attachments && Array.isArray(parsedData.attachments)) {
          parsedData.attachments = await deserializeFiles(parsedData.attachments);
        }

        if (isMounted) {
          setUndoEmailData(parsedData);
        }
      } catch (error) {
        console.error('Failed to parse undo email data:', error);
        if (isMounted) {
          setUndoEmailData(null);
        }
      } finally {
        if (isMounted) {
          setIsUndoDataLoading(false);
        }
      }
    };

    void loadUndoData();
    return () => {
      isMounted = false;
    };
  }, [isComposeOpen]);

  // Cast draft to our extended type that includes CC and BCC
  const typedDraft = draft as unknown as DraftType;

  const handleDialogClose = (open: boolean) => {
    setIsComposeOpen(open ? 'true' : null);
    if (!open) {
      setDraftId(null);
      clearUndoData();
    }
  };

  useEffect(() => {
    let isMounted = true;
    const convertDraftFiles = async () => {
      const attachments = (typedDraft?.attachments as Attachment[] | undefined) || [];
      if (attachments.length === 0) {
        setDraftFiles([]);
        return;
      }

      try {
        setIsDraftFilesLoading(true);
        const converted = await Promise.all(
          attachments.map((att) => base64ToFileAsync(att.body, att.filename, att.mimeType)),
        );
        if (isMounted) {
          setDraftFiles(converted.filter((file): file is File => file !== null));
        }
      } catch (error) {
        console.error('Failed to convert draft attachments:', error);
      } finally {
        if (isMounted) {
          setIsDraftFilesLoading(false);
        }
      }
    };

    void convertDraftFiles();
    return () => {
      isMounted = false;
    };
  }, [typedDraft?.attachments]);

  const base64ToFileAsync = async (
    base64: string,
    filename: string,
    mimeType: string,
  ): Promise<File | null> => {
    try {
      const response = await fetch(`data:${mimeType};base64,${base64}`);
      const blob = await response.blob();
      return new File([blob], filename, { type: mimeType });
    } catch (error) {
      console.error('Failed to convert base64 to file', error);
      return null;
    }
  };

  return (
    <>
      <Dialog open={!!isComposeOpen} onOpenChange={handleDialogClose}>
        <div className="flex min-h-screen flex-col items-center justify-center gap-1">
          <div className="flex w-[750px] justify-start">
            <DialogClose asChild className="flex">
              <button className="dark:bg-panelDark flex items-center gap-1 rounded-lg bg-[#F0F0F0] px-2 py-1 hover:bg-gray-100 dark:hover:bg-[#404040] transition-colors cursor-pointer">
                <X className="fill-muted-foreground mt-0.5 h-3.5 w-3.5 dark:fill-[#929292]" />
                <span className="text-muted-foreground text-sm font-medium dark:text-white">
                  esc
                </span>
              </button>
            </DialogClose>
          </div>
          {isDraftLoading || isUndoDataLoading || isDraftFilesLoading ? (
            <div className="flex h-[600px] w-[750px] items-center justify-center rounded-2xl border">
              <div className="text-center">
                <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
                <p>Loading...</p>
              </div>
            </div>
          ) : (
            <EmailComposer
              key={typedDraft?.id || undoEmailData?.to?.join(',') || 'composer'}
              className="mb-12 rounded-2xl border"
              onSendEmail={handleSendEmail}
              initialMessage={undoEmailData?.message || typedDraft?.content || initialBody}
              initialTo={
                undoEmailData?.to ||
                typedDraft?.to?.map((e: string) => e.replace(/[<>]/g, '')) ||
                processInitialEmails(initialTo)
              }
              initialCc={
                undoEmailData?.cc ||
                typedDraft?.cc?.map((e: string) => e.replace(/[<>]/g, '')) ||
                processInitialEmails(initialCc)
              }
              initialBcc={
                undoEmailData?.bcc ||
                typedDraft?.bcc?.map((e: string) => e.replace(/[<>]/g, '')) ||
                processInitialEmails(initialBcc)
              }
              onClose={() => {
                setThreadId(null);
                setActiveReplyId(null);
                setIsComposeOpen(null);
                setDraftId(null);
                clearUndoData();
              }}
              initialAttachments={undoEmailData?.attachments || draftFiles}
              initialSubject={undoEmailData?.subject || typedDraft?.subject || initialSubject}
              autofocus={false}
              settingsLoading={settingsLoading}
            />
          )}
        </div>
      </Dialog>
    </>
  );
}
